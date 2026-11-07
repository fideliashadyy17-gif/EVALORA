import { attemptRows, gradeAttempt } from "@/lib/exam";
import {
  publishAutomaticExamAttempt,
  recordExamResultEvent,
  resultPublicationMode,
} from "@/lib/resultPublication";
import type { SupabaseClient } from "@supabase/supabase-js";

type SubmissionInput = {
  admin: SupabaseClient;
  exam: { id: string; organization_id: string; quiz_id: string | null; result_publication_mode?: string | null; settings: Record<string, unknown> };
  attempt: { id: string; candidate_id: string; status: string; started_at: string; question_order: unknown; extension_minutes?: number | null };
  candidateId: string;
  finalStatus: "submitted" | "auto_submitted";
  submittedAt: Date;
  reason: "candidate_confirmed" | "deadline";
};

/** Persist submission and grading independently from the browser's reported score. */
export async function submitAndGradeExamAttempt(input: SubmissionInput) {
  const { admin, exam, attempt } = input;
  const started = Date.now();
  let grade: Awaited<ReturnType<typeof gradeAttempt>> | null = null;
  let gradingError: string | null = null;
  try {
    const rows = await attemptRows(admin, exam, attempt);
    grade = await gradeAttempt(admin, attempt.id, rows);
  } catch (error) {
    gradingError = error instanceof Error ? error.message.slice(0, 500) : "Automatic grading failed.";
  }

  if (gradingError || !grade) {
    await recordExamResultEvent(admin, {
      organization_id: exam.organization_id,
      exam_id: exam.id,
      attempt_id: attempt.id,
      event_type: "grading_failed",
      metadata: { error: gradingError ?? "Automatic grading failed.", submission_finalized: false },
    });
    // Preserve the pre-existing submission guard: a failed grade must not
    // close or lock the candidate's attempt. The candidate can retry safely.
    throw new Error("Automatic grading failed; the attempt remains open.");
  }
  const gradingStatus = grade.pendingManualCount > 0 ? "awaiting_manual_grading" : "graded";
  const patch = {
    status: input.finalStatus,
    submitted_at: input.submittedAt.toISOString(),
    submission_reason: input.reason,
    score: grade?.score ?? null,
    max_score: grade?.max ?? null,
    auto_score: grade?.autoScore ?? null,
    auto_max_score: grade?.autoMax ?? null,
    pending_manual_count: grade?.pendingManualCount ?? 0,
    grading_status: gradingStatus,
    grading_error: gradingError,
  };
  const { data: closed, error: closeError } = await admin.from("exam_attempts")
    .update(patch)
    .eq("id", attempt.id)
    .eq("status", "in_progress")
    .select("id")
    .maybeSingle();
  if (closeError) throw new Error("Could not persist the examination submission.");
  if (!closed) {
    const { data: latest } = await admin.from("exam_attempts")
      .select("id, status, grading_status, pending_manual_count, published_at")
      .eq("id", attempt.id).maybeSingle();
    return { alreadySubmitted: Boolean(latest && latest.status !== "in_progress"), latest };
  }

  const { error: candidateError } = await admin.from("exam_candidates")
    .update({ status: "submitted" }).eq("id", input.candidateId);
  if (candidateError) throw new Error("The examination closed but candidate status could not be confirmed.");

  const gradingAndSubmissionMs = Date.now() - started;
  await recordExamResultEvent(admin, {
    organization_id: exam.organization_id,
    exam_id: exam.id,
    attempt_id: attempt.id,
    event_type: "submitted",
    metadata: { reason: input.reason, status: input.finalStatus },
  });
  if (gradingError) {
    await recordExamResultEvent(admin, {
      organization_id: exam.organization_id,
      exam_id: exam.id,
      attempt_id: attempt.id,
      event_type: "grading_failed",
      metadata: { error: gradingError },
    });
  } else if (grade) {
    await recordExamResultEvent(admin, {
      organization_id: exam.organization_id,
      exam_id: exam.id,
      attempt_id: attempt.id,
      event_type: grade.pendingManualCount > 0 ? "awaiting_manual_grading" : "auto_graded",
      metadata: {
        auto_score: grade.autoScore,
        auto_max_score: grade.autoMax,
        pending_manual_count: grade.pendingManualCount,
        grading_and_submission_ms: gradingAndSubmissionMs,
      },
    });
  }

  let published = false;
  if (!gradingError && grade && grade.pendingManualCount === 0 && resultPublicationMode(exam.result_publication_mode) === "automatic") {
    published = await publishAutomaticExamAttempt(admin, {
      organizationId: exam.organization_id,
      examId: exam.id,
      attemptId: attempt.id,
      processingMs: gradingAndSubmissionMs,
    });
  }
  const processingMs = Date.now() - started;
  return {
    alreadySubmitted: false,
    status: input.finalStatus,
    gradingStatus,
    pendingManualCount: grade?.pendingManualCount ?? 0,
    published,
    processingMs,
    gradingError,
  };
}
