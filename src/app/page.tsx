import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Inbox,
  Lightbulb,
  PenLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Swords,
  Workflow,
} from "lucide-react";

const FEATURES = [
  { icon: Sparkles, tint: "tint-blue", title: "AI Content Agent", text: "Plan a whole week of posts in 60 seconds — pick days, platforms and topics." },
  { icon: PenLine, tint: "tint-amber", title: "Write tools", text: "Scored hooks, SEO captions, viral script formulas and visual shot guides." },
  { icon: Lightbulb, tint: "tint-green", title: "Ideas & Research", text: "Fresh weekly ideas and trending formats tailored to your niche." },
  { icon: Swords, tint: "tint-rose", title: "Competitor analysis", text: "Break down what works for competitors and find the gaps you can win." },
  { icon: CalendarDays, tint: "tint-violet", title: "Calendar & approvals", text: "Schedule across channels with client and manager approvals." },
  { icon: Inbox, tint: "tint-sky", title: "Unified inbox", text: "Instagram, Facebook and WhatsApp messages in one place, with AI reply drafts." },
  { icon: Workflow, tint: "tint-green", title: "CRM & automations", text: "Turn enquiries into leads automatically and never miss a follow-up." },
  { icon: BarChart3, tint: "tint-blue", title: "Analytics", text: "Publishing, engagement and lead reports with one-click exports." },
];

const PLANS = [
  { name: "Starter", price: "₹999", items: ["1 workspace", "3 social accounts", "100 posts / month", "1 user", "100 AI credits"] },
  { name: "Growth", price: "₹2,999", items: ["3 workspaces", "10 social accounts", "500 posts / month", "5 users", "500 AI credits"], featured: true },
  { name: "Agency", price: "₹7,999", items: ["15 workspaces", "50 social accounts", "2,000 posts / month", "20 users", "2,000 AI credits"] },
  { name: "Enterprise", price: "Custom", items: ["Custom limits", "SLA & SSO", "Dedicated support", "Custom AI allowance"] },
];

function ProductMock() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-brand/10 blur-3xl" />
      <div className="shadow-soft rounded-3xl border border-line bg-panel p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-semibold">Dashboard</p>
          <span className="rounded-lg bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand-ink">Upgrade</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="tint-blue rounded-2xl border border-brand/20 p-3">
            <Sparkles className="size-4 text-brand-ink" />
            <p className="mt-2 text-xs font-semibold">AI Content Agent</p>
            <p className="text-[10px] text-muted">A week of content in 60s</p>
          </div>
          <div className="tint-amber rounded-2xl border border-line p-3">
            <PenLine className="size-4 text-warn" />
            <p className="mt-2 text-xs font-semibold">Generate Post</p>
            <p className="text-[10px] text-muted">From an idea or link</p>
          </div>
        </div>
        <p className="mt-4 mb-2 text-xs font-semibold">Weekly ideas</p>
        <div className="grid grid-cols-[1fr_1fr_88px] gap-2 sm:grid-cols-[1fr_1fr_110px]">
          {[
            { t: "3 gym myths that hold beginners back", tag: "Educate", c: "text-info" },
            { t: "Behind the scenes: 5am batch", tag: "Inspire", c: "text-warn" },
          ].map((i) => (
            <div key={i.t} className="rounded-xl border border-line bg-panel p-2.5">
              <p className="line-clamp-3 text-[11px] leading-snug font-medium">{i.t}</p>
              <p className={`mt-2 text-[10px] font-medium ${i.c}`}>● {i.tag}</p>
            </div>
          ))}
          <div className="row-span-2 flex flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-b from-slate-700 to-slate-900 p-2 text-white">
            <p className="text-[9px] opacity-80">▶ 1.2K views</p>
            <p className="text-[10px] leading-tight font-bold">Monsoon offer reel</p>
          </div>
          <div className="col-span-2 rounded-xl border border-line bg-panel p-2.5">
            <div className="flex items-center gap-1.5">
              {["#E1306C", "#FF0000", "#0A66C2", "#101010"].map((c) => (
                <span key={c} className="size-4 rounded" style={{ background: c }} />
              ))}
              <span className="ml-auto text-[10px] text-muted">Mon · Wed · Fri</span>
            </div>
            <p className="mt-1.5 text-[11px] font-medium">7 posts scheduled this week</p>
          </div>
        </div>
      </div>
      <div className="shadow-soft absolute -bottom-6 -left-4 hidden items-center gap-2.5 rounded-2xl border border-line bg-panel p-2 pr-4 sm:flex">
        <Image src="/brand-logo.webp" alt="Digi Mithra Social Pilot logo" width={44} height={44} className="rounded-xl" />
        <div>
          <p className="text-[11px] text-faint">Built by</p>
          <p className="text-xs font-semibold">Digi Mithra</p>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="brand-glow min-h-dvh overflow-x-hidden">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/mark.png" alt="" width={36} height={36} className="rounded-xl" />
            <span className="text-[15px] font-bold tracking-tight">
              Digi <span className="text-gradient italic">Mithra</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#features" className="hidden rounded-xl px-3 py-2 text-sm text-muted hover:text-ink sm:block">
              Features
            </a>
            <a href="#pricing" className="hidden rounded-xl px-3 py-2 text-sm text-muted hover:text-ink sm:block">
              Pricing
            </a>
            <Link href="/login" className="rounded-xl px-3 py-2 text-sm text-muted hover:text-ink">
              Sign in
            </Link>
            <Link href="/signup" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand shadow-sm shadow-brand/30 hover:bg-brand-deep">
              Start free trial
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-12 pb-20 sm:px-6 md:grid-cols-2 md:pt-20">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-panel px-3 py-1 text-xs font-medium text-brand-ink shadow-sm">
            <Sparkles className="size-3.5" /> All-in-one automation · In one place
          </p>
          <h1 className="text-4xl leading-[1.1] font-extrabold tracking-tight sm:text-5xl">
            Create <span className="text-gradient">viral content</span> for every platform — and run your social media on autopilot.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">
            Hooks, captions, scripts and a full week of posts in seconds — grounded in your brand. Then schedule, reply to every message and turn
            enquiries into customers, all from one dashboard.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand shadow-lg shadow-brand/30 hover:bg-brand-deep"
            >
              Start 14-day free trial <ArrowRight className="size-4" />
            </Link>
            <a href="#features" className="rounded-xl border border-line-2 bg-panel px-5 py-3 text-sm font-semibold hover:border-brand/40 hover:text-brand-ink">
              See features
            </a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Check className="size-4 text-ok" /> No card needed
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-ok" /> Your data stays private
            </span>
            <span className="flex items-center gap-1.5">
              <Smartphone className="size-4 text-ok" /> Works on phone & desktop
            </span>
          </div>
        </div>
        <ProductMock />
      </section>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-20 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">Everything your content team needs</h2>
        <p className="mx-auto mt-2 mb-10 max-w-xl text-center text-sm text-muted">From the first idea to the final sale — for your own brand or every client you manage.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className={`${f.tint} rounded-2xl border border-line p-5`}>
              <span className="grid size-10 place-items-center rounded-xl bg-panel shadow-sm">
                <f.icon className="size-5 text-brand-ink" />
              </span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">Simple monthly plans</h2>
        <p className="mt-2 mb-10 text-center text-sm text-muted">Prices per month, excluding GST.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`relative flex flex-col rounded-3xl border bg-panel p-6 ${p.featured ? "border-brand shadow-xl shadow-brand/15" : "shadow-soft border-line"}`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-on-brand">Most popular</span>
              )}
              <p className="font-semibold">{p.name}</p>
              <p className="mt-3 text-3xl font-extrabold tracking-tight">
                {p.price}
                {p.price !== "Custom" && <span className="text-sm font-normal text-muted">/mo</span>}
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {p.items.map((i) => (
                  <li key={i} className="flex gap-2 text-muted">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-ink" /> {i}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`mt-6 rounded-xl px-4 py-2.5 text-center text-sm font-semibold ${
                  p.featured ? "bg-brand text-on-brand hover:bg-brand-deep" : "border border-line-2 hover:border-brand/40 hover:text-brand-ink"
                }`}
              >
                {p.price === "Custom" ? "Talk to us" : "Start free trial"}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line bg-panel/60 py-8 text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <Image src="/mark.png" alt="" width={28} height={28} className="rounded-lg" />
          <span className="text-sm font-bold">
            Digi <span className="text-gradient italic">Mithra</span> Social Pilot
          </span>
        </div>
        <p className="px-4 text-xs tracking-wide text-faint">
          Built on <span className="text-brand-ink">trust</span> · Driven by <span className="text-brand-ink">growth</span> · Focused on your{" "}
          <span className="text-brand-ink">success</span>
        </p>
      </footer>
    </div>
  );
}
