import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/admin";
import { decrypt, fromBytea } from "@/lib/server/crypto";
import { IntegrationError, jsonError } from "@/lib/server/errors";
import { graph } from "@/lib/server/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
const SENDER_ROLES = ["manager", "editor", "support"];

// Delivers an already-recorded outbound inbox reply through the official provider API.
export async function POST(request: Request) {
  try {
    const { messageId } = ((await request.json().catch(() => ({}))) as { messageId?: string }) ?? {};
    if (!messageId) throw new IntegrationError(400, "messageId is required");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new IntegrationError(401, "Not signed in");

    const { data: msg } = await supabase
      .from("messages")
      .select("id,body,direction,is_ai_draft,external_id,conversation_id,tenant_id,workspace_id")
      .eq("id", messageId)
      .maybeSingle();
    if (!msg) throw new IntegrationError(404, "Message not found");
    if (msg.direction !== "outbound" || msg.is_ai_draft) throw new IntegrationError(400, "Only sent replies can be delivered");
    if (msg.external_id) return Response.json({ delivered: true, already: true });

    const [{ data: tm }, { data: wm }] = await Promise.all([
      supabase.from("tenant_members").select("role").eq("tenant_id", msg.tenant_id).eq("user_id", user.id).maybeSingle(),
      supabase.from("workspace_members").select("role").eq("workspace_id", msg.workspace_id).eq("user_id", user.id).maybeSingle(),
    ]);
    if (!((tm && ["owner", "admin"].includes(tm.role)) || (wm && SENDER_ROLES.includes(wm.role)))) throw new IntegrationError(403, "You can't send messages in this workspace");

    const { data: conv } = await supabase
      .from("conversations")
      .select("id,channel,external_id,social_account_id,is_demo")
      .eq("id", msg.conversation_id)
      .single();
    if (!conv || conv.is_demo || conv.channel === "website" || !conv.social_account_id || !conv.external_id) {
      return Response.json({ delivered: false, reason: conv?.channel === "website" ? "Website chat replies are shown in the visitor's chat window" : "Not a live provider conversation" });
    }
    const { data: account } = await supabase.from("social_accounts").select("id,provider,provider_account_id,is_demo,status,capabilities").eq("id", conv.social_account_id).single();
    if (!account || account.is_demo) return Response.json({ delivered: false, reason: "Demo account" });
    if (account.status !== "connected") throw new IntegrationError(409, `The ${account.provider} account is ${account.status}. Reconnect it in Connections.`);
    if (!account.capabilities?.can_reply) throw new IntegrationError(403, `Replying isn't permitted for this ${account.provider} account (permission not granted).`);

    // Messaging windows per provider policy.
    const { data: lastIn } = await supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conv.id)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const age = lastIn ? Date.now() - new Date(lastIn.created_at).getTime() : Infinity;
    if (age > DAY) {
      throw new IntegrationError(
        409,
        account.provider === "whatsapp"
          ? "The WhatsApp 24-hour customer service window has closed. Send an approved template message instead."
          : "The 24-hour standard messaging window has closed. Messages outside it are only allowed with an approved message tag (e.g. human agent) per Meta policy.",
      );
    }

    const admin = createAdminClient();
    const { data: creds, error: credErr } = await admin.rpc("get_oauth_credentials", { p_account: account.id });
    const row = Array.isArray(creds) ? creds[0] : creds;
    if (credErr || !row?.access_token_encrypted) throw new IntegrationError(409, "No stored credentials for this account. Reconnect it.");
    const token = decrypt(fromBytea(row.access_token_encrypted));

    let externalId: string | undefined;
    if (account.provider === "whatsapp") {
      const r = await graph<{ messages?: { id: string }[] }>(`/${account.provider_account_id}/messages`, {
        method: "POST",
        token,
        body: { messaging_product: "whatsapp", recipient_type: "individual", to: conv.external_id, type: "text", text: { body: msg.body } },
      });
      externalId = r.messages?.[0]?.id;
    } else if (account.provider === "facebook" || account.provider === "instagram") {
      // Messenger Platform: Instagram DMs are sent via the linked Facebook Page.
      const sender = account.provider === "instagram" ? (account.capabilities?.page_id as string | undefined) : account.provider_account_id;
      if (!sender) throw new IntegrationError(409, "This Instagram account has no linked Page on record. Reconnect it.");
      const r = await graph<{ message_id?: string }>(`/${sender}/messages`, {
        method: "POST",
        token,
        body: { recipient: { id: conv.external_id }, messaging_type: "RESPONSE", message: { text: msg.body } },
      });
      externalId = r.message_id;
    } else {
      throw new IntegrationError(400, `Replies via ${account.provider} are not supported yet`);
    }
    if (externalId) await admin.from("messages").update({ external_id: externalId }).eq("id", msg.id);
    return Response.json({ delivered: true });
  } catch (e) {
    return jsonError(e);
  }
}
