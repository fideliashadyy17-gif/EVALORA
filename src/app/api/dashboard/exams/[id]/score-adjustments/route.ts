import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { activeOrg, getSessionContext } from "@/lib/auth";
import { canOperate, canOperateMany } from "@/lib/operationalAccess";
import {
  applyScoreAdjustmentServer,
  isUuid,
  loadExamScoreAdjustmentContext,
  previewScoreAdjustmentServer,
  type ScoreAdjustmentRequestPayload,
} from "@/lib/scoreAdjustmentsServer";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function isLearnerRole(role: string | null | undefined): boolean {
  const lower = String(role ?? "").toLowerCase();
  return ["student", "candidate", "parent", "participant"].includes(lower);
}

/**
 * GET /api/dashboard/exams/[id]/score-adjustments
 * Returns exam score adjustment state, eligible attempts, categories, plan
 * status, and immutable audit history for authorized organization staff.
 */
export async function GET(
  _request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const { id } = await routeContext.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid examination ID." }, { status: 400, headers: NO_STORE });
  }

  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: NO_STORE });
  }
  if (ctx.profile.status !== "active") {
    return NextResponse.json({ error: "Account is not active." }, { status: 403, headers: NO_STORE });
  }

  const org = activeOrg(ctx);
  const isSuper = ctx.profile.platform_role === "super_admin";
  if (!org || (!isSuper && org.status !== "active")) {
    return NextResponse.json({ error: "No active organization workspace." }, { status: 403, headers: NO_STORE });
  }
  if (!isSuper && isLearnerRole(org.role)) {
    return NextResponse.json({ error: "Not authorized to access score adjustments." }, { status: 403, headers: NO_STORE });
  }

  const perms = await canOperateMany(ctx, org.id, {
    canViewGrading: { permission: "grading.view", module: "exam_results" },
    canViewResults: { permission: "results.view", module: "exam_results" },
    canGrade: { permission: "grading.edit", module: "exam_results" },
  });
  if (!perms.canViewGrading && !perms.canViewResults && !perms.canGrade) {
    return NextResponse.json({ error: "Insufficient permissions." }, { status: 403, headers: NO_STORE });
  }

  const admin = createAdminClient();
  const examContext = await loadExamScoreAdjustmentContext(admin, id, {
    requiredOrganizationId: org.id,
  });
  if (!examContext) {
    return NextResponse.json({ error: "Examination not found in your organization." }, { status: 404, headers: NO_STORE });
  }

  const canApply = Boolean(perms.canGrade) && (isSuper || String(org.role ?? "").toLowerCase() !== "school_founder");

  return NextResponse.json(
    {
      context: examContext,
      canApply,
    },
    { status: 200, headers: NO_STORE },
  );
}

/**
 * POST /api/dashboard/exams/[id]/score-adjustments
 * Supports `action: "preview"` (zero DB writes) and `action: "apply"` (atomic
 * transaction enforcing Institution plan, RBAC, pre-validation lock, capping,
 * and duplicate prevention).
 */
export async function POST(
  request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const { id } = await routeContext.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid examination ID." }, { status: 400, headers: NO_STORE });
  }

  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: NO_STORE });
  }
  if (ctx.profile.status !== "active") {
    return NextResponse.json({ error: "Account is not active." }, { status: 403, headers: NO_STORE });
  }

  const org = activeOrg(ctx);
  const isSuper = ctx.profile.platform_role === "super_admin";
  if (!org || (!isSuper && org.status !== "active")) {
    return NextResponse.json({ error: "No active organization workspace." }, { status: 403, headers: NO_STORE });
  }
  if (!isSuper && (isLearnerRole(org.role) || String(org.role ?? "").toLowerCase() === "school_founder")) {
    return NextResponse.json({ error: "Your role is not permitted to perform score adjustments." }, { status: 403, headers: NO_STORE });
  }

  const canGrade = await canOperate(ctx, org.id, "grading.edit", "exam_results");
  if (!canGrade) {
    return NextResponse.json(
      { error: "Examination grading permission (grading.edit) is required." },
      { status: 403, headers: NO_STORE },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400, headers: NO_STORE });
  }

  const action = String(body.action ?? "");
  const payload: ScoreAdjustmentRequestPayload = {
    categoryType: String(body.categoryType ?? "") as ScoreAdjustmentRequestPayload["categoryType"],
    categoryKey: String(body.categoryKey ?? ""),
    pointsRequested: body.pointsRequested,
    scope: body.scope === "selected" ? "selected" : "all_eligible",
    attemptIds: Array.isArray(body.attemptIds) ? body.attemptIds.map(String) : undefined,
    reason: typeof body.reason === "string" ? body.reason : undefined,
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
  };

  const admin = createAdminClient();

  if (action === "preview") {
    const result = await previewScoreAdjustmentServer(
      admin,
      ctx,
      id,
      "workspace",
      org.id,
      payload,
    );
    if (!result.ok) {
      return NextResponse.json(
        { code: result.code, error: result.error },
        { status: result.status, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { preview: result.preview, idempotencyKey: result.idempotencyKey },
      { status: 200, headers: NO_STORE },
    );
  }

  if (action === "apply") {
    const result = await applyScoreAdjustmentServer(
      admin,
      ctx,
      id,
      "workspace",
      org.id,
      payload,
    );
    if (!result.ok) {
      return NextResponse.json(
        { code: result.code, error: result.error },
        { status: result.status, headers: NO_STORE },
      );
    }

    revalidatePath(`/dashboard/exams/${id}`);
    revalidatePath(`/dashboard/exams/${id}/grades`);
    revalidatePath(`/dashboard/exams/${id}/adjustments`);
    revalidatePath("/dashboard/results");
    revalidatePath("/dashboard/myp-results");
    revalidatePath(`/dashboard/reports/exam/${id}`);
    revalidatePath("/admin/examinations/results");
    revalidatePath("/admin/examinations/score-adjustments");
    revalidatePath("/admin/myp-results");

    const updatedContext = await loadExamScoreAdjustmentContext(admin, id, {
      requiredOrganizationId: org.id,
    });

    return NextResponse.json(
      {
        ok: true,
        adjustmentId: result.adjustmentId,
        studentsAffected: result.studentsAffected,
        cappedStudents: result.cappedStudents,
        totalPointsAdded: result.totalPointsAdded,
        context: updatedContext,
      },
      { status: 200, headers: NO_STORE },
    );
  }

  return NextResponse.json(
    { error: "Unsupported action. Expected 'preview' or 'apply'." },
    { status: 400, headers: NO_STORE },
  );
}
