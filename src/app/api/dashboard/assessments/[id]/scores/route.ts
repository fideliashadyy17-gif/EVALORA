import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { activeOrg, getSessionContext } from "@/lib/auth";
import {
  authorizeAssessmentActor,
  saveAssessmentScores,
  type ScoreEntryPayload,
} from "@/lib/assessmentContributionsServer";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status: number, error: string, code = "error") {
  return NextResponse.json({ code, error }, { status, headers: NO_STORE });
}

/**
 * POST /api/dashboard/assessments/[id]/scores
 *
 * Class-wide OR individual score entry. The body accepts one entry or many:
 *   { "scores": [ { "studentId": "...", "score": 17, "comment": "..." } ] }
 *
 * Each entry is validated against the assessment's own maximum, matched to a
 * student of the caller's organization, and written to exactly that student's
 * row — a bulk save can never derive or alter another student's score.
 */
export async function POST(
  request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const { id } = await routeContext.params;
  if (!UUID_RE.test(id)) return fail(400, "Invalid assessment ID.", "invalid_id");

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

  const rawScores = Array.isArray(body.scores) ? body.scores : [];
  const entries: ScoreEntryPayload[] = rawScores.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    return {
      studentId: String(record.studentId ?? ""),
      score: record.score,
      comment: record.comment,
      criterionCode: record.criterionCode,
      excluded: record.excluded === true,
      attemptId: typeof record.attemptId === "string" ? record.attemptId : null,
    };
  });

  const admin = createAdminClient();
  const result = await saveAssessmentScores(admin, ctx, org.id, id, entries);
  if (!result.ok) return fail(result.status, result.error, result.code);

  revalidatePath(`/dashboard/assessments/${id}`);
  revalidatePath("/dashboard/assessments");

  return NextResponse.json(
    { ok: true, saved: result.saved, skipped: result.skipped },
    { status: 200, headers: NO_STORE },
  );
}
