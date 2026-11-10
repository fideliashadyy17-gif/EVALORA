import { attemptRows, loadAttemptContext } from "@/lib/exam";
import { loadPublishedHints } from "@/lib/examHintsServer";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Question hints for the candidate who is actually sitting the paper.
 *
 * Contract:
 *  · The attempt token must belong to the attempt, and the attempt must be in
 *    progress — a submitted paper returns 409 and no content, so the route can
 *    never be used to read guidance after the fact.
 *  · The question must be part of THIS attempt's paper (same resolution as the
 *    examination payload), so one attempt can never fetch another paper's hint.
 *  · Only `status = 'published'` rows are read, and only `{ level, text, doc }`
 *    is returned. No ids, authors, statuses, options, answer keys or marking
 *    scheme can appear in this response.
 *  · Reading a hint is side-effect free: it writes nothing, touches no timer,
 *    records no incident, and never submits anything.
 *
 * The route exists so an examination page that was already open when a hint was
 * published can pick it up on demand, without a reload and without bundling
 * every hint into the initial paper payload.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const attemptId = searchParams.get("attempt_id");
  const questionId = searchParams.get("question_id");
  const authorization = request.headers.get("authorization");
  const token = /^Bearer\s+([^\s]+)$/i.exec(authorization ?? "")?.[1] ?? searchParams.get("token");
  const headers = { "Cache-Control": "private, no-store" };

  if (!attemptId || !questionId || !token) {
    return NextResponse.json({ error: "Missing credentials.", hints: [], available: false }, { status: 400, headers });
  }

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, attemptId, token);
  if (!ctx || !ctx.exam) {
    return NextResponse.json({ error: "Attempt not found.", hints: [], available: false }, { status: 404, headers });
  }
  const { attempt, exam } = ctx;

  if (attempt.status !== "in_progress") {
    return NextResponse.json(
      { error: "This attempt is closed, so hints are no longer available.", hints: [], available: false },
      { status: 409, headers },
    );
  }

  // Resolve the paper exactly as the examination payload does, so a question id
  // from another examination (or a guessed id) is rejected here.
  let inPaper = false;
  try {
    const rows = await attemptRows(admin, exam, attempt);
    inPaper = rows.some((row) => row.questions.id === questionId);
  } catch {
    return NextResponse.json({ error: "Examination paper unavailable.", hints: [], available: false }, { status: 500, headers });
  }
  if (!inPaper) {
    return NextResponse.json({ error: "Question not found for this attempt.", hints: [], available: false }, { status: 404, headers });
  }

  const byQuestion = await loadPublishedHints(admin, exam, [questionId]);
  const hints = (byQuestion.get(questionId) ?? []).map((hint) => ({ level: hint.level, text: hint.text, doc: hint.doc }));
  return NextResponse.json({ question_id: questionId, hints, available: hints.length > 0 }, { status: 200, headers });
}
