/**
 * Assessment & marking configuration — the resolved values the marking and
 * results modules use.
 *
 * Audit finding 3.1: `platform_settings.exam_pass_threshold` was editable in
 * the Super Admin console and read by nothing at all; the platform used
 * `DEFAULT_PASS_PERCENT = 50` hardcoded in src/lib/examFeedback.ts. This module
 * is the repair — `assessment.default_pass_percent` is now the single source,
 * resolved with organization override, and `examFeedback` consumes it.
 *
 * Every value here is a DEFAULT for new work. Nothing reads this module to
 * rewrite a stored mark, a published result or an existing examination, which
 * is what keeps the no-regression rules satisfied.
 */
import "server-only";
import { getAssessmentConfig, getExaminationDefaults } from "./config/service";
import { applyRounding } from "./formatting";

export interface ResolvedAssessmentConfig {
  /** Percentage of total marks that counts as a pass. */
  defaultPassPercent: number;
  negativeMarkingEnabled: boolean;
  negativeMarkingPenalty: number;
  numericTolerancePercent: number;
  roundingRule: string;
  resultLinkDefaultDays: number;
  /** Locked true; publication always stays an explicit authorized action. */
  requireValidationBeforePublication: boolean;
}

/** Fallbacks identical to the previously hardcoded values. */
export const ASSESSMENT_FALLBACKS: ResolvedAssessmentConfig = {
  defaultPassPercent: 50,
  negativeMarkingEnabled: false,
  negativeMarkingPenalty: 0.25,
  numericTolerancePercent: 0,
  roundingRule: "half_up_1",
  resultLinkDefaultDays: 30,
  requireValidationBeforePublication: true,
};

function pct(value: unknown, fallback: number, min = 0, max = 100): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Resolve the assessment configuration for one scope. */
export async function resolveAssessmentConfig(
  organizationId?: string | null,
): Promise<ResolvedAssessmentConfig> {
  try {
    const cfg = await getAssessmentConfig(organizationId);
    return {
      defaultPassPercent: pct(cfg.default_pass_percent, ASSESSMENT_FALLBACKS.defaultPassPercent),
      negativeMarkingEnabled: cfg.negative_marking_enabled === true,
      negativeMarkingPenalty: pct(cfg.negative_marking_penalty, ASSESSMENT_FALLBACKS.negativeMarkingPenalty, 0, 1),
      numericTolerancePercent: pct(cfg.numeric_tolerance_percent, ASSESSMENT_FALLBACKS.numericTolerancePercent, 0, 10),
      roundingRule: typeof cfg.rounding_rule === "string" ? cfg.rounding_rule : ASSESSMENT_FALLBACKS.roundingRule,
      resultLinkDefaultDays: pct(cfg.result_link_default_days, ASSESSMENT_FALLBACKS.resultLinkDefaultDays, 1, 730),
      // Publication safety is not configurable away: even a stored `false`
      // resolves to true, because results must never publish implicitly.
      requireValidationBeforePublication: cfg.require_validation_before_publication !== false,
    };
  } catch {
    return { ...ASSESSMENT_FALLBACKS };
  }
}

/**
 * Round a computed mark with the configured rule. Used for presentation and
 * grade conversion only — raw stored marks are never rewritten.
 */
export function roundMark(value: number, cfg: Pick<ResolvedAssessmentConfig, "roundingRule">): number {
  return applyRounding(value, cfg.roundingRule);
}

/**
 * Decide pass/fail from a percentage using the configured threshold.
 * Mirrors the semantics src/lib/examFeedback.ts already had, with the
 * threshold now resolved instead of hardcoded.
 */
export function isPassing(percent: number, cfg: Pick<ResolvedAssessmentConfig, "defaultPassPercent">): boolean {
  const n = Number(percent);
  if (!Number.isFinite(n)) return false;
  return n >= cfg.defaultPassPercent;
}

/** Marks deducted for a wrong answer under the configured negative marking. */
export function negativeMarkingDeduction(questionMarks: number, cfg: ResolvedAssessmentConfig): number {
  if (!cfg.negativeMarkingEnabled) return 0;
  const marks = Number(questionMarks);
  if (!Number.isFinite(marks) || marks <= 0) return 0;
  return roundMark(marks * cfg.negativeMarkingPenalty, cfg);
}

/** Accepted deviation for a numerical answer with no explicit tolerance. */
export function numericTolerance(expected: number, cfg: ResolvedAssessmentConfig): number {
  const n = Number(expected);
  if (!Number.isFinite(n)) return 0;
  return (Math.abs(n) * cfg.numericTolerancePercent) / 100;
}

export interface ResolvedExamDefaults {
  durationMinutes: number;
  showMarks: boolean;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  allowBackwardNavigation: boolean;
  accessCodeRequired: boolean;
  instructions: string;
}

export const EXAM_DEFAULT_FALLBACKS: ResolvedExamDefaults = {
  durationMinutes: 90,
  showMarks: true,
  randomizeQuestions: false,
  randomizeOptions: false,
  allowBackwardNavigation: true,
  accessCodeRequired: true,
  instructions: "",
};

/**
 * Defaults pre-filled when a NEW examination or paper is created. An existing
 * examination is never modified by a change here — its own stored values win.
 */
export async function resolveExamDefaults(organizationId?: string | null): Promise<ResolvedExamDefaults> {
  try {
    const cfg = await getExaminationDefaults(organizationId);
    return {
      durationMinutes: pct(cfg.default_duration_minutes, EXAM_DEFAULT_FALLBACKS.durationMinutes, 5, 600),
      showMarks: cfg.default_show_marks !== false,
      randomizeQuestions: cfg.default_randomize_questions === true,
      randomizeOptions: cfg.default_randomize_options === true,
      allowBackwardNavigation: cfg.default_allow_backward_navigation !== false,
      accessCodeRequired: cfg.default_access_code_required !== false,
      instructions: typeof cfg.default_instructions === "string" ? cfg.default_instructions : "",
    };
  } catch {
    return { ...EXAM_DEFAULT_FALLBACKS };
  }
}
