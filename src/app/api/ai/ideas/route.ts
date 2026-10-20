import { aiEnabled, providerName, claudeJSON, ensureCredits, errorResponse, loadAiContext, logGeneration, systemPrompt } from "@/lib/server/ai";
import { templateIdeas, type Idea } from "@/lib/content-templates";

export const runtime = "nodejs";

const SCHEMA = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          angle: { type: "string", enum: ["Grow", "Inspire", "Sell", "Value", "Educate", "Entertain"] },
          format: { type: "string", enum: ["short_form", "carousel", "post", "youtube", "threads", "story"] },
        },
        required: ["title", "description", "angle", "format"],
        additionalProperties: false,
      },
    },
  },
  required: ["ideas"],
  additionalProperties: false,
};

function weekStart(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - day);
  return x.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { workspaceId?: string; count?: number; focus?: string };
    const count = Math.min(12, Math.max(3, body.count ?? 9));
    const ctx = await loadAiContext(body.workspaceId);
    const useAI = aiEnabled();
    const credits = useAI ? 2 : 0;
    await ensureCredits(ctx, credits);

    let ideas: Idea[];
    if (useAI) {
      const res = await claudeJSON<{ ideas: Idea[] }>(
        systemPrompt(ctx),
        `Create ${count} fresh, specific content ideas for this week. Mix angles (Grow, Inspire, Sell, Value, Educate, Entertain) and formats. Each title under 70 characters; description 1-2 sentences explaining the angle and what to show.${body.focus ? ` Focus: ${body.focus}` : ""}`,
        SCHEMA,
      );
      ideas = res.ideas.slice(0, count).map((i) => ({ ...i, origin: "AI idea" }));
    } else {
      ideas = templateIdeas(ctx.workspace.name, ctx.workspace.brand_settings, ctx.knowledge, count, body.focus);
    }
    const ws = weekStart();
    const { data, error } = await ctx.supabase
      .from("content_ideas")
      .insert(ideas.map((i) => ({ tenant_id: ctx.workspace.tenant_id, workspace_id: ctx.workspace.id, title: i.title, description: i.description, angle: i.angle, format: i.format, origin: i.origin, week_start: ws })))
      .select("*");
    if (error) throw error;
    await logGeneration(ctx, "ideas", body.focus || "weekly ideas", ideas.map((i) => i.title).join("\n"), providerName(), credits);
    return Response.json({ ideas: data, provider: providerName() });
  } catch (e) {
    return errorResponse(e);
  }
}
