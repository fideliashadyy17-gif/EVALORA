import { attemptDeadline, attemptRows, gradeAttempt, loadAttemptContext } from "@/lib/exam";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({ attempt_id: z.string().uuid(), token: z.string().uuid() });

/**
 * Final submission: grades objective items on the server and locks the
 * attempt. The official deadline is computed here from started_at, the
 * examination duration/window and any authorized extension. A request
 * received after that instant cannot be recorded as an on-time manual
 * submission: only previously autosaved answers are graded, and the
 * attempt is closed as auto_submitted at the deadline itself.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, parsed.data.attempt_id, parsed.data.token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  const { attempt, exam, candidate } = ctx;

  if (attempt.status !== "in_progress") {
    return NextResponse.json({ ok: true, already_submitted: true, status: attempt.status });
  }

  const now = new Date();
  const deadline = attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0));
  const late = now > deadline;
  const finalStatus = late ? "auto_submitted" : "submitted";
  const submittedAt = late ? deadline : now;

  const rows = await attemptRows(admin, exam, attempt);
  const { score, max } = await gradeAttempt(admin, attempt.id, rows);

  const { error } = await admin
    .from("exam_attempts")
    .update({ status: finalStatus, submitted_at: submittedAt.toISOString(), score, max_score: max })
    .eq("id", attempt.id)
    .eq("status", "in_progress");
  if (error) return NextResponse.json({ error: "Could not submit this attempt." }, { status: 500 });
  await admin.from("exam_candidates").update({ status: "submitted" }).eq("id", candidate.id);

  const resultsPublished = Boolean((exam.settings as Record<string, unknown>)?.results_published);
  return NextResponse.json({
    ok: true,
    status: finalStatus,
    auto_submitted: late,
    submitted_at: submittedAt.toISOString(),
    deadline: deadline.toISOString(),
    score: resultsPublished ? score : null,
    max_score: resultsPublished ? max : null,
    results_published: resultsPublished,
  });
}
