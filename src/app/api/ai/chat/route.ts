import { aiEnabled, providerName, claudeText, ensureCredits, errorResponse, HttpError, loadAiContext, logGeneration, systemPrompt } from "@/lib/server/ai";

export const runtime = "nodejs";

const CHAT_EXTRA =
  "You are chatting with a member of this business's marketing team inside the Social Pilot app. Help with content strategy, captions, scripts, hooks, replies and planning. Use short paragraphs and lists. Use Markdown sparingly (bold and lists only). When useful, point them to app tools: Write (hooks, captions, scripts), AI Content Agent (plan a week), Research, Competitors, My Brand.";

function templateReply(message: string) {
  const m = message.toLowerCase();
  const tip = /hook/.test(m)
    ? "Open **Write → Hooks** to generate scored hooks."
    : /caption/.test(m)
      ? "Open **Write → Captions** for SEO-friendly captions."
      : /plan|week|schedule|calendar/.test(m)
        ? "Use **AI Content Agent** on the dashboard to plan a whole week."
        : /competitor/.test(m)
          ? "Add competitors under **Competitors** and run an analysis."
          : "Try **Write**, **Ideas** or the **AI Content Agent**.";
  return `I can help with that! Chat replies need an AI key — ask your admin to add ANTHROPIC_API_KEY.\n\nMeanwhile: ${tip}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { workspaceId?: string; threadId?: string; message?: string } | null;
    const message = (body?.message ?? "").trim().slice(0, 4000);
    if (!message) throw new HttpError(400, "Message is empty");
    const ctx = await loadAiContext(body?.workspaceId);

    let threadId = body?.threadId;
    if (!threadId) {
      const { data, error } = await ctx.supabase
        .from("chat_threads")
        .insert({ tenant_id: ctx.workspace.tenant_id, workspace_id: ctx.workspace.id, title: message.slice(0, 60) })
        .select("id")
        .single();
      if (error) throw error;
      threadId = data.id;
    }
    const { error: insErr } = await ctx.supabase.from("chat_messages").insert({ thread_id: threadId, role: "user", content: message });
    if (insErr) throw insErr; // RLS: thread must belong to the caller

    const useAI = aiEnabled();
    const credits = useAI ? 1 : 0;
    await ensureCredits(ctx, credits);

    let reply: string;
    if (useAI) {
      const { data: history } = await ctx.supabase
        .from("chat_messages")
        .select("role,content")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(20);
      const msgs = (history ?? []).reverse().map((h) => ({ role: h.role as "user" | "assistant", content: h.content }));
      reply = await claudeText(systemPrompt(ctx, CHAT_EXTRA), msgs, 4000);
    } else {
      reply = templateReply(message);
    }
    await ctx.supabase.from("chat_messages").insert({ thread_id: threadId, role: "assistant", content: reply });
    await ctx.supabase.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
    await logGeneration(ctx, "chat", message, reply, providerName(), credits);
    return Response.json({ threadId, reply, provider: providerName() });
  } catch (e) {
    return errorResponse(e);
  }
}
