"use client";

import { Logo } from "@/components/Logo";
import { PlatformCredit } from "@/components/PlatformCredit";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";
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
  Lightbulb,
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
  SlidersHorizontal,
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
import { enterOrgWorkspace } from "./actions/orgs";

interface NavItem {
  href: string;
  label: string;
  labelKey?: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  badgeKey?: string;
}
interface NavGroup {
  title: string;
  titleKey?: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: "A. Overview", titleKey: "admin.secA",
    items: [
      { href: "/admin", label: "Global Dashboard", labelKey: "admin.globalDashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/statistics", label: "Platform Statistics", labelKey: "admin.platformStatistics", icon: TrendingUp },
      { href: "/admin/audit", label: "Activity Monitoring", labelKey: "admin.activityMonitoring", icon: Activity },
      { href: "/admin/activity", label: "Recent Operations", labelKey: "admin.recentOperations", icon: ScrollText },
    ],
  },
  {
    title: "B. Organizations & Schools", titleKey: "admin.secB",
    items: [
      { href: "/admin/organizations", label: "All Organizations", labelKey: "admin.allOrganizations", icon: Building2 },
      { href: "/admin/organizations/access", label: "Organization Platform Access", labelKey: "admin.orgPlatformAccess", icon: Link2 },
      { href: "/admin/classes", label: "Class Management", labelKey: "admin.classManagement", icon: GraduationCap },
      { href: "/admin/organizations/new", label: "Create Organization", labelKey: "admin.createOrganization", icon: Plus },
      { href: "/admin/organizations/admins", label: "Organization Administrators", labelKey: "admin.orgAdministrators", icon: UserCog },
      { href: "/admin/subscriptions", label: "Organization Subscriptions", labelKey: "admin.orgSubscriptions", icon: Repeat },
      { href: "/admin/organizations/settings", label: "Organization Settings", icon: Settings },
      { href: "/admin/demo", label: "DEMO School & Migration", labelKey: "admin.demoSchoolMigration", icon: Sparkles },
    ],
  },
  {
    title: "C. Students & Users", titleKey: "admin.secC",
    items: [
      { href: "/admin/students", label: "All Students", labelKey: "admin.allStudents", icon: GraduationCap },
      { href: "/admin/users/teachers", label: "Teachers", labelKey: "admin.teachers", icon: Users },
      { href: "/admin/users/school-admins", label: "School Administrators", labelKey: "admin.schoolAdministrators", icon: UserCog },
      { href: "/admin/users", label: "Platform Users", labelKey: "admin.platformUsers", icon: Users },
      { href: "/admin/rbac", label: "RBAC & User Role Management", labelKey: "admin.rbacManagement", icon: ShieldCheck },
      { href: "/admin/users/roles", label: "Roles & Permissions", labelKey: "admin.rolesPermissions", icon: KeyRound },
      { href: "/admin/students/new", label: "Individual Student Registration", labelKey: "admin.individualStudentRegistration", icon: Plus },
      { href: "/admin/students/bulk", label: "Bulk Student Registration", labelKey: "admin.bulkStudentRegistration", icon: Upload },
      { href: "/admin/students/bulk?mode=import-export", label: "Student Import & Export", labelKey: "admin.studentImportExport", icon: Upload },
      { href: "/admin/students/access", label: "Student Access Management", labelKey: "admin.studentAccessManagement", icon: KeyRound },
    ],
  },
  {
    title: "D. Live Competition", titleKey: "admin.secD",
    items: [
      { href: "/admin/competitions", label: "All Competitions", labelKey: "admin.allCompetitions", icon: Trophy },
      { href: "/admin/competitions/new", label: "Create Competition", labelKey: "admin.createCompetition", icon: Plus },
      { href: "/admin/competitions/configuration", label: "Competition Configuration", labelKey: "admin.competitionConfiguration", icon: Settings },
      { href: "/admin/competitions/participants", label: "Participants", labelKey: "admin.participants", icon: Users },
      { href: "/admin/competitions/register", label: "Participant Registration", labelKey: "admin.participantRegistration", icon: UserCog },
      { href: "/admin/competitions/codes", label: "Access Codes", labelKey: "admin.accessCodes", icon: KeyRound },
      { href: "/admin/competitions/questions", label: "Competition Questions", labelKey: "admin.competitionQuestions", icon: Library },
      { href: "/admin/competitions/events", label: "Event Phases & Monitor", labelKey: "admin.eventPhasesMonitor", icon: Layers },
      { href: "/admin/competitions/pools", label: "Question Pools", labelKey: "admin.questionPools", icon: Tags },
      { href: "/admin/competitions/qualifications", label: "Qualification Review", labelKey: "admin.qualificationReview", icon: ClipboardCheck },
      { href: "/admin/competitions/live", label: "Live Monitoring", labelKey: "admin.liveMonitoring", icon: Activity },
      { href: "/admin/competitions/results", label: "Rankings & Results", labelKey: "admin.rankingsResults", icon: Trophy },
      { href: "/admin/competitions/reports", label: "Competition Reports", labelKey: "admin.competitionReports", icon: TrendingUp },
    ],
  },
  {
    title: "E. Quiz & Questions", titleKey: "admin.secE",
    items: [
      { href: "/admin/quizzes", label: "Quiz Dashboard / Manage Quizzes", labelKey: "admin.manageQuizzes", icon: PenSquare },
      { href: "/admin/quizzes/new", label: "Create Quiz", labelKey: "admin.createQuiz", icon: Plus },
      { href: "/dashboard/paper-builder", label: "Question Paper Builder", labelKey: "admin.paperBuilder", icon: FileCheck2 },
      { href: "/admin/questions", label: "Question Bank", labelKey: "admin.questionBank", icon: Library },
      { href: "/admin/questions/new", label: "Create Question", labelKey: "admin.createQuestion", icon: Plus },
      { href: "/admin/questions/categories", label: "Question Categories", labelKey: "admin.questionCategories", icon: Tags },
      { href: "/admin/questions/types", label: "Question Types", labelKey: "admin.questionTypes", icon: ClipboardList },
      { href: "/admin/questions/solutions", label: "Answers & Solutions", labelKey: "admin.answersSolutions", icon: FileCheck2 },
      { href: "/admin/quizzes/assignments", label: "Quiz Assignments", labelKey: "admin.quizAssignments", icon: Users },
      { href: "/admin/quizzes/results", label: "Quiz Results", labelKey: "admin.quizResults", icon: TrendingUp },
    ],
  },
  {
    title: "F. Examinations", titleKey: "admin.secF",
    items: [
      { href: "/admin/examinations", label: "Examination Dashboard / Manage", labelKey: "admin.manageExams", icon: FileCheck2 },
      { href: "/admin/examinations/new", label: "Create Examination", labelKey: "admin.createExam", icon: Plus },
      { href: "/admin/examinations/questions", label: "Examination Questions", labelKey: "admin.examQuestions", icon: Library },
      { href: "/admin/examinations/candidates", label: "Examination Candidates", labelKey: "admin.examCandidates", icon: Users },
      { href: "/admin/examinations/register", label: "Candidate Registration", labelKey: "admin.candidateRegistration", icon: UserCog },
      { href: "/admin/examinations/codes", label: "Candidate Access Codes", labelKey: "admin.candidateAccessCodes", icon: KeyRound },
      { href: "/admin/examinations/invitations", label: "Share Links & Access Codes", labelKey: "admin.shareLinksCodes", icon: Link2 },
      { href: "/admin/examinations/links", label: "Exam Link Expiration", labelKey: "admin.examLinkExpiration", icon: CalendarClock },
      { href: "/admin/examinations/retakes", label: "Retake Requests", labelKey: "admin.retakeRequests", icon: ClipboardCheck },
      { href: "/admin/examinations/hints", label: "Examination Hints", labelKey: "admin.examHints", icon: Lightbulb },
      { href: "/admin/examinations/schedule", label: "Schedule", labelKey: "admin.schedule", icon: CalendarClock },
      { href: "/admin/examinations/time-limits", label: "Duration & Time Limits", labelKey: "admin.durationLimits", icon: Clock3 },
      { href: "/admin/examinations/monitoring", label: "Monitoring & live supervision", labelKey: "admin.supervision", icon: Activity },
      { href: "/admin/examinations/marking", label: "Marking & Grading", labelKey: "admin.markingGrading", icon: ClipboardList },
      { href: "/admin/examinations/score-adjustments", label: "Score Adjustment (Institution)", labelKey: "admin.scoreAdjustments", icon: SlidersHorizontal },
      { href: "/admin/examinations/results", label: "Results Management & Candidate Links", labelKey: "admin.resultsManagement", icon: Link2 },
      { href: "/admin/myp-results", label: "MYP Results & Reports", labelKey: "admin.mypResults", icon: GraduationCap },
      { href: "/admin/examinations/reports", label: "Reports & Exports", labelKey: "admin.reportsExports", icon: ScrollText },
      { href: "/admin/proctoring", label: "Proctoring Oversight", labelKey: "admin.proctoring", icon: Video, badgeKey: "incidents" },
    ],
  },
  {
    title: "G. Payments & Subscriptions", titleKey: "admin.secG",
    items: [
      { href: "/admin/payments", label: "Payments", labelKey: "admin.payments", icon: CreditCard, badgeKey: "payments" },
      { href: "/admin/payments/new", label: "Manual Payment Management", labelKey: "admin.manualPayments", icon: Plus },
      { href: "/admin/subscriptions", label: "Subscriptions", labelKey: "admin.subscriptions", icon: Repeat },
      { href: "/admin/plans", label: "Subscription Plans", labelKey: "admin.subscriptionPlans", icon: Tags },
      { href: "/admin/plans/modules", label: "Plan & Module Management", labelKey: "nav.planModules", icon: Blocks },
      { href: "/admin/subscriptions#assign", label: "Subscription Overrides", labelKey: "admin.subscriptionOverrides", icon: Settings },
      { href: "/admin/revenue", label: "Billing History & Revenue", labelKey: "admin.billingRevenue", icon: TrendingUp },
    ],
  },
  {
    title: "H. Platform Administration", titleKey: "admin.secH",
    items: [
      { href: "/admin/users?role=super_admin", label: "Super Admin Users", labelKey: "admin.superAdminUsers", icon: ShieldCheck },
      { href: "/admin/users/roles", label: "Roles & Permissions", labelKey: "admin.rolesPermissions", icon: ShieldCheck },
      { href: "/admin/settings", label: "Platform Settings", labelKey: "admin.platformSettingsNav", icon: Settings },
      { href: "/admin/modules", label: "Modules & Features", labelKey: "admin.modulesFeatures", icon: Blocks },
      { href: "/admin/audit", label: "Audit Logs", labelKey: "admin.auditLogs", icon: ScrollText },
      { href: "/admin/system", label: "System Health", labelKey: "admin.systemHealth", icon: Activity },
      { href: "/admin/notifications", label: "Notifications", labelKey: "admin.notificationsNav", icon: Bell, badgeKey: "unread" },
      { href: "/admin/support", label: "Support Tickets", labelKey: "admin.supportTickets", icon: LifeBuoy, badgeKey: "tickets" },
    ],
  },
  {
    title: "I. Operational Workspace", titleKey: "admin.secI",
    items: [
      { href: "/admin/operations", label: "Full Customer Workspace Access", labelKey: "admin.fullWorkspace", icon: LayoutDashboard },
      { href: "/admin/examinations/results", label: "Results Management & Candidate Links", labelKey: "admin.resultsManagement", icon: Link2 },
      { href: "/admin/classes", label: "Class Management (direct)", labelKey: "admin.classManagementDirect", icon: GraduationCap },
      { href: "/admin/examinations/invitations", label: "Exam Links & Codes", labelKey: "admin.examLinksCodes", icon: Link2 },
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
  children,
}: {
  email: string;
  isPrimary: boolean;
  counts: ShellCounts;
  platformOrgId: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [moduleQuery, setModuleQuery] = useState("");
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
        title={iconOnly ? (n.labelKey ? t(n.labelKey) : n.label) : undefined}
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
        {!iconOnly && <span className="truncate">{n.labelKey ? t(n.labelKey) : n.label}</span>}
        {!iconOnly && badge > 0 && (
          <span className="ml-auto rounded-full bg-gold-500 px-2 py-0.5 text-xs font-bold text-evergreen-950">{badge}</span>
        )}
      </Link>
    );
  };

  const renderNav = (iconOnly: boolean) => {
    const term = moduleQuery.trim().toLowerCase();
    const groups = GROUPS.map((g) => ({
      ...g,
      items: term
        ? g.items.filter((item) =>
            `${item.label} ${item.labelKey ? t(item.labelKey) : ""} ${g.title} ${g.titleKey ? t(g.titleKey) : ""} ${item.href}`
              .toLowerCase()
              .includes(term),
          )
        : g.items,
    })).filter((g) => g.items.length > 0);

    return (
      <nav className="flex flex-col gap-4" aria-label={t("nav.mainNavigation")}>
        {groups.length === 0 ? (
          <p className="rounded-lg px-3 py-3 text-sm text-ink-soft" role="status">{t("admin.noModulesMatch", { query: moduleQuery })}</p>
        ) : groups.map((g) => {
          const open = Boolean(term) || iconOnly || openGroups[g.title] !== false;
          return (
            <div key={g.title}>
              {!iconOnly && (
                <button
                  type="button"
                  onClick={() => setOpenGroups((current) => ({ ...current, [g.title]: !open }))}
                  aria-expanded={open}
                  className="mb-1.5 flex w-full items-center justify-between rounded-md px-3 py-1 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft hover:bg-evergreen-50 hover:text-evergreen-900"
                >
                  <span>{g.titleKey ? t(g.titleKey) : g.title}</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
                </button>
              )}
              {open && <div className="flex flex-col gap-1">{g.items.map((n) => navLink(n, iconOnly, g.title))}</div>}
            </div>
          );
        })}
      </nav>
    );
  };

  return (
    <div className={cn("admin-console min-h-screen lg:grid", collapsed ? "lg:grid-cols-[84px_1fr]" : "lg:grid-cols-[292px_1fr]")}>
      <a href="#main-content" className="skip-link">{t("admin.skipToAdmin")}</a>
      {/* ─── Sidebar (desktop) ─── */}
      <aside className="admin-sidebar sticky top-0 hidden h-screen flex-col border-r border-evergreen-900/15 bg-paper p-4 lg:flex" aria-label={t("nav.mainNavigation")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && <div className="admin-brand"><Logo href="/admin" /></div>}
          <button
            onClick={toggleCollapsed}
            className="rounded-lg p-2 text-evergreen-900 hover:bg-evergreen-50"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        </div>
        {!collapsed && (
          <>
            <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-gold-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-evergreen-950">
              <ShieldCheck className="h-3.5 w-3.5" /> {isPrimary ? "Primary Super Admin" : "Super Admin"}
            </p>
            <label className="mt-4 block">
              <span className="sr-only">{t("admin.findModule")}</span>
              <input
                type="search"
                value={moduleQuery}
                onChange={(event) => setModuleQuery(event.target.value)}
                placeholder={t("admin.findModule")}
                className="w-full rounded-lg border border-evergreen-900/25 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-evergreen-700 focus:outline-none focus:ring-2 focus:ring-evergreen-600/25"
              />
            </label>
          </>
        )}
        <div className="mt-3 flex-1 overflow-y-auto scroll-slim pr-1">{renderNav(collapsed)}</div>
        <div className="mt-4 border-t border-evergreen-900/10 pt-4">
          {!collapsed && <p className="truncate px-1 text-xs text-ink-soft">{email}</p>}
          <Link
            href="/dashboard"
            title={collapsed ? t("admin.myWorkspace") : undefined}
            className={cn(
              "mt-2 flex items-center gap-3 rounded-lg border border-evergreen-900/25 px-3 py-2.5 text-sm font-medium text-evergreen-900 hover:bg-evergreen-50",
              collapsed && "justify-center px-2",
            )}
          >
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            {!collapsed && t("admin.myWorkspace")}
          </Link>
          {!collapsed && (
            <div className="mt-3">
              <LanguageSwitcher />
            </div>
          )}
          {!collapsed && <PlatformCredit className="mt-3 px-1 pb-1" />}
        </div>
      </aside>

      <div className="min-w-0">
        {/* ─── Top navigation ─── */}
        <header className="admin-header sticky top-0 z-40 border-b border-evergreen-900/15 bg-paper/95 backdrop-blur">
          <div className="flex h-[64px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-lg p-2 text-evergreen-900 lg:hidden"
              aria-label={t("nav.mainNavigation")}
              aria-expanded={mobileOpen}
              aria-controls="admin-mobile-navigation"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <span className="lg:hidden">
              <Logo href="/admin" />
            </span>
            <div className="hidden min-w-[170px] lg:block">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-evergreen-700">{t("admin.controlPlane")}</p>
              <p className="text-xs font-medium text-ink-soft">{t("admin.globalOperations")}</p>
            </div>

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
                placeholder={t("admin.globalSearchPlaceholder")}
                className="w-full rounded-full border border-evergreen-900/20 bg-cream py-2 pl-9 pr-4 text-sm text-ink outline-none placeholder:text-ink-soft focus:border-evergreen-600 focus:bg-white"
                aria-label={t("admin.globalSearchPlaceholder")}
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
                <Plus className="h-4 w-4" /> <span className="hidden md:inline">{t("admin.quickCreate")}</span>
                <ChevronDown className="h-4 w-4" />
              </button>
              {quick.open && (
                <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-evergreen-900/15 bg-white p-2 shadow-xl" role="menu">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{t("admin.platformGroup")}</p>
                  {[
                    { href: "/admin/organizations/new", label: "Create organization", labelKey: "admin.qk_organization", icon: Building2 },
                    { href: "/admin/students/new", label: "Register a student", labelKey: "admin.qk_student", icon: GraduationCap },
                    { href: "/admin/competitions/new", label: "Create competition", labelKey: "admin.qk_competition", icon: Trophy },
                    { href: "/admin/questions/new", label: "Create mathematical question", labelKey: "admin.qk_math", icon: Library },
                    { href: "/admin/quizzes/new", label: "Create quiz", labelKey: "admin.qk_quiz", icon: PenSquare },
                    { href: "/admin/examinations/new", label: "Create examination", labelKey: "admin.qk_exam", icon: FileCheck2 },
                    { href: "/admin/examinations/register", label: "Register exam candidates", labelKey: "admin.qk_candidates", icon: Users },
                    { href: "/admin/payments/new", label: "Add a payment", labelKey: "admin.qk_payment", icon: CreditCard },
                    { href: "/admin/subscriptions#assign", label: "Assign a subscription", labelKey: "admin.qk_subscription", icon: Repeat },
                    { href: "/admin/users/new", label: "Create user / invite admin", labelKey: "admin.qk_user", icon: UserCog },
                  ].map((a) => (
                    <Link
                      key={a.href}
                      href={a.href}
                      onClick={() => quick.setOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink hover:bg-evergreen-50"
                    >
                      <a.icon className="h-4 w-4 text-evergreen-700" /> {a.labelKey ? t(a.labelKey) : a.label}
                    </Link>
                  ))}
                  {platformOrgId && (
                    <>
                      <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                        {t("admin.inPlatformWorkspace")}
                      </p>
                      {workspaceForm("/dashboard/quizzes/new", t("admin.qkLiveQuiz"), PenSquare)}
                      {workspaceForm("/dashboard/questions/new", t("admin.qkWorkspaceQuestions"), Library)}
                      {workspaceForm("/dashboard/exams/new", t("admin.qkExamWorkspace"), FileCheck2)}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Notifications: a floating panel, not a page navigation. The
                platform alerts (payments, tickets, incidents) still count in
                the badge; "See all platform alerts" opens the full console. */}
            <div className="rounded-full p-0.5 text-evergreen-900">
              <NotificationBell
                variant="icon"
                extraCount={counts.payments + counts.tickets + counts.incidents}
                allHref="/admin/notifications"
                allLabel={t("admin.seeAllAlerts")}
              />
            </div>

            {/* Interface language — desktop & mobile share this header */}
            <div className="hidden sm:block">
              <LanguageSwitcher compact />
            </div>

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
                    <p className="text-xs font-medium text-gold-800">{isPrimary ? t("admin.primarySuperAdmin") : t("admin.superAdmin")}</p>
                  </div>
                  <Link href="/dashboard/settings" onClick={() => profile.setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink hover:bg-evergreen-50">
                    <UserCog className="h-4 w-4 text-evergreen-700" /> {t("admin.accountSettings")}
                  </Link>
                  <Link href="/admin/settings" onClick={() => profile.setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink hover:bg-evergreen-50">
                    <Settings className="h-4 w-4 text-evergreen-700" /> {t("admin.platformSettings")}
                  </Link>
                  <Link href="/admin/audit" onClick={() => profile.setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink hover:bg-evergreen-50">
                    <ScrollText className="h-4 w-4 text-evergreen-700" /> {t("admin.securityAudit")}
                  </Link>
                  <div className="border-b border-evergreen-900/10 px-3 py-2">
                    <LanguageSwitcher />
                  </div>
                  <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-red-50 hover:text-red-800">
                    <LogOut className="h-4 w-4 text-evergreen-700" /> {t("nav.signOut")}
                  </button>
                </div>
              )}
            </div>
          </div>

        </header>

        {/* Mobile nav */}
        <div id="admin-mobile-navigation" className={cn("max-h-[70vh] overflow-y-auto border-b border-evergreen-900/15 bg-paper p-4 lg:hidden", !mobileOpen && "hidden")}>
          <label className="mb-4 block">
            <span className="sr-only">{t("admin.findModule")}</span>
            <input
              type="search"
              value={moduleQuery}
              onChange={(event) => setModuleQuery(event.target.value)}
              placeholder={t("admin.findModule")}
              className="w-full rounded-lg border border-evergreen-900/25 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-evergreen-700 focus:outline-none focus:ring-2 focus:ring-evergreen-600/25"
            />
          </label>
          {renderNav(false)}
        </div>

        <main id="main-content" className="admin-content mx-auto w-full max-w-[1600px] px-4 py-7 sm:px-6 lg:px-9 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
