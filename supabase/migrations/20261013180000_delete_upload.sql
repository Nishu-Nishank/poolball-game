-- Deleting uploads from the history (record + parsed dataset + original file).
-- The file itself is removed by the Edge Function via the Storage API after this function
-- has authorized and deleted the database rows.

/** Marks which history rows belong to the caller, so admins know what they may delete. */
drop function public.get_upload_history(integer);
create function public.get_upload_history(p_limit integer default 50)
returns table (
  id uuid, file_name text, file_format text, file_size integer, status text,
  uploaded_at timestamptz, completed_at timestamptz, team_count integer, match_count integer,
  validation_summary jsonb, error_summary jsonb, became_active boolean, is_active boolean,
  uploaded_by_email text, is_mine boolean
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
           case when v_role = 'superadmin' then u.uploaded_by_email end,
           u.uploaded_by = auth.uid()
      from public.uploads u
     order by u.uploaded_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
grant execute on function public.get_upload_history(integer) to authenticated;

/**
 * Deletes an upload and its dataset. Refuses the live dataset (roll back first) and, for admins,
 * uploads made by someone else. Returns the storage path so the caller can remove the file.
 */
create function public.delete_upload(p_upload_id uuid, p_actor uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.resolve_admin(p_actor);
  v_upload public.uploads;
begin
  if v_role is null then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  select * into v_upload from public.uploads where id = p_upload_id for update;
  if not found then raise exception 'Upload not found.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.active_dataset a join public.datasets d on d.id = a.dataset_id
              where d.upload_id = p_upload_id) then
    raise exception 'This upload is live on the dashboard and cannot be deleted. Publish or roll back to another upload first.'
      using errcode = '42501';
  end if;
  if v_role <> 'superadmin' and v_upload.uploaded_by <> p_actor then
    raise exception 'Administrators can only delete their own uploads.' using errcode = '42501';
  end if;

  delete from public.datasets where upload_id = p_upload_id;
  delete from public.uploads where id = p_upload_id;
  perform public.audit(p_actor, 'upload_deleted', p_upload_id::text,
                       jsonb_build_object('file_name', v_upload.file_name, 'status', v_upload.status,
                                          'uploaded_by_email', v_upload.uploaded_by_email));
  return v_upload.storage_path;
end $$;
revoke execute on function public.delete_upload(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_upload(uuid, uuid) to service_role;
