"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Film, Image as ImageIcon, Search, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Button, Card, EmptyState, Input, LoadingBlock, PageHeader } from "@/components/ui";
import { useToast } from "@/components/toast";
import type { MediaAsset } from "@/lib/types";
import { cn, errMsg, timeAgo } from "@/lib/utils";

function formatBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const safeName = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);

export default function MediaPage() {
  const supabase = createClient();
  const toast = useToast();
  const { workspace, tenant, can } = useApp();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(0);
  const [drag, setDrag] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const write = can("write_content");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("media_assets")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });
    if (error) toast(errMsg(error), "error");
    const list = (data ?? []) as MediaAsset[];
    setAssets(list);
    if (list.length) {
      const { data: signed } = await supabase.storage.from("media").createSignedUrls(
        list.map((a) => a.storage_path),
        3600,
      );
      const map: Record<string, string> = {};
      (signed ?? []).forEach((s: { path: string | null; signedUrl: string }) => {
        if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
      });
      setUrls(map);
    } else setUrls({});
    setLoading(false);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!list.length) return toast("Only images and videos are supported", "error");
    setUploading(list.length);
    let ok = 0;
    for (const f of list) {
      if (f.size > 50 * 1024 * 1024) {
        toast(`${f.name} is larger than 50 MB`, "error");
        setUploading((n) => n - 1);
        continue;
      }
      const path = `${tenant.id}/${workspace.id}/${crypto.randomUUID()}-${safeName(f.name)}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, f, { contentType: f.type, upsert: false });
      if (upErr) {
        toast(`${f.name}: ${errMsg(upErr)}`, "error");
      } else {
        const { error } = await supabase.from("media_assets").insert({
          tenant_id: tenant.id,
          workspace_id: workspace.id,
          storage_path: path,
          file_name: f.name,
          mime_type: f.type,
          size_bytes: f.size,
        });
        if (error) {
          await supabase.storage.from("media").remove([path]);
          toast(errMsg(error), "error");
        } else ok++;
      }
      setUploading((n) => n - 1);
    }
    if (ok) toast(`${ok} file${ok > 1 ? "s" : ""} uploaded`);
    load();
  };

  const remove = async (a: MediaAsset) => {
    if (!confirm(`Delete ${a.file_name}?`)) return;
    const { error: sErr } = await supabase.storage.from("media").remove([a.storage_path]);
    if (sErr) return toast(errMsg(sErr), "error");
    const { error } = await supabase.from("media_assets").delete().eq("id", a.id).eq("workspace_id", workspace.id);
    if (error) return toast(errMsg(error), "error");
    toast("Deleted");
    setAssets((prev) => prev.filter((x) => x.id !== a.id));
  };

  const copyLink = async (a: MediaAsset) => {
    const { data, error } = await supabase.storage.from("media").createSignedUrl(a.storage_path, 60 * 60 * 24 * 7);
    if (error || !data) return toast(errMsg(error), "error");
    try {
      await navigator.clipboard.writeText(data.signedUrl);
      toast("Link copied (valid 7 days)");
    } catch {
      toast("Could not access clipboard", "error");
    }
  };

  const filtered = assets.filter((a) => a.file_name.toLowerCase().includes(q.toLowerCase().trim()));

  return (
    <div>
      <PageHeader
        title="Media library"
        description="Private images and videos for this workspace. Links are signed and expire."
        actions={
          write && (
            <Button onClick={() => inputRef.current?.click()} loading={uploading > 0}>
              <Upload className="size-4" /> Upload
            </Button>
          )
        }
      />
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) upload(e.target.files);
          e.target.value = "";
        }}
      />

      {write && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
            drag ? "border-brand bg-brand/5" : "border-line-2 hover:border-brand/50",
          )}
        >
          <Upload className="mb-2 size-6 text-brand" />
          <p className="text-sm font-medium">{uploading > 0 ? `Uploading ${uploading}…` : "Drop images or videos here"}</p>
          <p className="text-xs text-muted">or tap to browse · up to 50 MB each</p>
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name" className="pl-9" />
      </div>

      {loading ? (
        <LoadingBlock />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={ImageIcon} title={assets.length ? "No matches" : "No media yet"} description="Upload brand photos and videos to use them in posts." />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((a) => {
            const url = urls[a.storage_path];
            const isVideo = a.mime_type?.startsWith("video/");
            return (
              <Card key={a.id} className="group overflow-hidden">
                <div className="relative aspect-square bg-bg">
                  {url && !isVideo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={a.file_name} className="size-full object-cover" loading="lazy" />
                  ) : url && isVideo ? (
                    <video src={url} className="size-full object-cover" muted playsInline preload="metadata" />
                  ) : (
                    <div className="grid size-full place-items-center text-faint">
                      <ImageIcon className="size-8" />
                    </div>
                  )}
                  {isVideo && (
                    <span className="absolute top-2 left-2 rounded-md bg-black/70 p-1">
                      <Film className="size-3.5 text-brand" />
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-xs font-medium" title={a.file_name}>
                    {a.file_name}
                  </p>
                  <p className="text-[11px] text-faint">
                    {formatBytes(a.size_bytes)} · {timeAgo(a.created_at)}
                  </p>
                  <div className="mt-2 flex gap-1">
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => copyLink(a)}>
                      <Copy className="size-3.5" /> Link
                    </Button>
                    {write && (
                      <Button size="sm" variant="danger" aria-label="Delete" onClick={() => remove(a)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
