import { attemptDeadline, loadAttemptContext } from "@/lib/exam";
import { manualPauseMs } from "@/lib/examPause";
import { MESSAGE_CAP_PER_ATTEMPT, MESSAGE_PAGE_SIZE, isUuid, normalizeMessageBody } from "@/lib/examMessaging";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Candidate side of the private teacher conversation. The attempt token travels in the
 * Authorization header (never in the URL). Every query is scoped to this one attempt.
 * Deliveries and replies are idempotent: the same client_message_id is stored once.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };
const COLUMNS = "id, client_message_id, sender_kind, body, created_at, delivered_at, read_at";

function bearer(request: Request): string | null {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

const Body = z.object({
  attempt_id: z.string().uuid(),
  client_message_id: z.string().uuid(),
  body: z.string().max(4000),
});

/** Conversation since a cursor (or the latest page on first load), plus the unread count. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const attemptId = searchParams.get("attempt_id");
  const token = bearer(request);
  if (!isUuid(attemptId) || !isUuid(token)) return NextResponse.json({ error: "Missing credentials." }, { status: 400, headers: NO_STORE });

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, attemptId, token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers: NO_STORE });

  const after = searchParams.get("after");
  let query = admin.from("exam_messages").select(COLUMNS).eq("attempt_id", attemptId);
  if (after) {
    const time = Date.parse(after);
    if (Number.isNaN(time)) return NextResponse.json({ error: "Invalid cursor." }, { status: 400, headers: NO_STORE });
    // Inclusive bound: a message sharing the cursor's timestamp is returned again and
    // de-duplicated by id on the client, so nothing is lost at the boundary.
    query = query.gte("created_at", new Date(time).toISOString()).order("created_at", { ascending: true }).limit(100);
  } else {
    query = query.order("created_at", { ascending: false }).limit(MESSAGE_PAGE_SIZE);
  }
  const { data, error } = await query;
  if (error || !data) return NextResponse.json({ error: "Messages could not be loaded." }, { status: 500, headers: NO_STORE });
  const messages = after ? data : [...data].reverse();

  const now = new Date().toISOString();
  const undelivered = messages.filter((m) => m.sender_kind === "staff" && !m.delivered_at).map((m) => m.id);
  if (undelivered.length) {
    await admin.from("exam_messages").update({ delivered_at: now }).in("id", undelivered).is("delivered_at", null);
  }

  const { count } = await admin
    .from("exam_messages")
    .select("id", { count: "exact", head: true })
    .eq("attempt_id", attemptId)
    .eq("sender_kind", "staff")
    .is("read_at", null);

  return NextResponse.json({
    server_now: now,
    messages: messages.map((m) => ({ ...m, delivered_at: m.delivered_at ?? (m.sender_kind === "staff" ? now : null) })),
    unread_from_teacher: count ?? 0,
  }, { headers: NO_STORE });
}

/** Candidate reply. Refused once the attempt is closed or its deadline has passed. */
export async function POST(request: Request) {
  const token = bearer(request);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!isUuid(token) || !parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  const { attempt_id, client_message_id, body } = parsed.data;

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, attempt_id, token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers: NO_STORE });
  const { attempt, exam } = ctx;
  if (!exam) return NextResponse.json({ error: "Examination data is unavailable." }, { status: 500, headers: NO_STORE });
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "This examination is closed, so messages can no longer be sent." }, { status: 409, headers: NO_STORE });
  }
  // Pause-aware: while an organizer pause is open the deadline carries the
  // frozen time, so a paused student can still reach their invigilator.
  if (new Date() > attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0), manualPauseMs(attempt as { pause_reasons?: string[] | null; paused_at?: string | null }, Date.now()))) {
    return NextResponse.json({ error: "Time has expired, so messages can no longer be sent." }, { status: 409, headers: NO_STORE });
  }

  const normalized = normalizeMessageBody(body);
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400, headers: NO_STORE });

  const { count } = await admin.from("exam_messages").select("id", { count: "exact", head: true }).eq("attempt_id", attempt.id);
  if ((count ?? 0) >= MESSAGE_CAP_PER_ATTEMPT) {
    return NextResponse.json({ error: "This conversation has reached its limit." }, { status: 429, headers: NO_STORE });
  }

  const { data: inserted, error } = await admin
    .from("exam_messages")
    .upsert({
      organization_id: exam.organization_id,
      exam_id: attempt.exam_id,
      attempt_id: attempt.id,
      sender_kind: "candidate",
      client_message_id,
      body: normalized.body,
    }, { onConflict: "attempt_id,sender_kind,client_message_id", ignoreDuplicates: true })
    .select(COLUMNS);
  if (error) return NextResponse.json({ error: "Your message could not be sent. It will be retried." }, { status: 500, headers: NO_STORE });

  // A retry of an already stored send returns the stored message, not a second one.
  let message: NonNullable<typeof inserted>[number] | null = inserted?.[0] ?? null;
  if (!message) {
    const { data: existing } = await admin
      .from("exam_messages")
      .select(COLUMNS)
      .eq("attempt_id", attempt.id)
      .eq("sender_kind", "candidate")
      .eq("client_message_id", client_message_id)
      .maybeSingle();
    message = existing ?? null;
  }
  if (!message) return NextResponse.json({ error: "Your message could not be confirmed. It will be retried." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ message }, { headers: NO_STORE });
}
