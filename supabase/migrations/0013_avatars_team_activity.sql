-- Profile photos and a team login-activity view for organization admins.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- each user writes only inside their own folder: avatars/<user id>/...
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- members of an organization with their last sign-in; owners/admins only
create or replace function public.team_activity(p_tenant uuid)
returns table (user_id uuid, full_name text, email text, avatar_url text, role text,
               joined_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_tenant_admin(p_tenant) then
    raise exception 'Only owners and admins can view team activity' using errcode = '42501';
  end if;
  return query
    select tm.user_id, p.full_name, coalesce(p.email, u.email)::text, p.avatar_url, tm.role, tm.created_at, u.last_sign_in_at
    from public.tenant_members tm
    join auth.users u on u.id = tm.user_id
    left join public.profiles p on p.id = tm.user_id
    where tm.tenant_id = p_tenant
    order by u.last_sign_in_at desc nulls last;
end $$;

revoke execute on function public.team_activity(uuid) from public, anon;
grant execute on function public.team_activity(uuid) to authenticated;
