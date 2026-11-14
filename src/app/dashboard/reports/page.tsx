import { CollectionToolbar, type CollectionParams } from "@/components/dashboard/CollectionToolbar";
import { Badge, ButtonLink, Card, EmptyState, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { pageNumber } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<CollectionParams & { kind?: string }> }) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  const supabase = await createClient();
  const sessionsView = sp.kind === "sessions";
  const page = pageNumber(sp.page);
  const pageSize = 20;
  const statuses = sessionsView ? ["lobby", "live", "paused", "ended"] : ["draft", "scheduled", "open", "paused", "closed"];
  const title = sp.q?.trim().slice(0, 160).replace(/[%_\\]/g, " ");
  let examQuery = supabase.from("exams")
    .select("id, title, status, created_at, submitted:exam_attempts(count), active:exam_attempts(count)", { count: "exact" })
    .eq("organization_id", org.id).neq("submitted.status", "in_progress").eq("active.status", "in_progress");
  let sessionQuery = supabase.from("quiz_sessions")
    .select("id, title, status, created_at, quizzes(title), session_participants(count)", { count: "exact" })
    .eq("organization_id", org.id);
  if (title) { examQuery = examQuery.ilike("title", `%${title}%`); sessionQuery = sessionQuery.ilike("title", `%${title}%`); }
  if (sp.status && statuses.includes(sp.status)) {
    examQuery = examQuery.eq("status", sp.status); sessionQuery = sessionQuery.eq("status", sp.status);
  }
  const sort = sp.sort === "title" ? "title" : "created_at";
  const ascending = sp.sort === "title" || sp.sort === "oldest";
  // Only the visible report family is queried. Each report keeps its existing
  // authorized detail/export route; this index never accesses answer content.
  const exams = sessionsView ? null : await examQuery.order(sort, { ascending }).order("id").range((page - 1) * pageSize, page * pageSize - 1);
  const sessions = sessionsView ? await sessionQuery.order(sort, { ascending }).order("id").range((page - 1) * pageSize, page * pageSize - 1) : null;
  const error = exams?.error ?? sessions?.error;
  const count = exams?.count ?? sessions?.count ?? 0;
  return (
    <>
      <PageTitle title="Results & reports" subtitle="Review examination outcomes and live-session performance. Open a report for detailed analysis, CSV export and print-ready results." />
      <div className="mb-5 flex flex-wrap gap-2" aria-label="Report type">
        <ButtonLink href="/dashboard/reports" variant={sessionsView ? "outline" : "primary"}>Examination reports</ButtonLink>
        <ButtonLink href="/dashboard/reports?kind=sessions" variant={sessionsView ? "primary" : "outline"}>Live-session reports</ButtonLink>
      </div>
      <CollectionToolbar path="/dashboard/reports" params={{ q: sp.q, status: sp.status, sort: sp.sort }} extraParams={sessionsView ? { kind: "sessions" } : {}} statuses={statuses} page={page} pageSize={pageSize} total={count} noun="reports" failed={Boolean(error)} />
      {error ? null : count === 0 ? <EmptyState title="No reports match this view" body="Change the filters, or run an examination or live quiz to start collecting results." /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead><tr className="text-xs uppercase tracking-wide text-ink-soft"><th className="px-5 py-4">Assessment</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Participation</th><th className="px-5 py-4">Report</th></tr></thead>
            <tbody className="divide-y divide-evergreen-900/10">
              {(exams?.data ?? []).map(exam => <tr key={exam.id}>
                <td className="px-5 py-4"><p className="font-semibold text-evergreen-950">{exam.title}</p><p className="mt-1 text-xs text-ink-soft">Created {fmtDateTime(exam.created_at)}</p></td>
                <td className="px-5 py-4"><Badge tone={exam.status === "open" ? "green" : "gray"}>{exam.status}</Badge></td>
                <td className="px-5 py-4">{(exam.submitted as { count: number }[])?.[0]?.count ?? 0} submitted · {(exam.active as { count: number }[])?.[0]?.count ?? 0} in progress</td>
                <td className="px-5 py-4"><ButtonLink href={`/dashboard/reports/exam/${exam.id}`} variant="outline">Open report</ButtonLink></td>
              </tr>)}
              {(sessions?.data ?? []).map(session => <tr key={session.id}>
                <td className="px-5 py-4"><p className="font-semibold text-evergreen-950">{session.title || (session.quizzes as unknown as { title: string } | null)?.title || "Live session"}</p><p className="mt-1 text-xs text-ink-soft">Created {fmtDateTime(session.created_at)}</p></td>
                <td className="px-5 py-4"><Badge tone={session.status === "ended" ? "gray" : "green"}>{session.status}</Badge></td>
                <td className="px-5 py-4">{(session.session_participants as { count: number }[])?.[0]?.count ?? 0} participants</td>
                <td className="px-5 py-4"><ButtonLink href={`/dashboard/reports/session/${session.id}`} variant="outline">Open report</ButtonLink></td>
              </tr>)}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
