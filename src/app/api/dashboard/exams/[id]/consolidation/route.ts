import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { activeOrg, getSessionContext } from "@/lib/auth";
import {
  authorizeAssessmentActor,
  loadConsolidationContext,
  previewConsolidation,
  publishConsolidation,
  saveConsolidationProfile,
  unpublishConsolidation,
  type ConsolidationPreviewRequest,
  type SaveConsolidationPayload,
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

function readRequest(body: Record<string, unknown>): ConsolidationPreviewRequest {
  return {
    method: body.method,
    examWeight: body.examWeight,
    allowMissingScores: body.allowMissingScores === true,
    scopeAttemptIds: Array.isArray(body.scopeAttemptIds) ? body.scopeAttemptIds.map(String) : undefined,
    inclusions: Array.isArray(body.inclusions)
      ? (body.inclusions as Record<string, unknown>[]).map((row) => ({
          contributionId: String(row.contributionId ?? ""),
          included: row.included !== false,
          weight: Number(row.weight ?? 0),
          pointValue: Number(row.pointValue ?? 0),
          criterionCode: typeof row.criterionCode === "string" ? row.criterionCode : null,
        }))
      : undefined,
    profileId: typeof body.profileId === "string" ? body.profileId : null,
  };
}

/**
 * GET /api/dashboard/exams/[id]/consolidation
 * Consolidation context: contributing assessments, attempts with their ORIGINAL
 * scores and ledger deltas, saved profiles and the caller's authorization.
 */
export async function GET(
  request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const { id } = await routeContext.params;
  if (!UUID_RE.test(id)) return fail(400, "Invalid examination ID.", "invalid_id");

  const resolved = await resolveOrganization();
  if ("error" in resolved) return resolved.error;

  const auth = await authorizeAssessmentActor(resolved.ctx, resolved.orgId, "view");
  if (!auth.allowed) return fail(auth.status, auth.error ?? "Not authorized.", "unauthorized");

  const classId = new URL(request.url).searchParams.get("class");
  const admin = createAdminClient();
  const context = await loadConsolidationContext(admin, resolved.ctx, resolved.orgId, id, {
    classId: classId && UUID_RE.test(classId) ? classId : null,
  });
  if (!context) return fail(404, "Examination not found in your organization.", "not_found");

  return NextResponse.json({ context, readOnly: auth.readOnly }, { status: 200, headers: NO_STORE });
}

/**
 * POST /api/dashboard/exams/[id]/consolidation
 *   action: "preview"    → zero writes; the identical engine used by save
 *   action: "save"       → persist profile + per-attempt snapshot (draft)
 *   action: "publish"    → requires results.publish; refuses invalid rows
 *   action: "unpublish"  → withdraw a published consolidation
 */
export async function POST(
  request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const { id } = await routeContext.params;
  if (!UUID_RE.test(id)) return fail(400, "Invalid examination ID.", "invalid_id");

  const resolved = await resolveOrganization();
  if ("error" in resolved) return resolved.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "Invalid JSON payload.", "invalid_payload");
  }

  const action = String(body.action ?? "preview");
  const admin = createAdminClient();

  if (action === "preview") {
    const auth = await authorizeAssessmentActor(resolved.ctx, resolved.orgId, "view");
    if (!auth.allowed) return fail(auth.status, auth.error ?? "Not authorized.", "unauthorized");
    const result = await previewConsolidation(admin, resolved.ctx, resolved.orgId, id, readRequest(body));
    if (!result.ok) return fail(result.status, result.error, result.code);
    return NextResponse.json({ result: result.result }, { status: 200, headers: NO_STORE });
  }

  if (action === "save") {
    const payload: SaveConsolidationPayload = {
      ...readRequest(body),
      name: body.name,
      scope: body.scope,
      overrides: Array.isArray(body.overrides)
        ? (body.overrides as Record<string, unknown>[]).map((row) => ({
            attemptId: String(row.attemptId ?? ""),
            contributionId: typeof row.contributionId === "string" ? row.contributionId : null,
            included: row.included !== false,
            weightOverride: row.weightOverride === null || row.weightOverride === undefined ? null : Number(row.weightOverride),
            pointValueOverride:
              row.pointValueOverride === null || row.pointValueOverride === undefined ? null : Number(row.pointValueOverride),
            reason: typeof row.reason === "string" ? row.reason : "",
          }))
        : undefined,
    };
    const result = await saveConsolidationProfile(admin, resolved.ctx, resolved.orgId, id, payload);
    if (!result.ok) return fail(result.status, result.error, result.code);

    revalidatePath(`/dashboard/assessments`);
    revalidatePath(`/dashboard/exams/${id}`);
    revalidatePath("/dashboard/results");
    return NextResponse.json(
      { ok: true, profileId: result.profileId, result: result.preview },
      { status: 200, headers: NO_STORE },
    );
  }

  if (action === "publish") {
    const profileId = String(body.profileId ?? "");
    if (!UUID_RE.test(profileId)) return fail(400, "Invalid consolidation profile.", "invalid_id");
    const result = await publishConsolidation(admin, resolved.ctx, resolved.orgId, id, profileId);
    if (!result.ok) return fail(result.status, result.error, result.code);

    revalidatePath(`/dashboard/exams/${id}`);
    revalidatePath("/dashboard/results");
    revalidatePath("/dashboard/assessments");
    return NextResponse.json({ ok: true, published: result.published }, { status: 200, headers: NO_STORE });
  }

  if (action === "unpublish") {
    const profileId = String(body.profileId ?? "");
    if (!UUID_RE.test(profileId)) return fail(400, "Invalid consolidation profile.", "invalid_id");
    const result = await unpublishConsolidation(admin, resolved.ctx, resolved.orgId, profileId);
    if (!result.ok) return fail(result.status, result.error, result.code);

    revalidatePath(`/dashboard/exams/${id}`);
    revalidatePath("/dashboard/results");
    return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
  }

  return fail(400, "Unsupported action. Expected preview, save, publish or unpublish.", "invalid_action");
}
