import { notFound, redirect } from "next/navigation";
import { activeOrg, requireUser } from "@/lib/auth";
import {
  authorizeAssessmentActor,
  loadAssessmentDetail,
} from "@/lib/assessmentContributionsServer";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { AssessmentGradebookClient } from "@/components/assessments/AssessmentGradebookClient";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One assessment: gradebook, individual re-entry, publication and audit trail.
 * The assessment id is validated, and the record is loaded with BOTH the session
 * organization and the record's own organization pinned, so a guessed id from
 * another tenant resolves to nothing.
 */
export default async function AssessmentDetailPage({
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

  const assessment = await loadAssessmentDetail(admin, ctx, org.id, id);
  if (!assessment) notFound();

  const editAuth = await authorizeAssessmentActor(ctx, org.id, "edit");
  const publishAuth = await authorizeAssessmentActor(ctx, org.id, "publish");

  return (
    <AssessmentGradebookClient
      assessment={assessment}
      canEdit={editAuth.allowed}
      canPublish={publishAuth.allowed}
      readOnly={auth.readOnly}
    />
  );
}
