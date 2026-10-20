import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encrypt, toBytea } from "@/lib/server/crypto";
import { IntegrationError } from "@/lib/server/errors";

interface AccountInput {
  tenantId: string;
  workspaceId: string;
  provider: string;
  providerAccountId: string;
  displayName: string | null;
  handle: string | null;
  capabilities: Record<string, unknown>;
  scopes: string[];
  connectedBy: string;
}

/**
 * Inserts or refreshes a live (non-demo) account and stores its token encrypted.
 * Update-then-insert so reconnecting an existing account never trips the plan quota trigger.
 */
export async function saveLiveAccount(admin: SupabaseClient, a: AccountInput, token: string, expiresAt: string | null) {
  const fields = {
    display_name: a.displayName,
    handle: a.handle,
    status: "connected",
    capabilities: a.capabilities,
    scopes: a.scopes,
    is_demo: false,
    last_checked_at: new Date().toISOString(),
    connected_by: a.connectedBy,
  };
  const { data: existing } = await admin
    .from("social_accounts")
    .select("id")
    .eq("workspace_id", a.workspaceId)
    .eq("provider", a.provider)
    .eq("provider_account_id", a.providerAccountId)
    .maybeSingle();
  let id: string;
  if (existing) {
    const { error } = await admin.from("social_accounts").update(fields).eq("id", existing.id);
    if (error) throw new IntegrationError(400, error.message);
    id = existing.id;
  } else {
    const { data, error } = await admin
      .from("social_accounts")
      .insert({ tenant_id: a.tenantId, workspace_id: a.workspaceId, provider: a.provider, provider_account_id: a.providerAccountId, ...fields })
      .select("id")
      .single();
    if (error) throw new IntegrationError(400, error.message); // includes plan-limit errors from the quota trigger
    id = data.id;
  }
  const { error: credErr } = await admin.rpc("store_oauth_credentials", {
    p_account: id,
    p_access: toBytea(encrypt(token)),
    p_refresh: null,
    p_expires: expiresAt,
  });
  if (credErr) throw new IntegrationError(500, "Could not store credentials securely");
  return id;
}
