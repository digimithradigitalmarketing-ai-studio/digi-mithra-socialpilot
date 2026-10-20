// Shared by the client (AI Content Agent, Write tools) and the API routes.

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export const DAY_LABELS: Record<DayKey, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

/** Content formats used for planning (not the same as connected accounts). */
export const FORMAT_LABELS: Record<string, string> = {
  instagram: "Instagram",
  short_form: "Short Form Video",
  youtube: "YouTube",
  x: "X/Tweet",
  threads: "Threads",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  tiktok: "TikTok",
};
export const FORMAT_COLORS: Record<string, string> = {
  instagram: "#E1306C",
  short_form: "#ff3d6e",
  youtube: "#FF0000",
  x: "#0f1419",
  threads: "#101010",
  linkedin: "#0A66C2",
  facebook: "#1877F2",
  tiktok: "#111111",
};
export const FORMAT_SHORT: Record<string, string> = {
  instagram: "IG",
  short_form: "SF",
  youtube: "YT",
  x: "X",
  threads: "@",
  linkedin: "in",
  facebook: "f",
  tiktok: "TT",
};

/** Publishing destinations offered during brand onboarding. */
export const PUBLISH_TARGETS = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "shorts", label: "Shorts" },
  { id: "youtube", label: "YouTube" },
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X/Twitter" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "threads", label: "Threads" },
] as const;

export const WEEKLY_TEMPLATES: { id: string; label: string; emoji: string; description: string; schedule: Partial<Record<DayKey, string[]>> }[] = [
  { id: "custom", label: "Custom", emoji: "", description: "Start empty and drag formats onto days.", schedule: {} },
  {
    id: "business_growth",
    label: "Business growth",
    emoji: "📈",
    description: "Reels for reach, carousels for saves, an offer post on Friday.",
    schedule: { mon: ["short_form"], tue: ["instagram"], wed: ["short_form", "threads"], thu: ["instagram"], fri: ["short_form"], sat: ["instagram"] },
  },
  {
    id: "personal_brand",
    label: "Personal brand creation",
    emoji: "😎",
    description: "Founder-led content across short form, LinkedIn and X.",
    schedule: { mon: ["linkedin", "x"], tue: ["short_form"], wed: ["x", "threads"], thu: ["short_form", "linkedin"], fri: ["youtube"], sat: ["threads"] },
  },
  {
    id: "video_first",
    label: "Video first",
    emoji: "🎬",
    description: "Daily short video plus one long YouTube video.",
    schedule: { mon: ["short_form"], tue: ["short_form"], wed: ["short_form"], thu: ["short_form"], fri: ["short_form"], sat: ["youtube"] },
  },
  {
    id: "offers",
    label: "Offers & promotions",
    emoji: "🛍️",
    description: "Build-up teasers mid-week, offer launch on the weekend.",
    schedule: { tue: ["instagram"], thu: ["short_form"], fri: ["instagram", "facebook"], sat: ["short_form", "facebook"] },
  },
];

export const VIRAL_FORMULAS = [
  { id: "fake_shock", name: "Fake Shock", structure: "1. False statement · 2. Turning point · 3. Social proof · 4. Disprove statement" },
  { id: "pas", name: "Problem → Agitate → Solve", structure: "1. Name the problem · 2. Make it hurt · 3. Show the solution · 4. CTA" },
  { id: "listicle", name: "3 Things Nobody Tells You", structure: "1. Hook promise · 2. Tip 1 · 3. Tip 2 · 4. Tip 3 (best) · 5. CTA" },
  { id: "before_after", name: "Before / After", structure: "1. Before state · 2. The moment it changed · 3. After state · 4. How you can too" },
  { id: "story", name: "Mini story", structure: "1. Character + goal · 2. Obstacle · 3. Turning point · 4. Lesson · 5. CTA" },
  { id: "myth", name: "Myth vs Fact", structure: "1. Common myth · 2. Why people believe it · 3. The fact · 4. What to do instead" },
];

export interface Idea {
  title: string;
  description: string;
  angle: "Grow" | "Inspire" | "Sell" | "Value" | "Educate" | "Entertain";
  format: string;
  origin?: string;
}

export interface PlanPost {
  day: DayKey;
  format: string;
  title: string;
  body: string;
  hashtags: string[];
}

interface BrandLike {
  niche?: string;
  audience?: string;
  offer?: string;
  goals?: string[];
}
interface KnowledgeLike {
  category: string;
  title: string;
  content: string;
}

const IDEA_BANK: { t: (n: string, b: string) => string; d: (n: string, a: string) => string; angle: Idea["angle"]; format: string }[] = [
  { t: (n) => `3 ${n} myths that hold people back`, d: (_, a) => `Bust common misconceptions your ${a} believe, one per slide.`, angle: "Educate", format: "carousel" },
  { t: (_, b) => `A day in the life at ${b}`, d: () => "Show the real people and moments behind the brand in a fast-cut reel.", angle: "Inspire", format: "short_form" },
  { t: (n) => `Beginner's guide to ${n} in 60 seconds`, d: (_, a) => `Quick, practical steps for ${a} who are just starting.`, angle: "Value", format: "short_form" },
  { t: () => "Customer story: before & after", d: () => "Feature a real customer journey (with their consent) and what changed.", angle: "Grow", format: "carousel" },
  { t: (_, b) => `Why choose ${b}? (honest answer)`, d: () => "Address the top objection head-on and invite questions in comments.", angle: "Sell", format: "post" },
  { t: (n) => `The #1 mistake people make with ${n}`, d: () => "Hook with the mistake, explain why it matters, give the fix.", angle: "Educate", format: "short_form" },
  { t: () => "Behind the scenes: how we prepare", d: () => "Show your process; transparency builds trust.", angle: "Inspire", format: "story" },
  { t: () => "Answering your most asked question", d: () => "Turn the most common DM into a short explainer.", angle: "Value", format: "threads" },
  { t: (n) => `POV: your first week of ${n}`, d: () => "Relatable skit that shows the experience from the customer's eyes.", angle: "Entertain", format: "short_form" },
  { t: () => "This week's offer, explained simply", d: () => "One clear offer, who it's for, and the deadline.", angle: "Sell", format: "post" },
  { t: (n) => `5 quick ${n} tips you can try today`, d: () => "Save-worthy list post with one tip per slide.", angle: "Value", format: "carousel" },
  { t: () => "Meet the team", d: () => "Introduce a team member with a fun fact and their best tip.", angle: "Grow", format: "short_form" },
];

export function templateIdeas(business: string, brand: BrandLike, knowledge: KnowledgeLike[], count: number, focus?: string): Idea[] {
  const niche = focus || brand.niche || knowledge.find((k) => k.category === "offerings")?.title || "your niche";
  const audience = brand.audience || "your audience";
  const start = Math.floor(Math.random() * IDEA_BANK.length);
  return Array.from({ length: count }, (_, i) => {
    const t = IDEA_BANK[(start + i) % IDEA_BANK.length];
    return { title: t.t(niche, business), description: t.d(niche, audience), angle: t.angle, format: t.format, origin: "Template idea" };
  });
}

export function templatePlanPosts(slots: { day: DayKey; format: string }[], business: string, brand: BrandLike, knowledge: KnowledgeLike[], topics?: string): PlanPost[] {
  const ideas = templateIdeas(business, brand, knowledge, slots.length, topics);
  const offer = brand.offer || knowledge.find((k) => k.category === "offerings")?.content;
  const tags = [business.replace(/[^a-zA-Z0-9]/g, ""), ...(brand.niche ? [brand.niche.replace(/[^a-zA-Z0-9]/g, "")] : [])].filter(Boolean);
  return slots.map((s, i) => {
    const idea = ideas[i];
    let body: string;
    switch (s.format) {
      case "short_form":
      case "tiktok":
        body = `HOOK: "${idea.title}?"\n\nBEATS:\n1. ${idea.description}\n2. Show it on camera — real moments only.\n3. One takeaway viewers can use today.\n\nCTA: Follow ${business} for more.`;
        break;
      case "youtube":
        body = `Title: ${idea.title}\n\nDescription: ${idea.description}${offer ? ` ${offer}` : ""}\n\nChapters:\n0:00 Intro\n0:30 The problem\n2:00 What we do\n5:00 Your next step`;
        break;
      case "x":
      case "threads":
        body = `${idea.title}.\n\n${idea.description}`.slice(0, 270);
        break;
      case "linkedin":
        body = `${idea.title}\n\n${idea.description}\n\nAt ${business}, we've learned that small, consistent steps win. What's your experience?`;
        break;
      default:
        body = `${idea.title} ✨\n\n${idea.description}${offer ? `\n\n${offer}` : ""}\n\nDM us to know more 📩`;
    }
    return { day: s.day, format: s.format, title: idea.title, body, hashtags: tags };
  });
}
