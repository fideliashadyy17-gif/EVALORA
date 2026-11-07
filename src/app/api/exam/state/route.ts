import { attemptDeadline, attemptRows, loadAttemptContext } from "@/lib/exam";
import { submitAndGradeExamAttempt } from "@/lib/examSubmission";
import { answerReveal, publicQuestion } from "@/lib/live";
import { buildExamResult } from "@/lib/examResults";
import { parseIntegrityPolicy } from "@/lib/integrity";
import { examResultChannelName } from "@/lib/resultPublication";
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
    // Even deadline submission preserves the paper if grading fails. The failed
    // attempt is closed with grading_status=grading_failed for authorized retry.
    if (attempt.status === "in_progress" && Date.now() >= deadline.getTime()) {
      const result = await submitAndGradeExamAttempt({
        admin,
        exam,
        attempt,
        candidateId: candidate.id,
        finalStatus: "auto_submitted",
        submittedAt: deadline,
        reason: "deadline",
      });
      if (result.alreadySubmitted && result.latest) {
        attempt.status = result.latest.status;
        attempt.grading_status = result.latest.grading_status;
        attempt.pending_manual_count = result.latest.pending_manual_count;
        attempt.published_at = result.latest.published_at;
      } else {
        attempt.status = "auto_submitted";
        attempt.submission_reason = "deadline";
        attempt.grading_status = result.gradingStatus;
        attempt.pending_manual_count = result.pendingManualCount;
        attempt.score = result.published ? attempt.score : null;
        attempt.max_score = result.published ? attempt.max_score : null;
        // Reload authoritative values after grading/publication persistence.
        const { data: refreshed } = await admin.from("exam_attempts").select("score, max_score, grading_status, pending_manual_count, published_at, grading_error").eq("id", attempt.id).maybeSingle();
        if (refreshed) Object.assign(attempt, refreshed);
      }
    }
    rows = await attemptRows(admin, exam, attempt);
  } catch {
    return NextResponse.json({ error: "Examination data or submission state is unavailable. Reload or contact your invigilator." }, { status: 500, headers });
  }

  const { data: saved, error: savedError } = await admin.from("exam_answers").select("*").eq("attempt_id", attempt.id);
  if (savedError || !saved) return NextResponse.json({ error: "Saved answers could not be loaded. Reload or contact your invigilator." }, { status: 500, headers });
  const savedByQ = new Map((saved ?? []).map((a) => [a.question_id, a]));

  const submitted = attempt.status !== "in_progress";
  const gradingStatus = String(attempt.grading_status ?? "not_started");
  const gradingComplete = gradingStatus === "graded" || gradingStatus === "not_started";
  const resultPublished = submitted && gradingComplete && Number(attempt.pending_manual_count ?? 0) === 0 &&
    (Boolean(attempt.published_at) || Boolean(settings.results_published));
  const correctionsPublished = resultPublished && settings.corrections_published !== false;

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
      result_publication_mode: exam.result_publication_mode === "automatic" ? "automatic" : "manual",
      corrections_published: settings.corrections_published !== false,
      // The candidate client needs the assessment's integrity policy to know
      // which browser events to report and when to warn. Only thresholds and
      // switches travel here — never an answer, never another candidate.
      integrity: parseIntegrityPolicy(settings.integrity),
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
      submission_reason: attempt.submission_reason ?? null,
      started_at: attempt.started_at,
      deadline: deadline.toISOString(),
      flagged: attempt.flagged ?? [],
      grading_status: gradingStatus,
      pending_manual_count: Number(attempt.pending_manual_count ?? 0),
      score: resultPublished ? (attempt.score !== null ? Number(attempt.score) : null) : null,
      max_score: resultPublished ? (attempt.max_score !== null ? Number(attempt.max_score) : null) : null,
      results_published: resultPublished,
      corrections_published: correctionsPublished,
      result_channel: resultPublished ? null : examResultChannelName(attempt.id, token),
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
      const reveal = submitted && correctionsPublished ? answerReveal(row) : null;
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
