"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Filter, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, EmptyState, Field, Input, Label, LoadingBlock, Modal, PageHeader, Textarea, Toggle } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, downloadFile, errMsg, formatDate, toCSV } from "@/lib/utils";
import type { Contact, Segment, SegmentRules } from "@/lib/types";

type Lite = Pick<Contact, "id" | "name" | "email" | "phone" | "tags" | "source" | "marketing_consent" | "created_at">;

/** Mirrors public.segment_contacts so the preview needs no save. */
function matches(c: Lite, r: SegmentRules) {
  if (r.tags_any?.length && !c.tags.some((t) => r.tags_any!.includes(t))) return false;
  if (r.sources?.length && !(c.source && r.sources.includes(c.source))) return false;
  if (r.consent === "opted_in" && !c.marketing_consent) return false;
  if (r.has_email && !c.email) return false;
  if (r.created_within_days && new Date(c.created_at).getTime() <= Date.now() - r.created_within_days * 86400000) return false;
  return true;
}

function ruleChips(r: SegmentRules) {
  const chips: string[] = [];
  if (r.tags_any?.length) chips.push(`Tags: ${r.tags_any.join(", ")}`);
  if (r.sources?.length) chips.push(`Source: ${r.sources.join(", ")}`);
  if (r.consent === "opted_in") chips.push("Opted in");
  if (r.has_email) chips.push("Has email");
  if (r.created_within_days) chips.push(`Added in last ${r.created_within_days}d`);
  return chips.length ? chips : ["All contacts"];
}

interface Draft {
  id?: string;
  name: string;
  description: string;
  rules: SegmentRules;
}

export default function SegmentsPage() {
  const supabase = createClient();
  const toast = useToast();
  const { workspace, can } = useApp();
  const canWrite = can("write_content");

  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [contacts, setContacts] = useState<Lite[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<{ seg: Segment; members: Contact[] | null } | null>(null);

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([
      supabase.from("segments").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
      supabase
        .from("contacts")
        .select("id,name,email,phone,tags,source,marketing_consent,created_at")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);
    if (s.error) toast(errMsg(s.error), "error");
    const segs = (s.data ?? []) as Segment[];
    setSegments(segs);
    setContacts((c.data ?? []) as Lite[]);
    const entries = await Promise.all(
      segs.map(async (seg) => {
        const { count } = await supabase.rpc("segment_contacts", { p_segment: seg.id }, { count: "exact", head: true });
        return [seg.id, count ?? 0] as const;
      }),
    );
    setCounts(Object.fromEntries(entries));
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    setSegments(null);
    load();
  }, [load]);

  const allTags = useMemo(() => [...new Set(contacts.flatMap((c) => c.tags ?? []))].sort(), [contacts]);
  const allSources = useMemo(() => [...new Set(contacts.map((c) => c.source).filter(Boolean) as string[])].sort(), [contacts]);
  const preview = useMemo(() => (draft ? contacts.filter((c) => matches(c, draft.rules)) : []), [draft, contacts]);

  const setRules = (patch: Partial<SegmentRules>) => draft && setDraft({ ...draft, rules: { ...draft.rules, ...patch } });

  const addTag = (t: string) => {
    const tag = t.trim();
    if (!tag || !draft) return;
    const cur = draft.rules.tags_any ?? [];
    if (!cur.includes(tag)) setRules({ tags_any: [...cur, tag] });
    setTagInput("");
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return toast("Give the segment a name", "error");
    setSaving(true);
    const rules: SegmentRules = {
      ...(draft.rules.tags_any?.length ? { tags_any: draft.rules.tags_any } : {}),
      ...(draft.rules.sources?.length ? { sources: draft.rules.sources } : {}),
      consent: draft.rules.consent ?? "any",
      ...(draft.rules.has_email ? { has_email: true } : {}),
      ...(draft.rules.created_within_days ? { created_within_days: draft.rules.created_within_days } : {}),
    };
    const row = { name: draft.name.trim(), description: draft.description.trim() || null, rules };
    const { error } = draft.id
      ? await supabase.from("segments").update(row).eq("id", draft.id)
      : await supabase.from("segments").insert({ ...row, tenant_id: workspace.tenant_id, workspace_id: workspace.id });
    setSaving(false);
    if (error) return toast(errMsg(error), "error");
    toast(draft.id ? "Segment updated" : "Segment created");
    setDraft(null);
    load();
  };

  const remove = async (seg: Segment) => {
    if (!confirm(`Delete segment "${seg.name}"? Contacts are not deleted.`)) return;
    const { error } = await supabase.from("segments").delete().eq("id", seg.id);
    if (error) return toast(errMsg(error), "error");
    load();
  };

  const openDetail = async (seg: Segment) => {
    setDetail({ seg, members: null });
    const { data, error } = await supabase.rpc("segment_contacts", { p_segment: seg.id }).range(0, 4999);
    if (error) toast(errMsg(error), "error");
    setDetail({ seg, members: (data ?? []) as Contact[] });
  };

  const exportMembers = () => {
    if (!detail?.members) return;
    downloadFile(
      `${detail.seg.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-contacts.csv`,
      toCSV(
        detail.members.map((m) => ({
          name: m.name,
          email: m.email ?? "",
          phone: m.phone ?? "",
          source: m.source ?? "",
          tags: m.tags,
          marketing_consent: m.marketing_consent,
          created_at: m.created_at,
        })),
      ),
    );
  };

  return (
    <div>
      <PageHeader
        title="Segments"
        description="Group contacts by tags, source and consent to target emails and campaigns."
        actions={
          canWrite && (
            <Button onClick={() => setDraft({ name: "", description: "", rules: { consent: "any" } })}>
              <Plus className="size-4" /> New segment
            </Button>
          )
        }
      />

      {segments === null ? (
        <LoadingBlock />
      ) : segments.length === 0 ? (
        <Card>
          <EmptyState
            icon={Filter}
            title="No segments yet"
            description="Create segments like “Opted-in members”, “Instagram leads this month” or “Wedding enquiries”."
            action={
              canWrite && (
                <Button onClick={() => setDraft({ name: "Opted-in with email", description: "", rules: { consent: "opted_in", has_email: true } })}>
                  <Plus className="size-4" /> Create first segment
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {segments.map((seg, i) => (
            <Card key={seg.id} className="flex flex-col p-0">
              <button onClick={() => openDetail(seg)} className={cn("rounded-t-2xl p-4 text-left", ["tint-blue", "tint-green", "tint-violet", "tint-amber", "tint-rose", "tint-sky"][i % 6])}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{seg.name}</p>
                  <span className="flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-xs font-semibold">
                    <Users className="size-3.5" /> {counts[seg.id] ?? "…"}
                  </span>
                </div>
                {seg.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{seg.description}</p>}
              </button>
              <div className="flex flex-1 flex-wrap content-start gap-1.5 p-4">
                {ruleChips(seg.rules).map((c) => (
                  <Badge key={c} tone="gray">
                    {c}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-line px-4 py-2">
                <span className="text-xs text-faint">Created {formatDate(seg.created_at, { day: "numeric", month: "short" })}</span>
                {canWrite && (
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Edit"
                      onClick={() => setDraft({ id: seg.id, name: seg.name, description: seg.description ?? "", rules: seg.rules ?? {} })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(seg)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit segment" : "New segment"}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={save}>
              Save segment
            </Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              <Field label="Name">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Opted-in members" />
              </Field>
              <Field label="Description">
                <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="min-h-16" />
              </Field>
              <div>
                <Label hint="(any of)">Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(draft.rules.tags_any ?? []).map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand-ink">
                      {t}
                      <button aria-label={`Remove ${t}`} onClick={() => setRules({ tags_any: (draft.rules.tags_any ?? []).filter((x) => x !== t) })}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <Input
                  className="mt-2"
                  list="segment-tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  placeholder="Type a tag and press Enter"
                />
                <datalist id="segment-tags">
                  {allTags.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                {allTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {allTags
                      .filter((t) => !(draft.rules.tags_any ?? []).includes(t))
                      .slice(0, 12)
                      .map((t) => (
                        <button key={t} onClick={() => addTag(t)} className="rounded-full border border-line-2 px-2 py-0.5 text-xs text-muted hover:text-brand-ink">
                          + {t}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <div>
                <Label>Sources</Label>
                {allSources.length === 0 ? (
                  <p className="text-xs text-faint">No contact sources yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {allSources.map((s) => {
                      const on = (draft.rules.sources ?? []).includes(s);
                      return (
                        <button
                          key={s}
                          onClick={() => setRules({ sources: on ? (draft.rules.sources ?? []).filter((x) => x !== s) : [...(draft.rules.sources ?? []), s] })}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs",
                            on ? "border-brand bg-brand/10 text-brand-ink" : "border-line-2 text-muted hover:text-ink",
                          )}
                        >
                          {s.replace(/_/g, " ")}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <Toggle
                  checked={draft.rules.consent === "opted_in"}
                  onChange={(v) => setRules({ consent: v ? "opted_in" : "any" })}
                  label="Only contacts who opted in to marketing"
                />
                <Toggle checked={!!draft.rules.has_email} onChange={(v) => setRules({ has_email: v })} label="Has an email address" />
              </div>
              <Field label="Added within the last N days" hint="(optional)">
                <Input
                  type="number"
                  min={1}
                  value={draft.rules.created_within_days ?? ""}
                  onChange={(e) => setRules({ created_within_days: e.target.value ? Math.max(1, parseInt(e.target.value, 10)) : undefined })}
                  placeholder="e.g. 30"
                />
              </Field>
            </div>
            <div className="rounded-2xl border border-line bg-panel-2 p-4">
              <p className="text-xs font-medium text-muted">Live preview</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{preview.length}</p>
              <p className="text-xs text-faint">matching contacts{contacts.length >= 2000 ? " (preview of latest 2,000)" : ""}</p>
              <div className="mt-3 divide-y divide-line">
                {preview.slice(0, 10).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-faint">{c.email || c.phone || "No contact details"}</span>
                    </span>
                    {c.marketing_consent && <Badge tone="green">opted in</Badge>}
                  </div>
                ))}
                {preview.length === 0 && <p className="py-6 text-center text-sm text-muted">No contacts match these rules.</p>}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.seg.name ?? "Segment"}
        wide
        footer={
          <Button variant="secondary" onClick={exportMembers} disabled={!detail?.members?.length}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      >
        {!detail?.members ? (
          <LoadingBlock />
        ) : detail.members.length === 0 ? (
          <EmptyState icon={Users} title="No contacts in this segment" />
        ) : (
          <div>
            <p className="mb-2 text-sm text-muted">{detail.members.length} contact(s)</p>
            <div className="divide-y divide-line">
              {detail.members.map((m) => (
                <div key={m.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-faint">{[m.email, m.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {m.source && <Badge tone="blue">{m.source.replace(/_/g, " ")}</Badge>}
                    {m.marketing_consent ? <Badge tone="green">opted in</Badge> : <Badge tone="gray">no consent</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
