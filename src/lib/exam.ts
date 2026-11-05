import { loadQuizQuestions, seededShuffle, type SessionQuestionRow } from "./live";
import { scoreAnswer } from "./scoring";
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

/** Grade every saved answer; returns totals. Manual items stay unmarked. */
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

  for (const row of rows) {
    const q = row.questions;
    const maxPoints = Number(row.points ?? q.points);
    if (!Number.isFinite(maxPoints) || maxPoints < 0) throw new Error("Invalid examination question points.");
    max += maxPoints;
    const saved = byQuestion.get(q.id);
    if (!saved) continue;
    if (saved.marked_by) {
      score += Number(saved.points_awarded ?? 0);
      continue; // human mark stands
    }
    const scored = scoreAnswer(
      { type: q.type, points: q.points, config: q.config },
      q.question_options,
      (saved.answer ?? {}) as Record<string, unknown>,
      row.points,
    );
    const { data: updated, error: updateError } = await admin
      .from("exam_answers")
      .update({ is_correct: scored.isCorrect, points_awarded: scored.isCorrect === null ? null : scored.points })
      .eq("id", saved.id)
      .is("marked_by", null)
      .select("id")
      .maybeSingle();
    // Do not overwrite a concurrent human mark or confirm a grade that did
    // not persist. Earlier per-answer writes can still have succeeded.
    if (updateError || !updated) throw new Error("Could not persist examination grading.");
    score += scored.isCorrect === null ? 0 : scored.points;
  }
  return { score: Math.round(score * 100) / 100, max };
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
