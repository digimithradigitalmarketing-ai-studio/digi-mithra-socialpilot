import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { templateGenerate, type AiKind } from "@/lib/ai-templates";

export const runtime = "nodejs";

const KINDS: AiKind[] = ["caption", "hook", "hashtags", "campaign", "translate", "faq", "ideas", "reply", "review_reply", "improve"];

const TASKS: Record<AiKind, string> = {
  caption: "Write one ready-to-post social media caption with a strong first line, short paragraphs, a clear call to action and 3-6 relevant hashtags at the end.",
  improve: "Rewrite the given post so it is clearer, more engaging and on-brand. Keep the meaning and any facts unchanged. Return only the improved post.",
  hook: "Write 5 alternative scroll-stopping opening lines (hooks) as a numbered list.",
  hashtags: "Suggest 15 relevant hashtags mixing broad, niche and local tags. Return them on one line separated by spaces.",
  campaign: "Write campaign copy: a headline, a 2-3 sentence description, 3 post ideas, and a call to action.",
  translate: "Translate the given text into the requested language, keeping tone, emojis and hashtags. Return only the translation.",
  faq: "Answer the customer question briefly and accurately using only the business facts provided.",
  ideas: "Create a 7-day content plan as a list: day, post format (reel/carousel/story/post), topic and a one-line caption idea.",
  reply: "Draft a short, friendly reply to the customer's latest message. Use only the business facts provided; if the answer is not in the facts, say a team member will confirm. Return only the reply text.",
  review_reply: "Draft a short, professional public reply to this customer review. Thank them, address specific points, and never argue. Return only the reply.",
};

interface Body {
  workspaceId?: string;
  kind?: AiKind;
  prompt?: string;
  tone?: string;
  platform?: string;
  language?: string;
  context?: string;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { workspaceId, kind = "caption", tone = "friendly", platform = "instagram", language = "English", context = "" } = body;
  const prompt = (body.prompt ?? "").trim().slice(0, 4000);
  if (!workspaceId || !prompt) return NextResponse.json({ error: "workspaceId and prompt are required" }, { status: 400 });
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "Unknown kind" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // RLS returns the workspace only if the caller belongs to it
  const { data: ws } = await supabase.from("workspaces").select("id,tenant_id,name,industry").eq("id", workspaceId).maybeSingle();
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const { data: usage, error: usageErr } = await supabase.rpc("get_usage", { p_tenant: ws.tenant_id });
  if (usageErr) return NextResponse.json({ error: usageErr.message }, { status: 403 });
  const useAI = Boolean(process.env.ANTHROPIC_API_KEY);
  const credits = useAI ? 1 : 0;
  if (useAI && usage.ai_credits + credits > usage.plan.ai_credits_per_month) {
    return NextResponse.json({ error: `AI credit limit reached (${usage.ai_credits}/${usage.plan.ai_credits_per_month} this month). Upgrade your plan for more.` }, { status: 402 });
  }

  const { data: knowledge } = await supabase
    .from("brand_knowledge")
    .select("category,title,content")
    .eq("workspace_id", workspaceId)
    .limit(60);
  const facts = (knowledge ?? []).map((k) => `- [${k.category}] ${k.title}: ${k.content}`).join("\n");

  let output: string;
  let provider: "anthropic" | "template";
  if (useAI) {
    try {
      output = await generateWithClaude({ kind, prompt, tone, platform, language, context, facts, business: ws.name, industry: ws.industry });
      provider = "anthropic";
    } catch (e) {
      const msg = e instanceof Anthropic.APIError ? `AI provider error (${e.status ?? "network"})` : e instanceof Error ? e.message : "AI provider error";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  } else {
    output = templateGenerate({ kind, prompt, tone, platform, language, business: ws.name, industry: ws.industry, knowledge: knowledge ?? [] });
    provider = "template";
  }

  const { error: logErr } = await supabase.from("ai_generations").insert({
    tenant_id: ws.tenant_id,
    workspace_id: ws.id,
    kind,
    prompt,
    output,
    provider,
    credits,
  });
  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 402 });

  return NextResponse.json({ output, provider, credits });
}

async function generateWithClaude(a: {
  kind: AiKind;
  prompt: string;
  tone: string;
  platform: string;
  language: string;
  context: string;
  facts: string;
  business: string;
  industry: string | null;
}) {
  const client = new Anthropic();
  const system = [
    `You are the in-house social media writer for "${a.business}"${a.industry ? ` (${a.industry})` : ""}.`,
    "Write in a natural, human voice. Never invent prices, offers, timings, results or claims that are not in the business facts.",
    "Respect any 'forbidden' and 'disclaimer' entries in the facts. Return only the requested content, with no preamble.",
    a.facts ? `Business facts:\n${a.facts}` : "No business facts were provided; keep details generic.",
  ].join("\n\n");
  const user = [
    `Task: ${TASKS[a.kind]}`,
    `Platform: ${a.platform}. Tone: ${a.tone}. Language: ${a.language}.`,
    a.context ? `Conversation context:\n${a.context.slice(0, 4000)}` : "",
    `Input:\n${a.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await client.beta.messages.create({
    model: process.env.AI_MODEL || "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: user }],
  });

  if (response.stop_reason === "refusal") throw new Error("The AI declined this request. Try rephrasing.");
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!text) throw new Error("The AI returned an empty response");
  return text;
}
