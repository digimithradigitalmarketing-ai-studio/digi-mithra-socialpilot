import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|icons/|brand-logo|mark.png|manifest.webmanifest|sw.js|api/health).*)"],
};
