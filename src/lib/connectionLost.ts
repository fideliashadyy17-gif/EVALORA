/**
 * CONNECTION_LOST pause — the automatic transition that makes a disconnected
 * candidate an INTERRUPTED attempt instead of a submitted one (migration
 * 0099, spec §6).
 *
 * The rule, in one sentence: when the server stops hearing from a candidate's
 * device, the attempt is paused with reason 'connection' anchored at the last
 * confirmed heartbeat, and it stays paused — excluded from every deadline
 * sweep, closure and timeout — until the candidate's own authenticated return
 * clears it and folds the paused duration into `extension_minutes`.
 *
 * What this module deliberately does NOT do:
 *  · it never submits, grades or closes anything;
 *  · it never restarts a countdown (credit preserves the remaining time);
 *  · it never touches organizer pauses — reasons are independent, and a
 *    reconnection clears ONLY 'connection' (0098's union-credit rule);
 *  · it invents no evidence: the anchor is the server's own presence record
 *    (or `started_at` when a device never managed a single heartbeat), always
 *    clamped inside [started_at, now] by the RPC.
 *
 * Server-side only (takes the service-role client). Pure decision helpers are
 * exported separately so every boundary — sweep, state, presence, save,
 * submit — applies the SAME staleness rule.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONNECTION_PAUSE_REASON, hasConnectionPause } from "./examPause.ts";

/**
 * How long a device may be silent before the server treats the connection as
 * lost. The client heartbeats every 20 s and the roster reports "online"
 * within 45 s (src/lib/presence.ts); one full online window plus one
 * heartbeat interval means three consecutive missed heartbeats — ordinary
 * latency, a slow tab or a brief Wi-Fi handover can never trigger a pause,
 * while a real outage triggers it promptly.
 */
export const CONNECTION_LOST_AFTER_MS = 65_000;

/** Fields the decision helpers read from an attempt row. */
export interface ConnectionAttempt {
  id: string;
  exam_id: string;
  status?: string | null;
  started_at?: string | null;
  extension_minutes?: number | string | null;
  pause_reasons?: string[] | null;
  paused_at?: string | null;
}

function parseMs(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The evidence anchor for a connection pause: the last instant the server
 * actually heard from the device, or the attempt start when no heartbeat ever
 * arrived. `null` only when neither instant is readable — callers must then
 * treat the attempt as NOT connection-lost (no evidence, no invention).
 */
export function connectionLostAnchor(
  attempt: Pick<ConnectionAttempt, "started_at">,
  lastSeenIso: string | null | undefined,
  nowMs: number,
): { anchorMs: number; anchorIso: string } | null {
  const lastSeen = parseMs(lastSeenIso);
  const started = parseMs(attempt.started_at);
  const anchorMs = lastSeen ?? started;
  if (anchorMs === null) return null;
  const clamped = Math.min(anchorMs, nowMs);
  if (!Number.isFinite(clamped)) return null;
  return { anchorMs: clamped, anchorIso: new Date(clamped).toISOString() };
}

/**
 * True when the server has confirmed this attempt's device silent for longer
 * than the connection-lost threshold. An attempt that is not in progress, is
 * already paused (for ANY reason — an organizer pause owns the window while
 * it is open) or has no readable evidence is never "connection lost" here.
 */
export function isConnectionLost(
  attempt: ConnectionAttempt,
  lastSeenIso: string | null | undefined,
  nowMs: number,
): boolean {
  if ((attempt.status ?? "in_progress") !== "in_progress") return false;
  if (Array.isArray(attempt.pause_reasons) && attempt.pause_reasons.length > 0) return false;
  const anchor = connectionLostAnchor(attempt, lastSeenIso, nowMs);
  if (!anchor) return false;
  return nowMs - anchor.anchorMs > CONNECTION_LOST_AFTER_MS;
}

/** The ledger row shape shared by both transitions (exam_pause_events). */
interface PauseEventRow {
  organization_id: string;
  exam_id: string;
  attempt_id: string;
  actor_id: null;
  scope: "attempt";
  action: "pause" | "resume";
  reason: typeof CONNECTION_PAUSE_REASON;
  pause_reasons_before: string[];
  pause_reasons_after: string[];
  credited_minutes: number;
}

export interface ConnectionPauseResult {
  paused: boolean;
  reasons: string[];
  paused_at?: string | null;
}

export interface ConnectionResumeResult {
  /** True while ANOTHER reason (an organizer pause) is still open. */
  paused: boolean;
  reasons: string[];
  credited_minutes: number;
  extension_minutes: number | null;
  /** Anchor the pause window was opened at (evidence instant), when known. */
  anchorIso: string | null;
}

/**
 * Pause one in-progress attempt for a confirmed connection loss, anchored at
 * the evidence instant. Idempotent: an attempt already carrying ANY pause
 * reason is left exactly as it is (the RPC duplicate no-op backs this up).
 * Returns null when the transition did not happen (attempt gone, already
 * submitted, or the database refused) — callers then fall back to their
 * existing conservative behaviour, which for every deadline handler means
 * "do not close".
 */
export async function pauseForConnectionLost(
  admin: SupabaseClient,
  attempt: ConnectionAttempt,
  organizationId: string,
  anchorIso: string,
): Promise<ConnectionPauseResult | null> {
  const before = Array.isArray(attempt.pause_reasons) ? [...attempt.pause_reasons] : [];
  if (before.length > 0) return null; // another pause owns the window already
  const { data, error } = await admin.rpc("exam_attempt_set_pause", {
    p_attempt_id: attempt.id,
    p_reason: CONNECTION_PAUSE_REASON,
    p_paused: true,
    p_paused_at: anchorIso,
  });
  if (error || !data || typeof data !== "object") return null;
  const result = data as ConnectionPauseResult;
  await admin.from("exam_pause_events").insert({
    organization_id: organizationId,
    exam_id: attempt.exam_id,
    attempt_id: attempt.id,
    actor_id: null,
    scope: "attempt",
    action: "pause",
    reason: CONNECTION_PAUSE_REASON,
    pause_reasons_before: before,
    pause_reasons_after: Array.isArray(result.reasons) ? result.reasons : [CONNECTION_PAUSE_REASON],
    credited_minutes: 0,
  } satisfies PauseEventRow);
  return result;
}

/**
 * Clear the connection pause because the candidate is provably back (their
 * authenticated request just reached the server). The RPC folds the paused
 * window — anchored at the last confirmed heartbeat — into
 * `extension_minutes`, so the countdown continues with the SAME remaining
 * time the candidate had when the connection dropped. When an organizer
 * reason is still open the attempt stays paused (result.paused === true) and
 * no credit is taken yet: reconnection never cancels a manual pause.
 *
 * Also writes the exam_connection_events ledger row for the credited window,
 * which deduplicates the 0097 `restored`-event credit path (same unique
 * (attempt_id, lost_at) key), so one outage can never be credited twice.
 */
export async function resumeConnectionPause(
  admin: SupabaseClient,
  attempt: ConnectionAttempt,
  organizationId: string,
): Promise<ConnectionResumeResult | null> {
  if (!hasConnectionPause(attempt)) return null;
  const before = Array.isArray(attempt.pause_reasons) ? [...attempt.pause_reasons] : [];
  const anchorIso = typeof attempt.paused_at === "string" ? attempt.paused_at : null;
  const { data, error } = await admin.rpc("exam_attempt_set_pause", {
    p_attempt_id: attempt.id,
    p_reason: CONNECTION_PAUSE_REASON,
    p_paused: false,
  });
  if (error || !data || typeof data !== "object") return null;
  const result = data as { paused?: boolean; reasons?: string[]; credited_minutes?: number; extension_minutes?: number; duplicate?: boolean };
  const credited = Math.max(0, Number(result.credited_minutes ?? 0));
  await admin.from("exam_pause_events").insert({
    organization_id: organizationId,
    exam_id: attempt.exam_id,
    attempt_id: attempt.id,
    actor_id: null,
    scope: "attempt",
    action: "resume",
    reason: CONNECTION_PAUSE_REASON,
    pause_reasons_before: before,
    pause_reasons_after: Array.isArray(result.reasons) ? result.reasons : [],
    credited_minutes: credited,
  } satisfies PauseEventRow);

  // Mirror the credit into the connection ledger so the presence `restored`
  // path (0097) sees this exact window as already handled: its upsert on
  // (attempt_id, lost_at) with ignoreDuplicates becomes a no-op.
  if (credited > 0 && anchorIso) {
    const extensionAfter = Number.isFinite(Number(result.extension_minutes))
      ? Number(result.extension_minutes)
      : Number(attempt.extension_minutes ?? 0) + credited;
    await admin
      .from("exam_connection_events")
      .upsert(
        {
          attempt_id: attempt.id,
          exam_id: attempt.exam_id,
          organization_id: organizationId,
          event_kind: "pause_credit",
          lost_at: anchorIso,
          restored_at: new Date().toISOString(),
          claimed_ms: Math.max(0, Date.now() - Date.parse(anchorIso)),
          hidden_ms: 0,
          credit_ms: credited * 60_000,
          extension_minutes_before: Number(attempt.extension_minutes ?? 0),
          extension_minutes_after: extensionAfter,
          refusal_reason: "connection_pause_resume",
        },
        { onConflict: "attempt_id,lost_at", ignoreDuplicates: true },
      );
  }

  return {
    paused: Boolean(result.paused),
    reasons: Array.isArray(result.reasons) ? result.reasons : [],
    credited_minutes: credited,
    extension_minutes: Number.isFinite(Number(result.extension_minutes)) ? Number(result.extension_minutes) : null,
    anchorIso,
  };
}
