"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, List, MapPin, Plus, UserX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select, StatCard, Textarea, type Tone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, errMsg, formatDate } from "@/lib/utils";
import type { Appointment, Task } from "@/lib/types";

type View = "week" | "day" | "list";
interface Person {
  id: string;
  name: string;
}
interface ContactLite {
  id: string;
  name: string;
  phone: string | null;
}
interface LeadLite {
  id: string;
  title: string;
  contact_id: string | null;
}

const KINDS: Appointment["kind"][] = ["visit", "call", "video", "trial", "consultation", "event", "other"];
const STATUSES: Appointment["status"][] = ["scheduled", "confirmed", "completed", "no_show", "cancelled"];
const STATUS_TONE: Record<Appointment["status"], Tone> = {
  scheduled: "blue",
  confirmed: "green",
  completed: "gray",
  no_show: "red",
  cancelled: "yellow",
};
const KIND_COLOR: Record<Appointment["kind"], string> = {
  visit: "bg-brand/20 border-brand/50",
  call: "bg-info/15 border-info/40",
  video: "bg-purple/15 border-purple/40",
  trial: "bg-warn/15 border-warn/40",
  consultation: "bg-info/10 border-info/30",
  event: "bg-danger/10 border-danger/30",
  other: "bg-ink/5 border-line-2",
};

const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_PX = 48;

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const label = (s: string) => s.replace(/_/g, " ");

interface FormState {
  id?: string;
  title: string;
  contactMode: "existing" | "new";
  contact_id: string;
  newName: string;
  newPhone: string;
  lead_id: string;
  date: string;
  start: string;
  end: string;
  kind: Appointment["kind"];
  location: string;
  assigned_to: string;
  status: Appointment["status"];
  notes: string;
  follow_up: string;
  originalFollowUp: string;
}

function emptyForm(day: Date, userId: string): FormState {
  return {
    title: "",
    contactMode: "existing",
    contact_id: "",
    newName: "",
    newPhone: "",
    lead_id: "",
    date: dateKey(day),
    start: "10:00",
    end: "11:00",
    kind: "visit",
    location: "",
    assigned_to: userId,
    status: "scheduled",
    notes: "",
    follow_up: "",
    originalFollowUp: "",
  };
}

export default function AppointmentsPage() {
  const supabase = createClient();
  const { workspace, tenant, user, can } = useApp();
  const toast = useToast();
  const write = can("support");

  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [followUps, setFollowUps] = useState<Task[]>([]);
  const [stats, setStats] = useState({ today: 0, week: 0, noShowRate: null as number | null });
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const range = useMemo(() => {
    if (view === "day") {
      const s = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
      return { from: s, to: addDays(s, 1), days: [s] };
    }
    if (view === "list") {
      const s = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
      return { from: s, to: addDays(s, 30), days: Array.from({ length: 30 }, (_, i) => addDays(s, i)) };
    }
    const s = startOfWeek(anchor);
    return { from: s, to: addDays(s, 7), days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) };
  }, [view, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date();
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const w0 = startOfWeek(today);
    const [a, c, l, tm, fu, todayQ, weekQ, last30] = await Promise.all([
      supabase
        .from("appointments")
        .select("*")
        .eq("workspace_id", workspace.id)
        .gte("starts_at", range.from.toISOString())
        .lt("starts_at", range.to.toISOString())
        .order("starts_at"),
      supabase.from("contacts").select("id,name,phone").eq("workspace_id", workspace.id).order("name").limit(500),
      supabase.from("leads").select("id,title,contact_id").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(300),
      supabase.from("tenant_members").select("user_id").eq("tenant_id", tenant.id),
      supabase
        .from("tasks")
        .select("*")
        .eq("workspace_id", workspace.id)
        .neq("status", "done")
        .ilike("title", "Follow up:%")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(8),
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id)
        .neq("status", "cancelled")
        .gte("starts_at", t0.toISOString())
        .lt("starts_at", addDays(t0, 1).toISOString()),
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id)
        .neq("status", "cancelled")
        .gte("starts_at", w0.toISOString())
        .lt("starts_at", addDays(w0, 7).toISOString()),
      supabase
        .from("appointments")
        .select("status")
        .eq("workspace_id", workspace.id)
        .in("status", ["completed", "no_show"])
        .gte("starts_at", addDays(t0, -30).toISOString())
        .lt("starts_at", addDays(t0, 1).toISOString()),
    ]);
    if (a.error) toast(errMsg(a.error), "error");
    setItems((a.data ?? []) as Appointment[]);
    setContacts((c.data ?? []) as ContactLite[]);
    setLeads((l.data ?? []) as LeadLite[]);
    setFollowUps((fu.data ?? []) as Task[]);
    const ids = ((tm.data ?? []) as { user_id: string }[]).map((m) => m.user_id);
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      setMembers(
        ((profs ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => ({ id: p.id, name: p.full_name || p.email || "Member" })),
      );
    }
    const done = (last30.data ?? []) as { status: string }[];
    const noShows = done.filter((x) => x.status === "no_show").length;
    setStats({ today: todayQ.count ?? 0, week: weekQ.count ?? 0, noShowRate: done.length ? Math.round((noShows / done.length) * 100) : null });
    setLoading(false);
  }, [supabase, workspace.id, tenant.id, range.from, range.to, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const contactName = useCallback((id: string | null) => contacts.find((c) => c.id === id)?.name ?? null, [contacts]);
  const memberName = useCallback((id: string | null) => members.find((m) => m.id === id)?.name ?? null, [members]);

  const byDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const a of items) (map[dateKey(new Date(a.starts_at))] ??= []).push(a);
    return map;
  }, [items]);

  const shift = (dir: number) => setAnchor((d) => addDays(d, dir * (view === "day" ? 1 : view === "list" ? 30 : 7)));

  const openNew = (day?: Date, hour?: number) => {
    if (!write) return;
    const f = emptyForm(day ?? anchor, user.id);
    if (hour !== undefined) {
      f.start = `${pad(hour)}:00`;
      f.end = `${pad(Math.min(hour + 1, 23))}:00`;
    }
    setForm(f);
  };

  const openEdit = (a: Appointment) => {
    const s = new Date(a.starts_at);
    const e = new Date(a.ends_at);
    const fu = a.follow_up_at ? dateKey(new Date(a.follow_up_at)) : "";
    setForm({
      id: a.id,
      title: a.title,
      contactMode: "existing",
      contact_id: a.contact_id ?? "",
      newName: "",
      newPhone: "",
      lead_id: a.lead_id ?? "",
      date: dateKey(s),
      start: timeOf(s),
      end: timeOf(e),
      kind: a.kind,
      location: a.location ?? "",
      assigned_to: a.assigned_to ?? "",
      status: a.status,
      notes: a.notes ?? "",
      follow_up: fu,
      originalFollowUp: fu,
    });
  };

  const save = async () => {
    if (!form) return;
    if (!form.title.trim()) return toast("Add a title", "error");
    const starts = new Date(`${form.date}T${form.start}`);
    const ends = new Date(`${form.date}T${form.end}`);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) return toast("Choose a valid date and time", "error");
    if (ends <= starts) return toast("End time must be after the start time", "error");
    setSaving(true);
    try {
      let contactId = form.contact_id || null;
      if (form.contactMode === "new" && form.newName.trim()) {
        const { data, error } = await supabase
          .from("contacts")
          .insert({ tenant_id: workspace.tenant_id, workspace_id: workspace.id, name: form.newName.trim(), phone: form.newPhone.trim() || null, source: "appointment" })
          .select("id")
          .single();
        if (error) throw error;
        contactId = data.id;
      }
      const followUpAt = form.follow_up ? new Date(`${form.follow_up}T10:00`).toISOString() : null;
      const row = {
        title: form.title.trim(),
        contact_id: contactId,
        lead_id: form.lead_id || null,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        kind: form.kind,
        location: form.location.trim() || null,
        assigned_to: form.assigned_to || null,
        status: form.status,
        notes: form.notes.trim() || null,
        follow_up_at: followUpAt,
      };
      if (form.id) {
        const { error } = await supabase.from("appointments").update(row).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("appointments").insert({ ...row, tenant_id: workspace.tenant_id, workspace_id: workspace.id });
        if (error) throw error;
      }
      // a new or changed follow-up date creates one follow-up task
      if (form.follow_up && form.follow_up !== form.originalFollowUp) {
        const { error } = await supabase.from("tasks").insert({
          tenant_id: workspace.tenant_id,
          workspace_id: workspace.id,
          title: `Follow up: ${form.title.trim()}`,
          due_at: followUpAt,
          assigned_to: form.assigned_to || null,
          lead_id: form.lead_id || null,
          contact_id: contactId,
          priority: "normal",
        });
        if (error) toast(`Appointment saved, but the follow-up task failed: ${errMsg(error)}`, "error");
      }
      toast(form.id ? "Appointment updated" : "Appointment booked");
      setForm(null);
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (a: Appointment, status: Appointment["status"]) => {
    const { error } = await supabase.from("appointments").update({ status }).eq("id", a.id);
    if (error) return toast(errMsg(error), "error");
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, status } : x)));
    toast(`Marked ${label(status)}`);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this appointment?")) return;
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) return toast(errMsg(error), "error");
    setForm(null);
    load();
  };

  const completeTask = async (t: Task) => {
    const { error } = await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", t.id);
    if (error) return toast(errMsg(error), "error");
    setFollowUps((prev) => prev.filter((x) => x.id !== t.id));
  };

  const heading =
    view === "day"
      ? range.from.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
      : `${range.from.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${addDays(range.to, -1).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  const QuickActions = ({ a }: { a: Appointment }) =>
    write && !["completed", "cancelled", "no_show"].includes(a.status) ? (
      <div className="flex flex-wrap gap-1">
        {a.status === "scheduled" && (
          <Button size="sm" variant="secondary" onClick={() => setStatus(a, "confirmed")}>
            <Check className="size-3.5" /> Confirm
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => setStatus(a, "completed")}>
          Completed
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setStatus(a, "no_show")}>
          <UserX className="size-3.5" /> No-show
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setStatus(a, "cancelled")}>
          <X className="size-3.5" /> Cancel
        </Button>
      </div>
    ) : null;

  const ListRow = ({ a }: { a: Appointment }) => (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <button className="min-w-0 text-left" onClick={() => openEdit(a)}>
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {a.title} <Badge tone={STATUS_TONE[a.status]}>{label(a.status)}</Badge>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Clock className="size-3" /> {timeOf(new Date(a.starts_at))}–{timeOf(new Date(a.ends_at))}
          </span>
          <span className="capitalize">{a.kind}</span>
          {contactName(a.contact_id) && <span>{contactName(a.contact_id)}</span>}
          {a.location && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" /> {a.location}
            </span>
          )}
          {memberName(a.assigned_to) && <span>· {memberName(a.assigned_to)}</span>}
        </p>
      </button>
      <QuickActions a={a} />
    </div>
  );

  const listView = (
    <Card>
      {range.days.filter((d) => byDay[dateKey(d)]?.length).length === 0 ? (
        <EmptyState icon={CalendarClock} title="No appointments" description="Book visits, calls and trial sessions with your leads." />
      ) : (
        range.days
          .filter((d) => byDay[dateKey(d)]?.length)
          .map((d) => (
            <div key={dateKey(d)} className="border-b border-line last:border-0">
              <p className="bg-panel-2 px-4 py-2 text-xs font-semibold text-muted">
                {d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
              </p>
              <div className="divide-y divide-line">
                {byDay[dateKey(d)].map((a) => (
                  <ListRow key={a.id} a={a} />
                ))}
              </div>
            </div>
          ))
      )}
    </Card>
  );

  const gridView = (
    <Card className="overflow-hidden">
      <div className="flex border-b border-line">
        <div className="w-14 shrink-0" />
        {range.days.map((d) => {
          const isToday = dateKey(d) === dateKey(now);
          return (
            <div key={dateKey(d)} className="flex-1 border-l border-line px-2 py-2 text-center">
              <p className="text-[11px] text-faint uppercase">{d.toLocaleDateString("en-IN", { weekday: "short" })}</p>
              <p className={cn("mx-auto grid size-7 place-items-center rounded-full text-sm font-semibold", isToday && "bg-brand text-on-brand")}>{d.getDate()}</p>
            </div>
          );
        })}
      </div>
      <div className="max-h-[65dvh] overflow-y-auto">
        <div className="relative flex" style={{ height: hours.length * HOUR_PX }}>
          <div className="w-14 shrink-0">
            {hours.map((h) => (
              <div key={h} className="pr-2 text-right text-[10px] text-faint" style={{ height: HOUR_PX }}>
                {h % 12 === 0 ? 12 : h % 12}
                {h < 12 ? "am" : "pm"}
              </div>
            ))}
          </div>
          {range.days.map((d) => {
            const key = dateKey(d);
            const isToday = key === dateKey(now);
            const nowTop = ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) * (HOUR_PX / 60);
            return (
              <div key={key} className="relative flex-1 border-l border-line">
                {hours.map((h) => (
                  <button
                    key={h}
                    aria-label={`Book ${key} ${h}:00`}
                    onClick={() => openNew(d, h)}
                    disabled={!write}
                    className="block w-full border-b border-line/60 hover:bg-brand/5 disabled:hover:bg-transparent"
                    style={{ height: HOUR_PX }}
                  />
                ))}
                {(byDay[key] ?? []).map((a) => {
                  const s = new Date(a.starts_at);
                  const e = new Date(a.ends_at);
                  const top = Math.max(0, ((s.getHours() - START_HOUR) * 60 + s.getMinutes()) * (HOUR_PX / 60));
                  const bottom = Math.min(hours.length * HOUR_PX, ((e.getHours() - START_HOUR) * 60 + e.getMinutes()) * (HOUR_PX / 60));
                  if (bottom <= 0 || top >= hours.length * HOUR_PX) return null;
                  return (
                    <button
                      key={a.id}
                      onClick={() => openEdit(a)}
                      className={cn(
                        "absolute inset-x-1 overflow-hidden rounded-lg border px-1.5 py-1 text-left text-[11px] leading-tight",
                        KIND_COLOR[a.kind],
                        ["cancelled", "no_show"].includes(a.status) && "line-through opacity-60",
                      )}
                      style={{ top, height: Math.max(22, bottom - top) }}
                    >
                      <span className="block truncate font-semibold">{a.title}</span>
                      <span className="block truncate text-muted">
                        {timeOf(s)} · {contactName(a.contact_id) ?? a.kind}
                      </span>
                    </button>
                  );
                })}
                {isToday && nowTop > 0 && nowTop < hours.length * HOUR_PX && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-danger" style={{ top: nowTop }}>
                    <span className="absolute -top-1.5 -left-1 size-2.5 rounded-full bg-danger" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Appointments"
        description="Visits, calls and trial sessions with follow-up tracking."
        actions={
          write && (
            <Button onClick={() => openNew()}>
              <Plus className="size-4" /> Book appointment
            </Button>
          )
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Today" value={stats.today} icon={CalendarDays} />
        <StatCard label="This week" value={stats.week} icon={CalendarClock} tone="info" />
        <StatCard label="No-show rate (30d)" value={stats.noShowRate === null ? "—" : `${stats.noShowRate}%`} icon={UserX} tone="warn" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button size="icon" variant="secondary" aria-label="Previous" onClick={() => shift(-1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAnchor(new Date())}>
                Today
              </Button>
              <Button size="icon" variant="secondary" aria-label="Next" onClick={() => shift(1)}>
                <ChevronRight className="size-4" />
              </Button>
              <p className="ml-2 text-sm font-semibold">{heading}</p>
            </div>
            <div className="flex gap-1 rounded-xl border border-line bg-panel p-1">
              {(
                [
                  { v: "week", label: "Week", icon: CalendarDays },
                  { v: "day", label: "Day", icon: CalendarClock },
                  { v: "list", label: "List", icon: List },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setView(o.v)}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium",
                    view === o.v ? "bg-brand text-on-brand" : "text-muted hover:text-ink",
                  )}
                >
                  <o.icon className="size-3.5" /> {o.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <LoadingBlock />
          ) : view === "list" ? (
            listView
          ) : (
            <>
              <div className="hidden md:block">{gridView}</div>
              <div className="md:hidden">{listView}</div>
            </>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader title="Upcoming follow-ups" description="Tasks created from appointments" />
          <div className="divide-y divide-line">
            {followUps.length === 0 && <p className="px-4 py-6 text-sm text-muted">No open follow-ups.</p>}
            {followUps.map((t) => {
              const overdue = t.due_at && new Date(t.due_at) < now;
              return (
                <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                  <button
                    aria-label="Mark done"
                    onClick={() => completeTask(t)}
                    disabled={!write}
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-line-2 hover:border-brand"
                  >
                    <Check className="size-3 text-transparent hover:text-brand-ink" />
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm">{t.title.replace(/^Follow up:\s*/, "")}</p>
                    <p className={cn("text-xs", overdue ? "text-danger" : "text-faint")}>{t.due_at ? formatDate(t.due_at) : "No due date"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit appointment" : "Book appointment"}
        footer={
          form && (
            <>
              {form.id && write && (
                <Button variant="danger" className="mr-auto" onClick={() => remove(form.id!)}>
                  Delete
                </Button>
              )}
              <Button variant="secondary" onClick={() => setForm(null)}>
                Close
              </Button>
              {write && (
                <Button onClick={save} loading={saving}>
                  Save
                </Button>
              )}
            </>
          )
        }
      >
        {form && (
          <div className="space-y-3">
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Trial class with Ravi" />
            </Field>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-muted">Contact</span>
                <button
                  type="button"
                  className="text-xs text-brand-ink hover:underline"
                  onClick={() => setForm({ ...form, contactMode: form.contactMode === "new" ? "existing" : "new" })}
                >
                  {form.contactMode === "new" ? "Choose existing" : "+ New contact"}
                </button>
              </div>
              {form.contactMode === "new" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input value={form.newName} onChange={(e) => setForm({ ...form, newName: e.target.value })} placeholder="Name" />
                  <Input value={form.newPhone} onChange={(e) => setForm({ ...form, newPhone: e.target.value })} placeholder="Phone" type="tel" />
                </div>
              ) : (
                <Select value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })}>
                  <option value="">No contact</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <Field label="Lead" hint="(optional)">
              <Select value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })}>
                <option value="">No lead</option>
                {leads
                  .filter((l) => !form.contact_id || !l.contact_id || l.contact_id === form.contact_id)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
              </Select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Date">
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Start">
                <Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
              </Field>
              <Field label="End">
                <Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Type">
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Appointment["kind"] })}>
                  {KINDS.map((k) => (
                    <option key={k} value={k} className="capitalize">
                      {k}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Appointment["status"] })}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Location">
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Studio, phone, video link…" />
              </Field>
              <Field label="Assigned to">
                <Select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Notes">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-16" />
            </Field>
            <Field label="Follow-up date" hint="(creates a follow-up task)">
              <Input type="date" value={form.follow_up} onChange={(e) => setForm({ ...form, follow_up: e.target.value })} />
            </Field>
            {form.id && items.some((x) => x.id === form.id) && (
              <div className="pt-1">
                <QuickActions a={items.find((x) => x.id === form.id)!} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
