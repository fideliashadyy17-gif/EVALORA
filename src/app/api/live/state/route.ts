import { loadQuizQuestions, publicQuestion, seededShuffle } from "@/lib/live";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Participant state (polled + refetched on realtime broadcast).
 * Server computes the effective question, remaining window and score.
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
  if (participant.status === "rejected")
    return NextResponse.json({ error: "You were removed from this session by the host.", removed: true }, { status: 403 });

  const { data: session } = await admin.from("quiz_sessions").select("*").eq("id", participant.session_id).single();
  await admin.from("session_participants").update({ last_seen_at: new Date().toISOString() }).eq("id", participant.id);

  const { data: quiz } = await admin.from("quizzes").select("settings, title").eq("id", session.quiz_id).single();
  const quizSettings = (quiz?.settings ?? {}) as Record<string, unknown>;
  const rows = await loadQuizQuestions(admin, session.quiz_id);

  // Effective order: per-participant shuffle only in self-paced mode.
  const effectiveRows =
    session.mode === "self_paced" && quizSettings.randomize_questions
      ? seededShuffle(rows, participant.id)
      : rows;

  const index =
    session.mode === "synchronized" ? session.current_question_index : participant.current_index;
  const currentRow = index >= 0 && index < effectiveRows.length ? effectiveRows[index] : null;

  let myAnswer: { is_correct: boolean | null; points_awarded: number } | null = null;
  if (currentRow) {
    const { data } = await admin
      .from("participant_answers")
      .select("is_correct, points_awarded")
      .eq("participant_id", participant.id)
      .eq("quiz_question_id", currentRow.id)
      .maybeSingle();
    if (data) myAnswer = { is_correct: data.is_correct, points_awarded: Number(data.points_awarded) };
  }

  const { count: participantCount } = await admin
    .from("session_participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id)
    .neq("status", "rejected");

  const showBoard = Boolean((session.settings as Record<string, unknown>)?.show_leaderboard);
  let leaderboard: { display_name: string; score: number }[] | null = null;
  let myRank: number | null = null;
  if (showBoard) {
    const { data: board } = await admin
      .from("session_participants")
      .select("id, display_name, score")
      .eq("session_id", session.id)
      .neq("status", "rejected")
      .order("score", { ascending: false })
      .limit(100);
    const list = board ?? [];
    myRank = list.findIndex((p) => p.id === participant.id) + 1 || null;
    leaderboard = list.slice(0, 10).map((p) => ({ display_name: p.display_name, score: Number(p.score) }));
  }

  const timePerQuestion = Number(
    currentRow?.time_limit_seconds ?? quizSettings.time_per_question_seconds ?? 30,
  );

  return NextResponse.json({
    server_now: new Date().toISOString(),
    session: {
      id: session.id,
      title: session.title ?? quiz?.title,
      status: session.status,
      mode: session.mode,
      question_started_at: session.question_started_at,
      time_per_question_seconds: timePerQuestion,
    },
    progress: { index, total: effectiveRows.length },
    question:
      session.status === "live" && currentRow
        ? publicQuestion(currentRow, {
            randomizeOptions: Boolean(quizSettings.randomize_options),
            seed: participant.id,
          })
        : null,
    my_answer: myAnswer,
    explanation: myAnswer ? (currentRow?.questions.explanation ?? null) : null, explanation_doc: myAnswer ? (currentRow?.questions.explanation_doc ?? null) : null,
    participant: {
      display_name: participant.display_name,
      score: Number(participant.score),
      finished: participant.status === "finished",
    },
    participant_count: participantCount ?? 0,
    leaderboard,
    my_rank: myRank,
  });
}
