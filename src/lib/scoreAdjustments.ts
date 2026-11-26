import { normaliseCriterionShares } from "./criterionShares";

/**
 * Controlled Examination Score Adjustment — pure calculation, eligibility,
 * capping, and preview engine.
 *
 * Strictly zero database or Next.js imports so the same deterministic logic
 * runs in server actions, API routes, MYP recalculation, and standalone tests.
 *
 * Key invariants enforced here (and mirrored in PostgreSQL):
 *  - Exclusive to organizations on an active/trialing `institution` plan.
 *  - Permitted ONLY before final result validation and publication.
 *  - Never modifies original student answers or creates bonus lines for students.
 *  - Never exceeds a criterion/category maximum OR the examination maximum.
 *  - Never permits duplicate adjustment on the same `(attemptId, categoryType, categoryKey)`.
 *  - Never automatically validates or publishes results.
 */

export type AdjustmentCategoryType = "myp_criterion" | "paper_section" | "overall";
export type AdjustmentScope = "all_eligible" | "selected";
export type AdjustmentCapReason = "criterion_max" | "exam_max" | "both_max";

export type AdjustmentRowStatus =
  | "apply"
  | "capped"
  | "already_at_maximum"
  | "already_adjusted"
  | "pending_grading"
  | "not_submitted"
  | "not_selected";

export interface AdjustmentCategory {
  categoryType: AdjustmentCategoryType;
  categoryKey: string;
  categoryLabel: string;
  maxScore: number;
  questionCount: number;
}

export interface AdjustmentPaperQuestion {
  questionId: string;
  points: number;
  criterion?: string | null;
  sectionId?: string | null;
  sectionTitle?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PriorAdjustmentItem {
  id: string;
  adjustmentId: string;
  attemptId: string;
  categoryType: AdjustmentCategoryType;
  categoryKey: string;
  pointsRequested: number;
  pointsApplied: number;
  originalCategoryScore: number;
  adjustedCategoryScore: number;
  categoryMaxScore: number;
  originalExamScore: number;
  adjustedExamScore: number;
  examMaxScore: number;
  capped: boolean;
  capReason: AdjustmentCapReason | null;
  createdAt: string;
}

export interface AdjustmentAttemptInput {
  attemptId: string;
  candidateId: string | null;
  studentId: string | null;
  candidateName: string;
  className: string | null;
  status: string;
  gradingStatus: string | null;
  pendingManualCount: number | null;
  score: number | null;
  maxScore: number | null;
  submittedAt: string | null;
  /** Map of `questionId -> points_awarded` (null if unmarked). */
  answersByQuestion: Record<string, number | null>;
}

export interface ScoreAdjustmentPreviewRow {
  attemptId: string;
  candidateId: string | null;
  studentId: string | null;
  candidateName: string;
  className: string | null;
  attemptStatus: string;
  status: AdjustmentRowStatus;
  statusLabel: string;
  applicable: boolean;
  originalCategoryScore: number;
  adjustedCategoryScore: number;
  categoryMaxScore: number;
  originalExamScore: number;
  adjustedExamScore: number;
  examMaxScore: number;
  pointsRequested: number;
  pointsApplied: number;
  pointsDroppedByCap: number;
  capped: boolean;
  capReason: AdjustmentCapReason | null;
  priorAdjustment: {
    adjustmentId: string;
    pointsApplied: number;
    createdAt: string;
  } | null;
}

export interface ScoreAdjustmentPreview {
  category: AdjustmentCategory;
  pointsRequested: number;
  scope: AdjustmentScope;
  rows: ScoreAdjustmentPreviewRow[];
  applicableRows: ScoreAdjustmentPreviewRow[];
  totalAttempts: number;
  targetedCount: number;
  applicableCount: number;
  cappedCount: number;
  atMaxSkippedCount: number;
  alreadyAdjustedCount: number;
  ineligibleCount: number;
  totalPointsToAdd: number;
  warnings: string[];
  canConfirm: boolean;
}

export interface PlanEntitlementLike {
  planSlug?: string | null;
  status?: string | null;
  limits?: { institutional?: boolean } | null;
}

export interface ExamLifecycleLike {
  status?: string | null;
  deleted_at?: string | null;
  grades_published_at?: string | null;
  settings?: Record<string, unknown> | null;
}

const SUBMITTED_STATUSES = new Set(["submitted", "auto_submitted", "marked"]);
const BLOCKED_GRADING_STATUSES = new Set([
  "awaiting_manual_grading",
  "pending_manual",
  "grading_failed",
]);

export function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Validates and normalizes positive adjustment points (> 0, <= 1000).
 * Returns null if invalid, zero, negative, NaN, or above ceiling.
 */
export function normalizeAdjustmentPoints(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(num)) return null;
  const rounded = round2(num);
  if (rounded <= 0 || rounded > 1000) return null;
  return rounded;
}

/**
 * Strictly checks whether an organization's subscription entitlement qualifies
 * for the Institution-exclusive Score Adjustment capability.
 *
 * Free, Premium, expired, canceled, or missing subscriptions always return false.
 */
export function isScoreAdjustmentPlanEligible(
  entitlement: PlanEntitlementLike | null | undefined,
): boolean {
  if (!entitlement) return false;
  const status = String(entitlement.status ?? "").toLowerCase();
  if (status !== "active" && status !== "trialing") return false;
  const slug = String(entitlement.planSlug ?? "").toLowerCase();
  return slug === "institution" || entitlement.limits?.institutional === true;
}

/**
 * Checks whether an examination is open for score adjustments.
 * Score adjustments are strictly allowed ONLY before final result validation
 * and publication, and never on deleted or archived examinations.
 */
export function isExamOpenForScoreAdjustment(
  exam: ExamLifecycleLike | null | undefined,
): { allowed: boolean; code: string | null; reason: string | null } {
  if (!exam) {
    return { allowed: false, code: "exam_not_found", reason: "Examination not found." };
  }
  if (exam.deleted_at) {
    return {
      allowed: false,
      code: "exam_deleted",
      reason: "Deleted examinations cannot receive score adjustments.",
    };
  }
  const settings = (exam.settings ?? {}) as Record<string, unknown>;
  if (settings.archived === true) {
    return {
      allowed: false,
      code: "exam_archived",
      reason: "Archived examinations cannot receive score adjustments.",
    };
  }
  if (settings.results_published === true || Boolean(exam.grades_published_at)) {
    return {
      allowed: false,
      code: "exam_already_published",
      reason: "Results are already published. Score adjustments cannot be applied after result publication.",
    };
  }
  if (settings.results_validated === true) {
    return {
      allowed: false,
      code: "exam_already_validated",
      reason: "Results are already validated. Score adjustments are strictly permitted only before final result validation.",
    };
  }
  return { allowed: true, code: null, reason: null };
}

/**
 * Extracts normalized MYP criterion letters and weights for a question.
 * Reuses `normaliseCriterionShares` so split-criterion questions allocate
 * their exact fractional maximums identically to `src/lib/myp.ts`.
 */
function questionCriterionWeights(question: AdjustmentPaperQuestion): Map<string, number> {
  const weights = new Map<string, number>();
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const splitShares = normaliseCriterionShares(meta.criterion_shares, question.points);
  if (splitShares && splitShares.length > 0) {
    for (const share of splitShares) {
      const code = share.criterion.trim().toUpperCase();
      if (!code) continue;
      weights.set(code, round2((weights.get(code) ?? 0) + share.points));
    }
    return weights;
  }

  const rawCode =
    question.criterion ??
    (typeof meta.myp_criterion === "string" ? meta.myp_criterion : null) ??
    (typeof meta.criterion === "string" ? meta.criterion : null);
  const code = rawCode?.trim().toUpperCase().replace(/^CRITERION\s+/i, "") ?? "";
  if (code) {
    weights.set(code, round2(Math.max(0, Number(question.points) || 0)));
  }
  return weights;
}

function questionSectionInfo(
  question: AdjustmentPaperQuestion,
): { id: string; title: string } | null {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const rawId =
    question.sectionId ??
    (typeof meta.section_id === "string" ? meta.section_id : null) ??
    (typeof meta.paper_section === "string" ? meta.paper_section : null) ??
    (typeof meta.section === "string" ? meta.section : null);
  const id = rawId?.trim() ?? "";
  if (!id) return null;
  const rawTitle =
    question.sectionTitle ??
    (typeof meta.section_title === "string" ? meta.section_title : null) ??
    id;
  return { id, title: rawTitle.trim() || id };
}

/**
 * Extracts all valid adjustable categories for an examination paper:
 *  1. MYP Criteria present on the paper (e.g. Criterion A, B, C, D)
 *  2. Paper Sections (if the paper defines sections)
 *  3. Overall Examination Score (always available when paper has points > 0)
 */
export function extractAdjustmentCategories(
  paper: AdjustmentPaperQuestion[],
  options?: {
    mypCriteriaTitles?: Map<string, string>;
    fallbackExamMaxScore?: number | null;
  },
): AdjustmentCategory[] {
  const criterionMap = new Map<string, { max: number; count: number }>();
  const sectionMap = new Map<string, { title: string; max: number; count: number }>();
  let totalMax = 0;

  for (const q of paper) {
    const pts = Math.max(0, Number(q.points) || 0);
    totalMax = round2(totalMax + pts);

    const critWeights = questionCriterionWeights(q);
    for (const [code, shareMax] of critWeights.entries()) {
      const existing = criterionMap.get(code) ?? { max: 0, count: 0 };
      existing.max = round2(existing.max + shareMax);
      existing.count += 1;
      criterionMap.set(code, existing);
    }

    const sec = questionSectionInfo(q);
    if (sec) {
      const existing = sectionMap.get(sec.id) ?? { title: sec.title, max: 0, count: 0 };
      existing.max = round2(existing.max + pts);
      existing.count += 1;
      sectionMap.set(sec.id, existing);
    }
  }

  const categories: AdjustmentCategory[] = [];

  const sortedCriteria = [...criterionMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [code, info] of sortedCriteria) {
    if (info.max <= 0) continue;
    const title = options?.mypCriteriaTitles?.get(code);
    categories.push({
      categoryType: "myp_criterion",
      categoryKey: code,
      categoryLabel: title ? `Criterion ${code} — ${title}` : `Criterion ${code}`,
      maxScore: info.max,
      questionCount: info.count,
    });
  }

  for (const [secId, info] of sectionMap.entries()) {
    if (info.max <= 0) continue;
    categories.push({
      categoryType: "paper_section",
      categoryKey: secId,
      categoryLabel: info.title === secId ? `Section: ${secId}` : `Section: ${info.title}`,
      maxScore: info.max,
      questionCount: info.count,
    });
  }

  const overallMax = totalMax > 0 ? totalMax : round2(Math.max(0, Number(options?.fallbackExamMaxScore ?? 0)));
  if (overallMax > 0) {
    categories.push({
      categoryType: "overall",
      categoryKey: "OVERALL",
      categoryLabel: "Overall Examination Score",
      maxScore: overallMax,
      questionCount: paper.length,
    });
  }

  return categories;
}

/**
 * Evaluates whether a single attempt is eligible to receive a score adjustment.
 * Mirrors the database eligibility predicate (handling legacy graded attempts
 * that have `score IS NOT NULL`, `pending_manual_count = 0`, and `grading_status = 'not_started'`).
 */
export function evaluateAttemptEligibility(attempt: {
  status: string;
  gradingStatus: string | null;
  pendingManualCount: number | null;
  score: number | null;
}): { eligible: true } | { eligible: false; reason: "not_submitted" | "pending_grading" } {
  if (!SUBMITTED_STATUSES.has(attempt.status)) {
    return { eligible: false, reason: "not_submitted" };
  }
  if (attempt.score === null || !Number.isFinite(Number(attempt.score))) {
    return { eligible: false, reason: "pending_grading" };
  }
  if (Number(attempt.pendingManualCount ?? 0) > 0) {
    return { eligible: false, reason: "pending_grading" };
  }
  if (attempt.gradingStatus && BLOCKED_GRADING_STATUSES.has(attempt.gradingStatus)) {
    return { eligible: false, reason: "pending_grading" };
  }
  return { eligible: true };
}

/**
 * Computes a student's current score in a specific adjustment category,
 * including raw answer marks and any prior adjustments targeting that category.
 */
export function computeCategoryScoreForAttempt(
  category: AdjustmentCategory,
  paper: AdjustmentPaperQuestion[],
  attempt: AdjustmentAttemptInput,
  priorAdjustments: PriorAdjustmentItem[],
): number {
  if (category.categoryType === "overall") {
    return round2(Math.max(0, Number(attempt.score ?? 0)));
  }

  let rawScore = 0;
  for (const q of paper) {
    const qMax = Math.max(0, Number(q.points) || 0);
    const awardedRaw = attempt.answersByQuestion[q.questionId];
    if (awardedRaw === null || awardedRaw === undefined || !Number.isFinite(Number(awardedRaw))) {
      continue;
    }
    const clampedAwarded = Math.max(0, Math.min(qMax, Number(awardedRaw)));

    if (category.categoryType === "myp_criterion") {
      const weights = questionCriterionWeights(q);
      const shareMax = weights.get(category.categoryKey);
      if (shareMax !== undefined && qMax > 0) {
        rawScore += (clampedAwarded * shareMax) / qMax;
      }
    } else if (category.categoryType === "paper_section") {
      const sec = questionSectionInfo(q);
      if (sec && sec.id === category.categoryKey) {
        rawScore += clampedAwarded;
      }
    }
  }

  const priorCategoryAdded = priorAdjustments
    .filter(
      (item) =>
        item.attemptId === attempt.attemptId &&
        item.categoryType === category.categoryType &&
        item.categoryKey === category.categoryKey,
    )
    .reduce((sum, item) => sum + Number(item.pointsApplied || 0), 0);

  return round2(Math.max(0, Math.min(category.maxScore, rawScore + priorCategoryAdded)));
}

/**
 * Builds the authoritative preview for a score adjustment operation.
 * Computes exact per-student original vs adjusted category & exam totals,
 * capping, duplicate guards, eligibility skips, and human-readable warnings.
 */
export function buildScoreAdjustmentPreview(input: {
  category: AdjustmentCategory;
  pointsRequested: number;
  scope: AdjustmentScope;
  selectedAttemptIds?: string[];
  paper: AdjustmentPaperQuestion[];
  attempts: AdjustmentAttemptInput[];
  priorAdjustments: PriorAdjustmentItem[];
}): ScoreAdjustmentPreview {
  const { category, pointsRequested, scope, paper, attempts, priorAdjustments } = input;
  const selectedSet = new Set(input.selectedAttemptIds ?? []);

  const priorByAttemptCategory = new Map<string, PriorAdjustmentItem>();
  for (const item of priorAdjustments) {
    if (item.categoryType === category.categoryType && item.categoryKey === category.categoryKey) {
      priorByAttemptCategory.set(item.attemptId, item);
    }
  }

  const rows: ScoreAdjustmentPreviewRow[] = [];
  let targetedCount = 0;
  let applicableCount = 0;
  let cappedCount = 0;
  let atMaxSkippedCount = 0;
  let alreadyAdjustedCount = 0;
  let ineligibleCount = 0;
  let totalPointsToAdd = 0;

  const sortedAttempts = [...attempts].sort((a, b) =>
    a.candidateName.localeCompare(b.candidateName, undefined, { sensitivity: "base" }),
  );

  for (const attempt of sortedAttempts) {
    const inScope = scope === "all_eligible" || selectedSet.has(attempt.attemptId);
    const examMaxScore = round2(
      Math.max(
        0,
        Number(attempt.maxScore ?? 0) > 0
          ? Number(attempt.maxScore)
          : paper.reduce((s, q) => s + Math.max(0, Number(q.points) || 0), 0),
      ),
    );
    const originalExamScore = round2(Math.max(0, Number(attempt.score ?? 0)));
    const originalCategoryScore = computeCategoryScoreForAttempt(
      category,
      paper,
      attempt,
      priorAdjustments,
    );
    const prior = priorByAttemptCategory.get(attempt.attemptId) ?? null;

    if (!inScope) {
      rows.push({
        attemptId: attempt.attemptId,
        candidateId: attempt.candidateId,
        studentId: attempt.studentId,
        candidateName: attempt.candidateName,
        className: attempt.className,
        attemptStatus: attempt.status,
        status: "not_selected",
        statusLabel: "Not selected",
        applicable: false,
        originalCategoryScore,
        adjustedCategoryScore: originalCategoryScore,
        categoryMaxScore: category.maxScore,
        originalExamScore,
        adjustedExamScore: originalExamScore,
        examMaxScore,
        pointsRequested,
        pointsApplied: 0,
        pointsDroppedByCap: 0,
        capped: false,
        capReason: null,
        priorAdjustment: prior
          ? { adjustmentId: prior.adjustmentId, pointsApplied: prior.pointsApplied, createdAt: prior.createdAt }
          : null,
      });
      continue;
    }

    targetedCount += 1;
    const elig = evaluateAttemptEligibility(attempt);
    if (!elig.eligible) {
      ineligibleCount += 1;
      rows.push({
        attemptId: attempt.attemptId,
        candidateId: attempt.candidateId,
        studentId: attempt.studentId,
        candidateName: attempt.candidateName,
        className: attempt.className,
        attemptStatus: attempt.status,
        status: elig.reason,
        statusLabel: elig.reason === "not_submitted" ? "Not submitted" : "Pending grading",
        applicable: false,
        originalCategoryScore,
        adjustedCategoryScore: originalCategoryScore,
        categoryMaxScore: category.maxScore,
        originalExamScore,
        adjustedExamScore: originalExamScore,
        examMaxScore,
        pointsRequested,
        pointsApplied: 0,
        pointsDroppedByCap: 0,
        capped: false,
        capReason: null,
        priorAdjustment: prior
          ? { adjustmentId: prior.adjustmentId, pointsApplied: prior.pointsApplied, createdAt: prior.createdAt }
          : null,
      });
      continue;
    }

    if (prior) {
      alreadyAdjustedCount += 1;
      rows.push({
        attemptId: attempt.attemptId,
        candidateId: attempt.candidateId,
        studentId: attempt.studentId,
        candidateName: attempt.candidateName,
        className: attempt.className,
        attemptStatus: attempt.status,
        status: "already_adjusted",
        statusLabel: `Already adjusted (+${prior.pointsApplied})`,
        applicable: false,
        originalCategoryScore,
        adjustedCategoryScore: originalCategoryScore,
        categoryMaxScore: category.maxScore,
        originalExamScore,
        adjustedExamScore: originalExamScore,
        examMaxScore,
        pointsRequested,
        pointsApplied: 0,
        pointsDroppedByCap: 0,
        capped: false,
        capReason: null,
        priorAdjustment: {
          adjustmentId: prior.adjustmentId,
          pointsApplied: prior.pointsApplied,
          createdAt: prior.createdAt,
        },
      });
      continue;
    }

    const categoryHeadroom = round2(Math.max(0, category.maxScore - originalCategoryScore));
    const examHeadroom = round2(Math.max(0, examMaxScore - originalExamScore));
    const effectiveHeadroom = round2(Math.min(categoryHeadroom, examHeadroom));

    if (effectiveHeadroom <= 0) {
      atMaxSkippedCount += 1;
      rows.push({
        attemptId: attempt.attemptId,
        candidateId: attempt.candidateId,
        studentId: attempt.studentId,
        candidateName: attempt.candidateName,
        className: attempt.className,
        attemptStatus: attempt.status,
        status: "already_at_maximum",
        statusLabel: "Already at maximum",
        applicable: false,
        originalCategoryScore,
        adjustedCategoryScore: originalCategoryScore,
        categoryMaxScore: category.maxScore,
        originalExamScore,
        adjustedExamScore: originalExamScore,
        examMaxScore,
        pointsRequested,
        pointsApplied: 0,
        pointsDroppedByCap: pointsRequested,
        capped: true,
        capReason:
          categoryHeadroom <= 0 && examHeadroom <= 0
            ? "both_max"
            : categoryHeadroom <= 0
              ? "criterion_max"
              : "exam_max",
        priorAdjustment: null,
      });
      continue;
    }

    const pointsApplied = round2(Math.min(pointsRequested, effectiveHeadroom));
    const capped = pointsApplied + 0.0001 < pointsRequested;
    const pointsDroppedByCap = capped ? round2(pointsRequested - pointsApplied) : 0;

    let capReason: AdjustmentCapReason | null = null;
    if (capped) {
      const hitCategory = categoryHeadroom + 0.0001 < pointsRequested;
      const hitExam = examHeadroom + 0.0001 < pointsRequested;
      if (hitCategory && hitExam && Math.abs(categoryHeadroom - examHeadroom) < 0.001) {
        capReason = "both_max";
      } else if (hitCategory && categoryHeadroom <= examHeadroom) {
        capReason = "criterion_max";
      } else {
        capReason = "exam_max";
      }
    }

    const adjustedCategoryScore = round2(
      Math.min(category.maxScore, originalCategoryScore + pointsApplied),
    );
    const adjustedExamScore = round2(
      Math.min(examMaxScore, originalExamScore + pointsApplied),
    );

    applicableCount += 1;
    if (capped) cappedCount += 1;
    totalPointsToAdd = round2(totalPointsToAdd + pointsApplied);

    rows.push({
      attemptId: attempt.attemptId,
      candidateId: attempt.candidateId,
      studentId: attempt.studentId,
      candidateName: attempt.candidateName,
      className: attempt.className,
      attemptStatus: attempt.status,
      status: capped ? "capped" : "apply",
      statusLabel: capped
        ? `Capped at maximum (+${pointsApplied} of +${pointsRequested})`
        : `Apply +${pointsApplied}`,
      applicable: true,
      originalCategoryScore,
      adjustedCategoryScore,
      categoryMaxScore: category.maxScore,
      originalExamScore,
      adjustedExamScore,
      examMaxScore,
      pointsRequested,
      pointsApplied,
      pointsDroppedByCap,
      capped,
      capReason,
      priorAdjustment: null,
    });
  }

  const warnings: string[] = [];
  if (cappedCount > 0) {
    warnings.push(
      `${cappedCount} student${cappedCount === 1 ? "" : "s"} would exceed the maximum allowed score for ${category.categoryLabel} or the examination total; their adjustment will be automatically capped at the maximum permitted score.`,
    );
  }
  if (atMaxSkippedCount > 0) {
    warnings.push(
      `${atMaxSkippedCount} student${atMaxSkippedCount === 1 ? " is" : "s are"} already at the maximum permitted score and will not receive additional points.`,
    );
  }
  if (alreadyAdjustedCount > 0) {
    warnings.push(
      `${alreadyAdjustedCount} student${alreadyAdjustedCount === 1 ? "" : "s"} already received a score adjustment for ${category.categoryLabel} and will be skipped to prevent duplicate adjustments.`,
    );
  }
  if (ineligibleCount > 0) {
    warnings.push(
      `${ineligibleCount} attempt${ineligibleCount === 1 ? " is" : "s are"} still in progress or awaiting manual grading and will not be adjusted.`,
    );
  }
  if (applicableCount === 0) {
    warnings.push(
      "No eligible students can receive points from this adjustment. Adjust the target selection, category, or points before confirming.",
    );
  }

  const applicableRows = rows.filter((r) => r.applicable);

  return {
    category,
    pointsRequested,
    scope,
    rows,
    applicableRows,
    totalAttempts: attempts.length,
    targetedCount,
    applicableCount,
    cappedCount,
    atMaxSkippedCount,
    alreadyAdjustedCount,
    ineligibleCount,
    totalPointsToAdd,
    warnings,
    canConfirm: applicableCount > 0 && totalPointsToAdd > 0,
  };
}

/**
 * Computes an attempt's effective total score after combining raw answer marks
 * with cumulative applied score adjustments, strictly clamped to `[0, maxScore]`.
 *
 * Used across every marking, moderation, and regrade recomputation path so
 * prior score adjustments are preserved and maximums are never exceeded.
 */
export function computeAdjustedAttemptScore(
  rawAnswersTotal: number,
  maxScore: number | null | undefined,
  adjustments: readonly { pointsApplied: number }[],
): number {
  const base = Math.max(0, Number(rawAnswersTotal) || 0);
  const delta = adjustments.reduce(
    (sum, item) => sum + Math.max(0, Number(item.pointsApplied) || 0),
    0,
  );
  const combined = round2(base + delta);
  const cap = Number(maxScore ?? 0);
  if (Number.isFinite(cap) && cap > 0) {
    return round2(Math.min(cap, combined));
  }
  return combined;
}
