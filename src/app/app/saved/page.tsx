"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, Copy, Download, PenSquare, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, EmptyState, Input, LoadingBlock, PageHeader, Tabs, type Tone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { downloadFile, errMsg, formatDate, toCSV } from "@/lib/utils";
import type { SavedItem } from "@/lib/types";

type Filter = "all" | SavedItem["kind"];
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "idea", label: "Ideas" },
  { value: "hook", label: "Hooks" },
  { value: "caption", label: "Captions" },
  { value: "script", label: "Scripts" },
  { value: "post", label: "Posts" },
  { value: "chat", label: "Chat" },
  { value: "other", label: "Other" },
];
const KIND_TONE: Record<string, Tone> = { idea: "yellow", hook: "purple", caption: "blue", script: "green", post: "blue", chat: "gray", source: "gray", other: "gray" };

export default function SavedPage() {
  const supabase = createClient();
  const router = useRouter();
  const { workspace, can } = useApp();
  const toast = useToast();
  const [items, setItems] = useState<SavedItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("saved_items").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(500);
    if (error) toast(errMsg(error), "error");
    setItems((data ?? []) as SavedItem[]);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length ?? 0 };
    for (const i of items ?? []) {
      const k = i.kind === "source" ? "other" : i.kind;
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (items ?? []).filter((i) => {
      const kind = i.kind === "source" ? "other" : i.kind;
      if (filter !== "all" && kind !== filter) return false;
      return !term || i.title.toLowerCase().includes(term) || i.content.toLowerCase().includes(term);
    });
  }, [items, filter, q]);

  const remove = async (i: SavedItem) => {
    const { error } = await supabase.from("saved_items").delete().eq("id", i.id);
    if (error) return toast(errMsg(error), "error");
    setItems((all) => (all ?? []).filter((x) => x.id !== i.id));
  };

  const exportCSV = () =>
    downloadFile(
      `saved-${workspace.slug}.csv`,
      toCSV(shown.map((i) => ({ kind: i.kind, title: i.title, content: i.content, saved_at: i.created_at }))),
    );

  if (!items) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Saved"
        description="Everything you bookmarked from Ideas, Write and Chat."
        actions={
          items.length > 0 && (
            <Button variant="secondary" onClick={exportCSV}>
              <Download className="size-4" /> Export
            </Button>
          )
        }
      />

      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={FILTERS.map((f) => ({ value: f.value, label: `${f.label}${counts[f.value] ? ` (${counts[f.value]})` : ""}` }))}
      />

      <div className="relative mb-5 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search saved items…" className="pl-9" />
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bookmark}
            title={items.length ? "Nothing matches" : "No saved items yet"}
            description={items.length ? "Try another filter or search." : "Tap the bookmark icon on ideas, hooks, captions, scripts or chat answers to keep them here."}
          />
        </Card>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
          {shown.map((i) => (
            <Card key={i.id} className="mb-4 break-inside-avoid p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge tone={KIND_TONE[i.kind] ?? "gray"}>{i.kind}</Badge>
                <span className="text-[11px] text-faint">{formatDate(i.created_at, { day: "numeric", month: "short" })}</span>
              </div>
              <p className="font-semibold">{i.title}</p>
              {i.content && <p className="mt-1.5 line-clamp-6 text-sm whitespace-pre-wrap text-muted">{i.content}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigator.clipboard.writeText(i.content || i.title).then(() => toast("Copied"))}
                >
                  <Copy className="size-3.5" /> Copy
                </Button>
                {can("write_content") && (
                  <Button size="sm" variant="ghost" onClick={() => router.push(`/app/compose?draft=${encodeURIComponent(i.content || i.title)}`)}>
                    <PenSquare className="size-3.5" /> Use
                  </Button>
                )}
                {can("support") && (
                  <Button size="sm" variant="ghost" className="ml-auto" aria-label="Delete" onClick={() => remove(i)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
