import { loadQuizQuestions, publicQuestion } from "@/lib/live";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Read-only public screen data. Only ever exposes what the organizer
 * enabled: current question (no correctness), counts, and — when the
 * session setting allows — the leaderboard.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = (searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Missing code." }, { status: 400 });

  const admin = createAdminClient();
  const { data: session } = await admin.from("quiz_sessions").select("*").eq("join_code", code).maybeSingle();
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const settings = (session.settings ?? {}) as Record<string, unknown>;
  if (settings.projector_enabled === false)
    return NextResponse.json({ error: "The public screen is disabled for this session." }, { status: 403 });

  const { data: quiz } = await admin.from("quizzes").select("settings, title").eq("id", session.quiz_id).single();
  const quizSettings = (quiz?.settings ?? {}) as Record<string, unknown>;
  const rows = await loadQuizQuestions(admin, session.quiz_id);

  const idx = session.current_question_index;
  const currentRow = session.mode === "synchronized" && idx >= 0 && idx < rows.length ? rows[idx] : null;

  const { count: joined } = await admin
    .from("session_participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id)
    .neq("status", "rejected");

  let answeredCurrent = 0;
  if (currentRow) {
    const { count } = await admin
      .from("participant_answers")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id)
      .eq("quiz_question_id", currentRow.id);
    answeredCurrent = count ?? 0;
  }

  let leaderboard: { display_name: string; score: number }[] | null = null;
  if (settings.show_leaderboard) {
    const { data } = await admin
      .from("session_participants")
      .select("display_name, score")
      .eq("session_id", session.id)
      .neq("status", "rejected")
      .order("score", { ascending: false })
      .limit(10);
    leaderboard = (data ?? []).map((p) => ({ display_name: p.display_name, score: Number(p.score) }));
  }

  return NextResponse.json({
    server_now: new Date().toISOString(),
    title: session.title ?? quiz?.title,
    join_code: session.join_code,
    status: session.status,
    mode: session.mode,
    question_started_at: session.question_started_at,
    time_per_question_seconds: Number(
      currentRow?.time_limit_seconds ?? quizSettings.time_per_question_seconds ?? 30,
    ),
    progress: { index: idx, total: rows.length },
    question: session.status === "live" && currentRow ? publicQuestion(currentRow, {}) : null,
    joined: joined ?? 0,
    answered_current: answeredCurrent,
    leaderboard,
  });
}
