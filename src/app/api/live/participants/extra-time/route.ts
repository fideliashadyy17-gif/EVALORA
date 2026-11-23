/**
 * Host granting of a participant's personal extra time (migration 0107).
 *
 * A shared countdown is right for the room, but a participant can lose time
 * to a dropped connection, a slow device or an accessibility need. This gives
 * the host a way to make that one participant whole WITHOUT changing the round
 * for anybody else: the session deadline, the room's phase and every projected
 * countdown stay exactly as they were, and the allowance only extends the
 * point at which this participant's own answer stops being accepted.
 *
 * Authorization is decided here on the server for every call: only the session
 * host, or an organizer who may host live sessions in the same organization,
 * may grant time. A participant can never award it to themselves.
 */
import { audit } from "@/lib/admin";
import { can, CREATOR_ROLES, getSessionContext } from "@/lib/auth";
import { hasCapability } from "@/lib/capabilities";
import {
  MAX_PARTICIPANT_EXTRA_TIME_MS,
  normalizeExtraTimeMs,
  participantDeadlineAt,
  questionDeadlineAt,
} from "@/lib/live";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  session_id: z.string().uuid(),
  participant_id: z.string().uuid(),
  /** Requested allowance in seconds. Ignored for mode "clear". */
  seconds: z.number().min(0).max(86_400),
  /** "add" accumulates onto the current allowance, "set" replaces it, "clear" removes it. */
  mode: z.enum(["add", "set", "clear"]).default("add"),
  reason: z.string().max(500).nullish(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { session_id: sessionId, participant_id: participantId, mode, reason } = parsed.data;
  if (!Number.isFinite(parsed.data.seconds))
    return NextResponse.json({ error: "That allowance is not a number of seconds." }, { status: 400 });

  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (ctx.profile.status !== "active")
    return NextResponse.json({ error: "Account is not active." }, { status: 403 });

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("quiz_sessions")
    .select("id, quiz_id, organization_id, host_id, mode, status, phase, current_question_index, question_started_at, question_deadline_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const isHost = session.host_id === ctx.user.id;
  if (!isHost && !can(ctx, session.organization_id, CREATOR_ROLES))
    return NextResponse.json({ error: "Organizer access required." }, { status: 403 });
  if (!(await hasCapability(admin, ctx, session.organization_id, "live_competitions")))
    return NextResponse.json({ error: "Live competitions are not included in this workspace plan." }, { status: 403 });

  // Extra time extends a shared per-question window. A self-paced session has
  // no shared window to extend, so granting one there would be a silent no-op
  // that looks like it worked.
  if (session.mode !== "synchronized")
    return NextResponse.json(
      { error: "This session is self-paced, so there is no shared question timer to extend." },
      { status: 409 },
    );

  const { data: participant } = await admin
    .from("session_participants")
    .select("id, display_name, extra_time_ms, status")
    .eq("id", participantId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!participant)
    return NextResponse.json({ error: "That participant is not in this session." }, { status: 404 });
  if (["rejected", "blocked"].includes(String(participant.status)))
    return NextResponse.json({ error: "That participant was removed from this session." }, { status: 409 });

  const previous = normalizeExtraTimeMs(participant.extra_time_ms);
  const requestedMs = mode === "clear" ? 0 : Math.round(parsed.data.seconds * 1000);
  const wanted = mode === "add" ? previous + requestedMs : requestedMs;
  const next = normalizeExtraTimeMs(wanted);

  const { data: updated, error } = await admin
    .from("session_participants")
    .update({ extra_time_ms: next })
    .eq("id", participantId)
    .eq("session_id", sessionId)
    .select("id, extra_time_ms")
    .maybeSingle();
  if (error || !updated)
    return NextResponse.json({ error: "The extra time could not be saved. Try again." }, { status: 500 });

  const { data: quiz } = await admin
    .from("quizzes")
    .select("settings")
    .eq("id", session.quiz_id)
    .maybeSingle();
  const quizSettings = (quiz?.settings ?? {}) as Record<string, unknown>;
  const timing = {
    status: session.status,
    mode: session.mode,
    phase: session.phase,
    current_question_index: session.current_question_index,
    question_started_at: session.question_started_at,
    question_deadline_at: session.question_deadline_at,
  };
  // Report the deadline this participant will actually answer against, so the
  // host sees the effect immediately rather than a bare number.
  const roomDeadline = questionDeadlineAt(timing, null, quizSettings);
  const effectiveDeadline = participantDeadlineAt(timing, null, quizSettings, next);

  await audit(ctx, "live.participant_extra_time", "session_participants", participantId, session.organization_id, {
    session_id: sessionId,
    participant_id: participantId,
    display_name: participant.display_name ?? null,
    previous_extra_time_ms: previous,
    extra_time_ms: next,
    mode,
    reason: reason ?? null,
    room_deadline_at: roomDeadline,
    effective_deadline_at: effectiveDeadline,
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    session_id: sessionId,
    participant_id: participantId,
    display_name: participant.display_name ?? null,
    previous_extra_time_ms: previous,
    extra_time_ms: next,
    extra_time_seconds: Math.round(next / 1000),
    clamped: next !== wanted,
    max_extra_time_ms: MAX_PARTICIPANT_EXTRA_TIME_MS,
    room_deadline_at: roomDeadline,
    effective_deadline_at: effectiveDeadline,
  });
}
