import { attemptRows, gradeAttempt, loadAttemptContext } from "@/lib/exam";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({ attempt_id: z.string().uuid(), token: z.string().uuid() });

/** Final submission: grades objective items on the server, locks the attempt. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, parsed.data.attempt_id, parsed.data.token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  const { attempt, exam, candidate } = ctx;

  if (attempt.status !== "in_progress") {
    return NextResponse.json({ ok: true, already_submitted: true });
  }

  const rows = await attemptRows(admin, exam, attempt);
  const { score, max } = await gradeAttempt(admin, attempt.id, rows);

  await admin
    .from("exam_attempts")
    .update({ status: "submitted", submitted_at: new Date().toISOString(), score, max_score: max })
    .eq("id", attempt.id);
  await admin.from("exam_candidates").update({ status: "submitted" }).eq("id", candidate.id);

  const resultsPublished = Boolean((exam.settings as Record<string, unknown>)?.results_published);
  return NextResponse.json({
    ok: true,
    score: resultsPublished ? score : null,
    max_score: resultsPublished ? max : null,
    results_published: resultsPublished,
  });
}
