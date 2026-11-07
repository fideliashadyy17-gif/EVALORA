import { INTEGRITY_EVENTS, parseIntegrityPolicy } from "@/lib/integrity";
import { recordIntegrityEvent } from "@/lib/integrityRecording";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  participant_id: z.string().uuid(),
  token: z.string().uuid(),
  event: z.enum(INTEGRITY_EVENTS),
  detail: z.record(z.string(), z.unknown()).optional(),
});

const headers = { "Cache-Control": "private, no-store" };

/**
 * Participant-token-authorized integrity recording for a live quiz.
 *
 * Quiz, session, participant and organization are all resolved from the
 * participant's own database row. The caller cannot attribute an event to a
 * different participant or tenant. Host and projection screens never call this
 * endpoint: it belongs exclusively to the student participation surface.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
  const { participant_id, token, event, detail } = parsed.data;

  const admin = createAdminClient();
  const { data: participant } = await admin
    .from("session_participants")
    .select("id, session_id, status")
    .eq("id", participant_id)
    .eq("access_token", token)
    .maybeSingle();
  if (!participant || ["rejected", "blocked"].includes(participant.status))
    return NextResponse.json({ error: "Participant not found." }, { status: 404, headers });
  if (participant.status === "finished")
    return NextResponse.json({ error: "This participant has finished." }, { status: 409, headers });

  // Match state/answer admission rules: possession of a participant token is
  // not enough if the organizer has since revoked phase or class admission.
  const { data: verdict } = await admin.rpc("verify_participant_phase_admission", {
    p_participant_id: participant.id,
  });
  const admission = (verdict ?? null) as { allowed?: boolean; reason?: string } | null;
  if (!admission?.allowed)
    return NextResponse.json(
      { error: admission?.reason ?? "Admission is restricted to approved candidates." },
      { status: 403, headers },
    );

  const { data: session } = await admin
    .from("quiz_sessions")
    .select("id, quiz_id, organization_id, status")
    .eq("id", participant.session_id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404, headers });
  if (session.status === "ended")
    return NextResponse.json({ error: "This live quiz has ended." }, { status: 409, headers });

  const { data: quiz } = await admin
    .from("quizzes")
    .select("id, settings")
    .eq("id", session.quiz_id)
    .eq("organization_id", session.organization_id)
    .maybeSingle();
  if (!quiz) return NextResponse.json({ error: "Quiz not found." }, { status: 404, headers });

  const policy = parseIntegrityPolicy(((quiz.settings ?? {}) as Record<string, unknown>).integrity);
  try {
    const result = await recordIntegrityEvent(
      admin,
      {
        kind: "live",
        participantId: participant.id,
        organizationId: session.organization_id,
        quizId: quiz.id,
        sessionId: session.id,
      },
      event,
      detail,
      policy,
    );
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch {
    return NextResponse.json({ error: "The event could not be recorded." }, { status: 500, headers });
  }
}
