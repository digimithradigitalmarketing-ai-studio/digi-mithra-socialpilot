"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Clock, Download, FileText, MessageSquare, Trophy, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, DemoBadge, LoadingBlock, MiniBars, PageHeader, StatCard, Tabs } from "@/components/ui";
import { downloadFile, errMsg, formatCompact, formatINR, toCSV } from "@/lib/utils";
import { providerName } from "@/components/provider-badge";

type Range = "7" | "30" | "90";

interface PostRow {
  id: string;
  title: string | null;
  body: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
}
interface LeadRow {
  id: string;
  title: string;
  value_inr: number;
  source: string | null;
  stage_id: string | null;
  created_at: string;
}
interface Stage {
  id: string;
  name: string;
  color: string;
  position: number;
  is_won: boolean;
}
interface Metric {
  snapshot_date: string;
  impressions: number;
  engagements: number;
  followers: number;
  is_demo: boolean;
  social_account_id: string | null;
}
interface Msg {
  conversation_id: string;
  direction: string;
  created_at: string;
  is_ai_draft: boolean;
}

const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

function HBars({ rows, format }: { rows: { label: string; value: number; color?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-sm text-faint">No data in this period</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between gap-2 text-xs">
            <span className="truncate text-muted">{r.label}</span>
            <span className="tabular-nums">{format ? format(r.value) : r.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? "var(--color-brand)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function countBy<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(key(i), (m.get(key(i)) ?? 0) + 1));
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export default function AnalyticsPage() {
  const supabase = createClient();
  const toast = useToast();
  const { workspace } = useApp();
  const [range, setRange] = useState<Range>("30");
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [targets, setTargets] = useState<{ status: string }[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [convs, setConvs] = useState<{ channel: string; created_at: string }[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [runs, setRuns] = useState<{ status: string }[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);

  const days = Number(range);
  const since = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d;
  }, [days]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const iso = since.toISOString();
      const [p, l, s, c, m, r, ms] = await Promise.all([
        supabase
          .from("content_posts")
          .select("id,title,body,status,scheduled_at,published_at,created_at")
          .eq("workspace_id", workspace.id)
          .gte("created_at", iso)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase.from("leads").select("id,title,value_inr,source,stage_id,created_at").eq("workspace_id", workspace.id).gte("created_at", iso).limit(5000),
        supabase.from("pipeline_stages").select("id,name,color,position,is_won").eq("workspace_id", workspace.id).order("position"),
        supabase.from("conversations").select("channel,created_at").eq("workspace_id", workspace.id).gte("created_at", iso).limit(5000),
        supabase
          .from("metric_snapshots")
          .select("snapshot_date,impressions,engagements,followers,is_demo,social_account_id")
          .eq("workspace_id", workspace.id)
          .gte("snapshot_date", dayKey(since))
          .order("snapshot_date"),
        supabase.from("workflow_runs").select("status").eq("workspace_id", workspace.id).gte("started_at", iso).limit(5000),
        supabase
          .from("messages")
          .select("conversation_id,direction,created_at,is_ai_draft")
          .eq("workspace_id", workspace.id)
          .gte("created_at", iso)
          .order("created_at")
          .limit(5000),
      ]);
      for (const res of [p, l, s, c, m, r, ms]) if (res.error) throw res.error;
      const postRows = (p.data ?? []) as PostRow[];
      setPosts(postRows);
      setLeads((l.data ?? []) as LeadRow[]);
      setStages((s.data ?? []) as Stage[]);
      setConvs(c.data ?? []);
      setMetrics((m.data ?? []) as Metric[]);
      setRuns(r.data ?? []);
      setMsgs((ms.data ?? []) as Msg[]);
      const ids = postRows.map((x) => x.id).slice(0, 300);
      if (ids.length) {
        const t = await supabase.from("post_targets").select("status").in("post_id", ids);
        if (t.error) throw t.error;
        setTargets(t.data ?? []);
      } else setTargets([]);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }, [supabase, workspace.id, since, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const dayList = useMemo(() => {
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      return dayKey(d);
    });
  }, [since, days]);

  const label = (k: string) => new Date(k).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  const published = posts.filter((p) => p.status === "published" || p.status === "partially_failed");
  const postsPerDay = dayList.map((k) => ({ label: label(k), value: published.filter((p) => p.published_at && dayKey(p.published_at) === k).length }));
  const leadsPerDay = dayList.map((k) => ({ label: label(k), value: leads.filter((l) => dayKey(l.created_at) === k).length }));
  const finishedTargets = targets.filter((t) => t.status === "published" || t.status === "failed");
  const successRate = finishedTargets.length ? Math.round((targets.filter((t) => t.status === "published").length / finishedTargets.length) * 100) : null;
  const wonStageIds = new Set(stages.filter((s) => s.is_won).map((s) => s.id));
  const wonValue = leads.filter((l) => l.stage_id && wonStageIds.has(l.stage_id)).reduce((a, l) => a + (l.value_inr ?? 0), 0);

  // average first-response time: inbound message -> next sent outbound message in same conversation
  const avgResponseMin = useMemo(() => {
    const pending = new Map<string, number>();
    const diffs: number[] = [];
    for (const m of msgs) {
      const t = new Date(m.created_at).getTime();
      if (m.direction === "inbound") {
        if (!pending.has(m.conversation_id)) pending.set(m.conversation_id, t);
      } else if (m.direction === "outbound" && !m.is_ai_draft && pending.has(m.conversation_id)) {
        diffs.push(t - pending.get(m.conversation_id)!);
        pending.delete(m.conversation_id);
      }
    }
    return diffs.length ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length / 60000) : null;
  }, [msgs]);

  const engagement = dayList.map((k) => {
    const rows = metrics.filter((m) => m.snapshot_date === k);
    return { label: label(k), value: rows.reduce((a, r) => a + r.engagements, 0) };
  });
  const impressions = dayList.map((k) => ({
    label: label(k),
    value: metrics.filter((m) => m.snapshot_date === k).reduce((a, r) => a + r.impressions, 0),
  }));
  const hasDemo = metrics.some((m) => m.is_demo);
  const totalImpr = metrics.reduce((a, m) => a + m.impressions, 0);
  const totalEng = metrics.reduce((a, m) => a + m.engagements, 0);

  const leadsBySource = countBy(leads, (l) => (l.source ? providerName(l.source) : "Unknown"));
  const stageRows = stages.map((s) => ({ label: s.name, value: leads.filter((l) => l.stage_id === s.id).length, color: s.color }));
  const channelRows = countBy(convs, (c) => providerName(c.channel));
  const runRows = countBy(runs, (r) => r.status.replace(/_/g, " "));

  const exportPosts = () =>
    downloadFile(
      `posts-${workspace.slug}-${range}d.csv`,
      toCSV(posts.map((p) => ({ id: p.id, title: p.title ?? "", status: p.status, scheduled_at: p.scheduled_at ?? "", published_at: p.published_at ?? "", created_at: p.created_at, body: p.body }))),
    );
  const exportLeads = () =>
    downloadFile(
      `leads-${workspace.slug}-${range}d.csv`,
      toCSV(leads.map((l) => ({ id: l.id, title: l.title, value_inr: l.value_inr, source: l.source ?? "", stage: stages.find((s) => s.id === l.stage_id)?.name ?? "", created_at: l.created_at }))),
    );
  const exportMetrics = () =>
    downloadFile(
      `metrics-${workspace.slug}-${range}d.csv`,
      toCSV(metrics.map((m) => ({ date: m.snapshot_date, account: m.social_account_id ?? "", followers: m.followers, impressions: m.impressions, engagements: m.engagements, demo: m.is_demo }))),
    );

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Real activity from this workspace. Nothing here is estimated or invented."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={exportPosts} disabled={!posts.length}>
              <Download className="size-3.5" /> Posts CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={exportLeads} disabled={!leads.length}>
              <Download className="size-3.5" /> Leads CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={exportMetrics} disabled={!metrics.length}>
              <Download className="size-3.5" /> Metrics CSV
            </Button>
          </>
        }
      />
      <Tabs<Range>
        value={range}
        onChange={setRange}
        tabs={[
          { value: "7", label: "Last 7 days" },
          { value: "30", label: "Last 30 days" },
          { value: "90", label: "Last 90 days" },
        ]}
      />

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <StatCard label="Posts published" value={published.length} icon={FileText} />
            <StatCard label="Publish success" value={successRate === null ? "—" : `${successRate}%`} icon={CheckCircle2} hint={`${finishedTargets.length} channel deliveries`} />
            <StatCard label="Leads created" value={leads.length} icon={Users} tone="info" />
            <StatCard label="Won value" value={formatINR(wonValue)} icon={Trophy} />
            <StatCard label="Conversations" value={convs.length} icon={MessageSquare} tone="info" />
            <StatCard label="Avg first response" value={avgResponseMin === null ? "—" : avgResponseMin < 60 ? `${avgResponseMin}m` : `${(avgResponseMin / 60).toFixed(1)}h`} icon={Clock} tone="warn" />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Posts published per day" />
              <div className="p-4 pt-10 sm:p-5 sm:pt-10">
                <MiniBars data={postsPerDay} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Leads per day" />
              <div className="p-4 pt-10 sm:p-5 sm:pt-10">
                <MiniBars data={leadsPerDay} color="#38bdf8" />
              </div>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    Social engagement {hasDemo && <DemoBadge />}
                  </span>
                }
                description={
                  hasDemo
                    ? "Demo metrics from demo accounts — connect official accounts for real insights."
                    : `${formatCompact(totalImpr)} impressions · ${formatCompact(totalEng)} engagements`
                }
              />
              {metrics.length === 0 ? (
                <p className="flex items-center justify-center gap-2 py-10 text-sm text-faint">
                  <BarChart3 className="size-4" /> No account metrics yet. Connect an account to start collecting.
                </p>
              ) : (
                <div className="grid gap-6 p-4 pt-10 sm:p-5 sm:pt-10 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs text-muted">Engagements · {formatCompact(totalEng)}</p>
                    <MiniBars data={engagement} formatLabel={formatCompact} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-muted">Impressions · {formatCompact(totalImpr)}</p>
                    <MiniBars data={impressions} color="#a78bfa" formatLabel={formatCompact} />
                  </div>
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Leads by source" />
              <div className="p-4 sm:p-5">
                <HBars rows={leadsBySource} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Leads by stage" />
              <div className="p-4 sm:p-5">
                <HBars rows={stageRows.filter((r) => r.value > 0)} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Inbox conversations by channel" />
              <div className="p-4 sm:p-5">
                <HBars rows={channelRows} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Automation runs by status" />
              <div className="p-4 sm:p-5">
                <HBars rows={runRows} />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
