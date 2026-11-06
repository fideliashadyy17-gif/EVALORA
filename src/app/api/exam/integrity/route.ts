import { loadAttemptContext } from "@/lib/exam";
import {
  INTEGRITY_EVENTS,
  escalationLevel,
  incidentTypeFor,
  isEventEnabled,
  isRecordable,
  parseIntegrityPolicy,
  severityForEvent,
} from "@/lib/integrity";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  attempt_id: z.string().uuid(),
  token: z.string().uuid(),
  event: z.enum(INTEGRITY_EVENTS),
  detail: z.record(z.string(), z.unknown()).optional(),
});

/** One gesture should not become a row every few milliseconds. */
const DEDUPE_MS = 2000;
/** Hard ceiling per attempt, so a broken client cannot flood the review queue. */
const MAX_EVENTS_PER_ATTEMPT = 300;

const headers = { "Cache-Control": "private, no-store" };

function answered(body: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...body }, { headers });
}

/**
 * Records one browser-observed integrity event for an assessment attempt.
 *
 * The candidate supplies only an attempt id, its access token and the event
 * name. The examination, the candidate and the organisation are resolved from
 * that token server-side, exactly like `/api/exam/save` — so a student cannot
 * attribute an incident to another candidate, another paper or another tenant,
 * and cannot delete or rewrite what was recorded. The assessment's own policy
 * decides whether the event is stored at all; when integrity is switched off
 * the endpoint answers honestly and writes nothing.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
  const { attempt_id, token, event, detail } = parsed.data;

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, attempt_id, token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers });
  const { attempt, exam, candidate } = ctx;
  if (!exam || !candidate || !exam.organization_id)
    return NextResponse.json({ error: "Assessment data is unavailable." }, { status: 500, headers });

  const policy = parseIntegrityPolicy(((exam.settings ?? {}) as Record<string, unknown>).integrity);
  if (!policy.enabled) return answered({ recorded: false, count: 0, level: "none", reason: "integrity_disabled" });
  if (!isEventEnabled(event, policy))
    return answered({ recorded: false, count: 0, level: "none", reason: "event_disabled" });

  if (attempt.status !== "in_progress")
    return NextResponse.json({ error: "This attempt is already submitted." }, { status: 409, headers });

  const type = incidentTypeFor(event);

  // Only real violations escalate: a return to the tab, a regained connection
  // and similar informational events are stored but never counted against the
  // candidate.
  const countViolations = async () => {
    const { count } = await admin
      .from("proctoring_incidents")
      .select("id", { count: "exact", head: true })
      .eq("attempt_id", attempt.id)
      .like("type", "integrity_%")
      .not("type", "in", "(integrity_tab_visible,integrity_focus_back,integrity_online)");
    return count ?? 0;
  };

  const countAll = async () => {
    const { count } = await admin
      .from("proctoring_incidents")
      .select("id", { count: "exact", head: true })
      .eq("attempt_id", attempt.id)
      .like("type", "integrity_%");
    return count ?? 0;
  };

  const { data: last } = await admin
    .from("proctoring_incidents")
    .select("type,created_at")
    .eq("attempt_id", attempt.id)
    .like("type", "integrity_%")
    .order("created_at", { ascending: false })
    .limit(40);
  const recent = (last ?? []) as { type: string; created_at: string }[];
  const lastSame = recent.find((row) => row.type === type);
  if (lastSame && Date.now() - Date.parse(lastSame.created_at) < DEDUPE_MS) {
    const count = await countViolations();
    return answered({ recorded: false, count, level: escalationLevel(count, policy), reason: "duplicate" });
  }
  const stored = await countAll();
  if (stored >= MAX_EVENTS_PER_ATTEMPT)
    return answered({ recorded: false, count: await countViolations(), level: "none", reason: "capped" });

  const note = detail ? JSON.stringify(detail).slice(0, 400) : null;
  const { error } = await admin.from("proctoring_incidents").insert({
    organization_id: exam.organization_id,
    exam_id: exam.id,
    candidate_id: candidate.id,
    attempt_id: attempt.id,
    type,
    severity: severityForEvent(event),
    note,
    status: "open",
  });
  if (error) return NextResponse.json({ error: "The event could not be recorded." }, { status: 500, headers });

  const count = await countViolations();
  return answered({
    recorded: true,
    count,
    level: escalationLevel(count, policy),
    violation: isRecordable(event),
    warnAfter: policy.warnAfter,
    reviewAfter: policy.reviewAfter,
  });
}
