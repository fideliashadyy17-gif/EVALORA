"use client";

import { RichContent } from "@/components/RichContent";
import { Badge, Button, Card } from "@/components/ui";
import type { RichDoc } from "@/lib/content";
import { answerKeyLine, optionMarkings, resultLabel } from "@/lib/examResults";
import { cn } from "@/lib/utils";

export interface CorrigeOption {
  id: string;
  label: string;
  content_doc?: RichDoc | null;
}

export interface CorrigeQuestion {
  question_id: string;
  prompt: string;
  prompt_doc?: RichDoc | null;
  points: number;
  options: CorrigeOption[];
  result: {
    is_correct: boolean | null;
    points_awarded: number | null;
    answered?: boolean;
    selected_option_ids?: string[];
    correct_option_ids?: string[];
    explanation: string | null;
    explanation_doc?: RichDoc | null;
  } | null;
  reveal?: { correct_option_ids: string[]; summary: string[] } | null;
}

export interface CorrigeExam {
  title: string;
  candidateName: string;
  score: number | null;
  maxScore: number | null;
  passMarkPercent: number;
}

/**
 * The complete marking scheme of one submitted paper, on a single page: every
 * question — answered or left blank — with the correct option highlighted, the
 * answer key line, the mark obtained and the document's own worked solution.
 * Nothing here is recomputed: the rules live in src/lib/examResults.ts, so this
 * page and the per-question panel can never disagree.
 */
export function ExamCorrige({
  exam,
  questions,
  onBack,
}: {
  exam: CorrigeExam;
  questions: CorrigeQuestion[];
  onBack: () => void;
}) {
  const answered = questions.filter((q) => q.result && q.result.answered !== false).length;
  const correct = questions.filter((q) => q.result?.is_correct === true).length;
  const pct = exam.score !== null && exam.maxScore ? (exam.score / exam.maxScore) * 100 : null;

  return (
    <Card className="paper-print p-5 sm:p-7 print:border-0 print:p-0 print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Corrigé complet</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-evergreen-950">{exam.title}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {exam.candidateName} · {questions.length} questions · every question is marked, including the ones left blank
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onBack}>← Back to the questions</Button>
          <Button onClick={() => window.print()}>Print / PDF</Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-evergreen-50 px-4 py-3 text-sm text-evergreen-950 print:mt-0 print:bg-transparent print:px-0">
        {exam.score !== null && exam.maxScore !== null && (
          <strong className="font-display text-lg">{`${exam.score} / ${exam.maxScore}`}</strong>
        )}
        {pct !== null && (
          <Badge tone={pct >= exam.passMarkPercent ? "green" : "red"}>
            {`${pct.toFixed(1)}% · pass mark ${exam.passMarkPercent}%`}
          </Badge>
        )}
        <span className="text-ink-soft">
          {`${correct} correct · ${answered} answered · ${questions.length - answered} left blank (0 marks)`}
        </span>
      </div>

      <ol className="mt-5 space-y-4">
        {questions.map((question, index) => (
          <CorrigeItem key={question.question_id} question={question} index={index} />
        ))}
      </ol>
    </Card>
  );
}

function CorrigeItem({ question, index }: { question: CorrigeQuestion; index: number }) {
  const markings = optionMarkings(question.result ?? null);
  const keyLine = answerKeyLine(question.reveal?.summary);
  const label = question.result ? resultLabel(question.result, question.points) : null;
  const blank = question.result?.answered === false;
  const tone = blank || !question.result ? "gray" : question.result.is_correct === true ? "green" : question.result.is_correct === false ? "red" : "amber";

  return (
    <li className="paper-question break-inside-avoid rounded-xl border border-evergreen-900/15 bg-white p-4 print:border-evergreen-900/30">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-evergreen-900 px-2.5 py-0.5 text-xs font-semibold text-white">Question {index + 1}</span>
        <Badge tone="gold">{question.points} point(s)</Badge>
        {label && <Badge tone={tone}>{label}</Badge>}
      </div>

      <div className="mt-2 text-sm text-ink">
        <RichContent doc={question.prompt_doc ?? null} text={question.prompt} />
      </div>

      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {question.options.map((option, i) => {
          const mark = markings[option.id];
          return (
            <li
              key={option.id}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                mark === "correct" && "border-evergreen-600 bg-evergreen-50 text-evergreen-950",
                mark === "wrong" && "border-red-400 bg-red-50 text-red-900",
                !mark && "border-evergreen-900/15 bg-white text-ink",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  mark === "correct" ? "bg-evergreen-700 text-white" : mark === "wrong" ? "bg-red-600 text-white" : "bg-gold-400 text-evergreen-950",
                )}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="min-w-0 flex-1"><RichContent doc={option.content_doc ?? null} text={option.label} /></span>
              {mark === "correct" && <span aria-label="Correct answer" className="shrink-0 font-bold text-evergreen-700">✓</span>}
              {mark === "wrong" && <span aria-label="Your answer, incorrect" className="shrink-0 font-bold text-red-600">✗</span>}
            </li>
          );
        })}
      </ul>

      {keyLine && <p className="mt-2 text-sm font-semibold text-evergreen-900">{keyLine}</p>}

      {(question.result?.explanation || question.result?.explanation_doc) ? (
        <div className="mt-2 rounded-lg bg-cream px-3 py-2 text-sm text-ink print:bg-transparent print:px-0">
          <RichContent doc={question.result.explanation_doc ?? null} text={question.result.explanation ?? ""} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">This question carries no written solution in the paper.</p>
      )}
    </li>
  );
}
