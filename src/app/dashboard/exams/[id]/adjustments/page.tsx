import { notFound } from "next/navigation";
import { isUuid } from "@/lib/scoreAdjustmentsServer";
import WorkspaceScoreAdjustmentsPage from "@/app/dashboard/score-adjustments/page";

export const dynamic = "force-dynamic";

/**
 * Per-examination entry point. Deliberately delegates to the single workspace
 * studio (`/dashboard/score-adjustments`) rather than duplicating it, so there
 * is exactly one Score Adjustment implementation, one authorization path and
 * one set of numbers.
 */
export default async function ExamScoreAdjustmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return WorkspaceScoreAdjustmentsPage({
    searchParams: Promise.resolve({ exam: id }),
  });
}
