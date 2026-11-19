import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { GradingPoller } from "./GradingPoller";

/**
 * Premium result-processing gateway.
 *
 * After a student submits, the server grades the attempt synchronously inside
 * `applyDeadlineSubmission`. This page confirms grading is complete and hands
 * off to the result screen. If grading is somehow still in progress, the
 * client polls until it lands.
 */
export default async function ProcessingPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, status, grading_status, score, max_score, submitted_at")
    .eq("id", attemptId)
    .maybeSingle();

  if (!attempt) redirect(`/exam-access`);

  const graded =
    attempt.status === "submitted" ||
    attempt.status === "auto_submitted" ||
    attempt.grading_status === "graded" ||
    attempt.grading_status === "grading_failed";

  if (graded) {
    redirect(`/take-exam/${attemptId}/result`);
  }

  return <GradingPoller attemptId={attemptId} />;
}
