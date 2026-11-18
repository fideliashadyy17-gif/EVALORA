import { createAdminClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";

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
  await requireUser();

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, status, grading_status, score, max_score, submitted_at")
    .eq("id", attemptId)
    .maybeSingle();

  if (!attempt) redirect(`/take-exam/${attemptId}`);

  const graded =
    attempt.status === "submitted" ||
    attempt.status === "auto_submitted" ||
    attempt.grading_status === "graded" ||
    attempt.grading_status === "grading_failed";

  if (graded) {
    redirect(`/take-exam/${attemptId}/result`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-evergreen-50 to-paper p-4 md:p-8 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-evergreen-900/20 bg-paper shadow-[var(--shadow-card)] p-8 md:p-12 text-center">
          <div className="w-16 h-16 rounded-full border-4 border-evergreen-100 border-t-evergreen-700 animate-spin flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-evergreen-700" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2 text-evergreen-950">
            Please wait while we grade
            <br />
            your examination.
          </h1>
          <p className="text-ink-soft mb-6 text-sm leading-relaxed">
            Your answers are being carefully evaluated. Every question is
            checked automatically.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-evergreen-100 text-evergreen-800 text-xs font-bold border border-evergreen-200 mb-8">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-evergreen-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-evergreen-600"></span>
            </span>
            Grading in progress
          </div>
          <p className="text-sm font-medium text-evergreen-900 mb-8 animate-pulse">
            Great job! Your hard work matters.
          </p>
          <p className="text-xs text-ink-soft uppercase tracking-wider">
            EVALORA &bull; Automatic Grading System
          </p>
        </div>
      </div>
    </div>
  );
}
