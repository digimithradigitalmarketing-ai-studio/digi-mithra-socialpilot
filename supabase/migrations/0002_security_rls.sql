-- Access helpers. SECURITY DEFINER with empty search_path so RLS policies
-- can check membership without recursive policy evaluation.
create or replace function app_private.tenant_role(p_tenant uuid)
returns text language sql stable security definer set search_path = '' as $$
  select tm.role from public.tenant_members tm
  where tm.tenant_id = p_tenant and tm.user_id = (select auth.uid());
$$;

create or replace function app_private.is_member(p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.tenant_members tm
    where tm.tenant_id = p_tenant and tm.user_id = (select auth.uid()));
$$;

create or replace function app_private.is_tenant_admin(p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.tenant_members tm
    where tm.tenant_id = p_tenant and tm.user_id = (select auth.uid())
      and tm.role in ('owner','admin'));
$$;

-- Effective role inside a workspace: tenant owner/admin => 'admin',
-- otherwise the explicit workspace membership role, otherwise null.
create or replace function app_private.ws_role(p_tenant uuid, p_workspace uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select 'admin' from public.tenant_members tm
      where tm.tenant_id = p_tenant and tm.user_id = (select auth.uid())
        and tm.role in ('owner','admin')),
    (select wm.role from public.workspace_members wm
      where wm.tenant_id = p_tenant and wm.workspace_id = p_workspace
        and wm.user_id = (select auth.uid())));
$$;

revoke all on function app_private.tenant_role(uuid), app_private.is_member(uuid),
  app_private.is_tenant_admin(uuid), app_private.ws_role(uuid, uuid) from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.tenant_role(uuid), app_private.is_member(uuid),
  app_private.is_tenant_admin(uuid), app_private.ws_role(uuid, uuid) to authenticated;
revoke all on app_private.oauth_credentials from public, anon, authenticated;

-- ------------------------------------------------------------ enable RLS
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ------------------------------------------------------------ policies
create policy plans_read on public.plans for select to anon, authenticated using (true);

create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from public.tenant_members a join public.tenant_members b on a.tenant_id = b.tenant_id
    where a.user_id = (select auth.uid()) and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy tenants_read on public.tenants for select to authenticated using (app_private.is_member(id));
create policy tenants_update on public.tenants for update to authenticated
  using (app_private.is_tenant_admin(id)) with check (app_private.is_tenant_admin(id));

create policy tm_read on public.tenant_members for select to authenticated using (app_private.is_member(tenant_id));
create policy tm_update on public.tenant_members for update to authenticated
  using (app_private.tenant_role(tenant_id) = 'owner' and role <> 'owner')
  with check (app_private.tenant_role(tenant_id) = 'owner' and role <> 'owner');
create policy tm_delete on public.tenant_members for delete to authenticated
  using (role <> 'owner' and (app_private.is_tenant_admin(tenant_id) or user_id = (select auth.uid())));

create policy ws_read on public.workspaces for select to authenticated
  using (app_private.ws_role(tenant_id, id) is not null);
create policy ws_insert on public.workspaces for insert to authenticated
  with check (app_private.is_tenant_admin(tenant_id));
create policy ws_update on public.workspaces for update to authenticated
  using (app_private.ws_role(tenant_id, id) in ('admin','manager'))
  with check (app_private.ws_role(tenant_id, id) in ('admin','manager'));
create policy ws_delete on public.workspaces for delete to authenticated
  using (app_private.is_tenant_admin(tenant_id));

create policy wm_read on public.workspace_members for select to authenticated using (app_private.is_member(tenant_id));
create policy wm_write on public.workspace_members for all to authenticated
  using (app_private.is_tenant_admin(tenant_id)) with check (app_private.is_tenant_admin(tenant_id));

create policy inv_admin on public.invitations for all to authenticated
  using (app_private.is_tenant_admin(tenant_id))
  with check (app_private.is_tenant_admin(tenant_id) and invited_by = (select auth.uid()));

-- billing is read-only from the browser; changes go through RPCs / verified webhooks
create policy sub_read on public.subscriptions for select to authenticated using (app_private.is_member(tenant_id));
create policy inv_read on public.invoices for select to authenticated using (app_private.is_tenant_admin(tenant_id));
create policy usage_read on public.usage_events for select to authenticated using (app_private.is_member(tenant_id));

create policy notif_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notif_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notif_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create policy audit_read on public.audit_logs for select to authenticated using (app_private.is_tenant_admin(tenant_id));

create policy apikeys_admin on public.api_keys for all to authenticated
  using (app_private.is_tenant_admin(tenant_id)) with check (app_private.is_tenant_admin(tenant_id));
create policy webhooks_admin on public.webhook_endpoints for all to authenticated
  using (app_private.is_tenant_admin(tenant_id)) with check (app_private.is_tenant_admin(tenant_id));
-- webhook_events: no client policies (service role only)

-- Workspace-owned tables: read for anyone with a workspace role,
-- write for the roles listed per table.
do $$
declare
  r record;
begin
  for r in select * from (values
    ('social_accounts',  array['admin','manager']),
    ('campaigns',        array['admin','manager','editor']),
    ('media_assets',     array['admin','manager','editor']),
    ('content_posts',    array['admin','manager','editor']),
    ('post_targets',     array['admin','manager','editor']),
    ('post_approvals',   array['admin','manager','approver']),
    ('publish_attempts', array[]::text[]),
    ('contacts',         array['admin','manager','editor','support']),
    ('consent_records',  array['admin','manager','editor','support']),
    ('conversations',    array['admin','manager','editor','support']),
    ('messages',         array['admin','manager','editor','support']),
    ('pipeline_stages',  array['admin','manager']),
    ('leads',            array['admin','manager','editor','support']),
    ('activities',       array['admin','manager','editor','support']),
    ('brand_knowledge',  array['admin','manager','editor']),
    ('ai_generations',   array['admin','manager','editor','support']),
    ('workflows',        array['admin','manager']),
    ('workflow_versions',array[]::text[]),
    ('workflow_runs',    array[]::text[]),
    ('workflow_steps',   array[]::text[]),
    ('reviews',          array['admin','manager','editor','support']),
    ('metric_snapshots', array[]::text[])
  ) as v(tbl, writers) loop
    execute format('create policy %I on public.%I for select to authenticated using (app_private.ws_role(tenant_id, workspace_id) is not null)',
      r.tbl || '_read', r.tbl);
    if cardinality(r.writers) > 0 then
      execute format('create policy %I on public.%I for insert to authenticated with check (app_private.ws_role(tenant_id, workspace_id) = any (%L::text[]))',
        r.tbl || '_insert', r.tbl, r.writers);
      continue when r.tbl in ('ai_generations','post_approvals');  -- insert-only for clients
      execute format('create policy %I on public.%I for update to authenticated using (app_private.ws_role(tenant_id, workspace_id) = any (%L::text[])) with check (app_private.ws_role(tenant_id, workspace_id) = any (%L::text[]))',
        r.tbl || '_update', r.tbl, r.writers, r.writers);
      execute format('create policy %I on public.%I for delete to authenticated using (app_private.ws_role(tenant_id, workspace_id) = any (%L::text[]))',
        r.tbl || '_delete', r.tbl, r.writers);
    end if;
  end loop;
end $$;

