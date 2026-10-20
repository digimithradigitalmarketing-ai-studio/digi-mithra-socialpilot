import { createClient } from "@/lib/supabase/server";
import { renderEmail } from "@/lib/email-render";
import type { Contact, EmailCampaign } from "@/lib/types";

export const runtime = "nodejs";

const MAX_RECIPIENTS = 1000;

function err(status: number, error: string) {
  return Response.json({ error }, { status });
}

async function sendViaResend(key: string, payload: Record<string, unknown>) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(data.message || `Email provider error (${res.status})`);
  return data.id ?? null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { campaignId?: string; test?: boolean } | null;
    if (!body?.campaignId) return err(400, "campaignId is required");
    const test = Boolean(body.test);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return err(401, "Not signed in");

    const { data: campaign } = await supabase.from("email_campaigns").select("*").eq("id", body.campaignId).maybeSingle();
    if (!campaign) return err(404, "Campaign not found");
    const c = campaign as EmailCampaign;
    if (c.status === "sent" && !test) return err(409, "This campaign was already sent. Duplicate it to send again.");
    if (c.status === "sending" && !test) return err(409, "This campaign is already sending.");
    if (!c.subject.trim() || !c.body.trim()) return err(400, "Add a subject and body first");

    // permission check: only editors+ can update (RLS)
    const { data: touched } = await supabase
      .from("email_campaigns")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", c.id)
      .select("id");
    if (!touched?.length) return err(403, "You don't have permission to send this campaign");

    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (key && !from) return err(400, "EMAIL_FROM is not set. Add it (e.g. \"Brand <hello@yourdomain.com>\") to send with Resend.");

    const { data: ws } = await supabase.from("workspaces").select("name,brand_settings").eq("id", c.workspace_id).single();
    const businessName = ws?.name ?? "Our team";
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const fromHeader = from && c.from_name ? from.replace(/^[^<]*</, `${c.from_name.replace(/[<>"]/g, "")} <`) : from;

    if (test) {
      if (!user.email) return err(400, "Your account has no email address");
      const { html, text } = renderEmail({
        subject: c.subject,
        preheader: c.preheader,
        body: c.body,
        businessName,
        name: (user.user_metadata?.full_name as string | undefined) ?? null,
        unsubscribeUrl: `${origin}/u/00000000-0000-0000-0000-000000000000`,
      });
      if (!key) return Response.json({ test: true, provider: "simulated", sent: 0, simulated: 1 });
      await sendViaResend(key, { from: fromHeader, to: [user.email], subject: `[TEST] ${c.subject}`, html, text, reply_to: c.reply_to || undefined });
      return Response.json({ test: true, provider: "resend", sent: 1, simulated: 0 });
    }

    if (!c.segment_id) return err(400, "Choose a segment to send to");
    const { data: members, error: segErr } = await supabase.rpc("segment_contacts", { p_segment: c.segment_id }).range(0, MAX_RECIPIENTS);
    if (segErr) return err(400, segErr.message);
    const seen = new Set<string>();
    const recipients = ((members ?? []) as Contact[]).filter((m) => {
      const e = m.email?.trim().toLowerCase();
      if (!e || !m.marketing_consent || seen.has(e) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return false;
      seen.add(e);
      return true;
    });
    if (!recipients.length) return err(400, "No opted-in contacts with an email address in this segment");
    if ((members ?? []).length > MAX_RECIPIENTS) return err(400, `Segments are limited to ${MAX_RECIPIENTS} recipients per send in this version`);

    await supabase.from("email_campaigns").update({ status: "sending" }).eq("id", c.id);

    const stats = { recipients: recipients.length, sent: 0, simulated: 0, failed: 0, skipped: 0 };
    const queue = [...recipients];

    const worker = async () => {
      while (queue.length) {
        const r = queue.shift()!;
        const email = r.email!.trim().toLowerCase();
        // placeholder row first: its id is the unsubscribe token; unique(campaign,email) prevents double sends
        const { data: row } = await supabase
          .from("email_sends")
          .upsert(
            { tenant_id: c.tenant_id, workspace_id: c.workspace_id, campaign_id: c.id, contact_id: r.id, email, status: "skipped" },
            { onConflict: "campaign_id,email", ignoreDuplicates: true },
          )
          .select("id");
        const id = row?.[0]?.id as string | undefined;
        if (!id) {
          stats.skipped++;
          continue;
        }
        const url = `${origin}/u/${id}`;
        const subject = c.subject.replace(/\{\{\s*name\s*\}\}/gi, r.name.split(/\s+/)[0] || "there");
        const { html, text } = renderEmail({ subject, preheader: c.preheader, body: c.body, businessName, name: r.name, unsubscribeUrl: url });
        if (!key) {
          await supabase.from("email_sends").update({ status: "simulated" }).eq("id", id);
          stats.simulated++;
          continue;
        }
        try {
          const providerId = await sendViaResend(key, {
            from: fromHeader,
            to: [email],
            subject,
            html,
            text,
            reply_to: c.reply_to || undefined,
            headers: { "List-Unsubscribe": `<${url}>` },
          });
          await supabase.from("email_sends").update({ status: "sent", provider_id: providerId }).eq("id", id);
          stats.sent++;
        } catch (e) {
          await supabase
            .from("email_sends")
            .update({ status: "failed", error: (e instanceof Error ? e.message : "Send failed").slice(0, 300) })
            .eq("id", id);
          stats.failed++;
        }
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));

    const delivered = stats.sent + stats.simulated;
    await supabase
      .from("email_campaigns")
      .update({
        status: delivered === 0 && stats.failed > 0 ? "failed" : "sent",
        sent_at: new Date().toISOString(),
        provider: key ? "resend" : "simulated",
        stats,
      })
      .eq("id", c.id);

    return Response.json({ ...stats, provider: key ? "resend" : "simulated" });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : "Send failed");
  }
}
