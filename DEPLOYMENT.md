# Deployment guide

## 1. Web app (Render, Vercel or any Node host)

- Build command: `npm ci && npm run build` · Start command: `npm run start` · Node 20+.
- Health check path: `/api/health`.
- Environment variables (names only — never commit values):

| Name | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Supabase publishable key |
| `NEXT_PUBLIC_SITE_URL` | browser + server | Public URL of the app |
| `ANTHROPIC_API_KEY` | server only | Enables Claude for the AI studio / reply drafts |
| `AI_MODEL` | server only | Optional model override (default `claude-opus-5-5`) |

Never expose the Supabase service-role key to the browser.

## 2. Supabase

1. Apply `supabase/migrations/*.sql` in order (already done for the current project).
2. Auth → URL configuration: Site URL = your domain; redirect URL = `https://<domain>/auth/callback`.
3. Auth → Email: keep email confirmation on for production; set up custom SMTP so emails aren't rate limited.
4. `pg_cron` job `publish-due-posts` runs every minute. Check it with `select * from cron.job_run_details order by start_time desc limit 20;`.
5. Run `supabase/tests/rls_and_logic_test.sql` after every schema change.
6. Turn on Point-in-Time Recovery / daily backups before going live and test a restore on a non-production project.

## 3. Turning on live social publishing (next phase)

Live publishing needs credentials the browser must never see, so it belongs in a server worker:

1. Create developer apps (Meta for Instagram/Facebook/WhatsApp; Google Business Profile; LinkedIn; TikTok) and pass app review for the scopes you need.
2. Add an OAuth callback route that exchanges the code server-side, encrypts the tokens and writes them to `app_private.oauth_credentials` using the service-role key, and creates the `social_accounts` row with `is_demo = false` and real capabilities.
3. Run a worker (Render background worker / Supabase Edge Function on a schedule) that picks `post_targets` with `status = 'pending'` for non-demo accounts, refreshes tokens, calls the official API with the target's `idempotency_key`, then records `publish_attempts` and updates status. In `app_private.publish_post` replace the "adapter not configured" branch to leave those targets `pending` for the worker.
4. Provider webhooks (incoming DMs, comments, reviews): verify the signature, store in `webhook_events` (unique per provider + event id → replay-safe), then insert `messages` — automations fire automatically.

## 4. Payments (Razorpay)

1. Create plans in Razorpay matching `public.plans`.
2. Server route creates a subscription/order; the webhook route verifies `X-Razorpay-Signature` with `RAZORPAY_WEBHOOK_SECRET`, deduplicates on the event id, and updates `subscriptions` / inserts `invoices` with the service role.
3. Set `app_private.settings.billing_demo_mode` to `'false'` to disable demo plan switching.

## 5. Launch checklist

- [ ] Email confirmation, password reset and invitation flows tested on the live domain
- [ ] Two tenants verified isolated (run the test script)
- [ ] Backups enabled and a restore tested
- [ ] Privacy policy, terms and provider terms reviewed; GST registration
- [ ] Error monitoring (e.g. Sentry) and uptime check on `/api/health`

## 6. Going live at socialpilot.digimithra.co.in (Render + GoDaddy)

Social Pilot is a **separate** Render service. Do not change the `@`, `www`, `app`, MX, TXT or DKIM records.

1. Push this repo to GitHub (e.g. `digimithradigitalmarketing-ai-studio/digimithra-social-pilot`, private) and give Render's GitHub app access to it.
2. Render → New → Blueprint (uses `render.yaml`) or New → Web Service with: runtime Node, build `npm ci && npm run build`, start `npm run start`, health check `/api/health`, region Singapore.
3. Confirm the temporary `https://<service>.onrender.com` works.
4. Render → Settings → Custom Domains → add `socialpilot.digimithra.co.in`.
5. GoDaddy → DNS → Add New Record: Type `CNAME`, Name `socialpilot`, Value = your exact `<service>.onrender.com`, TTL default. Then click Verify in Render (HTTPS is issued automatically).

### URLs to configure for the new domain

| Where | Setting | Value |
| --- | --- | --- |
| Render env | `NEXT_PUBLIC_SITE_URL` | `https://socialpilot.digimithra.co.in` |
| Supabase → Authentication → URL Configuration | Site URL | `https://socialpilot.digimithra.co.in` |
| Supabase → Authentication → URL Configuration | Redirect URLs | `https://socialpilot.digimithra.co.in/auth/callback`, plus your `*.onrender.com/auth/callback` while testing |
| Meta app → Facebook Login for Business → Valid OAuth Redirect URIs | | `https://socialpilot.digimithra.co.in/api/oauth/meta/callback` |
| Meta app → Webhooks (Page, Instagram, WhatsApp Business Account) | Callback URL / Verify token | `https://socialpilot.digimithra.co.in/api/webhooks/meta` / your `META_WEBHOOK_VERIFY_TOKEN` |
| Google Cloud OAuth client | Authorized redirect URI | Not used yet — Google Business Profile / Gmail OAuth will be added after Google approves API access |
| Your website | Chat widget | `<script src="https://socialpilot.digimithra.co.in/widget.js" data-key="…" async></script>` (copy from Connections → Website chat) |

Changing the Site URL in Supabase only affects this Supabase project (`siyxkombexmowlggxlrb`), which belongs to Social Pilot alone; the existing app's settings are untouched.

Note: `NEXT_PUBLIC_*` values are baked in at build time — after changing them on Render, trigger a new deploy.
