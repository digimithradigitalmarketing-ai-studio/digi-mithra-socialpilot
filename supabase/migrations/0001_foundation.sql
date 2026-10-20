-- Digi Mithra Social Pilot: multi-tenant foundation
create extension if not exists pgcrypto;
create schema if not exists app_private;

-- ---------------------------------------------------------------- identity
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.plans (
  id text primary key,
  name text not null,
  price_inr integer,               -- null = custom pricing
  max_workspaces integer not null,
  max_accounts integer not null,
  max_posts_per_month integer not null,
  max_users integer not null,
  ai_credits_per_month integer not null,
  features text[] not null default '{}',
  sort_order integer not null default 0
);

insert into public.plans values
 ('starter','Starter',999,1,3,100,1,100,array['Publishing calendar','AI captions','Unified inbox','Lead CRM'],1),
 ('growth','Growth',2999,3,10,500,5,500,array['Everything in Starter','Approval workflows','Automations','Reviews','Analytics exports'],2),
 ('agency','Agency',7999,15,50,2000,20,2000,array['Everything in Growth','Client approvers','Multi-brand workspaces','API keys & webhooks'],3),
 ('enterprise','Enterprise',null,1000,1000,100000,1000,100000,array['Custom limits','SLA','SSO','Dedicated support'],4);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  kind text not null default 'business' check (kind in ('business','agency')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','editor','support','analyst','viewer','approver')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index on public.tenant_members(user_id);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  industry text,
  timezone text not null default 'Asia/Kolkata',
  brand_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, id)
);

create table public.workspace_members (
  tenant_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('manager','editor','support','analyst','viewer','approver')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade,
  foreign key (tenant_id, user_id) references public.tenant_members(tenant_id, user_id) on delete cascade
);
create index on public.workspace_members(user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workspace_id uuid,
  email text not null,
  role text not null check (role in ('admin','manager','editor','support','analyst','viewer','approver')),
  token text not null unique default encode(extensions.gen_random_bytes(18),'hex'),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

-- ---------------------------------------------------------------- billing
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','cancelled','expired')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default now() + interval '14 days',
  cancel_at_period_end boolean not null default false,
  provider text not null default 'demo',
  provider_ref text,
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id text references public.plans(id),
  amount_inr integer not null,
  status text not null default 'paid' check (status in ('paid','pending','failed','refunded')),
  provider text not null default 'demo',
  provider_ref text unique,
  created_at timestamptz not null default now()
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workspace_id uuid,
  kind text not null check (kind in ('ai_credit','post','publish')),
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);
create index on public.usage_events(tenant_id, kind, created_at);

-- ------------------------------------------------------- workspace-owned
-- Every workspace-owned table carries (tenant_id, workspace_id) with a composite FK,
-- so a row can never point at a workspace from another tenant.
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  provider text not null check (provider in ('instagram','facebook','whatsapp','google_business','youtube','linkedin','tiktok','x')),
  provider_account_id text not null,
  display_name text,
  handle text,
  status text not null default 'pending' check (status in ('pending','connected','expired','error','disconnected')),
  capabilities jsonb not null default '{"can_publish":false,"can_read_messages":false,"can_reply":false,"can_read_reviews":false}'::jsonb,
  scopes text[] not null default '{}',
  is_demo boolean not null default false,
  last_checked_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade,
  unique (workspace_id, provider, provider_account_id),
  unique (tenant_id, workspace_id, id)
);

create table app_private.oauth_credentials (
  social_account_id uuid primary key references public.social_accounts(id) on delete cascade,
  access_token_encrypted bytea,
  refresh_token_encrypted bytea,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  name text not null,
  goal text,
  status text not null default 'planned' check (status in ('planned','active','completed','paused')),
  start_date date, end_date date,
  budget_inr integer,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  tags text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  title text,
  body text not null default '',
  media_ids uuid[] not null default '{}',
  hashtags text[] not null default '{}',
  status text not null default 'draft' check (status in
    ('draft','approval_pending','approved','rejected','scheduled','publishing','published','partially_failed','failed')),
  requires_approval boolean not null default false,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade,
  unique (tenant_id, workspace_id, id)
);
create index on public.content_posts(workspace_id, scheduled_at);
create index on public.content_posts(status, scheduled_at);

create table public.post_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  post_id uuid not null, social_account_id uuid not null,
  customized_body text,
  status text not null default 'pending' check (status in ('pending','publishing','published','failed','skipped')),
  external_post_id text,
  error text,
  idempotency_key text not null default encode(extensions.gen_random_bytes(12),'hex') unique,
  published_at timestamptz,
  foreign key (tenant_id, workspace_id, post_id) references public.content_posts(tenant_id, workspace_id, id) on delete cascade,
  foreign key (tenant_id, workspace_id, social_account_id) references public.social_accounts(tenant_id, workspace_id, id) on delete cascade,
  unique (post_id, social_account_id)
);

create table public.post_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  post_id uuid not null,
  decision text not null check (decision in ('approved','rejected','changes_requested')),
  comment text,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id, post_id) references public.content_posts(tenant_id, workspace_id, id) on delete cascade
);

create table public.publish_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  post_target_id uuid not null references public.post_targets(id) on delete cascade,
  status text not null check (status in ('success','failed','uncertain')),
  error_category text,
  response jsonb,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  name text not null,
  email text, phone text, handle text,
  source text,
  tags text[] not null default '{}',
  marketing_consent boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade,
  unique (tenant_id, workspace_id, id)
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  contact_id uuid not null,
  channel text not null,
  status text not null check (status in ('opt_in','opt_out')),
  source text,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id, contact_id) references public.contacts(tenant_id, workspace_id, id) on delete cascade
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  contact_id uuid,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  channel text not null default 'instagram',
  subject text,
  status text not null default 'open' check (status in ('open','pending','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references auth.users(id) on delete set null,
  unread_count integer not null default 0,
  last_message_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id, contact_id) references public.contacts(tenant_id, workspace_id, id) on delete cascade,
  unique (tenant_id, workspace_id, id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  conversation_id uuid not null,
  direction text not null check (direction in ('inbound','outbound','note')),
  body text not null,
  sender_name text,
  is_ai_draft boolean not null default false,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id, conversation_id) references public.conversations(tenant_id, workspace_id, id) on delete cascade
);
create index on public.messages(conversation_id, created_at);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  name text not null,
  position integer not null default 0,
  color text not null default '#84cc16',
  is_won boolean not null default false,
  is_lost boolean not null default false,
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade,
  unique (tenant_id, workspace_id, id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  contact_id uuid,
  stage_id uuid,
  title text not null,
  value_inr integer not null default 0,
  source text,
  event_date date,
  assigned_to uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id, contact_id) references public.contacts(tenant_id, workspace_id, id) on delete set null (contact_id),
  foreign key (tenant_id, workspace_id, stage_id) references public.pipeline_stages(tenant_id, workspace_id, id) on delete set null (stage_id),
  unique (tenant_id, workspace_id, id)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  lead_id uuid,
  kind text not null default 'note' check (kind in ('note','call','email','meeting','task','stage_change','system')),
  body text not null,
  due_at timestamptz,
  done boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id, lead_id) references public.leads(tenant_id, workspace_id, id) on delete cascade
);

create table public.brand_knowledge (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  category text not null check (category in ('about','offerings','hours','locations','faq','tone','forbidden','disclaimer')),
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  kind text not null,
  prompt text not null,
  output text not null,
  provider text not null,
  credits integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  name text not null,
  description text,
  trigger_type text not null check (trigger_type in ('message_received','lead_created','manual')),
  status text not null default 'draft' check (status in ('draft','active','paused')),
  version integer not null default 1,
  definition jsonb not null default '{"nodes":[]}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade,
  unique (tenant_id, workspace_id, id)
);

create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  workflow_id uuid not null,
  version integer not null,
  definition jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id, workflow_id) references public.workflows(tenant_id, workspace_id, id) on delete cascade,
  unique (workflow_id, version)
);

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  workflow_id uuid not null,
  version integer not null,
  status text not null default 'running' check (status in ('running','completed','skipped','failed','waiting_approval','cancelled')),
  trigger_payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (tenant_id, workspace_id, workflow_id) references public.workflows(tenant_id, workspace_id, id) on delete cascade,
  unique (workflow_id, dedupe_key)
);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  position integer not null,
  node_type text not null,
  status text not null check (status in ('completed','skipped','failed')),
  output jsonb,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  platform text not null default 'google_business',
  author text not null,
  rating integer not null check (rating between 1 and 5),
  body text,
  reply text,
  replied_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

create table public.metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  social_account_id uuid references public.social_accounts(id) on delete cascade,
  snapshot_date date not null,
  followers integer not null default 0,
  impressions integer not null default 0,
  engagements integer not null default 0,
  is_demo boolean not null default false,
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade,
  unique (social_account_id, snapshot_date)
);

-- --------------------------------------------------------- tenant-owned ops
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications(user_id, read_at);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workspace_id uuid,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs(tenant_id, created_at desc);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null,
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  events text[] not null default '{}',
  secret_hint text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- inbound provider webhooks: written only by server code with the service role
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  provider text not null,
  event_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);
