"use client";

import { cn } from "@/lib/utils";
import { Building2, CreditCard, LayoutDashboard, LifeBuoy, ScrollText, Settings, Tags, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Platform Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/payments", label: "Payment Reviews", icon: CreditCard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/plans", label: "Plans & Limits", icon: Tags },
  { href: "/admin/support", label: "Support Tickets", icon: LifeBuoy },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
  { href: "/admin/settings", label: "Platform Settings", icon: Settings },
];

export function AdminNav({ horizontal = false }: { horizontal?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={horizontal ? "flex flex-wrap gap-1" : "flex flex-col gap-1"}>
      {NAV.map((n) => {
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
      })}
      <Link href="/dashboard" className="mt-3 flex items-center gap-3 rounded-lg border border-evergreen-900/25 px-3 py-2.5 text-sm font-medium text-evergreen-900 hover:bg-evergreen-50">
        ← My organization dashboard
      </Link>
    </nav>
  );
}
