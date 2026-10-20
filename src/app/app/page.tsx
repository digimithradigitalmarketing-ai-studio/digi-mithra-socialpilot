"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Inbox,
  IndianRupee,
  ListChecks,
  PenSquare,
  Plug,
  Send,
  Sparkles,
  Star,
  UserPlus,
  Workflow,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, CardHeader, DemoBadge, EmptyState, LoadingBlock, MiniBars, ProgressBar, StatCard, StatusBadge } from "@/components/ui";
import { ProviderIcon } from "@/components/provider-badge";
import { formatCompact, formatDate, formatINR, timeAgo } from "@/lib/utils";
import type { ContentPost, SocialAccount } from "@/lib/types";

interface Stats {
  accounts: number;
  accounts_attention: number;
  published_30d: number;
  scheduled: number;
  pending_approvals: number;
  failed: number;
  unread: number;
  open_conversations: number;
  new_leads_7d: number;
  pipeline_value: number;
  won_value: number;
  avg_rating: number | null;
  workflow_runs_7d: Record<string, number> | null;
  engagement: { date: string; impressions: number; engagements: number; followers: number }[];
  has_demo_metrics: boolean;
}

interface Usage {
  plan: { name: string; max_posts_per_month: number; ai_credits_per_month: number; max_accounts: number };
  posts: number;
  ai_credits: number;
  accounts: number;
}

interface Activity {
  id: number;
  action: string;
  entity: string;
  meta: { name?: string; status?: string };
  created_at: string;
}

const PAST: Record<string, string> = { insert: "created", update: "updated", delete: "deleted" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const supabase = createClient();
  const { workspace, tenant, profile, can } = useApp();
  const [stats, setStats] = useState<Stats | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [upcoming, setUpcoming] = useState<ContentPost[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    await supabase.rpc("process_due_posts", { p_workspace: workspace.id });
    const [s, u, up, acc, act] = await Promise.all([
      supabase.rpc("dashboard_stats", { p_workspace: workspace.id }),
      supabase.rpc("get_usage", { p_tenant: tenant.id }),
      supabase
        .from("content_posts")
        .select("*")
        .eq("workspace_id", workspace.id)
        .in("status", ["scheduled", "approval_pending", "approved"])
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .limit(6),
      supabase.from("social_accounts").select("*").eq("workspace_id", workspace.id).neq("status", "disconnected").order("created_at"),
      supabase.from("audit_logs").select("id,action,entity,meta,created_at").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(8),
    ]);
    if (s.error) setError(s.error.message);
    setStats(s.data as Stats);
    setUsage(u.data as Usage);
    setUpcoming((up.data ?? []) as ContentPost[]);
    setAccounts((acc.data ?? []) as SocialAccount[]);
    setActivity((act.data ?? []) as Activity[]);
  }, [supabase, workspace.id, tenant.id]);

  useEffect(() => {
    setStats(null);
    load();
  }, [load]);

  if (error) return <EmptyState icon={AlertTriangle} title="Couldn't load the dashboard" description={error} action={<Button onClick={load}>Retry</Button>} />;
  if (!stats) return <LoadingBlock />;

  const runs = stats.workflow_runs_7d ?? {};
  const totalRuns = Object.values(runs).reduce((a, b) => a + b, 0);
  const firstName = (profile?.full_name ?? "").split(" ")[0];
  const showSetup = accounts.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            {greeting()}
            {firstName ? `, ${firstName}` : ""} 👋
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{workspace.name}</h1>
        </div>
        <div className="flex gap-2">
          {can("write_content") && (
            <Link href="/app/compose">
              <Button>
                <PenSquare className="size-4" /> Create post
              </Button>
            </Link>
          )}
          <Link href="/app/ai">
            <Button variant="secondary">
              <Sparkles className="size-4" /> AI studio
            </Button>
          </Link>
        </div>
      </div>

      {showSetup && (
        <Card className="border-brand/30 bg-brand/5 p-5">
          <h2 className="font-semibold">Get started in 3 steps</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              { href: "/app/accounts", icon: Plug, title: "1. Connect an account", text: "Add a social account (demo or official)." },
              { href: "/app/knowledge", icon: Sparkles, title: "2. Teach the AI your brand", text: "Hours, offerings, tone & rules." },
              { href: "/app/compose", icon: Send, title: "3. Schedule your first post", text: "Write with AI and publish." },
            ].map((s) => (
              <Link key={s.href} href={s.href} className="rounded-xl border border-line-2 bg-panel p-4 hover:border-brand/50">
                <s.icon className="size-5 text-brand" />
                <p className="mt-2 text-sm font-semibold">{s.title}</p>
                <p className="text-xs text-muted">{s.text}</p>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Published (30 days)" value={stats.published_30d} icon={CheckCircle2} hint={stats.failed ? `${stats.failed} need attention` : "All good"} />
        <StatCard label="Scheduled" value={stats.scheduled} icon={CalendarClock} tone="info" hint="Queued to publish" />
        <StatCard label="Pending approvals" value={stats.pending_approvals} icon={ListChecks} tone="warn" />
        <StatCard label="Unread messages" value={stats.unread} icon={Inbox} tone="info" hint={`${stats.open_conversations} open conversations`} />
        <StatCard label="New leads (7 days)" value={stats.new_leads_7d} icon={UserPlus} />
        <StatCard label="Pipeline value" value={formatINR(stats.pipeline_value)} icon={IndianRupee} hint={`Won ${formatINR(stats.won_value)}`} />
        <StatCard label="Connected accounts" value={stats.accounts} icon={Plug} tone={stats.accounts_attention ? "danger" : "brand"} hint={stats.accounts_attention ? `${stats.accounts_attention} need reconnect` : undefined} />
        <StatCard label="Avg. review rating" value={stats.avg_rating ?? "—"} icon={Star} tone="warn" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Engagement (30 days) {stats.has_demo_metrics && <DemoBadge />}
              </span>
            }
            description={stats.has_demo_metrics ? "Sample data generated for demo accounts — not real reach." : "Daily engagements across connected accounts"}
          />
          <div className="p-4 sm:p-5">
            {stats.engagement.length ? (
              <>
                <MiniBars data={stats.engagement.map((d) => ({ label: formatDate(d.date, { day: "numeric", month: "short" }), value: d.engagements }))} />
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold">{formatCompact(stats.engagement.reduce((a, d) => a + d.impressions, 0))}</p>
                    <p className="text-xs text-muted">Impressions</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{formatCompact(stats.engagement.reduce((a, d) => a + d.engagements, 0))}</p>
                    <p className="text-xs text-muted">Engagements</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{formatCompact(stats.engagement.at(-1)?.followers ?? 0)}</p>
                    <p className="text-xs text-muted">Followers</p>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState title="No metrics yet" description="Metrics appear once accounts are connected and data is imported." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Account health" action={<Link href="/app/accounts" className="text-xs text-brand hover:underline">Manage</Link>} />
          <div className="divide-y divide-line">
            {accounts.length === 0 && <p className="px-5 py-6 text-sm text-muted">No accounts connected.</p>}
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <ProviderIcon provider={a.provider} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.display_name}</p>
                  <p className="truncate text-xs text-faint">{a.handle}</p>
                </div>
                {a.is_demo && <DemoBadge />}
                <Badge tone={a.status === "connected" ? "green" : "red"}>{a.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Upcoming & pending posts" action={<Link href="/app/calendar" className="text-xs text-brand hover:underline">Calendar</Link>} />
          <div className="divide-y divide-line">
            {upcoming.length === 0 && (
              <EmptyState icon={CalendarClock} title="Nothing scheduled" description="Plan a few posts to keep your audience engaged." />
            )}
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

        <div className="space-y-4">
          <Card>
            <CardHeader title="Automations (7 days)" action={<Workflow className="size-4 text-brand" />} />
            <div className="space-y-2 p-4 sm:p-5">
              {totalRuns === 0 ? (
                <p className="text-sm text-muted">No automation runs yet.</p>
              ) : (
                Object.entries(runs).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-muted">{k.replace(/_/g, " ")}</span>
                    <span className="font-semibold tabular-nums">{v}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
          {usage && (
            <Card>
              <CardHeader title="Plan usage" description={`${usage.plan.name} plan · this month`} action={<Link href="/app/billing" className="text-xs text-brand hover:underline">Billing</Link>} />
              <div className="space-y-3 p-4 sm:p-5">
                {[
                  { label: "Posts", v: usage.posts, max: usage.plan.max_posts_per_month },
                  { label: "AI credits", v: usage.ai_credits, max: usage.plan.ai_credits_per_month },
                  { label: "Accounts", v: usage.accounts, max: usage.plan.max_accounts },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted">{m.label}</span>
                      <span className="tabular-nums">
                        {m.v} / {m.max}
                      </span>
                    </div>
                    <ProgressBar value={m.v} max={m.max} />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Card>
        <CardHeader title="Recent activity" />
        <div className="divide-y divide-line">
          {activity.length === 0 && <p className="px-5 py-6 text-sm text-muted">No activity yet.</p>}
          {activity.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
              <span className="min-w-0 truncate">
                <span className="capitalize text-muted">{a.entity.replace(/_/g, " ")}</span> {PAST[a.action] ?? a.action}
                {a.meta?.name ? <span className="text-ink"> · {a.meta.name}</span> : null}
                {a.meta?.status ? <span className="text-faint"> ({a.meta.status.replace(/_/g, " ")})</span> : null}
              </span>
              <span className="shrink-0 text-xs text-faint">{timeAgo(a.created_at)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
