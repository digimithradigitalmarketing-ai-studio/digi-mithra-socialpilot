"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Check, Copy, MessageCircle, PanelLeft, Pencil, PenSquare, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, Input } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, errMsg, timeAgo } from "@/lib/utils";
import type { ChatMessage, ChatThread } from "@/lib/types";

const SUGGESTIONS = [
  "Give me 5 reel ideas for this week",
  "Write a caption for our new offer",
  "How can I get more leads from Instagram?",
  "Turn our FAQ into a carousel",
  "Plan a festival campaign",
  "Reply to a customer asking about price",
];

/** Renders **bold** inside a line. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
      <strong key={i} className="font-semibold">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

/** Tiny safe markdown: paragraphs, bold, bullet and numbered lists. */
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ""));
      blocks.push(
        <ul key={blocks.length} className="ml-5 list-disc space-y-1">
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(
        <ol key={blocks.length} className="ml-5 list-decimal space-y-1">
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) para.push(lines[i++]);
    const heading = para.length === 1 && /^#{1,4}\s/.test(para[0]);
    blocks.push(
      <p key={blocks.length} className={cn("whitespace-pre-wrap", heading && "font-semibold")}>
        {inline(heading ? para[0].replace(/^#{1,4}\s/, "") : para.join("\n"))}
      </p>,
    );
  }
  return <div className="space-y-2 break-words">{blocks}</div>;
}

export default function ChatPage() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const { workspace, user, profile, can } = useApp();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [templateMode, setTemplateMode] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const loadThreads = useCallback(async () => {
    const { data } = await supabase
      .from("chat_threads")
      .select("*")
      .eq("workspace_id", workspace.id)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    setThreads((data ?? []) as ChatThread[]);
  }, [supabase, workspace.id, user.id]);

  const loadMessages = useCallback(
    async (id: string) => {
      const { data, error } = await supabase.from("chat_messages").select("*").eq("thread_id", id).order("created_at");
      if (error) return toast(errMsg(error), "error");
      setMessages((data ?? []) as ChatMessage[]);
    },
    [supabase, toast],
  );

  useEffect(() => {
    setThreadId(null);
    setMessages([]);
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  const openThread = (id: string) => {
    setThreadId(id);
    setDrawer(false);
    loadMessages(id);
  };

  const newChat = () => {
    setThreadId(null);
    setMessages([]);
    setDrawer(false);
    taRef.current?.focus();
  };

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput("");
    setSending(true);
    const optimistic: ChatMessage = { id: `tmp-${Date.now()}`, thread_id: threadId ?? "", role: "user", content: message, created_at: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, threadId, message }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't send");
      setTemplateMode(json.provider === "template");
      setThreadId(json.threadId);
      await loadMessages(json.threadId);
      loadThreads();
    } catch (e) {
      toast(errMsg(e), "error");
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setInput(message);
    } finally {
      setSending(false);
    }
  };

  const rename = async (id: string) => {
    const title = renameText.trim();
    setRenaming(null);
    if (!title) return;
    const { error } = await supabase.from("chat_threads").update({ title }).eq("id", id);
    if (error) return toast(errMsg(error), "error");
    loadThreads();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this chat?")) return;
    const { error } = await supabase.from("chat_threads").delete().eq("id", id);
    if (error) return toast(errMsg(error), "error");
    if (id === threadId) newChat();
    loadThreads();
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      toast("Couldn't copy", "error");
    }
  };

  const save = async (text: string) => {
    const { error } = await supabase.from("saved_items").insert({
      tenant_id: workspace.tenant_id,
      workspace_id: workspace.id,
      kind: "chat",
      title: (text.split("\n").find((l) => l.trim()) ?? "Chat answer").replace(/\*\*/g, "").slice(0, 100),
      content: text,
      meta: { thread_id: threadId },
    });
    if (error) return toast(errMsg(error), "error");
    toast("Saved");
  };

  const firstName = (profile?.full_name ?? "").split(" ")[0];

  const threadList = (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button onClick={newChat} className="w-full">
          <Plus className="size-4" /> New chat
        </Button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {threads.length === 0 && <p className="px-2 py-4 text-center text-xs text-faint">No chats yet</p>}
        {threads.map((t) => (
          <div
            key={t.id}
            className={cn("group flex items-center gap-1 rounded-xl px-2 py-1.5", t.id === threadId ? "bg-brand/10 text-brand-ink" : "hover:bg-panel-2")}
          >
            {renaming === t.id ? (
              <form
                className="flex flex-1 items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  rename(t.id);
                }}
              >
                <Input autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)} className="h-8" />
                <button type="submit" aria-label="Save name" className="p-1 text-brand-ink">
                  <Check className="size-4" />
                </button>
              </form>
            ) : (
              <>
                <button onClick={() => openThread(t.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm">{t.title}</span>
                  <span className="block text-[10px] text-faint">{timeAgo(t.updated_at)}</span>
                </button>
                <button
                  aria-label="Rename chat"
                  onClick={() => {
                    setRenaming(t.id);
                    setRenameText(t.title);
                  }}
                  className="p-1 text-faint opacity-100 hover:text-brand-ink md:opacity-0 md:group-hover:opacity-100"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button aria-label="Delete chat" onClick={() => remove(t.id)} className="p-1 text-faint opacity-100 hover:text-danger md:opacity-0 md:group-hover:opacity-100">
                  <Trash2 className="size-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="pb-20 md:pb-0">
      <div className="flex h-[calc(100dvh-13rem)] min-h-[28rem] gap-4 md:h-[calc(100dvh-8.5rem)]">
        <Card className="hidden w-64 shrink-0 overflow-hidden rounded-3xl md:block">{threadList}</Card>

        {drawer && (
          <div className="fixed inset-0 z-[75] bg-slate-900/40 md:hidden dark:bg-black/70" onClick={() => setDrawer(false)}>
            <div onClick={(e) => e.stopPropagation()} className="animate-fade-up h-full w-72 border-r border-line bg-panel">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="font-semibold">Chats</p>
                <button aria-label="Close" onClick={() => setDrawer(false)} className="text-muted">
                  <X className="size-5" />
                </button>
              </div>
              <div className="h-[calc(100%-3.25rem)]">{threadList}</div>
            </div>
          </div>
        )}

        <Card className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <button aria-label="Show chats" onClick={() => setDrawer(true)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-panel-2 md:hidden">
              <PanelLeft className="size-5" />
            </button>
            <p className="min-w-0 flex-1 truncate font-semibold">{threads.find((t) => t.id === threadId)?.title ?? "New chat"}</p>
            {templateMode && <Badge tone="yellow">Template mode — add ANTHROPIC_API_KEY</Badge>}
            <button aria-label="New chat" onClick={newChat} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-panel-2 md:hidden">
              <Plus className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
            {messages.length === 0 && !sending ? (
              <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
                <div className="tint-blue grid size-14 place-items-center rounded-2xl">
                  <Sparkles className="size-7 text-brand-ink" />
                </div>
                <h2 className="mt-4 text-xl font-bold">Hi{firstName ? ` ${firstName}` : ""}, how can I help?</h2>
                <p className="mt-1 text-sm text-muted">Your AI content strategist for {workspace.name}. It uses your My Brand details.</p>
                <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-2xl border border-line bg-panel px-4 py-3 text-left text-sm hover:border-brand/40 hover:text-brand-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-4">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm break-words whitespace-pre-wrap text-on-brand">{m.content}</div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex gap-2.5">
                      <span className="tint-blue mt-0.5 grid size-8 shrink-0 place-items-center rounded-full">
                        <MessageCircle className="size-4 text-brand-ink" />
                      </span>
                      <div className="min-w-0 max-w-[90%]">
                        <div className="rounded-2xl rounded-tl-md border border-line bg-panel-2 px-4 py-3 text-sm leading-relaxed">
                          <Markdown text={m.content} />
                        </div>
                        <div className="mt-1 flex gap-1">
                          <button onClick={() => copy(m.content)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-faint hover:text-brand-ink">
                            <Copy className="size-3.5" /> Copy
                          </button>
                          {(can("write_content") || can("support")) && (
                            <button onClick={() => save(m.content)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-faint hover:text-brand-ink">
                              <Bookmark className="size-3.5" /> Save
                            </button>
                          )}
                          {can("write_content") && (
                            <button
                              onClick={() => router.push(`/app/compose?draft=${encodeURIComponent(m.content.replace(/\*\*/g, ""))}`)}
                              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-faint hover:text-brand-ink"
                            >
                              <PenSquare className="size-3.5" /> Use in composer
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ),
                )}
                {sending && (
                  <div className="flex gap-2.5">
                    <span className="tint-blue grid size-8 shrink-0 place-items-center rounded-full">
                      <MessageCircle className="size-4 text-brand-ink" />
                    </span>
                    <div className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-line bg-panel-2 px-4 py-3">
                      {[0, 1, 2].map((d) => (
                        <span key={d} className="size-2 animate-bounce rounded-full bg-brand/60" style={{ animationDelay: `${d * 150}ms` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="border-t border-line p-3">
            <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-line-2 bg-panel px-3 py-2 focus-within:border-brand">
              <textarea
                ref={taRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask anything about your content…"
                className="max-h-44 min-h-6 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-faint"
              />
              <Button size="icon" aria-label="Send" onClick={() => send()} loading={sending} disabled={!input.trim()}>
                {!sending && <Send className="size-4" />}
              </Button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-faint">Enter to send · Shift+Enter for a new line · AI can make mistakes — review before posting.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
