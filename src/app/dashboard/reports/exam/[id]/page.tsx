import { RichContent } from "@/components/RichContent";
import { Badge, Card, PageTitle, StatCard } from "@/components/ui";
import { ExportButton, PrintButton, ExportExcelButton, ExportWordButton } from "@/components/ExportTools";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { aggregateCriterionStats } from "@/lib/examResults";

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
    supabase.from("quiz_questions").select("question_id, questions(prompt, prompt_doc, type, topic, difficulty, config), position").eq("quiz_id", exam.quiz_id).order("position"),
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
  const criterionStats = aggregateCriterionStats(
    list.map((a) => ({ id: a.id, score: a.score ?? 0, display_name: (a.exam_candidates as { full_name: string } | null)?.full_name ?? "" })),
    list.flatMap((a) =>
      ((a.exam_answers as { question_id: string; is_correct: boolean | null; points_awarded: number | null }[]) ?? []).map((ans) => ({
        participant_id: a.id,
        question_id: ans.question_id,
        is_correct: ans.is_correct,
        points_awarded: ans.points_awarded,
      }))
    ),
    (qq ?? []).map((r) => ({
      id: r.question_id,
      quiz_question_id: r.question_id,
      config: (r.questions as unknown as { config: Record<string, unknown> | null }).config,
      points: (r.questions as unknown as { points: number | null }).points,
    }))
  );

  const csv = toCsv([
    ["Candidate", "Reference", "Status", "Score", "Max", "%", "Result", "Hints used", "Submitted", "Criterion A", "Criterion B", "Criterion C", "Criterion D"],
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
        criterionStats.A.notAssessed ? "Not assessed" : `${criterionStats.A.marks}/${criterionStats.A.max} (${criterionStats.A.percentage}%)`,
        criterionStats.B.notAssessed ? "Not assessed" : `${criterionStats.B.marks}/${criterionStats.B.max} (${criterionStats.B.percentage}%)`,
        criterionStats.C.notAssessed ? "Not assessed" : `${criterionStats.C.marks}/${criterionStats.C.max} (${criterionStats.C.percentage}%)`,
        criterionStats.D.notAssessed ? "Not assessed" : `${criterionStats.D.marks}/${criterionStats.D.max} (${criterionStats.D.percentage}%)`,
      ];
    }),
    [],
    ["Question", "Type", "Topic", "Difficulty", "Answered", "% Correct", "Criterion"],
    ...qStats.map((q, i) => [`Q${i + 1}`, q.type, q.topic ?? "", q.difficulty, q.answered, q.pct ?? "n/a", q.crit ? `Criterion ${q.crit}${q.strand ? ` ${q.strand}` : ""}` : ""]),
  ]);

  // Excel Data
  const excelData = [
    ["Candidate", "Reference", "Status", "Score", "Max", "%", "Result", "Hints used", "Submitted", "Criterion A", "Criterion B", "Criterion C", "Criterion D"],
    ...list.map((a) => {
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
        criterionStats.A.notAssessed ? "Not assessed" : `${criterionStats.A.marks}/${criterionStats.A.max} (${criterionStats.A.percentage}%)`,
        criterionStats.B.notAssessed ? "Not assessed" : `${criterionStats.B.marks}/${criterionStats.B.max} (${criterionStats.B.percentage}%)`,
        criterionStats.C.notAssessed ? "Not assessed" : `${criterionStats.C.marks}/${criterionStats.C.max} (${criterionStats.C.percentage}%)`,
        criterionStats.D.notAssessed ? "Not assessed" : `${criterionStats.D.marks}/${criterionStats.D.max} (${criterionStats.D.percentage}%)`,
      ];
    }),
    [],
    ["Question", "Type", "Topic", "Difficulty", "Answered", "% Correct", "Criterion"],
    ...qStats.map((q, i) => [`Q${i + 1}`, q.type, q.topic ?? "", q.difficulty, q.answered, q.pct ?? "n/a", q.crit ? `Criterion ${q.crit}${q.strand ? ` ${q.strand}` : ""}` : ""]),
  ];

  // Word HTML
  const wordHtml = `
    <h1>Examination Report: ${exam.title}</h1>
    <p><strong>Pass mark:</strong> ${passMark}% · <strong>Results:</strong> ${settings.results_published ? "published" : "not yet published"}</p>
    <h2>Candidate Results</h2>
    <table border="1" cellpadding="5" cellspacing="0">
      <tr>
        <th>Candidate</th><th>Reference</th><th>Status</th><th>Score</th><th>Max</th><th>%</th><th>Result</th><th>Hints</th><th>Submitted</th>
        <th>Criterion A</th><th>Criterion B</th><th>Criterion C</th><th>Criterion D</th>
      </tr>
      ${list.map((a) => {
        const pct = a.score !== null && a.max_score ? (Number(a.score) / Number(a.max_score)) * 100 : null;
        return `<tr>
          <td>${(a.exam_candidates as { full_name: string } | null)?.full_name ?? ""}</td>
          <td>${(a.exam_candidates as { candidate_ref: string | null } | null)?.candidate_ref ?? ""}</td>
          <td>${a.status}</td>
          <td>${a.score !== null ? Number(a.score) : ""}</td>
          <td>${a.max_score !== null ? Number(a.max_score) : ""}</td>
          <td>${pct !== null ? `${pct.toFixed(0)}%` : ""}</td>
          <td>${typeof pct === "number" ? (pct >= passMark ? "PASS" : "FAIL") : ""}</td>
          <td>${hintsByAttempt.get(a.id) ?? 0}</td>
          <td>${a.submitted_at ?? ""}</td>
          <td>${criterionStats.A.notAssessed ? "Not assessed" : `${criterionStats.A.marks}/${criterionStats.A.max} (${criterionStats.A.percentage}%)`}</td>
          <td>${criterionStats.B.notAssessed ? "Not assessed" : `${criterionStats.B.marks}/${criterionStats.B.max} (${criterionStats.B.percentage}%)`}</td>
          <td>${criterionStats.C.notAssessed ? "Not assessed" : `${criterionStats.C.marks}/${criterionStats.C.max} (${criterionStats.C.percentage}%)`}</td>
          <td>${criterionStats.D.notAssessed ? "Not assessed" : `${criterionStats.D.marks}/${criterionStats.D.max} (${criterionStats.D.percentage}%)`}</td>
        </tr>`;
      }).join("")}
    </table>
    <h2>Question & Topic Analysis</h2>
    <table border="1" cellpadding="5" cellspacing="0">
      <tr>
        <th>Question</th><th>Type</th><th>Topic</th><th>Difficulty</th><th>Answered</th><th>% Correct</th><th>Criterion</th>
      </tr>
      ${qStats.map((q, i) => `<tr>
        <td>Q${i + 1}</td><td>${q.type}</td><td>${q.topic ?? ""}</td><td>${q.difficulty}</td><td>${q.answered}</td><td>${q.pct ?? "n/a"}</td><td>${q.crit ? `Criterion ${q.crit}${q.strand ? ` ${q.strand}` : ""}` : ""}</td>
      </tr>`).join("")}
    </table>
  `;

  return (
    <>
      <PageTitle
        title={exam.title}
        subtitle={`Pass mark ${passMark}% · Results ${settings.results_published ? "published" : "not yet published"}`}
        action={
          <div className="flex gap-2 print:hidden">
            <ExportButton filename={`exam-${exam.access_code}.csv`} csv={csv} />
            <ExportExcelButton filename={`exam-${exam.access_code}.xlsx`} data={excelData} />
            <ExportWordButton filename={`exam-${exam.access_code}.docx`} html={wordHtml} />
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
                  <th className="py-2 font-medium">Criterion A</th>
                  <th className="py-2 font-medium">Criterion B</th>
                  <th className="py-2 font-medium">Criterion C</th>
                  <th className="py-2 font-medium">Criterion D</th>
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
                      <td className="py-2 tabular-nums">{criterionStats.A.notAssessed ? "Not assessed" : `${criterionStats.A.marks}/${criterionStats.A.max} (${criterionStats.A.percentage}%)`}</td>
                      <td className="py-2 tabular-nums">{criterionStats.B.notAssessed ? "Not assessed" : `${criterionStats.B.marks}/${criterionStats.B.max} (${criterionStats.B.percentage}%)`}</td>
                      <td className="py-2 tabular-nums">{criterionStats.C.notAssessed ? "Not assessed" : `${criterionStats.C.marks}/${criterionStats.C.max} (${criterionStats.C.percentage}%)`}</td>
                      <td className="py-2 tabular-nums">{criterionStats.D.notAssessed ? "Not assessed" : `${criterionStats.D.marks}/${criterionStats.D.max} (${criterionStats.D.percentage}%)`}</td>
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
