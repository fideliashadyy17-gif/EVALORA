/**
 * Manual pause state for examinations — the shared rules every surface reads.
 *
 * Three pause reasons exist on the platform and they are tracked separately:
 *
 *   CONNECTION_PAUSE — automatic, from a confirmed internet outage. Owned by
 *     the presence heartbeat + exam_connection_events ledger (migration 0097,
 *     src/lib/presence.ts). It credits `extension_minutes` when the server
 *     confirms the student is back.
 *   ASSESSMENT_PAUSE — the organizer paused the whole examination
 *     (`exams.status = 'paused'`, attempt reason 'assessment').
 *   STUDENT_PAUSE — the organizer paused one student (attempt reason
 *     'student').
 *
 * The two MANUAL reasons live in `exam_attempts.pause_reasons` (migration
 * 0098) and share ONE window: `paused_at` is set when the first reason opens
 * and credit is computed when the LAST reason clears, so overlapping pauses
 * (a student paused individually during an assessment-wide pause) are credited
 * exactly once. An attempt is paused when its reasons array is non-empty —
 * its `status` stays `in_progress` so every existing submitted-check keeps
 * working untouched.
 *
 * Time preservation rides the existing extension rail:
 *   • while a manual pause is OPEN, deadline consumers add the live elapsed
 *     pause via `manualPauseMs` (the countdown freezes);
 *   • when the last reason clears, the database RPC folds the paused duration
 *     into `extension_minutes` (rounded up to whole minutes, student-favour),
 *     after which `manualPauseMs` is 0 and the extension carries the time.
 *
 * Pure functions only: no DOM, no database, no clock of their own.
 */

/** The manual pause reasons stored in `exam_attempts.pause_reasons`. */
export const MANUAL_PAUSE_REASONS = ["assessment", "student"] as const;
export type ManualPauseReason = (typeof MANUAL_PAUSE_REASONS)[number];

/** Fields the pause rules read from an attempt row. All optional: a legacy row without them is simply never paused. */
export interface PausableAttempt {
  pause_reasons?: string[] | null;
  paused_at?: string | null;
  extension_minutes?: number | string | null;
}

/** Normalizes the stored reasons array: only known reasons, deduplicated, in a stable order. */
export function parsePauseReasons(value: unknown): ManualPauseReason[] {
  if (!Array.isArray(value)) return [];
  const set = new Set<ManualPauseReason>();
  for (const entry of value) {
    if (entry === "assessment" || entry === "student") set.add(entry);
  }
  return MANUAL_PAUSE_REASONS.filter((reason) => set.has(reason));
}

/** True when at least one manual pause reason is open on this attempt. */
export function isManuallyPaused(attempt: PausableAttempt | null | undefined): boolean {
  return parsePauseReasons(attempt?.pause_reasons).length > 0;
}

/**
 * Milliseconds this attempt has been manually paused and not yet credited.
 *
 * Zero unless a pause is open with a readable `paused_at`. Negative clocks
 * collapse to zero; an open pause with an unreadable instant also yields zero
 * (the attempt is still paused — composition stays blocked — but no time is
 * invented for the deadline).
 */
export function manualPauseMs(attempt: PausableAttempt | null | undefined, nowMs: number): number {
  if (!isManuallyPaused(attempt)) return 0;
  const raw = attempt?.paused_at;
  if (typeof raw !== "string" || raw.trim() === "") return 0;
  const pausedAt = Date.parse(raw);
  if (!Number.isFinite(pausedAt) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, nowMs - pausedAt);
}

/**
 * The extension to use for deadline math, in minutes-equivalent milliseconds:
 * the stored extension plus the live (uncredited) manual pause. Every deadline
 * consumer — save, submit, state, sweep, monitoring — adds this, so a paused
 * attempt's countdown freezes WITHOUT touching the official deadline rule and
 * without a parallel timer: when the pause resumes, the RPC moves the paused
 * duration into `extension_minutes` and this helper returns to the stored
 * value with no discontinuity.
 */
export function effectiveExtensionMs(attempt: PausableAttempt | null | undefined, nowMs: number): number {
  const stored = Number(attempt?.extension_minutes ?? 0);
  const storedMs = Number.isFinite(stored) && stored > 0 ? Math.floor(stored) * 60_000 : 0;
  return storedMs + manualPauseMs(attempt, nowMs);
}

/**
 * Which pause a student-facing notice should name. Assessment-wide first (it
 * is the more informative message), then individual. Connection pauses are
 * NOT here — the presence UI owns that banner.
 */
export function pauseNoticeKind(attempt: PausableAttempt | null | undefined): "assessment" | "student" | null {
  const reasons = parsePauseReasons(attempt?.pause_reasons);
  if (reasons.includes("assessment")) return "assessment";
  if (reasons.includes("student")) return "student";
  return null;
}
