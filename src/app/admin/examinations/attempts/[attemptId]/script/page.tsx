import { AnswerResponseView } from "@/components/AnswerResponseView";
import { MathText } from "@/components/MathText";
import { RichContent } from "@/components/RichContent";
import { Badge, Button, ButtonLink, Card, PageTitle, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { loadExamScript, SCRIPT_STATUS_LABEL, type ScriptStatus } from "@/lib/examScript";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { overrideAnswerMarkAsAdmin, regradeAttemptAsAdmin, regradeSingleQuestionAsAdmin } from "../../../actions";

export const metadata: Metadata = { title: "Complete examination script — platform" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<ScriptStatus, "green" | "amber" | "red" | "gray" | "gold"> = {
  auto_graded: "green",
  human_graded: "gold",
  not_graded: "amber",
  grading_failed: "red",
  unanswered: "gray",
};

const ATTEMPT_STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  submitted: "Submitted",
  auto_submitted: "Submitted at the deadline",
  marked: "Marked",
};

const pct = (awarded: number, max: number) => (max > 0 ? `${Math.round((awarded / max) * 1000) / 10}%` : "—");

export default async function ExaminationScriptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  await requireSuperAdmin();
  const { attemptId } = await params;
  const admin = createAdminClient();
  const script = await loadExamScript(admin, attemptId);
  if (!script) notFound();

  const { summary } = script;
  const grouped = [
    { key: "A", title: "Part A" },
    { key: "B", title: "Part B" },
  ]
    .map((section) => ({
      ...section,
      questions: script.questions.filter((question) => question.section === section.key),
    }))
    .filter((section) => section.questions.length > 0);

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Examinations · Complete script review"
        title={script.candidate.name}
        subtitle={
          <>
            {script.exam.title} · {script.organizationName}
            {script.candidate.className ? ` · ${script.candidate.className}` : ""}
            {script.candidate.reference ? ` · Candidate ${script.candidate.reference}` : ""}
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/admin/myp-results/${script.attempt.id}`} variant="outline">MYP result</ButtonLink>
            <ButtonLink href="/admin/examinations/marking" variant="outline">Marking queue</ButtonLink>
            <ButtonLink href="/admin/examinations/results" variant="outline">All results</ButtonLink>
            {script.attempt.status !== "in_progress" && (
              <form action={regradeAttemptAsAdmin} className="inline">
                <input type="hidden" name="attempt_id" value={script.attempt.id} />
                <input type="hidden" name="back" value={`/admin/examinations/attempts/${script.attempt.id}/script`} />
                <Button type="submit" variant="gold" title="Re-evaluate with mathematical equivalence rules">
                  Regrade attempt
                </Button>
              </form>
            )}
          </div>
        }
        meta={
          <>
            <Badge tone={script.attempt.gradingStatus === "graded" ? "green" : script.attempt.gradingStatus === "grading_failed" ? "red" : "amber"}>
              {script.attempt.gradingStatus.replace(/_/g, " ")}
            </Badge>
            <span>Attempt {script.attempt.attemptNumber}</span>
            <span>·</span>
            <span>{ATTEMPT_STATUS_LABEL[script.attempt.status] ?? script.attempt.status.replace(/_/g, " ")}</span>
            {script.attempt.submittedAt && (
              <>
                <span>·</span>
                <span>Submitted {fmtDateTime(script.attempt.submittedAt)}</span>
              </>
            )}
            <span>·</span>
            <span>{script.exam.resultsPublished ? "Results released" : "Results not released"}</span>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total possible" value={`${summary.totalPossible} marks`} hint="Every question on the paper, including unanswered ones." />
        <StatCard label="Awarded on graded questions" value={`${summary.awardedOnGraded} marks`} hint={`${pct(summary.awardedOnGraded, summary.gradedMax)} of the ${summary.gradedMax} marks already graded`} />
        <StatCard label="Covered by completed grading" value={`${summary.coveredMax} / ${summary.totalPossible}`} hint={`Includes ${summary.unansweredMax} marks of unanswered questions (known zero).`} />
        <StatCard label="Not yet graded" value={`${summary.ungradedMax} marks`} hint={`${summary.notGradedCount + summary.failedCount} question${summary.notGradedCount + summary.failedCount === 1 ? "" : "s"} without a completed mark`} />
        <StatCard label="Provisional score" value={`${summary.provisionalScore} / ${summary.totalPossible}`} hint="Marks from completed marking; unanswered questions contribute zero." />
        <StatCard label="Automatically graded" value={`${summary.autoAwarded} marks`} hint={`${summary.autoCount} question${summary.autoCount === 1 ? "" : "s"}· ${summary.autoMax} marks checked by answer key`} />
        <StatCard label="Confirmed final score" value={summary.finalScore === null ? "Not final" : `${summary.finalScore} / ${summary.totalPossible}`} hint={summary.finalScore === null ? "A final score is withheld while any question is ungraded or failed." : "Every question has a completed marking decision."} />
        <StatCard label="Status count" value={`${summary.unansweredCount} unanswered`} hint={`${summary.notGradedCount} not graded · ${summary.failedCount} grading failed · ${summary.humanCount} teacher-graded`} />
      </div>

      {script.attempt.gradingError && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Grading problem recorded on this attempt.</strong> {script.attempt.gradingError}
        </p>
      )}

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold text-evergreen-950">How to read this script</h2>
        <div className="mt-3 grid gap-3 text-xs leading-relaxed text-ink sm:grid-cols-2 lg:grid-cols-4">
          <p><Badge tone="green">Automatically graded</Badge><br />The answer key awarded the mark; the exact marks are below.</p>
          <p><Badge tone="amber">Not graded</Badge><br />The response is saved but requires a teacher. It is not zero.</p>
          <p><Badge tone="red">Grading failed</Badge><br />The saved response could not be checked. It is not zero and not full marks.</p>
          <p><Badge tone="gray">Unanswered</Badge><br />No response was saved. It is worth zero and is not awaiting marking.</p>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          The provisional score separates marks already earned from marks still being decided. The final score is shown only
          when no question remains ungraded or failed. Results are not released by this page — publication follows the
          examination&apos;s existing release setting.
        </p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-evergreen-900/15 bg-paper p-3 shadow-[var(--shadow-card)]">
            <p className="px-2 text-[11px] font-bold uppercase tracking-wide text-ink-soft">Questions</p>
            <nav aria-label="Script questions" className="mt-2 space-y-0.5">
              {script.questions.map((question) => (
                <a
                  key={question.number}
                  href={`#question-${question.number}`}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-evergreen-50"
                >
                  <span className="truncate">
                    {question.section === "B" ? "B" : "A"} Q{question.label}
                  </span>
                  <span
                    className={
                      question.status === "auto_graded" || question.status === "human_graded"
                        ? "shrink-0 font-semibold text-evergreen-800"
                        : question.status === "unanswered"
                          ? "shrink-0 text-ink-soft"
                          : "shrink-0 font-semibold text-amber-800"
                    }
                  >
                    {question.status === "unanswered" ? "—" : `${question.awarded ?? "?"}/${question.max}`}
                  </span>
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 space-y-8">
          {grouped.map((section) => (
            <section key={section.key} className="space-y-5" aria-labelledby={`section-${section.key}`}>
              <div className="flex items-end justify-between gap-3 border-b border-evergreen-900/15 pb-2">
                <h2 id={`section-${section.key}`} className="font-display text-xl font-semibold text-evergreen-950">
                  {section.title}
                </h2>
                <p className="text-xs text-ink-soft">
                  {section.questions.length} question{section.questions.length === 1 ? "" : "s"} ·{" "}
                  {section.questions.reduce((total, question) => total + question.max, 0)} marks
                </p>
              </div>

              {section.questions.map((question) => (
                <article key={question.number} id={`question-${question.number}`} className="scroll-mt-4 rounded-2xl border border-evergreen-900/15 bg-paper p-5 shadow-[var(--shadow-card)] sm:p-6">
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-evergreen-700">
                        {question.section === "B" ? "Part B" : "Part A"} · Question {question.label}
                        {question.criterion ? ` · Criterion ${question.criterion}` : ""}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-evergreen-950">
                        Max {question.max} mark{question.max === 1 ? "" : "s"}
                        {question.awarded !== null ? ` · Awarded ${question.awarded}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS_TONE[question.status]}>{SCRIPT_STATUS_LABEL[question.status]}</Badge>
                      <span className="rounded-lg bg-evergreen-50 px-2.5 py-1 text-sm font-semibold tabular-nums text-evergreen-900">
                        {question.awarded === null ? "—" : question.awarded} / {question.max}
                      </span>
                    </div>
                  </header>

                  {question.note && (
                    <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${question.status === "grading_failed" ? "border border-red-300 bg-red-50 text-red-800" : question.status === "unanswered" ? "bg-stone-100 text-stone-700" : "bg-amber-50 text-amber-900"}`}>
                      {question.note}
                    </p>
                  )}

                  <div className="mt-4 grid gap-5 lg:grid-cols-2">
                    <div className="min-w-0">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Question as set</h3>
                      <div className="mt-2 rounded-xl border border-evergreen-900/10 bg-white p-4 text-sm">
                        <RichContent doc={question.promptDoc} text={question.prompt} />
                      </div>

                      <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Student&apos;s response</h3>
                      <div className="mt-2 rounded-xl border border-evergreen-900/10 bg-white p-4">
                        {question.answered ? (
                          <AnswerResponseView answer={question.answer} assessParts={question.publicParts} showComponents />
                        ) : (
                          <p className="text-sm text-ink-soft">No response was saved for this question.</p>
                        )}
                      </div>

                      {question.structured.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Structured construction marks</h3>
                          {question.structured.map((rule) => (
                            <div key={rule.id} className="rounded-lg border border-evergreen-900/10 bg-cream/50 px-3 py-2 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-evergreen-950">{rule.label}</span>
                                <span className="tabular-nums text-evergreen-900">{rule.earned} / {rule.points}</span>
                              </div>
                              <p className="mt-1 text-ink-soft">{rule.detail}</p>
                              <p className="mt-1"><span className="font-semibold">Required:</span> <MathText text={rule.expected} /></p>
                            </div>
                          ))}
                        </div>
                      )}

                      {question.parts.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Part marks</h3>
                          {question.parts.map((part) => (
                            <div key={part.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-evergreen-900/10 bg-white px-3 py-2 text-xs">
                              <div className="min-w-0">
                                <span className="font-semibold text-evergreen-950">{part.label}</span>
                                {part.prompt ? <span className="ml-2 text-ink">{part.prompt}</span> : null}
                                <span className="ml-2 text-ink-soft">Typed: {part.typed ?? "—"}</span>
                              </div>
                              <span className={part.earned >= part.points ? "font-semibold text-evergreen-800" : part.earned > 0 ? "font-semibold text-amber-800" : "text-red-700"}>
                                {part.earned} / {part.points}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Correct / expected answer</h3>
                      <div className="mt-2 rounded-xl border border-evergreen-900/10 bg-evergreen-50/60 p-4 text-sm">
                        {question.correctOptionDocs.length > 0 ? (
                          <ul className="space-y-2">
                            {question.correctOptionDocs.map((option) => (
                              <li key={option.label} className="flex gap-2">
                                <span className="font-semibold text-evergreen-900">{option.label}</span>
                                <span className="min-w-0 flex-1">
                                  {option.doc ? <RichContent doc={option.doc} /> : <span>{option.text}</span>}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : question.expected.length > 0 ? (
                          <ul className="list-disc space-y-1 pl-5">
                            {question.expected.map((line, index) => (
                              <li key={`${question.number}-expected-${index}`}><MathText text={line} /></li>
                            ))}
                          </ul>
                        ) : question.explanation ? (
                          <p className="whitespace-pre-wrap">{question.explanation}</p>
                        ) : (
                          <p className="text-ink-soft">No separate expected answer was stored for this question.</p>
                        )}
                      </div>

                      {question.markingBreakdown.length > 0 && (
                        <>
                          <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Mark allocation</h3>
                          <ul className="mt-2 space-y-1 rounded-xl border border-evergreen-900/10 bg-white p-4 text-xs">
                            {question.markingBreakdown.map((row, index) => (
                              <li key={`${question.number}-breakdown-${index}`} className="flex gap-2">
                                <span className="font-semibold tabular-nums text-evergreen-900">{row.marks}</span>
                                <span className="text-ink"><span className="font-medium">{row.label}</span>{row.focus ? ` — ${row.focus}` : ""}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}

                      {question.explanation && question.expected.length > 0 && (
                        <>
                          <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Worked solution</h3>
                          <p className="mt-2 whitespace-pre-wrap rounded-xl border border-evergreen-900/10 bg-white p-4 text-sm leading-relaxed">
                            {question.explanation}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Super Admin Individual Question Review, Manual Override & Regrading */}
                  <div className="mt-5 rounded-xl border border-gold-500/40 bg-gold-50/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-900/10 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-evergreen-950">
                        Super Admin Mark Adjustment &amp; Override
                      </span>
                      <span className="text-xs text-ink-soft">
                        Current: <strong>{question.awarded ?? 0}</strong> / {question.max} marks ({SCRIPT_STATUS_LABEL[question.status]})
                      </span>
                    </div>

                    <form action={overrideAnswerMarkAsAdmin} className="mt-3 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="attempt_id" value={script.attempt.id} />
                      <input type="hidden" name="question_id" value={question.questionId} />
                      {question.answerId && <input type="hidden" name="answer_id" value={question.answerId} />}
                      <input type="hidden" name="back" value={`/admin/examinations/attempts/${script.attempt.id}/script#question-${question.number}`} />

                      <div className="w-28">
                        <label htmlFor={`points-${question.number}`} className="block text-[11px] font-semibold text-evergreen-950">
                          Marks (0–{question.max})
                        </label>
                        <input
                          id={`points-${question.number}`}
                          name="points"
                          type="number"
                          step="any"
                          min="0"
                          max={question.max}
                          defaultValue={question.awarded ?? 0}
                          required
                          className="mt-1 block w-full rounded-lg border border-evergreen-900/20 bg-white px-2.5 py-1.5 text-sm font-semibold text-evergreen-950 focus:border-evergreen-600 focus:outline-none focus:ring-1 focus:ring-evergreen-600"
                        />
                      </div>

                      <div className="min-w-[240px] flex-1">
                        <label htmlFor={`reason-${question.number}`} className="block text-[11px] font-semibold text-evergreen-950">
                          Correction reason / audit note
                        </label>
                        <input
                          id={`reason-${question.number}`}
                          name="reason"
                          type="text"
                          defaultValue={question.markerNote ?? ""}
                          placeholder="e.g. Awarded partial credit; recognized equivalent form; corrected auto-grading"
                          className="mt-1 block w-full rounded-lg border border-evergreen-900/20 bg-white px-3 py-1.5 text-xs text-ink focus:border-evergreen-600 focus:outline-none focus:ring-1 focus:ring-evergreen-600"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="submit" variant="primary" className="py-1.5 text-xs">
                          Save mark override
                        </Button>
                      </div>
                    </form>

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-gold-900/10 pt-2 text-xs">
                      <span className="text-[11px] text-ink-soft">
                        Overrides are auditable, record original and revised marks, and automatically recalculate total attempt scores.
                      </span>
                      <div className="flex items-center gap-2">
                        <form action={regradeSingleQuestionAsAdmin} className="inline">
                          <input type="hidden" name="attempt_id" value={script.attempt.id} />
                          <input type="hidden" name="question_id" value={question.questionId} />
                          <input type="hidden" name="back" value={`/admin/examinations/attempts/${script.attempt.id}/script#question-${question.number}`} />
                          <Button type="submit" variant="outline" className="py-1 text-xs">
                            Re-evaluate with auto-grader
                          </Button>
                        </form>
                        <Link
                          href={`/admin/questions/${question.questionId}`}
                          className="font-medium text-evergreen-800 underline-offset-2 hover:underline"
                        >
                          View question in Studio →
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
