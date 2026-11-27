/**
 * Unlimited Individual Grade Adjustment Ledger — pure engine.
 *
 * The original Score Adjustment studio (`src/lib/scoreAdjustments.ts`) applies
 * ONE positive batch adjustment per student per category, enforced by the
 * `unique (attempt_id, category_type, category_key)` constraint on
 * `public.exam_score_adjustment_items`. That workflow and its ledger are
 * preserved untouched.
 *
 * This module is the unlimited layer on top of it:
 *  - any number of repeated adjustments per student and per criterion;
 *  - positive AND negative deltas (`increase` / `decrease`);
 *  - a mandatory reason code + free-text reason, optional teacher comment;
 *  - the value before and after every entry, so nothing is ever silently
 *    overwritten and the whole history can be replayed;
 *  - hard clamping to `[0, categoryMax]` for the category value and to
 *    `[0, examMax]` for the effective examination score.
 *
 * The original examination score lives on `exam_attempts.score` and is never
 * rewritten by this ledger: the effective score is always
 * `clamp(original + Σ signed deltas, 0, examMax)`.
 */

import { round2 } from "./scoreAdjustments";

export type LedgerCategoryType = "myp_criterion" | "paper_section" | "overall" | "custom";

export const LEDGER_CATEGORY_TYPES: readonly LedgerCategoryType[] = [
  "myp_criterion",
  "paper_section",
  "overall",
  "custom",
];

export type AdjustmentDirection = "increase" | "decrease";

export type AdjustmentReasonCode =
  | "formative_assessment"
  | "homework"
  | "class_test"
  | "classwork"
  | "project"
  | "practical_assessment"
  | "oral_assessment"
  | "teacher_review"
  | "grading_correction"
  | "other";

export const ADJUSTMENT_REASON_CODES: readonly {
  value: AdjustmentReasonCode;
  label: string;
}[] = [
  { value: "formative_assessment", label: "Formative assessment" },
  { value: "homework", label: "Homework" },
  { value: "class_test", label: "Class test" },
  { value: "classwork", label: "Classwork" },
  { value: "project", label: "Project" },
  { value: "practical_assessment", label: "Practical assessment" },
  { value: "oral_assessment", label: "Oral assessment" },
  { value: "teacher_review", label: "Teacher review" },
  { value: "grading_correction", label: "Grading correction" },
  { value: "other", label: "Other" },
];

export const ADJUSTMENT_REASON_CODE_SET: ReadonlySet<string> = new Set(
  ADJUSTMENT_REASON_CODES.map((r) => r.value),
);

export type LedgerCapReason =
  | "category_max"
  | "category_min"
  | "exam_max"
  | "exam_min"
  | "both"
  | null;

export interface LedgerEntry {
  id: string;
  attemptId: string;
  studentId: string | null;
  candidateId: string | null;
  candidateName: string;
  categoryType: LedgerCategoryType;
  categoryKey: string;
  categoryLabel: string;
  categoryMaxScore: number;
  direction: AdjustmentDirection;
  pointsDelta: number;
  previousValue: number;
  newValue: number;
  baselineExamScore: number;
  effectiveExamScore: number;
  examMaxScore: number;
  reasonCode: AdjustmentReasonCode;
  reason: string;
  teacherComment: string | null;
  capped: boolean;
  capReason: LedgerCapReason;
  sequenceNo: number;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string;
  actorConsole: "workspace" | "super_admin";
  createdAt: string;
}

/**
 * Normalizes the magnitude of an adjustment. The sign lives in `direction`, so
 * the magnitude is always positive; zero and non-finite values are rejected.
 */
export function normalizeAdjustmentMagnitude(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(num)) return null;
  const rounded = round2(Math.abs(num));
  if (rounded <= 0 || rounded > 1000) return null;
  return rounded;
}

export function normalizeDirection(raw: unknown): AdjustmentDirection {
  return String(raw ?? "").toLowerCase() === "decrease" ? "decrease" : "increase";
}

export function normalizeReasonCode(raw: unknown): AdjustmentReasonCode | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return ADJUSTMENT_REASON_CODE_SET.has(value) ? (value as AdjustmentReasonCode) : null;
}

export interface PlanAdjustmentInput {
  categoryType: LedgerCategoryType;
  categoryMaxScore: number;
  /** Current value of the category (or of the overall score for `overall`). */
  currentCategoryValue: number;
  /** The ORIGINAL examination score, exactly as stored on the attempt. */
  baselineExamScore: number;
  /** Effective exam score after every previously recorded ledger entry. */
  currentEffectiveExamScore: number;
  examMaxScore: number;
  direction: AdjustmentDirection;
  pointsDelta: number;
}

export interface PlannedAdjustment {
  previousValue: number;
  newValue: number;
  appliedDelta: number;
  requestedDelta: number;
  effectiveExamScore: number;
  capped: boolean;
  capReason: LedgerCapReason;
  blocked: boolean;
  blockedReason: string | null;
}

/**
 * Computes exactly what one ledger entry would record, without touching any
 * data. The API route returns this as the preview and the writer stores it
 * verbatim, so the preview and the audit record can never diverge.
 */
export function planAdjustment(input: PlanAdjustmentInput): PlannedAdjustment {
  const categoryMax = round2(Math.max(0, Number(input.categoryMaxScore) || 0));
  const examMax = round2(Math.max(0, Number(input.examMaxScore) || 0));
  const currentCategory = round2(
    Math.min(Math.max(Number(input.currentCategoryValue) || 0, 0), categoryMax || Number.MAX_SAFE_INTEGER),
  );
  // `input.baselineExamScore` (the untouched original) is carried by the caller
  // into the ledger row it writes; the plan itself works from the effective
  // score, which is the value the next entry must build on.
  const currentEffective = round2(
    Math.min(Math.max(Number(input.currentEffectiveExamScore) || 0, 0), examMax || Number.MAX_SAFE_INTEGER),
  );
  const requested = round2(Math.abs(Number(input.pointsDelta) || 0));
  const sign = input.direction === "decrease" ? -1 : 1;

  // Headroom in the category and in the examination total, in the direction of
  // travel. Both are hard limits: a mark can never leave its permitted scale.
  const categoryHeadroom =
    sign > 0 ? round2(categoryMax - currentCategory) : round2(currentCategory);
  const examHeadroom =
    input.categoryType === "overall"
      ? sign > 0
        ? round2(examMax - currentEffective)
        : round2(currentEffective)
      : sign > 0
        ? round2(examMax - currentEffective)
        : Number.MAX_SAFE_INTEGER;

  const limit = round2(Math.min(categoryHeadroom, examHeadroom));
  const applied = round2(Math.max(0, Math.min(requested, Math.max(0, limit))));

  let capReason: LedgerCapReason = null;
  if (applied + 0.0001 < requested) {
    const hitCategory = categoryHeadroom + 0.0001 < requested;
    const hitExam = examHeadroom + 0.0001 < requested;
    if (input.categoryType === "overall") {
      // For an overall adjustment the "category" IS the examination total, so
      // reporting both would say the same thing twice.
      capReason = sign > 0 ? "exam_max" : "exam_min";
    } else {
      capReason = hitCategory && hitExam ? "both" : hitCategory
        ? sign > 0
          ? "category_max"
          : "category_min"
        : sign > 0
          ? "exam_max"
          : "exam_min";
    }
  }

  const newValue = round2(Math.min(categoryMax, Math.max(0, currentCategory + sign * applied)));
  const effectiveExamScore =
    input.categoryType === "overall"
      ? round2(Math.min(examMax, Math.max(0, currentEffective + sign * applied)))
      : currentEffective;

  const blocked = applied <= 0;
  const blockedReason = blocked
    ? sign > 0
      ? "This value is already at the maximum permitted score, so no further increase is possible."
      : "This value is already at zero, so no further reduction is possible."
    : null;

  return {
    previousValue: currentCategory,
    newValue,
    appliedDelta: applied,
    requestedDelta: requested,
    effectiveExamScore,
    capped: capReason !== null,
    capReason,
    blocked,
    blockedReason,
  };
}

/**
 * Folds every ledger entry for one attempt into an effective examination score.
 * `baselineExamScore` is the preserved original; the result is always clamped to
 * `[0, examMax]`.
 */
export function foldLedgerEntries(
  baselineExamScore: number,
  examMaxScore: number | null | undefined,
  entries: readonly { categoryType: string; direction: string; pointsDelta: number }[],
): number {
  const base = round2(Math.max(0, Number(baselineExamScore) || 0));
  const delta = (entries ?? []).reduce((sum, entry) => {
    if (entry.categoryType !== "overall") return sum;
    const magnitude = Math.max(0, Number(entry.pointsDelta) || 0);
    return sum + (String(entry.direction) === "decrease" ? -magnitude : magnitude);
  }, 0);
  const combined = round2(base + delta);
  const cap = Number(examMaxScore ?? 0);
  if (Number.isFinite(cap) && cap > 0) {
    return round2(Math.min(cap, Math.max(0, combined)));
  }
  return round2(Math.max(0, combined));
}

/** Signed delta of a single criterion across the whole ledger. */
export function criterionLedgerDelta(
  entries: readonly {
    categoryType: string;
    categoryKey: string;
    direction: string;
    pointsDelta: number;
  }[],
  criterionCode: string,
): number {
  const code = criterionCode.trim().toUpperCase();
  return round2(
    (entries ?? []).reduce((sum, entry) => {
      if (entry.categoryType !== "myp_criterion") return sum;
      if (String(entry.categoryKey).trim().toUpperCase() !== code) return sum;
      const magnitude = Math.max(0, Number(entry.pointsDelta) || 0);
      return sum + (String(entry.direction) === "decrease" ? -magnitude : magnitude);
    }, 0),
  );
}

export interface LedgerHistoryGroup {
  categoryType: LedgerCategoryType;
  categoryKey: string;
  categoryLabel: string;
  categoryMaxScore: number;
  entryCount: number;
  netDelta: number;
  currentValue: number;
  entries: LedgerEntry[];
}

/**
 * Groups the unlimited ledger into an ordered history per category, with the
 * net delta and the resulting value. This is what the adjustment UI and the
 * candidate paper's authorized summary render.
 */
export function groupLedgerHistory(entries: readonly LedgerEntry[]): LedgerHistoryGroup[] {
  const groups = new Map<string, LedgerHistoryGroup>();
  const ordered = [...entries].sort((a, b) => {
    if (a.sequenceNo !== b.sequenceNo) return a.sequenceNo - b.sequenceNo;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });

  for (const entry of ordered) {
    const key = `${entry.categoryType}:${entry.categoryKey}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        categoryType: entry.categoryType,
        categoryKey: entry.categoryKey,
        categoryLabel: entry.categoryLabel,
        categoryMaxScore: entry.categoryMaxScore,
        entryCount: 0,
        netDelta: 0,
        currentValue: 0,
        entries: [],
      };
      groups.set(key, group);
    }
    group.entryCount += 1;
    group.netDelta = round2(
      group.netDelta + (entry.direction === "decrease" ? -entry.pointsDelta : entry.pointsDelta),
    );
    group.currentValue = entry.newValue;
    group.categoryMaxScore = entry.categoryMaxScore;
    group.entries.push(entry);
  }

  return [...groups.values()].sort((a, b) =>
    a.categoryLabel.localeCompare(b.categoryLabel, undefined, { sensitivity: "base" }),
  );
}

/** Total number of ledger entries — there is deliberately no ceiling. */
export function ledgerEntryCount(entries: readonly LedgerEntry[]): number {
  return entries.length;
}
