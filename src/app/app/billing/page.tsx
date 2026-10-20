"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, Info, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, LoadingBlock, Modal, PageHeader, ProgressBar, Toggle } from "@/components/ui";
import { cn, errMsg, formatDate, formatINR } from "@/lib/utils";
import type { Plan } from "@/lib/types";

interface Subscription {
  plan_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  provider: string;
}
interface Invoice {
  id: string;
  plan_id: string | null;
  amount_inr: number;
  status: string;
  provider: string;
  created_at: string;
}
interface Usage {
  plan: Plan;
  workspaces: number;
  accounts: number;
  posts: number;
  users: number;
  ai_credits: number;
}

const statusTone = { trialing: "blue", active: "green", past_due: "yellow", cancelled: "red", expired: "red" } as const;

export default function BillingPage() {
  const supabase = createClient();
  const toast = useToast();
  const { tenant, tenantRole, can } = useApp();
  const isOwner = can("owner");
  const isAdmin = tenantRole === "owner" || tenantRole === "admin";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s, u, i] = await Promise.all([
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("subscriptions").select("*").eq("tenant_id", tenant.id).maybeSingle(),
      supabase.rpc("get_usage", { p_tenant: tenant.id }),
      isAdmin
        ? supabase.from("invoices").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(50)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const err = p.error || s.error || u.error || i.error;
    if (err) toast(errMsg(err), "error");
    setPlans((p.data ?? []) as Plan[]);
    setSub((s.data as Subscription) ?? null);
    setUsage((u.data as Usage) ?? null);
    setInvoices((i.data ?? []) as Invoice[]);
    setLoading(false);
  }, [supabase, tenant.id, isAdmin, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const switchPlan = async () => {
    if (!confirmPlan) return;
    setBusy(true);
    const { error } = await supabase.rpc("demo_change_plan", { p_tenant: tenant.id, p_plan: confirmPlan.id });
    setBusy(false);
    if (error) return toast(errMsg(error), "error");
    toast(`Switched to ${confirmPlan.name}`);
    setConfirmPlan(null);
    load();
  };

  const toggleCancel = async (v: boolean) => {
    const { error } = await supabase.rpc("set_cancel_at_period_end", { p_tenant: tenant.id, p_cancel: v });
    if (error) return toast(errMsg(error), "error");
    toast(v ? "Subscription will end at the period end" : "Auto-renew resumed");
    load();
  };

  if (loading) return <LoadingBlock />;

  const current = plans.find((p) => p.id === sub?.plan_id);
  const effective = usage?.plan;
  const meters = usage && effective
    ? [
        { label: "Workspaces", used: usage.workspaces, max: effective.max_workspaces },
        { label: "Social accounts", used: usage.accounts, max: effective.max_accounts },
        { label: "Posts this month", used: usage.posts, max: effective.max_posts_per_month },
        { label: "Team members", used: usage.users, max: effective.max_users },
        { label: "AI credits this month", used: usage.ai_credits, max: effective.ai_credits_per_month },
      ]
    : [];

  return (
    <div>
      <PageHeader title="Plan & billing" description="Subscription, usage limits and invoices for your organization." />

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>Demo billing mode — no payment is taken; Razorpay checkout can be enabled later. Limits below are enforced by the server.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Current plan" />
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold">{current?.name ?? "—"}</p>
              {sub && <Badge tone={statusTone[sub.status as keyof typeof statusTone] ?? "gray"}>{sub.status.replace("_", " ")}</Badge>}
            </div>
            <p className="text-sm text-muted">
              {current?.price_inr != null ? `${formatINR(current.price_inr)} / month + GST` : "Custom pricing"}
            </p>
            {sub && (
              <div className="space-y-1 text-sm">
                <p className="text-muted">
                  {sub.status === "trialing" ? "Trial ends" : sub.cancel_at_period_end ? "Ends on" : "Renews on"}:{" "}
                  <span className="text-ink">{formatDate(sub.current_period_end, { day: "numeric", month: "short", year: "numeric" })}</span>
                </p>
                <p className="text-xs text-faint">Billing provider: {sub.provider}</p>
              </div>
            )}
            {effective && current && effective.id !== current.id && (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
                Subscription inactive — {effective.name} limits currently apply.
              </p>
            )}
            {isOwner && sub && sub.status !== "trialing" && (
              <div className="border-t border-line pt-3">
                <Toggle checked={sub.cancel_at_period_end} onChange={toggleCancel} label="Cancel at period end" />
              </div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Usage" description={effective ? `Limits from the ${effective.name} plan` : undefined} />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            {meters.map((m) => (
              <div key={m.label}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-muted">{m.label}</span>
                  <span className="tabular-nums">
                    {m.used} / {m.max.toLocaleString("en-IN")}
                  </span>
                </div>
                <ProgressBar value={m.used} max={m.max} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold">Plans</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const isCurrent = p.id === sub?.plan_id;
          return (
            <Card key={p.id} className={cn("flex flex-col p-5", isCurrent && "border-brand", p.id === "growth" && !isCurrent && "border-line-2")}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">{p.name}</p>
                {isCurrent ? <Badge tone="green">Current</Badge> : p.id === "growth" ? <Badge tone="purple">Popular</Badge> : null}
              </div>
              <p className="mt-3 text-3xl font-bold">
                {p.price_inr != null ? formatINR(p.price_inr) : "Custom"}
                {p.price_inr != null && <span className="text-sm font-normal text-muted"> /month</span>}
              </p>
              <p className="text-xs text-faint">{p.price_inr != null ? "excl. GST" : "Contract based"}</p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                <li className="text-muted">
                  {p.max_workspaces >= 1000 ? "Custom" : p.max_workspaces} workspaces · {p.max_accounts >= 1000 ? "custom" : p.max_accounts} accounts
                </li>
                <li className="text-muted">
                  {p.max_posts_per_month >= 100000 ? "Custom" : p.max_posts_per_month.toLocaleString("en-IN")} posts/mo ·{" "}
                  {p.max_users >= 1000 ? "custom" : p.max_users} users
                </li>
                <li className="text-muted">{p.ai_credits_per_month >= 100000 ? "Custom" : p.ai_credits_per_month.toLocaleString("en-IN")} AI credits/mo</li>
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-ink" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {p.price_inr == null ? (
                  <a href={`mailto:${process.env.NEXT_PUBLIC_SALES_EMAIL ?? ""}?subject=Social%20Pilot%20Enterprise`}>
                    <Button variant="secondary" className="w-full">
                      Contact sales
                    </Button>
                  </a>
                ) : (
                  <Button
                    className="w-full"
                    variant={isCurrent ? "secondary" : "primary"}
                    disabled={!isOwner || (isCurrent && sub?.status === "active")}
                    onClick={() => setConfirmPlan(p)}
                  >
                    {isCurrent ? (sub?.status === "active" ? "Current plan" : "Activate") : "Switch plan"}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {!isOwner && <p className="mt-2 text-xs text-faint">Only the organization owner can change the plan.</p>}

      {isAdmin && (
        <Card className="mt-8">
          <CardHeader title="Invoices" />
          {invoices.length === 0 ? (
            <EmptyState icon={Receipt} title="No invoices yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-left text-xs text-faint">
                  <tr className="border-b border-line">
                    <th className="px-5 py-2 font-medium">Date</th>
                    <th className="px-5 py-2 font-medium">Plan</th>
                    <th className="px-5 py-2 font-medium">Amount</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 font-medium">Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id} className="border-b border-line/60">
                      <td className="px-5 py-2.5">{formatDate(i.created_at, { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td className="px-5 py-2.5 capitalize">{i.plan_id}</td>
                      <td className="px-5 py-2.5 tabular-nums">{formatINR(i.amount_inr)}</td>
                      <td className="px-5 py-2.5">
                        <Badge tone={i.status === "paid" ? "green" : i.status === "pending" ? "yellow" : "red"}>{i.status}</Badge>
                      </td>
                      <td className="px-5 py-2.5 text-muted">{i.provider}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Modal
        open={!!confirmPlan}
        onClose={() => setConfirmPlan(null)}
        title={`Switch to ${confirmPlan?.name ?? ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmPlan(null)}>
              Cancel
            </Button>
            <Button onClick={switchPlan} loading={busy}>
              <CreditCard className="size-4" /> Confirm
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          You&apos;ll move to the <span className="text-ink">{confirmPlan?.name}</span> plan at{" "}
          <span className="text-ink">{formatINR(confirmPlan?.price_inr)}</span>/month + GST, starting today. In demo billing mode no payment is
          collected and a demo invoice is recorded.
        </p>
      </Modal>
    </div>
  );
}
