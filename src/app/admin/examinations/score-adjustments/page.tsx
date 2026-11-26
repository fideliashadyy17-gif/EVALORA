import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin";
import { getEntitlement } from "@/lib/entitlements";
import { isScoreAdjustmentPlanEligible } from "@/lib/scoreAdjustments";
import { isUuid, loadExamScoreAdjustmentContext } from "@/lib/scoreAdjustmentsServer";
import { createAdminClient } from "@/lib/supabase/server";
import { ScoreAdjustmentPanel } from "@/components/exam/ScoreAdjustmentPanel";
import { Badge, ButtonLink, Card, PageTitle } from "@/components/ui";
import { ClipboardList, SlidersHorizontal } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminScoreAdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; exam?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const [{ data: orgRows }, { data: examRows }] = await Promise.all([
    admin.from("organizations").select("id, name, slug, status").order("name").limit(300),
    admin
      .from("exams")
      .select("id, organization_id, title, status, settings, grades_published_at, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  const orgs = orgRows ?? [];
  const allExams = examRows ?? [];

  // Resolve real plan entitlement per organization (never ownerBypass)
  const orgPlanMap = new Map<
    string,
    { slug: string; name: string; status: string; eligible: boolean }
  >();
  await Promise.all(
    orgs.map(async (o) => {
      const ent = await getEntitlement(admin, o.id);
      orgPlanMap.set(o.id, {
        slug: ent.planSlug,
        name: ent.planName,
        status: ent.status,
        eligible: isScoreAdjustmentPlanEligible(ent),
      });
    }),
  );

  const selectedExamRow =
    (sp.exam && isUuid(sp.exam) ? allExams.find((e) => e.id === sp.exam) : null) ?? null;

  const selectedOrgId =
    (sp.org && isUuid(sp.org) ? sp.org : null) ??
    selectedExamRow?.organization_id ??
    orgs.find((o) => orgPlanMap.get(o.id)?.eligible)?.id ??
    orgs[0]?.id ??
    null;

  const filteredExams = selectedOrgId
    ? allExams.filter((e) => e.organization_id === selectedOrgId)
    : allExams;

  const activeExamId =
    selectedExamRow?.id ??
    filteredExams[0]?.id ??
    null;

  const examContext = activeExamId
    ? await loadExamScoreAdjustmentContext(admin, activeExamId)
    : null;

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Super Admin Console · Examinations"
        title="Controlled Score Adjustment"
        subtitle="Cross-organization pre-validation score adjustment studio. Strictly restricted to examinations belonging to organizations on an active Institution plan."
        action={
          <ButtonLink
            href={
              activeExamId
                ? `/admin/examinations/results?exam=${activeExamId}`
                : "/admin/examinations/results"
            }
            variant="outline"
          >
            <ClipboardList className="h-4 w-4" /> Results management
          </ButtonLink>
        }
      />

      {/* Organization & Examination Selector */}
      <Card className="p-5">
        <div className="flex items-center gap-2 border-b border-evergreen-900/10 pb-3">
          <SlidersHorizontal className="h-4 w-4 text-evergreen-700" />
          <h2 className="text-sm font-bold text-evergreen-950">
            Select Organization &amp; Examination
          </h2>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Organization
            </p>
            <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto pr-1">
              {orgs.map((o) => {
                const plan = orgPlanMap.get(o.id);
                const active = o.id === selectedOrgId;
                return (
                  <Link
                    key={o.id}
                    href={`/admin/examinations/score-adjustments?org=${o.id}`}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-evergreen-700 bg-evergreen-700 text-white"
                        : "border-evergreen-900/20 bg-white text-evergreen-950 hover:bg-evergreen-50"
                    }`}
                  >
                    <span>{o.name}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        active
                          ? "bg-white/20 text-white"
                          : plan?.eligible
                            ? "bg-evergreen-100 text-evergreen-800"
                            : "bg-stone-200 text-stone-700"
                      }`}
                    >
                      {plan?.name ?? "Free"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Examination ({filteredExams.length})
            </p>
            {filteredExams.length === 0 ? (
              <p className="text-sm text-ink-soft">No examinations found for this organization.</p>
            ) : (
              <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                {filteredExams.map((e) => {
                  const s = (e.settings ?? {}) as Record<string, unknown>;
                  const published = s.results_published === true || Boolean(e.grades_published_at);
                  const validated = s.results_validated === true;
                  const active = e.id === activeExamId;
                  return (
                    <Link
                      key={e.id}
                      href={`/admin/examinations/score-adjustments?org=${e.organization_id}&exam=${e.id}`}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                        active
                          ? "border-evergreen-700 bg-evergreen-50 font-semibold text-evergreen-950"
                          : "border-evergreen-900/15 bg-white text-ink hover:bg-cream"
                      }`}
                    >
                      <span className="truncate">{e.title}</span>
                      <Badge tone={published ? "red" : validated ? "amber" : "green"}>
                        {published ? "Published" : validated ? "Validated" : "Pre-validation"}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Main Panel */}
      {examContext ? (
        <ScoreAdjustmentPanel
          key={examContext.exam.id}
          initialContext={examContext}
          apiEndpoint={`/api/admin/examinations/${examContext.exam.id}/score-adjustments`}
          canApply={true}
        />
      ) : (
        <Card className="p-8 text-center text-sm text-ink-soft">
          Select an organization and examination above to review or apply score adjustments.
        </Card>
      )}
    </div>
  );
}
