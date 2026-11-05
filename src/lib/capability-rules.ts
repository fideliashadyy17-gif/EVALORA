import type { PlanLimits } from "./entitlements";

/**
 * Pure authorization rules shared by server components, server actions and
 * tests. There is exactly one entitlement source: `getEntitlementFor()`.
 * Owner privilege is a separate authorization context from a customer plan;
 * an Institutional organization never gains the owner's unrestricted access.
 */
export type FeatureKey = "live_quizzes" | "examinations" | "proctoring";
export type FeatureFlags = Record<FeatureKey, boolean>;

export type CapabilityKey =
  | "class_management"
  | "student_management"
  | "question_bank"
  | "quiz_management"
  | "examinations"
  | "live_competitions"
  | "proctoring"
  | "reports_analytics"
  | "imports_exports"
  | "institutional_administration"
  | "configurable_limits"
  | "central_asset_management"
  | "multi_class_operations"
  | "future_modules"
  | "unrestricted_owner_access";

export type CapabilitySet = Record<CapabilityKey, boolean>;

export const CAPABILITY_KEYS: CapabilityKey[] = [
  "class_management",
  "student_management",
  "question_bank",
  "quiz_management",
  "examinations",
  "live_competitions",
  "proctoring",
  "reports_analytics",
  "imports_exports",
  "institutional_administration",
  "configurable_limits",
  "central_asset_management",
  "multi_class_operations",
  "future_modules",
  "unrestricted_owner_access",
];

export interface CapabilityInput {
  isSuperAdmin: boolean;
  planSlug: string;
  limits: PlanLimits;
  featureFlags: FeatureFlags;
}

export function resolveCapabilities(input: CapabilityInput): CapabilitySet {
  const owner = input.isSuperAdmin;
  const institutional = input.planSlug === "institution" || input.limits.institutional === true;
  const flags = input.featureFlags;
  const limits = input.limits;

  // The verified platform owner is unrestricted across every current and
  // future operational module, including globally disabled customer features.
  // Ordinary customers always remain subject to their plan and feature flags.
  if (owner) {
    return Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, true])) as CapabilitySet;
  }

  const live = flags.live_quizzes !== false;
  const examinations = flags.examinations !== false && limits.max_exams !== 0;
  const proctoring = flags.proctoring !== false && limits.proctoring === true;
  const reports = limits.advanced_reports === true;
  const institutionalAdmin = institutional;

  return {
    class_management: true,
    student_management: true,
    question_bank: live,
    quiz_management: live,
    examinations,
    live_competitions: live,
    proctoring,
    reports_analytics: reports,
    imports_exports: institutional || reports,
    institutional_administration: institutionalAdmin,
    configurable_limits: institutional || limits.configurable_limits === true,
    central_asset_management: institutional || limits.central_asset_management === true,
    multi_class_operations: institutional || limits.multi_class_operations === true,
    future_modules: false,
    unrestricted_owner_access: false,
  };
}

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  class_management: "Class Management",
  student_management: "Student Management",
  question_bank: "Question Bank",
  quiz_management: "Quiz Management",
  examinations: "Examination Management",
  live_competitions: "Live Competitions",
  proctoring: "Proctoring",
  reports_analytics: "Reports & Analytics",
  imports_exports: "Imports / Exports",
  institutional_administration: "Institutional Administration",
  configurable_limits: "Configurable Limits / Quotas",
  central_asset_management: "Centralized Resource Management",
  multi_class_operations: "Multi-class / Multi-user Operations",
  future_modules: "Future Modules",
  unrestricted_owner_access: "Unrestricted Platform Owner Access",
};
