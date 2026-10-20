"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { LandingView, type LandingPageData } from "@/components/landing-view";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

export function PublicLanding({ slug, page }: { slug: string; page: LandingPageData }) {
  useEffect(() => {
    const key = `sp.viewed.${slug}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(key) === "1";
      sessionStorage.setItem(key, "1");
    } catch {}
    if (!seen) createClient().rpc("record_landing_view", { p_slug: slug }).then(() => {}, () => {});
  }, [slug]);

  const submit = async (data: Record<string, string | boolean>) => {
    const params = new URLSearchParams(window.location.search);
    const utm = Object.fromEntries(UTM_KEYS.filter((k) => params.get(k)).map((k) => [k, params.get(k)!.slice(0, 100)]));
    const { data: msg, error } = await createClient().rpc("submit_landing_form", { p_slug: slug, p_data: data, p_utm: utm });
    if (error) throw new Error(error.message);
    return (msg as string) ?? page.success_message;
  };

  return (
    <div className="min-h-dvh">
      <LandingView page={page} onSubmit={submit} />
    </div>
  );
}
