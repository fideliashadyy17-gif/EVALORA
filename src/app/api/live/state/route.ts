import { parseIntegrityPolicy } from "@/lib/integrity";
import {
  effectivePhase,
  loadQuizQuestions,
  parseLiveSettings,
  publicQuestion,
  questionDeadlineAt,
  questionDurationSeconds,
  rankedParticipants,
  revealedQuestion,
  seededShuffle,
} from "@/lib/live";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Participant-only state. The participant's random access token scopes
 * every returned field: no other participant's answers or private data
 * are serialized. Synchronized questions release correctness, points,
 * explanations and the answer key only in the organizer-authorized
 * answer-reveal phase (or after the session ends).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const participantId = searchParams.get("participant_id");
  const token = searchParams.get("token");
  if (!participantId || !token)
    return NextResponse.json({ error: "Missing participant credentials." }, { status: 400 });

  const admin = createAdminClient();
  const { data: participant } = await admin
    .from("session_participants")
    .select("*")
    .eq("id", participantId)
    .eq("access_token", token)
    .maybeSingle();
  if (!participant) return NextResponse.json({ error: "Participant not found." }, { status: 404 });

  // Re-verify phase admission on every state poll. A token, URL, localStorage
  // or Realtime channel alone cannot expose a protected phase's questions.
  const { data: verdict } = await admin.rpc("verify_participant_phase_admission", { p_participant_id: participant.id });
  const admission = (verdict ?? null) as { allowed?: boolean; reason?: string } | null;
  if (!admission?.allowed)
    return NextResponse.json({ error: admission?.reason ?? "Admission is restricted to approved candidates." }, { status: 403 });

  const participantStatus = participant.status === "joined" ? "pending" : participant.status;
  if (["rejected", "blocked"].includes(participantStatus))
    return NextResponse.json(
      { error: "You were removed from this session by the organizer.", removed: true },
      { status: 403 },
    );

  const { data: session } = await admin
    .from("quiz_sessions")
    .select("*")
    .eq("id", participant.session_id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const now = new Date();
  const previousSeen = participant.last_seen_at ? new Date(participant.last_seen_at).getTime() : 0;
  const reconnected = previousSeen > 0 && now.getTime() - previousSeen > 12_000;
  const presencePatch: Record<string, unknown> = { last_seen_at: now.toISOString() };
  if (reconnected) {
    presencePatch.reconnect_count = Number(participant.reconnect_count ?? 0) + 1;
    presencePatch.last_disconnected_at = participant.last_seen_at;
  }
  await admin.from("session_participants").update(presencePatch).eq("id", participant.id);

  const { data: quiz } = await admin.from("quizzes").select("settings, title").eq("id", session.quiz_id).single();
  const quizSettings = (quiz?.settings ?? {}) as Record<string, unknown>;
  const liveSettings = parseLiveSettings(session.settings);
  const rows = await loadQuizQuestions(admin, session.quiz_id);

  const effectiveRows =
    session.mode === "self_paced" && quizSettings.randomize_questions
      ? seededShuffle(rows, participant.id)
      : rows;

  const index = session.mode === "synchronized" ? session.current_question_index : participant.current_index;
  const currentRow = index >= 0 && index < effectiveRows.length ? effectiveRows[index] : null;
  const phase = effectivePhase(session, currentRow, quizSettings, now);
  const deadline = questionDeadlineAt(session, currentRow, quizSettings);

  let myAnswerRow: {
    answer: Record<string, unknown>;
    is_correct: boolean | null;
    points_awarded: number;
    response_ms: number | null;
    submitted_at: string;
  } | null = null;
  if (currentRow) {
    const { data } = await admin
      .from("participant_answers")
      .select("answer, is_correct, points_awarded, response_ms, submitted_at")
      .eq("participant_id", participant.id)
      .eq("quiz_question_id", currentRow.id)
      .maybeSingle();
    if (data) {
      myAnswerRow = {
        answer: (data.answer ?? {}) as Record<string, unknown>,
        is_correct: data.is_correct,
        points_awarded: Number(data.points_awarded),
        response_ms: data.response_ms,
        submitted_at: data.submitted_at,
      };
    }
  }

  const feedbackReleased =
    session.mode === "self_paced" || phase === "answer_reveal" || session.status === "ended";
  const myAnswer = myAnswerRow
    ? {
        submitted: true,
        answer: myAnswerRow.answer,
        response_ms: myAnswerRow.response_ms,
        submitted_at: myAnswerRow.submitted_at,
        ...(feedbackReleased
          ? { is_correct: myAnswerRow.is_correct, points_awarded: myAnswerRow.points_awarded }
          : {}),
      }
    : null;

  // Before an authorized reveal, do not let the live score leak whether
  // the current synchronized answer was correct.
  const displayedScore =
    session.mode === "synchronized" && !feedbackReleased && myAnswerRow && phase !== "leaderboard"
      ? Math.max(0, Number(participant.score) - myAnswerRow.points_awarded)
      : Number(participant.score);

  const { count: participantCount } = await admin
    .from("session_participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id)
    .in("status", ["admitted", "finished"]);

  const showBoard =
    participantStatus !== "pending" &&
    (phase === "leaderboard" ||
      phase === "podium" ||
      (session.status === "ended" && liveSettings.show_leaderboard) ||
      (session.mode === "self_paced" && participantStatus === "finished" && liveSettings.show_leaderboard));

  let leaderboard: { display_name: string; avatar_key: string; score: number; is_me: boolean }[] | null = null;
  let myRank: number | null = null;
  if (showBoard) {
    const [{ data: board }, { data: answers }] = await Promise.all([
      admin
        .from("session_participants")
        .select("id, display_name, avatar_key, score, joined_at")
        .eq("session_id", session.id)
        .in("status", ["admitted", "finished"])
        .limit(1000),
      admin.from("participant_answers").select("participant_id, response_ms").eq("session_id", session.id),
    ]);
    const ranked = rankedParticipants(board ?? [], answers ?? []);
    myRank = ranked.findIndex((p) => p.id === participant.id) + 1 || null;
    leaderboard = ranked.slice(0, 10).map((p) => ({
      display_name: p.display_name,
      avatar_key: p.avatar_key ?? "owl",
      score: Number(p.score),
      is_me: p.id === participant.id,
    }));
  }

  const canSeeQuestion =
    participantStatus !== "pending" && session.status === "live" && currentRow &&
    (session.mode === "self_paced" || ["question", "time_expired", "answer_reveal"].includes(phase));
  const question = canSeeQuestion
    ? phase === "answer_reveal" && session.mode === "synchronized"
      ? revealedQuestion(currentRow, {
          randomizeOptions: Boolean(quizSettings.randomize_options),
          seed: session.id,
        })
      : publicQuestion(currentRow, {
          randomizeOptions: Boolean(quizSettings.randomize_options),
          // Synchronized A/B/C/D labels match the public screen.
          seed: session.mode === "synchronized" ? session.id : participant.id,
        })
    : null;

  const explanationReleased = feedbackReleased && (Boolean(myAnswerRow) || phase === "answer_reveal");

  return NextResponse.json({
    server_now: now.toISOString(),
    session: {
      id: session.id,
      title: session.title ?? quiz?.title,
      status: session.status,
      mode: session.mode,
      phase,
      question_started_at: session.question_started_at,
      question_deadline_at: deadline,
      time_per_question_seconds: questionDurationSeconds(currentRow, quizSettings),
    },
    progress: {
      index,
      total: effectiveRows.length,
      remaining_after_current: Math.max(0, effectiveRows.length - Math.max(index, 0) - 1),
    },
    question,
    my_answer: myAnswer,
    explanation: explanationReleased ? (currentRow?.questions.explanation ?? null) : null,
    explanation_doc: explanationReleased ? (currentRow?.questions.explanation_doc ?? null) : null,
    participant: {
      display_name: participant.display_name,
      avatar_key: participant.avatar_key ?? "owl",
      status: participantStatus,
      score: displayedScore,
      finished: participantStatus === "finished",
      reconnect_count: Number(presencePatch.reconnect_count ?? participant.reconnect_count ?? 0),
    },
    participant_count: participantCount ?? 0,
    // The participant UI alone consumes this policy. It contains detection
    // switches and thresholds only — no answers or private host information.
    integrity: parseIntegrityPolicy(quizSettings.integrity),
    leaderboard,
    my_rank: myRank,
  });
}
