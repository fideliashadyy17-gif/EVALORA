import { attemptDeadline, attemptRows, gradeAttempt, loadAttemptContext } from "@/lib/exam";
import { attemptAllowsQuizRow, parseTrack } from "@/lib/examTrack";
import { createAdminClient } from "@/lib/supabase/server";
import { validateAnswerPayload } from "@/lib/responseTools";
import { NextResponse } from "next/server";
import { z } from "zod";

const NO_STORE = { "Cache-Control": "private, no-store" };
const CLOCK_SKEW_MS = 5_000;

const Body = z.object({
  attempt_id: z.string().uuid(),
  token: z.string().uuid(),
  question_id: z.string().uuid(),
  quiz_question_id: z.string().uuid().nullable().optional(),
  answer: z.record(z.string(), z.unknown()),
  flagged: z.array(z.string()).optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
  client_queued_at: z.string().max(64).optional(),
  recovery: z.boolean().optional(),
});

async function readServerPendingSaves(
  admin: ReturnType<typeof createAdminClient>,
  attemptId: string,
): Promise<number> {
  try {
    const { data } = await admin
      .from("exam_presence")
      .select("pending_saves")
      .eq("attempt_id", attemptId)
      .maybeSingle();
    const count = Number((data as { pending_saves?: unknown } | null)?.pending_saves ?? 0);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  } catch {
    return 0;
  }
}

/** Autosave one answer (and optionally the flagged list). Deadline-enforced with verified outage recovery. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  const {
    attempt_id,
    token,
    question_id,
    quiz_question_id,
    answer,
    flagged,
    idempotency_key,
    client_queued_at,
    recovery,
  } = parsed.data;

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, attempt_id, token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers: NO_STORE });
  const { attempt, exam } = ctx;

  const deadline = attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0));
  const now = new Date();
  const pastDeadline = now > deadline;

  let isOutageRecovery = false;
  let serverPendingSaves = 0;

  if (attempt.status !== "in_progress" || pastDeadline) {
    if (recovery) {
      serverPendingSaves = await readServerPendingSaves(admin, attempt.id);
      const clientQueuedMs = client_queued_at ? Date.parse(client_queued_at) : NaN;
      const startedMs = Date.parse(String(attempt.started_at ?? ""));
      const queuedBeforeDeadline =
        Number.isFinite(clientQueuedMs) &&
        clientQueuedMs <= deadline.getTime() + CLOCK_SKEW_MS &&
        (!Number.isFinite(startedMs) || clientQueuedMs >= startedMs - 60_000);

      if (attempt.status === "in_progress" && (queuedBeforeDeadline || serverPendingSaves > 0)) {
        isOutageRecovery = true;
      } else if (attempt.status === "auto_submitted" && serverPendingSaves > 0) {
        // Recover pre-deadline queued answers stranded when deadline closure ran before queue flush.
        // Never touch manually confirmed ("submitted") or teacher-graded ("marked") attempts.
        try {
          const { data: existingAnswer } = await admin
            .from("exam_answers")
            .select("marked_by")
            .eq("attempt_id", attempt.id)
            .eq("question_id", question_id)
            .maybeSingle();
          if (!existingAnswer || !(existingAnswer as { marked_by?: unknown }).marked_by) {
            isOutageRecovery = true;
          }
        } catch {
          isOutageRecovery = false;
        }
      }
    }

    if (!isOutageRecovery) {
      if (attempt.status !== "in_progress") {
        return NextResponse.json({ error: "This attempt is already submitted." }, { status: 409, headers: NO_STORE });
      }
      return NextResponse.json({ error: "Time has expired." }, { status: 409, headers: NO_STORE });
    }
  }

  // The question must belong to this exam's paper.
  const { data: belongs } = await admin
    .from("quiz_questions")
    .select("id, questions(type)")
    .eq("quiz_id", exam.quiz_id)
    .eq("question_id", question_id)
    .maybeSingle();
  if (!belongs) return NextResponse.json({ error: "Question not in this paper." }, { status: 400, headers: NO_STORE });
  // Server-side shape validation: a malformed or oversized structured answer
  // must not be stored, and the marking interface must never receive arbitrary
  // JSON. Legacy objective payloads keep their historical permissive shape.
  const questionType = (belongs as { questions?: { type?: string } | null }).questions?.type ?? "";
  const validated = validateAnswerPayload(questionType, answer);
  if (!validated.ok) return NextResponse.json({ error: validated.error ?? "Invalid answer." }, { status: 400, headers: NO_STORE });
  if (quiz_question_id && quiz_question_id !== belongs.id)
    return NextResponse.json({ error: "Question does not match this paper." }, { status: 400, headers: NO_STORE });
  // The question must also be part of THIS candidate's paper (track-filtered order),
  // so an AB attempt cannot store an answer to a BC-only item.
  if (!attemptAllowsQuizRow(attempt.question_order, belongs.id, parseTrack(attempt.track)))
    return NextResponse.json({ error: "Question not in this candidate's paper." }, { status: 400, headers: NO_STORE });

  const nowIso = now.toISOString();
  const upsertQuery = admin.from("exam_answers").upsert(
    {
      attempt_id: attempt.id,
      question_id,
      // Always persist the association resolved from this examination, never
      // an unrelated quiz-question ID supplied by the client.
      quiz_question_id: belongs.id,
      answer: validated.answer,
      updated_at: nowIso,
    },
    { onConflict: "attempt_id,question_id" },
  );

  let error: unknown = null;
  let persistedAt = nowIso;
  if (upsertQuery && typeof (upsertQuery as { select?: unknown }).select === "function") {
    const selected = await (upsertQuery as unknown as {
      select: (cols: string) => { maybeSingle: () => Promise<{ data: { id?: string; updated_at?: string } | null; error: unknown }> };
    }).select("id, updated_at").maybeSingle();
    error = selected.error;
    if (!error && !selected.data) error = new Error("Persistence could not be verified");
    if (selected.data?.updated_at) persistedAt = selected.data.updated_at;
  } else {
    const plain = await (upsertQuery as unknown as PromiseLike<{ error: unknown }>);
    error = plain?.error ?? null;
  }
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500, headers: NO_STORE });

  if (flagged && attempt.status === "in_progress") {
    const { error: flagError } = await admin.from("exam_attempts").update({ flagged }).eq("id", attempt.id);
    // The answer may already have been stored; do not confirm the combined
    // request when the flag update failed. A retry can re-send both values.
    if (flagError) return NextResponse.json({ error: "Could not save review flags. Please retry." }, { status: 500, headers: NO_STORE });
  }

  if (isOutageRecovery && serverPendingSaves > 0) {
    try {
      await admin
        .from("exam_presence")
        .update({ pending_saves: Math.max(0, serverPendingSaves - 1) })
        .eq("attempt_id", attempt.id);
    } catch {
      // Advisory presence counter update only.
    }
  }

  if (isOutageRecovery && attempt.status === "auto_submitted" && typeof gradeAttempt === "function" && typeof attemptRows === "function") {
    try {
      const paperRows = await attemptRows(admin, { quiz_id: exam.quiz_id, settings: exam.settings ?? {} }, {
        id: attempt.id,
        question_order: attempt.question_order,
      });
      const { score, max } = await gradeAttempt(admin, attempt.id, paperRows);
      await admin
        .from("exam_attempts")
        .update({ score, max_score: max })
        .eq("id", attempt.id)
        .eq("status", "auto_submitted");
    } catch {
      // Answer row is already safely persisted; grading can also be re-run by staff if needed.
    }
  }

  return NextResponse.json(
    {
      ok: true,
      saved_at: persistedAt,
      ...(idempotency_key ? { idempotency_key } : {}),
      ...(isOutageRecovery ? { recovered: true } : {}),
    },
    { headers: NO_STORE },
  );
}
