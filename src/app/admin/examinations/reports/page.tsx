import { Button, Card, PageTitle, Select, StatCard } from "@/components/ui";
import { ExportButton, PrintButton } from "@/components/ExportTools";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import { BarChart3, CheckCircle2, ClipboardList, FileCheck2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Section, StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Examination reports" };
export const dynamic = "force-dynamic";

const round = (n: number) => Math.round(n * 10) / 10;

interface ExamRow {
  id: string;
  title: string;
  status: string;
  organization_id: string;
  quiz_id: string | null;
  duration_minutes: number;
  starts_at: string | null;
  ends_at: string | null;
  settings: Record<string, unknown> | null;
  organizations: { name: string } | null;
  quizzes: { title: string } | null;
  exam_candidates: { count: number }[];
}

interface AttemptRow {
  exam_id: string;
  status: string;
  score: number | null;
  max_score: number | null;
  extension_minutes: number;
}

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  const total = rows.reduce((sum, [, v]) => sum + v, 0);
  return (
    <Card className="p-5">
      <h3 className="font-display font-semibold text-evergreen-950">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.length === 0 && <p className="text-sm text-ink-soft">No data yet.</p>}
        {rows.map(([label, value]) => {
          const pct = total ? Math.round((value / total) * 100) : 0;
          return (
            <div key={label}>
              <div className="mb-1 flex justify-between gap-3 text-sm"><span className="capitalize">{label.replace(/_/g, " ")}</span><span className="tabular-nums text-ink-soft">{value} · {pct}%</span></div>
              <div className="h-2 rounded-full bg-evergreen-900/10"><div className="h-full rounded-full bg-evergreen-600" style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default async function ExaminationReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; status?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let examQuery = admin
    .from("exams")
    .select("id, title, status, organization_id, quiz_id, duration_minutes, starts_at, ends_at, settings, organizations(name), quizzes(title), exam_candidates(count)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (sp.org) examQuery = examQuery.eq("organization_id", sp.org);
  if (sp.status) examQuery = examQuery.eq("status", sp.status);

  const [{ data: rawExams }, { data: orgs }] = await Promise.all([
    examQuery,
    admin.from("organizations").select("id, name").order("name").limit(500),
  ]);
  const exams = (rawExams ?? []) as unknown as ExamRow[];
  const examIds = exams.map((e) => e.id);
  const quizIds = [...new Set(exams.map((e) => e.quiz_id).filter((v): v is string => Boolean(v)))];

  const [{ data: rawAttempts }, { data: incidents }, { data: pendingAnswers }, { data: quizQuestions }] = await Promise.all([
    examIds.length
      ? admin.from("exam_attempts").select("exam_id, status, score, max_score, extension_minutes").in("exam_id", examIds).limit(20000)
      : Promise.resolve({ data: [] }),
    examIds.length
      ? admin.from("proctoring_incidents").select("exam_id, status, severity").in("exam_id", examIds).limit(10000)
      : Promise.resolve({ data: [] }),
    examIds.length
      ? admin.from("exam_answers").select("exam_attempts!inner(exam_id, status), questions!inner(type)").in("exam_attempts.exam_id", examIds).is("is_correct", null).limit(20000)
      : Promise.resolve({ data: [] }),
    quizIds.length
      ? admin.from("quiz_questions").select("quiz_id").in("quiz_id", quizIds).limit(20000)
      : Promise.resolve({ data: [] }),
  ]);

  const attempts = (rawAttempts ?? []) as AttemptRow[];
  const attemptsByExam = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    const list = attemptsByExam.get(a.exam_id) ?? [];
    list.push(a);
    attemptsByExam.set(a.exam_id, list);
  }
  const incidentsByExam = new Map<string, number>();
  for (const i of incidents ?? []) incidentsByExam.set(i.exam_id, (incidentsByExam.get(i.exam_id) ?? 0) + 1);
  const pendingByExam = new Map<string, number>();
  for (const row of pendingAnswers ?? []) {
    const attempt = row.exam_attempts as unknown as { exam_id: string; status: string } | null;
    const question = row.questions as unknown as { type: string } | null;
    if (attempt && attempt.status !== "in_progress" && question?.type === "open_ended") {
      pendingByExam.set(attempt.exam_id, (pendingByExam.get(attempt.exam_id) ?? 0) + 1);
    }
  }
  const questionsByQuiz = new Map<string, number>();
  for (const q of quizQuestions ?? []) questionsByQuiz.set(q.quiz_id, (questionsByQuiz.get(q.quiz_id) ?? 0) + 1);

  const rows = exams.map((e) => {
    const list = attemptsByExam.get(e.id) ?? [];
    const submitted = list.filter((a) => a.status !== "in_progress");
    const scored = submitted.filter((a) => a.score != null && a.max_score);
    const pcts = scored.map((a) => (Number(a.score) / Math.max(1, Number(a.max_score))) * 100);
    const passMark = Number(e.settings?.pass_mark_percent ?? 50);
    const candidates = e.exam_candidates[0]?.count ?? 0;
    return {
      e,
      candidates,
      attempts: list.length,
      submitted: submitted.length,
      inProgress: list.filter((a) => a.status === "in_progress").length,
      average: pcts.length ? round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
      passRate: pcts.length ? round((pcts.filter((p) => p >= passMark).length / pcts.length) * 100) : null,
      completion: candidates ? round((submitted.length / candidates) * 100) : null,
      extensions: list.filter((a) => Number(a.extension_minutes) > 0).length,
      autoSubmitted: list.filter((a) => a.status === "auto_submitted").length,
      incidents: incidentsByExam.get(e.id) ?? 0,
      pending: pendingByExam.get(e.id) ?? 0,
      questions: e.quiz_id ? questionsByQuiz.get(e.quiz_id) ?? 0 : 0,
      published: Boolean(e.settings?.results_published),
      passMark,
    };
  });

  const countBy = (values: string[]) => {
    const m = new Map<string, number>();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]) as [string, number][];
  };

  const csv = toCsv([
    ["Examination", "Organization", "Paper", "Questions", "Status", "Candidates", "Attempts", "Submitted", "Completion %", "Average %", "Pass mark %", "Pass rate %", "Auto-submitted", "Extensions", "Pending marking", "Incidents", "Results published", "Window"],
    ...rows.map((r) => [
      r.e.title, r.e.organizations?.name ?? "", r.e.quizzes?.title ?? "", r.questions, r.e.status, r.candidates, r.attempts, r.submitted,
      r.completion ?? "", r.average ?? "", r.passMark, r.passRate ?? "", r.autoSubmitted, r.extensions, r.pending, r.incidents,
      r.published ? "yes" : "no", `${r.e.starts_at ? fmtDateTime(r.e.starts_at) : ""} -> ${r.e.ends_at ? fmtDateTime(r.e.ends_at) : ""}`,
    ]),
  ]);

  const submittedAttempts = attempts.filter((a) => a.status !== "in_progress");
  const totalPending = rows.reduce((sum, r) => sum + r.pending, 0);

  return (
    <>
      <PageTitle
        title="Examination reports & exports"
        subtitle="Portfolio-level completion, performance, integrity, marking backlog and publication reporting. Export is Excel-compatible CSV; Print creates a PDF-ready report."
        action={<div className="flex flex-wrap gap-2"><ExportButton filename="examination-report.csv" csv={csv} label="Export report (CSV / Excel)" /><PrintButton /></div>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Examinations" value={exams.length} icon={<FileCheck2 className="h-5 w-5" />} />
        <StatCard label="Attempts" value={attempts.length} icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Submitted" value={submittedAttempts.length} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Answers awaiting marking" value={totalPending} icon={<ClipboardList className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2">
        <Select name="org" defaultValue={sp.org ?? ""} className="min-w-[240px]" aria-label="Organization">
          <option value="">All organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Examination status">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </Select>
        <Button type="submit" variant="outline">Filter report</Button>
      </form>

      <Section title="Portfolio breakdown">
        <div className="grid gap-4 lg:grid-cols-3">
          <Breakdown title="Examinations by status" rows={countBy(exams.map((e) => e.status))} />
          <Breakdown title="Attempts by status" rows={countBy(attempts.map((a) => a.status))} />
          <Breakdown title="Incidents by severity" rows={countBy((incidents ?? []).map((i) => i.severity))} />
        </div>
      </Section>

      <Section title="Examination performance register">
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">No examinations match.</p>
        ) : (
          <Table head={["Examination", "Paper", "Participation", "Performance", "Integrity / workflow", "Publication", "Open"]}>
            {rows.map((r) => (
              <tr key={r.e.id}>
                <td><span className="font-semibold text-evergreen-950">{r.e.title}</span><span className="block text-xs text-ink-soft">{r.e.organizations?.name} · {r.e.duration_minutes} min</span></td>
                <td>{r.e.quizzes?.title ?? "No paper"}<span className="block text-xs text-ink-soft">{r.questions} questions</span></td>
                <td className="tabular-nums">{r.submitted}/{r.candidates} submitted<span className="block text-xs text-ink-soft">{r.inProgress} in progress · {r.completion ?? "—"}% completion</span></td>
                <td className="tabular-nums">Avg {r.average ?? "—"}%<span className="block text-xs text-ink-soft">Pass {r.passRate ?? "—"}% at {r.passMark}%</span></td>
                <td className="text-xs text-ink-soft">{r.autoSubmitted} auto-submitted · {r.extensions} extensions<span className="block">{r.pending} pending marks · {r.incidents} incidents</span></td>
                <td><StatusBadge status={r.e.status} /><span className="block text-xs text-ink-soft">{r.published ? "Results published" : "Results hidden"}</span></td>
                <td>
                  <div className="flex flex-col gap-1">
                    <Link href={`/admin/examinations/results?exam=${r.e.id}`} className="font-medium text-evergreen-700 hover:underline">Results</Link>
                    <Link href={`/admin/examinations/marking?exam=${r.e.id}`} className="text-sm text-evergreen-700 hover:underline">Marking</Link>
                    <Link href={`/admin/examinations/monitoring?exam=${r.e.id}`} className="text-sm text-evergreen-700 hover:underline">Monitoring</Link>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
