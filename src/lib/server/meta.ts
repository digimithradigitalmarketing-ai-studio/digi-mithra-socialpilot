import "server-only";
import { createHmac } from "node:crypto";
import { IntegrationError } from "@/lib/server/errors";

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type MetaProduct = "facebook" | "instagram" | "whatsapp";

// Permissions per Meta's Facebook Login for Business / Graph API documentation.
export const META_SCOPES: Record<MetaProduct, string[]> = {
  facebook: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_manage_metadata", "pages_messaging"],
  instagram: [
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_messages",
    "instagram_manage_comments",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_metadata",
    "business_management",
  ],
  whatsapp: ["whatsapp_business_management", "whatsapp_business_messaging", "business_management"],
};

export function metaConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function requireMetaConfig() {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) throw new IntegrationError(503, "Meta integration not configured: set META_APP_ID and META_APP_SECRET");
  return { appId, secret };
}

export function siteUrl(request?: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL || (request ? new URL(request.url).origin : "")).replace(/\/$/, "");
}

/** Capabilities derived only from permissions Meta actually granted. */
export function capabilitiesFor(provider: MetaProduct, granted: string[]) {
  const g = new Set(granted);
  if (provider === "facebook")
    return {
      can_publish: g.has("pages_manage_posts"),
      can_read_messages: g.has("pages_messaging"),
      can_reply: g.has("pages_messaging"),
      can_read_reviews: g.has("pages_read_user_content"),
    };
  if (provider === "instagram")
    return {
      can_publish: g.has("instagram_content_publish"),
      can_read_messages: g.has("instagram_manage_messages"),
      can_reply: g.has("instagram_manage_messages"),
      can_read_reviews: false,
    };
  return {
    can_publish: false,
    can_read_messages: g.has("whatsapp_business_messaging"),
    can_reply: g.has("whatsapp_business_messaging"),
    can_read_reviews: false,
  };
}

export function appSecretProof(token: string) {
  const { secret } = requireMetaConfig();
  return createHmac("sha256", secret).update(token).digest("hex");
}

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
}

/** Graph API call with timeout, appsecret_proof and readable errors. Never includes tokens in errors. */
export async function graph<T>(
  path: string,
  opts: { token?: string; method?: "GET" | "POST" | "DELETE"; params?: Record<string, string>; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH}${path.startsWith("/") ? "" : "/"}${path}`);
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);
  if (opts.token) {
    url.searchParams.set("access_token", opts.token);
    url.searchParams.set("appsecret_proof", appSecretProof(opts.token));
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.body ? { "content-type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
      cache: "no-store",
    });
  } catch (e) {
    throw new IntegrationError(504, `Meta API unreachable (${e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network"})`);
  }
  const json = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
  if (!res.ok || json.error) {
    const err = json.error ?? {};
    throw new IntegrationError(res.status >= 400 ? res.status : 502, `Meta API: ${err.message ?? res.statusText}${err.code ? ` (code ${err.code}${err.fbtrace_id ? `, trace ${err.fbtrace_id}` : ""})` : ""}`);
  }
  return json;
}
