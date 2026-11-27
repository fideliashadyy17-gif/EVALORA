import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { activeOrg, getSessionContext } from "@/lib/auth";
import {
  authorizeAssessmentActor,
  createAssessment,
  createAssessmentCategory,
  loadAssessmentWorkspace,
  type CreateAssessmentPayload,
} from "@/lib/assessmentContributionsServer";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function fail(status: number, error: string, code = "error") {
  return NextResponse.json({ code, error }, { status, headers: NO_STORE });
}

async function resolveOrganization() {
  const ctx = await getSessionContext();
  if (!ctx) return { error: fail(401, "Authentication required.") } as const;
  const org = activeOrg(ctx);
  // The organization ALWAYS comes from the verified session. A client-supplied
  // organization id can never widen the tenant boundary.
  if (!org || (ctx.profile.platform_role !== "super_admin" && org.status !== "active")) {
    return { error: fail(403, "No active organization workspace.") } as const;
  }
  return { ctx, orgId: org.id } as const;
}

/**
 * GET /api/dashboard/assessments
 * Assessment Contributions workspace: categories, classes, subjects, terms,
 * examinations, existing assessments and the caller's authorization.
 */
export async function GET() {
  const resolved = await resolveOrganization();
  if ("error" in resolved) return resolved.error;

  const auth = await authorizeAssessmentActor(resolved.ctx, resolved.orgId, "view");
  if (!auth.allowed) return fail(auth.status, auth.error ?? "Not authorized.", "unauthorized");

  const admin = createAdminClient();
  const workspace = await loadAssessmentWorkspace(admin, resolved.ctx, resolved.orgId);
  if (!workspace) return fail(404, "Organization not found.", "not_found");

  return NextResponse.json({ workspace }, { status: 200, headers: NO_STORE });
}

/**
 * POST /api/dashboard/assessments
 * `action: "assessment"` (default) creates an assessment record.
 * `action: "category"` defines an organization-specific assessment category.
 */
export async function POST(request: Request) {
  const resolved = await resolveOrganization();
  if ("error" in resolved) return resolved.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "Invalid JSON payload.", "invalid_payload");
  }

  const admin = createAdminClient();
  const action = String(body.action ?? "assessment");

  if (action === "category") {
    const result = await createAssessmentCategory(admin, resolved.ctx, resolved.orgId, {
      key: body.key,
      label: body.label,
      description: body.description,
    });
    if (!result.ok) return fail(result.status, result.error, result.code);
    revalidatePath("/dashboard/assessments");
    return NextResponse.json({ ok: true, key: result.key }, { status: 201, headers: NO_STORE });
  }

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
    source: body.source,
    teacherComment: body.teacherComment,
    contributionMethod: body.contributionMethod,
    contributionWeight: body.contributionWeight,
    contributionPoints: body.contributionPoints,
    contributesToResult: body.contributesToResult,
    scores: Array.isArray(body.scores)
      ? (body.scores as { studentId: string; score: unknown; comment?: unknown }[]).map((entry) => ({
          studentId: String(entry.studentId ?? ""),
          score: entry.score,
          comment: entry.comment,
        }))
      : undefined,
  };

  const result = await createAssessment(admin, resolved.ctx, resolved.orgId, payload);
  if (!result.ok) {
    return NextResponse.json(
      { code: result.code, error: result.error, fieldErrors: result.fieldErrors ?? [] },
      { status: result.status, headers: NO_STORE },
    );
  }

  revalidatePath("/dashboard/assessments");
  revalidatePath(`/dashboard/assessments/${result.id}`);
  return NextResponse.json({ ok: true, id: result.id }, { status: 201, headers: NO_STORE });
}
