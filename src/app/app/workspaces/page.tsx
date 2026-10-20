"use client";

import { useCallback, useEffect, useState } from "react";
import { Briefcase, Check, Copy, Mail, Pencil, Plus, Trash2, UserMinus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select } from "@/components/ui";
import { cn, errMsg, formatDate, slugify, timeAgo } from "@/lib/utils";
import type { Workspace } from "@/lib/types";

const INDUSTRIES = ["fitness", "events & production", "salon & spa", "restaurant", "retail", "education", "real estate", "healthcare", "agency", "other"];
const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC"];
const INVITE_ROLES = ["admin", "manager", "editor", "support", "analyst", "viewer", "approver"] as const;
const WS_ROLES = ["manager", "editor", "support", "analyst", "viewer", "approver"] as const;

const ROLE_HELP: Record<string, string> = {
  admin: "Everything in the organization except owner-only billing and deletion.",
  manager: "Manages a workspace: accounts, approvals, content, inbox, automations.",
  editor: "Creates and schedules content; posts may need approval.",
  support: "Handles assigned inbox conversations, contacts and leads.",
  analyst: "Read-only reports and dashboards.",
  viewer: "Read-only access.",
  approver: "Client approver — can approve or reject posts only.",
};

interface Invitation {
  id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  workspace_id: string | null;
  created_at: string;
}
interface WsMember {
  workspace_id: string;
  user_id: string;
  role: string;
  email?: string | null;
  name?: string | null;
}

function CopyLink({ text }: { text: string }) {
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
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {done ? "Copied" : "Copy link"}
    </Button>
  );
}

export default function WorkspacesPage() {
  const supabase = createClient();
  const toast = useToast();
  const { tenant, tenantRole, workspaces, workspace: currentWs, user, refresh } = useApp();
  const isAdmin = tenantRole === "owner" || tenantRole === "admin";

  const [invites, setInvites] = useState<Invitation[]>([]);
  const [members, setMembers] = useState<WsMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsModal, setWsModal] = useState<Partial<Workspace> | null>(null);
  const [savingWs, setSavingWs] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", role: "editor", workspace_id: "" });
  const [inviting, setInviting] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    setLoading(true);
    const [inv, wm] = await Promise.all([
      isAdmin
        ? supabase.from("invitations").select("id,email,role,token,status,workspace_id,created_at").eq("tenant_id", tenant.id).eq("status", "pending").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase.from("workspace_members").select("workspace_id,user_id,role").eq("tenant_id", tenant.id),
    ]);
    if (inv.error || wm.error) toast(errMsg(inv.error || wm.error), "error");
    setInvites((inv.data ?? []) as Invitation[]);
    const rows = (wm.data ?? []) as WsMember[];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,email,full_name").in("id", ids);
      const byId = new Map<string, { id: string; full_name: string | null; email: string | null }>((profs ?? []).map((p: { id: string; email: string | null; full_name: string | null }) => [p.id, p] as const));
      rows.forEach((r) => {
        r.email = byId.get(r.user_id)?.email ?? null;
        r.name = byId.get(r.user_id)?.full_name ?? null;
      });
    }
    setMembers(rows);
    setLoading(false);
  }, [supabase, tenant.id, isAdmin, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const saveWorkspace = async () => {
    if (!wsModal?.name?.trim()) return toast("Name is required", "info");
    setSavingWs(true);
    const payload = { name: wsModal.name.trim(), industry: wsModal.industry || null, timezone: wsModal.timezone || "Asia/Kolkata" };
    const { error } = wsModal.id
      ? await supabase.from("workspaces").update(payload).eq("id", wsModal.id)
      : await supabase
          .from("workspaces")
          .insert({ ...payload, tenant_id: tenant.id, slug: `${slugify(payload.name)}-${Math.random().toString(36).slice(2, 6)}` });
    setSavingWs(false);
    if (error) return toast(errMsg(error), "error");
    toast(wsModal.id ? "Workspace updated" : "Workspace created");
    setWsModal(null);
    await refresh();
  };

  const deleteWorkspace = async (w: Workspace) => {
    if (workspaces.length <= 1) return toast("You need at least one workspace", "info");
    if (!confirm(`Delete "${w.name}" and all its posts, leads, inbox and automations? This cannot be undone.`)) return;
    const { error } = await supabase.from("workspaces").delete().eq("id", w.id);
    if (error) return toast(errMsg(error), "error");
    toast("Workspace deleted");
    await refresh();
  };

  const sendInvite = async () => {
    const email = invite.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Enter a valid email", "info");
    setInviting(true);
    const { error } = await supabase.from("invitations").insert({
      tenant_id: tenant.id,
      email,
      role: invite.role,
      workspace_id: invite.role === "admin" ? null : invite.workspace_id || null,
      invited_by: user.id,
    });
    setInviting(false);
    if (error) return toast(errMsg(error), "error");
    toast("Invitation created — share the link with your teammate");
    setInviteOpen(false);
    setInvite({ email: "", role: "editor", workspace_id: "" });
    load();
  };

  const revokeInvite = async (i: Invitation) => {
    const { error } = await supabase.from("invitations").update({ status: "revoked" }).eq("id", i.id);
    if (error) return toast(errMsg(error), "error");
    toast("Invitation revoked");
    load();
  };

  const changeWsRole = async (m: WsMember, role: string) => {
    const { error } = await supabase.from("workspace_members").update({ role }).eq("workspace_id", m.workspace_id).eq("user_id", m.user_id);
    if (error) return toast(errMsg(error), "error");
    toast("Role updated");
    load();
  };
  const removeWsMember = async (m: WsMember) => {
    if (!confirm(`Remove ${m.email ?? "member"} from this workspace?`)) return;
    const { error } = await supabase.from("workspace_members").delete().eq("workspace_id", m.workspace_id).eq("user_id", m.user_id);
    if (error) return toast(errMsg(error), "error");
    toast("Removed from workspace");
    load();
  };

  const wsName = (id: string | null) => (id ? workspaces.find((w) => w.id === id)?.name ?? "workspace" : "Whole organization");

  return (
    <div>
      <PageHeader
        title="Businesses & team"
        description={`Each workspace is one business or client brand inside ${tenant.name}. Data never crosses workspaces.`}
        actions={
          isAdmin && (
            <>
              <Button variant="secondary" onClick={() => setInviteOpen(true)}>
                <Mail className="size-4" /> Invite member
              </Button>
              <Button onClick={() => setWsModal({ name: "", industry: "", timezone: "Asia/Kolkata" })}>
                <Plus className="size-4" /> New workspace
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {workspaces.map((w) => {
          const wsMembers = members.filter((m) => m.workspace_id === w.id);
          return (
            <Card key={w.id} className={cn("p-4", w.id === currentWs.id && "border-brand/60")}>
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 font-bold text-brand">{w.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{w.name}</p>
                  <p className="truncate text-xs text-muted capitalize">
                    {w.industry || "No industry"} · {w.timezone}
                  </p>
                  <p className="text-xs text-faint">Created {formatDate(w.created_at, { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                {w.id === currentWs.id && <Badge tone="green">Current</Badge>}
              </div>
              <p className="mt-3 text-xs text-muted">
                {wsMembers.length} workspace member{wsMembers.length === 1 ? "" : "s"} + organization admins
              </p>
              {isAdmin && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setWsModal(w)}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => deleteWorkspace(w)} disabled={workspaces.length <= 1}>
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {isAdmin && (
            <Card>
              <CardHeader title="Pending invitations" description="Invitees sign up or log in with the invited email, then open the link." />
              {invites.length === 0 ? (
                <EmptyState icon={Mail} title="No pending invitations" />
              ) : (
                <ul className="divide-y divide-line">
                  {invites.map((i) => (
                    <li key={i.id} className="px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">{i.email}</p>
                        <Badge tone="purple">{i.role}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {wsName(i.workspace_id)} · sent {timeAgo(i.created_at)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <CopyLink text={`${origin}/onboarding?invite=${i.token}`} />
                        <Button size="sm" variant="ghost" onClick={() => revokeInvite(i)}>
                          Revoke
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Workspace members" description="Organization owners & admins can access every workspace automatically." />
            {members.length === 0 ? (
              <EmptyState icon={Briefcase} title="No workspace-level members yet" description="Invite editors, support agents or client approvers to a specific workspace." />
            ) : (
              <ul className="divide-y divide-line">
                {members.map((m) => (
                  <li key={`${m.workspace_id}-${m.user_id}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.name ?? m.email ?? m.user_id.slice(0, 8)}</p>
                      <p className="truncate text-xs text-muted">
                        {m.email} · {wsName(m.workspace_id)}
                      </p>
                    </div>
                    {isAdmin ? (
                      <div className="flex items-center gap-2">
                        <Select className="h-8 w-32 text-xs" value={m.role} onChange={(e) => changeWsRole(m, e.target.value)}>
                          {WS_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                        <Button size="icon" variant="ghost" aria-label="Remove from workspace" onClick={() => removeWsMember(m)}>
                          <UserMinus className="size-4 text-red-300" />
                        </Button>
                      </div>
                    ) : (
                      <Badge>{m.role}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Roles" />
            <dl className="grid gap-3 p-4 text-sm sm:grid-cols-2 sm:p-5">
              {Object.entries(ROLE_HELP).map(([r, d]) => (
                <div key={r}>
                  <dt className="font-medium capitalize text-brand">{r}</dt>
                  <dd className="text-muted">{d}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      )}

      <Modal
        open={!!wsModal}
        onClose={() => setWsModal(null)}
        title={wsModal?.id ? "Edit workspace" : "New workspace"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setWsModal(null)}>
              Cancel
            </Button>
            <Button onClick={saveWorkspace} loading={savingWs}>
              Save
            </Button>
          </>
        }
      >
        {wsModal && (
          <div className="space-y-4">
            <Field label="Business / brand name">
              <Input value={wsModal.name ?? ""} onChange={(e) => setWsModal({ ...wsModal, name: e.target.value })} placeholder="e.g. Bloom All Production" />
            </Field>
            <Field label="Industry">
              <Select value={wsModal.industry ?? ""} onChange={(e) => setWsModal({ ...wsModal, industry: e.target.value })}>
                <option value="">Select…</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {i[0].toUpperCase() + i.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Timezone">
              <Select value={wsModal.timezone ?? "Asia/Kolkata"} onChange={(e) => setWsModal({ ...wsModal, timezone: e.target.value })}>
                {TIMEZONES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            {!wsModal.id && <p className="text-xs text-faint">Your plan limits how many workspaces you can create.</p>}
          </div>
        )}
      </Modal>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a team member"
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={sendInvite} loading={inviting}>
              Create invitation
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Email">
            <Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="name@company.com" />
          </Field>
          <Field label="Role">
            <Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-muted">{ROLE_HELP[invite.role]}</p>
          {invite.role !== "admin" && (
            <Field label="Workspace" hint="(recommended — limits access to one business)">
              <Select value={invite.workspace_id} onChange={(e) => setInvite({ ...invite, workspace_id: e.target.value })}>
                <option value="">Whole organization (role applies org-wide)</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </Modal>
    </div>
  );
}
