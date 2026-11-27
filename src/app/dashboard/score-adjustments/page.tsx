import Link from "next/link";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperateMany } from "@/lib/operationalAccess";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { getEntitlement } from "@/lib/entitlements";
import { isScoreAdjustmentPlanEligible } from "@/lib/scoreAdjustments";
import { isUuid, loadExamScoreAdjustmentContext } from "@/lib/scoreAdjustmentsServer";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ScoreAdjustmentPanel } from "@/components/exam/ScoreAdjustmentPanel";
import { Badge, ButtonLink, Card, PageTitle } from "@/components/ui";
import { ArrowLeft, Award, ClipboardList, Info, SlidersHorizontal } from "lucide-react";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface ExamRow {
  id: string;
  title: string;
  status: string;
  settings: Record<string, unknown> | null;
  grades_published_at: string | null;
  created_at: string | null;
}

/**
 * Workspace Score Adjustment studio — the one workspace implementation.
 *
 *   /dashboard/score-adjustments            → choose an eligible examination
 *   /dashboard/score-adjustments?exam=<id>  → adjust that examination
 *
 * `/dashboard/exams/[id]/adjustments` delegates here, so there is a single
 * authorization path, a single set of numbers and no duplicated grading system.
 */
export default async function WorkspaceScoreAdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  const isSuper = ctx.profile.platform_role === "super_admin";
  if (!org || (!isSuper && org.status !== "active")) redirect("/dashboard");

  const roleLower = String(org.role ?? "").toLowerCase();
  if (!isSuper && ["student", "candidate", "parent", "participant"].includes(roleLower)) {
    redirect("/dashboard");
  }

  const perms = await canOperateMany(ctx, org.id, {
    canViewGrading: { permission: "grading.view", module: "exam_results" },
    canViewResults: { permission: "results.view", module: "exam_results" },
    canGrade: { permission: "grading.edit", module: "exam_results" },
  });
  if (!isSuper && !perms.canViewGrading && !perms.canViewResults && !perms.canGrade) {
    redirect("/dashboard?e=forbidden");
  }

  // Module activation (Plan & Module Management) gates this surface server-side:
  // disabling Results Management hides the nav entry AND blocks this page.
  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "exam_results", "/dashboard/score-adjustments?e=module");

  // The real organization entitlement decides the Institution gate — never an
  // owner bypass, and the SQL RPC re-checks the identical rule before it writes.
  const realEntitlement = await getEntitlement(supabase, org.id);
  const planEligible = isScoreAdjustmentPlanEligible(realEntitlement);

  const canApply =
    (isSuper || perms.canGrade) && (isSuper || roleLower !== "school_founder");

  const admin = createAdminClient();
  const { data: examData } = await admin
    .from("exams")
    .select("id, title, status, settings, grades_published_at, created_at")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  const exams = (examData ?? []) as ExamRow[];

  const requested = sp.exam && isUuid(sp.exam) ? sp.exam : null;
  const activeExamId =
    (requested && exams.some((e) => e.id === requested) ? requested : null) ??
    exams[0]?.id ??
    null;

  const examContext =
    planEligible && activeExamId
      ? await loadExamScoreAdjustmentContext(admin, activeExamId, {
          requiredOrganizationId: org.id,
        })
      : null;

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Institution Examination Governance"
        title="Score Adjustment"
        subtitle="Apply controlled, audited pre-validation score adjustments by MYP criterion, paper section or overall examination score. Adjustments fold silently into verified results — candidates never see an adjustment line."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href="/dashboard/exams" variant="outline">
              <ArrowLeft className="h-4 w-4" /> Examinations
            </ButtonLink>
            <ButtonLink href="/dashboard/results" variant="outline">
              <ClipboardList className="h-4 w-4" /> Results management
            </ButtonLink>
          </div>
        }
      />

      {!planEligible && (
        <Card className="border-amber-300 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-amber-900">
                Score Adjustment is an Institution plan feature
              </p>
              <p className="text-sm text-amber-900/80">
                {org.name} is currently on the <strong>{realEntitlement.planName}</strong> plan
                ({realEntitlement.status}). Controlled score adjustment is exclusively available
                on an active Institution plan.
              </p>
              <div className="pt-2">
                <ButtonLink href="/dashboard/billing" variant="outline">
                  View plans &amp; billing
                </ButtonLink>
              </div>
            </div>
          </div>
        </Card>
      )}

      {planEligible && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-evergreen-900/10 pb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-evergreen-700" />
              <h2 className="text-sm font-bold text-evergreen-950">Select examination</h2>
            </div>
            <Badge tone="green">
              Institution · {exams.length} examination{exams.length === 1 ? "" : "s"}
            </Badge>
          </div>

          {exams.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">
              This organization has no examinations yet. Create an examination to use Score
              Adjustment.
            </p>
          ) : (
            <div className="mt-4 grid max-h-72 gap-1.5 overflow-y-auto pr-1">
              {exams.map((e) => {
                const settings = (e.settings ?? {}) as Record<string, unknown>;
                const published =
                  settings.results_published === true || Boolean(e.grades_published_at);
                const validated = settings.results_validated === true;
                const archived = settings.archived === true;
                const active = e.id === activeExamId;
                return (
                  <Link
                    key={e.id}
                    href={`/dashboard/score-adjustments?exam=${e.id}`}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition ${
                      active
                        ? "border-evergreen-700 bg-evergreen-50 font-semibold text-evergreen-950"
                        : "border-evergreen-900/15 bg-white text-ink hover:bg-cream"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Award className="h-3.5 w-3.5 shrink-0 text-evergreen-700" />
                      <span className="truncate">{e.title}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Badge tone="gray">{e.status}</Badge>
                      <Badge tone={published ? "red" : validated ? "amber" : "green"}>
                        {published ? "Published" : validated ? "Validated" : "Pre-validation"}
                      </Badge>
                      {archived && <Badge tone="gray">Archived</Badge>}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {planEligible && examContext && (
        <ScoreAdjustmentPanel
          key={examContext.exam.id}
          initialContext={examContext}
          apiEndpoint={`/api/dashboard/exams/${examContext.exam.id}/score-adjustments`}
          canApply={canApply}
        />
      )}

      {planEligible && !examContext && exams.length > 0 && (
        <Card className="p-8 text-center text-sm text-ink-soft">
          Select an examination above to review or apply score adjustments.
        </Card>
      )}

      {/* Cross-links to the unlimited individual layer. This studio keeps its own
          ceiling of one batch adjustment per student per category; the ledger
          below it has none, and Assessment Contributions records the classroom
          work that justifies an adjustment. */}
      <Card className="p-5">
        <h2 className="text-sm font-bold text-evergreen-950">Related grading layers</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Link
            href="/dashboard/assessments"
            className="rounded-xl border border-evergreen-900/15 bg-white p-4 transition hover:border-evergreen-700/50 hover:bg-cream"
          >
            <p className="text-sm font-semibold text-evergreen-900">
              Assessment Contributions &amp; Grade Consolidation
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Record homework, class tests, projects and other classroom assessments, then consolidate them
              into examination results with a configurable, audited method.
            </p>
          </Link>
          {activeExamId && (
            <Link
              href={`/dashboard/exams/${activeExamId}/grade-adjustments`}
              className="rounded-xl border border-evergreen-900/15 bg-white p-4 transition hover:border-evergreen-700/50 hover:bg-cream"
            >
              <p className="text-sm font-semibold text-evergreen-900">Individual grade adjustments</p>
              <p className="mt-1 text-xs text-ink-soft">
                Unlimited repeated adjustments per student and per criterion, positive or negative, each with
                its reason, actor and full before/after history.
              </p>
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}
