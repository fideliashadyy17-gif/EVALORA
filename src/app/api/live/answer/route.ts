import { loadQuizQuestions, seededShuffle } from "@/lib/live";
import { scoreAnswer, type AnswerPayload } from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  participant_id: z.string().uuid(),
  token: z.string().uuid(),
  quiz_question_id: z.string().uuid(),
  answer: z.record(z.string(), z.unknown()),
});

const GRACE_MS = 2000;

/**
 * Server-authoritative answer submission:
 *  - validates the participant token and that this is THE current question
 *  - enforces the server-side time window (synchronized mode)
 *  - scores objective questions on the server, with a speed factor in sync mode
 *  - idempotent via the unique (participant, question) constraint
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { participant_id, token, quiz_question_id, answer } = parsed.data;

  const admin = createAdminClient();
  const { data: participant } = await admin
    .from("session_participants")
    .select("*")
    .eq("id", participant_id)
    .eq("access_token", token)
    .maybeSingle();
  if (!participant || participant.status === "rejected")
    return NextResponse.json({ error: "Participant not found." }, { status: 404 });

  const { data: session } = await admin.from("quiz_sessions").select("*").eq("id", participant.session_id).single();
  if (session.status !== "live")
    return NextResponse.json({ error: "The session is not live." }, { status: 409 });

  const { data: quiz } = await admin.from("quizzes").select("settings").eq("id", session.quiz_id).single();
  const quizSettings = (quiz?.settings ?? {}) as Record<string, unknown>;
  const rows = await loadQuizQuestions(admin, session.quiz_id);
  const effectiveRows =
    session.mode === "self_paced" && quizSettings.randomize_questions
      ? seededShuffle(rows, participant.id)
      : rows;

  const expectedIndex =
    session.mode === "synchronized" ? session.current_question_index : participant.current_index;
  const row = effectiveRows[expectedIndex];
  if (!row || row.id !== quiz_question_id)
    return NextResponse.json({ error: "That question is no longer active." }, { status: 409 });

  const timeLimit = Number(row.time_limit_seconds ?? quizSettings.time_per_question_seconds ?? 30);
  const now = Date.now();
  let responseMs: number | null = null;
  let speedFactor = 1;

  if (session.mode === "synchronized") {
    const started = session.question_started_at ? new Date(session.question_started_at).getTime() : now;
    responseMs = now - started;
    if (responseMs > timeLimit * 1000 + GRACE_MS)
      return NextResponse.json({ error: "Time expired for this question." }, { status: 409 });
    // Faster correct answers earn more: 100% → 50% of the points across the window.
    speedFactor = 1 - 0.5 * Math.min(1, Math.max(0, responseMs / (timeLimit * 1000)));
  }

  const q = row.questions;
  const scored = scoreAnswer(
    { type: q.type, points: q.points, config: q.config },
    q.question_options,
    answer as AnswerPayload,
    row.points,
  );
  const awarded =
    scored.isCorrect === null ? 0 : Math.round(scored.points * speedFactor * 100) / 100;

  const { error } = await admin.from("participant_answers").insert({
    session_id: session.id,
    participant_id: participant.id,
    quiz_question_id: row.id,
    question_id: q.id,
    answer,
    is_correct: scored.isCorrect,
    points_awarded: awarded,
    response_ms: responseMs,
  });

  if (error) {
    // Duplicate → idempotent replay of the original result
    const { data: existing } = await admin
      .from("participant_answers")
      .select("is_correct, points_awarded")
      .eq("participant_id", participant.id)
      .eq("quiz_question_id", row.id)
      .maybeSingle();
    if (existing)
      return NextResponse.json({
        ok: true,
        duplicate: true,
        is_correct: existing.is_correct,
        points_awarded: Number(existing.points_awarded),
        explanation: q.explanation,
      });
    return NextResponse.json({ error: "Could not record your answer." }, { status: 500 });
  }

  const patch: Record<string, unknown> = {
    score: Number(participant.score) + awarded,
    last_seen_at: new Date().toISOString(),
  };
  if (session.mode === "self_paced") {
    const next = participant.current_index + 1;
    patch.current_index = next;
    if (next >= effectiveRows.length) patch.status = "finished";
  }
  await admin.from("session_participants").update(patch).eq("id", participant.id);

  return NextResponse.json({
    ok: true,
    is_correct: scored.isCorrect,
    points_awarded: awarded,
    explanation: q.explanation,
    needs_marking: scored.isCorrect === null && q.type === "open_ended",
  });
}
