import { createHash, createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/server/admin";
import { safeEqual } from "@/lib/server/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Meta webhook verification handshake.
export function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (expected && p.get("hub.mode") === "subscribe" && safeEqual(p.get("hub.verify_token") ?? "", expected)) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

interface Messaging {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string }[] };
}
interface WaValue {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: { from: string; id: string; type: string; text?: { body?: string } }[];
}
interface Entry {
  id: string;
  messaging?: Messaging[];
  changes?: { field?: string; value?: WaValue }[];
}

type Admin = ReturnType<typeof createAdminClient>;

async function findAccount(admin: Admin, provider: string, providerAccountId: string) {
  const { data } = await admin
    .from("social_accounts")
    .select("id")
    .eq("provider", provider)
    .eq("provider_account_id", providerAccountId)
    .eq("is_demo", false)
    .neq("status", "disconnected");
  return (data ?? []).map((r: { id: string }) => r.id);
}

async function ingest(admin: Admin, accounts: string[], thread: string, msgId: string, name: string | null, handle: string, body: string) {
  for (const account of accounts) {
    const { error } = await admin.rpc("ingest_inbound_message", {
      p_account: account,
      p_external_thread: thread,
      p_external_msg: msgId,
      p_sender_name: name,
      p_sender_handle: handle,
      p_body: body,
    });
    if (error) console.error("webhook ingest failed:", error.message);
  }
}

export async function POST(request: Request) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  const raw = await request.text();
  const sig = request.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  if (!safeEqual(sig, expected)) return new Response("Invalid signature", { status: 401 });

  let payload: { object?: string; entry?: Entry[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  let admin: Admin;
  try {
    admin = createAdminClient();
  } catch {
    return new Response("Not configured", { status: 503 });
  }

  for (const entry of payload.entry ?? []) {
    try {
      const eventId = createHash("sha256").update(JSON.stringify(entry)).digest("hex");
      const { error: dup } = await admin.from("webhook_events").insert({ provider: "meta", event_id: eventId, payload: { object: payload.object, entry } });
      if (dup) {
        if (dup.code === "23505") continue; // replayed delivery — already processed
        console.error("webhook store failed:", dup.message);
      }

      if (payload.object === "page" || payload.object === "instagram") {
        const provider = payload.object === "page" ? "facebook" : "instagram";
        const accounts = await findAccount(admin, provider, entry.id);
        if (!accounts.length) continue;
        for (const m of entry.messaging ?? []) {
          if (!m.message || m.message.is_echo || !m.sender?.id || !m.message.mid) continue;
          const text = m.message.text ?? (m.message.attachments?.length ? `[${m.message.attachments[0].type ?? "attachment"}]` : "[unsupported message]");
          await ingest(admin, accounts, m.sender.id, m.message.mid, null, m.sender.id, text);
        }
      } else if (payload.object === "whatsapp_business_account") {
        for (const change of entry.changes ?? []) {
          const v = change.value;
          const phoneId = v?.metadata?.phone_number_id;
          if (!phoneId || !v?.messages?.length) continue; // statuses are stored above but not processed
          const accounts = await findAccount(admin, "whatsapp", phoneId);
          if (!accounts.length) continue;
          for (const msg of v.messages) {
            const name = v.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;
            const text = msg.type === "text" ? (msg.text?.body ?? "") : `[${msg.type} message]`;
            await ingest(admin, accounts, msg.from, msg.id, name, msg.from, text);
          }
        }
      }
      await admin.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("provider", "meta").eq("event_id", eventId);
    } catch (e) {
      console.error("webhook entry failed:", e instanceof Error ? e.message : "unknown");
    }
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}
