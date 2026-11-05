"use client";

import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  Activity,
  Bell,
  Blocks,
  Building2,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  Clock3,
  CreditCard,
  FileCheck2,
  GraduationCap,
  KeyRound,
  Layers,
  LayoutDashboard,
  Library,
  LifeBuoy,
  Link2,
  ClipboardCheck,
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
  Sparkles,
  Tags,
  TrendingUp,
  Trophy,
  Upload,
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
    title: "A. Overview",
    items: [
      { href: "/admin", label: "Global Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/statistics", label: "Platform Statistics", icon: TrendingUp },
      { href: "/admin/audit", label: "Activity Monitoring", icon: Activity },
      { href: "/admin/activity", label: "Recent Operations", icon: ScrollText },
    ],
  },
  {
    title: "B. Organizations & Schools",
    items: [
      { href: "/admin/organizations", label: "All Organizations", icon: Building2 },
      { href: "/admin/classes", label: "Class Management", icon: GraduationCap },
      { href: "/admin/organizations/new", label: "Create Organization", icon: Plus },
      { href: "/admin/organizations/admins", label: "Organization Administrators", icon: UserCog },
      { href: "/admin/subscriptions", label: "Organization Subscriptions", icon: Repeat },
      { href: "/admin/organizations/settings", label: "Organization Settings", icon: Settings },
      { href: "/admin/demo", label: "DEMO School & Migration", icon: Sparkles },
    ],
  },
  {
    title: "C. Students & Users",
    items: [
      { href: "/admin/students", label: "All Students", icon: GraduationCap },
      { href: "/admin/users/teachers", label: "Teachers", icon: Users },
      { href: "/admin/users/school-admins", label: "School Administrators", icon: UserCog },
      { href: "/admin/users", label: "Platform Users", icon: Users },
      { href: "/admin/users/roles", label: "Roles & Permissions", icon: ShieldCheck },
      { href: "/admin/students/new", label: "Individual Student Registration", icon: Plus },
      { href: "/admin/students/bulk", label: "Bulk Student Registration", icon: Upload },
      { href: "/admin/students/bulk?mode=import-export", label: "Student Import & Export", icon: Upload },
      { href: "/admin/students/access", label: "Student Access Management", icon: KeyRound },
    ],
  },
  {
    title: "D. Live Competition",
    items: [
      { href: "/admin/competitions", label: "All Competitions", icon: Trophy },
      { href: "/admin/competitions/new", label: "Create Competition", icon: Plus },
      { href: "/admin/competitions/configuration", label: "Competition Configuration", icon: Settings },
      { href: "/admin/competitions/participants", label: "Participants", icon: Users },
      { href: "/admin/competitions/register", label: "Participant Registration", icon: UserCog },
      { href: "/admin/competitions/codes", label: "Access Codes", icon: KeyRound },
      { href: "/admin/competitions/questions", label: "Competition Questions", icon: Library },
      { href: "/admin/competitions/events", label: "Event Phases & Monitor", icon: Layers },
      { href: "/admin/competitions/pools", label: "Question Pools", icon: Tags },
      { href: "/admin/competitions/qualifications", label: "Qualification Review", icon: ClipboardCheck },
      { href: "/admin/competitions/live", label: "Live Monitoring", icon: Activity },
      { href: "/admin/competitions/results", label: "Rankings & Results", icon: Trophy },
      { href: "/admin/competitions/reports", label: "Competition Reports", icon: TrendingUp },
    ],
  },
  {
    title: "E. Quiz & Questions",
    items: [
      { href: "/admin/quizzes", label: "Quiz Dashboard / Manage Quizzes", icon: PenSquare },
      { href: "/admin/quizzes/new", label: "Create Quiz", icon: Plus },
      { href: "/admin/questions", label: "Question Bank", icon: Library },
      { href: "/admin/questions/new", label: "Create Question", icon: Plus },
      { href: "/admin/questions/categories", label: "Question Categories", icon: Tags },
      { href: "/admin/questions/types", label: "Question Types", icon: ClipboardList },
      { href: "/admin/questions/solutions", label: "Answers & Solutions", icon: FileCheck2 },
      { href: "/admin/quizzes/assignments", label: "Quiz Assignments", icon: Users },
      { href: "/admin/quizzes/results", label: "Quiz Results", icon: TrendingUp },
    ],
  },
  {
    title: "F. Examinations",
    items: [
      { href: "/admin/examinations", label: "Examination Dashboard / Manage", icon: FileCheck2 },
      { href: "/admin/examinations/new", label: "Create Examination", icon: Plus },
      { href: "/admin/examinations/questions", label: "Examination Questions", icon: Library },
      { href: "/admin/examinations/candidates", label: "Examination Candidates", icon: Users },
      { href: "/admin/examinations/register", label: "Candidate Registration", icon: UserCog },
      { href: "/admin/examinations/codes", label: "Candidate Access Codes", icon: KeyRound },
      { href: "/admin/examinations/invitations", label: "Share Links & Access Codes", icon: Link2 },
      { href: "/admin/examinations/schedule", label: "Schedule", icon: CalendarClock },
      { href: "/admin/examinations/time-limits", label: "Duration & Time Limits", icon: Clock3 },
      { href: "/admin/examinations/monitoring", label: "Monitoring", icon: Activity },
      { href: "/admin/examinations/marking", label: "Marking & Grading", icon: ClipboardList },
      { href: "/admin/examinations/results", label: "Examination Results", icon: TrendingUp },
      { href: "/admin/examinations/reports", label: "Reports & Exports", icon: ScrollText },
      { href: "/admin/proctoring", label: "Proctoring Oversight", icon: Video, badgeKey: "incidents" },
    ],
  },
  {
    title: "G. Payments & Subscriptions",
    items: [
      { href: "/admin/payments", label: "Payments", icon: CreditCard, badgeKey: "payments" },
      { href: "/admin/payments/new", label: "Manual Payment Management", icon: Plus },
      { href: "/admin/subscriptions", label: "Subscriptions", icon: Repeat },
      { href: "/admin/plans", label: "Subscription Plans", icon: Tags },
      { href: "/admin/subscriptions#assign", label: "Subscription Overrides", icon: Settings },
      { href: "/admin/revenue", label: "Billing History & Revenue", icon: TrendingUp },
    ],
  },
  {
    title: "H. Platform Administration",
    items: [
      { href: "/admin/users?role=super_admin", label: "Super Admin Users", icon: ShieldCheck },
      { href: "/admin/users/roles", label: "Roles & Permissions", icon: ShieldCheck },
      { href: "/admin/settings", label: "Platform Settings", icon: Settings },
      { href: "/admin/modules", label: "Modules & Features", icon: Blocks },
      { href: "/admin/audit", label: "Audit Logs", icon: ScrollText },
      { href: "/admin/system", label: "System Health", icon: Activity },
      { href: "/admin/notifications", label: "Notifications", icon: Bell, badgeKey: "unread" },
      { href: "/admin/support", label: "Support Tickets", icon: LifeBuoy, badgeKey: "tickets" },
    ],
  },
  {
    title: "I. Operational Workspace",
    items: [
      { href: "/admin/operations", label: "Full Customer Workspace Access", icon: LayoutDashboard },
      { href: "/admin/classes", label: "Class Management (direct)", icon: GraduationCap },
      { href: "/admin/examinations/invitations", label: "Exam Links & Codes", icon: Link2 },
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(GROUPS.map((g) => [g.title, true])),
  );
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

  const navPath = (href: string) => href.split(/[?#]/)[0];
  const navMatches = (n: NavItem) => {
    const base = navPath(n.href);
    return n.exact ? pathname === base : pathname === base || pathname.startsWith(`${base}/`);
  };
  const longestNavMatch = Math.max(
    0,
    ...GROUPS.flatMap((g) => g.items).filter(navMatches).map((n) => navPath(n.href).length),
  );

  useEffect(() => {
    setOpenGroups((current) => {
      const next = { ...current };
      for (const group of GROUPS) {
        if (group.items.some((item) => navMatches(item) && navPath(item.href).length === longestNavMatch)) {
          next[group.title] = true;
        }
      }
      return next;
    });
    // navMatches is intentionally derived from pathname for this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, longestNavMatch]);

  const navLink = (n: NavItem, iconOnly: boolean, groupTitle: string) => {
    const active = navMatches(n) && navPath(n.href).length === longestNavMatch;
    const badge = n.badgeKey ? counts[n.badgeKey as keyof ShellCounts] : 0;
    return (
      <Link
        key={`${groupTitle}-${n.label}-${n.href}`}
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
    <nav className="flex flex-col gap-4" aria-label="Super Admin modules">
      {GROUPS.map((g) => {
        const open = iconOnly || openGroups[g.title] !== false;
        return (
          <div key={g.title}>
            {!iconOnly && (
              <button
                type="button"
                onClick={() => setOpenGroups((current) => ({ ...current, [g.title]: !open }))}
                aria-expanded={open}
                className="mb-1.5 flex w-full items-center justify-between rounded-md px-3 py-1 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft hover:bg-evergreen-50 hover:text-evergreen-900"
              >
                <span>{g.title}</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
              </button>
            )}
            {open && <div className="flex flex-col gap-1">{g.items.map((n) => navLink(n, iconOnly, g.title))}</div>}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className={cn("min-h-screen lg:grid", collapsed ? "lg:grid-cols-[84px_1fr]" : "lg:grid-cols-[292px_1fr]")}>
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
                    { href: "/admin/questions/new", label: "Create mathematical question", icon: Library },
                    { href: "/admin/quizzes/new", label: "Create quiz", icon: PenSquare },
                    { href: "/admin/examinations/new", label: "Create examination", icon: FileCheck2 },
                    { href: "/admin/examinations/register", label: "Register exam candidates", icon: Users },
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
                      {workspaceForm("/dashboard/questions/new", "Add questions in workspace", Library)}
                      {workspaceForm("/dashboard/exams/new", "Create examination in workspace", FileCheck2)}
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
