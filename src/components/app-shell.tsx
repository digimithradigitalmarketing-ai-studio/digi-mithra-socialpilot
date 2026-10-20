"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  Bookmark,
  Briefcase,
  CalendarClock,
  CalendarDays,
  LifeBuoy,
  ShieldCheck,
  CheckCheck,
  ChevronDown,
  ChevronsUpDown,
  Crown,
  CreditCard,
  FileText,
  Filter,
  Globe,
  ListTodo,
  Mail,
  PieChart,
  Gauge,
  Image as ImageIcon,
  Inbox,
  Lightbulb,
  LayoutGrid,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  PenLine,
  PenSquare,
  Plug,
  Radar,
  Search,
  Settings,
  Star,
  Swords,
  UserRound,
  Users,
  Volume2,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { roleLabel } from "@/lib/roles";
import { Avatar } from "@/components/avatar";
import type { Notification } from "@/lib/types";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
const NAV: { section: string | null; items: NavItem[] }[] = [
  {
    section: null,
    items: [
      { href: "/app/chat", label: "Chat", icon: MessageCircle },
      { href: "/app", label: "Dashboard", icon: LayoutGrid },
      { href: "/app/research", label: "Research", icon: Radar },
      { href: "/app/ideas", label: "Ideas", icon: Lightbulb },
      { href: "/app/write", label: "Write", icon: PenLine },
      { href: "/app/analytics", label: "Analyze", icon: BarChart3 },
      { href: "/app/optimize", label: "Optimize", icon: Gauge },
      { href: "/app/competitors", label: "Competitors", icon: Swords },
      { href: "/app/brand", label: "My Brand", icon: Volume2 },
      { href: "/app/saved", label: "Saved", icon: Bookmark },
    ],
  },
  {
    section: "Publish",
    items: [
      { href: "/app/compose", label: "Composer", icon: PenSquare },
      { href: "/app/posts", label: "Posts", icon: FileText },
      { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/app/approvals", label: "Approvals", icon: ListChecks },
      { href: "/app/media", label: "Media library", icon: ImageIcon },
      { href: "/app/accounts", label: "Connections", icon: Plug },
    ],
  },
  {
    section: "Engage",
    items: [
      { href: "/app/inbox", label: "Inbox", icon: Inbox },
      { href: "/app/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    section: "Grow",
    items: [
      { href: "/app/crm", label: "CRM & leads", icon: Users },
      { href: "/app/appointments", label: "Appointments", icon: CalendarClock },
      { href: "/app/tasks", label: "Tasks", icon: ListTodo },
      { href: "/app/segments", label: "Segments", icon: Filter },
      { href: "/app/email", label: "Email marketing", icon: Mail },
      { href: "/app/landing-pages", label: "Landing pages", icon: Globe },
      { href: "/app/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/app/automations", label: "Automations", icon: WorkflowIcon },
      { href: "/app/attribution", label: "Attribution", icon: PieChart },
    ],
  },
  {
    section: "Organization",
    items: [
      { href: "/app/workspaces", label: "Businesses & team", icon: Briefcase },
      { href: "/app/billing", label: "Plan & billing", icon: CreditCard },
      { href: "/app/support", label: "Help & support", icon: LifeBuoy },
      { href: "/app/settings", label: "Settings", icon: Settings },
    ],
  },
];
const ALL_ITEMS = NAV.flatMap((s) => s.items);
const EXTRA_TITLES: Record<string, string> = { "/app/ai": "AI studio", "/app/knowledge": "Brand knowledge", "/app/admin": "Super admin", "/app/profile": "My profile" };

const MOBILE_TABS: NavItem[] = [
  { href: "/app", label: "Home", icon: LayoutGrid },
  { href: "/app/write", label: "Write", icon: PenLine },
  { href: "/app/chat", label: "Chat", icon: MessageCircle },
  { href: "/app/inbox", label: "Inbox", icon: Inbox },
];

function isActive(path: string, href: string) {
  return href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/");
}

function Brand() {
  return (
    <Link href="/app" className="flex items-center gap-2.5">
      <Image src="/mark.png" alt="" width={38} height={38} className="rounded-xl" />
      <div className="leading-tight">
        <p className="text-[15px] font-bold tracking-tight">
          Digi <span className="text-gradient italic">Mithra</span>
        </p>
        <p className="text-[9px] font-semibold tracking-[0.22em] text-faint">SOCIAL PILOT</p>
      </div>
    </Link>
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
  const initials = workspace.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="shadow-soft flex w-full items-center gap-2.5 rounded-2xl border border-line bg-panel px-3 py-2.5 text-left hover:border-brand/40"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-brand/25 bg-brand/8 text-xs font-bold text-brand-ink">{initials}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{workspace.name}</span>
          <span className="block truncate text-[11px] text-faint">{tenant.name}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-faint" />
      </button>
      {open && (
        <div className="animate-fade-up absolute inset-x-0 z-50 mt-2 rounded-2xl border border-line bg-panel p-1.5 shadow-2xl">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">Workspaces</p>
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                switchWorkspace(w.id);
                setOpen(false);
              }}
              className={cn("flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-panel-2", w.id === workspace.id && "text-brand-ink")}
            >
              <span className="grid size-6 place-items-center rounded-md bg-ink/5 text-xs">{w.name.slice(0, 1)}</span>
              <span className="truncate">{w.name}</span>
            </button>
          ))}
          <Link href="/app/workspaces" onClick={() => setOpen(false)} className="mt-1 block rounded-xl px-2 py-1.5 text-xs text-muted hover:bg-panel-2">
            Manage businesses →
          </Link>
          {memberships.length > 1 && (
            <>
              <p className="mt-1 border-t border-line px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">Organizations</p>
              {memberships.map((m) => (
                <button
                  key={m.tenant_id}
                  onClick={() => {
                    setOpen(false);
                    if (m.tenant_id !== tenant.id) switchTenant(m.tenant_id);
                  }}
                  className={cn("flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-sm hover:bg-panel-2", m.tenant_id === tenant.id && "text-brand-ink")}
                >
                  <span className="truncate">{m.tenants.name}</span>
                  <span className="text-[10px] text-faint">{m.role}</span>
                </button>
              ))}
            </>
          )}
          <Link href="/onboarding?new=1" className="block rounded-xl px-2 py-1.5 text-xs text-muted hover:bg-panel-2">
            + New organization
          </Link>
        </div>
      )}
    </div>
  );
}

const ADMIN_NAV = { section: "Platform", items: [{ href: "/app/admin", label: "Super admin", icon: ShieldCheck }] };

function usePlatformAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    createClient()
      .rpc("platform_is_admin")
      .then(({ data }: { data: boolean | null }) => setIsAdmin(Boolean(data)));
  }, []);
  return isAdmin;
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const isAdmin = usePlatformAdmin();
  const sections = isAdmin ? [...NAV, ADMIN_NAV] : NAV;
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
      {sections.map((s, i) => (
        <div key={i}>
          {s.section && <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-faint">{s.section}</p>}
          <div className="space-y-0.5">
            {s.items.map((it) => {
              const active = isActive(path, it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition-colors",
                    active ? "bg-brand/10 font-medium text-brand-ink" : "text-muted hover:bg-panel-2 hover:text-ink",
                  )}
                >
                  <it.icon className="size-[18px]" />
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

function NotificationBell() {
  const supabase = createClient();
  const { user } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
    setItems((data ?? []) as Notification[]);
  }, [supabase, user.id]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload: { new: Notification }) =>
        setItems((prev) => [payload.new, ...prev].slice(0, 30)),
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
      <button aria-label="Notifications" onClick={() => setOpen((o) => !o)} className="relative grid size-9 place-items-center rounded-xl text-muted hover:bg-panel-2 hover:text-ink">
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-on-brand">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div className="animate-fade-up fixed inset-x-3 top-16 z-50 rounded-2xl border border-line bg-panel shadow-2xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs text-brand-ink hover:underline">
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
                className="flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left hover:bg-panel-2"
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
  const results = useMemo(() => ALL_ITEMS.filter((i) => i.label.toLowerCase().includes(q.toLowerCase().trim())), [q]);
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
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh] backdrop-blur-sm dark:bg-black/70" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="animate-fade-up w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
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
              className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm", i === idx && "bg-brand/10 text-brand-ink")}
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
  const { user, profile, tenantRole, tenant, workspace } = useApp();
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
      <button aria-label="Account menu" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 hover:bg-panel-2">
        <Avatar src={profile?.avatar_url} name={name} />
        <ChevronDown className="hidden size-4 text-faint sm:block" />
      </button>
      {open && (
        <div className="animate-fade-up absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-line bg-panel p-1.5 shadow-2xl">
          <div className="flex items-center gap-3 rounded-xl bg-panel-2 px-3 py-3">
            <Avatar src={profile?.avatar_url} name={name} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-ink">{roleLabel(tenantRole)}</p>
            </div>
          </div>
          <div className="space-y-1 px-3 py-2 text-xs text-muted">
            <p className="flex justify-between gap-2">
              <span>Organization</span>
              <span className="truncate font-medium text-ink">{tenant.name}</span>
            </p>
            <p className="flex justify-between gap-2">
              <span>Workspace</span>
              <span className="truncate font-medium text-ink">{workspace.name}</span>
            </p>
            {user.last_sign_in_at && (
              <p className="flex justify-between gap-2">
                <span>Signed in</span>
                <span className="font-medium text-ink">{formatDate(user.last_sign_in_at)}</span>
              </p>
            )}
          </div>
          <Link href="/app/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-panel-2">
            <UserRound className="size-4" /> My profile
          </Link>
          <Link href="/app/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-panel-2">
            <Settings className="size-4" /> Settings
          </Link>
          <Link href="/app/brand" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-panel-2">
            <Volume2 className="size-4" /> My Brand
          </Link>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/login");
              router.refresh();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-danger hover:bg-panel-2"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function SidebarUser({ onNavigate }: { onNavigate?: () => void }) {
  const { user, profile, tenantRole } = useApp();
  const name = profile?.full_name || user.email || "You";
  return (
    <Link href="/app/profile" onClick={onNavigate} className="m-3 flex items-center gap-3 rounded-2xl border border-line bg-panel-2 p-2.5 hover:border-brand/40">
      <Avatar src={profile?.avatar_url} name={name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{name}</span>
        <span className="block truncate text-[11px] text-faint">{roleLabel(tenantRole)}</span>
      </span>
    </Link>
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

  const title =
    EXTRA_TITLES[path] ??
    [...ALL_ITEMS].sort((a, b) => b.href.length - a.href.length).find((i) => isActive(path, i.href))?.label ??
    "Dashboard";

  const sidebar = (onNavigate?: () => void) => (
    <>
      <div className="px-5 pt-5 pb-3">
        <Brand />
      </div>
      <div className="px-3 pb-1">
        <WorkspaceSwitcher />
      </div>
      <SideNav onNavigate={onNavigate} />
      <SidebarUser onNavigate={onNavigate} />
    </>
  );

  return (
    <div className="app-wash min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-panel md:flex">{sidebar()}</aside>

      {drawer && (
        <div className="fixed inset-0 z-[70] bg-slate-900/40 dark:bg-black/70 md:hidden" onClick={() => setDrawer(false)}>
          <aside onClick={(e) => e.stopPropagation()} className="animate-fade-up relative flex h-full w-72 flex-col border-r border-line bg-panel">
            <button aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute top-5 right-4 text-muted">
              <X className="size-5" />
            </button>
            {sidebar(() => setDrawer(false))}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b border-line bg-panel/80 px-3 backdrop-blur sm:px-6">
          <button aria-label="Open menu" onClick={() => setDrawer(true)} className="grid size-9 place-items-center rounded-xl text-muted md:hidden">
            <Menu className="size-5" />
          </button>
          <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
          <div className="flex-1" />
          <button onClick={() => setPalette(true)} className="hidden items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm text-faint hover:text-ink lg:flex">
            <Search className="size-4" /> Search
            <kbd className="rounded border border-line-2 px-1 text-[10px]">⌘K</kbd>
          </button>
          <button aria-label="Search" onClick={() => setPalette(true)} className="grid size-9 place-items-center rounded-xl text-muted lg:hidden">
            <Search className="size-5" />
          </button>
          <Link
            href="/app/billing"
            className="hidden items-center gap-2 rounded-xl border border-brand/15 bg-brand/8 px-3.5 py-2 text-sm font-medium text-brand-ink hover:bg-brand/12 sm:flex"
          >
            <Crown className="size-4" /> Upgrade
          </Link>
          <ThemeToggle />
          <NotificationBell />
          <UserMenu />
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 sm:px-6 md:pb-10">{children}</main>
      </div>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-panel/95 backdrop-blur md:hidden">
        {MOBILE_TABS.map((t) => {
          const active = isActive(path, t.href);
          return (
            <Link key={t.href} href={t.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px]", active ? "text-brand-ink" : "text-muted")}>
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
