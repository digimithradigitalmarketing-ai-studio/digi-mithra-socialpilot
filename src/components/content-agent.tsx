"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, GripVertical, Loader2, Sparkles, X } from "lucide-react";
import { useApp } from "@/components/app-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { DAY_KEYS, DAY_LABELS, FORMAT_COLORS, FORMAT_LABELS, FORMAT_SHORT, WEEKLY_TEMPLATES, type DayKey } from "@/lib/content-templates";
import { cn, errMsg, formatDate } from "@/lib/utils";

/** Small colored square standing in for a platform/format logo. */
export function FormatGlyph({ format, className }: { format: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid size-5 shrink-0 place-items-center rounded-md text-[9px] font-bold text-white", className)}
      style={{ background: FORMAT_COLORS[format] ?? "#64748b" }}
    >
      {FORMAT_SHORT[format] ?? format.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Wide modal shell (up to max-w-5xl). */
export function Overlay({
  open,
  onClose,
  children,
  className,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4 dark:bg-black/70" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "animate-fade-up relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-panel shadow-2xl sm:max-w-5xl sm:rounded-3xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

const CHIP_FORMATS = ["instagram", "short_form", "youtube", "x", "threads", "linkedin", "facebook"];
const DAY_TINTS: Record<DayKey, string> = {
  mon: "from-amber-100/80",
  tue: "from-rose-100/80",
  wed: "from-emerald-100/70",
  thu: "from-indigo-100/70",
  fri: "from-fuchsia-100/70",
  sat: "from-lime-100/80",
  sun: "from-sky-100/80",
};

function nextMonday() {
  const d = new Date();
  const add = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + add);
  return isoDate(d);
}
function isoDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function prettyDate(s: string) {
  const d = new Date(`${s}T00:00:00`);
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
}

type Schedule = Record<DayKey, string[]>;
const emptySchedule = (): Schedule => Object.fromEntries(DAY_KEYS.map((d) => [d, []])) as unknown as Schedule;

interface Created {
  id: string;
  title: string | null;
  format: string | null;
  scheduled_at: string | null;
}

export function ContentAgentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, can } = useApp();
  const toast = useToast();
  const brand = workspace.brand_settings as { tone?: string; language?: string };

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [startDate, setStartDate] = useState(nextMonday);
  const [template, setTemplate] = useState("custom");
  const [schedule, setSchedule] = useState<Schedule>(emptySchedule);
  const [picked, setPicked] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DayKey | null>(null);
  const [topics, setTopics] = useState("");
  const [tone, setTone] = useState(brand.tone || "friendly");
  const [language, setLanguage] = useState(brand.language || "English");
  const [postTime, setPostTime] = useState("10:00");
  const [cta, setCta] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ posts: Created[]; provider: string } | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setResult(null);
    }
  }, [open]);

  const total = useMemo(() => DAY_KEYS.reduce((n, d) => n + schedule[d].length, 0), [schedule]);
  const endDate = useMemo(() => {
    const d = new Date(`${startDate}T00:00:00`);
    d.setDate(d.getDate() + 6);
    return isoDate(d);
  }, [startDate]);

  const applyTemplate = (id: string) => {
    setTemplate(id);
    const t = WEEKLY_TEMPLATES.find((x) => x.id === id);
    const s = emptySchedule();
    for (const d of DAY_KEYS) s[d] = [...(t?.schedule[d] ?? [])];
    setSchedule(s);
  };

  const addTo = (day: DayKey, format: string) => {
    setSchedule((s) => {
      if (s[day].length >= 4) {
        toast(`${DAY_LABELS[day]} already has 4 posts`, "info");
        return s;
      }
      return { ...s, [day]: [...s[day], format] };
    });
    setTemplate("custom");
  };
  const removeFrom = (day: DayKey, i: number) => setSchedule((s) => ({ ...s, [day]: s[day].filter((_, j) => j !== i) }));

  const generate = async () => {
    setBusy(true);
    setStep(3);
    try {
      const res = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, startDate, template, schedule, settings: { topics, tone, language, postTime, cta } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate your week");
      setResult({ posts: data.posts ?? [], provider: data.provider });
      toast(`${data.posts?.length ?? 0} drafts created`);
    } catch (e) {
      toast(errMsg(e), "error");
      setStep(2);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay open={open} onClose={onClose} label="AI Content Agent">
      <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-7">
        <p className="text-lg text-muted">AI Content Agent</p>
        <button aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-xl bg-panel-2 text-muted hover:text-ink">
          <X className="size-5" />
        </button>
      </div>

      {!can("write_content") ? (
        <p className="px-7 py-10 text-center text-sm text-muted">Your role can&apos;t create posts in this workspace. Ask a manager for editor access.</p>
      ) : step === 1 ? (
        <div className="divide-y divide-line px-5 sm:px-7">
          <section className="py-5">
            <StepTitle n={1} title="Starting date" hint="Select when you want your content schedule to begin" />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 sm:pl-11">
              <div className="relative w-full sm:w-64">
                <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brand-ink" />
                <Input type="date" value={startDate} min={isoDate(new Date())} onChange={(e) => setStartDate(e.target.value || nextMonday())} className="pl-9" />
              </div>
              <p className="text-sm text-muted">
                Your weekly posts run {prettyDate(startDate)} to {prettyDate(endDate)}.
              </p>
            </div>
          </section>

          <section className="py-5">
            <StepTitle n={2} title="Choose a weekly template" />
            <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-11">
              {WEEKLY_TEMPLATES.map((t, i) => (
                <span key={t.id} className="contents">
                  <button
                    title={t.description}
                    onClick={() => applyTemplate(t.id)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                      template === t.id ? "border-brand/40 bg-brand/10 text-brand-ink" : "border-line-2 bg-panel hover:border-brand/40",
                    )}
                  >
                    {t.emoji && <span className="mr-1">{t.emoji}</span>}
                    {t.label}
                  </button>
                  {i === 0 && <span className="text-sm text-faint">Or</span>}
                </span>
              ))}
            </div>
          </section>

          <section className="py-5">
            <StepTitle n={3} title="Weekly content schedule" />
            <p className="mt-1 text-xs text-faint sm:pl-11">
              Drag a format onto a day. On touch screens, tap a format then tap a day.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 sm:pl-11">
              {CHIP_FORMATS.map((f) => (
                <button
                  key={f}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", f);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => setPicked((p) => (p === f ? null : f))}
                  className={cn(
                    "flex cursor-grab items-center gap-1.5 rounded-xl border bg-panel px-2.5 py-2 text-sm font-medium shadow-sm active:cursor-grabbing",
                    picked === f ? "border-brand bg-brand/10 text-brand-ink" : "border-line-2 hover:border-brand/40",
                  )}
                >
                  <GripVertical className="size-4 text-faint" />
                  <FormatGlyph format={f} />
                  {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>

            <div className="-mx-5 mt-4 overflow-x-auto px-5 sm:mx-0 sm:px-0">
              <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-2xl border border-line">
                {DAY_KEYS.map((d) => (
                  <div
                    key={d}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(d);
                    }}
                    onDragLeave={() => setDragOver((x) => (x === d ? null : x))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(null);
                      const f = e.dataTransfer.getData("text/plain");
                      if (f && f in FORMAT_LABELS) addTo(d, f);
                    }}
                    onClick={() => picked && addTo(d, picked)}
                    className={cn(
                      "flex min-h-64 flex-col gap-2 border-r border-line/60 bg-gradient-to-b to-transparent p-2 last:border-r-0 dark:from-panel-2",
                      DAY_TINTS[d],
                      dragOver === d && "ring-2 ring-brand ring-inset",
                      picked && "cursor-copy",
                    )}
                  >
                    <p className="py-1 text-center text-sm font-semibold">{DAY_LABELS[d]}</p>
                    {schedule[d].map((f, i) => (
                      <div key={`${f}-${i}`} className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1.5 text-xs font-medium shadow-sm">
                        <FormatGlyph format={f} className="size-4 text-[8px]" />
                        <span className="min-w-0 flex-1 truncate">{FORMAT_LABELS[f]}</span>
                        <button
                          aria-label={`Remove ${FORMAT_LABELS[f]} from ${DAY_LABELS[d]}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFrom(d, i);
                          }}
                          className="text-faint hover:text-danger"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    {!schedule[d].length && <p className="mt-6 text-center text-[11px] text-faint">Drop here</p>}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : step === 2 ? (
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-7">
          <Field label="Topics / themes for this week" className="sm:col-span-2">
            <Textarea value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="e.g. monsoon membership offer, beginner workouts, trainer spotlight" />
          </Field>
          <Field label="Tone">
            <Select value={tone} onChange={(e) => setTone(e.target.value)}>
              {["friendly", "professional", "energetic", "luxury", "witty"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Language">
            <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {["English", "Tamil", "Hindi", "Telugu", "Kannada", "Malayalam"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Post time">
            <Input type="time" value={postTime} onChange={(e) => setPostTime(e.target.value)} />
          </Field>
          <Field label="Preferred call to action" hint="(optional)">
            <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="e.g. DM us JOIN" />
          </Field>
          <div className="tint-blue rounded-2xl p-4 text-sm sm:col-span-2">
            <p className="font-semibold">
              {total} post{total === 1 ? "" : "s"} will be drafted
            </p>
            <p className="mt-0.5 text-muted">
              Drafts are scheduled from {prettyDate(startDate)} at {postTime}. Nothing is published until you review and schedule them.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-5 py-6 sm:px-7">
          {busy ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-brand/10">
                <Sparkles className="size-7 animate-pulse text-brand-ink" />
              </span>
              <p className="font-semibold">Writing {total} posts…</p>
              <p className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" /> Planning hooks, captions and scripts for your week
              </p>
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold">Your week is drafted 🎉</p>
                {result.provider === "template" ? <Badge tone="yellow">Template engine — add ANTHROPIC_API_KEY for AI</Badge> : <Badge tone="blue">AI generated</Badge>}
              </div>
              <div className="divide-y divide-line rounded-2xl border border-line">
                {result.posts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <FormatGlyph format={p.format ?? "instagram"} className="size-7 text-[10px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.title || "Untitled"}</p>
                      <p className="text-xs text-faint">
                        {FORMAT_LABELS[p.format ?? ""] ?? p.format} · {formatDate(p.scheduled_at, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Link href="/app/calendar" onClick={onClose}>
                  <Button variant="secondary">Open calendar</Button>
                </Link>
                <Link href="/app/posts" onClick={onClose}>
                  <Button>Review drafts</Button>
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {can("write_content") && step !== 3 && (
        <div className="safe-bottom sticky bottom-0 flex items-center justify-between gap-2 border-t border-line bg-panel px-5 py-4 sm:px-7">
          <Button variant="secondary" disabled={step === 1} onClick={() => setStep(1)}>
            <ChevronLeft className="size-4" /> Back
          </Button>
          {step === 1 ? (
            <Button disabled={!total} onClick={() => setStep(2)}>
              Content Settings <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={generate} loading={busy}>
              <Sparkles className="size-4" /> Generate my week
            </Button>
          )}
        </div>
      )}
    </Overlay>
  );
}

function StepTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="grid size-8 place-items-center rounded-full bg-brand text-sm font-semibold text-on-brand">{n}</span>
      <h3 className="text-lg font-semibold">{title}</h3>
      {hint && <span className="hidden border-l border-line-2 pl-3 text-sm text-muted sm:inline">{hint}</span>}
    </div>
  );
}
