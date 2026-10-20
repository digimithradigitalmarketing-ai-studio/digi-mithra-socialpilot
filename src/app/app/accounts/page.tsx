"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Check, Copy, ExternalLink, HeartPulse, KeyRound, Link2, Plug, Plus, ShieldCheck, Unplug, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, CardHeader, DemoBadge, Field, Input, LoadingBlock, Modal, PageHeader, type Tone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { ProviderIcon, providerName } from "@/components/provider-badge";
import { PROVIDERS } from "@/lib/providers";
import type { Provider, SocialAccount } from "@/lib/types";
import { cn, errMsg, timeAgo } from "@/lib/utils";

interface Status {
  meta: boolean;
  meta_app: boolean;
  meta_webhook: boolean;
  whatsapp: boolean;
  google: boolean;
  gmail: boolean;
  encryption: boolean;
  service_role: boolean;
  redis: boolean;
  webhook_url: string;
  oauth_redirect_url: string;
}

type Availability = "ready" | "setup" | "approval" | "planned" | "builtin";

interface ChannelDef {
  id: string;
  provider: Provider;
  title: string;
  does: string;
  requirements: string[];
  /** permissions the account needs for full features — used for permission diagnostics */
  required: string[];
  availability: (s: Status | null) => Availability;
  metaProduct?: "facebook" | "instagram" | "whatsapp";
}

const CHANNELS: ChannelDef[] = [
  {
    id: "instagram",
    provider: "instagram",
    title: "Instagram professional account",
    does: "Publish posts, read and reply to DMs and comments.",
    requirements: [
      "Instagram Business or Creator account linked to a Facebook Page",
      "Meta app with Facebook Login for Business",
      "App Review: instagram_basic, instagram_content_publish, instagram_manage_messages, instagram_manage_comments",
      "Business verification for Advanced Access",
    ],
    required: ["instagram_basic", "instagram_content_publish", "instagram_manage_messages", "pages_show_list"],
    availability: (s) => (s?.meta ? "ready" : "setup"),
    metaProduct: "instagram",
  },
  {
    id: "facebook",
    provider: "facebook",
    title: "Facebook Pages & Messenger",
    does: "Publish to Pages and handle Messenger conversations.",
    requirements: ["Page admin access", "App Review: pages_manage_posts, pages_messaging, pages_read_engagement", "Webhook subscription for messages"],
    required: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_messaging"],
    availability: (s) => (s?.meta ? "ready" : "setup"),
    metaProduct: "facebook",
  },
  {
    id: "whatsapp",
    provider: "whatsapp",
    title: "WhatsApp Cloud API",
    does: "Receive and reply to customer messages inside the 24-hour window; templates outside it.",
    requirements: [
      "WhatsApp Business Account (WABA) and registered phone number",
      "whatsapp_business_messaging + whatsapp_business_management",
      "Approved message templates for business-initiated messages",
      "Customer opt-in for marketing messages",
    ],
    required: ["whatsapp_business_messaging", "whatsapp_business_management"],
    availability: (s) => (s?.whatsapp ? "ready" : "setup"),
    metaProduct: "whatsapp",
  },
  {
    id: "coexistence",
    provider: "whatsapp",
    title: "WhatsApp Business App coexistence",
    does: "Use the same number in the WhatsApp Business App and the Cloud API.",
    requirements: [
      "Only for eligible WhatsApp Business App numbers",
      "Onboarding through Meta Embedded Signup (coexistence flow)",
      "Requires Meta Tech Provider / Solution Partner onboarding",
    ],
    required: [],
    availability: () => "approval",
  },
  {
    id: "gmail",
    provider: "gmail",
    title: "Gmail",
    does: "Bring customer emails into the unified inbox and reply from it.",
    requirements: [
      "Google Cloud OAuth client",
      "Restricted Gmail scopes require Google OAuth verification",
      "Annual third-party security assessment (CASA) for restricted scopes",
    ],
    required: [],
    availability: () => "approval",
  },
  {
    id: "google_business",
    provider: "google_business",
    title: "Google Business Profile",
    does: "Monitor reviews and post replies.",
    requirements: ["Business Profile API access approved by Google", "OAuth scope business.manage", "Verified business location"],
    required: ["business.manage"],
    availability: () => "approval",
  },
  {
    id: "youtube",
    provider: "youtube",
    title: "YouTube",
    does: "Upload videos and Shorts to your channel.",
    requirements: ["Google OAuth verification", "youtube.upload scope", "API quota allocation (audit for public uploads)"],
    required: ["youtube.upload"],
    availability: () => "approval",
  },
  {
    id: "linkedin",
    provider: "linkedin",
    title: "LinkedIn",
    does: "Publish to company pages.",
    requirements: ["Community Management API access approval", "w_organization_social scope", "Page admin role"],
    required: ["w_organization_social"],
    availability: () => "approval",
  },
  {
    id: "website",
    provider: "website",
    title: "Website chat",
    does: "Embed a chat widget on your website. Chats arrive in the unified inbox.",
    requirements: ["Paste one script tag into your website", "No provider approval needed"],
    required: [],
    availability: () => "builtin",
  },
  { id: "tiktok", provider: "tiktok", title: "TikTok", does: "Content Posting API.", requirements: ["Content Posting API audit"], required: [], availability: () => "planned" },
  { id: "x", provider: "x", title: "X (Twitter)", does: "Post updates.", requirements: ["Paid API tier"], required: [], availability: () => "planned" },
  { id: "threads", provider: "threads", title: "Threads", does: "Publish to Threads.", requirements: ["Threads API app review"], required: [], availability: () => "planned" },
];

const AVAIL: Record<Availability, { label: string; tone: Tone }> = {
  ready: { label: "Ready to connect", tone: "green" },
  setup: { label: "Admin setup needed", tone: "yellow" },
  approval: { label: "Awaiting provider approval", tone: "gray" },
  planned: { label: "Planned", tone: "gray" },
  builtin: { label: "Available", tone: "green" },
};

const statusTone: Record<SocialAccount["status"], Tone> = { connected: "green", pending: "yellow", expired: "red", error: "red", disconnected: "gray" };

const CAPS: { key: keyof SocialAccount["capabilities"]; label: string }[] = [
  { key: "can_publish", label: "Publish" },
  { key: "can_read_messages", label: "Read messages" },
  { key: "can_reply", label: "Reply" },
  { key: "can_read_reviews", label: "Reviews" },
];

const DEMO_PROVIDERS: Provider[] = ["instagram", "facebook", "whatsapp", "google_business", "youtube", "linkedin"];

function requiredFor(provider: string) {
  return CHANNELS.find((c) => c.provider === provider && c.required.length)?.required ?? [];
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ConnectionCenter />
    </Suspense>
  );
}

function ConnectionCenter() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { workspace, can } = useApp();
  const manage = can("manage_accounts");
  const isAdmin = can("admin");

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [widgetKey, setWidgetKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  // results from the OAuth callback
  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) toast(`${connected} account${connected === "1" ? "" : "s"} connected`);
    if (error) toast(error, "error");
    if (connected || error) router.replace("/app/accounts");
  }, [params, router, toast]);

  const load = useCallback(async () => {
    setLoading(true);
    const [acc, ws, st] = await Promise.all([
      supabase.from("social_accounts").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
      supabase.from("workspaces").select("chat_widget_key").eq("id", workspace.id).maybeSingle(),
      fetch("/api/connections/status")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    if (acc.error) toast(errMsg(acc.error), "error");
    setAccounts((acc.data ?? []) as SocialAccount[]);
    setWidgetKey(((ws.data as { chat_widget_key?: string } | null)?.chat_widget_key as string | undefined) ?? null);
    setStatus(st as Status | null);
    setLoading(false);
  }, [supabase, workspace.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const checkHealth = async (a: SocialAccount) => {
    setBusy(a.id);
    const { data, error } = await supabase.rpc("check_account_health", { p_account: a.id });
    setBusy(null);
    if (error) return toast(errMsg(error), "error");
    toast(`${a.display_name ?? providerName(a.provider)}: ${data}`, data === "connected" ? "success" : "info");
    load();
  };

  const disconnect = async (a: SocialAccount) => {
    if (!confirm(`Disconnect ${a.display_name ?? providerName(a.provider)}? Scheduled posts to it will fail.`)) return;
    setBusy(a.id);
    const { error } = await supabase.from("social_accounts").update({ status: "disconnected" }).eq("id", a.id).eq("workspace_id", workspace.id);
    setBusy(null);
    if (error) return toast(errMsg(error), "error");
    toast("Account disconnected");
    load();
  };

  const copy = async (text: string, what = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      toast(what);
    } catch {
      toast("Copy failed — select and copy manually", "error");
    }
  };

  const visible = accounts.filter((a) => a.status !== "disconnected");
  const disconnected = accounts.filter((a) => a.status === "disconnected");
  const snippet = widgetKey && origin ? `<script src="${origin}/widget.js" data-key="${widgetKey}" async></script>` : "";
  const missingSetup = useMemo(() => {
    if (!status) return [];
    const m: string[] = [];
    if (!status.meta_app) m.push("META_APP_ID, META_APP_SECRET");
    if (!status.service_role) m.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!status.encryption) m.push("TOKEN_ENCRYPTION_KEY");
    if (!status.meta_webhook) m.push("META_WEBHOOK_VERIFY_TOKEN");
    if (!status.redis) m.push("REDIS_URL (publishing worker)");
    return m;
  }, [status]);

  if (loading) return <LoadingBlock />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connection center"
        description="Official connections only. A connected token is not proof every feature works — check each account's permission diagnostics."
        actions={
          manage && (
            <Button variant="secondary" onClick={() => setDemoOpen(true)}>
              <Plus className="size-4" /> Add demo account
            </Button>
          )
        }
      />

      {isAdmin && status && (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <KeyRound className="size-4 text-brand-ink" /> Admin setup
              </span>
            }
            description="Server configuration for live connections. Values are never shown here."
          />
          <div className="space-y-3 p-4 text-sm sm:p-5">
            {missingSetup.length ? (
              <p className="flex items-start gap-2 text-warn">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Missing environment variables: {missingSetup.join(" · ")}
              </p>
            ) : (
              <p className="flex items-center gap-2 text-brand-ink">
                <Check className="size-4" /> Live connection infrastructure is configured.
              </p>
            )}
            <div className="grid gap-2 md:grid-cols-2">
              {[
                { label: "OAuth redirect URI (Meta app → Facebook Login settings)", value: status.oauth_redirect_url },
                { label: "Webhook callback URL (verify token = META_WEBHOOK_VERIFY_TOKEN)", value: status.webhook_url },
              ].map((r) => (
                <div key={r.label} className="min-w-0 rounded-xl border border-line bg-panel-2 p-3">
                  <p className="text-xs text-muted">{r.label}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate text-xs">{r.value}</code>
                    <button aria-label="Copy" onClick={() => copy(r.value)} className="text-muted hover:text-ink">
                      <Copy className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-faint">
              Subscribe the webhook to: Page <code>messages</code>, Instagram <code>messages</code>, WhatsApp Business Account <code>messages</code>.
            </p>
          </div>
        </Card>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold">Connected accounts</h3>
        {visible.length === 0 ? (
          <Card className="p-5 text-sm text-muted">No accounts connected yet. Connect an official account below, or add a demo account to try things out.</Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {visible.map((a) => {
              const required = requiredFor(a.provider);
              const missing = a.is_demo ? [] : required.filter((s) => !a.scopes?.includes(s));
              const diagnostics = ((a.capabilities as { diagnostics?: string[] })?.diagnostics ?? []).filter(Boolean);
              return (
                <Card key={a.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <ProviderIcon provider={a.provider} className="size-10" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate font-semibold">{a.display_name ?? providerName(a.provider)}</p>
                        {a.is_demo ? <DemoBadge /> : <Badge tone="blue">Live</Badge>}
                        <Badge tone={statusTone[a.status]}>{a.status}</Badge>
                      </div>
                      <p className="truncate text-xs text-muted">
                        {providerName(a.provider)} {a.handle && `· ${a.handle}`}
                      </p>
                      <p className="mt-0.5 text-[11px] text-faint">Last checked {a.last_checked_at ? timeAgo(a.last_checked_at) : "never"}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {CAPS.map((c) => {
                      const on = !!a.capabilities?.[c.key];
                      return (
                        <div
                          key={c.key}
                          className={cn("flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs", on ? "border-brand/30 bg-brand/5 text-ink" : "border-line text-faint")}
                        >
                          {on ? <Check className="size-3.5 text-brand-ink" /> : <X className="size-3.5" />}
                          {c.label}
                        </div>
                      );
                    })}
                  </div>

                  {!a.is_demo && required.length > 0 && (
                    <div className="mt-3 rounded-xl border border-line p-3">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Permission diagnostics</p>
                      <div className="flex flex-wrap gap-1">
                        {required.map((s) => {
                          const ok = a.scopes?.includes(s);
                          return (
                            <span
                              key={s}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px]",
                                ok ? "bg-brand/10 text-brand-ink" : "bg-danger/10 text-danger",
                              )}
                            >
                              {ok ? <Check className="size-3" /> : <X className="size-3" />}
                              {s}
                            </span>
                          );
                        })}
                      </div>
                      {missing.length > 0 && (
                        <p className="mt-2 text-xs text-danger">Missing permissions — reconnect and grant them, or request them in Meta App Review.</p>
                      )}
                    </div>
                  )}

                  {diagnostics.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {diagnostics.map((d) => (
                        <li key={d} className="flex items-start gap-1.5 text-xs text-warn">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {d}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                    <Button size="sm" variant="secondary" loading={busy === a.id} onClick={() => checkHealth(a)}>
                      <HeartPulse className="size-3.5" /> Check health
                    </Button>
                    {manage && (
                      <Button size="sm" variant="danger" disabled={busy === a.id} onClick={() => disconnect(a)}>
                        <Unplug className="size-3.5" /> Disconnect
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        {disconnected.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-faint">Disconnected</p>
            {disconnected.map((a) => (
              <Card key={a.id} className="flex items-center gap-3 p-3 opacity-70">
                <ProviderIcon provider={a.provider} />
                <p className="min-w-0 flex-1 truncate text-sm">{a.display_name ?? providerName(a.provider)}</p>
                {a.is_demo && <DemoBadge />}
                <Badge>disconnected</Badge>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Channels</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CHANNELS.map((c) => {
            const avail = c.availability(status);
            return (
              <Card key={c.id} className={cn("flex flex-col p-4", avail === "planned" && "opacity-75")}>
                <div className="flex items-start gap-3">
                  <ProviderIcon provider={c.provider} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.title}</p>
                    <Badge tone={AVAIL[avail].tone} className="mt-1">
                      {AVAIL[avail].label}
                    </Badge>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted">{c.does}</p>
                <ul className="mt-3 space-y-1">
                  {c.requirements.map((r) => (
                    <li key={r} className="flex items-start gap-2 text-xs text-muted">
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-faint" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>

                {c.id === "website" && snippet && (
                  <div className="mt-3 rounded-xl border border-line bg-panel-2 p-2">
                    <code className="block text-[11px] break-all">{snippet}</code>
                  </div>
                )}

                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {c.metaProduct && manage && (
                    avail === "ready" ? (
                      <a href={`/api/oauth/meta/start?workspaceId=${workspace.id}&product=${c.metaProduct}`}>
                        <Button size="sm">
                          <Link2 className="size-3.5" /> Connect with Meta
                        </Button>
                      </a>
                    ) : (
                      <Button size="sm" variant="secondary" disabled title="An admin must configure the Meta app first">
                        Admin setup needed
                      </Button>
                    )
                  )}
                  {c.id === "whatsapp" && manage && (
                    <Button size="sm" variant="secondary" disabled={!status?.whatsapp} onClick={() => setWaOpen(true)}>
                      Enter Cloud API details
                    </Button>
                  )}
                  {c.id === "google_business" && (
                    <a href="/app/reviews">
                      <Button size="sm" variant="secondary">
                        Use manual mode in Reviews
                      </Button>
                    </a>
                  )}
                  {c.id === "gmail" && (
                    <p className="text-xs text-faint">
                      {status?.gmail ? "Google verification recorded — Gmail sync is coming soon." : "Not available until Google verification is complete."}
                    </p>
                  )}
                  {c.id === "coexistence" && <p className="text-xs text-faint">Not available until Meta approves Tech Provider onboarding.</p>}
                  {c.id === "website" && snippet && (
                    <>
                      <Button size="sm" onClick={() => copy(snippet, "Embed code copied")}>
                        <Copy className="size-3.5" /> Copy embed code
                      </Button>
                      <a href={`/chat/${widgetKey}`} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="secondary">
                          <ExternalLink className="size-3.5" /> Open test chat
                        </Button>
                      </a>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} onDone={load} />
      <WhatsAppModal open={waOpen} onClose={() => setWaOpen(false)} onDone={load} />
    </div>
  );
}

function DemoModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const supabase = createClient();
  const toast = useToast();
  const { workspace } = useApp();
  const [provider, setProvider] = useState<Provider>("instagram");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("demo_connect_account", {
      p_workspace: workspace.id,
      p_provider: provider,
      p_name: name.trim() || `${workspace.name} ${PROVIDERS[provider].name}`,
    });
    setBusy(false);
    if (error) return toast(errMsg(error), "error");
    toast(`Demo ${PROVIDERS[provider].name} account added`);
    setName("");
    onClose();
    onDone();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a demo account"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={add}>
            <Plug className="size-4" /> Add demo account
          </Button>
        </>
      }
    >
      <p className="mb-3 flex items-center gap-2 text-sm text-muted">
        <DemoBadge /> Simulated connection with sample metrics. Nothing is posted or sent to a real network.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DEMO_PROVIDERS.map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={cn("flex items-center gap-2 rounded-xl border p-2.5 text-left text-sm", provider === p ? "border-brand bg-brand/10" : "border-line-2 hover:border-brand/40")}
          >
            <ProviderIcon provider={p} className="size-7" />
            <span className="truncate">{PROVIDERS[p].name}</span>
          </button>
        ))}
      </div>
      <Field label="Display name" className="mt-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${workspace.name} ${PROVIDERS[provider].name}`} />
      </Field>
    </Modal>
  );
}

function WhatsAppModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { workspace } = useApp();
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/connections/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, phoneNumberId, wabaId, accessToken: token }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; display_phone_number?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Connection failed");
      toast(`WhatsApp ${json.display_phone_number ?? "number"} connected`);
      setToken("");
      onClose();
      onDone();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect WhatsApp Cloud API"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save} disabled={!phoneNumberId || !wabaId || !token}>
            Verify & connect
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Find these in Meta Business Suite → WhatsApp Manager / your Meta app&apos;s WhatsApp setup. Use a <strong>system user</strong> access token with
          whatsapp_business_messaging and whatsapp_business_management. The token is verified with Meta, then encrypted and stored server-side only.
        </p>
        <Field label="Phone number ID">
          <Input inputMode="numeric" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value.trim())} />
        </Field>
        <Field label="WhatsApp Business Account ID">
          <Input inputMode="numeric" value={wabaId} onChange={(e) => setWabaId(e.target.value.trim())} />
        </Field>
        <Field label="Access token">
          <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
