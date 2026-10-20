"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  Check,
  Hash,
  Image as ImageIcon,
  Languages,
  Plug,
  Save,
  Send,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DemoBadge,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  Toggle,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { ProviderIcon, providerName } from "@/components/provider-badge";
import { PROVIDERS } from "@/lib/providers";
import { AiImageModal } from "@/components/ai-image-modal";
import type { ContentPost, MediaAsset, PostTarget, Provider, SocialAccount } from "@/lib/types";
import { cn, errMsg, toLocalInput } from "@/lib/utils";

interface Campaign {
  id: string;
  name: string;
}

type AiKind = "caption" | "improve" | "hashtags" | "translate";

function parseTags(s: string) {
  return Array.from(
    new Set(
      s
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, ""))
        .filter(Boolean),
    ),
  ).slice(0, 30);
}

function fullText(body: string, tags: string[]) {
  return tags.length ? `${body.trim()}\n\n${tags.map((t) => `#${t}`).join(" ")}` : body.trim();
}

function ComposeInner() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");
  const { workspace, tenant, can } = useApp();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [existing, setExisting] = useState<ContentPost | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState(() => (editId ? "" : (params.get("draft") ?? "")));
  const [tagInput, setTagInput] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [customOpen, setCustomOpen] = useState<Record<string, boolean>>({});
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState(() => (editId ? "" : (params.get("campaign") ?? "")));
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [saving, setSaving] = useState<null | "draft" | "schedule" | "now">(null);
  const [aiBusy, setAiBusy] = useState<AiKind | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [aiImageOpen, setAiImageOpen] = useState(false);
  const [language, setLanguage] = useState("Hindi");
  const [tone, setTone] = useState("friendly");

  const tags = useMemo(() => parseTags(tagInput), [tagInput]);
  const writable = can("write_content");

  const load = useCallback(async () => {
    setLoading(true);
    const [acc, camp, med] = await Promise.all([
      supabase.from("social_accounts").select("*").eq("workspace_id", workspace.id).eq("status", "connected").order("created_at"),
      supabase.from("campaigns").select("id,name").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
      supabase.from("media_assets").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(60),
    ]);
    if (acc.error) toast(errMsg(acc.error), "error");
    const accs = ((acc.data ?? []) as SocialAccount[]).filter((a) => a.capabilities?.can_publish);
    setAccounts(accs);
    setCampaigns((camp.data ?? []) as Campaign[]);
    const meds = (med.data ?? []) as MediaAsset[];
    setMedia(meds);
    if (meds.length) {
      const { data: signed } = await supabase.storage.from("media").createSignedUrls(
        meds.map((m) => m.storage_path),
        3600,
      );
      const map: Record<string, string> = {};
      (signed ?? []).forEach((s: { path: string | null; signedUrl: string }) => {
        if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
      });
      setMediaUrls(map);
    }

    if (editId) {
      const [{ data: post, error }, { data: targets }] = await Promise.all([
        supabase.from("content_posts").select("*").eq("id", editId).eq("workspace_id", workspace.id).maybeSingle(),
        supabase.from("post_targets").select("*").eq("post_id", editId).eq("workspace_id", workspace.id),
      ]);
      if (error || !post) {
        toast(error ? errMsg(error) : "Post not found in this workspace", "error");
      } else {
        const p = post as ContentPost;
        setExisting(p);
        setTitle(p.title ?? "");
        setBody(p.body);
        setTagInput(p.hashtags.map((t) => `#${t}`).join(" "));
        setMediaIds(p.media_ids ?? []);
        setCampaignId(p.campaign_id ?? "");
        setRequiresApproval(p.requires_approval);
        if (p.scheduled_at && new Date(p.scheduled_at) > new Date()) setWhen(toLocalInput(new Date(p.scheduled_at)));
        const ts = (targets ?? []) as PostTarget[];
        setSelected(ts.map((t) => t.social_account_id));
        const c: Record<string, string> = {};
        const o: Record<string, boolean> = {};
        ts.forEach((t) => {
          if (t.customized_body) {
            c[t.social_account_id] = t.customized_body;
            o[t.social_account_id] = true;
          }
        });
        setCustom(c);
        setCustomOpen(o);
      }
    } else {
      setExisting(null);
    }
    setLoading(false);
  }, [supabase, workspace.id, editId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const locked = existing && ["publishing", "published"].includes(existing.status);

  const toggleAccount = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const ai = async (kind: AiKind) => {
    const selectedProviders = accounts.filter((a) => selected.includes(a.id)).map((a) => a.provider);
    let prompt = body.trim();
    if (kind === "caption" && !prompt) prompt = title.trim();
    if (!prompt) return toast(kind === "caption" ? "Add a title or a few words about the post first" : "Write some text first", "info");
    setAiBusy(kind);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          kind,
          prompt,
          tone,
          platform: selectedProviders[0] ?? "instagram",
          language: kind === "translate" ? language : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { output?: string; provider?: string; credits?: number; error?: string };
      if (!res.ok || json.error || !json.output) throw new Error(json.error ?? "AI request failed");
      if (kind === "hashtags") {
        const merged = parseTags(`${tagInput} ${json.output}`);
        setTagInput(merged.map((t) => `#${t}`).join(" "));
      } else {
        setBody(json.output.trim());
      }
      toast(`AI ${kind} ready${json.provider ? ` · ${json.provider}` : ""}${json.credits ? ` · ${json.credits} credit${json.credits > 1 ? "s" : ""}` : ""}`);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setAiBusy(null);
    }
  };

  /** Creates or updates the post and its targets; returns the post id. */
  const persist = async (): Promise<string | null> => {
    if (!body.trim()) {
      toast("Post text is empty", "error");
      return null;
    }
    const fields = {
      title: title.trim() || null,
      body: body.trim(),
      hashtags: tags,
      media_ids: mediaIds,
      campaign_id: campaignId || null,
      requires_approval: requiresApproval,
    };
    let postId = existing?.id ?? null;
    if (postId) {
      const { error } = await supabase.from("content_posts").update(fields).eq("id", postId).eq("workspace_id", workspace.id);
      if (error) {
        toast(errMsg(error), "error");
        return null;
      }
      const { data: current } = await supabase.from("post_targets").select("id,social_account_id").eq("post_id", postId).eq("workspace_id", workspace.id);
      const cur = (current ?? []) as { id: string; social_account_id: string }[];
      const toDelete = cur.filter((t) => !selected.includes(t.social_account_id)).map((t) => t.id);
      if (toDelete.length) {
        const { error: dErr } = await supabase.from("post_targets").delete().in("id", toDelete).eq("workspace_id", workspace.id);
        if (dErr) {
          toast(errMsg(dErr), "error");
          return null;
        }
      }
      for (const t of cur.filter((t) => selected.includes(t.social_account_id))) {
        const cb = customOpen[t.social_account_id] ? custom[t.social_account_id]?.trim() || null : null;
        await supabase.from("post_targets").update({ customized_body: cb }).eq("id", t.id).eq("workspace_id", workspace.id);
      }
      const newOnes = selected.filter((id) => !cur.some((t) => t.social_account_id === id));
      if (newOnes.length) {
        const { error: iErr } = await supabase.from("post_targets").insert(
          newOnes.map((id) => ({
            tenant_id: tenant.id,
            workspace_id: workspace.id,
            post_id: postId,
            social_account_id: id,
            customized_body: customOpen[id] ? custom[id]?.trim() || null : null,
          })),
        );
        if (iErr) {
          toast(errMsg(iErr), "error");
          return null;
        }
      }
    } else {
      const { data, error } = await supabase
        .from("content_posts")
        .insert({ ...fields, tenant_id: tenant.id, workspace_id: workspace.id })
        .select("*")
        .single();
      if (error || !data) {
        toast(errMsg(error), "error");
        return null;
      }
      postId = (data as ContentPost).id;
      setExisting(data as ContentPost);
      if (selected.length) {
        const { error: tErr } = await supabase.from("post_targets").insert(
          selected.map((id) => ({
            tenant_id: tenant.id,
            workspace_id: workspace.id,
            post_id: postId,
            social_account_id: id,
            customized_body: customOpen[id] ? custom[id]?.trim() || null : null,
          })),
        );
        if (tErr) {
          toast(errMsg(tErr), "error");
          return postId;
        }
      }
    }
    return postId;
  };

  const saveDraft = async () => {
    setSaving("draft");
    const id = await persist();
    setSaving(null);
    if (id) {
      toast(existing ? "Changes saved" : "Draft saved");
      router.replace(`/app/compose?id=${id}`);
    }
  };

  const submit = async (now: boolean) => {
    if (!selected.length) return toast("Select at least one account", "error");
    const scheduled = new Date(when);
    if (!now && (isNaN(scheduled.getTime()) || scheduled.getTime() < Date.now())) return toast("Choose a future date and time", "error");
    setSaving(now ? "now" : "schedule");
    const id = await persist();
    if (!id) {
      setSaving(null);
      return;
    }
    const { data, error } = await supabase.rpc("submit_post", {
      p_post: id,
      p_scheduled_at: now ? null : scheduled.toISOString(),
      p_publish_now: now,
    });
    setSaving(null);
    if (error) {
      toast(errMsg(error), "error");
      router.replace(`/app/compose?id=${id}`);
      return;
    }
    const status = String(data);
    const msg: Record<string, [string, "success" | "error" | "info"]> = {
      published: ["Published to all selected accounts", "success"],
      partially_failed: ["Published to some accounts — check the post for errors", "info"],
      failed: ["Publishing failed — open the post to see why", "error"],
      scheduled: [`Scheduled for ${scheduled.toLocaleString("en-IN")}`, "success"],
      approval_pending: ["Sent for approval", "info"],
    };
    const [text, kind] = msg[status] ?? [`Status: ${status}`, "info"];
    toast(text, kind);
    router.push(`/app/posts?id=${id}`);
  };

  if (loading) return <LoadingBlock />;

  if (!accounts.length) {
    return (
      <div>
        <PageHeader title="Composer" description="Create and schedule posts across your channels." />
        <Card>
          <EmptyState
            icon={Plug}
            title="Connect an account first"
            description="You need at least one connected account that can publish before composing posts."
            action={
              <Link href="/app/accounts">
                <Button>Go to connected accounts</Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const selectedAccounts = accounts.filter((a) => selected.includes(a.id));
  const selectedMedia = media.filter((m) => mediaIds.includes(m.id));
  const firstMediaUrl = selectedMedia[0] ? mediaUrls[selectedMedia[0].storage_path] : undefined;
  const firstIsVideo = selectedMedia[0]?.mime_type?.startsWith("video/");

  return (
    <div>
      <PageHeader
        title={existing ? "Edit post" : "Composer"}
        description={existing ? undefined : "Write once, tailor per channel, schedule or publish."}
        actions={existing && <StatusBadge status={existing.status} />}
      />

      {locked && (
        <Card className="mb-4 border-warn/30 p-4 text-sm text-warn">
          This post is {existing?.status} and can no longer be edited.{" "}
          <Link href={`/app/posts?id=${existing?.id}`} className="underline">
            View post
          </Link>
        </Card>
      )}
      {!writable && (
        <Card className="mb-4 p-4 text-sm text-muted">Your role in this workspace is read-only. Ask a manager for editor access to create posts.</Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Publish to" description="Only connected accounts with publish permission are listed." />
            <div className="flex flex-wrap gap-2 p-4">
              {accounts.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleAccount(a.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border py-1.5 pr-3 pl-1.5 text-sm transition-colors",
                      on ? "border-brand bg-brand/10" : "border-line-2 text-muted hover:border-brand/40",
                    )}
                  >
                    <ProviderIcon provider={a.provider} className="size-7" />
                    <span className="max-w-40 truncate">{a.display_name ?? providerName(a.provider)}</span>
                    {a.is_demo && <DemoBadge />}
                    {on && <Check className="size-4 text-brand-ink" />}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="space-y-4 p-4">
            <Field label="Internal title" hint="(not published)">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diwali offer reel" disabled={!!locked} />
            </Field>
            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">Caption</span>
                <div className="flex flex-wrap items-center gap-1">
                  <Select value={tone} onChange={(e) => setTone(e.target.value)} className="h-8 w-auto py-0 text-xs" aria-label="Tone">
                    {["friendly", "professional", "energetic", "luxury", "playful", "informative"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </Select>
                  <Button size="sm" variant="secondary" loading={aiBusy === "caption"} disabled={!!aiBusy || !!locked} onClick={() => ai("caption")}>
                    <Sparkles className="size-3.5" /> Write
                  </Button>
                  <Button size="sm" variant="secondary" loading={aiBusy === "improve"} disabled={!!aiBusy || !!locked} onClick={() => ai("improve")}>
                    <Wand2 className="size-3.5" /> Improve
                  </Button>
                  <Button size="sm" variant="secondary" loading={aiBusy === "hashtags"} disabled={!!aiBusy || !!locked} onClick={() => ai("hashtags")}>
                    <Hash className="size-3.5" /> Hashtags
                  </Button>
                </div>
              </div>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder="What do you want to share? Tip: type a few words and tap Write for an AI caption."
                disabled={!!locked}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {selectedAccounts.length === 0 && <span className="text-xs text-faint">{fullText(body, tags).length} characters</span>}
                {Array.from(new Set(selectedAccounts.map((a) => a.provider))).map((p) => {
                  const limit = PROVIDERS[p as Provider].charLimit;
                  const len = fullText(body, tags).length;
                  return (
                    <Badge key={p} tone={len > limit ? "red" : len > limit * 0.9 ? "yellow" : "gray"}>
                      {PROVIDERS[p as Provider].short} {len}/{limit}
                    </Badge>
                  );
                })}
                <span className="flex-1" />
                <div className="flex items-center gap-1">
                  <Select value={language} onChange={(e) => setLanguage(e.target.value)} className="h-8 w-auto py-0 text-xs" aria-label="Language">
                    {["Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Marathi", "Bengali", "Gujarati", "English"].map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </Select>
                  <Button size="sm" variant="ghost" loading={aiBusy === "translate"} disabled={!!aiBusy || !!locked} onClick={() => ai("translate")}>
                    <Languages className="size-3.5" /> Translate
                  </Button>
                </div>
              </div>
            </div>
            <Field label="Hashtags" hint="(space or comma separated)">
              <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="#fitness #gym #chennai" disabled={!!locked} />
            </Field>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-muted">Media</span>
                <Button size="sm" variant="secondary" onClick={() => setMediaOpen(true)} disabled={!!locked}>
                  <ImageIcon className="size-3.5" /> {selectedMedia.length ? "Change" : "Add media"}
                </Button>
              </div>
              {selectedMedia.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedMedia.map((m) => (
                    <div key={m.id} className="relative size-20 overflow-hidden rounded-lg border border-line-2 bg-bg">
                      {mediaUrls[m.storage_path] && !m.mime_type?.startsWith("video/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaUrls[m.storage_path]} alt={m.file_name} className="size-full object-cover" />
                      ) : (
                        <div className="grid size-full place-items-center p-1 text-center text-[10px] text-muted">{m.file_name}</div>
                      )}
                      {!locked && (
                        <button
                          aria-label="Remove media"
                          onClick={() => setMediaIds((ids) => ids.filter((x) => x !== m.id))}
                          className="absolute top-1 right-1 rounded-full bg-black/80 p-0.5"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-faint">No media attached.</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Campaign">
                <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} disabled={!!locked}>
                  <option value="">No campaign</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end pb-2">
                <Toggle checked={requiresApproval} onChange={setRequiresApproval} label="Requires approval before publishing" />
              </div>
            </div>
          </Card>

          {selectedAccounts.length > 0 && (
            <Card>
              <CardHeader title="Per-channel captions" description="Optional: override the caption for a specific account." />
              <div className="divide-y divide-line">
                {selectedAccounts.map((a) => (
                  <div key={a.id} className="p-4">
                    <div className="flex items-center gap-2">
                      <ProviderIcon provider={a.provider} className="size-6" />
                      <span className="min-w-0 flex-1 truncate text-sm">{a.display_name ?? providerName(a.provider)}</span>
                      <Toggle
                        checked={!!customOpen[a.id]}
                        onChange={(v) => {
                          setCustomOpen((o) => ({ ...o, [a.id]: v }));
                          if (v && !custom[a.id]) setCustom((c) => ({ ...c, [a.id]: fullText(body, tags) }));
                        }}
                        label="Custom"
                      />
                    </div>
                    {customOpen[a.id] && (
                      <>
                        <Textarea
                          className="mt-2"
                          rows={4}
                          value={custom[a.id] ?? ""}
                          onChange={(e) => setCustom((c) => ({ ...c, [a.id]: e.target.value }))}
                          disabled={!!locked}
                        />
                        <p
                          className={cn(
                            "mt-1 text-right text-[11px]",
                            (custom[a.id]?.length ?? 0) > PROVIDERS[a.provider].charLimit ? "text-danger" : "text-faint",
                          )}
                        >
                          {custom[a.id]?.length ?? 0}/{PROVIDERS[a.provider].charLimit}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="space-y-3 p-4">
            <Field label="Schedule for">
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={!!locked} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={saveDraft} loading={saving === "draft"} disabled={!!saving || !!locked || !writable}>
                <Save className="size-4" /> {existing ? "Save" : "Save draft"}
              </Button>
              <Button variant="secondary" onClick={() => submit(false)} loading={saving === "schedule"} disabled={!!saving || !!locked || !writable}>
                <CalendarClock className="size-4" /> Schedule
              </Button>
            </div>
            <Button className="w-full" onClick={() => submit(true)} loading={saving === "now"} disabled={!!saving || !!locked || !writable}>
              <Send className="size-4" /> Publish now
            </Button>
            {requiresApproval && (
              <p className="text-[11px] text-muted">Editors&apos; posts go to Approvals first. Managers and admins can publish directly.</p>
            )}
            {selectedAccounts.some((a) => a.is_demo) && (
              <p className="text-[11px] text-warn">Demo accounts simulate publishing — nothing is posted to the real network.</p>
            )}
          </Card>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Preview</p>
            {selectedAccounts.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted">Select an account to preview.</Card>
            ) : (
              <div className="space-y-3">
                {selectedAccounts.map((a) => {
                  const text = customOpen[a.id] && custom[a.id] ? custom[a.id] : fullText(body, tags);
                  const limit = PROVIDERS[a.provider].charLimit;
                  return (
                    <Card key={a.id} className="overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <ProviderIcon provider={a.provider} className="size-7" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{a.display_name ?? workspace.name}</p>
                          <p className="truncate text-[11px] text-faint">
                            {a.handle ?? providerName(a.provider)} · {PROVIDERS[a.provider].name}
                          </p>
                        </div>
                      </div>
                      {firstMediaUrl &&
                        (firstIsVideo ? (
                          <video src={firstMediaUrl} className="aspect-square w-full bg-black object-cover" muted playsInline />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={firstMediaUrl} alt="" className="aspect-square w-full object-cover" />
                        ))}
                      <p className="px-3 py-2.5 text-sm break-words whitespace-pre-wrap">
                        {text.length > limit ? (
                          <>
                            {text.slice(0, limit)}
                            <span className="bg-danger/30 text-danger">{text.slice(limit)}</span>
                          </>
                        ) : (
                          text || <span className="text-faint">Your caption will appear here…</span>
                        )}
                      </p>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <AiImageModal
        open={aiImageOpen}
        onClose={() => setAiImageOpen(false)}
        onCreated={(asset, url) => {
          setMedia((prev) => [asset, ...prev.filter((x) => x.id !== asset.id)]);
          if (url) setMediaUrls((prev) => ({ ...prev, [asset.storage_path]: url }));
          setMediaIds((ids) => (ids.includes(asset.id) ? ids : [...ids, asset.id].slice(0, 10)));
        }}
      />

      <Modal
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        title="Choose media"
        wide
        footer={
          <>
            <Link href="/app/media">
              <Button variant="ghost">Upload in library</Button>
            </Link>
            <Button variant="secondary" onClick={() => setAiImageOpen(true)}>
              <Sparkles className="size-4" /> Generate image
            </Button>
            <Button onClick={() => setMediaOpen(false)}>Done ({mediaIds.length})</Button>
          </>
        }
      >
        {media.length === 0 ? (
          <EmptyState icon={ImageIcon} title="No media yet" description="Upload images or videos in the Media library." />
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {media.map((m) => {
              const on = mediaIds.includes(m.id);
              const url = mediaUrls[m.storage_path];
              return (
                <button
                  key={m.id}
                  onClick={() => setMediaIds((ids) => (on ? ids.filter((x) => x !== m.id) : [...ids, m.id].slice(0, 10)))}
                  className={cn("relative aspect-square overflow-hidden rounded-lg border-2 bg-bg", on ? "border-brand" : "border-transparent")}
                >
                  {url && !m.mime_type?.startsWith("video/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={m.file_name} className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center p-1 text-[10px] text-muted">{m.file_name}</span>
                  )}
                  {on && (
                    <span className="absolute top-1 right-1 rounded-full bg-brand p-0.5">
                      <Check className="size-3 text-on-brand" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ComposeInner />
    </Suspense>
  );
}
