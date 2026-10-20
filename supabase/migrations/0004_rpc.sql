-- Server-side actions exposed as RPCs. Each one verifies the caller's role itself.

create or replace function app_private.require_ws_role(p_tenant uuid, p_workspace uuid, p_roles text[])
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if coalesce(app_private.ws_role(p_tenant, p_workspace), '') <> all (p_roles) then
    raise exception 'You do not have permission for this action' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------- onboarding
create or replace function public.create_tenant(p_name text, p_kind text default 'business',
  p_workspace text default null, p_industry text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid;
  v_slug text;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Organization name is required'; end if;
  if (select count(*) from public.tenants where created_by = v_uid) >= 5 then
    raise exception 'You can create at most 5 organizations';
  end if;
  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  v_slug := coalesce(nullif(v_slug, ''), 'org') || '-' || substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6);

  insert into public.tenants (name, slug, kind, created_by)
  values (trim(p_name), v_slug, case when p_kind = 'agency' then 'agency' else 'business' end, v_uid)
  returning id into v_tenant;
  insert into public.tenant_members (tenant_id, user_id, role) values (v_tenant, v_uid, 'owner');
  -- 14-day Growth trial
  insert into public.subscriptions (tenant_id, plan_id, status) values (v_tenant, 'growth', 'trialing');
  insert into public.workspaces (tenant_id, name, slug, industry)
  values (v_tenant, coalesce(nullif(trim(p_workspace), ''), trim(p_name)), 'main', p_industry);
  return v_tenant;
end $$;

create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
  v_email text := (select auth.jwt()->>'email');
  v_uid uuid := (select auth.uid());
begin
  select * into inv from public.invitations where token = p_token and status = 'pending' for update;
  if not found then raise exception 'Invitation not found or already used'; end if;
  if lower(inv.email) <> lower(coalesce(v_email, '')) then
    raise exception 'This invitation was sent to a different email address';
  end if;
  insert into public.tenant_members (tenant_id, user_id, role)
  values (inv.tenant_id, v_uid, case when inv.workspace_id is null then inv.role
                                     when inv.role = 'admin' then 'admin' else 'viewer' end)
  on conflict (tenant_id, user_id) do nothing;
  if inv.workspace_id is not null and inv.role <> 'admin' then
    insert into public.workspace_members (tenant_id, workspace_id, user_id, role)
    values (inv.tenant_id, inv.workspace_id, v_uid, inv.role)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
  end if;
  update public.invitations set status = 'accepted' where id = inv.id;
  return inv.tenant_id;
end $$;

-- invitations addressed to the signed-in user's email
create or replace function public.my_invitations()
returns table (token text, tenant_name text, role text, workspace_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.token, t.name, i.role, w.name, i.created_at
  from public.invitations i
  join public.tenants t on t.id = i.tenant_id
  left join public.workspaces w on w.id = i.workspace_id
  where i.status = 'pending' and lower(i.email) = lower((select auth.jwt()->>'email'));
$$;

-- organizations are deleted by their owner (cascade removes all data)
create policy tenants_owner_delete on public.tenants for delete to authenticated
  using (app_private.tenant_role(id) = 'owner');

-- ---------------------------------------------------------------- social accounts
create or replace function public.demo_connect_account(p_workspace uuid, p_provider text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
  v_id uuid;
  caps jsonb;
  base integer := 500 + floor(random() * 4000)::int;
  d integer;
begin
  select tenant_id into v_tenant from public.workspaces where id = p_workspace;
  perform app_private.require_ws_role(v_tenant, p_workspace, array['admin','manager']);
  caps := case p_provider
    when 'instagram' then '{"can_publish":true,"can_read_messages":true,"can_reply":true,"can_read_reviews":false}'
    when 'facebook' then '{"can_publish":true,"can_read_messages":true,"can_reply":true,"can_read_reviews":true}'
    when 'whatsapp' then '{"can_publish":false,"can_read_messages":true,"can_reply":true,"can_read_reviews":false}'
    when 'google_business' then '{"can_publish":true,"can_read_messages":false,"can_reply":false,"can_read_reviews":true}'
    else '{"can_publish":true,"can_read_messages":false,"can_reply":false,"can_read_reviews":false}' end::jsonb;
  insert into public.social_accounts (tenant_id, workspace_id, provider, provider_account_id, display_name, handle,
    status, capabilities, scopes, is_demo, last_checked_at, connected_by)
  values (v_tenant, p_workspace, p_provider, 'demo_' || encode(extensions.gen_random_bytes(6), 'hex'),
    coalesce(nullif(trim(p_name), ''), initcap(replace(p_provider, '_', ' ')) || ' (Demo)'),
    '@' || regexp_replace(lower(coalesce(p_name, p_provider)), '[^a-z0-9]+', '', 'g'),
    'connected', caps, array['demo.read','demo.publish'], true, now(), (select auth.uid()))
  returning id into v_id;
  for d in 0..29 loop
    insert into public.metric_snapshots (tenant_id, workspace_id, social_account_id, snapshot_date,
      followers, impressions, engagements, is_demo)
    values (v_tenant, p_workspace, v_id, current_date - d, base + (29 - d) * (3 + floor(random() * 9)::int),
      200 + floor(random() * 1800)::int, 20 + floor(random() * 220)::int, true);
  end loop;
  return v_id;
end $$;

create or replace function public.check_account_health(p_account uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare a public.social_accounts;
begin
  select * into a from public.social_accounts where id = p_account;
  if not found then raise exception 'Account not found'; end if;
  perform app_private.require_ws_role(a.tenant_id, a.workspace_id, array['admin','manager','editor']);
  if a.is_demo then
    update public.social_accounts set status = 'connected', last_checked_at = now() where id = p_account;
    return 'connected';
  end if;
  if not exists (select 1 from app_private.oauth_credentials c where c.social_account_id = p_account
                 and (c.expires_at is null or c.expires_at > now())) then
    update public.social_accounts set status = 'expired', last_checked_at = now() where id = p_account;
    return 'expired';
  end if;
  update public.social_accounts set last_checked_at = now() where id = p_account;
  return a.status;
end $$;

-- ---------------------------------------------------------------- publishing
create or replace function app_private.publish_post(p_post uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  p public.content_posts;
  t record;
  ok integer := 0; bad integer := 0;
  final text;
begin
  select * into p from public.content_posts where id = p_post for update;
  if not found or p.status in ('published') then return coalesce(p.status, 'missing'); end if;
  update public.content_posts set status = 'publishing' where id = p_post;

  for t in select pt.*, sa.is_demo, sa.status as acct_status, sa.provider,
                  (sa.capabilities->>'can_publish')::boolean as can_publish
           from public.post_targets pt join public.social_accounts sa on sa.id = pt.social_account_id
           where pt.post_id = p_post and pt.status in ('pending','failed')
           for update of pt
  loop
    if t.acct_status <> 'connected' or not coalesce(t.can_publish, false) then
      update public.post_targets set status = 'failed',
        error = format('%s account is %s or lacks publish permission', t.provider, t.acct_status) where id = t.id;
      insert into public.publish_attempts (tenant_id, workspace_id, post_target_id, status, error_category, response)
      values (t.tenant_id, t.workspace_id, t.id, 'failed', 'permission', jsonb_build_object('account_status', t.acct_status));
      bad := bad + 1;
    elsif t.is_demo then
      update public.post_targets set status = 'published', error = null, published_at = now(),
        external_post_id = coalesce(external_post_id, 'demo_' || t.idempotency_key) where id = t.id;
      insert into public.publish_attempts (tenant_id, workspace_id, post_target_id, status, response)
      values (t.tenant_id, t.workspace_id, t.id, 'success', jsonb_build_object('adapter', 'demo', 'note', 'Simulated publish - no real network call'));
      insert into public.usage_events (tenant_id, workspace_id, kind) values (t.tenant_id, t.workspace_id, 'publish');
      ok := ok + 1;
    else
      -- live provider: handed to the external worker which owns provider tokens
      update public.post_targets set status = 'failed',
        error = 'Live publishing requires the provider worker (see DEPLOYMENT.md). Not yet configured.' where id = t.id;
      insert into public.publish_attempts (tenant_id, workspace_id, post_target_id, status, error_category)
      values (t.tenant_id, t.workspace_id, t.id, 'failed', 'adapter_not_configured');
      bad := bad + 1;
    end if;
  end loop;

  select case
    when count(*) filter (where status = 'published') = count(*) and count(*) > 0 then 'published'
    when count(*) filter (where status = 'published') > 0 then 'partially_failed'
    else 'failed' end
  into final from public.post_targets where post_id = p_post;

  update public.content_posts set status = final,
    published_at = case when final in ('published','partially_failed') then now() else null end
  where id = p_post;

  perform app_private.notify_workspace(p.tenant_id, p.workspace_id,
    case final when 'published' then 'Post published' when 'partially_failed' then 'Post partially published' else 'Post failed to publish' end,
    coalesce(nullif(p.title, ''), left(p.body, 80)), '/app/posts?id=' || p.id, array['admin','manager','editor']);
  return final;
end $$;

create or replace function app_private.process_due_posts()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select id from public.content_posts
           where status = 'scheduled' and scheduled_at <= now()
           order by scheduled_at limit 50 for update skip locked loop
    perform app_private.publish_post(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Fallback for environments without pg_cron: any member can nudge due posts of their workspace.
create or replace function public.process_due_posts(p_workspace uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0; v_tenant uuid;
begin
  select tenant_id into v_tenant from public.workspaces where id = p_workspace;
  if app_private.ws_role(v_tenant, p_workspace) is null then return 0; end if;
  for r in select id from public.content_posts
           where workspace_id = p_workspace and status = 'scheduled' and scheduled_at <= now()
           limit 20 for update skip locked loop
    perform app_private.publish_post(r.id); n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.submit_post(p_post uuid, p_scheduled_at timestamptz default null, p_publish_now boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare
  p public.content_posts;
  role text;
  approved boolean;
begin
  select * into p from public.content_posts where id = p_post for update;
  if not found then raise exception 'Post not found'; end if;
  perform app_private.require_ws_role(p.tenant_id, p.workspace_id, array['admin','manager','editor']);
  role := app_private.ws_role(p.tenant_id, p.workspace_id);
  if p.status in ('publishing','published') then raise exception 'Post already %', p.status; end if;
  if coalesce(trim(p.body), '') = '' then raise exception 'Post text is empty'; end if;
  if not exists (select 1 from public.post_targets where post_id = p_post) then
    raise exception 'Select at least one social account';
  end if;
  if not p_publish_now and (p_scheduled_at is null or p_scheduled_at < now() - interval '1 minute') then
    raise exception 'Choose a future schedule time';
  end if;

  update public.content_posts set scheduled_at = case when p_publish_now then now() else p_scheduled_at end where id = p_post;
  approved := p.status = 'approved';

  if p.requires_approval and not approved and role = 'editor' then
    update public.content_posts set status = 'approval_pending' where id = p_post;
    perform app_private.notify_workspace(p.tenant_id, p.workspace_id, 'Approval requested',
      coalesce(nullif(p.title, ''), left(p.body, 80)), '/app/approvals', array['admin','manager','approver']);
    return 'approval_pending';
  end if;

  if p_publish_now then
    return app_private.publish_post(p_post);
  end if;
  update public.content_posts set status = 'scheduled' where id = p_post;
  return 'scheduled';
end $$;

create or replace function public.decide_post(p_post uuid, p_decision text, p_comment text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.content_posts; next_status text;
begin
  select * into p from public.content_posts where id = p_post for update;
  if not found then raise exception 'Post not found'; end if;
  perform app_private.require_ws_role(p.tenant_id, p.workspace_id, array['admin','manager','approver']);
  if p_decision not in ('approved','rejected','changes_requested') then raise exception 'Invalid decision'; end if;
  insert into public.post_approvals (tenant_id, workspace_id, post_id, decision, comment, decided_by)
  values (p.tenant_id, p.workspace_id, p_post, p_decision, p_comment, (select auth.uid()));
  next_status := case
    when p_decision = 'approved' and p.scheduled_at is not null and p.scheduled_at > now() then 'scheduled'
    when p_decision = 'approved' then 'approved'
    when p_decision = 'rejected' then 'rejected'
    else 'draft' end;
  update public.content_posts set status = next_status where id = p_post;
  if p.created_by is not null then
    insert into public.notifications (tenant_id, user_id, title, body, link)
    values (p.tenant_id, p.created_by, 'Post ' || replace(p_decision, '_', ' '),
            coalesce(p_comment, coalesce(nullif(p.title, ''), left(p.body, 80))), '/app/posts?id=' || p_post);
  end if;
  return next_status;
end $$;

create or replace function public.retry_post(p_post uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.content_posts;
begin
  select * into p from public.content_posts where id = p_post;
  if not found then raise exception 'Post not found'; end if;
  perform app_private.require_ws_role(p.tenant_id, p.workspace_id, array['admin','manager','editor']);
  if p.status not in ('failed','partially_failed') then raise exception 'Only failed posts can be retried'; end if;
  -- published targets are never re-sent (idempotency)
  return app_private.publish_post(p_post);
end $$;

create or replace function public.unschedule_post(p_post uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.content_posts;
begin
  select * into p from public.content_posts where id = p_post;
  perform app_private.require_ws_role(p.tenant_id, p.workspace_id, array['admin','manager','editor']);
  if p.status not in ('scheduled','approval_pending','approved','rejected','failed') then raise exception 'Cannot move this post back to draft'; end if;
  update public.content_posts set status = 'draft' where id = p_post;
end $$;

-- ---------------------------------------------------------------- inbox
create or replace function public.simulate_inbound_message(p_workspace uuid, p_channel text, p_name text, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_contact uuid; v_conv uuid;
begin
  select tenant_id into v_tenant from public.workspaces where id = p_workspace;
  perform app_private.require_ws_role(v_tenant, p_workspace, array['admin','manager','editor','support']);
  select id into v_contact from public.contacts where workspace_id = p_workspace and lower(name) = lower(trim(p_name)) limit 1;
  if v_contact is null then
    insert into public.contacts (tenant_id, workspace_id, name, handle, source)
    values (v_tenant, p_workspace, trim(p_name), '@' || regexp_replace(lower(p_name), '[^a-z0-9]+', '', 'g'), p_channel)
    returning id into v_contact;
  end if;
  select id into v_conv from public.conversations where workspace_id = p_workspace and contact_id = v_contact
    and channel = p_channel and status <> 'closed' limit 1;
  if v_conv is null then
    insert into public.conversations (tenant_id, workspace_id, contact_id, channel, subject, is_demo)
    values (v_tenant, p_workspace, v_contact, p_channel, left(p_body, 60), true) returning id into v_conv;
  end if;
  insert into public.messages (tenant_id, workspace_id, conversation_id, direction, body, sender_name)
  values (v_tenant, p_workspace, v_conv, 'inbound', p_body, trim(p_name));
  return v_conv;
end $$;

create or replace function public.send_reply(p_conversation uuid, p_body text, p_draft uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.conversations; last_in timestamptz; consent text; v_id uuid; v_sender text;
begin
  select * into c from public.conversations where id = p_conversation;
  if not found then raise exception 'Conversation not found'; end if;
  perform app_private.require_ws_role(c.tenant_id, c.workspace_id, array['admin','manager','editor','support']);
  if coalesce(trim(p_body), '') = '' then raise exception 'Message is empty'; end if;
  select status into consent from public.consent_records where contact_id = c.contact_id and channel = c.channel
    order by created_at desc limit 1;
  if consent = 'opt_out' then raise exception 'Contact opted out of % messages', c.channel; end if;
  if c.channel = 'whatsapp' then
    select max(created_at) into last_in from public.messages where conversation_id = p_conversation and direction = 'inbound';
    if last_in is null or last_in < now() - interval '24 hours' then
      raise exception 'WhatsApp 24-hour customer service window is closed. Use an approved template message.';
    end if;
  end if;
  select coalesce(full_name, email) into v_sender from public.profiles where id = (select auth.uid());
  if p_draft is not null then
    -- an approved AI draft becomes the sent message
    update public.messages set body = trim(p_body), is_ai_draft = false, sent_by = (select auth.uid()),
      sender_name = v_sender, created_at = now()
    where id = p_draft and conversation_id = p_conversation and is_ai_draft
    returning id into v_id;
  end if;
  if v_id is null then
    insert into public.messages (tenant_id, workspace_id, conversation_id, direction, body, sent_by, sender_name)
    values (c.tenant_id, c.workspace_id, p_conversation, 'outbound', trim(p_body), (select auth.uid()), v_sender)
    returning id into v_id;
  end if;
  update public.conversations set unread_count = 0, last_message_at = now(),
    status = case when status = 'closed' then 'open' else status end where id = p_conversation;
  return v_id;
end $$;

create or replace function app_private.on_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w record; v_name text; v_channel text; v_contact uuid;
begin
  if new.direction <> 'inbound' then return new; end if;
  update public.conversations set unread_count = unread_count + 1, last_message_at = now(),
    status = case when status = 'closed' then 'open' else status end
  where id = new.conversation_id returning channel, contact_id into v_channel, v_contact;
  select name into v_name from public.contacts where id = v_contact;
  perform app_private.notify_workspace(new.tenant_id, new.workspace_id, 'New message from ' || coalesce(v_name, 'contact'),
    left(new.body, 120), '/app/inbox?c=' || new.conversation_id, array['admin','manager','support']);
  for w in select id from public.workflows where workspace_id = new.workspace_id
           and status = 'active' and trigger_type = 'message_received' loop
    perform app_private.run_workflow(w.id, jsonb_build_object(
      'body', new.body, 'name', v_name, 'channel', v_channel, 'contact_id', v_contact,
      'conversation_id', new.conversation_id, 'message_id', new.id), new.id::text);
  end loop;
  return new;
end $$;

-- ---------------------------------------------------------------- workflow engine
create or replace function app_private.render_template(p_tpl text, p_payload jsonb, p_workspace uuid)
returns text language sql stable security definer set search_path = '' as $$
  select replace(replace(replace(coalesce(p_tpl, ''),
    '{{name}}', coalesce(split_part(p_payload->>'name', ' ', 1), 'there')),
    '{{business}}', coalesce((select name from public.workspaces where id = p_workspace), '')),
    '{{channel}}', coalesce(p_payload->>'channel', ''));
$$;

create or replace function app_private.run_workflow(p_workflow uuid, p_payload jsonb, p_dedupe text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  wf public.workflows;
  v_run uuid;
  node jsonb;
  cfg jsonb;
  i integer := 0;
  fieldval text;
  matched boolean;
  v_stage uuid;
  v_lead uuid;
  v_text text;
  final text := 'completed';
begin
  select * into wf from public.workflows where id = p_workflow;
  if not found then return null; end if;
  insert into public.workflow_runs (tenant_id, workspace_id, workflow_id, version, trigger_payload, dedupe_key)
  values (wf.tenant_id, wf.workspace_id, wf.id, wf.version, p_payload, p_dedupe)
  on conflict (workflow_id, dedupe_key) do nothing
  returning id into v_run;
  if v_run is null then return null; end if;  -- duplicate event
  perform set_config('app.in_workflow', 'on', true);

  for node in select * from jsonb_array_elements(coalesce(wf.definition->'nodes', '[]'::jsonb)) loop
    i := i + 1;
    cfg := coalesce(node->'config', '{}'::jsonb);
    begin
      case node->>'type'
      when 'condition' then
        fieldval := lower(coalesce(p_payload->>(coalesce(cfg->>'field', 'body')), ''));
        matched := case coalesce(cfg->>'operator', 'contains')
          when 'equals' then fieldval = lower(coalesce(cfg->>'value', ''))
          when 'not_contains' then not exists (select 1 from unnest(string_to_array(lower(coalesce(cfg->>'value','')), ',')) k where trim(k) <> '' and fieldval like '%' || trim(k) || '%')
          else exists (select 1 from unnest(string_to_array(lower(coalesce(cfg->>'value','')), ',')) k where trim(k) <> '' and fieldval like '%' || trim(k) || '%')
        end;
        insert into public.workflow_steps (tenant_id, workspace_id, run_id, position, node_type, status, output)
        values (wf.tenant_id, wf.workspace_id, v_run, i, 'condition', case when matched then 'completed' else 'skipped' end,
                jsonb_build_object('matched', matched, 'field', cfg->>'field', 'value', cfg->>'value'));
        if not matched then final := 'skipped'; exit; end if;

      when 'create_lead' then
        select id into v_stage from public.pipeline_stages where workspace_id = wf.workspace_id order by position limit 1;
        insert into public.leads (tenant_id, workspace_id, contact_id, stage_id, title, source, value_inr)
        values (wf.tenant_id, wf.workspace_id, (p_payload->>'contact_id')::uuid, v_stage,
          coalesce(nullif(app_private.render_template(cfg->>'title', p_payload, wf.workspace_id), ''), 'Enquiry from ' || coalesce(p_payload->>'name', 'contact')),
          coalesce(p_payload->>'channel', 'automation'), coalesce((cfg->>'value_inr')::int, 0))
        returning id into v_lead;
        p_payload := p_payload || jsonb_build_object('lead_id', v_lead);
        insert into public.workflow_steps (tenant_id, workspace_id, run_id, position, node_type, status, output)
        values (wf.tenant_id, wf.workspace_id, v_run, i, 'create_lead', 'completed', jsonb_build_object('lead_id', v_lead));

      when 'add_tag' then
        update public.contacts set tags = array(select distinct unnest(tags || array[cfg->>'tag']))
        where id = (p_payload->>'contact_id')::uuid and workspace_id = wf.workspace_id;
        insert into public.workflow_steps (tenant_id, workspace_id, run_id, position, node_type, status, output)
        values (wf.tenant_id, wf.workspace_id, v_run, i, 'add_tag', 'completed', jsonb_build_object('tag', cfg->>'tag'));

      when 'set_priority' then
        update public.conversations set priority = coalesce(cfg->>'priority', 'high')
        where id = (p_payload->>'conversation_id')::uuid and workspace_id = wf.workspace_id;
        insert into public.workflow_steps (tenant_id, workspace_id, run_id, position, node_type, status, output)
        values (wf.tenant_id, wf.workspace_id, v_run, i, 'set_priority', 'completed', jsonb_build_object('priority', cfg->>'priority'));

      when 'notify' then
        perform app_private.notify_workspace(wf.tenant_id, wf.workspace_id,
          coalesce(nullif(app_private.render_template(cfg->>'title', p_payload, wf.workspace_id), ''), 'Automation: ' || wf.name),
          app_private.render_template(coalesce(cfg->>'body', p_payload->>'body'), p_payload, wf.workspace_id),
          case when p_payload ? 'conversation_id' then '/app/inbox?c=' || (p_payload->>'conversation_id') else '/app/automations' end);
        insert into public.workflow_steps (tenant_id, workspace_id, run_id, position, node_type, status, output)
        values (wf.tenant_id, wf.workspace_id, v_run, i, 'notify', 'completed', jsonb_build_object('title', cfg->>'title'));

      when 'ai_draft' then
        if p_payload ? 'conversation_id' then
          v_text := app_private.render_template(coalesce(cfg->>'template',
            'Hi {{name}}, thanks for reaching out to {{business}}! Our team will get back to you shortly.'), p_payload, wf.workspace_id);
          insert into public.messages (tenant_id, workspace_id, conversation_id, direction, body, sender_name, is_ai_draft)
          values (wf.tenant_id, wf.workspace_id, (p_payload->>'conversation_id')::uuid, 'outbound', v_text, 'AI draft', true);
          insert into public.workflow_steps (tenant_id, workspace_id, run_id, position, node_type, status, output)
          values (wf.tenant_id, wf.workspace_id, v_run, i, 'ai_draft', 'completed', jsonb_build_object('draft', v_text, 'needs_review', true));
        else
          insert into public.workflow_steps (tenant_id, workspace_id, run_id, position, node_type, status, output)
          values (wf.tenant_id, wf.workspace_id, v_run, i, 'ai_draft', 'skipped', jsonb_build_object('reason', 'no conversation'));
        end if;

      when 'wait' then
        insert into public.workflow_steps (tenant_id, workspace_id, run_id, position, node_type, status, output)
        values (wf.tenant_id, wf.workspace_id, v_run, i, 'wait', 'completed',
                jsonb_build_object('minutes', cfg->>'minutes', 'note', 'Delays are recorded; durable timers need the background worker'));

      when 'approval' then
        perform app_private.notify_workspace(wf.tenant_id, wf.workspace_id, 'Automation needs approval: ' || wf.name,
          left(p_payload->>'body', 120), '/app/automations', array['admin','manager','approver']);
        insert into public.workflow_steps (tenant_id, workspace_id, run_id, position, node_type, status, output)
        values (wf.tenant_id, wf.workspace_id, v_run, i, 'approval', 'completed', jsonb_build_object('waiting', true));
        final := 'waiting_approval'; exit;

      when 'end' then
        insert into public.workflow_steps (tenant_id, workspace_id, run_id, position, node_type, status)
        values (wf.tenant_id, wf.workspace_id, v_run, i, 'end', 'completed');
        exit;

      else
        raise exception 'Unknown node type %', node->>'type';
      end case;
    exception when others then
      insert into public.workflow_steps (tenant_id, workspace_id, run_id, position, node_type, status, output)
      values (wf.tenant_id, wf.workspace_id, v_run, i, coalesce(node->>'type', '?'), 'failed', jsonb_build_object('error', sqlerrm));
      update public.workflow_runs set status = 'failed', error = sqlerrm, finished_at = now() where id = v_run;
      perform set_config('app.in_workflow', 'off', true);
      return v_run;
    end;
  end loop;

  update public.workflow_runs set status = final, finished_at = now() where id = v_run;
  perform set_config('app.in_workflow', 'off', true);
  return v_run;
end $$;

create or replace function public.run_workflow_test(p_workflow uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare wf public.workflows;
begin
  select * into wf from public.workflows where id = p_workflow;
  if not found then raise exception 'Workflow not found'; end if;
  perform app_private.require_ws_role(wf.tenant_id, wf.workspace_id, array['admin','manager']);
  return app_private.run_workflow(p_workflow, coalesce(p_payload, '{}'::jsonb), 'manual_' || gen_random_uuid());
end $$;

create or replace function public.cancel_workflow_run(p_run uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.workflow_runs;
begin
  select * into r from public.workflow_runs where id = p_run;
  perform app_private.require_ws_role(r.tenant_id, r.workspace_id, array['admin','manager']);
  update public.workflow_runs set status = 'cancelled', finished_at = now()
  where id = p_run and status in ('running','waiting_approval');
end $$;

create or replace function app_private.on_lead() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w record;
begin
  if current_setting('app.in_workflow', true) = 'on' then return new; end if;
  for w in select id from public.workflows where workspace_id = new.workspace_id
           and status = 'active' and trigger_type = 'lead_created' loop
    perform app_private.run_workflow(w.id, jsonb_build_object('lead_id', new.id, 'name', new.title,
      'body', coalesce(new.notes, new.title), 'contact_id', new.contact_id, 'channel', new.source), 'lead_' || new.id);
  end loop;
  return new;
end $$;

create or replace function app_private.version_workflow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.definition is not distinct from old.definition then return new; end if;
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end $$;

create or replace function app_private.store_workflow_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workflow_versions (tenant_id, workspace_id, workflow_id, version, definition, created_by)
  values (new.tenant_id, new.workspace_id, new.id, new.version, new.definition, (select auth.uid()))
  on conflict (workflow_id, version) do nothing;
  return new;
end $$;

create trigger trg_on_message after insert on public.messages for each row execute function app_private.on_message();
create trigger trg_on_lead after insert on public.leads for each row execute function app_private.on_lead();
create trigger trg_version before update on public.workflows for each row execute function app_private.version_workflow();
create trigger trg_store_version after insert or update on public.workflows for each row execute function app_private.store_workflow_version();

-- ---------------------------------------------------------------- billing
create or replace function public.demo_change_plan(p_tenant uuid, p_plan text)
returns void language plpgsql security definer set search_path = '' as $$
declare pl public.plans;
begin
  if app_private.tenant_role(p_tenant) is distinct from 'owner' then
    raise exception 'Only the owner can change the plan' using errcode = '42501';
  end if;
  if coalesce((select value from app_private.settings where key = 'billing_demo_mode'), 'false') <> 'true' then
    raise exception 'Demo billing is disabled. Use the payment checkout.';
  end if;
  select * into pl from public.plans where id = p_plan;
  if not found or pl.price_inr is null then raise exception 'Contact sales for this plan'; end if;
  if (select count(*) from public.workspaces where tenant_id = p_tenant) > pl.max_workspaces then
    raise exception 'Remove workspaces first: % plan allows %', pl.name, pl.max_workspaces;
  end if;
  update public.subscriptions set plan_id = p_plan, status = 'active', provider = 'demo',
    current_period_start = now(), current_period_end = now() + interval '1 month',
    cancel_at_period_end = false, updated_at = now()
  where tenant_id = p_tenant;
  insert into public.invoices (tenant_id, plan_id, amount_inr, status, provider)
  values (p_tenant, p_plan, pl.price_inr, 'paid', 'demo');
end $$;

create or replace function public.set_cancel_at_period_end(p_tenant uuid, p_cancel boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if app_private.tenant_role(p_tenant) is distinct from 'owner' then
    raise exception 'Only the owner can manage the subscription' using errcode = '42501';
  end if;
  update public.subscriptions set cancel_at_period_end = p_cancel, updated_at = now() where tenant_id = p_tenant;
end $$;

create or replace function public.get_usage(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare pl public.plans; ms timestamptz := date_trunc('month', now());
begin
  if not app_private.is_member(p_tenant) then raise exception 'Not a member' using errcode = '42501'; end if;
  pl := app_private.tenant_plan(p_tenant);
  return jsonb_build_object(
    'plan', to_jsonb(pl),
    'workspaces', (select count(*) from public.workspaces where tenant_id = p_tenant),
    'accounts', (select count(*) from public.social_accounts where tenant_id = p_tenant and status <> 'disconnected'),
    'posts', (select count(*) from public.content_posts where tenant_id = p_tenant and created_at >= ms),
    'users', (select count(*) from public.tenant_members where tenant_id = p_tenant),
    'ai_credits', (select coalesce(sum(quantity), 0) from public.usage_events where tenant_id = p_tenant and kind = 'ai_credit' and created_at >= ms));
end $$;

create or replace function public.create_api_key(p_tenant uuid, p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_key text := 'dmsp_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not app_private.is_tenant_admin(p_tenant) then raise exception 'Admins only' using errcode = '42501'; end if;
  insert into public.api_keys (tenant_id, name, prefix, key_hash)
  values (p_tenant, coalesce(nullif(trim(p_name), ''), 'API key'), left(v_key, 12), encode(extensions.digest(v_key, 'sha256'), 'hex'));
  return v_key;  -- shown once, only the hash is stored
end $$;

-- ---------------------------------------------------------------- dashboard
create or replace function public.dashboard_stats(p_workspace uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.workspaces where id = p_workspace;
  if app_private.ws_role(v_tenant, p_workspace) is null then raise exception 'No access' using errcode = '42501'; end if;
  return jsonb_build_object(
    'accounts', (select count(*) from public.social_accounts where workspace_id = p_workspace and status = 'connected'),
    'accounts_attention', (select count(*) from public.social_accounts where workspace_id = p_workspace and status in ('expired','error')),
    'published_30d', (select count(*) from public.content_posts where workspace_id = p_workspace and status in ('published','partially_failed') and published_at > now() - interval '30 days'),
    'scheduled', (select count(*) from public.content_posts where workspace_id = p_workspace and status = 'scheduled'),
    'pending_approvals', (select count(*) from public.content_posts where workspace_id = p_workspace and status = 'approval_pending'),
    'failed', (select count(*) from public.content_posts where workspace_id = p_workspace and status in ('failed','partially_failed')),
    'unread', (select coalesce(sum(unread_count), 0) from public.conversations where workspace_id = p_workspace and status <> 'closed'),
    'open_conversations', (select count(*) from public.conversations where workspace_id = p_workspace and status = 'open'),
    'new_leads_7d', (select count(*) from public.leads where workspace_id = p_workspace and created_at > now() - interval '7 days'),
    'pipeline_value', (select coalesce(sum(l.value_inr), 0) from public.leads l join public.pipeline_stages s on s.id = l.stage_id
                       where l.workspace_id = p_workspace and not s.is_lost and not s.is_won),
    'won_value', (select coalesce(sum(l.value_inr), 0) from public.leads l join public.pipeline_stages s on s.id = l.stage_id
                       where l.workspace_id = p_workspace and s.is_won),
    'avg_rating', (select round(avg(rating)::numeric, 1) from public.reviews where workspace_id = p_workspace),
    'workflow_runs_7d', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.workflow_runs
                       where workspace_id = p_workspace and started_at > now() - interval '7 days' group by status) x),
    'engagement', (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'impressions', i, 'engagements', e, 'followers', f) order by d), '[]'::jsonb)
                   from (select snapshot_date d, sum(impressions) i, sum(engagements) e, sum(followers) f from public.metric_snapshots
                         where workspace_id = p_workspace and snapshot_date > current_date - 30 group by snapshot_date) m),
    'has_demo_metrics', exists (select 1 from public.metric_snapshots where workspace_id = p_workspace and is_demo));
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
revoke execute on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.tenant_role(uuid), app_private.is_member(uuid),
  app_private.is_tenant_admin(uuid), app_private.ws_role(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- realtime
alter publication supabase_realtime add table public.notifications, public.messages, public.conversations;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 52428800)
on conflict (id) do nothing;

create or replace function app_private.media_role(p_name text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := storage.foldername(p_name);
begin
  return app_private.ws_role(parts[1]::uuid, parts[2]::uuid);
exception when others then
  return null;
end $$;
revoke execute on function app_private.media_role(text) from public, anon;
grant execute on function app_private.media_role(text) to authenticated;
revoke all on app_private.settings from public, anon, authenticated;

create policy media_read on storage.objects for select to authenticated using (
  bucket_id = 'media' and app_private.media_role(name) is not null);
create policy media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and app_private.media_role(name) in ('admin','manager','editor'));
create policy media_delete on storage.objects for delete to authenticated using (
  bucket_id = 'media' and app_private.media_role(name) in ('admin','manager','editor'));
