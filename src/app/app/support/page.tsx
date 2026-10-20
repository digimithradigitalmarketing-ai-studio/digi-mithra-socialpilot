"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CreditCard, LifeBuoy, MessageSquare, Plug, Plus, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { TICKET_TONE, TicketThread } from "@/components/ticket-thread";
import { useToast } from "@/components/toast";
import { cn, errMsg, timeAgo } from "@/lib/utils";
import type { SupportTicket } from "@/lib/types";

const CATEGORIES: SupportTicket["category"][] = ["question", "bug", "billing", "integration", "feature", "other"];
const PRIORITIES: SupportTicket["priority"][] = ["low", "normal", "high", "urgent"];
const FAQ = [
  { icon: Plug, title: "Connecting accounts", text: "Official connections need your provider app approval. Demo accounts work instantly.", href: "/app/accounts" },
  { icon: CreditCard, title: "Plans & billing", text: "Change plan, see usage and invoices.", href: "/app/billing" },
  { icon: Sparkles, title: "AI credits", text: "Each AI generation uses credits from your monthly plan allowance.", href: "/app/billing" },
];
const label = (s: string) => s.replace(/_/g, " ");

export default function SupportPage() {
  const supabase = createClient();
  const { tenant, user } = useApp();
  const toast = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ subject: "", category: "question" as SupportTicket["category"], priority: "normal" as SupportTicket["priority"], body: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("support_tickets").select("*").eq("tenant_id", tenant.id).order("updated_at", { ascending: false });
    if (error) toast(errMsg(error), "error");
    setTickets((data ?? []) as SupportTicket[]);
    setLoading(false);
  }, [supabase, tenant.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!draft.subject.trim() || !draft.body.trim()) return toast("Add a subject and describe the issue", "error");
    setBusy(true);
    const { data, error } = await supabase
      .from("support_tickets")
      .insert({ tenant_id: tenant.id, subject: draft.subject.trim(), category: draft.category, priority: draft.priority, created_by: user.id })
      .select("*")
      .single();
    if (error) {
      setBusy(false);
      return toast(errMsg(error), "error");
    }
    const { error: mErr } = await supabase.from("support_messages").insert({ ticket_id: data.id, body: draft.body.trim(), author_id: user.id, from_support: false });
    setBusy(false);
    if (mErr) toast(errMsg(mErr), "error");
    toast("Ticket created — our team will reply here");
    setCreating(false);
    setDraft({ subject: "", category: "question", priority: "normal", body: "" });
    await load();
    setOpenId(data.id);
  };

  const shown = tickets.filter((t) => filter === "all" || !["resolved", "closed"].includes(t.status));
  const current = tickets.find((t) => t.id === openId) ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Help & support"
        description="Get help from the Digi Mithra team. Replies arrive here in real time."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New ticket
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {FAQ.map((f) => (
          <Link key={f.title} href={f.href} className="shadow-soft rounded-2xl border border-line bg-panel p-4 hover:border-brand/50">
            <f.icon className="size-5 text-brand-ink" />
            <p className="mt-2 text-sm font-semibold">{f.title}</p>
            <p className="text-xs text-muted">{f.text}</p>
          </Link>
        ))}
      </div>

      {current ? (
        <TicketThread
          ticket={current}
          onBack={() => setOpenId(null)}
          onStatus={async (status) => {
            const { error } = await supabase.from("support_tickets").update({ status }).eq("id", current.id);
            if (error) return toast(errMsg(error), "error");
            setTickets((prev) => prev.map((t) => (t.id === current.id ? { ...t, status } : t)));
          }}
          asSupport={false}
        />
      ) : (
        <Card>
          <CardHeader
            title="Your tickets"
            action={
              <div className="flex gap-1 rounded-xl border border-line p-0.5 text-xs">
                {(["active", "all"] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={cn("rounded-lg px-2.5 py-1 capitalize", filter === f ? "bg-brand text-on-brand" : "text-muted")}>
                    {f}
                  </button>
                ))}
              </div>
            }
          />
          {loading ? (
            <LoadingBlock />
          ) : shown.length === 0 ? (
            <EmptyState icon={LifeBuoy} title="No tickets" description="Stuck on something? Open a ticket and we'll help." />
          ) : (
            <div className="divide-y divide-line">
              {shown.map((t) => (
                <button key={t.id} onClick={() => setOpenId(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-panel-2 sm:px-5">
                  <MessageSquare className="size-4 shrink-0 text-faint" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.subject}</p>
                    <p className="text-xs text-faint">
                      <span className="capitalize">{t.category}</span> · {t.priority} · updated {timeAgo(t.updated_at)}
                    </p>
                  </div>
                  <Badge tone={TICKET_TONE[t.status]}>{label(t.status)}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New support ticket"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={create} loading={busy}>
              Submit
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Subject">
            <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} maxLength={150} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Category">
              <Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as SupportTicket["category"] })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as SupportTicket["priority"] })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Describe the issue" hint="(don't paste passwords or API keys)">
            <Textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className="min-h-32" maxLength={5000} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
