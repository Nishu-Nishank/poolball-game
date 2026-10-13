-- Lets administrators make any previously published upload the live dataset from the admin UI
-- (the owner-only activate_upload / rollback_to_previous_dataset helpers remain for the SQL editor).

create function public.activate_upload_api(p_upload_id uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role text := public.resolve_admin(v_actor);
  v_dataset uuid;
  v_upload public.uploads;
begin
  if v_role is null then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  select u.* into v_upload from public.uploads u where u.id = p_upload_id;
  if not found then raise exception 'Upload not found.' using errcode = 'P0002'; end if;
  if v_upload.status <> 'published' then
    raise exception 'Only uploads that passed validation and were published can be made live.' using errcode = '42501';
  end if;
  select d.id into v_dataset from public.datasets d where d.upload_id = p_upload_id;
  if v_dataset is null then raise exception 'This upload has no stored dataset.' using errcode = 'P0002'; end if;

  update public.active_dataset set dataset_id = v_dataset, activated_at = now(), activated_by = v_actor;
  if not found then
    insert into public.active_dataset (singleton, dataset_id, activated_at, activated_by) values (true, v_dataset, now(), v_actor);
  end if;
  perform public.audit(v_actor, 'dataset_activated', p_upload_id::text,
                       jsonb_build_object('dataset_id', v_dataset, 'file_name', v_upload.file_name));
  return v_upload.completed_at;
end $$;
revoke execute on function public.activate_upload_api(uuid) from public, anon;
grant execute on function public.activate_upload_api(uuid) to authenticated;
