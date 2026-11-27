import { notFound, redirect } from "next/navigation";
import { activeOrg, requireUser } from "@/lib/auth";
import {
  authorizeAssessmentActor,
  loadConsolidationContext,
} from "@/lib/assessmentContributionsServer";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ConsolidationClient } from "@/components/assessments/ConsolidationClient";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Grade Consolidation Engine for one examination.
 *
 * The original examination score, the signed adjustment ledger, the
 * supplementary assessment scores and the consolidated value are kept as four
 * separate figures end to end — this page never writes to `exam_attempts`,
 * `exam_answers`, the paper or any publication flag.
 */
export default async function ExamConsolidationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const ctx = await requireUser();
  const org = activeOrg(ctx);
  const isSuper = ctx.profile.platform_role === "super_admin";
  if (!org || (!isSuper && org.status !== "active")) redirect("/dashboard");

  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "exam_results", "/dashboard?e=module");

  const admin = createAdminClient();
  const auth = await authorizeAssessmentActor(ctx, org.id, "view");
  if (!auth.allowed) redirect("/dashboard?e=forbidden");

  const context = await loadConsolidationContext(admin, ctx, org.id, id);
  if (!context) notFound();

  const editAuth = await authorizeAssessmentActor(ctx, org.id, "edit");
  const publishAuth = await authorizeAssessmentActor(ctx, org.id, "publish");

  return (
    <div>
      <PageTitle
        eyebrow="Academic Assessment Layer"
        title="Grade Consolidation"
        subtitle="Choose the consolidation method, select and weight the contributing assessments, preview the calculation, compare it with the original examination result, then publish. Invalid weights, missing scores and duplicate contributions are reported instead of silently producing a wrong number."
      />
      <ConsolidationClient
        examId={context.exam.id}
        examTitle={context.exam.title}
        resultsPublished={context.exam.resultsPublished}
        assessments={context.assessments.map((assessment) => ({
          id: assessment.id,
          title: assessment.title,
          categoryLabel: assessment.categoryLabel,
          maxScore: assessment.maxScore,
          weight: assessment.weight,
          pointValue: assessment.pointValue,
          criterionCode: assessment.criterionCode,
          included: assessment.included,
          recordedCount: Object.values(assessment.scoresByAttempt).filter((score) => score !== null).length,
        }))}
        attempts={context.attempts.map((attempt) => ({
          attemptId: attempt.attemptId,
          candidateName: attempt.candidateName,
          originalExamScore: attempt.originalExamScore,
          examMaxScore: attempt.examMaxScore,
          adjustmentTotal: attempt.adjustmentTotal,
        }))}
        profiles={context.profiles}
        canEdit={editAuth.allowed}
        canPublish={publishAuth.allowed}
        readOnly={auth.readOnly}
      />
    </div>
  );
}
