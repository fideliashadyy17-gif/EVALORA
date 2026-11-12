import { attemptRows, loadAttemptContext } from "@/lib/exam";
import { submissionWindow } from "@/lib/examDeadline";
import { applyDeadlineSubmission } from "@/lib/examSubmission";
import { answerReveal, publicQuestion } from "@/lib/live";
import { buildExamResult } from "@/lib/examResults";
import { parseIntegrityPolicy } from "@/lib/integrity";
import { loadPublishedHints } from "@/lib/examHintsServer";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Full candidate view of an attempt (answers restored for recovery).
 *
 * Reading the paper also performs the one legitimate automatic closure: when the
 * server clock has passed the official deadline (plus the clock margin), the
 * attempt is closed as `auto_submitted` at the deadline instant and the response
 * reports it. That decision is made only by `submissionWindow`/
 * `applyDeadlineSubmission` — never by a timer, an incident or a browser event —
 * and it can only ever happen *after* the deadline, never before it.
 */
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
  const nowMs = Date.now();
  const window = submissionWindow(exam, attempt, nowMs);
  // The client renders its countdown against this instant. It is display-only:
  // a wrong device clock or a stalled countdown cannot change the decision below.
  // A record that cannot produce a deadline reports the largest representable
  // instant, which the client renders as "no countdown" rather than as an expiry.
  const deadlineIso = window.deadline ?? new Date(8.64e15).toISOString();

  let rows: Awaited<ReturnType<typeof attemptRows>>;
  try {
    rows = await attemptRows(admin, exam, attempt);
  } catch {
    return NextResponse.json({ error: "Examination data or grading is unavailable. Reload or contact your invigilator." }, { status: 500, headers });
  }

  // Automatic closure — only ever after the official deadline. The whole rule,
  // including grading the answers saved before that instant, lives in one place.
  if (attempt.status === "in_progress" && window.reached) {
    const closed = await applyDeadlineSubmission(admin, attempt, exam, { reason: "deadline", nowMs });
    if (closed.outcome === "closed" || closed.outcome === "already_closed") {
      attempt.status = closed.status;
      attempt.score = closed.score;
      attempt.max_score = closed.max;
      attempt.submitted_at = closed.submittedAt;
    } else if (closed.outcome === "candidate_status_failed") {
      return NextResponse.json({ error: "The examination closed but its status could not be fully confirmed. Reload or contact your invigilator." }, { status: 500, headers });
    } else {
      return NextResponse.json({ error: "Could not confirm the examination submission. Reload or contact your invigilator." }, { status: 500, headers });
    }
  }

  const { data: saved, error: savedError } = await admin.from("exam_answers").select("*").eq("attempt_id", attempt.id);
  if (savedError || !saved) return NextResponse.json({ error: "Saved answers could not be loaded. Reload or contact your invigilator." }, { status: 500, headers });
  const savedByQ = new Map((saved ?? []).map((a) => [a.question_id, a]));

  // Hints ride along with the paper in ONE extra query, so the control below
  // each question can open instantly. A hint failure degrades to "no hints";
  // it can never fail the examination payload. Only published guidance text is
  // attached — never an answer, key or marking scheme.
  let hintsByQuestion = new Map<string, { level: number; text: string; doc: unknown | null }[]>();
  try {
    hintsByQuestion = await loadPublishedHints(
      admin,
      { id: exam.id, organization_id: exam.organization_id },
      rows.map((row) => row.questions.id),
    );
  } catch {
    hintsByQuestion = new Map();
  }

  // Hint usage is a formative record, shown back to the candidate in their
  // feedback summary and to the teacher in the report. A failure here must
  // never fail the paper, so it degrades to an empty list.
  let hintUsage: { question_id: string; part_id: string; level: number; times_opened: number }[] = [];
  try {
    const { data } = await admin.from("exam_hint_usage")
      .select("question_id, part_id, level, times_opened")
      .eq("attempt_id", attempt.id);
    hintUsage = data ?? [];
  } catch { hintUsage = []; }

  const submitted = attempt.status !== "in_progress";
  const resultsPublished = Boolean(settings.results_published);

  return NextResponse.json({
    server_now: new Date(nowMs).toISOString(),
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      instructions: exam.instructions,
      proctoring: Boolean(settings.proctoring),
      require_screen_share: Boolean(settings.require_screen_share),
      pass_mark_percent: Number(settings.pass_mark_percent ?? 50),
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
      attempt_number: Number(attempt.attempt_number ?? 1),
      previous_attempt_id: (attempt.previous_attempt_id as string | null | undefined) ?? null,
      started_at: attempt.started_at,
      deadline: deadlineIso,
      flagged: attempt.flagged ?? [],
      score: submitted && resultsPublished ? (attempt.score !== null ? Number(attempt.score) : null) : null,
      max_score: submitted && resultsPublished ? (attempt.max_score !== null ? Number(attempt.max_score) : null) : null,
      results_published: resultsPublished,
      track: (attempt.track as "AB" | "BC" | null | undefined) ?? null,
    },
    hint_usage: hintUsage,
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
        // Candidate-safe projection: level + text only. Published hints remain
        // available on a submitted paper for revision, but the on-demand route
        // refuses new reads once the attempt is closed.
        hints: hintsByQuestion.get(row.questions.id) ?? [],
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
