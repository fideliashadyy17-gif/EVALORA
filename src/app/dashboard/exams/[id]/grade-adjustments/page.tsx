import { notFound, redirect } from "next/navigation";
import { activeOrg, requireUser } from "@/lib/auth";
import {
  authorizeAssessmentActor,
  loadAdjustmentLedgerContext,
} from "@/lib/assessmentContributionsServer";
import { loadExamScoreAdjustmentContext } from "@/lib/scoreAdjustmentsServer";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { GradeAdjustmentLedgerClient } from "@/components/assessments/GradeAdjustmentLedgerClient";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Unlimited individual grade adjustments for one examination.
 *
 * Distinct from `/dashboard/exams/[id]/adjustments`, which is the Institution
 * batch studio with its one-adjustment-per-category ceiling. Both layers keep
 * their own immutable ledger and both leave the original examination score on
 * `exam_attempts.score` untouched.
 *
 * The adjustable criterion catalogue (and each criterion's real maximum on this
 * paper, including split-criterion questions) is read through the EXISTING
 * `loadExamScoreAdjustmentContext`, so both layers can never disagree about what
 * Criterion A is worth.
 */
export default async function ExamGradeAdjustmentsPage({
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

  const [context, adjustmentContext] = await Promise.all([
    loadAdjustmentLedgerContext(admin, ctx, org.id, id),
    loadExamScoreAdjustmentContext(admin, id, { requiredOrganizationId: org.id }),
  ]);
  if (!context) notFound();

  const criteria = (adjustmentContext?.categories ?? [])
    .filter((category) => category.categoryType === "myp_criterion")
    .map((category) => ({
      code: category.categoryKey,
      label: category.categoryLabel,
      maxScore: category.maxScore,
    }));

  const fallbackCriteria =
    criteria.length > 0
      ? criteria
      : ["A", "B", "C", "D"].map((code) => ({ code, label: `Criterion ${code}`, maxScore: 0 }));

  return (
    <div>
      <PageTitle
        eyebrow="Academic Assessment Layer"
        title="Individual Grade Adjustments"
        subtitle="Record as many individual adjustments as legitimately necessary — per student, per criterion, positive or negative — each with its reason, actor, original value and adjusted value. The original examination score is preserved and never overwritten."
      />
      <GradeAdjustmentLedgerClient context={context} readOnly={auth.readOnly} criteria={fallbackCriteria} />
    </div>
  );
}
