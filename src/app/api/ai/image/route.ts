import { randomUUID } from "node:crypto";
import { ensureCredits, errorResponse, geminiGenerate, HttpError, loadAiContext, logGeneration } from "@/lib/server/ai";

export const runtime = "nodejs";

const ASPECTS = ["1:1", "4:5", "9:16", "16:9"] as const;
const STYLES: Record<string, string> = {
  photo: "realistic professional photograph, natural light, high detail",
  illustration: "clean modern flat illustration",
  minimal: "minimal composition, lots of negative space, soft colors",
  poster: "bold eye-catching social media poster style, strong contrast",
};
const CREDITS = 5;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { workspaceId?: string; prompt?: string; aspect?: string; style?: string } | null;
    const prompt = (body?.prompt ?? "").trim().slice(0, 1500);
    if (!prompt) throw new HttpError(400, "Describe the image you want");
    if (!process.env.GEMINI_API_KEY) throw new HttpError(400, "Image generation needs GEMINI_API_KEY (Gemini image model)");
    const aspect = ASPECTS.includes(body?.aspect as (typeof ASPECTS)[number]) ? body!.aspect! : "1:1";
    const style = STYLES[body?.style ?? ""] ?? STYLES.photo;

    const ctx = await loadAiContext(body?.workspaceId);
    await ensureCredits(ctx, CREDITS);

    const forbidden = ctx.knowledge.filter((k) => k.category === "forbidden").map((k) => k.content);
    const fullPrompt = [
      `Create a social media image for "${ctx.workspace.name}"${ctx.workspace.industry ? ` (${ctx.workspace.industry})` : ""}.`,
      `Subject: ${prompt}`,
      `Style: ${style}.`,
      /\b(text|caption|words|title|quote)\b/i.test(prompt) ? "" : "Do not include any text, letters or logos in the image.",
      "Do not depict real, identifiable people or copy any brand's trademarks.",
      forbidden.length ? `Avoid anything implying: ${forbidden.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const data = await geminiGenerate(process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image", {
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect } },
    });
    const image = (data.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data)?.inlineData;
    if (!image) throw new HttpError(502, "The image model returned no image. Try a different description.");

    const mime = image.mimeType || "image/png";
    const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
    const bytes = Buffer.from(image.data, "base64");
    const path = `${ctx.workspace.tenant_id}/${ctx.workspace.id}/ai/${randomUUID()}.${ext}`;
    const { error: upErr } = await ctx.supabase.storage.from("media").upload(path, bytes, { contentType: mime, upsert: false });
    if (upErr) throw new HttpError(403, upErr.message);

    const { data: asset, error } = await ctx.supabase
      .from("media_assets")
      .insert({
        tenant_id: ctx.workspace.tenant_id,
        workspace_id: ctx.workspace.id,
        storage_path: path,
        file_name: `AI – ${prompt.slice(0, 60).replace(/[^\w\s-]/g, "").trim() || "image"}.${ext}`,
        mime_type: mime,
        size_bytes: bytes.length,
        tags: ["ai-generated"],
      })
      .select("*")
      .single();
    if (error) throw new HttpError(403, error.message);

    await logGeneration(ctx, "image", prompt, path, "gemini", CREDITS);
    const { data: signed } = await ctx.supabase.storage.from("media").createSignedUrl(path, 3600);
    return Response.json({ asset, url: signed?.signedUrl ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
