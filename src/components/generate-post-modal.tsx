"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bookmark, Copy, PenSquare, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Field, Modal, Select, Textarea } from "@/components/ui";
import { errMsg } from "@/lib/utils";

const PLATFORMS = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["linkedin", "LinkedIn"],
  ["x", "X / Twitter"],
  ["threads", "Threads"],
  ["youtube", "YouTube"],
  ["tiktok", "TikTok"],
  ["whatsapp", "WhatsApp"],
];
const TONES = ["friendly", "professional", "energetic", "luxury", "witty"];
const isUrl = (s: string) => /^(https?:\/\/|www\.)\S+$/i.test(s.trim());

export function GeneratePostModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = createClient();
  const router = useRouter();
  const { workspace } = useApp();
  const toast = useToast();
  const [input, setInput] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [tone, setTone] = useState(((workspace.brand_settings as { tone?: string }).tone as string) || "friendly");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [provider, setProvider] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setOutput("");
      setSaved(false);
    }
  }, [open]);

  const generate = async () => {
    const raw = input.trim();
    if (!raw) return;
    setBusy(true);
    setSaved(false);
    try {
      let prompt = raw;
      let kind = "caption";
      if (isUrl(raw)) {
        kind = "repurpose";
        const res = await fetch("/api/sources/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: /^https?:\/\//i.test(raw) ? raw : `https://${raw}` }),
        });
        const p = await res.json();
        if (!res.ok) throw new Error(p.error || "Could not read that link");
        prompt = [p.title, p.description, `Source: ${p.url}`].filter(Boolean).join("\n");
      }
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, kind, prompt, platform, tone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setOutput(data.output);
      setProvider(data.provider);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const { error } = await supabase.from("saved_items").insert({
      tenant_id: workspace.tenant_id,
      workspace_id: workspace.id,
      kind: "post",
      title: output.split("\n").find((l) => l.trim())?.slice(0, 100) || "Generated post",
      content: output,
      meta: { platform, tone, source: input.slice(0, 300) },
    });
    if (error) return toast(errMsg(error), "error");
    setSaved(true);
    toast("Saved");
  };

  return (
    <Modal open={open} onClose={onClose} title="Generate Post" wide>
      <div className="space-y-4">
        <p className="text-sm text-muted">Enter an idea or paste a link and get a ready-to-post caption in your brand voice.</p>
        <Field label="Idea or link">
          <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Monsoon offer: 20% off quarterly membership — or paste https://…" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Platform">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tone">
            <Select value={tone} onChange={(e) => setTone(e.target.value)}>
              {TONES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Button onClick={generate} loading={busy} disabled={!input.trim()}>
            <Sparkles className="size-4" /> {isUrl(input) ? "Repurpose" : "Generate"}
          </Button>
        </div>

        {output && (
          <div className="animate-fade-up rounded-2xl border border-line bg-panel-2 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Result</p>
              {provider === "template" ? <Badge tone="yellow">Template engine — add ANTHROPIC_API_KEY for AI</Badge> : <Badge tone="blue">AI</Badge>}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{output}</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(output);
                    toast("Copied");
                  } catch {
                    toast("Copy failed", "error");
                  }
                }}
              >
                <Copy className="size-4" /> Copy
              </Button>
              <Button variant="secondary" size="sm" onClick={save} disabled={saved}>
                <Bookmark className={saved ? "size-4 fill-current" : "size-4"} /> {saved ? "Saved" : "Save"}
              </Button>
              <Button size="sm" onClick={() => router.push(`/app/compose?draft=${encodeURIComponent(output)}`)}>
                <PenSquare className="size-4" /> Open in composer
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
