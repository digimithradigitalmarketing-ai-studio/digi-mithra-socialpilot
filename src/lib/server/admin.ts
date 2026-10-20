import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { IntegrationError as HttpError } from "@/lib/server/errors";

/** Service-role client. Bypasses RLS — use only after the caller has been authorized. */
export function createAdminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) throw new HttpError(503, "Integration not configured: SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const MANAGER_ROLES = ["owner", "admin"];

/**
 * Verifies the signed-in caller may act on a workspace with one of `wsRoles`
 * (tenant owners/admins always pass). Uses the caller's own RLS-scoped client.
 */
export async function authorizeWorkspace(
  userClient: SupabaseClient,
  workspaceId: string | null | undefined,
  wsRoles: string[] = ["manager"],
) {
  if (!workspaceId) throw new HttpError(400, "workspaceId is required");
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) throw new HttpError(401, "Not signed in");
  const { data: ws } = await userClient.from("workspaces").select("id,tenant_id,name").eq("id", workspaceId).maybeSingle();
  if (!ws) throw new HttpError(404, "Workspace not found");
  const [{ data: tm }, { data: wm }] = await Promise.all([
    userClient.from("tenant_members").select("role").eq("tenant_id", ws.tenant_id).eq("user_id", user.id).maybeSingle(),
    userClient.from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", user.id).maybeSingle(),
  ]);
  const ok = (tm && MANAGER_ROLES.includes(tm.role)) || (wm && wsRoles.includes(wm.role));
  if (!ok) throw new HttpError(403, "You don't have permission to manage connections in this workspace");
  return { user, workspace: ws as { id: string; tenant_id: string; name: string } };
}
