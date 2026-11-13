import { RichContent } from "@/components/RichContent";
import { Badge, Card, PageTitle, StatCard } from "@/components/ui";
import { ExportButton, PrintButton, ExportExcelButton, ExportWordButton } from "@/components/ExportTools";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { DocxReport } from "@/lib/docxExport";
import { MYP_CRITERIA, criterionOfConfig, formatCriterionStats, participantCriterionStats, type CriterionQuestion } from "@/lib/examResults";

export const metadata: Metadata = { title: "Examination report" };
export const dynamic = "force-dynamic";

export default async function ExamReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  const { data: exam } = await supabase.from("exams").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!exam) notFound();
  const settings = (exam.settings ?? {}) as Record<string, unknown>;
  const passMark = Number(settings.pass_mark_percent ?? 50);

  const { data: hintUsage } = await supabase.from("exam_hint_usage").select("attempt_id, question_id, part_id, level").eq("exam_id", id);
  const hintsByAttempt = new Map<string, number>();
  const hintsByQuestion = new Map<string, number>();
  for (const u of hintUsage ?? []) {
    hintsByAttempt.set(u.attempt_id, (hintsByAttempt.get(u.attempt_id) ?? 0) + 1);
    hintsByQuestion.set(u.question_id, (hintsByQuestion.get(u.question_id) ?? 0) + 1);
  }

  const [{ data: attempts }, { data: qq }, { count: candidateTotal }] = await Promise.all([
    supabase.from("exam_attempts").select("*, exam_candidates(full_name, candidate_ref), exam_answers(question_id, is_correct, points_awarded)").eq("exam_id", id).order("score", { ascending: false, nullsFirst: false }),
    supabase.from("quiz_questions").select("question_id, points, questions(prompt, prompt_doc, type, topic, difficulty, config, points), position").eq("quiz_id", exam.quiz_id).order("position"),
    supabase.from("exam_candidates").select("id", { count: "exact", head: true }).eq("exam_id", id),
  ]);

  const list = attempts ?? [];
  const submitted = list.filter((a) => a.status !== "in_progress" && a.score !== null);
  const pcts = submitted.map((a) => (Number(a.score) / Math.max(1, Number(a.max_score ?? 1))) * 100);
  const avgPct = pcts.length ? pcts.reduce((s, v) => s + v, 0) / pcts.length : 0;
  const passCount = pcts.filter((p) => p >= passMark).length;

  const qStats = (qq ?? []).map((r) => {
    const q = r.questions as unknown as { prompt: string; type: string; topic: string | null; difficulty: string; config: Record<string, unknown> | null };
    const crit = typeof q.config?.myp_criterion === "string" ? q.config.myp_criterion : null;
    const strand = typeof q.config?.strand === "string" ? q.config.strand : null;
    const answers = list.flatMap((a) =>
      ((a.exam_answers as { question_id: string; is_correct: boolean | null }[]) ?? []).filter((x) => x.question_id === r.question_id),
    );
    const graded = answers.filter((x) => x.is_correct !== null);
    const correct = answers.filter((x) => x.is_correct === true).length;
    return { ...q, crit, strand, question_id: r.question_id, answered: answers.length, pct: graded.length ? Math.round((correct / graded.length) * 100) : null };
  });

  // --- MYP Criterion Aggregation ---
  // The paper: each question's criterion (questions.config.myp_criterion) and the
  // marks it carries in this examination (the paper's override, else the question's).
  const paper: CriterionQuestion[] = ((qq ?? []) as unknown as {
    question_id: string;
    points: number | null;
    questions: { config: Record<string, unknown> | null; points: number | null } | null;
  }[]).map((r) => ({
    question_id: r.question_id,
    criterion: criterionOfConfig(r.questions?.config),
    points: r.points ?? r.questions?.points ?? 0,
  }));
  // One breakdown per attempt (per candidate), keyed by attempt id.
  const criteriaByAttempt = participantCriterionStats(
    list.map((a) => a.id),
    list.flatMap((a) =>
      ((a.exam_answers as { question_id: string; is_correct: boolean | null; points_awarded: number | null }[]) ?? []).map((ans) => ({
        participant_id: a.id,
        question_id: ans.question_id,
        is_correct: ans.is_correct,
        points_awarded: ans.points_awarded,
      })),
    ),
    paper,
  );
  const criterionHead = MYP_CRITERIA.map((c) => `Criterion ${c}`);
  const criterionCells = (attemptId: string) => MYP_CRITERIA.map((c) => formatCriterionStats(criteriaByAttempt.get(attemptId)?.[c]));

  const questionHead = ["Question", "Type", "Topic", "Difficulty", "Answered", "% Correct", "Criterion"];
  const questionRows = qStats.map((q, i) => [`Q${i + 1}`, q.type, q.topic ?? "", q.difficulty, q.answered, q.pct ?? "n/a", q.crit ? `Criterion ${q.crit}${q.strand ? ` ${q.strand}` : ""}` : ""]);
  const candidateHead = ["Candidate", "Reference", "Status", "Score", "Max", "%", "Result", "Hints used", "Submitted", ...criterionHead];

  const csv = toCsv([
    candidateHead,
    ...list.map((a) => {
      const pct = a.score !== null && a.max_score ? Math.round((Number(a.score) / Number(a.max_score)) * 1000) / 10 : "";
      return [
        (a.exam_candidates as { full_name: string } | null)?.full_name ?? "",
        (a.exam_candidates as { candidate_ref: string | null } | null)?.candidate_ref ?? "",
        a.status,
        a.score !== null ? Number(a.score) : "",
        a.max_score !== null ? Number(a.max_score) : "",
        pct,
        typeof pct === "number" ? (pct >= passMark ? "PASS" : "FAIL") : "",
        hintsByAttempt.get(a.id) ?? 0,
        a.submitted_at ?? "",
        ...criterionCells(a.id),
      ];
    }),
    [],
    questionHead,
    ...questionRows,
  ]);

  // Rows shared by the Excel sheet and the Word document
  const candidateRows = list.map((a) => {
    const pct = a.score !== null && a.max_score ? (Number(a.score) / Number(a.max_score)) * 100 : null;
    return [
      (a.exam_candidates as { full_name: string } | null)?.full_name ?? "",
      (a.exam_candidates as { candidate_ref: string | null } | null)?.candidate_ref ?? "",
      a.status,
      a.score !== null ? Number(a.score) : "",
      a.max_score !== null ? Number(a.max_score) : "",
      pct !== null ? `${pct.toFixed(0)}%` : "",
      typeof pct === "number" ? (pct >= passMark ? "PASS" : "FAIL") : "",
      hintsByAttempt.get(a.id) ?? 0,
      a.submitted_at ?? "",
      ...criterionCells(a.id),
    ];
  });

  // Excel Data
  const excelData = [candidateHead, ...candidateRows, [], questionHead, ...questionRows];

  // Word document (built as data; every value is escaped by the .docx builder)
  const wordReport: DocxReport = {
    title: `Examination Report: ${exam.title}`,
    subtitle: `Pass mark: ${passMark}% · Results: ${settings.results_published ? "published" : "not yet published"}`,
    sections: [
      {
        heading: "Candidate Results",
        emptyNote: "No attempts yet.",
        table: {
          head: ["Candidate", "Reference", "Status", "Score", "Max", "%", "Result", "Hints", "Submitted", ...criterionHead],
          rows: candidateRows,
        },
      },
      {
        heading: "Question & Topic Analysis",
        table: { head: questionHead, rows: questionRows },
      },
    ],
  };

  return (
    <>
      <PageTitle
        title={exam.title}
        subtitle={`Pass mark ${passMark}% · Results ${settings.results_published ? "published" : "not yet published"}`}
        action={
          <div className="flex gap-2 print:hidden">
            <ExportButton filename={`exam-${exam.access_code}.csv`} csv={csv} />
            <ExportExcelButton filename={`exam-${exam.access_code}.xlsx`} data={excelData} />
            <ExportWordButton filename={`exam-${exam.access_code}.docx`} report={wordReport} />
            <PrintButton />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Registered candidates" value={candidateTotal ?? 0} />
        <StatCard label="Submitted" value={submitted.length} hint={`${list.filter((a) => a.status === "in_progress").length} still in progress`} />
        <StatCard label="Average" value={`${avgPct.toFixed(1)}%`} />
        <StatCard label="Pass rate" value={submitted.length ? `${Math.round((passCount / submitted.length) * 100)}%` : "—"} hint={`${passCount}/${submitted.length} passed`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Candidate results</h2>
          <div className="mt-3 max-h-[560px] overflow-y-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-evergreen-900/10 text-left text-ink-soft">
                  <th className="py-2 pr-2 font-medium">Candidate</th>
                  <th className="py-2 pr-2 font-medium">Score</th>
                  <th className="py-2 pr-2 font-medium">%</th>
                  <th className="py-2 pr-2 font-medium">Hints</th>
                  <th className="py-2 font-medium">Result</th>
                  {criterionHead.map((label) => (
                    <th key={label} className="py-2 pl-2 font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((a) => {
                  const pct = a.score !== null && a.max_score ? (Number(a.score) / Number(a.max_score)) * 100 : null;
                  return (
                    <tr key={a.id} className="border-b border-evergreen-900/5">
                      <td className="py-2 pr-2">
                        <span className="font-medium">{(a.exam_candidates as { full_name: string } | null)?.full_name}</span>
                        <span className="block text-xs text-ink-soft">{a.status.replace(/_/g, " ")}{a.submitted_at ? ` · ${fmtDateTime(a.submitted_at)}` : ""}</span>
                      </td>
                      <td className="py-2 pr-2 tabular-nums">{a.score !== null ? `${Number(a.score)}/${Number(a.max_score ?? 0)}` : "—"}</td>
                      <td className="py-2 pr-2 tabular-nums">{pct !== null ? `${pct.toFixed(0)}%` : "—"}</td>
                      <td className="py-2 pr-2 tabular-nums" title="Hint openings recorded for this candidate">{hintsByAttempt.get(a.id) ?? 0}</td>
                      <td className="py-2">{pct !== null ? <Badge tone={pct >= passMark ? "green" : "red"}>{pct >= passMark ? "PASS" : "FAIL"}</Badge> : <Badge tone="gray">Pending</Badge>}</td>
                      {MYP_CRITERIA.map((c) => (
                        <td key={c} className="py-2 pl-2 tabular-nums">{formatCriterionStats(criteriaByAttempt.get(a.id)?.[c])}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {list.length === 0 && <p className="py-3 text-sm text-ink-soft">No attempts yet.</p>}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Question &amp; topic analysis</h2>
          <div className="mt-3 space-y-3">
            {qStats.map((q, i) => (
              <div key={i}>
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 flex-1 text-sm font-medium"><span className="text-ink-soft">Q{i + 1}.</span> <RichContent doc={(q as { prompt_doc?: import("@/lib/content").RichDoc | null }).prompt_doc ?? null} text={q.prompt} /></p>
                  {q.pct !== null ? <Badge tone={q.pct >= 70 ? "green" : q.pct >= 40 ? "amber" : "red"}>{q.pct}%</Badge> : <Badge tone="gray">manual</Badge>}
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-evergreen-100">
                  <div className={`h-full ${(q.pct ?? 0) >= 70 ? "bg-evergreen-600" : (q.pct ?? 0) >= 40 ? "bg-gold-500" : "bg-red-500"}`} style={{ width: `${q.pct ?? 0}%` }} />
                </div>
                <p className="mt-1 text-xs text-ink-soft">{q.answered} answers · {q.difficulty}{q.topic ? ` · ${q.topic}` : ""}{q.crit ? ` · Criterion ${q.crit}${q.strand ? ` ${q.strand}` : ""}` : ""} · {hintsByQuestion.get(q.question_id) ?? 0} hint openings</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
