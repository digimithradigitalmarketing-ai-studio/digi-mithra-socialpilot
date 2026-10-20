"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Button, Card, CardHeader, EmptyState, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/toast";
import type { ContentPost, PostStatus } from "@/lib/types";
import { cn, errMsg } from "@/lib/utils";

const DOT: Record<PostStatus, string> = {
  draft: "bg-zinc-400",
  approval_pending: "bg-amber-300",
  approved: "bg-sky-300",
  rejected: "bg-red-400",
  scheduled: "bg-violet-400",
  publishing: "bg-sky-400",
  published: "bg-brand",
  partially_failed: "bg-amber-400",
  failed: "bg-red-500",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const postDate = (p: ContentPost) => new Date((p.published_at ?? p.scheduled_at)!);
const timeOf = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

function PostChip({ p }: { p: ContentPost }) {
  return (
    <Link
      href={`/app/posts?id=${p.id}`}
      className="flex items-center gap-1.5 truncate rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] hover:bg-white/10"
      title={p.title ?? p.body}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[p.status])} />
      <span className="truncate">{p.title || p.body}</span>
    </Link>
  );
}

export default function CalendarPage() {
  const supabase = createClient();
  const toast = useToast();
  const { workspace, can } = useApp();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Date>(() => new Date());
  const nudged = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // fallback publisher in case the scheduled job is not running
    if (nudged.current !== workspace.id) {
      nudged.current = workspace.id;
      await supabase.rpc("process_due_posts", { p_workspace: workspace.id });
    }
    const from = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
    const { data, error } = await supabase
      .from("content_posts")
      .select("*")
      .eq("workspace_id", workspace.id)
      .or(`and(scheduled_at.gte.${from},scheduled_at.lt.${to}),and(published_at.gte.${from},published_at.lt.${to})`)
      .order("scheduled_at", { ascending: true });
    if (error) toast(errMsg(error), "error");
    setPosts(((data ?? []) as ContentPost[]).filter((p) => p.published_at || p.scheduled_at));
    setLoading(false);
  }, [supabase, workspace.id, month, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, ContentPost[]>();
    posts.forEach((p) => {
      const d = postDate(p);
      if (d.getMonth() !== month.getMonth()) return;
      const k = dayKey(d);
      m.set(k, [...(m.get(k) ?? []), p].sort((a, b) => postDate(a).getTime() - postDate(b).getTime()));
    });
    return m;
  }, [posts, month]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array.from({ length: offset }, () => null);
    for (let i = 1; i <= days; i++) out.push(new Date(month.getFullYear(), month.getMonth(), i));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const today = dayKey(new Date());
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const selectedPosts = byDay.get(dayKey(selected)) ?? [];
  const daysWithPosts = Array.from(byDay.entries()).sort(([a], [b]) => {
    const pa = byDay.get(a)![0];
    const pb = byDay.get(b)![0];
    return postDate(pa).getTime() - postDate(pb).getTime();
  });


  return (
    <div>
      <PageHeader
        title="Publishing calendar"
        description="Scheduled and published posts by day."
        actions={
          can("write_content") && (
            <Link href="/app/compose">
              <Button>
                <Plus className="size-4" /> New post
              </Button>
            </Link>
          )
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" size="icon" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className="min-w-40 text-center font-semibold">{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2>
        <Button variant="secondary" size="icon" aria-label="Next month" onClick={() => shift(1)}>
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const d = new Date();
            setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            setSelected(d);
          }}
        >
          Today
        </Button>
        <div className="ml-auto hidden flex-wrap gap-3 text-[11px] text-muted lg:flex">
          {(["scheduled", "published", "approval_pending", "failed", "draft"] as PostStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn("size-2 rounded-full", DOT[s])} /> {s.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          {/* desktop / tablet grid */}
          <div className="hidden gap-4 md:grid lg:grid-cols-[minmax(0,1fr)_300px]">
            <Card className="overflow-hidden">
              <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-medium text-faint">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="py-2">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((d, i) => {
                  if (!d) return <div key={i} className="min-h-28 border-r border-b border-line/60 bg-bg/40" />;
                  const k = dayKey(d);
                  const list = byDay.get(k) ?? [];
                  const isSel = k === dayKey(selected);
                  return (
                    <div
                      key={i}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(d)}
                      onKeyDown={(e) => e.key === "Enter" && setSelected(d)}
                      className={cn(
                        "group min-h-28 cursor-pointer border-r border-b border-line/60 p-1.5 transition-colors hover:bg-panel-2",
                        isSel && "bg-brand/5 ring-1 ring-brand/40 ring-inset",
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className={cn("grid size-6 place-items-center rounded-full text-xs", k === today ? "bg-brand font-bold text-black" : "text-muted")}>
                          {d.getDate()}
                        </span>
                        {can("write_content") && (
                          <Link
                            href="/app/compose"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="New post"
                            className="hidden rounded p-0.5 text-faint group-hover:block hover:text-brand"
                          >
                            <Plus className="size-3.5" />
                          </Link>
                        )}
                      </div>
                      <div className="space-y-0.5" onClick={(e) => e.stopPropagation()}>
                        {list.slice(0, 3).map((p) => (
                          <PostChip key={p.id} p={p} />
                        ))}
                        {list.length > 3 && (
                          <button onClick={() => setSelected(d)} className="px-1.5 text-[11px] text-brand">
                            +{list.length - 3} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="self-start">
              <CardHeader title={selected.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })} />
              {selectedPosts.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">Nothing on this day.</p>
              ) : (
                <div className="divide-y divide-line">
                  {selectedPosts.map((p) => (
                    <Link key={p.id} href={`/app/posts?id=${p.id}`} className="block px-4 py-3 hover:bg-panel-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={p.status} />
                        <span className="text-xs text-faint">{timeOf(postDate(p))}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm break-words">{p.title || p.body}</p>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* mobile agenda */}
          <div className="md:hidden">
            {daysWithPosts.length === 0 ? (
              <Card>
                <EmptyState icon={CalendarDays} title="Nothing this month" description="Scheduled and published posts will show here." />
              </Card>
            ) : (
              <div className="space-y-3">
                {daysWithPosts.map(([k, list]) => {
                  const d = postDate(list[0]);
                  return (
                    <Card key={k} className="overflow-hidden">
                      <div className={cn("border-b border-line px-4 py-2 text-xs font-semibold", k === today ? "text-brand" : "text-muted")}>
                        {d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                        {k === today && " · Today"}
                      </div>
                      <div className="divide-y divide-line">
                        {list.map((p) => (
                          <Link key={p.id} href={`/app/posts?id=${p.id}`} className="flex items-start gap-3 px-4 py-3">
                            <span className="w-14 shrink-0 text-xs text-faint">{timeOf(postDate(p))}</span>
                            <div className="min-w-0 flex-1">
                              <StatusBadge status={p.status} />
                              <p className="mt-1 line-clamp-2 text-sm break-words">{p.title || p.body}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
