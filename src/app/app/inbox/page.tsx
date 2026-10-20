"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  FlaskConical,
  Inbox as InboxIcon,
  MessageSquarePlus,
  Search,
  Send,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  StickyNote,
  Trash2,
  UserCheck,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import {
  Badge,
  Button,
  Card,
  DemoBadge,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { ProviderIcon, providerName } from "@/components/provider-badge";
import { CHANNELS } from "@/lib/providers";
import { cn, errMsg, formatDate, formatINR, timeAgo } from "@/lib/utils";
import type { Conversation, Lead, Message } from "@/lib/types";

type StatusFilter = "open" | "pending" | "closed" | "all";

interface Consent {
  id: string;
  channel: string;
  status: "opt_in" | "opt_out";
  created_at: string;
}

const PRIORITY_TONE = { low: "gray", normal: "blue", high: "yellow", urgent: "red" } as const;

function quickKey(ws: string) {
  return `sp.quickreplies.${ws}`;
}
function readQuick(ws: string): string[] {
  try {
    const raw = localStorage.getItem(quickKey(ws));
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeQuick(ws: string, list: string[]) {
  try {
    localStorage.setItem(quickKey(ws), JSON.stringify(list));
  } catch {}
}
const DEFAULT_QUICK = [
  "Thanks for reaching out! We'll get back to you shortly.",
  "Could you share your phone number so our team can call you?",
  "Our working hours are 6 AM – 10 PM, Monday to Saturday.",
];

export default function InboxPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const supabase = createClient();
  const { workspace, user, can } = useApp();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("c");

  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [channel, setChannel] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [q, setQ] = useState("");
  const [simOpen, setSimOpen] = useState(false);

  const loadConvs = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("*, contacts(*)")
      .eq("workspace_id", workspace.id)
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (error) toast(errMsg(error), "error");
    setConvs((data ?? []) as Conversation[]);
    setLoading(false);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    setLoading(true);
    loadConvs();
    const ch = supabase
      .channel(`inbox-convs-${workspace.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `workspace_id=eq.${workspace.id}` },
        () => loadConvs(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, workspace.id, loadConvs]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return convs.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (channel !== "all" && c.channel !== channel) return false;
      if (unreadOnly && c.unread_count === 0) return false;
      if (term) {
        const hay = `${c.contacts?.name ?? ""} ${c.subject ?? ""} ${c.contacts?.handle ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [convs, status, channel, unreadOnly, q]);

  const selected = convs.find((c) => c.id === selectedId) ?? null;

  const select = (id: string | null) => {
    router.replace(id ? `/app/inbox?c=${id}` : "/app/inbox", { scroll: false });
  };

  const totalUnread = convs.reduce((s, c) => s + (c.status !== "closed" ? c.unread_count : 0), 0);

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Unified inbox</h1>
          <p className="mt-1 text-sm text-muted">
            {totalUnread > 0 ? `${totalUnread} unread message${totalUnread === 1 ? "" : "s"}` : "All caught up"} across channels
          </p>
        </div>
        {can("support") && (
          <Button variant="secondary" size="sm" onClick={() => setSimOpen(true)}>
            <FlaskConical className="size-4" /> Simulate inbound
          </Button>
        )}
      </div>

      <Card className="grid h-[calc(100dvh-13rem)] min-h-[480px] grid-cols-1 overflow-hidden md:h-[calc(100dvh-11rem)] md:grid-cols-[300px_1fr] xl:grid-cols-[300px_1fr_300px]">
        {/* list */}
        <div className={cn("flex min-h-0 flex-col border-line md:border-r", selected && "hidden md:flex")}>
          <div className="space-y-2 border-b border-line p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts…" className="pl-9" />
            </div>
            <div className="flex gap-2">
              <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="h-8 text-xs">
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
                <option value="all">All</option>
              </Select>
              <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-8 text-xs">
                <option value="all">All channels</option>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {providerName(c)}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="accent-[var(--color-brand)]" />
              Unread only
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <LoadingBlock />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={InboxIcon}
                title="No conversations"
                description="Messages from connected channels appear here. Use “Simulate inbound” to test."
              />
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => select(c.id)}
                  className={cn(
                    "flex w-full gap-3 border-b border-line/60 px-3 py-3 text-left transition-colors hover:bg-panel-2",
                    c.id === selectedId && "bg-brand/8",
                  )}
                >
                  <ProviderIcon provider={c.channel} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", c.unread_count > 0 ? "font-semibold" : "font-medium")}>
                        {c.contacts?.name ?? "Unknown contact"}
                      </span>
                      <span className="shrink-0 text-[10px] text-faint">{timeAgo(c.last_message_at)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <span className="truncate text-xs text-muted">{c.subject ?? providerName(c.channel)}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {c.priority !== "normal" && <Badge tone={PRIORITY_TONE[c.priority]}>{c.priority}</Badge>}
                      {c.assigned_to === user.id && <Badge tone="blue">Mine</Badge>}
                      {c.is_demo && <DemoBadge />}
                    </span>
                  </span>
                  {c.unread_count > 0 && (
                    <span className="mt-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-black">
                      {c.unread_count}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* thread + side panel */}
        {selected ? (
          <Thread key={selected.id} conv={selected} onBack={() => select(null)} onChanged={loadConvs} />
        ) : (
          <div className="hidden items-center justify-center md:flex xl:col-span-2">
            <EmptyState icon={MessageSquarePlus} title="Select a conversation" description="Pick a conversation to read and reply." />
          </div>
        )}
      </Card>

      <SimulateModal
        open={simOpen}
        onClose={() => setSimOpen(false)}
        onDone={(id) => {
          setSimOpen(false);
          loadConvs();
          select(id);
        }}
      />
    </div>
  );
}

function Thread({ conv, onBack, onChanged }: { conv: Conversation; onBack: () => void; onChanged: () => void }) {
  const supabase = createClient();
  const { workspace, user, can } = useApp();
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [quick, setQuick] = useState<string[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = readQuick(workspace.id);
    setQuick(saved.length ? saved : DEFAULT_QUICK);
  }, [workspace.id]);

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) toast(errMsg(error), "error");
    setMessages((data ?? []) as Message[]);
    setLoading(false);
  }, [supabase, conv.id, toast]);

  useEffect(() => {
    loadMessages();
    const ch = supabase
      .channel(`inbox-msgs-${conv.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` },
        () => loadMessages(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, conv.id, loadMessages]);

  // mark read when opened
  useEffect(() => {
    if (conv.unread_count > 0 && can("support")) {
      supabase
        .from("conversations")
        .update({ unread_count: 0 })
        .eq("id", conv.id)
        .then(() => onChanged());
    }
    // only on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const updateConv = async (patch: Partial<Conversation>) => {
    const { error } = await supabase.from("conversations").update(patch).eq("id", conv.id);
    if (error) toast(errMsg(error), "error");
    else onChanged();
  };

  const send = async (body: string, draftId?: string) => {
    if (!body.trim()) return;
    setSending(true);
    try {
      if (mode === "note" && !draftId) {
        const { error } = await supabase.from("messages").insert({
          tenant_id: workspace.tenant_id,
          workspace_id: workspace.id,
          conversation_id: conv.id,
          direction: "note",
          body: body.trim(),
          sender_name: user.email,
          sent_by: user.id,
        });
        if (error) throw error;
        toast("Note added");
      } else {
        const { error } = await supabase.rpc("send_reply", {
          p_conversation: conv.id,
          p_body: body.trim(),
          p_draft: draftId ?? null,
        });
        if (error) throw error;
        toast(conv.is_demo ? "Reply recorded (demo conversation — not sent to a real channel)" : "Reply sent");
      }
      setText("");
      setEditingDraft(null);
      await loadMessages();
      onChanged();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setSending(false);
    }
  };

  const discardDraft = async (id: string) => {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast(errMsg(error), "error");
    else {
      setMessages((m) => m.filter((x) => x.id !== id));
      if (editingDraft === id) {
        setEditingDraft(null);
        setText("");
      }
    }
  };

  const aiSuggest = async () => {
    const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
    if (!lastInbound) {
      toast("No customer message to reply to yet", "info");
      return;
    }
    setAiBusy(true);
    try {
      const context = messages
        .filter((m) => !m.is_ai_draft && m.direction !== "note")
        .slice(-10)
        .map((m) => `${m.direction === "inbound" ? "Customer" : "Business"}: ${m.body}`)
        .join("\n");
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, kind: "reply", prompt: lastInbound.body, context }),
      });
      const json = (await res.json().catch(() => ({}))) as { output?: string; provider?: string; error?: string };
      if (!res.ok || json.error || !json.output) throw new Error(json.error ?? "AI request failed");
      setMode("reply");
      setText(json.output);
      toast(`Suggestion ready (${json.provider ?? "AI"}) — review before sending`, "info");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setAiBusy(false);
    }
  };

  const saveQuick = () => {
    if (!text.trim()) return;
    const next = [text.trim(), ...quick.filter((x) => x !== text.trim())].slice(0, 15);
    setQuick(next);
    writeQuick(workspace.id, next);
    toast("Saved to quick replies");
  };
  const removeQuick = (item: string) => {
    const next = quick.filter((x) => x !== item);
    setQuick(next);
    writeQuick(workspace.id, next);
  };

  const lastInboundAt = [...messages].reverse().find((m) => m.direction === "inbound")?.created_at;
  const waWindowOpen =
    conv.channel !== "whatsapp" || (lastInboundAt ? Date.now() - new Date(lastInboundAt).getTime() < 24 * 3600 * 1000 : false);

  return (
    <>
      <div className="flex min-h-0 flex-col md:border-line xl:border-r">
        {/* thread header */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <button onClick={onBack} aria-label="Back" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-panel-2 md:hidden">
            <ArrowLeft className="size-5" />
          </button>
          <ProviderIcon provider={conv.channel} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{conv.contacts?.name ?? "Unknown contact"}</p>
            <p className="truncate text-[11px] text-faint">
              {providerName(conv.channel)} {conv.contacts?.handle ? `· ${conv.contacts.handle}` : ""}
            </p>
          </div>
          {can("support") && (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Select
                value={conv.status}
                onChange={(e) => updateConv({ status: e.target.value as Conversation["status"] })}
                className="h-8 w-auto text-xs"
                aria-label="Status"
              >
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
              </Select>
              <Select
                value={conv.priority}
                onChange={(e) => updateConv({ priority: e.target.value as Conversation["priority"] })}
                className="hidden h-8 w-auto text-xs sm:block"
                aria-label="Priority"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
              {conv.assigned_to !== user.id && (
                <Button size="sm" variant="ghost" onClick={() => updateConv({ assigned_to: user.id })} title="Assign to me">
                  <UserCheck className="size-4" />
                  <span className="hidden lg:inline">Assign me</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {conv.channel === "whatsapp" && (
          <div
            className={cn(
              "flex items-center gap-2 border-b px-3 py-2 text-xs",
              waWindowOpen ? "border-line bg-brand/5 text-muted" : "border-amber-400/30 bg-amber-400/10 text-amber-200",
            )}
          >
            <Clock className="size-3.5 shrink-0" />
            {waWindowOpen
              ? "WhatsApp 24-hour customer service window is open — free-form replies allowed."
              : "WhatsApp 24-hour window is closed. Only approved template messages can be sent."}
          </div>
        )}

        {/* messages */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
          {loading ? (
            <LoadingBlock />
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No messages yet.</p>
          ) : (
            messages.map((m) => {
              if (m.is_ai_draft) {
                return (
                  <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl border border-dashed border-brand/60 bg-brand/5 p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-brand">
                      <Bot className="size-3.5" /> AI draft — review before sending
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                    {can("support") && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button size="sm" loading={sending} onClick={() => send(m.body, m.id)}>
                          <Send className="size-3.5" /> Send
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingDraft(m.id);
                            setMode("reply");
                            setText(m.body);
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => discardDraft(m.id)}>
                          <Trash2 className="size-3.5" /> Discard
                        </Button>
                      </div>
                    )}
                  </div>
                );
              }
              if (m.direction === "note") {
                return (
                  <div key={m.id} className="mx-auto max-w-[90%] rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                    <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                      <StickyNote className="size-3" /> Internal note · {m.sender_name ?? "Team"}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                );
              }
              const out = m.direction === "outbound";
              return (
                <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                      out ? "rounded-br-sm bg-brand text-black" : "rounded-bl-sm border border-line-2 bg-panel-2",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={cn("mt-1 text-[10px]", out ? "text-black/60" : "text-faint")}>
                      {m.sender_name ? `${m.sender_name} · ` : ""}
                      {formatDate(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottom} />
        </div>

        {/* composer */}
        {can("support") ? (
          <div className="safe-bottom border-t border-line p-3">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setMode("reply")}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium", mode === "reply" ? "bg-brand text-black" : "text-muted hover:text-ink")}
              >
                Reply
              </button>
              <button
                onClick={() => setMode("note")}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium", mode === "note" ? "bg-amber-300 text-black" : "text-muted hover:text-ink")}
              >
                Internal note
              </button>
              <div className="flex-1" />
              <div className="relative">
                <Button size="sm" variant="ghost" onClick={() => setQuickOpen((o) => !o)}>
                  <Zap className="size-3.5" /> Quick replies
                </Button>
                {quickOpen && (
                  <div className="animate-fade-up absolute right-0 bottom-full z-30 mb-2 w-72 rounded-xl border border-line-2 bg-panel-2 p-1.5 shadow-2xl">
                    {quick.length === 0 && <p className="px-2 py-3 text-xs text-muted">No quick replies saved.</p>}
                    {quick.map((qr) => (
                      <div key={qr} className="group flex items-start gap-1 rounded-lg hover:bg-panel">
                        <button
                          onClick={() => {
                            setText(qr);
                            setQuickOpen(false);
                          }}
                          className="flex-1 px-2 py-1.5 text-left text-xs"
                        >
                          {qr}
                        </button>
                        <button aria-label="Remove" onClick={() => removeQuick(qr)} className="p-1.5 text-faint opacity-0 group-hover:opacity-100 hover:text-red-300">
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                    <button onClick={saveQuick} disabled={!text.trim()} className="mt-1 w-full rounded-lg border-t border-line px-2 py-1.5 text-left text-xs text-brand disabled:opacity-40">
                      + Save current text as quick reply
                    </button>
                  </div>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={aiSuggest} loading={aiBusy}>
                {!aiBusy && <Sparkles className="size-3.5" />} AI suggest
              </Button>
            </div>
            {editingDraft && (
              <p className="mb-1.5 text-[11px] text-brand">
                Editing AI draft —{" "}
                <button
                  className="underline"
                  onClick={() => {
                    setEditingDraft(null);
                    setText("");
                  }}
                >
                  cancel
                </button>
              </p>
            )}
            <div className="flex items-end gap-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(text, editingDraft ?? undefined);
                }}
                placeholder={mode === "note" ? "Add a private note for your team…" : "Type a reply…  (Ctrl+Enter to send)"}
                className={cn("max-h-40 min-h-11 flex-1 resize-none", mode === "note" && "border-amber-400/40")}
                rows={2}
              />
              <Button
                onClick={() => send(text, editingDraft ?? undefined)}
                loading={sending}
                disabled={!text.trim() || (mode === "reply" && !waWindowOpen)}
                aria-label="Send"
                className="h-11"
              >
                {!sending && (mode === "note" ? <StickyNote className="size-4" /> : <Send className="size-4" />)}
              </Button>
            </div>
          </div>
        ) : (
          <p className="border-t border-line p-3 text-center text-xs text-faint">Read-only access — your role cannot reply.</p>
        )}
      </div>

      <ContactPanel conv={conv} />
    </>
  );
}

function ContactPanel({ conv }: { conv: Conversation }) {
  const supabase = createClient();
  const { workspace, can } = useApp();
  const toast = useToast();
  const [consents, setConsents] = useState<Consent[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [busy, setBusy] = useState(false);
  const contact = conv.contacts;

  const load = useCallback(async () => {
    if (!conv.contact_id) return;
    const [{ data: c }, { data: l }] = await Promise.all([
      supabase.from("consent_records").select("*").eq("contact_id", conv.contact_id).order("created_at", { ascending: false }),
      supabase.from("leads").select("*").eq("contact_id", conv.contact_id).order("created_at", { ascending: false }),
    ]);
    setConsents((c ?? []) as Consent[]);
    setLeads((l ?? []) as Lead[]);
  }, [supabase, conv.contact_id]);

  useEffect(() => {
    load();
  }, [load]);

  const latest = consents.find((c) => c.channel === conv.channel);

  const recordConsent = async (status: "opt_in" | "opt_out") => {
    if (!conv.contact_id) return;
    const { error } = await supabase.from("consent_records").insert({
      tenant_id: workspace.tenant_id,
      workspace_id: workspace.id,
      contact_id: conv.contact_id,
      channel: conv.channel,
      status,
      source: "inbox_manual",
    });
    if (error) toast(errMsg(error), "error");
    else {
      toast(status === "opt_in" ? "Opt-in recorded" : "Opt-out recorded");
      load();
    }
  };

  const createLead = async () => {
    if (!conv.contact_id) return;
    setBusy(true);
    try {
      const { data: stage } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("workspace_id", workspace.id)
        .order("position")
        .limit(1)
        .maybeSingle();
      const { error } = await supabase.from("leads").insert({
        tenant_id: workspace.tenant_id,
        workspace_id: workspace.id,
        contact_id: conv.contact_id,
        stage_id: stage?.id ?? null,
        title: `Enquiry from ${contact?.name ?? "contact"}`,
        source: conv.channel,
        notes: conv.subject,
      });
      if (error) throw error;
      toast("Lead created");
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="hidden min-h-0 flex-col overflow-y-auto xl:flex">
      <div className="border-b border-line p-4 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-xl font-bold text-black">
          {(contact?.name ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <p className="mt-2 font-semibold">{contact?.name ?? "Unknown contact"}</p>
        {contact?.handle && <p className="text-xs text-muted">{contact.handle}</p>}
      </div>
      <div className="space-y-4 p-4 text-sm">
        <div className="space-y-1.5">
          <Row label="Email" value={contact?.email} />
          <Row label="Phone" value={contact?.phone} />
          <Row label="Source" value={contact?.source} />
          <Row label="Since" value={contact ? formatDate(contact.created_at, { day: "numeric", month: "short", year: "numeric" }) : null} />
        </div>
        {contact && contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {contact.tags.map((t) => (
              <Badge key={t} tone="purple">
                {t}
              </Badge>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-line p-3">
          <p className="mb-2 text-xs font-semibold text-muted">Consent · {providerName(conv.channel)}</p>
          <div className="mb-2">
            {latest ? (
              latest.status === "opt_in" ? (
                <Badge tone="green">
                  <ShieldCheck className="size-3" /> Opted in {timeAgo(latest.created_at)}
                </Badge>
              ) : (
                <Badge tone="red">
                  <ShieldOff className="size-3" /> Opted out {timeAgo(latest.created_at)}
                </Badge>
              )
            ) : (
              <Badge>No record</Badge>
            )}
          </div>
          {can("support") && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => recordConsent("opt_in")}>
                Opt-in
              </Button>
              <Button size="sm" variant="danger" onClick={() => recordConsent("opt_out")}>
                Opt-out
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted">Leads</p>
            {can("support") && (
              <Button size="sm" variant="ghost" onClick={createLead} loading={busy}>
                + Create lead
              </Button>
            )}
          </div>
          {leads.length === 0 ? (
            <p className="text-xs text-faint">No leads for this contact.</p>
          ) : (
            <ul className="space-y-1.5">
              {leads.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-panel-2 px-2.5 py-1.5">
                  <a href="/app/crm" className="truncate text-xs hover:text-brand">
                    {l.title}
                  </a>
                  <span className="shrink-0 text-[11px] text-muted">{formatINR(l.value_inr)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {conv.is_demo && (
          <p className="flex items-start gap-1.5 text-[11px] text-faint">
            <CheckCircle2 className="mt-0.5 size-3 shrink-0" /> Demo conversation created by the simulator — replies are stored but not delivered.
          </p>
        )}
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-faint">{label}</span>
      <span className="truncate text-xs">{value || "—"}</span>
    </div>
  );
}

const SAMPLE_MESSAGES = [
  "Hi! What is the membership price for 3 months?",
  "Do you have slots for a wedding shoot in December?",
  "Is the studio open on Sunday?",
  "I want to join the morning batch, how do I register?",
];

function SimulateModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const supabase = createClient();
  const { workspace } = useApp();
  const toast = useToast();
  const [channel, setChannel] = useState("instagram");
  const [name, setName] = useState("Ravi Kumar");
  const [body, setBody] = useState(SAMPLE_MESSAGES[0]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !body.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("simulate_inbound_message", {
      p_workspace: workspace.id,
      p_channel: channel,
      p_name: name.trim(),
      p_body: body.trim(),
    });
    setBusy(false);
    if (error) toast(errMsg(error), "error");
    else {
      toast("Test message received — active automations ran");
      onDone(data as string);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Simulate inbound message"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {!busy && <Send className="size-4" />} Receive message
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
          Test tool: use this while no live provider webhook is connected. It creates a demo conversation and triggers your
          active “message received” automations exactly like a real message would.
        </p>
        <Field label="Channel">
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {providerName(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Customer name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Message">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {SAMPLE_MESSAGES.map((s) => (
            <button key={s} onClick={() => setBody(s)} className="rounded-full border border-line-2 px-2.5 py-1 text-[11px] text-muted hover:border-brand/50 hover:text-ink">
              {s.length > 34 ? s.slice(0, 34) + "…" : s}
            </button>
          ))}
        </div>
        {busy && <Spinner />}
      </div>
    </Modal>
  );
}
