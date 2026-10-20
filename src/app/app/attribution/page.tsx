"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, IndianRupee, MousePointerClick, Target, TrendingUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Card, CardHeader, EmptyState, LoadingBlock, PageHeader, StatCard, Tabs } from "@/components/ui";
import { useToast } from "@/components/toast";
import { downloadFile, errMsg, formatINR, timeAgo, toCSV } from "@/lib/utils";

type Range = "7" | "30" | "90" | "all";

interface LeadRow {
  id: string;
  title: string;
  value_inr: number;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  campaign_id: string | null;
  landing_page_id: string | null;
  stage_id: string | null;
  created_at: string;
  contacts: { name: string } | null;
}

interface Group {
  key: string;
  leads: number;
  won: number;
  wonValue: number;
}

const NONE = "(none)";

function groupBy(leads: LeadRow[], keyOf: (l: LeadRow) => string, isWon: (l: LeadRow) => boolean): Group[] {
  const map = new Map<string, Group>();
  for (const l of leads) {
    const k = keyOf(l) || NONE;
    const g = map.get(k) ?? { key: k, leads: 0, won: 0, wonValue: 0 };
    g.leads++;
    if (isWon(l)) {
      g.won++;
      g.wonValue += l.value_inr ?? 0;
    }
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.leads - a.leads || b.wonValue - a.wonValue);
}

function BarTable({ title, description, rows, filename }: { title: string; description?: string; rows: Group[]; filename: string }) {
  const max = Math.max(1, ...rows.map((r) => r.leads));
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          rows.length > 0 && (
            <button
              aria-label={`Export ${title} CSV`}
              onClick={() => downloadFile(filename, toCSV(rows.map((r) => ({ name: r.key, leads: r.leads, won: r.won, won_value_inr: r.wonValue }))))}
              className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-ink"
            >
              <Download className="size-4" />
            </button>
          )
        }
      />
      <div className="space-y-3 p-4 sm:p-5">
        {rows.length === 0 && <p className="text-sm text-muted">No data in this period.</p>}
        {rows.slice(0, 8).map((r) => (
          <div key={r.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className={r.key === NONE ? "truncate text-faint" : "truncate capitalize"}>{r.key.replace(/_/g, " ")}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {r.leads} leads · {r.won} won · {formatINR(r.wonValue)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-brand" style={{ width: `${(r.leads / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AttributionPage() {
  const supabase = createClient();
  const toast = useToast();
  const { workspace } = useApp();
  const [range, setRange] = useState<Range>("30");
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [wonStages, setWonStages] = useState<Set<string>>(new Set());
  const [campaigns, setCampaigns] = useState<Record<string, string>>({});
  const [pages, setPages] = useState<{ id: string; title: string; slug: string; views: number; submissions: number }[]>([]);

  const load = useCallback(async () => {
    setLeads(null);
    let q = supabase
      .from("leads")
      .select("id,title,value_inr,source,utm_source,utm_medium,utm_campaign,campaign_id,landing_page_id,stage_id,created_at,contacts(name)")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (range !== "all") q = q.gte("created_at", new Date(Date.now() - Number(range) * 86400000).toISOString());
    const [l, s, c, p] = await Promise.all([
      q,
      supabase.from("pipeline_stages").select("id,is_won").eq("workspace_id", workspace.id),
      supabase.from("campaigns").select("id,name").eq("workspace_id", workspace.id),
      supabase.from("landing_pages").select("id,title,slug,views,submissions").eq("workspace_id", workspace.id),
    ]);
    if (l.error) toast(errMsg(l.error), "error");
    setLeads((l.data ?? []) as unknown as LeadRow[]);
    setWonStages(new Set((s.data ?? []).filter((x: { is_won: boolean }) => x.is_won).map((x: { id: string }) => x.id)));
    setCampaigns(Object.fromEntries((c.data ?? []).map((x: { id: string; name: string }) => [x.id, x.name])));
    setPages((p.data ?? []) as typeof pages);
  }, [supabase, workspace.id, range, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const isWon = useCallback((l: LeadRow) => !!l.stage_id && wonStages.has(l.stage_id), [wonStages]);

  const report = useMemo(() => {
    if (!leads) return null;
    const bySource = groupBy(leads, (l) => l.source ?? "", isWon);
    const byPage = groupBy(leads, (l) => l.landing_page_id ?? "", isWon);
    const pageRows = pages
      .map((p) => {
        const g = byPage.find((x) => x.key === p.id);
        return {
          name: p.title,
          slug: p.slug,
          views: p.views,
          submissions: p.submissions,
          conversion: p.views > 0 ? Math.round((p.submissions / p.views) * 1000) / 10 : 0,
          leads: g?.leads ?? 0,
          won_value_inr: g?.wonValue ?? 0,
        };
      })
      .sort((a, b) => b.leads - a.leads || b.submissions - a.submissions);
    const totalViews = pages.reduce((a, p) => a + p.views, 0);
    const totalSubs = pages.reduce((a, p) => a + p.submissions, 0);
    return {
      bySource,
      byUtmSource: groupBy(leads, (l) => l.utm_source ?? "", isWon),
      byUtmMedium: groupBy(leads, (l) => l.utm_medium ?? "", isWon),
      byUtmCampaign: groupBy(leads, (l) => l.utm_campaign ?? "", isWon),
      byCampaign: groupBy(leads, (l) => (l.campaign_id ? (campaigns[l.campaign_id] ?? "Deleted campaign") : ""), isWon),
      pageRows,
      won: leads.filter(isWon),
      lpConversion: totalViews > 0 ? Math.round((totalSubs / totalViews) * 1000) / 10 : null,
      topSource: bySource.find((g) => g.key !== NONE)?.key ?? null,
      attributed: leads.filter((l) => l.utm_source || l.campaign_id || l.landing_page_id).slice(0, 12),
    };
  }, [leads, pages, campaigns, isWon]);

  return (
    <div className="space-y-5">
      <PageHeader title="Attribution" description="Which sources, campaigns and landing pages bring leads and revenue." />
      <Tabs
        value={range}
        onChange={setRange}
        tabs={[
          { value: "7", label: "7 days" },
          { value: "30", label: "30 days" },
          { value: "90", label: "90 days" },
          { value: "all", label: "All time" },
        ]}
      />

      {!report ? (
        <LoadingBlock />
      ) : leads!.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title="No leads in this period"
            description="Leads from landing pages, inbox automations and manual entry appear here with their source."
            action={
              <Link href="/app/landing-pages" className="text-sm font-medium text-brand-ink hover:underline">
                Create a landing page →
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Leads" value={leads!.length} icon={Users} />
            <StatCard label="Won value" value={formatINR(report.won.reduce((a, l) => a + (l.value_inr ?? 0), 0))} icon={IndianRupee} hint={`${report.won.length} won`} />
            <StatCard
              label="Landing page conversion"
              value={report.lpConversion == null ? "—" : `${report.lpConversion}%`}
              icon={MousePointerClick}
              tone="info"
              hint="All-time views → submissions"
            />
            <StatCard label="Top source" value={<span className="capitalize">{report.topSource?.replace(/_/g, " ") ?? "—"}</span>} icon={TrendingUp} tone="warn" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BarTable title="By source" description="Where the lead was created" rows={report.bySource} filename="attribution-source.csv" />
            <BarTable title="By campaign" rows={report.byCampaign} filename="attribution-campaign.csv" />
            <BarTable title="UTM source" rows={report.byUtmSource} filename="attribution-utm-source.csv" />
            <BarTable title="UTM medium" rows={report.byUtmMedium} filename="attribution-utm-medium.csv" />
            <BarTable title="UTM campaign" rows={report.byUtmCampaign} filename="attribution-utm-campaign.csv" />
          </div>

          <Card>
            <CardHeader
              title="Landing pages"
              description="Views and submissions are all-time; leads and won value follow the selected period."
              action={
                report.pageRows.length > 0 && (
                  <button
                    aria-label="Export landing pages CSV"
                    onClick={() => downloadFile("attribution-landing-pages.csv", toCSV(report.pageRows))}
                    className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-ink"
                  >
                    <Download className="size-4" />
                  </button>
                )
              }
            />
            {report.pageRows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No landing pages yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-line text-xs text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Page</th>
                      <th className="px-4 py-2 text-right font-medium">Views</th>
                      <th className="px-4 py-2 text-right font-medium">Submissions</th>
                      <th className="px-4 py-2 text-right font-medium">Conv.</th>
                      <th className="px-4 py-2 text-right font-medium">Leads</th>
                      <th className="px-4 py-2 text-right font-medium">Won value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {report.pageRows.map((r) => (
                      <tr key={r.slug}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{r.name}</p>
                          <p className="text-xs text-faint">/p/{r.slug}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.views}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.submissions}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.conversion}%</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.leads}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(r.won_value_inr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent attributed leads" description="Leads with a UTM, campaign or landing page." />
            <div className="divide-y divide-line">
              {report.attributed.length === 0 && <p className="px-5 py-6 text-sm text-muted">No attributed leads in this period.</p>}
              {report.attributed.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.title}</p>
                    <p className="truncate text-xs text-muted">
                      {[l.utm_source, l.utm_medium, l.utm_campaign].filter(Boolean).join(" / ") ||
                        (l.campaign_id ? campaigns[l.campaign_id] : null) ||
                        (l.source ?? "").replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums">{formatINR(l.value_inr)}</p>
                    <p className="text-[11px] text-faint">{timeAgo(l.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
