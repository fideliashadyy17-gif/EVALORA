import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Card, EmptyState, PageTitle, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { FileCheck2, Radio } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ sessionsPage?: string; examsPage?: string }> }) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  const supabase = await createClient();
  const pageSize = 12;
  const sessionsPage = Math.max(1, Number.parseInt(sp.sessionsPage ?? "1", 10) || 1);
  const examsPage = Math.max(1, Number.parseInt(sp.examsPage ?? "1", 10) || 1);

  const [sessionResult, examResult] = await Promise.all([
    supabase.from("quiz_sessions").select("*, quizzes(title), session_participants(id)", { count: "exact" }).eq("organization_id", org.id).order("created_at", { ascending: false }).range((sessionsPage - 1) * pageSize, sessionsPage * pageSize - 1),
    supabase.from("exams").select("*, exam_attempts(id, status)", { count: "exact" }).eq("organization_id", org.id).order("created_at", { ascending: false }).range((examsPage - 1) * pageSize, examsPage * pageSize - 1),
  ]);
  const sessions = sessionResult.data;
  const exams = examResult.data;

  return (
    <>
      <PageTitle
        eyebrow="Analytics & Evidence · Institutional Reports"
        title="Reports & Analytics"
        subtitle="Performance across live sessions and examinations. Every report exports to CSV (Excel-ready) and prints cleanly to PDF."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Live quiz sessions" value={sessionResult.count ?? 0} icon={<Radio className="h-5 w-5" />} />
        <StatCard label="Examinations" value={examResult.count ?? 0} icon={<FileCheck2 className="h-5 w-5" />} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-display text-lg font-semibold text-evergreen-950">Live quiz sessions</h2><span className="text-xs text-ink-soft">{sessionResult.count ?? 0} total</span></div>
          {(sessions ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No sessions yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-evergreen-900/10">
              {(sessions ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{s.title || (s.quizzes as { title: string } | null)?.title}</p>
                    <p className="text-xs text-ink-soft">{(s.session_participants as unknown[])?.length ?? 0} participants · {fmtDateTime(s.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={s.status === "ended" ? "gray" : "amber"}>{s.status}</Badge>
                    <Link href={`/dashboard/reports/session/${s.id}`} className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Report</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <PageNavigation page={sessionsPage} pageSize={pageSize} total={sessionResult.count ?? 0} pathname="/dashboard/reports" query={{ examsPage: String(examsPage) }} pageParam="sessionsPage" label="quiz sessions" />
        </Card>

        <Card className="min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-display text-lg font-semibold text-evergreen-950">Examinations</h2><span className="text-xs text-ink-soft">{examResult.count ?? 0} total</span></div>
          {(exams ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No examinations yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-evergreen-900/10">
              {(exams ?? []).map((e) => {
                const attempts = (e.exam_attempts as { status: string }[]) ?? [];
                return (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{e.title}</p>
                      <p className="text-xs text-ink-soft">{attempts.filter((a) => a.status !== "in_progress").length} submitted · {attempts.filter((a) => a.status === "in_progress").length} in progress</p>
                    </div>
                    <Link href={`/dashboard/reports/exam/${e.id}`} className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Report</Link>
                  </li>
                );
              })}
            </ul>
          )}
          <PageNavigation page={examsPage} pageSize={pageSize} total={examResult.count ?? 0} pathname="/dashboard/reports" query={{ sessionsPage: String(sessionsPage) }} pageParam="examsPage" label="examinations" />
        </Card>
      </div>
      {(sessions ?? []).length === 0 && (exams ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title="Nothing to report yet" body="Run a live quiz session or open an examination — analytics appear here automatically." />
        </div>
      )}
    </>
  );
}
