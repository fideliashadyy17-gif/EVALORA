import { attemptDeadline, loadAttemptContext } from "@/lib/exam";
import { isUuid } from "@/lib/examMessaging";
import { buildRoster, PRESENCE_HEARTBEAT_MS, type PresenceSourceRow } from "@/lib/presence";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Candidate heartbeat + participant rail for examinations.
 *
 * Two verbs, one security model: the random attempt token in the Authorization
 * header proves which attempt is speaking, and every answer is scoped to that
 * attempt's examination and organisation.
 *
 *  · POST  writes a tiny presence row (and nothing else). It cannot extend an
 *          attempt, cannot touch an answer, cannot submit and cannot change a
 *          deadline — closed or expired attempts are refused outright.
 *  · GET   returns the roster of the *same examination*: display name, avatar
 *          seed and connection state. No answers, no question numbers, no
 *          scores, no marking, no proctoring fields, no attempt identifiers.
 *
 * A quiet device is reported as reconnecting/offline. It is never reported as
 * submitted or finished on the strength of a missed heartbeat: only the attempt
 * status itself can say "handed in".
 */
const NO_STORE = { "Cache-Control": "private, no-store" };
const Count = z.number().int().min(0).max(1000);
const Body = z.object({
  attempt_id: z.string().uuid(),
  current_question: z.number().int().min(1).max(1000).nullable().optional(),
  total_questions: Count.nullable().optional(),
  saved_count: Count.optional(),
  pending_saves: Count.optional(),
  /** `leave` marks the device offline immediately (page hidden/closed). */
  event: z.enum(["heartbeat", "leave"]).optional(),
});

function bearer(request: Request): string | null {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

export async function POST(request: Request) {
  const token = bearer(request);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!isUuid(token) || !parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  const body = parsed.data;

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, body.attempt_id, token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers: NO_STORE });
  const { attempt, exam } = ctx;
  if (!exam) return NextResponse.json({ error: "Examination data is unavailable." }, { status: 500, headers: NO_STORE });
  if (attempt.status !== "in_progress" || new Date() > attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0))) {
    return NextResponse.json({ error: "This examination is closed." }, { status: 409, headers: NO_STORE });
  }

  const now = new Date();
  // A deliberate "leave" writes a slightly older timestamp so the roster shows
  // the device as offline at once, without deleting any presence history.
  const seenAt = body.event === "leave" ? new Date(now.getTime() - 60_000).toISOString() : now.toISOString();

  const patch: Record<string, unknown> = {
    attempt_id: attempt.id,
    exam_id: attempt.exam_id,
    organization_id: exam.organization_id,
    last_seen_at: seenAt,
    updated_at: now.toISOString(),
  };
  if (typeof body.current_question !== "undefined") patch.current_question = body.current_question;
  if (typeof body.total_questions !== "undefined") patch.total_questions = body.total_questions;
  if (typeof body.saved_count === "number") patch.saved_count = body.saved_count;
  if (typeof body.pending_saves === "number") patch.pending_saves = body.pending_saves;

  const { error } = await admin.from("exam_presence").upsert(patch, { onConflict: "attempt_id" });
  if (error) return NextResponse.json({ error: "Presence could not be recorded." }, { status: 500, headers: NO_STORE });
  return NextResponse.json(
    { ok: true, server_now: now.toISOString(), heartbeat_ms: PRESENCE_HEARTBEAT_MS },
    { headers: NO_STORE },
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const attemptId = searchParams.get("attempt_id");
  const token = bearer(request);
  if (!attemptId || !isUuid(attemptId) || !isUuid(token)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  }

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, attemptId, token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers: NO_STORE });
  const { attempt, exam } = ctx;
  if (!exam) return NextResponse.json({ error: "Examination data is unavailable." }, { status: 500, headers: NO_STORE });

  // Only the attempts of this examination. `exam_id` is taken from the
  // authenticated attempt, never from the query string.
  const { data: attempts } = await admin
    .from("exam_attempts")
    .select("id, status, started_at, submitted_at, exam_candidates(full_name)")
    .eq("exam_id", attempt.exam_id)
    .in("status", ["in_progress", "submitted", "expired"])
    .order("started_at", { ascending: true })
    .limit(2000);

  const { data: presence } = await admin
    .from("exam_presence")
    .select("attempt_id, last_seen_at")
    .eq("exam_id", attempt.exam_id)
    .limit(2000);

  const seenBy = new Map<string, string | null>();
  for (const row of (presence ?? []) as { attempt_id: string; last_seen_at: string | null }[]) {
    seenBy.set(row.attempt_id, row.last_seen_at);
  }

  const rows: PresenceSourceRow[] = ((attempts ?? []) as unknown as {
    id: string;
    status: string;
    exam_candidates: { full_name: string | null } | null;
  }[]).map((row) => ({
    key: row.id,
    display_name: row.exam_candidates?.full_name ?? null,
    last_seen_at: row.status === "in_progress" ? seenBy.get(row.id) ?? null : null,
    status: row.status === "in_progress" ? "in_progress" : "finished",
  }));

  const roster = buildRoster({
    scope: `exam:${attempt.exam_id}`,
    rows,
    selfKey: attempt.id,
    shortenNames: true,
  });

  return NextResponse.json(
    {
      roster,
      server_now: new Date().toISOString(),
      heartbeat_ms: PRESENCE_HEARTBEAT_MS,
      refresh_ms: 15_000,
    },
    { headers: NO_STORE },
  );
}
