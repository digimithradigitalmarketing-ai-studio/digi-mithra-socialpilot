"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Dumbbell, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, Field, LoadingBlock, Modal, PageHeader, Select, Input, Textarea } from "@/components/ui";
import { errMsg } from "@/lib/utils";

type Category = "about" | "offerings" | "hours" | "locations" | "faq" | "tone" | "forbidden" | "disclaimer";

const CATEGORIES: { id: Category; name: string; desc: string }[] = [
  { id: "about", name: "About", desc: "Who you are, story, what makes you different." },
  { id: "offerings", name: "Offerings & prices", desc: "Services, packages, memberships and prices." },
  { id: "hours", name: "Hours", desc: "Opening hours, holidays, batch timings." },
  { id: "locations", name: "Locations", desc: "Addresses, landmarks, parking, contact numbers." },
  { id: "faq", name: "FAQ", desc: "Common questions with approved answers." },
  { id: "tone", name: "Tone of voice", desc: "How you sound: words to use, emoji style." },
  { id: "forbidden", name: "Forbidden claims", desc: "Things AI must never say or promise." },
  { id: "disclaimer", name: "Disclaimers", desc: "Legal/health disclaimers to include when relevant." },
];

interface Entry {
  id: string;
  category: Category;
  title: string;
  content: string;
  created_at: string;
}

const GYM_TEMPLATE: { category: Category; title: string; content: string }[] = [
  { category: "about", title: "About us", content: "[Edit] We are a friendly neighbourhood fitness studio offering strength, HIIT, yoga and personal training with certified coaches." },
  { category: "offerings", title: "Membership plans", content: "[Edit] Monthly: INR 1,500 · Quarterly: INR 4,000 · Annual: INR 14,000. Personal training add-on from INR 6,000/month. First trial class free." },
  { category: "hours", title: "Timings", content: "[Edit] Mon–Sat 5:30 AM – 10:00 PM, Sunday 7:00 AM – 12:00 PM. Closed on national holidays." },
  { category: "locations", title: "Main branch", content: "[Edit] Full address, nearby landmark, parking availability, phone/WhatsApp number." },
  { category: "faq", title: "Do you offer a trial?", content: "[Edit] Yes, one free trial class. Please book by WhatsApp or at the front desk." },
  { category: "tone", title: "Brand voice", content: "Energetic, encouraging and inclusive. Short sentences. Up to 2 emojis. Never body-shame." },
  { category: "forbidden", title: "No guaranteed results", content: "Never promise specific weight loss, medical outcomes or 'guaranteed' transformations. Do not give medical advice." },
  { category: "disclaimer", title: "Health disclaimer", content: "Consult your doctor before starting a new exercise programme, especially if you have a medical condition." },
];

export default function KnowledgePage() {
  const supabase = createClient();
  const toast = useToast();
  const { workspace, can } = useApp();
  const canEdit = can("write_content");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Entry> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("brand_knowledge")
      .select("id,category,title,content,created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at");
    if (error) toast(errMsg(error), "error");
    setEntries((data ?? []) as Entry[]);
    setLoading(false);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!editing?.title?.trim() || !editing.content?.trim() || !editing.category) {
      toast("Title and content are required", "info");
      return;
    }
    setSaving(true);
    const payload = { category: editing.category, title: editing.title.trim(), content: editing.content.trim() };
    const { error } = editing.id
      ? await supabase.from("brand_knowledge").update(payload).eq("id", editing.id)
      : await supabase.from("brand_knowledge").insert({ ...payload, tenant_id: workspace.tenant_id, workspace_id: workspace.id });
    setSaving(false);
    if (error) return toast(errMsg(error), "error");
    toast(editing.id ? "Entry updated" : "Entry added");
    setEditing(null);
    load();
  };

  const remove = async (e: Entry) => {
    if (!confirm(`Delete "${e.title}"?`)) return;
    const { error } = await supabase.from("brand_knowledge").delete().eq("id", e.id);
    if (error) return toast(errMsg(error), "error");
    toast("Entry deleted");
    load();
  };

  const addTemplate = async () => {
    const { error } = await supabase
      .from("brand_knowledge")
      .insert(GYM_TEMPLATE.map((t) => ({ ...t, tenant_id: workspace.tenant_id, workspace_id: workspace.id })));
    if (error) return toast(errMsg(error), "error");
    toast("Gym template added — edit the [Edit] entries with your real details");
    load();
  };

  const filled = CATEGORIES.filter((c) => entries.some((e) => e.category === c.id)).length;

  return (
    <div>
      <PageHeader
        title="Brand knowledge"
        description="Facts the AI writer and inbox assistant use. AI never invents facts outside this list."
        actions={
          canEdit && (
            <>
              <Button variant="secondary" onClick={addTemplate}>
                <Dumbbell className="size-4" /> Add gym template
              </Button>
              <Button onClick={() => setEditing({ category: "about", title: "", content: "" })}>
                <Plus className="size-4" /> Add entry
              </Button>
            </>
          )
        }
      />

      <Card className="mb-5 p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted">Knowledge completeness</span>
          <span className="font-medium">
            {filled} / {CATEGORIES.length} categories
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-brand" style={{ width: `${(filled / CATEGORIES.length) * 100}%` }} />
        </div>
        {filled < CATEGORIES.length && (
          <p className="mt-2 text-xs text-faint">
            Missing: {CATEGORIES.filter((c) => !entries.some((e) => e.category === c.id)).map((c) => c.name).join(", ")}
          </p>
        )}
      </Card>

      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {CATEGORIES.map((c) => {
            const list = entries.filter((e) => e.category === c.id);
            return (
              <Card key={c.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {c.name} <Badge tone={list.length ? "green" : "gray"}>{list.length}</Badge>
                    </span>
                  }
                  description={c.desc}
                  action={
                    canEdit && (
                      <Button size="icon" variant="ghost" aria-label={`Add ${c.name}`} onClick={() => setEditing({ category: c.id, title: "", content: "" })}>
                        <Plus className="size-4" />
                      </Button>
                    )
                  }
                />
                {list.length === 0 ? (
                  <p className="flex items-center gap-2 px-5 py-6 text-sm text-faint">
                    <BookOpen className="size-4" /> No entries yet
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {list.map((e) => (
                      <li key={e.id} className="group px-4 py-3 sm:px-5">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{e.title}</p>
                            <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{e.content}</p>
                          </div>
                          {canEdit && (
                            <div className="flex shrink-0 gap-1">
                              <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEditing(e)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(e)}>
                                <Trash2 className="size-4 text-red-300" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit entry" : "New entry"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Category">
              <Select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as Category })}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title">
              <Input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </Field>
            <Field label="Content">
              <Textarea rows={6} value={editing.content ?? ""} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
