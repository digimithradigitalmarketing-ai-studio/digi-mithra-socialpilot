"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Megaphone, Pencil, PenSquare, Plus, Trash2, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select, Textarea, type Tone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { errMsg, formatDate, formatINR } from "@/lib/utils";

interface Campaign {
  id: string;
  name: string;
  goal: string | null;
  status: "planned" | "active" | "completed" | "paused";
  start_date: string | null;
  end_date: string | null;
  budget_inr: number | null;
  created_at: string;
}

const STATUS_TONE: Record<Campaign["status"], Tone> = { planned: "blue", active: "green", completed: "gray", paused: "yellow" };

export default function CampaignsPage() {
  const supabase = createClient();
  const { workspace, can } = useApp();
  const toast = useToast();
  const [items, setItems] = useState<Campaign[]>([]);
  const [counts, setCounts] = useState<Record<string, { total: number; published: number }>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);

  const load = useCallback(async () => {
    const [{ data, error }, { data: posts }] = await Promise.all([
      supabase.from("campaigns").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
      supabase.from("content_posts").select("campaign_id,status").eq("workspace_id", workspace.id).not("campaign_id", "is", null),
    ]);
    if (error) toast(errMsg(error), "error");
    setItems((data ?? []) as Campaign[]);
    const c: Record<string, { total: number; published: number }> = {};
    for (const p of (posts ?? []) as { campaign_id: string; status: string }[]) {
      c[p.campaign_id] ??= { total: 0, published: 0 };
      c[p.campaign_id].total++;
      if (p.status === "published" || p.status === "partially_failed") c[p.campaign_id].published++;
    }
    setCounts(c);
    setLoading(false);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const remove = async (c: Campaign) => {
    if (!confirm(`Delete campaign “${c.name}”? Posts stay but are unlinked.`)) return;
    const { error } = await supabase.from("campaigns").delete().eq("id", c.id);
    if (error) toast(errMsg(error), "error");
    else {
      toast("Campaign deleted");
      load();
    }
  };

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Group posts around launches, offers and seasonal pushes."
        actions={
          can("write_content") && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> New campaign
            </Button>
          )
        }
      />

      {loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description="Create a campaign such as “Diwali membership offer”, then attach posts in the composer."
            action={
              can("write_content") && (
                <Button onClick={() => setEditing("new")}>
                  <Plus className="size-4" /> New campaign
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => {
            const n = counts[c.id] ?? { total: 0, published: 0 };
            return (
              <Card key={c.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-snug">{c.name}</p>
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                </div>
                {c.goal && <p className="mt-1 line-clamp-2 text-sm text-muted">{c.goal}</p>}
                <div className="mt-3 space-y-1.5 text-xs text-muted">
                  <p className="flex items-center gap-1.5">
                    <CalendarRange className="size-3.5" />
                    {c.start_date ? formatDate(c.start_date, { day: "numeric", month: "short" }) : "No start"} –{" "}
                    {c.end_date ? formatDate(c.end_date, { day: "numeric", month: "short", year: "numeric" }) : "open"}
                  </p>
                  {c.budget_inr != null && (
                    <p className="flex items-center gap-1.5">
                      <Wallet className="size-3.5" /> Budget {formatINR(c.budget_inr)}
                    </p>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-panel-2 py-2">
                    <p className="text-lg font-bold tabular-nums">{n.total}</p>
                    <p className="text-[10px] text-faint">Posts</p>
                  </div>
                  <div className="rounded-lg bg-panel-2 py-2">
                    <p className="text-lg font-bold tabular-nums text-brand-ink">{n.published}</p>
                    <p className="text-[10px] text-faint">Published</p>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  {can("write_content") && (
                    <>
                      <Link href={`/app/compose?campaign=${c.id}`}>
                        <Button size="sm">
                          <PenSquare className="size-3.5" /> Create post
                        </Button>
                      </Link>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(c)}>
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(c)} aria-label="Delete">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <CampaignModal
          campaign={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CampaignModal({ campaign, onClose, onDone }: { campaign: Campaign | null; onClose: () => void; onDone: () => void }) {
  const supabase = createClient();
  const { workspace } = useApp();
  const toast = useToast();
  const [f, setF] = useState({
    name: campaign?.name ?? "",
    goal: campaign?.goal ?? "",
    status: campaign?.status ?? "planned",
    start_date: campaign?.start_date ?? "",
    end_date: campaign?.end_date ?? "",
    budget: campaign?.budget_inr != null ? String(campaign.budget_inr) : "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!f.name.trim()) return toast("Name is required", "error");
    if (f.start_date && f.end_date && f.end_date < f.start_date) return toast("End date must be after start date", "error");
    setBusy(true);
    const payload = {
      name: f.name.trim(),
      goal: f.goal.trim() || null,
      status: f.status,
      start_date: f.start_date || null,
      end_date: f.end_date || null,
      budget_inr: f.budget === "" ? null : Math.max(0, Math.round(Number(f.budget) || 0)),
    };
    const { error } = campaign
      ? await supabase.from("campaigns").update(payload).eq("id", campaign.id)
      : await supabase.from("campaigns").insert({ ...payload, tenant_id: workspace.tenant_id, workspace_id: workspace.id });
    setBusy(false);
    if (error) toast(errMsg(error), "error");
    else {
      toast(campaign ? "Campaign updated" : "Campaign created");
      onDone();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={campaign ? "Edit campaign" : "New campaign"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. New Year fitness challenge" />
        </Field>
        <Field label="Goal" className="sm:col-span-2">
          <Textarea rows={2} value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} placeholder="e.g. 50 new memberships" />
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Campaign["status"] })}>
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </Select>
        </Field>
        <Field label="Budget (INR)" hint="optional">
          <Input type="number" min={0} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
        </Field>
        <Field label="Start date">
          <Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
        </Field>
        <Field label="End date">
          <Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
