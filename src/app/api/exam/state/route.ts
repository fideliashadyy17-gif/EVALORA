import { attemptDeadline, attemptRows, gradeAttempt, loadAttemptContext } from "@/lib/exam";
import { publicQuestion } from "@/lib/live";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Full candidate view of an attempt (answers restored for recovery). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const attemptId = searchParams.get("attempt_id");
  const token = searchParams.get("token");
  if (!attemptId || !token) return NextResponse.json({ error: "Missing credentials." }, { status: 400 });

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, attemptId, token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  const { attempt, exam, candidate } = ctx;
  const settings = (exam.settings ?? {}) as Record<string, unknown>;
  const deadline = attemptDeadline(exam, attempt.started_at);

  // Auto-submit when the server deadline has passed.
  if (attempt.status === "in_progress" && new Date() > deadline) {
    const rows = await attemptRows(admin, exam, attempt);
    const { score, max } = await gradeAttempt(admin, attempt.id, rows);
    await admin
      .from("exam_attempts")
      .update({ status: "auto_submitted", submitted_at: deadline.toISOString(), score, max_score: max })
      .eq("id", attempt.id);
    await admin.from("exam_candidates").update({ status: "submitted" }).eq("id", candidate.id);
    attempt.status = "auto_submitted";
    attempt.score = score;
    attempt.max_score = max;
  }

  const rows = await attemptRows(admin, exam, attempt);
  const { data: saved } = await admin.from("exam_answers").select("*").eq("attempt_id", attempt.id);
  const savedByQ = new Map((saved ?? []).map((a) => [a.question_id, a]));

  const submitted = attempt.status !== "in_progress";
  const resultsPublished = Boolean(settings.results_published);

  return NextResponse.json({
    server_now: new Date().toISOString(),
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      instructions: exam.instructions,
      proctoring: Boolean(settings.proctoring),
      require_screen_share: Boolean(settings.require_screen_share),
      pass_mark_percent: Number(settings.pass_mark_percent ?? 50),
    },
    candidate: { name: candidate.full_name, ref: candidate.candidate_ref },
    attempt: {
      id: attempt.id,
      status: attempt.status,
      started_at: attempt.started_at,
      deadline: deadline.toISOString(),
      flagged: attempt.flagged ?? [],
      score: submitted && resultsPublished ? (attempt.score !== null ? Number(attempt.score) : null) : null,
      max_score: submitted && resultsPublished ? (attempt.max_score !== null ? Number(attempt.max_score) : null) : null,
      results_published: resultsPublished,
    },
    questions: rows.map((row) => {
      const pub = publicQuestion(row, {
        randomizeOptions: Boolean(settings.randomize_options),
        seed: attempt.id,
      });
      const s = savedByQ.get(row.questions.id);
      return {
        ...pub,
        saved_answer: s?.answer ?? null,
        // Correctness is only revealed after submission AND publication.
        result:
          submitted && resultsPublished && s
            ? { is_correct: s.is_correct, points_awarded: s.points_awarded !== null ? Number(s.points_awarded) : null, explanation: row.questions.explanation }
            : null,
      };
    }),
  });
}
