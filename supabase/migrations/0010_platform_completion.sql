-- Appointments, website chat + human handoff, support desk, platform super-admin,
-- and server-only RPCs used by the OAuth callback and provider webhooks.

-- ---------------------------------------------------------------- appointments
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  title text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  kind text not null default 'visit' check (kind in ('visit','call','video','trial','consultation','event','other')),
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','completed','no_show','cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  notes text,
  follow_up_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);
create index on public.appointments(workspace_id, starts_at);

-- ---------------------------------------------------------------- website chat + handoff
alter table public.workspaces add column if not exists chat_widget_key uuid not null default gen_random_uuid();
create unique index if not exists workspaces_chat_widget_key on public.workspaces(chat_widget_key);
alter table public.conversations add column if not exists web_session uuid unique;
alter table public.conversations add column if not exists external_id text;
alter table public.conversations add column if not exists handling text not null default 'human' check (handling in ('ai_assist','human'));
create unique index if not exists conversations_external on public.conversations(workspace_id, channel, external_id) where external_id is not null;
alter table public.messages add column if not exists external_id text;
create unique index if not exists messages_external on public.messages(conversation_id, external_id) where external_id is not null;
alter table public.landing_pages alter column accent set default '#3b7a0c';

-- ---------------------------------------------------------------- support desk
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject text not null,
  category text not null default 'question' check (category in ('question','bug','billing','integration','feature','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','waiting_customer','waiting_support','resolved','closed')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid default auth.uid() references auth.users(id) on delete set null,
  from_support boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- platform admins
create table app_private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function app_private.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app_private.platform_admins where user_id = (select auth.uid()));
$$;
grant execute on function app_private.is_platform_admin() to authenticated;

alter table public.appointments enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

create policy appointments_read on public.appointments for select to authenticated using (app_private.ws_role(tenant_id, workspace_id) is not null);
create policy appointments_write on public.appointments for all to authenticated
  using (app_private.ws_role(tenant_id, workspace_id) = any (array['admin','manager','editor','support']))
  with check (app_private.ws_role(tenant_id, workspace_id) = any (array['admin','manager','editor','support']));
create trigger trg_created_by before insert on public.appointments for each row execute function app_private.set_created_by();

create policy tickets_read on public.support_tickets for select to authenticated
  using (app_private.is_member(tenant_id) or app_private.is_platform_admin());
create policy tickets_insert on public.support_tickets for insert to authenticated
  with check (app_private.is_member(tenant_id) and created_by = (select auth.uid()));
create policy tickets_update on public.support_tickets for update to authenticated
  using (app_private.is_tenant_admin(tenant_id) or created_by = (select auth.uid()) or app_private.is_platform_admin())
  with check (app_private.is_tenant_admin(tenant_id) or created_by = (select auth.uid()) or app_private.is_platform_admin());
create trigger trg_updated before update on public.support_tickets for each row execute function app_private.set_updated_at();

create policy support_messages_read on public.support_messages for select to authenticated using (
  exists (select 1 from public.support_tickets t where t.id = ticket_id and (app_private.is_member(t.tenant_id) or app_private.is_platform_admin())));
create policy support_messages_insert on public.support_messages for insert to authenticated with check (
  author_id = (select auth.uid()) and exists (select 1 from public.support_tickets t where t.id = ticket_id and (
    (app_private.is_member(t.tenant_id) and not from_support) or (app_private.is_platform_admin() and from_support))));

-- ---------------------------------------------------------------- platform console RPCs
create or replace function public.platform_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.is_platform_admin();
$$;

create or replace function public.platform_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_platform_admin() then raise exception 'Platform admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'tenants', (select count(*) from public.tenants),
    'users', (select count(*) from auth.users),
    'workspaces', (select count(*) from public.workspaces),
    'active_subscriptions', (select count(*) from public.subscriptions where status = 'active'),
    'trialing', (select count(*) from public.subscriptions where status = 'trialing'),
    'mrr_inr', (select coalesce(sum(p.price_inr), 0) from public.subscriptions s join public.plans p on p.id = s.plan_id where s.status = 'active'),
    'open_tickets', (select count(*) from public.support_tickets where status not in ('resolved','closed')),
    'posts_30d', (select count(*) from public.content_posts where created_at > now() - interval '30 days'),
    'ai_credits_30d', (select coalesce(sum(quantity), 0) from public.usage_events where kind = 'ai_credit' and created_at > now() - interval '30 days'),
    'failed_posts_7d', (select count(*) from public.content_posts where status in ('failed','partially_failed') and updated_at > now() - interval '7 days'),
    'tenant_list', (select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
      select jsonb_build_object(
        'id', t.id, 'name', t.name, 'kind', t.kind, 'created_at', t.created_at,
        'plan', s.plan_id, 'status', s.status, 'period_end', s.current_period_end,
        'members', (select count(*) from public.tenant_members m where m.tenant_id = t.id),
        'workspaces', (select count(*) from public.workspaces w where w.tenant_id = t.id),
        'posts_month', (select count(*) from public.content_posts c where c.tenant_id = t.id and c.created_at >= date_trunc('month', now())),
        'ai_month', (select coalesce(sum(quantity), 0) from public.usage_events u where u.tenant_id = t.id and u.kind = 'ai_credit' and u.created_at >= date_trunc('month', now())),
        'owner_email', (select u.email from public.tenant_members m join auth.users u on u.id = m.user_id where m.tenant_id = t.id and m.role = 'owner' limit 1)
      ) x
      from public.tenants t left join public.subscriptions s on s.tenant_id = t.id
      limit 500) q));
end $$;

create or replace function public.platform_update_subscription(p_tenant uuid, p_plan text, p_status text, p_extend_days int default 0)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_platform_admin() then raise exception 'Platform admins only' using errcode = '42501'; end if;
  if not exists (select 1 from public.plans where id = p_plan) then raise exception 'Unknown plan'; end if;
  if p_status not in ('trialing','active','past_due','cancelled','expired') then raise exception 'Unknown status'; end if;
  update public.subscriptions set plan_id = p_plan, status = p_status, provider = 'platform_admin',
    current_period_end = current_period_end + make_interval(days => greatest(0, coalesce(p_extend_days, 0))), updated_at = now()
  where tenant_id = p_tenant;
  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, meta)
  values (p_tenant, (select auth.uid()), 'update', 'subscriptions', p_tenant::text,
          jsonb_build_object('by', 'platform_admin', 'plan', p_plan, 'status', p_status, 'extend_days', p_extend_days));
end $$;

-- ---------------------------------------------------------------- website chat (anon)
create or replace function public.web_chat_config(p_key uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('business', w.name, 'greeting', coalesce(w.brand_settings->>'chat_greeting', 'Hi! How can we help you today?'))
  from public.workspaces w where w.chat_widget_key = p_key;
$$;

create or replace function public.start_web_chat(p_key uuid, p_name text, p_email text, p_message text, p_consent boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare w public.workspaces; v_contact uuid; v_conv uuid; v_session uuid := gen_random_uuid(); v_email text := lower(nullif(trim(p_email), ''));
begin
  select * into w from public.workspaces where chat_widget_key = p_key;
  if not found then raise exception 'Chat is not available'; end if;
  if coalesce(trim(p_message), '') = '' or length(p_message) > 2000 then raise exception 'Please enter a message'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
  if (select count(*) from public.conversations where workspace_id = w.id and channel = 'website' and created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'Chat is busy, please try again shortly';
  end if;
  insert into public.contacts (tenant_id, workspace_id, name, email, source, marketing_consent)
  values (w.tenant_id, w.id, left(coalesce(nullif(trim(p_name), ''), 'Website visitor'), 120), v_email, 'website', coalesce(p_consent, false))
  returning id into v_contact;
  if coalesce(p_consent, false) then
    insert into public.consent_records (tenant_id, workspace_id, contact_id, channel, status, source)
    values (w.tenant_id, w.id, v_contact, 'email', 'opt_in', 'website_chat');
  end if;
  insert into public.conversations (tenant_id, workspace_id, contact_id, channel, subject, web_session)
  values (w.tenant_id, w.id, v_contact, 'website', left(p_message, 60), v_session) returning id into v_conv;
  insert into public.messages (tenant_id, workspace_id, conversation_id, direction, body, sender_name)
  values (w.tenant_id, w.id, v_conv, 'inbound', left(p_message, 2000), left(coalesce(nullif(trim(p_name), ''), 'Visitor'), 120));
  return v_session;
end $$;

create or replace function public.send_web_chat(p_session uuid, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.conversations;
begin
  select * into c from public.conversations where web_session = p_session;
  if not found then raise exception 'Chat session expired'; end if;
  if coalesce(trim(p_message), '') = '' or length(p_message) > 2000 then raise exception 'Please enter a message'; end if;
  if (select count(*) from public.messages where conversation_id = c.id and direction = 'inbound' and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Too many messages, please wait a moment';
  end if;
  insert into public.messages (tenant_id, workspace_id, conversation_id, direction, body, sender_name)
  values (c.tenant_id, c.workspace_id, c.id, 'inbound', left(p_message, 2000), 'Visitor');
end $$;

create or replace function public.web_chat_messages(p_session uuid)
returns table (direction text, body text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.direction, m.body, m.created_at from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where c.web_session = p_session and m.direction in ('inbound','outbound') and not m.is_ai_draft
  order by m.created_at limit 200;
$$;

-- ---------------------------------------------------------------- server-only (service_role) RPCs
create or replace function public.store_oauth_credentials(p_account uuid, p_access bytea, p_refresh bytea, p_expires timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into app_private.oauth_credentials (social_account_id, access_token_encrypted, refresh_token_encrypted, expires_at, updated_at)
  values (p_account, p_access, p_refresh, p_expires, now())
  on conflict (social_account_id) do update set access_token_encrypted = excluded.access_token_encrypted,
    refresh_token_encrypted = coalesce(excluded.refresh_token_encrypted, app_private.oauth_credentials.refresh_token_encrypted),
    expires_at = excluded.expires_at, updated_at = now();
$$;

create or replace function public.get_oauth_credentials(p_account uuid)
returns table (access_token_encrypted bytea, refresh_token_encrypted bytea, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select access_token_encrypted, refresh_token_encrypted, expires_at from app_private.oauth_credentials where social_account_id = p_account;
$$;

-- provider webhook → inbox (idempotent on the provider's message id)
create or replace function public.ingest_inbound_message(p_account uuid, p_external_thread text, p_external_msg text,
  p_sender_name text, p_sender_handle text, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.social_accounts; v_contact uuid; v_conv uuid; v_msg uuid; v_channel text;
begin
  select * into a from public.social_accounts where id = p_account and status <> 'disconnected';
  if not found then return null; end if;
  v_channel := case a.provider when 'facebook' then 'facebook' when 'whatsapp' then 'whatsapp' else a.provider end;
  select id, contact_id into v_conv, v_contact from public.conversations
   where workspace_id = a.workspace_id and channel = v_channel and external_id = p_external_thread;
  if v_conv is null then
    select id into v_contact from public.contacts where workspace_id = a.workspace_id and handle = p_sender_handle limit 1;
    if v_contact is null then
      insert into public.contacts (tenant_id, workspace_id, name, handle, phone, source)
      values (a.tenant_id, a.workspace_id, left(coalesce(nullif(p_sender_name, ''), p_sender_handle, 'Contact'), 120), p_sender_handle,
              case when v_channel = 'whatsapp' then p_sender_handle end, v_channel)
      returning id into v_contact;
    end if;
    insert into public.conversations (tenant_id, workspace_id, contact_id, social_account_id, channel, subject, external_id)
    values (a.tenant_id, a.workspace_id, v_contact, a.id, v_channel, left(p_body, 60), p_external_thread)
    returning id into v_conv;
  end if;
  insert into public.messages (tenant_id, workspace_id, conversation_id, direction, body, sender_name, external_id)
  values (a.tenant_id, a.workspace_id, v_conv, 'inbound', left(coalesce(p_body, '[unsupported message type]'), 4000), p_sender_name, p_external_msg)
  on conflict (conversation_id, external_id) where external_id is not null do nothing
  returning id into v_msg;
  return v_msg;
end $$;

revoke execute on function public.store_oauth_credentials(uuid, bytea, bytea, timestamptz), public.get_oauth_credentials(uuid),
  public.ingest_inbound_message(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.store_oauth_credentials(uuid, bytea, bytea, timestamptz), public.get_oauth_credentials(uuid),
  public.ingest_inbound_message(uuid, text, text, text, text, text) to service_role;

revoke execute on function public.web_chat_config(uuid), public.start_web_chat(uuid, text, text, text, boolean),
  public.send_web_chat(uuid, text), public.web_chat_messages(uuid) from public;
grant execute on function public.web_chat_config(uuid), public.start_web_chat(uuid, text, text, text, boolean),
  public.send_web_chat(uuid, text), public.web_chat_messages(uuid) to anon, authenticated;

revoke execute on function public.platform_is_admin(), public.platform_overview(), public.platform_update_subscription(uuid, text, text, int) from public, anon;
grant execute on function public.platform_is_admin(), public.platform_overview(), public.platform_update_subscription(uuid, text, text, int) to authenticated;

alter publication supabase_realtime add table public.support_messages;
