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

export interface CorrigePart {
  id: string;
  label: string;
  prompt: string;
  kind?: string;
  unit?: string | null;
  points?: number;
  tolerance?: number | null;
}

export interface CorrigeQuestionMeta {
  question_number?: number | null;
  question_label?: string | null;
  question_span?: number | null;
  paper_section?: string | null;
  criterion?: string | null;
  criterion_label?: string | null;
  difficulty_level?: string | null;
  paper_question_key?: number | null;
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
    saved_answer?: unknown;
    part_scores?: Record<string, unknown> | null;
    grading_note?: string | null;
  } | null;
  reveal?: {
    correct_option_ids?: string[];
    accepted_answers?: string[];
    numeric_answer?: number | null;
    tolerance?: number | null;
    correct_order?: string[];
    matching_pairs?: { left: string; right: string }[];
    summary: string[];
  } | null;
  type?: string;
  saved_answer?: unknown;
  assess_parts?: CorrigePart[] | null;
  question_meta?: CorrigeQuestionMeta | null;
  criterion?: string | null;
}

export interface CorrigeExam {
  title: string;
  candidateName: string;
  score: number | null;
  maxScore: number | null;
  passMarkPercent: number;
}

function extractAssessPartsMap(saved: unknown): Record<string, string> {
  if (!saved || typeof saved !== "object") return {};
  const rec = saved as Record<string, unknown>;
  if (rec.parts && typeof rec.parts === "object") {
    return rec.parts as Record<string, string>;
  }
  return saved as Record<string, string>;
}

function cleanModelAnswer(modelAns: string | undefined, label: string): string {
  if (!modelAns) return "See marking key";
  const cleanLbl = label.endsWith(":") ? label.slice(0, -1).trim() : label.trim();
  if (modelAns.startsWith(cleanLbl + ":")) {
    return modelAns.slice(cleanLbl.length + 1).trim();
  }
  if (modelAns.startsWith(cleanLbl + " ")) {
    return modelAns.slice(cleanLbl.length).trim();
  }
  return modelAns;
}

function extractSingleAnswerDisplay(saved: unknown): string | null {
  if (saved === null || saved === undefined) return null;
  if (typeof saved === "string") return saved.trim() || null;
  if (typeof saved === "number" || typeof saved === "boolean") return String(saved);
  if (typeof saved === "object") {
    const rec = saved as Record<string, unknown>;
    if (rec.value !== undefined && rec.value !== null) return String(rec.value).trim() || null;
    if (typeof rec.text === "string") return rec.text.trim() || null;
    if (rec.pairs && typeof rec.pairs === "object") {
      return Object.entries(rec.pairs as Record<string, string>)
        .map(([k, v]) => `${k} → ${v}`)
        .join(", ");
    }
    if (Array.isArray(rec.order)) {
      return (rec.order as string[]).join(" → ");
    }
  }
  return null;
}

/**
 * The complete marking scheme of one submitted paper, on a single page: every
 * question — answered or left blank — with the correct option or model answer
 * highlighted, the answer key line, the mark obtained and the document's own worked solution.
 * Preserves authored question numbering, sections, and criteria.
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
  const tone = blank || !question.result ? "gray" : question.result.is_correct === true ? "green" : (question.result.points_awarded ?? 0) > 0 ? "gold" : "red";

  const meta = question.question_meta;
  const section = meta?.paper_section;
  const qNum = meta?.question_number;
  const qLabel = meta?.question_label ?? (qNum !== null && qNum !== undefined ? String(qNum) : null);
  const span = meta?.question_span ?? 1;
  const criterionBadge = meta?.criterion ?? question.criterion;

  const hasOptions = Array.isArray(question.options) && question.options.length > 0;
  const hasAssessParts = Array.isArray(question.assess_parts) && question.assess_parts.length > 0;

  const savedRaw = question.saved_answer ?? question.result?.saved_answer;
  const studentDisplay = extractSingleAnswerDisplay(savedRaw);
  const officialDisplay =
    question.reveal?.numeric_answer !== undefined && question.reveal?.numeric_answer !== null
      ? `${question.reveal.numeric_answer}${question.reveal.tolerance ? ` (± ${question.reveal.tolerance})` : ""}`
      : question.reveal?.accepted_answers?.length
        ? question.reveal.accepted_answers.join(" or ")
        : question.reveal?.matching_pairs?.length
          ? question.reveal.matching_pairs.map((p) => `${p.left} → ${p.right}`).join(", ")
          : question.reveal?.correct_order?.length
            ? question.reveal.correct_order.join(" → ")
            : question.reveal?.summary?.join("; ") || "See marking scheme below";

  return (
    <li className="paper-question break-inside-avoid rounded-xl border border-evergreen-900/15 bg-white p-4 print:border-evergreen-900/30">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-evergreen-900 px-2.5 py-0.5 text-xs font-semibold text-white">
          {section ? `Part ${section} · ` : ""}{span > 1 ? "Questions " : "Question "}{qLabel ?? (index + 1)}
        </span>
        {criterionBadge && <Badge tone="gold">Criterion {criterionBadge}</Badge>}
        <Badge tone="gold">{question.points} point(s)</Badge>
        {label && <Badge tone={tone}>{label}</Badge>}
      </div>

      <div className="mt-2 text-sm text-ink">
        <RichContent doc={question.prompt_doc ?? null} text={question.prompt} />
      </div>

      {hasOptions && (
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
      )}

      {hasAssessParts && (
        <div className="mt-3 space-y-2">
          {question.assess_parts!.map((p, pIdx) => {
            const studentParts = extractAssessPartsMap(savedRaw);
            const studentVal = studentParts[p.id]?.trim();
            const hasStudentVal = Boolean(studentVal);
            const partScore = question.result?.part_scores?.[p.id] as { correct?: boolean; earned?: number; max?: number } | undefined;
            const isPartCorrect = partScore ? Boolean(partScore.correct) : question.result?.is_correct === true;
            const partPoints = partScore?.earned !== undefined ? partScore.earned : (isPartCorrect ? (p.points ?? 1) : 0);
            const maxPartPoints = partScore?.max ?? p.points ?? 1;

            const summaryLine =
              question.reveal?.summary?.find((s) => s.toLowerCase().startsWith(p.label.toLowerCase())) ??
              question.reveal?.summary?.[pIdx];
            const displayModel = cleanModelAnswer(summaryLine, p.label);

            return (
              <div key={p.id} className="rounded-lg border border-evergreen-900/15 bg-evergreen-50/30 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-evergreen-950">
                    {p.label}: <span className="font-normal text-ink">{p.prompt}</span>
                  </span>
                  <Badge tone={!hasStudentVal ? "gray" : isPartCorrect ? "green" : partPoints > 0 ? "gold" : "red"}>
                    {!hasStudentVal
                      ? `Not answered · 0 / ${maxPartPoints} pt`
                      : isPartCorrect
                        ? `Correct · ${partPoints} / ${maxPartPoints} pt`
                        : `${partPoints} / ${maxPartPoints} pt`}
                  </Badge>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="rounded border bg-white p-2.5 text-xs">
                    <span className="text-ink-soft block font-medium">Your answer:</span>
                    <span className={cn("mt-0.5 block text-sm font-semibold", hasStudentVal ? (isPartCorrect ? "text-evergreen-800" : "text-red-700") : "text-ink-soft italic")}>
                      {hasStudentVal ? studentVal : "(Left blank · 0 marks)"}
                    </span>
                  </div>
                  <div className="rounded border border-evergreen-200 bg-evergreen-50 p-2.5 text-xs">
                    <span className="text-evergreen-900 block font-medium">Model answer:</span>
                    <span className="mt-0.5 block text-sm font-semibold text-evergreen-950">
                      {displayModel}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!hasOptions && !hasAssessParts && (
        <div className="mt-3 rounded-lg border border-evergreen-900/15 bg-evergreen-50/30 p-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded border bg-white p-2.5 text-xs">
              <span className="text-ink-soft block font-medium">Your answer:</span>
              <span className={cn("mt-0.5 block text-sm font-semibold", studentDisplay ? (question.result?.is_correct ? "text-evergreen-800" : "text-red-700") : "text-ink-soft italic")}>
                {studentDisplay || "(Left blank · 0 marks)"}
              </span>
            </div>
            <div className="rounded border border-evergreen-200 bg-evergreen-50 p-2.5 text-xs">
              <span className="text-evergreen-900 block font-medium">Official answer:</span>
              <span className="mt-0.5 block text-sm font-semibold text-evergreen-950">
                {officialDisplay}
              </span>
            </div>
          </div>
        </div>
      )}

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
