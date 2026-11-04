"use client";

import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Bell,
  BookOpenCheck,
  CreditCard,
  FileCheck2,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  PenSquare,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/quizzes", label: "Quiz Studio", icon: PenSquare },
  { href: "/dashboard/questions", label: "Question Bank", icon: Library },
  { href: "/dashboard/exams", label: "Examinations", icon: FileCheck2 },
  { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { href: "/dashboard/team", label: "Team & Roles", icon: Users },
  { href: "/dashboard/billing", label: "Billing & Plan", icon: CreditCard },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const navLink =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition";
const navIdle = "text-ink-soft hover:bg-evergreen-50 hover:text-evergreen-900";

export function DashboardChrome({
  orgName,
  orgRole,
  userName,
  isSuperAdmin,
  children,
}: {
  orgName: string;
  orgRole?: string;
  userName: string;
  isSuperAdmin?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .then(({ count }) => setUnread(count ?? 0));
  }, [pathname]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map((n) => {
        const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={cn(navLink, active ? "bg-evergreen-700 text-white shadow-sm" : navIdle)}
          >
            <n.icon className="h-5 w-5 shrink-0" />
            {n.label}
            {n.href === "/dashboard/notifications" && unread > 0 && (
              <span className="ml-auto rounded-full bg-gold-500 px-2 py-0.5 text-xs font-bold text-evergreen-950">
                {unread}
              </span>
            )}
          </Link>
        );
      })}
      {isSuperAdmin && (
        <Link
          href="/admin"
          onClick={() => setOpen(false)}
          className={cn(
            navLink,
            "mt-3 border border-gold-600/60",
            pathname.startsWith("/admin") ? "bg-gold-500 text-evergreen-950" : "text-gold-800 hover:bg-gold-50",
          )}
        >
          <ShieldCheck className="h-5 w-5 shrink-0" />
          Super Admin Console
        </Link>
      )}
      <Link href="/" className={cn(navLink, "mt-3", navIdle)}>
        <BookOpenCheck className="h-5 w-5 shrink-0" />
        Public website
      </Link>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-evergreen-900/15 bg-paper p-5 lg:flex">
        <Logo href="/dashboard" />
        <div className="mt-6 rounded-xl border border-evergreen-900/10 bg-cream p-3">
          <p className="truncate text-sm font-semibold text-evergreen-950">{orgName}</p>
          <p className="text-xs capitalize text-ink-soft">{orgRole ?? "member"}</p>
        </div>
        <div className="mt-6 flex-1 overflow-y-auto scroll-slim">{nav}</div>
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
          <button onClick={() => setOpen((v) => !v)} className="rounded-lg p-2 text-evergreen-900" aria-label="Toggle menu">
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
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
