"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ExternalLink, FileText, Link2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, LoadingBlock, PageHeader, ProgressBar, Select } from "@/components/ui";
import { useToast } from "@/components/toast";
import { AddContentModal } from "@/components/add-content-modal";
import { BrandWizard } from "@/components/brand-wizard";
import { FORMAT_LABELS, PUBLISH_TARGETS } from "@/lib/content-templates";
import { cn, errMsg, timeAgo } from "@/lib/utils";
import type { BrandSettings, ContentSource } from "@/lib/types";

const TONES = ["friendly", "professional", "energetic", "luxury", "witty"];
const LANGUAGES = ["English", "Tamil", "Hindi", "Telugu", "Kannada", "Malayalam"];
const FREQUENCIES = ["1-3", "4-5", "6+"] as const;
const GOALS = ["Get more leads", "Grow followers", "Sell offers", "Build brand awareness", "Community engagement", "Educate audience"];
const CATEGORIES = ["about", "offerings", "hours", "locations", "faq", "tone", "forbidden", "disclaimer"];
const TINTS = ["tint-blue", "tint-rose", "tint-green", "tint-amber", "tint-violet", "tint-sky"];

function Chip({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        active ? "border-brand/40 bg-brand/10 font-medium text-brand-ink" : "border-line-2 bg-panel text-muted hover:border-brand/30 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export default function BrandPage() {
  const supabase = createClient();
  const { workspace, can, refresh } = useApp();
  const toast = useToast();
  const canManage = can("manage_workspace");
  const canWrite = can("write_content");

  const [brand, setBrand] = useState<BrandSettings>({});
  const [knowledge, setKnowledge] = useState<Record<string, number> | null>(null);
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [saving, setSaving] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    setBrand((workspace.brand_settings ?? {}) as BrandSettings);
  }, [workspace.id, workspace.brand_settings]);

  const load = useCallback(async () => {
    const [{ data: k }, { data: s, error }] = await Promise.all([
      supabase.from("brand_knowledge").select("category").eq("workspace_id", workspace.id),
      supabase.from("content_sources").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(60),
    ]);
    if (error) toast(errMsg(error), "error");
    const counts: Record<string, number> = {};
    for (const r of (k ?? []) as { category: string }[]) counts[r.category] = (counts[r.category] ?? 0) + 1;
    setKnowledge(counts);
    setSources((s ?? []) as ContentSource[]);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    setKnowledge(null);
    load();
  }, [load]);

  const knowledgeTotal = useMemo(() => Object.values(knowledge ?? {}).reduce((a, b) => a + b, 0), [knowledge]);

  const completeness = useMemo(() => {
    const checks = [
      brand.niche,
      brand.audience,
      brand.offer,
      brand.location,
      brand.website,
      brand.tone,
      brand.language,
      brand.platforms?.length,
      brand.frequency,
      brand.goals?.length,
      knowledgeTotal >= 3,
      knowledgeTotal >= 6,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [brand, knowledgeTotal]);

  const set = <K extends keyof BrandSettings>(k: K, v: BrandSettings[K]) => setBrand((b) => ({ ...b, [k]: v }));
  const toggleIn = (k: "platforms" | "goals", v: string) =>
    setBrand((b) => {
      const list = b[k] ?? [];
      return { ...b, [k]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] };
    });

  const save = async () => {
    if (brand.website && !/^https?:\/\//.test(brand.website)) return toast("Website should start with https://", "error");
    setSaving(true);
    const merged = { ...(workspace.brand_settings ?? {}), ...brand };
    const { error } = await supabase.from("workspaces").update({ brand_settings: merged }).eq("id", workspace.id);
    setSaving(false);
    if (error) return toast(errMsg(error), "error");
    toast("Brand profile saved — AI will use it from now on");
    await refresh();
  };

  const removeSource = async (s: ContentSource) => {
    if (!confirm("Remove this item from your inspiration library?")) return;
    if (s.storage_path) await supabase.storage.from("media").remove([s.storage_path]);
    const { error } = await supabase.from("content_sources").delete().eq("id", s.id);
    if (error) return toast(errMsg(error), "error");
    setSources((all) => all.filter((x) => x.id !== s.id));
  };

  if (!knowledge) return <LoadingBlock />;

  const initials = workspace.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      <PageHeader title="My Brand" description="Everything the AI knows about your business. The more you add, the less generic your content." />

      <Card className="tint-blue overflow-hidden p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-2 to-brand-deep text-xl font-bold text-on-brand shadow-lg shadow-brand/30">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{workspace.name}</p>
            <p className="text-sm text-muted">{workspace.industry || "Industry not set"}</p>
            <div className="mt-3 max-w-md">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted">Brand profile completeness</span>
                <span className="font-semibold tabular-nums">{completeness}%</span>
              </div>
              <ProgressBar value={completeness} max={100} />
            </div>
          </div>
          {canManage && (
            <Button onClick={() => setWizard(true)}>
              <Wand2 className="size-4" /> Run setup wizard
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Brand profile" description="Used in every AI caption, script, idea and reply." />
        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Niche">
              <Input disabled={!canManage} value={brand.niche ?? ""} onChange={(e) => set("niche", e.target.value)} placeholder="Women's fitness & strength training" />
            </Field>
            <Field label="Target audience">
              <Input disabled={!canManage} value={brand.audience ?? ""} onChange={(e) => set("audience", e.target.value)} placeholder="Working professionals 25-40 in Chennai" />
            </Field>
            <Field label="Main offer">
              <Input disabled={!canManage} value={brand.offer ?? ""} onChange={(e) => set("offer", e.target.value)} placeholder="Quarterly membership with personal coaching" />
            </Field>
            <Field label="Location">
              <Input disabled={!canManage} value={brand.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="Anna Nagar, Chennai" />
            </Field>
            <Field label="Website">
              <Input disabled={!canManage} value={brand.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tone">
                <Select disabled={!canManage} value={brand.tone ?? "friendly"} onChange={(e) => set("tone", e.target.value)}>
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Language">
                <Select disabled={!canManage} value={brand.language ?? "English"} onChange={(e) => set("language", e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted">Where you publish</p>
            <div className="flex flex-wrap gap-2">
              {PUBLISH_TARGETS.map((p) => (
                <Chip key={p.id} disabled={!canManage} active={(brand.platforms ?? []).includes(p.id)} onClick={() => toggleIn("platforms", p.id)}>
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted">Posts per week</p>
            <div className="flex flex-wrap gap-2">
              {FREQUENCIES.map((f) => (
                <Chip key={f} disabled={!canManage} active={brand.frequency === f} onClick={() => set("frequency", f)}>
                  {f === "6+" ? "6+ times" : `${f.replace("-", " to ")} times`}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted">Goals</p>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <Chip key={g} disabled={!canManage} active={(brand.goals ?? []).includes(g)} onClick={() => toggleIn("goals", g)}>
                  {g}
                </Chip>
              ))}
            </div>
          </div>

          {canManage ? (
            <div className="flex justify-end">
              <Button onClick={save} loading={saving}>
                Save brand profile
              </Button>
            </div>
          ) : (
            <p className="text-xs text-faint">Only managers and admins can edit the brand profile.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Brand knowledge"
          description="Facts the AI can quote: hours, offerings, FAQs, words to avoid."
          action={
            <Link href="/app/knowledge">
              <Button size="sm" variant="secondary">
                <BookOpen className="size-3.5" /> Manage knowledge
              </Button>
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
          {CATEGORIES.map((c) => (
            <div key={c} className="rounded-xl border border-line bg-panel-2 px-3 py-2.5">
              <p className="text-xs capitalize text-muted">{c}</p>
              <p className={cn("text-lg font-semibold tabular-nums", !knowledge[c] && "text-faint")}>{knowledge[c] ?? 0}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Inspiration library"
          description="Links, files and notes you want to learn from or repurpose."
          action={
            canWrite && (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="size-3.5" /> Add content
              </Button>
            )
          }
        />
        {sources.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Your library is empty"
            description="Paste links from Instagram, YouTube, LinkedIn or any website, upload files, or write notes."
            action={canWrite && <Button onClick={() => setAddOpen(true)}>Add content</Button>}
          />
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
            {sources.map((s, i) => (
              <div key={s.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel">
                {s.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.thumbnail_url} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                ) : (
                  <div className={cn("flex aspect-video flex-col justify-between p-4", TINTS[i % TINTS.length])}>
                    {s.kind === "link" ? <Link2 className="size-5 text-brand-ink" /> : <FileText className="size-5 text-brand-ink" />}
                    <p className="line-clamp-3 text-sm font-medium">{s.title || s.text_content || s.url}</p>
                  </div>
                )}
                <div className="flex flex-1 flex-col p-3">
                  <p className="line-clamp-2 text-sm font-medium">{s.title || s.url || "Untitled"}</p>
                  {s.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{s.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.platform && <Badge tone="blue">{s.platform.replace(/_/g, " ")}</Badge>}
                    {s.format && <Badge tone="purple">{FORMAT_LABELS[s.format] ?? s.format.replace(/_/g, " ")}</Badge>}
                    <Badge>{s.kind}</Badge>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <span className="text-[11px] text-faint">{timeAgo(s.created_at)}</span>
                    <div className="flex gap-1">
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label="Open link" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-panel-2 hover:text-brand-ink">
                          <ExternalLink className="size-4" />
                        </a>
                      )}
                      {canWrite && (
                        <button aria-label="Delete" onClick={() => removeSource(s)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-panel-2 hover:text-danger">
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AddContentModal open={addOpen} onClose={() => setAddOpen(false)} onAdded={() => load()} />
      <BrandWizard
        open={wizard}
        onClose={() => setWizard(false)}
        onDone={() => {
          setWizard(false);
          load();
        }}
      />
    </div>
  );
}
