"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquareReply, Plus, Sparkles, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import {
  Badge,
  Button,
  Card,
  DemoBadge,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { ProviderIcon, providerName } from "@/components/provider-badge";
import { cn, errMsg, timeAgo } from "@/lib/utils";

interface Review {
  id: string;
  platform: string;
  author: string;
  rating: number;
  body: string | null;
  reply: string | null;
  replied_at: string | null;
  is_demo: boolean;
  created_at: string;
}

const PLATFORMS = ["google_business", "facebook", "instagram", "website"];

function Stars({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(size, i <= value ? "fill-warn text-warn" : "text-line-2")} />
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  const supabase = createClient();
  const { workspace, can } = useApp();
  const toast = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [ratingFilter, setRatingFilter] = useState("all");
  const [repliedFilter, setRepliedFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("reviews")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });
    if (error) toast(errMsg(error), "error");
    setReviews((data ?? []) as Review[]);
    setLoading(false);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      reviews.filter((r) => {
        if (ratingFilter !== "all" && r.rating !== Number(ratingFilter)) return false;
        if (repliedFilter === "replied" && !r.reply) return false;
        if (repliedFilter === "unreplied" && r.reply) return false;
        return true;
      }),
    [reviews, ratingFilter, repliedFilter],
  );

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => r.rating === n).length }));
  const unreplied = reviews.filter((r) => !r.reply).length;

  const seed = async () => {
    setSeeding(true);
    const base = { tenant_id: workspace.tenant_id, workspace_id: workspace.id, is_demo: true, platform: "google_business" };
    const { error } = await supabase.from("reviews").insert([
      { ...base, author: "Priya S.", rating: 5, body: "Amazing trainers and very clean studio. Highly recommend!" },
      { ...base, author: "Arjun M.", rating: 4, body: "Good equipment, but it gets crowded in the evenings." },
      { ...base, author: "Kavya R.", rating: 2, body: "Waited 20 minutes at the front desk for my membership card." },
    ]);
    setSeeding(false);
    if (error) toast(errMsg(error), "error");
    else {
      toast("Sample reviews added (labelled Demo)");
      load();
    }
  };

  return (
    <div>
      <PageHeader
        title="Reviews"
        description="Monitor reputation and reply to customer reviews."
        actions={
          can("support") && (
            <>
              <Button variant="secondary" onClick={seed} loading={seeding}>
                Add sample reviews
              </Button>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="size-4" /> Add review
              </Button>
            </>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Average rating" value={reviews.length ? avg.toFixed(1) : "—"} icon={Star} hint={`${reviews.length} reviews`} />
        <StatCard label="Awaiting reply" value={unreplied} icon={MessageSquareReply} tone={unreplied ? "warn" : "brand"} />
        <Card className="col-span-2 p-4">
          <p className="mb-2 text-xs font-medium text-muted">Rating distribution</p>
          <div className="space-y-1">
            {dist.map((d) => (
              <div key={d.n} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-muted">{d.n}</span>
                <Star className="size-3 fill-warn text-warn" />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-warn"
                    style={{ width: `${reviews.length ? (d.count / reviews.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-6 text-right text-faint tabular-nums">{d.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)} className="w-auto">
          <option value="all">All ratings</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} star{n > 1 ? "s" : ""}
            </option>
          ))}
        </Select>
        <Select value={repliedFilter} onChange={(e) => setRepliedFilter(e.target.value)} className="w-auto">
          <option value="all">All</option>
          <option value="unreplied">Needs reply</option>
          <option value="replied">Replied</option>
        </Select>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Star}
            title="No reviews yet"
            description="Reviews sync from Google Business once API access is approved. You can add reviews manually meanwhile."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <ReviewCard key={r.id} review={r} onChanged={load} />
          ))}
        </div>
      )}

      <AddReviewModal open={addOpen} onClose={() => setAddOpen(false)} onDone={load} />
    </div>
  );
}

function ReviewCard({ review: r, onChanged }: { review: Review; onChanged: () => void }) {
  const supabase = createClient();
  const { workspace, can } = useApp();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [reply, setReply] = useState(r.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("reviews")
      .update({ reply: reply.trim() || null, replied_at: reply.trim() ? new Date().toISOString() : null })
      .eq("id", r.id);
    setBusy(false);
    if (error) toast(errMsg(error), "error");
    else {
      toast("Reply saved");
      setEditing(false);
      onChanged();
    }
  };

  const suggest = async () => {
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          kind: "review_reply",
          prompt: r.body ?? "",
          context: `Reviewer: ${r.author}. Rating: ${r.rating}/5.`,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { output?: string; provider?: string; error?: string };
      if (!res.ok || json.error || !json.output) throw new Error(json.error ?? "AI request failed");
      setReply(json.output);
      setEditing(true);
      toast(`Suggestion ready (${json.provider ?? "AI"}) — review before saving`, "info");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <ProviderIcon provider={r.platform} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{r.author}</p>
            <Stars value={r.rating} />
            <span className="text-xs text-faint">
              {providerName(r.platform)} · {timeAgo(r.created_at)}
            </span>
            {r.is_demo && <DemoBadge />}
            {r.rating <= 2 && !r.reply && <Badge tone="red">Needs attention</Badge>}
          </div>
          {r.body && <p className="mt-1.5 text-sm text-ink/90">{r.body}</p>}

          {r.reply && !editing && (
            <div className="mt-3 rounded-xl border-l-2 border-brand bg-panel-2 px-3 py-2">
              <p className="text-[11px] font-semibold text-brand-ink">Your reply · {timeAgo(r.replied_at)}</p>
              <p className="mt-0.5 text-sm">{r.reply}</p>
            </div>
          )}

          {editing && (
            <div className="mt-3 space-y-2">
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Write a public reply…" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={save} loading={busy}>
                  Save reply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {can("support") && !editing && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                <MessageSquareReply className="size-3.5" /> {r.reply ? "Edit reply" : "Reply"}
              </Button>
              <Button size="sm" variant="ghost" onClick={suggest} loading={aiBusy}>
                {!aiBusy && <Sparkles className="size-3.5" />} AI suggest
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function AddReviewModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const supabase = createClient();
  const { workspace } = useApp();
  const toast = useToast();
  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState(5);
  const [platform, setPlatform] = useState("google_business");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!author.trim()) return toast("Reviewer name is required", "error");
    setBusy(true);
    const { error } = await supabase.from("reviews").insert({
      tenant_id: workspace.tenant_id,
      workspace_id: workspace.id,
      author: author.trim(),
      rating,
      platform,
      body: body.trim() || null,
      is_demo: false,
    });
    setBusy(false);
    if (error) toast(errMsg(error), "error");
    else {
      toast("Review added");
      setAuthor("");
      setBody("");
      setRating(5);
      onClose();
      onDone();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add review"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Add review
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Reviewer name">
          <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {providerName(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rating">
            <div className="flex h-10 items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} type="button" onClick={() => setRating(i)} aria-label={`${i} stars`}>
                  <Star className={cn("size-6", i <= rating ? "fill-warn text-warn" : "text-line-2")} />
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Review text">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
        </Field>
      </div>
    </Modal>
  );
}
