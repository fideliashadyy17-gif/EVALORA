import { loadQuizQuestions, randomizeQuestionRows, type SessionQuestionRow } from "./live";
import { scoreAnswer, ScoringError } from "./scoring";
import { attemptDeadline } from "./examDeadline";
import type { SupabaseClient } from "@supabase/supabase-js";

// Kept local so the exam engine stays a self-contained module for the routes
// and test harnesses that compile it on its own. `answerPresence.ts` is the
// same definition, used by the script review and submission paths.
const EMPTY_KEYS = new Set(["version", "id", "title", "updated_at", "saved_at"]);
function answerHasWork(value: unknown, key = ""): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((entry) => answerHasWork(entry, key));
  if (typeof value !== "object") return false;
  if (EMPTY_KEYS.has(key)) return false;
  const record = value as Record<string, unknown>;
  if (record.type === "doc") return answerHasWork(record.content, "content");
  return Object.entries(record).some(([childKey, child]) => answerHasWork(child, childKey));
}
const answerIsPresent = (answer: unknown) => answerHasWork(answer);

/**
 * Absolute server deadline for an attempt. An authorized per-candidate
 * extension (exam_attempts.extension_minutes) shifts BOTH the duration cap
 * and the exam window end for that candidate, so "extra time" always means
 * exactly that many additional minutes — enforced here on the server, never
 * by a frontend countdown.
 *
 * The rule itself lives in `./examDeadline`, together with the margin that must
 * also elapse before an attempt may be closed automatically. It is re-exported
 * here because this module is the one every route already imports; there is a
 * single implementation either way.
 */
export { attemptDeadline };

/** The shape `loadAttemptContext` resolves, used by the submission lifecycle. */
export interface AttemptContext {
  attempt: Record<string, unknown> & {
    id: string;
    status: string;
    started_at: string;
    extension_minutes?: number | null;
    question_order?: unknown;
  };
  exam: {
    id: string;
    duration_minutes: number;
    ends_at: string | null;
    quiz_id: string | null;
    settings: Record<string, unknown> | null;
    organization_id?: string;
  };
  candidate: { id: string; status?: string };
}

/** Ordered rows for an attempt, honoring its stored question order. */
export async function attemptRows(
  admin: SupabaseClient,
  exam: { quiz_id: string | null; settings: Record<string, unknown> },
  attempt: { id: string; question_order: unknown },
): Promise<SessionQuestionRow[]> {
  if (!exam.quiz_id) throw new Error("Examination paper is unavailable.");
  const rows = await loadQuizQuestions(admin, exam.quiz_id, { failOnError: true });
  if (!rows.length) throw new Error("Examination paper is empty or unavailable.");
  const order = Array.isArray(attempt.question_order) ? (attempt.question_order as string[]) : [];
  if (order.length) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    if (new Set(order).size !== order.length || order.some((id) => typeof id !== "string" || !byId.has(id))) {
      throw new Error("Examination paper no longer matches the attempt.");
    }
    return order.map((id) => byId.get(id)!);
  }
  return exam.settings.randomize_questions ? randomizeQuestionRows(rows, attempt.id) : rows;
}

/** Totals and status counts from one complete grading run. */
export interface AttemptGradingSummary {
  /** Marks awarded on every resolved answer (automatic + teacher). */
  score: number;
  /** Total marks on the paper. */
  max: number;
  /** Marks awarded by automatic grading only. */
  autoScore: number;
  /** Marks whose maximum was covered by automatic grading. */
  autoMax: number;
  /** Marks covered by any resolved marking (automatic or teacher), excluding unanswered. */
  gradedMax: number;
  /** Marks covered by resolved marking, including unanswered questions scored zero. */
  resolvedMax: number;
  /** Marks still awaiting an automatic or teacher decision. */
  ungradedMax: number;
  gradedCount: number;
  humanCount: number;
  ungradedCount: number;
  unansweredCount: number;
  failedCount: number;
}

/**
 * Grade every saved answer and classify every question of the paper.
 *
 * The paper — not the saved answers — defines the maximum, so an omitted answer
 * is counted as unanswered and worth zero rather than disappearing from the
 * denominator. A question whose marking key is malformed is left unmarked with
 * `grading_failed`; it is never silently converted to zero or awarded full
 * marks. Manual items stay pending until a teacher marks them.
 */
export async function gradeAttemptDetailed(
  admin: SupabaseClient,
  attemptId: string,
  rows: SessionQuestionRow[],
): Promise<AttemptGradingSummary> {
  const { data: answers, error: answerError } = await admin.from("exam_answers").select("*").eq("attempt_id", attemptId);
  if (answerError || !answers) throw new Error("Could not load examination answers for grading.");
  const byQuestion = new Map(answers.map((a) => [a.question_id, a]));
  let score = 0;
  let max = 0;
  let autoScore = 0;
  let autoMax = 0;
  let gradedMax = 0;
  let resolvedMax = 0;
  let ungradedMax = 0;
  let gradedCount = 0;
  let humanCount = 0;
  let ungradedCount = 0;
  let unansweredCount = 0;
  let failedCount = 0;

  type AnswerUpdate = {
    id: string;
    is_correct: boolean | null;
    points_awarded: number | null;
    grading_status: "auto_graded" | "not_graded" | "grading_failed" | "unanswered" | "human_graded";
    grading_note: string | null;
    part_scores?: Record<string, unknown>;
  };

  // Calculate every result before any writes, so a malformed key cannot leave
  // the attempt half-marked.
  const updates: AnswerUpdate[] = [];
  for (const row of rows) {
    const q = row.questions;
    const maxPoints = Number(row.points ?? q.points);
    if (!Number.isFinite(maxPoints) || maxPoints < 0) throw new Error("Invalid examination question points.");
    max += maxPoints;
    const saved = byQuestion.get(q.id);
    if (!saved || !answerIsPresent(saved.answer)) {
      unansweredCount++;
      resolvedMax += maxPoints;
      if (saved) {
        updates.push({
          id: saved.id,
          is_correct: null,
          points_awarded: null,
          grading_status: "unanswered",
          grading_note: "No response was saved for this question.",
        });
      }
      continue;
    }
    if (saved.marked_by) {
      const humanPoints = Number(saved.points_awarded);
      if (saved.points_awarded === null || !Number.isFinite(humanPoints) || humanPoints < 0 || humanPoints > maxPoints)
        throw new Error("Invalid human examination mark.");
      score += humanPoints;
      gradedMax += maxPoints;
      resolvedMax += maxPoints;
      gradedCount++;
      humanCount++;
      continue;
    }
    let scored: ReturnType<typeof scoreAnswer>;
    try {
      scored = scoreAnswer({ type: q.type, points: q.points, config: q.config }, q.question_options,
        (saved.answer ?? {}) as Record<string, unknown>, row.points);
    } catch (error) {
      // A stale option, malformed marking key or unsupported payload is not a
      // candidate zero. Record the failure on that answer and keep grading the
      // rest; the script review shows the exact reason.
      if (!(error instanceof ScoringError)) throw error;
      failedCount++;
      ungradedMax += maxPoints;
      updates.push({
        id: saved.id,
        is_correct: null,
        points_awarded: null,
        grading_status: "grading_failed",
        grading_note: "The saved response could not be checked against this question's marking key. It has not been scored.",
      });
      continue;
    }
    if (scored.isCorrect === null) {
      ungradedCount++;
      ungradedMax += maxPoints;
      updates.push({
        id: saved.id,
        is_correct: null,
        points_awarded: null,
        grading_status: "not_graded",
        grading_note: "This response requires a teacher's mark.",
      });
      continue;
    }
    updates.push({
      id: saved.id,
      is_correct: scored.isCorrect,
      points_awarded: scored.points,
      grading_status: "auto_graded",
      grading_note: null,
    });
    score += scored.points;
    autoScore += scored.points;
    autoMax += maxPoints;
    gradedMax += maxPoints;
    resolvedMax += maxPoints;
    gradedCount++;
  }
  for (const update of updates) {
    const { data: updated, error: updateError } = await admin
      .from("exam_answers")
      .update(update)
      .eq("id", update.id)
      .is("marked_by", null)
      .select("id")
      .maybeSingle();
    // Separate DB writes remain non-atomic if a later write fails.
    if (updateError || !updated) throw new Error("Could not persist examination grading.");
  }
  return {
    score: Math.round(score * 100) / 100,
    max,
    autoScore: Math.round(autoScore * 100) / 100,
    autoMax,
    gradedMax,
    resolvedMax,
    ungradedMax,
    gradedCount,
    humanCount,
    ungradedCount,
    unansweredCount,
    failedCount,
  };
}

/**
 * Backward-compatible totals used by the submit route and the scheduled sweep.
 * Rich status counts live on `gradeAttemptDetailed`, which the submission path
 * stores alongside the score.
 */
export async function gradeAttempt(
  admin: SupabaseClient,
  attemptId: string,
  rows: SessionQuestionRow[],
): Promise<{ score: number; max: number }> {
  const summary = await gradeAttemptDetailed(admin, attemptId, rows);
  return { score: summary.score, max: summary.max };
}

export async function loadAttemptContext(admin: SupabaseClient, attemptId: string, token: string) {
  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("access_token", token)
    .maybeSingle();
  if (!attempt) return null;
  const { data: exam } = await admin.from("exams").select("*").eq("id", attempt.exam_id).single();
  const { data: candidate } = await admin
    .from("exam_candidates")
    .select("*")
    .eq("id", attempt.candidate_id)
    .single();
  return { attempt, exam, candidate };
}
