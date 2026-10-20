import { aiEnabled, providerName, claudeJSON, ensureCredits, errorResponse, HttpError, loadAiContext, logGeneration, systemPrompt } from "@/lib/server/ai";
import { DAY_KEYS, FORMAT_LABELS, templatePlanPosts, type DayKey, type PlanPost } from "@/lib/content-templates";

export const runtime = "nodejs";

interface Body {
  workspaceId?: string;
  startDate?: string; // YYYY-MM-DD
  template?: string;
  schedule?: Partial<Record<DayKey, string[]>>;
  settings?: { topics?: string; tone?: string; language?: string; postTime?: string; cta?: string };
}

const SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "string", enum: [...DAY_KEYS] },
          format: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
        },
        required: ["day", "format", "title", "body", "hashtags"],
        additionalProperties: false,
      },
    },
  },
  required: ["posts"],
  additionalProperties: false,
};

/** Converts a local wall-clock time in `timeZone` to a UTC ISO string. */
function zonedISO(date: string, time: string, timeZone: string) {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(guess)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess.getTime() - (asUTC - guess.getTime())).toISOString();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body?.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) throw new HttpError(400, "Choose a valid start date");
    const schedule = Object.fromEntries(DAY_KEYS.map((d) => [d, (body.schedule?.[d] ?? []).filter((f) => f in FORMAT_LABELS).slice(0, 4)])) as Record<DayKey, string[]>;
    const slots = DAY_KEYS.flatMap((day) => schedule[day].map((format) => ({ day, format })));
    if (!slots.length) throw new HttpError(400, "Drag at least one platform onto a day");
    if (slots.length > 21) throw new HttpError(400, "At most 21 posts per week");
    const settings = body.settings ?? {};
    const postTime = /^\d{2}:\d{2}$/.test(settings.postTime ?? "") ? settings.postTime! : "10:00";

    const ctx = await loadAiContext(body.workspaceId);
    const useAI = aiEnabled();
    const credits = useAI ? Math.ceil(slots.length / 2) : 0;
    await ensureCredits(ctx, credits);

    let posts: PlanPost[];
    if (useAI) {
      const list = slots.map((s, i) => `${i + 1}. ${s.day.toUpperCase()} — ${FORMAT_LABELS[s.format]}`).join("\n");
      const res = await claudeJSON<{ posts: PlanPost[] }>(
        systemPrompt(ctx),
        [
          `Plan one week of content using the "${body.template ?? "custom"}" weekly template.`,
          settings.topics ? `Topics / themes to cover: ${settings.topics}` : "",
          `Tone: ${settings.tone || ctx.workspace.brand_settings.tone || "friendly"}. Language: ${settings.language || ctx.workspace.brand_settings.language || "English"}.`,
          settings.cta ? `Preferred call to action: ${settings.cta}` : "",
          "Write exactly one post for each slot below, in order, adapted to the format (short-form video = include a 3-part script with hook; YouTube = title + description + chapter outline; X/Threads = punchy text under 280 chars; LinkedIn = professional storytelling; Instagram/Facebook = caption). Hashtags without the # sign, 0-6 per post.",
          list,
        ]
          .filter(Boolean)
          .join("\n\n"),
        SCHEMA,
        16000,
      );
      posts = res.posts;
    } else {
      posts = templatePlanPosts(slots, ctx.workspace.name, ctx.workspace.brand_settings, ctx.knowledge, settings.topics);
    }

    const { data: plan, error: planErr } = await ctx.supabase
      .from("content_plans")
      .insert({ tenant_id: ctx.workspace.tenant_id, workspace_id: ctx.workspace.id, start_date: body.startDate, template: body.template ?? "custom", schedule, settings: { ...settings, postTime } })
      .select("id")
      .single();
    if (planErr) throw planErr;

    const { data: ws } = await ctx.supabase.from("workspaces").select("timezone").eq("id", ctx.workspace.id).single();
    const tz = ws?.timezone || "Asia/Kolkata";
    const start = new Date(`${body.startDate}T00:00:00Z`);
    const startIdx = (start.getUTCDay() + 6) % 7;
    const rows = posts.map((p) => {
      // days are placed on the first matching weekday on/after the start date
      const offset = (DAY_KEYS.indexOf(p.day) - startIdx + 7) % 7;
      const d = new Date(start.getTime() + offset * 86400000).toISOString().slice(0, 10);
      return {
        tenant_id: ctx.workspace.tenant_id,
        workspace_id: ctx.workspace.id,
        plan_id: plan.id,
        format: p.format,
        title: p.title.slice(0, 120),
        body: p.body,
        hashtags: (p.hashtags ?? []).map((h) => h.replace(/^#/, "")).slice(0, 8),
        status: "draft",
        scheduled_at: zonedISO(d, postTime, tz),
      };
    });
    const { data: inserted, error } = await ctx.supabase.from("content_posts").insert(rows).select("id,title,format,scheduled_at");
    if (error) throw error;
    await logGeneration(ctx, "plan", JSON.stringify({ template: body.template, slots: slots.length }), rows.map((r) => r.title).join("\n"), providerName(), credits);
    return Response.json({ planId: plan.id, posts: inserted, provider: providerName() });
  } catch (e) {
    return errorResponse(e);
  }
}
