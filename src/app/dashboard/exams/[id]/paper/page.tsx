import { PrintButton } from "@/components/ExportTools";
import { RichContent } from "@/components/RichContent";
import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import type { ExamRubricLink } from "@/lib/grading";
import { loadQuizQuestions } from "@/lib/live";
import { PrintablePaperError, preparePrintableQuestions } from "@/lib/printablePaper";
import {
  buildAnswerSheet, buildCandidatePackets, buildMarkerGrid, PrintablePacketError,
  type CriteriaByRubric, type PaperItem, type RubricCriterionRow,
} from "@/lib/printablePackets";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Print examination" };
export const dynamic = "force-dynamic";

const MODES = ["paper", "sheet", "packets", "markers"] as const;
type Mode = (typeof MODES)[number];

export default async function PrintableExam({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const mode: Mode = MODES.includes(sp.mode as Mode) ? (sp.mode as Mode) : "paper";
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, CREATOR_ROLES)) notFound();
  const db = await createClient();
  const { data: exam, error } = await db.from("exams")
    .select("id, organization_id, quiz_id, title, instructions, duration_minutes")
    .eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (error || !exam || !exam.quiz_id) notFound();
  const { data: quiz, error: quizError } = await db.from("quizzes").select("id")
    .eq("id", exam.quiz_id).eq("organization_id", org.id).maybeSingle();
  if (quizError || !quiz) notFound();
  let questions: ReturnType<typeof preparePrintableQuestions> = [];
  let problem: string | null = null;
  try {
    const { count, error: countError } = await db.from("quiz_questions").select("id", { count: "exact", head: true }).eq("quiz_id", exam.quiz_id);
    if (countError || count === null) throw new PrintablePaperError("Question count could not be verified.");
    const rows = await loadQuizQuestions(db, exam.quiz_id, { failOnError: true });
    if (rows.length !== count) throw new PrintablePaperError("The complete paper could not be loaded.");
    questions = preparePrintableQuestions(rows, org.id);
  } catch (e) {
    problem = e instanceof PrintablePaperError ? e.message : "The paper could not be loaded.";
  }
  const total = questions.reduce((sum, q) => sum + q.points, 0);

  // Paper additions: candidates for packets, and the rubrics attached to the
  // examination so the marker's grid matches the marking screen exactly.
  const [{ data: linkRows }, { data: candidateRows }] = await Promise.all([
    db.from("exam_rubric_links")
      .select("id, rubric_id, question_id, grading_rubrics(title, total_marks)")
      .eq("exam_id", id).eq("organization_id", org.id),
    db.from("exam_candidates").select("id, full_name, access_code").eq("exam_id", id),
  ]);
  const links = (linkRows ?? []) as unknown as ExamRubricLink[];
  const rubricIds = [...new Set(links.map((link) => link.rubric_id))];
  const { data: criteriaRows } = rubricIds.length
    ? await db.from("grading_rubric_criteria")
        .select("id, rubric_id, code, label, max_marks")
        .in("rubric_id", rubricIds).order("position")
    : { data: [] as { id: string; rubric_id: string; code: string | null; label: string; max_marks: number }[] };

  const criteriaByRubric: Map<string, RubricCriterionRow[]> = new Map();
  for (const row of (criteriaRows ?? []) as { id: string; rubric_id: string; code: string | null; label: string; max_marks: number }[]) {
    criteriaByRubric.set(row.rubric_id, [
      ...(criteriaByRubric.get(row.rubric_id) ?? []),
      { id: row.id, code: row.code, label: row.label, maxMarks: Number(row.max_marks) },
    ]);
  }
  const paperItems: PaperItem[] = questions.map((q) => ({
    quiz_question_id: q.quiz_question_id,
    question_id: q.question_id,
    type: q.type,
    points: Number(q.points),
    options: q.options,
  }));

  let packets: ReturnType<typeof buildCandidatePackets> = [];
  let markerGrid: ReturnType<typeof buildMarkerGrid> = [];
  let packetProblem: string | null = null;
  try {
    markerGrid = buildMarkerGrid(paperItems, links, criteriaByRubric as CriteriaByRubric);
    if (mode === "packets") {
      packets = buildCandidatePackets((candidateRows ?? []) as { id: string; full_name: string; access_code: string | null }[], paperItems, links, criteriaByRubric as CriteriaByRubric);
    }
  } catch (e) {
    packetProblem = e instanceof PrintablePacketError ? e.message : "The packets could not be prepared.";
  }
  const answerSheet = buildAnswerSheet(paperItems);
  return (
    <div className="paper-print text-ink">
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/dashboard/exams/${id}`} className="font-medium text-evergreen-700 underline">← Back to examination</Link>
        {!problem && <PrintButton />}
        <nav aria-label="Paper view" className="flex flex-wrap gap-2">
          {([["paper", "Question paper"], ["sheet", "Answer sheet"], ["packets", "Candidate packets"], ["markers", "Marker grid"]] as const).map(([value, label]) => (
            <Link
              key={value}
              href={`/dashboard/exams/${id}/paper${value === "paper" ? "" : `?mode=${value}`}`}
              aria-current={mode === value ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${mode === value ? "border-evergreen-700 bg-evergreen-700 text-white" : "border-evergreen-900/20 text-evergreen-800"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className="basis-full text-sm text-ink-soft">
          Review before printing. The question paper is unpersonalised; candidate packets add an answer sheet and a marker grid per candidate, one packet per page. Scanning, candidate matching and paper grading are not yet available.
          {mode === "packets" && ` ${packets.length} candidate packet(s).`}
        </p>
      </div>
      {problem ? (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">Cannot prepare paper: {problem} Edit the paper before printing.</p>
      ) : mode === "markers" ? (
        <article className="paper-document bg-white p-8 print:p-0">
          <header className="paper-cover border-b-2 border-black pb-6">
            <p className="text-sm font-semibold uppercase tracking-wide">{org.name} · EVALORA</p>
            <h1 className="mt-3 text-2xl font-bold">{exam.title} — marker grid</h1>
            <p className="mt-2 text-sm">Total: {total} marks · Circle or write the awarded mark for each criterion.</p>
          </header>
          <MarkerTable rows={markerGrid} total={total} />
        </article>
      ) : mode === "sheet" ? (
        <article className="paper-document bg-white p-8 print:p-0">
          <header className="paper-cover border-b-2 border-black pb-6">
            <p className="text-sm font-semibold uppercase tracking-wide">{org.name} · EVALORA</p>
            <h1 className="mt-3 text-2xl font-bold">{exam.title} — answer sheet</h1>
            <p className="mt-2 text-sm">Duration: {exam.duration_minutes} minutes · Total: {total} marks</p>
            <p className="mt-4 text-base">Candidate name: ______________________________________ Date: ________________</p>
          </header>
          <AnswerSheet rows={answerSheet} />
        </article>
      ) : mode === "packets" ? (
        packetProblem ? (
          <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{packetProblem}</p>
        ) : (
          <div className="space-y-8 print:space-y-0">
            {packets.map((packet) => (
              <section
                key={packet.candidate.id}
                className={`paper-document paper-packet bg-white p-8 print:p-0 ${packet.index > 0 ? "print:break-before-page" : ""}`}
              >
                <header className="paper-cover border-b-2 border-black pb-6">
                  <p className="text-sm font-semibold uppercase tracking-wide">{org.name} · EVALORA</p>
                  <h1 className="mt-3 text-2xl font-bold">{exam.title}</h1>
                  <p className="mt-2 text-sm">Duration: {exam.duration_minutes} minutes · Total: {packet.totalMarks} marks</p>
                  <div className="mt-6 grid gap-2 text-base sm:grid-cols-2">
                    <p>Candidate: <strong>{packet.candidate.full_name}</strong></p>
                    <p>Reference: <strong>{packet.candidate.access_code ?? "—”"}</strong></p>
                    <p>Date: ______________________</p>
                    <p>Marker: ____________________</p>
                  </div>
                </header>

                <AnswerSheet rows={packet.answerSheet} />

                <section aria-label="Marker grid" className="mt-6">
                  <h2 className="font-bold">Marker grid (marker use only)</h2>
                  <MarkerTable rows={packet.markerGrid} total={packet.totalMarks} />
                  <p className="mt-3 text-xs">Marker signature: ____________________________  Date: ______________</p>
                </section>
              </section>
            ))}
          </div>
        )
      ) : (
        <article className="paper-document bg-white p-8 print:p-0">
          <header className="paper-cover border-b-2 border-black pb-8">
            <p className="text-sm font-semibold uppercase tracking-wide">{org.name} · EVALORA</p>
            <h1 className="mt-4 text-3xl font-bold">{exam.title}</h1>
            <p className="mt-3">Duration: {exam.duration_minutes} minutes · Total: {total} marks</p>
            <div className="mt-8 space-y-4 text-base">
              <p>Candidate name: ______________________________________________________</p>
              <p>Candidate reference: ___________________________ Class: __________________</p>
              <p>Date: ___________________________</p>
            </div>
            {exam.instructions && <section className="mt-8"><h2 className="font-bold">Instructions</h2><p className="mt-2 whitespace-pre-wrap">{exam.instructions}</p></section>}
          </header>
          <section aria-label="Examination questions">
            {questions.map((q, i) => (
              <div key={q.quiz_question_id} className="paper-question border-b border-gray-300 py-6">
                <div className="flex items-start justify-between gap-4"><h2 className="font-bold">Question {i + 1}</h2><span className="shrink-0">[{q.points} marks]</span></div>
                {q.media_url && q.media_type === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.media_url} alt="Question illustration" className="mt-4 max-h-64 max-w-full object-contain" />
                )}
                <div className="mt-3"><RichContent doc={q.prompt_doc} text={q.prompt} /></div>
                {q.options.length > 0 && <ol className="mt-4 space-y-2">{q.options.map((o, j) => <li key={o.id} className="flex gap-3"><span>☐ {String.fromCharCode(65 + j)}.</span><RichContent doc={o.content_doc} text={o.label} /></li>)}</ol>}
                {q.options.length === 0 && <div aria-label="Answer space" className="paper-answer mt-5">{Array.from({length: q.type === "open_ended" ? 7 : 2}, (_, line) => <div key={line} className="h-8 border-b border-gray-400" />)}</div>}
              </div>
            ))}
          </section>
        </article>
      )}
    </div>
  );
}

/** The rubric grid a marker fills in: one row per criterion, or one row per
 *  question where no rubric is attached, so nothing silently drops off paper. */
function MarkerTable({ rows, total }: { rows: ReturnType<typeof buildMarkerGrid>; total: number }) {
  return (
    <>
      <table className="mt-3 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="w-12 py-1 pr-2">Q</th>
            <th className="py-1 pr-2">Criterion</th>
            <th className="w-16 py-1 pr-2 text-right">Max</th>
            <th className="w-24 py-1 text-right">Awarded</th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((row) => {
            if (row.criteria.length === 0) {
              return [
                <tr key={row.number} className="border-b border-gray-300">
                  <td className="py-1 pr-2 align-top font-semibold">{row.number}</td>
                  <td className="py-1 pr-2">Single mark (no rubric attached)</td>
                  <td className="py-1 pr-2 text-right">{row.points}</td>
                  <td className="py-3" />
                </tr>,
              ];
            }
            return row.criteria.map((criterion, index) => (
              <tr key={`${row.number}-${criterion.id}`} className="border-b border-gray-300">
                <td className="py-1 pr-2 align-top font-semibold">{index === 0 ? row.number : ""}</td>
                <td className="py-1 pr-2">
                  {criterion.code ? `${criterion.code} · ` : ""}{criterion.label}
                </td>
                <td className="py-1 pr-2 text-right">{criterion.maxMarks}</td>
                <td className="py-3" />
              </tr>
            ));
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs">Total: ________ / {total}</p>
    </>
  );
}

/** The candidate's answer sheet: a box per question, sized by question type. */
function AnswerSheet({ rows }: { rows: ReturnType<typeof buildAnswerSheet> }) {
  return (
    <section aria-label="Answer sheet" className="mt-6">
      <h2 className="font-bold">Answer sheet</h2>
      <p className="mt-1 text-xs">Write your answer for each question in its box.</p>
      <div className="mt-3 space-y-4">
        {rows.map((row) => (
          <div key={row.number} className="border border-gray-400 p-2">
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold">Question {row.number}</span>
              <span className="text-xs">[{row.points} marks]</span>
            </div>
            {row.kind === "choices" ? (
              <p className="mt-2 text-sm">{row.choiceLabels.map((label) => `☐ ${label}`).join("   ")}</p>
            ) : (
              <div className="mt-2">
                {Array.from({ length: row.lines }, (_, line) => (
                  <div key={line} className="h-7 border-b border-gray-300" />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
