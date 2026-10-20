"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Globe, Link2, PenLine, Plus, Upload, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { useToast } from "@/components/toast";
import { Button, Input, Select, Spinner, Textarea } from "@/components/ui";
import { Overlay } from "@/components/content-agent";
import { FORMAT_COLORS } from "@/lib/content-templates";
import type { ContentSource } from "@/lib/types";
import { cn, errMsg } from "@/lib/utils";

const PLATFORM_META: Record<string, { label: string; color: string; short: string }> = {
  instagram: { label: "Instagram", color: "#E1306C", short: "IG" },
  website: { label: "Website", color: "#64748b", short: "W" },
  linkedin: { label: "LinkedIn", color: "#0A66C2", short: "in" },
  facebook: { label: "Facebook (ads/posts)", color: "#1877F2", short: "f" },
  tiktok: { label: "TikTok Posts", color: "#111111", short: "TT" },
  youtube: { label: "YouTube", color: "#FF0000", short: "YT" },
  x: { label: "X (Twitter)", color: "#0f1419", short: "X" },
  google_drive: { label: "Google Drive", color: "#1fa463", short: "GD" },
  threads: { label: "Threads", color: "#101010", short: "@" },
};
const LINK_PLATFORMS = ["instagram", "website", "linkedin", "facebook", "tiktok", "youtube", "x", "google_drive"];
const PROFILE_URL: Record<string, (h: string) => string> = {
  instagram: (h) => `https://www.instagram.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  x: (h) => `https://x.com/${h}`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  threads: (h) => `https://www.threads.net/@${h}`,
};

function formatFor(platform: string) {
  if (platform === "youtube") return "youtube";
  if (platform === "tiktok" || platform === "instagram") return "short_form";
  if (platform === "threads" || platform === "x") return "threads";
  return "article";
}

export function PlatformDot({ platform, className }: { platform: string | null; className?: string }) {
  const m = PLATFORM_META[platform ?? ""] ?? { color: "#64748b", short: (platform ?? "?").slice(0, 2).toUpperCase() };
  return (
    <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white", className)} style={{ background: m.color }}>
      {m.short}
    </span>
  );
}

export function SourceCard({ s }: { s: ContentSource }) {
  const label = s.kind === "text" ? "Text" : s.kind === "file" ? "File" : s.kind === "profile" ? "Profile" : (PLATFORM_META[s.platform ?? ""]?.label ?? "Website");
  return (
    <div className="mb-3 break-inside-avoid overflow-hidden rounded-2xl border border-line bg-panel shadow-sm">
      <div className="flex items-center gap-1.5 px-2.5 py-2 text-[11px]">
        {s.kind === "text" ? <PenLine className="size-3.5 text-muted" /> : s.kind === "file" ? <FileText className="size-3.5 text-muted" /> : <PlatformDot platform={s.platform} className="size-4" />}
        <span className="min-w-0 flex-1 truncate text-muted">{s.title || label}</span>
        {s.url && (
          <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label="Open source" className="text-faint hover:text-brand-ink">
            <Link2 className="size-3.5" />
          </a>
        )}
      </div>
      {s.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.thumbnail_url} alt="" loading="lazy" className="aspect-[4/5] w-full object-cover" />
      ) : (
        <div
          className="flex min-h-28 items-end p-3 text-xs leading-snug text-white"
          style={{ background: `linear-gradient(160deg, ${FORMAT_COLORS[s.format ?? ""] ?? "#4b82f7"}, #1e4fd1)` }}
        >
          <span className="line-clamp-6">{s.text_content || s.description || s.title || s.url}</span>
        </div>
      )}
    </div>
  );
}

type Mode = null | "profile" | "text";

export function AddContentModal({
  open,
  onClose,
  onAdded,
  defaultFormat,
}: {
  open: boolean;
  onClose: () => void;
  onAdded?: (s: ContentSource) => void;
  defaultFormat?: string;
}) {
  const supabase = createClient();
  const { workspace } = useApp();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<ContentSource[] | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [profPlatform, setProfPlatform] = useState("instagram");
  const [handle, setHandle] = useState("");
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("content_sources").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(12);
    setSources((data ?? []) as ContentSource[]);
  }, [supabase, workspace.id]);

  useEffect(() => {
    if (open) {
      load();
      setMode(null);
    }
  }, [open, load]);

  const insert = async (row: Partial<ContentSource>) => {
    const { data, error } = await supabase
      .from("content_sources")
      .insert({ tenant_id: workspace.tenant_id, workspace_id: workspace.id, ...row })
      .select("*")
      .single();
    if (error) throw error;
    const s = data as ContentSource;
    setSources((prev) => [s, ...(prev ?? [])]);
    onAdded?.(s);
    return s;
  };

  const addLink = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const raw = url.trim();
    if (!raw) return;
    setBusy(true);
    try {
      const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const res = await fetch("/api/sources/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: withScheme }) });
      const p = await res.json();
      if (!res.ok) throw new Error(p.error || "Could not read that link");
      await insert({
        kind: "link",
        platform: p.platform,
        format: defaultFormat ?? formatFor(p.platform),
        url: p.url,
        title: p.title,
        description: p.description,
        thumbnail_url: p.image,
      });
      setUrl("");
      toast(p.title ? "Link added" : "Link saved (no preview available)");
    } catch (err) {
      toast(errMsg(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) return toast("Files must be under 50 MB", "error");
    setBusy(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
      const path = `${workspace.tenant_id}/${workspace.id}/sources/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from("media").upload(path, file, { contentType: file.type || undefined });
      if (error) throw error;
      await insert({ kind: "file", storage_path: path, title: file.name, format: defaultFormat ?? (file.type.startsWith("video") ? "short_form" : "article") });
      toast("File added");
    } catch (err) {
      toast(errMsg(err), "error");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = handle.trim().replace(/^@/, "");
    if (!h) return;
    setBusy(true);
    try {
      await insert({ kind: "profile", platform: profPlatform, url: PROFILE_URL[profPlatform]?.(h) ?? null, title: `@${h}`, format: defaultFormat ?? formatFor(profPlatform) });
      setHandle("");
      setMode(null);
      toast("Profile added");
    } catch (err) {
      toast(errMsg(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const addText = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      await insert({ kind: "text", text_content: t, title: t.split("\n")[0].slice(0, 100), format: defaultFormat ?? "article" });
      setText("");
      setMode(null);
      toast("Text added");
    } catch (err) {
      toast(errMsg(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay open={open} onClose={onClose} label="Add content" className="sm:max-w-5xl">
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="tint-blue flex flex-col justify-center rounded-3xl px-5 py-8 sm:px-10">
          <h2 className="text-center text-2xl leading-tight font-bold sm:text-3xl">
            Add Content To {workspace.name} Inspiration
          </h2>
          <p className="mt-6 text-sm text-muted">Paste a link from any of these platforms:</p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
            {LINK_PLATFORMS.map((p) => (
              <span key={p} className="flex items-center gap-2 text-xs sm:text-sm">
                {p === "website" ? (
                  <span className="grid size-6 place-items-center rounded-full border border-line-2 bg-panel">
                    <Globe className="size-3.5 text-muted" />
                  </span>
                ) : (
                  <PlatformDot platform={p} className="size-6 text-[9px]" />
                )}
                {PLATFORM_META[p].label}
              </span>
            ))}
          </div>

          <form onSubmit={addLink} className="mt-5 flex items-center gap-2 rounded-2xl border border-line-2 bg-panel p-1.5 pl-3 shadow-sm focus-within:border-brand">
            <Link2 className="size-4 shrink-0 text-faint" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter URL here..."
              inputMode="url"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
            <Button type="submit" size="sm" loading={busy && !!url} disabled={!url.trim()}>
              <Plus className="size-4" /> Add Link
            </Button>
          </form>

          <p className="my-4 text-center text-sm text-muted">Or</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="size-4" /> Upload File
            </Button>
            <Button variant="secondary" onClick={() => setMode(mode === "profile" ? null : "profile")}>
              <UserRound className="size-4" /> Social Profile
            </Button>
            <Button variant="secondary" onClick={() => setMode(mode === "text" ? null : "text")}>
              <PenLine className="size-4" /> Manual Text
            </Button>
          </div>
          <input ref={fileRef} type="file" hidden accept="image/*,video/*,application/pdf,text/plain" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />

          {mode === "profile" && (
            <form onSubmit={addProfile} className="animate-fade-up mt-4 flex flex-col gap-2 sm:flex-row">
              <Select value={profPlatform} onChange={(e) => setProfPlatform(e.target.value)} className="sm:w-40">
                {Object.keys(PROFILE_URL).map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_META[p]?.label.replace(" (ads/posts)", "").replace(" Posts", "") ?? p}
                  </option>
                ))}
              </Select>
              <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" />
              <Button type="submit" loading={busy}>
                Add
              </Button>
            </form>
          )}
          {mode === "text" && (
            <form onSubmit={addText} className="animate-fade-up mt-4 space-y-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a script, caption or notes…" />
              <div className="flex justify-end">
                <Button type="submit" loading={busy}>
                  Add text
                </Button>
              </div>
            </form>
          )}
        </div>

        <div className="relative flex max-h-[60dvh] flex-col rounded-3xl border border-line bg-panel-2 lg:max-h-[560px]">
          <div className="flex-1 overflow-y-auto p-3 pb-20">
            {sources === null ? (
              <div className="grid place-items-center py-16">
                <Spinner />
              </div>
            ) : sources.length === 0 ? (
              <p className="px-4 py-16 text-center text-sm text-muted">Your saved inspiration will appear here.</p>
            ) : (
              <div className="columns-2 gap-3">
                {sources.map((s) => (
                  <SourceCard key={s.id} s={s} />
                ))}
              </div>
            )}
          </div>
          <div className="absolute inset-x-3 bottom-3">
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
