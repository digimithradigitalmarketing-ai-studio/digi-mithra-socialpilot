"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Hash,
  Languages,
  Lightbulb,
  Megaphone,
  MessageCircleQuestion,
  PenSquare,
  RefreshCw,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Field, PageHeader, ProgressBar, Select, Textarea } from "@/components/ui";
import { cn, errMsg, timeAgo } from "@/lib/utils";
import { PROVIDERS, PROVIDER_LIST } from "@/lib/providers";

type Kind = "caption" | "hook" | "hashtags" | "campaign" | "translate" | "faq" | "ideas" | "review_reply";

const TOOLS: { kind: Kind; name: string; desc: string; icon: React.ComponentType<{ className?: string }>; placeholder: string }[] = [
  { kind: "caption", name: "Caption writer", desc: "Platform-ready captions", icon: PenSquare, placeholder: "e.g. New morning HIIT batch starting Monday, 6 AM, first class free" },
  { kind: "hook", name: "Hook generator", desc: "Scroll-stopping first lines", icon: Zap, placeholder: "e.g. Reel about 3 mistakes beginners make at the gym" },
  { kind: "hashtags", name: "Hashtags", desc: "Relevant, local hashtags", icon: Hash, placeholder: "e.g. Yoga studio in Chennai, weekend batch" },
  { kind: "campaign", name: "Campaign copy", desc: "Offers & launch copy", icon: Megaphone, placeholder: "e.g. Diwali membership offer: 20% off annual plans till 15 Nov" },
  { kind: "translate", name: "Translate", desc: "Localise into Indian languages", icon: Languages, placeholder: "Paste the text to translate" },
  { kind: "faq", name: "FAQ answer", desc: "Answers grounded in brand facts", icon: MessageCircleQuestion, placeholder: "e.g. Do you have parking? What are your timings?" },
  { kind: "ideas", name: "Content ideas", desc: "7-day content plan", icon: Lightbulb, placeholder: "e.g. Grow memberships for women's strength training" },
  { kind: "review_reply", name: "Review reply", desc: "Polite, on-brand replies", icon: Star, placeholder: "Paste the customer review" },
];

const TONES = ["friendly", "professional", "energetic", "luxury", "witty"];
const LANGUAGES = ["English", "Tamil", "Hindi", "Telugu", "Kannada", "Malayalam"];

interface Generation {
  id: string;
  kind: string;
  prompt: string;
  output: string;
  provider: string;
  credits: number;
  created_at: string;
}

interface Usage {
  ai_credits: number;
  plan: { ai_credits_per_month: number; name: string };
}

function CopyButton({ text, size = "sm" }: { text: string; size?: "sm" | "md" }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size={size}
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

export default function AIStudioPage() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const { workspace, tenant, can } = useApp();
  const [kind, setKind] = useState<Kind>("caption");
  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [tone, setTone] = useState("friendly");
  const [language, setLanguage] = useState("English");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ output: string; provider: string; credits: number } | null>(null);
  const [history, setHistory] = useState<Generation[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const tool = TOOLS.find((t) => t.kind === kind)!;
  const canGenerate = can("write_content") || can("support");

  const load = useCallback(async () => {
    const [{ data: hist }, { data: u }] = await Promise.all([
      supabase
        .from("ai_generations")
        .select("id,kind,prompt,output,provider,credits,created_at")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.rpc("get_usage", { p_tenant: tenant.id }),
    ]);
    setHistory((hist ?? []) as Generation[]);
    setUsage((u as Usage) ?? null);
  }, [supabase, workspace.id, tenant.id]);

  useEffect(() => {
    setResult(null);
    load();
  }, [load]);

  const generate = async () => {
    if (!prompt.trim()) {
      toast("Describe what you need first", "info");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, kind, prompt, tone, platform, language }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setResult({ output: json.output, provider: json.provider, credits: json.credits });
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const used = usage?.ai_credits ?? 0;
  const limit = usage?.plan?.ai_credits_per_month ?? 0;

  return (
    <div>
      <PageHeader
        title="AI Studio"
        description="Brand-aware writing tools. Outputs are grounded in your brand knowledge — always review before publishing."
        actions={
          <Link href="/app/knowledge">
            <Button variant="secondary">
              <BookOpen className="size-4" /> Brand knowledge
            </Button>
          </Link>
        }
      />

      {usage && (
        <Card className="mb-5 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted">AI credits this month ({usage.plan.name} plan)</span>
            <span className="font-medium tabular-nums">
              {used} / {limit}
            </span>
          </div>
          <ProgressBar value={used} max={limit} />
        </Card>
      )}

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TOOLS.map((t) => (
          <button
            key={t.kind}
            onClick={() => {
              setKind(t.kind);
              setResult(null);
            }}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              kind === t.kind ? "border-brand bg-brand/10" : "border-line bg-panel hover:border-line-2",
            )}
          >
            <t.icon className={cn("mb-2 size-5", kind === t.kind ? "text-brand" : "text-muted")} />
            <p className="text-sm font-semibold">{t.name}</p>
            <p className="text-xs text-muted">{t.desc}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={tool.name} description={tool.desc} />
          <div className="space-y-4 p-4 sm:p-5">
            <Field label={kind === "translate" || kind === "review_reply" ? "Text" : "What do you need?"}>
              <Textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={tool.placeholder} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Platform">
                <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {PROVIDER_LIST.map((p) => (
                    <option key={p} value={p}>
                      {PROVIDERS[p].name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tone">
                <Select value={tone} onChange={(e) => setTone(e.target.value)}>
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {t[0].toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Language">
                <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button className="w-full" onClick={generate} loading={busy} disabled={!canGenerate}>
              <Sparkles className="size-4" /> Generate
            </Button>
            {!canGenerate && <p className="text-xs text-faint">Your role can view AI history but not generate.</p>}
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Output"
            action={
              result &&
              (result.provider === "template" ? (
                <Badge tone="yellow">Template engine — add ANTHROPIC_API_KEY for AI</Badge>
              ) : (
                <Badge tone="green">AI · {result.credits} credit{result.credits === 1 ? "" : "s"}</Badge>
              ))
            }
          />
          {result ? (
            <div className="flex flex-1 flex-col p-4 sm:p-5">
              <div className="flex-1 whitespace-pre-wrap rounded-xl border border-line bg-bg p-4 text-sm leading-relaxed">{result.output}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <CopyButton text={result.output} size="md" />
                <Button variant="secondary" onClick={generate} loading={busy}>
                  <RefreshCw className="size-4" /> Regenerate
                </Button>
                {can("write_content") && (
                  <Button onClick={() => router.push(`/app/compose?draft=${encodeURIComponent(result.output)}`)}>
                    <PenSquare className="size-4" /> Use in composer
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <EmptyState icon={Sparkles} title="Nothing generated yet" description="Pick a tool, describe what you need and press Generate." />
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Recent generations" description="Last 20 in this workspace" />
        {history.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No history yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((h) => {
              const open = expanded === h.id;
              return (
                <li key={h.id} className="px-4 py-3 sm:px-5">
                  <button onClick={() => setExpanded(open ? null : h.id)} className="flex w-full items-start gap-3 text-left">
                    <Badge tone="purple">{h.kind.replace(/_/g, " ")}</Badge>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 block text-sm">{h.prompt}</span>
                      <span className="text-xs text-faint">
                        {timeAgo(h.created_at)} · {h.provider}
                      </span>
                    </span>
                    <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
                  </button>
                  {open && (
                    <div className="mt-3">
                      <div className="whitespace-pre-wrap rounded-lg border border-line bg-bg p-3 text-sm">{h.output}</div>
                      <div className="mt-2">
                        <CopyButton text={h.output} />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
