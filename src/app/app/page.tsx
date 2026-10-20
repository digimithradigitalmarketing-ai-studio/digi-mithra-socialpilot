"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Inbox,
  Info,
  IndianRupee,
  ListChecks,
  Megaphone,
  MonitorCheck,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  UserPlus,
  WandSparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, EmptyState, Modal, StatCard, StatusBadge, Tabs } from "@/components/ui";
import { BrandWizard } from "@/components/brand-wizard";
import { ContentAgentModal } from "@/components/content-agent";
import { GeneratePostModal } from "@/components/generate-post-modal";
import { AddContentModal, PlatformDot } from "@/components/add-content-modal";
import { FORMAT_COLORS } from "@/lib/content-templates";
import { cn, errMsg, formatDate, formatINR, timeAgo } from "@/lib/utils";
import type { BrandSettings, ContentIdea, ContentPost, ContentSource } from "@/lib/types";

interface Stats {
  published_30d: number;
  scheduled: number;
  pending_approvals: number;
  unread: number;
  open_conversations: number;
  new_leads_7d: number;
  pipeline_value: number;
  won_value: number;
}

interface Progress {
  accounts: number;
  plans: number;
  drafts: number;
  scheduled: number;
  published: number;
}

const ORIGIN_TONES = ["text-brand-ink bg-brand/10", "text-info bg-info/10", "text-danger bg-danger/10", "text-warn bg-warn/10", "text-ok bg-ok/10", "text-purple bg-purple/10"];
const ANGLE_DOT: Record<string, string> = {
  Grow: "bg-brand",
  Inspire: "bg-warn",
  Sell: "bg-ok",
  Value: "bg-purple",
  Educate: "bg-info",
  Entertain: "bg-danger",
};
const INSPIRATION_TABS = [
  { value: "short_form", label: "Short form" },
  { value: "youtube", label: "YouTube" },
  { value: "threads", label: "Threads" },
] as const;
type InspTab = (typeof INSPIRATION_TABS)[number]["value"];

function mondayISO() {
  const d = new Date();
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function DashboardPage() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const { workspace, can } = useApp();
  const brand = (workspace.brand_settings ?? {}) as BrandSettings;
  const onboarded = !!brand.onboarded_at;

  const [wizard, setWizard] = useState(false);
  const [agent, setAgent] = useState(false);
  const [genPost, setGenPost] = useState(false);
  const [addContent, setAddContent] = useState(false);
  const [tutorial, setTutorial] = useState(false);

  const [ideas, setIdeas] = useState<ContentIdea[] | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [tab, setTab] = useState<InspTab>("short_form");
  const [slide, setSlide] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [upcoming, setUpcoming] = useState<ContentPost[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);

  const load = useCallback(async () => {
    await supabase.rpc("process_due_posts", { p_workspace: workspace.id });
    const [idq, srcq, st, up, acc, plans, drafts, sched, pub] = await Promise.all([
      supabase.from("content_ideas").select("*").eq("workspace_id", workspace.id).eq("week_start", mondayISO()).order("created_at", { ascending: false }).limit(12),
      supabase.from("content_sources").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(30),
      supabase.rpc("dashboard_stats", { p_workspace: workspace.id }),
      supabase
        .from("content_posts")
        .select("*")
        .eq("workspace_id", workspace.id)
        .in("status", ["scheduled", "approval_pending", "approved"])
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .limit(5),
      supabase.from("social_accounts").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "connected"),
      supabase.from("content_plans").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
      supabase.from("content_posts").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "draft"),
      supabase.from("content_posts").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).in("status", ["scheduled", "approval_pending", "approved"]),
      supabase.from("content_posts").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).in("status", ["published", "partially_failed"]),
    ]);
    setIdeas((idq.data ?? []) as ContentIdea[]);
    setSources((srcq.data ?? []) as ContentSource[]);
    if (!st.error) setStats(st.data as Stats);
    setUpcoming((up.data ?? []) as ContentPost[]);
    setProgress({ accounts: acc.count ?? 0, plans: plans.count ?? 0, drafts: drafts.count ?? 0, scheduled: sched.count ?? 0, published: pub.count ?? 0 });
  }, [supabase, workspace.id]);

  useEffect(() => {
    setIdeas(null);
    setSavedIds(new Set());
    load();
  }, [load]);

  // first visit to a workspace without a brand profile: open the wizard once
  useEffect(() => {
    if (onboarded || !can("manage_workspace")) return;
    const key = `sp.brandWizardSeen.${workspace.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      return;
    }
    setWizard(true);
  }, [onboarded, workspace.id, can]);

  useEffect(() => setSlide(0), [tab]);

  const newIdeas = async () => {
    setIdeasBusy(true);
    try {
      const res = await fetch("/api/ai/ideas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, count: 9 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate ideas");
      setIdeas((prev) => [...(data.ideas as ContentIdea[]), ...(prev ?? [])].slice(0, 12));
      toast(data.provider === "template" ? "New ideas ready (template engine — add ANTHROPIC_API_KEY for AI)" : "New ideas ready");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setIdeasBusy(false);
    }
  };

  const writeFromIdea = async (idea: ContentIdea) => {
    if (can("write_content")) await supabase.from("content_ideas").update({ used: true }).eq("id", idea.id);
    router.push(`/app/compose?draft=${encodeURIComponent(`${idea.title}\n\n${idea.description ?? ""}`.trim())}`);
  };

  const saveIdea = async (idea: ContentIdea) => {
    if (savedIds.has(idea.id)) return;
    const { error } = await supabase.from("saved_items").insert({
      tenant_id: workspace.tenant_id,
      workspace_id: workspace.id,
      kind: "idea",
      title: idea.title,
      content: idea.description ?? "",
      meta: { angle: idea.angle, format: idea.format, idea_id: idea.id },
    });
    if (error) return toast(errMsg(error), "error");
    setSavedIds((s) => new Set(s).add(idea.id));
    toast("Saved to your collection");
  };

  const tabSources = sources.filter((s) => (tab === "threads" ? s.format === "threads" : s.format === tab));
  const current = tabSources.length ? tabSources[slide % tabSources.length] : null;

  const steps = [
    { label: "Set up your brand", done: onboarded, action: () => setWizard(true) },
    { label: "Connect a social account", done: (progress?.accounts ?? 0) > 0, href: "/app/accounts" },
    { label: "Plan your week with the AI Content Agent", done: (progress?.plans ?? 0) > 0, action: () => setAgent(true) },
    { label: "Review your drafts", done: (progress?.drafts ?? 0) > 0 || (progress?.scheduled ?? 0) > 0, href: "/app/posts" },
    { label: "Schedule a post", done: (progress?.scheduled ?? 0) > 0 || (progress?.published ?? 0) > 0, href: "/app/calendar" },
    { label: "Track your analytics", done: (progress?.published ?? 0) > 0, href: "/app/analytics" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const actions = [
    { title: "AI Content Agent", text: "Generate a week of content in 60 seconds", icon: Sparkles, tint: "tint-blue", iconCls: "text-brand-ink", onClick: () => setAgent(true), primary: true },
    { title: "Generate Post", text: "Enter an idea or link and get viral content", icon: WandSparkles, tint: "tint-amber", iconCls: "text-warn", onClick: () => setGenPost(true) },
    { title: "Profile Analyst", text: "Analyze your competitors accounts", icon: MonitorCheck, tint: "tint-green", iconCls: "text-ok", href: "/app/competitors" },
    { title: "Trending Topics", text: "Find viral topics and formats in your niche", icon: Search, tint: "tint-rose", iconCls: "text-danger", href: "/app/research" },
  ];

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-6">
        {!onboarded ? (
          <Card className="tint-blue flex flex-col gap-4 border-brand/15 p-5 sm:flex-row sm:items-center sm:p-6">
            <Megaphone className="size-10 shrink-0 text-brand-ink" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Personalize Your Content</h2>
              <p className="mt-0.5 text-sm text-muted">We don&apos;t have much info about your brand. Add more details to avoid getting generic content.</p>
            </div>
            <Button onClick={() => setWizard(true)} className="shrink-0">
              Set Up My Brand
            </Button>
          </Card>
        ) : (
          <div className="shadow-soft flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-sm">
            <CheckCircle2 className="size-5 shrink-0 text-ok" />
            <span className="min-w-0 flex-1 truncate">
              Brand profile complete{brand.niche ? ` · ${brand.niche}` : ""}
              {brand.tone ? ` · ${brand.tone} tone` : ""}
            </span>
            <button onClick={() => setWizard(true)} className="text-brand-ink hover:underline">
              Edit
            </button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {actions.map((a) => {
            const inner = (
              <>
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-panel shadow-sm">
                  <a.icon className={cn("size-5", a.iconCls)} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{a.title}</span>
                  <span className="block text-sm text-muted">{a.text}</span>
                </span>
                {a.primary ? (
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-on-brand">
                    <ArrowUpRight className="size-4" />
                  </span>
                ) : (
                  <ArrowUpRight className="size-5 shrink-0 text-faint" />
                )}
              </>
            );
            const cls = cn(
              a.tint,
              "shadow-soft flex w-full items-center gap-4 rounded-2xl border border-line p-4 text-left transition-transform hover:-translate-y-0.5 sm:p-5",
              a.primary && "border-brand/30",
            );
            return a.href ? (
              <Link key={a.title} href={a.href} className={cls}>
                {inner}
              </Link>
            ) : (
              <button key={a.title} onClick={a.onClick} className={cls}>
                {inner}
              </button>
            );
          })}
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Weekly Ideas</h2>
            {!!ideas?.length && can("write_content") && (
              <Button variant="secondary" size="sm" onClick={newIdeas} loading={ideasBusy}>
                <RefreshCw className="size-3.5" /> New ideas
              </Button>
            )}
          </div>
          {ideas === null ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-2xl border border-line bg-panel" />
              ))}
            </div>
          ) : ideas.length === 0 ? (
            <Card>
              <EmptyState
                icon={Sparkles}
                title="No ideas for this week yet"
                description="Get fresh, brand-specific content ideas for the week in one click."
                action={
                  can("write_content") ? (
                    <Button onClick={newIdeas} loading={ideasBusy}>
                      <Sparkles className="size-4" /> Generate this week&apos;s ideas
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {ideas.map((idea) => {
                const saved = savedIds.has(idea.id);
                return (
                  <Card key={idea.id} className={cn("flex flex-col", idea.used && "opacity-70")}>
                    <div className="flex-1 p-4">
                      <h3 className="line-clamp-2 font-semibold leading-snug">{idea.title}</h3>
                      <p className="mt-2 line-clamp-3 text-sm text-muted">{idea.description}</p>
                    </div>
                    <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
                      <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", ORIGIN_TONES[hash(idea.origin) % ORIGIN_TONES.length])}>
                        {idea.origin}
                        <Info className="size-3" />
                      </span>
                      <span className="flex items-center gap-1.5 border-l border-line pl-2 text-xs text-muted">
                        <span className={cn("size-2 rounded-full", ANGLE_DOT[idea.angle] ?? "bg-brand")} />
                        {idea.angle}
                      </span>
                      <span className="flex-1" />
                      <button aria-label="Write post from idea" title="Write a post" onClick={() => writeFromIdea(idea)} className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-brand-ink">
                        <WandSparkles className="size-4" />
                      </button>
                      <button aria-label={saved ? "Saved" : "Save idea"} title="Save" onClick={() => saveIdea(idea)} className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-brand-ink">
                        <Bookmark className={cn("size-4", saved && "fill-current text-brand-ink")} />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Performance snapshot</h2>
          {stats && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard label="Published (30 days)" value={stats.published_30d} icon={CheckCircle2} />
              <StatCard label="Scheduled" value={stats.scheduled} icon={CalendarClock} tone="info" />
              <StatCard label="Pending approvals" value={stats.pending_approvals} icon={ListChecks} tone="warn" />
              <StatCard label="Unread messages" value={stats.unread} icon={Inbox} tone="info" hint={`${stats.open_conversations} open`} />
              <StatCard label="New leads (7 days)" value={stats.new_leads_7d} icon={UserPlus} />
              <StatCard label="Pipeline value" value={formatINR(stats.pipeline_value)} icon={IndianRupee} hint={`Won ${formatINR(stats.won_value)}`} />
            </div>
          )}
          <Card>
            <CardHeader title="Upcoming posts" action={<Link href="/app/calendar" className="text-xs text-brand-ink hover:underline">Calendar</Link>} />
            <div className="divide-y divide-line">
              {upcoming.length === 0 && <EmptyState icon={CalendarClock} title="Nothing scheduled" description="Use the AI Content Agent to plan your week." />}
              {upcoming.map((p) => (
                <Link key={p.id} href={`/app/posts?id=${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-panel-2 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.title || p.body.slice(0, 70)}</p>
                    <p className="text-xs text-faint">{p.scheduled_at ? `${formatDate(p.scheduled_at)} · ${timeAgo(p.scheduled_at)}` : "Not scheduled"}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              ))}
            </div>
          </Card>
        </section>
      </div>

      <aside className="w-full space-y-5 lg:sticky lg:top-24 lg:w-[360px] lg:shrink-0">
        <Card className="flex items-center gap-4 p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-panel-2 text-2xl">😎</span>
          <div className="min-w-0">
            <p className="font-semibold">How to use Social Pilot: Step-by-Step</p>
            <button onClick={() => setTutorial(true)} className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-brand-ink underline-offset-2 hover:underline">
              <Play className="size-3.5 fill-current" /> Watch tutorial
            </button>
            <p className="mt-1 text-xs text-faint">
              {doneCount}/{steps.length} steps done
            </p>
          </div>
        </Card>

        <Card className="tint-violet p-4">
          <h2 className="text-gradient py-1 text-center text-2xl font-bold italic">Weekly Inspiration</h2>
          <div className="mt-3">
            <Tabs value={tab} onChange={setTab} tabs={INSPIRATION_TABS.map((t) => ({ value: t.value, label: t.label }))} />
          </div>
          {current ? (
            <div className="relative mx-auto aspect-[9/16] max-h-[440px] w-full max-w-[260px] overflow-hidden rounded-[28px] border-4 border-panel bg-ink shadow-xl">
              {current.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current.thumbnail_url} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${FORMAT_COLORS[current.format ?? ""] ?? "#4b82f7"}, #1e1b4b)` }} />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80" />
              {!current.thumbnail_url && (
                <p className="absolute inset-x-4 top-16 line-clamp-6 text-lg font-bold text-white">{current.text_content || current.description || current.title}</p>
              )}
              <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 text-white">
                <PlatformDot platform={current.kind === "text" ? "website" : current.platform} className="size-8 text-[10px] ring-2 ring-white/60" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{current.title || current.url || "Inspiration"}</p>
                  <p className="text-[11px] opacity-80">{timeAgo(current.created_at)}</p>
                </div>
                {current.url && (
                  <a href={current.url} target="_blank" rel="noopener noreferrer" aria-label="Open original" className="rounded-full bg-white/20 p-1.5 backdrop-blur">
                    <ArrowUpRight className="size-4" />
                  </a>
                )}
              </div>
              {tabSources.length > 1 && (
                <>
                  <button aria-label="Previous" onClick={() => setSlide((s) => (s - 1 + tabSources.length) % tabSources.length)} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white">
                    <ChevronLeft className="size-4" />
                  </button>
                  <button aria-label="Next" onClick={() => setSlide((s) => (s + 1) % tabSources.length)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white">
                    <ChevronRight className="size-4" />
                  </button>
                  <div className="absolute inset-x-0 top-3 flex justify-center gap-1">
                    {tabSources.slice(0, 8).map((s, i) => (
                      <span key={s.id} className={cn("h-1 w-5 rounded-full", i === slide % tabSources.length ? "bg-white" : "bg-white/40")} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="mx-auto grid aspect-[9/16] max-h-[360px] w-full max-w-[240px] place-items-center rounded-[28px] border-2 border-dashed border-line-2 bg-panel/60 p-6 text-center text-sm text-muted">
              Save reels, videos and posts you love to build your inspiration board.
            </div>
          )}
          {can("write_content") && (
            <Button variant="secondary" className="mt-4 w-full" onClick={() => setAddContent(true)}>
              <Plus className="size-4" /> Add inspiration
            </Button>
          )}
        </Card>
      </aside>

      <BrandWizard open={wizard} onClose={() => setWizard(false)} />
      <ContentAgentModal open={agent} onClose={() => { setAgent(false); load(); }} />
      <GeneratePostModal open={genPost} onClose={() => setGenPost(false)} />
      <AddContentModal open={addContent} onClose={() => setAddContent(false)} defaultFormat={tab} onAdded={(s) => setSources((prev) => [s, ...prev])} />

      <Modal open={tutorial} onClose={() => setTutorial(false)} title="Getting started">
        <p className="mb-4 text-sm text-muted">Six steps to your first week on autopilot. Steps tick off automatically as you go.</p>
        <ol className="space-y-2">
          {steps.map((s, i) => {
            const body = (
              <>
                {s.done ? <CheckCircle2 className="size-5 shrink-0 text-ok" /> : <Circle className="size-5 shrink-0 text-faint" />}
                <span className={cn("flex-1 text-sm", s.done && "text-muted line-through")}>
                  {i + 1}. {s.label}
                </span>
                {!s.done && <ArrowUpRight className="size-4 text-brand-ink" />}
              </>
            );
            const cls = "flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:border-brand/40";
            return (
              <li key={s.label}>
                {s.href ? (
                  <Link href={s.href} className={cls} onClick={() => setTutorial(false)}>
                    {body}
                  </Link>
                ) : (
                  <button
                    className={cls}
                    onClick={() => {
                      setTutorial(false);
                      s.action?.();
                    }}
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </Modal>
    </div>
  );
}
