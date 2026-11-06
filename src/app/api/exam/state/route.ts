import { attemptDeadline, attemptRows, gradeAttempt, loadAttemptContext } from "@/lib/exam";
import { answerReveal, publicQuestion } from "@/lib/live";
import { buildExamResult } from "@/lib/examResults";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Full candidate view of an attempt (answers restored for recovery). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const attemptId = searchParams.get("attempt_id");
  // Prefer the header so the current client does not put attempt tokens in
  // URLs, logs or browser history. The query parameter remains supported for
  // already-deployed clients until a coordinated deprecation is possible.
  const authorization = request.headers.get("authorization");
  const token = authorization === null
    ? searchParams.get("token")
    : /^Bearer\s+([^\s]+)$/i.exec(authorization)?.[1] ?? null;
  const headers = { "Cache-Control": "private, no-store" };
  if (!attemptId || !token) return NextResponse.json({ error: "Missing credentials." }, { status: 400, headers });

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, attemptId, token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers });
  const { attempt, exam, candidate } = ctx;
  if (!exam || !candidate) return NextResponse.json({ error: "Examination data is unavailable." }, { status: 500, headers });
  const settings = (exam.settings ?? {}) as Record<string, unknown>;
  const deadline = attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0));

  let rows: Awaited<ReturnType<typeof attemptRows>>;
  try {
    rows = await attemptRows(admin, exam, attempt);
    // Auto-submit only after the paper and saved answers were loaded and all
    // grading writes succeeded. These operations are not yet transactional.
    if (attempt.status === "in_progress" && new Date() > deadline) {
      const { score, max } = await gradeAttempt(admin, attempt.id, rows);
      const { data: closed, error: closeError } = await admin
        .from("exam_attempts")
        .update({ status: "auto_submitted", submitted_at: deadline.toISOString(), score, max_score: max })
        .eq("id", attempt.id).eq("status", "in_progress").select("id").maybeSingle();
      if (closeError || !closed) return NextResponse.json({ error: "Could not confirm the examination submission. Reload or contact your invigilator." }, { status: 500, headers });
      const { error: candidateError } = await admin.from("exam_candidates").update({ status: "submitted" }).eq("id", candidate.id);
      if (candidateError) return NextResponse.json({ error: "The examination closed but its status could not be fully confirmed. Reload or contact your invigilator." }, { status: 500, headers });
      attempt.status = "auto_submitted";
      attempt.score = score;
      attempt.max_score = max;
    }
  } catch {
    return NextResponse.json({ error: "Examination data or grading is unavailable. Reload or contact your invigilator." }, { status: 500, headers });
  }

  const { data: saved, error: savedError } = await admin.from("exam_answers").select("*").eq("attempt_id", attempt.id);
  if (savedError || !saved) return NextResponse.json({ error: "Saved answers could not be loaded. Reload or contact your invigilator." }, { status: 500, headers });
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
    candidate: {
      name: candidate.full_name,
      ref: candidate.candidate_ref,
      first_name: candidate.first_name ?? null,
      last_name: candidate.last_name ?? null,
      class_id: candidate.class_id ?? null,
    },
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
      // Correctness is only revealed after submission AND publication. Once it
      // is, the paper is marked in full: every question carries its result and
      // its worked solution, including the ones the candidate left blank, so a
      // candidate can revise from a complete marking scheme instead of only the
      // questions they happened to answer.
      const reveal = submitted && resultsPublished ? answerReveal(row) : null;
      return {
        ...pub,
        ...(reveal ? { reveal } : {}),
        saved_answer: s?.answer ?? null,
        result: reveal
          ? buildExamResult({
              saved: s ?? null,
              correctOptionIds: reveal.correct_option_ids,
              explanation: row.questions.explanation ?? null,
              explanationDoc: row.questions.explanation_doc ?? null,
            })
          : null,
      };
    }),
  }, { headers });
}
