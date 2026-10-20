import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeWorkspace } from "@/lib/server/admin";
import { sign } from "@/lib/server/crypto";
import { jsonError } from "@/lib/server/errors";
import { GRAPH_VERSION, META_SCOPES, requireMetaConfig, siteUrl, type MetaProduct } from "@/lib/server/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const product = url.searchParams.get("product") as MetaProduct | null;
  try {
    if (!product || !(product in META_SCOPES)) return Response.json({ error: "Unknown product" }, { status: 400 });
    const { appId } = requireMetaConfig();
    const supabase = await createClient();
    const { user, workspace } = await authorizeWorkspace(supabase, url.searchParams.get("workspaceId"));

    const state = sign({ ws: workspace.id, product, uid: user.id, nonce: randomBytes(16).toString("hex"), exp: Date.now() + 10 * 60 * 1000 });
    const dialog = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
    dialog.searchParams.set("client_id", appId);
    dialog.searchParams.set("redirect_uri", `${siteUrl(request)}/api/oauth/meta/callback`);
    dialog.searchParams.set("state", state);
    dialog.searchParams.set("response_type", "code");
    const configId = process.env.META_LOGIN_CONFIG_ID;
    if (configId) dialog.searchParams.set("config_id", configId); // Facebook Login for Business configuration
    else dialog.searchParams.set("scope", META_SCOPES[product].join(","));

    const res = NextResponse.redirect(dialog.toString());
    res.cookies.set("sp_meta_oauth", state, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/api/oauth/meta", maxAge: 600 });
    return res;
  } catch (e) {
    const r = jsonError(e);
    const msg = ((await r.json()) as { error: string }).error;
    return NextResponse.redirect(`${siteUrl(request)}/app/accounts?error=${encodeURIComponent(msg)}`);
  }
}
