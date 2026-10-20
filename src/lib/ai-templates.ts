// Offline content generator used when no AI provider key is configured.
// It only reuses facts from brand knowledge, so it never invents business details.

export const AI_KINDS = [
  "caption",
  "improve",
  "hook",
  "hashtags",
  "campaign",
  "translate",
  "faq",
  "ideas",
  "reply",
  "review_reply",
  "script",
  "visual_guide",
  "trends",
  "optimize",
  "repurpose",
  "competitor",
] as const;
export type AiKind = (typeof AI_KINDS)[number];

interface Knowledge {
  category: string;
  title: string;
  content: string;
}

interface Args {
  kind: AiKind;
  prompt: string;
  tone: string;
  platform: string;
  language: string;
  business: string;
  industry: string | null;
  knowledge: Knowledge[];
  formula?: string;
}

const STOP = new Set(["the", "and", "for", "with", "our", "your", "this", "that", "from", "are", "you", "will", "have", "about", "new", "get", "now", "all"]);

function keywords(text: string, n = 6) {
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []) {
    if (!STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

function hashtags(a: Args, n = 6) {
  const base = keywords(`${a.prompt} ${a.industry ?? ""}`, n);
  const brand = a.business.replace(/[^a-zA-Z0-9]/g, "");
  return [...new Set([brand, ...base.map((w) => w[0].toUpperCase() + w.slice(1))])].slice(0, n).map((t) => `#${t}`).join(" ");
}

function fact(a: Args, category: string) {
  return a.knowledge.find((k) => k.category === category)?.content;
}

const OPENERS: Record<string, string[]> = {
  friendly: ["Hey friends! 👋", "Good news! 😊", "Here's something you'll love 💚"],
  professional: ["Announcing:", "We're pleased to share:", "Update:"],
  energetic: ["🔥 Let's go!", "⚡ Big energy alert!", "🚀 It's happening!"],
  luxury: ["✨ Crafted for those who expect more.", "Elegance, redefined.", "An experience worth remembering."],
  witty: ["Plot twist: 😏", "Not to brag, but…", "Breaking news (sort of):"],
};

function opener(tone: string, seed: number) {
  const list = OPENERS[tone] ?? OPENERS.friendly;
  return list[seed % list.length];
}

export function templateGenerate(a: Args): string {
  const seed = a.prompt.length + Date.now();
  const topic = a.prompt.replace(/\s+/g, " ").trim();
  const cta =
    a.platform === "whatsapp"
      ? "Reply to this message to know more."
      : a.platform === "linkedin"
        ? "Get in touch to learn more."
        : "DM us or tap the link in bio to know more! 📩";
  const hours = fact(a, "hours");
  const location = fact(a, "locations");
  const offerings = fact(a, "offerings");

  switch (a.kind) {
    case "caption":
      return [
        opener(a.tone, seed),
        "",
        `${topic.charAt(0).toUpperCase()}${topic.slice(1)}${/[.!?]$/.test(topic) ? "" : "."}`,
        offerings ? `\nAt ${a.business}: ${offerings}` : `\nOnly at ${a.business}.`,
        location ? `📍 ${location}` : "",
        "",
        cta,
        "",
        hashtags(a),
      ]
        .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
        .join("\n")
        .trim();
    case "improve":
      return `${opener(a.tone, seed)}\n\n${topic}\n\n${cta}`;
    case "hook":
      return [
        `1. Stop scrolling — this is about ${keywords(topic, 1)[0] ?? "you"}.`,
        `2. Nobody tells you this about ${keywords(topic, 2).join(" & ") || "it"}…`,
        `3. 3 reasons ${a.business} is different 👇`,
        `4. Before you decide, read this.`,
        `5. The secret behind ${keywords(topic, 1)[0] ?? "great results"}? Keep reading.`,
      ].join("\n");
    case "hashtags":
      return hashtags(a, 15);
    case "campaign":
      return [
        `Headline: ${topic.slice(0, 60)}`,
        "",
        `Description: ${a.business} presents ${topic}. ${offerings ?? ""}`.trim(),
        "",
        "Post ideas:",
        `1. Teaser reel announcing "${topic.slice(0, 40)}"`,
        "2. Carousel: what's included + who it's for",
        "3. Customer story / testimonial post",
        "",
        `Call to action: ${cta}`,
      ].join("\n");
    case "translate":
      return `[${a.language} translation needs an AI provider — add ANTHROPIC_API_KEY]\n\n${topic}`;
    case "faq":
    case "reply": {
      const q = topic.toLowerCase();
      const parts: string[] = [`Hi! Thanks for reaching out to ${a.business}. 😊`];
      if (/(time|timing|hour|open|close)/.test(q) && hours) parts.push(`Our timings: ${hours}.`);
      if (/(where|location|address|branch)/.test(q) && location) parts.push(`You can find us at ${location}.`);
      if (/(price|fee|cost|package|plan|membership|charges|rate)/.test(q))
        parts.push(offerings ? `Here's what we offer: ${offerings}. Our team will share the latest pricing with you.` : "Our team will share the latest pricing with you shortly.");
      const faq = a.knowledge.find((k) => k.category === "faq" && keywords(k.title, 3).some((w) => q.includes(w)));
      if (faq) parts.push(faq.content);
      if (parts.length === 1) parts.push("A team member will get back to you shortly with the details.");
      return parts.join(" ");
    }
    case "review_reply":
      return /(bad|poor|worst|disappoint|rude|dirty|late|not good|terrible)/i.test(topic)
        ? `Thank you for your feedback. We're sorry your experience didn't meet expectations. We'd like to make this right — please contact us directly so our team can help. — ${a.business}`
        : `Thank you so much for the kind words! 🙏 We're thrilled you had a great experience and look forward to seeing you again. — ${a.business}`;
    case "script":
      return [
        `Formula: ${a.formula || "Hook → Value → CTA"}`,
        "",
        `HOOK (0-3s): "Stop scrolling if you care about ${keywords(topic, 1)[0] ?? "this"}."`,
        "",
        "BODY:",
        `1. The problem: most people get ${keywords(topic, 2).join(" & ") || "this"} wrong.`,
        `2. The turning point: here's what we do differently at ${a.business}.`,
        `3. Proof: show a real customer moment or result (film it, don't claim it).`,
        `4. Quick tip viewers can use today.`,
        "",
        `CTA: ${cta}`,
        "",
        "[Template engine — add ANTHROPIC_API_KEY for full AI scripts]",
      ].join("\n");
    case "visual_guide":
      return [
        "Formats that fit:",
        "1. Talking head + text overlay (fast cuts every 2s)",
        "2. Before / after split screen",
        "3. Walk-and-talk tour",
        "",
        `Visual hook (first 2s): open on the most striking moment of "${topic.slice(0, 50)}".`,
        "",
        "Shot list: wide establishing → close-up detail → face to camera → action shot → result → logo/CTA card.",
        "On-screen text: the hook line, 3 key words per beat, CTA at the end.",
        "Music mood: upbeat, energetic, 110-125 BPM (pick from the platform's licensed library).",
      ].join("\n");
    case "trends":
      return [
        "Suggested formats (not live trend data):",
        "1. Day-in-the-life — shows the real people behind the brand.",
        "2. Myth vs fact — quick education that builds trust.",
        "3. POV skits — relatable customer moments.",
        "4. Transformation reveal — before/after with consent.",
        "5. Green-screen reaction to a common question.",
        "6. 3-tips carousel — saves and shares.",
        "",
        `Use them for: ${topic}`,
      ].join("\n");
    case "optimize": {
      const len = topic.length;
      const hasCTA = /(dm|call|book|visit|link|join|sign up|register|whatsapp|order)/i.test(topic);
      const tags = (topic.match(/#\w+/g) ?? []).length;
      const firstLine = topic.split("\n")[0];
      const hookScore = firstLine.length < 80 ? 7 : 5;
      const scores = { Hook: hookScore, Clarity: len < 600 ? 8 : 6, Value: len > 120 ? 7 : 5, "Call to action": hasCTA ? 8 : 4, "Hashtags/SEO": tags >= 3 && tags <= 8 ? 8 : 5 };
      const total = Math.round((Object.values(scores).reduce((x, y) => x + y, 0) / 50) * 100);
      return [
        `Overall score: ${total}/100`,
        ...Object.entries(scores).map(([k, v]) => `${k}: ${v}/10`),
        "",
        !hasCTA ? "Fix: add a clear call to action (e.g. 'DM us JOIN')." : "CTA looks good.",
        tags < 3 ? "Fix: add 3-8 relevant hashtags." : tags > 8 ? "Fix: trim hashtags to the 8 most relevant." : "Hashtag count is healthy.",
        firstLine.length >= 80 ? "Fix: shorten the first line under 80 characters so it isn't cut off." : "First line is short enough to show in full.",
        "",
        "[Template engine — add ANTHROPIC_API_KEY for an AI rewrite]",
      ].join("\n");
    }
    case "repurpose":
      return `${opener(a.tone, seed)}\n\nInspired by: ${topic.slice(0, 140)}\n\nHere's our take at ${a.business} — share your thoughts below 👇\n\n${cta}\n\n${hashtags(a)}`;
    case "competitor":
      return [
        "Competitor notes summary (template engine):",
        `Key words in their content: ${keywords(topic, 8).join(", ") || "add sample posts for analysis"}.`,
        "",
        "Opportunities for us:",
        "1. Post more behind-the-scenes and real customer stories.",
        "2. Answer the top questions they ignore.",
        "3. Use a consistent weekly series.",
        "",
        "[Add ANTHROPIC_API_KEY for a full AI analysis]",
      ].join("\n");
    case "ideas": {
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const formats = ["Reel", "Carousel", "Story poll", "Post", "Reel", "Behind the scenes", "Testimonial"];
      const themes = ["Tip of the week", "FAQ answered", "Meet the team", "Offer spotlight", "Transformation / result", "Day in the life", "Customer love"];
      return days.map((d, i) => `${d} — ${formats[i]}: ${themes[i]} (${topic.slice(0, 40)})`).join("\n");
    }
  }
}
