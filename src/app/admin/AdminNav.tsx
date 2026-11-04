"use client";

import { cn } from "@/lib/utils";
import {
  Activity,
  Bell,
  Blocks,
  Building2,
  CreditCard,
  FileCheck2,
  LayoutDashboard,
  Library,
  LifeBuoy,
  PenSquare,
  Repeat,
  ScrollText,
  Settings,
  Tags,
  TrendingUp,
  Trophy,
  Users,
  Video,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

interface NavItem { href: string; label: string; icon: ComponentType<{ className?: string }>; exact?: boolean }
interface NavGroup { title: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [{ href: "/admin", label: "Platform Overview", icon: LayoutDashboard, exact: true }],
  },
  {
    title: "People",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/organizations", label: "Organizations", icon: Building2 },
    ],
  },
  {
    title: "Content & Events",
    items: [
      { href: "/admin/competitions", label: "Competitions (Live)", icon: Trophy },
      { href: "/admin/quizzes", label: "Quiz Management", icon: PenSquare },
      { href: "/admin/questions", label: "Question Bank", icon: Library },
      { href: "/admin/examinations", label: "Examinations", icon: FileCheck2 },
      { href: "/admin/proctoring", label: "Proctoring", icon: Video },
    ],
  },
  {
    title: "Commerce",
    items: [
      { href: "/admin/subscriptions", label: "Subscriptions", icon: Repeat },
      { href: "/admin/plans", label: "Pricing & Plans", icon: Tags },
      { href: "/admin/payments", label: "Payment Reviews", icon: CreditCard },
      { href: "/admin/revenue", label: "Revenue & Reports", icon: TrendingUp },
    ],
  },
  {
    title: "Platform",
    items: [
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
      { href: "/admin/modules", label: "Modules & Features", icon: Blocks },
      { href: "/admin/settings", label: "Platform Settings", icon: Settings },
      { href: "/admin/support", label: "Support Tickets", icon: LifeBuoy },
      { href: "/admin/audit", label: "Security & Audit Logs", icon: ScrollText },
      { href: "/admin/system", label: "Technical Monitoring", icon: Activity },
    ],
  },
];

export function AdminNav({ horizontal = false }: { horizontal?: boolean }) {
  const pathname = usePathname();

  const renderItem = (n: NavItem) => {
    const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
    return (
      <Link
        key={n.href}
        href={n.href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
          active ? "bg-gold-500 text-evergreen-950" : "text-ink-soft hover:bg-evergreen-50 hover:text-evergreen-900",
        )}
      >
        <n.icon className="h-5 w-5 shrink-0" />
        {n.label}
      </Link>
    );
  };

  if (horizontal) {
    return (
      <nav className="flex flex-wrap gap-1">
        {GROUPS.flatMap((g) => g.items).map(renderItem)}
        <Link href="/dashboard" className="flex items-center gap-3 rounded-lg border border-evergreen-900/25 px-3 py-2.5 text-sm font-medium text-evergreen-900 hover:bg-evergreen-50">
          ← My organization dashboard
        </Link>
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{g.title}</p>
          <div className="flex flex-col gap-1">{g.items.map(renderItem)}</div>
        </div>
      ))}
      <Link href="/dashboard" className="flex items-center gap-3 rounded-lg border border-evergreen-900/25 px-3 py-2.5 text-sm font-medium text-evergreen-900 hover:bg-evergreen-50">
        ← My organization dashboard
      </Link>
    </nav>
  );
}
