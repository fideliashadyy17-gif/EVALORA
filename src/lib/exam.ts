import { loadQuizQuestions, seededShuffle, type SessionQuestionRow } from "./live";
import { hasAnswerContent, isAutoGradableQuestion, scoreAnswer } from "./scoring";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Absolute server deadline for an attempt. An authorized per-candidate
 * extension (exam_attempts.extension_minutes) shifts BOTH the duration cap
 * and the exam window end for that candidate, so "extra time" always means
 * exactly that many additional minutes — enforced here on the server, never
 * by a frontend countdown.
 */
export function attemptDeadline(
  exam: { duration_minutes: number; ends_at: string | null },
  startedAt: string,
  extensionMinutes = 0,
) {
  const ext = Math.max(0, Math.floor(extensionMinutes) || 0) * 60000;
  const byDuration = new Date(startedAt).getTime() + exam.duration_minutes * 60000 + ext;
  const byWindow = exam.ends_at ? new Date(exam.ends_at).getTime() + ext : Infinity;
  return new Date(Math.min(byDuration, byWindow));
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
  return exam.settings.randomize_questions ? seededShuffle(rows, attempt.id) : rows;
}

/** Grade every saved answer; subjective marks remain null until a teacher scores them. */
export async function gradeAttempt(
  admin: SupabaseClient,
  attemptId: string,
  rows: SessionQuestionRow[],
) {
  const { data: answers, error: answerError } = await admin.from("exam_answers").select("*").eq("attempt_id", attemptId);
  if (answerError || !answers) throw new Error("Could not load examination answers for grading.");
  const byQuestion = new Map(answers.map((a) => [a.question_id, a]));
  let score = 0;
  let max = 0;
  let autoScore = 0;
  let autoMax = 0;
  let pendingManualCount = 0;

  // Calculate every objective result before any writes. A stale option ID or
  // malformed marking key must never silently become a zero or partial grade.
  const updates: { id: string; is_correct: boolean | null; points_awarded: number | null }[] = [];
  for (const row of rows) {
    const q = row.questions;
    const maxPoints = Number(row.points ?? q.points);
    if (!Number.isFinite(maxPoints) || maxPoints < 0) throw new Error("Invalid examination question points.");
    const objectivelyGradable = isAutoGradableQuestion(q.type);
    // Slides and polls are not scored items; do not inflate a test's denominator.
    if (q.type !== "slide" && q.type !== "poll") max += maxPoints;
    if (objectivelyGradable) autoMax += maxPoints;
    const saved = byQuestion.get(q.id);
    if (!saved) continue;
    if (saved.marked_by) {
      const humanPoints = Number(saved.points_awarded);
      if (saved.points_awarded === null || !Number.isFinite(humanPoints) || humanPoints < 0 || humanPoints > maxPoints)
        throw new Error("Invalid human examination mark.");
      score += humanPoints;
      continue;
    }
    if (q.type === "open_ended" && !hasAnswerContent(saved.answer)) {
      // An empty written response is unambiguously unanswered, not a pending essay.
      updates.push({ id: saved.id, is_correct: false, points_awarded: 0 });
      continue;
    }
    const scored = scoreAnswer({ type: q.type, points: q.points, config: q.config }, q.question_options,
      (saved.answer ?? {}) as Record<string, unknown>, row.points);
    updates.push({ id: saved.id, is_correct: scored.isCorrect, points_awarded: scored.isCorrect === null ? null : scored.points });
    if (scored.isCorrect === null && q.type === "open_ended") pendingManualCount++;
    const earned = scored.isCorrect === null ? 0 : scored.points;
    score += earned;
    if (objectivelyGradable) autoScore += earned;
  }
  for (const update of updates) {
    const { data: updated, error: updateError } = await admin
      .from("exam_answers")
      .update({ is_correct: update.is_correct, points_awarded: update.points_awarded })
      .eq("id", update.id)
      .is("marked_by", null)
      .select("id")
      .maybeSingle();
    // Separate writes are retryable: a later retry safely overwrites the same objective marks.
    if (updateError || !updated) throw new Error("Could not persist examination grading.");
  }
  return {
    score: Math.round(score * 100) / 100,
    max: Math.round(max * 100) / 100,
    autoScore: Math.round(autoScore * 100) / 100,
    autoMax: Math.round(autoMax * 100) / 100,
    pendingManualCount,
  };
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
