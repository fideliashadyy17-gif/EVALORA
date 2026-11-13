import { loadAttemptContext } from "@/lib/exam";
import { submissionWindow } from "@/lib/examDeadline";
import { applyDeadlineSubmission } from "@/lib/examSubmission";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  attempt_id: z.string().uuid(),
  token: z.string().uuid(),
  idempotency_key: z.string().min(8).max(128).optional(),
});

const headers = { "Cache-Control": "private, no-store" };

/**
 * Final submission requested by the candidate themselves.
 *
 * This route is the *only* way a paper closes before its deadline, and it does
 * so because the candidate pressed "submit" — never because the browser lost
 * focus, the tab was hidden, full screen ended, the clipboard was used, the
 * network blipped, a React component unmounted, a timer fired or an integrity
 * incident was recorded. Nothing in this file reads an incident.
 *
 * The server decides everything:
 *
 *  - `submitted_at` is the server instant of the confirmation, never a
 *    browser-supplied time;
 *  - the official deadline is computed here from `started_at`, the examination
 *    duration and any authorised extension (`submissionWindow`);
 *  - a confirmation that arrives *after* that deadline is recorded as
 *    `auto_submitted` **at the deadline instant**, with only the answers
 *    autosaved before it, so a late manual submit can never be reported as an
 *    on-time one;
 *  - an attempt that is already closed is answered with its stored outcome and
 *    is not graded or written again (idempotent).
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, parsed.data.attempt_id, parsed.data.token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers });
  const { attempt, exam, candidate } = ctx;
  if (!exam || !candidate)
    return NextResponse.json({ error: "Examination data is unavailable." }, { status: 500, headers });

  // The server clock, read once. The browser never supplies it.
  const nowMs = Date.now();
  const window = submissionWindow(exam, attempt, nowMs);

  // Already submitted: report the stored facts. No grading, no write.
  if (attempt.status !== "in_progress") {
    return NextResponse.json(
      {
        ok: true,
        already_submitted: true,
        status: attempt.status,
        auto_submitted: attempt.status === "auto_submitted",
        submitted_at: attempt.submitted_at ?? null,
        deadline: window.deadline,
        ...(parsed.data.idempotency_key ? { idempotency_key: parsed.data.idempotency_key } : {}),
      },
      { headers },
    );
  }

  // A confirmation arriving after the official deadline becomes an automatic
  // closure at the deadline instant. This is a *late* submission being recorded
  // honestly; it is never an early one.
  const reason = window.reached ? "deadline" : "candidate";
  const result = await applyDeadlineSubmission(admin, attempt, exam, { reason, nowMs });

  if (result.outcome === "refused_premature") {
    // Unreachable for `candidate` (the guard only applies to deadline closures),
    // and retained as a hard stop in case that ever changes.
    return NextResponse.json({ error: "The official deadline has not been reached." }, { status: 409, headers });
  }
  if (result.outcome === "paper_unavailable" || result.outcome === "grading_failed") {
    return NextResponse.json(
      { error: "Could not confirm grading. Reload or contact your invigilator." },
      { status: 500, headers },
    );
  }
  if (result.outcome === "close_failed") {
    return NextResponse.json({ error: "Could not submit this attempt." }, { status: 500, headers });
  }
  if (result.outcome === "candidate_status_failed") {
    return NextResponse.json(
      {
        error:
          "The examination closed but its status could not be fully confirmed. Reload or contact your invigilator.",
      },
      { status: 500, headers },
    );
  }

  // Both `closed` and a re-read `already_closed` report the authoritative outcome.
  const resultsPublished = Boolean((exam.settings as Record<string, unknown> | null)?.results_published);
  return NextResponse.json(
    {
      ok: true,
      status: result.status,
      auto_submitted: result.autoSubmitted,
      submitted_at: result.submittedAt,
      deadline: result.deadline,
      // Scores are only ever returned to a candidate once the institution has
      // published them. Publication policy is unchanged by this fix.
      score: resultsPublished ? result.score : null,
      max_score: resultsPublished ? result.max : null,
      results_published: resultsPublished,
      ...(parsed.data.idempotency_key ? { idempotency_key: parsed.data.idempotency_key } : {}),
    },
    { headers },
  );
}
