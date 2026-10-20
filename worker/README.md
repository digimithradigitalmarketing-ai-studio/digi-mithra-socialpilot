# Social Pilot worker

BullMQ worker that publishes queued posts to official provider APIs (Facebook Pages, Instagram Graph API) and checks stored token health.

How it fits: when a post is due, the database (`app_private.publish_post`, run by pg_cron) publishes demo targets itself and leaves **live** targets as `pending`. This worker scans for them every minute, publishes with the encrypted account token, and reports each result through `worker_record_publish`, which updates the post status and notifies the team.

## Environment

| Variable | Purpose |
| --- | --- |
| `REDIS_URL` | Redis for BullMQ (e.g. Render Key Value / Upstash) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only) |
| `TOKEN_ENCRYPTION_KEY` | Same 32-byte base64 key as the web app |
| `META_APP_ID`, `META_APP_SECRET` | Meta app credentials (appsecret_proof, token checks) |
| `META_GRAPH_VERSION` | Optional, default `v23.0` |

## Run

```bash
cd worker
npm install
npm start
```

## Deploy on Render

1. New → Key Value (Redis) instance; copy its internal URL into `REDIS_URL`.
2. New → Background Worker from this repo, root directory `worker`, build `npm install`, start `npm start`.
3. Add the environment variables above.

## Behaviour

- Jobs use `jobId = publish-<target>` so a target is never queued twice; only `pending` live targets are processed.
- Retries: 3 attempts with exponential backoff for transient Graph errors.
- A POST that times out is **not** retried (Meta may have published it); it is recorded as "uncertain" for a human to check, then retry from the Posts page.
- Instagram requires an image or video; text-only posts fail with `media_required`.
- Other providers are recorded as `adapter_not_implemented` until their APIs are approved and added.
