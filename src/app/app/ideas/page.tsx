"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Info, Lightbulb, Sparkles, Trash2, Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Button, Card, EmptyState, Input, LoadingBlock, Select, Toggle } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, errMsg, formatDate } from "@/lib/utils";
import type { ContentIdea } from "@/lib/types";

const ANGLES: ContentIdea["angle"][] = ["Grow", "Inspire", "Sell", "Value", "Educate", "Entertain"];
const ANGLE_DOT: Record<ContentIdea["angle"], string> = {
  Grow: "bg-brand",
  Inspire: "bg-warn",
  Sell: "bg-ok",
  Value: "bg-purple",
  Educate: "bg-info",
  Entertain: "bg-danger",
};
const ORIGIN_TONE = ["text-brand-ink bg-brand/8 border-brand/20", "text-info bg-info/8 border-info/20", "text-danger bg-danger/8 border-danger/20", "text-warn bg-warn/8 border-warn/20", "text-ok bg-ok/8 border-ok/20"];
const FORMAT_NAMES: Record<string, string> = {
  short_form: "Short form",
  carousel: "Carousel",
  post: "Post",
  youtube: "YouTube",
  threads: "Threads",
  story: "Story",
};

export default function IdeasPage() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const { workspace, can } = useApp();
  const [ideas, setIdeas] = useState<ContentIdea[] | null>(null);
  const [angle, setAngle] = useState<ContentIdea["angle"] | "all">("all");
  const [format, setFormat] = useState("all");
  const [showUsed, setShowUsed] = useState(false);
  const [focus, setFocus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [templateMode, setTemplateMode] = useState(false);
  const writer = can("write_content");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("content_ideas")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("week_start", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) toast(errMsg(error), "error");
    setIdeas((data ?? []) as ContentIdea[]);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    setIdeas(null);
    load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/ideas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, count: 9, focus: focus.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't generate ideas");
      setTemplateMode(json.provider === "template");
      toast(`${json.ideas?.length ?? 0} new ideas added`);
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setGenerating(false);
    }
  };

  const writeFromIdea = async (idea: ContentIdea) => {
    if (!idea.used) await supabase.from("content_ideas").update({ used: true }).eq("id", idea.id);
    router.push(`/app/compose?draft=${encodeURIComponent(`${idea.title}\n\n${idea.description ?? ""}`.trim())}`);
  };

  const save = async (idea: ContentIdea) => {
    const { error } = await supabase.from("saved_items").insert({
      tenant_id: workspace.tenant_id,
      workspace_id: workspace.id,
      kind: "idea",
      title: idea.title,
      content: idea.description ?? "",
      meta: { idea_id: idea.id, angle: idea.angle, format: idea.format },
    });
    if (error) return toast(errMsg(error), "error");
    toast("Saved");
  };

  const remove = async (idea: ContentIdea) => {
    const { error } = await supabase.from("content_ideas").delete().eq("id", idea.id);
    if (error) return toast(errMsg(error), "error");
    setIdeas((list) => (list ?? []).filter((i) => i.id !== idea.id));
  };

  const groups = useMemo(() => {
    const filtered = (ideas ?? []).filter(
      (i) => (angle === "all" || i.angle === angle) && (format === "all" || i.format === format) && (showUsed || !i.used),
    );
    const map = new Map<string, ContentIdea[]>();
    for (const i of filtered) map.set(i.week_start, [...(map.get(i.week_start) ?? []), i]);
    return [...map.entries()];
  }, [ideas, angle, format, showUsed]);

  const formats = useMemo(() => Array.from(new Set((ideas ?? []).map((i) => i.format).filter(Boolean))) as string[], [ideas]);

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-4 rounded-3xl p-5 sm:p-6 lg:flex-row lg:items-center">
        <div className="tint-amber grid size-12 shrink-0 place-items-center rounded-2xl">
          <Lightbulb className="size-6 text-warn" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Weekly content ideas</h2>
          <p className="text-sm text-muted">Fresh ideas tailored to your brand. Turn any idea into a post with one tap.</p>
        </div>
        {writer && (
          <form
            className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto"
            onSubmit={(e) => {
              e.preventDefault();
              generate();
            }}
          >
            <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Optional focus, e.g. Diwali offer" className="sm:w-64" />
            <Button type="submit" loading={generating}>
              <Sparkles className="size-4" /> Generate ideas
            </Button>
          </form>
        )}
      </Card>

      {templateMode && (
        <p className="flex items-center gap-2 text-xs text-warn">
          <Info className="size-4" /> These came from the template engine — add ANTHROPIC_API_KEY for AI ideas.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setAngle("all")}
          className={cn("rounded-full border px-3 py-1 text-xs font-medium", angle === "all" ? "border-brand bg-brand text-on-brand" : "border-line-2 bg-panel text-muted")}
        >
          All angles
        </button>
        {ANGLES.map((a) => (
          <button
            key={a}
            onClick={() => setAngle(a)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              angle === a ? "border-brand bg-brand/10 text-brand-ink" : "border-line-2 bg-panel text-muted",
            )}
          >
            <span className={cn("size-2 rounded-full", ANGLE_DOT[a])} /> {a}
          </button>
        ))}
        <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
          <Select value={format} onChange={(e) => setFormat(e.target.value)} className="h-9 w-40">
            <option value="all">All formats</option>
            {formats.map((f) => (
              <option key={f} value={f}>
                {FORMAT_NAMES[f] ?? f}
              </option>
            ))}
          </Select>
          <Toggle checked={showUsed} onChange={setShowUsed} label="Show used" />
        </div>
      </div>

      {ideas === null && <LoadingBlock />}
      {ideas !== null && groups.length === 0 && (
        <Card className="rounded-3xl">
          <EmptyState
            icon={Lightbulb}
            title={ideas.length ? "No ideas match these filters" : "No ideas yet"}
            description={ideas.length ? "Try another angle or show used ideas." : "Generate a fresh batch of ideas for this week."}
            action={
              writer && !ideas.length ? (
                <Button onClick={generate} loading={generating}>
                  <Sparkles className="size-4" /> Generate ideas
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {groups.map(([week, list]) => (
        <section key={week}>
          <h3 className="mb-3 text-sm font-semibold text-muted">Week of {formatDate(week, { day: "numeric", month: "short", year: "numeric" })}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((idea, idx) => (
              <Card key={idea.id} className={cn("flex flex-col rounded-2xl", idea.used && "opacity-70")}>
                <div className="flex-1 p-4 sm:p-5">
                  <h4 className="leading-snug font-semibold">{idea.title}</h4>
                  {idea.description && <p className="mt-2 text-sm text-muted">{idea.description}</p>}
                </div>
                <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
                  <span className={cn("shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", ORIGIN_TONE[idx % ORIGIN_TONE.length])}>{idea.origin}</span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <span className={cn("size-2 rounded-full", ANGLE_DOT[idea.angle])} /> {idea.angle}
                  </span>
                  {idea.format && <span className="hidden text-xs text-faint sm:inline">· {FORMAT_NAMES[idea.format] ?? idea.format}</span>}
                  <span className="flex-1" />
                  {writer && (
                    <button aria-label="Write post from idea" title="Write post" onClick={() => writeFromIdea(idea)} className="rounded-lg p-1.5 text-faint hover:bg-brand/10 hover:text-brand-ink">
                      <Wand2 className="size-4" />
                    </button>
                  )}
                  {(writer || can("support")) && (
                    <button aria-label="Save idea" title="Save" onClick={() => save(idea)} className="rounded-lg p-1.5 text-faint hover:bg-brand/10 hover:text-brand-ink">
                      <Bookmark className="size-4" />
                    </button>
                  )}
                  {writer && (
                    <button aria-label="Delete idea" title="Delete" onClick={() => remove(idea)} className="rounded-lg p-1.5 text-faint hover:bg-danger/10 hover:text-danger">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
