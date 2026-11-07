import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnswerContent } from "@/lib/scoring";
import { resultPublicationMode } from "@/lib/resultPublication";

export async function broadcastLiveResultUpdate(admin: SupabaseClient, sessionId: string, event: string) {
  try {
    await admin.channel(`live:${sessionId}`).send({
      type: "broadcast", event: "state-changed", payload: { kind: event },
    });
  } catch (error) {
    console.error("Could not broadcast live result update", error);
  }
}

export async function recordLiveResultEvent(
  admin: SupabaseClient,
  input: { organizationId: string; sessionId: string; participantId?: string | null; actorId?: string | null; eventType: string; metadata?: Record<string, unknown> },
) {
  const { error } = await admin.from("live_result_events").insert({
    organization_id: input.organizationId,
    session_id: input.sessionId,
    participant_id: input.participantId ?? null,
    actor_id: input.actorId ?? null,
    event_type: input.eventType,
    metadata: input.metadata ?? {},
  });
  if (error) console.error("Could not append live result history", error.message);
}

async function pendingManualAnswers(admin: SupabaseClient, sessionId: string, participantId?: string) {
  let query = admin.from("participant_answers")
    .select("id, participant_id, answer, is_correct, questions(type)")
    .eq("session_id", sessionId);
  if (participantId) query = query.eq("participant_id", participantId);
  const { data, error } = await query;
  if (error || !data) throw new Error("Could not verify live manual-grading state.");
  return data.filter((row) => {
    const question = row.questions as unknown as { type: string } | null;
    return question?.type === "open_ended" && row.is_correct === null && hasAnswerContent(row.answer);
  });
}

/** Auto-publish an individual completed self-paced result after persisted grading. */
export async function publishFinishedLiveParticipant(
  admin: SupabaseClient,
  sessionId: string,
  participantId: string,
  actorId?: string | null,
) {
  const { data: session, error: sessionError } = await admin.from("quiz_sessions")
    .select("id, organization_id, status, mode, settings, results_published")
    .eq("id", sessionId).maybeSingle();
  if (sessionError || !session) return { published: false, pending: false };
  const mode = resultPublicationMode((session.settings as Record<string, unknown> | null)?.result_publication_mode);
  if (mode !== "automatic" || session.mode !== "self_paced") return { published: false, pending: false };
  const { data: participant } = await admin.from("session_participants")
    .select("id, status, result_publication_status, results_published_at")
    .eq("id", participantId).eq("session_id", sessionId).maybeSingle();
  if (!participant || participant.status !== "finished" || participant.results_published_at) return { published: false, pending: false };
  const pending = await pendingManualAnswers(admin, sessionId, participantId);
  if (pending.length) {
    await admin.from("session_participants").update({ result_publication_status: "awaiting_manual_grading" })
      .eq("id", participantId).eq("session_id", sessionId);
    await recordLiveResultEvent(admin, {
      organizationId: session.organization_id, sessionId, participantId, actorId,
      eventType: "awaiting_manual_grading", metadata: { pending_manual_count: pending.length },
    });
    return { published: false, pending: true };
  }
  const { data: updated, error } = await admin.from("session_participants")
    .update({ result_publication_status: "published", results_published_at: new Date().toISOString() })
    .eq("id", participantId).eq("session_id", sessionId).eq("status", "finished")
    .is("results_published_at", null).select("id").maybeSingle();
  if (error || !updated) return { published: false, pending: false };
  await recordLiveResultEvent(admin, {
    organizationId: session.organization_id, sessionId, participantId, actorId, eventType: "auto_published",
  });
  await broadcastLiveResultUpdate(admin, sessionId, "result-published");
  return { published: true, pending: false };
}

/**
 * Complete session-wide publication after a synchronized session ends, or
 * after all subjective answers have been manually marked. Manual mode only
 * changes state after an explicit authorized call.
 */
export async function finalizeLiveSessionResults(
  admin: SupabaseClient,
  sessionId: string,
  input: { actorId?: string | null; manualPublish?: boolean } = {},
) {
  const { data: session, error: sessionError } = await admin.from("quiz_sessions")
    .select("id, organization_id, status, settings, results_published")
    .eq("id", sessionId).maybeSingle();
  if (sessionError || !session || session.status !== "ended") return { published: false, pending: false, error: "Session must be ended first." };
  const modeRaw = (session.settings as Record<string, unknown> | null)?.result_publication_mode;
  const mode = modeRaw === "legacy" || modeRaw == null ? "legacy" : resultPublicationMode(modeRaw);
  if (input.manualPublish && mode === "automatic") return { published: false, pending: false, error: "Automatic mode does not allow manual publication." };
  if (!input.manualPublish && mode !== "automatic") return { published: false, pending: false };
  const pending = await pendingManualAnswers(admin, sessionId);
  if (pending.length) {
    await admin.from("quiz_sessions").update({ result_publication_status: "awaiting_manual_grading" }).eq("id", sessionId);
    await recordLiveResultEvent(admin, {
      organizationId: session.organization_id, sessionId, actorId: input.actorId,
      eventType: "awaiting_manual_grading", metadata: { pending_manual_count: pending.length },
    });
    return { published: false, pending: true };
  }
  const now = new Date().toISOString();
  const { data: publication, error } = await admin.from("quiz_sessions").update({
    results_published: true,
    results_published_at: now,
    result_publication_status: "published",
  }).eq("id", sessionId).eq("status", "ended").select("id").maybeSingle();
  if (error || !publication) return { published: false, pending: false, error: "Could not persist result publication." };
  await admin.from("session_participants")
    .update({ result_publication_status: "published", results_published_at: now })
    .eq("session_id", sessionId).in("status", ["admitted", "finished"]);
  await admin.from("competitions").update({ results_published: true, results_published_at: now, updated_at: now }).eq("session_id", sessionId);
  await recordLiveResultEvent(admin, {
    organizationId: session.organization_id, sessionId, actorId: input.actorId,
    eventType: input.manualPublish ? "manually_published" : "auto_published",
  });
  await broadcastLiveResultUpdate(admin, sessionId, "result-published");
  return { published: true, pending: false };
}

export async function unpublishLiveSessionResults(
  admin: SupabaseClient,
  sessionId: string,
  input: { organizationId: string; actorId: string },
) {
  const now = new Date().toISOString();
  // Keep the session-level publication switch on until subordinate result
  // markers are cleared. Any partial failure therefore fails closed as published
  // rather than claiming results were withdrawn when the candidate API still
  // considers a participant published.
  const { error: participantError } = await admin.from("session_participants")
    .update({ result_publication_status: "ready", results_published_at: null }).eq("session_id", sessionId);
  if (participantError) return false;
  const { error: competitionError } = await admin.from("competitions")
    .update({ results_published: false, results_published_at: null, updated_at: now }).eq("session_id", sessionId);
  if (competitionError) return false;
  const { data: unpublished, error } = await admin.from("quiz_sessions").update({
    results_published: false,
    results_published_at: null,
    result_publication_status: "ready",
  }).eq("id", sessionId).select("id").maybeSingle();
  if (error || !unpublished) return false;
  await recordLiveResultEvent(admin, {
    organizationId: input.organizationId, sessionId, actorId: input.actorId, eventType: "unpublished",
  });
  await broadcastLiveResultUpdate(admin, sessionId, "result-unpublished");
  return true;
}
