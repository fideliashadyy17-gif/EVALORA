import { loadQuizQuestions, seededShuffle, type SessionQuestionRow } from "./live";
import { scoreAnswer } from "./scoring";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Absolute server deadline for an attempt. */
export function attemptDeadline(exam: { duration_minutes: number; ends_at: string | null }, startedAt: string) {
  const byDuration = new Date(startedAt).getTime() + exam.duration_minutes * 60000;
  const byWindow = exam.ends_at ? new Date(exam.ends_at).getTime() : Infinity;
  return new Date(Math.min(byDuration, byWindow));
}

/** Ordered rows for an attempt, honoring its stored question order. */
export async function attemptRows(
  admin: SupabaseClient,
  exam: { quiz_id: string | null; settings: Record<string, unknown> },
  attempt: { id: string; question_order: unknown },
): Promise<SessionQuestionRow[]> {
  if (!exam.quiz_id) return [];
  const rows = await loadQuizQuestions(admin, exam.quiz_id);
  const order = Array.isArray(attempt.question_order) ? (attempt.question_order as string[]) : [];
  if (order.length) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    return order.map((id) => byId.get(id)).filter(Boolean) as SessionQuestionRow[];
  }
  return exam.settings.randomize_questions ? seededShuffle(rows, attempt.id) : rows;
}

/** Grade every saved answer; returns totals. Manual items stay unmarked. */
export async function gradeAttempt(
  admin: SupabaseClient,
  attemptId: string,
  rows: SessionQuestionRow[],
) {
  const { data: answers } = await admin.from("exam_answers").select("*").eq("attempt_id", attemptId);
  const byQuestion = new Map((answers ?? []).map((a) => [a.question_id, a]));
  let score = 0;
  let max = 0;

  for (const row of rows) {
    const q = row.questions;
    const maxPoints = Number(row.points ?? q.points);
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
    await admin
      .from("exam_answers")
      .update({ is_correct: scored.isCorrect, points_awarded: scored.isCorrect === null ? null : scored.points })
      .eq("id", saved.id);
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
