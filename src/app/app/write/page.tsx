"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChevronRight,
  Gauge,
  Hash,
  Languages,
  Megaphone,
  MessageCircle,
  Recycle,
  Sparkles,
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import { ContentAgentModal } from "@/components/content-agent";
import { cn } from "@/lib/utils";

function Glyph({ label, color, className }: { label: string; color: string; className?: string }) {
  return (
    <span
      className={cn("absolute grid size-9 place-items-center rounded-full border border-line bg-panel text-[11px] font-bold shadow-soft", className)}
      style={{ color }}
    >
      {label}
    </span>
  );
}

function HeroMock() {
  return (
    <div className="tint-blue relative h-full min-h-56 overflow-hidden p-6 sm:p-8">
      <Glyph label="X" color="#0f1419" className="top-4 left-6" />
      <Glyph label="SF" color="#ff3d6e" className="top-2 left-1/3" />
      <Glyph label="YT" color="#FF0000" className="top-5 right-1/4" />
      <Glyph label="in" color="#0A66C2" className="top-12 right-4" />
      <div className="relative mx-auto mt-10 max-w-sm rounded-2xl border border-line bg-panel p-3 shadow-soft">
        <div className="mb-2 flex items-center gap-2 border-b border-line pb-2">
          <span className="size-2 rounded-full bg-danger/60" />
          <span className="size-2 rounded-full bg-warn/60" />
          <span className="size-2 rounded-full bg-ok/60" />
          <span className="ml-2 truncate rounded-md bg-panel-2 px-2 py-0.5 text-[10px] text-muted">How to grow your chest</span>
          <span className="ml-auto rounded-md bg-brand/10 px-1.5 text-[10px] font-semibold text-brand-ink">81</span>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div className="space-y-1.5">
            {[100, 92, 96, 70, 88, 60].map((w, i) => (
              <div key={i} className="h-1.5 rounded-full bg-line" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="w-16 space-y-1.5">
            <p className="text-[9px] font-semibold text-muted">Score</p>
            {["Story", "Virality", "Delivery"].map((s, i) => (
              <div key={s}>
                <p className="text-[8px] text-faint">{s}</p>
                <div className="h-1 rounded-full bg-line">
                  <div className={cn("h-1 rounded-full", i === 0 ? "bg-warn" : i === 1 ? "bg-brand" : "bg-ok")} style={{ width: `${70 + i * 8}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HookMock() {
  return (
    <div className="space-y-1.5 rounded-xl border border-line bg-panel p-3 shadow-soft">
      <p className="text-center text-[11px] font-semibold">Choose Hook</p>
      {[92, 84, 79, 72].map((s, i) => (
        <div key={s} className={cn("flex items-center gap-2 rounded-lg border px-2 py-1", i === 0 ? "border-brand/40" : "border-line")}>
          <span className={cn("size-2 rounded-full border", i === 0 ? "border-brand bg-brand" : "border-line-2")} />
          <span className="h-1.5 flex-1 rounded-full bg-line" />
          <span className={cn("grid size-5 place-items-center rounded-full border text-[8px] font-bold", s >= 85 ? "border-brand text-brand-ink" : s >= 75 ? "border-ok text-ok" : "border-warn text-warn")}>
            {s}
          </span>
        </div>
      ))}
    </div>
  );
}

function CaptionMock() {
  return (
    <div className="rounded-xl border border-line bg-panel p-3 shadow-soft">
      <p className="text-[11px] font-semibold">SEO optimised caption</p>
      <div className="mt-2 space-y-1.5">
        {[95, 80, 88].map((w, i) => (
          <div key={i} className="h-1.5 rounded-full bg-line" style={{ width: `${w}%` }} />
        ))}
      </div>
      <p className="mt-3 text-[9px] text-faint">Keywords used</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {["safety zone · 11K", "social icons · 3K", "instagram · 26M"].map((k) => (
          <span key={k} className="rounded-md border border-line px-1.5 py-0.5 text-[9px] text-muted">
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

function TrendsMock() {
  return (
    <div className="flex gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn("flex-1 rounded-xl border border-line bg-panel p-1.5 shadow-soft", i === 1 && "-translate-y-2")}>
          <div className="tint-violet grid h-20 place-items-center rounded-lg text-[10px] text-muted">▶</div>
          <div className="mt-1.5 h-1.5 rounded-full bg-line" />
          <div className="mt-1 h-1.5 w-2/3 rounded-full bg-line" />
        </div>
      ))}
    </div>
  );
}

function FormulaMock() {
  return (
    <div className="rounded-xl border border-line bg-panel p-3 shadow-soft">
      <p className="text-[11px] font-semibold">Script formulas</p>
      <div className="mt-2 rounded-lg border border-brand/30 bg-brand/5 p-2 text-[9px] leading-relaxed text-muted">
        <span className="font-semibold text-ink">Fake Shock</span>
        <br />1. False statement · 2. Turning point
        <br />3. Social proof · 4. Disprove statement
      </div>
    </div>
  );
}

function VisualMock() {
  return (
    <div className="rounded-xl border border-line bg-panel p-3 shadow-soft">
      <p className="text-[11px] font-semibold">Visual guide</p>
      <p className="mt-1 text-[9px] text-muted">Trending video formats</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {["Split screen", "Walk & talk", "Reaction"].map((t) => (
          <div key={t} className="tint-sky grid h-14 place-items-center rounded-lg px-1 text-center text-[8px] text-muted">
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

const SHORT_FORM_TOOLS = [
  { title: "Hooks", text: "Generate attention-grabbing hooks for short form videos.", link: "Write Hooks", href: "/app/write/hooks", tint: "tint-amber", mock: <HookMock /> },
  { title: "Captions", text: "Create SEO optimised captions for TikTok, YouTube & Instagram.", link: "Generate Captions", href: "/app/write/captions", tint: "tint-green", mock: <CaptionMock /> },
  { title: "Trends", text: "Browse suggested trending formats, visual hooks and content angles for your niche.", link: "See Trends", href: "/app/research", tint: "tint-blue", mock: <TrendsMock /> },
  { title: "Viral Formulas", text: "Write short form video scripts using proven to work structures and formulas.", link: "Let's Go Viral", href: "/app/write/scripts", tint: "tint-rose", mock: <FormulaMock /> },
  { title: "Visual Guide", text: "Suggest video formats, visual hooks and music mood for your videos.", link: "Get Inspiration", href: "/app/write/visual", tint: "tint-violet", mock: <VisualMock /> },
];

const MORE_TOOLS = [
  { title: "Hashtags", text: "Broad, niche and local hashtags in one click.", href: "/app/write/hashtags", icon: Hash, tint: "tint-sky" },
  { title: "Repurpose", text: "Turn a link, video or article into an original post.", href: "/app/write/repurpose", icon: Recycle, tint: "tint-green" },
  { title: "Translate", text: "Tamil, Hindi, Telugu, Kannada, Malayalam and more.", href: "/app/write/translate", icon: Languages, tint: "tint-amber" },
  { title: "Campaign copy", text: "Headline, description, post ideas and CTA.", href: "/app/write/campaign", icon: Megaphone, tint: "tint-rose" },
  { title: "Optimize", text: "Score a post and get an improved version.", href: "/app/optimize", icon: Gauge, tint: "tint-violet" },
  { title: "Brand chat", text: "Ask your AI strategist anything about your content.", href: "/app/chat", icon: MessageCircle, tint: "tint-blue" },
];

export default function WritePage() {
  const [agentOpen, setAgentOpen] = useState(false);

  return (
    <div className="space-y-10">
      <Card className="grid overflow-hidden rounded-3xl md:grid-cols-2">
        <HeroMock />
        <div className="flex flex-col justify-center gap-4 p-6 sm:p-10">
          <h2 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">Create Viral Content for All Social Platforms</h2>
          <p className="text-muted">YouTube &amp; short-form scripts, LinkedIn &amp; X posts — all done in seconds!</p>
          <div>
            <Button onClick={() => setAgentOpen(true)} className="h-11 px-5">
              Let&apos;s Start <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      <section>
        <h2 className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">Short Form Tools</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SHORT_FORM_TOOLS.map((t) => (
            <Link key={t.title} href={t.href} className="group">
              <Card className="h-full overflow-hidden rounded-3xl transition-shadow group-hover:shadow-lg">
                <div className={cn(t.tint, "flex h-48 items-center justify-center px-6 py-5")}>
                  <div className="w-full max-w-64 transition-transform group-hover:-translate-y-1">{t.mock}</div>
                </div>
                <div className="space-y-2 p-5">
                  <h3 className="text-lg font-bold">{t.title}</h3>
                  <p className="text-sm text-muted">{t.text}</p>
                  <p className="flex items-center gap-1 pt-1 text-sm font-semibold text-brand-ink">
                    {t.link} <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">More tools</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MORE_TOOLS.map((t) => (
            <Link key={t.title} href={t.href} className="group">
              <Card className="flex h-full items-start gap-4 rounded-2xl p-5 transition-shadow group-hover:shadow-lg">
                <span className={cn(t.tint, "grid size-11 shrink-0 place-items-center rounded-xl")}>
                  <t.icon className="size-5 text-brand-ink" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{t.text}</span>
                </span>
                <ChevronRight className="mt-1 size-4 shrink-0 text-faint group-hover:text-brand-ink" />
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <p className="flex items-center justify-center gap-2 text-xs text-faint">
        <Sparkles className="size-3.5" /> Every tool uses your My Brand details so content sounds like you.
      </p>

      <ContentAgentModal open={agentOpen} onClose={() => setAgentOpen(false)} />
    </div>
  );
}
