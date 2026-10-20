# Digi Mithra Social Pilot

All-in-one social media automation SaaS — publishing, approvals, unified inbox, brand-aware AI, automations, CRM, analytics and subscriptions — for businesses (e.g. Dhanus Gold Fitness) and agencies (e.g. Bloom All Production). Responsive web app that installs on phones as a PWA.

## Stack

| Layer | Implementation |
| --- | --- |
| Web + mobile UI | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · installable PWA |
| Auth & database | Supabase Auth + Postgres with Row Level Security on every table |
| Business rules | Postgres functions/triggers: quotas, post status machine, approvals, audit log, automation engine |
| Scheduler | `pg_cron` publishes due posts every minute (`app_private.process_due_posts`) |
| Realtime | Supabase Realtime for notifications, inbox messages and conversations |
| Files | Private Supabase Storage bucket `media`, path `tenant/workspace/file`, signed URLs |
| AI | Anthropic Claude via `@anthropic-ai/sdk` (server route); built-in template engine when no key |

## Modules

- **Dashboard** – KPIs, account health, upcoming posts, automation runs, plan usage, activity feed.
- **Social hub** – composer (per-platform limits, AI assist, media, approvals), posts, calendar, approvals, media library, connected accounts with capability matrix.
- **Communication** – realtime unified inbox (AI reply drafts need human approval, consent & WhatsApp 24-hour window enforced), reviews.
- **AI center** – AI studio (captions, hooks, hashtags, campaigns, translation, FAQ, content plans, review replies) grounded in brand knowledge.
- **Marketing** – CRM pipeline (drag & drop), contacts (CSV import/export), campaigns, automation builder with versioning, test runs and step logs.
- **Reports** – analytics with CSV export.
- **Organization** – workspaces/brands, team invitations & roles, plans & billing, API keys (hashed), webhooks, audit log, data export, organization deletion.
- **Modern extras** – ⌘K command palette, realtime notification bell, mobile bottom navigation, PWA install + offline page, toasts.

## Roles

`owner`, `admin` (all workspaces) · per workspace: `manager`, `editor`, `support`, `approver`, `analyst`, `viewer`. Permissions are enforced in the database (RLS + RPC checks), not just hidden in the UI.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm run dev                  # http://localhost:3000
```

Checks: `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Supabase setup

The migrations in `supabase/migrations` are already applied to project `siyxkombexmowlggxlrb`. For a new project run them in order in the SQL editor (or `supabase db push`). Then in **Authentication → URL configuration** set the Site URL to your deployed URL and add `https://<your-domain>/auth/callback` to the redirect URLs.

`supabase/tests/rls_and_logic_test.sql` checks tenant isolation, the post status guard, publishing and the automation engine (it rolls itself back).

## What is real vs demo

Honest labelling is built in — anything simulated shows a **Demo** badge.

- **Real:** auth, tenancy, roles, RLS, posts/approvals/scheduling state machine, cron publisher, inbox, CRM, automations, AI (with an API key), quotas, audit, storage.
- **Demo until you get provider approvals:** social accounts added with "Add demo account" publish through a simulated adapter and get sample metrics. Official Meta/Google/LinkedIn/TikTok connections need your own developer apps, app review and a token-holding worker — see `DEPLOYMENT.md`.
- **Billing:** demo billing mode switches plans without payment (`app_private.settings.billing_demo_mode`). Razorpay checkout + verified webhooks are the next step.
