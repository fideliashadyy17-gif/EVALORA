/**
 * Question-level assessment mapping for the Paper Builder.
 *
 * A paper question may carry an optional mapping that says WHICH grading
 * framework assesses it and, where the framework has them, WHICH criteria
 * and strands apply. The mapping is an assessment SNAPSHOT: titles and
 * descriptions are copied in at save time so later reference-library edits
 * never rewrite a historical paper (mirrors exams.settings.myp_grading).
 *
 * Pure module — no server, no database. Used by the Paper Builder client,
 * saveQuiz server validation and the marking screens.
 */

import {
  MYP_REFERENCE_SNAPSHOT,
  MYP_EXAM_CONFIG_VERSION,
  parseMypExamConfig,
  type MypExamGradingConfig,
} from "./mypExamConfig.ts";
import { MYP_SUBJECT_GROUP_REFERENCE, mypReferenceForPreset } from "./mypReference.ts";
import { GRADING_CURRICULA, type GradingCurriculum } from "./gradingSystems.ts";

export const QUESTION_ASSESSMENT_VERSION = 1;
/** Reference label for non-MYP mappings (organisation-owned configuration). */
export const ORG_CONFIG_REFERENCE = "org-config";

/** Framework-appropriate element (AP sections, objectives, competency tags…).
 *  Labels are the organisation's OWN wording — EVALORA never invents
 *  official curriculum requirements. */
export interface QuestionAssessmentElement {
  code: string;
  label: string;
  description: string;
}

export interface QuestionAssessment {
  version: number;
  curriculum: GradingCurriculum;
  grading_system_id: string | null;
  /** Snapshot label: MYP_REFERENCE_SNAPSHOT for MYP, org-config otherwise. */
  reference: string;
  saved_at: string;
  /** MYP only — the same validated snapshot shape as exams.settings.myp_grading. */
  myp?: MypExamGradingConfig;
  /** Non-MYP frameworks — teacher-defined assessment elements. */
  elements?: QuestionAssessmentElement[];
}

export type AssessmentErrorCode =
  | "curriculum"
  | "group"
  | "criteria"
  | "strand"
  | "element"
  | "shape";

export type AssessmentValidation = { ok: true } | { ok: false; error: AssessmentErrorCode };

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Structural parse: what a stored/sent mapping must look like. Historical
 *  rows keep loading even if the live reference has since changed. */
export function parseQuestionAssessment(value: unknown): QuestionAssessment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== QUESTION_ASSESSMENT_VERSION) return null;
  const curriculum = cleanText(raw.curriculum, 24);
  if (!(GRADING_CURRICULA as readonly string[]).includes(curriculum)) return null;
  const reference = cleanText(raw.reference, 80);
  const savedAt = cleanText(raw.saved_at, 40);
  if (!reference || !savedAt) return null;

  const assessment: QuestionAssessment = {
    version: QUESTION_ASSESSMENT_VERSION,
    curriculum: curriculum as GradingCurriculum,
    grading_system_id:
      typeof raw.grading_system_id === "string" && raw.grading_system_id.length > 0
        ? raw.grading_system_id
        : null,
    reference,
    saved_at: savedAt,
  };

  if (raw.myp !== undefined && raw.myp !== null) {
    const myp = parseMypExamConfig(raw.myp);
    if (!myp) return null;
    assessment.myp = myp;
  }

  if (raw.elements !== undefined && raw.elements !== null) {
    if (!Array.isArray(raw.elements) || raw.elements.length > 40) return null;
    const elements: QuestionAssessmentElement[] = [];
    for (const entry of raw.elements) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const e = entry as Record<string, unknown>;
      const code = cleanText(e.code, 16);
      const label = cleanText(e.label, 120);
      // A row the teacher added but not yet labelled is dropped, not fatal:
      // an in-progress element must never block saving the rest of the paper.
      if (!code || !label) continue;
      elements.push({ code, label, description: cleanText(e.description, 400) });
    }
    assessment.elements = elements;
  }

  return assessment;
}

/** MYP mapping must still be claimable from the LIVE reference at save time
 *  (titles/descriptions are snapshotted; only membership is re-checked). */
export function validateMypSnapshotAgainstReference(
  config: MypExamGradingConfig,
): Exclude<AssessmentValidation, { ok: true }> | null {
  const group = mypReferenceForPreset(config.subject_group);
  if (!group) return { ok: false, error: "group" };
  if (config.criteria.length === 0) return { ok: false, error: "criteria" };
  for (const criterion of config.criteria) {
    const referenceCriterion = group.criteria.find((c) => c.code === criterion.code);
    if (!referenceCriterion) return { ok: false, error: "criteria" };
    const wantedStrands = new Set(criterion.strands.map((s) => s.code));
    for (const code of wantedStrands) {
      if (!referenceCriterion.strands.some((s) => s.code === code)) {
        return { ok: false, error: "strand" };
      }
    }
  }
  // Strands stored under a criterion must belong to it (claim check).
  for (const criterion of config.criteria) {
    for (const strand of criterion.strands) {
      if (!strand.code.startsWith(criterion.code)) return { ok: false, error: "strand" };
    }
  }
  return null;
}

/** Full save-time validation of a mapping that is about to be written. */
export function validateQuestionAssessment(value: unknown): AssessmentValidation {
  const parsed = parseQuestionAssessment(value);
  if (!parsed) return { ok: false, error: "shape" };
  if (parsed.curriculum === "myp") {
    if (!parsed.myp) return { ok: false, error: "criteria" };
    const refError = validateMypSnapshotAgainstReference(parsed.myp);
    if (refError) return refError;
    if (parsed.elements && parsed.elements.length > 0) return { ok: false, error: "element" };
    return { ok: true };
  }
  // Non-MYP: mapping must carry its own elements (or be intentionally empty
  // framework pointer — a system id alone is a valid, useful mapping).
  if (parsed.myp) return { ok: false, error: "shape" };
  // Elements with content are guaranteed by parse (unlabelled rows dropped).
  return { ok: true };
}

/** Order-insensitive deep equality — jsonb normalises key order, so a
 *  naive JSON.stringify compare would rewrite (and, on attempt-locked
 *  papers, wrongly reject) unchanged mappings. */
export function assessmentEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => assessmentEquals(item, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const ka = Object.keys(ra);
    const kb = Object.keys(rb);
    if (ka.length !== kb.length) return false;
    return ka.every((key) => key in rb && assessmentEquals(ra[key], rb[key]));
  }
  return false;
}

export function buildQuestionAssessment(input: {
  curriculum: GradingCurriculum;
  gradingSystemId?: string | null;
  myp?: MypExamGradingConfig;
  elements?: QuestionAssessmentElement[];
  savedAt?: string;
}): QuestionAssessment {
  const isMyp = input.curriculum === "myp";
  return {
    version: QUESTION_ASSESSMENT_VERSION,
    curriculum: input.curriculum,
    grading_system_id: input.gradingSystemId ?? null,
    reference: isMyp ? (input.myp?.reference ?? MYP_REFERENCE_SNAPSHOT) : ORG_CONFIG_REFERENCE,
    saved_at: input.savedAt ?? new Date().toISOString(),
    ...(isMyp && input.myp ? { myp: input.myp } : {}),
    ...(!isMyp && input.elements && input.elements.length
      ? { elements: input.elements }
      : {}),
  };
}

/** Short human lines for badges/lists — used by marking and previews. */
export function summarizeQuestionAssessment(assessment: QuestionAssessment): {
  framework: string;
  lines: string[];
} {
  const framework =
    assessment.curriculum === "myp"
      ? `IB MYP · ${assessment.myp?.subject_group_label ?? "subject group"}`
      : assessment.curriculum.toUpperCase();
  const lines: string[] = [];
  if (assessment.myp) {
    for (const criterion of assessment.myp.criteria) {
      const strands = criterion.strands.map((s) => s.code);
      lines.push(
        strands.length
          ? `Criterion ${criterion.code} — ${criterion.title} → ${strands.join(", ")}`
          : `Criterion ${criterion.code} — ${criterion.title}`,
      );
    }
  }
  for (const element of assessment.elements ?? []) {
    lines.push(element.description ? `${element.label} — ${element.description}` : element.label);
  }
  return { framework, lines };
}

/** The MYP subject groups offered in the mapping panel (reference data). */
export function mypSubjectGroups(): { key: string; group: string; source: string; sourceUrl: string }[] {
  return MYP_SUBJECT_GROUP_REFERENCE.map((g) => ({
    key: g.key,
    group: g.group,
    source: g.source,
    sourceUrl: g.sourceUrl,
  }));
}

export const QUESTION_ASSESSMENT_REFERENCE = {
  MYP_REFERENCE_SNAPSHOT,
  MYP_EXAM_CONFIG_VERSION,
  ORG_CONFIG_REFERENCE,
} as const;
