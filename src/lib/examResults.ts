import type { RichDoc } from "./content";

/**
 * Post-submission result of one examination question.
 *
 * A published examination must be able to show a complete marking scheme, so a
 * result exists for EVERY question of the paper once the attempt is submitted
 * and results are published — including the questions the candidate left blank.
 * An unanswered question is not an error: it is simply worth zero marks, and its
 * worked solution is still shown.
 */
export interface ExamQuestionResult {
  is_correct: boolean | null;
  points_awarded: number | null;
  /** False when the candidate left the question blank. */
  answered: boolean;
  /** Option ids the candidate picked (empty when blank). */
  selected_option_ids: string[];
  /** Option ids that were correct, so the screen can mark the right answer. */
  correct_option_ids: string[];
  explanation: string | null;
  explanation_doc: RichDoc | null;
}

export type OptionMark = "correct" | "wrong";

type SavedAnswer = {
  is_correct: boolean | null;
  points_awarded: number | string | null;
  answer?: unknown;
} | null | undefined;

/** Option ids carried by a saved answer, for both single and multi choice. */
export function selectedOptionIds(answer: unknown): string[] {
  if (!answer || typeof answer !== "object") return [];
  const payload = answer as { option_id?: unknown; option_ids?: unknown };
  if (Array.isArray(payload.option_ids)) {
    return payload.option_ids.filter((id): id is string => typeof id === "string");
  }
  return typeof payload.option_id === "string" ? [payload.option_id] : [];
}

/**
 * Build the published result of one question. Called only after submission and
 * publication — the caller decides that, never this function.
 */
export function buildExamResult(args: {
  saved: SavedAnswer;
  correctOptionIds: string[];
  explanation?: string | null;
  explanationDoc?: RichDoc | null;
}): ExamQuestionResult {
  const { saved, correctOptionIds, explanation, explanationDoc } = args;
  const answered = Boolean(saved);
  const awarded = saved?.points_awarded;
  return {
    is_correct: saved ? (saved.is_correct ?? null) : false,
    points_awarded: saved ? (awarded === null || awarded === undefined ? null : Number(awarded)) : 0,
    answered,
    selected_option_ids: selectedOptionIds(saved?.answer),
    correct_option_ids: correctOptionIds,
    explanation: explanation ?? null,
    explanation_doc: explanationDoc ?? null,
  };
}

/**
 * How each option should be marked on screen: the correct ones green, and any
 * option the candidate picked that is not correct red. Options they never chose
 * are left alone, so a blank question simply shows the right answer.
 */
export type MarkSource = {
  correct_option_ids?: string[] | null;
  selected_option_ids?: string[] | null;
};

export function optionMarkings(result: MarkSource | null | undefined): Record<string, OptionMark> {
  if (!result) return {};
  const marks: Record<string, OptionMark> = {};
  for (const id of result.correct_option_ids ?? []) marks[id] = "correct";
  for (const id of result.selected_option_ids ?? []) {
    if (!marks[id]) marks[id] = "wrong";
  }
  return marks;
}

function points(n: number): string {
  return `${n} ${n === 1 ? "point" : "points"}`;
}

export type LabelSource = {
  is_correct: boolean | null;
  points_awarded?: number | null;
  answered?: boolean;
};

/** Headline for the result panel. Never says "Incorrect" for a blank answer. */
export function resultLabel(result: LabelSource, maxPoints: number): string {
  if (result.is_correct === null) return "Awaiting manual marking by your examiner.";
  const total = Number.isFinite(maxPoints) ? maxPoints : 0;
  if (result.answered === false) return `Not answered · 0 / ${points(total)}`;
  return `${result.is_correct ? "Correct" : "Incorrect"} · ${result.points_awarded ?? 0} / ${points(total)}`;
}

/** The answer key line shown under the result, e.g. "Correct answer: B". */
export function answerKeyLine(summary: string[] | null | undefined): string | null {
  const keys = (summary ?? []).filter((entry) => typeof entry === "string" && entry.trim().length > 0);
  if (!keys.length) return null;
  return `Correct answer: ${keys.join(", ")}`;
}
