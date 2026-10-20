-- Business rules enforced in the database so the browser can't bypass them.

create table app_private.settings (key text primary key, value text not null);
insert into app_private.settings values ('billing_demo_mode', 'true');

-- ---------------------------------------------------------------- generic
create or replace function app_private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create or replace function app_private.set_created_by() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null then new.created_by := (select auth.uid()); end if;
  return new;
end $$;

create trigger trg_updated before update on public.content_posts for each row execute function app_private.set_updated_at();
create trigger trg_updated before update on public.leads for each row execute function app_private.set_updated_at();
create trigger trg_updated before update on public.workflows for each row execute function app_private.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['media_assets','content_posts','activities','ai_generations','workflows','api_keys'] loop
    execute format('create trigger trg_created_by before insert on public.%I for each row execute function app_private.set_created_by()', t);
  end loop;
end $$;

-- new auth user => profile
create or replace function app_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- ---------------------------------------------------------------- audit
create or replace function app_private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  -- rows removed by a tenant-deletion cascade: nothing left to audit against
  if not exists (select 1 from public.tenants where id = (rec->>'tenant_id')::uuid) then
    return coalesce(new, old);
  end if;
  insert into public.audit_logs (tenant_id, workspace_id, actor_id, action, entity, entity_id, meta)
  values (
    (rec->>'tenant_id')::uuid,
    case when rec ? 'workspace_id' then (rec->>'workspace_id')::uuid end,
    (select auth.uid()),
    lower(tg_op), tg_table_name,
    coalesce(rec->>'id', rec->>'user_id'),
    jsonb_strip_nulls(jsonb_build_object(
      'status', rec->>'status', 'name', coalesce(rec->>'name', rec->>'title'), 'role', rec->>'role')));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['workspaces','tenant_members','workspace_members','invitations','social_accounts',
    'content_posts','post_approvals','leads','workflows','subscriptions','api_keys','webhook_endpoints'] loop
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function app_private.audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- quotas
create or replace function app_private.tenant_plan(p_tenant uuid) returns public.plans
language sql stable security definer set search_path = '' as $$
  select p.* from public.plans p
  where p.id = coalesce((
    select s.plan_id from public.subscriptions s
    where s.tenant_id = p_tenant
      and (s.status in ('active','trialing','past_due') and s.current_period_end > now() - interval '3 days')
  ), 'starter');
$$;

create or replace function app_private.enforce_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  pl public.plans := app_private.tenant_plan(new.tenant_id);
  used integer;
  month_start timestamptz := date_trunc('month', now());
begin
  if tg_table_name = 'workspaces' then
    select count(*) into used from public.workspaces where tenant_id = new.tenant_id;
    if used >= pl.max_workspaces then
      raise exception 'Plan limit reached: % plan allows % workspace(s). Upgrade to add more.', pl.name, pl.max_workspaces using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'social_accounts' then
    select count(*) into used from public.social_accounts where tenant_id = new.tenant_id and status <> 'disconnected';
    if used >= pl.max_accounts then
      raise exception 'Plan limit reached: % plan allows % social account(s).', pl.name, pl.max_accounts using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'content_posts' then
    select count(*) into used from public.content_posts where tenant_id = new.tenant_id and created_at >= month_start;
    if used >= pl.max_posts_per_month then
      raise exception 'Plan limit reached: % posts per month on the % plan.', pl.max_posts_per_month, pl.name using errcode = 'P0001';
    end if;
    insert into public.usage_events (tenant_id, workspace_id, kind) values (new.tenant_id, new.workspace_id, 'post');
  elsif tg_table_name = 'ai_generations' then
    select coalesce(sum(quantity), 0) into used from public.usage_events
      where tenant_id = new.tenant_id and kind = 'ai_credit' and created_at >= month_start;
    if used + new.credits > pl.ai_credits_per_month then
      raise exception 'AI credit limit reached: % of % credits used this month.', used, pl.ai_credits_per_month using errcode = 'P0001';
    end if;
    insert into public.usage_events (tenant_id, workspace_id, kind, quantity) values (new.tenant_id, new.workspace_id, 'ai_credit', new.credits);
  elsif tg_table_name = 'tenant_members' then
    select count(*) into used from public.tenant_members where tenant_id = new.tenant_id;
    if used >= pl.max_users then
      raise exception 'Plan limit reached: % plan allows % user(s).', pl.name, pl.max_users using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['workspaces','social_accounts','content_posts','ai_generations','tenant_members'] loop
    execute format('create trigger trg_quota before insert on public.%I for each row execute function app_private.enforce_quota()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- workspace seed
create or replace function app_private.seed_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pipeline_stages (tenant_id, workspace_id, name, position, color, is_won, is_lost) values
    (new.tenant_id, new.id, 'New enquiry', 0, '#38bdf8', false, false),
    (new.tenant_id, new.id, 'Contacted',   1, '#a78bfa', false, false),
    (new.tenant_id, new.id, 'Visit / Call',2, '#f59e0b', false, false),
    (new.tenant_id, new.id, 'Proposal',    3, '#f472b6', false, false),
    (new.tenant_id, new.id, 'Won',         4, '#84cc16', true,  false),
    (new.tenant_id, new.id, 'Lost',        5, '#ef4444', false, true);
  return new;
end $$;
create trigger trg_seed after insert on public.workspaces for each row execute function app_private.seed_workspace();

-- ---------------------------------------------------------------- notifications
create or replace function app_private.notify_workspace(
  p_tenant uuid, p_workspace uuid, p_title text, p_body text, p_link text,
  p_roles text[] default array['admin','manager','editor','support','approver'])
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (tenant_id, user_id, title, body, link)
  select distinct p_tenant, u.user_id, p_title, p_body, p_link from (
    select tm.user_id from public.tenant_members tm
      where tm.tenant_id = p_tenant and tm.role in ('owner','admin') and 'admin' = any(p_roles)
    union
    select wm.user_id from public.workspace_members wm
      where wm.workspace_id = p_workspace and wm.role = any(p_roles)
  ) u;
$$;

-- ---------------------------------------------------------------- post status guard
create or replace function app_private.guard_post_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- only privileged server functions may move posts into worker-owned states
  if current_user = 'authenticated' then
    if new.status in ('publishing','published','partially_failed','failed','approved','rejected','scheduled')
       and (tg_op = 'INSERT' or new.status is distinct from old.status) then
      raise exception 'Use the scheduling / approval actions to change post status to %', new.status using errcode = 'P0001';
    end if;
    -- editing approved content sends it back through approval
    if tg_op = 'UPDATE' and old.status in ('approved','scheduled') and old.requires_approval
       and (new.body is distinct from old.body or new.media_ids is distinct from old.media_ids) then
      new.status := 'draft';
    end if;
    if tg_op = 'UPDATE' and old.status in ('publishing','published') then
      raise exception 'Published posts cannot be edited' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_status before insert or update on public.content_posts
  for each row execute function app_private.guard_post_status();
