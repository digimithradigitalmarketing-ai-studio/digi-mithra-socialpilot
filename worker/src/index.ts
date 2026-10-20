// Digi Mithra Social Pilot — background worker (BullMQ + Redis).
// Publishes queued posts to official provider APIs and checks token health.
import { createDecipheriv, createHmac } from "node:crypto";
import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { createClient } from "@supabase/supabase-js";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

const connection = new IORedis(env("REDIS_URL"), { maxRetriesPerRequest: null });
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const KEY = Buffer.from(env("TOKEN_ENCRYPTION_KEY"), "base64");
if (KEY.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
const APP_SECRET = env("META_APP_SECRET");
const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;

// Same format as the web app: iv(12) | tag(16) | ciphertext, stored as bytea.
function decryptToken(bytea: string) {
  const blob = Buffer.from(bytea.startsWith("\\x") ? bytea.slice(2) : bytea, "hex");
  const d = createDecipheriv("aes-256-gcm", KEY, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString("utf8");
}

class GraphError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public uncertain = false,
  ) {
    super(message);
  }
}

async function graph<T>(path: string, token: string, method: "GET" | "POST" = "GET", params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  url.searchParams.set("appsecret_proof", createHmac("sha256", APP_SECRET).update(token).digest("hex"));
  let res: Response;
  try {
    res = await fetch(url, { method, signal: AbortSignal.timeout(30000) });
  } catch (e) {
    // a POST that timed out may have succeeded at Meta: never blindly retry it
    throw new GraphError(`Network error: ${e instanceof Error ? e.message : "unknown"}`, method === "GET", method === "POST");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; is_transient?: boolean } };
  if (!res.ok || json.error) {
    const err = json.error ?? {};
    throw new GraphError(`Meta API: ${err.message ?? res.statusText} (code ${err.code ?? res.status})`, Boolean(err.is_transient) || res.status >= 500);
  }
  return json;
}

interface TargetRow {
  id: string;
  status: string;
  customized_body: string | null;
  content_posts: { id: string; body: string; hashtags: string[]; media_ids: string[]; status: string } | null;
  social_accounts: { id: string; provider: string; provider_account_id: string; is_demo: boolean; status: string } | null;
}

async function record(targetId: string, ok: boolean, externalId: string | null, error: string | null, category: string | null, response: Record<string, unknown>) {
  const { error: e } = await db.rpc("worker_record_publish", {
    p_target: targetId,
    p_ok: ok,
    p_external_id: externalId,
    p_error: error,
    p_category: category,
    p_response: response,
  });
  if (e) console.error(`record ${targetId} failed:`, e.message);
}

async function mediaUrl(mediaIds: string[]) {
  if (!mediaIds?.length) return null;
  const { data } = await db.from("media_assets").select("storage_path,mime_type").eq("id", mediaIds[0]).maybeSingle();
  if (!data) return null;
  const { data: signed } = await db.storage.from("media").createSignedUrl(data.storage_path, 60 * 60);
  return signed?.signedUrl ? { url: signed.signedUrl, video: (data.mime_type ?? "").startsWith("video/") } : null;
}

async function publish(job: Job<{ targetId: string }>) {
  const { targetId } = job.data;
  const { data, error } = await db
    .from("post_targets")
    .select("id,status,customized_body,content_posts(id,body,hashtags,media_ids,status),social_accounts(id,provider,provider_account_id,is_demo,status)")
    .eq("id", targetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const t = data as unknown as TargetRow | null;
  if (!t || !t.content_posts || !t.social_accounts) return "missing";
  if (t.status !== "pending" || t.social_accounts.is_demo) return "skipped"; // idempotency: only pending live targets

  const acct = t.social_accounts;
  const post = t.content_posts;
  const caption = [t.customized_body ?? post.body, (post.hashtags ?? []).map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n\n");

  const { data: creds } = await db.rpc("get_oauth_credentials", { p_account: acct.id });
  const row = Array.isArray(creds) ? creds[0] : creds;
  if (!row?.access_token_encrypted) {
    await record(t.id, false, null, "No stored credentials — reconnect the account.", "credentials_missing", {});
    return "failed";
  }
  const token = decryptToken(row.access_token_encrypted);
  // mark as in-flight so the scanner doesn't enqueue it again
  await db.from("post_targets").update({ status: "publishing" }).eq("id", t.id).eq("status", "pending");

  try {
    const media = await mediaUrl(post.media_ids);
    if (acct.provider === "facebook") {
      const res: { id?: string; post_id?: string } =
        media && !media.video
          ? await graph(`/${acct.provider_account_id}/photos`, token, "POST", { url: media.url, caption })
          : await graph(`/${acct.provider_account_id}/feed`, token, "POST", { message: caption });
      const ext = res.post_id ?? res.id ?? null;
      await record(t.id, true, ext, null, null, { adapter: "facebook_page", id: ext });
      return "published";
    }
    if (acct.provider === "instagram") {
      if (!media) {
        await record(t.id, false, null, "Instagram requires an image or video. Attach media and retry.", "media_required", {});
        return "failed";
      }
      const container = await graph<{ id: string }>(
        `/${acct.provider_account_id}/media`,
        token,
        "POST",
        media.video ? { media_type: "REELS", video_url: media.url, caption } : { image_url: media.url, caption },
      );
      // wait for the container to finish processing
      for (let i = 0; i < 30; i++) {
        const s = await graph<{ status_code?: string }>(`/${container.id}`, token, "GET", { fields: "status_code" });
        if (s.status_code === "FINISHED") break;
        if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new GraphError(`Media container ${s.status_code}`, false);
        await new Promise((r) => setTimeout(r, 5000));
      }
      const done = await graph<{ id: string }>(`/${acct.provider_account_id}/media_publish`, token, "POST", { creation_id: container.id });
      await record(t.id, true, done.id, null, null, { adapter: "instagram_graph", id: done.id });
      return "published";
    }
    await record(t.id, false, null, `Publishing to ${acct.provider} is not implemented yet.`, "adapter_not_implemented", {});
    return "failed";
  } catch (e) {
    const err = e instanceof GraphError ? e : new GraphError(e instanceof Error ? e.message : "unknown", false);
    if (err.uncertain) {
      // the provider may have published: leave for a human to verify instead of retrying blindly
      await record(t.id, false, null, `Uncertain result — check the account before retrying. ${err.message}`, "uncertain", {});
      return "uncertain";
    }
    if (err.retryable && job.attemptsMade + 1 < (job.opts.attempts ?? 1)) {
      await db.from("post_targets").update({ status: "pending" }).eq("id", t.id).eq("status", "publishing");
      throw err; // BullMQ retries with backoff
    }
    await record(t.id, false, null, err.message, "provider_error", {});
    return "failed";
  }
}

const queue = new Queue("social-pilot", { connection });

async function scan() {
  const { data, error } = await db
    .from("post_targets")
    .select("id,social_accounts!inner(is_demo),content_posts!inner(status)")
    .eq("status", "pending")
    .eq("social_accounts.is_demo", false)
    .eq("content_posts.status", "publishing")
    .limit(50);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    await queue.add("publish", { targetId: row.id }, { jobId: `publish-${row.id}`, attempts: 3, backoff: { type: "exponential", delay: 30000 }, removeOnComplete: 1000, removeOnFail: 1000 });
  }
  return data?.length ?? 0;
}

async function tokenHealth() {
  const { data: accounts } = await db.from("social_accounts").select("id,provider").eq("is_demo", false).eq("status", "connected").in("provider", ["facebook", "instagram", "whatsapp"]);
  const appToken = `${env("META_APP_ID")}|${APP_SECRET}`;
  let expired = 0;
  for (const a of accounts ?? []) {
    try {
      const { data: creds } = await db.rpc("get_oauth_credentials", { p_account: a.id });
      const row = Array.isArray(creds) ? creds[0] : creds;
      if (!row?.access_token_encrypted) continue;
      const token = decryptToken(row.access_token_encrypted);
      const url = new URL(`${GRAPH}/debug_token`);
      url.searchParams.set("input_token", token);
      url.searchParams.set("access_token", appToken);
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const json = (await res.json()) as { data?: { is_valid?: boolean } };
      const valid = Boolean(json.data?.is_valid);
      await db.from("social_accounts").update({ status: valid ? "connected" : "expired", last_checked_at: new Date().toISOString() }).eq("id", a.id);
      if (!valid) expired++;
    } catch (e) {
      console.error(`token check ${a.id} failed:`, e instanceof Error ? e.message : "unknown");
    }
  }
  return expired;
}

new Worker(
  "social-pilot",
  async (job) => {
    if (job.name === "scan") return scan();
    if (job.name === "token-health") return tokenHealth();
    if (job.name === "publish") return publish(job as Job<{ targetId: string }>);
    return null;
  },
  { connection, concurrency: 4 },
).on("failed", (job, err) => console.error(`job ${job?.name} ${job?.id} failed:`, err.message));

await queue.upsertJobScheduler("scan-every-minute", { every: 60_000 }, { name: "scan" });
await queue.upsertJobScheduler("token-health-6h", { every: 6 * 60 * 60_000 }, { name: "token-health" });
console.log("Social Pilot worker started");
