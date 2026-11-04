import { Badge, Card, PageTitle, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, money } from "@/lib/utils";
import {
  Building2,
  CreditCard,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  Library,
  LifeBuoy,
  PenSquare,
  Radio,
  Repeat,
  ShieldAlert,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { enterOrgWorkspace } from "./actions/orgs";

export const metadata: Metadata = { title: "Super Admin" };
export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const head = { count: "exact" as const, head: true };

  const [
    users, activeUsers, orgs, students, classes, competitions, quizzes, questions, exams,
    liveSessions, pendingPayments, activeSubs, trialSubs, openIncidents, openTickets,
    approvedSums, recentAudit, platformOrg,
  ] = await Promise.all([
    admin.from("profiles").select("id", head),
    admin.from("profiles").select("id", head).eq("status", "active"),
    admin.from("organizations").select("id", head),
    admin.from("students").select("id", head).eq("status", "active"),
    admin.from("classes").select("id", head),
    admin.from("competitions").select("id", head),
    admin.from("quizzes").select("id", head),
    admin.from("questions").select("id", head),
    admin.from("exams").select("id", head),
    admin.from("quiz_sessions").select("id", head).eq("status", "live"),
    admin.from("payment_requests").select("id", head).eq("status", "pending"),
    admin.from("subscriptions").select("id", head).eq("status", "active"),
    admin.from("subscriptions").select("id", head).eq("status", "trialing"),
    admin.from("proctoring_incidents").select("id", head).eq("status", "open"),
    admin.from("support_tickets").select("id", head).eq("status", "open"),
    admin.from("payment_requests").select("amount_cents, currency").eq("status", "approved").limit(2000),
    admin.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(8),
    admin.from("organizations").select("id, name").eq("slug", "evalora-platform").maybeSingle(),
  ]);

  const revenue = new Map<string, number>();
  for (const r of approvedSums.data ?? []) revenue.set(r.currency, (revenue.get(r.currency) ?? 0) + r.amount_cents);
  const revenueLabel = [...revenue.entries()].map(([c, v]) => money(v, c)).join(" · ") || money(0, "USD");

  const attention = [
    { n: pendingPayments.count ?? 0, label: "payment(s) awaiting verification", href: "/admin/payments", icon: CreditCard },
    { n: openIncidents.count ?? 0, label: "proctoring incident(s) to review", href: "/admin/proctoring", icon: ShieldAlert },
    { n: openTickets.count ?? 0, label: "open support ticket(s)", href: "/admin/support", icon: LifeBuoy },
  ].filter((a) => a.n > 0);

  const quickActions = [
    { href: "/admin/organizations/new", label: "Create organization / school", icon: Building2 },
    { href: "/admin/students/new", label: "Register a student", icon: GraduationCap },
    { href: "/admin/competitions/new", label: "Create a competition", icon: Trophy },
    { href: "/admin/payments/new", label: "Record a payment", icon: CreditCard },
    { href: "/admin/subscriptions#assign", label: "Assign Premium access", icon: Repeat },
    { href: "/admin/users/new", label: "Create user / invite admin", icon: UserPlus },
  ];

  return (
    <>
      <PageTitle
        title="Platform overview"
        subtitle={`You run EVALORA${ctx.profile.is_primary ? " as its Primary Super Admin" : ""} — create and operate organizations, competitions, examinations and commerce from here. Every action is audit-logged.`}
      />

      {attention.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {attention.map((a) => (
            <Link key={a.href} href={a.href} className="block">
              <Card className="flex items-center gap-3 border-l-4 border-l-gold-500 p-4 transition hover:shadow-md">
                <a.icon className="h-6 w-6 shrink-0 text-gold-700" />
                <p className="text-sm font-medium text-ink">
                  {a.n} {a.label} <span className="font-semibold text-evergreen-700">→</span>
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card className="mb-6 p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Run the platform</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="flex items-center gap-3 rounded-xl border border-evergreen-900/15 bg-cream px-4 py-3.5 text-sm font-semibold text-evergreen-900 transition hover:border-evergreen-600/50 hover:bg-evergreen-50"
            >
              <a.icon className="h-5 w-5 text-evergreen-700" /> {a.label}
            </Link>
          ))}
          {platformOrg.data && (
            <form action={enterOrgWorkspace}>
              <input type="hidden" name="organization_id" value={platformOrg.data.id} />
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-xl border border-gold-600/50 bg-gold-50 px-4 py-3.5 text-left text-sm font-semibold text-evergreen-950 transition hover:bg-gold-100"
              >
                <LayoutDashboard className="h-5 w-5 text-gold-800" /> Open “{platformOrg.data.name}” workspace
              </button>
            </form>
          )}
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          As platform owner you are never asked to pay: your workspaces run with unlimited entitlements while you operate them.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value={users.count ?? 0} hint={`${activeUsers.count ?? 0} active`} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Organizations" value={orgs.count ?? 0} hint={`${classes.count ?? 0} classes`} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Active students" value={students.count ?? 0} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Competitions" value={competitions.count ?? 0} icon={<Trophy className="h-5 w-5" />} />
        <StatCard label="Verified revenue" value={revenueLabel} hint="Approved payments only" icon={<CreditCard className="h-5 w-5" />} />
        <StatCard label="Subscriptions" value={activeSubs.count ?? 0} hint={`${trialSubs.count ?? 0} trialing`} icon={<Repeat className="h-5 w-5" />} />
        <StatCard label="Quizzes" value={quizzes.count ?? 0} hint={`${questions.count ?? 0} questions banked`} icon={<PenSquare className="h-5 w-5" />} />
        <StatCard label="Examinations" value={exams.count ?? 0} icon={<FileCheck2 className="h-5 w-5" />} />
        <StatCard label="Live sessions now" value={liveSessions.count ?? 0} icon={<Radio className="h-5 w-5" />} />
        <StatCard label="Question bank" value={questions.count ?? 0} icon={<Library className="h-5 w-5" />} />
        <StatCard label="Open incidents" value={openIncidents.count ?? 0} icon={<ShieldAlert className="h-5 w-5" />} />
        <StatCard label="Open tickets" value={openTickets.count ?? 0} icon={<LifeBuoy className="h-5 w-5" />} />
      </div>

      <Card className="mt-6 p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Recent platform activity</h2>
          <Link href="/admin/audit" className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Full audit log</Link>
        </div>
        {(recentAudit.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No audited activity yet.</p>
        ) : (
          <ul className="divide-y divide-evergreen-900/10">
            {(recentAudit.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <Badge tone="gray">{a.action}</Badge>
                <span className="text-ink-soft">{a.entity}</span>
                <span className="ml-auto text-xs text-ink-soft">{fmtDateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
