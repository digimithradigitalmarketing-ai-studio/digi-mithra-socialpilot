"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Download,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { providerName } from "@/components/provider-badge";
import { cn, downloadFile, errMsg, formatDate, formatINR, timeAgo, toCSV } from "@/lib/utils";
import type { Contact, Lead, PipelineStage } from "@/lib/types";

interface Activity {
  id: string;
  lead_id: string | null;
  kind: "note" | "call" | "email" | "meeting" | "task" | "stage_change" | "system";
  body: string;
  due_at: string | null;
  done: boolean;
  created_at: string;
}

type Tab = "pipeline" | "contacts";

export default function CrmPage() {
  const supabase = createClient();
  const { workspace, can } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("pipeline");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLead, setNewLead] = useState(false);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [stageMgr, setStageMgr] = useState(false);

  const load = useCallback(async () => {
    const [s, l, c] = await Promise.all([
      supabase.from("pipeline_stages").select("*").eq("workspace_id", workspace.id).order("position"),
      supabase
        .from("leads")
        .select("*, contacts(id,name,phone,email)")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false }),
      supabase.from("contacts").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
    ]);
    const err = s.error ?? l.error ?? c.error;
    if (err) toast(errMsg(err), "error");
    setStages((s.data ?? []) as PipelineStage[]);
    setLeads((l.data ?? []) as Lead[]);
    setContacts((c.data ?? []) as Contact[]);
    setLoading(false);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const openValue = leads
    .filter((l) => {
      const s = stages.find((x) => x.id === l.stage_id);
      return !s?.is_won && !s?.is_lost;
    })
    .reduce((a, l) => a + l.value_inr, 0);
  const wonValue = leads.filter((l) => stages.find((x) => x.id === l.stage_id)?.is_won).reduce((a, l) => a + l.value_inr, 0);
  const newThisWeek = leads.filter((l) => Date.now() - new Date(l.created_at).getTime() < 7 * 86400000).length;

  return (
    <div>
      <PageHeader
        title="CRM & leads"
        description="Track enquiries from every channel through your sales pipeline."
        actions={
          <>
            {tab === "pipeline" && can("manage_workspace") && (
              <Button variant="secondary" onClick={() => setStageMgr(true)}>
                <Settings2 className="size-4" /> Stages
              </Button>
            )}
            {can("support") && (
              <Button onClick={() => setNewLead(true)}>
                <Plus className="size-4" /> New lead
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open pipeline" value={formatINR(openValue)} />
        <StatCard label="Won value" value={formatINR(wonValue)} />
        <StatCard label="New leads (7d)" value={newThisWeek} />
        <StatCard label="Contacts" value={contacts.length} icon={Users} />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "pipeline", label: `Pipeline (${leads.length})` },
          { value: "contacts", label: `Contacts (${contacts.length})` },
        ]}
      />

      {loading ? (
        <LoadingBlock />
      ) : tab === "pipeline" ? (
        <Pipeline stages={stages} leads={leads} setLeads={setLeads} onOpen={setOpenLead} />
      ) : (
        <Contacts contacts={contacts} onChanged={load} />
      )}

      <LeadFormModal open={newLead} onClose={() => setNewLead(false)} stages={stages} contacts={contacts} onDone={load} />
      {openLead && (
        <LeadDetailModal
          lead={openLead}
          stages={stages}
          onClose={() => setOpenLead(null)}
          onChanged={() => {
            load();
          }}
        />
      )}
      <StageManager open={stageMgr} onClose={() => setStageMgr(false)} stages={stages} onChanged={load} />
    </div>
  );
}

/* ------------------------------------------------------------------ pipeline */

function Pipeline({
  stages,
  leads,
  setLeads,
  onOpen,
}: {
  stages: PipelineStage[];
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  onOpen: (l: Lead) => void;
}) {
  const supabase = createClient();
  const { workspace, can } = useApp();
  const toast = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const moveLead = async (lead: Lead, stageId: string) => {
    if (lead.stage_id === stageId) return;
    const prev = lead.stage_id;
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, stage_id: stageId } : l)));
    const { error } = await supabase.from("leads").update({ stage_id: stageId }).eq("id", lead.id);
    if (error) {
      setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, stage_id: prev } : l)));
      toast(errMsg(error), "error");
      return;
    }
    const from = stages.find((s) => s.id === prev)?.name ?? "—";
    const to = stages.find((s) => s.id === stageId)?.name ?? "—";
    await supabase.from("activities").insert({
      tenant_id: workspace.tenant_id,
      workspace_id: workspace.id,
      lead_id: lead.id,
      kind: "stage_change",
      body: `Moved from ${from} to ${to}`,
    });
  };

  if (!stages.length) {
    return (
      <Card>
        <EmptyState icon={Users} title="No pipeline stages" description="Add stages to start tracking leads." />
      </Card>
    );
  }

  const unstaged = leads.filter((l) => !l.stage_id || !stages.some((s) => s.id === l.stage_id));

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
      <div className="flex snap-x snap-mandatory gap-3">
        {stages.map((stage, si) => {
          const items = leads.filter((l) => l.stage_id === stage.id || (si === 0 && unstaged.includes(l)));
          const total = items.reduce((a, l) => a + l.value_inr, 0);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                if (!can("support")) return;
                e.preventDefault();
                setOverStage(stage.id);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOverStage(null);
                const lead = leads.find((l) => l.id === dragId);
                if (lead) moveLead(lead, stage.id);
                setDragId(null);
              }}
              className={cn(
                "flex w-[78vw] shrink-0 snap-start flex-col rounded-2xl border bg-panel sm:w-72",
                overStage === stage.id ? "border-brand/70" : "border-line",
              )}
            >
              <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                <span className="size-2.5 rounded-full" style={{ background: stage.color }} />
                <p className="flex-1 truncate text-sm font-semibold">{stage.name}</p>
                <Badge>{items.length}</Badge>
              </div>
              <p className="px-3 pt-2 text-[11px] text-faint">{formatINR(total)}</p>
              <div className="flex max-h-[60dvh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
                {items.map((l) => (
                  <div
                    key={l.id}
                    draggable={can("support")}
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => onOpen(l)}
                    className={cn(
                      "cursor-pointer rounded-xl border border-line-2 bg-panel-2 p-3 transition-colors hover:border-brand/50",
                      dragId === l.id && "opacity-50",
                    )}
                  >
                    <p className="text-sm font-medium leading-snug">{l.title}</p>
                    {l.contacts?.name && <p className="mt-0.5 truncate text-xs text-muted">{l.contacts.name}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {l.value_inr > 0 && <Badge tone="green">{formatINR(l.value_inr)}</Badge>}
                      {l.source && <Badge>{providerName(l.source)}</Badge>}
                      {l.event_date && (
                        <Badge tone="purple">
                          <CalendarDays className="size-3" />
                          {formatDate(l.event_date, { day: "numeric", month: "short" })}
                        </Badge>
                      )}
                    </div>
                    {can("support") && (
                      <Select
                        aria-label="Move to stage"
                        value={l.stage_id ?? ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => moveLead(l, e.target.value)}
                        className="mt-2 h-7 text-xs sm:hidden"
                      >
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            Move to: {s.name}
                          </option>
                        ))}
                      </Select>
                    )}
                    <p className="mt-1.5 text-[10px] text-faint">{timeAgo(l.created_at)}</p>
                  </div>
                ))}
                {items.length === 0 && <p className="py-6 text-center text-xs text-faint">Drop leads here</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ lead form */

function LeadFormModal({
  open,
  onClose,
  stages,
  contacts,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  stages: PipelineStage[];
  contacts: Contact[];
  onDone: () => void;
}) {
  const supabase = createClient();
  const { workspace } = useApp();
  const toast = useToast();
  const empty = { title: "", value: "", source: "website", event_date: "", notes: "", stage_id: "", contact_id: "" };
  const [f, setF] = useState(empty);
  const [contactMode, setContactMode] = useState<"existing" | "new">("new");
  const [nc, setNc] = useState({ name: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setF({ ...empty, stage_id: stages[0]?.id ?? "" });
      setNc({ name: "", phone: "", email: "" });
      setContactMode(contacts.length ? "existing" : "new");
    }
    // reset on open only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (!f.title.trim()) return toast("Lead title is required", "error");
    setBusy(true);
    try {
      let contactId: string | null = f.contact_id || null;
      if (contactMode === "new" && nc.name.trim()) {
        const { data, error } = await supabase
          .from("contacts")
          .insert({
            tenant_id: workspace.tenant_id,
            workspace_id: workspace.id,
            name: nc.name.trim(),
            phone: nc.phone.trim() || null,
            email: nc.email.trim() || null,
            source: f.source,
          })
          .select("id")
          .single();
        if (error) throw error;
        contactId = data.id;
      }
      if (contactMode === "new" && !nc.name.trim()) contactId = null;
      const { error } = await supabase.from("leads").insert({
        tenant_id: workspace.tenant_id,
        workspace_id: workspace.id,
        title: f.title.trim(),
        value_inr: Math.max(0, Math.round(Number(f.value) || 0)),
        source: f.source || null,
        event_date: f.event_date || null,
        notes: f.notes.trim() || null,
        stage_id: f.stage_id || null,
        contact_id: contactId,
      });
      if (error) throw error;
      toast("Lead created");
      onClose();
      onDone();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New lead"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Create lead
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. 6-month membership – Ravi" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Value (INR)">
            <Input type="number" min={0} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          </Field>
          <Field label="Stage">
            <Select value={f.stage_id} onChange={(e) => setF({ ...f, stage_id: e.target.value })}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Source">
            <Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
              {["website", "instagram", "facebook", "whatsapp", "google_business", "phone", "walk_in", "referral"].map((s) => (
                <option key={s} value={s}>
                  {providerName(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Event / visit date" hint="optional">
            <Input type="date" value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} />
          </Field>
        </div>
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 flex gap-1">
            {(["existing", "new"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setContactMode(m)}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium", contactMode === m ? "bg-brand text-on-brand" : "text-muted")}
              >
                {m === "existing" ? "Existing contact" : "New contact"}
              </button>
            ))}
          </div>
          {contactMode === "existing" ? (
            <Select value={f.contact_id} onChange={(e) => setF({ ...f, contact_id: e.target.value })}>
              <option value="">No contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </Select>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              <Input placeholder="Name" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
              <Input placeholder="Phone" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
              <Input placeholder="Email" type="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
            </div>
          )}
        </div>
        <Field label="Notes">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ lead detail */

function LeadDetailModal({
  lead,
  stages,
  onClose,
  onChanged,
}: {
  lead: Lead;
  stages: PipelineStage[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = createClient();
  const { workspace, can } = useApp();
  const toast = useToast();
  const [f, setF] = useState({
    title: lead.title,
    value: String(lead.value_inr),
    stage_id: lead.stage_id ?? "",
    event_date: lead.event_date ?? "",
    notes: lead.notes ?? "",
  });
  const [acts, setActs] = useState<Activity[]>([]);
  const [kind, setKind] = useState<Activity["kind"]>("note");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const loadActs = useCallback(async () => {
    const { data } = await supabase.from("activities").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false });
    setActs((data ?? []) as Activity[]);
  }, [supabase, lead.id]);

  useEffect(() => {
    loadActs();
  }, [loadActs]);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("leads")
      .update({
        title: f.title.trim() || lead.title,
        value_inr: Math.max(0, Math.round(Number(f.value) || 0)),
        stage_id: f.stage_id || null,
        event_date: f.event_date || null,
        notes: f.notes.trim() || null,
      })
      .eq("id", lead.id);
    if (!error && f.stage_id !== (lead.stage_id ?? "")) {
      await supabase.from("activities").insert({
        tenant_id: workspace.tenant_id,
        workspace_id: workspace.id,
        lead_id: lead.id,
        kind: "stage_change",
        body: `Moved to ${stages.find((s) => s.id === f.stage_id)?.name ?? "—"}`,
      });
    }
    setBusy(false);
    if (error) toast(errMsg(error), "error");
    else {
      toast("Lead updated");
      onChanged();
      onClose();
    }
  };

  const addActivity = async () => {
    if (!body.trim()) return;
    const { error } = await supabase.from("activities").insert({
      tenant_id: workspace.tenant_id,
      workspace_id: workspace.id,
      lead_id: lead.id,
      kind,
      body: body.trim(),
      due_at: kind === "task" && due ? new Date(due).toISOString() : null,
    });
    if (error) toast(errMsg(error), "error");
    else {
      setBody("");
      setDue("");
      loadActs();
    }
  };

  const toggleDone = async (a: Activity) => {
    const { error } = await supabase.from("activities").update({ done: !a.done }).eq("id", a.id);
    if (error) toast(errMsg(error), "error");
    else setActs((xs) => xs.map((x) => (x.id === a.id ? { ...x, done: !a.done } : x)));
  };

  const remove = async () => {
    if (!confirm("Delete this lead and its activity history?")) return;
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) toast(errMsg(error), "error");
    else {
      toast("Lead deleted");
      onChanged();
      onClose();
    }
  };

  const editable = can("support");

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Lead details"
      footer={
        editable && (
          <>
            <Button variant="danger" onClick={remove} className="mr-auto">
              <Trash2 className="size-4" /> Delete
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={save} loading={busy}>
              Save
            </Button>
          </>
        )
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Title">
            <Input value={f.title} disabled={!editable} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Value (INR)">
              <Input type="number" min={0} disabled={!editable} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
            </Field>
            <Field label="Stage">
              <Select value={f.stage_id} disabled={!editable} onChange={(e) => setF({ ...f, stage_id: e.target.value })}>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Event / visit date">
            <Input type="date" disabled={!editable} value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} />
          </Field>
          <Field label="Notes">
            <Textarea rows={4} disabled={!editable} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </Field>
          {lead.contacts && (
            <div className="rounded-xl border border-line p-3 text-sm">
              <p className="text-xs text-faint">Contact</p>
              <p className="font-medium">{lead.contacts.name}</p>
              <p className="text-xs text-muted">{[lead.contacts.phone, lead.contacts.email].filter(Boolean).join(" · ") || "No details"}</p>
            </div>
          )}
          <p className="text-[11px] text-faint">
            Source: {lead.source ? providerName(lead.source) : "—"} · Created {formatDate(lead.created_at)}
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Activity</p>
          {editable && (
            <div className="mb-3 space-y-2 rounded-xl border border-line p-3">
              <div className="flex gap-2">
                <Select value={kind} onChange={(e) => setKind(e.target.value as Activity["kind"])} className="w-28">
                  <option value="note">Note</option>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="task">Task</option>
                </Select>
                {kind === "task" && <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />}
              </div>
              <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened / what to do next?" />
              <Button size="sm" onClick={addActivity} disabled={!body.trim()}>
                Add
              </Button>
            </div>
          )}
          <ol className="max-h-80 space-y-2 overflow-y-auto">
            {acts.length === 0 && <p className="text-xs text-faint">No activity yet.</p>}
            {acts.map((a) => (
              <li key={a.id} className="flex gap-2 rounded-lg bg-panel-2 px-3 py-2">
                {a.kind === "task" ? (
                  <button onClick={() => editable && toggleDone(a)} aria-label="Toggle done" className="mt-0.5">
                    {a.done ? <CheckCircle2 className="size-4 text-brand-ink" /> : <Circle className="size-4 text-muted" />}
                  </button>
                ) : (
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand/60" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", a.done && "text-faint line-through")}>{a.body}</p>
                  <p className="text-[10px] text-faint">
                    {a.kind.replace("_", " ")} · {timeAgo(a.created_at)}
                    {a.due_at ? ` · due ${formatDate(a.due_at)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ stage manager */

function StageManager({
  open,
  onClose,
  stages,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  stages: PipelineStage[];
  onChanged: () => void;
}) {
  const supabase = createClient();
  const { workspace } = useApp();
  const toast = useToast();
  const [rows, setRows] = useState<PipelineStage[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setRows(stages.map((s) => ({ ...s })));
  }, [open, stages]);

  const saveAll = async () => {
    setBusy(true);
    try {
      for (const r of rows) {
        const orig = stages.find((s) => s.id === r.id);
        if (orig && (orig.name !== r.name || orig.color !== r.color)) {
          const { error } = await supabase.from("pipeline_stages").update({ name: r.name.trim() || orig.name, color: r.color }).eq("id", r.id);
          if (error) throw error;
        }
      }
      toast("Stages saved");
      onChanged();
      onClose();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!newName.trim()) return;
    const lostIdx = rows.findIndex((r) => r.is_won || r.is_lost);
    const position = lostIdx >= 0 ? rows[lostIdx].position : rows.length;
    // shift won/lost stages to stay at the end
    for (const r of rows.filter((x) => x.position >= position)) {
      await supabase.from("pipeline_stages").update({ position: r.position + 1 }).eq("id", r.id);
    }
    const { error } = await supabase.from("pipeline_stages").insert({
      tenant_id: workspace.tenant_id,
      workspace_id: workspace.id,
      name: newName.trim(),
      position,
      color: "#84cc16",
    });
    if (error) toast(errMsg(error), "error");
    else {
      setNewName("");
      toast("Stage added");
      onChanged();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pipeline stages"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={saveAll} loading={busy}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2">
            <input
              type="color"
              value={r.color}
              aria-label="Stage color"
              onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))}
              className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-line-2 bg-bg p-1"
            />
            <Input value={r.name} onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            {r.is_won && <Badge tone="green">Won</Badge>}
            {r.is_lost && <Badge tone="red">Lost</Badge>}
            <Pencil className="size-4 shrink-0 text-faint" />
          </div>
        ))}
        <div className="flex gap-2 border-t border-line pt-3">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New stage name" />
          <Button variant="secondary" onClick={add} disabled={!newName.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ contacts */

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function Contacts({ contacts, onChanged }: { contacts: Contact[]; onChanged: () => void }) {
  const supabase = createClient();
  const { workspace, can } = useApp();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return contacts;
    return contacts.filter((c) =>
      `${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${c.handle ?? ""} ${c.tags.join(" ")}`.toLowerCase().includes(t),
    );
  }, [contacts, q]);

  const exportCsv = () => {
    const csv = toCSV(
      list.map((c) => ({
        name: c.name,
        email: c.email,
        phone: c.phone,
        handle: c.handle,
        source: c.source,
        tags: c.tags,
        marketing_consent: c.marketing_consent,
        created_at: c.created_at,
      })),
    );
    if (!csv) return toast("No contacts to export", "info");
    downloadFile(`contacts-${workspace.slug}.csv`, csv);
  };

  const importCsv = async (file: File) => {
    setImporting(true);
    try {
      const rows = parseCSV(await file.text());
      if (!rows.length) throw new Error("File is empty");
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const hasHeader = header.includes("name");
      const idx = (k: string, fallback: number) => (hasHeader ? header.indexOf(k) : fallback);
      const iName = idx("name", 0);
      const iEmail = idx("email", 1);
      const iPhone = idx("phone", 2);
      const iTags = idx("tags", 3);
      const records = (hasHeader ? rows.slice(1) : rows)
        .map((r) => ({
          tenant_id: workspace.tenant_id,
          workspace_id: workspace.id,
          name: (r[iName] ?? "").trim(),
          email: iEmail >= 0 ? (r[iEmail] ?? "").trim() || null : null,
          phone: iPhone >= 0 ? (r[iPhone] ?? "").trim() || null : null,
          tags:
            iTags >= 0
              ? (r[iTags] ?? "")
                  .split(/[;|]/)
                  .map((t) => t.trim())
                  .filter(Boolean)
              : [],
          source: "import",
        }))
        .filter((r) => r.name);
      if (!records.length) throw new Error("No rows with a name column found");
      for (let i = 0; i < records.length; i += 500) {
        const { error } = await supabase.from("contacts").insert(records.slice(i, i + 500));
        if (error) throw error;
      }
      toast(`Imported ${records.length} contacts`);
      onChanged();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (c: Contact) => {
    if (!confirm(`Delete ${c.name}? Their conversations will also be removed.`)) return;
    const { error } = await supabase.from("contacts").delete().eq("id", c.id);
    if (error) toast(errMsg(error), "error");
    else {
      toast("Contact deleted");
      onChanged();
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email, tag…" className="pl-9" />
        </div>
        <Button variant="secondary" onClick={exportCsv}>
          <Download className="size-4" /> Export
        </Button>
        {can("support") && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
            />
            <Button variant="secondary" loading={importing} onClick={() => fileRef.current?.click()} title="CSV columns: name,email,phone,tags">
              {!importing && <Upload className="size-4" />} Import CSV
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Contact
            </Button>
          </>
        )}
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No contacts" description="Contacts are created from inbox messages, leads, or CSV import (name,email,phone,tags)." />
        </Card>
      ) : (
        <>
          {/* mobile cards */}
          <div className="space-y-2 md:hidden">
            {list.map((c) => (
              <Card key={c.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted">{[c.phone, c.email].filter(Boolean).join(" · ") || c.handle || "—"}</p>
                  </div>
                  {can("support") && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEditing(c)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(c)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.marketing_consent && <Badge tone="green">Consent</Badge>}
                  {c.source && <Badge>{providerName(c.source)}</Badge>}
                  {c.tags.map((t) => (
                    <Badge key={t} tone="purple">
                      {t}
                    </Badge>
                  ))}
                </div>
              </Card>
            ))}
          </div>
          {/* desktop table */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Tags</th>
                  <th className="px-4 py-2.5 font-medium">Consent</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-b border-line/60 hover:bg-panel-2">
                    <td className="px-4 py-2.5 font-medium">
                      {c.name}
                      {c.handle && <span className="ml-1 text-xs text-faint">{c.handle}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{c.phone ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{c.email ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{c.source ? providerName(c.source) : "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <Badge key={t} tone="purple">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">{c.marketing_consent ? <Badge tone="green">Yes</Badge> : <Badge>No</Badge>}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {can("support") && (
                        <>
                          <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEditing(c)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(c)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {editing && (
        <ContactModal
          contact={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ContactModal({ contact, onClose, onDone }: { contact: Contact | null; onClose: () => void; onDone: () => void }) {
  const supabase = createClient();
  const { workspace } = useApp();
  const toast = useToast();
  const [f, setF] = useState({
    name: contact?.name ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    handle: contact?.handle ?? "",
    tags: contact?.tags.join(", ") ?? "",
    marketing_consent: contact?.marketing_consent ?? false,
    notes: contact?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!f.name.trim()) return toast("Name is required", "error");
    setBusy(true);
    const payload = {
      name: f.name.trim(),
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
      handle: f.handle.trim() || null,
      tags: f.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      marketing_consent: f.marketing_consent,
      notes: f.notes.trim() || null,
    };
    const { error } = contact
      ? await supabase.from("contacts").update(payload).eq("id", contact.id)
      : await supabase.from("contacts").insert({ ...payload, tenant_id: workspace.tenant_id, workspace_id: workspace.id, source: "manual" });
    setBusy(false);
    if (error) toast(errMsg(error), "error");
    else {
      toast(contact ? "Contact updated" : "Contact added");
      onDone();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={contact ? "Edit contact" : "New contact"}
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
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Social handle">
          <Input value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} />
        </Field>
        <Field label="Tags" hint="comma separated">
          <Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2">
          <input
            type="checkbox"
            checked={f.marketing_consent}
            onChange={(e) => setF({ ...f, marketing_consent: e.target.checked })}
            className="accent-[var(--color-brand)]"
          />
          Contact has given marketing consent
        </label>
      </div>
    </Modal>
  );
}
