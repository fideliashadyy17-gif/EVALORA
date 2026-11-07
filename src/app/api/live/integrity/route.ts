import { createAdminClient } from "@/lib/supabase/server";
import {
  escalationLevel,
  incidentTypeFor,
  INTEGRITY_EVENTS,
  isEventEnabled,
  isRecordable,
  parseIntegrityPolicy,
  severityForEvent,
} from "@/lib/integrity";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  participant_id: z.string().uuid(),
  token: z.string().uuid(),
  event: z.enum(INTEGRITY_EVENTS),
  detail: z.record(z.string(), z.unknown()).optional(),
});
const DEDUPE_MS = 2000;
const MAX_EVENTS_PER_PARTICIPANT = 300;
const headers = { "Cache-Control": "private, no-store" };

function answered(body: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...body }, { headers });
}

/**
 * Record an observed browser event for an admitted live-quiz/competition
 * participant. The token is resolved to the session, quiz, tenant and
 * participant server-side. This route only inserts review evidence; it has no
 * attempt/session status update and cannot submit or finish a response.
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
  if (!participant || participant.status !== "admitted")
    return NextResponse.json({ error: "Active participant not found." }, { status: 404, headers });

  const { data: session } = await admin
    .from("quiz_sessions")
    .select("id, quiz_id, organization_id, status, settings")
    .eq("id", participant.session_id)
    .maybeSingle();
  if (!session || !["live", "paused"].includes(session.status))
    return NextResponse.json({ error: "The timed activity is no longer active." }, { status: 409, headers });

  const { data: admission, error: admissionError } = await admin.rpc("verify_participant_phase_admission", {
    p_participant_id: participant.id,
  });
  if (admissionError || !(admission as { allowed?: boolean } | null)?.allowed)
    return NextResponse.json({ error: "Participant admission could not be verified." }, { status: 403, headers });

  const settings = (session.settings ?? {}) as Record<string, unknown>;
  const policy = parseIntegrityPolicy(settings.integrity);
  if (!policy.enabled) return answered({ recorded: false, count: 0, level: "none", reason: "integrity_disabled" });
  if (!isEventEnabled(event, policy))
    return answered({ recorded: false, count: 0, level: "none", reason: "event_disabled" });

  const type = incidentTypeFor(event);
  const countViolations = async () => {
    const { count } = await admin.from("proctoring_incidents")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id).eq("participant_id", participant.id)
      .like("type", "integrity_%")
      .not("type", "in", "(integrity_tab_visible,integrity_focus_back,integrity_online)");
    return count ?? 0;
  };
  const countAll = async () => {
    const { count } = await admin.from("proctoring_incidents")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id).eq("participant_id", participant.id)
      .like("type", "integrity_%");
    return count ?? 0;
  };

  const { data: last } = await admin.from("proctoring_incidents")
    .select("type, created_at")
    .eq("session_id", session.id).eq("participant_id", participant.id)
    .like("type", "integrity_%")
    .order("created_at", { ascending: false }).limit(40);
  const prior = (last ?? []) as { type: string; created_at: string }[];
  const lastSame = prior.find((row) => row.type === type);
  if (lastSame && Date.now() - Date.parse(lastSame.created_at) < DEDUPE_MS) {
    const count = await countViolations();
    return answered({ recorded: false, count, level: escalationLevel(count, policy), reason: "duplicate" });
  }
  const stored = await countAll();
  if (stored >= MAX_EVENTS_PER_PARTICIPANT)
    return answered({ recorded: false, count: await countViolations(), level: "none", reason: "capped" });

  let note: string | null = null;
  if (detail) {
    try { note = JSON.stringify(detail).slice(0, 400); } catch { note = null; }
  }
  const { error } = await admin.from("proctoring_incidents").insert({
    organization_id: session.organization_id,
    exam_id: null,
    candidate_id: null,
    attempt_id: null,
    quiz_id: session.quiz_id,
    session_id: session.id,
    participant_id: participant.id,
    type,
    severity: severityForEvent(event),
    note,
    reported_by: null,
    status: "open",
  });
  if (error) return NextResponse.json({ error: "The event could not be recorded." }, { status: 500, headers });

  const count = await countViolations();
  return answered({
    recorded: true,
    count,
    level: escalationLevel(count, policy),
    violation: isRecordable(event),
    warnAfter: policy.warnAfter,
    reviewAfter: policy.reviewAfter,
  });
}
