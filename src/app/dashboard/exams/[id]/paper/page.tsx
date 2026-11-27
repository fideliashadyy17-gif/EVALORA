import { PrintButton } from "@/components/ExportTools";
import { RichContent } from "@/components/RichContent";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import type { ExamRubricLink } from "@/lib/grading";
import { loadQuizQuestions } from "@/lib/live";
import { PrintablePaperError, preparePrintableQuestions } from "@/lib/printablePaper";
import {
  buildAnswerSheet, buildCandidatePackets, buildMarkerGrid, PrintablePacketError,
  type CriteriaByRubric, type PaperItem, type RubricCriterionRow,
} from "@/lib/printablePackets";
import { createClient } from "@/lib/supabase/server";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { formatDuration, parseExamPaperTemplate, parsePaperSections, resolveExamPaperHeader } from "@/lib/examPaper";
import { resolveOrganizationIdentity } from "@/lib/orgIdentity";
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
  if (!org || !(await canOperate(ctx, org.id, "exams.edit"))) notFound();
  const db = await createClient();
  // Printable papers are a separately entitled module (Plan & Module
  // Management) — enforced on the server, independent of any menu entry.
  const { entitlement: printableEnt } = await getCapabilities(db, ctx, org.id);
  requireModule(printableEnt, "exam_printable", `/dashboard/exams/${id}?e=module`);
  const { data: exam, error } = await db.from("exams")
    .select("id, organization_id, quiz_id, title, instructions, duration_minutes, settings")
    .eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (error || !exam || !exam.quiz_id) notFound();
  const { data: quiz, error: quizError } = await db.from("quizzes").select("id, settings")
    .eq("id", exam.quiz_id).eq("organization_id", org.id).maybeSingle();
  if (quizError || !quiz) notFound();
  const examSettings = (exam.settings ?? {}) as Record<string, unknown>;
  const quizSettings = ((quiz.settings as Record<string, unknown> | null) ?? {});
  const [{ data: orgRow }, { data: tplRow }, identity] = await Promise.all([
    db.from("organizations").select("name, logo_url").eq("id", org.id).maybeSingle(),
    typeof examSettings.exam_paper_template_id === "string" && examSettings.exam_paper_template_id
      ? db.from("exam_paper_templates").select("*").eq("id", examSettings.exam_paper_template_id).eq("organization_id", org.id).maybeSingle()
      : Promise.resolve({ data: null }),
    // Organization-configured identity (display name, logo default, paper
    // footer, accent colour) from the Control Center.
    resolveOrganizationIdentity(org.id, org.name).catch(() => null),
  ]);
  const header = resolveExamPaperHeader({
    organizationName: (orgRow?.name as string | null) ?? org.name,
    organizationLogoUrl: (orgRow?.logo_url as string | null) ?? null,
    identity,
    examTitle: exam.title,
    examInstructions: exam.instructions ?? null,
    examDurationMinutes: exam.duration_minutes ?? null,
    examSettings,
    quizSettings,
    template: parseExamPaperTemplate(tplRow),
    totalMarks: null,
  });
  const sections = parsePaperSections(examSettings.sections ?? quizSettings.sections);
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
    answerLines: q.answerLines,
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
                    <p>Reference: <strong>{packet.candidate.access_code ?? "—"}</strong></p>
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
          <header className="paper-cover border-b-2 border-black pb-8 text-center">
            {header.showLogo && header.organizationLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={header.organizationLogoUrl} alt="" className="mx-auto h-16 w-auto max-w-[20rem] object-contain" />
            ) : null}
            <p className="mt-2 text-lg font-bold uppercase tracking-wide">{header.organizationName}</p>
            <p className="mt-1 text-sm font-semibold uppercase tracking-[0.2em]">Official Examination Paper</p>
            {header.period && <p className="mt-1 text-base font-bold uppercase">{header.period}</p>}
            <h1 className="mt-3 text-3xl font-bold">{header.title}</h1>
            <p className="mt-3 text-sm">
              {header.academicYear ? `Academic Year: ${header.academicYear} · ` : ""}
              {header.gradeLabel ? `Grade: ${header.gradeLabel} · ` : ""}
              {header.subject ? `Subject: ${header.subject} · ` : ""}
              Duration: {formatDuration(header.durationMinutes)} · Total Marks: {total}
            </p>
            <div className="mt-8 space-y-4 text-left text-base">
              <p>Candidate name: ______________________________________________________</p>
              <p>Candidate reference: ___________________________ Class: __________________</p>
              <p>Date: ___________________________</p>
            </div>
            {header.instructions && <section className="mt-8 text-left"><h2 className="font-bold">General Instructions</h2><p className="mt-2 whitespace-pre-wrap">{header.instructions}</p></section>}
            {sections.length > 0 && (
              <div className="mt-6 space-y-2 text-left">
                {sections.map((s) => (
                  <div key={s.id} className="border border-gray-400 px-4 py-2">
                    <p className="font-bold">{s.title} <span className="font-normal">· {s.questionCount} questions · {s.marks} marks</span></p>
                    {s.instructions && <p className="text-sm text-gray-600">{s.instructions}</p>}
                  </div>
                ))}
              </div>
            )}
          </header>
          <section aria-label="Examination questions">
            {questions.map((q, i) => {
              const sec = (q as unknown as { question_meta?: { paper_section?: string | null } }).question_meta?.paper_section;
              const secMeta = sections.find((s) => s.id === sec);
              const showSec = secMeta && (i === 0 || (questions[i - 1] as unknown as { question_meta?: { paper_section?: string | null } }).question_meta?.paper_section !== sec);
              return (
                <div key={q.quiz_question_id}>
                  {showSec ? (
                    <h2 className="mt-8 border-y-2 border-black py-3 text-center text-lg font-bold uppercase">{secMeta.title}</h2>
                  ) : null}
                  <div className="paper-question border-b border-gray-300 py-6">
                    <div className="flex items-start justify-between gap-4"><h3 className="font-bold">Question {i + 1}</h3><span className="shrink-0">[{q.points} marks]</span></div>
                    {q.media_url && q.media_type === "image" && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.media_url} alt="Question illustration" className="mt-4 max-h-64 max-w-full object-contain" />
                    )}
                    <div className="mt-3"><RichContent doc={q.prompt_doc} text={q.prompt} /></div>
                    {q.type === "matching" && <MatchingPrint q={q} />}
                    {q.options.length > 0 && <ol className="mt-4 space-y-2">{q.options.map((o, j) => <li key={o.id} className="flex gap-3"><span>☐ {String.fromCharCode(65 + j)}.</span><RichContent doc={o.content_doc} text={o.label} /></li>)}</ol>}
                    {q.type === "ordering" && q.options.length > 0 && (
                      <div aria-label="Answer space" className="paper-answer mt-4">
                        {Array.from({ length: q.answerLines ?? q.options.length }, (_, line) => (
                          <div key={line} className="flex items-baseline gap-2 py-1">
                            <span className="w-6 text-sm font-semibold">{line + 1}.</span>
                            <div className="h-6 flex-1 border-b border-gray-400" />
                          </div>
                        ))}
                      </div>
                    )}
                    {q.type === "assess_parts" && (q.assess_parts?.length ?? 0) > 0 && (
                      <div className="mt-4 space-y-4">
                        {(q.assess_parts ?? []).map((part) => (
                          <div key={part.id}>
                            <p className="flex flex-wrap items-baseline gap-2">
                              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-black px-1.5 text-xs font-bold text-white">{part.label}</span>
                              <span className="min-w-0 flex-1 font-medium"><RichContent text={part.prompt} /></span>
                              <span className="shrink-0 text-sm">[{part.points} mark{part.points === 1 ? "" : "s"}]</span>
                            </p>
                            <div aria-label={`Answer space for part ${part.label}`} className="paper-answer mt-2">
                              {Array.from({ length: part.kind === "numeric" ? 2 : 3 }, (_, line) => (
                                <div key={line} className="h-7 border-b border-gray-400" />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {q.options.length === 0 && q.type !== "assess_parts" && q.type !== "ordering" && !(q.type === "matching" && (q.matching_lefts?.length ?? 0) > 0) && (
                      <div aria-label="Answer space" className="paper-answer mt-5">{Array.from({length: q.type === "open_ended" ? 7 : 2}, (_, line) => <div key={line} className="h-8 border-b border-gray-400" />)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </article>
      )}
    </div>
  );
}

/** Matching questions on paper: statements with blanks plus the shuffled
 *  choice bank (match), tile bank with category boxes (sort), or numbered
 *  rows with a blank box (letters — the bank itself prints in prompt_doc).
 *  The right-hand choices come from the candidate-safe payload, so the
 *  correct pairing is never printed on the paper. */
function MatchingPrint({ q }: { q: ReturnType<typeof preparePrintableQuestions>[number] }) {
  const lefts = q.matching_lefts ?? [];
  const rights = q.matching_rights ?? [];
  const rows = q.matching_rows ?? [];
  if (q.match_mode === "letters" && rows.length > 0) {
    return (
      <ol className="mt-4 space-y-2">
        {rows.map((row, idx) => (
          <li key={idx} className="flex items-baseline gap-2">
            <span className="shrink-0 font-semibold">{row.label}.</span>
            <span className="min-w-0 flex-1"><RichContent text={row.left} /></span>
            <span className="shrink-0 text-sm">[ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ]</span>
          </li>
        ))}
      </ol>
    );
  }
  if (q.match_mode === "sort" && lefts.length > 0) {
    return (
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {lefts.map((tile, idx) => (
            <span key={idx} className="rounded-lg border border-gray-400 px-2 py-1 text-sm"><RichContent text={tile} /></span>
          ))}
        </div>
        {rights.map((zone) => (
          <div key={zone} className="rounded border border-gray-400 p-2">
            <p className="font-medium"><RichContent text={zone} /></p>
            <div className="mt-1 h-12 border-b border-gray-300" />
          </div>
        ))}
      </div>
    );
  }
  if (lefts.length === 0) return null;
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <ol className="space-y-2">
        {lefts.map((left, idx) => (
          <li key={idx} className="flex items-baseline gap-2">
            <span className="shrink-0 font-semibold">{idx + 1}.</span>
            <span className="min-w-0 flex-1"><RichContent text={left} /></span>
            <span className="shrink-0 text-sm">[ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ]</span>
          </li>
        ))}
      </ol>
      <ol className="space-y-2">
        {rights.map((right, idx) => (
          <li key={idx} className="flex items-baseline gap-2">
            <span className="shrink-0 font-semibold">{String.fromCharCode(65 + idx)}.</span>
            <span className="min-w-0 flex-1"><RichContent text={right} /></span>
          </li>
        ))}
      </ol>
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
