"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, Download, KeyRound, Plus, Trash2, Webhook } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select, Tabs } from "@/components/ui";
import { downloadFile, errMsg, formatDate, timeAgo } from "@/lib/utils";
import { ROLE_DESCRIPTIONS, roleLabel } from "@/lib/roles";
import type { TenantRole } from "@/lib/types";

type Tab = "profile" | "org" | "api" | "webhooks" | "audit" | "data";

function CopyInline({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {done ? "Copied" : "Copy"}
    </Button>
  );
}

/* ------------------------------------------------------------------ profile */
function ProfileTab() {
  const supabase = createClient();
  const toast = useToast();
  const { user, profile, refresh } = useApp();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState<"name" | "pw" | null>(null);

  const saveName = async () => {
    setBusy("name");
    const { error } = await supabase.from("profiles").update({ full_name: name.trim() || null }).eq("id", user.id);
    setBusy(null);
    if (error) return toast(errMsg(error), "error");
    toast("Profile updated");
    refresh();
  };
  const savePw = async () => {
    if (pw.length < 8) return toast("Password must be at least 8 characters", "info");
    if (pw !== pw2) return toast("Passwords don't match", "info");
    setBusy("pw");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(null);
    if (error) return toast(errMsg(error), "error");
    setPw("");
    setPw2("");
    toast("Password changed");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Your profile" />
        <div className="space-y-4 p-4 sm:p-5">
          <Field label="Email">
            <Input value={user.email ?? ""} disabled />
          </Field>
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button onClick={saveName} loading={busy === "name"}>
            Save
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Change password" />
        <div className="space-y-4 p-4 sm:p-5">
          <Field label="New password" hint="min. 8 characters">
            <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label="Confirm password">
            <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
          <Button onClick={savePw} loading={busy === "pw"}>
            Update password
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ organization */
interface MemberRow {
  user_id: string;
  role: TenantRole;
  created_at: string;
  name: string | null;
  email: string | null;
}
const ASSIGNABLE: TenantRole[] = ["admin", "manager", "editor", "support", "analyst", "viewer", "approver"];

function OrgTab() {
  const supabase = createClient();
  const toast = useToast();
  const { tenant, tenantRole, user, refresh } = useApp();
  const isAdmin = tenantRole === "owner" || tenantRole === "admin";
  const isOwner = tenantRole === "owner";
  const [orgName, setOrgName] = useState(tenant.name);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("tenant_members").select("user_id,role,created_at").eq("tenant_id", tenant.id).order("created_at");
    if (error) toast(errMsg(error), "error");
    const rows = (data ?? []) as { user_id: string; role: TenantRole; created_at: string }[];
    const ids = rows.map((r) => r.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id,full_name,email").in("id", ids)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const byId = new Map<string, { id: string; full_name: string | null; email: string | null }>((profs ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [p.id, p] as const));
    setMembers(rows.map((r) => ({ ...r, name: byId.get(r.user_id)?.full_name ?? null, email: byId.get(r.user_id)?.email ?? null })));
    setLoading(false);
  }, [supabase, tenant.id, toast]);

  useEffect(() => {
    setOrgName(tenant.name);
    load();
  }, [load, tenant.name]);

  const rename = async () => {
    if (!orgName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("tenants").update({ name: orgName.trim() }).eq("id", tenant.id);
    setSaving(false);
    if (error) return toast(errMsg(error), "error");
    toast("Organization renamed");
    refresh();
  };
  const changeRole = async (m: MemberRow, role: string) => {
    const { error } = await supabase.from("tenant_members").update({ role }).eq("tenant_id", tenant.id).eq("user_id", m.user_id);
    if (error) return toast(errMsg(error), "error");
    toast("Role updated");
    load();
  };
  const removeMember = async (m: MemberRow) => {
    if (!confirm(`Remove ${m.email ?? "this member"} from ${tenant.name}?`)) return;
    const { error } = await supabase.from("tenant_members").delete().eq("tenant_id", tenant.id).eq("user_id", m.user_id);
    if (error) return toast(errMsg(error), "error");
    toast("Member removed");
    load();
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Organization" description={`${tenant.kind === "agency" ? "Agency" : "Business"} · slug ${tenant.slug}`} />
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5">
          <Field label="Name" className="flex-1">
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={!isAdmin} />
          </Field>
          {isAdmin && (
            <Button onClick={rename} loading={saving} disabled={orgName.trim() === tenant.name}>
              Save
            </Button>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader title="Members" description="Invite people from Businesses & team." />
        {loading ? (
          <LoadingBlock />
        ) : (
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name ?? m.email ?? m.user_id.slice(0, 8)} {m.user_id === user.id && <span className="text-xs text-faint">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {m.email} · joined {timeAgo(m.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner && m.role !== "owner" ? (
                    <Select className="h-8 w-36 text-xs" value={m.role} onChange={(e) => changeRole(m, e.target.value)}>
                      {ASSIGNABLE.map((r) => (
                        <option key={r} value={r} title={ROLE_DESCRIPTIONS[r]}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone={m.role === "owner" ? "green" : "gray"}>{roleLabel(m.role)}</Badge>
                  )}
                  {isAdmin && m.role !== "owner" && m.user_id !== user.id && (
                    <Button size="icon" variant="ghost" aria-label="Remove member" onClick={() => removeMember(m)}>
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ api keys */
interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function ApiKeysTab() {
  const supabase = createClient();
  const toast = useToast();
  const { tenant } = useApp();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("api_keys")
      .select("id,name,prefix,created_at,last_used_at,revoked_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false });
    if (error) toast(errMsg(error), "error");
    setKeys((data ?? []) as ApiKey[]);
    setLoading(false);
  }, [supabase, tenant.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    const { data, error } = await supabase.rpc("create_api_key", { p_tenant: tenant.id, p_name: name.trim() || "API key" });
    setCreating(false);
    if (error) return toast(errMsg(error), "error");
    setNewKey(data as string);
    setName("");
    load();
  };
  const revoke = async (k: ApiKey) => {
    if (!confirm(`Revoke "${k.name}"? Integrations using it will stop working.`)) return;
    const { error } = await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", k.id);
    if (error) return toast(errMsg(error), "error");
    toast("Key revoked");
    load();
  };

  return (
    <Card>
      <CardHeader title="API keys" description="Keys are hashed on the server; the full key is shown only once." />
      <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:p-5">
        <Input placeholder="Key name, e.g. Website form" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={create} loading={creating} className="shrink-0">
          <KeyRound className="size-4" /> Create key
        </Button>
      </div>
      {loading ? (
        <LoadingBlock />
      ) : keys.length === 0 ? (
        <EmptyState icon={KeyRound} title="No API keys" />
      ) : (
        <ul className="divide-y divide-line">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{k.name}</p>
                <p className="font-mono text-xs text-muted">
                  {k.prefix}… · created {timeAgo(k.created_at)} · {k.last_used_at ? `used ${timeAgo(k.last_used_at)}` : "never used"}
                </p>
              </div>
              {k.revoked_at ? (
                <Badge tone="red">revoked</Badge>
              ) : (
                <Button size="sm" variant="danger" onClick={() => revoke(k)}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!newKey} onClose={() => setNewKey(null)} title="Your new API key" footer={<Button onClick={() => setNewKey(null)}>Done</Button>}>
        <p className="mb-3 text-sm text-warn">Copy this key now. For security it will never be shown again.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-bg p-3 font-mono text-xs">{newKey}</code>
          {newKey && <CopyInline text={newKey} />}
        </div>
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ webhooks */
const EVENTS = ["post.published", "post.failed", "lead.created", "message.received"];
interface Hook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

function WebhooksTab() {
  const supabase = createClient();
  const toast = useToast();
  const { tenant } = useApp();
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Hook> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("webhook_endpoints").select("id,url,events,active,created_at").eq("tenant_id", tenant.id).order("created_at");
    if (error) toast(errMsg(error), "error");
    setHooks((data ?? []) as Hook[]);
    setLoading(false);
  }, [supabase, tenant.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    const url = (editing.url ?? "").trim();
    if (!/^https:\/\/[^\s]+$/.test(url)) return toast("URL must start with https://", "info");
    if (!editing.events?.length) return toast("Pick at least one event", "info");
    setSaving(true);
    const payload = { url, events: editing.events, active: editing.active ?? true };
    const { error } = editing.id
      ? await supabase.from("webhook_endpoints").update(payload).eq("id", editing.id)
      : await supabase.from("webhook_endpoints").insert({ ...payload, tenant_id: tenant.id, secret_hint: "whsec_…" });
    setSaving(false);
    if (error) return toast(errMsg(error), "error");
    toast("Webhook saved");
    setEditing(null);
    load();
  };
  const remove = async (h: Hook) => {
    if (!confirm(`Delete webhook ${h.url}?`)) return;
    const { error } = await supabase.from("webhook_endpoints").delete().eq("id", h.id);
    if (error) return toast(errMsg(error), "error");
    load();
  };
  const toggleEvent = (ev: string) =>
    setEditing((e) => (e ? { ...e, events: e.events?.includes(ev) ? e.events.filter((x) => x !== ev) : [...(e.events ?? []), ev] } : e));

  return (
    <Card>
      <CardHeader
        title="Webhooks"
        description="Receive events on your own HTTPS endpoint. Delivery is handled by the background worker."
        action={
          <Button size="sm" onClick={() => setEditing({ url: "https://", events: [], active: true })}>
            <Plus className="size-3.5" /> Add
          </Button>
        }
      />
      {loading ? (
        <LoadingBlock />
      ) : hooks.length === 0 ? (
        <EmptyState icon={Webhook} title="No webhooks" description="Add an endpoint to receive post, lead and message events." />
      ) : (
        <ul className="divide-y divide-line">
          {hooks.map((h) => (
            <li key={h.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm">{h.url}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {h.events.map((e) => (
                    <Badge key={e} tone="blue">
                      {e}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={h.active ? "green" : "gray"}>{h.active ? "active" : "paused"}</Badge>
                <Button size="sm" variant="secondary" onClick={() => setEditing(h)}>
                  Edit
                </Button>
                <Button size="icon" variant="ghost" aria-label="Delete webhook" onClick={() => remove(h)}>
                  <Trash2 className="size-4 text-danger" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit webhook" : "New webhook"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Endpoint URL">
              <Input value={editing.url ?? ""} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://example.com/hooks" />
            </Field>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Events</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                    <input type="checkbox" className="accent-[var(--color-brand)]" checked={!!editing.events?.includes(ev)} onChange={() => toggleEvent(ev)} />
                    {ev}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[var(--color-brand)]" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Active
            </label>
          </div>
        )}
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ audit */
interface AuditRow {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  meta: Record<string, string>;
  created_at: string;
}

function AuditTab() {
  const supabase = createClient();
  const toast = useToast();
  const { tenant } = useApp();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actors, setActors] = useState<Record<string, string>>({});
  const [entity, setEntity] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("audit_logs").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(100);
    if (entity) q = q.eq("entity", entity);
    const { data, error } = await q;
    if (error) toast(errMsg(error), "error");
    const list = (data ?? []) as AuditRow[];
    setRows(list);
    const ids = [...new Set(list.map((r) => r.actor_id).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,email,full_name").in("id", ids);
      setActors(Object.fromEntries((profs ?? []).map((p: { id: string; email: string | null; full_name: string | null }) => [p.id, p.full_name || p.email || p.id.slice(0, 8)])));
    }
    setLoading(false);
  }, [supabase, tenant.id, entity, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const entities = ["workspaces", "tenant_members", "workspace_members", "invitations", "social_accounts", "content_posts", "post_approvals", "leads", "workflows", "subscriptions", "api_keys", "webhook_endpoints"];

  return (
    <Card>
      <CardHeader
        title="Audit log"
        description="Latest 100 changes. Entries are written by the database and cannot be edited."
        action={
          <Select className="h-8 w-44 text-xs" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">All entities</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {e.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        }
      />
      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No entries</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-3 sm:px-5">
              <Badge tone={r.action === "delete" ? "red" : r.action === "insert" ? "green" : "blue"}>{r.action}</Badge>
              <span className="min-w-0 flex-1 truncate">
                <span className="text-muted">{r.entity.replace(/_/g, " ")}</span>
                {r.meta?.name && <span> · {r.meta.name}</span>}
                {r.meta?.status && <span className="text-faint"> · {r.meta.status}</span>}
                {r.meta?.role && <span className="text-faint"> · {roleLabel(r.meta.role)}</span>}
              </span>
              <span className="text-xs text-faint">
                {r.actor_id ? actors[r.actor_id] ?? r.actor_id.slice(0, 8) : "system"} · {formatDate(r.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ data & privacy */
function DataTab() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const { workspace, tenant, can } = useApp();
  const [exporting, setExporting] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const tables = ["content_posts", "leads", "contacts", "conversations", "messages", "workflows"] as const;
      const results = await Promise.all(tables.map((t) => supabase.from(t).select("*").eq("workspace_id", workspace.id).limit(10000)));
      const out: Record<string, unknown> = { exported_at: new Date().toISOString(), organization: tenant.name, workspace: workspace.name };
      results.forEach((r, i) => {
        if (r.error) throw r.error;
        out[tables[i]] = r.data;
      });
      downloadFile(`${workspace.slug}-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2), "application/json");
      toast("Export downloaded");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setExporting(false);
    }
  };

  const deleteOrg = async () => {
    if (confirmName !== tenant.name) return;
    setDeleting(true);
    const { error } = await supabase.from("tenants").delete().eq("id", tenant.id);
    setDeleting(false);
    if (error) return toast(errMsg(error), "error");
    try {
      localStorage.removeItem("sp.tenant");
      localStorage.removeItem("sp.workspace");
    } catch {}
    toast("Organization deleted");
    router.replace("/onboarding");
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Export workspace data" description={`Download posts, leads, contacts, conversations, messages and automations of ${workspace.name} as JSON.`} />
        <div className="p-4 sm:p-5">
          <Button variant="secondary" onClick={exportData} loading={exporting}>
            <Download className="size-4" /> Export JSON
          </Button>
        </div>
      </Card>
      {can("owner") && (
        <Card className="border-danger/30">
          <CardHeader title={<span className="flex items-center gap-2 text-danger"><AlertTriangle className="size-4" /> Danger zone</span>} description="Permanently delete this organization, all workspaces and all data. This cannot be undone." />
          <div className="space-y-3 p-4 sm:p-5">
            <Field label={`Type "${tenant.name}" to confirm`}>
              <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
            </Field>
            <Button variant="danger" onClick={deleteOrg} loading={deleting} disabled={confirmName !== tenant.name}>
              <Trash2 className="size-4" /> Delete organization
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ page */
export default function SettingsPage() {
  const { tenantRole } = useApp();
  const isAdmin = tenantRole === "owner" || tenantRole === "admin";
  const [tab, setTab] = useState<Tab>("profile");

  const tabs = useMemo(
    () =>
      [
        { value: "profile" as Tab, label: "Profile" },
        { value: "org" as Tab, label: "Organization" },
        ...(isAdmin
          ? [
              { value: "api" as Tab, label: "API keys" },
              { value: "webhooks" as Tab, label: "Webhooks" },
              { value: "audit" as Tab, label: "Audit log" },
            ]
          : []),
        { value: "data" as Tab, label: "Data & privacy" },
      ],
    [isAdmin],
  );

  return (
    <div>
      <PageHeader title="Settings" description="Your profile, organization, integrations and data." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={tabs} />
      {tab === "profile" && <ProfileTab />}
      {tab === "org" && <OrgTab />}
      {tab === "api" && isAdmin && <ApiKeysTab />}
      {tab === "webhooks" && isAdmin && <WebhooksTab />}
      {tab === "audit" && isAdmin && <AuditTab />}
      {tab === "data" && <DataTab />}
    </div>
  );
}
