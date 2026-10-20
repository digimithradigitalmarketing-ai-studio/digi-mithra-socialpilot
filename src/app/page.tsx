import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  Inbox,
  ListChecks,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

const FEATURES = [
  { icon: CalendarDays, title: "Plan & publish", text: "Composer, calendar and scheduled publishing for every connected channel." },
  { icon: ListChecks, title: "Approvals", text: "Client and manager approvals before anything goes live." },
  { icon: Inbox, title: "Unified inbox", text: "Messages from Instagram, Facebook and WhatsApp in one place, in real time." },
  { icon: Sparkles, title: "Brand-aware AI", text: "Captions, hooks, replies and campaign copy grounded in your business facts." },
  { icon: Workflow, title: "Automations", text: "Turn enquiries into leads, tag contacts, notify staff and draft replies automatically." },
  { icon: Users, title: "CRM & leads", text: "Drag-and-drop pipeline for memberships, events and bookings." },
  { icon: BarChart3, title: "Analytics", text: "Publishing, engagement and lead reports with CSV exports." },
  { icon: BookOpen, title: "Brand knowledge", text: "Hours, offerings, tone and forbidden claims the AI must respect." },
  { icon: ShieldCheck, title: "Secure multi-tenant", text: "Row-level security keeps every business's data isolated." },
];

const PLANS = [
  { name: "Starter", price: "₹999", items: ["1 workspace", "3 social accounts", "100 posts / month", "1 user", "100 AI credits"] },
  { name: "Growth", price: "₹2,999", items: ["3 workspaces", "10 social accounts", "500 posts / month", "5 users", "500 AI credits"], featured: true },
  { name: "Agency", price: "₹7,999", items: ["15 workspaces", "50 social accounts", "2,000 posts / month", "20 users", "2,000 AI credits"] },
  { name: "Enterprise", price: "Custom", items: ["Custom limits", "SLA & SSO", "Dedicated support", "Custom AI allowance"] },
];

export default function Landing() {
  return (
    <div className="brand-glow min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/mark.png" alt="" width={36} height={36} className="rounded-lg" />
          <span className="text-sm font-bold">
            Digi <span className="text-gradient italic">Mithra</span>
            <span className="ml-1.5 hidden text-[10px] font-semibold tracking-[0.2em] text-muted sm:inline">SOCIAL PILOT</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink">
            Sign in
          </Link>
          <Link href="/signup" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-black hover:bg-brand-2">
            Start free trial
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-16 sm:px-6 md:grid-cols-2 md:pt-16">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
            <Zap className="size-3.5" /> All-in-one automation · In one place
          </p>
          <h1 className="text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">
            Your <span className="text-gradient">digital growth</span> partner for social media.
          </h1>
          <p className="mt-4 max-w-lg text-base text-muted">
            Plan, publish, reply, automate and convert — for your own business or every client you manage. Built for fitness studios,
            production houses, agencies and local brands.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-black hover:bg-brand-2">
              Start 14-day free trial
            </Link>
            <Link href="/login" className="rounded-xl border border-line-2 px-5 py-3 text-sm font-semibold hover:border-brand/50">
              Sign in
            </Link>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-faint">
            <Smartphone className="size-4" /> Works on desktop and mobile — install it on your phone like an app.
          </p>
        </div>
        <div className="relative mx-auto w-full max-w-md">
          <div className="absolute inset-0 -z-10 rounded-[2rem] bg-brand/20 blur-3xl" />
          <Image
            src="/brand-logo.webp"
            alt="Digi Mithra Social Pilot — all in one automation in one place"
            width={800}
            height={800}
            priority
            className="rounded-[2rem] border border-line-2"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="mb-6 text-center text-2xl font-bold">Everything your social team needs</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-panel p-5">
              <f.icon className="size-6 text-brand" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6" id="pricing">
        <h2 className="text-center text-2xl font-bold">Simple monthly plans</h2>
        <p className="mt-1 mb-6 text-center text-sm text-muted">Prices per month, excluding GST and channel charges.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <div key={p.name} className={`rounded-2xl border p-5 ${p.featured ? "border-brand bg-brand/5" : "border-line bg-panel"}`}>
              <p className="font-semibold">{p.name}</p>
              <p className="mt-2 text-3xl font-extrabold">
                {p.price}
                {p.price !== "Custom" && <span className="text-sm font-normal text-muted">/mo</span>}
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {p.items.map((i) => (
                  <li key={i} className="flex gap-2 text-muted">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" /> {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line py-6 text-center text-xs tracking-wider text-faint">
        BUILT ON <span className="text-brand">TRUST</span> · DRIVEN BY <span className="text-brand">GROWTH</span> · FOCUSED ON YOUR{" "}
        <span className="text-brand">SUCCESS</span>
      </footer>
    </div>
  );
}
