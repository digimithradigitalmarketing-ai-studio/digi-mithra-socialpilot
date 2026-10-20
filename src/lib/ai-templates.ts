// Offline content generator used when no AI provider key is configured.
// It only reuses facts from brand knowledge, so it never invents business details.

export type AiKind =
  | "caption"
  | "improve"
  | "hook"
  | "hashtags"
  | "campaign"
  | "translate"
  | "faq"
  | "ideas"
  | "reply"
  | "review_reply";

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
    case "ideas": {
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const formats = ["Reel", "Carousel", "Story poll", "Post", "Reel", "Behind the scenes", "Testimonial"];
      const themes = ["Tip of the week", "FAQ answered", "Meet the team", "Offer spotlight", "Transformation / result", "Day in the life", "Customer love"];
      return days.map((d, i) => `${d} — ${formats[i]}: ${themes[i]} (${topic.slice(0, 40)})`).join("\n");
    }
  }
}
