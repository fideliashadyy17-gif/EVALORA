import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { activeOrg, getSessionContext } from "@/lib/auth";
import {
  authorizeAssessmentActor,
  loadAssessmentDetail,
  setAssessmentStatus,
  updateAssessment,
  type CreateAssessmentPayload,
} from "@/lib/assessmentContributionsServer";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status: number, error: string, code = "error") {
  return NextResponse.json({ code, error }, { status, headers: NO_STORE });
}

async function resolveOrganization() {
  const ctx = await getSessionContext();
  if (!ctx) return { error: fail(401, "Authentication required.") } as const;
  const org = activeOrg(ctx);
  if (!org || (ctx.profile.platform_role !== "super_admin" && org.status !== "active")) {
    return { error: fail(403, "No active organization workspace.") } as const;
  }
  return { ctx, orgId: org.id } as const;
}

/** GET /api/dashboard/assessments/[id] — gradebook, roster and audit history. */
export async function GET(
  _request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const { id } = await routeContext.params;
  if (!UUID_RE.test(id)) return fail(400, "Invalid assessment ID.", "invalid_id");

  const resolved = await resolveOrganization();
  if ("error" in resolved) return resolved.error;

  const auth = await authorizeAssessmentActor(resolved.ctx, resolved.orgId, "view");
  if (!auth.allowed) return fail(auth.status, auth.error ?? "Not authorized.", "unauthorized");

  const admin = createAdminClient();
  const detail = await loadAssessmentDetail(admin, resolved.ctx, resolved.orgId, id);
  if (!detail) return fail(404, "Assessment not found in your organization.", "not_found");

  return NextResponse.json(
    { assessment: detail, canEdit: auth.role !== "school_founder", readOnly: auth.readOnly },
    { status: 200, headers: NO_STORE },
  );
}

/** PATCH /api/dashboard/assessments/[id] — update the assessment record. */
export async function PATCH(
  request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const { id } = await routeContext.params;
  if (!UUID_RE.test(id)) return fail(400, "Invalid assessment ID.", "invalid_id");

  const resolved = await resolveOrganization();
  if ("error" in resolved) return resolved.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "Invalid JSON payload.", "invalid_payload");
  }

  const admin = createAdminClient();
  const payload: CreateAssessmentPayload = {
    title: body.title,
    categoryKey: body.categoryKey,
    assessedOn: body.assessedOn,
    maxScore: body.maxScore,
    description: body.description,
    subjectId: body.subjectId,
    classId: body.classId,
    academicYearId: body.academicYearId,
    termLabel: body.termLabel,
    examId: body.examId,
    scope: body.scope,
    criterionCode: body.criterionCode,
    framework: body.framework,
    teacherComment: body.teacherComment,
    contributionMethod: body.contributionMethod,
    contributionWeight: body.contributionWeight,
    contributionPoints: body.contributionPoints,
    contributesToResult: body.contributesToResult,
  };

  const result = await updateAssessment(admin, resolved.ctx, resolved.orgId, id, payload);
  if (!result.ok) {
    return NextResponse.json(
      { code: result.code, error: result.error, fieldErrors: "fieldErrors" in result ? result.fieldErrors : [] },
      { status: result.status, headers: NO_STORE },
    );
  }

  revalidatePath("/dashboard/assessments");
  revalidatePath(`/dashboard/assessments/${id}`);
  return NextResponse.json({ ok: true, id: result.id }, { status: 200, headers: NO_STORE });
}

/**
 * POST /api/dashboard/assessments/[id]
 * Publication workflow: `{ "status": "published" | "draft" | "archived" }`.
 * Publishing requires the `results.publish` permission.
 */
export async function POST(
  request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const { id } = await routeContext.params;
  if (!UUID_RE.test(id)) return fail(400, "Invalid assessment ID.", "invalid_id");

  const resolved = await resolveOrganization();
  if ("error" in resolved) return resolved.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "Invalid JSON payload.", "invalid_payload");
  }

  const status = String(body.status ?? "");
  if (!["draft", "published", "archived"].includes(status)) {
    return fail(400, "Unsupported status. Expected draft, published or archived.", "invalid_status");
  }

  const admin = createAdminClient();
  const result = await setAssessmentStatus(
    admin,
    resolved.ctx,
    resolved.orgId,
    id,
    status as "draft" | "published" | "archived",
  );
  if (!result.ok) return fail(result.status, result.error, result.code);

  revalidatePath("/dashboard/assessments");
  revalidatePath(`/dashboard/assessments/${id}`);
  return NextResponse.json({ ok: true, status }, { status: 200, headers: NO_STORE });
}
