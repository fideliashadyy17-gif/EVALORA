import { attemptDeadline, loadAttemptContext } from "@/lib/exam";
import { createAdminClient } from "@/lib/supabase/server";
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
  if (new Date() > attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0)))
    return NextResponse.json({ error: "Time has expired." }, { status: 409 });

  // The question must belong to this exam's paper.
  const { data: belongs } = await admin
    .from("quiz_questions")
    .select("id")
    .eq("quiz_id", exam.quiz_id)
    .eq("question_id", question_id)
    .maybeSingle();
  if (!belongs) return NextResponse.json({ error: "Question not in this paper." }, { status: 400 });
  if (quiz_question_id && quiz_question_id !== belongs.id)
    return NextResponse.json({ error: "Question does not match this paper." }, { status: 400 });

  const { error } = await admin.from("exam_answers").upsert(
    {
      attempt_id: attempt.id,
      question_id,
      // Always persist the association resolved from this examination, never
      // an unrelated quiz-question ID supplied by the client.
      quiz_question_id: belongs.id,
      answer,
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
