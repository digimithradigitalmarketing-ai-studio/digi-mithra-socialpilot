"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Copy, FlaskConical, Mail, Plus, Save, Send, Sparkles, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select, Textarea, type Tone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { renderEmail } from "@/lib/email-render";
import { cn, errMsg, formatDate } from "@/lib/utils";
import type { Contact, EmailCampaign, Segment } from "@/lib/types";

const STATUS_TONE: Record<EmailCampaign["status"], Tone> = { draft: "gray", sending: "blue", sent: "green", failed: "red" };

interface SendRow {
  id: string;
  email: string;
  status: "sent" | "simulated" | "failed" | "skipped";
  error: string | null;
  created_at: string;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

function CampaignList() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const { workspace, can } = useApp();
  const canWrite = can("write_content");
  const [items, setItems] = useState<EmailCampaign[] | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      setItems(null);
      const [c, s] = await Promise.all([
        supabase.from("email_campaigns").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
        supabase.from("segments").select("*").eq("workspace_id", workspace.id),
      ]);
      if (c.error) toast(errMsg(c.error), "error");
      setItems((c.data ?? []) as EmailCampaign[]);
      setSegments((s.data ?? []) as Segment[]);
    })();
  }, [supabase, workspace.id, toast]);

  const create = async () => {
    setCreating(true);
    const { data, error } = await supabase
      .from("email_campaigns")
      .insert({
        tenant_id: workspace.tenant_id,
        workspace_id: workspace.id,
        name: `Email ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`,
        subject: "",
        body: "Hi {{name}},\n\n",
        from_name: workspace.name,
      })
      .select("id")
      .single();
    setCreating(false);
    if (error) return toast(errMsg(error), "error");
    router.push(`/app/email?id=${data.id}`);
  };

  const segName = (id: string | null) => segments.find((s) => s.id === id)?.name ?? "—";

  return (
    <div>
      <PageHeader
        title="Email"
        description="Send marketing emails to opted-in contacts in a segment."
        actions={
          <>
            <Link href="/app/segments">
              <Button variant="secondary">
                <Users className="size-4" /> Segments
              </Button>
            </Link>
            {canWrite && (
              <Button onClick={create} loading={creating}>
                <Plus className="size-4" /> New email
              </Button>
            )}
          </>
        }
      />
      {items === null ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Mail}
            title="No email campaigns yet"
            description="Write a newsletter or offer email, pick a segment and send. Only contacts who opted in will receive it."
            action={
              canWrite && (
                <Button onClick={create} loading={creating}>
                  <Plus className="size-4" /> Create your first email
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <Link key={c.id} href={`/app/email?id=${c.id}`} className="block">
              <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-brand/40 sm:flex-row sm:items-center">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand-ink">
                  <Mail className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{c.name}</p>
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                    {c.provider === "simulated" && <Badge tone="yellow">Demo send</Badge>}
                  </div>
                  <p className="truncate text-sm text-muted">{c.subject || "No subject yet"}</p>
                  <p className="text-xs text-faint">Segment: {segName(c.segment_id)}</p>
                </div>
                <div className="flex gap-4 text-center text-xs sm:text-right">
                  <div>
                    <p className="text-base font-bold tabular-nums">{c.stats?.recipients ?? 0}</p>
                    <p className="text-faint">recipients</p>
                  </div>
                  <div>
                    <p className="text-base font-bold tabular-nums">{(c.stats?.sent ?? 0) + (c.stats?.simulated ?? 0)}</p>
                    <p className="text-faint">{c.provider === "simulated" ? "simulated" : "sent"}</p>
                  </div>
                  <div className="min-w-20">
                    <p className="text-sm font-medium">{c.sent_at ? formatDate(c.sent_at, { day: "numeric", month: "short" }) : "—"}</p>
                    <p className="text-faint">sent on</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignEditor({ id }: { id: string }) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const { workspace, user, can } = useApp();
  const canWrite = can("write_content");

  const [c, setC] = useState<EmailCampaign | null>(null);
  const [missing, setMissing] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [recipients, setRecipients] = useState<number | null>(null);
  const [segTotal, setSegTotal] = useState<number | null>(null);
  const [sends, setSends] = useState<SendRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "test" | "send" | "subject" | "body">("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [subjects, setSubjects] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [cr, sr, se] = await Promise.all([
      supabase.from("email_campaigns").select("*").eq("id", id).eq("workspace_id", workspace.id).maybeSingle(),
      supabase.from("segments").select("*").eq("workspace_id", workspace.id).order("name"),
      supabase.from("email_sends").select("id,email,status,error,created_at").eq("campaign_id", id).order("created_at", { ascending: false }).limit(500),
    ]);
    if (!cr.data) {
      setMissing(true);
      return;
    }
    setC(cr.data as EmailCampaign);
    setSegments((sr.data ?? []) as Segment[]);
    setSends((se.data ?? []) as SendRow[]);
    setDirty(false);
  }, [supabase, id, workspace.id]);

  useEffect(() => {
    load();
  }, [load]);

  const segmentId = c?.segment_id;
  useEffect(() => {
    if (!segmentId) {
      setRecipients(null);
      setSegTotal(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("segment_contacts", { p_segment: segmentId }).range(0, 1000);
      if (cancelled) return;
      const rows = (data ?? []) as Contact[];
      const emails = new Set(rows.filter((r) => r.email && r.marketing_consent).map((r) => r.email!.trim().toLowerCase()));
      setSegTotal(rows.length);
      setRecipients(emails.size);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, segmentId]);

  const readOnly = !canWrite || (c?.status !== "draft" && c?.status !== "failed");
  const set = (patch: Partial<EmailCampaign>) => {
    if (!c || readOnly) return;
    setC({ ...c, ...patch });
    setDirty(true);
  };

  const preview = useMemo(() => {
    if (!c) return "";
    return renderEmail({
      subject: c.subject,
      preheader: c.preheader,
      body: c.body,
      businessName: workspace.name,
      name: "Priya Sharma",
      unsubscribeUrl: "#unsubscribe",
    }).html;
  }, [c, workspace.name]);

  const save = async (quiet = false) => {
    if (!c) return false;
    setSaving(true);
    const { error } = await supabase
      .from("email_campaigns")
      .update({
        name: c.name.trim() || "Untitled email",
        subject: c.subject,
        preheader: c.preheader || null,
        body: c.body,
        segment_id: c.segment_id,
        from_name: c.from_name || null,
        reply_to: c.reply_to || null,
      })
      .eq("id", c.id);
    setSaving(false);
    if (error) {
      toast(errMsg(error), "error");
      return false;
    }
    setDirty(false);
    if (!quiet) toast("Saved");
    return true;
  };

  const aiSubjects = async () => {
    if (!c) return;
    setBusy("subject");
    try {
      const r = await postJSON<{ output: string }>("/api/ai/generate", {
        workspaceId: workspace.id,
        kind: "hook",
        platform: "email",
        prompt: `Email subject lines (under 60 characters) for this email:\n${c.subject}\n${c.body}`.slice(0, 3000),
      });
      const lines = r.output
        .split("\n")
        .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").replace(/\(score:\s*\d+\)/i, "").replace(/^["']|["']$/g, "").trim())
        .filter((l) => l && l.length < 140);
      setSubjects(lines.slice(0, 6));
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setBusy("");
  };

  const aiBody = async () => {
    if (!c) return;
    const topic = c.subject || c.name;
    setBusy("body");
    try {
      const r = await postJSON<{ output: string }>("/api/ai/generate", {
        workspaceId: workspace.id,
        kind: "campaign",
        platform: "email",
        prompt: `Write a short marketing email body (greeting "Hi {{name}}," then 2-4 short paragraphs, optional bullet list using "- ", and a clear call to action). Plain text only. Topic: ${topic}\n\nCurrent draft:\n${c.body}`.slice(0, 4000),
      });
      set({ body: r.output });
      toast("Draft written — review before sending", "info");
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setBusy("");
  };

  const sendTest = async () => {
    if (!c) return;
    if (dirty && !(await save(true))) return;
    setBusy("test");
    try {
      const r = await postJSON<{ provider: string }>("/api/email/send", { campaignId: c.id, test: true });
      toast(r.provider === "simulated" ? "Test simulated — RESEND_API_KEY is not set, nothing was delivered." : `Test sent to ${user.email}`, r.provider === "simulated" ? "info" : "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setBusy("");
  };

  const sendNow = async () => {
    if (!c) return;
    if (dirty && !(await save(true))) return;
    setBusy("send");
    try {
      const r = await postJSON<{ recipients: number; sent: number; simulated: number; failed: number; provider: string }>("/api/email/send", { campaignId: c.id });
      toast(
        r.provider === "simulated"
          ? `Demo send: ${r.simulated} email(s) simulated, nothing delivered.`
          : `Sent ${r.sent} of ${r.recipients}${r.failed ? ` · ${r.failed} failed` : ""}`,
        r.failed ? "error" : "success",
      );
      setConfirmOpen(false);
      load();
    } catch (e) {
      toast(errMsg(e), "error");
      load();
    }
    setBusy("");
  };

  const duplicate = async () => {
    if (!c) return;
    const { data, error } = await supabase
      .from("email_campaigns")
      .insert({
        tenant_id: c.tenant_id,
        workspace_id: c.workspace_id,
        name: `${c.name} (copy)`,
        subject: c.subject,
        preheader: c.preheader,
        body: c.body,
        segment_id: c.segment_id,
        from_name: c.from_name,
        reply_to: c.reply_to,
      })
      .select("id")
      .single();
    if (error) return toast(errMsg(error), "error");
    router.push(`/app/email?id=${data.id}`);
  };

  const remove = async () => {
    if (!c || !confirm("Delete this email draft?")) return;
    const { error } = await supabase.from("email_campaigns").delete().eq("id", c.id);
    if (error) return toast(errMsg(error), "error");
    router.push("/app/email");
  };

  if (missing) return <EmptyState icon={Mail} title="Email not found" action={<Link href="/app/email" className="text-brand-ink">Back to emails</Link>} />;
  if (!c) return <LoadingBlock />;

  const stats = c.stats ?? {};
  const counts = sends.reduce<Record<string, number>>((a, s) => ((a[s.status] = (a[s.status] ?? 0) + 1), a), {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/email" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand-ink">
          <ArrowLeft className="size-4" /> All emails
        </Link>
        <div className="flex flex-wrap gap-2">
          {readOnly && canWrite && (
            <Button variant="secondary" onClick={duplicate}>
              <Copy className="size-4" /> Duplicate
            </Button>
          )}
          {!readOnly && (
            <>
              {c.status === "draft" && (
                <Button variant="ghost" onClick={remove} aria-label="Delete draft">
                  <Trash2 className="size-4" />
                </Button>
              )}
              <Button variant="secondary" onClick={() => save()} loading={saving} disabled={!dirty}>
                <Save className="size-4" /> {dirty ? "Save" : "Saved"}
              </Button>
              <Button variant="secondary" onClick={sendTest} loading={busy === "test"}>
                <FlaskConical className="size-4" /> Send test
              </Button>
              <Button onClick={() => setConfirmOpen(true)} disabled={!c.segment_id || !c.subject.trim()}>
                <Send className="size-4" /> Send to segment
              </Button>
            </>
          )}
        </div>
      </div>

      {c.provider === "simulated" && (
        <div className="flex items-start gap-2 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Demo mode — RESEND_API_KEY not set, emails were not delivered.
        </div>
      )}

      {c.status !== "draft" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { l: "Recipients", v: stats.recipients ?? 0, cls: "tint-blue" },
            { l: "Sent", v: stats.sent ?? 0, cls: "tint-green" },
            { l: "Simulated", v: stats.simulated ?? 0, cls: "tint-amber" },
            { l: "Failed", v: stats.failed ?? 0, cls: "tint-rose" },
          ].map((s) => (
            <div key={s.l} className={cn("shadow-soft rounded-2xl border border-line p-4", s.cls)}>
              <p className="text-xs font-medium text-muted">{s.l}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{s.v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Compose <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
              </span>
            }
            description={readOnly ? "This email was sent and is read-only." : "Use {{name}} to insert the contact's first name."}
          />
          <div className="space-y-4 p-4 sm:p-5">
            <Field label="Internal name">
              <Input value={c.name} disabled={readOnly} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-muted">Subject</span>
                <span className={cn("text-xs", c.subject.length > 60 ? "text-warn" : "text-faint")}>{c.subject.length}/60</span>
              </div>
              <div className="flex gap-2">
                <Input value={c.subject} disabled={readOnly} onChange={(e) => set({ subject: e.target.value })} placeholder="Your monsoon offer is here, {{name}}" />
                {!readOnly && (
                  <Button variant="secondary" onClick={aiSubjects} loading={busy === "subject"} aria-label="Suggest subject lines" className="shrink-0">
                    <Sparkles className="size-4" />
                  </Button>
                )}
              </div>
              {subjects.length > 0 && !readOnly && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {subjects.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        set({ subject: s });
                        setSubjects([]);
                      }}
                      className="rounded-full border border-line-2 px-2.5 py-1 text-left text-xs text-muted hover:border-brand/50 hover:text-brand-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Field label="Preview text" hint="(shown after the subject in the inbox)">
              <Input value={c.preheader ?? ""} disabled={readOnly} onChange={(e) => set({ preheader: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From name">
                <Input value={c.from_name ?? ""} disabled={readOnly} onChange={(e) => set({ from_name: e.target.value })} />
              </Field>
              <Field label="Reply-to email">
                <Input type="email" value={c.reply_to ?? ""} disabled={readOnly} onChange={(e) => set({ reply_to: e.target.value })} />
              </Field>
            </div>
            <Field label="Send to segment">
              <Select value={c.segment_id ?? ""} disabled={readOnly} onChange={(e) => set({ segment_id: e.target.value || null })}>
                <option value="">Choose a segment…</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {segments.length === 0 && (
                <p className="mt-1 text-xs text-faint">
                  No segments yet —{" "}
                  <Link href="/app/segments" className="text-brand-ink">
                    create one
                  </Link>
                  .
                </p>
              )}
              {c.segment_id && recipients !== null && (
                <p className="mt-1 text-xs text-muted">
                  {recipients} opted-in recipient(s) with email · {segTotal} contact(s) in segment
                </p>
              )}
            </Field>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-muted">Body</span>
                {!readOnly && (
                  <button onClick={aiBody} disabled={busy === "body"} className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink disabled:opacity-50">
                    <Sparkles className="size-3.5" /> {busy === "body" ? "Writing…" : "AI write email"}
                  </button>
                )}
              </div>
              <Textarea value={c.body} disabled={readOnly} onChange={(e) => set({ body: e.target.value })} className="min-h-64 font-mono text-[13px]" />
              <p className="mt-1 text-xs text-faint">Blank line = new paragraph · start a line with “- ” for bullets · an unsubscribe link is added automatically.</p>
            </div>
          </div>
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Preview" description={`Subject: ${c.subject.replace(/\{\{\s*name\s*\}\}/gi, "Priya") || "—"}`} />
          <div className="p-3">
            <iframe title="Email preview" sandbox="" srcDoc={preview} className="h-[560px] w-full rounded-xl border border-line bg-white" />
          </div>
        </Card>
      </div>

      {sends.length > 0 && (
        <Card>
          <CardHeader
            title="Send log"
            description={Object.entries(counts)
              .map(([k, v]) => `${v} ${k}`)
              .join(" · ")}
          />
          <div className="max-h-96 divide-y divide-line overflow-y-auto">
            {sends.map((s) => (
              <div key={s.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <span className="min-w-0 truncate">{s.email}</span>
                <span className="flex min-w-0 items-center gap-2">
                  {s.error && <span className="truncate text-xs text-danger">{s.error}</span>}
                  <Badge tone={s.status === "sent" ? "green" : s.status === "failed" ? "red" : s.status === "simulated" ? "yellow" : "gray"}>{s.status}</Badge>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Send this email?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={sendNow} loading={busy === "send"} disabled={!recipients}>
              <Send className="size-4" /> Send to {recipients ?? 0}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>
            <span className="font-semibold">{c.subject}</span> will be sent to{" "}
            <span className="font-semibold">{recipients ?? 0} recipient(s)</span> in “{segments.find((s) => s.id === c.segment_id)?.name}”.
          </p>
          <p className="rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-info">
            Only contacts who opted in to marketing and have an email address are included. Every email has an unsubscribe link.
          </p>
          {segTotal !== null && recipients !== null && segTotal > recipients && (
            <p className="text-muted">{segTotal - recipients} contact(s) in the segment are skipped (no email or no consent).</p>
          )}
          <p className="text-muted">Sent emails can&apos;t be edited. Use “Send test” first to check how it looks.</p>
        </div>
      </Modal>
    </div>
  );
}

function EmailInner() {
  const id = useSearchParams().get("id");
  return id ? <CampaignEditor key={id} id={id} /> : <CampaignList />;
}

export default function EmailPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <EmailInner />
    </Suspense>
  );
}
