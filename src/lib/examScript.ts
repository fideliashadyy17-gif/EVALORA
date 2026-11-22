import type { SupabaseClient } from "@supabase/supabase-js";
import { attemptRows, type AttemptGradingSummary } from "./exam";
import { answerReveal } from "./live";
import { answerIsPresent } from "./answerPresence";
import { assessPartsFromConfig, publicAssessParts } from "./assessParts";
import { scoreAnswerDetailed, ScoringError, type AnswerScoreDetail } from "./scoring";
import { normaliseStructuredRules, structuredExpectedSummary } from "./structuredScoring";
import type { RichDoc } from "./content";

/**
 * A complete, marker-facing script.
 *
 * The loader is deliberately server-only: `answerReveal()` returns the marking
 * key, so this data must never be serialized into a candidate route. Every
 * question of the paper is returned, including unanswered ones, and every
 * response keeps its structured payload so it can be rendered instead of being
 * flattened to an identifier.
 */

export type ScriptStatus = "auto_graded" | "not_graded" | "grading_failed" | "unanswered" | "human_graded";

export const SCRIPT_STATUS_LABEL: Record<ScriptStatus, string> = {
  auto_graded: "Automatically graded",
  not_graded: "Not graded",
  grading_failed: "Grading failed",
  unanswered: "Unanswered",
  human_graded: "Graded by teacher",
};

export interface ScriptPartResult {
  id: string;
  label: string;
  prompt: string;
  points: number;
  earned: number;
  correct: boolean;
  typed: string | null;
}

export interface ScriptStructuredResult {
  id: string;
  label: string;
  tool: string;
  points: number;
  earned: number;
  status: string;
  detail: string;
  expected: string;
}

export interface ScriptQuestion {
  number: number;
  label: string;
  section: string;
  criterion: string | null;
  criterionLabel: string | null;
  max: number;
  type: string;
  prompt: string;
  promptDoc: RichDoc | null;
  explanation: string | null;
  status: ScriptStatus;
  statusLabel: string;
  awarded: number | null;
  countedAwarded: number;
  note: string | null;
  answered: boolean;
  answer: Record<string, unknown> | null;
  expected: string[];
  correctOptionLabels: string[];
  correctOptionDocs: { label: string; doc: RichDoc | null; text: string }[];
  parts: ScriptPartResult[];
  structured: ScriptStructuredResult[];
  markingBreakdown: { label: string; marks: number; focus?: string }[];
  publicParts: ReturnType<typeof publicAssessParts>;
  questionId: string;
  answerId: string | null;
  markerNote: string | null;
  markedBy: string | null;
}

export interface ScriptSummary {
  totalPossible: number;
  awardedOnGraded: number;
  autoAwarded: number;
  autoMax: number;
  gradedMax: number;
  unansweredMax: number;
  coveredMax: number;
  ungradedMax: number;
  provisionalScore: number;
  finalScore: number | null;
  autoCount: number;
  humanCount: number;
  unansweredCount: number;
  notGradedCount: number;
  failedCount: number;
  gradingSummary: AttemptGradingSummary | null;
}

export interface ExamScript {
  attempt: {
    id: string;
    status: string;
    startedAt: string;
    submittedAt: string | null;
    score: number | null;
    maxScore: number | null;
    gradingStatus: string;
    gradingError: string | null;
    attemptNumber: number;
    extensionMinutes: number;
  };
  exam: {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    durationMinutes: number;
    status: string;
    resultsPublished: boolean;
    publishedAt: string | null;
  };
  organizationName: string;
  candidate: {
    id: string;
    name: string;
    reference: string | null;
    className: string | null;
    status: string;
  };
  questions: ScriptQuestion[];
  summary: ScriptSummary;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const num = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const round = (value: number) => Math.round(value * 100) / 100;

function answerText(payload: Record<string, unknown>, partId: string): string | null {
  const parts = isRecord(payload.parts) ? payload.parts : {};
  const value = parts[partId];
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function expectedText(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function questionLabel(config: Record<string, unknown>, fallback: number): string {
  if (typeof config.question_label === "string" && config.question_label.trim()) return config.question_label.trim();
  const printed = num(config.question_number);
  return String(printed ?? fallback);
}

/**
 * Load one attempt's complete script. The caller must already have checked the
 * Super Admin (or tenant) authorization boundary.
 */
export async function loadExamScript(
  admin: SupabaseClient,
  attemptId: string,
): Promise<ExamScript | null> {
  const { data: attemptRow, error: attemptError } = await admin
    .from("exam_attempts")
    .select("*, exams(*), exam_candidates(*)")
    .eq("id", attemptId)
    .maybeSingle();
  if (attemptError || !attemptRow || !(attemptRow as { exams?: unknown }).exams) return null;
  const attempt = attemptRow as Record<string, unknown>;
  const exam = (attempt.exams ?? {}) as Record<string, unknown>;
  const candidate = (attempt.exam_candidates ?? {}) as Record<string, unknown>;
  if (!exam.id) return null;

  const { data: organization } = await admin
    .from("organizations")
    .select("name")
    .eq("id", exam.organization_id as string)
    .maybeSingle();
  const { data: klass } = attempt.class_id
    ? await admin.from("classes").select("name").eq("id", attempt.class_id as string).maybeSingle()
    : { data: null };

  let rows: Awaited<ReturnType<typeof attemptRows>>;
  try {
    rows = await attemptRows(admin, {
      quiz_id: (exam.quiz_id as string | null) ?? null,
      settings: (exam.settings as Record<string, unknown> | null) ?? {},
    }, {
      id: attempt.id as string,
      question_order: attempt.question_order,
    });
  } catch {
    return null;
  }

  const { data: rawAnswers } = await admin
    .from("exam_answers")
    .select("*")
    .eq("attempt_id", attemptId);
  const answerByQuestion = new Map(
    ((rawAnswers ?? []) as Record<string, unknown>[]).map((answer) => [String(answer.question_id), answer]),
  );

  let autoAwarded = 0;
  let autoMax = 0;
  let gradedMax = 0;
  let unansweredMax = 0;
  let ungradedMax = 0;
  let totalPossible = 0;
  let autoCount = 0;
  let humanCount = 0;
  let unansweredCount = 0;
  let notGradedCount = 0;
  let failedCount = 0;

  const questions: ScriptQuestion[] = rows.map((row, index) => {
    const q = row.questions;
    const config = (q.config ?? {}) as Record<string, unknown>;
    const max = Number(row.points ?? q.points);
    const saved = answerByQuestion.get(q.id);
    const answer = isRecord(saved?.answer) ? (saved!.answer as Record<string, unknown>) : null;
    const answered = answerIsPresent(answer);
    const storedStatus = typeof saved?.grading_status === "string" ? saved.grading_status : null;
    let status: ScriptStatus;
    if (!answered) status = "unanswered";
    else if (storedStatus === "grading_failed") status = "grading_failed";
    else if (saved?.marked_by || storedStatus === "human_graded") status = "human_graded";
    else if (saved?.is_correct !== null && saved?.is_correct !== undefined) status = "auto_graded";
    else if (storedStatus === "auto_graded") status = "auto_graded";
    else status = "not_graded";

    const awarded = status === "auto_graded" || status === "human_graded"
      ? num(saved?.points_awarded)
      : status === "unanswered"
        ? 0
        : null;

    let detail: AnswerScoreDetail | null = null;
    if (answered) {
      try {
        detail = scoreAnswerDetailed(
          { type: q.type, points: q.points, config: q.config },
          q.question_options,
          answer ?? {},
          row.points,
        );
      } catch (error) {
        if (!(error instanceof ScoringError)) throw error;
      }
    }

    const parts = assessPartsFromConfig(config);
    const storedPartScores = isRecord(saved?.part_scores) ? saved.part_scores : {};
    const storedParts = Array.isArray(storedPartScores.parts) ? storedPartScores.parts.filter(isRecord) : [];
    const detailedParts = detail?.perPart ?? [];
    const partResults: ScriptPartResult[] = parts.map((part) => {
      const stored = storedParts.find((entry) => String(entry.id) === part.id);
      const scored = detailedParts.find((entry) => entry.id === part.id);
      const earned = num(scored?.earned) ?? num(stored?.earned) ?? 0;
      return {
        id: part.id,
        label: part.label,
        prompt: part.prompt,
        points: part.points,
        earned: answered ? Math.min(part.points, Math.max(0, earned)) : 0,
        correct: Boolean(scored?.correct ?? (earned >= part.points)),
        typed: answer ? answerText(answer, part.id) : null,
      };
    });

    const rules = normaliseStructuredRules(config.structured_marks);
    const storedStructured = Array.isArray(storedPartScores.structured) ? storedPartScores.structured.filter(isRecord) : [];
    const detailedStructured = detail?.structured ?? [];
    const structuredResults: ScriptStructuredResult[] = rules.map((rule) => {
      const stored = storedStructured.find((entry) => String(entry.id) === rule.id);
      const scored = detailedStructured.find((entry) => entry.id === rule.id);
      return {
        id: rule.id,
        label: rule.label,
        tool: rule.tool,
        points: rule.points,
        earned: answered ? (num(scored?.earned) ?? num(stored?.earned) ?? 0) : 0,
        status: String(scored?.status ?? stored?.status ?? (answered ? "not_awarded" : "missing")),
        detail: String(scored?.detail ?? stored?.detail ?? "No construction was saved."),
        expected: structuredExpectedSummary(rule),
      };
    });

    const reveal = answerReveal(row);
    const correctOptions = q.question_options.filter((option) => option.is_correct);
    const correctOptionLabels = correctOptions.map((option) => option.label);
    const correctOptionDocs = correctOptions.map((option) => ({
      label: option.label,
      doc: option.content_doc ?? null,
      text: "",
    }));

    const note = typeof saved?.grading_note === "string" && saved.grading_note.trim()
      ? saved.grading_note.trim()
      : status === "unanswered"
        ? "No response was saved. This question is worth zero and is not awaiting marking."
        : status === "not_graded"
          ? "This response requires a teacher's mark; it has not been treated as zero."
          : status === "grading_failed"
            ? "The marking key for this response could not be applied. It has not been scored."
            : null;

    const counts = answered;
    totalPossible += max;
    if (status === "auto_graded") {
      const points = awarded ?? 0;
      autoAwarded += points;
      autoMax += max;
      gradedMax += max;
      autoCount++;
    } else if (status === "human_graded") {
      gradedMax += max;
      humanCount++;
    } else if (status === "unanswered") {
      unansweredMax += max;
      unansweredCount++;
    } else {
      ungradedMax += max;
      if (status === "grading_failed") failedCount++;
      else notGradedCount++;
    }
    if (!counts && status !== "unanswered") unansweredCount++;

    return {
      number: index + 1,
      label: questionLabel(config, index + 1),
      section: typeof config.paper_section === "string" ? config.paper_section : "A",
      criterion: typeof config.myp_criterion === "string" ? config.myp_criterion : null,
      criterionLabel: typeof config.criterion_label === "string" ? config.criterion_label : null,
      max,
      type: q.type,
      prompt: q.prompt,
      promptDoc: q.prompt_doc ?? null,
      explanation: q.explanation ?? null,
      status,
      statusLabel: SCRIPT_STATUS_LABEL[status],
      awarded: awarded === null ? null : round(awarded),
      countedAwarded: status === "unanswered" ? 0 : awarded ?? 0,
      note,
      answered,
      answer,
      expected: expectedText(reveal.summary),
      correctOptionLabels,
      correctOptionDocs,
      parts: partResults,
      structured: structuredResults,
      markingBreakdown: Array.isArray(config.marking_breakdown)
        ? (config.marking_breakdown as unknown[])
            .filter(isRecord)
            .map((entry) => ({
              label: String(entry.label ?? ""),
              marks: num(entry.marks) ?? 0,
              ...(typeof entry.focus === "string" ? { focus: entry.focus } : {}),
            }))
        : [],
      publicParts: publicAssessParts(parts),
      questionId: q.id,
      answerId: saved?.id ? String(saved.id) : null,
      markerNote: typeof saved?.marker_note === "string" ? saved.marker_note : null,
      markedBy: typeof saved?.marked_by === "string" ? saved.marked_by : null,
    };
  });

  const awardedOnGraded = round(questions.reduce((sum, question) =>
    sum + (question.status === "auto_graded" || question.status === "human_graded" ? question.countedAwarded : 0), 0));
  const provisionalScore = round(awardedOnGraded);
  const gradingStatus = typeof attempt.grading_status === "string" ? attempt.grading_status : "not_started";
  const summary: ScriptSummary = {
    totalPossible,
    awardedOnGraded,
    autoAwarded: round(autoAwarded),
    autoMax,
    gradedMax,
    unansweredMax,
    coveredMax: gradedMax + unansweredMax,
    ungradedMax,
    provisionalScore,
    finalScore: ungradedMax === 0 && failedCount === 0 ? provisionalScore : null,
    autoCount,
    humanCount,
    unansweredCount,
    notGradedCount,
    failedCount,
    gradingSummary: null,
  };

  return {
    attempt: {
      id: attempt.id as string,
      status: String(attempt.status ?? "in_progress"),
      startedAt: String(attempt.started_at ?? ""),
      submittedAt: typeof attempt.submitted_at === "string" ? attempt.submitted_at : null,
      score: num(attempt.score),
      maxScore: num(attempt.max_score),
      gradingStatus,
      gradingError: typeof attempt.grading_error === "string" ? attempt.grading_error : null,
      attemptNumber: num(attempt.attempt_number) ?? 1,
      extensionMinutes: num(attempt.extension_minutes) ?? 0,
    },
    exam: {
      id: String(exam.id),
      title: String(exam.title ?? "Examination"),
      description: typeof exam.description === "string" ? exam.description : null,
      instructions: typeof exam.instructions === "string" ? exam.instructions : null,
      durationMinutes: num(exam.duration_minutes) ?? 0,
      status: String(exam.status ?? ""),
      resultsPublished: Boolean(exam.grades_published_at) ||
        Boolean((exam.settings as Record<string, unknown> | null)?.results_published),
      publishedAt: typeof exam.grades_published_at === "string" ? exam.grades_published_at : null,
    },
    organizationName: String(organization?.name ?? "Organization"),
    candidate: {
      id: String(candidate.id ?? ""),
      name: String(candidate.full_name ?? [candidate.first_name, candidate.last_name].filter(Boolean).join(" ") ?? "Candidate"),
      reference: typeof candidate.candidate_ref === "string" ? candidate.candidate_ref : null,
      className: typeof klass?.name === "string" ? klass.name : null,
      status: String(candidate.status ?? ""),
    },
    questions,
    summary,
  };
}

/** A compact question list for the sticky script navigator. */
export function scriptNavigation(script: ExamScript) {
  return script.questions.map((question) => ({
    number: question.number,
    label: question.label,
    section: question.section,
    status: question.status,
    awarded: question.awarded,
    max: question.max,
  }));
}
