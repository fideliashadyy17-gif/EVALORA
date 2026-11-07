import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
export { hasAnswerContent, isAutoGradableQuestion } from "@/lib/scoring";

export type ResultPublicationMode = "manual" | "automatic";

export function resultPublicationMode(value: unknown): ResultPublicationMode {
  return value === "automatic" ? "automatic" : "manual";
}

export function examResultChannelName(attemptId: string, accessToken: string): string {
  const digest = createHash("sha256").update(`${attemptId}:${accessToken}`).digest("hex");
  return `exam-result:${digest}`;
}

export async function notifyExamResultPublished(attemptId: string, accessToken: string, published = true): Promise<void> {
  const admin = createAdminClient();
  const channel = admin.channel(examResultChannelName(attemptId, accessToken));
  try {
    await channel.send({
      type: "broadcast",
      event: published ? "result-published" : "result-unpublished",
      payload: { published, event_id: randomUUID() },
    });
  } catch (error) {
    // Database state is authoritative. The candidate recovers by fetching state
    // on reconnect/visibility; a transient broadcast failure cannot roll back publication.
    console.error("Could not broadcast exam result publication", error);
  }
}

export async function recordExamResultEvent(
  admin: SupabaseClient,
  event: {
    organization_id: string;
    exam_id: string;
    attempt_id?: string | null;
    actor_id?: string | null;
    event_type: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.from("exam_result_events").insert({
    organization_id: event.organization_id,
    exam_id: event.exam_id,
    attempt_id: event.attempt_id ?? null,
    actor_id: event.actor_id ?? null,
    event_type: event.event_type,
    metadata: event.metadata ?? {},
  });
  if (error) console.error("Could not append exam result history", error.message);
}

/**
 * Publish a fully graded automatic-mode attempt exactly once. The conditional
 * update is the idempotency boundary; notifications contain no result data.
 */
export async function publishAutomaticExamAttempt(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    examId: string;
    attemptId: string;
    actorId?: string | null;
    processingMs?: number;
  },
): Promise<boolean> {
  const { data: published, error } = await admin.from("exam_attempts")
    .update({ published_at: new Date().toISOString() })
    .eq("id", input.attemptId)
    .eq("exam_id", input.examId)
    .eq("grading_status", "graded")
    .eq("pending_manual_count", 0)
    .in("status", ["submitted", "auto_submitted", "marked"])
    .is("published_at", null)
    .select("id, access_token")
    .maybeSingle();
  if (error || !published) return false;

  await recordExamResultEvent(admin, {
    organization_id: input.organizationId,
    exam_id: input.examId,
    attempt_id: input.attemptId,
    actor_id: input.actorId ?? null,
    event_type: "auto_published",
    metadata: { pre_publication_ms: input.processingMs ?? null },
  });
  await notifyExamResultPublished(published.id, published.access_token);
  return true;
}

/** Emit the same scoped event after the manual exam-level publication is persisted. */
export async function broadcastExamManualPublication(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    examId: string;
    actorId: string;
    published: boolean;
  },
): Promise<void> {
  const { data: attempts, error } = await admin.from("exam_attempts")
    .select("id, access_token, status, grading_status, pending_manual_count")
    .eq("exam_id", input.examId)
    .in("status", ["submitted", "auto_submitted", "marked"]);
  if (error || !attempts) return;

  const publishable = attempts.filter((attempt) =>
    ["graded", "not_started"].includes(attempt.grading_status) && Number(attempt.pending_manual_count ?? 0) === 0,
  );
  const eventType = input.published ? "manually_published" : "unpublished";
  if (publishable.length) {
    await recordExamResultEvent(admin, {
      organization_id: input.organizationId,
      exam_id: input.examId,
      actor_id: input.actorId,
      event_type: eventType,
      metadata: { attempt_count: publishable.length },
    });
  }
  await Promise.all(publishable.map((attempt) => notifyExamResultPublished(attempt.id, attempt.access_token, input.published)));
}
