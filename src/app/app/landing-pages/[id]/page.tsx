"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Download, ExternalLink, ImageIcon, Plus, Sparkles, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Label, LoadingBlock, Modal, Select, Tabs, Textarea, Toggle } from "@/components/ui";
import { LandingView } from "@/components/landing-view";
import { useToast } from "@/components/toast";
import { downloadFile, errMsg, formatDate, slugify, toCSV } from "@/lib/utils";
import type { FormField, LandingPage, MediaAsset } from "@/lib/types";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,60}$/;
const FIELD_TYPES: FormField["type"][] = ["text", "email", "tel", "textarea", "select", "date"];

interface Submission {
  id: string;
  data: Record<string, unknown>;
  utm: Record<string, string>;
  lead_id: string | null;
  created_at: string;
}

function fieldName(label: string, taken: string[]) {
  const base = slugify(label).replace(/-/g, "_") || "field";
  let n = base;
  let i = 2;
  while (taken.includes(n)) n = `${base}_${i++}`;
  return n;
}

export default function LandingEditorPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const toast = useToast();
  const { workspace, can } = useApp();
  const canWrite = can("write_content");

  const [page, setPage] = useState<LandingPage | null>(null);
  const [saved, setSaved] = useState<LandingPage | null>(null);
  const [missing, setMissing] = useState(false);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<"editor" | "submissions">("editor");
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [media, setMedia] = useState<(MediaAsset & { thumb?: string })[] | null>(null);
  const [utm, setUtm] = useState({ source: "instagram", medium: "social", campaign: "" });
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    const [{ data, error }, { data: camp }] = await Promise.all([
      supabase.from("landing_pages").select("*").eq("id", id).eq("workspace_id", workspace.id).maybeSingle(),
      supabase.from("campaigns").select("id,name").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
    ]);
    if (error) toast(errMsg(error), "error");
    if (!data) return setMissing(true);
    const lp = { ...data, bullets: data.bullets ?? [], form_fields: data.form_fields ?? [] } as LandingPage;
    setPage(lp);
    setSaved(lp);
    setCampaigns((camp ?? []) as { id: string; name: string }[]);
  }, [supabase, id, workspace.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const loadSubs = useCallback(async () => {
    const { data, error } = await supabase
      .from("form_submissions")
      .select("id,data,utm,lead_id,created_at")
      .eq("landing_page_id", id)
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast(errMsg(error), "error");
    setSubs((data ?? []) as Submission[]);
  }, [supabase, id, workspace.id, toast]);

  useEffect(() => {
    if (tab === "submissions") loadSubs();
  }, [tab, loadSubs]);

  const dirty = useMemo(() => JSON.stringify(page) !== JSON.stringify(saved), [page, saved]);
  const set = <K extends keyof LandingPage>(k: K, v: LandingPage[K]) => setPage((p) => (p ? { ...p, [k]: v } : p));

  const save = async (status?: LandingPage["status"]) => {
    if (!page) return;
    const slug = page.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) return toast("Slug: 3-61 lowercase letters, numbers or dashes.", "error");
    if (!page.title.trim()) return toast("Title is required", "error");
    const fields = page.form_fields.filter((f) => f.label.trim());
    if (new Set(fields.map((f) => f.name)).size !== fields.length) return toast("Each form field needs a unique name", "error");
    if (page.hero_image_url && !/^https:\/\//.test(page.hero_image_url)) return toast("Hero image must be an https URL", "error");
    setSaving(true);
    const payload = {
      slug,
      title: page.title.trim(),
      headline: page.headline,
      subheadline: page.subheadline || null,
      body: page.body || null,
      bullets: page.bullets.map((b) => b.trim()).filter(Boolean),
      cta_label: page.cta_label || "Send enquiry",
      hero_image_url: page.hero_image_url || null,
      accent: /^#[0-9a-f]{6}$/i.test(page.accent) ? page.accent : "#3b7a0c",
      form_fields: fields,
      success_message: page.success_message,
      consent_text: page.consent_text,
      campaign_id: page.campaign_id || null,
      status: status ?? page.status,
    };
    const { data, error } = await supabase.from("landing_pages").update(payload).eq("id", page.id).select("*").single();
    setSaving(false);
    if (error) return toast(error.code === "23505" ? "That URL slug is taken — try another." : errMsg(error), "error");
    const lp = data as LandingPage;
    setPage(lp);
    setSaved(lp);
    toast(status === "published" ? "Published — your page is live" : status === "draft" ? "Unpublished" : "Saved");
  };

  const aiCopy = async () => {
    if (!page) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, kind: "campaign", prompt: `${page.title}\n${page.headline}\n${page.subheadline ?? ""}` }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "AI request failed");
      set("body", json.output);
      toast(json.provider === "template" ? "Draft added (template engine — add ANTHROPIC_API_KEY for AI)" : "AI copy added — review before publishing", "info");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setAiBusy(false);
    }
  };

  const openPicker = async () => {
    setPicker(true);
    setMedia(null);
    const { data } = await supabase
      .from("media_assets")
      .select("*")
      .eq("workspace_id", workspace.id)
      .like("mime_type", "image/%")
      .order("created_at", { ascending: false })
      .limit(60);
    const list = (data ?? []) as MediaAsset[];
    if (!list.length) return setMedia([]);
    const { data: urls } = await supabase.storage.from("media").createSignedUrls(
      list.map((m) => m.storage_path),
      3600,
    );
    setMedia(list.map((m, i) => ({ ...m, thumb: urls?.[i]?.signedUrl ?? undefined })));
  };

  const pickMedia = async (m: MediaAsset) => {
    // stored links must outlive the editor session, so sign for a year
    const { data, error } = await supabase.storage.from("media").createSignedUrl(m.storage_path, 60 * 60 * 24 * 365);
    if (error || !data) return toast(errMsg(error), "error");
    set("hero_image_url", data.signedUrl);
    setPicker(false);
    toast("Image set. Library links stay valid for 1 year — re-pick the image to renew.", "info");
  };

  const updateField = (i: number, patch: Partial<FormField>) =>
    set(
      "form_fields",
      page!.form_fields.map((f, j) => (j === i ? { ...f, ...patch } : f)),
    );
  const moveField = (i: number, d: -1 | 1) => {
    const arr = [...page!.form_fields];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    set("form_fields", arr);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      toast("Couldn't copy", "error");
    }
  };

  if (missing) return <EmptyState title="Landing page not found" action={<Link href="/app/landing-pages" className="text-brand-ink hover:underline">Back to landing pages</Link>} />;
  if (!page) return <LoadingBlock />;

  const publicUrl = `${origin}/p/${saved?.slug ?? page.slug}`;
  const utmUrl = `${publicUrl}?${new URLSearchParams(
    Object.fromEntries(
      [
        ["utm_source", utm.source],
        ["utm_medium", utm.medium],
        ["utm_campaign", utm.campaign],
      ].filter(([, v]) => v.trim()),
    ),
  ).toString()}`;
  const fieldKeys = Array.from(new Set((subs ?? []).flatMap((s) => Object.keys(s.data ?? {}).filter((k) => k !== "consent"))));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link href="/app/landing-pages" className="inline-flex items-center gap-1 text-xs text-muted hover:text-brand-ink">
            <ArrowLeft className="size-3.5" /> Landing pages
          </Link>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold">
            <span className="break-words">{page.title}</span>
            <Badge tone={saved?.status === "published" ? "green" : "gray"}>{saved?.status}</Badge>
            {dirty && <Badge tone="yellow">Unsaved</Badge>}
          </h2>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={saving} disabled={!dirty} onClick={() => save()}>
              Save
            </Button>
            {saved?.status === "published" ? (
              <Button variant="secondary" loading={saving} onClick={() => save("draft")}>
                Unpublish
              </Button>
            ) : (
              <Button loading={saving} onClick={() => save("published")}>
                Publish
              </Button>
            )}
          </div>
        )}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "editor", label: "Editor" },
          { value: "submissions", label: `Submissions (${saved?.submissions ?? 0})` },
        ]}
      />

      {tab === "editor" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <Card className="p-4 sm:p-5">
              <fieldset disabled={!canWrite} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Title" hint="(form heading & browser tab)">
                    <Input value={page.title} onChange={(e) => set("title", e.target.value)} />
                  </Field>
                  <Field label="URL slug">
                    <Input value={page.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
                  </Field>
                </div>
                <Field label="Headline">
                  <Input value={page.headline} onChange={(e) => set("headline", e.target.value)} />
                </Field>
                <Field label="Subheadline">
                  <Textarea className="min-h-16" value={page.subheadline ?? ""} onChange={(e) => set("subheadline", e.target.value)} />
                </Field>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Label className="mb-0">Body</Label>
                    <Button size="sm" variant="ghost" loading={aiBusy} onClick={aiCopy} type="button">
                      <Sparkles className="size-3.5" /> AI write copy
                    </Button>
                  </div>
                  <Textarea value={page.body ?? ""} onChange={(e) => set("body", e.target.value)} />
                </div>
                <div>
                  <Label>Highlights</Label>
                  <div className="space-y-2">
                    {page.bullets.map((b, i) => (
                      <div key={i} className="flex gap-2">
                        <Input value={b} onChange={(e) => set("bullets", page.bullets.map((x, j) => (j === i ? e.target.value : x)))} />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Remove highlight"
                          onClick={() => set("bullets", page.bullets.filter((_, j) => j !== i))}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))}
                    {page.bullets.length < 8 && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => set("bullets", [...page.bullets, ""])}>
                        <Plus className="size-3.5" /> Add highlight
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Button label">
                    <Input value={page.cta_label} onChange={(e) => set("cta_label", e.target.value)} />
                  </Field>
                  <Field label="Accent colour">
                    <div className="flex gap-2">
                      <input
                        type="color"
                        aria-label="Accent colour"
                        value={/^#[0-9a-f]{6}$/i.test(page.accent) ? page.accent : "#3b7a0c"}
                        onChange={(e) => set("accent", e.target.value)}
                        className="h-10 w-12 shrink-0 cursor-pointer rounded-xl border border-line-2 bg-panel p-1"
                      />
                      <Input value={page.accent} onChange={(e) => set("accent", e.target.value)} />
                    </div>
                  </Field>
                </div>
                <div>
                  <Label>Hero image</Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="min-w-0 flex-1"
                      placeholder="https://…"
                      value={page.hero_image_url ?? ""}
                      onChange={(e) => set("hero_image_url", e.target.value)}
                    />
                    <Button type="button" variant="secondary" onClick={openPicker}>
                      <ImageIcon className="size-4" /> Library
                    </Button>
                    {page.hero_image_url && (
                      <Button type="button" variant="ghost" onClick={() => set("hero_image_url", null)}>
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                <Field label="Campaign" hint="(for attribution)">
                  <Select value={page.campaign_id ?? ""} onChange={(e) => set("campaign_id", e.target.value || null)}>
                    <option value="">None</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Success message">
                  <Input value={page.success_message} onChange={(e) => set("success_message", e.target.value)} />
                </Field>
                <Field label="Consent text">
                  <Input value={page.consent_text} onChange={(e) => set("consent_text", e.target.value)} />
                </Field>
              </fieldset>
            </Card>

            <Card>
              <CardHeader title="Form fields" description="Name and phone are recommended — they create the contact and lead." />
              <fieldset disabled={!canWrite} className="space-y-3 p-4 sm:p-5">
                {page.form_fields.map((f, i) => (
                  <div key={i} className="rounded-xl border border-line p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Input
                        aria-label="Field label"
                        value={f.label}
                        onChange={(e) => {
                          const label = e.target.value;
                          const keepName = ["name", "email", "phone", "message"].includes(f.name);
                          updateField(i, {
                            label,
                            name: keepName ? f.name : fieldName(label, page.form_fields.filter((_, j) => j !== i).map((x) => x.name)),
                          });
                        }}
                      />
                      <Select aria-label="Field type" value={f.type} onChange={(e) => updateField(i, { type: e.target.value as FormField["type"] })}>
                        {FIELD_TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </Select>
                    </div>
                    {f.type === "select" && (
                      <Input
                        className="mt-2"
                        placeholder="Options, comma separated"
                        value={(f.options ?? []).join(", ")}
                        onChange={(e) => updateField(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                      />
                    )}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <Toggle checked={f.required} onChange={(v) => updateField(i, { required: v })} label="Required" />
                        <span className="font-mono text-[11px] text-faint">{f.name}</span>
                      </div>
                      <div className="flex">
                        <Button type="button" size="icon" variant="ghost" aria-label="Move up" onClick={() => moveField(i, -1)}>
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" aria-label="Move down" onClick={() => moveField(i, 1)}>
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Remove field"
                          onClick={() => set("form_fields", page.form_fields.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {page.form_fields.length < 12 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      set("form_fields", [
                        ...page.form_fields,
                        { name: fieldName("New field", page.form_fields.map((x) => x.name)), label: "New field", type: "text", required: false },
                      ])
                    }
                  >
                    <Plus className="size-3.5" /> Add field
                  </Button>
                )}
              </fieldset>
            </Card>

            <Card>
              <CardHeader title="Share" description={saved?.status === "published" ? "Your page is live." : "Publish the page to make this link work."} />
              <div className="space-y-3 p-4 sm:p-5">
                <div className="flex gap-2">
                  <Input readOnly value={publicUrl} />
                  <Button type="button" size="icon" variant="secondary" aria-label="Copy URL" onClick={() => copy(publicUrl)}>
                    <Copy className="size-4" />
                  </Button>
                  {saved?.status === "published" && (
                    <a href={publicUrl} target="_blank" rel="noreferrer" aria-label="Open page" className="grid size-9 shrink-0 place-items-center rounded-xl border border-line-2 hover:text-brand-ink">
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </div>
                <p className="pt-1 text-xs font-medium text-muted">UTM link builder</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input aria-label="utm_source" placeholder="source" value={utm.source} onChange={(e) => setUtm((u) => ({ ...u, source: e.target.value }))} />
                  <Input aria-label="utm_medium" placeholder="medium" value={utm.medium} onChange={(e) => setUtm((u) => ({ ...u, medium: e.target.value }))} />
                  <Input aria-label="utm_campaign" placeholder="campaign" value={utm.campaign} onChange={(e) => setUtm((u) => ({ ...u, campaign: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <Input readOnly value={utmUrl} />
                  <Button type="button" size="icon" variant="secondary" aria-label="Copy tracking link" onClick={() => copy(utmUrl)}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
            <p className="mb-2 text-xs font-medium text-muted">Live preview</p>
            <div className="max-h-[80dvh] overflow-y-auto rounded-3xl border border-line shadow-soft">
              <LandingView page={{ ...page, business: workspace.name }} preview />
            </div>
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader
            title="Submissions"
            description="Each submission created a contact and a lead in the CRM."
            action={
              subs && subs.length > 0 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    downloadFile(
                      `${page.slug}-submissions.csv`,
                      toCSV(
                        subs.map((s) => ({
                          submitted_at: s.created_at,
                          ...Object.fromEntries(fieldKeys.map((k) => [k, s.data?.[k] ?? ""])),
                          utm_source: s.utm?.utm_source ?? "",
                          utm_medium: s.utm?.utm_medium ?? "",
                          utm_campaign: s.utm?.utm_campaign ?? "",
                        })),
                      ),
                    )
                  }
                >
                  <Download className="size-3.5" /> CSV
                </Button>
              ) : undefined
            }
          />
          {!subs ? (
            <LoadingBlock />
          ) : subs.length === 0 ? (
            <EmptyState title="No submissions yet" description="Share your page link to start collecting enquiries." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    {fieldKeys.map((k) => (
                      <th key={k} className="px-4 py-2 font-medium capitalize">
                        {k.replace(/_/g, " ")}
                      </th>
                    ))}
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 font-medium">Lead</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {subs.map((s) => (
                    <tr key={s.id} className="align-top">
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted">{formatDate(s.created_at)}</td>
                      {fieldKeys.map((k) => (
                        <td key={k} className="max-w-56 px-4 py-2.5 break-words">
                          {String(s.data?.[k] ?? "")}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-xs text-muted">
                        {[s.utm?.utm_source, s.utm?.utm_medium, s.utm?.utm_campaign].filter(Boolean).join(" / ") || "direct"}
                      </td>
                      <td className="px-4 py-2.5">
                        {s.lead_id ? (
                          <Link href="/app/crm" className="text-brand-ink hover:underline">
                            View
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Modal open={picker} onClose={() => setPicker(false)} title="Choose from media library" wide>
        {!media ? (
          <LoadingBlock />
        ) : media.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="No images yet"
            description="Upload images in the media library first."
            action={
              <Link href="/app/media" className="text-sm text-brand-ink hover:underline">
                Open media library
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {media.map((m) => (
              <button key={m.id} onClick={() => pickMedia(m)} className="overflow-hidden rounded-xl border border-line text-left hover:border-brand">
                {m.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumb} alt={m.file_name} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="grid aspect-square place-items-center bg-panel-2">
                    <ImageIcon className="size-6 text-faint" />
                  </div>
                )}
                <p className="truncate px-2 py-1 text-[11px] text-muted">{m.file_name}</p>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
