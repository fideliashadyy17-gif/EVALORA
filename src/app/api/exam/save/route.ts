import { attemptDeadline, loadAttemptContext } from "@/lib/exam";
import { isManuallyPaused, manualPauseMs } from "@/lib/examPause";
import { attemptAllowsQuizRow, parseTrack } from "@/lib/examTrack";
import { createAdminClient } from "@/lib/supabase/server";
import { validateAnswerPayload } from "@/lib/responseTools";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  attempt_id: z.string().uuid(),
  token: z.string().uuid(),
  question_id: z.string().uuid(),
  quiz_question_id: z.string().uuid().nullable().optional(),
  answer: z.record(z.string(), z.unknown()),
  flagged: z.array(z.string()).optional(),
});

/** Autosave one answer (and optionally the flagged list). Deadline-enforced. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { attempt_id, token, question_id, quiz_question_id, answer, flagged } = parsed.data;

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, attempt_id, token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  const { attempt, exam } = ctx;
  if (attempt.status !== "in_progress")
    return NextResponse.json({ error: "This attempt is already submitted." }, { status: 409 });
  // An organizer pause blocks composition: the answer stays in the browser's
  // save queue and syncs automatically when the pause is lifted. The pause
  // also freezes the deadline (elapsed pause joins the extension), so a paused
  // attempt can never expire mid-pause.
  const nowMs = Date.now();
  if (isManuallyPaused(attempt))
    return NextResponse.json(
      { error: "This assessment is paused by your organizer. Your answer is saved in this browser and will sync automatically when the assessment resumes.", paused: true },
      { status: 409 },
    );
  if (new Date(nowMs) > attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0), manualPauseMs(attempt, nowMs)))
    return NextResponse.json({ error: "Time has expired." }, { status: 409 });

  // The question must belong to this exam's paper.
  const { data: belongs } = await admin
    .from("quiz_questions")
    .select("id, questions(type)")
    .eq("quiz_id", exam.quiz_id)
    .eq("question_id", question_id)
    .maybeSingle();
  if (!belongs) return NextResponse.json({ error: "Question not in this paper." }, { status: 400 });
  // Server-side shape validation: a malformed or oversized structured answer
  // must not be stored, and the marking interface must never receive arbitrary
  // JSON. Legacy objective payloads keep their historical permissive shape.
  const questionType = (belongs as { questions?: { type?: string } | null }).questions?.type ?? "";
  const validated = validateAnswerPayload(questionType, answer);
  if (!validated.ok) return NextResponse.json({ error: validated.error ?? "Invalid answer." }, { status: 400 });
  if (quiz_question_id && quiz_question_id !== belongs.id)
    return NextResponse.json({ error: "Question does not match this paper." }, { status: 400 });
  // The question must also be part of THIS candidate's paper (track-filtered order),
  // so an AB attempt cannot store an answer to a BC-only item.
  if (!attemptAllowsQuizRow(attempt.question_order, belongs.id, parseTrack(attempt.track)))
    return NextResponse.json({ error: "Question not in this candidate's paper." }, { status: 400 });

  const { error } = await admin.from("exam_answers").upsert(
    {
      attempt_id: attempt.id,
      question_id,
      // Always persist the association resolved from this examination, never
      // an unrelated quiz-question ID supplied by the client.
      quiz_question_id: belongs.id,
      answer: validated.answer,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "attempt_id,question_id" },
  );
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });

  if (flagged) {
    const { error: flagError } = await admin.from("exam_attempts").update({ flagged }).eq("id", attempt.id);
    // The answer may already have been stored; do not confirm the combined
    // request when the flag update failed. A retry can re-send both values.
    if (flagError) return NextResponse.json({ error: "Could not save review flags. Please retry." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved_at: new Date().toISOString() });
}
