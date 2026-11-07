import type { SupabaseClient } from "@supabase/supabase-js";
import {
  escalationLevel,
  incidentTypeFor,
  isEventEnabled,
  isRecordable,
  severityForEvent,
  type IntegrityEvent,
  type IntegrityPolicy,
} from "./integrity";

/** One gesture should not become a row every few milliseconds. */
export const INTEGRITY_DEDUPE_MS = 2000;
/** Hard ceiling per attempt/participant, so a broken client cannot flood review. */
export const MAX_INTEGRITY_EVENTS = 300;

export type IntegrityScope =
  | {
      kind: "exam";
      attemptId: string;
      organizationId: string;
      examId: string;
      candidateId: string;
    }
  | {
      kind: "live";
      participantId: string;
      organizationId: string;
      quizId: string;
      sessionId: string;
    };

export interface IntegrityRecordingResult {
  recorded: boolean;
  count: number;
  level: ReturnType<typeof escalationLevel>;
  reason?: "integrity_disabled" | "event_disabled" | "duplicate" | "capped";
  violation?: boolean;
  warnAfter?: number;
  reviewAfter?: number;
}

/**
 * Shared server-side writer for examination attempts and live-quiz participants.
 *
 * Callers must first authenticate the assessment credential and resolve every
 * scope field from it. This function deliberately accepts no client-provided
 * exam, quiz, session, candidate, participant or organization identifiers in
 * its incident payload. The browser chooses only the event and small detail
 * object; all attribution and all escalation counts remain server-owned.
 */
export async function recordIntegrityEvent(
  admin: SupabaseClient,
  scope: IntegrityScope,
  event: IntegrityEvent,
  detail: Record<string, unknown> | undefined,
  policy: IntegrityPolicy,
): Promise<IntegrityRecordingResult> {
  if (!policy.enabled)
    return { recorded: false, count: 0, level: "none", reason: "integrity_disabled" };
  if (!isEventEnabled(event, policy))
    return { recorded: false, count: 0, level: "none", reason: "event_disabled" };

  const scopeColumn = scope.kind === "exam" ? "attempt_id" : "participant_id";
  const scopeId = scope.kind === "exam" ? scope.attemptId : scope.participantId;
  const type = incidentTypeFor(event);
  const informationalTypes = "(integrity_tab_visible,integrity_focus_back,integrity_online)";

  const countViolations = async () => {
    const { count } = await admin
      .from("proctoring_incidents")
      .select("id", { count: "exact", head: true })
      .eq(scopeColumn, scopeId)
      .like("type", "integrity_%")
      .not("type", "in", informationalTypes);
    return count ?? 0;
  };

  const countAll = async () => {
    const { count } = await admin
      .from("proctoring_incidents")
      .select("id", { count: "exact", head: true })
      .eq(scopeColumn, scopeId)
      .like("type", "integrity_%");
    return count ?? 0;
  };

  const { data: last } = await admin
    .from("proctoring_incidents")
    .select("type,created_at")
    .eq(scopeColumn, scopeId)
    .like("type", "integrity_%")
    .order("created_at", { ascending: false })
    .limit(40);
  const recent = (last ?? []) as { type: string; created_at: string }[];
  const lastSame = recent.find((row) => row.type === type);
  if (lastSame && Date.now() - Date.parse(lastSame.created_at) < INTEGRITY_DEDUPE_MS) {
    const count = await countViolations();
    return { recorded: false, count, level: escalationLevel(count, policy), reason: "duplicate" };
  }

  const stored = await countAll();
  if (stored >= MAX_INTEGRITY_EVENTS)
    return { recorded: false, count: await countViolations(), level: "none", reason: "capped" };

  const incident =
    scope.kind === "exam"
      ? {
          organization_id: scope.organizationId,
          exam_id: scope.examId,
          candidate_id: scope.candidateId,
          attempt_id: scope.attemptId,
          quiz_id: null,
          session_id: null,
          participant_id: null,
        }
      : {
          organization_id: scope.organizationId,
          exam_id: null,
          candidate_id: null,
          attempt_id: null,
          quiz_id: scope.quizId,
          session_id: scope.sessionId,
          participant_id: scope.participantId,
        };

  const note = detail ? JSON.stringify(detail).slice(0, 400) : null;
  const { error } = await admin.from("proctoring_incidents").insert({
    ...incident,
    type,
    severity: severityForEvent(event),
    note,
    status: "open",
  });
  if (error) throw new Error("The integrity event could not be recorded.");

  const count = await countViolations();
  return {
    recorded: true,
    count,
    level: escalationLevel(count, policy),
    violation: isRecordable(event),
    warnAfter: policy.warnAfter,
    reviewAfter: policy.reviewAfter,
  };
}
