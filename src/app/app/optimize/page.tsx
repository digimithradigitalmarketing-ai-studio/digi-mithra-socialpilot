"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Copy, Gauge, PenSquare, Sparkles, Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, CardHeader, EmptyState, Field, LoadingBlock, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, errMsg, formatDate } from "@/lib/utils";
import type { ContentPost } from "@/lib/types";

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
const DIMENSIONS = ["Hook", "Clarity", "Value", "Call to action", "Hashtags/SEO"];

interface Analysis {
  overall: number | null;
  dims: { name: string; score: number; fix: string }[];
  fixes: string[];
  improved: string;
}

function parse(text: string): Analysis {
  const lines = text.split("\n");
  const overallMatch = text.match(/overall(?:\s+score)?\s*[:\-]?\s*(\d{1,3})\s*\/\s*100/i);
  const overall = overallMatch ? Math.min(100, Number(overallMatch[1])) : null;
  const dims: Analysis["dims"] = [];
  const fixes: string[] = [];
  let lastScoreLine = -1;
  lines.forEach((raw, idx) => {
    const line = raw.replace(/\*\*/g, "").replace(/^[-*•\d.)\s]+/, "").trim();
    if (/overall/i.test(line) && /\/\s*100/.test(line)) lastScoreLine = Math.max(lastScoreLine, idx);
    for (const d of DIMENSIONS) {
      const re = new RegExp(`^${d.replace("/", "\\/")}\\s*[:\\-]\\s*(\\d{1,2})\\s*\\/\\s*10\\s*[.:—–-]?\\s*(.*)$`, "i");
      const m = line.match(re);
      if (m && !dims.some((x) => x.name === d)) {
        dims.push({ name: d, score: Math.min(10, Number(m[1])), fix: m[2] ?? "" });
        lastScoreLine = Math.max(lastScoreLine, idx);
      }
    }
    if (/^fix\s*:/i.test(line)) fixes.push(line.replace(/^fix\s*:\s*/i, ""));
  });
  // improved version: text after an "improved" heading, otherwise after the score lines
  const improvedIdx = lines.findIndex((l) => /improved (version|post)/i.test(l));
  let improved = "";
  if (improvedIdx >= 0) improved = lines.slice(improvedIdx + 1).join("\n").trim();
  else if (lastScoreLine >= 0) {
    const rest = lines.slice(lastScoreLine + 1).filter((l) => !/^\s*(fix\s*:|\[template)/i.test(l));
    improved = rest.join("\n").trim();
  }
  if (!improved && lastScoreLine < 0) improved = text.trim();
  return { overall, dims, fixes, improved };
}

function ScoreRing({ score }: { score: number | null }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : score / 100;
  const color = score == null ? "var(--color-line-2)" : score >= 80 ? "var(--color-ok)" : score >= 60 ? "var(--color-brand)" : score >= 40 ? "var(--color-warn)" : "var(--color-danger)";
  return (
    <div className="relative size-36">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-line)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-3xl font-bold tabular-nums">{score ?? "—"}</p>
          <p className="text-[11px] text-faint">out of 100</p>
        </div>
      </div>
    </div>
  );
}

export default function OptimizePage() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const { workspace, can } = useApp();
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [postId, setPostId] = useState("");
  const [text, setText] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState("");
  const [provider, setProvider] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    const { data } = await supabase
      .from("content_posts")
      .select("*")
      .eq("workspace_id", workspace.id)
      .in("status", ["draft", "scheduled", "approval_pending", "approved"])
      .order("updated_at", { ascending: false })
      .limit(50);
    setPosts((data ?? []) as ContentPost[]);
  }, [supabase, workspace.id]);

  useEffect(() => {
    setPostId("");
    setRaw("");
    loadPosts();
  }, [loadPosts]);

  const pick = (id: string) => {
    setPostId(id);
    const p = posts.find((x) => x.id === id);
    if (p) {
      const tags = (p.hashtags ?? []).map((h) => `#${h.replace(/^#/, "")}`).join(" ");
      setText([p.body, tags].filter(Boolean).join("\n\n"));
    }
  };

  const analyze = async () => {
    if (!text.trim()) return toast("Paste a post or pick one first", "error");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, kind: "optimize", prompt: text, platform }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Analysis failed");
      setRaw(json.output);
      setProvider(json.provider);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  };

  const analysis = raw ? parse(raw) : null;
  const improved = analysis?.improved ?? "";

  const applyImproved = async () => {
    if (!improved) return;
    const post = posts.find((p) => p.id === postId);
    if (post && post.status === "draft") {
      const { error } = await supabase.from("content_posts").update({ body: improved }).eq("id", post.id);
      if (error) return toast(errMsg(error), "error");
      toast("Draft updated with the improved version");
      setText(improved);
      loadPosts();
      return;
    }
    router.push(`/app/compose?draft=${encodeURIComponent(improved)}`);
  };

  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast("Copied");
    } catch {
      toast("Couldn't copy", "error");
    }
  };

  const save = async () => {
    const { error } = await supabase.from("saved_items").insert({
      tenant_id: workspace.tenant_id,
      workspace_id: workspace.id,
      kind: "post",
      title: (improved || text).split("\n")[0].slice(0, 100) || "Optimized post",
      content: improved || raw,
      meta: { source: "optimize", score: analysis?.overall ?? null, platform },
    });
    if (error) return toast(errMsg(error), "error");
    toast("Saved");
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Score a post on hook, clarity, value, call to action and hashtags — then get an improved version.</p>
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="space-y-4 rounded-3xl p-5 lg:col-span-2">
          {posts.length > 0 && (
            <Field label="Pick a post" hint="(optional)">
              <Select value={postId} onChange={(e) => pick(e.target.value)}>
                <option value="">— Paste text instead —</option>
                {posts.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.status.replace(/_/g, " ")}] {(p.title || p.body).slice(0, 50)}
                    {p.scheduled_at ? ` · ${formatDate(p.scheduled_at, { day: "numeric", month: "short" })}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Post text">
            <Textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (postId) setPostId("");
              }}
              rows={9}
              placeholder="Paste your caption or script here…"
            />
          </Field>
          <Field label="Platform">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.l}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={analyze} loading={loading} className="h-11 w-full">
            <Gauge className="size-4" /> Analyze
          </Button>
        </Card>

        <div className="space-y-5 lg:col-span-3">
          {loading && (
            <Card className="rounded-3xl">
              <LoadingBlock label="Analyzing…" />
            </Card>
          )}
          {!loading && !analysis && (
            <Card className="rounded-3xl">
              <EmptyState icon={Wand2} title="No analysis yet" description="Paste a post and press Analyze to see its score." />
            </Card>
          )}
          {!loading && analysis && (
            <>
              <Card className="rounded-3xl p-5 sm:p-6">
                <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                  <ScoreRing score={analysis.overall} />
                  <div className="w-full min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">Breakdown</h3>
                      {provider === "template" && <Badge tone="yellow">Template engine — add ANTHROPIC_API_KEY for AI</Badge>}
                    </div>
                    {analysis.dims.length === 0 && <p className="text-sm text-muted">No dimension scores were returned.</p>}
                    {analysis.dims.map((d) => (
                      <div key={d.name}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="font-medium">{d.name}</span>
                          <span className={cn("tabular-nums font-semibold", d.score >= 8 ? "text-ok" : d.score >= 6 ? "text-brand-ink" : d.score >= 4 ? "text-warn" : "text-danger")}>{d.score}/10</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                          <div
                            className={cn("h-full rounded-full", d.score >= 8 ? "bg-ok" : d.score >= 6 ? "bg-brand" : d.score >= 4 ? "bg-warn" : "bg-danger")}
                            style={{ width: `${d.score * 10}%` }}
                          />
                        </div>
                        {d.fix && <p className="mt-1 text-xs text-muted">{d.fix}</p>}
                      </div>
                    ))}
                    {analysis.fixes.length > 0 && (
                      <ul className="ml-4 list-disc space-y-1 pt-1 text-xs text-muted">
                        {analysis.fixes.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </Card>

              <Card className="rounded-3xl">
                <CardHeader title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-brand-ink" /> Improved version</span>} />
                <div className="p-4 sm:p-5">
                  {improved ? (
                    <div className="rounded-2xl border border-line bg-panel-2 p-4 text-sm leading-relaxed break-words whitespace-pre-wrap">{improved}</div>
                  ) : (
                    <p className="text-sm text-muted">No rewrite was returned. Follow the fixes above, or add an AI key for automatic rewrites.</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 border-t border-line p-4">
                  {improved && can("write_content") && (
                    <Button size="sm" onClick={applyImproved}>
                      <PenSquare className="size-4" /> Use improved version
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => copy(improved || raw)}>
                    <Copy className="size-4" /> Copy
                  </Button>
                  {(can("write_content") || can("support")) && (
                    <Button size="sm" variant="secondary" onClick={save}>
                      <Bookmark className="size-4" /> Save
                    </Button>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
