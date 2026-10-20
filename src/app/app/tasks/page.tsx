"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Circle, ListTodo, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select, Tabs, Textarea, type Tone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, errMsg, formatDate, toLocalInput } from "@/lib/utils";
import type { Task } from "@/lib/types";

type Status = Task["status"];
type Priority = Task["priority"];
type Filter = "all" | "mine" | "overdue" | "today" | "week";

const STATUSES: { value: Status; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];
const PRIORITY_TONE: Record<Priority, Tone> = { low: "gray", normal: "blue", high: "yellow", urgent: "red" };

interface Member {
  user_id: string;
  name: string;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfToday = () => {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
};
const isOverdue = (t: Task) => t.status !== "done" && !!t.due_at && new Date(t.due_at) < new Date();

interface Draft {
  id?: string;
  title: string;
  description: string;
  due_at: string;
  priority: Priority;
  status: Status;
  assigned_to: string;
  link: string; // "lead:<id>" | "contact:<id>" | ""
}

const emptyDraft = (uid: string): Draft => ({ title: "", description: "", due_at: "", priority: "normal", status: "open", assigned_to: uid, link: "" });

export default function TasksPage() {
  const supabase = createClient();
  const toast = useToast();
  const { workspace, tenant, user, can } = useApp();
  const canWrite = can("support");

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [leads, setLeads] = useState<{ id: string; title: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [view, setView] = useState<"list" | "board">("list");
  const [filter, setFilter] = useState<Filter>("all");
  const [priority, setPriority] = useState<"" | Priority>("");
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, m, l, c] = await Promise.all([
      supabase.from("tasks").select("*").eq("workspace_id", workspace.id).order("due_at", { ascending: true, nullsFirst: false }).limit(500),
      supabase.from("tenant_members").select("user_id").eq("tenant_id", tenant.id),
      supabase.from("leads").select("id,title").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(300),
      supabase.from("contacts").select("id,name").eq("workspace_id", workspace.id).order("name").limit(500),
    ]);
    if (t.error) toast(errMsg(t.error), "error");
    setTasks((t.data ?? []) as Task[]);
    setLeads((l.data ?? []) as { id: string; title: string }[]);
    setContacts((c.data ?? []) as { id: string; name: string }[]);
    const ids = ((m.data ?? []) as { user_id: string }[]).map((x) => x.user_id);
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      setMembers(
        ((profs ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => ({
          user_id: p.id,
          name: p.full_name || p.email || "Member",
        })),
      );
    } else setMembers([]);
  }, [supabase, workspace.id, tenant.id, toast]);

  useEffect(() => {
    setTasks(null);
    load();
  }, [load]);

  const memberName = useCallback((id: string | null) => members.find((m) => m.user_id === id)?.name ?? null, [members]);
  const leadTitle = useCallback((id: string | null) => leads.find((l) => l.id === id)?.title ?? "Lead", [leads]);
  const contactName = useCallback((id: string | null) => contacts.find((c) => c.id === id)?.name ?? "Contact", [contacts]);

  const counts = useMemo(() => {
    const all = tasks ?? [];
    const weekAgo = Date.now() - 7 * 86400000;
    const s = startOfToday().getTime();
    const e = endOfToday().getTime();
    return {
      open: all.filter((t) => t.status !== "done").length,
      overdue: all.filter(isOverdue).length,
      today: all.filter((t) => t.status !== "done" && t.due_at && +new Date(t.due_at) >= s && +new Date(t.due_at) < e).length,
      doneWeek: all.filter((t) => t.status === "done" && t.completed_at && +new Date(t.completed_at) > weekAgo).length,
    };
  }, [tasks]);

  const filtered = useMemo(() => {
    const s = startOfToday().getTime();
    const e = endOfToday().getTime();
    const weekEnd = s + 7 * 86400000;
    const needle = q.trim().toLowerCase();
    return (tasks ?? []).filter((t) => {
      if (view === "list" && !showDone && t.status === "done") return false;
      if (filter === "mine" && t.assigned_to !== user.id) return false;
      if (filter === "overdue" && !isOverdue(t)) return false;
      if (filter === "today" && !(t.due_at && +new Date(t.due_at) >= s && +new Date(t.due_at) < e)) return false;
      if (filter === "week" && !(t.due_at && +new Date(t.due_at) >= s && +new Date(t.due_at) < weekEnd)) return false;
      if (priority && t.priority !== priority) return false;
      if (needle && !`${t.title} ${t.description ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [tasks, filter, priority, q, user.id, view, showDone]);

  const setStatus = async (t: Task, status: Status) => {
    if (!canWrite || t.status === status) return;
    const patch = { status, completed_at: status === "done" ? new Date().toISOString() : null };
    setTasks((prev) => (prev ?? []).map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("tasks").update(patch).eq("id", t.id);
    if (error) {
      toast(errMsg(error), "error");
      load();
    } else if (status === "done") toast("Task completed");
  };

  const openEdit = (t: Task) =>
    setDraft({
      id: t.id,
      title: t.title,
      description: t.description ?? "",
      due_at: t.due_at ? toLocalInput(new Date(t.due_at)) : "",
      priority: t.priority,
      status: t.status,
      assigned_to: t.assigned_to ?? "",
      link: t.lead_id ? `lead:${t.lead_id}` : t.contact_id ? `contact:${t.contact_id}` : "",
    });

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) return toast("Add a title", "error");
    setSaving(true);
    const [kind, linkId] = draft.link.split(":");
    const row = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      due_at: draft.due_at ? new Date(draft.due_at).toISOString() : null,
      priority: draft.priority,
      status: draft.status,
      completed_at: draft.status === "done" ? new Date().toISOString() : null,
      assigned_to: draft.assigned_to || null,
      lead_id: kind === "lead" ? linkId : null,
      contact_id: kind === "contact" ? linkId : null,
    };
    const { error } = draft.id
      ? await supabase.from("tasks").update(row).eq("id", draft.id)
      : await supabase.from("tasks").insert({ ...row, tenant_id: workspace.tenant_id, workspace_id: workspace.id });
    setSaving(false);
    if (error) return toast(errMsg(error), "error");
    toast(draft.id ? "Task updated" : "Task created");
    setDraft(null);
    load();
  };

  const remove = async (t: Task) => {
    if (!confirm(`Delete "${t.title}"?`)) return;
    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
    if (error) return toast(errMsg(error), "error");
    setTasks((prev) => (prev ?? []).filter((x) => x.id !== t.id));
  };

  const TaskMeta = ({ t }: { t: Task }) => {
    const who = memberName(t.assigned_to);
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
        {t.due_at && (
          <span className={cn("inline-flex items-center gap-1", isOverdue(t) ? "font-medium text-danger" : "text-muted")}>
            <CalendarClock className="size-3.5" />
            {formatDate(t.due_at)}
          </span>
        )}
        {who && (
          <span className="inline-flex items-center gap-1 text-muted">
            <span className="grid size-5 place-items-center rounded-full bg-brand/15 text-[10px] font-bold text-brand-ink">{who.slice(0, 1).toUpperCase()}</span>
            <span className="max-w-[120px] truncate">{who}</span>
          </span>
        )}
        {t.lead_id && (
          <Link href="/app/crm" className="max-w-[160px] truncate rounded-full border border-line-2 px-2 py-0.5 text-muted hover:text-brand-ink">
            Lead · {leadTitle(t.lead_id)}
          </Link>
        )}
        {t.contact_id && (
          <Link href="/app/crm" className="max-w-[160px] truncate rounded-full border border-line-2 px-2 py-0.5 text-muted hover:text-brand-ink">
            Contact · {contactName(t.contact_id)}
          </Link>
        )}
      </div>
    );
  };

  const CheckBtn = ({ t }: { t: Task }) => (
    <button
      aria-label={t.status === "done" ? "Mark as open" : "Mark as done"}
      disabled={!canWrite}
      onClick={() => setStatus(t, t.status === "done" ? "open" : "done")}
      className="mt-0.5 shrink-0 text-faint hover:text-brand-ink disabled:cursor-not-allowed"
    >
      {t.status === "done" ? <CheckCircle2 className="size-5 text-ok" /> : <Circle className="size-5" />}
    </button>
  );

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Follow-ups, calls and to-dos for your team."
        actions={
          canWrite && (
            <Button onClick={() => setDraft(emptyDraft(user.id))}>
              <Plus className="size-4" /> New task
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Open", value: counts.open, cls: "tint-blue", icon: ListTodo },
          { label: "Overdue", value: counts.overdue, cls: "tint-rose", icon: AlertTriangle },
          { label: "Due today", value: counts.today, cls: "tint-amber", icon: CalendarClock },
          { label: "Done this week", value: counts.doneWeek, cls: "tint-green", icon: CheckCircle2 },
        ].map((s) => (
          <div key={s.label} className={cn("shadow-soft rounded-2xl border border-line p-4", s.cls)}>
            <div className="flex items-center justify-between text-xs font-medium text-muted">
              {s.label} <s.icon className="size-4" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex gap-1 overflow-x-auto">
            {(
              [
                ["all", "All"],
                ["mine", "Mine"],
                ["overdue", "Overdue"],
                ["today", "Due today"],
                ["week", "This week"],
              ] as [Filter, string][]
            ).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={cn(
                  "whitespace-nowrap rounded-xl px-3 py-1.5 text-sm",
                  filter === v ? "bg-brand/10 font-medium text-brand-ink" : "text-muted hover:bg-panel-2 hover:text-ink",
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <div className="relative min-w-0 flex-1 lg:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" className="pl-9" />
            </div>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as "" | Priority)} className="w-36">
              <option value="">All priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </Select>
          </div>
        </div>
      </Card>

      <Tabs
        value={view}
        onChange={setView}
        tabs={[
          { value: "list", label: "List" },
          { value: "board", label: "Board" },
        ]}
      />

      {tasks === null ? (
        <LoadingBlock />
      ) : view === "list" ? (
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs text-muted">
            <span>{filtered.length} task(s)</span>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed
            </label>
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={ListTodo} title="No tasks here" description="Create follow-ups for leads, calls to make and content to review." />
          ) : (
            <div className="divide-y divide-line">
              {filtered.map((t) => (
                <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                  <CheckBtn t={t} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => canWrite && openEdit(t)}>
                    <p className={cn("text-sm font-medium", t.status === "done" && "text-faint line-through")}>{t.title}</p>
                    {t.description && <p className="line-clamp-1 text-xs text-muted">{t.description}</p>}
                    <TaskMeta t={t} />
                  </button>
                  {canWrite && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => openEdit(t)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(t)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {STATUSES.map((col) => {
            const items = filtered.filter((t) => t.status === col.value);
            return (
              <div
                key={col.value}
                onDragOver={(e) => canWrite && e.preventDefault()}
                onDrop={() => {
                  const t = tasks.find((x) => x.id === dragId);
                  if (t) setStatus(t, col.value);
                  setDragId(null);
                }}
                className="min-h-40 rounded-2xl border border-line bg-panel-2 p-3"
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-sm font-semibold">{col.label}</p>
                  <span className="rounded-full bg-panel px-2 text-xs text-muted">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      draggable={canWrite}
                      onDragStart={() => setDragId(t.id)}
                      className="shadow-soft rounded-xl border border-line bg-panel p-3"
                    >
                      <div className="flex items-start gap-2">
                        <CheckBtn t={t} />
                        <button className="min-w-0 flex-1 text-left" onClick={() => canWrite && openEdit(t)}>
                          <p className={cn("text-sm font-medium", t.status === "done" && "text-faint line-through")}>{t.title}</p>
                        </button>
                      </div>
                      <TaskMeta t={t} />
                      {canWrite && (
                        <Select value={t.status} onChange={(e) => setStatus(t, e.target.value as Status)} className="mt-2 h-8 text-xs md:hidden">
                          {STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              Move to: {s.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </div>
                  ))}
                  {!items.length && <p className="px-1 py-6 text-center text-xs text-faint">Drop tasks here</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit task" : "New task"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-3">
            <Field label="Title">
              <Input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Call back about membership" />
            </Field>
            <Field label="Description">
              <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="min-h-20" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Due">
                <Input type="datetime-local" value={draft.due_at} onChange={(e) => setDraft({ ...draft, due_at: e.target.value })} />
              </Field>
              <Field label="Priority">
                <Select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Assignee">
                <Select value={draft.assigned_to} onChange={(e) => setDraft({ ...draft, assigned_to: e.target.value })}>
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.name}
                      {m.user_id === user.id ? " (you)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Related to">
              <Select value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })}>
                <option value="">Nothing</option>
                {leads.length > 0 && (
                  <optgroup label="Leads">
                    {leads.map((l) => (
                      <option key={l.id} value={`lead:${l.id}`}>
                        {l.title}
                      </option>
                    ))}
                  </optgroup>
                )}
                {contacts.length > 0 && (
                  <optgroup label="Contacts">
                    {contacts.map((c) => (
                      <option key={c.id} value={`contact:${c.id}`}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
