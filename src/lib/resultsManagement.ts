/**
 * Results & Management — operational status derivation for the
 * examination → marking → validation → publication workflow.
 *
 * Pure module (no server, no database): the org Results & Management
 * index, the Super Admin overview and the tests all derive the SAME
 * statuses from the same data, reusing the existing resultLifecycle
 * stage machine so the exam workspace and this module can never disagree.
 *
 * Statuses (brief): Awaiting submissions · Awaiting marking · Marking in
 * progress · Marking completed / Provisional results · Awaiting validation ·
 * Validated · Published.
 */

import { deriveResultStage, type ResultStage } from "./resultLifecycle.ts";

export type ManagementStatusKey =
  | "draft"
  | "scheduled"
  | "awaiting_submissions"
  | "awaiting_marking"
  | "marking_in_progress"
  | "provisional_results"
  | "validated"
  | "published";

export type MarkingFilter = "awaiting" | "in_progress" | "complete";
export type ValidationFilter = "awaiting" | "validated";
export type PublicationFilter = "withheld" | "published";

export interface ResultsManagementInput {
  examStatus: string;
  attemptCount: number;
  submittedCount: number;
  /** Written (open_ended) answers still unmarked. */
  awaitingMarking: number;
  /** Written answers already marked. */
  markedCount: number;
  /** Submitted attempts with no score recorded. */
  missingScores: number;
  resultsValidated: boolean;
  resultsPublished: boolean;
}

export interface ManagementStatus {
  key: ManagementStatusKey;
  label: string;
  stage: ResultStage;
  markingStatus: MarkingFilter | "none";
  validationStatus: ValidationFilter;
  publicationStatus: PublicationFilter;
  /** true when some submitted attempt has no score — needs attention. */
  hasMissingScores: boolean;
}

const LABELS: Record<ManagementStatusKey, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  awaiting_submissions: "Awaiting submissions",
  awaiting_marking: "Awaiting marking",
  marking_in_progress: "Marking in progress",
  provisional_results: "Provisional results",
  validated: "Validated",
  published: "Published",
};

/**
 * Derive the operational status of one examination. Marking completion is
 * ALWAYS provisional until an authorized user explicitly validates, and
 * publication is a separate explicit step — completing marking never
 * publishes anything.
 */
export function deriveManagementStatus(input: ResultsManagementInput): ManagementStatus {
  const stageState = deriveResultStage({
    examStatus: input.examStatus,
    attemptCount: input.attemptCount,
    submittedCount: input.submittedCount,
    awaitingMarking: input.awaitingMarking,
    resultsValidated: input.resultsValidated,
    resultsPublished: input.resultsPublished,
  });
  const stage = stageState.stage;

  const markingStatus: ManagementStatus["markingStatus"] =
    input.awaitingMarking > 0
      ? input.markedCount > 0
        ? "in_progress"
        : "awaiting"
      : input.submittedCount > 0
        ? "complete"
        : "none";

  let key: ManagementStatusKey;
  if (input.resultsPublished) {
    key = "published";
  } else if (input.resultsValidated) {
    key = "validated";
  } else if (stage === "marking") {
    key = markingStatus === "in_progress" ? "marking_in_progress" : "awaiting_marking";
  } else if (stage === "results_review") {
    key = "provisional_results";
  } else if (stage === "in_progress" || stage === "submitted") {
    key = input.examStatus === "draft" ? "draft" : "awaiting_submissions";
  } else if (input.examStatus === "scheduled") {
    key = "scheduled";
  } else {
    key = "draft";
  }

  return {
    key,
    label: LABELS[key],
    stage,
    markingStatus,
    validationStatus: input.resultsValidated ? "validated" : "awaiting",
    publicationStatus: input.resultsPublished ? "published" : "withheld",
    hasMissingScores: input.missingScores > 0,
  };
}

export interface ResultsFilters {
  q?: string;
  academic_year?: string;
  grade?: string;
  subject?: string;
  exam_status?: string;
  marking?: string;
  validation?: string;
  publication?: string;
}

/** Server-side filter over the loaded org exams (single-tenant page size). */
export function matchesResultsFilters(
  row: { title: string; settings: Record<string, unknown>; status: string },
  status: ManagementStatus,
  filters: ResultsFilters,
): boolean {
  const q = (filters.q ?? "").trim().toLowerCase();
  if (q && !row.title.toLowerCase().includes(q)) return false;
  const year = filters.academic_year ?? "";
  if (year && String(row.settings.academic_year ?? "") !== year) return false;
  const grade = filters.grade ?? "";
  if (grade && String(row.settings.grade_label ?? "") !== grade) return false;
  const subject = filters.subject ?? "";
  if (subject && String(row.settings.subject ?? "") !== subject) return false;
  const examStatus = filters.exam_status ?? "";
  if (examStatus && row.status !== examStatus) return false;
  const marking = filters.marking ?? "";
  if (marking && status.markingStatus !== marking) return false;
  const validation = filters.validation ?? "";
  if (validation && status.validationStatus !== validation) return false;
  const publication = filters.publication ?? "";
  if (publication && status.publicationStatus !== publication) return false;
  return true;
}

/** Distinct filter options present in the data (never empty options). */
export function collectFilterOptions(
  rows: { settings: Record<string, unknown> }[],
): { years: string[]; grades: string[]; subjects: string[] } {
  const years = new Set<string>();
  const grades = new Set<string>();
  const subjects = new Set<string>();
  for (const row of rows) {
    const y = String(row.settings.academic_year ?? "").trim();
    const g = String(row.settings.grade_label ?? "").trim();
    const s = String(row.settings.subject ?? "").trim();
    if (y) years.add(y);
    if (g) grades.add(g);
    if (s) subjects.add(s);
  }
  const sort = (a: string, b: string) => a.localeCompare(b);
  return { years: [...years].sort(sort), grades: [...grades].sort(sort), subjects: [...subjects].sort(sort) };
}
