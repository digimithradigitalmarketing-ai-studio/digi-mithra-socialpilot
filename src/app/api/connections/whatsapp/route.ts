import { createClient } from "@/lib/supabase/server";
import { authorizeWorkspace, createAdminClient } from "@/lib/server/admin";
import { saveLiveAccount } from "@/lib/server/accounts";
import { IntegrationError, jsonError } from "@/lib/server/errors";
import { capabilitiesFor, graph } from "@/lib/server/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual WhatsApp Cloud API connection with a business-provided (ideally system user) token.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: string;
      phoneNumberId?: string;
      wabaId?: string;
      accessToken?: string;
    } | null;
    const phoneNumberId = body?.phoneNumberId?.trim() ?? "";
    const wabaId = body?.wabaId?.trim() ?? "";
    const token = body?.accessToken?.trim() ?? "";
    if (!/^\d{5,25}$/.test(phoneNumberId) || !/^\d{5,25}$/.test(wabaId)) throw new IntegrationError(400, "Phone number ID and WABA ID must be numeric IDs from WhatsApp Manager");
    if (token.length < 20) throw new IntegrationError(400, "Enter a valid access token");

    const supabase = await createClient();
    const { user, workspace } = await authorizeWorkspace(supabase, body?.workspaceId);

    const number = await graph<{ id: string; display_phone_number: string; verified_name?: string; quality_rating?: string }>(`/${phoneNumberId}`, {
      token,
      params: { fields: "display_phone_number,verified_name,quality_rating" },
    });
    const diagnostics: string[] = [];
    try {
      await graph(`/${wabaId}/subscribed_apps`, { method: "POST", token });
    } catch (e) {
      diagnostics.push(`Webhook subscription failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
    const scopes = ["whatsapp_business_messaging", "whatsapp_business_management"];
    const id = await saveLiveAccount(
      createAdminClient(),
      {
        tenantId: workspace.tenant_id,
        workspaceId: workspace.id,
        provider: "whatsapp",
        providerAccountId: phoneNumberId,
        displayName: number.verified_name || number.display_phone_number,
        handle: number.display_phone_number,
        capabilities: { ...capabilitiesFor("whatsapp", scopes), diagnostics, waba_id: wabaId, quality_rating: number.quality_rating ?? null, manual: true },
        scopes,
        connectedBy: user.id,
      },
      token,
      null,
    );
    return Response.json({ id, display_phone_number: number.display_phone_number, verified_name: number.verified_name ?? null });
  } catch (e) {
    return jsonError(e);
  }
}
