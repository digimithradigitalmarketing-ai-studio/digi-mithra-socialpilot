"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, Textarea, type Tone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, errMsg, timeAgo } from "@/lib/utils";
import type { SupportMessage, SupportTicket } from "@/lib/types";

export const TICKET_TONE: Record<SupportTicket["status"], Tone> = {
  open: "blue",
  waiting_support: "yellow",
  waiting_customer: "purple",
  resolved: "green",
  closed: "gray",
};
const label = (s: string) => s.replace(/_/g, " ");

/** Ticket conversation with realtime updates; used by tenants and by platform support. */
export function TicketThread({
  ticket,
  onBack,
  onStatus,
  asSupport,
  subtitle,
}: {
  ticket: SupportTicket;
  onBack: () => void;
  onStatus: (s: SupportTicket["status"]) => void;
  asSupport: boolean;
  subtitle?: string;
}) {
  const supabase = createClient();
  const { user } = useApp();
  const toast = useToast();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", ticket.id)
      .order("created_at")
      .then(({ data }: { data: SupportMessage[] | null }) => active && setMessages(data ?? []));
    const ch = supabase
      .channel(`ticket-${ticket.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticket.id}` }, (payload: { new: SupportMessage }) =>
        setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new])),
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [supabase, ticket.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    const { data, error } = await supabase
      .from("support_messages")
      .insert({ ticket_id: ticket.id, body: reply.trim(), author_id: user.id, from_support: asSupport })
      .select("*")
      .single();
    setSending(false);
    if (error) return toast(errMsg(error), "error");
    setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as SupportMessage]));
    setReply("");
    const next: SupportTicket["status"] = asSupport ? "waiting_customer" : "waiting_support";
    if (ticket.status !== next && !["closed"].includes(ticket.status)) onStatus(next);
  };

  const closed = ["resolved", "closed"].includes(ticket.status);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
        <button onClick={onBack} aria-label="Back to tickets" className="rounded-lg p-1 text-muted hover:bg-panel-2">
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{ticket.subject}</p>
          <p className="text-xs text-faint">
            {subtitle ? `${subtitle} · ` : ""}
            <span className="capitalize">{ticket.category}</span> · {ticket.priority} priority · opened {timeAgo(ticket.created_at)}
          </p>
        </div>
        <Badge tone={TICKET_TONE[ticket.status]}>{label(ticket.status)}</Badge>
        {closed ? (
          <Button size="sm" variant="secondary" onClick={() => onStatus("open")}>
            Reopen
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => onStatus(asSupport ? "resolved" : "closed")}>
            {asSupport ? "Resolve" : "Close"}
          </Button>
        )}
      </div>
      <div className="max-h-[55dvh] space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
        {messages.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
        {messages.map((m) => {
          const mine = m.from_support === asSupport;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm", mine ? "bg-brand/15" : "border border-line bg-panel-2")}>
                <p className="mb-0.5 text-[11px] font-semibold text-muted">{m.from_support ? "Digi Mithra support" : asSupport ? "Customer" : "You"}</p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className="mt-1 text-[10px] text-faint">{timeAgo(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="flex items-end gap-2 border-t border-line p-3">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
          placeholder={closed ? "Reply to reopen this ticket…" : "Write a reply… (Ctrl+Enter to send)"}
          className="min-h-12 flex-1"
          maxLength={5000}
        />
        <Button aria-label="Send reply" onClick={send} loading={sending} disabled={!reply.trim()}>
          <Send className="size-4" />
        </Button>
      </div>
    </Card>
  );
}
