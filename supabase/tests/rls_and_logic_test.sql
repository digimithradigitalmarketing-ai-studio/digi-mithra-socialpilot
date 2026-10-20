-- End-to-end check of tenancy isolation and business rules.
-- Run in the Supabase SQL editor. Everything is rolled back: the block ends by
-- raising an exception that carries the JSON result, so no test data persists.
do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  t1 uuid; t2 uuid; w1 uuid; acc uuid; post uuid; r text; res jsonb := '{}'; n int; wf uuid; conv uuid; draft uuid;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (ua, 'a@test.dev', 'authenticated', 'authenticated', '{"full_name":"User A"}'),
    (ub, 'b@test.dev', 'authenticated', 'authenticated', '{}');

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'email', 'a@test.dev', 'role', 'authenticated')::text, true);
  set local role authenticated;
  t1 := public.create_tenant('Dhanus Gold Fitness', 'business', 'DGF Studio', 'fitness');
  select id into w1 from public.workspaces where tenant_id = t1;
  acc := public.demo_connect_account(w1, 'instagram', 'Dhanus Gold');
  insert into public.content_posts (tenant_id, workspace_id, title, body) values (t1, w1, 'Hello', 'Join our studio!') returning id into post;
  insert into public.post_targets (tenant_id, workspace_id, post_id, social_account_id) values (t1, w1, post, acc);
  res := res || jsonb_build_object('publish', public.submit_post(post, null, true));            -- expect published
  begin
    insert into public.content_posts (tenant_id, workspace_id, body, status) values (t1, w1, 'x', 'published');
    res := res || '{"status_guard":"FAIL"}';
  exception when others then res := res || '{"status_guard":"ok"}'; end;

  insert into public.workflows (tenant_id, workspace_id, name, trigger_type, status, definition)
  values (t1, w1, 'Membership enquiry', 'message_received', 'active',
    '{"nodes":[{"type":"condition","config":{"field":"body","operator":"contains","value":"membership"}},
               {"type":"create_lead","config":{"title":"Membership: {{name}}"}},
               {"type":"ai_draft","config":{"template":"Hi {{name}}!"}}]}') returning id into wf;
  conv := public.simulate_inbound_message(w1, 'instagram', 'Ravi Kumar', 'membership price?');
  res := res || jsonb_build_object('workflow_run', (select status from public.workflow_runs where workflow_id = wf),  -- expect completed
                                   'lead_created', (select count(*) from public.leads where workspace_id = w1));        -- expect 1
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'email', 'b@test.dev', 'role', 'authenticated')::text, true);
  set local role authenticated;
  t2 := public.create_tenant('Bloom All Production', 'agency');
  res := res || jsonb_build_object('b_sees_a_posts', (select count(*) from public.content_posts where tenant_id = t1),  -- expect 0
                                   'b_sees_a_leads', (select count(*) from public.leads where workspace_id = w1));       -- expect 0
  begin
    insert into public.content_posts (tenant_id, workspace_id, body) values (t1, w1, 'hack');
    res := res || '{"b_cross_insert":"FAIL"}';
  exception when others then res := res || '{"b_cross_insert":"blocked"}'; end;
  update public.content_posts set body = 'pwned' where id = post;
  get diagnostics n = row_count;
  res := res || jsonb_build_object('b_cross_update_rows', n);                                                          -- expect 0
  reset role;
  raise exception 'RESULT %', res;
end $$;
