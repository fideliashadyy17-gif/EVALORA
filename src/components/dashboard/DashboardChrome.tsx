"use client";

import { Logo } from "@/components/Logo";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { createClient } from "@/lib/supabase/client";
import { tenantPortalLabel } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookOpenCheck,
  CreditCard,
  FileCheck2,
  GraduationCap,
  Layers3,
  LayoutDashboard,
  Library,
  ListChecks,
  LogOut,
  Menu,
  PenSquare,
  School,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

const NAV_SECTIONS: { title?: string; items: { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] }[] = [
  { items: [{ href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true }] },
  {
    title: "Academic Management",
    items: [
      { href: "/dashboard/academics/classes", label: "Classes", icon: School },
      { href: "/dashboard/students", label: "Students", icon: GraduationCap },
      { href: "/dashboard/academics", label: "Academic Structure", icon: Layers3, exact: true },
    ],
  },
  {
    title: "Assessment",
    items: [
      { href: "/dashboard/quizzes", label: "Quiz Studio", icon: PenSquare },
      { href: "/dashboard/questions", label: "Question Bank", icon: Library },
      { href: "/dashboard/exams", label: "Examinations", icon: FileCheck2 },
      { href: "/dashboard/rubrics", label: "Rubrics", icon: ListChecks },
      { href: "/dashboard/proctoring", label: "Proctoring", icon: ShieldCheck },
      { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/dashboard/team", label: "Team & Roles", icon: Users },
      { href: "/dashboard/billing", label: "Billing & Plan", icon: CreditCard },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

const navLink =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition";
const navIdle = "text-ink-soft hover:bg-evergreen-50 hover:text-evergreen-900";

export function DashboardChrome({
  orgName,
  orgSlug,
  isDemo,
  orgRole,
  canSwitchWorkspace,
  userName,
  children,
}: {
  orgName: string;
  orgSlug?: string;
  isDemo?: boolean;
  orgRole?: string;
  canSwitchWorkspace?: boolean;
  userName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title ?? "top"} className="flex flex-col gap-1">
          {section.title && (
            <p className="mt-4 px-3 text-[11px] font-bold uppercase tracking-wider text-evergreen-700/80">
              {section.title}
            </p>
          )}
          {section.items.map((n) => {
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href + n.label}
                href={n.href}
                onClick={() => setOpen(false)}
                className={cn(navLink, active ? "bg-evergreen-700 text-white shadow-sm" : navIdle)}
              >
                <n.icon className="h-5 w-5 shrink-0" />
                {n.label}
              </Link>
            );
          })}
        </div>
      ))}

      {canSwitchWorkspace && <Link href="/workspaces" className={cn(navLink, "mt-3", navIdle)}><School className="h-5 w-5 shrink-0" /> Switch workspace</Link>}
      <Link href="/" className={cn(navLink, "mt-3", navIdle)}>
        <BookOpenCheck className="h-5 w-5 shrink-0" />
        Public website
      </Link>
    </nav>
  );

  return (
    <div className="dashboard-chrome min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-evergreen-900/15 bg-paper p-5 lg:flex">
        <Logo href="/dashboard" />
        <div className="mt-6 rounded-xl border border-evergreen-900/10 bg-cream p-3">
          <p className="truncate text-sm font-semibold text-evergreen-950">{orgName}</p>
          <p className="text-xs capitalize text-ink-soft">{orgRole ?? "member"}</p>
          {orgSlug && <p className="mt-0.5 truncate text-[11px] text-evergreen-700">{tenantPortalLabel(orgSlug)}</p>}
          {isDemo && <p className="mt-1 inline-block rounded-full bg-gold-500 px-2 py-0.5 text-[10px] font-bold text-evergreen-950">DEMO — SAMPLE DATA</p>}
        </div>
        <div className="mt-4">
          <NotificationBell />
        </div>
        <div className="mt-2 flex-1 overflow-y-auto scroll-slim">{nav}</div>
        <div className="mt-4 border-t border-evergreen-900/10 pt-4">
          <p className="truncate px-1 text-sm font-medium text-ink">{userName}</p>
          <button onClick={signOut} className={cn(navLink, "mt-2 w-full", navIdle)}>
            <LogOut className="h-5 w-5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Topbar — mobile */}
        <header className="sticky top-0 z-40 flex h-[64px] items-center justify-between border-b border-evergreen-900/15 bg-paper/95 px-4 backdrop-blur lg:hidden">
          <Logo href="/dashboard" />
          <div className="flex items-center gap-1">
            <NotificationBell variant="icon" />
            <button onClick={() => setOpen((v) => !v)} className="rounded-lg p-2 text-evergreen-900" aria-label="Toggle menu">
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </header>
        {open && (
          <div className="border-b border-evergreen-900/15 bg-paper p-4 lg:hidden">
            <p className="mb-2 px-3 text-xs text-ink-soft">{orgName} · <span className="capitalize">{orgRole}</span></p>
            {nav}
            <button onClick={signOut} className={cn(navLink, "mt-3 w-full", navIdle)}>
              <LogOut className="h-5 w-5" /> Sign out
            </button>
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
