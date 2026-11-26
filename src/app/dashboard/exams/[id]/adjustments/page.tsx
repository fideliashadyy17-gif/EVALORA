import { notFound, redirect } from "next/navigation";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperateMany } from "@/lib/operationalAccess";
import { isUuid, loadExamScoreAdjustmentContext } from "@/lib/scoreAdjustmentsServer";
import { createAdminClient } from "@/lib/supabase/server";
import { ScoreAdjustmentPanel } from "@/components/exam/ScoreAdjustmentPanel";
import { ButtonLink, PageTitle } from "@/components/ui";
import { ArrowLeft, ClipboardList, History } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ExamScoreAdjustmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const ctx = await requireUser();
  const org = activeOrg(ctx);
  const isSuper = ctx.profile.platform_role === "super_admin";
  if (!org || (!isSuper && org.status !== "active")) {
    redirect("/dashboard");
  }

  const roleLower = String(org.role ?? "").toLowerCase();
  if (!isSuper && ["student", "candidate", "parent", "participant"].includes(roleLower)) {
    redirect("/dashboard");
  }

  const perms = await canOperateMany(ctx, org.id, {
    canViewGrading: { permission: "grading.view", module: "exam_results" },
    canViewResults: { permission: "results.view", module: "exam_results" },
    canGrade: { permission: "grading.edit", module: "exam_results" },
  });
  if (!perms.canViewGrading && !perms.canViewResults && !perms.canGrade) {
    redirect(`/dashboard/exams/${id}`);
  }

  const admin = createAdminClient();
  const context = await loadExamScoreAdjustmentContext(admin, id, {
    requiredOrganizationId: org.id,
  });
  if (!context) notFound();

  const canApply = Boolean(perms.canGrade) && (isSuper || roleLower !== "school_founder");

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Institution Examination Governance"
        title="Score Adjustment"
        subtitle="Apply controlled, audited pre-validation score adjustments by grading criterion, section, or overall examination score."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href={`/dashboard/exams/${id}`} variant="outline">
              <ArrowLeft className="h-4 w-4" /> Back to exam
            </ButtonLink>
            <ButtonLink href={`/dashboard/exams/${id}/grades`} variant="outline">
              <History className="h-4 w-4" /> Grade ledger
            </ButtonLink>
            <ButtonLink href={`/dashboard/results?exam=${id}`} variant="outline">
              <ClipboardList className="h-4 w-4" /> Results management
            </ButtonLink>
          </div>
        }
      />

      <ScoreAdjustmentPanel
        initialContext={context}
        apiEndpoint={`/api/dashboard/exams/${id}/score-adjustments`}
        canApply={canApply}
      />
    </div>
  );
}
