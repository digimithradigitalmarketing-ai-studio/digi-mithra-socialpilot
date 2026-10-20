"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, HeartPulse, Plug, Plus, ShieldCheck, Unplug, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { Badge, Button, Card, DemoBadge, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, type Tone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { ProviderIcon, providerName } from "@/components/provider-badge";
import { PROVIDERS, PROVIDER_LIST } from "@/lib/providers";
import type { Provider, SocialAccount } from "@/lib/types";
import { cn, errMsg, timeAgo } from "@/lib/utils";

const statusTone: Record<SocialAccount["status"], Tone> = {
  connected: "green",
  pending: "yellow",
  expired: "red",
  error: "red",
  disconnected: "gray",
};

const CAPS: { key: keyof SocialAccount["capabilities"]; label: string }[] = [
  { key: "can_publish", label: "Publish" },
  { key: "can_read_messages", label: "Read messages" },
  { key: "can_reply", label: "Reply" },
  { key: "can_read_reviews", label: "Reviews" },
];

const SCOPE_CHECKLIST: Record<Provider, string[]> = {
  instagram: ["instagram_basic", "instagram_content_publish", "instagram_manage_comments", "instagram_manage_messages", "pages_show_list", "Meta App Review approval"],
  facebook: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_messaging", "Meta App Review approval"],
  whatsapp: ["whatsapp_business_management", "whatsapp_business_messaging", "Verified business", "Approved message templates"],
  google_business: ["https://www.googleapis.com/auth/business.manage", "Business Profile API access approval"],
  youtube: ["youtube.upload", "youtube.readonly", "Google OAuth verification", "Quota allocation"],
  linkedin: ["w_organization_social", "r_organization_social", "Community Management API approval"],
  tiktok: ["video.publish", "video.upload", "Content Posting API audit"],
  x: ["tweet.read", "tweet.write", "users.read", "Paid API tier"],
};

export default function AccountsPage() {
  const supabase = createClient();
  const toast = useToast();
  const { workspace, can } = useApp();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>("instagram");
  const [demoName, setDemoName] = useState("");
  const [connecting, setConnecting] = useState(false);
  const manage = can("manage_accounts");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("social_accounts")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });
    if (error) toast(errMsg(error), "error");
    setAccounts((data ?? []) as SocialAccount[]);
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

  const addDemo = async () => {
    setConnecting(true);
    const { error } = await supabase.rpc("demo_connect_account", {
      p_workspace: workspace.id,
      p_provider: provider,
      p_name: demoName.trim() || `${workspace.name} ${PROVIDERS[provider].name}`,
    });
    setConnecting(false);
    if (error) return toast(errMsg(error), "error");
    toast(`Demo ${PROVIDERS[provider].name} account added`);
    setOpen(false);
    setDemoName("");
    load();
  };

  const visible = accounts.filter((a) => a.status !== "disconnected");
  const disconnected = accounts.filter((a) => a.status === "disconnected");

  return (
    <div>
      <PageHeader
        title="Connected accounts"
        description="Social profiles this workspace can publish to and receive messages from. A connected token is not proof every feature works — check the capability matrix."
        actions={
          manage && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Connect account
            </Button>
          )
        }
      />

      {loading ? (
        <LoadingBlock />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={Plug}
            title="No accounts connected"
            description="Connect an official account (requires provider app review) or add a demo account to try publishing, inbox and analytics."
            action={manage && <Button onClick={() => setOpen(true)}>Connect account</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start gap-3">
                <ProviderIcon provider={a.provider} className="size-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate font-semibold">{a.display_name ?? providerName(a.provider)}</p>
                    {a.is_demo && <DemoBadge />}
                    <Badge tone={statusTone[a.status]}>{a.status}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted">
                    {providerName(a.provider)} {a.handle && `· ${a.handle}`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    Last checked {a.last_checked_at ? timeAgo(a.last_checked_at) : "never"}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {CAPS.map((c) => {
                  const on = !!a.capabilities?.[c.key];
                  return (
                    <div
                      key={c.key}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs",
                        on ? "border-brand/30 bg-brand/5 text-ink" : "border-line text-faint",
                      )}
                    >
                      {on ? <Check className="size-3.5 text-brand" /> : <X className="size-3.5" />}
                      {c.label}
                    </div>
                  );
                })}
              </div>

              {a.scopes?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {a.scopes.map((s) => (
                    <span key={s} className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                      {s}
                    </span>
                  ))}
                </div>
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
          ))}
        </div>
      )}

      {disconnected.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Disconnected</p>
          <div className="space-y-2">
            {disconnected.map((a) => (
              <Card key={a.id} className="flex items-center gap-3 p-3 opacity-70">
                <ProviderIcon provider={a.provider} />
                <p className="min-w-0 flex-1 truncate text-sm">{a.display_name ?? providerName(a.provider)}</p>
                {a.is_demo && <DemoBadge />}
                <Badge>disconnected</Badge>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Connect a social account" wide>
        <p className="mb-2 text-xs font-medium text-muted">Choose a network</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PROVIDER_LIST.map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={cn(
                "flex items-center gap-2 rounded-xl border p-2.5 text-left text-sm transition-colors",
                provider === p ? "border-brand bg-brand/10" : "border-line-2 hover:border-brand/40",
              )}
            >
              <ProviderIcon provider={p} className="size-7" />
              <span className="truncate">{PROVIDERS[p].name}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">{PROVIDERS[provider].notes}</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-line-2 bg-bg p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-sky-300" />
              <p className="font-semibold">Official account (OAuth)</p>
            </div>
            <p className="mt-1 text-xs text-muted">
              Live connections need a {PROVIDERS[provider].name} developer app approved for these permissions. The OAuth gateway is not configured for this
              deployment yet, so this option is unavailable.
            </p>
            <ul className="mt-3 space-y-1">
              {SCOPE_CHECKLIST[provider].map((s) => (
                <li key={s} className="flex items-start gap-2 text-xs text-muted">
                  <span className="mt-0.5 size-3 shrink-0 rounded-sm border border-line-2" />
                  <span className="break-all font-mono">{s}</span>
                </li>
              ))}
            </ul>
            <Button className="mt-3 w-full" variant="secondary" disabled>
              Not configured
            </Button>
          </div>

          <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
            <div className="flex items-center gap-2">
              <Plug className="size-4 text-brand" />
              <p className="font-semibold">Demo account</p>
              <DemoBadge />
            </div>
            <p className="mt-1 text-xs text-muted">
              Simulated connection with sample metrics. Publishing is simulated — nothing is posted to {PROVIDERS[provider].name}.
            </p>
            <Field label="Display name" className="mt-3">
              <Input value={demoName} onChange={(e) => setDemoName(e.target.value)} placeholder={`${workspace.name} ${PROVIDERS[provider].name}`} />
            </Field>
            <Button className="mt-3 w-full" loading={connecting} onClick={addDemo}>
              Add demo account
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
