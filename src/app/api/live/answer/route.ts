import {
  effectivePhase,
  loadQuizQuestions,
  questionDeadlineAt,
  questionDurationSeconds,
  seededShuffle,
} from "@/lib/live";
import { hasAnswerContent, scoreAnswer, type AnswerPayload } from "@/lib/scoring";
import { publishFinishedLiveParticipant } from "@/lib/liveResults";
import { createAdminClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  participant_id: z.string().uuid(),
  token: z.string().uuid(),
  quiz_question_id: z.string().uuid(),
  answer: z.record(z.string(), z.unknown()),
});

const GRACE_MS = 2000;

async function persistParticipantProgress(
  admin: SupabaseClient,
  input: { sessionId: string; participantId: string; mode: string; questionIndex: number; totalQuestions: number; currentIndex: number },
) {
  const { data: answers, error: answersError } = await admin.from("participant_answers")
    .select("points_awarded").eq("session_id", input.sessionId).eq("participant_id", input.participantId);
  if (answersError || !answers) throw new Error("Could not confirm participant score.");
  const patch: Record<string, unknown> = {
    score: Math.round(answers.reduce((sum, row) => sum + Number(row.points_awarded ?? 0), 0) * 100) / 100,
    last_seen_at: new Date().toISOString(),
  };
  if (input.mode === "self_paced") {
    const next = Math.max(input.currentIndex, input.questionIndex + 1);
    patch.current_index = next;
    if (next >= input.totalQuestions) patch.status = "finished";
  }
  const { data: updated, error } = await admin.from("session_participants")
    .update(patch).eq("id", input.participantId).eq("session_id", input.sessionId)
    .select("id, status").maybeSingle();
  if (error || !updated) throw new Error("Could not persist participant progress.");
  return updated;
}

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
  if (!participant || ["rejected", "blocked"].includes(participant.status))
    return NextResponse.json({ error: "Participant not found." }, { status: 404 });

  // Re-check approved qualification / organization / event / phase / class on
  // every submission as well as every state poll. This is a backend gate.
  const { data: verdict } = await admin.rpc("verify_participant_phase_admission", { p_participant_id: participant.id });
  const admission = (verdict ?? null) as { allowed?: boolean; reason?: string } | null;
  if (!admission?.allowed)
    return NextResponse.json({ error: admission?.reason ?? "Admission is restricted to approved candidates." }, { status: 403 });

  if (["pending", "joined"].includes(participant.status))
    return NextResponse.json({ error: "Your entry is waiting for organizer approval." }, { status: 403 });

  const { data: session } = await admin.from("quiz_sessions").select("*").eq("id", participant.session_id).single();
  if (session.status !== "live")
    return NextResponse.json({ error: "The session is not live." }, { status: 409 });

  const { data: quiz } = await admin.from("quizzes").select("settings").eq("id", session.quiz_id).single();
  const quizSettings = (quiz?.settings ?? {}) as Record<string, unknown>;
  const sessionSettings = (session.settings ?? {}) as Record<string, unknown>;
  const correctionsPublished = typeof sessionSettings.corrections_published === "boolean"
    ? sessionSettings.corrections_published
    : quizSettings.corrections_published !== false;
  const rows = await loadQuizQuestions(admin, session.quiz_id);
  const effectiveRows =
    session.mode === "self_paced" && quizSettings.randomize_questions
      ? seededShuffle(rows, participant.id)
      : rows;

  const { data: priorAnswer } = await admin.from("participant_answers")
    .select("is_correct, points_awarded, answer")
    .eq("participant_id", participant.id).eq("quiz_question_id", quiz_question_id).maybeSingle();
  if (priorAnswer) {
    const priorIndex = effectiveRows.findIndex((item) => item.id === quiz_question_id);
    if (priorIndex >= 0) {
      const updated = await persistParticipantProgress(admin, {
        sessionId: session.id, participantId: participant.id, mode: session.mode,
        questionIndex: priorIndex, totalQuestions: effectiveRows.length, currentIndex: Number(participant.current_index ?? 0),
      }).catch(() => null);
      if (!updated) return NextResponse.json({ error: "Your answer is saved, but progress could not be confirmed. Reconnect and retry." }, { status: 500 });
      if (updated.status === "finished") await publishFinishedLiveParticipant(admin, session.id, participant.id);
    }
    if (session.mode === "synchronized") return NextResponse.json({ ok: true, duplicate: true, submitted: true });
    return NextResponse.json({
      ok: true, duplicate: true, submitted: true,
      ...(correctionsPublished ? {
        is_correct: priorAnswer.is_correct,
        points_awarded: Number(priorAnswer.points_awarded),
        explanation: effectiveRows.find((item) => item.id === quiz_question_id)?.questions.explanation ?? null,
        explanation_doc: effectiveRows.find((item) => item.id === quiz_question_id)?.questions.explanation_doc ?? null,
      } : {}),
    });
  }

  const expectedIndex =
    session.mode === "synchronized" ? session.current_question_index : participant.current_index;
  const row = effectiveRows[expectedIndex];
  if (!row || row.id !== quiz_question_id)
    return NextResponse.json({ error: "That question is no longer active." }, { status: 409 });

  const timeLimit = questionDurationSeconds(row, quizSettings);
  const now = Date.now();
  let responseMs: number | null = null;
  let speedFactor = 1;

  if (session.mode === "synchronized") {
    const phase = effectivePhase(session, row, quizSettings, new Date(now));
    if (phase === "countdown")
      return NextResponse.json({ error: "This question has not opened yet." }, { status: 409 });
    if (phase !== "question")
      return NextResponse.json({ error: "Answers are closed for this question." }, { status: 409 });

    const started = session.question_started_at ? new Date(session.question_started_at).getTime() : now;
    responseMs = now - started;
    if (responseMs < 0)
      return NextResponse.json({ error: "This question has not opened yet." }, { status: 409 });
    const deadlineValue = questionDeadlineAt(session, row, quizSettings);
    const deadline = deadlineValue ? new Date(deadlineValue).getTime() : started + timeLimit * 1000;
    if (now > deadline + GRACE_MS)
      return NextResponse.json({ error: "Time expired for this question." }, { status: 409 });
    // Faster correct answers earn more: 100% → 50% of the points across the window.
    speedFactor = 1 - 0.5 * Math.min(1, Math.max(0, responseMs / (timeLimit * 1000)));
  }

  const q = row.questions;
  let scored: ReturnType<typeof scoreAnswer>;
  try {
    scored = scoreAnswer(
      { type: q.type, points: q.points, config: q.config },
      q.question_options,
      answer as AnswerPayload,
      row.points,
    );
  } catch {
    return NextResponse.json({ error: "This answer could not be verified. Contact the organizer." }, { status: 409 });
  }
  const correct = scored.isCorrect === null && q.type === "open_ended" && !hasAnswerContent(answer)
    ? false
    : scored.isCorrect;
  const awarded = correct === null ? 0 : Math.round(scored.points * speedFactor * 100) / 100;

  const { error } = await admin.from("participant_answers").insert({
    session_id: session.id,
    participant_id: participant.id,
    quiz_question_id: row.id,
    question_id: q.id,
    answer,
    is_correct: correct,
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
    if (existing) {
      const updated = await persistParticipantProgress(admin, {
        sessionId: session.id, participantId: participant.id, mode: session.mode,
        questionIndex: expectedIndex, totalQuestions: effectiveRows.length, currentIndex: Number(participant.current_index ?? 0),
      }).catch(() => null);
      if (updated?.status === "finished") await publishFinishedLiveParticipant(admin, session.id, participant.id);
      if (session.mode === "synchronized") return NextResponse.json({ ok: true, duplicate: true, submitted: true });
      return NextResponse.json({
        ok: true, duplicate: true, submitted: true,
        ...(correctionsPublished ? {
          is_correct: existing.is_correct,
          points_awarded: Number(existing.points_awarded),
          explanation: q.explanation, explanation_doc: q.explanation_doc ?? null,
        } : {}),
      });
    }
    return NextResponse.json({ error: "Could not record your answer." }, { status: 500 });
  }

  const updatedParticipant = await persistParticipantProgress(admin, {
    sessionId: session.id, participantId: participant.id, mode: session.mode,
    questionIndex: expectedIndex, totalQuestions: effectiveRows.length, currentIndex: Number(participant.current_index ?? 0),
  }).catch(() => null);
  if (!updatedParticipant) return NextResponse.json({ error: "Your answer is saved, but progress could not be confirmed. Reconnect and retry." }, { status: 500 });
  if (updatedParticipant.status === "finished") await publishFinishedLiveParticipant(admin, session.id, participant.id);

  if (session.mode === "synchronized") {
    // Correctness, earned points and the explanation are released by
    // the organizer in answer-reveal phase, not at submission time.
    return NextResponse.json({ ok: true, submitted: true, response_ms: responseMs });
  }

  return NextResponse.json({
    ok: true,
    submitted: true,
    ...(correctionsPublished ? {
      is_correct: scored.isCorrect,
      points_awarded: awarded,
      explanation: q.explanation, explanation_doc: q.explanation_doc ?? null,
    } : {}),
    needs_marking: correct === null && q.type === "open_ended",
  });
}
