import { Badge, Card, PageTitle, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, money } from "@/lib/utils";
import { Building2, CreditCard, FileCheck2, Library, PenSquare, Radio, ShieldAlert, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Super Admin" };
export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();

  const head = (t: string, filter?: (q: ReturnType<typeof admin.from>) => unknown) => {
    let q = admin.from(t).select("id", { count: "exact", head: true });
    if (filter) q = filter(q as never) as typeof q;
    return q;
  };

  const [
    users, activeUsers, orgs, quizzes, questions, exams, participants,
    liveSessions, pendingPayments, activeSubs, trialSubs, openIncidents,
    openTickets, approvedSums, recentAudit,
  ] = await Promise.all([
    head("profiles"),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
    head("organizations"),
    head("quizzes"),
    head("questions"),
    head("exams"),
    head("session_participants"),
    admin.from("quiz_sessions").select("id", { count: "exact", head: true }).eq("status", "live"),
    admin.from("payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "trialing"),
    admin.from("proctoring_incidents").select("id", { count: "exact", head: true }).eq("status", "open"),
    admin.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
    admin.from("payment_requests").select("amount_cents, currency").eq("status", "approved").limit(1000),
    admin.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(8),
  ]);

  const revenue = new Map<string, number>();
  for (const r of approvedSums.data ?? []) revenue.set(r.currency, (revenue.get(r.currency) ?? 0) + r.amount_cents);
  const revenueLabel = [...revenue.entries()].map(([c, v]) => money(v, c)).join(" · ") || money(0, "USD");

  return (
    <>
      <PageTitle
        title="Platform overview"
        subtitle={`Complete operational control of EVALORA${ctx.profile.is_primary ? " — you are signed in as the Primary Super Admin" : ""}. Tenant isolation remains enforced for all member-facing access; this console is the operator override, and every action is audit-logged.`}
      />

      {(pendingPayments.count ?? 0) > 0 && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-gold-500 p-5">
          <p className="font-medium">💳 {pendingPayments.count} payment request(s) awaiting your review.</p>
          <Link href="/admin/payments" className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-evergreen-950">Review payments</Link>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value={users.count ?? 0} hint={`${activeUsers.count ?? 0} active`} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Organizations" value={orgs.count ?? 0} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Recognized revenue" value={revenueLabel} hint="Approved payments only" icon={<CreditCard className="h-5 w-5" />} />
        <StatCard label="Pending payments" value={pendingPayments.count ?? 0} hint={`${activeSubs.count ?? 0} paid · ${trialSubs.count ?? 0} trialing`} icon={<CreditCard className="h-5 w-5" />} />
        <StatCard label="Quizzes & competitions" value={quizzes.count ?? 0} icon={<PenSquare className="h-5 w-5" />} />
        <StatCard label="Questions in banks" value={questions.count ?? 0} icon={<Library className="h-5 w-5" />} />
        <StatCard label="Examinations" value={exams.count ?? 0} icon={<FileCheck2 className="h-5 w-5" />} />
        <StatCard label="Live sessions now" value={liveSessions.count ?? 0} hint={`${participants.count ?? 0} total participations`} icon={<Radio className="h-5 w-5" />} />
        <StatCard label="Open proctoring incidents" value={openIncidents.count ?? 0} icon={<ShieldAlert className="h-5 w-5" />} />
        <StatCard label="Open support tickets" value={openTickets.count ?? 0} icon={<ShieldAlert className="h-5 w-5" />} />
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
