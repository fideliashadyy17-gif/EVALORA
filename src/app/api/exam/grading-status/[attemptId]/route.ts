import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Returns whether the given attempt's grading is complete.
 *
 * Polling endpoint used by the premium processing screen while the student
 * waits for their result. Grading runs synchronously during submission, so in
 * practice the status is already "graded" when the client starts polling.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await params;

  const admin = createAdminClient();
  const { data: attempt, error } = await admin
    .from("exam_attempts")
    .select("id, status, grading_status")
    .eq("id", attemptId)
    .maybeSingle();

  if (error || !attempt) {
    return NextResponse.json({ graded: false, error: "Attempt not found" }, { status: 404 });
  }

  const graded =
    attempt.status === "submitted" ||
    attempt.status === "auto_submitted" ||
    attempt.grading_status === "graded" ||
    attempt.grading_status === "grading_failed";

  return NextResponse.json({ graded, status: attempt.status, grading_status: attempt.grading_status });
}
