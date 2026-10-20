"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, IndianRupee, LifeBuoy, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select, StatCard, Tabs, type Tone } from "@/components/ui";
import { TICKET_TONE, TicketThread } from "@/components/ticket-thread";
import { useToast } from "@/components/toast";
import { errMsg, formatDate, formatINR, timeAgo } from "@/lib/utils";
import type { SupportTicket } from "@/lib/types";

interface TenantRow {
  id: string;
  name: string;
  kind: string;
  created_at: string;
  plan: string | null;
  status: string | null;
  period_end: string | null;
  members: number;
  workspaces: number;
  posts_month: number;
  ai_month: number;
  owner_email: string | null;
}

interface Overview {
  tenants: number;
  users: number;
  workspaces: number;
  active_subscriptions: number;
  trialing: number;
  mrr_inr: number;
  open_tickets: number;
  posts_30d: number;
  ai_credits_30d: number;
  failed_posts_7d: number;
  tenant_list: TenantRow[];
}

const PLANS = ["starter", "growth", "agency", "enterprise"];
const SUB_STATUSES = ["trialing", "active", "past_due", "cancelled", "expired"];
const SUB_TONE: Record<string, Tone> = { active: "green", trialing: "blue", past_due: "yellow", cancelled: "gray", expired: "red" };

export default function PlatformAdminPage() {
  const supabase = createClient();
  const toast = useToast();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [tab, setTab] = useState<"tenants" | "support">("tenants");
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [managing, setManaging] = useState<TenantRow | null>(null);
  const [manage, setManage] = useState({ plan: "growth", status: "active", extend: 0 });
  const [saving, setSaving] = useState(false);
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    const { data: isAdmin } = await supabase.rpc("platform_is_admin");
    setAllowed(Boolean(isAdmin));
    if (!isAdmin) return;
    const [ov, tk] = await Promise.all([
      supabase.rpc("platform_overview"),
      supabase.from("support_tickets").select("*").order("updated_at", { ascending: false }).limit(300),
    ]);
    if (ov.error) toast(errMsg(ov.error), "error");
    setData(ov.data as Overview);
    setTickets((tk.data ?? []) as SupportTicket[]);
  }, [supabase, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const tenantName = useCallback((id: string) => data?.tenant_list.find((t) => t.id === id)?.name ?? "Unknown tenant", [data]);

  const filteredTenants = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.tenant_list ?? []).filter(
      (t) =>
        (!term || t.name.toLowerCase().includes(term) || (t.owner_email ?? "").toLowerCase().includes(term)) &&
        (!planFilter || t.plan === planFilter) &&
        (!statusFilter || t.status === statusFilter),
    );
  }, [data, q, planFilter, statusFilter]);

  const saveManage = async () => {
    if (!managing) return;
    setSaving(true);
    const { error } = await supabase.rpc("platform_update_subscription", {
      p_tenant: managing.id,
      p_plan: manage.plan,
      p_status: manage.status,
      p_extend_days: Number(manage.extend) || 0,
    });
    setSaving(false);
    if (error) return toast(errMsg(error), "error");
    toast("Subscription updated");
    setManaging(null);
    load();
  };

  if (allowed === null) return <LoadingBlock />;
  if (!allowed)
    return (
      <Card>
        <EmptyState
          icon={ShieldCheck}
          title="Platform admins only"
          description="This console is for the Digi Mithra platform team. To grant access, add the user's id to app_private.platform_admins in the Supabase SQL editor: insert into app_private.platform_admins (user_id) values ('<user uuid>');"
        />
      </Card>
    );
  if (!data) return <LoadingBlock />;

  const current = tickets.find((t) => t.id === openTicket) ?? null;
  const shownTickets = tickets.filter((t) => showClosed || !["resolved", "closed"].includes(t.status));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Super admin"
        description="Platform health, tenants, subscriptions and support. Tenant content (posts, inbox, CRM) is intentionally not accessible here."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Tenants" value={data.tenants} icon={Building2} hint={`${data.workspaces} workspaces`} />
        <StatCard label="Users" value={data.users} icon={Users} tone="info" />
        <StatCard label="MRR" value={formatINR(data.mrr_inr)} icon={IndianRupee} hint={`${data.active_subscriptions} active · ${data.trialing} trialing`} />
        <StatCard label="Open tickets" value={data.open_tickets} icon={LifeBuoy} tone="warn" />
        <StatCard label="Posts (30d)" value={data.posts_30d} icon={Sparkles} hint={`${data.ai_credits_30d} AI credits used`} />
      </div>
      {data.failed_posts_7d > 0 && (
        <Card className="flex items-center gap-3 border-warn/30 bg-warn/10 p-4 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-warn" />
          {data.failed_posts_7d} post{data.failed_posts_7d === 1 ? "" : "s"} failed or partially failed in the last 7 days — check provider credentials and worker logs.
        </Card>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "tenants", label: `Tenants (${data.tenant_list.length})` },
          { value: "support", label: `Support queue (${tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length})` },
        ]}
      />

      {tab === "tenants" ? (
        <Card>
          <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:p-4">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or owner email" className="pl-9" />
            </div>
            <Select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="sm:w-40">
              <option value="">All plans</option>
              {PLANS.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p}
                </option>
              ))}
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-40">
              <option value="">All statuses</option>
              {SUB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </Select>
          </div>
          {filteredTenants.length === 0 ? (
            <EmptyState icon={Building2} title="No tenants match" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-left text-xs text-faint">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2 font-medium">Organization</th>
                    <th className="px-3 py-2 font-medium">Plan</th>
                    <th className="px-3 py-2 font-medium">Period end</th>
                    <th className="px-3 py-2 text-right font-medium">Members</th>
                    <th className="px-3 py-2 text-right font-medium">Workspaces</th>
                    <th className="px-3 py-2 text-right font-medium">Posts (mo)</th>
                    <th className="px-3 py-2 text-right font-medium">AI (mo)</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredTenants.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{t.name}</p>
                        <p className="text-xs text-faint">
                          {t.owner_email ?? "—"} · {t.kind} · since {formatDate(t.created_at, { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="capitalize">{t.plan ?? "—"}</span>{" "}
                        {t.status && <Badge tone={SUB_TONE[t.status] ?? "gray"}>{t.status.replace("_", " ")}</Badge>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">{t.period_end ? formatDate(t.period_end, { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{t.members}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{t.workspaces}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{t.posts_month}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{t.ai_month}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setManaging(t);
                            setManage({ plan: t.plan ?? "growth", status: t.status ?? "active", extend: 0 });
                          }}
                        >
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : current ? (
        <TicketThread
          ticket={current}
          asSupport
          subtitle={tenantName(current.tenant_id)}
          onBack={() => setOpenTicket(null)}
          onStatus={async (status) => {
            const { error } = await supabase.from("support_tickets").update({ status }).eq("id", current.id);
            if (error) return toast(errMsg(error), "error");
            setTickets((prev) => prev.map((t) => (t.id === current.id ? { ...t, status } : t)));
          }}
        />
      ) : (
        <Card>
          <CardHeader
            title="All tickets"
            action={
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show resolved
              </label>
            }
          />
          {shownTickets.length === 0 ? (
            <EmptyState icon={LifeBuoy} title="Support queue is clear" />
          ) : (
            <div className="divide-y divide-line">
              {shownTickets.map((t) => (
                <button key={t.id} onClick={() => setOpenTicket(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-panel-2 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.subject}</p>
                    <p className="text-xs text-faint">
                      {tenantName(t.tenant_id)} · <span className="capitalize">{t.category}</span> · {t.priority} · {timeAgo(t.updated_at)}
                    </p>
                  </div>
                  {["high", "urgent"].includes(t.priority) && <Badge tone="red">{t.priority}</Badge>}
                  <Badge tone={TICKET_TONE[t.status]}>{t.status.replace(/_/g, " ")}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal
        open={!!managing}
        onClose={() => setManaging(null)}
        title={`Manage ${managing?.name ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setManaging(null)}>
              Cancel
            </Button>
            <Button onClick={saveManage} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Plan">
            <Select value={manage.plan} onChange={(e) => setManage({ ...manage, plan: e.target.value })}>
              {PLANS.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subscription status">
            <Select value={manage.status} onChange={(e) => setManage({ ...manage, status: e.target.value })}>
              {SUB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Extend current period by (days)">
            <Input type="number" min={0} max={365} value={manage.extend} onChange={(e) => setManage({ ...manage, extend: Number(e.target.value) })} />
          </Field>
          <p className="text-xs text-faint">Changes are recorded in the tenant&apos;s audit log as made by a platform admin. No payment is taken or refunded here.</p>
        </div>
      </Modal>
    </div>
  );
}
