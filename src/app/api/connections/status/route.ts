import { createClient } from "@/lib/supabase/server";
import { metaConfigured, siteUrl } from "@/lib/server/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reports which integrations are configured on the server. Booleans only — never values.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const has = (k: string) => Boolean(process.env[k]);
  const google = has("GOOGLE_CLIENT_ID") && has("GOOGLE_CLIENT_SECRET");
  return Response.json({
    meta: metaConfigured() && has("SUPABASE_SERVICE_ROLE_KEY") && has("TOKEN_ENCRYPTION_KEY"),
    meta_app: metaConfigured(),
    meta_webhook: has("META_WEBHOOK_VERIFY_TOKEN") && has("META_APP_SECRET"),
    whatsapp: metaConfigured() && has("SUPABASE_SERVICE_ROLE_KEY") && has("TOKEN_ENCRYPTION_KEY"),
    google,
    gmail: google && process.env.GMAIL_ENABLED === "true",
    resend: has("RESEND_API_KEY"),
    encryption: has("TOKEN_ENCRYPTION_KEY"),
    service_role: has("SUPABASE_SERVICE_ROLE_KEY"),
    redis: has("REDIS_URL"),
    ai: has("ANTHROPIC_API_KEY") || has("GEMINI_API_KEY"),
    webhook_url: `${siteUrl(request)}/api/webhooks/meta`,
    oauth_redirect_url: `${siteUrl(request)}/api/oauth/meta/callback`,
  });
}
