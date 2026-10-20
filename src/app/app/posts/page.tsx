"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, Download, FileText, Pencil, PenSquare, RotateCcw, Search, Trash2, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, DemoBadge, EmptyState, Input, LoadingBlock, Modal, PageHeader, StatusBadge, Tabs, type Tone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { ProviderIcon, providerName } from "@/components/provider-badge";
import type { ContentPost, PostStatus, PostTarget, SocialAccount } from "@/lib/types";
import { cn, downloadFile, errMsg, formatDate, timeAgo, toCSV } from "@/lib/utils";

type Filter = "all" | "draft" | "approval_pending" | "scheduled" | "published" | "failed";

const FILTERS: { value: Filter; label: string; statuses?: PostStatus[] }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts", statuses: ["draft", "rejected", "approved"] },
  { value: "approval_pending", label: "In approval", statuses: ["approval_pending"] },
  { value: "scheduled", label: "Scheduled", statuses: ["scheduled", "publishing"] },
  { value: "published", label: "Published", statuses: ["published"] },
  { value: "failed", label: "Failed", statuses: ["failed", "partially_failed"] },
];

interface Attempt {
  id: string;
  post_target_id: string;
  status: "success" | "failed" | "uncertain";
  error_category: string | null;
  response: Record<string, unknown> | null;
  created_at: string;
}

interface Approval {
  id: string;
  decision: "approved" | "rejected" | "changes_requested";
  comment: string | null;
  decided_by: string | null;
  created_at: string;
}

type TargetRow = PostTarget & { social_accounts: Pick<SocialAccount, "provider" | "display_name" | "handle" | "is_demo"> | null };

const decisionTone: Record<Approval["decision"], Tone> = { approved: "green", rejected: "red", changes_requested: "yellow" };
const targetTone: Record<PostTarget["status"], Tone> = { pending: "gray", publishing: "blue", published: "green", failed: "red", skipped: "gray" };

function PostDetail({
  postId,
  onClose,
  onChanged,
  names,
}: {
  postId: string;
  onClose: () => void;
  onChanged: () => void;
  names: Record<string, string>;
}) {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const { workspace, can } = useApp();
  const [post, setPost] = useState<ContentPost | null>(null);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: p, error }, { data: t }, { data: ap }] = await Promise.all([
      supabase.from("content_posts").select("*").eq("id", postId).eq("workspace_id", workspace.id).maybeSingle(),
      supabase
        .from("post_targets")
        .select("*, social_accounts(provider,display_name,handle,is_demo)")
        .eq("post_id", postId)
        .eq("workspace_id", workspace.id),
      supabase.from("post_approvals").select("*").eq("post_id", postId).eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
    ]);
    if (error) toast(errMsg(error), "error");
    setPost((p as ContentPost) ?? null);
    const ts = (t ?? []) as TargetRow[];
    setTargets(ts);
    setApprovals((ap ?? []) as Approval[]);
    if (ts.length) {
      const { data: at } = await supabase
        .from("publish_attempts")
        .select("*")
        .eq("workspace_id", workspace.id)
        .in(
          "post_target_id",
          ts.map((x) => x.id),
        )
        .order("created_at", { ascending: false });
      setAttempts((at ?? []) as Attempt[]);
    } else setAttempts([]);
    setLoading(false);
  }, [supabase, postId, workspace.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (kind: "retry" | "draft" | "delete" | "duplicate") => {
    if (!post) return;
    setBusy(kind);
    try {
      if (kind === "retry") {
        const { data, error } = await supabase.rpc("retry_post", { p_post: post.id });
        if (error) throw error;
        toast(`Retry finished: ${String(data).replace(/_/g, " ")}`, data === "published" ? "success" : "info");
      } else if (kind === "draft") {
        const { error } = await supabase.rpc("unschedule_post", { p_post: post.id });
        if (error) throw error;
        toast("Moved back to draft");
      } else if (kind === "delete") {
        if (!confirm("Delete this post permanently?")) return;
        const { error } = await supabase.from("content_posts").delete().eq("id", post.id).eq("workspace_id", workspace.id);
        if (error) throw error;
        toast("Post deleted");
        onChanged();
        onClose();
        return;
      } else if (kind === "duplicate") {
        const { data, error } = await supabase
          .from("content_posts")
          .insert({
            tenant_id: post.tenant_id,
            workspace_id: post.workspace_id,
            title: post.title ? `${post.title} (copy)` : "Copy",
            body: post.body,
            hashtags: post.hashtags,
            media_ids: post.media_ids,
            campaign_id: post.campaign_id,
            requires_approval: post.requires_approval,
          })
          .select("id")
          .single();
        if (error || !data) throw error;
        if (targets.length) {
          const { error: tErr } = await supabase.from("post_targets").insert(
            targets.map((t) => ({
              tenant_id: post.tenant_id,
              workspace_id: post.workspace_id,
              post_id: (data as { id: string }).id,
              social_account_id: t.social_account_id,
              customized_body: t.customized_body,
            })),
          );
          if (tErr) throw tErr;
        }
        toast("Duplicated as a new draft");
        onChanged();
        router.push(`/app/compose?id=${(data as { id: string }).id}`);
        return;
      }
      await load();
      onChanged();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const write = can("write_content");

  return (
    <Modal
      open
      onClose={onClose}
      title="Post details"
      wide
      footer={
        post &&
        write && (
          <div className="flex w-full flex-wrap justify-end gap-2">
            {["draft", "rejected"].includes(post.status) && (
              <Button variant="danger" size="sm" loading={busy === "delete"} onClick={() => act("delete")}>
                <Trash2 className="size-3.5" /> Delete
              </Button>
            )}
            <Button variant="secondary" size="sm" loading={busy === "duplicate"} onClick={() => act("duplicate")}>
              <Copy className="size-3.5" /> Duplicate
            </Button>
            {["scheduled", "approval_pending", "approved", "rejected", "failed"].includes(post.status) && (
              <Button variant="secondary" size="sm" loading={busy === "draft"} onClick={() => act("draft")}>
                <Undo2 className="size-3.5" /> Move to draft
              </Button>
            )}
            {["failed", "partially_failed"].includes(post.status) && (
              <Button variant="secondary" size="sm" loading={busy === "retry"} onClick={() => act("retry")}>
                <RotateCcw className="size-3.5" /> Retry failed
              </Button>
            )}
            {!["publishing", "published"].includes(post.status) && (
              <Link href={`/app/compose?id=${post.id}`}>
                <Button size="sm">
                  <Pencil className="size-3.5" /> Edit
                </Button>
              </Link>
            )}
          </div>
        )
      }
    >
      {loading ? (
        <LoadingBlock />
      ) : !post ? (
        <p className="py-8 text-center text-sm text-muted">Post not found in this workspace.</p>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={post.status} />
              {post.requires_approval && <Badge tone="yellow">Approval required</Badge>}
              <span className="text-xs text-faint">
                Created {timeAgo(post.created_at)}
                {post.created_by && names[post.created_by] ? ` by ${names[post.created_by]}` : ""}
              </span>
            </div>
            {post.title && <p className="mt-2 font-semibold">{post.title}</p>}
            <p className="mt-1 text-sm break-words whitespace-pre-wrap text-ink/90">{post.body}</p>
            {(post.hashtags ?? []).length > 0 && <p className="mt-1 text-sm break-words text-brand-ink">{(post.hashtags ?? []).map((h) => `#${h}`).join(" ")}</p>}
            <div className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">
              <span>Scheduled: {formatDate(post.scheduled_at)}</span>
              <span>Published: {formatDate(post.published_at)}</span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Channels</p>
            {targets.length === 0 && <p className="text-sm text-muted">No channels selected.</p>}
            <div className="space-y-2">
              {targets.map((t) => (
                <div key={t.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProviderIcon provider={t.social_accounts?.provider ?? "x"} className="size-7" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {t.social_accounts?.display_name ?? providerName(t.social_accounts?.provider ?? "")}
                    </span>
                    {t.social_accounts?.is_demo && <DemoBadge />}
                    <Badge tone={targetTone[t.status]}>{t.status}</Badge>
                  </div>
                  {t.external_post_id && <p className="mt-1.5 font-mono text-[11px] break-all text-faint">ID: {t.external_post_id}</p>}
                  {t.error && <p className="mt-1.5 text-xs text-danger">{t.error}</p>}
                  {t.customized_body && <p className="mt-1.5 text-xs break-words whitespace-pre-wrap text-muted">Custom: {t.customized_body}</p>}
                </div>
              ))}
            </div>
          </div>

          {attempts.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Publish history</p>
              <div className="space-y-1.5">
                {attempts.map((a) => {
                  const t = targets.find((x) => x.id === a.post_target_id);
                  return (
                    <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-bg px-3 py-2 text-xs">
                      <Badge tone={a.status === "success" ? "green" : a.status === "failed" ? "red" : "yellow"}>{a.status}</Badge>
                      <span className="text-muted">{providerName(t?.social_accounts?.provider ?? "")}</span>
                      {a.error_category && <span className="text-danger">{a.error_category.replace(/_/g, " ")}</span>}
                      {typeof a.response?.note === "string" && <span className="text-faint">{a.response.note}</span>}
                      <span className="ml-auto text-faint">{formatDate(a.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {approvals.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Approval history</p>
              <div className="space-y-1.5">
                {approvals.map((a) => (
                  <div key={a.id} className="rounded-lg bg-bg px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={decisionTone[a.decision]}>{a.decision.replace(/_/g, " ")}</Badge>
                      <span className="text-muted">{a.decided_by ? (names[a.decided_by] ?? "Reviewer") : "Reviewer"}</span>
                      <span className="ml-auto text-faint">{formatDate(a.created_at)}</span>
                    </div>
                    {a.comment && <p className="mt-1 text-ink/80">{a.comment}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function PostsInner() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get("id");
  const { workspace, can } = useApp();
  const [posts, setPosts] = useState<(ContentPost & { post_targets: { social_accounts: { provider: string } | null }[] })[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("content_posts")
      .select("*, post_targets(social_accounts(provider))")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) toast(errMsg(error), "error");
    const list = (data ?? []) as typeof posts;
    setPosts(list);
    const ids = Array.from(new Set(list.map((p) => p.created_by).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      setNames(
        Object.fromEntries(
          ((profs ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [p.id, p.full_name || p.email || "Member"]),
        ),
      );
    }
    setLoading(false);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.value === filter);
    const term = q.toLowerCase().trim();
    return posts.filter(
      (p) =>
        (!f?.statuses || f.statuses.includes(p.status)) &&
        (!term || p.body.toLowerCase().includes(term) || (p.title ?? "").toLowerCase().includes(term) || p.hashtags.some((h) => h.toLowerCase().includes(term))),
    );
  }, [posts, filter, q]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: posts.length, draft: 0, approval_pending: 0, scheduled: 0, published: 0, failed: 0 };
    FILTERS.forEach((f) => {
      if (f.statuses) c[f.value] = posts.filter((p) => f.statuses!.includes(p.status)).length;
    });
    return c;
  }, [posts]);

  const openPost = (id: string | null) => router.replace(id ? `${pathname}?id=${id}` : pathname, { scroll: false });

  const exportCsv = () => {
    downloadFile(
      `posts-${workspace.slug}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(
        filtered.map((p) => ({
          id: p.id,
          title: p.title ?? "",
          status: p.status,
          body: p.body,
          hashtags: p.hashtags,
          channels: (p.post_targets ?? []).map((t) => t.social_accounts?.provider ?? "").filter(Boolean),
          scheduled_at: p.scheduled_at ?? "",
          published_at: p.published_at ?? "",
          created_at: p.created_at,
        })),
      ),
    );
  };

  return (
    <div>
      <PageHeader
        title="Posts"
        description="Every draft, scheduled and published post in this workspace."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="size-4" /> Export CSV
            </Button>
            {can("write_content") && (
              <Link href="/app/compose">
                <Button>
                  <PenSquare className="size-4" /> New post
                </Button>
              </Link>
            )}
          </>
        }
      />

      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={FILTERS.map((f) => ({
          value: f.value,
          label: (
            <span>
              {f.label} <span className="opacity-60">{counts[f.value]}</span>
            </span>
          ),
        }))}
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search text or hashtags" className="pl-9" />
      </div>

      {loading ? (
        <LoadingBlock />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title={posts.length ? "No posts match" : "No posts yet"}
            description={posts.length ? "Try another filter or search." : "Create your first post in the composer."}
            action={
              !posts.length &&
              can("write_content") && (
                <Link href="/app/compose">
                  <Button>Open composer</Button>
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {filtered.map((p) => {
            const providers = Array.from(new Set((p.post_targets ?? []).map((t) => t.social_accounts?.provider).filter(Boolean))) as string[];
            return (
              <button
                key={p.id}
                onClick={() => openPost(p.id)}
                className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-panel-2 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={p.status} />
                    {p.title && <span className="truncate text-sm font-medium">{p.title}</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm break-words text-muted">{p.body}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 sm:w-64 sm:justify-end">
                  <div className="flex -space-x-1.5">
                    {providers.map((pr) => (
                      <ProviderIcon key={pr} provider={pr} className="size-6 rounded-md ring-2 ring-panel" />
                    ))}
                  </div>
                  <span className={cn("ml-auto text-xs text-faint sm:ml-0")}>
                    {p.published_at
                      ? `Published ${timeAgo(p.published_at)}`
                      : p.scheduled_at && p.status === "scheduled"
                        ? `Due ${formatDate(p.scheduled_at)}`
                        : `Edited ${timeAgo(p.updated_at)}`}
                  </span>
                </div>
              </button>
            );
          })}
        </Card>
      )}

      {openId && <PostDetail key={openId} postId={openId} names={names} onClose={() => openPost(null)} onChanged={load} />}
    </div>
  );
}

export default function PostsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <PostsInner />
    </Suspense>
  );
}
