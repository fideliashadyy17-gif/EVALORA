import type { PlanLimits } from "./entitlements";

/**
 * The five premium examination capabilities.
 *
 * One umbrella entitlement (`premium_exam_experience`) makes the commercial
 * classification easy to understand, while each capability can be switched
 * independently by the Super Admin in Plans & Limits. An absent granular value
 * inherits the umbrella, so plans created before this feature keep working;
 * only an explicit `false` removes a capability.
 */
export interface ExamExperience {
  /** Umbrella: is this organization entitled to the premium exam experience? */
  premium: boolean;
  /** Server + database refusal of a second participation under the same name. */
  duplicateProtection: boolean;
  /** Keep the paper in its authored language; no automatic browser translation. */
  languageLock: boolean;
  /** Free-moving, resizable calculator panel. */
  floatingCalculator: boolean;
  /** Automatic contextual graph/geometry/statistics/set workspaces. */
  interactiveMathTools: boolean;
  /** Compact floating formula keyboard and premium tool presentation. */
  premiumMathInterface: boolean;
}

export const EXAM_EXPERIENCE_KEYS = [
  "premium_exam_experience",
  "exam_duplicate_protection",
  "exam_language_lock",
  "floating_calculator",
  "interactive_math_tools",
  "premium_math_interface",
] as const satisfies readonly (keyof PlanLimits)[];

export const EXAM_EXPERIENCE_LABELS: Record<(typeof EXAM_EXPERIENCE_KEYS)[number], string> = {
  premium_exam_experience: "Premium examination experience (umbrella)",
  exam_duplicate_protection: "Duplicate-examination participation protection",
  exam_language_lock: "Examination language protection",
  floating_calculator: "Draggable & resizable calculator",
  interactive_math_tools: "Automatic contextual mathematical tools",
  premium_math_interface: "Premium compact mathematical interface",
};

export function examExperienceFromLimits(limits: Partial<PlanLimits> | null | undefined): ExamExperience {
  const l = limits ?? {};
  const premium = l.premium_exam_experience === true;
  return {
    premium,
    duplicateProtection: premium && l.exam_duplicate_protection !== false,
    languageLock: premium && l.exam_language_lock !== false,
    floatingCalculator: premium && l.floating_calculator !== false,
    interactiveMathTools: premium && l.interactive_math_tools !== false,
    premiumMathInterface: premium && l.premium_math_interface !== false,
  };
}

/** Conservative default used only while the client is still loading state. */
export const DEFAULT_EXAM_EXPERIENCE: ExamExperience = {
  premium: true,
  duplicateProtection: true,
  languageLock: true,
  floatingCalculator: true,
  interactiveMathTools: true,
  premiumMathInterface: true,
};
