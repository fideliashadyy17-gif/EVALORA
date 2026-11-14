import { Badge, ButtonLink, Card, StatCard } from "@/components/ui";
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
  ShieldCheck,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { enterOrgWorkspace } from "./actions/orgs";

export const metadata: Metadata = { title: "Super Admin" };
export const dynamic = "force-dynamic";

const ADMIN_OVERVIEW_QUERY_TIMEOUT_MS = 5_000;

async function safeQuery<T extends { error?: unknown }>(
  build: () => PromiseLike<T>,
  fallback: T,
  onDegraded: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const result = await Promise.race<T>([
      Promise.resolve(build()),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          onDegraded();
          resolve(fallback);
        }, ADMIN_OVERVIEW_QUERY_TIMEOUT_MS);
      }),
    ]);
    if (result?.error) {
      onDegraded();
      return fallback;
    }
    return result;
  } catch {
    onDegraded();
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default async function AdminOverview() {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const head = { count: "exact" as const, head: true };
  let degradedQueries = 0;
  const markDegraded = () => {
    degradedQueries += 1;
  };
  const safeCount = (build: () => PromiseLike<{ count: number | null; error?: unknown }>) =>
    safeQuery(build, { count: 0 }, markDegraded);

  // Batch queries into bounded waves (max 6 concurrent PostgREST requests) so
  // opening /admin never spikes 20+ simultaneous database connections while
  // isolating any slow analytics/commerce query from core exam operations.
  const [exams, liveSessions, orgs, classes, students, platformOrg] = await Promise.all([
    safeCount(() => admin.from("exams").select("id", head)),
    safeCount(() => admin.from("quiz_sessions").select("id", head).eq("status", "live")),
    safeCount(() => admin.from("organizations").select("id", head)),
    safeCount(() => admin.from("classes").select("id", head)),
    safeCount(() => admin.from("students").select("id", head).eq("status", "active")),
    safeQuery<{ data: { id: string; name: string } | null; error?: unknown }>(
      () => admin.from("organizations").select("id, name").eq("slug", "evalora-platform").maybeSingle(),
      { data: null },
      markDegraded,
    ),
  ]);

  const [users, activeUsers, competitions, quizzes, questions, openIncidents] = await Promise.all([
    safeCount(() => admin.from("profiles").select("id", head)),
    safeCount(() => admin.from("profiles").select("id", head).eq("status", "active")),
    safeCount(() => admin.from("competitions").select("id", head)),
    safeCount(() => admin.from("quizzes").select("id", head)),
    safeCount(() => admin.from("questions").select("id", head)),
    safeCount(() => admin.from("proctoring_incidents").select("id", head).eq("status", "open")),
  ]);

  const [pendingPayments, activeSubs, trialSubs, openTickets, approvedSums, recentAudit] = await Promise.all([
    safeCount(() => admin.from("payment_requests").select("id", head).eq("status", "pending")),
    safeCount(() => admin.from("subscriptions").select("id", head).eq("status", "active")),
    safeCount(() => admin.from("subscriptions").select("id", head).eq("status", "trialing")),
    safeCount(() => admin.from("support_tickets").select("id", head).eq("status", "open")),
    safeQuery<{ data: { amount_cents: number; currency: string }[] | null; error?: unknown }>(
      () => admin.from("payment_requests").select("amount_cents, currency").eq("status", "approved").limit(2000),
      { data: [] },
      markDegraded,
    ),
    safeQuery<{ data: { id: string; action: string; entity: string; created_at: string }[] | null; error?: unknown }>(
      () => admin.from("audit_logs").select("id, action, entity, created_at").order("created_at", { ascending: false }).limit(8),
      { data: [] },
      markDegraded,
    ),
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
      <section className="admin-overview-hero mb-6 grid items-center gap-8 rounded-[1.75rem] p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:p-10">
        <div className="max-w-3xl">
          <Badge tone="gold" className="mb-4">Global platform · Control plane</Badge>
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-evergreen-950 sm:text-4xl">Platform overview</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft sm:text-base">
            You run EVALORA{ctx.profile.is_primary ? " as its Primary Super Admin" : ""} — create and operate organizations, competitions, examinations and commerce from here. Every action is audit-logged.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/admin/organizations/new" variant="gold">Create organization</ButtonLink>
            <ButtonLink href="/admin/examinations" variant="outline">Manage examinations</ButtonLink>
          </div>
        </div>
        <div className="admin-overview-trust max-w-sm rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-gold-200"><ShieldCheck aria-hidden="true" className="h-5 w-5" /></span>
            <div>
              <p className="font-semibold text-white">Built for responsible operations</p>
              <p className="mt-0.5 text-xs text-evergreen-100">Tenant-aware access · Audit trail</p>
            </div>
          </div>
          <p className="mt-4 border-t border-white/15 pt-3 text-xs leading-relaxed text-evergreen-100">Manage each organization from one shared platform while keeping its workspace and data boundaries intact.</p>
        </div>
      </section>

      {degradedQueries > 0 && (
        <div role="status" className="mb-5 rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Some secondary platform metrics are temporarily delayed while database load recovers. Examination management and live supervision remain fully operational.
        </div>
      )}

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
