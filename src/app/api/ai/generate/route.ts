import { aiEnabled, providerName, claudeText, ensureCredits, errorResponse, HttpError, loadAiContext, logGeneration, systemPrompt } from "@/lib/server/ai";
import { templateGenerate, AI_KINDS, type AiKind } from "@/lib/ai-templates";

export const runtime = "nodejs";

const TASKS: Record<AiKind, string> = {
  caption: "Write one ready-to-post social media caption with a strong first line, short paragraphs, a clear call to action and 3-6 relevant hashtags at the end. Optimise it for search on the platform (natural keywords in the first two lines).",
  improve: "Rewrite the given post so it is clearer, more engaging and on-brand. Keep the meaning and any facts unchanged. Return only the improved post.",
  hook: "Write 5 alternative scroll-stopping opening lines (hooks) for a short-form video or post as a numbered list. After each hook add a score out of 100 for predicted attention in brackets, e.g. (score: 86).",
  hashtags: "Suggest 15 relevant hashtags mixing broad, niche and local tags. Return them on one line separated by spaces.",
  campaign: "Write campaign copy: a headline, a 2-3 sentence description, 3 post ideas, and a call to action.",
  translate: "Translate the given text into the requested language, keeping tone, emojis and hashtags. Return only the translation.",
  faq: "Answer the customer question briefly and accurately using only the business facts provided.",
  ideas: "Create a 7-day content plan as a list: day, post format (reel/carousel/story/post), topic and a one-line caption idea.",
  reply: "Draft a short, friendly reply to the customer's latest message. Use only the business facts provided; if the answer is not in the facts, say a team member will confirm. Return only the reply text.",
  review_reply: "Draft a short, professional public reply to this customer review. Thank them, address specific points, and never argue. Return only the reply.",
  script: "Write a short-form video script (30-60 seconds) using the requested viral formula. Use sections: HOOK (0-3s), BODY (numbered beats with on-screen text suggestions), CTA. Keep sentences short and spoken.",
  visual_guide: "Suggest how to film this as a short video: 3 trending video formats that fit, the visual hook for the first 2 seconds, shot list (5-7 shots), on-screen text, b-roll ideas and the style of background music (describe the mood; do not name copyrighted tracks as required).",
  trends: "Suggest 6 content trends/formats that tend to work in this niche right now, each with: name, why it works, how this business can use it, and an example caption line. Be clear these are suggested formats, not live trend data.",
  optimize: "Review this post as a social media expert. Give: an overall score out of 100, then scores out of 10 for Hook, Clarity, Value, Call to action, Hashtags/SEO, with one concrete fix each. Finish with an improved version of the full post.",
  repurpose: "Repurpose the given source content into an original post for the requested platform in this brand's voice. Do not copy sentences verbatim; credit the idea, not the words.",
  competitor: "Analyse this competitor from the provided notes and sample posts: content pillars, posting style, hooks they use, what seems to work, gaps/opportunities for our brand, and 5 content ideas we can make that differentiate us. Use only the data given; do not guess numbers.",
};

interface Body {
  workspaceId?: string;
  kind?: AiKind;
  prompt?: string;
  tone?: string;
  platform?: string;
  language?: string;
  context?: string;
  formula?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body) throw new HttpError(400, "Invalid JSON body");
    const kind = body.kind ?? "caption";
    if (!AI_KINDS.includes(kind)) throw new HttpError(400, "Unknown kind");
    const prompt = (body.prompt ?? "").trim().slice(0, 6000);
    if (!prompt) throw new HttpError(400, "prompt is required");

    const ctx = await loadAiContext(body.workspaceId);
    const b = ctx.workspace.brand_settings;
    const tone = body.tone || b.tone || "friendly";
    const language = body.language || b.language || "English";
    const platform = body.platform || "instagram";

    const useAI = aiEnabled();
    const credits = useAI ? 1 : 0;
    await ensureCredits(ctx, credits);

    let output: string;
    if (useAI) {
      const user = [
        `Task: ${TASKS[kind]}`,
        `Platform: ${platform}. Tone: ${tone}. Language: ${language}.`,
        body.formula ? `Viral formula to follow: ${body.formula}` : "",
        body.context ? `Context:\n${body.context.slice(0, 6000)}` : "",
        `Input:\n${prompt}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      output = await claudeText(systemPrompt(ctx), [{ role: "user", content: user }]);
    } else {
      output = templateGenerate({
        kind,
        prompt,
        tone,
        platform,
        language,
        business: ctx.workspace.name,
        industry: ctx.workspace.industry,
        knowledge: ctx.knowledge,
        formula: body.formula,
      });
    }
    const provider = providerName();
    await logGeneration(ctx, kind, prompt, output, provider, credits);
    return Response.json({ output, provider, credits });
  } catch (e) {
    return errorResponse(e);
  }
}
