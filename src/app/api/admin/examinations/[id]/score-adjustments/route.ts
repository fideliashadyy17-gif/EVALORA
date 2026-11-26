import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth";
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

async function requireSuperAdminApi() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401, headers: NO_STORE }),
    };
  }
  if (ctx.profile.status !== "active" || ctx.profile.platform_role !== "super_admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Super Admin privileges required." }, { status: 403, headers: NO_STORE }),
    };
  }
  return { ok: true as const, ctx };
}

/**
 * GET /api/admin/examinations/[id]/score-adjustments
 * Cross-organization Super Admin endpoint returning full score adjustment context
 * (still strictly checking the target organization's actual Institution plan).
 */
export async function GET(
  _request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const { id } = await routeContext.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid examination ID." }, { status: 400, headers: NO_STORE });
  }

  const guard = await requireSuperAdminApi();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const examContext = await loadExamScoreAdjustmentContext(admin, id);
  if (!examContext) {
    return NextResponse.json({ error: "Examination not found." }, { status: 404, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      context: examContext,
      canApply: true,
    },
    { status: 200, headers: NO_STORE },
  );
}

/**
 * POST /api/admin/examinations/[id]/score-adjustments
 * Super Admin preview & apply across organizations (enforcing target org's
 * active Institution plan and pre-validation lifecycle lock).
 */
export async function POST(
  request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const { id } = await routeContext.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid examination ID." }, { status: 400, headers: NO_STORE });
  }

  const guard = await requireSuperAdminApi();
  if (!guard.ok) return guard.response;

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
      guard.ctx,
      id,
      "super_admin",
      null,
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
      guard.ctx,
      id,
      "super_admin",
      null,
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

    const updatedContext = await loadExamScoreAdjustmentContext(admin, id);

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
