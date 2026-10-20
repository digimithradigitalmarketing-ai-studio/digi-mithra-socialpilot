"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { useToast } from "@/components/toast";
import { Button, Field, Input } from "@/components/ui";
import { PUBLISH_TARGETS } from "@/lib/content-templates";
import type { BrandSettings } from "@/lib/types";
import { cn, errMsg } from "@/lib/utils";

const TARGET_STYLE: Record<string, { color: string; short: string }> = {
  instagram: { color: "#E1306C", short: "IG" },
  tiktok: { color: "#111111", short: "TT" },
  shorts: { color: "#ff3d6e", short: "S" },
  youtube: { color: "#FF0000", short: "YT" },
  facebook: { color: "#1877F2", short: "f" },
  x: { color: "#0f1419", short: "X" },
  linkedin: { color: "#0A66C2", short: "in" },
  threads: { color: "#101010", short: "@" },
};
const FREQUENCIES: { v: NonNullable<BrandSettings["frequency"]>; label: string }[] = [
  { v: "1-3", label: "1 to 3 times" },
  { v: "4-5", label: "4 to 5 times" },
  { v: "6+", label: "6+ times" },
];
const TONES = ["friendly", "professional", "energetic", "luxury", "witty"];
const LANGUAGES = ["English", "Tamil", "Hindi", "Telugu", "Kannada", "Malayalam"];
const GOALS = ["More followers", "More leads", "Sell offers", "Build trust", "Educate audience"];

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border px-4 py-2.5 text-sm transition-colors",
        active ? "border-brand/50 bg-brand/10 font-semibold text-brand-ink" : "border-line-2 bg-panel text-muted hover:border-brand/40 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function BrandWizard({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const supabase = createClient();
  const { workspace, can, refresh } = useApp();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<BrandSettings>({});
  const [saving, setSaving] = useState(false);
  const editable = can("manage_workspace");

  useEffect(() => {
    if (!open) return;
    setStep(1);
    const b = (workspace.brand_settings ?? {}) as BrandSettings;
    setForm({ tone: "friendly", language: "English", platforms: [], goals: [], ...b, niche: b.niche ?? workspace.industry ?? "" });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, workspace, onClose]);

  if (!open) return null;

  const set = <K extends keyof BrandSettings>(k: K, v: BrandSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: "platforms" | "goals", v: string) =>
    setForm((f) => {
      const cur = f[k] ?? [];
      return { ...f, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });
  const allSelected = PUBLISH_TARGETS.every((t) => form.platforms?.includes(t.id));

  const finish = async () => {
    setSaving(true);
    const merged = { ...((workspace.brand_settings ?? {}) as BrandSettings), ...form, onboarded_at: new Date().toISOString() };
    const { error } = await supabase.from("workspaces").update({ brand_settings: merged }).eq("id", workspace.id);
    if (error) {
      setSaving(false);
      return toast(errMsg(error), "error");
    }
    await refresh();
    setSaving(false);
    toast("Brand profile saved — AI content will now match your brand");
    onDone?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4 dark:bg-black/70" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Set up your brand"
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-up relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-panel shadow-2xl sm:max-w-3xl sm:rounded-3xl"
      >
        <div className="overflow-y-auto px-5 pt-6 pb-4 sm:px-8">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((n) => (
              <span key={n} className={cn("h-1.5 w-14 rounded-full", n <= step ? "bg-brand" : "bg-line")} />
            ))}
            <span className="flex-1" />
            <span className="text-sm text-muted">{step}/3</span>
            <button aria-label="Close" onClick={onClose} className="ml-2 text-faint hover:text-ink">
              <X className="size-5" />
            </button>
          </div>

          {!editable && (
            <p className="mt-4 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
              Only workspace managers can change the brand profile. You can view it here.
            </p>
          )}

          {step === 1 && (
            <div className="mt-6 space-y-4">
              <div>
                <h2 className="text-xl font-semibold sm:text-2xl">Tell us about your brand</h2>
                <p className="mt-1 text-sm text-muted">This helps the AI write content that sounds like you, not generic.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Niche / industry">
                  <Input disabled={!editable} value={form.niche ?? ""} onChange={(e) => set("niche", e.target.value)} placeholder="e.g. Fitness studio, wedding films" />
                </Field>
                <Field label="Target audience">
                  <Input disabled={!editable} value={form.audience ?? ""} onChange={(e) => set("audience", e.target.value)} placeholder="e.g. working professionals, 25-40" />
                </Field>
                <Field label="Main offer">
                  <Input disabled={!editable} value={form.offer ?? ""} onChange={(e) => set("offer", e.target.value)} placeholder="e.g. Quarterly membership with trainer" />
                </Field>
                <Field label="Location">
                  <Input disabled={!editable} value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Coimbatore" />
                </Field>
                <Field label="Website" className="sm:col-span-2">
                  <Input disabled={!editable} type="url" value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-6">
              <h2 className="text-xl font-semibold sm:text-2xl">Where do you plan to publish?</h2>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="text-sm text-muted">You can select multiple options</p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={!editable}
                    checked={allSelected}
                    onChange={() => set("platforms", allSelected ? [] : PUBLISH_TARGETS.map((t) => t.id))}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  Select all
                </label>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PUBLISH_TARGETS.map((t) => {
                  const active = form.platforms?.includes(t.id);
                  const st = TARGET_STYLE[t.id];
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={!editable}
                      aria-pressed={active}
                      onClick={() => toggle("platforms", t.id)}
                      className={cn(
                        "relative flex flex-col items-center gap-2 rounded-2xl border px-3 py-5 text-sm font-semibold transition-colors",
                        active ? "border-brand/50 bg-brand/8 shadow-sm" : "border-line-2 bg-panel hover:border-brand/40",
                      )}
                    >
                      {active && (
                        <span className="absolute top-2 right-2 grid size-4 place-items-center rounded-full bg-brand text-on-brand">
                          <Check className="size-3" />
                        </span>
                      )}
                      <span className="grid size-8 place-items-center rounded-lg text-[11px] font-bold text-white" style={{ background: st.color }}>
                        {st.short}
                      </span>
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <h2 className="mt-8 text-xl font-semibold sm:text-2xl">How many times do you want to post per week?</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {FREQUENCIES.map((f) => (
                  <Pill key={f.v} active={form.frequency === f.v} onClick={() => editable && set("frequency", f.v)}>
                    {f.label}
                  </Pill>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-6 space-y-7">
              <div>
                <h2 className="text-xl font-semibold sm:text-2xl">What tone fits your brand?</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {TONES.map((t) => (
                    <Pill key={t} active={form.tone === t} onClick={() => editable && set("tone", t)}>
                      <span className="capitalize">{t}</span>
                    </Pill>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold sm:text-2xl">Main language</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {LANGUAGES.map((l) => (
                    <Pill key={l} active={form.language === l} onClick={() => editable && set("language", l)}>
                      {l}
                    </Pill>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold sm:text-2xl">What are your goals?</h2>
                <p className="mt-1 text-sm text-muted">You can select multiple options</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {GOALS.map((g) => (
                    <Pill key={g} active={!!form.goals?.includes(g)} onClick={() => editable && toggle("goals", g)}>
                      {g}
                    </Pill>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="safe-bottom flex items-center justify-between gap-2 border-t border-line px-5 py-4 sm:px-8">
          <Button variant="secondary" onClick={() => (step === 1 ? onClose() : setStep(step - 1))}>
            {step === 1 ? "Later" : "Go Back"}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)}>Continue</Button>
          ) : editable ? (
            <Button loading={saving} onClick={finish}>
              Finish
            </Button>
          ) : (
            <Button onClick={onClose}>Close</Button>
          )}
        </div>
      </div>
    </div>
  );
}
