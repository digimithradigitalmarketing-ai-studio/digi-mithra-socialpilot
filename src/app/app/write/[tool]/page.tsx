"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, ChevronDown, ChevronRight, ChevronUp, Copy, PenSquare, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, CardHeader, EmptyState, Field, LoadingBlock, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, errMsg, timeAgo } from "@/lib/utils";
import { VIRAL_FORMULAS } from "@/lib/content-templates";
import type { SavedItem } from "@/lib/types";

type SaveKind = SavedItem["kind"];

interface ToolDef {
  name: string;
  kind: string;
  description: string;
  saveKind: SaveKind;
  placeholder: string;
  contextLabel?: string;
  requiresLanguage?: boolean;
}

const TOOLS: Record<string, ToolDef> = {
  hooks: { name: "Hooks", kind: "hook", saveKind: "hook", description: "Attention-grabbing opening lines, scored for predicted attention.", placeholder: "What is your video about? e.g. 3 mistakes beginners make at the gym" },
  captions: { name: "Captions", kind: "caption", saveKind: "caption", description: "SEO-friendly captions with a strong first line and CTA.", placeholder: "Describe the post, e.g. New morning HIIT batch starting Monday" },
  scripts: { name: "Viral Formulas", kind: "script", saveKind: "script", description: "Short-form video scripts built on proven structures.", placeholder: "Topic of your video, e.g. Why most people quit the gym in week 2" },
  visual: { name: "Visual Guide", kind: "visual_guide", saveKind: "other", description: "Video formats, shot list, visual hook and music mood.", placeholder: "What will you film? e.g. Studio tour for new members" },
  hashtags: { name: "Hashtags", kind: "hashtags", saveKind: "other", description: "A mix of broad, niche and local hashtags.", placeholder: "Topic or post text" },
  repurpose: { name: "Repurpose", kind: "repurpose", saveKind: "post", description: "Turn existing content into an original post in your voice.", placeholder: "What angle should the new post take?", contextLabel: "Source content (paste text or a link)" },
  translate: { name: "Translate", kind: "translate", saveKind: "caption", description: "Translate posts while keeping tone, emojis and hashtags.", placeholder: "Paste the text to translate", requiresLanguage: true },
  campaign: { name: "Campaign copy", kind: "campaign", saveKind: "other", description: "Headline, description, post ideas and a call to action.", placeholder: "Campaign idea, e.g. Diwali 20% off quarterly membership" },
};

const PLATFORMS = [
  { v: "instagram", l: "Instagram" },
  { v: "tiktok", l: "TikTok" },
  { v: "youtube_shorts", l: "YouTube Shorts" },
  { v: "youtube", l: "YouTube" },
  { v: "linkedin", l: "LinkedIn" },
  { v: "x", l: "X" },
  { v: "threads", l: "Threads" },
  { v: "facebook", l: "Facebook" },
];
const TONES = ["friendly", "professional", "energetic", "luxury", "witty"];
const LANGUAGES = ["English", "Tamil", "Hindi", "Telugu", "Kannada", "Malayalam"];

interface Generation {
  id: string;
  prompt: string;
  output: string;
  provider: string;
  created_at: string;
}

function parseHooks(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/\(\s*score:\s*(\d{1,3})\s*\)/i);
      const clean = l
        .replace(/\(\s*score:\s*\d{1,3}\s*\)/i, "")
        .replace(/^\d+[.)]\s*/, "")
        .replace(/^[-*]\s*/, "")
        .trim();
      return { text: clean, score: m ? Math.min(100, Number(m[1])) : null };
    })
    .filter((h) => h.text.length > 0);
}

function scoreTone(score: number | null) {
  if (score == null) return "border-line-2 text-muted";
  if (score >= 85) return "border-brand text-brand-ink";
  if (score >= 70) return "border-ok text-ok";
  if (score >= 50) return "border-warn text-warn";
  return "border-danger text-danger";
}

function ToolWorkspace() {
  const params = useParams<{ tool: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const { workspace, can } = useApp();
  const toolKey = params.tool;
  const tool = TOOLS[toolKey];

  const [prompt, setPrompt] = useState(() => search.get("topic") ?? "");
  const [context, setContext] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [tone, setTone] = useState("friendly");
  const [language, setLanguage] = useState(tool?.requiresLanguage ? "Tamil" : "English");
  const [formula, setFormula] = useState(VIRAL_FORMULAS[0].id);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [selectedHook, setSelectedHook] = useState(0);
  const [recent, setRecent] = useState<Generation[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const canSave = can("write_content") || can("support");

  const loadRecent = useCallback(async () => {
    if (!tool) return;
    const { data } = await supabase
      .from("ai_generations")
      .select("id,prompt,output,provider,created_at")
      .eq("workspace_id", workspace.id)
      .eq("kind", tool.kind)
      .order("created_at", { ascending: false })
      .limit(10);
    setRecent((data ?? []) as Generation[]);
  }, [supabase, workspace.id, tool]);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  if (!tool) {
    return (
      <EmptyState
        icon={Wand2}
        title="Tool not found"
        description="That writing tool doesn't exist."
        action={
          <Link href="/app/write">
            <Button variant="secondary">Back to Write</Button>
          </Link>
        }
      />
    );
  }

  const generate = async () => {
    if (!prompt.trim()) return toast("Describe what you want first", "error");
    setLoading(true);
    try {
      const f = VIRAL_FORMULAS.find((x) => x.id === formula);
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          kind: tool.kind,
          prompt,
          tone,
          platform,
          language,
          context: context || undefined,
          formula: toolKey === "scripts" && f ? `${f.name}: ${f.structure}` : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      setOutput(json.output);
      setProvider(json.provider);
      setSelectedHook(0);
      loadRecent();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      toast("Couldn't copy", "error");
    }
  };

  const save = async (text: string, kind: SaveKind = tool.saveKind) => {
    const title = (text.split("\n").find((l) => l.trim()) ?? prompt).replace(/^\d+[.)]\s*/, "").slice(0, 100) || tool.name;
    const { error } = await supabase.from("saved_items").insert({
      tenant_id: workspace.tenant_id,
      workspace_id: workspace.id,
      kind,
      title,
      content: text,
      meta: { tool: toolKey, topic: prompt },
    });
    if (error) return toast(errMsg(error), "error");
    toast("Saved");
  };

  const toComposer = (text: string) => router.push(`/app/compose?draft=${encodeURIComponent(text)}`);

  const hooks = tool.kind === "hook" ? parseHooks(output) : [];

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-1 text-sm text-muted">
          <Link href="/app/write" className="hover:text-brand-ink">
            Write
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="font-medium text-ink">{tool.name}</span>
        </nav>
        <p className="mt-1 text-sm text-muted">{tool.description}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="space-y-4 rounded-3xl p-5 lg:col-span-2">
          {toolKey === "scripts" && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Viral formula</p>
              <div className="grid gap-2">
                {VIRAL_FORMULAS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormula(f.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      formula === f.id ? "border-brand bg-brand/5" : "border-line hover:border-brand/40",
                    )}
                  >
                    <p className="text-sm font-semibold">{f.name}</p>
                    <p className="mt-0.5 text-xs text-muted">{f.structure}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          <Field label={toolKey === "translate" ? "Text to translate" : "Topic or idea"}>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={tool.placeholder} rows={4} />
          </Field>
          {tool.contextLabel && (
            <Field label={tool.contextLabel}>
              <Textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="Paste a caption, transcript, article text or link" rows={4} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Platform">
              <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => (
                  <option key={p.v} value={p.v}>
                    {p.l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tone">
              <Select value={tone} onChange={(e) => setTone(e.target.value)}>
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={tool.requiresLanguage ? "Translate to" : "Language"}>
            <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </Field>
          <Button onClick={generate} loading={loading} className="h-11 w-full">
            <Sparkles className="size-4" /> {output ? "Generate again" : "Generate"}
          </Button>
        </Card>

        <Card className="flex min-h-80 flex-col rounded-3xl lg:col-span-3">
          <CardHeader
            title="Result"
            description={provider === "template" ? undefined : "Review and edit before posting."}
            action={provider === "template" ? <Badge tone="yellow">Template engine — add ANTHROPIC_API_KEY for AI</Badge> : undefined}
          />
          <div className="flex-1 p-4 sm:p-5">
            {loading && <LoadingBlock label="Writing…" />}
            {!loading && !output && (
              <EmptyState icon={Wand2} title="Your content will appear here" description="Fill in the topic and press Generate." />
            )}
            {!loading && output && tool.kind === "hook" && hooks.length > 0 && (
              <div className="space-y-2">
                {hooks.map((h, i) => (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedHook(i)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedHook(i)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-colors",
                      selectedHook === i ? "border-brand bg-brand/5" : "border-line hover:border-brand/40",
                    )}
                  >
                    <span className={cn("size-4 shrink-0 rounded-full border-2", selectedHook === i ? "border-brand bg-brand" : "border-line-2")} />
                    <p className="min-w-0 flex-1 text-sm">{h.text}</p>
                    {h.score != null && (
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full border-2 text-xs font-bold", scoreTone(h.score))}>{h.score}</span>
                    )}
                    <button aria-label="Copy hook" onClick={(e) => {
                        e.stopPropagation();
                        copy(h.text);
                      }} className="text-faint hover:text-brand-ink">
                      <Copy className="size-4" />
                    </button>
                    {canSave && (
                      <button aria-label="Save hook" onClick={(e) => {
                          e.stopPropagation();
                          save(h.text, "hook");
                        }} className="text-faint hover:text-brand-ink">
                        <Bookmark className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!loading && output && (tool.kind !== "hook" || hooks.length === 0) && (
              <div className="rounded-2xl border border-line bg-panel-2 p-4 text-sm leading-relaxed break-words whitespace-pre-wrap">{output}</div>
            )}
          </div>
          {!loading && output && (
            <div className="flex flex-wrap gap-2 border-t border-line p-4">
              {(() => {
                const text = tool.kind === "hook" && hooks[selectedHook] ? hooks[selectedHook].text : output;
                return (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => copy(text)}>
                      <Copy className="size-4" /> Copy
                    </Button>
                    {canSave && (
                      <Button size="sm" variant="secondary" onClick={() => save(text)}>
                        <Bookmark className="size-4" /> Save
                      </Button>
                    )}
                    {can("write_content") && (
                      <Button size="sm" variant="secondary" onClick={() => toComposer(text)}>
                        <PenSquare className="size-4" /> Use in composer
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={generate}>
                      <RefreshCw className="size-4" /> Regenerate
                    </Button>
                  </>
                );
              })()}
            </div>
          )}
        </Card>
      </div>

      <Card className="rounded-3xl">
        <CardHeader title="Recent" description={`Your latest ${tool.name.toLowerCase()} in this workspace`} />
        <div className="divide-y divide-line">
          {recent === null && <LoadingBlock />}
          {recent?.length === 0 && <p className="px-5 py-6 text-sm text-muted">Nothing generated yet.</p>}
          {recent?.map((g) => (
            <div key={g.id} className="px-4 py-3 sm:px-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setExpanded(expanded === g.id ? null : g.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  {expanded === g.id ? <ChevronUp className="size-4 shrink-0 text-faint" /> : <ChevronDown className="size-4 shrink-0 text-faint" />}
                  <span className="truncate text-sm font-medium">{g.prompt}</span>
                </button>
                <span className="hidden shrink-0 text-xs text-faint sm:inline">{timeAgo(g.created_at)}</span>
                <button aria-label="Copy" onClick={() => copy(g.output)} className="text-faint hover:text-brand-ink">
                  <Copy className="size-4" />
                </button>
              </div>
              {expanded === g.id && (
                <div className="mt-2 rounded-xl bg-panel-2 p-3 text-sm break-words whitespace-pre-wrap text-muted">{g.output}</div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function WriteToolPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ToolWorkspace />
    </Suspense>
  );
}
