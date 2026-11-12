/**
 * One examination-submission lifecycle, shared by every entry point.
 *
 * Before this module the platform had three independent implementations of
 * "close an attempt": two copies inside the candidate routes and a third inside
 * the scheduled sweep. They agreed by luck, not by construction, and each of
 * them had to re-derive the deadline and re-apply the status/idempotency rules.
 * A defect in one of them (or a change to one of them) could therefore submit a
 * candidate at a different moment than the others.
 *
 * Everything that closes an attempt now calls `applyDeadlineSubmission`:
 *
 *   * the candidate's own final submission (`/api/exam/submit`),
 *   * the candidate's read of the paper (`/api/exam/state`),
 *   * the scheduled sweep (`/api/cron/close-expired-attempts`).
 *
 * The rules it enforces, in order:
 *
 *  1. **Nothing but the clock.** The caller supplies the reason; the only reasons
 *     that close an attempt are the candidate's own confirmed submission and the
 *     official deadline. There is deliberately no code path from an integrity
 *     incident to this function — see `src/lib/integrity.ts`, which has no way to
 *     import this module and no attempt-mutating call of any kind.
 *  2. **The server clock decides.** `nowMs` is read on the server, never sent by
 *     the browser; a device clock — fast, slow or deliberately falsified — cannot
 *     move the decision.
 *  3. **A confirmation before the deadline is the only way to close early**, and
 *     it is the candidate's explicit action, never an automatic one.
 *  4. **Idempotent.** The status write is conditional on `status = in_progress`.
 *     A duplicate request — a double-clicked button, a retried fetch, the sweep
 *     racing the candidate — finds the attempt already closed and returns the
 *     stored outcome instead of grading or writing again.
 *  5. **Answers are never touched.** Grading only reads `exam_answers`; the
 *     closure only writes status, the submission instant and the totals.
 *  6. **Every closure is evidenced.** A successful closure appends one row to
 *     `exam_result_events` (`submitted` or `auto_submitted`) carrying the clock
 *     decision that authorised it, so "why did this paper close at 09:12?" is
 *     answerable from the record instead of reconstructed from guesswork. The
 *     write is best-effort: a failure to journal never reopens or re-closes an
 *     attempt.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { attemptDeadlineInstant, deadlineReached, submissionWindow, type SubmissionWindow } from "./examDeadline";
import { manualPauseMs } from "./examPause";
import { attemptRows, gradeAttempt, type AttemptContext } from "./exam";

/** Why an attempt is being closed. Two values only: the candidate, or the clock. */
export type SubmissionReason = "candidate" | "deadline";

export type SubmissionOutcome =
  /** The attempt was open and is now closed by this call. */
  | "closed"
  /** The attempt was already closed; nothing was written. */
  | "already_closed"
  /** The caller asked to close the attempt but its deadline has not arrived. */
  | "refused_premature"
  /** The paper is missing or no longer matches the stored question order. */
  | "paper_unavailable"
  /** Grading could not be completed; nothing was closed. */
  | "grading_failed"
  /** The conditional status write lost a race or failed; nothing was closed. */
  | "close_failed"
  /** The attempt closed but the candidate row could not be updated. */
  | "candidate_status_failed";

export interface SubmissionResult {
  outcome: SubmissionOutcome;
  /** Status stored on the attempt (`in_progress` when nothing was closed). */
  status: string;
  /** The instant recorded as `submitted_at`, ISO, when this call closed the attempt. */
  submittedAt: string | null;
  /** Authoritative deadline, ISO, or `null` when the record cannot produce one. */
  deadline: string | null;
  /** True when the recorded status is `auto_submitted`. */
  autoSubmitted: boolean;
  /** Totals from this grading run; `null` when nothing was graded. */
  score: number | null;
  max: number | null;
  window: SubmissionWindow;
}

/** Attempt fields needed to decide and to close. */
interface CloseableAttempt {
  id: string;
  exam_id?: string;
  candidate_id: string;
  status: string;
  started_at: string;
  extension_minutes?: number | string | null;
  question_order?: unknown;
  submitted_at?: string | null;
  score?: number | string | null;
  max_score?: number | string | null;
  /** Manual organizer pause state (migration 0098). Legacy rows: never paused. */
  pause_reasons?: string[] | null;
  paused_at?: string | null;
}

/** Exam fields needed to decide and to grade. */
interface CloseableExam {
  id: string;
  duration_minutes: number;
  ends_at: string | null;
  quiz_id: string | null;
  settings: Record<string, unknown> | null;
  /** Owning tenant; recorded on the evidence row. */
  organization_id?: string | null;
}

/**
 * Closes one attempt, or explains why it will not.
 *
 * `reason: "deadline"` is refused unless the official time is genuinely over —
 * this is the guard that makes a premature automatic submission impossible
 * rather than merely unlikely. A caller cannot ask for an early closure, and no
 * incident handler exists that could.
 */
export async function applyDeadlineSubmission(
  admin: SupabaseClient,
  attempt: CloseableAttempt,
  exam: CloseableExam,
  options: {
    reason: SubmissionReason;
    /** Server instant for the decision. Always injected by the caller from the server clock. */
    nowMs: number;
    /** Mark the candidate `submitted` after a successful closure. Defaults to true. */
    markCandidate?: boolean;
  },
): Promise<SubmissionResult> {
  // Pause-aware: an open manual pause (organizer-wide or individual) freezes
  // the countdown, so the closure decision must include the live paused time —
  // a paused attempt can never be closed by the clock mid-pause.
  const window = submissionWindow(exam, attempt, options.nowMs, attempt.extension_minutes, manualPauseMs(attempt, options.nowMs));

  // ── Already closed: report the stored outcome, write nothing. ────────────
  if (attempt.status !== "in_progress") {
    return {
      outcome: "already_closed",
      status: attempt.status,
      submittedAt: typeof attempt.submitted_at === "string" ? attempt.submitted_at : null,
      deadline: window.deadline,
      autoSubmitted: attempt.status === "auto_submitted",
      score: attempt.score === null || attempt.score === undefined ? null : Number(attempt.score),
      max: attempt.max_score === null || attempt.max_score === undefined ? null : Number(attempt.max_score),
      window,
    };
  }

  // ── The deadline guard. The only refusal path, and the most important one. ─
  if (options.reason === "deadline" && !window.reached) {
    return {
      outcome: "refused_premature",
      status: attempt.status,
      submittedAt: null,
      deadline: window.deadline,
      autoSubmitted: false,
      score: null,
      max: null,
      window,
    };
  }

  // ── Grade the answers already saved. Read-only on the answers. ───────────
  let rows: Awaited<ReturnType<typeof attemptRows>>;
  try {
    rows = await attemptRows(admin, { quiz_id: exam.quiz_id, settings: exam.settings ?? {} }, {
      id: attempt.id,
      question_order: attempt.question_order,
    });
  } catch {
    return unfilled("paper_unavailable", window);
  }

  let score: number;
  let max: number;
  try {
    ({ score, max } = await gradeAttempt(admin, attempt.id, rows));
  } catch {
    return unfilled("grading_failed", window);
  }

  // The instant written to the record. A candidate's own confirmation is stamped
  // with the moment it happened; an automatic closure is stamped with the
  // official deadline, so the record says *why* and *when* the paper ended —
  // never the later instant at which a request happened to arrive.
  const isDeadline = options.reason === "deadline";
  const submittedInstant = isDeadline ? window.deadlineMs : options.nowMs;
  if (!Number.isFinite(submittedInstant)) return unfilled("close_failed", window);
  const submittedIso = new Date(submittedInstant).toISOString();
  const finalStatus = isDeadline ? "auto_submitted" : "submitted";

  // ── Conditional write: the attempt must still be open. Idempotent. ───────
  const { data: closed, error } = await admin
    .from("exam_attempts")
    .update({ status: finalStatus, submitted_at: submittedIso, score, max_score: max })
    .eq("id", attempt.id)
    .eq("status", "in_progress")
    .select("id")
    .maybeSingle();
  if (error) return unfilled("close_failed", window);
  if (!closed) {
    // Somebody else closed it between our read and our write. Re-read the stored
    // outcome so the caller can answer honestly instead of claiming a closure.
    const { data: stored } = await admin
      .from("exam_attempts")
      .select("status, submitted_at, score, max_score")
      .eq("id", attempt.id)
      .maybeSingle();
    // The write matched nothing and the attempt cannot be read back: this call
    // cannot confirm anything, so it says so rather than inventing a status.
    if (!stored) return unfilled("close_failed", window);
    return {
      outcome: "already_closed",
      status: (stored?.status as string | undefined) ?? "submitted",
      submittedAt: (stored?.submitted_at as string | undefined) ?? null,
      deadline: window.deadline,
      autoSubmitted: stored?.status === "auto_submitted",
      score: stored?.score === null || stored?.score === undefined ? null : Number(stored.score),
      max: stored?.max_score === null || stored?.max_score === undefined ? null : Number(stored.max_score),
      window,
    };
  }

  // The attempt is closed at this point. A failure here is reported so an
  // operator can reconcile the candidate row; it never reopens the attempt.
  if (options.markCandidate !== false) {
    const { error: candidateError } = await admin
      .from("exam_candidates")
      .update({ status: "submitted" })
      .eq("id", attempt.candidate_id);
    if (candidateError) {
      return {
        outcome: "candidate_status_failed",
        status: finalStatus,
        submittedAt: submittedIso,
        deadline: window.deadline,
        autoSubmitted: isDeadline,
        score,
        max,
        window,
      };
    }
  }

  await recordSubmissionEvent(admin, {
    attemptId: attempt.id,
    examId: exam.id,
    organizationId: exam.organization_id ?? null,
    reason: options.reason,
    status: finalStatus,
    submittedAt: submittedIso,
    window,
    score,
    max,
  });

  return {
    outcome: "closed",
    status: finalStatus,
    submittedAt: submittedIso,
    deadline: window.deadline,
    autoSubmitted: isDeadline,
    score,
    max,
    window,
  };
}

/**
 * Append-only evidence of one closure.
 *
 * Best-effort by design: the attempt is already closed and consistent, so a
 * journalling failure is swallowed rather than reported as a failed submission
 * the candidate would try to repeat. The payload deliberately contains only the
 * clock facts — no answers, no tokens, no candidate identity.
 */
async function recordSubmissionEvent(
  admin: SupabaseClient,
  facts: {
    attemptId: string;
    examId: string;
    organizationId: string | null;
    reason: SubmissionReason;
    status: string;
    submittedAt: string;
    window: SubmissionWindow;
    score: number;
    max: number;
  },
): Promise<void> {
  // The table requires a tenant; without one there is nothing meaningful to
  // record, and the attempt is already closed and consistent either way.
  if (!facts.organizationId) return;
  try {
    await admin.from("exam_result_events").insert({
      organization_id: facts.organizationId,
      attempt_id: facts.attemptId,
      exam_id: facts.examId,
      event_type: facts.status === "auto_submitted" ? "auto_submitted" : "submitted",
      actor_id: null,
      metadata: {
        reason: facts.reason === "deadline" ? "deadline" : "candidate_confirmed",
        submitted_at: facts.submittedAt,
        deadline: facts.window.deadline,
        bound_by: facts.window.boundBy,
        server_now: new Date(facts.window.nowMs).toISOString(),
        auto_score: facts.score,
        auto_max_score: facts.max,
      },
    });
  } catch {
    // Evidence is desirable; a closed, consistent attempt matters more.
  }
}

function unfilled(outcome: SubmissionOutcome, window: SubmissionWindow): SubmissionResult {
  return {
    outcome,
    status: "in_progress",
    submittedAt: null,
    deadline: window.deadline,
    autoSubmitted: false,
    score: null,
    max: null,
    window,
  };
}

/**
 * Convenience wrapper for the candidate routes: given a loaded attempt context,
 * close the attempt because its deadline has passed. Returns the same shape so
 * both routes answer identically.
 */
export async function closeForDeadline(
  admin: SupabaseClient,
  ctx: Pick<AttemptContext, "attempt" | "exam" | "candidate">,
  nowMs: number,
): Promise<SubmissionResult> {
  return applyDeadlineSubmission(
    admin,
    ctx.attempt as unknown as CloseableAttempt,
    {
      id: ctx.exam.id,
      duration_minutes: ctx.exam.duration_minutes,
      ends_at: ctx.exam.ends_at,
      quiz_id: ctx.exam.quiz_id,
      settings: (ctx.exam.settings ?? null) as Record<string, unknown> | null,
      organization_id: ctx.exam.organization_id ?? null,
    },
    { reason: "deadline", nowMs },
  );
}

/** Re-exported so callers can reason about the deadline without importing two modules. */
export { attemptDeadlineInstant, deadlineReached, submissionWindow };
export type { SubmissionWindow };
