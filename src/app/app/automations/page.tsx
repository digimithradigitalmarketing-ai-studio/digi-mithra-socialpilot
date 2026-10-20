"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  Flag,
  History,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Square,
  Tag,
  Trash2,
  UserPlus,
  Workflow as WorkflowIcon,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  Toggle,
  type Tone,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { providerName } from "@/components/provider-badge";
import { CHANNELS } from "@/lib/providers";
import { cn, errMsg, formatDate, timeAgo } from "@/lib/utils";
import type { Workflow, WorkflowNode, WorkflowNodeType } from "@/lib/types";

interface Run {
  id: string;
  workflow_id: string;
  version: number;
  status: "running" | "completed" | "skipped" | "failed" | "waiting_approval" | "cancelled";
  trigger_payload: Record<string, unknown>;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}
interface Step {
  id: string;
  run_id: string;
  position: number;
  node_type: string;
  status: "completed" | "skipped" | "failed";
  output: Record<string, unknown> | null;
}
interface Version {
  id: string;
  workflow_id: string;
  version: number;
  definition: { nodes: WorkflowNode[] };
  created_at: string;
}

const RUN_TONE: Record<Run["status"], Tone> = {
  running: "blue",
  completed: "green",
  skipped: "gray",
  failed: "red",
  waiting_approval: "yellow",
  cancelled: "gray",
};

const TRIGGERS: { value: Workflow["trigger_type"]; label: string; hint: string }[] = [
  { value: "message_received", label: "Message received", hint: "Runs on every inbound inbox message" },
  { value: "lead_created", label: "Lead created", hint: "Runs when a new lead is added" },
  { value: "manual", label: "Manual / test only", hint: "Runs only from the Test button" },
];

const NODE_META: Record<
  WorkflowNodeType,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; defaults: Record<string, string> }
> = {
  condition: { label: "Condition", icon: Filter, color: "#38bdf8", defaults: { field: "body", operator: "contains", value: "" } },
  create_lead: { label: "Create lead", icon: UserPlus, color: "#8bdc2b", defaults: { title: "Enquiry: {{name}}", value_inr: "0" } },
  add_tag: { label: "Add tag", icon: Tag, color: "#a78bfa", defaults: { tag: "" } },
  set_priority: { label: "Set priority", icon: Flag, color: "#f59e0b", defaults: { priority: "high" } },
  notify: { label: "Notify team", icon: Bell, color: "#f472b6", defaults: { title: "New enquiry from {{name}}", body: "" } },
  ai_draft: {
    label: "AI reply draft",
    icon: Bot,
    color: "#b6f04a",
    defaults: { template: "Hi {{name}}, thanks for reaching out to {{business}}! Our team will get back to you shortly." },
  },
  wait: { label: "Wait / delay", icon: Clock, color: "#94a3b8", defaults: { minutes: "15" } },
  approval: { label: "Human approval", icon: ShieldCheck, color: "#facc15", defaults: {} },
  end: { label: "End", icon: Square, color: "#64748b", defaults: {} },
};
const NODE_TYPES = Object.keys(NODE_META) as WorkflowNodeType[];

const TEMPLATES: { name: string; description: string; trigger_type: Workflow["trigger_type"]; nodes: WorkflowNode[] }[] = [
  {
    name: "Gym membership enquiry",
    description: "Capture membership questions as leads and draft a friendly reply.",
    trigger_type: "message_received",
    nodes: [
      { type: "condition", config: { field: "body", operator: "contains", value: "membership,join,price,fees" } },
      { type: "create_lead", config: { title: "Membership: {{name}}", value_inr: "0" } },
      { type: "add_tag", config: { tag: "membership" } },
      { type: "notify", config: { title: "New membership enquiry from {{name}}", body: "" } },
      {
        type: "ai_draft",
        config: { template: "Hi {{name}}! Thanks for your interest in {{business}} memberships. Can we call you to share plans and a free trial slot?" },
      },
    ],
  },
  {
    name: "Wedding / event enquiry",
    description: "Qualify event enquiries, raise priority and request approval before follow-up.",
    trigger_type: "message_received",
    nodes: [
      { type: "condition", config: { field: "body", operator: "contains", value: "wedding,event,shoot,booking" } },
      { type: "create_lead", config: { title: "Event: {{name}}", value_inr: "0" } },
      { type: "set_priority", config: { priority: "high" } },
      { type: "notify", config: { title: "Event enquiry from {{name}}", body: "" } },
      { type: "approval", config: {} },
    ],
  },
  {
    name: "After-hours auto-reply",
    description: "Prepare an acknowledgement draft for every new message.",
    trigger_type: "message_received",
    nodes: [
      {
        type: "ai_draft",
        config: { template: "Hi {{name}}, thanks for messaging {{business}}! We're currently closed and will reply first thing tomorrow." },
      },
    ],
  },
];

type Tab = "workflows" | "runs";

export default function AutomationsPage() {
  const supabase = createClient();
  const { workspace, can } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("workflows");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Workflow> | null>(null);
  const [testing, setTesting] = useState<Workflow | null>(null);
  const [versionsOf, setVersionsOf] = useState<Workflow | null>(null);

  const load = useCallback(async () => {
    const [w, r] = await Promise.all([
      supabase.from("workflows").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
      supabase.from("workflow_runs").select("*").eq("workspace_id", workspace.id).order("started_at", { ascending: false }).limit(100),
    ]);
    const err = w.error ?? r.error;
    if (err) toast(errMsg(err), "error");
    setWorkflows((w.data ?? []) as Workflow[]);
    setRuns((r.data ?? []) as Run[]);
    setLoading(false);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const stats = useMemo(() => {
    const s: Record<string, { total: number; failed: number; last: string | null }> = {};
    for (const r of runs) {
      s[r.workflow_id] ??= { total: 0, failed: 0, last: null };
      s[r.workflow_id].total++;
      if (r.status === "failed") s[r.workflow_id].failed++;
      if (!s[r.workflow_id].last) s[r.workflow_id].last = r.started_at;
    }
    return s;
  }, [runs]);

  const toggleStatus = async (w: Workflow) => {
    const next = w.status === "active" ? "paused" : "active";
    if (next === "active" && !w.definition?.nodes?.length) return toast("Add at least one step before activating", "error");
    const { error } = await supabase.from("workflows").update({ status: next }).eq("id", w.id);
    if (error) toast(errMsg(error), "error");
    else {
      toast(next === "active" ? "Automation activated" : "Automation paused");
      load();
    }
  };

  const remove = async (w: Workflow) => {
    if (!confirm(`Delete “${w.name}” and its run history?`)) return;
    const { error } = await supabase.from("workflows").delete().eq("id", w.id);
    if (error) toast(errMsg(error), "error");
    else {
      toast("Automation deleted");
      load();
    }
  };

  const editable = can("manage_workspace");
  const wfName = (id: string) => workflows.find((w) => w.id === id)?.name ?? "Deleted workflow";

  return (
    <div>
      <PageHeader
        title="Automations"
        description="Trigger → condition → action workflows for enquiries, leads and replies."
        actions={
          editable && (
            <Button onClick={() => setEditing({ name: "", trigger_type: "message_received", definition: { nodes: [] } })}>
              <Plus className="size-4" /> New automation
            </Button>
          )
        }
      />

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "workflows", label: `Workflows (${workflows.length})` },
          { value: "runs", label: `Run log (${runs.length})` },
        ]}
      />

      {loading ? (
        <LoadingBlock />
      ) : tab === "workflows" ? (
        <div className="space-y-5">
          {workflows.length === 0 ? (
            <Card>
              <EmptyState icon={WorkflowIcon} title="No automations yet" description="Start from a template below or build your own." />
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {workflows.map((w) => {
                const st = stats[w.id];
                const trig = TRIGGERS.find((t) => t.value === w.trigger_type);
                return (
                  <Card key={w.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{w.name}</p>
                        {w.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{w.description}</p>}
                      </div>
                      {editable ? (
                        <Toggle checked={w.status === "active"} onChange={() => toggleStatus(w)} />
                      ) : (
                        <Badge tone={w.status === "active" ? "green" : "gray"}>{w.status}</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Badge tone="blue">
                        <Zap className="size-3" /> {trig?.label ?? w.trigger_type}
                      </Badge>
                      <Badge>v{w.version}</Badge>
                      <Badge tone={w.status === "active" ? "green" : w.status === "paused" ? "yellow" : "gray"}>{w.status}</Badge>
                      {w.definition?.nodes?.map((n, i) => {
                        const M = NODE_META[n.type]?.icon ?? Square;
                        return (
                          <span key={i} title={NODE_META[n.type]?.label} className="grid size-6 place-items-center rounded-md bg-panel-2">
                            <M className="size-3.5" />
                          </span>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-faint">
                      {st ? `${st.total} runs · ${st.failed} failed · last ${timeAgo(st.last)}` : "No runs yet"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {editable && (
                        <Button size="sm" variant="secondary" onClick={() => setEditing(w)}>
                          <Pencil className="size-3.5" /> Edit
                        </Button>
                      )}
                      {editable && (
                        <Button size="sm" variant="secondary" onClick={() => setTesting(w)}>
                          <Play className="size-3.5" /> Test
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setVersionsOf(w)}>
                        <History className="size-3.5" /> Versions
                      </Button>
                      {editable && (
                        <Button size="sm" variant="ghost" onClick={() => remove(w)} aria-label="Delete">
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {editable && (
            <Card>
              <CardHeader title="Templates" description="Ready-made flows you can customise." />
              <div className="grid gap-3 p-4 md:grid-cols-3">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    onClick={() =>
                      setEditing({
                        name: t.name,
                        description: t.description,
                        trigger_type: t.trigger_type,
                        definition: { nodes: t.nodes.map((n) => ({ type: n.type, config: { ...n.config } })) },
                      })
                    }
                    className="rounded-xl border border-line-2 bg-panel-2 p-3 text-left transition-colors hover:border-brand/50"
                  >
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="mt-1 text-xs text-muted">{t.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.nodes.map((n, i) => (
                        <Badge key={i}>{NODE_META[n.type].label}</Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : (
        <RunLog runs={runs} wfName={wfName} onChanged={load} />
      )}

      {editing && (
        <Builder
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {testing && (
        <TestModal
          workflow={testing}
          onClose={() => {
            setTesting(null);
            load();
          }}
        />
      )}
      {versionsOf && <VersionsModal workflow={versionsOf} onClose={() => setVersionsOf(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ builder */

function NodeConfig({ node, onChange }: { node: WorkflowNode; onChange: (c: Record<string, string>) => void }) {
  const c = node.config;
  const set = (k: string, v: string) => onChange({ ...c, [k]: v });
  switch (node.type) {
    case "condition":
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          <Select value={c.field ?? "body"} onChange={(e) => set("field", e.target.value)}>
            <option value="body">Message text</option>
            <option value="channel">Channel</option>
            <option value="name">Contact name</option>
          </Select>
          <Select value={c.operator ?? "contains"} onChange={(e) => set("operator", e.target.value)}>
            <option value="contains">contains any of</option>
            <option value="not_contains">contains none of</option>
            <option value="equals">equals</option>
          </Select>
          <Input value={c.value ?? ""} onChange={(e) => set("value", e.target.value)} placeholder="keywords, comma separated" />
        </div>
      );
    case "create_lead":
      return (
        <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
          <Input value={c.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Lead title — supports {{name}}" />
          <Input type="number" min={0} value={c.value_inr ?? "0"} onChange={(e) => set("value_inr", e.target.value)} placeholder="Value ₹" />
        </div>
      );
    case "add_tag":
      return <Input value={c.tag ?? ""} onChange={(e) => set("tag", e.target.value)} placeholder="Tag name" />;
    case "set_priority":
      return (
        <Select value={c.priority ?? "high"} onChange={(e) => set("priority", e.target.value)}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </Select>
      );
    case "notify":
      return (
        <div className="grid gap-2">
          <Input value={c.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Notification title — supports {{name}}" />
          <Input value={c.body ?? ""} onChange={(e) => set("body", e.target.value)} placeholder="Body (defaults to the message text)" />
        </div>
      );
    case "ai_draft":
      return (
        <div>
          <Textarea rows={2} value={c.template ?? ""} onChange={(e) => set("template", e.target.value)} />
          <p className="mt-1 text-[11px] text-faint">
            Variables: {"{{name}}"} {"{{business}}"} {"{{channel}}"} — saved as a draft that a human must approve in the inbox.
          </p>
        </div>
      );
    case "wait":
      return (
        <div className="flex items-center gap-2">
          <Input type="number" min={1} value={c.minutes ?? "15"} onChange={(e) => set("minutes", e.target.value)} className="w-28" />
          <span className="text-xs text-muted">minutes (recorded; durable timers need the background worker)</span>
        </div>
      );
    case "approval":
      return <p className="text-xs text-muted">Pauses the run and notifies approvers. Following steps are not executed.</p>;
    case "end":
      return <p className="text-xs text-muted">Stops the workflow.</p>;
    default:
      return null;
  }
}

function Builder({ initial, onClose, onSaved }: { initial: Partial<Workflow>; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient();
  const { workspace } = useApp();
  const toast = useToast();
  const [name, setName] = useState(initial.name ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [trigger, setTrigger] = useState<Workflow["trigger_type"]>(initial.trigger_type ?? "message_received");
  const [nodes, setNodes] = useState<WorkflowNode[]>(initial.definition?.nodes ?? []);
  const [addType, setAddType] = useState<WorkflowNodeType>("condition");
  const [busy, setBusy] = useState(false);

  const move = (i: number, d: -1 | 1) =>
    setNodes((ns) => {
      const j = i + d;
      if (j < 0 || j >= ns.length) return ns;
      const copy = [...ns];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const save = async (activate?: boolean) => {
    if (!name.trim()) return toast("Give the automation a name", "error");
    const bad = nodes.find((n) => (n.type === "condition" && !n.config.value?.trim()) || (n.type === "add_tag" && !n.config.tag?.trim()));
    if (bad) return toast(`Complete the “${NODE_META[bad.type].label}” step`, "error");
    setBusy(true);
    const definition = { nodes: nodes.map((n) => ({ type: n.type, config: n.config })) };
    const payload: Record<string, unknown> = { name: name.trim(), description: description.trim() || null, trigger_type: trigger, definition };
    if (activate) payload.status = nodes.length ? "active" : "draft";
    const { error } = initial.id
      ? await supabase.from("workflows").update(payload).eq("id", initial.id)
      : await supabase.from("workflows").insert({ ...payload, tenant_id: workspace.tenant_id, workspace_id: workspace.id });
    setBusy(false);
    if (error) toast(errMsg(error), "error");
    else {
      toast(initial.id ? "Automation saved (new version if steps changed)" : "Automation created");
      onSaved();
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={initial.id ? `Edit automation · v${initial.version}` : "New automation"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => save()} loading={busy}>
            Save
          </Button>
          {initial.status !== "active" && (
            <Button onClick={() => save(true)} loading={busy}>
              Save & activate
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Trigger">
            <Select value={trigger} onChange={(e) => setTrigger(e.target.value as Workflow["trigger_type"])}>
              {TRIGGERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>

        {/* visual flow */}
        <div>
          <div className="flex items-center gap-3 rounded-xl border border-brand/40 bg-brand/5 px-3 py-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-brand text-black">
              <Zap className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">Trigger: {TRIGGERS.find((t) => t.value === trigger)?.label}</p>
              <p className="text-[11px] text-muted">{TRIGGERS.find((t) => t.value === trigger)?.hint}</p>
            </div>
          </div>
          {nodes.map((n, i) => {
            const meta = NODE_META[n.type];
            const Icon = meta.icon;
            return (
              <div key={i}>
                <div className="ml-7 h-5 w-px bg-line-2" />
                <div className="rounded-xl border border-line-2 bg-panel-2 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-lg text-black" style={{ background: meta.color }}>
                      <Icon className="size-3.5" />
                    </span>
                    <p className="flex-1 text-sm font-medium">
                      {i + 1}. {meta.label}
                    </p>
                    <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:text-ink disabled:opacity-30">
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      aria-label="Move down"
                      disabled={i === nodes.length - 1}
                      onClick={() => move(i, 1)}
                      className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"
                    >
                      <ArrowDown className="size-4" />
                    </button>
                    <button aria-label="Remove step" onClick={() => setNodes((ns) => ns.filter((_, j) => j !== i))} className="rounded p-1 text-muted hover:text-red-300">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <NodeConfig node={n} onChange={(config) => setNodes((ns) => ns.map((x, j) => (j === i ? { ...x, config } : x)))} />
                </div>
              </div>
            );
          })}
          <div className="ml-7 h-5 w-px bg-line-2" />
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line-2 p-3">
            <Select value={addType} onChange={(e) => setAddType(e.target.value as WorkflowNodeType)} className="w-auto flex-1">
              {NODE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {NODE_META[t].label}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              onClick={() => setNodes((ns) => [...ns, { type: addType, config: { ...NODE_META[addType].defaults } }])}
            >
              <Plus className="size-4" /> Add step
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ test */

function TestModal({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const supabase = createClient();
  const toast = useToast();
  const [payload, setPayload] = useState({ name: "Test Customer", channel: "instagram", body: "Hi, what is the membership price?" });
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);

  const runTest = async () => {
    setBusy(true);
    setRun(null);
    setSteps([]);
    try {
      const { data, error } = await supabase.rpc("run_workflow_test", { p_workflow: workflow.id, p_payload: payload });
      if (error) throw error;
      const runId = data as string;
      const [{ data: r }, { data: s }] = await Promise.all([
        supabase.from("workflow_runs").select("*").eq("id", runId).single(),
        supabase.from("workflow_steps").select("*").eq("run_id", runId).order("position"),
      ]);
      setRun(r as Run);
      setSteps((s ?? []) as Step[]);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Test run · ${workflow.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={runTest} loading={busy}>
            {!busy && <Play className="size-4" />} Run test
          </Button>
        </>
      }
    >
      <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
        Test runs execute real actions (leads, tags, notifications) in this workspace using the sample data below. Contact-based
        actions are skipped because no real contact is attached.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contact name">
          <Input value={payload.name} onChange={(e) => setPayload({ ...payload, name: e.target.value })} />
        </Field>
        <Field label="Channel">
          <Select value={payload.channel} onChange={(e) => setPayload({ ...payload, channel: e.target.value })}>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {providerName(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Message text" className="sm:col-span-2">
          <Textarea rows={2} value={payload.body} onChange={(e) => setPayload({ ...payload, body: e.target.value })} />
        </Field>
      </div>
      {run && (
        <div className="mt-4 rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-sm font-semibold">Result</p>
            <Badge tone={RUN_TONE[run.status]}>{run.status.replace("_", " ")}</Badge>
            {run.error && <span className="text-xs text-red-300">{run.error}</span>}
          </div>
          <StepList steps={steps} />
        </div>
      )}
    </Modal>
  );
}

function StepList({ steps }: { steps: Step[] }) {
  if (!steps.length) return <p className="text-xs text-faint">No steps executed.</p>;
  return (
    <ol className="space-y-1.5">
      {steps.map((s) => (
        <li key={s.id} className="rounded-lg bg-panel-2 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-faint">{s.position}.</span>
            <span className="font-medium">{NODE_META[s.node_type as WorkflowNodeType]?.label ?? s.node_type}</span>
            <Badge tone={s.status === "completed" ? "green" : s.status === "failed" ? "red" : "gray"}>{s.status}</Badge>
          </div>
          {s.output && Object.keys(s.output).length > 0 && (
            <pre className="mt-1 overflow-x-auto text-[11px] whitespace-pre-wrap text-muted">{JSON.stringify(s.output, null, 2)}</pre>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ runs */

function RunLog({ runs, wfName, onChanged }: { runs: Run[]; wfName: (id: string) => string; onChanged: () => void }) {
  const supabase = createClient();
  const { can } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, Step[]>>({});
  const [statusFilter, setStatusFilter] = useState("all");

  const expand = async (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!steps[id]) {
      const { data, error } = await supabase.from("workflow_steps").select("*").eq("run_id", id).order("position");
      if (error) toast(errMsg(error), "error");
      setSteps((s) => ({ ...s, [id]: (data ?? []) as Step[] }));
    }
  };

  const cancel = async (id: string) => {
    const { error } = await supabase.rpc("cancel_workflow_run", { p_run: id });
    if (error) toast(errMsg(error), "error");
    else {
      toast("Run cancelled");
      onChanged();
    }
  };

  const list = runs.filter((r) => statusFilter === "all" || r.status === statusFilter);

  return (
    <div>
      <div className="mb-3">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
          <option value="all">All statuses</option>
          {Object.keys(RUN_TONE).map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </Select>
      </div>
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={History} title="No runs yet" description="Runs appear when an active automation is triggered or tested." />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {list.map((r) => (
            <div key={r.id}>
              <button onClick={() => expand(r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-panel-2">
                {open === r.id ? <ChevronDown className="size-4 shrink-0 text-muted" /> : <ChevronRight className="size-4 shrink-0 text-muted" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{wfName(r.workflow_id)}</p>
                  <p className="truncate text-xs text-faint">
                    v{r.version} · {formatDate(r.started_at)}
                    {typeof r.trigger_payload?.name === "string" ? ` · ${r.trigger_payload.name}` : ""}
                  </p>
                </div>
                <Badge tone={RUN_TONE[r.status]}>{r.status.replace("_", " ")}</Badge>
              </button>
              {open === r.id && (
                <div className={cn("space-y-3 px-4 pb-4")}>
                  {r.error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{r.error}</p>}
                  {typeof r.trigger_payload?.body === "string" && (
                    <p className="text-xs text-muted">
                      Trigger message: <span className="text-ink">“{r.trigger_payload.body}”</span>
                    </p>
                  )}
                  {steps[r.id] ? <StepList steps={steps[r.id]} /> : <LoadingBlock />}
                  {(r.status === "running" || r.status === "waiting_approval") && can("manage_workspace") && (
                    <Button size="sm" variant="danger" onClick={() => cancel(r.id)}>
                      Cancel run
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function VersionsModal({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const supabase = createClient();
  const [versions, setVersions] = useState<Version[] | null>(null);

  useEffect(() => {
    supabase
      .from("workflow_versions")
      .select("*")
      .eq("workflow_id", workflow.id)
      .order("version", { ascending: false })
      .then(({ data }: { data: Version[] | null }) => setVersions(data ?? []));
  }, [supabase, workflow.id]);

  return (
    <Modal open onClose={onClose} title={`Version history · ${workflow.name}`}>
      {!versions ? (
        <LoadingBlock />
      ) : versions.length === 0 ? (
        <p className="text-sm text-muted">No versions recorded.</p>
      ) : (
        <ol className="space-y-2">
          {versions.map((v) => (
            <li key={v.id} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <Badge tone={v.version === workflow.version ? "green" : "gray"}>v{v.version}</Badge>
                {v.version === workflow.version && <span className="text-xs text-brand">current</span>}
                <span className="ml-auto text-xs text-faint">{formatDate(v.created_at)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(v.definition?.nodes ?? []).map((n, i) => (
                  <Badge key={i}>{NODE_META[n.type]?.label ?? n.type}</Badge>
                ))}
                {!v.definition?.nodes?.length && <span className="text-xs text-faint">No steps</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
