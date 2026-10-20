"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { FormField } from "@/lib/types";

// Public landing page renderer, shared by /p/[slug] and the editor preview.
// Colours are deliberately fixed to a light palette: visitors never see the app theme.

export interface LandingPageData {
  title: string;
  headline: string;
  subheadline?: string | null;
  body?: string | null;
  bullets?: string[];
  cta_label: string;
  hero_image_url?: string | null;
  accent: string;
  form_fields: FormField[];
  success_message: string;
  consent_text: string;
  business?: string;
}

export function LandingView({
  page,
  preview,
  onSubmit,
}: {
  page: LandingPageData;
  preview?: boolean;
  /** resolves to the success message; throws with a readable message on failure */
  onSubmit?: (data: Record<string, string | boolean>) => Promise<string>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const accent = /^#[0-9a-f]{3,8}$/i.test(page.accent) ? page.accent : "#3b7a0c";
  const bullets = (page.bullets ?? []).filter((b) => b.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (preview || !onSubmit) {
      setNote("Preview — submissions are disabled");
      setTimeout(() => setNote(""), 2500);
      return;
    }
    if (!consent) return setError("Please accept the consent checkbox.");
    setBusy(true);
    try {
      const msg = await onSubmit({ ...values, consent: true });
      setDone(msg || page.success_message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none";

  return (
    <div
      className="min-h-full w-full text-slate-900"
      style={{
        background: `radial-gradient(45% 40% at 0% 0%, rgb(253 226 243 / 0.6), transparent 70%), radial-gradient(50% 45% at 100% 0%, ${accent}22, transparent 70%), radial-gradient(50% 40% at 60% 100%, rgb(237 233 254 / 0.6), transparent 70%), #f7f9fe`,
      }}
    >
      <header className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-4 sm:px-6">
        <span className="grid size-8 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: accent }}>
          {(page.business ?? page.title).slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate text-sm font-semibold text-slate-800">{page.business ?? page.title}</span>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 pt-2 pb-12 sm:px-6 md:grid-cols-[1.1fr_1fr] md:items-start md:pt-8">
        <section className="min-w-0">
          <h1 className="text-3xl leading-tight font-extrabold tracking-tight break-words sm:text-4xl">{page.headline || page.title}</h1>
          {page.subheadline && <p className="mt-3 text-base text-slate-600 break-words">{page.subheadline}</p>}
          {page.hero_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.hero_image_url} alt="" className="mt-6 aspect-[16/10] w-full rounded-3xl border border-white object-cover shadow-lg" />
          )}
          {bullets.length > 0 && (
            <ul className="mt-6 space-y-2.5">
              {bullets.map((b, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0" style={{ color: accent }} />
                  <span className="break-words">{b}</span>
                </li>
              ))}
            </ul>
          )}
          {page.body && <p className="mt-6 text-sm leading-relaxed whitespace-pre-line text-slate-600 break-words">{page.body}</p>}
        </section>

        <section className="rounded-3xl border border-white bg-white/90 p-5 shadow-xl shadow-slate-200/60 backdrop-blur sm:p-6">
          {done ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto size-12" style={{ color: accent }} />
              <p className="mt-3 text-lg font-semibold">{done}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3.5">
              <p className="text-lg font-bold">{page.title}</p>
              {page.form_fields.map((f) => (
                <label key={f.name} className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    {f.label}
                    {f.required && <span className="text-rose-500"> *</span>}
                  </span>
                  {f.type === "textarea" ? (
                    <textarea
                      required={f.required && !preview}
                      rows={3}
                      value={values[f.name] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className={inputCls}
                    />
                  ) : f.type === "select" ? (
                    <select
                      required={f.required && !preview}
                      value={values[f.name] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="">Select…</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type}
                      required={f.required && !preview}
                      value={values[f.name] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className={inputCls}
                    />
                  )}
                </label>
              ))}
              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0" />
                <span>{page.consent_text}</span>
              </label>
              {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
              {note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{note}</p>}
              <button
                type="submit"
                disabled={busy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: accent }}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {page.cta_label || "Submit"}
              </button>
            </form>
          )}
        </section>
      </main>
      <footer className="pb-6 text-center text-[11px] text-slate-400">Powered by Digi Mithra Social Pilot</footer>
    </div>
  );
}
