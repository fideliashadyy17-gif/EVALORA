/**
 * The single, authoritative examination-deadline rule for EVALORA.
 *
 * Every surface that decides "is this attempt still open?" — the candidate
 * routes, the teacher monitor, the administration time-limits page and the
 * scheduled sweep — reads this module. There is exactly one formula, so two
 * parts of the platform can never disagree about when a paper closes.
 *
 * The rule (non-negotiable, see docs/EXAM_SUBMISSION_INTEGRITY.md):
 *
 *   deadline = min(started_at + duration_minutes + extension_minutes,
 *                  ends_at + extension_minutes)
 *
 * and an attempt may only be closed automatically once that instant has passed:
 *
 *   now >= deadline + SUBMISSION_CLOCK_MARGIN_MS
 *
 * Two properties matter more than anything else here:
 *
 *  1. **A premature submission is impossible, not merely discouraged.** The
 *     comparison is total: an unreadable duration, an unreadable start time or a
 *     missing window can only ever move the deadline *later*, never earlier. A
 *     malformed record therefore closes late (and an operator sees it) instead
 *     of closing a candidate's paper while they are still composing.
 *  2. **Nothing but the clock can close a paper.** This module knows about
 *     durations and instants. It has no concept of an incident, a violation, a
 *     browser event or a candidate gesture, so no anti-cheating signal can
 *     reach it. Submission and incident detection are separate processes by
 *     construction.
 *
 * Pure functions only: no DOM, no database, no React, no clock of its own
 * (`now` is always injected), so every boundary can be unit-tested exactly.
 */

/** Milliseconds in a minute. Named so the formula below reads as arithmetic, not magic. */
const MINUTE_MS = 60_000;

/**
 * Grace period added to the computed deadline before an attempt may be closed
 * automatically.
 *
 * Why it exists: the server computes `started_at + duration` in application
 * code, while the browser renders a countdown from the same instant. Between the
 * two there is always some latency — a slow autosave, a phone waking up, a
 * request that sat in a queue. Closing on the exact millisecond turns that
 * ordinary latency into an accusation of "auto_submitted". Two seconds is far
 * longer than any of those delays and far shorter than anything that could
 * change an examination outcome.
 *
 * The grace period only ever *extends* the deadline. It can never shorten it,
 * so it cannot cause an early submission.
 */
export const SUBMISSION_CLOCK_MARGIN_MS = 2_000;

/** Extensions are bounded by the database; the same bound is enforced here. */
export const MAX_EXTENSION_MINUTES = 1_440;

/** Shape of the examination fields the deadline depends on. */
export interface DeadlineExam {
  duration_minutes?: number | string | null;
  ends_at?: string | null;
}

/** Shape of the attempt fields the deadline depends on. */
export interface DeadlineAttempt {
  started_at?: string | null;
  extension_minutes?: number | string | null;
}

/**
 * Parses a database timestamp into epoch milliseconds.
 *
 * Returns `null` rather than `NaN` for anything unreadable, because `NaN`
 * silently poisons every later comparison (`now > NaN` is `false`, and
 * `Math.min(NaN, x)` is `NaN`) — exactly the class of defect that lets a
 * deadline computation be bypassed without anybody noticing.
 */
export function parseInstant(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * An authorised per-candidate extension, in milliseconds.
 *
 * Unreadable, negative and absurd values collapse to zero or to the maximum —
 * never to a negative shift, which would move the deadline *earlier* and could
 * close a paper before its official end.
 */
export function extensionMs(minutes: unknown): number {
  const parsed = typeof minutes === "number" ? minutes : Number(minutes);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(MAX_EXTENSION_MINUTES, Math.floor(parsed)) * MINUTE_MS;
}

/**
 * Exam duration in milliseconds.
 *
 * An unreadable or non-positive duration yields `null`: the deadline is then
 * decided by the examination window alone. A duration can never be turned into
 * a *shorter* deadline by malformed data.
 */
export function durationMs(minutes: unknown): number | null {
  const parsed = typeof minutes === "number" ? minutes : Number(minutes);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed) * MINUTE_MS;
}

/**
 * The absolute server deadline for one attempt.
 *
 * `Infinity` means "no deadline can be computed from this record" — the
 * conservative answer, because it can only ever fail to auto-submit (which an
 * invigilator or the administration time-limits screen will notice) and never
 * submit a candidate who is still working.
 */
export function attemptDeadlineInstant(exam: DeadlineExam, startedAt: string, extensionMinutes: unknown = 0): number {
  const ext = extensionMs(extensionMinutes);
  const started = parseInstant(startedAt);
  const duration = durationMs(exam?.duration_minutes);
  const windowEnd = parseInstant(exam?.ends_at ?? null);

  const candidates: number[] = [];
  if (started !== null && duration !== null) candidates.push(started + duration + ext);
  if (windowEnd !== null) candidates.push(windowEnd + ext);

  if (!candidates.length) return Infinity;
  return Math.min(...candidates);
}

/**
 * The absolute server deadline for one attempt, as a `Date`.
 *
 * Kept as the public entry point because every existing caller and test reads a
 * `Date`; `Infinity` is represented by `new Date(8.64e15)`, the largest instant
 * a JavaScript `Date` can hold, which every caller treats as "no deadline yet".
 */
export function attemptDeadline(exam: DeadlineExam, startedAt: string, extensionMinutes: unknown = 0): Date {
  const instant = attemptDeadlineInstant(exam, startedAt, extensionMinutes);
  if (instant === Infinity) return new Date(8.64e15);
  return new Date(instant);
}

/**
 * The one authoritative test for "may this attempt be closed automatically?".
 *
 * Equality is not yet expired: the candidate keeps the whole final second, and
 * the margin is added on top. Every automatic closure in the platform — the
 * candidate routes, the expiry sweep — funnels through this function.
 */
export function deadlineReached(deadline: number | Date, nowMs: number): boolean {
  const instant = deadline instanceof Date ? deadline.getTime() : deadline;
  if (!Number.isFinite(instant)) return false;
  if (!Number.isFinite(nowMs)) return false;
  return nowMs >= instant + SUBMISSION_CLOCK_MARGIN_MS;
}

/** Milliseconds left before the automatic closure becomes permitted. Never negative. */
export function remainingMs(deadline: number | Date, nowMs: number): number {
  const instant = deadline instanceof Date ? deadline.getTime() : deadline;
  if (!Number.isFinite(instant)) return Number.POSITIVE_INFINITY;
  return Math.max(0, instant + SUBMISSION_CLOCK_MARGIN_MS - nowMs);
}

/**
 * Everything a submission decision needs, computed once from the stored record.
 * Callers compare nothing themselves; they read `reached`.
 */
export interface SubmissionWindow {
  /** Authoritative deadline instant (ms). `Infinity` when the record is incomplete. */
  deadlineMs: number;
  /** ISO form of the deadline, or `null` when no deadline can be computed. */
  deadline: string | null;
  /** True only when the official time is over (deadline + margin). */
  reached: boolean;
  /** Milliseconds still available; `Infinity` when no deadline can be computed. */
  remainingMs: number;
  /** Which limit produced the deadline, for diagnostics and the admin console. */
  boundBy: "duration" | "window" | "none";
  /** The server instant used for the decision. */
  nowMs: number;
}

/** Computes the submission window for an attempt, purely. */
export function submissionWindow(
  exam: DeadlineExam,
  attempt: DeadlineAttempt,
  nowMs: number,
  extensionMinutes: unknown = attempt?.extension_minutes,
): SubmissionWindow {
  const ext = extensionMs(extensionMinutes);
  const started = parseInstant(attempt?.started_at ?? null);
  const duration = durationMs(exam?.duration_minutes);
  const windowEnd = parseInstant(exam?.ends_at ?? null);

  const byDuration = started !== null && duration !== null ? started + duration + ext : null;
  const byWindow = windowEnd !== null ? windowEnd + ext : null;

  let deadlineMs = Infinity;
  let boundBy: SubmissionWindow["boundBy"] = "none";
  if (byDuration !== null && byWindow !== null) {
    if (byDuration <= byWindow) {
      deadlineMs = byDuration;
      boundBy = "duration";
    } else {
      deadlineMs = byWindow;
      boundBy = "window";
    }
  } else if (byDuration !== null) {
    deadlineMs = byDuration;
    boundBy = "duration";
  } else if (byWindow !== null) {
    deadlineMs = byWindow;
    boundBy = "window";
  }

  return {
    deadlineMs,
    deadline: Number.isFinite(deadlineMs) ? new Date(deadlineMs).toISOString() : null,
    reached: deadlineReached(deadlineMs, nowMs),
    remainingMs: remainingMs(deadlineMs, nowMs),
    boundBy,
    nowMs,
  };
}
