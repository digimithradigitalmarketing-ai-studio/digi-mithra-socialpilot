"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, ListChecks, MessageSquareWarning, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, CardHeader, DemoBadge, EmptyState, LoadingBlock, PageHeader, Textarea, type Tone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { ProviderIcon, providerName } from "@/components/provider-badge";
import type { ContentPost, SocialAccount } from "@/lib/types";
import { errMsg, formatDate, timeAgo } from "@/lib/utils";

type PendingPost = ContentPost & {
  post_targets: { id: string; customized_body: string | null; social_accounts: Pick<SocialAccount, "provider" | "display_name" | "is_demo"> | null }[];
};

interface Decision {
  id: string;
  post_id: string;
  decision: "approved" | "rejected" | "changes_requested";
  comment: string | null;
  decided_by: string | null;
  created_at: string;
  content_posts: { title: string | null; body: string } | null;
}

const decisionTone: Record<Decision["decision"], Tone> = { approved: "green", rejected: "red", changes_requested: "yellow" };

export default function ApprovalsPage() {
  const supabase = createClient();
  const toast = useToast();
  const { workspace, can } = useApp();
  const [pending, setPending] = useState<PendingPost[]>([]);
  const [recent, setRecent] = useState<Decision[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const approver = can("approve");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: p, error }, { data: r }] = await Promise.all([
      supabase
        .from("content_posts")
        .select("*, post_targets(id,customized_body,social_accounts(provider,display_name,is_demo))")
        .eq("workspace_id", workspace.id)
        .eq("status", "approval_pending")
        .order("updated_at", { ascending: true }),
      supabase
        .from("post_approvals")
        .select("*, content_posts(title,body)")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (error) toast(errMsg(error), "error");
    const pend = (p ?? []) as PendingPost[];
    const rec = (r ?? []) as Decision[];
    setPending(pend);
    setRecent(rec);
    const ids = Array.from(new Set([...pend.map((x) => x.created_by), ...rec.map((x) => x.decided_by)].filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      setNames(
        Object.fromEntries(
          ((profs ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((x) => [x.id, x.full_name || x.email || "Member"]),
        ),
      );
    }
    setLoading(false);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (post: PendingPost, decision: Decision["decision"]) => {
    const comment = comments[post.id]?.trim() || null;
    if (decision !== "approved" && !comment) return toast("Add a comment so the author knows what to change", "info");
    setBusy(`${post.id}:${decision}`);
    const { data, error } = await supabase.rpc("decide_post", { p_post: post.id, p_decision: decision, p_comment: comment });
    setBusy(null);
    if (error) return toast(errMsg(error), "error");
    toast(
      decision === "approved"
        ? data === "scheduled"
          ? "Approved — post is scheduled"
          : "Approved — the author can now publish"
        : decision === "rejected"
          ? "Post rejected"
          : "Changes requested",
      decision === "approved" ? "success" : "info",
    );
    setComments((c) => ({ ...c, [post.id]: "" }));
    load();
  };

  return (
    <div>
      <PageHeader title="Approvals" description="Review content before it goes live." />

      {!approver && (
        <Card className="mb-4 p-4 text-sm text-muted">You can view the approval queue, but only managers, admins and approvers can make decisions.</Card>
      )}

      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-3">
            {pending.length === 0 ? (
              <Card>
                <EmptyState icon={ListChecks} title="Nothing waiting for approval" description="Posts that need review will appear here." />
              </Card>
            ) : (
              pending.map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone="yellow">awaiting review</Badge>
                    <span>{p.created_by ? (names[p.created_by] ?? "Member") : "Member"}</span>
                    <span className="text-faint">· {timeAgo(p.updated_at)}</span>
                    {p.scheduled_at && <span className="text-faint">· for {formatDate(p.scheduled_at)}</span>}
                  </div>
                  {p.title && <p className="mt-2 font-semibold">{p.title}</p>}
                  <p className="mt-1 text-sm break-words whitespace-pre-wrap">{p.body}</p>
                  {(p.hashtags ?? []).length > 0 && <p className="mt-1 text-sm break-words text-brand-ink">{(p.hashtags ?? []).map((h) => `#${h}`).join(" ")}</p>}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {(p.post_targets ?? []).map((t) => (
                      <span key={t.id} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs">
                        <ProviderIcon provider={t.social_accounts?.provider ?? "x"} className="size-5 rounded" />
                        {t.social_accounts?.display_name ?? providerName(t.social_accounts?.provider ?? "")}
                        {t.social_accounts?.is_demo && <DemoBadge />}
                      </span>
                    ))}
                  </div>
                  {(p.post_targets ?? []).some((t) => t.customized_body) && (
                    <p className="mt-2 text-xs text-muted">Includes custom captions for some channels.</p>
                  )}

                  {approver && (
                    <div className="mt-3 border-t border-line pt-3">
                      <Textarea
                        rows={2}
                        className="min-h-0"
                        placeholder="Comment (required for reject / changes)"
                        value={comments[p.id] ?? ""}
                        onChange={(e) => setComments((c) => ({ ...c, [p.id]: e.target.value }))}
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" loading={busy === `${p.id}:approved`} disabled={!!busy} onClick={() => decide(p, "approved")}>
                          <Check className="size-3.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busy === `${p.id}:changes_requested`}
                          disabled={!!busy}
                          onClick={() => decide(p, "changes_requested")}
                        >
                          <MessageSquareWarning className="size-3.5" /> Request changes
                        </Button>
                        <Button size="sm" variant="danger" loading={busy === `${p.id}:rejected`} disabled={!!busy} onClick={() => decide(p, "rejected")}>
                          <X className="size-3.5" /> Reject
                        </Button>
                        <Link href={`/app/posts?id=${p.id}`} className="ml-auto self-center text-xs text-muted hover:text-brand-ink">
                          Details →
                        </Link>
                      </div>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>

          <Card className="self-start">
            <CardHeader title="Recently decided" />
            {recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">No decisions yet.</p>
            ) : (
              <div className="divide-y divide-line">
                {recent.map((d) => (
                  <Link key={d.id} href={`/app/posts?id=${d.post_id}`} className="block px-4 py-3 hover:bg-panel-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={decisionTone[d.decision]}>{d.decision.replace(/_/g, " ")}</Badge>
                      <span className="ml-auto text-[11px] text-faint">{timeAgo(d.created_at)}</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm">{d.content_posts?.title || d.content_posts?.body || "Post"}</p>
                    <p className="text-[11px] text-faint">by {d.decided_by ? (names[d.decided_by] ?? "Reviewer") : "Reviewer"}</p>
                    {d.comment && <p className="mt-0.5 line-clamp-2 text-xs text-muted">“{d.comment}”</p>}
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
