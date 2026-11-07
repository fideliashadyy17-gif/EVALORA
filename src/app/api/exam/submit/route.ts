import { attemptDeadline, loadAttemptContext } from "@/lib/exam";
import { submitAndGradeExamAttempt } from "@/lib/examSubmission";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  attempt_id: z.string().uuid(),
  token: z.string().uuid(),
  confirmation: z.literal("candidate_confirmed"),
});

/** Candidate-confirmed submission; only the server calculates and persists marks. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, parsed.data.attempt_id, parsed.data.token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  const { attempt, exam, candidate } = ctx;
  if (!exam || !candidate) return NextResponse.json({ error: "Examination data is unavailable." }, { status: 500 });
  if (attempt.status !== "in_progress") {
    return NextResponse.json({
      ok: true,
      already_submitted: true,
      status: attempt.status,
      grading_status: attempt.grading_status,
      results_published: Boolean(attempt.published_at) || Boolean((exam.settings as Record<string, unknown>)?.results_published),
    });
  }

  const deadline = attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0));
  const late = Date.now() >= deadline.getTime();
  const result = await submitAndGradeExamAttempt({
    admin,
    exam,
    attempt,
    candidateId: candidate.id,
    finalStatus: late ? "auto_submitted" : "submitted",
    submittedAt: late ? deadline : new Date(),
    reason: late ? "deadline" : "candidate_confirmed",
  }).catch(() => null);
  if (!result) return NextResponse.json({ error: "Could not persist this submission. Your saved answers remain available; retry or contact your invigilator." }, { status: 500 });

  return NextResponse.json({
    ok: true,
    status: result.status ?? result.latest?.status ?? (late ? "auto_submitted" : "submitted"),
    grading_status: result.gradingStatus ?? result.latest?.grading_status ?? attempt.grading_status ?? "grading_failed",
    already_submitted: result.alreadySubmitted,
    submission_reason: late ? "deadline" : "candidate_confirmed",
    auto_submitted: late,
    submitted_at: (late ? deadline : new Date()).toISOString(),
    deadline: deadline.toISOString(),
    results_published: result.published ?? Boolean(result.latest?.published_at),
    manual_pending_count: result.pendingManualCount ?? result.latest?.pending_manual_count ?? 0,
    grading_error: result.gradingError ?? null,
    processing_ms: result.processingMs ?? null,
  });
}
