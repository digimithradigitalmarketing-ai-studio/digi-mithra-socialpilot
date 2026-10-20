"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Eye, FileStack, LayoutTemplate, MousePointerClick, Plus, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, type Tone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, errMsg, slugify, timeAgo } from "@/lib/utils";
import type { FormField, LandingPage } from "@/lib/types";

const BASE_FIELDS: FormField[] = [
  { name: "name", label: "Full name", type: "text", required: true },
  { name: "phone", label: "Phone", type: "tel", required: true },
  { name: "email", label: "Email", type: "email", required: false },
];

const TEMPLATES: {
  id: string;
  name: string;
  tint: string;
  title: string;
  headline: string;
  subheadline: string;
  bullets: string[];
  cta: string;
  fields: FormField[];
}[] = [
  {
    id: "gym",
    name: "Gym membership offer",
    tint: "tint-blue",
    title: "Membership offer",
    headline: "Get fit with expert trainers — join this month",
    subheadline: "Limited-period membership offer. Leave your details and our team will call you with the best plan.",
    bullets: ["Certified personal trainers", "Modern equipment & clean studio", "Flexible morning and evening batches"],
    cta: "Claim my offer",
    fields: [...BASE_FIELDS, { name: "message", label: "Your fitness goal", type: "textarea", required: false }],
  },
  {
    id: "trial",
    name: "Free trial class",
    tint: "tint-green",
    title: "Free trial class",
    headline: "Book your free trial class",
    subheadline: "Experience a session before you decide. No commitment.",
    bullets: ["One complimentary session", "Meet the coach", "Get a personalised plan"],
    cta: "Book free trial",
    fields: [...BASE_FIELDS, { name: "preferred_time", label: "Preferred time", type: "select", required: false, options: ["Morning", "Afternoon", "Evening"] }],
  },
  {
    id: "event",
    name: "Wedding / event enquiry",
    tint: "tint-rose",
    title: "Event enquiry",
    headline: "Let's make your big day unforgettable",
    subheadline: "Tell us about your event and we'll share packages and availability.",
    bullets: ["Photography & films", "Experienced crew", "Packages for every budget"],
    cta: "Check availability",
    fields: [
      ...BASE_FIELDS,
      { name: "event_date", label: "Event date", type: "date", required: false },
      { name: "event_type", label: "Event type", type: "select", required: false, options: ["Wedding", "Corporate", "Birthday", "Other"] },
      { name: "message", label: "Tell us more", type: "textarea", required: false },
    ],
  },
  {
    id: "generic",
    name: "Generic enquiry",
    tint: "tint-violet",
    title: "Enquiry",
    headline: "Talk to our team",
    subheadline: "Send us your details and we'll get back to you shortly.",
    bullets: [],
    cta: "Send enquiry",
    fields: [...BASE_FIELDS, { name: "message", label: "Message", type: "textarea", required: false }],
  },
];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,60}$/;
const randomSuffix = () => Math.random().toString(36).slice(2, 6);
const statusTone: Record<string, Tone> = { draft: "gray", published: "green", archived: "yellow" };

export default function LandingPagesPage() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const { workspace, can } = useApp();
  const [pages, setPages] = useState<LandingPage[] | null>(null);
  const [open, setOpen] = useState(false);
  const [tpl, setTpl] = useState(TEMPLATES[0].id);
  const [title, setTitle] = useState(TEMPLATES[0].title);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const canWrite = can("write_content");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("landing_pages").select("*").eq("workspace_id", workspace.id).order("updated_at", { ascending: false });
    if (error) toast(errMsg(error), "error");
    setPages((data ?? []) as LandingPage[]);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    setPages(null);
    load();
  }, [load]);

  const openNew = () => {
    const t = TEMPLATES[0];
    setTpl(t.id);
    setTitle(t.title);
    setSlug(`${slugify(`${workspace.name} ${t.title}`).slice(0, 50)}-${randomSuffix()}`);
    setOpen(true);
  };

  const pickTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)!;
    setTpl(id);
    setTitle(t.title);
    setSlug(`${slugify(`${workspace.name} ${t.title}`).slice(0, 50)}-${randomSuffix()}`);
  };

  const create = async () => {
    const s = slug.trim().toLowerCase();
    if (!SLUG_RE.test(s)) return toast("Slug: 3-61 lowercase letters, numbers or dashes, starting with a letter or number.", "error");
    const t = TEMPLATES.find((x) => x.id === tpl)!;
    setBusy(true);
    const { data, error } = await supabase
      .from("landing_pages")
      .insert({
        tenant_id: workspace.tenant_id,
        workspace_id: workspace.id,
        slug: s,
        title: title.trim() || t.title,
        headline: t.headline,
        subheadline: t.subheadline,
        bullets: t.bullets,
        cta_label: t.cta,
        form_fields: t.fields,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) return toast(error.code === "23505" ? "That URL slug is taken — try another." : errMsg(error), "error");
    setOpen(false);
    router.push(`/app/landing-pages/${data.id}`);
  };

  const copyLink = async (s: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/p/${s}`);
      toast("Link copied");
    } catch {
      toast("Couldn't copy the link", "error");
    }
  };

  if (!pages) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Landing pages"
        description="Lead-capture pages: every submission becomes a contact and a lead, and triggers your automations."
        actions={
          canWrite && (
            <Button onClick={openNew}>
              <Plus className="size-4" /> New landing page
            </Button>
          )
        }
      />

      {pages.length === 0 ? (
        <Card>
          <EmptyState
            icon={LayoutTemplate}
            title="No landing pages yet"
            description="Create a page for an offer, trial class or event and share the link in your bio, ads and WhatsApp."
            action={canWrite && <Button onClick={openNew}>Create your first page</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pages.map((p) => {
            const conv = p.views > 0 ? Math.round((p.submissions / p.views) * 1000) / 10 : 0;
            return (
              <Card key={p.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/app/landing-pages/${p.id}`} className="min-w-0 font-semibold hover:text-brand-ink">
                    <span className="line-clamp-2 break-words">{p.title}</span>
                  </Link>
                  <Badge tone={statusTone[p.status]}>{p.status}</Badge>
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted">
                  <span className="truncate">/p/{p.slug}</span>
                  <button aria-label="Copy link" onClick={() => copyLink(p.slug)} className="shrink-0 rounded p-1 hover:bg-panel-2 hover:text-ink">
                    <Copy className="size-3.5" />
                  </button>
                  {p.status === "published" && (
                    <a aria-label="Open page" href={`/p/${p.slug}`} target="_blank" rel="noreferrer" className="shrink-0 rounded p-1 hover:bg-panel-2 hover:text-ink">
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    { icon: Eye, label: "Views", v: p.views },
                    { icon: Send, label: "Submits", v: p.submissions },
                    { icon: MousePointerClick, label: "Conv.", v: `${conv}%` },
                  ].map((m) => (
                    <div key={m.label} className="rounded-xl bg-panel-2 px-2 py-2">
                      <m.icon className="mx-auto size-4 text-brand-ink" />
                      <p className="mt-1 text-sm font-semibold tabular-nums">{m.v}</p>
                      <p className="text-[10px] text-faint">{m.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-faint">
                  <span>Updated {timeAgo(p.updated_at)}</span>
                  <Link href={`/app/landing-pages/${p.id}`} className="font-medium text-brand-ink hover:underline">
                    {canWrite ? "Edit" : "View"} →
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New landing page"
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={create}>
              Create & edit
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">Pick a template — everything is editable afterwards.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => pickTemplate(t.id)}
              className={cn(
                "rounded-2xl border p-4 text-left transition-colors",
                t.tint,
                tpl === t.id ? "border-brand ring-2 ring-brand/30" : "border-line hover:border-brand/40",
              )}
            >
              <FileStack className="size-5 text-brand-ink" />
              <p className="mt-2 text-sm font-semibold">{t.name}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.headline}</p>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Page title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="URL slug" hint="(/p/…)">
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
