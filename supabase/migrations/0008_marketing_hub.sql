-- Marketing hub: tasks, segments, landing pages + public lead forms,
-- attribution fields, and marketing email campaigns.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  title text not null,
  description text,
  due_at timestamptz,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','done')),
  assigned_to uuid references auth.users(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);
create index on public.tasks(workspace_id, status, due_at);

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  name text not null,
  description text,
  -- {"tags_any":[...], "sources":[...], "consent":"any"|"opted_in", "has_email":bool, "created_within_days":int}
  rules jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

create table public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  title text not null,
  headline text not null default '',
  subheadline text,
  body text,
  bullets text[] not null default '{}',
  cta_label text not null default 'Send enquiry',
  hero_image_url text,
  accent text not null default '#2f6bf2',
  form_fields jsonb not null default '[{"name":"name","label":"Full name","type":"text","required":true},{"name":"phone","label":"Phone","type":"tel","required":true},{"name":"email","label":"Email","type":"email","required":false},{"name":"message","label":"Message","type":"textarea","required":false}]'::jsonb,
  success_message text not null default 'Thank you! Our team will contact you shortly.',
  consent_text text not null default 'I agree to be contacted about my enquiry.',
  campaign_id uuid references public.campaigns(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  views integer not null default 0,
  submissions integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

alter table public.contacts add column if not exists utm_source text;
alter table public.contacts add column if not exists utm_medium text;
alter table public.contacts add column if not exists utm_campaign text;
alter table public.leads add column if not exists landing_page_id uuid references public.landing_pages(id) on delete set null;
alter table public.leads add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
alter table public.leads add column if not exists utm_source text;
alter table public.leads add column if not exists utm_medium text;
alter table public.leads add column if not exists utm_campaign text;

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  landing_page_id uuid not null references public.landing_pages(id) on delete cascade,
  data jsonb not null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  utm jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);
create index on public.form_submissions(landing_page_id, created_at desc);

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workspace_id uuid not null,
  name text not null,
  subject text not null default '',
  preheader text,
  body text not null default '',
  segment_id uuid references public.segments(id) on delete set null,
  from_name text,
  reply_to text,
  status text not null default 'draft' check (status in ('draft','sending','sent','failed')),
  provider text,
  stats jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade
);

create table public.email_sends (
  id uuid primary key default gen_random_uuid(),   -- also the unsubscribe token
  tenant_id uuid not null, workspace_id uuid not null,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  email text not null,
  status text not null check (status in ('sent','simulated','failed','skipped')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id) on delete cascade,
  unique (campaign_id, email)
);

create trigger trg_updated before update on public.landing_pages for each row execute function app_private.set_updated_at();
create trigger trg_updated before update on public.email_campaigns for each row execute function app_private.set_updated_at();

do $$
declare r record;
begin
  for r in select * from (values
    ('tasks',            array['admin','manager','editor','support'], true),
    ('segments',         array['admin','manager','editor'], true),
    ('landing_pages',    array['admin','manager','editor'], true),
    ('form_submissions', array[]::text[], false),
    ('email_campaigns',  array['admin','manager','editor'], true),
    ('email_sends',      array[]::text[], false)
  ) as v(tbl, writers, has_creator) loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (app_private.ws_role(tenant_id, workspace_id) is not null)', r.tbl || '_read', r.tbl);
    if cardinality(r.writers) > 0 then
      execute format('create policy %I on public.%I for insert to authenticated with check (app_private.ws_role(tenant_id, workspace_id) = any (%L::text[]))', r.tbl || '_insert', r.tbl, r.writers);
      execute format('create policy %I on public.%I for update to authenticated using (app_private.ws_role(tenant_id, workspace_id) = any (%L::text[])) with check (app_private.ws_role(tenant_id, workspace_id) = any (%L::text[]))', r.tbl || '_update', r.tbl, r.writers, r.writers);
      execute format('create policy %I on public.%I for delete to authenticated using (app_private.ws_role(tenant_id, workspace_id) = any (%L::text[]))', r.tbl || '_delete', r.tbl, r.writers);
    end if;
    if r.has_creator then
      execute format('create trigger trg_created_by before insert on public.%I for each row execute function app_private.set_created_by()', r.tbl);
    end if;
  end loop;
end $$;

-- contacts matching a segment (RLS applies: security invoker)
create or replace function public.segment_contacts(p_segment uuid)
returns setof public.contacts language sql stable security invoker set search_path = '' as $$
  select c.* from public.contacts c
  join public.segments s on s.id = p_segment and s.workspace_id = c.workspace_id
  where (coalesce(jsonb_array_length(s.rules->'tags_any'), 0) = 0
         or c.tags && array(select jsonb_array_elements_text(s.rules->'tags_any')))
    and (coalesce(jsonb_array_length(s.rules->'sources'), 0) = 0
         or c.source = any (array(select jsonb_array_elements_text(s.rules->'sources'))))
    and (coalesce(s.rules->>'consent', 'any') <> 'opted_in' or c.marketing_consent)
    and (not coalesce((s.rules->>'has_email')::boolean, false) or c.email is not null)
    and (s.rules->>'created_within_days' is null
         or c.created_at > now() - make_interval(days => (s.rules->>'created_within_days')::int))
  order by c.created_at desc;
$$;
grant execute on function public.segment_contacts(uuid) to authenticated;

-- ---------------------------------------------------------------- public landing pages (anon)
create or replace function public.get_landing_page(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug', lp.slug, 'title', lp.title, 'headline', lp.headline, 'subheadline', lp.subheadline,
    'body', lp.body, 'bullets', lp.bullets, 'cta_label', lp.cta_label, 'hero_image_url', lp.hero_image_url,
    'accent', lp.accent, 'form_fields', lp.form_fields, 'success_message', lp.success_message,
    'consent_text', lp.consent_text, 'business', w.name)
  from public.landing_pages lp join public.workspaces w on w.id = lp.workspace_id
  where lp.slug = lower(p_slug) and lp.status = 'published';
$$;

create or replace function public.record_landing_view(p_slug text)
returns void language sql security definer set search_path = '' as $$
  update public.landing_pages set views = views + 1 where slug = lower(p_slug) and status = 'published';
$$;

create or replace function public.submit_landing_form(p_slug text, p_data jsonb, p_utm jsonb default '{}'::jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  lp public.landing_pages;
  v_name text; v_email text; v_phone text; v_msg text;
  v_contact uuid; v_lead uuid; v_stage uuid;
  f jsonb;
begin
  select * into lp from public.landing_pages where slug = lower(p_slug) and status = 'published';
  if not found then raise exception 'This page is not available'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or length(p_data::text) > 8000 then
    raise exception 'Invalid form data';
  end if;
  -- required fields
  for f in select * from jsonb_array_elements(lp.form_fields) loop
    if coalesce((f->>'required')::boolean, false) and coalesce(trim(p_data->>(f->>'name')), '') = '' then
      raise exception '% is required', f->>'label';
    end if;
  end loop;
  if not coalesce((p_data->>'consent')::boolean, false) then raise exception 'Please accept the consent checkbox'; end if;
  -- basic abuse limit: max 30 submissions per page per 10 minutes
  if (select count(*) from public.form_submissions where landing_page_id = lp.id and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Too many submissions, please try again later';
  end if;

  v_name := left(coalesce(nullif(trim(p_data->>'name'), ''), 'Website visitor'), 120);
  v_email := lower(nullif(trim(p_data->>'email'), ''));
  v_phone := left(nullif(regexp_replace(coalesce(p_data->>'phone', ''), '[^0-9+]', '', 'g'), ''), 20);
  v_msg := left(nullif(trim(p_data->>'message'), ''), 2000);
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;

  select id into v_contact from public.contacts
   where workspace_id = lp.workspace_id and ((v_email is not null and lower(email) = v_email) or (v_phone is not null and phone = v_phone))
   limit 1;
  if v_contact is null then
    insert into public.contacts (tenant_id, workspace_id, name, email, phone, source, marketing_consent, utm_source, utm_medium, utm_campaign, notes)
    values (lp.tenant_id, lp.workspace_id, v_name, v_email, v_phone, 'landing_page', true,
            left(p_utm->>'utm_source', 100), left(p_utm->>'utm_medium', 100), left(p_utm->>'utm_campaign', 100), v_msg)
    returning id into v_contact;
  else
    update public.contacts set marketing_consent = true where id = v_contact;
  end if;
  insert into public.consent_records (tenant_id, workspace_id, contact_id, channel, status, source)
  values (lp.tenant_id, lp.workspace_id, v_contact, 'email', 'opt_in', 'landing_page:' || lp.slug);

  select id into v_stage from public.pipeline_stages where workspace_id = lp.workspace_id order by position limit 1;
  insert into public.leads (tenant_id, workspace_id, contact_id, stage_id, title, source, notes, landing_page_id, campaign_id, utm_source, utm_medium, utm_campaign)
  values (lp.tenant_id, lp.workspace_id, v_contact, v_stage, left(lp.title || ': ' || v_name, 200), 'landing_page', v_msg, lp.id, lp.campaign_id,
          left(p_utm->>'utm_source', 100), left(p_utm->>'utm_medium', 100), left(p_utm->>'utm_campaign', 100))
  returning id into v_lead;

  insert into public.form_submissions (tenant_id, workspace_id, landing_page_id, data, contact_id, lead_id, utm)
  values (lp.tenant_id, lp.workspace_id, lp.id, p_data, v_contact, v_lead, coalesce(p_utm, '{}'::jsonb));
  update public.landing_pages set submissions = submissions + 1 where id = lp.id;
  perform app_private.notify_workspace(lp.tenant_id, lp.workspace_id, 'New form submission: ' || v_name,
    lp.title, '/app/crm', array['admin','manager','editor','support']);
  return lp.success_message;
end $$;

-- unsubscribe via the email_sends id embedded in each email
create or replace function public.unsubscribe_email(p_token uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare s public.email_sends;
begin
  select * into s from public.email_sends where id = p_token;
  if not found then raise exception 'Link is invalid or expired'; end if;
  if s.contact_id is not null then
    update public.contacts set marketing_consent = false where id = s.contact_id;
    insert into public.consent_records (tenant_id, workspace_id, contact_id, channel, status, source)
    values (s.tenant_id, s.workspace_id, s.contact_id, 'email', 'opt_out', 'unsubscribe_link');
  end if;
  return (select name from public.workspaces where id = s.workspace_id);
end $$;

revoke execute on function public.get_landing_page(text), public.record_landing_view(text),
  public.submit_landing_form(text, jsonb, jsonb), public.unsubscribe_email(uuid) from public;
grant execute on function public.get_landing_page(text), public.record_landing_view(text),
  public.submit_landing_form(text, jsonb, jsonb), public.unsubscribe_email(uuid) to anon, authenticated;
