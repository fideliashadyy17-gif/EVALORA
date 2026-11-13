/**
 * Server-side closure of examination attempts whose deadline has passed.
 *
 * Why this exists: an attempt is otherwise closed only when the candidate's browser calls
 * /api/exam/state or /api/exam/submit after the deadline. A candidate who leaves the paper
 * never makes that call, so the attempt stayed `in_progress` indefinitely.
 *
 * The sweep no longer owns a copy of the closing logic. It calls the same
 * `applyDeadlineSubmission` the candidate routes call, with the same
 * `reason: "deadline"` guard, so it is structurally incapable of closing an
 * attempt before its official deadline: the guard refuses, and the refusal is
 * reported rather than retried into a write. It is triggered by the scheduled
 * sweep route, never by a candidate, and it writes only to attempts already past
 * their server deadline. Nothing here changes an attempt that is still within
 * its time.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { connectionLostAnchor, isConnectionLost, pauseForConnectionLost } from "./connectionLost";
import { submissionWindow } from "./examDeadline";
import { isManuallyPaused, manualPauseMs } from "./examPause";
import { applyDeadlineSubmission } from "./examSubmission";

/** Maximum in-progress attempts examined per sweep. Bounded so one run stays short. */
export const SWEEP_BATCH = 200;

export interface OpenAttemptRow {
  id: string;
  exam_id: string;
  candidate_id: string;
  started_at: string;
  extension_minutes: number | null;
  question_order: unknown;
  /** Pause state (migrations 0098/0099). Legacy rows: never paused. */
  pause_reasons?: string[] | null;
  paused_at?: string | null;
}

export interface ExamForDeadline {
  id: string;
  duration_minutes: number;
  ends_at: string | null;
  quiz_id: string | null;
  settings: Record<string, unknown> | null;
}

export type SweepFailure = {
  attempt_id: string;
  reason:
    | "exam_missing"
    | "paper_unavailable"
    | "grading_failed"
    | "close_failed"
    | "candidate_status_failed"
    /** The attempt is still within its official time: never a reason to close it. */
    | "not_yet_due"
    /** The lifecycle itself refused the closure because the deadline had not passed. */
    | "refused_premature";
};

export interface SweepResult {
  checked: number;
  expired: number;
  closed: string[];
  already_closed: string[];
  /** Attempts whose device went silent: paused for CONNECTION_LOST, never closed. */
  connection_paused: string[];
  failed: SweepFailure[];
}

/**
 * The server's deadline rule. The instant of equality is not yet expired: the
 * deadline plus the submission clock margin must have elapsed, matching the
 * candidate route exactly because both read `submissionWindow`.
 */
export function isPastDeadline(
  attempt: Pick<OpenAttemptRow, "started_at" | "extension_minutes" | "pause_reasons" | "paused_at">,
  exam: Pick<ExamForDeadline, "duration_minutes" | "ends_at">,
  nowMs: number,
): boolean {
  // A manually paused attempt is never past its deadline: the open pause
  // joins the window exactly like an extension, so the sweep structurally
  // cannot close an attempt an organizer has paused.
  if (isManuallyPaused(attempt)) return false;
  return submissionWindow(exam, attempt, nowMs, attempt.extension_minutes, manualPauseMs(attempt, nowMs)).reached;
}

/** Constant-time check of `Authorization: Bearer <secret>`. Digests make the comparison length-independent. */
export function cronAuthorized(header: string | null, secret: string): boolean {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!match || !secret) return false;
  const given = createHash("sha256").update(match[1]).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}

/**
 * One sweep: finds in-progress attempts (oldest first, bounded), keeps only those past their server
 * deadline, and closes each through the shared submission lifecycle. A failure on one attempt is
 * recorded and does not stop the others. An attempt that is not yet due is skipped silently.
 */
export async function sweepExpiredAttempts(admin: SupabaseClient, nowMs: number = Date.now()): Promise<SweepResult> {
  const { data: open, error: openError } = await admin
    .from("exam_attempts")
    .select("id, exam_id, candidate_id, started_at, extension_minutes, question_order, pause_reasons, paused_at")
    .eq("status", "in_progress")
    .order("started_at", { ascending: true })
    .limit(SWEEP_BATCH);
  if (openError) throw new Error("Open attempts could not be listed.");

  const attempts = (open ?? []) as OpenAttemptRow[];
  const result: SweepResult = { checked: attempts.length, expired: 0, closed: [], already_closed: [], connection_paused: [], failed: [] };
  if (!attempts.length) return result;

  const examIds = [...new Set(attempts.map((a) => a.exam_id))];
  const { data: exams, error: examError } = await admin.from("exams").select("*").in("id", examIds);
  if (examError) throw new Error("Examinations could not be loaded.");
  const examById = new Map(((exams ?? []) as ExamForDeadline[]).map((e) => [e.id, e]));

  // The server's own record of when it last heard from each device. A silent
  // device is a disconnected candidate, NOT an absent one: their attempt is
  // paused for CONNECTION_LOST (anchored at the last confirmed heartbeat) and
  // skipped — the sweep can never submit someone whose connection dropped
  // (migration 0099; 2026-11-12 mass-outage incident).
  const attemptIds = attempts.map((a) => a.id);
  const { data: presenceRows } = await admin
    .from("exam_presence")
    .select("attempt_id, last_seen_at")
    .in("attempt_id", attemptIds);
  const lastSeenBy = new Map<string, string | null>(
    ((presenceRows ?? []) as { attempt_id: string; last_seen_at: string | null }[]).map((row) => [row.attempt_id, row.last_seen_at]),
  );

  for (const attempt of attempts) {
    const exam = examById.get(attempt.exam_id);
    if (!exam) {
      result.failed.push({ attempt_id: attempt.id, reason: "exam_missing" });
      continue;
    }

    // Confirmed connection loss pauses the attempt before any deadline rule
    // runs, whether or not the deadline has passed — the countdown freezes at
    // the evidence instant and the candidate resumes with the same remaining
    // time whenever they return.
    const lastSeen = lastSeenBy.get(attempt.id) ?? null;
    if (isConnectionLost(attempt, lastSeen, nowMs)) {
      const anchor = connectionLostAnchor(attempt, lastSeen, nowMs);
      const paused = anchor
        ? await pauseForConnectionLost(admin, attempt, String((exam as { organization_id?: string }).organization_id ?? ""), anchor.anchorIso)
        : null;
      if (paused) result.connection_paused.push(attempt.id);
      // Paused (or a concurrent transition owns it now): never close here.
      continue;
    }

    if (!isPastDeadline(attempt, exam, nowMs)) continue;
    result.expired += 1;
    const outcome = await applyDeadlineSubmission(
      admin,
      { ...attempt, status: "in_progress" },
      { ...exam, settings: exam.settings ?? {} },
      { reason: "deadline", nowMs },
    );
    if (outcome.outcome === "closed") result.closed.push(attempt.id);
    else if (outcome.outcome === "already_closed") result.already_closed.push(attempt.id);
    else result.failed.push({ attempt_id: attempt.id, reason: outcome.outcome });
  }
  return result;
}
