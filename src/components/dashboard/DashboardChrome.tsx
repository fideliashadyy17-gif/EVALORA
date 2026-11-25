"use client";

import { Logo } from "@/components/Logo";
import { PlatformCredit } from "@/components/PlatformCredit";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { createClient } from "@/lib/supabase/client";
import { workspaceLabel, type NavAudience } from "@/lib/navAccess";
import { isNavVisible } from "@/lib/navModules";
import { tenantPortalLabel } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import {
  Award,
  BarChart3,
  BookOpenCheck,
  CreditCard,
  Eye,
  FileCheck2,
  FileText,
  GraduationCap,
  KeyRound,
  Layers3,
  LayoutDashboard,
  Library,
  Link2,
  ListChecks,
  LogOut,
  Menu,
  PenSquare,
  Percent,
  School,
  Sigma,
  Settings,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  /** Dictionary key for the interface locale; falls back to `label`. */
  labelKey?: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  /** Defaults to "all"; administration entries are managers-only. */
  audience?: NavAudience;
}

const NAV_SECTIONS: { title?: string; titleKey?: string; items: NavItem[] }[] = [
  { items: [{ href: "/dashboard", label: "Overview", labelKey: "nav.overview", icon: LayoutDashboard, exact: true }] },
  {
    title: "Institutional Management", titleKey: "nav.institutionalManagement",
    items: [
      { href: "/dashboard/students", label: "Students", labelKey: "nav.students", icon: GraduationCap, audience: "operational" },
      { href: "/dashboard/teachers", label: "Teachers", labelKey: "nav.teachers", icon: BookOpenCheck, audience: "staff" },
      { href: "/dashboard/team", label: "Staff & Members", labelKey: "nav.team", icon: Users, audience: "staff" },
      { href: "/dashboard/academics/classes", label: "Classes", labelKey: "nav.classes", icon: School, audience: "operational" },
      { href: "/dashboard/academics", label: "Academic Structure", labelKey: "nav.academicStructure", icon: Layers3, exact: true, audience: "operational" },
      { href: "/dashboard/accounts", label: "Accounts & Permissions", labelKey: "nav.accountsPermissions", icon: KeyRound, audience: "managers" },
      { href: "/dashboard/rbac", label: "Role & Access Management", labelKey: "nav.rbac", icon: ShieldCheck, audience: "managers" },
      { href: "/dashboard/grading", label: "Grading Systems", labelKey: "nav.gradingSystems", icon: Percent, audience: "managers" },
      { href: "/dashboard/settings", label: "Organization Settings", labelKey: "nav.organizationSettings", icon: Settings, audience: "managers" },
    ],
  },
  {
    title: "Assessment", titleKey: "nav.assessments",
    items: [
      { href: "/dashboard/paper-builder", label: "Question Paper Builder", labelKey: "nav.paperBuilder", icon: FileText, audience: "operational" },
      { href: "/dashboard/quizzes", label: "Quizzes", labelKey: "nav.quizzes", icon: PenSquare, audience: "operational" },
      { href: "/dashboard/exams", label: "Examinations", labelKey: "nav.examinations", icon: FileCheck2, audience: "operational" },
      { href: "/dashboard/formulas", label: "Formula Library", labelKey: "nav.formulas", icon: Sigma, audience: "operational" },
      { href: "/dashboard/questions", label: "Question Bank", labelKey: "nav.questionBank", icon: Library, audience: "operational" },
      { href: "/dashboard/competitions", label: "Live Competitions", labelKey: "nav.competitions", icon: Trophy, audience: "operational" },
      { href: "/dashboard/competitions/rankings", label: "Rankings & Results", labelKey: "nav.rankingsResults", icon: Trophy, audience: "operational" },
      { href: "/dashboard/rubrics", label: "Rubrics", labelKey: "nav.rubrics", icon: ListChecks, audience: "operational" },
      { href: "/dashboard/proctoring", label: "Proctoring", labelKey: "nav.proctoring", icon: ShieldCheck, audience: "operational" },
      { href: "/dashboard/results", label: "Results Management & Candidate Links", labelKey: "nav.resultsManagement", icon: Award, audience: "operational" },
      { href: "/dashboard/reports", label: "Results & Reports", labelKey: "nav.resultsReports", icon: BarChart3, audience: "operational" },
      { href: "/dashboard/myp-results", label: "MYP Results", labelKey: "nav.mypResults", icon: GraduationCap, audience: "operational" },
      { href: "/supervision", label: "Institutional Supervision", labelKey: "nav.supervision", icon: Eye, audience: "operational" },
    ],
  },
  {
    title: "Organization", titleKey: "nav.organization",
    items: [
      { href: "/dashboard/platform", label: "My Platform", labelKey: "nav.myPlatform", icon: Link2, audience: "managers" },
      { href: "/dashboard/billing", label: "Billing & Plan", labelKey: "nav.billingPlan", icon: CreditCard, audience: "managers" },
    ],
  },
];

/**
 * Plan/module entitlement for each workspace destination (Plan & Module
 * Management). The sidebar hides modules the organization's entitlement does
 * not include; server pages and actions enforce the same map independently.
 */
// Derived from MODULE_CATALOG surfaces (src/lib/navModules.ts) — the console
// and this sidebar can no longer disagree about which href is which module.

const navLink =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition";
const navIdle = "text-ink-soft hover:bg-evergreen-50 hover:text-evergreen-900";

/**
 * Rendered inside a <Link>. `useLinkStatus` flips to pending as soon as the
 * navigation starts, which gives the click immediate feedback while the server
 * sends the destination shell. It is intentionally tiny: the real skeleton is
 * the route-level loading.tsx boundary.
 */
function NavPendingIndicator() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
    />
  );
}

export function DashboardChrome({
  orgName,
  orgSlug,
  orgLogoUrl,
  isDemo,
  orgRole,
  canSwitchWorkspace,
  userName,
  modules,
  children,
}: {
  orgName: string;
  orgSlug?: string;
  orgLogoUrl?: string | null;
  isDemo?: boolean;
  orgRole?: string;
  canSwitchWorkspace?: boolean;
  userName: string;
  /** Effective plan modules; missing = all-true (pre-module fallback). */
  modules?: Record<string, boolean>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Highlight the destination immediately on click instead of waiting for the
  // server round-trip to change `pathname`. Cleared when the route settles (or
  // after a short safety timeout if the navigation is cancelled).
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null);
  useEffect(() => {
    setOptimisticHref(null);
  }, [pathname]);
  useEffect(() => {
    if (!optimisticHref) return;
    const timer = setTimeout(() => setOptimisticHref(null), 5_000);
    return () => clearTimeout(timer);
  }, [optimisticHref]);
  const activePath = optimisticHref ?? pathname;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  // Navigation is filtered by the verified organization role. Pages and server
  // actions enforce the same rules independently.
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    // One shared rule (role audience + module entitlement + parent modules) —
    // the same rule src/lib/navModules.ts tests execute.
    items: section.items.filter((item) => isNavVisible(item, modules, orgRole)),
  })).filter((section) => section.items.length > 0);

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Organization workspace">
      {sections.map((section) => (
        <div key={section.title ?? "top"} className="flex flex-col gap-1">
          {section.title && (
            <p className="mt-4 px-3 text-[11px] font-bold uppercase tracking-wider text-evergreen-700/80">
              {section.titleKey ? t(section.titleKey) : section.title}
            </p>
          )}
          {section.items.map((n) => {
            const active = n.exact ? activePath === n.href : activePath.startsWith(n.href);
            return (
              <Link
                key={n.href + n.label}
                href={n.href}
                prefetch
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  setOptimisticHref(n.href);
                  setOpen(false);
                }}
                className={cn(navLink, active ? "bg-evergreen-700 text-white shadow-sm" : navIdle)}
              >
                <n.icon className="h-5 w-5 shrink-0" />
                {n.labelKey ? t(n.labelKey) : n.label}
                <NavPendingIndicator />
              </Link>
            );
          })}
        </div>
      ))}

      {canSwitchWorkspace && <Link href="/workspaces" className={cn(navLink, "mt-3", navIdle)}><School className="h-5 w-5 shrink-0" /> {t("nav.switchWorkspace")}</Link>}
      <Link href="/" className={cn(navLink, "mt-3", navIdle)}>
        <BookOpenCheck className="h-5 w-5 shrink-0" />
        {t("nav.publicWebsite")}
      </Link>
    </nav>
  );

  return (
    <div className="dashboard-chrome min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <a href="#workspace-main" className="skip-link">{t("common.skipToContent")}</a>
      {/* Sidebar — desktop */}
      <aside className="dashboard-sidebar sticky top-0 hidden h-screen flex-col border-r border-evergreen-900/15 bg-paper p-5 lg:flex" aria-label="Organization workspace navigation">
        <div className="dashboard-brand"><Logo variant="light" href="/dashboard" /></div>
        <div className="dashboard-org-card mt-6 rounded-xl border border-evergreen-900/10 bg-cream p-3">
          <div className="flex items-center gap-2">
            {orgLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={orgLogoUrl} alt="" className="h-8 w-auto max-w-[7rem] shrink-0 rounded-md bg-white object-contain p-0.5 ring-1 ring-evergreen-900/10" />
            ) : null}
            <p className="truncate text-sm font-semibold text-evergreen-950">{orgName}</p>
          </div>
          <p className="text-xs text-ink-soft">{workspaceLabel(orgRole)}</p>
          {orgSlug && <p className="mt-0.5 truncate text-[11px] text-evergreen-700">{tenantPortalLabel(orgSlug)}</p>}
          {isDemo && <p className="mt-1 inline-block rounded-full bg-gold-500 px-2 py-0.5 text-[10px] font-bold text-evergreen-950">DEMO — SAMPLE DATA</p>}
        </div>
        <div className="dashboard-notification mt-4">
          <NotificationBell />
        </div>
        <div className="mt-2 flex-1 overflow-y-auto scroll-slim">{nav}</div>
        <div className="mt-4 border-t border-evergreen-900/10 pt-4">
          <p className="truncate px-1 text-sm font-medium text-ink">{userName}</p>
          <button onClick={signOut} className={cn(navLink, "mt-2 w-full", navIdle)}>
            <LogOut className="h-5 w-5" /> {t("nav.signOut")}
          </button>
          <div className="mt-3 px-1">
            <LanguageSwitcher />
          </div>
          <PlatformCredit className="mt-3 px-1 pb-1" />
        </div>
      </aside>

      <div className="min-w-0">
        {/* Topbar — mobile */}
        <header className="dashboard-mobile-header sticky top-0 z-40 flex h-[64px] items-center justify-between border-b border-evergreen-900/15 bg-paper/95 px-4 backdrop-blur lg:hidden">
          <Logo variant="light" href="/dashboard" />
          <div className="flex items-center gap-1">
            <LanguageSwitcher compact />
            <NotificationBell variant="icon" />
            <button onClick={() => setOpen((v) => !v)} className="rounded-lg p-2 text-evergreen-900" aria-label="Toggle menu" aria-expanded={open} aria-controls="workspace-mobile-navigation">
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </header>
        <div id="workspace-mobile-navigation" className={cn("dashboard-mobile-navigation border-b border-evergreen-900/15 bg-paper p-4 lg:hidden", !open && "hidden")}>
          <p className="mb-2 px-3 text-xs text-ink-soft">{orgName} · <span className="capitalize">{orgRole}</span></p>
          {nav}
          <button onClick={signOut} className={cn(navLink, "mt-3 w-full", navIdle)}>
            <LogOut className="h-5 w-5" /> {t("nav.signOut")}
          </button>
          <div className="mt-3 px-3">
            <LanguageSwitcher />
          </div>
          <PlatformCredit className="mt-4 px-3 pb-1" />
        </div>
        <main id="workspace-main" className="workspace-content mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-6 lg:px-9 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
