import { ExamResultClient } from "./ExamResultClient";

export const dynamic = "force-dynamic";

/**
 * The candidate's own result screen.
 *
 * Reached automatically the instant a paper is submitted — the exam runner
 * navigates here rather than leaving the student to hunt for a mark. The
 * attempt id and access token travel in the query string, so no session or
 * staff role is needed to read it.
 */
export default async function ExamResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { attemptId } = await params;
  const { t } = await searchParams;

  if (!t) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-10">
        <p className="text-sm text-ink-soft">
          This result page can only be opened from the examination you submitted.
        </p>
      </div>
    );
  }

  return <ExamResultClient attemptId={attemptId} token={t} entryHref="/exam-access" />;
}
