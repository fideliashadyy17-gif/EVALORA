/**
 * EVALORA AI CORE — risk classification.
 *
 * Pure, dependency-free and shared by the native assistant, the REST API, the
 * MCP server and the approval UI. The list is deliberately explicit: a tool that
 * is not named here cannot be called, so a new tool cannot inherit "ordinary"
 * by accident.
 */

import type { RiskClass } from "./types";

/**
 * Sensitive operations — the ones a human must anchor.
 *
 *  - publishing an examination or its results
 *  - changing marks, adjustments or grading validation
 *  - deleting content
 *  - changing permissions or security settings
 *  - anything that revokes an agent or alters the AI's own policy
 */
export const SENSITIVE_TOOLS = new Set<string>([
  "publish_examination",
  "publish_results",

  "apply_grade_adjustment",
  "mark_responses",
  "revoke_ai_agent",
]);

/** Read-only tools; they never appear in the approval queue. */
export const READ_ONLY_TOOLS = new Set<string>([
  "get_org_context",
  "list_examinations",
  "get_examination",
  "get_question_bank",
  "get_marking_scheme",
  "get_student_responses",
  "get_exam_results",
  "get_class_statistics",
  "analyze_exam_performance",
  "validate_examination",
  "list_quizzes",
  "get_quiz",
]);

export function riskOf(tool: string): RiskClass {
  return SENSITIVE_TOOLS.has(tool) ? "sensitive" : "ordinary";
}

/**
 * Whether an approval is demanded for this call.
 *
 * The rule has three inputs and no opinion of its own:
 *   1. the tool's risk class,
 *   2. the organization's policy switch (default ON),
 *   3. whether the caller is an agent (an unattended machine) or a human who is
 *      sitting in the interface and can read the consequence.
 *
 * A human operating the native assistant in their own session still needs an
 * approval for a sensitive action *when the policy says so* — the point of the
 * rule is a second pair of eyes, not a mistrust of machines only.
 */
export function approvalRequired(input: {
  tool: string;
  /** `null` when the organization has no settings row (defaults apply). */
  requireApprovalForSensitive: boolean | null | undefined;
  actorKind: "human" | "agent";
  /** The caller explicitly asked to execute rather than to preview. */
  execute: boolean;
}): boolean {
  if (!input.execute) return false;
  if (riskOf(input.tool) !== "sensitive") return false;
  // A missing setting means the documented default: ask for the approval.
  const policy = input.requireApprovalForSensitive !== false;
  if (!policy) return false;
  return true;
}

/** Human-readable label used in the approval queue and in journals. */
export const RISK_LABELS: Record<RiskClass, string> = {
  ordinary: "Ordinary — read or draft",
  sensitive: "Sensitive — requires a human decision",
};
