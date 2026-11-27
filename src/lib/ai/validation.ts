/**
 * EVALORA AI CORE — Quality & Validation Engine.
 *
 * This module is deliberately pure: no database, no network, no model. It takes a
 * proposed examination and answers one question — would EVALORA accept this?
 * — using the *same* rules the authoring UI already enforces:
 *
 *   - `questionPublishIssues()` from `questionValidation.ts` decides whether a
 *     question's key is complete for its type;
 *   - `scoreAnswer()` from `scoring.ts` is run against the declared correct
 *     answer, so a key that cannot be marked fails here rather than in front of
 *     a candidate;
 *   - `MathText`-compatible delimiters are checked, because a formula that does
 *     not render is worse than no formula.
 *
 * A passing report is NOT a claim that the mathematics is correct. It says the
 * structure, the totals, the keys and the rendering are internally consistent
 * and reviewable. Every report carries that sentence.
 */

import { questionPublishIssues, type PublishableQuestion } from "../questionValidation";
import { scoreAnswer, ScoringError } from "../scoring";

export const VALIDATION_HONESTY_NOTE =
  "These are structural checks: totals, key completeness, marking consistency, duplicate detection and formula rendering. " +
  "They do not prove that the mathematics or the wording is correct. A teacher must review every generated paper before publication.";

export type ProposedQuestionType =
  | "single_choice"
  | "multiple_select"
  | "true_false"
  | "short_answer"
  | "numeric"
  | "ordering"
  | "matching"
  | "open_ended"
  | "assess_parts";

export interface ProposedOption {
  label: string;
  is_correct: boolean;
}

export interface ProposedAssessPart {
  id: string;
  label: string;
  prompt: string;
  kind: "numeric" | "text" | "expression";
  points: number;
  unit?: string;
  answer?: number;
  tolerance?: number;
  accepted?: string[];
  hints: [string, string];
  strand?: string;
}

export interface ProposedQuestion {
  /** Stable within the plan; referenced by sections. */
  ref: string;
  type: ProposedQuestionType;
  prompt: string;
  points: number;
  difficulty: "easy" | "medium" | "hard" | "competition";
  topic?: string;
  subtopic?: string;
  explanation?: string;
  options?: ProposedOption[];
  config?: Record<string, unknown>;
  /** Only meaningful for assess_parts. */
  parts?: ProposedAssessPart[];
  /** Author-supplied marking guidance for manually marked types. */
  markingCriteria?: string;
}

export interface ProposedSection {
  id: string;
  title: string;
  instructions?: string;
  /** Questions in authored order. */
  refs: string[];
}

export interface ProposedExam {
  title: string;
  description?: string;
  instructions?: string;
  durationMinutes: number;
  gradeLabel?: string;
  subject?: string;
  curriculum?: string;
  passMarkPercent?: number;
  sections: ProposedSection[];
  questions: ProposedQuestion[];
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  /** Question ref, section id or null for the paper. */
  where: string | null;
}

export interface ValidationReport {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  totals: {
    questions: number;
    marks: number;
    bySection: { id: string; title: string; questions: number; marks: number }[];
    byDifficulty: Record<string, number>;
    byType: Record<string, number>;
  };
  honesty: string;
}

const MATH_DELIMITERS = [
  ["$$", "$$"],
  ["\\[", "\\]"],
  ["\\(", "\\)"],
] as const;

/**
 * Unclosed math spans in a string — a rendered formula, or a typo.
 *
 * `$$` is symmetric, so counting "opens" and "closes" separately would always
 * balance and let `$$x` through: a symmetric delimiter is instead required to
 * appear an EVEN number of times. The asymmetric pairs (`\[`/`\]`, `\(`/`\)`)
 * are compared directly.
 */
export function unclosedMathDelimiters(text: string): string[] {
  const problems: string[] = [];
  for (const [open, close] of MATH_DELIMITERS) {
    const opens = text.split(open).length - 1;
    if (open === close) {
      if (opens % 2 !== 0) problems.push(`${open}…${close} (${opens} occurrence${opens === 1 ? "" : "s"}, unpaired)`);
      continue;
    }
    const closes = text.split(close).length - 1;
    if (opens !== closes) problems.push(`${open}…${close} (${opens} open, ${closes} close)`);
  }
  // A lone "$" that is not part of "$$" is not supported by MathText.
  const singles = text.replace(/\$\$/g, "").split("$").length - 1;
  if (singles % 2 !== 0) problems.push("an unpaired $ delimiter");
  return problems;
}

/** Turns a proposed question into the shape the authoring validators expect. */
export function toPublishable(q: ProposedQuestion): PublishableQuestion {
  const config: Record<string, unknown> = { ...(q.config ?? {}) };
  if (q.type === "assess_parts") {
    config.parts = (q.parts ?? []).map((part) => ({
      id: part.id,
      label: part.label,
      prompt: part.prompt,
      kind: part.kind,
      points: part.points,
      unit: part.unit,
      answer: part.answer,
      tolerance: part.tolerance,
      accepted: part.accepted,
      hints: part.hints,
      strand: part.strand,
    }));
  }
  if (q.type === "open_ended" && q.markingCriteria) {
    config.marking_criteria = q.markingCriteria;
  }
  return {
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    config,
    options: (q.options ?? []).map((o, index) => ({
      label: o.label,
      is_correct: o.is_correct,
      position: index,
    })),
  };
}

/**
 * Runs the declared key through the real scorer.
 *
 * `scoreAnswer` throws `ScoringError` when an answer cannot be verified against
 * the key. That is exactly the condition we want to surface as an error here:
 * a paper whose key cannot be marked is not ready.
 */
function keyCheck(q: ProposedQuestion): string | null {
  const options = (q.options ?? []).map((o, index) => ({
    id: `option-${index}`,
    label: o.label,
    is_correct: o.is_correct,
  }));
  const config = toPublishable(q).config ?? {};
  const base = { type: q.type, points: q.points, config, prompt: q.prompt };

  const tryScore = (answer: Record<string, unknown>): string | null => {
    try {
      scoreAnswer(base, options, answer, q.points);
      return null;
    } catch (error) {
      if (error instanceof ScoringError) {
        return "the marking key cannot be verified by the platform scorer";
      }
      return "the marking key produced an unexpected scoring failure";
    }
  };

  switch (q.type) {
    case "single_choice":
    case "true_false": {
      const correct = options.filter((o) => o.is_correct);
      if (correct.length !== 1) return "exactly one option must be the key";
      return tryScore({ option_id: correct[0].id });
    }
    case "multiple_select": {
      const correct = options.filter((o) => o.is_correct);
      if (correct.length === 0) return "at least one option must be correct";
      return tryScore({ option_ids: correct.map((o) => o.id) });
    }
    case "short_answer": {
      const accepted = options.filter((o) => o.is_correct && o.label.trim());
      if (!accepted.length) return "at least one accepted answer is required";
      const first = accepted[0].label;
      return tryScore({ text: first });
    }
    case "numeric": {
      const answer = config.numeric_answer ?? config.answer;
      if (!Number.isFinite(Number(answer))) return "a numeric answer is required (config.numeric_answer)";
      return tryScore({ value: Number(answer) });
    }
    case "assess_parts": {
      const parts = q.parts ?? [];
      if (!parts.length) return "at least one part is required";
      const payload: Record<string, string | number> = {};
      for (const part of parts) {
        if (part.kind === "numeric") {
          if (!Number.isFinite(Number(part.answer))) return `part ${part.id} has no numeric answer`;
          payload[part.id] = Number(part.answer);
        } else {
          const first = (part.accepted ?? []).find((a) => a && a.trim());
          if (!first) return `part ${part.id} has no accepted answer`;
          payload[part.id] = first;
        }
      }
      return tryScore({ parts: payload });
    }
    case "open_ended": {
      // Manually marked: the requirement is a rubric, not a key.
      if (!String(config.marking_criteria ?? "").trim()) return "marking criteria are required for a constructed-response question";
      return null;
    }
    default:
      return null;
  }
}

/** Normalises a prompt for duplicate detection. */
export function promptFingerprint(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/\$\$|\\[()[\]]/g, " ")
    .replace(/[^a-z0-9\u00c0-\u024f ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The complete structural review of one proposed examination.
 */
export function validateProposedExam(exam: ProposedExam): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (code: string, message: string, where: string | null = null) =>
    errors.push({ severity: "error", code, message, where });
  const warn = (code: string, message: string, where: string | null = null) =>
    warnings.push({ severity: "warning", code, message, where });

  if (!exam.title.trim()) err("title_missing", "The examination needs a title.");
  if (exam.title.length > 160) err("title_too_long", "The title exceeds 160 characters.");
  if (!Number.isInteger(exam.durationMinutes) || exam.durationMinutes < 1 || exam.durationMinutes > 1440) {
    err("duration_invalid", "The duration must be a whole number of minutes between 1 and 1440.");
  }
  if (!exam.questions.length) err("no_questions", "The examination has no questions.");
  if (!exam.sections.length) err("no_sections", "The examination needs at least one section.");

  // ── Referential integrity ────────────────────────────────────────────
  const byRef = new Map<string, ProposedQuestion>();
  for (const q of exam.questions) {
    if (byRef.has(q.ref)) err("duplicate_ref", `Two questions share the reference "${q.ref}".`, q.ref);
    byRef.set(q.ref, q);
  }
  const sectioned = new Set<string>();
  const seenSectionIds = new Set<string>();
  for (const section of exam.sections) {
    if (seenSectionIds.has(section.id)) err("duplicate_section", `Two sections share the id "${section.id}".`, section.id);
    seenSectionIds.add(section.id);
    if (!section.title.trim()) err("section_title", `Section ${section.id} has no title.`, section.id);
    if (!section.refs.length) err("empty_section", `Section "${section.title}" has no questions.`, section.id);
    for (const ref of section.refs) {
      if (!byRef.has(ref)) {
        err("unknown_ref", `Section "${section.title}" refers to a question that does not exist (${ref}).`, section.id);
        continue;
      }
      if (sectioned.has(ref)) {
        err("double_section", `Question "${ref}" appears in more than one section.`, ref);
      }
      sectioned.add(ref);
    }
  }
  for (const q of exam.questions) {
    if (!sectioned.has(q.ref)) warn("unsectioned", `Question "${q.ref}" belongs to no section and will not be printed.`, q.ref);
  }

  // ── Per-question rules ───────────────────────────────────────────────
  for (const q of exam.questions) {
    if (!q.prompt.trim()) err("prompt_missing", "A question has an empty prompt.", q.ref);
    if (!Number.isFinite(q.points) || q.points <= 0) err("points_invalid", "Every question needs positive marks.", q.ref);

    const delimiters = unclosedMathDelimiters(q.prompt);
    if (delimiters.length) {
      err("math_unclosed", `Unbalanced formula delimiters: ${delimiters.join(", ")}.`, q.ref);
    }
    if (q.options?.some((option) => unclosedMathDelimiters(option.label).length)) {
      err("option_math_unclosed", "An answer option has unbalanced formula delimiters.", q.ref);
    }

    const mismatch = keyCheck(q);
    if (mismatch) err("key_invalid", `This question cannot be marked: ${mismatch}.`, q.ref);

    const publishIssues = questionPublishIssues(toPublishable(q));
    for (const issue of publishIssues) {
      err("publish_rule", issue.charAt(0).toUpperCase() + issue.slice(1) + ".", q.ref);
    }

    if (q.type === "assess_parts") {
      const parts = q.parts ?? [];
      const partTotal = round2(parts.reduce((sum, part) => sum + (Number(part.points) || 0), 0));
      if (Math.abs(partTotal - q.points) > 0.001) {
        err("parts_total", `Part marks (${partTotal}) must add up to the question's marks (${q.points}).`, q.ref);
      }
      for (const part of parts) {
        if (unclosedMathDelimiters(part.prompt ?? "").length) {
          err("part_math_unclosed", `Part ${part.id} has unbalanced formula delimiters.`, q.ref);
        }
        if (!part.hints?.[0]?.trim() || !part.hints?.[1]?.trim()) {
          err("part_hints", `Part ${part.id} needs two progressive hints.`, q.ref);
        }
      }
    }

    if (q.type === "open_ended" && !q.markingCriteria?.trim()) {
      err("marking_criteria", "A constructed-response question needs marking criteria.", q.ref);
    }
  }

  // ── Duplicates ──────────────────────────────────────────────────────
  const fingerprints = new Map<string, string>();
  for (const q of exam.questions) {
    const key = promptFingerprint(q.prompt);
    if (!key) continue;
    const previous = fingerprints.get(key);
    if (previous) {
      err("duplicate_prompt", `Question "${q.ref}" repeats the wording of "${previous}".`, q.ref);
    } else {
      fingerprints.set(key, q.ref);
    }
  }

  // ── Totals ──────────────────────────────────────────────────────────
  const marks = round2(exam.questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0));
  const bySection = exam.sections.map((section) => ({
    id: section.id,
    title: section.title,
    questions: section.refs.filter((ref) => byRef.has(ref)).length,
    marks: round2(section.refs.reduce((sum, ref) => sum + (Number(byRef.get(ref)?.points) || 0), 0)),
  }));
  const sectionMarks = round2(bySection.reduce((sum, section) => sum + section.marks, 0));
  if (Math.abs(sectionMarks - marks) > 0.001) {
    err("section_total", `Section marks (${sectionMarks}) do not add up to the paper total (${marks}).`);
  }
  if (marks <= 0) err("no_marks", "The paper is worth no marks.");
  if (exam.passMarkPercent !== undefined && (!Number.isFinite(exam.passMarkPercent) || exam.passMarkPercent < 0 || exam.passMarkPercent > 100)) {
    err("pass_mark_invalid", "The pass mark must be between 0 and 100 percent.");
  }
  if (marks > 0 && exam.durationMinutes > 0) {
    const perMinute = marks / exam.durationMinutes;
    if (perMinute > 2) {
      warn(
        "marks_per_minute",
        `${marks} marks in ${exam.durationMinutes} minutes is about ${perMinute.toFixed(1)} marks per minute, which is usually unrealistic.`,
      );
    }
  }

  const byDifficulty: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const q of exam.questions) {
    byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] ?? 0) + 1;
    byType[q.type] = (byType[q.type] ?? 0) + 1;
  }
  const difficulties = Object.keys(byDifficulty).length;
  if (exam.questions.length >= 6 && difficulties < 2) {
    warn("single_difficulty", "Every question is at the same difficulty; a graded paper usually mixes levels.");
  }
  const manual = exam.questions.filter((q) => q.type === "open_ended").length;
  if (manual > 0 && manual === exam.questions.length) {
    warn("all_manual", "Every question requires manual marking; the paper will not produce an instant result.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    totals: { questions: exam.questions.length, marks, bySection, byDifficulty, byType },
    honesty: VALIDATION_HONESTY_NOTE,
  };
}

/** Compact text rendering of a report for a model or a log line. */
export function renderReport(report: ValidationReport): string {
  const lines: string[] = [];
  lines.push(
    `Validation ${report.ok ? "passed" : "failed"}: ${report.totals.questions} questions, ${report.totals.marks} marks, ${report.errors.length} error(s), ${report.warnings.length} warning(s).`,
  );
  for (const issue of report.errors) lines.push(`ERROR [${issue.code}]${issue.where ? ` @${issue.where}` : ""}: ${issue.message}`);
  for (const issue of report.warnings) lines.push(`WARNING [${issue.code}]${issue.where ? ` @${issue.where}` : ""}: ${issue.message}`);
  lines.push(report.honesty);
  return lines.join("\n");
}
