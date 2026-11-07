import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side proctoring lifecycle helpers.
 *
 * Everything here runs with the service-role client AFTER the caller has been
 * authorized with the session context (`getSessionContext`/`can`) AND after the
 * examination has been verified to belong to the acting organization. Callers
 * must not pass a client whose tenant boundary has not been checked.
 *
 * Review history is NOT written here: migration 0035 records every report and
 * every decision transition with a database trigger, so history exists even if
 * a future code path forgets to call a helper. This module only reads it.
 */

export const PROCTOR_DECISIONS = ["confirmed", "dismissed", "investigating", "reopened"] as const;
export type ProctorDecision = (typeof PROCTOR_DECISIONS)[number];

export const DECISION_TO_STATUS: Record<ProctorDecision, "valid" | "invalid" | "investigating" | "open"> = {
  confirmed: "valid",
  dismissed: "invalid",
  investigating: "investigating",
  reopened: "open",
};

export const STATUS_TO_DECISION: Record<string, ProctorDecision | "reported"> = {
  valid: "confirmed",
  invalid: "dismissed",
  investigating: "investigating",
  open: "reopened",
};

export const DECISION_LABEL: Record<string, string> = {
  reported: "Reported",
  confirmed: "Confirmed",
  dismissed: "Dismissed",
  investigating: "Under investigation",
  reopened: "Reopened",
};

export const ROOM_EVENT_LABEL: Record<string, string> = {
  joined: "Joined room",
  left: "Left room",
  connection_lost: "Connection lost",
  reconnected: "Reconnected",
  track_published: "Published media",
  track_unpublished: "Stopped media",
  room_started: "Room opened",
  room_finished: "Room closed",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_RE.test(value);

/** LiveKit identities are namespaced so a candidate can never impersonate staff. */
export function candidateIdFromIdentity(identity: string): string | null {
  if (!identity.startsWith("candidate-")) return null;
  const id = identity.slice("candidate-".length);
  return isUuid(id) ? id : null;
}

export function roomNameForExam(examId: string) {
  return `exam-${examId}`;
}

export interface ProctoringRoom {
  id: string;
  room_name: string;
  organization_id: string;
  exam_id: string;
  status: string;
  started_at: string | null;
}

/**
 * Idempotently register the persisted room for an examination. The LiveKit room
 * name is deterministic (`exam-<id>`), so concurrent token requests converge on
 * one row thanks to the unique constraint on room_name.
 */
export async function ensureProctoringRoom(
  admin: SupabaseClient,
  exam: { id: string; organization_id: string },
  actorId: string | null,
): Promise<ProctoringRoom | null> {
  const roomName = roomNameForExam(exam.id);
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("proctoring_rooms")
    .select("id, room_name, organization_id, exam_id, status, started_at")
    .eq("room_name", roomName)
    .maybeSingle();

  if (existing) {
    // Re-open a previously ended room: a new sitting of the same exam needs a
    // live room again, and the token route is the only place that grants media.
    await admin
      .from("proctoring_rooms")
      .update({ status: "active", ended_at: null, last_event_at: now, updated_at: now })
      .eq("id", existing.id);
    return existing as ProctoringRoom;
  }

  const { data: inserted, error } = await admin
    .from("proctoring_rooms")
    .upsert(
      {
        exam_id: exam.id,
        room_name: roomName,
        organization_id: exam.organization_id,
        created_by: actorId,
        status: "active",
        started_at: now,
        last_event_at: now,
        updated_at: now,
      },
      { onConflict: "room_name", ignoreDuplicates: true },
    )
    .select("id, room_name, organization_id, exam_id, status, started_at")
    .maybeSingle();

  if (inserted) {
    await recordRoomEvents(admin, [
      {
        room_id: (inserted as ProctoringRoom).id,
        organization_id: exam.organization_id,
        exam_id: exam.id,
        participant_identity: actorId ? `staff-${actorId}` : "system",
        event: "room_started",
        detail: { room_name: roomName },
      },
    ]);
    return inserted as ProctoringRoom;
  }
  if (error) return null;

  // Lost the insert race: read the winner.
  const { data: raced } = await admin
    .from("proctoring_rooms")
    .select("id, room_name, organization_id, exam_id, status, started_at")
    .eq("room_name", roomName)
    .maybeSingle();
  return (raced as ProctoringRoom) ?? null;
}

export interface RoomEventInput {
  room_id: string;
  organization_id: string;
  exam_id: string;
  participant_identity: string;
  event: string;
  candidate_id?: string | null;
  detail?: Record<string, unknown>;
  occurred_at?: string;
}

/** Append join/leave/media events. These are evidence, never editable. */
export async function recordRoomEvents(admin: SupabaseClient, events: RoomEventInput[]) {
  if (events.length === 0) return;
  const { error } = await admin.from("proctoring_room_events").insert(
    events.map((e) => ({
      room_id: e.room_id,
      organization_id: e.organization_id,
      exam_id: e.exam_id,
      participant_identity: e.participant_identity,
      candidate_id: e.candidate_id ?? candidateIdFromIdentity(e.participant_identity),
      event: e.event,
      detail: e.detail ?? {},
      occurred_at: e.occurred_at ?? new Date().toISOString(),
    })),
  );
  if (!error) {
    await admin
      .from("proctoring_rooms")
      .update({ last_event_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", events[0].room_id);
  }
}

/** Close a room when supervision ends (manual close or LiveKit room_finished). */
export async function closeProctoringRoom(admin: SupabaseClient, roomId: string) {
  const now = new Date().toISOString();
  await admin
    .from("proctoring_rooms")
    .update({ status: "ended", ended_at: now, last_event_at: now, updated_at: now })
    .eq("id", roomId);
}

export interface ReviewFilters {
  organizationId: string;
  examId?: string | null;
  candidateId?: string | null;
  decision?: string | null;
  source?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
}

export interface ReviewHistoryRow {
  id: string;
  incident_id: string;
  exam_id: string | null;
  candidate_id: string | null;
  quiz_id?: string | null;
  session_id?: string | null;
  participant_id?: string | null;
  decision: string;
  previous_status: string | null;
  new_status: string;
  note: string | null;
  reviewer_id: string | null;
  reviewer_email: string | null;
  reviewer_role: string | null;
  source: string;
  created_at: string;
  exams?: { title?: string } | null;
  exam_candidates?: { full_name?: string } | null;
  quizzes?: { title?: string } | null;
  quiz_sessions?: { title?: string } | null;
  session_participants?: { display_name?: string } | null;
}

/**
 * Review history for one organization. `organizationId` is mandatory and is
 * applied as a database filter — a caller cannot widen it by omitting a filter.
 */
export async function loadReviewHistory(
  admin: SupabaseClient,
  filters: ReviewFilters,
): Promise<ReviewHistoryRow[]> {
  let query = admin
    .from("proctoring_incident_reviews")
    .select(
      "id, incident_id, organization_id, exam_id, candidate_id, quiz_id, session_id, participant_id, decision, previous_status, new_status, note, reviewer_id, reviewer_email, reviewer_role, source, created_at, exams(title), exam_candidates(full_name), quizzes(title), quiz_sessions(title), session_participants(display_name)",
    )
    .eq("organization_id", filters.organizationId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(filters.limit ?? 100, 1), 500));

  if (isUuid(filters.examId)) query = query.eq("exam_id", filters.examId);
  if (isUuid(filters.candidateId)) query = query.eq("candidate_id", filters.candidateId);
  if (filters.decision && ["reported", ...PROCTOR_DECISIONS].includes(filters.decision))
    query = query.eq("decision", filters.decision);
  if (filters.source && ["workspace", "platform", "service", "backfilled"].includes(filters.source))
    query = query.eq("source", filters.source);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);

  const { data } = await query;
  return (data ?? []) as unknown as ReviewHistoryRow[];
}

export interface PlatformReviewFilters extends Omit<ReviewFilters, "organizationId"> {
  organizationId?: string | null;
}

/**
 * Cross-organization review history for the independent Super Admin console.
 * The name is deliberately different from `loadReviewHistory` so that no
 * customer-facing route can reach an unfiltered query by omitting an argument.
 * Callers MUST have passed `requireSuperAdmin()` first.
 */
export async function loadPlatformReviewHistory(
  admin: SupabaseClient,
  filters: PlatformReviewFilters,
): Promise<(ReviewHistoryRow & { organization_id: string; organizations?: { name?: string } | null })[]> {
  let query = admin
    .from("proctoring_incident_reviews")
    .select(
      "id, incident_id, organization_id, exam_id, candidate_id, quiz_id, session_id, participant_id, decision, previous_status, new_status, note, reviewer_id, reviewer_email, reviewer_role, source, created_at, exams(title), exam_candidates(full_name), quizzes(title), quiz_sessions(title), session_participants(display_name), organizations(name)",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(filters.limit ?? 100, 1), 500));

  if (isUuid(filters.organizationId)) query = query.eq("organization_id", filters.organizationId);
  if (isUuid(filters.examId)) query = query.eq("exam_id", filters.examId);
  if (isUuid(filters.candidateId)) query = query.eq("candidate_id", filters.candidateId);
  if (filters.decision && ["reported", ...PROCTOR_DECISIONS].includes(filters.decision))
    query = query.eq("decision", filters.decision);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);

  const { data } = await query;
  return (data ?? []) as unknown as (ReviewHistoryRow & {
    organization_id: string;
    organizations?: { name?: string } | null;
  })[];
}

/** A tight, line-item audit export of the review history (CSV). */
export function reviewHistoryCsv(rows: ReviewHistoryRow[]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "recorded_at",
    "decision",
    "previous_status",
    "new_status",
    "activity",
    "candidate / participant",
    "reviewer_email",
    "reviewer_role",
    "source",
    "note",
    "incident_id",
  ];
  const lines = rows.map((r) =>
    [
      r.created_at,
      r.decision,
      r.previous_status ?? "",
      r.new_status,
      r.exams?.title ?? r.quiz_sessions?.title ?? r.quizzes?.title ?? "",
      r.exam_candidates?.full_name ?? r.session_participants?.display_name ?? "",
      r.reviewer_email ?? "",
      r.reviewer_role ?? "",
      r.source,
      r.note ?? "",
      r.incident_id,
    ]
      .map(esc)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
}

/* ─── Retention ─────────────────────────────────────────────────────── */

export interface RetentionPolicy {
  organization_id: string;
  evidence_retention_days: number | null;
  observation_retention_days: number | null;
  review_note_retention_days: number | null;
  legal_hold: boolean;
  allow_evidence_export: boolean;
  note: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

/**
 * No row means no policy: evidence is retained indefinitely. EVALORA does not
 * ship a default legal duration — a period exists only once an administrator of
 * the owning organization (or the platform owner) sets one.
 */
export async function getRetentionPolicy(
  admin: SupabaseClient,
  organizationId: string,
): Promise<RetentionPolicy | null> {
  const { data } = await admin
    .from("proctoring_retention_policies")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as RetentionPolicy) ?? null;
}

export function parseRetentionDays(value: unknown): number | null | "invalid" {
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === null || raw === undefined || raw === "") return null; // retain indefinitely
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 3650) return "invalid";
  return n;
}

export async function saveRetentionPolicy(
  admin: SupabaseClient,
  organizationId: string,
  input: {
    evidence_retention_days: number | null;
    observation_retention_days: number | null;
    review_note_retention_days: number | null;
    legal_hold: boolean;
    allow_evidence_export: boolean;
    note: string | null;
  },
  actorId: string,
) {
  const { error } = await admin.from("proctoring_retention_policies").upsert(
    {
      organization_id: organizationId,
      ...input,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  return error;
}

export interface RetentionRunResult {
  applied?: boolean;
  reason?: string;
  message?: string;
  observations_anonymized?: number;
  review_notes_redacted?: number;
  room_events_purged?: number;
  recordings_expired?: number;
}

/** Dry run reports exactly what an apply would change; apply is audited. */
export async function runRetention(
  admin: SupabaseClient,
  organizationId: string,
  dryRun: boolean,
): Promise<{ ok: boolean; result?: RetentionRunResult; error?: string }> {
  const { data, error } = await admin.rpc("proctoring_apply_retention", {
    p_organization: organizationId,
    p_dry_run: dryRun,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, result: (data ?? {}) as RetentionRunResult };
}

export async function loadRetentionRuns(admin: SupabaseClient, organizationId: string, limit = 10) {
  const { data } = await admin
    .from("proctoring_retention_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** Human-readable summary of what the configured policy actually does. */
export function describeRetention(policy: RetentionPolicy | null): string {
  if (!policy) return "No retention policy configured — all proctoring evidence is retained indefinitely.";
  if (policy.legal_hold) return "Legal hold is active — no automatic retention action is taken.";
  const parts: string[] = [];
  parts.push(
    policy.observation_retention_days
      ? `Observation notes are redacted after ${policy.observation_retention_days} days (the decision, reviewer and timestamps are kept).`
      : "Observation notes are retained indefinitely.",
  );
  parts.push(
    policy.review_note_retention_days
      ? `Reviewer notes are redacted after ${policy.review_note_retention_days} days (decisions are kept).`
      : "Reviewer notes are retained indefinitely.",
  );
  parts.push(
    policy.evidence_retention_days
      ? `Room telemetry and recording links are purged after ${policy.evidence_retention_days} days.`
      : "Room telemetry and recording links are retained indefinitely.",
  );
  return parts.join(" ");
}
