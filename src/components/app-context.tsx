"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Membership, Tenant, TenantRole, Workspace, WsRole } from "@/lib/types";

interface AppState {
  user: User;
  profile: { full_name: string | null; email: string | null } | null;
  memberships: Membership[];
  tenant: Tenant;
  tenantRole: TenantRole;
  workspaces: Workspace[];
  workspace: Workspace;
  /** effective role inside the current workspace */
  wsRole: WsRole;
  switchTenant: (id: string) => void;
  switchWorkspace: (id: string) => void;
  refresh: () => Promise<void>;
  can: (action: Action) => boolean;
}

export type Action = "write_content" | "approve" | "manage_workspace" | "manage_accounts" | "support" | "admin" | "owner";

const ROLE_ACTIONS: Record<WsRole, Action[]> = {
  admin: ["write_content", "approve", "manage_workspace", "manage_accounts", "support", "admin"],
  manager: ["write_content", "approve", "manage_workspace", "manage_accounts", "support"],
  editor: ["write_content", "support"],
  support: ["support"],
  approver: ["approve"],
  analyst: [],
  viewer: [],
};

const Ctx = createContext<AppState | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}

const LS_TENANT = "sp.tenant";
const LS_WS = "sp.workspace";

function readLS(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function AppProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const supabase = createClient();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppState["profile"]>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [wsMemberRoles, setWsMemberRoles] = useState<Record<string, WsRole>>({});
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    setUser(user);
    const [{ data: prof }, { data: mems }] = await Promise.all([
      supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle(),
      supabase.from("tenant_members").select("tenant_id,user_id,role,tenants(*)").eq("user_id", user.id),
    ]);
    setProfile(prof ?? null);
    const ms = ((mems ?? []) as unknown as Membership[]).filter((m) => m.tenants);
    setMemberships(ms);
    if (!ms.length) {
      router.replace("/onboarding");
      return;
    }
    const savedT = readLS(LS_TENANT);
    const t = ms.find((m) => m.tenant_id === savedT)?.tenant_id ?? ms[0].tenant_id;
    setTenantId(t);

    const [{ data: ws }, { data: wm }] = await Promise.all([
      supabase.from("workspaces").select("*").eq("tenant_id", t).order("created_at"),
      supabase.from("workspace_members").select("workspace_id,role").eq("tenant_id", t).eq("user_id", user.id),
    ]);
    const list = (ws ?? []) as Workspace[];
    setWorkspaces(list);
    setWsMemberRoles(Object.fromEntries((wm ?? []).map((r: { workspace_id: string; role: WsRole }) => [r.workspace_id, r.role])));
    const savedW = readLS(LS_WS);
    setWorkspaceId(list.find((w) => w.id === savedW)?.id ?? list[0]?.id ?? null);
    setReady(true);
  }, [supabase, router]);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo<AppState | null>(() => {
    if (!user || !tenantId) return null;
    const membership = memberships.find((m) => m.tenant_id === tenantId);
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!membership || !workspace) return null;
    const tenantRole = membership.role;
    const wsRole: WsRole =
      tenantRole === "owner" || tenantRole === "admin" ? "admin" : (wsMemberRoles[workspace.id] ?? "viewer");
    return {
      user,
      profile,
      memberships,
      tenant: membership.tenants,
      tenantRole,
      workspaces,
      workspace,
      wsRole,
      switchTenant: (id) => {
        writeLS(LS_TENANT, id);
        setReady(false);
        load();
      },
      switchWorkspace: (id) => {
        writeLS(LS_WS, id);
        setWorkspaceId(id);
      },
      refresh: load,
      can: (action) => (action === "owner" ? tenantRole === "owner" : ROLE_ACTIONS[wsRole].includes(action)),
    };
  }, [user, profile, memberships, tenantId, workspaces, workspaceId, wsMemberRoles, load]);

  if (!ready || !value) {
    if (ready && user && tenantId && !workspaces.length) {
      return (
        <div className="grid min-h-dvh place-items-center p-6 text-center text-sm text-muted">
          You don&apos;t have access to any workspace in this organization yet. Ask an admin to add you.
        </div>
      );
    }
    return <>{fallback}</>;
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
