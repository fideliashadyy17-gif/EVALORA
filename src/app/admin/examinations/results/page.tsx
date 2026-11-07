import { Badge, Button, PageTitle, Select, StatCard } from "@/components/ui";
import { ExportButton, PrintButton } from "@/components/ExportTools";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import { Award, CheckCircle2, Eye, FileCheck2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { enterOrgWorkspace } from "../../actions/orgs";
import { Notice, Section, StatusBadge, Table } from "../../ui";
import { setExamResultsPublishedAsAdmin } from "../actions";

export const metadata: Metadata = { title: "Examination results" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  results_published: "Results published. Candidates can now see their score and authorized worked solutions.",
  results_unpublished: "Results unpublished and hidden from candidates.",
  exam: "That examination no longer exists.",
  failed: "Result publication could not be changed.",
  automatic_mode: "Automatic mode publishes each fully graded attempt itself; manual publication is disabled.",
  awaiting_marking: "At least one submitted attempt still has a written response awaiting grading.",
};
const round = (n: number) => Math.round(n * 10) / 10;

interface ExamRow {
  id: string;
  title: string;
  status: string;
  organization_id: string;
  settings: Record<string, unknown> | null;
  result_publication_mode?: "manual" | "automatic";
  organizations: { name: string } | null;
}

interface AttemptRow {
  id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number | null;
  extension_minutes: number;
  exam_candidates: { full_name: string; candidate_ref: string | null; email: string | null } | null;
}

export default async function ExaminationResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; outcome?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: rawExams } = await admin
    .from("exams")
    .select("id, title, status, organization_id, settings, result_publication_mode, organizations(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  const exams = (rawExams ?? []) as unknown as ExamRow[];
  const selected = (sp.exam && exams.find((e) => e.id === sp.exam)) || exams[0];
  const settings = selected?.settings ?? {};
  const passMark = Number(settings.pass_mark_percent ?? 50);
  const published = Boolean(settings.results_published);

  let attempts: AttemptRow[] = [];
  let candidateTotal = 0;
  if (selected) {
    const [{ data: rawAttempts }, { count }] = await Promise.all([
      admin
        .from("exam_attempts")
        .select("id, status, started_at, submitted_at, score, max_score, extension_minutes, exam_candidates(full_name, candidate_ref, email)")
        .eq("exam_id", selected.id)
        .order("score", { ascending: false, nullsFirst: false })
        .limit(1000),
      admin.from("exam_candidates").select("id", { count: "exact", head: true }).eq("exam_id", selected.id),
    ]);
    attempts = (rawAttempts ?? []) as unknown as AttemptRow[];
    candidateTotal = count ?? 0;
  }

  const scored = attempts.filter((a) => a.status !== "in_progress" && a.score != null && a.max_score);
  const percentages = scored.map((a) => (Number(a.score) / Math.max(1, Number(a.max_score))) * 100);
  const passes = percentages.filter((p) => p >= passMark).length;
  const filtered = attempts.filter((a) => {
    const pct = a.score != null && a.max_score ? (Number(a.score) / Number(a.max_score)) * 100 : null;
    if (sp.outcome === "pass") return pct !== null && pct >= passMark;
    if (sp.outcome === "fail") return pct !== null && pct < passMark;
    if (sp.outcome === "pending") return pct === null;
    return true;
  });

  const csv = selected
    ? toCsv([
        ["Candidate", "Reference", "Email", "Status", "Score", "Maximum", "Percent", "Outcome", "Extension minutes", "Started", "Submitted"],
        ...filtered.map((a) => {
          const pct = a.score != null && a.max_score ? round((Number(a.score) / Number(a.max_score)) * 100) : "";
          return [
            a.exam_candidates?.full_name ?? "", a.exam_candidates?.candidate_ref ?? "", a.exam_candidates?.email ?? "",
            a.status, a.score ?? "", a.max_score ?? "", pct, typeof pct === "number" ? (pct >= passMark ? "PASS" : "FAIL") : "PENDING",
            a.extension_minutes, a.started_at, a.submitted_at ?? "",
          ];
        }),
      ])
    : "";

  const back = selected ? `/admin/examinations/results?exam=${selected.id}` : "/admin/examinations/results";

  return (
    <>
      <PageTitle
        title="Examination results"
        subtitle="Validate marks and control candidate result publication. Until published, scores and worked solutions remain hidden from the candidate result API."
        action={selected ? <div className="flex flex-wrap gap-2"><ExportButton filename={`exam-results-${selected.id}.csv`} csv={csv} label="Export results (CSV / Excel)" /><PrintButton /></div> : undefined}
      />

      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      {!selected ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No examinations exist yet.</p>
      ) : (
        <>
          <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
            <label className="block min-w-[320px] flex-1">
              <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Examination</span>
              <Select name="exam" defaultValue={selected.id}>
                {exams.map((e) => <option key={e.id} value={e.id}>{e.title} — {e.organizations?.name ?? "Organization"} ({e.status})</option>)}
              </Select>
            </label>
            <Select name="outcome" defaultValue={sp.outcome ?? ""} className="w-44" aria-label="Outcome">
              <option value="">All outcomes</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="pending">Pending / in progress</option>
            </Select>
            <Button type="submit" variant="outline">View results</Button>
          </form>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Registered candidates" value={candidateTotal} icon={<FileCheck2 className="h-5 w-5" />} />
            <StatCard label="Submitted attempts" value={attempts.filter((a) => a.status !== "in_progress").length} icon={<CheckCircle2 className="h-5 w-5" />} />
            <StatCard label="Average score" value={percentages.length ? `${round(percentages.reduce((a, b) => a + b, 0) / percentages.length)}%` : "—"} icon={<Award className="h-5 w-5" />} />
            <StatCard label="Pass rate" value={scored.length ? `${round((passes / scored.length) * 100)}%` : "—"} hint={`${passes}/${scored.length} at ${passMark}%`} icon={<CheckCircle2 className="h-5 w-5" />} />
            <StatCard label="Candidate visibility" value={published ? "Published" : "Hidden"} icon={<Eye className="h-5 w-5" />} />
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-evergreen-900/15 bg-paper p-4">
            <Badge tone={published ? "green" : "amber"}>{published ? "Results visible to candidates" : "Results under review"}</Badge>
            {selected.result_publication_mode === "automatic" ? (
              <span className="rounded-lg bg-evergreen-50 px-3 py-2 text-sm text-evergreen-900">Automatic — each fully graded attempt is published immediately.</span>
            ) : (
              <form action={setExamResultsPublishedAsAdmin}>
                <input type="hidden" name="exam_id" value={selected.id} />
                <input type="hidden" name="published" value={published ? "0" : "1"} />
                <input type="hidden" name="back" value={back} />
                <Button type="submit" variant={published ? "outline" : "gold"}>{published ? "Unpublish results" : "Validate and publish results"}</Button>
              </form>
            )}
            <Link href={`/admin/examinations/marking?exam=${selected.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Marking queue</Link>
            <form action={enterOrgWorkspace}>
              <input type="hidden" name="organization_id" value={selected.organization_id} />
              <input type="hidden" name="next" value={`/dashboard/reports/exam/${selected.id}`} />
              <button className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Detailed workspace report →</button>
            </form>
          </div>

          <Section title={`Candidate results — ${selected.title}`}>
            {filtered.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">No attempts match this outcome.</p>
            ) : (
              <Table head={["Rank", "Candidate", "Attempt", "Score", "%", "Outcome", "Extension", "Submitted"]}>
                {filtered.map((a, i) => {
                  const pct = a.score != null && a.max_score ? (Number(a.score) / Number(a.max_score)) * 100 : null;
                  return (
                    <tr key={a.id}>
                      <td className="font-display font-bold">{pct === null ? "—" : i + 1}</td>
                      <td><span className="font-medium">{a.exam_candidates?.full_name ?? "Candidate"}</span><span className="block text-xs text-ink-soft">{a.exam_candidates?.candidate_ref || a.exam_candidates?.email || ""}</span></td>
                      <td><StatusBadge status={a.status} /></td>
                      <td className="tabular-nums">{a.score != null ? `${Number(a.score)} / ${Number(a.max_score ?? 0)}` : "—"}</td>
                      <td className="tabular-nums">{pct === null ? "—" : `${round(pct)}%`}</td>
                      <td>{pct === null ? <Badge tone="gray">Pending</Badge> : <Badge tone={pct >= passMark ? "green" : "red"}>{pct >= passMark ? "PASS" : "FAIL"}</Badge>}</td>
                      <td>{Number(a.extension_minutes) > 0 ? `+${a.extension_minutes} min` : "—"}</td>
                      <td className="text-ink-soft">{a.submitted_at ? fmtDateTime(a.submitted_at) : `Started ${fmtDateTime(a.started_at)}`}</td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Section>
        </>
      )}
    </>
  );
}
