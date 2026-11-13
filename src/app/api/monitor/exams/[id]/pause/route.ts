import { isUuid } from "@/lib/examMessaging";
import { staffExamAccess } from "@/lib/monitorAccess";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Organizer pause/resume control for one examination.
 *
 *   scope=exam     pause/resume the WHOLE assessment (exams.status='paused',
 *                  every in_progress attempt gets/loses the 'assessment'
 *                  reason atomically — migration 0098's exam_set_pause RPC).
 *   scope=attempt  pause/resume ONE student ('student' reason) without
 *                  touching any other participant.
 *
 * Authorization is enforced here on every call (signed-in session + monitor
 * role in the examination's organization, or Super Admin) — never inferred
 * from a button being visible. Candidates hold no session that can reach this
 * route, and the RPCs themselves are granted to service_role only, so there is
 * no client-side path to a pause transition.
 *
 * Pause reasons are independent: resuming an exam-wide pause removes ONLY the
 * 'assessment' reason — a student who was also paused individually stays
 * paused (and vice versa), and the countdown resumes only when every reason
 * has cleared. Every transition is recorded in exam_pause_events.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

const Body = z.object({
  scope: z.enum(["exam", "attempt"]),
  action: z.enum(["pause", "resume"]),
  attempt_id: z.string().uuid().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Examination not found." }, { status: 404, headers: NO_STORE });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  const { scope, action } = parsed.data;

  const access = await staffExamAccess(id);
  if (!access.ok) return access.response;
  const { ctx, organization_id: orgId } = access;

  const admin = createAdminClient();
  const paused = action === "pause";

  if (scope === "exam") {
    const { data: result, error } = await admin.rpc("exam_set_pause", { p_exam_id: id, p_paused: paused });
    if (error) return NextResponse.json({ error: "The pause state could not be changed." }, { status: 500, headers: NO_STORE });
    const outcome = result as { paused?: boolean; attempts_updated?: number; duplicate?: boolean; error?: string } | null;
    if (!outcome) return NextResponse.json({ error: "Examination not found." }, { status: 404, headers: NO_STORE });
    if (outcome.error === "not_open")
      return NextResponse.json({ error: "Only an open examination can be paused." }, { status: 409, headers: NO_STORE });
    await recordPauseEvents(admin, {
      organizationId: orgId, examId: id, attemptId: null, actorId: ctx.user.id,
      scope: "exam", action, reason: "assessment", result: outcome,
    });
    return NextResponse.json(
      { ok: true, paused: Boolean(outcome.paused), attempts_updated: Number(outcome.attempts_updated ?? 0), duplicate: Boolean(outcome.duplicate) },
      { headers: NO_STORE },
    );
  }

  const attemptId = parsed.data.attempt_id;
  if (!attemptId) return NextResponse.json({ error: "attempt_id is required." }, { status: 400, headers: NO_STORE });
  // The attempt must belong to THIS examination — an organizer of one tenant
  // can never reach another examination's participant.
  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, exam_id, status, pause_reasons")
    .eq("id", attemptId)
    .eq("exam_id", id)
    .maybeSingle();
  if (!attempt) return NextResponse.json({ error: "Participant not found in this examination." }, { status: 404, headers: NO_STORE });
  if (attempt.status !== "in_progress")
    return NextResponse.json({ error: "Only an attempt in progress can be paused or resumed." }, { status: 409, headers: NO_STORE });

  const { data: result, error } = await admin.rpc("exam_attempt_set_pause", {
    p_attempt_id: attemptId,
    p_reason: "student",
    p_paused: paused,
  });
  if (error) return NextResponse.json({ error: "The pause state could not be changed." }, { status: 500, headers: NO_STORE });
  const outcome = result as { paused?: boolean; reasons?: string[]; credited_minutes?: number; duplicate?: boolean } | null;
  if (!outcome) return NextResponse.json({ error: "Only an attempt in progress can be paused or resumed." }, { status: 409, headers: NO_STORE });
  await recordPauseEvents(admin, {
    organizationId: orgId, examId: id, attemptId, actorId: ctx.user.id,
    scope: "attempt", action, reason: "student", result: outcome,
    reasonsBefore: (attempt.pause_reasons as string[] | null) ?? [],
  });
  return NextResponse.json(
    {
      ok: true,
      paused: Boolean(outcome.paused),
      reasons: outcome.reasons ?? [],
      credited_minutes: Number(outcome.credited_minutes ?? 0),
      duplicate: Boolean(outcome.duplicate),
    },
    { headers: NO_STORE },
  );
}

/** One audit row per transition (best effort: a failed audit write must not roll back a successful pause). */
async function recordPauseEvents(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    organizationId: string;
    examId: string;
    attemptId: string | null;
    actorId: string;
    scope: "exam" | "attempt";
    action: "pause" | "resume";
    reason: "assessment" | "student";
    result: { paused?: boolean; reasons?: string[]; credited_minutes?: number; duplicate?: boolean };
    reasonsBefore?: string[];
  },
) {
  const after = input.scope === "attempt"
    ? (input.result.reasons ?? [])
    : input.action === "pause"
      ? ["assessment"]
      : [];
  const before = input.reasonsBefore ?? (input.action === "pause" ? [] : after);
  try {
    await admin.from("exam_pause_events").insert({
      organization_id: input.organizationId,
      exam_id: input.examId,
      attempt_id: input.attemptId,
      actor_id: input.actorId,
      scope: input.scope,
      action: input.action,
      reason: input.reason,
      pause_reasons_before: before,
      pause_reasons_after: after,
      credited_minutes: Number(input.result.credited_minutes ?? 0),
    });
  } catch {
    // Auditing is append-only telemetry; the transition itself already succeeded atomically.
  }
}
