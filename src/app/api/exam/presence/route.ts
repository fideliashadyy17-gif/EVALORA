import { attemptDeadline, loadAttemptContext } from "@/lib/exam";
import { isUuid } from "@/lib/examMessaging";
import {
  buildRoster,
  connectionPauseCredit,
  creditExtensionMinutes,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_ONLINE_MS,
  type PresenceSourceRow,
} from "@/lib/presence";
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
 *  · POST  writes a tiny presence row. It cannot touch an answer, cannot
 *          submit and cannot change a deadline — closed or expired attempts
 *          are refused outright. The ONE exception, added for the automatic
 *          connection-pause guarantee: a `restored` event may credit pause
 *          minutes to this attempt's `extension_minutes` after the server
 *          validates the outage window against its own clock and the last
 *          confirmed heartbeat, exactly once per window (unique ledger index
 *          on exam_connection_events). Clients claim instants; the server
 *          decides. Credit is capped per event and per attempt.
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
  /**
   * `leave` marks the device offline immediately (page hidden/closed).
   * `restored` reports a finished internet outage so the server can validate
   * the window and credit pause time — the client claims instants, the server
   * decides (see connectionPauseCredit in src/lib/presence.ts).
   */
  event: z.enum(["heartbeat", "leave", "restored"]).optional(),
  /** Client-claimed outage start (ISO). Only meaningful with `restored`. */
  lost_at: z.string().datetime({ offset: true }).nullable().optional(),
  /** Milliseconds the page spent hidden during the outage window. */
  hidden_ms: z.number().int().min(0).max(24 * 3600_000).optional(),
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

  // ── Confirmed-outage pause credit (server-authoritative) ──────────────
  // Only a `restored` event can add time, only for THIS attempt, only from a
  // window anchored at the last instant the server actually heard from the
  // device, and only once per window (unique ledger index). Every other
  // request path leaves `extension_minutes` untouched.
  let pauseCredit: { credit_ms: number; extension_minutes: number; deadline: string } | null = null;
  if (body.event === "restored" && attempt.status === "in_progress") {
    const { data: prevPresence } = await admin
      .from("exam_presence")
      .select("last_seen_at")
      .eq("attempt_id", attempt.id)
      .maybeSingle();
    const lastContactMs = prevPresence?.last_seen_at ? Date.parse(String(prevPresence.last_seen_at)) : null;
    const claimedLostMs = body.lost_at ? Date.parse(body.lost_at) : null;
    // Credit already granted to this attempt, from the append-only ledger.
    const { data: ledgerRows } = await admin
      .from("exam_connection_events")
      .select("credit_ms")
      .eq("attempt_id", attempt.id);
    const creditLedgerTotalMs = ((ledgerRows ?? []) as { credit_ms: number | null }[])
      .reduce((sum, row) => sum + Math.max(0, Number(row.credit_ms ?? 0)), 0);
    const decision = connectionPauseCredit({
      nowMs: now.getTime(),
      lastContactMs: Number.isFinite(lastContactMs) ? lastContactMs : null,
      claimedLostMs: Number.isFinite(claimedLostMs) ? claimedLostMs : null,
      hiddenMs: body.hidden_ms ?? 0,
      creditedMs: creditLedgerTotalMs,
    });

    // Sub-minimum windows (ordinary jitter, or a repeated `restored` claim
    // that re-anchors to the heartbeat written moments ago) are not outages:
    // they are neither credited nor audited. Only real windows reach the
    // ledger, where the unique (attempt_id, lost_at) index plus
    // ignoreDuplicates make duplicate credit impossible.
    const auditWorthy =
      decision.kind === "credit" ||
      (decision.kind === "no_credit" && decision.reason !== "window_too_short");
    if (decision.kind !== "invalid" && auditWorthy) {
      const { data: ledgerRow, error: ledgerError } = await admin
        .from("exam_connection_events")
        .upsert(
          {
            attempt_id: attempt.id,
            exam_id: attempt.exam_id,
            organization_id: exam.organization_id,
            event_kind: decision.kind === "credit" ? "pause_credit" : decision.kind === "no_credit" ? "credit_refused" : "reconnected",
            lost_at: new Date(decision.lostMs).toISOString(),
            restored_at: new Date(decision.restoredMs).toISOString(),
            claimed_ms: Math.max(0, decision.claimedMs),
            hidden_ms: body.hidden_ms ?? 0,
            credit_ms: decision.kind === "credit" ? decision.creditMs : 0,
            extension_minutes_before: Number(attempt.extension_minutes ?? 0),
            extension_minutes_after: Number(attempt.extension_minutes ?? 0),
            refusal_reason:
              decision.kind === "no_credit"
                ? decision.reason
                : decision.kind === "credit" && decision.capped
                  ? "capped"
                  : null,
          },
          { onConflict: "attempt_id,lost_at", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();
      const isNewWindow = !ledgerError && Boolean(ledgerRow);

      if (decision.kind === "credit" && isNewWindow) {
        const addMinutes = creditExtensionMinutes(decision.creditMs);
        if (addMinutes > 0) {
          // Atomic increment — concurrent heartbeats cannot corrupt the total.
          await admin.rpc("exam_attempt_add_extension_minutes", {
            p_attempt_id: attempt.id,
            p_minutes: addMinutes,
          });
          const { data: refreshed } = await admin
            .from("exam_attempts")
            .select("extension_minutes")
            .eq("id", attempt.id)
            .maybeSingle();
          const extensionAfter = Number(refreshed?.extension_minutes ?? attempt.extension_minutes ?? 0);
          await admin
            .from("exam_connection_events")
            .update({ extension_minutes_after: extensionAfter })
            .eq("attempt_id", attempt.id)
            .eq("lost_at", new Date(decision.lostMs).toISOString());
          attempt.extension_minutes = extensionAfter;
          pauseCredit = {
            credit_ms: addMinutes * 60_000,
            extension_minutes: extensionAfter,
            deadline: attemptDeadline(exam, attempt.started_at, extensionAfter).toISOString(),
          };
        }
      }
    }
  }

  // A deliberate "leave" writes a slightly older timestamp so the roster shows
  // the device as offline at once, without deleting any presence history.
  const seenAt = body.event === "leave" ? new Date(now.getTime() - 60_000).toISOString() : now.toISOString();

  const patch: Record<string, unknown> = {
    attempt_id: attempt.id,
    exam_id: attempt.exam_id,
    organization_id: exam.organization_id,
    last_seen_at: seenAt,
    // The device just spoke: any sweep-flagged "connection lost" is over.
    unconfirmed_lost_at: body.event === "leave" ? undefined : null,
    updated_at: now.toISOString(),
  };
  if (body.event === "leave") delete patch.unconfirmed_lost_at;
  if (typeof body.current_question !== "undefined") patch.current_question = body.current_question;
  if (typeof body.total_questions !== "undefined") patch.total_questions = body.total_questions;
  if (typeof body.saved_count === "number") patch.saved_count = body.saved_count;
  if (typeof body.pending_saves === "number") patch.pending_saves = body.pending_saves;

  const { error } = await admin.from("exam_presence").upsert(patch, { onConflict: "attempt_id" });
  if (error) return NextResponse.json({ error: "Presence could not be recorded." }, { status: 500, headers: NO_STORE });
  return NextResponse.json(
    {
      ok: true,
      server_now: now.toISOString(),
      heartbeat_ms: PRESENCE_HEARTBEAT_MS,
      // Always echo the authoritative deadline so a returning device resyncs
      // its countdown to the server state (including any pause credit).
      deadline: attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0)).toISOString(),
      pause_credit: pauseCredit,
    },
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

  // Supervisor-visible "connection lost" flag. When a roster refresh notices a
  // live attempt whose device has been silent past the online window, mark it
  // (idempotent: only rows not already flagged). This never grants time and
  // never closes anything — it tells supervisors the timer will be compensated
  // automatically when the student returns. Any heartbeat clears it.
  const nowMs = Date.now();
  const silentIds = ((attempts ?? []) as { id: string; status: string }[])
    .filter((row) => row.status === "in_progress")
    .filter((row) => {
      const seen = seenBy.get(row.id) ?? null;
      return seen !== null && nowMs - Date.parse(seen) > PRESENCE_ONLINE_MS;
    })
    .map((row) => row.id);
  if (silentIds.length) {
    await admin
      .from("exam_presence")
      .update({ unconfirmed_lost_at: new Date().toISOString() })
      .in("attempt_id", silentIds)
      .is("unconfirmed_lost_at", null);
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
