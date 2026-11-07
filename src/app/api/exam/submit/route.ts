import { attemptDeadline, attemptRows, gradeAttempt, loadAttemptContext } from "@/lib/exam";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  attempt_id: z.string().uuid(),
  token: z.string().uuid(),
  confirmation: z.literal("candidate_confirmed"),
});

/**
 * Candidate-confirmed final submission: this endpoint accepts only the
 * explicit confirmation payload sent by the submit-confirmation button. It is
 * deliberately separate from integrity-event recording; incidents never call
 * or authorize this endpoint. Deadline auto-submission is handled separately
 * by the state route and only after its server-verified deadline.
 *
 * This endpoint grades objective items on the server and locks the attempt.
 * The official deadline is computed here from started_at, the
 * examination duration/window and any authorized extension. A request
 * received after that instant cannot be recorded as an on-time manual
 * submission: only previously autosaved answers are graded, and the
 * attempt is closed as auto_submitted at the deadline itself.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, parsed.data.attempt_id, parsed.data.token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  const { attempt, exam, candidate } = ctx;
  if (!exam || !candidate) return NextResponse.json({ error: "Examination data is unavailable." }, { status: 500 });

  if (attempt.status !== "in_progress") {
    return NextResponse.json({ ok: true, already_submitted: true, status: attempt.status });
  }

  const now = new Date();
  const deadline = attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0));
  const late = now.getTime() >= deadline.getTime();
  const finalStatus = late ? "auto_submitted" : "submitted";
  const submittedAt = late ? deadline : now;

  let result: Awaited<ReturnType<typeof gradeAttempt>>;
  try {
    const rows = await attemptRows(admin, exam, attempt);
    result = await gradeAttempt(admin, attempt.id, rows);
  } catch {
    return NextResponse.json({ error: "Could not confirm grading. Reload or contact your invigilator." }, { status: 500 });
  }
  const { score, max } = result;

  const { data: closed, error } = await admin
    .from("exam_attempts")
    .update({
      status: finalStatus,
      submitted_at: submittedAt.toISOString(),
      submission_reason: late ? "deadline" : "candidate_confirmed",
      score,
      max_score: max,
    })
    .eq("id", attempt.id)
    .eq("status", "in_progress").select("id").maybeSingle();
  if (error || !closed) return NextResponse.json({ error: "Could not submit this attempt." }, { status: 500 });
  const { error: candidateError } = await admin.from("exam_candidates").update({ status: "submitted" }).eq("id", candidate.id);
  if (candidateError) return NextResponse.json({ error: "The examination closed but its status could not be fully confirmed. Reload or contact your invigilator." }, { status: 500 });

  const resultsPublished = Boolean((exam.settings as Record<string, unknown>)?.results_published);
  return NextResponse.json({
    ok: true,
    status: finalStatus,
    submission_reason: late ? "deadline" : "candidate_confirmed",
    auto_submitted: late,
    submitted_at: submittedAt.toISOString(),
    deadline: deadline.toISOString(),
    score: resultsPublished ? score : null,
    max_score: resultsPublished ? max : null,
    results_published: resultsPublished,
  });
}
