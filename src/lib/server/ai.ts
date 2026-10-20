import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type AiProvider = "anthropic" | "gemini";

/** Chosen text provider: AI_PROVIDER if set, else whichever key is configured (Claude first). */
export function chosenProvider(): AiProvider | null {
  const want = process.env.AI_PROVIDER;
  if (want === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : null;
  if (want === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export const aiEnabled = () => chosenProvider() !== null;

/** Label stored with each generation: the provider that served it, or the offline template engine. */
export function providerName(): AiProvider | "template" {
  return chosenProvider() ?? "template";
}
export const aiProviderLabel = providerName;

const MODEL = () => process.env.AI_MODEL || "claude-opus-5-5";
const GEMINI_MODEL = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";

export interface BrandSettings {
  niche?: string;
  audience?: string;
  tone?: string;
  language?: string;
  platforms?: string[];
  frequency?: string;
  goals?: string[];
  offer?: string;
  location?: string;
}

export interface AiContext {
  supabase: SupabaseClient;
  userId: string;
  workspace: { id: string; tenant_id: string; name: string; industry: string | null; brand_settings: BrandSettings };
  knowledge: { category: string; title: string; content: string }[];
  facts: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Authenticates the caller and loads the workspace (RLS-checked) with its brand knowledge. */
export async function loadAiContext(workspaceId: string | undefined): Promise<AiContext> {
  if (!workspaceId) throw new HttpError(400, "workspaceId is required");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, "Not signed in");
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id,tenant_id,name,industry,brand_settings")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws) throw new HttpError(404, "Workspace not found");
  const { data: knowledge } = await supabase.from("brand_knowledge").select("category,title,content").eq("workspace_id", workspaceId).limit(60);
  const brand = (ws.brand_settings ?? {}) as BrandSettings;
  const lines = [
    brand.niche && `- Niche: ${brand.niche}`,
    brand.audience && `- Target audience: ${brand.audience}`,
    brand.offer && `- Main offer: ${brand.offer}`,
    brand.location && `- Location: ${brand.location}`,
    brand.goals?.length && `- Goals: ${brand.goals.join(", ")}`,
    ...(knowledge ?? []).map((k) => `- [${k.category}] ${k.title}: ${k.content}`),
  ].filter(Boolean);
  return { supabase, userId: user.id, workspace: { ...ws, brand_settings: brand }, knowledge: knowledge ?? [], facts: lines.join("\n") };
}

/** Throws 402 if the tenant has no AI credits left for `credits` more. */
export async function ensureCredits(ctx: AiContext, credits: number) {
  if (credits === 0) return;
  const { data: usage, error } = await ctx.supabase.rpc("get_usage", { p_tenant: ctx.workspace.tenant_id });
  if (error) throw new HttpError(403, error.message);
  if (usage.ai_credits + credits > usage.plan.ai_credits_per_month) {
    throw new HttpError(402, `AI credit limit reached (${usage.ai_credits}/${usage.plan.ai_credits_per_month} this month). Upgrade your plan for more.`);
  }
}

/** Records the generation; the database enforces the monthly credit quota. */
export async function logGeneration(ctx: AiContext, kind: string, prompt: string, output: string, provider: string, credits: number) {
  const { error } = await ctx.supabase.from("ai_generations").insert({
    tenant_id: ctx.workspace.tenant_id,
    workspace_id: ctx.workspace.id,
    kind,
    prompt: prompt.slice(0, 4000),
    output: output.slice(0, 20000),
    provider,
    credits,
  });
  if (error) throw new HttpError(402, error.message);
}

export function systemPrompt(ctx: AiContext, extra?: string) {
  const b = ctx.workspace.brand_settings;
  return [
    `You are the in-house content strategist and copywriter for "${ctx.workspace.name}"${ctx.workspace.industry ? ` (${ctx.workspace.industry})` : ""}.`,
    `Default tone: ${b.tone || "friendly"}. Default language: ${b.language || "English"}.`,
    "Write in a natural, human voice. Never invent prices, offers, timings, results, statistics or claims that are not in the business facts. Respect 'forbidden' and 'disclaimer' entries.",
    "Return only the requested content with no preamble.",
    ctx.facts ? `Business facts:\n${ctx.facts}` : "No business facts were provided; keep details generic and suggest the user adds them in My Brand.",
    extra ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function client() {
  return new Anthropic();
}

function check(response: Anthropic.Beta.Messages.BetaMessage) {
  if (response.stop_reason === "refusal") throw new HttpError(422, "The AI declined this request. Try rephrasing.");
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!text) throw new HttpError(502, "The AI returned an empty response");
  return text;
}

async function anthropicText(system: string, messages: Anthropic.Beta.Messages.BetaMessageParam[], maxTokens = 4000) {
  try {
    const response = await client().beta.messages.create({
      model: MODEL(),
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system,
      messages,
    });
    return check(response);
  } catch (e) {
    throw toHttp(e);
  }
}

/** Structured output: the response is guaranteed to match `schema`. */
async function anthropicJSON<T>(system: string, prompt: string, schema: Record<string, unknown>, maxTokens = 8000): Promise<T> {
  try {
    const response = await client().beta.messages.create({
      model: MODEL(),
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: prompt }],
    });
    return JSON.parse(check(response)) as T;
  } catch (e) {
    throw toHttp(e);
  }
}

// ---------------------------------------------------------------- Gemini (REST)

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

/** Calls generateContent on a Gemini model; shared by text, JSON and image generation. */
export async function geminiGenerate(model: string, body: Record<string, unknown>): Promise<GeminiResponse> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError(400, "GEMINI_API_KEY is not configured");
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new HttpError(502, "Could not reach the Gemini API");
  }
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    if (res.status === 429) throw new HttpError(429, "The AI is busy right now. Try again in a minute.");
    if (res.status === 401 || res.status === 403) throw new HttpError(500, "The Gemini key is invalid or lacks access. Check GEMINI_API_KEY.");
    throw new HttpError(502, `Gemini error (${res.status})${data.error?.message ? `: ${data.error.message.slice(0, 200)}` : ""}`);
  }
  if (data.promptFeedback?.blockReason) throw new HttpError(422, "The AI declined this request. Try rephrasing.");
  const finish = data.candidates?.[0]?.finishReason;
  if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST") throw new HttpError(422, "The AI declined this request. Try rephrasing.");
  return data;
}

function geminiTextOf(data: GeminiResponse) {
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new HttpError(502, "The AI returned an empty response");
  return text;
}

function toGeminiContents(messages: Anthropic.Beta.Messages.BetaMessageParam[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [
      {
        text:
          typeof m.content === "string"
            ? m.content
            : m.content.map((b) => ("text" in b && typeof b.text === "string" ? b.text : "")).join("\n"),
      },
    ],
  }));
}

async function geminiText(system: string, messages: Anthropic.Beta.Messages.BetaMessageParam[], maxTokens: number) {
  const data = await geminiGenerate(GEMINI_MODEL(), {
    systemInstruction: { parts: [{ text: system }] },
    contents: toGeminiContents(messages),
    generationConfig: { maxOutputTokens: maxTokens },
  });
  return geminiTextOf(data);
}

async function geminiJSON<T>(system: string, prompt: string, schema: Record<string, unknown>, maxTokens: number): Promise<T> {
  const data = await geminiGenerate(GEMINI_MODEL(), {
    systemInstruction: { parts: [{ text: system }] },
    contents: [
      {
        role: "user",
        parts: [{ text: `${prompt}\n\nRespond with only a JSON object that matches this JSON schema:\n${JSON.stringify(schema)}` }],
      },
    ],
    generationConfig: { maxOutputTokens: maxTokens, responseMimeType: "application/json" },
  });
  const raw = geminiTextOf(data)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(502, "The AI returned malformed data. Try again.");
  }
}

// ---------------------------------------------------------------- provider dispatch

/** Text generation with the configured provider (name kept for existing routes). */
export async function claudeText(system: string, messages: Anthropic.Beta.Messages.BetaMessageParam[], maxTokens = 4000) {
  return chosenProvider() === "gemini" ? geminiText(system, messages, maxTokens) : anthropicText(system, messages, maxTokens);
}

/** Structured JSON generation with the configured provider. */
export async function claudeJSON<T>(system: string, prompt: string, schema: Record<string, unknown>, maxTokens = 8000): Promise<T> {
  return chosenProvider() === "gemini" ? geminiJSON<T>(system, prompt, schema, maxTokens) : anthropicJSON<T>(system, prompt, schema, maxTokens);
}

export const aiText = claudeText;
export const aiJSON = claudeJSON;

function toHttp(e: unknown) {
  if (e instanceof HttpError) return e;
  if (e instanceof Anthropic.RateLimitError) return new HttpError(429, "The AI is busy right now. Try again in a minute.");
  if (e instanceof Anthropic.AuthenticationError) return new HttpError(500, "The AI key is invalid. Check ANTHROPIC_API_KEY.");
  if (e instanceof Anthropic.APIError) return new HttpError(502, `AI provider error (${e.status ?? "network"})`);
  if (e instanceof SyntaxError) return new HttpError(502, "The AI returned malformed data. Try again.");
  return new HttpError(500, e instanceof Error ? e.message : "AI error");
}

export function errorResponse(e: unknown) {
  const err = e instanceof HttpError ? e : toHttp(e);
  return Response.json({ error: err.message }, { status: err.status });
}
