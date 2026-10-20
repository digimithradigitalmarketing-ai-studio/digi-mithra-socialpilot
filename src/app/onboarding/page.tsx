"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Briefcase, Building2, MailOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, LoadingBlock, Select } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn, errMsg } from "@/lib/utils";

interface Invite {
  token: string;
  tenant_name: string;
  role: string;
  workspace_name: string | null;
}

const INDUSTRIES = ["Fitness & gym", "Events & production", "Restaurant & cafe", "Salon & beauty", "Retail", "Education", "Healthcare", "Real estate", "Agency", "Other"];

function Onboarding() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const inviteToken = params.get("invite");
  const forceNew = params.get("new") === "1";

  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"business" | "agency">("business");
  const [name, setName] = useState("");
  const [wsName, setWsName] = useState("");
  const [industry, setIndustry] = useState(INDUSTRIES[0]);

  const goToApp = useCallback(
    (tenantId?: string) => {
      try {
        if (tenantId) localStorage.setItem("sp.tenant", tenantId);
        localStorage.removeItem("sp.workspace");
      } catch {}
      router.replace("/app");
      router.refresh();
    },
    [router],
  );

  const accept = useCallback(
    async (token: string) => {
      setBusy(true);
      const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
      setBusy(false);
      if (error) return toast(errMsg(error), "error");
      toast("Invitation accepted — welcome aboard!");
      goToApp(data as string);
    },
    [supabase, toast, goToApp],
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.replace("/login?next=/onboarding");
      const [{ data: inv }, { count }] = await Promise.all([
        supabase.rpc("my_invitations"),
        supabase.from("tenant_members").select("tenant_id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      if ((count ?? 0) > 0 && !forceNew && !inviteToken && !(inv ?? []).length) return router.replace("/app");
      setInvites((inv ?? []) as Invite[]);
      setLoading(false);
    })();
  }, [supabase, router, forceNew, inviteToken]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("create_tenant", {
      p_name: name,
      p_kind: kind,
      p_workspace: kind === "agency" ? wsName || null : name,
      p_industry: industry,
    });
    setBusy(false);
    if (error) return toast(errMsg(error), "error");
    toast("Your workspace is ready 🎉");
    goToApp(data as string);
  };

  if (loading) return <LoadingBlock label="Preparing your account…" />;

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div className="text-center">
        <Image src="/mark.png" alt="" width={56} height={56} className="mx-auto rounded-2xl" />
        <h1 className="mt-3 text-2xl font-bold">Set up Social Pilot</h1>
        <p className="text-sm text-muted">Create your organization or join one you were invited to.</p>
      </div>

      {(inviteToken || invites.length > 0) && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <MailOpen className="size-4 text-brand-ink" /> Invitations
          </h2>
          {inviteToken && !invites.some((i) => i.token === inviteToken) && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-line-2 p-3">
              <p className="text-sm text-muted">You opened an invitation link.</p>
              <Button size="sm" loading={busy} onClick={() => accept(inviteToken)}>
                Accept
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i.token} className="flex items-center justify-between gap-3 rounded-xl border border-line-2 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.tenant_name}</p>
                  <p className="text-xs text-muted">
                    {i.role}
                    {i.workspace_name ? ` · ${i.workspace_name}` : ""}
                  </p>
                </div>
                <Button size="sm" loading={busy} onClick={() => accept(i.token)}>
                  Join
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <form onSubmit={create} className="space-y-4">
          <h2 className="font-semibold">Create a new organization</h2>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { v: "business", icon: Building2, title: "My business", text: "Manage your own brand" },
                { v: "agency", icon: Briefcase, title: "Agency", text: "Manage many client brands" },
              ] as const
            ).map((o) => (
              <button
                type="button"
                key={o.v}
                onClick={() => setKind(o.v)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  kind === o.v ? "border-brand bg-brand/10" : "border-line-2 hover:border-brand/40",
                )}
              >
                <o.icon className={cn("size-5", kind === o.v ? "text-brand-ink" : "text-muted")} />
                <p className="mt-2 text-sm font-semibold">{o.title}</p>
                <p className="text-xs text-muted">{o.text}</p>
              </button>
            ))}
          </div>
          <Field label={kind === "agency" ? "Agency name" : "Business name"}>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "agency" ? "Bloom All Production" : "Dhanus Gold Fitness"} />
          </Field>
          {kind === "agency" && (
            <Field label="First client workspace" hint="(you can add more later)">
              <Input value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Client brand name" />
            </Field>
          )}
          <Field label="Industry">
            <Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              {INDUSTRIES.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Create & start 14-day trial
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <div className="brand-glow min-h-dvh px-4 py-10">
      <Suspense fallback={<LoadingBlock />}>
        <Onboarding />
      </Suspense>
    </div>
  );
}
