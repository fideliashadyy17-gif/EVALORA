import type { RichDoc } from "./content";

/* ─────────────────────────────────────────────────────────────────────────
 * MYP criterion aggregation
 *
 * An MYP mathematics paper is marked against four criteria, and the letter
 * alone is not enough for a student or a parent to read: "Criterion C" has to
 * say "Communicating". That mapping, the level band derived from a percentage
 * and the aggregation of marks per criterion used to live inline in the exam
 * runner, duplicated in two places — which is how a label drifts out of step
 * with the paper it describes.
 *
 * Everything here is pure and takes plain structures, so the candidate's
 * result screen, a teacher report and a printed export read the same numbers.
 *
 * The level band is INDICATIVE: it is derived from the marks on one paper, not
 * from an eAssessment moderation, and every surface that shows it says so.
 * ───────────────────────────────────────────────────────────────────────── */

/** The four MYP mathematics criteria, in the order they are reported. */
export const MYP_CRITERIA = ["A", "B", "C", "D"] as const;

export type MypCriterion = (typeof MYP_CRITERIA)[number];

/**
 * The official MYP mathematics criterion names. A criterion letter outside
 * A–D is still reported (a school may map its own strands) but gets no
 * invented title.
 */
export const MYP_CRITERION_TITLES: Record<string, string> = {
  A: "Knowing and understanding",
  B: "Investigating patterns",
  C: "Communicating",
  D: "Applying mathematics in real-life contexts",
};

export type CriterionBand = "Strong" | "Developing" | "Needs work";

export function isMypCriterion(value: unknown): value is MypCriterion {
  return typeof value === "string" && (MYP_CRITERIA as readonly string[]).includes(value.toUpperCase());
}

/** Canonical criterion key: trimmed and upper-cased, so "a" and " A " match "A". */
export function normalizeCriterion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toUpperCase();
  return key.length ? key : null;
}

/** The official name of a criterion, or null when there is no such mapping. */
export function criterionTitle(criterion: string | null | undefined): string | null {
  const key = normalizeCriterion(criterion);
  if (!key) return null;
  return MYP_CRITERION_TITLES[key] ?? null;
}

/** "Criterion A" — the short form printed beside a question number. */
export function criterionLabel(criterion: string | null | undefined): string | null {
  const key = normalizeCriterion(criterion);
  return key ? `Criterion ${key}` : null;
}

/** "Criterion A — Knowing and understanding" — the full heading for a report. */
export function criterionHeading(criterion: string | null | undefined): string | null {
  const key = normalizeCriterion(criterion);
  if (!key) return null;
  const title = criterionTitle(key);
  return title ? `Criterion ${key} — ${title}` : `Criterion ${key}`;
}

/**
 * Indicative MYP level band for a percentage of a criterion's marks.
 *
 * The bands are deliberately wide — a 1–8 scale compressed into four rows —
 * because one paper is evidence, not a moderated judgement.
 */
export function criterionLevelBand(percent: number): string {
  if (!Number.isFinite(percent)) return "1–2";
  if (percent >= 85) return "7–8";
  if (percent >= 65) return "5–6";
  if (percent >= 40) return "3–4";
  return "1–2";
}

/** How to read a criterion percentage at a glance. */
export function criterionBand(percent: number): CriterionBand {
  if (!Number.isFinite(percent)) return "Needs work";
  if (percent >= 70) return "Strong";
  if (percent >= 40) return "Developing";
  return "Needs work";
}

/** One criterion's share of a marked paper. */
export interface CriterionAggregateRow {
  criterion: string | null;
  points: number;
  awarded: number;
}

export interface CriterionAggregate {
  /** Canonical (trimmed, upper-cased) criterion key. */
  criterion: string;
  /** "Criterion A". */
  label: string | null;
  /** The official MYP name, or null when the letter has no mapping. */
  title: string | null;
  awarded: number;
  max: number;
  percent: number;
  band: CriterionBand;
  /** Indicative MYP level band, e.g. "5–6". */
  level: string;
}

const criterionRank = (key: string): [number, string] => {
  const index = (MYP_CRITERIA as readonly string[]).indexOf(key);
  return [index === -1 ? MYP_CRITERIA.length : index, key];
};

/**
 * The criteria present on a paper, in reporting order (A, B, C, D, then any
 * other letters alphabetically), with no scores attached.
 */
export function criteriaOnPaper(rows: { criterion?: string | null }[]): string[] {
  const keys = new Set<string>();
  for (const row of rows ?? []) {
    const key = normalizeCriterion(row.criterion);
    if (key) keys.add(key);
  }
  return [...keys].sort((a, b) => {
    const [ra, ka] = criterionRank(a);
    const [rb, kb] = criterionRank(b);
    return ra - rb || ka.localeCompare(kb);
  });
}

/**
 * Aggregate marks per criterion.
 *
 * Rows with no criterion are ignored — a paper need not be criterion-mapped.
 * Criteria are returned in MYP order first, then any other letters
 * alphabetically, so a report always reads in the same order as the paper.
 *
 * A mark can never exceed the question's worth and never be negative, so an
 * over-awarded or corrupt value is clamped rather than trusted.
 */
export function aggregateCriteria(rows: CriterionAggregateRow[]): CriterionAggregate[] {
  const totals = new Map<string, { awarded: number; max: number }>();
  for (const row of rows ?? []) {
    const key = normalizeCriterion(row.criterion);
    if (!key) continue;
    const points = Number(row.points);
    const safePoints = Number.isFinite(points) ? points : 0;
    const awarded = Number(row.awarded);
    const entry = totals.get(key) ?? { awarded: 0, max: 0 };
    entry.max += safePoints;
    entry.awarded += Number.isFinite(awarded)
      ? Math.max(0, Math.min(safePoints, awarded))
      : 0;
    totals.set(key, entry);
  }

  return [...totals.entries()]
    .sort((a, b) => {
      const [ra, ka] = criterionRank(a[0]);
      const [rb, kb] = criterionRank(b[0]);
      return ra - rb || ka.localeCompare(kb);
    })
    .map(([criterion, value]) => {
      const max = Math.round(value.max * 100) / 100;
      const awarded = Math.round(value.awarded * 100) / 100;
      const percent = max > 0 ? Math.round((awarded / max) * 1000) / 10 : 0;
      return {
        criterion,
        label: criterionLabel(criterion),
        title: criterionTitle(criterion),
        awarded,
        max,
        percent,
        band: criterionBand(percent),
        level: criterionLevelBand(percent),
      };
    });
}

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
  if (result.is_correct === null) return "Awaiting review by your examiner.";
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
