"use client";

import { Logo } from "@/components/Logo";
import { MathText } from "@/components/MathText";
import { QuestionRunner, type PublicQuestion } from "@/components/QuestionRunner";
import { Badge, Button, Card, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { mmss } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

interface LiveState {
  server_now: string;
  session: { id: string; title: string; status: string; mode: string; question_started_at: string | null; time_per_question_seconds: number };
  progress: { index: number; total: number };
  question: PublicQuestion | null;
  my_answer: { is_correct: boolean | null; points_awarded: number } | null;
  explanation: string | null;
  participant: { display_name: string; score: number; finished: boolean };
  participant_count: number;
  leaderboard: { display_name: string; score: number }[] | null;
  my_rank: number | null;
}

export function PlayClient({ code }: { code: string }) {
  const storeKey = `evalora-play-${code}`;
  const [identity, setIdentity] = useState<{ participant_id: string; access_token: string; session_id: string } | null>(null);
  const [name, setName] = useState("");
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<LiveState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ is_correct: boolean | null; points_awarded: number; explanation?: string | null; needs_marking?: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  const offsetRef = useRef(0); // serverNow - clientNow

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) setIdentity(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [storeKey]);

  const fetchState = useCallback(async (id = identity) => {
    if (!id) return;
    const res = await fetch(`/api/live/state?participant_id=${id.participant_id}&token=${id.access_token}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (data?.removed) setError(data.error);
      return;
    }
    offsetRef.current = new Date(data.server_now).getTime() - Date.now();
    setState(data);
    if (data.my_answer) {
      setFeedback({
        is_correct: data.my_answer.is_correct,
        points_awarded: data.my_answer.points_awarded,
        explanation: data.explanation,
      });
    } else {
      setFeedback(null);
    }
  }, [identity]);

  useEffect(() => { fetchState(); }, [fetchState]);

  useEffect(() => {
    if (!identity) return;
    const poll = setInterval(() => fetchState(), 2000);
    const tick = setInterval(() => setNow(Date.now()), 250);
    const supabase = createClient();
    const channel = supabase
      .channel(`live:${identity.session_id}`)
      .on("broadcast", { event: "state-changed" }, () => fetchState())
      .subscribe();
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      supabase.removeChannel(channel);
    };
  }, [identity, fetchState]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/live/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, display_name: name.trim(), participant_ref: ref.trim() || undefined }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return setError(data?.error ?? "Could not join.");
    const id = { participant_id: data.participant_id, access_token: data.access_token, session_id: data.session_id };
    localStorage.setItem(storeKey, JSON.stringify(id));
    setIdentity(id);
  }

  async function answer(payload: Record<string, unknown>) {
    if (!identity || !state?.question || submitting || feedback) return;
    setSubmitting(true);
    const res = await fetch("/api/live/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: identity.participant_id,
        token: identity.access_token,
        quiz_question_id: state.question.quiz_question_id,
        answer: payload,
      }),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error ?? "Your answer could not be submitted.");
      fetchState();
      return;
    }
    setFeedback({ is_correct: data.is_correct, points_awarded: data.points_awarded, explanation: data.explanation, needs_marking: data.needs_marking });
    fetchState();
  }

  if (error && !identity) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">Hmm, that didn&apos;t work</h1>
        <p className="mt-2 text-ink-soft">{error}</p>
        <Button className="mt-4" onClick={() => setError(null)}>Try again</Button>
      </Shell>
    );
  }

  if (!identity) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">You&apos;re joining session {code}</h1>
        <p className="mt-1 text-sm text-ink-soft">Enter the name that should appear on the leaderboard.</p>
        <form onSubmit={join} className="mt-5 space-y-4">
          {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
          <Field label="Display name">
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marie Dubois" autoFocus />
          </Field>
          <Field label="Class / reference (optional)">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. Grade 7B" />
          </Field>
          <Button type="submit" variant="gold" className="w-full py-3 text-base">Enter the lobby</Button>
        </form>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">Session notice</h1>
        <p className="mt-2 text-ink-soft">{error}</p>
      </Shell>
    );
  }

  if (!state) return <Shell><p className="text-ink-soft">Connecting to the session…</p></Shell>;

  const { session, progress, question, participant } = state;
  const serverNow = now + offsetRef.current;
  const remaining =
    session.mode === "synchronized" && session.question_started_at
      ? Math.max(0, session.time_per_question_seconds - (serverNow - new Date(session.question_started_at).getTime()) / 1000)
      : null;

  return (
    <Shell wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-semibold text-evergreen-950 sm:text-2xl">{session.title}</h1>
          <p className="text-sm text-ink-soft">{participant.display_name} · {state.participant_count} participant(s)</p>
        </div>
        <div className="flex items-center gap-2">
          {remaining !== null && session.status === "live" && (
            <Badge tone={remaining <= 5 ? "red" : "gold"} className="px-3 py-1 text-base font-bold tabular-nums">{mmss(Math.ceil(remaining))}</Badge>
          )}
          <Badge tone="green" className="px-3 py-1 text-base font-bold">{participant.score} pts</Badge>
          {state.my_rank && <Badge tone="gray" className="px-3 py-1 text-base">#{state.my_rank}</Badge>}
        </div>
      </div>

      <div className="mb-5 h-2 overflow-hidden rounded-full bg-evergreen-100">
        <div
          className="h-full bg-evergreen-700 transition-all"
          style={{ width: `${progress.total ? Math.min(100, ((Math.max(progress.index, 0) + (session.status === "ended" ? 1 : 0)) / progress.total) * 100) : 0}%` }}
        />
      </div>

      {session.status === "lobby" && (
        <div className="py-10 text-center">
          <p className="text-4xl">🎉</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-evergreen-950">You&apos;re in!</h2>
          <p className="mt-1 text-ink-soft">Waiting for the host to start… keep this page open.</p>
        </div>
      )}

      {session.status === "paused" && (
        <div className="py-10 text-center">
          <h2 className="font-display text-2xl font-semibold text-evergreen-950">Paused by the host</h2>
          <p className="mt-1 text-ink-soft">The session will continue shortly.</p>
        </div>
      )}

      {session.status === "live" && !question && !participant.finished && (
        <p className="py-10 text-center text-ink-soft">Waiting for the next question…</p>
      )}

      {session.status === "live" && question && !feedback && (
        <div>
          <p className="mb-3 text-sm font-medium text-ink-soft">
            Question {progress.index + 1} of {progress.total} · {question.points} point(s)
          </p>
          <QuestionRunner
            key={question.quiz_question_id}
            question={question}
            onAnswer={answer}
            disabled={submitting || (remaining !== null && remaining <= 0)}
          />
          {remaining !== null && remaining <= 0 && (
            <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Time is up for this question — waiting for the host.</p>
          )}
        </div>
      )}

      {session.status === "live" && feedback && question && (
        <div className="py-6 text-center">
          <p className="text-5xl">{feedback.is_correct === true ? "✅" : feedback.is_correct === false ? "❌" : "📩"}</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-evergreen-950">
            {feedback.is_correct === true
              ? `Correct! +${feedback.points_awarded} points`
              : feedback.is_correct === false
                ? "Not quite this time"
                : feedback.needs_marking
                  ? "Answer submitted — it will be marked by your teacher"
                  : "Answer recorded"}
          </h2>
          {feedback.explanation && (
            <div className="mx-auto mt-3 max-w-lg rounded-xl bg-evergreen-50 p-4 text-left text-sm text-evergreen-900">
              <MathText text={feedback.explanation} />
            </div>
          )}
          <p className="mt-3 text-ink-soft">
            {session.mode === "synchronized" ? "Waiting for the host to release the next question…" : "Loading your next question…"}
          </p>
        </div>
      )}

      {(session.status === "ended" || participant.finished) && (
        <div className="py-4 text-center">
          <p className="text-5xl">🏆</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-evergreen-950">
            {participant.finished && session.status !== "ended" ? "You finished!" : "Session complete"}
          </h2>
          <p className="mt-2 text-lg text-ink">
            Your score: <strong className="text-evergreen-800">{participant.score} points</strong>
            {state.my_rank ? <> · Rank <strong>#{state.my_rank}</strong></> : null}
          </p>
          {state.leaderboard && (
            <div className="mx-auto mt-6 max-w-md text-left">
              <h3 className="mb-2 font-display text-lg font-semibold text-evergreen-950">Leaderboard</h3>
              <ol className="divide-y divide-evergreen-900/10 rounded-2xl border border-evergreen-900/10 bg-paper">
                {state.leaderboard.map((p, i) => (
                  <li key={i} className={`flex items-center justify-between px-4 py-2.5 ${p.display_name === participant.display_name ? "bg-gold-50 font-semibold" : ""}`}>
                    <span>{i + 1}. {p.display_name}</span>
                    <span className="tabular-nums">{p.score}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-cream px-4 py-8">
      <Logo className="mb-6" />
      <Card className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} p-6 sm:p-8`}>{children}</Card>
      <p className="mt-5 text-center text-xs text-ink-soft">Fair play guaranteed — timing &amp; scoring run on the server.</p>
    </div>
  );
}
