"use client";

import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  Activity,
  Bell,
  Blocks,
  Building2,
  ChevronDown,
  CreditCard,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  Library,
  LifeBuoy,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PenSquare,
  Plus,
  Repeat,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Tags,
  TrendingUp,
  Trophy,
  UserCog,
  Users,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { enterOrgWorkspace, exitOrgWorkspace } from "./actions/orgs";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  badgeKey?: string;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [{ href: "/admin", label: "Platform Overview", icon: LayoutDashboard, exact: true }],
  },
  {
    title: "People & Institutions",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/organizations", label: "Organizations", icon: Building2 },
      { href: "/admin/students", label: "Schools & Students", icon: GraduationCap },
    ],
  },
  {
    title: "Content & Events",
    items: [
      { href: "/admin/competitions", label: "Competitions", icon: Trophy },
      { href: "/admin/quizzes", label: "Quiz Management", icon: PenSquare },
      { href: "/admin/questions", label: "Question Bank", icon: Library },
      { href: "/admin/examinations", label: "Examinations", icon: FileCheck2 },
      { href: "/admin/proctoring", label: "Proctoring", icon: Video, badgeKey: "incidents" },
    ],
  },
  {
    title: "Commerce",
    items: [
      { href: "/admin/subscriptions", label: "Subscriptions", icon: Repeat },
      { href: "/admin/plans", label: "Pricing & Plans", icon: Tags },
      { href: "/admin/payments", label: "Payments", icon: CreditCard, badgeKey: "payments" },
      { href: "/admin/revenue", label: "Revenue & Reports", icon: TrendingUp },
    ],
  },
  {
    title: "Platform",
    items: [
      { href: "/admin/notifications", label: "Notifications", icon: Bell, badgeKey: "unread" },
      { href: "/admin/modules", label: "Modules & Features", icon: Blocks },
      { href: "/admin/settings", label: "Platform Settings", icon: Settings },
      { href: "/admin/support", label: "Support Tickets", icon: LifeBuoy, badgeKey: "tickets" },
      { href: "/admin/audit", label: "Security & Audit Logs", icon: ScrollText },
      { href: "/admin/system", label: "Technical Monitoring", icon: Activity },
    ],
  },
];

export interface ShellCounts {
  payments: number;
  tickets: number;
  incidents: number;
  unread: number;
}

function useDismiss<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { ref, open, setOpen };
}

export function AdminShell({
  email,
  isPrimary,
  counts,
  platformOrgId,
  adminContextName,
  children,
}: {
  email: string;
  isPrimary: boolean;
  counts: ShellCounts;
  platformOrgId: string | null;
  adminContextName: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const quick = useDismiss<HTMLDivElement>();
  const profile = useDismiss<HTMLDivElement>();

  useEffect(() => {
    setCollapsed(localStorage.getItem("evalora-admin-collapsed") === "1");
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((v) => {
      localStorage.setItem("evalora-admin-collapsed", v ? "0" : "1");
      return !v;
    });

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const totalAlerts = counts.payments + counts.tickets + counts.incidents + counts.unread;

  const workspaceForm = (next: string, label: string, Icon: ComponentType<{ className?: string }>) => (
    <form key={next} action={enterOrgWorkspace}>
      <input type="hidden" name="organization_id" value={platformOrgId ?? ""} />
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-evergreen-50"
      >
        <Icon className="h-4 w-4 text-evergreen-700" /> {label}
      </button>
    </form>
  );

  const navLink = (n: NavItem, iconOnly: boolean) => {
    const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
    const badge = n.badgeKey ? counts[n.badgeKey as keyof ShellCounts] : 0;
    return (
      <Link
        key={n.href}
        href={n.href}
        title={iconOnly ? n.label : undefined}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
          iconOnly && "justify-center px-2",
          active
            ? "bg-evergreen-700 text-white shadow-sm"
            : "text-ink-soft hover:bg-evergreen-50 hover:text-evergreen-900",
        )}
      >
        <n.icon className="h-5 w-5 shrink-0" />
        {!iconOnly && <span className="truncate">{n.label}</span>}
        {!iconOnly && badge > 0 && (
          <span className="ml-auto rounded-full bg-gold-500 px-2 py-0.5 text-xs font-bold text-evergreen-950">{badge}</span>
        )}
      </Link>
    );
  };

  const renderNav = (iconOnly: boolean) => (
    <nav className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <div key={g.title}>
          {!iconOnly && (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{g.title}</p>
          )}
          <div className="flex flex-col gap-1">{g.items.map((n) => navLink(n, iconOnly))}</div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className={cn("min-h-screen lg:grid", collapsed ? "lg:grid-cols-[84px_1fr]" : "lg:grid-cols-[264px_1fr]")}>
      {/* ─── Sidebar (desktop) ─── */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-evergreen-900/15 bg-paper p-4 lg:flex">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && <Logo href="/admin" />}
          <button
            onClick={toggleCollapsed}
            className="rounded-lg p-2 text-evergreen-900 hover:bg-evergreen-50"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        </div>
        {!collapsed && (
          <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-gold-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-evergreen-950">
            <ShieldCheck className="h-3.5 w-3.5" /> {isPrimary ? "Primary Super Admin" : "Super Admin"}
          </p>
        )}
        <div className="mt-5 flex-1 overflow-y-auto scroll-slim pr-1">{renderNav(collapsed)}</div>
        <div className="mt-4 border-t border-evergreen-900/10 pt-4">
          {!collapsed && <p className="truncate px-1 text-xs text-ink-soft">{email}</p>}
          <Link
            href="/dashboard"
            title={collapsed ? "My workspace" : undefined}
            className={cn(
              "mt-2 flex items-center gap-3 rounded-lg border border-evergreen-900/25 px-3 py-2.5 text-sm font-medium text-evergreen-900 hover:bg-evergreen-50",
              collapsed && "justify-center px-2",
            )}
          >
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            {!collapsed && "My workspace"}
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        {/* ─── Top navigation ─── */}
        <header className="sticky top-0 z-40 border-b border-evergreen-900/15 bg-paper/95 backdrop-blur">
          <div className="flex h-[64px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-lg p-2 text-evergreen-900 lg:hidden"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <span className="lg:hidden">
              <Logo href="/admin" />
            </span>

            {/* Global search */}
            <form
              className="relative ml-auto hidden w-full max-w-sm sm:block"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim().length >= 2) router.push(`/admin/search?q=${encodeURIComponent(query.trim())}`);
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users, organizations, competitions, payments…"
                className="w-full rounded-full border border-evergreen-900/20 bg-cream py-2 pl-9 pr-4 text-sm text-ink outline-none placeholder:text-ink-soft focus:border-evergreen-600 focus:bg-white"
                aria-label="Global search"
              />
            </form>

            {/* Quick actions */}
            <div className="relative ml-auto sm:ml-0" ref={quick.ref}>
              <button
                onClick={() => quick.setOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full bg-evergreen-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-evergreen-800"
                aria-haspopup="menu"
                aria-expanded={quick.open}
              >
                <Plus className="h-4 w-4" /> <span className="hidden md:inline">Quick create</span>
                <ChevronDown className="h-4 w-4" />
              </button>
              {quick.open && (
                <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-evergreen-900/15 bg-white p-2 shadow-xl" role="menu">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Platform</p>
                  {[
                    { href: "/admin/organizations/new", label: "Create organization", icon: Building2 },
                    { href: "/admin/students/new", label: "Register a student", icon: GraduationCap },
                    { href: "/admin/competitions/new", label: "Create competition", icon: Trophy },
                    { href: "/admin/payments/new", label: "Add a payment", icon: CreditCard },
                    { href: "/admin/subscriptions#assign", label: "Assign a subscription", icon: Repeat },
                    { href: "/admin/users/new", label: "Create user / invite admin", icon: UserCog },
                  ].map((a) => (
                    <Link
                      key={a.href}
                      href={a.href}
                      onClick={() => quick.setOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink hover:bg-evergreen-50"
                    >
                      <a.icon className="h-4 w-4 text-evergreen-700" /> {a.label}
                    </Link>
                  ))}
                  {platformOrgId && (
                    <>
                      <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                        In EVALORA Platform workspace
                      </p>
                      {workspaceForm("/dashboard/quizzes/new", "Create a live quiz", PenSquare)}
                      {workspaceForm("/dashboard/questions/new", "Add questions", Library)}
                      {workspaceForm("/dashboard/exams/new", "Create an examination", FileCheck2)}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Notifications */}
            <Link
              href="/admin/notifications"
              className="relative rounded-full p-2.5 text-evergreen-900 hover:bg-evergreen-50"
              aria-label={`Notifications${totalAlerts ? ` (${totalAlerts} needing attention)` : ""}`}
            >
              <Bell className="h-5 w-5" />
              {totalAlerts > 0 && (
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-gold-500 px-1.5 py-0.5 text-[11px] font-bold leading-none text-evergreen-950">
                  {totalAlerts}
                </span>
              )}
            </Link>

            {/* Profile */}
            <div className="relative" ref={profile.ref}>
              <button
                onClick={() => profile.setOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-evergreen-900/20 py-1.5 pl-1.5 pr-2.5 hover:bg-evergreen-50"
                aria-haspopup="menu"
                aria-expanded={profile.open}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-evergreen-700 text-sm font-bold text-white">
                  {email.slice(0, 1).toUpperCase()}
                </span>
                <ChevronDown className="h-4 w-4 text-ink-soft" />
              </button>
              {profile.open && (
                <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-evergreen-900/15 bg-white p-2 shadow-xl" role="menu">
                  <div className="border-b border-evergreen-900/10 px-3 pb-2 pt-1">
                    <p className="truncate text-sm font-semibold text-ink">{email}</p>
                    <p className="text-xs font-medium text-gold-800">{isPrimary ? "Primary Super Admin" : "Super Admin"}</p>
                  </div>
                  <Link href="/dashboard/settings" onClick={() => profile.setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink hover:bg-evergreen-50">
                    <UserCog className="h-4 w-4 text-evergreen-700" /> Account settings
                  </Link>
                  <Link href="/admin/settings" onClick={() => profile.setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink hover:bg-evergreen-50">
                    <Settings className="h-4 w-4 text-evergreen-700" /> Platform settings
                  </Link>
                  <Link href="/admin/audit" onClick={() => profile.setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink hover:bg-evergreen-50">
                    <ScrollText className="h-4 w-4 text-evergreen-700" /> Security & audit logs
                  </Link>
                  <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-red-50 hover:text-red-800">
                    <LogOut className="h-4 w-4 text-evergreen-700" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Administrative workspace-mode banner */}
          {adminContextName && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gold-600/40 bg-gold-50 px-4 py-2 text-sm text-evergreen-950 sm:px-6">
              <span>
                <strong>Workspace mode:</strong> organization tools are operating on <strong>{adminContextName}</strong>.
              </span>
              <form action={exitOrgWorkspace}>
                <button type="submit" className="font-semibold underline underline-offset-2 hover:text-evergreen-800">
                  Exit workspace mode
                </button>
              </form>
            </div>
          )}
        </header>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="max-h-[70vh] overflow-y-auto border-b border-evergreen-900/15 bg-paper p-4 lg:hidden">
            {renderNav(false)}
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
