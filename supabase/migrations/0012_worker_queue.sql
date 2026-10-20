-- Live (non-demo) targets are queued for the BullMQ worker, which holds provider tokens.
create or replace function app_private.publish_post(p_post uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  p public.content_posts;
  t record;
  final text;
begin
  select * into p from public.content_posts where id = p_post for update;
  if not found or p.status in ('published') then return coalesce(p.status, 'missing'); end if;
  update public.content_posts set status = 'publishing' where id = p_post;

  for t in select pt.*, sa.is_demo, sa.status as acct_status, sa.provider,
                  (sa.capabilities->>'can_publish')::boolean as can_publish,
                  exists (select 1 from app_private.oauth_credentials c where c.social_account_id = sa.id) as has_token
           from public.post_targets pt join public.social_accounts sa on sa.id = pt.social_account_id
           where pt.post_id = p_post and pt.status in ('pending','failed')
           for update of pt
  loop
    if t.acct_status <> 'connected' or not coalesce(t.can_publish, false) then
      update public.post_targets set status = 'failed',
        error = format('%s account is %s or lacks publish permission', t.provider, t.acct_status) where id = t.id;
      insert into public.publish_attempts (tenant_id, workspace_id, post_target_id, status, error_category, response)
      values (t.tenant_id, t.workspace_id, t.id, 'failed', 'permission', jsonb_build_object('account_status', t.acct_status));
    elsif t.is_demo then
      update public.post_targets set status = 'published', error = null, published_at = now(),
        external_post_id = coalesce(external_post_id, 'demo_' || t.idempotency_key) where id = t.id;
      insert into public.publish_attempts (tenant_id, workspace_id, post_target_id, status, response)
      values (t.tenant_id, t.workspace_id, t.id, 'success', jsonb_build_object('adapter', 'demo', 'note', 'Simulated publish - no real network call'));
      insert into public.usage_events (tenant_id, workspace_id, kind) values (t.tenant_id, t.workspace_id, 'publish');
    elsif t.has_token then
      -- queued: the worker publishes through the official API and calls worker_finalize_post
      update public.post_targets set status = 'pending', error = null where id = t.id;
    else
      update public.post_targets set status = 'failed', error = 'Account has no stored credentials — reconnect it.' where id = t.id;
      insert into public.publish_attempts (tenant_id, workspace_id, post_target_id, status, error_category)
      values (t.tenant_id, t.workspace_id, t.id, 'failed', 'credentials_missing');
    end if;
  end loop;

  return app_private.finalize_post(p_post);
end $$;

create or replace function app_private.finalize_post(p_post uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.content_posts; final text; queued boolean;
begin
  select * into p from public.content_posts where id = p_post;
  select exists (select 1 from public.post_targets pt join public.social_accounts sa on sa.id = pt.social_account_id
                 where pt.post_id = p_post and pt.status in ('pending','publishing') and not sa.is_demo) into queued;
  if queued then
    update public.content_posts set status = 'publishing' where id = p_post;
    return 'publishing';
  end if;
  select case
    when count(*) filter (where status = 'published') = count(*) and count(*) > 0 then 'published'
    when count(*) filter (where status = 'published') > 0 then 'partially_failed'
    else 'failed' end
  into final from public.post_targets where post_id = p_post;
  update public.content_posts set status = final,
    published_at = case when final in ('published','partially_failed') then coalesce(published_at, now()) else null end
  where id = p_post;
  perform app_private.notify_workspace(p.tenant_id, p.workspace_id,
    case final when 'published' then 'Post published' when 'partially_failed' then 'Post partially published' else 'Post failed to publish' end,
    coalesce(nullif(p.title, ''), left(p.body, 80)), '/app/posts?id=' || p.id, array['admin','manager','editor']);
  return final;
end $$;

-- worker-only: record the provider result for one target, then recompute the post status
create or replace function public.worker_record_publish(p_target uuid, p_ok boolean, p_external_id text, p_error text, p_category text, p_response jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare t public.post_targets;
begin
  select * into t from public.post_targets where id = p_target for update;
  if not found then return 'missing'; end if;
  if t.status = 'published' then return 'already_published'; end if;  -- idempotent
  update public.post_targets set status = case when p_ok then 'published' else 'failed' end,
    external_post_id = coalesce(p_external_id, external_post_id), error = case when p_ok then null else left(p_error, 1000) end,
    published_at = case when p_ok then now() else null end
  where id = p_target;
  insert into public.publish_attempts (tenant_id, workspace_id, post_target_id, status, error_category, response)
  values (t.tenant_id, t.workspace_id, t.id, case when p_ok then 'success' else 'failed' end, p_category, p_response);
  if p_ok then insert into public.usage_events (tenant_id, workspace_id, kind) values (t.tenant_id, t.workspace_id, 'publish'); end if;
  return app_private.finalize_post(t.post_id);
end $$;

revoke execute on function public.worker_record_publish(uuid, boolean, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.worker_record_publish(uuid, boolean, text, text, text, jsonb) to service_role;
