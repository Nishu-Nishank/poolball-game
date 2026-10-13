-- =============================================================================================
-- 4IBC tournament: administrators, uploads and the published dataset.
--
-- Security model
--   * Every table has Row Level Security enabled and NO policies for anon/authenticated, and
--     table privileges are revoked from them: direct REST access to these tables is impossible.
--   * Clients use SECURITY DEFINER functions that check the caller's role in this database
--     (never a client-supplied role). Privileged writes that need file processing go through the
--     upload-dataset Edge Function, which uses the service role.
--   * Roles come only from public.admin_users rows bound to a verified auth user id.
--
-- Purely additive: creates new objects only. Rollback = drop the objects listed in README.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null
    check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('admin', 'superadmin')),
  status text not null default 'active' check (status in ('active', 'removed')),
  -- Verified Supabase identity holding this record. Set on first verified sign-in (admins)
  -- or at bootstrap (superadmins). Privileges are always checked against this id.
  user_id uuid references auth.users (id) on delete set null,
  -- Requested new email; becomes `email` only after its owner verifies it by signing in.
  pending_email text
    check (pending_email is null or (pending_email = lower(pending_email) and pending_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  claimed_at timestamptz,
  removed_at timestamptz,
  removed_by uuid
);
-- Removed records are kept as history, so uniqueness applies to active records only.
create unique index admin_users_active_email_idx on public.admin_users (email) where status = 'active';
create unique index admin_users_active_user_idx on public.admin_users (user_id) where status = 'active' and user_id is not null;
create unique index admin_users_pending_email_idx on public.admin_users (pending_email) where pending_email is not null and status = 'active';

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_format text not null check (file_format in ('csv', 'xlsx', 'xls')),
  file_size integer not null check (file_size >= 0),
  storage_path text,
  uploaded_by uuid not null,
  uploaded_by_email text not null,
  uploaded_at timestamptz not null default now(),   -- UTC (timestamptz)
  completed_at timestamptz,
  status text not null default 'processing' check (status in ('processing', 'rejected', 'failed', 'published')),
  team_count integer,
  match_count integer,
  validation_summary jsonb,
  error_summary jsonb,
  became_active boolean not null default false
);
create index uploads_uploaded_at_idx on public.uploads (uploaded_at desc);

create table public.datasets (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null unique references public.uploads (id),
  data jsonb not null,
  team_count integer not null,
  match_count integer not null,
  created_at timestamptz not null default now()
);

-- Exactly one row: the stable reference to the published dataset.
create table public.active_dataset (
  singleton boolean primary key default true check (singleton),
  dataset_id uuid not null references public.datasets (id),
  activated_at timestamptz not null default now(),
  activated_by uuid
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null,
  target text,
  details jsonb
);
create index audit_events_occurred_at_idx on public.audit_events (occurred_at desc);

alter table public.admin_users enable row level security;
alter table public.uploads enable row level security;
alter table public.datasets enable row level security;
alter table public.active_dataset enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.admin_users, public.uploads, public.datasets, public.active_dataset, public.audit_events
  from anon, authenticated;
grant all on public.admin_users, public.uploads, public.datasets, public.active_dataset, public.audit_events
  to service_role;

-- ---------------------------------------------------------------------------------------------
-- Guard: the last active superadmin can never be removed or demoted (UI, API or SQL).
-- ---------------------------------------------------------------------------------------------

create function public.guard_last_superadmin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.role = 'superadmin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'superadmin' or new.status <> 'active')
     and not exists (
       select 1 from public.admin_users
       where role = 'superadmin' and status = 'active' and id <> old.id
     ) then
    raise exception 'The last active superadmin cannot be removed or demoted.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger admin_users_guard_last_superadmin
  before update or delete on public.admin_users
  for each row execute function public.guard_last_superadmin();

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

create function public.audit(p_actor uuid, p_action text, p_target text, p_details jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_events (actor_id, actor_email, action, target, details)
  values (p_actor, (select email from auth.users where id = p_actor), p_action, p_target, p_details);
$$;

create function public.normalize_email(p_email text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := lower(btrim(coalesce(p_email, '')));
begin
  if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v) > 254 then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  return v;
end $$;

/**
 * Role of a Supabase user, or null. The only place where privileges are decided.
 *   1. An active record already bound to this user id.
 *   2. A pending email change whose new address this (verified) user owns: completed now,
 *      re-binding the record to this identity. The previous identity loses access.
 *   3. An unclaimed *admin* invitation for this user's verified email: bound now.
 * Superadmin records are never claimed by email; they are bound at bootstrap.
 */
create function public.resolve_admin(p_user_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_confirmed timestamptz;
  r public.admin_users;
begin
  if p_user_id is null then return null; end if;

  select * into r from public.admin_users where user_id = p_user_id and status = 'active';
  if found then return r.role; end if;

  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = p_user_id;
  if v_email is null or v_confirmed is null then return null; end if;

  select * into r from public.admin_users
   where status = 'active' and pending_email = v_email for update;
  if found then
    update public.admin_users
       set email = pending_email, pending_email = null, user_id = p_user_id,
           claimed_at = now(), updated_at = now()
     where id = r.id;
    perform public.audit(p_user_id, 'admin_email_change_verified', r.id::text,
                         jsonb_build_object('old_email', r.email, 'new_email', v_email));
    return r.role;
  end if;

  select * into r from public.admin_users
   where status = 'active' and role = 'admin' and user_id is null and email = v_email for update;
  if found then
    update public.admin_users set user_id = p_user_id, claimed_at = now(), updated_at = now() where id = r.id;
    perform public.audit(p_user_id, 'admin_claimed', r.id::text, jsonb_build_object('email', v_email));
    return r.role;
  end if;

  return null;
end $$;

create function public.require_superadmin() returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if public.resolve_admin(auth.uid()) is distinct from 'superadmin' then
    raise exception 'Only the superadmin can manage administrators.' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- ---------------------------------------------------------------------------------------------
-- Public read API (anon + authenticated)
-- ---------------------------------------------------------------------------------------------

create function public.get_published_version()
returns table (dataset_id uuid, published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.dataset_id, u.completed_at
    from public.active_dataset a
    join public.datasets d on d.id = a.dataset_id
    join public.uploads u on u.id = d.upload_id;
$$;

create function public.get_published_dataset()
returns table (dataset_id uuid, published_at timestamptz, data jsonb)
language sql stable security definer set search_path = '' as $$
  select a.dataset_id, u.completed_at, d.data
    from public.active_dataset a
    join public.datasets d on d.id = a.dataset_id
    join public.uploads u on u.id = d.upload_id;
$$;

-- ---------------------------------------------------------------------------------------------
-- Signed-in users
-- ---------------------------------------------------------------------------------------------

/** The caller's own role (empty result for non-admins). Reveals nothing about other users. */
create function public.get_my_access()
returns table (role text, email text)
language plpgsql security definer set search_path = '' as $$
declare v_role text := public.resolve_admin(auth.uid());
begin
  if v_role is null then return; end if;
  return query select v_role, (select u.email::text from auth.users u where u.id = auth.uid());
end $$;

/** Upload history for admins; uploader identity only for the superadmin. */
create function public.get_upload_history(p_limit integer default 50)
returns table (
  id uuid, file_name text, file_format text, file_size integer, status text,
  uploaded_at timestamptz, completed_at timestamptz, team_count integer, match_count integer,
  validation_summary jsonb, error_summary jsonb, became_active boolean, is_active boolean,
  uploaded_by_email text
)
language plpgsql security definer set search_path = '' as $$
declare v_role text := public.resolve_admin(auth.uid());
begin
  if v_role is null then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  return query
    select u.id, u.file_name, u.file_format, u.file_size, u.status, u.uploaded_at, u.completed_at,
           u.team_count, u.match_count, u.validation_summary, u.error_summary, u.became_active,
           exists (select 1 from public.active_dataset a join public.datasets d on d.id = a.dataset_id
                    where d.upload_id = u.id),
           case when v_role = 'superadmin' then u.uploaded_by_email end
      from public.uploads u
     order by u.uploaded_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- ---------------------------------------------------------------------------------------------
-- User management (superadmin only). Only 'admin' records can be managed here; superadmin
-- records are managed by SQL (see README), so the UI cannot lock everyone out.
-- ---------------------------------------------------------------------------------------------

create function public.admin_list()
returns table (
  id uuid, email text, role text, status text, pending_email text, is_linked boolean,
  created_at timestamptz, created_by_email text, updated_at timestamptz, updated_by_email text,
  claimed_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_superadmin();
  return query
    select a.id, a.email, a.role, a.status, a.pending_email, a.user_id is not null,
           a.created_at, (select u.email::text from auth.users u where u.id = a.created_by),
           a.updated_at, (select u.email::text from auth.users u where u.id = a.updated_by),
           a.claimed_at, (select u.last_sign_in_at from auth.users u where u.id = a.user_id)
      from public.admin_users a
     where a.status = 'active'
     order by a.role desc, a.email;
end $$;

create function public.assert_email_free(p_email text, p_except uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.admin_users
              where status = 'active' and id is distinct from p_except
                and (email = p_email or pending_email = p_email)) then
    raise exception 'This email is already registered as an administrator.' using errcode = '23505';
  end if;
end $$;

create function public.admin_add(p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.require_superadmin();
  v_email text := public.normalize_email(p_email);
  v_id uuid;
begin
  perform public.assert_email_free(v_email);
  -- Always a new record: removed records stay as history, and the person must verify the
  -- email again by signing in before the record is bound to their identity.
  insert into public.admin_users (email, role, created_by, updated_by)
  values (v_email, 'admin', v_actor, v_actor) returning id into v_id;
  perform public.audit(v_actor, 'admin_added', v_id::text, jsonb_build_object('email', v_email));
  return v_id;
end $$;

/**
 * Change an admin's email. If the record is not yet linked to a signed-in identity, the email is
 * simply corrected. If it is linked, the new address is stored as pending and only takes effect
 * when its owner signs in with it (proving ownership); until then the current identity keeps access.
 */
create function public.admin_update_email(p_id uuid, p_new_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.require_superadmin();
  v_email text := public.normalize_email(p_new_email);
  r public.admin_users;
begin
  select * into r from public.admin_users where id = p_id and status = 'active' for update;
  if not found then raise exception 'Administrator not found.' using errcode = 'P0002'; end if;
  if r.role <> 'admin' then
    raise exception 'Superadmin accounts cannot be changed here.' using errcode = '42501';
  end if;
  if v_email = r.email then
    update public.admin_users set pending_email = null, updated_at = now(), updated_by = v_actor where id = p_id;
    return 'unchanged';
  end if;
  perform public.assert_email_free(v_email, p_id);

  if r.user_id is null then
    update public.admin_users set email = v_email, pending_email = null, updated_at = now(), updated_by = v_actor
     where id = p_id;
    perform public.audit(v_actor, 'admin_email_changed', p_id::text,
                         jsonb_build_object('old_email', r.email, 'new_email', v_email));
    return 'changed';
  end if;

  update public.admin_users set pending_email = v_email, updated_at = now(), updated_by = v_actor where id = p_id;
  perform public.audit(v_actor, 'admin_email_change_requested', p_id::text,
                       jsonb_build_object('old_email', r.email, 'new_email', v_email));
  return 'pending';
end $$;

create function public.admin_cancel_email_change(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.require_superadmin();
begin
  update public.admin_users set pending_email = null, updated_at = now(), updated_by = v_actor
   where id = p_id and status = 'active' and role = 'admin' and pending_email is not null;
  if not found then raise exception 'No pending email change for this administrator.' using errcode = 'P0002'; end if;
  perform public.audit(v_actor, 'admin_email_change_cancelled', p_id::text);
end $$;

/** Revokes access immediately: resolve_admin no longer returns a role, even for live sessions. */
create function public.admin_remove(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.require_superadmin();
  r public.admin_users;
begin
  select * into r from public.admin_users where id = p_id and status = 'active' for update;
  if not found then raise exception 'Administrator not found.' using errcode = 'P0002'; end if;
  if r.role <> 'admin' then
    raise exception 'Superadmin accounts cannot be removed here.' using errcode = '42501';
  end if;
  update public.admin_users
     set status = 'removed', pending_email = null, removed_at = now(), removed_by = v_actor,
         updated_at = now(), updated_by = v_actor
   where id = p_id;
  perform public.audit(v_actor, 'admin_removed', p_id::text, jsonb_build_object('email', r.email));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Publication (service role only — called by the upload-dataset Edge Function)
-- ---------------------------------------------------------------------------------------------

/** Atomically stores the dataset, switches the active pointer and marks the upload published. */
create function public.publish_dataset(p_upload_id uuid, p_data jsonb, p_summary jsonb, p_actor uuid)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_upload public.uploads;
  v_dataset uuid;
  v_now timestamptz := now();
begin
  if public.resolve_admin(p_actor) is null then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  select * into v_upload from public.uploads where id = p_upload_id and status = 'processing' for update;
  if not found then raise exception 'Upload % is not awaiting publication.', p_upload_id using errcode = 'P0002'; end if;

  insert into public.datasets (upload_id, data, team_count, match_count)
  values (p_upload_id, p_data, coalesce((p_summary ->> 'teams')::int, 0), coalesce((p_summary ->> 'matches')::int, 0))
  returning id into v_dataset;

  insert into public.active_dataset (singleton, dataset_id, activated_at, activated_by)
  values (true, v_dataset, v_now, p_actor)
  on conflict (singleton) do update
    set dataset_id = excluded.dataset_id, activated_at = excluded.activated_at, activated_by = excluded.activated_by;

  update public.uploads
     set status = 'published', became_active = true, completed_at = v_now, validation_summary = p_summary,
         team_count = (p_summary ->> 'teams')::int, match_count = (p_summary ->> 'matches')::int
   where id = p_upload_id;

  perform public.audit(p_actor, 'dataset_published', p_upload_id::text,
                       jsonb_build_object('dataset_id', v_dataset, 'file_name', v_upload.file_name));
  return v_now;
end $$;

/** Rollback helper: make an earlier published upload active again (run from the SQL editor). */
create function public.activate_upload(p_upload_id uuid, p_actor uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_dataset uuid;
begin
  select d.id into v_dataset from public.datasets d
    join public.uploads u on u.id = d.upload_id
   where u.id = p_upload_id and u.status = 'published';
  if v_dataset is null then raise exception 'Upload % has no published dataset.', p_upload_id using errcode = 'P0002'; end if;
  update public.active_dataset set dataset_id = v_dataset, activated_at = now(), activated_by = p_actor;
  perform public.audit(p_actor, 'dataset_activated', p_upload_id::text, jsonb_build_object('dataset_id', v_dataset));
end $$;

/** Rollback helper: re-activate the published upload immediately before the current one. */
create function public.rollback_to_previous_dataset() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_current timestamptz; v_previous uuid;
begin
  select u.completed_at into v_current from public.active_dataset a
    join public.datasets d on d.id = a.dataset_id join public.uploads u on u.id = d.upload_id;
  select u.id into v_previous from public.uploads u
   where u.status = 'published' and u.completed_at < v_current
   order by u.completed_at desc limit 1;
  if v_previous is null then raise exception 'There is no earlier published dataset.' using errcode = 'P0002'; end if;
  perform public.activate_upload(v_previous, null);
  return v_previous;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Superadmin bootstrap (SQL editor only — not callable through the API)
-- ---------------------------------------------------------------------------------------------

/**
 * Grants superadmin to an existing, email-verified Supabase user. The person must sign in once
 * on /login first, so the role is bound to their verified user id — not to an email string.
 * Refuses when a superadmin already exists unless p_allow_additional is true.
 */
create function public.bootstrap_superadmin(p_email text, p_allow_additional boolean default false)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := public.normalize_email(p_email);
  v_user uuid;
  v_confirmed timestamptz;
  v_id uuid;
begin
  select id, email_confirmed_at into v_user, v_confirmed from auth.users where lower(email) = v_email;
  if v_user is null then
    raise exception 'No Supabase user with email %. Sign in once on /login with this email first.', v_email;
  end if;
  if v_confirmed is null then raise exception 'The email % is not verified yet.', v_email; end if;
  if not p_allow_additional and exists (select 1 from public.admin_users where role = 'superadmin' and status = 'active') then
    raise exception 'A superadmin already exists. Pass p_allow_additional => true to add another.';
  end if;

  -- An existing active record for this person (e.g. an admin) is promoted; otherwise a new one is created.
  update public.admin_users
     set role = 'superadmin', user_id = v_user, pending_email = null, claimed_at = now(), updated_at = now()
   where status = 'active' and (email = v_email or user_id = v_user)
  returning id into v_id;
  if v_id is null then
    insert into public.admin_users (email, role, status, user_id, claimed_at, created_by, updated_by)
    values (v_email, 'superadmin', 'active', v_user, now(), v_user, v_user)
    returning id into v_id;
  end if;
  perform public.audit(null, 'superadmin_bootstrapped', v_id::text, jsonb_build_object('email', v_email));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Function privileges: deny by default, then grant exactly what each role needs.
-- ---------------------------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated, service_role;

grant execute on function public.get_published_version() to anon, authenticated, service_role;
grant execute on function public.get_published_dataset() to anon, authenticated, service_role;

grant execute on function public.get_my_access() to authenticated;
grant execute on function public.get_upload_history(integer) to authenticated;
grant execute on function public.admin_list() to authenticated;
grant execute on function public.admin_add(text) to authenticated;
grant execute on function public.admin_update_email(uuid, text) to authenticated;
grant execute on function public.admin_cancel_email_change(uuid) to authenticated;
grant execute on function public.admin_remove(uuid) to authenticated;

grant execute on function public.resolve_admin(uuid) to service_role;
grant execute on function public.publish_dataset(uuid, jsonb, jsonb, uuid) to service_role;
grant execute on function public.audit(uuid, text, text, jsonb) to service_role;
-- activate_upload, rollback_to_previous_dataset and bootstrap_superadmin: owner (SQL editor) only.

-- ---------------------------------------------------------------------------------------------
-- Storage: private bucket for original uploads. No storage.objects policies are created, so
-- only the service role (Edge Function) can read or write; files are never public.
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('tournament-uploads', 'tournament-uploads', false, 10485760)
on conflict (id) do nothing;
