/**
 * Server-side helpers for controlled examination retakes.
 *
 * Everything here runs with the service-role client and is only reached from
 * routes/actions that have already authenticated the caller (attempt token or
 * Super Admin session). The database guards in migration 0076 re-check the
 * same invariants, so a bug in one layer cannot silently create an attempt.
 */
import {
  admissionTrack,
  paperForTrack,
  trackSelectionEnabled,
  parseTrack,
} from "./examTrack";
import { loadQuizQuestions, seededShuffle } from "./live";
import { retakeState, usableGrant, type RetakeRequestView, type RetakeState } from "./examRetake";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RetakeExamRow {
  id: string;
  organization_id: string;
  title: string;
  quiz_id: string | null;
  settings: Record<string, unknown> | null;
  starts_at?: string | null;
  ends_at?: string | null;
  status?: string | null;
}

export interface RetakeCandidateRow {
  id: string;
  exam_id: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  class_id?: string | null;
  student_id?: string | null;
  guest_key_hash?: string | null;
  invite_token?: string | null;
  identity_data?: Record<string, unknown> | null;
  email?: string | null;
}

/** A deterministic but per-attempt question order: a retake is a fresh paper. */
export function retakeOrderSeed(examId: string, candidateId: string, attemptNumber: number): string {
  return attemptNumber <= 1 ? `${examId}:${candidateId}` : `${examId}:${candidateId}:attempt-${attemptNumber}`;
}

/** Newest-first request rows for one candidate + examination. */
export async function loadCandidateRetakeRequests(
  admin: SupabaseClient,
  examId: string,
  candidateId: string,
): Promise<RetakeRequestView[]> {
  const { data } = await admin
    .from("exam_retake_requests")
    .select("id,status,created_at,decided_at,decision_note,reason,granted_attempts,access_expires_at")
    .eq("exam_id", examId)
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as RetakeRequestView[];
}

/** Count how many attempts each approved request has already authorized. */
export async function loadGrantUsage(
  admin: SupabaseClient,
  requestIds: string[],
): Promise<Record<string, number>> {
  if (!requestIds.length) return {};
  const { data } = await admin
    .from("exam_attempts")
    .select("retake_request_id")
    .in("retake_request_id", requestIds);
  const usage: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = (row as { retake_request_id: string | null }).retake_request_id;
    if (id) usage[id] = (usage[id] ?? 0) + 1;
  }
  return usage;
}

/** The grant that currently authorizes a NEW attempt, if any. */
export async function findUsableGrant(
  admin: SupabaseClient,
  examId: string,
  candidateId: string,
  now: Date = new Date(),
) {
  const requests = await loadCandidateRetakeRequests(admin, examId, candidateId);
  const approved = requests.filter((r) => r.status === "approved");
  if (!approved.length) return null;
  const usage = await loadGrantUsage(admin, approved.map((r) => r.id));
  for (const request of approved) {
    const grant = usableGrant(request, { attemptsUsed: usage[request.id] ?? 0, now });
    if (grant && grant.remaining > 0 && grant.windowOpen) return grant;
  }
  return null;
}

/** Full retake state for one attempt (used by the student API and pages). */
export async function loadRetakeStateForCandidate(
  admin: SupabaseClient,
  params: { examId: string; candidateId: string; attemptNumber: number; attemptStatus: string },
  now: Date = new Date(),
): Promise<{ state: RetakeState; requests: RetakeRequestView[] }> {
  const requests = await loadCandidateRetakeRequests(admin, params.examId, params.candidateId);
  const usage = await loadGrantUsage(
    admin,
    requests.filter((r) => r.status === "approved").map((r) => r.id),
  );
  const state = retakeState({
    attemptStatus: params.attemptStatus,
    attemptNumber: params.attemptNumber,
    requests,
    attemptsUsedByRequest: usage,
    now,
  });
  return { state, requests };
}

export interface StartRetakeResult {
  ok: true;
  attempt: Record<string, unknown> & { id: string; access_token: string; started_at: string; status: string };
  attemptNumber: number;
}
export interface StartRetakeFailure {
  ok: false;
  error: string;
}

/**
 * Create the authorized NEW attempt. The original attempt row is never touched:
 * the retake is a separate record linked backwards by `previous_attempt_id`
 * and authorized by `retake_request_id`.
 */
export async function startRetakeAttempt(
  admin: SupabaseClient,
  params: {
    exam: RetakeExamRow;
    candidate: RetakeCandidateRow;
    grant: { request: RetakeRequestView };
    now?: Date;
  },
): Promise<StartRetakeResult | StartRetakeFailure> {
  const { exam, candidate, grant } = params;
  const settings = (exam.settings ?? {}) as Record<string, unknown>;

  // Highest attempt number for this candidate (not just the latest row), so a
  // concurrent request cannot reuse a number.
  const { data: existing, error: existingError } = await admin
    .from("exam_attempts")
    .select("id,attempt_number,status,started_at")
    .eq("exam_id", exam.id)
    .eq("candidate_id", candidate.id)
    .order("attempt_number", { ascending: false });
  if (existingError) return { ok: false, error: "Could not read your previous attempts. Try again." };
  const rows = (existing ?? []) as { id: string; attempt_number: number | null; status: string }[];
  if (rows.some((r) => r.status === "in_progress"))
    return { ok: false, error: "You already have an attempt in progress. Finish it before starting the authorized retake." };

  const previous = rows[0] ?? null;
  const nextNumber = Math.max(1, ...rows.map((r) => Number(r.attempt_number ?? 1))) + 1;
  if (nextNumber > 20) return { ok: false, error: "The maximum number of attempts for this examination has been reached." };

  // Track, questions and option order follow the examination's own rules — a
  // retake is not a shortcut around them.
  const { data: classRow } = candidate.class_id
    ? await admin.from("classes").select("id,curriculum_track").eq("id", candidate.class_id).maybeSingle()
    : { data: null };
  const decision = admissionTrack(trackSelectionEnabled(settings), classRow);
  if (!decision.ok) return { ok: false, error: decision.error };
  const track = decision.track;

  let ordered: { id: string }[] = [];
  if (exam.quiz_id) {
    try {
      const baseRows = await loadQuizQuestions(admin, exam.quiz_id, { failOnError: true });
      const paper = track ? paperForTrack(baseRows, track) : baseRows;
      const seed = retakeOrderSeed(exam.id, candidate.id, nextNumber);
      ordered = settings.randomize_questions ? seededShuffle(paper, seed) : paper;
    } catch {
      return { ok: false, error: "The examination paper is unavailable. Contact your institution." };
    }
  }
  if (!ordered.length) return { ok: false, error: "The examination paper is empty or unavailable." };

  const { data: attempt, error } = await admin
    .from("exam_attempts")
    .insert({
      exam_id: exam.id,
      candidate_id: candidate.id,
      question_order: ordered.map((r) => r.id),
      attempt_number: nextNumber,
      previous_attempt_id: previous?.id ?? null,
      retake_request_id: grant.request.id,
      first_name: candidate.first_name ?? null,
      last_name: candidate.last_name ?? null,
      class_id: candidate.class_id ?? null,
      student_id: candidate.student_id ?? null,
      guest_key_hash: candidate.guest_key_hash ?? null,
      invite_token: candidate.invite_token ?? null,
      identity_data: (candidate.identity_data ?? {}) as Record<string, unknown>,
      ...(track ? { track: parseTrack(track) } : {}),
    })
    .select("*")
    .single();
  if (error || !attempt)
    return { ok: false, error: "Could not start the authorized attempt. Reload and try again." };

  await admin.from("exam_candidates").update({ status: "in_progress" }).eq("id", candidate.id);
  await recordRetakeAudit(admin, {
    action: "exam.retake_attempt_started",
    organizationId: exam.organization_id,
    requestId: grant.request.id,
    metadata: {
      exam_id: exam.id,
      candidate_id: candidate.id,
      attempt_id: attempt.id,
      attempt_number: nextNumber,
      previous_attempt_id: previous?.id ?? null,
    },
  });
  return { ok: true, attempt: attempt as StartRetakeResult["attempt"], attemptNumber: nextNumber };
}

/** Append-only audit trail for every retake event, whatever the entry point. */
export async function recordRetakeAudit(
  admin: SupabaseClient,
  input: {
    action: string;
    organizationId: string | null;
    requestId: string;
    actorId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await admin.from("audit_logs").insert({
    actor_id: input.actorId ?? null,
    organization_id: input.organizationId ?? null,
    action: input.action,
    entity: "exam_retake_requests",
    entity_id: input.requestId,
    metadata: input.metadata ?? {},
  });
}

/**
 * Tell the student about the decision: a notification for a signed-in student,
 * and an audit row either way. Guests see the decision on their examination
 * page, which is the only channel they have.
 */
export async function notifyRetakeDecision(
  admin: SupabaseClient,
  input: {
    request: {
      id: string;
      exam_id: string;
      student_id?: string | null;
      requested_by?: string | null;
      candidate_id: string;
    };
    examTitle: string;
    decision: "approved" | "rejected";
    note?: string | null;
    accessExpiresAt?: string | null;
    /** The code issued by the approval, shown to the student with the decision. */
    retakeCode?: string | null;
  },
) {
  let profileId: string | null = input.request.requested_by ?? null;
  if (!profileId && input.request.student_id) {
    const { data: student } = await admin
      .from("students")
      .select("user_id")
      .eq("id", input.request.student_id)
      .maybeSingle();
    profileId = (student?.user_id as string | null) ?? null;
  }
  if (!profileId && input.request.candidate_id) {
    const { data: candidate } = await admin
      .from("exam_candidates")
      .select("student_id")
      .eq("id", input.request.candidate_id)
      .maybeSingle();
    if (candidate?.student_id) {
      const { data: student } = await admin
        .from("students")
        .select("user_id")
        .eq("id", candidate.student_id as string)
        .maybeSingle();
      profileId = (student?.user_id as string | null) ?? null;
    }
  }
  if (!profileId) return;

  const approved = input.decision === "approved";
  const body = approved
    ? `Your retake request for “${input.examTitle}” was approved.`
      + (input.retakeCode ? ` Retake code: ${input.retakeCode}.` : "")
      + (input.accessExpiresAt ? ` Start the authorized attempt before ${input.accessExpiresAt} (UTC).` : "")
      + " Your original submitted attempt is preserved."
    : `Your retake request for “${input.examTitle}” was rejected.`
      + (input.note ? ` Reason: ${input.note}` : "")
      + " Your original submitted attempt is unchanged.";

  // The link opens the decision page itself, so a notification always leads to
  // the exact request — never to a dashboard the student then has to search.
  await admin.from("notifications").insert({
    user_id: profileId,
    type: approved ? "exam_retake_approved" : "exam_retake_rejected",
    title: approved ? "Retake approved" : "Retake request rejected",
    body,
    link: `/retake/${input.request.id}`,
  });
}
