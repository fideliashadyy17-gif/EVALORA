import type { RichDoc } from "@/lib/content";

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

/* ── MYP criterion reporting ─────────────────────────────────────────── */

export const MYP_CRITERIA = ["A", "B", "C", "D"] as const;
export type MypCriterion = (typeof MYP_CRITERIA)[number];

/**
 * Marks against one MYP criterion — for one candidate, or summed over a group
 * (a class, a school, everyone who sat the paper).
 */
export interface CriterionStats {
  /** Marks awarded on this criterion (unanswered questions count as zero). */
  marks: number;
  /** Marks available on this criterion across the whole paper. */
  max: number;
  /** marks / max as a whole percentage; null when nothing can be measured. */
  percentage: number | null;
  /** True when the paper has no question mapped to this criterion. */
  notAssessed: boolean;
  /** Answers on this criterion still waiting for a human mark (worth 0 until marked). */
  pending: number;
}

export type CriterionBreakdown = Record<MypCriterion, CriterionStats>;

/** One question of the paper, as the criterion report needs it. */
export interface CriterionQuestion {
  /** `questions.id` — the id that answers refer to. */
  question_id: string;
  /** Usually `questions.config.myp_criterion`; anything but A–D is "not mapped". */
  criterion: unknown;
  /** Marks available: the paper's own override when set, otherwise the question's. */
  points: number | string | null | undefined;
}

export interface CriterionAnswer {
  participant_id: string;
  question_id: string;
  is_correct: boolean | null;
  points_awarded: number | string | null;
}

/** Normalise a stored criterion tag ("a", " B ") to A–D, or null. */
export function parseCriterion(value: unknown): MypCriterion | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().toUpperCase();
  return (MYP_CRITERIA as readonly string[]).includes(tag) ? (tag as MypCriterion) : null;
}

/** The criterion a question is mapped to, read from its `config` JSON. */
export function criterionOfConfig(config: unknown): MypCriterion | null {
  if (!config || typeof config !== "object") return null;
  return parseCriterion((config as { myp_criterion?: unknown }).myp_criterion);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function finishCriterion(marks: number, max: number, pending: number, notAssessed: boolean): CriterionStats {
  return {
    marks: round2(marks),
    max: round2(max),
    percentage: !notAssessed && max > 0 ? Math.round((marks / max) * 100) : null,
    notAssessed,
    pending,
  };
}

/** Marks available per criterion on the paper, and which criteria it assesses at all. */
function paperByCriterion(questions: CriterionQuestion[]) {
  const paper = new Map<string, { criterion: MypCriterion; points: number }>();
  const assessed = new Set<MypCriterion>();
  for (const question of questions) {
    const criterion = parseCriterion(question.criterion);
    if (!criterion) continue;
    const points = Number(question.points ?? 0);
    paper.set(question.question_id, { criterion, points: Number.isFinite(points) && points > 0 ? points : 0 });
    assessed.add(criterion);
  }
  return { paper, assessed };
}

/**
 * Criterion breakdown for each participant — one entry per id in
 * `participantIds`, including people who answered nothing.
 *
 * The paper is the same for everyone, so a question that was left blank counts
 * as zero out of its marks rather than disappearing from the total. An answer
 * that still awaits manual marking counts as zero for now and is reported in
 * `pending`, so a provisional figure is never presented as final.
 */
export function participantCriterionStats(
  participantIds: string[],
  answers: CriterionAnswer[],
  questions: CriterionQuestion[],
): Map<string, CriterionBreakdown> {
  const { paper, assessed } = paperByCriterion(questions);
  const maxByCriterion: Record<MypCriterion, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const entry of paper.values()) maxByCriterion[entry.criterion] += entry.points;

  const running = new Map<string, Record<MypCriterion, { marks: number; pending: number; seen: Set<string> }>>();
  const blank = () => ({ marks: 0, pending: 0, seen: new Set<string>() });
  for (const id of participantIds) running.set(id, { A: blank(), B: blank(), C: blank(), D: blank() });

  for (const answer of answers) {
    const question = paper.get(answer.question_id);
    const mine = running.get(answer.participant_id);
    if (!question || !mine) continue;
    const bucket = mine[question.criterion];
    // One result per question: a duplicate row never counts twice.
    if (bucket.seen.has(answer.question_id)) continue;
    bucket.seen.add(answer.question_id);
    if (answer.is_correct === null || answer.points_awarded === null) {
      bucket.pending += 1;
      continue;
    }
    const awarded = Number(answer.points_awarded);
    bucket.marks += Number.isFinite(awarded) ? Math.max(0, Math.min(question.points, awarded)) : 0;
  }

  const result = new Map<string, CriterionBreakdown>();
  for (const [id, mine] of running) {
    result.set(id, {
      A: finishCriterion(mine.A.marks, maxByCriterion.A, mine.A.pending, !assessed.has("A")),
      B: finishCriterion(mine.B.marks, maxByCriterion.B, mine.B.pending, !assessed.has("B")),
      C: finishCriterion(mine.C.marks, maxByCriterion.C, mine.C.pending, !assessed.has("C")),
      D: finishCriterion(mine.D.marks, maxByCriterion.D, mine.D.pending, !assessed.has("D")),
    });
  }
  return result;
}

/** Add several breakdowns together (a class, a school): total marks over total available. */
export function sumCriterionStats(breakdowns: Iterable<CriterionBreakdown | undefined>, questions?: CriterionQuestion[]): CriterionBreakdown {
  const total: Record<MypCriterion, { marks: number; max: number; pending: number; assessed: boolean }> = {
    A: { marks: 0, max: 0, pending: 0, assessed: false },
    B: { marks: 0, max: 0, pending: 0, assessed: false },
    C: { marks: 0, max: 0, pending: 0, assessed: false },
    D: { marks: 0, max: 0, pending: 0, assessed: false },
  };
  // With the paper at hand, "not assessed" is decided by the paper even for an empty group.
  if (questions) for (const criterion of paperByCriterion(questions).assessed) total[criterion].assessed = true;
  for (const breakdown of breakdowns) {
    if (!breakdown) continue;
    for (const criterion of MYP_CRITERIA) {
      const part = breakdown[criterion];
      if (part.notAssessed) continue;
      total[criterion].assessed = true;
      total[criterion].marks += part.marks;
      total[criterion].max += part.max;
      total[criterion].pending += part.pending;
    }
  }
  return {
    A: finishCriterion(total.A.marks, total.A.max, total.A.pending, !total.A.assessed),
    B: finishCriterion(total.B.marks, total.B.max, total.B.pending, !total.B.assessed),
    C: finishCriterion(total.C.marks, total.C.max, total.C.pending, !total.C.assessed),
    D: finishCriterion(total.D.marks, total.D.max, total.D.pending, !total.D.assessed),
  };
}

/**
 * Aggregates MYP criterion scores (A, B, C, D) for a whole group: every
 * participant's marks over every participant's available marks.
 * Returns a map of criterion -> { marks, max, percentage, notAssessed, pending }.
 */
export function aggregateCriterionStats(
  participants: { id: string }[],
  answers: CriterionAnswer[],
  questions: CriterionQuestion[],
): CriterionBreakdown {
  const perParticipant = participantCriterionStats(participants.map((p) => p.id), answers, questions);
  return sumCriterionStats(perParticipant.values(), questions);
}

/** "12/16 (75%)", "Not assessed", with a note while answers await marking. */
export function formatCriterionStats(stats: CriterionStats | undefined, style: "full" | "marks" | "percent" = "full"): string {
  if (!stats || stats.notAssessed) return "Not assessed";
  const pending = stats.pending > 0 ? ` · ${stats.pending} awaiting marking` : "";
  if (style === "percent") return `${stats.percentage === null ? "—" : `${stats.percentage}%`}${pending}`;
  const marks = `${stats.marks}/${stats.max}`;
  if (style === "marks" || stats.percentage === null) return `${marks}${pending}`;
  return `${marks} (${stats.percentage}%)${pending}`;
}
