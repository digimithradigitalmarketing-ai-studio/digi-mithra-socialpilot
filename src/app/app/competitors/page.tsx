"use client";

import { useCallback, useEffect, useState } from "react";
import { BookmarkPlus, Copy, ExternalLink, Pencil, Plus, Sparkles, Swords, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, errMsg, formatCompact, timeAgo } from "@/lib/utils";
import type { Competitor } from "@/lib/types";

const PLATFORMS = ["instagram", "facebook", "youtube", "tiktok", "linkedin", "x", "threads", "website"];
const TINTS = ["tint-blue", "tint-rose", "tint-green", "tint-amber", "tint-violet", "tint-sky"];

interface Form {
  name: string;
  platform: string;
  handle: string;
  url: string;
  followers: string;
  posts_per_week: string;
  avg_engagement_rate: string;
  sample_posts: string;
  notes: string;
}
const EMPTY: Form = { name: "", platform: "instagram", handle: "", url: "", followers: "", posts_per_week: "", avg_engagement_rate: "", sample_posts: "", notes: "" };

const num = (v: string) => (v.trim() === "" ? null : Number(v));

export default function CompetitorsPage() {
  const supabase = createClient();
  const { workspace, can } = useApp();
  const toast = useToast();
  const canWrite = can("write_content");
  const [items, setItems] = useState<Competitor[] | null>(null);
  const [myFollowers, setMyFollowers] = useState<number | null>(null);
  const [editing, setEditing] = useState<Competitor | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<Competitor | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data, error }, { data: snaps }] = await Promise.all([
      supabase.from("competitors").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
      supabase.from("metric_snapshots").select("social_account_id,snapshot_date,followers").eq("workspace_id", workspace.id).order("snapshot_date", { ascending: false }).limit(300),
    ]);
    if (error) toast(errMsg(error), "error");
    setItems((data ?? []) as Competitor[]);
    const latest = new Map<string, number>();
    for (const s of (snaps ?? []) as { social_account_id: string; followers: number }[]) {
      if (!latest.has(s.social_account_id)) latest.set(s.social_account_id, s.followers);
    }
    setMyFollowers(latest.size ? [...latest.values()].reduce((a, b) => a + b, 0) : null);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const openEdit = (c: Competitor | "new") => {
    setEditing(c);
    setForm(
      c === "new"
        ? EMPTY
        : {
            name: c.name,
            platform: c.platform,
            handle: c.handle ?? "",
            url: c.url ?? "",
            followers: c.followers?.toString() ?? "",
            posts_per_week: c.posts_per_week?.toString() ?? "",
            avg_engagement_rate: c.avg_engagement_rate?.toString() ?? "",
            sample_posts: c.sample_posts ?? "",
            notes: c.notes ?? "",
          },
    );
  };

  const save = async () => {
    if (!form.name.trim()) return toast("Name is required", "error");
    if (form.url && !/^https:\/\//.test(form.url.trim())) return toast("Profile link must start with https://", "error");
    setSaving(true);
    const row = {
      name: form.name.trim(),
      platform: form.platform,
      handle: form.handle.trim().replace(/^@?/, "@") === "@" ? null : form.handle.trim().replace(/^@?/, "@"),
      url: form.url.trim() || null,
      followers: num(form.followers),
      posts_per_week: num(form.posts_per_week),
      avg_engagement_rate: num(form.avg_engagement_rate),
      sample_posts: form.sample_posts.trim() || null,
      notes: form.notes.trim() || null,
    };
    const { error } =
      editing === "new"
        ? await supabase.from("competitors").insert({ ...row, tenant_id: workspace.tenant_id, workspace_id: workspace.id })
        : await supabase.from("competitors").update(row).eq("id", (editing as Competitor).id);
    setSaving(false);
    if (error) return toast(errMsg(error), "error");
    toast(editing === "new" ? "Competitor added" : "Competitor updated");
    setEditing(null);
    load();
  };

  const remove = async (c: Competitor) => {
    if (!confirm(`Remove ${c.name}?`)) return;
    const { error } = await supabase.from("competitors").delete().eq("id", c.id);
    if (error) return toast(errMsg(error), "error");
    setDetail(null);
    load();
  };

  const analyze = async (c: Competitor) => {
    if (!c.sample_posts && !c.notes) return toast("Add sample posts or notes first so there's something to analyse", "info");
    setAnalyzing(c.id);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          kind: "competitor",
          platform: c.platform,
          prompt: [
            `Competitor: ${c.name} (${c.platform}${c.handle ? `, ${c.handle}` : ""})`,
            c.followers != null && `Followers: ${c.followers}`,
            c.posts_per_week != null && `Posts per week: ${c.posts_per_week}`,
            c.avg_engagement_rate != null && `Average engagement rate: ${c.avg_engagement_rate}%`,
          ]
            .filter(Boolean)
            .join("\n"),
          context: [c.sample_posts && `Sample posts:\n${c.sample_posts}`, c.notes && `Notes:\n${c.notes}`].filter(Boolean).join("\n\n"),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "AI request failed");
      const { data, error } = await supabase
        .from("competitors")
        .update({ analysis: json.output, analyzed_at: new Date().toISOString() })
        .eq("id", c.id)
        .select("*")
        .single();
      if (error) throw error;
      toast("Analysis ready");
      setDetail(data as Competitor);
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setAnalyzing(null);
    }
  };

  const saveIdeas = async (c: Competitor) => {
    const { error } = await supabase.from("saved_items").insert({
      tenant_id: workspace.tenant_id,
      workspace_id: workspace.id,
      kind: "other",
      title: `Competitor analysis: ${c.name}`,
      content: c.analysis ?? "",
      meta: { competitor_id: c.id, platform: c.platform },
    });
    if (error) return toast(errMsg(error), "error");
    toast("Saved to your library");
  };

  if (!items) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Competitors"
        description="Track competitor profiles and let AI find gaps you can win. Enter what you can see on their public profile — we don't scrape other accounts."
        actions={
          canWrite && (
            <Button onClick={() => openEdit("new")}>
              <Plus className="size-4" /> Add competitor
            </Button>
          )
        }
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Swords}
            title="No competitors yet"
            description="Add 2-3 accounts in your niche. Paste a few of their recent captions and AI will break down their content pillars, hooks and gaps."
            action={canWrite && <Button onClick={() => openEdit("new")}>Add your first competitor</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((c, i) => (
              <Card key={c.id} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl text-lg font-bold text-brand-ink", TINTS[i % TINTS.length])}>
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone="blue">{c.platform}</Badge>
                      {c.handle &&
                        (c.url ? (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 truncate text-xs text-muted hover:text-brand-ink">
                            {c.handle} <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <span className="truncate text-xs text-muted">{c.handle}</span>
                        ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-panel-2 p-3 text-center">
                  <div>
                    <p className="font-semibold tabular-nums">{c.followers != null ? formatCompact(c.followers) : "—"}</p>
                    <p className="text-[11px] text-faint">Followers</p>
                  </div>
                  <div>
                    <p className="font-semibold tabular-nums">{c.posts_per_week ?? "—"}</p>
                    <p className="text-[11px] text-faint">Posts / wk</p>
                  </div>
                  <div>
                    <p className="font-semibold tabular-nums">{c.avg_engagement_rate != null ? `${c.avg_engagement_rate}%` : "—"}</p>
                    <p className="text-[11px] text-faint">Engagement</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-faint">{c.analyzed_at ? `Analyzed ${timeAgo(c.analyzed_at)}` : "Not analyzed yet"}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canWrite && (
                    <Button size="sm" onClick={() => analyze(c)} loading={analyzing === c.id}>
                      <Sparkles className="size-3.5" /> Analyze with AI
                    </Button>
                  )}
                  {c.analysis && (
                    <Button size="sm" variant="secondary" onClick={() => setDetail(c)}>
                      View analysis
                    </Button>
                  )}
                  {canWrite && (
                    <>
                      <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => openEdit(c)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove(c)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <Card className="mt-6">
            <CardHeader title="Compare" description="Your accounts vs competitors (numbers you entered)" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-faint">
                    <th className="px-5 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 font-medium">Platform</th>
                    <th className="px-3 py-2 text-right font-medium">Followers</th>
                    <th className="px-3 py-2 text-right font-medium">Posts / wk</th>
                    <th className="px-5 py-2 text-right font-medium">Engagement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <tr className="bg-brand/5">
                    <td className="px-5 py-2.5 font-semibold text-brand-ink">You ({workspace.name})</td>
                    <td className="px-3 py-2.5 text-muted">All connected</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{myFollowers != null ? formatCompact(myFollowers) : "—"}</td>
                    <td className="px-3 py-2.5 text-right">—</td>
                    <td className="px-5 py-2.5 text-right">—</td>
                  </tr>
                  {items.map((c) => (
                    <tr key={c.id}>
                      <td className="px-5 py-2.5 font-medium">{c.name}</td>
                      <td className="px-3 py-2.5 text-muted">{c.platform}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{c.followers != null ? formatCompact(c.followers) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{c.posts_per_week ?? "—"}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{c.avg_engagement_rate != null ? `${c.avg_engagement_rate}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add competitor" : "Edit competitor"}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="FitZone Studio" />
          </Field>
          <Field label="Platform">
            <Select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Handle">
            <Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="@fitzone" />
          </Field>
          <Field label="Profile link" hint="(https)">
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://instagram.com/fitzone" />
          </Field>
          <Field label="Followers">
            <Input type="number" min={0} value={form.followers} onChange={(e) => setForm({ ...form, followers: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Posts / week">
              <Input type="number" min={0} step="0.5" value={form.posts_per_week} onChange={(e) => setForm({ ...form, posts_per_week: e.target.value })} />
            </Field>
            <Field label="Engagement %">
              <Input type="number" min={0} step="0.1" value={form.avg_engagement_rate} onChange={(e) => setForm({ ...form, avg_engagement_rate: e.target.value })} />
            </Field>
          </div>
          <Field label="Sample posts" hint="paste 3-5 of their recent captions" className="sm:col-span-2">
            <Textarea rows={6} value={form.sample_posts} onChange={(e) => setForm({ ...form, sample_posts: e.target.value })} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What do you notice about their content, offers, style?" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `Analysis: ${detail.name}` : ""}
        wide
        footer={
          detail && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(detail.analysis ?? "").then(() => toast("Copied"));
                }}
              >
                <Copy className="size-4" /> Copy
              </Button>
              <Button onClick={() => saveIdeas(detail)}>
                <BookmarkPlus className="size-4" /> Save ideas
              </Button>
            </>
          )
        }
      >
        {detail && (
          <>
            {detail.analyzed_at && <p className="mb-3 text-xs text-faint">Analyzed {timeAgo(detail.analyzed_at)}</p>}
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{detail.analysis}</div>
          </>
        )}
      </Modal>
    </div>
  );
}
