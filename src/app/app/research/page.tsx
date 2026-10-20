"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, ChevronRight, Clapperboard, Hash, Info, PenSquare, Radar, Search, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, CardHeader, EmptyState, LoadingBlock } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, errMsg, timeAgo } from "@/lib/utils";

const PLATFORMS = [
  { v: "instagram", l: "Instagram" },
  { v: "tiktok", l: "TikTok" },
  { v: "youtube_shorts", l: "Shorts" },
  { v: "youtube", l: "YouTube" },
  { v: "linkedin", l: "LinkedIn" },
  { v: "x", l: "X" },
  { v: "threads", l: "Threads" },
];

const TINTS = ["tint-blue", "tint-amber", "tint-green", "tint-rose", "tint-violet", "tint-sky"];

interface Trend {
  title: string;
  body: string;
}

/** Splits "1. Name — details" style output into cards; falls back to null. */
function parseTrends(text: string): Trend[] | null {
  const lines = text.split("\n");
  const items: Trend[] = [];
  let current: Trend | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (m) {
      if (current) items.push(current);
      const [head, ...rest] = m[2].split(/\s[—–-]\s|:\s/);
      current = { title: head.replace(/\*\*/g, "").trim(), body: rest.join(" — ").trim() };
    } else if (current && line) {
      current.body = [current.body, line.replace(/^[-*•]\s*/, "")].filter(Boolean).join("\n");
    }
  }
  if (current) items.push(current);
  return items.length >= 2 ? items : null;
}

interface Generation {
  id: string;
  prompt: string;
  output: string;
  created_at: string;
}

export default function ResearchPage() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const { workspace, can } = useApp();
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [recent, setRecent] = useState<Generation[] | null>(null);

  const loadRecent = useCallback(async () => {
    const { data } = await supabase
      .from("ai_generations")
      .select("id,prompt,output,created_at")
      .eq("workspace_id", workspace.id)
      .eq("kind", "trends")
      .order("created_at", { ascending: false })
      .limit(6);
    setRecent((data ?? []) as Generation[]);
  }, [supabase, workspace.id]);

  useEffect(() => {
    setOutput("");
    setTags([]);
    loadRecent();
  }, [loadRecent]);

  const ai = async (kind: string, prompt: string) => {
    const res = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, kind, prompt, platform }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Request failed");
    return json as { output: string; provider: string };
  };

  const find = async () => {
    const q = topic.trim() || workspace.industry || workspace.name;
    setLoading(true);
    setTagsLoading(true);
    try {
      const r = await ai("trends", `${q} (platform: ${platform})`);
      setOutput(r.output);
      setProvider(r.provider);
      loadRecent();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
    try {
      const h = await ai("hashtags", q);
      setTags(Array.from(new Set(h.output.match(/#[^\s#,]+/g) ?? h.output.split(/\s+/).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`)))).slice(0, 20));
    } catch {
      setTags([]);
    } finally {
      setTagsLoading(false);
    }
  };

  const copy = async (text: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      toast(label);
    } catch {
      toast("Couldn't copy", "error");
    }
  };

  const save = async (title: string, content: string) => {
    const { error } = await supabase.from("saved_items").insert({
      tenant_id: workspace.tenant_id,
      workspace_id: workspace.id,
      kind: "idea",
      title: title.slice(0, 100),
      content,
      meta: { source: "research", topic, platform },
    });
    if (error) return toast(errMsg(error), "error");
    toast("Saved");
  };

  const trends = output ? parseTrends(output) : null;
  const canSave = can("write_content") || can("support");

  return (
    <div className="space-y-6">
      <Card className="tint-blue overflow-hidden rounded-3xl border-line p-5 sm:p-8">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
          <TrendingUp className="size-4" /> Trending Topics
        </div>
        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Find topics and formats that work in your niche</h2>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
          <Info className="mt-0.5 size-4 shrink-0" /> AI-suggested trends and formats for your niche — not live platform data.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            find();
          }}
          className="mt-5 flex flex-col gap-2 sm:flex-row"
        >
          <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-line-2 bg-panel px-4 focus-within:border-brand">
            <Search className="size-4 shrink-0 text-faint" />
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={`Topic or keyword, e.g. ${workspace.industry ?? "fitness"} for beginners`}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
          </div>
          <Button type="submit" loading={loading} className="h-12 px-6">
            <Radar className="size-4" /> Find trends
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.v}
              onClick={() => setPlatform(p.v)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                platform === p.v ? "border-brand bg-brand text-on-brand" : "border-line-2 bg-panel text-muted hover:text-ink",
              )}
            >
              {p.l}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {loading && <LoadingBlock label="Researching…" />}
          {!loading && !output && (
            <Card className="rounded-3xl">
              <EmptyState icon={Radar} title="Search a topic to see ideas" description="We'll suggest formats, hooks and angles that tend to work for your audience." />
            </Card>
          )}
          {!loading && output && provider === "template" && <Badge tone="yellow">Template engine — add ANTHROPIC_API_KEY for AI research</Badge>}
          {!loading && output && trends && (
            <div className="grid gap-4 sm:grid-cols-2">
              {trends.map((t, i) => (
                <Card key={i} className="flex flex-col overflow-hidden rounded-3xl">
                  <div className={cn(TINTS[i % TINTS.length], "px-5 py-4")}>
                    <p className="text-xs font-semibold text-faint">#{i + 1}</p>
                    <h3 className="mt-0.5 font-bold">{t.title}</h3>
                  </div>
                  <p className="flex-1 px-5 py-4 text-sm break-words whitespace-pre-wrap text-muted">{t.body || "—"}</p>
                  <div className="flex flex-wrap gap-1 border-t border-line px-3 py-2">
                    {can("write_content") && (
                      <button
                        onClick={() => router.push(`/app/compose?draft=${encodeURIComponent(`${t.title}\n\n${t.body}`)}`)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-ink hover:bg-brand/10"
                      >
                        <PenSquare className="size-3.5" /> Write post
                      </button>
                    )}
                    <Link
                      href={`/app/write/scripts?topic=${encodeURIComponent(t.title)}`}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-ink hover:bg-brand/10"
                    >
                      <Clapperboard className="size-3.5" /> Make a script
                    </Link>
                    {canSave && (
                      <button onClick={() => save(t.title, t.body)} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-faint hover:text-brand-ink">
                        <Bookmark className="size-3.5" /> Save
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
          {!loading && output && !trends && (
            <Card className="rounded-3xl p-5">
              <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">{output}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {can("write_content") && (
                  <Button size="sm" variant="secondary" onClick={() => router.push(`/app/compose?draft=${encodeURIComponent(output)}`)}>
                    <PenSquare className="size-4" /> Write post
                  </Button>
                )}
                <Link href={`/app/write/scripts?topic=${encodeURIComponent(topic)}`}>
                  <Button size="sm" variant="secondary">
                    <Clapperboard className="size-4" /> Make a script
                  </Button>
                </Link>
                {canSave && (
                  <Button size="sm" variant="secondary" onClick={() => save(topic || "Research", output)}>
                    <Bookmark className="size-4" /> Save
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="rounded-3xl">
            <CardHeader title={<span className="flex items-center gap-2"><Hash className="size-4 text-brand-ink" /> Keyword ideas</span>} description="Tap a tag to copy it" />
            <div className="p-4">
              {tagsLoading && <LoadingBlock label="Finding keywords…" />}
              {!tagsLoading && tags.length === 0 && <p className="text-sm text-muted">Run a search to see keyword and hashtag ideas.</p>}
              {!tagsLoading && tags.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <button key={t} onClick={() => copy(t, `Copied ${t}`)} className="rounded-full border border-line-2 bg-panel-2 px-2.5 py-1 text-xs hover:border-brand hover:text-brand-ink">
                        {t}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => copy(tags.join(" "), "Copied all tags")} className="mt-3 text-xs font-semibold text-brand-ink hover:underline">
                    Copy all
                  </button>
                </>
              )}
            </div>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader title="Recent research" />
            <div className="divide-y divide-line">
              {recent === null && <LoadingBlock />}
              {recent?.length === 0 && <p className="px-5 py-5 text-sm text-muted">No research yet.</p>}
              {recent?.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    setOutput(g.output);
                    setProvider(null);
                    setTopic(g.prompt.replace(/\s*\(platform:.*\)$/, ""));
                  }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-panel-2 sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{g.prompt}</span>
                    <span className="block text-xs text-faint">{timeAgo(g.created_at)}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-faint" />
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
