"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Briefcase,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  CreditCard,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  PenSquare,
  Plug,
  Search,
  Settings,
  Sparkles,
  Star,
  Users,
  Workflow as WorkflowIcon,
  X,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { cn, timeAgo } from "@/lib/utils";
import type { Notification } from "@/lib/types";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Overview", items: [{ href: "/app", label: "Dashboard", icon: LayoutDashboard }] },
  {
    section: "Social Hub",
    items: [
      { href: "/app/compose", label: "Composer", icon: PenSquare },
      { href: "/app/posts", label: "Posts", icon: FileText },
      { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/app/approvals", label: "Approvals", icon: ListChecks },
      { href: "/app/media", label: "Media library", icon: ImageIcon },
      { href: "/app/accounts", label: "Connected accounts", icon: Plug },
    ],
  },
  {
    section: "Communication",
    items: [
      { href: "/app/inbox", label: "Unified inbox", icon: Inbox },
      { href: "/app/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    section: "AI Center",
    items: [
      { href: "/app/ai", label: "AI studio", icon: Sparkles },
      { href: "/app/knowledge", label: "Brand knowledge", icon: BookOpen },
    ],
  },
  {
    section: "Marketing",
    items: [
      { href: "/app/crm", label: "CRM & leads", icon: Users },
      { href: "/app/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/app/automations", label: "Automations", icon: WorkflowIcon },
    ],
  },
  { section: "Reports", items: [{ href: "/app/analytics", label: "Analytics", icon: BarChart3 }] },
  {
    section: "Organization",
    items: [
      { href: "/app/workspaces", label: "Businesses & team", icon: Briefcase },
      { href: "/app/billing", label: "Plan & billing", icon: CreditCard },
      { href: "/app/settings", label: "Settings", icon: Settings },
    ],
  },
];
const ALL_ITEMS = NAV.flatMap((s) => s.items);

const MOBILE_TABS: NavItem[] = [
  { href: "/app", label: "Home", icon: LayoutDashboard },
  { href: "/app/compose", label: "Create", icon: PenSquare },
  { href: "/app/inbox", label: "Inbox", icon: Inbox },
  { href: "/app/crm", label: "Leads", icon: Users },
];

function isActive(path: string, href: string) {
  return href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/");
}

function Brand() {
  return (
    <Link href="/app" className="flex items-center gap-2.5">
      <Image src="/mark.png" alt="" width={36} height={36} className="rounded-lg" />
      <div className="leading-tight">
        <p className="text-sm font-bold">
          Digi <span className="text-gradient italic">Mithra</span>
        </p>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-muted">SOCIAL PILOT</p>
      </div>
    </Link>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV.map((s) => (
        <div key={s.section}>
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-faint">{s.section}</p>
          <div className="space-y-0.5">
            {s.items.map((it) => {
              const active = isActive(path, it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    active ? "bg-brand/12 font-medium text-brand" : "text-muted hover:bg-panel-2 hover:text-ink",
                  )}
                >
                  <it.icon className="size-4" />
                  {it.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function WorkspaceSwitcher() {
  const { tenant, memberships, workspaces, workspace, switchTenant, switchWorkspace } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[60vw] items-center gap-2 rounded-lg border border-line-2 bg-panel-2 px-2.5 py-1.5 text-left hover:border-brand/50 sm:max-w-xs"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand/15 text-xs font-bold text-brand">
          {workspace.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{workspace.name}</span>
          <span className="block truncate text-[10px] text-faint">{tenant.name}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </button>
      {open && (
        <div className="animate-fade-up absolute left-0 z-50 mt-2 w-72 rounded-xl border border-line-2 bg-panel-2 p-1.5 shadow-2xl">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">Workspaces</p>
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                switchWorkspace(w.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-panel",
                w.id === workspace.id && "text-brand",
              )}
            >
              <span className="grid size-6 place-items-center rounded-md bg-white/5 text-xs">{w.name.slice(0, 1)}</span>
              <span className="truncate">{w.name}</span>
            </button>
          ))}
          <Link href="/app/workspaces" onClick={() => setOpen(false)} className="mt-1 block rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-panel">
            Manage businesses →
          </Link>
          {memberships.length > 1 && (
            <>
              <p className="mt-1 border-t border-line px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
                Organizations
              </p>
              {memberships.map((m) => (
                <button
                  key={m.tenant_id}
                  onClick={() => {
                    setOpen(false);
                    if (m.tenant_id !== tenant.id) switchTenant(m.tenant_id);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-panel",
                    m.tenant_id === tenant.id && "text-brand",
                  )}
                >
                  <span className="truncate">{m.tenants.name}</span>
                  <span className="text-[10px] text-faint">{m.role}</span>
                </button>
              ))}
            </>
          )}
          <Link href="/onboarding?new=1" className="block rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-panel">
            + New organization
          </Link>
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const supabase = createClient();
  const { user } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data ?? []) as Notification[]);
  }, [supabase, user.id]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: { new: Notification }) => setItems((prev) => [payload.new, ...prev].slice(0, 30)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, user.id, load]);

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const unread = items.filter((n) => !n.read_at).length;
  const markAll = async () => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-9 place-items-center rounded-lg text-muted hover:bg-panel-2 hover:text-ink"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="animate-fade-up fixed inset-x-3 top-16 z-50 rounded-xl border border-line-2 bg-panel-2 shadow-2xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs text-brand hover:underline">
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60dvh] overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up.</p>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={async () => {
                  setOpen(false);
                  if (!n.read_at) {
                    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
                    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
                  }
                  if (n.link) router.push(n.link);
                }}
                className="flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left hover:bg-panel"
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{n.title}</span>
                  {n.body && <span className="line-clamp-2 block text-xs text-muted">{n.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-faint">{timeAgo(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const results = useMemo(
    () => ALL_ITEMS.filter((i) => i.label.toLowerCase().includes(q.toLowerCase().trim())),
    [q],
  );
  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
    }
  }, [open]);
  if (!open) return null;
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="animate-fade-up w-full max-w-lg overflow-hidden rounded-2xl border border-line-2 bg-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setIdx((i) => Math.min(results.length - 1, i + 1));
              if (e.key === "ArrowUp") setIdx((i) => Math.max(0, i - 1));
              if (e.key === "Enter" && results[idx]) go(results[idx].href);
              if (e.key === "Escape") onClose();
            }}
            placeholder="Jump to…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line-2 px-1.5 text-[10px] text-faint">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {results.map((r, i) => (
            <button
              key={r.href}
              onMouseEnter={() => setIdx(i)}
              onClick={() => go(r.href)}
              className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", i === idx && "bg-brand/12 text-brand")}
            >
              <r.icon className="size-4" /> {r.label}
            </button>
          ))}
          {!results.length && <p className="px-3 py-6 text-center text-sm text-muted">No matches</p>}
        </div>
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, profile, tenantRole } = useApp();
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const name = profile?.full_name || user.email || "You";
  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-sm font-bold text-black"
      >
        {name.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="animate-fade-up absolute right-0 z-50 mt-2 w-60 rounded-xl border border-line-2 bg-panel-2 p-1.5 shadow-2xl">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-brand">{tenantRole}</p>
          </div>
          <Link href="/app/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-panel">
            <Settings className="size-4" /> Settings
          </Link>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/login");
              router.refresh();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-panel"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setDrawer(false), [path]);

  return (
    <div className="min-h-dvh md:flex">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-panel md:flex">
        <div className="border-b border-line px-4 py-4">
          <Brand />
        </div>
        <SideNav />
        <div className="border-t border-line p-3 text-[10px] leading-relaxed text-faint">
          Built on trust · Driven by growth
        </div>
      </aside>

      {/* mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-[70] bg-black/70 md:hidden" onClick={() => setDrawer(false)}>
          <aside onClick={(e) => e.stopPropagation()} className="animate-fade-up flex h-full w-72 flex-col border-r border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-4">
              <Brand />
              <button aria-label="Close menu" onClick={() => setDrawer(false)} className="text-muted">
                <X className="size-5" />
              </button>
            </div>
            <SideNav onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur sm:px-5">
          <button aria-label="Open menu" onClick={() => setDrawer(true)} className="grid size-9 place-items-center rounded-lg text-muted md:hidden">
            <Menu className="size-5" />
          </button>
          <WorkspaceSwitcher />
          <div className="flex-1" />
          <button
            onClick={() => setPalette(true)}
            className="hidden items-center gap-2 rounded-lg border border-line-2 px-3 py-1.5 text-sm text-faint hover:text-ink sm:flex"
          >
            <Search className="size-4" /> Search
            <kbd className="rounded border border-line-2 px-1 text-[10px]">⌘K</kbd>
          </button>
          <button aria-label="Search" onClick={() => setPalette(true)} className="grid size-9 place-items-center rounded-lg text-muted sm:hidden">
            <Search className="size-5" />
          </button>
          <Link href="/app/ai" aria-label="AI studio" className="hidden size-9 place-items-center rounded-lg text-muted hover:text-brand sm:grid">
            <Bot className="size-5" />
          </Link>
          <NotificationBell />
          <UserMenu />
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-28 sm:px-6 md:pb-10">{children}</main>
      </div>

      {/* mobile bottom tabs */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-panel/95 backdrop-blur md:hidden">
        {MOBILE_TABS.map((t) => {
          const active = isActive(path, t.href);
          return (
            <Link key={t.href} href={t.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px]", active ? "text-brand" : "text-muted")}>
              <t.icon className="size-5" />
              {t.label}
            </Link>
          );
        })}
        <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] text-muted">
          <Menu className="size-5" />
          More
        </button>
      </nav>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
