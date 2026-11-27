import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { activeOrg, getSessionContext } from "@/lib/auth";
import {
  applyIndividualAdjustment,
  authorizeAssessmentActor,
  loadAdjustmentLedgerContext,
  type IndividualAdjustmentPayload,
} from "@/lib/assessmentContributionsServer";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status: number, error: string, code = "error") {
  return NextResponse.json({ code, error }, { status, headers: NO_STORE });
}

/**
 * GET /api/dashboard/exams/[id]/grade-adjustments
 *
 * The unlimited individual adjustment ledger for one examination: the preserved
 * original score, the derived effective score, every recorded entry and the
 * per-category history.
 */
export async function GET(
  _request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const { id } = await routeContext.params;
  if (!UUID_RE.test(id)) return fail(400, "Invalid examination ID.", "invalid_id");

  const ctx = await getSessionContext();
  if (!ctx) return fail(401, "Authentication required.");
  const org = activeOrg(ctx);
  if (!org || (ctx.profile.platform_role !== "super_admin" && org.status !== "active")) {
    return fail(403, "No active organization workspace.");
  }

  const auth = await authorizeAssessmentActor(ctx, org.id, "view");
  if (!auth.allowed) return fail(auth.status, auth.error ?? "Not authorized.", "unauthorized");

  const admin = createAdminClient();
  const context = await loadAdjustmentLedgerContext(admin, ctx, org.id, id);
  if (!context) return fail(404, "Examination not found in your organization.", "not_found");

  return NextResponse.json(
    { context, readOnly: auth.readOnly, role: auth.role },
    { status: 200, headers: NO_STORE },
  );
}

/**
 * POST /api/dashboard/exams/[id]/grade-adjustments
 *
 * Records ONE individual adjustment. There is no ceiling on how many entries a
 * student or a criterion may accumulate: each call appends a new immutable
 * ledger row with its reason, actor, original value and adjusted value.
 */
export async function POST(
  request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const { id } = await routeContext.params;
  if (!UUID_RE.test(id)) return fail(400, "Invalid examination ID.", "invalid_id");

  const ctx = await getSessionContext();
  if (!ctx) return fail(401, "Authentication required.");
  const org = activeOrg(ctx);
  if (!org || (ctx.profile.platform_role !== "super_admin" && org.status !== "active")) {
    return fail(403, "No active organization workspace.");
  }

  const auth = await authorizeAssessmentActor(ctx, org.id, "edit");
  if (!auth.allowed) return fail(auth.status, auth.error ?? "Not authorized.", "unauthorized");

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "Invalid JSON payload.", "invalid_payload");
  }

  const payload: IndividualAdjustmentPayload = {
    attemptId: body.attemptId,
    categoryType: body.categoryType,
    categoryKey: body.categoryKey,
    categoryLabel: body.categoryLabel,
    categoryMaxScore: body.categoryMaxScore,
    direction: body.direction,
    pointsDelta: body.pointsDelta,
    reasonCode: body.reasonCode,
    reason: body.reason,
    teacherComment: body.teacherComment,
  };

  const admin = createAdminClient();
  const result = await applyIndividualAdjustment(admin, ctx, org.id, id, payload);
  if (!result.ok) return fail(result.status, result.error, result.code);

  revalidatePath(`/dashboard/exams/${id}`);
  revalidatePath(`/dashboard/exams/${id}/grades`);
  revalidatePath(`/dashboard/exams/${id}/adjustments`);
  revalidatePath("/dashboard/assessments");
  revalidatePath("/dashboard/results");
  revalidatePath("/dashboard/myp-results");

  const context = await loadAdjustmentLedgerContext(admin, ctx, org.id, id);

  return NextResponse.json(
    {
      ok: true,
      entry: {
        id: result.entryId,
        previousValue: result.previousValue,
        newValue: result.newValue,
        appliedDelta: result.appliedDelta,
        effectiveExamScore: result.effectiveExamScore,
        capped: result.capped,
        sequenceNo: result.sequenceNo,
      },
      context,
    },
    { status: 201, headers: NO_STORE },
  );
}
