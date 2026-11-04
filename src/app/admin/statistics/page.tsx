import { Badge, Card, PageTitle, StatCard } from "@/components/ui";
import { ExportButton } from "@/components/ExportTools";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { money, toCsv } from "@/lib/utils";
import { Activity, Building2, CreditCard, FileCheck2, GraduationCap, Library, Trophy, Users } from "lucide-react";
import type { Metadata } from "next";
import { Section, Table } from "../ui";

export const metadata: Metadata = { title: "Platform statistics" };
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function countBy(rows: Row[] | null | undefined, key: string) {
  const out = new Map<string, number>();
  for (const row of rows ?? []) {
    const value = row[key] == null || row[key] === "" ? "—" : String(row[key]);
    out.set(value, (out.get(value) ?? 0) + 1);
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function Breakdown({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  return (
    <Card className="p-5">
      <h3 className="font-display text-base font-semibold text-evergreen-950">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.length === 0 && <p className="text-sm text-ink-soft">No records yet.</p>}
        {rows.map(([label, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="capitalize text-ink">{label.replace(/_/g, " ")}</span>
                <span className="tabular-nums text-ink-soft">{count} · {pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-evergreen-900/10">
                <div className="h-full rounded-full bg-evergreen-600" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default async function PlatformStatisticsPage() {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const head = { count: "exact" as const, head: true };
  const count = async (table: string, apply?: (q: ReturnType<typeof admin.from>) => unknown) => {
    let q = admin.from(table).select("id", head);
    if (apply) q = apply(q as never) as typeof q;
    const { count } = await q;
    return count ?? 0;
  };

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [
    users, orgs, students, questions, quizzes, competitions, exams,
    orgRows, memberRows, studentRows, questionRows, quizRows,
    competitionRows, examRows, attemptRows, subscriptionRows, paymentRows, auditRows,
  ] = await Promise.all([
    count("profiles"), count("organizations"), count("students"), count("questions"),
    count("quizzes"), count("competitions"), count("exams"),
    admin.from("organizations").select("type, status").limit(10000).then((r) => (r.data ?? []) as Row[]),
    admin.from("organization_members").select("role, status").limit(20000).then((r) => (r.data ?? []) as Row[]),
    admin.from("students").select("status, organization_id").limit(20000).then((r) => (r.data ?? []) as Row[]),
    admin.from("questions").select("type, status, difficulty").limit(20000).then((r) => (r.data ?? []) as Row[]),
    admin.from("quizzes").select("status").limit(10000).then((r) => (r.data ?? []) as Row[]),
    admin.from("competitions").select("status, format, results_published").limit(10000).then((r) => (r.data ?? []) as Row[]),
    admin.from("exams").select("status").limit(10000).then((r) => (r.data ?? []) as Row[]),
    admin.from("exam_attempts").select("status").limit(20000).then((r) => (r.data ?? []) as Row[]),
    admin.from("subscriptions").select("status, source, billing_period").limit(10000).then((r) => (r.data ?? []) as Row[]),
    admin.from("payment_requests").select("status, source, amount_cents, currency").limit(20000).then((r) => (r.data ?? []) as Row[]),
    admin.from("audit_logs").select("action, created_at").gte("created_at", since30).limit(20000).then((r) => (r.data ?? []) as Row[]),
  ]);

  const verifiedByCurrency = new Map<string, number>();
  for (const p of paymentRows) {
    if (p.status === "approved") {
      const currency = String(p.currency ?? "USD");
      verifiedByCurrency.set(currency, (verifiedByCurrency.get(currency) ?? 0) + Number(p.amount_cents ?? 0));
    }
  }

  const auditByDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    auditByDay.set(d, 0);
  }
  for (const row of auditRows) {
    const d = String(row.created_at ?? "").slice(0, 10);
    if (auditByDay.has(d)) auditByDay.set(d, (auditByDay.get(d) ?? 0) + 1);
  }
  const auditDays = [...auditByDay.entries()];
  const maxAudit = Math.max(1, ...auditDays.map(([, v]) => v));

  const exportRows: (string | number)[][] = [["Metric", "Breakdown", "Count"]];
  const push = (metric: string, rows: [string, number][]) => rows.forEach(([label, value]) => exportRows.push([metric, label, value]));
  push("Organizations by type", countBy(orgRows, "type"));
  push("Organization members by role", countBy(memberRows, "role"));
  push("Students by status", countBy(studentRows, "status"));
  push("Questions by type", countBy(questionRows, "type"));
  push("Competitions by status", countBy(competitionRows, "status"));
  push("Exam attempts by status", countBy(attemptRows, "status"));
  push("Subscriptions by source", countBy(subscriptionRows, "source"));
  push("Payments by status", countBy(paymentRows, "status"));

  return (
    <>
      <PageTitle
        title="Platform statistics"
        subtitle="Live operational breakdowns across institutions, learning content, assessments and verified commerce."
        action={<ExportButton filename="evalora-platform-statistics.csv" csv={toCsv(exportRows)} label="Export statistics" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Platform users" value={users} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Organizations / schools" value={orgs} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Students" value={students} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Questions" value={questions} icon={<Library className="h-5 w-5" />} />
        <StatCard label="Quizzes" value={quizzes} icon={<Activity className="h-5 w-5" />} />
        <StatCard label="Competitions" value={competitions} icon={<Trophy className="h-5 w-5" />} />
        <StatCard label="Examinations" value={exams} icon={<FileCheck2 className="h-5 w-5" />} />
        <StatCard label="Payment records" value={paymentRows.length} icon={<CreditCard className="h-5 w-5" />} />
      </div>

      <Section title="Institutions and people">
        <div className="grid gap-4 lg:grid-cols-3">
          <Breakdown title="Organizations by type" rows={countBy(orgRows, "type")} total={orgRows.length} />
          <Breakdown title="Organization members by role" rows={countBy(memberRows, "role")} total={memberRows.length} />
          <Breakdown title="Students by status" rows={countBy(studentRows, "status")} total={studentRows.length} />
        </div>
      </Section>

      <Section title="Learning and assessment">
        <div className="grid gap-4 lg:grid-cols-3">
          <Breakdown title="Questions by type" rows={countBy(questionRows, "type")} total={questionRows.length} />
          <Breakdown title="Questions by difficulty" rows={countBy(questionRows, "difficulty")} total={questionRows.length} />
          <Breakdown title="Quizzes by status" rows={countBy(quizRows, "status")} total={quizRows.length} />
          <Breakdown title="Competitions by status" rows={countBy(competitionRows, "status")} total={competitionRows.length} />
          <Breakdown title="Examinations by status" rows={countBy(examRows, "status")} total={examRows.length} />
          <Breakdown title="Exam attempts by status" rows={countBy(attemptRows, "status")} total={attemptRows.length} />
        </div>
      </Section>

      <Section title="Commerce integrity" hint="Only approved payments are shown as verified revenue. Administrative grants remain separate from paid subscriptions.">
        <div className="grid gap-4 lg:grid-cols-3">
          <Breakdown title="Payments by status" rows={countBy(paymentRows, "status")} total={paymentRows.length} />
          <Breakdown title="Subscriptions by status" rows={countBy(subscriptionRows, "status")} total={subscriptionRows.length} />
          <Breakdown title="Subscriptions by source" rows={countBy(subscriptionRows, "source")} total={subscriptionRows.length} />
        </div>
        <div className="mt-4">
          <Table head={["Currency", "Verified approved revenue"]}>
            {[...verifiedByCurrency.entries()].length === 0 ? (
              <tr><td colSpan={2} className="text-center text-ink-soft">No approved payments yet.</td></tr>
            ) : [...verifiedByCurrency.entries()].map(([currency, cents]) => (
              <tr key={currency}><td><Badge tone="gold">{currency}</Badge></td><td className="font-semibold tabular-nums">{money(cents, currency)}</td></tr>
            ))}
          </Table>
        </div>
      </Section>

      <Section title="Administrative activity — last 30 days">
        <Card className="p-5">
          <div className="flex h-36 items-end gap-1" aria-label="Audit events per day for the last 30 days">
            {auditDays.map(([day, value]) => (
              <div key={day} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${day}: ${value} audit events`}>
                <span className="text-[10px] tabular-nums text-ink-soft">{value || ""}</span>
                <div className="w-full rounded-t bg-evergreen-600" style={{ height: `${Math.max(3, (value / maxAudit) * 104)}px` }} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-soft">Daily audit-log volume. Open Activity Monitoring for the underlying immutable operational records.</p>
        </Card>
      </Section>
    </>
  );
}
