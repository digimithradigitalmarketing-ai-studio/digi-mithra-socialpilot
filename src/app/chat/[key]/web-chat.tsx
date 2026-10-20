"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Msg {
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readSession(key: string) {
  try {
    return localStorage.getItem(`sp.webchat.${key}`);
  } catch {
    return null;
  }
}
function writeSession(key: string, v: string | null) {
  try {
    if (v) localStorage.setItem(`sp.webchat.${key}`, v);
    else localStorage.removeItem(`sp.webchat.${key}`);
  } catch {}
}

export function WebChat({ chatKey }: { chatKey: string }) {
  const supabase = createClient();
  const [config, setConfig] = useState<{ business: string; greeting: string } | null | undefined>(undefined);
  const [session, setSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [embedded, setEmbedded] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEmbedded(new URLSearchParams(window.location.search).get("embed") === "1");
    if (!UUID.test(chatKey)) {
      setConfig(null);
      return;
    }
    setSession(readSession(chatKey));
    supabase.rpc("web_chat_config", { p_key: chatKey }).then(({ data }: { data: { business: string; greeting: string } | null }) => setConfig(data ?? null));
  }, [supabase, chatKey]);

  const load = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase.rpc("web_chat_messages", { p_session: session });
    if (error) {
      // the conversation was removed: start over
      writeSession(chatKey, null);
      setSession(null);
      return;
    }
    setMessages((data ?? []) as Msg[]);
  }, [supabase, session, chatKey]);

  useEffect(() => {
    if (!session) return;
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 4000);
    return () => clearInterval(t);
  }, [session, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase.rpc("start_web_chat", {
      p_key: chatKey,
      p_name: name.trim() || null,
      p_email: email.trim() || null,
      p_message: text.trim(),
      p_consent: consent,
    });
    setBusy(false);
    if (error) return setError(error.message);
    writeSession(chatKey, data as string);
    setSession(data as string);
    setText("");
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !session) return;
    setBusy(true);
    setError("");
    const body = text.trim();
    setMessages((m) => [...m, { direction: "inbound", body, created_at: new Date().toISOString() }]);
    setText("");
    const { error } = await supabase.rpc("send_web_chat", { p_session: session, p_message: body });
    setBusy(false);
    if (error) setError(error.message);
    load();
  };

  if (config === undefined) {
    return (
      <div className="grid min-h-dvh place-items-center bg-white">
        <Loader2 className="size-6 animate-spin text-[#4d9a12]" />
      </div>
    );
  }
  if (config === null) {
    return <div className="grid min-h-dvh place-items-center bg-white p-6 text-center text-sm text-slate-600">This chat is not available.</div>;
  }

  return (
    <div className="flex h-dvh flex-col bg-white text-slate-900">
      <header className="flex items-center gap-3 bg-[#0b0f0a] px-4 py-3 text-white">
        <div className="grid size-9 place-items-center rounded-full bg-[#8bdc2b] font-bold text-[#0b0f0a]">{config.business.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{config.business}</p>
          <p className="text-[11px] text-[#b6f04a]">We usually reply within a few hours</p>
        </div>
        {embedded && (
          <button aria-label="Close chat" onClick={() => window.parent.postMessage("sp-chat-close", "*")} className="rounded-md p-1 text-white/80 hover:text-white">
            <X className="size-5" />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#f6f8f4] px-4 py-4">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm shadow-sm">{config.greeting}</div>
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.direction === "inbound"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#8bdc2b] px-3 py-2 text-sm whitespace-pre-wrap text-[#0b0f0a]"
                : "max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm whitespace-pre-wrap shadow-sm"
            }
          >
            {m.body}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {error && <p className="bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>}

      {session ? (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(e);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Type a message…"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#4d9a12]"
          />
          <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="grid size-10 place-items-center rounded-xl bg-[#8bdc2b] text-[#0b0f0a] disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      ) : (
        <form onSubmit={start} className="space-y-2 border-t border-slate-200 bg-white p-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Your name" className="h-10 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-[#4d9a12]" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional)"
              className="h-10 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-[#4d9a12]"
            />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={2000}
            required
            placeholder="How can we help?"
            className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#4d9a12]"
          />
          <label className="flex items-start gap-2 text-[11px] text-slate-600">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            Send me offers and updates by email (optional — you can unsubscribe any time).
          </label>
          <button type="submit" disabled={busy || !text.trim()} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#0b0f0a] text-sm font-semibold text-[#8bdc2b] disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Start chat
          </button>
        </form>
      )}
      <p className="flex items-center justify-center gap-1.5 bg-white pb-2 text-[10px] text-slate-400">
        <Image src="/mark.png" alt="" width={12} height={12} className="rounded" /> Powered by Digi Mithra Social Pilot
      </p>
    </div>
  );
}
