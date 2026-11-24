/**
 * Examination result publication lifecycle (7 stages):
 *
 *   Draft → In Progress → Submitted → Marking → Results Review → Validated → Published
 *
 * Derivation is a pure function of data the exam workspace already loads:
 * exam status, attempt counts, marking queue length, and the two persisted
 * settings flags written by the server actions:
 *   settings.results_validated   (validateResults — validated_by/_at stamped)
 *   settings.results_published   (publishResults  — grades_published_by/_at)
 *
 * Publication is the ONLY flag candidates ever see (student page, /api/exam
 * state+submit, /exam/result/[token] all gate on results_published); the
 * intermediate stages are the organizer-side workflow required before
 * publication is allowed.
 */
export const RESULT_STAGES = [
  "draft",
  "in_progress",
  "submitted",
  "marking",
  "results_review",
  "validated",
  "published",
] as const;

export type ResultStage = (typeof RESULT_STAGES)[number];

export interface LifecycleInput {
  examStatus: string;
  attemptCount: number;
  submittedCount: number;
  awaitingMarking: number;
  resultsValidated: boolean;
  resultsPublished: boolean;
}

export interface LifecycleState {
  stage: ResultStage;
  index: number;
  complete: boolean;
}

export function deriveResultStage(input: LifecycleInput): LifecycleState {
  let stage: ResultStage;
  if (input.resultsPublished) {
    stage = "published";
  } else if (input.resultsValidated) {
    stage = "validated";
  } else if (input.attemptCount === 0) {
    stage = input.examStatus === "open" ? "in_progress" : "draft";
  } else if (input.examStatus === "draft") {
    stage = "draft";
  } else if (input.examStatus === "open") {
    stage = input.submittedCount > 0 ? "submitted" : "in_progress";
  } else if (input.awaitingMarking > 0) {
    stage = "marking";
  } else if (input.submittedCount > 0) {
    stage = "results_review";
  } else {
    stage = "submitted";
  }
  const index = RESULT_STAGES.indexOf(stage);
  return { stage, index, complete: stage === "published" };
}
