-- Content studio: inspiration sources, weekly ideas, saved items, competitors,
-- AI chat and AI Content Agent weekly plans.

create table public.content_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  kind text not null check (kind in ('link','file','text','profile')),
  platform text,                -- instagram, youtube, website, ...
  format text,                  -- short_form, youtube, threads, article, ...
  url text,
  title text,
  description text,
  thumbnail_url text,
  text_content text,
  storage_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);
create index on public.content_sources(workspace_id, created_at desc);

create table public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  title text not null,
  description text,
  angle text not null default 'Grow' check (angle in ('Grow','Inspire','Sell','Value','Educate','Entertain')),
  origin text not null default 'AI idea',
  format text,
  week_start date not null default date_trunc('week', now())::date,
  used boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);
create index on public.content_ideas(workspace_id, week_start);

create table public.saved_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  kind text not null check (kind in ('idea','hook','caption','script','post','source','chat','other')),
  title text not null,
  content text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  name text not null,
  platform text not null default 'instagram',
  handle text,
  url text,
  followers integer,
  posts_per_week numeric,
  avg_engagement_rate numeric,
  sample_posts text,
  notes text,
  analysis text,
  analyzed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

create table public.content_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  start_date date not null,
  template text not null default 'custom',
  schedule jsonb not null default '{}'::jsonb,   -- {"mon":["instagram","threads"], ...}
  settings jsonb not null default '{}'::jsonb,   -- topics, tone, language, post time
  status text not null default 'generated' check (status in ('draft','generated','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade,
  unique (tenant_id, workspace_id, id)
);

alter table public.content_posts add column if not exists plan_id uuid references public.content_plans(id) on delete set null;
alter table public.content_posts add column if not exists format text;

-- private per-user AI chat threads inside a workspace
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index on public.chat_messages(thread_id, created_at);

alter table public.content_sources enable row level security;
alter table public.content_ideas enable row level security;
alter table public.saved_items enable row level security;
alter table public.competitors enable row level security;
alter table public.content_plans enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

do $$
declare r record;
begin
  for r in select * from (values
    ('content_sources', array['admin','manager','editor']),
    ('content_ideas',   array['admin','manager','editor']),
    ('saved_items',     array['admin','manager','editor','support']),
    ('competitors',     array['admin','manager','editor']),
    ('content_plans',   array['admin','manager','editor'])
  ) as v(tbl, writers) loop
    execute format('create policy %I on public.%I for select to authenticated using (app_private.ws_role(tenant_id, workspace_id) is not null)', r.tbl || '_read', r.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (app_private.ws_role(tenant_id, workspace_id) = any (%L::text[]))', r.tbl || '_insert', r.tbl, r.writers);
    execute format('create policy %I on public.%I for update to authenticated using (app_private.ws_role(tenant_id, workspace_id) = any (%L::text[])) with check (app_private.ws_role(tenant_id, workspace_id) = any (%L::text[]))', r.tbl || '_update', r.tbl, r.writers, r.writers);
    execute format('create policy %I on public.%I for delete to authenticated using (app_private.ws_role(tenant_id, workspace_id) = any (%L::text[]))', r.tbl || '_delete', r.tbl, r.writers);
    execute format('create trigger trg_created_by before insert on public.%I for each row execute function app_private.set_created_by()', r.tbl);
  end loop;
end $$;

create policy chat_threads_own on public.chat_threads for all to authenticated
  using (user_id = (select auth.uid()) and app_private.ws_role(tenant_id, workspace_id) is not null)
  with check (user_id = (select auth.uid()) and app_private.ws_role(tenant_id, workspace_id) is not null);

create policy chat_messages_own on public.chat_messages for all to authenticated
  using (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = (select auth.uid())))
  with check (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = (select auth.uid())));
