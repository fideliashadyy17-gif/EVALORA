import { attemptDeadline, loadAttemptContext } from "@/lib/exam";
import { isUuid } from "@/lib/examMessaging";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Candidate heartbeat for the teacher's monitor. It writes a small presence row only:
 * no answers, no access token, no grading. It is refused for closed or expired attempts,
 * so presence can never be used to keep an attempt alive past its deadline.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };
const Count = z.number().int().min(0).max(1000);
const Body = z.object({
  attempt_id: z.string().uuid(),
  current_question: z.number().int().min(1).max(1000).nullable(),
  total_questions: Count.nullable(),
  saved_count: Count,
  pending_saves: Count,
});

export async function POST(request: Request) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1] ?? null;
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

  const now = new Date().toISOString();
  const { error } = await admin.from("exam_presence").upsert({
    attempt_id: attempt.id,
    exam_id: attempt.exam_id,
    organization_id: exam.organization_id,
    last_seen_at: now,
    current_question: body.current_question,
    total_questions: body.total_questions,
    saved_count: body.saved_count,
    pending_saves: body.pending_saves,
    updated_at: now,
  }, { onConflict: "attempt_id" });
  if (error) return NextResponse.json({ error: "Presence could not be recorded." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, server_now: now }, { headers: NO_STORE });
}
