/**
 * Server-side closure of examination attempts whose deadline has passed.
 *
 * Why this exists: an attempt is otherwise closed only when the candidate's browser calls
 * /api/exam/state or /api/exam/submit after the deadline. A candidate who leaves the paper
 * never makes that call, so the attempt stayed `in_progress` indefinitely.
 *
 * This module runs the same closure as the candidate route (grade the saved answers, close as
 * auto_submitted at the deadline instant, mark the candidate submitted). It is triggered by
 * the scheduled sweep route, never by a candidate, and it writes only to attempts already past
 * their server deadline. Nothing here changes an attempt that is still within its time.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { attemptDeadline, attemptRows, gradeAttempt } from "./exam";

/** Maximum in-progress attempts examined per sweep. Bounded so one run stays short. */
export const SWEEP_BATCH = 200;

export interface OpenAttemptRow {
  id: string;
  exam_id: string;
  candidate_id: string;
  started_at: string;
  extension_minutes: number | null;
  question_order: unknown;
}

export interface ExamForDeadline {
  id: string;
  duration_minutes: number;
  ends_at: string | null;
  quiz_id: string | null;
  settings: Record<string, unknown> | null;
}

export type SweepFailure = { attempt_id: string; reason: "exam_missing" | "paper_unavailable" | "grading_failed" | "close_failed" | "candidate_status_failed" };

export interface SweepResult {
  checked: number;
  expired: number;
  closed: string[];
  already_closed: string[];
  failed: SweepFailure[];
}

/**
 * The server's deadline rule, exactly as the candidate route applies it. The instant of equality is
 * not yet expired (strictly after the deadline), matching `new Date() > deadline` in the candidate route.
 */
export function isPastDeadline(attempt: Pick<OpenAttemptRow, "started_at" | "extension_minutes">, exam: Pick<ExamForDeadline, "duration_minutes" | "ends_at">, nowMs: number): boolean {
  const deadline = attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0));
  return nowMs > deadline.getTime();
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
 * Closes one expired attempt. The status update is conditional on `in_progress`, so a candidate
 * submission that lands at the same moment is never overwritten, and a second sweep is a no-op.
 */
async function closeExpiredAttempt(
  admin: SupabaseClient,
  attempt: OpenAttemptRow,
  exam: ExamForDeadline & { settings: Record<string, unknown> },
): Promise<"closed" | "already_closed" | SweepFailure["reason"]> {
  let rows: Awaited<ReturnType<typeof attemptRows>>;
  try {
    rows = await attemptRows(admin, exam, attempt);
  } catch {
    // The paper is missing or no longer matches the stored question order: nothing is graded or closed.
    return "paper_unavailable";
  }
  let score: number;
  let max: number;
  try {
    ({ score, max } = await gradeAttempt(admin, attempt.id, rows));
  } catch {
    return "grading_failed";
  }

  const deadline = attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0));
  const { data: closed, error } = await admin
    .from("exam_attempts")
    .update({ status: "auto_submitted", submitted_at: deadline.toISOString(), score, max_score: max })
    .eq("id", attempt.id)
    .eq("status", "in_progress")
    .select("id")
    .maybeSingle();
  if (error) return "close_failed";
  if (!closed) return "already_closed";

  // The attempt is closed at this point. A failure here is reported so an operator can check the candidate's status.
  const { error: candidateError } = await admin.from("exam_candidates").update({ status: "submitted" }).eq("id", attempt.candidate_id);
  return candidateError ? "candidate_status_failed" : "closed";
}

/**
 * One sweep: finds in-progress attempts (oldest first, bounded), keeps only those past their server
 * deadline, and closes each. A failure on one attempt is recorded and does not stop the others.
 */
export async function sweepExpiredAttempts(admin: SupabaseClient, nowMs: number = Date.now()): Promise<SweepResult> {
  const { data: open, error: openError } = await admin
    .from("exam_attempts")
    .select("id, exam_id, candidate_id, started_at, extension_minutes, question_order")
    .eq("status", "in_progress")
    .order("started_at", { ascending: true })
    .limit(SWEEP_BATCH);
  if (openError) throw new Error("Open attempts could not be listed.");

  const attempts = (open ?? []) as OpenAttemptRow[];
  const result: SweepResult = { checked: attempts.length, expired: 0, closed: [], already_closed: [], failed: [] };
  if (!attempts.length) return result;

  const examIds = [...new Set(attempts.map((a) => a.exam_id))];
  const { data: exams, error: examError } = await admin.from("exams").select("*").in("id", examIds);
  if (examError) throw new Error("Examinations could not be loaded.");
  const examById = new Map(((exams ?? []) as ExamForDeadline[]).map((e) => [e.id, e]));

  for (const attempt of attempts) {
    const exam = examById.get(attempt.exam_id);
    if (!exam) {
      result.failed.push({ attempt_id: attempt.id, reason: "exam_missing" });
      continue;
    }
    if (!isPastDeadline(attempt, exam, nowMs)) continue;
    result.expired += 1;
    const outcome = await closeExpiredAttempt(admin, attempt, { ...exam, settings: exam.settings ?? {} });
    if (outcome === "closed") result.closed.push(attempt.id);
    else if (outcome === "already_closed") result.already_closed.push(attempt.id);
    else result.failed.push({ attempt_id: attempt.id, reason: outcome });
  }
  return result;
}
