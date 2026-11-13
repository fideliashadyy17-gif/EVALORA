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
import { isResultsStage, parsePresentationStage, stageLabel } from "@/lib/liveControl";
import { liveFeaturesFromSettings } from "@/lib/liveFeatures";
import { loadRankingView } from "@/lib/liveControlServer";
import { revealedPodium, withMovement } from "@/lib/liveRanking";
import { buildRoster, PRESENCE_HEARTBEAT_MS, type PresenceSourceRow } from "@/lib/presence";
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
  const stage = parsePresentationStage(session.presentation_stage);

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

  // ── Participant rail ────────────────────────────────────────────────
  // One small row per admitted participant: name, avatar and when their device
  // last spoke. No answers, no scores, no ranks and no other session can ever
  // appear here — the query is filtered by this session id.
  const { data: rosterRows } = await admin
    .from("session_participants")
    .select("id, display_name, avatar_key, status, last_seen_at")
    .eq("session_id", session.id)
    .in("status", ["admitted", "finished"])
    .order("joined_at", { ascending: true })
    .limit(1000);
  const presenceRows: PresenceSourceRow[] = ((rosterRows ?? []) as {
    id: string;
    display_name: string | null;
    avatar_key: string | null;
    status: string;
    last_seen_at: string | null;
  }[]).map((row) => ({
    key: row.id,
    display_name: row.display_name,
    avatar_key: row.avatar_key,
    last_seen_at: row.last_seen_at,
    status: row.status,
  }));
  const presence = buildRoster({
    scope: `live:${session.id}`,
    rows: presenceRows,
    nowMs: now.getTime(),
    selfKey: participant.id,
  });
  const participantCount = presence.total;

  const showBoard =
    participantStatus !== "pending" &&
    (phase === "leaderboard" ||
      stage === "board" ||
      // Sessions ended before the reveal sequence existed keep their old
      // behaviour; a new round is always gated by the organizer's reveal.
      (session.status === "ended" && stage === "idle" && liveSettings.show_leaderboard) ||
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

  // ── Final results on the participant's own device ────────────────────
  // The organizer controls the reveal; a participant only ever receives the
  // places already revealed, plus their own position once the reveal starts.
  let final: {
    stage: string;
    label: string;
    my_rank: number | null;
    my_score: number;
    my_entry: { display_name: string; avatar_key: string; score: number; rank: number } | null;
    revealed: number;
    total: number;
    podium: { display_name: string; avatar_key: string; score: number; rank: number; is_me: boolean }[];
    full: { display_name: string; avatar_key: string; score: number; rank: number; is_me: boolean }[] | null;
    away_from_board: number;
  } | null = null;
  if (isResultsStage(stage) && participantStatus !== "pending") {
    const view = await loadRankingView(admin, session.id, stage);
    const rows = withMovement(view.current?.entries ?? [], view.previous);
    const podiumRows = revealedPodium(rows, stage);
    const revealed = podiumRows.length;
    const mine = rows.find((row) => row.participant_id === participant.id) ?? null;
    const decorate = (row: (typeof rows)[number]) => ({
      display_name: row.display_name,
      avatar_key: row.avatar_key,
      score: row.score,
      rank: row.rank,
      is_me: row.participant_id === participant.id,
    });
    final = {
      stage,
      label: stageLabel(stage, session.status),
      my_rank: mine?.rank ?? null,
      my_score: mine?.score ?? Number(participant.score),
      my_entry: mine ? { display_name: mine.display_name, avatar_key: mine.avatar_key, score: mine.score, rank: mine.rank } : null,
      revealed,
      total: rows.length,
      podium: podiumRows.map(decorate),
      full: stage === "board" ? rows.map(decorate) : null,
      away_from_board: Math.max(0, rows.length - revealed),
    };
    if (mine) myRank = mine.rank;
  }

  // ── Next round ──────────────────────────────────────────────────────
  // Once the organizer finishes the podium the same configuration opens a new
  // waiting room. The previous round keeps its participants, answers, scores,
  // snapshots and champion; participants only receive the new join code.
  let nextSession: { session_id: string; join_code: string } | null = null;
  if (stage === "finished") {
    const { data: next } = await admin
      .from("quiz_sessions")
      .select("id, join_code")
      .eq("previous_session_id", session.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next) nextSession = { session_id: next.id, join_code: next.join_code };
  }

  return NextResponse.json({
    server_now: now.toISOString(),
    session: {
      id: session.id,
      title: session.title ?? quiz?.title,
      status: session.status,
      mode: session.mode,
      phase,
      answer_locked: Boolean(session.answer_locked),
      presentation_stage: stage,
      question_started_at: session.question_started_at,
      question_deadline_at: deadline,
      time_per_question_seconds: questionDurationSeconds(currentRow, quizSettings),
      // Answer tools the organiser allows in this session. Six booleans from
      // the participant's own session; every tool unless one was switched off.
      live_features: liveFeaturesFromSettings(session.settings),
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
    participant_count: participantCount,
    presence,
    presence_heartbeat_ms: PRESENCE_HEARTBEAT_MS,
    leaderboard,
    my_rank: myRank,
    final,
    next_session: nextSession,
  });
}
