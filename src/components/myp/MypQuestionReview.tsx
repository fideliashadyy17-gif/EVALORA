"use client";

import type { MypResultQuestion } from "@/lib/myp";

/**
 * Question-by-question review of a marked paper.
 *
 * This is the on-screen twin of the Candidate Examination Paper PDF: the same
 * stored marks, the same verdicts, the same expected answers. It renders only
 * when the caller has decided the candidate is entitled to see marking (the
 * result is published, or a teacher is previewing a validated result), so it
 * never has to decide that for itself.
 */
const STATUS_STYLE: Record<
  MypResultQuestion["parts"][number]["status"],
  { label: string; chip: string; text: string; border: string }
> = {
  correct: {
    label: "CORRECT",
    chip: "bg-emerald-700 text-white",
    text: "text-emerald-800",
    border: "border-emerald-700/40",
  },
  partial: {
    label: "PARTIAL CREDIT",
    chip: "bg-amber-600 text-white",
    text: "text-amber-800",
    border: "border-amber-600/40",
  },
  wrong: {
    label: "WRONG",
    chip: "bg-red-700 text-white",
    text: "text-red-700",
    border: "border-red-700/40",
  },
  unanswered: {
    label: "NO ANSWER",
    chip: "bg-ink-soft text-white",
    text: "text-ink-soft",
    border: "border-ink-soft/40",
  },
  // The question mark is recorded but not which part earned it. Say so plainly
  // rather than blaming the candidate for a split the school never recorded.
  allocated: {
    label: "MARKS IN QUESTION TOTAL",
    chip: "bg-evergreen-900/70 text-white",
    text: "text-ink-soft",
    border: "border-evergreen-900/20",
  },
};

function fmtMark(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function Verdict({ status }: { status: MypResultQuestion["parts"][number]["status"] }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${style.chip}`}>
      {style.label}
    </span>
  );
}

export function MypQuestionReview({ questions }: { questions: MypResultQuestion[] }) {
  if (questions.length === 0) return null;
  const totalAwarded = questions.reduce((sum, question) => sum + question.earned, 0);
  const totalMax = questions.reduce((sum, question) => sum + question.max, 0);

  return (
    <div className="rounded-2xl border border-evergreen-900/15 bg-paper p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Question-by-question marking</h2>
        <p className="text-xs font-semibold tabular-nums text-evergreen-900">
          {fmtMark(totalAwarded)} / {fmtMark(totalMax)} marks shown
        </p>
      </div>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-soft">
        Every answer you submitted is reproduced as you wrote it. Correct answers are shown in green, wrong answers in red
        with the expected answer, and partly correct answers show the marks awarded. Marking notes from your teacher appear
        beneath the question they refer to.
      </p>

      <ol className="mt-5 space-y-4">
        {questions.map((question) => (
          <li
            key={question.questionId}
            className="rounded-xl border border-evergreen-900/12 bg-white/60 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                  Question {question.number}
                  {question.criterion ? ` · Criterion ${question.criterion}` : ""}
                </p>
                <p className="mt-1 text-sm font-medium leading-snug text-evergreen-950">{question.prompt}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-semibold tabular-nums text-evergreen-900">
                  {fmtMark(question.earned)} / {question.max}
                </span>
                <Verdict status={question.status} />
              </div>
            </div>

            {question.teacherFeedback && (
              <p className="mt-3 rounded-lg border border-evergreen-900/12 bg-evergreen-900/5 px-3 py-2 text-xs leading-relaxed text-ink">
                <span className="font-semibold text-evergreen-900">Teacher feedback: </span>
                {question.teacherFeedback}
              </p>
            )}

            {question.parts.length > 0 ? (
              <div className="mt-3 space-y-2">
                {question.parts.map((part, index) => {
                  const style = STATUS_STYLE[part.status];
                  return (
                    <div key={`${question.questionId}-${index}`} className={`rounded-lg border ${style.border} p-3`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-ink-soft">
                            Part ({part.label}){part.max ? ` · ${part.max} ${part.max === 1 ? "mark" : "marks"}` : ""}
                          </p>
                          <p className="text-xs leading-snug text-ink">{part.prompt}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs font-semibold tabular-nums text-evergreen-900">
                            {part.earned === null ? `of ${part.max}` : `${fmtMark(part.earned)}/${part.max}`}
                          </span>
                          <Verdict status={part.status} />
                        </div>
                      </div>
                      <p className={`mt-2 text-xs leading-relaxed ${style.text}`}>
                        <span className="font-semibold">Your answer: </span>
                        {part.candidateResponse ?? <em className="text-ink-soft">No answer submitted</em>}
                      </p>
                      {part.status !== "correct" && part.expected && (
                        <p className="mt-1 text-xs leading-relaxed text-evergreen-950">
                          <span className="font-semibold">Expected answer: </span>
                          {part.expected}
                        </p>
                      )}
                    </div>
                  );
                })}
                {(() => {
                  const accounted = question.parts.reduce((sum, part) => sum + (part.earned ?? 0), 0);
                  const residual = Math.round((question.earned - accounted) * 100) / 100;
                  if (residual <= 0.005) return null;
                  return (
                    <p className="text-[11px] leading-relaxed text-ink-soft">
                      {residual} of the {question.max} marks on this question were awarded for the answer as a whole and are
                      included in the mark above.
                    </p>
                  );
                })()}
              </div>
            ) : question.options.length > 0 ? (
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {question.options.map((option) => {
                  const style = STATUS_STYLE[
                    option.expected && option.selected && option.correct
                      ? "correct"
                      : option.selected && !option.correct
                        ? "wrong"
                        : option.expected
                          ? "partial"
                          : "unanswered"
                  ];
                  const label = option.selected && option.correct
                    ? "Your answer · correct"
                    : option.selected
                      ? "Your answer · wrong"
                      : option.expected
                        ? "Expected answer"
                        : "";
                  return (
                    <li
                      key={option.label}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        option.selected || option.expected ? style.border : "border-evergreen-900/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-semibold ${option.selected || option.expected ? "text-evergreen-950" : "text-ink-soft"}`}>
                          {option.label}. {option.text}
                        </span>
                        {label && (
                          <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${style.text}`}>
                            {label}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : question.candidateResponse ? (
              <p className="mt-3 text-xs leading-relaxed text-ink">
                <span className="font-semibold">Your answer: </span>
                {question.candidateResponse}
              </p>
            ) : (
              <p className="mt-3 text-xs italic text-ink-soft">No answer submitted.</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
