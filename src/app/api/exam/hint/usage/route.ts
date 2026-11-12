import { attemptRows, loadAttemptContext } from "@/lib/exam";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Records that a candidate opened a hint (question-level or per-part).
 *
 * Formative signal only: it never touches a mark, an answer, the timer or the
 * submission state. The attempt token authorises the write, the attempt must
 * be in progress, and the question must belong to the attempt's paper; the
 * insert itself goes through `record_exam_hint_use`, which re-validates.
 */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const body = (await request.json().catch(() => null)) as {
    attempt_id?: unknown; question_id?: unknown; part_id?: unknown; level?: unknown;
  } | null;
  const authorization = request.headers.get("authorization");
  const token = /^Bearer\s+([^\s]+)$/i.exec(authorization ?? "")?.[1] ?? null;
  const attemptId = typeof body?.attempt_id === "string" ? body.attempt_id : null;
  const questionId = typeof body?.question_id === "string" ? body.question_id : null;
  const partId = typeof body?.part_id === "string" ? body.part_id.slice(0, 12) : "";
  const level = Math.trunc(Number(body?.level));
  if (!attemptId || !questionId || !token || ![1, 2, 3].includes(level)) {
    return NextResponse.json({ error: "Missing credentials." }, { status: 400, headers });
  }
  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, attemptId, token);
  if (!ctx || !ctx.exam) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers });
  if (ctx.attempt.status !== "in_progress") {
    return NextResponse.json({ error: "This attempt is closed." }, { status: 409, headers });
  }
  try {
    const rows = await attemptRows(admin, ctx.exam, ctx.attempt);
    if (!rows.some((row) => row.questions.id === questionId)) {
      return NextResponse.json({ error: "Question not found for this attempt." }, { status: 404, headers });
    }
  } catch {
    return NextResponse.json({ error: "Examination paper unavailable." }, { status: 500, headers });
  }
  const { error } = await admin.rpc("record_exam_hint_use", {
    p_attempt: attemptId, p_question: questionId, p_part: partId, p_level: level,
  });
  if (error) return NextResponse.json({ error: "Hint use could not be recorded." }, { status: 500, headers });
  return NextResponse.json({ recorded: true }, { status: 200, headers });
}
