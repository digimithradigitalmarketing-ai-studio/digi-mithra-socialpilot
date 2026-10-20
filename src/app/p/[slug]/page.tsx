import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { LandingPageData } from "@/components/landing-view";
import { PublicLanding } from "./client";

export const dynamic = "force-dynamic";

async function loadPage(slug: string) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("get_landing_page", { p_slug: slug });
  if (error || !data) return null;
  return data as LandingPageData & { slug: string };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) return { title: "Page not found" };
  return {
    title: { absolute: `${page.title}${page.business ? ` · ${page.business}` : ""}` },
    description: page.subheadline || page.headline,
    openGraph: { title: page.headline || page.title, description: page.subheadline ?? undefined, images: page.hero_image_url ? [page.hero_image_url] : undefined },
  };
}

export default async function LandingPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) notFound();
  return <PublicLanding slug={slug} page={page} />;
}
