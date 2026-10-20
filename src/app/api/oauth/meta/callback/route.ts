import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeWorkspace, createAdminClient } from "@/lib/server/admin";
import { saveLiveAccount } from "@/lib/server/accounts";
import { safeEqual, verify } from "@/lib/server/crypto";
import { IntegrationError } from "@/lib/server/errors";
import { capabilitiesFor, graph, requireMetaConfig, siteUrl, type MetaProduct } from "@/lib/server/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface State {
  ws: string;
  product: MetaProduct;
  uid: string;
  nonce: string;
  exp: number;
}

interface Page {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string; name?: string };
}

export async function GET(request: NextRequest) {
  const site = siteUrl(request);
  const back = (q: string) => {
    const res = NextResponse.redirect(`${site}/app/accounts?${q}`);
    res.cookies.delete({ name: "sp_meta_oauth", path: "/api/oauth/meta" });
    return res;
  };
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("error")) {
      throw new IntegrationError(400, url.searchParams.get("error_description") || "Meta login was cancelled");
    }
    const stateParam = url.searchParams.get("state") ?? "";
    const cookie = request.cookies.get("sp_meta_oauth")?.value ?? "";
    const state = verify<State>(stateParam);
    if (!state || !cookie || !safeEqual(cookie, stateParam) || state.exp < Date.now()) {
      throw new IntegrationError(400, "Login session expired or invalid. Please try connecting again.");
    }
    const code = url.searchParams.get("code");
    if (!code) throw new IntegrationError(400, "Missing authorization code");

    const supabase = await createClient();
    const { user, workspace } = await authorizeWorkspace(supabase, state.ws);
    if (user.id !== state.uid) throw new IntegrationError(403, "Signed-in user changed during login");

    const { appId, secret } = requireMetaConfig();
    const short = await graph<{ access_token: string }>("/oauth/access_token", {
      params: { client_id: appId, client_secret: secret, redirect_uri: `${site}/api/oauth/meta/callback`, code },
    });
    const long = await graph<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      params: { grant_type: "fb_exchange_token", client_id: appId, client_secret: secret, fb_exchange_token: short.access_token },
    });
    const userToken = long.access_token;
    const perms = await graph<{ data: { permission: string; status: string }[] }>("/me/permissions", { token: userToken });
    const granted = perms.data.filter((p) => p.status === "granted").map((p) => p.permission);

    const admin = createAdminClient();
    const base = { tenantId: workspace.tenant_id, workspaceId: workspace.id, scopes: granted, connectedBy: user.id };
    let connected = 0;

    if (state.product === "facebook" || state.product === "instagram") {
      const pages = await graph<{ data: Page[] }>("/me/accounts", {
        token: userToken,
        params: { fields: "id,name,access_token,instagram_business_account{id,username,name}", limit: "100" },
      });
      if (!pages.data.length) throw new IntegrationError(400, "No Facebook Pages were shared. Select at least one Page during login.");

      for (const page of pages.data) {
        const diagnostics: string[] = [];
        // Subscribe the Page so Messenger / Instagram messaging webhooks are delivered.
        try {
          await graph(`/${page.id}/subscribed_apps`, {
            method: "POST",
            token: page.access_token,
            params: { subscribed_fields: "messages,messaging_postbacks" },
          });
        } catch (e) {
          diagnostics.push(`Webhook subscription failed: ${e instanceof Error ? e.message : "unknown"}`);
        }

        if (state.product === "facebook") {
          await saveLiveAccount(
            admin,
            { ...base, provider: "facebook", providerAccountId: page.id, displayName: page.name, handle: null, capabilities: { ...capabilitiesFor("facebook", granted), diagnostics } },
            page.access_token,
            null, // Page tokens obtained from a long-lived user token do not expire
          );
          connected++;
        } else if (page.instagram_business_account) {
          const ig = page.instagram_business_account;
          await saveLiveAccount(
            admin,
            {
              ...base,
              provider: "instagram",
              providerAccountId: ig.id,
              displayName: ig.name || ig.username || page.name,
              handle: ig.username ? `@${ig.username}` : null,
              capabilities: { ...capabilitiesFor("instagram", granted), diagnostics, page_id: page.id },
            },
            page.access_token,
            null,
          );
          connected++;
        }
      }
      if (state.product === "instagram" && connected === 0) {
        throw new IntegrationError(400, "None of the selected Pages has a linked Instagram professional account.");
      }
    } else {
      // WhatsApp: find the WhatsApp Business Accounts this token was granted for.
      const dbg = await graph<{ data: { granular_scopes?: { scope: string; target_ids?: string[] }[]; expires_at?: number } }>("/debug_token", {
        params: { input_token: userToken, access_token: `${appId}|${secret}` },
      });
      const wabaIds = Array.from(
        new Set((dbg.data.granular_scopes ?? []).filter((s) => s.scope.startsWith("whatsapp_business")).flatMap((s) => s.target_ids ?? [])),
      );
      if (!wabaIds.length) throw new IntegrationError(400, "No WhatsApp Business Account was shared during login.");
      const expiresAt = dbg.data.expires_at ? new Date(dbg.data.expires_at * 1000).toISOString() : null;
      for (const waba of wabaIds) {
        const diagnostics: string[] = ["Using the login user's token — switch to a system user token for production."];
        try {
          await graph(`/${waba}/subscribed_apps`, { method: "POST", token: userToken });
        } catch (e) {
          diagnostics.push(`Webhook subscription failed: ${e instanceof Error ? e.message : "unknown"}`);
        }
        const numbers = await graph<{ data: { id: string; display_phone_number: string; verified_name?: string; quality_rating?: string }[] }>(
          `/${waba}/phone_numbers`,
          { token: userToken, params: { fields: "id,display_phone_number,verified_name,quality_rating" } },
        );
        for (const n of numbers.data) {
          await saveLiveAccount(
            admin,
            {
              ...base,
              provider: "whatsapp",
              providerAccountId: n.id,
              displayName: n.verified_name || n.display_phone_number,
              handle: n.display_phone_number,
              capabilities: { ...capabilitiesFor("whatsapp", granted), diagnostics, waba_id: waba, quality_rating: n.quality_rating ?? null },
            },
            userToken,
            expiresAt,
          );
          connected++;
        }
      }
    }
    return back(`connected=${connected}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Connection failed";
    console.error("meta oauth callback failed:", msg);
    return back(`error=${encodeURIComponent(msg)}`);
  }
}
