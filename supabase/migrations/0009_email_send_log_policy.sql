-- the send route runs as the signed-in user, so editors may log sends for their workspace
create policy email_sends_insert on public.email_sends for insert to authenticated
  with check (app_private.ws_role(tenant_id, workspace_id) = any (array['admin','manager','editor']));
create policy email_sends_update on public.email_sends for update to authenticated
  using (app_private.ws_role(tenant_id, workspace_id) = any (array['admin','manager','editor']))
  with check (app_private.ws_role(tenant_id, workspace_id) = any (array['admin','manager','editor']));
