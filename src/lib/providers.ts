import type { Provider } from "./types";

export const PROVIDERS: Record<
  Provider,
  { name: string; short: string; color: string; charLimit: number; notes: string }
> = {
  instagram: { name: "Instagram", short: "IG", color: "#E1306C", charLimit: 2200, notes: "Professional accounts; publishing, comments & DMs with Meta-approved permissions." },
  facebook: { name: "Facebook", short: "FB", color: "#1877F2", charLimit: 63206, notes: "Pages publishing and Messenger, subject to app review." },
  whatsapp: { name: "WhatsApp", short: "WA", color: "#25D366", charLimit: 4096, notes: "Cloud API conversations, approved templates, opt-in & 24h window rules." },
  google_business: { name: "Google Business", short: "GB", color: "#4285F4", charLimit: 1500, notes: "Profile posts and reviews when API access and quota are approved." },
  youtube: { name: "YouTube", short: "YT", color: "#FF0000", charLimit: 5000, notes: "Channel and video upload with OAuth and quotas." },
  linkedin: { name: "LinkedIn", short: "in", color: "#0A66C2", charLimit: 3000, notes: "Organization posting after product/API permissions." },
  tiktok: { name: "TikTok", short: "TT", color: "#25F4EE", charLimit: 2200, notes: "Content Posting API permissions and app audit required." },
  x: { name: "X", short: "X", color: "#e7e9ea", charLimit: 280, notes: "Paid API tier required for posting." },
};

export const PROVIDER_LIST = Object.keys(PROVIDERS) as Provider[];

export const CHANNELS = ["instagram", "facebook", "whatsapp", "google_business", "website", "phone"] as const;
