"use client";

import { Logo } from "@/components/Logo";
import { RichContent } from "@/components/RichContent";
import type { PublicQuestion } from "@/components/QuestionRunner";
import { mmss } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

interface ProjState {
  server_now: string;
  title: string;
  join_code: string;
  status: string;
  progress: { index: number; total: number };
  question: PublicQuestion | null;
  question_started_at: string | null;
  time_per_question_seconds: number;
  joined: number;
  answered_current: number;
  leaderboard: { display_name: string; score: number }[] | null;
}

/**
 * Projector screen — intentionally the platform's one dark surface:
 * it is displayed on hall screens where a dark field reduces glare.
 * All text is large and solid (white 16.7:1, gold-400 8.8:1 on evergreen-950).
 */
export function ProjectorClient({ code }: { code: string }) {
  const [data, setData] = useState<ProjState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/live/projector?code=${code}`);
    const j = await res.json().catch(() => null);
    if (!res.ok) { setError(j?.error ?? "Session not found."); return; }
    offset.current = new Date(j.server_now).getTime() - Date.now();
    setData(j);
  }, [code]);

  useEffect(() => {
    load();
    const p = setInterval(load, 2000);
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => { clearInterval(p); clearInterval(t); };
  }, [load]);

  if (error) return <Center><p className="text-xl">{error}</p></Center>;
  if (!data) return <Center><p className="text-xl">Loading the big screen…</p></Center>;

  const remaining = data.question_started_at
    ? Math.max(0, data.time_per_question_seconds - (now + offset.current - new Date(data.question_started_at).getTime()) / 1000)
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-evergreen-950 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 px-6 py-4">
        <Logo variant="light" href={null} />
        <div className="text-right">
          <p className="font-display text-2xl font-semibold">{data.title}</p>
          <p className="text-evergreen-100">
            Join with code <span className="font-display text-2xl font-bold tracking-[0.2em] text-gold-400">{data.join_code}</span>
          </p>
        </div>
      </header>

      <main className="grid flex-1 gap-6 px-6 py-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="flex flex-col justify-center rounded-3xl border border-white/10 bg-white/[0.06] p-8">
          {data.status === "lobby" && (
            <div className="text-center">
              <p className="font-display text-5xl font-semibold">Welcome! 🎉</p>
              <p className="mt-4 text-2xl text-evergreen-100">
                {data.joined} participant(s) in the lobby — the host will start soon.
              </p>
            </div>
          )}
          {data.status === "live" && data.question && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-lg text-evergreen-100">
                  Question {data.progress.index + 1} of {data.progress.total} · {data.answered_current}/{data.joined} answered
                </p>
                {remaining !== null && (
                  <p className={`font-display text-5xl font-bold tabular-nums ${remaining <= 5 ? "text-red-400" : "text-gold-400"}`}>{mmss(Math.ceil(remaining))}</p>
                )}
              </div>
              <div className="font-display text-3xl leading-snug sm:text-4xl">
                <RichContent doc={data.question.prompt_doc ?? null} text={data.question.prompt} />
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {data.question.options.map((o, i) => (
                  <div key={o.id} className="rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-xl">
                    <span className="mr-2 font-bold text-gold-400">{String.fromCharCode(65 + i)}.</span>
                    <RichContent doc={o.content_doc ?? null} text={o.label} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.status === "paused" && <Center><p className="font-display text-4xl">Paused — back in a moment</p></Center>}
          {data.status === "ended" && (
            <div className="text-center">
              <p className="text-7xl">🏆</p>
              <p className="mt-4 font-display text-5xl font-semibold">Final results</p>
              <p className="mt-2 text-xl text-evergreen-100">Congratulations to everyone who took part!</p>
            </div>
          )}
        </section>

        <aside className="rounded-3xl border border-white/10 bg-white/[0.06] p-6">
          <h2 className="font-display text-2xl font-semibold">Leaderboard</h2>
          {data.leaderboard ? (
            <ol className="mt-4 space-y-2">
              {data.leaderboard.map((p, i) => (
                <li key={i} className={`flex items-center justify-between rounded-xl px-4 py-3 text-lg ${i === 0 ? "bg-gold-500 font-bold text-evergreen-950" : "bg-white/10"}`}>
                  <span>{i + 1}. {p.display_name}</span>
                  <span className="tabular-nums">{p.score}</span>
                </li>
              ))}
              {data.leaderboard.length === 0 && <li className="text-evergreen-100">No scores yet.</li>}
            </ol>
          ) : (
            <p className="mt-3 text-evergreen-100">The organizer has hidden the leaderboard for this session.</p>
          )}
        </aside>
      </main>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center bg-evergreen-950 px-6 text-center text-white">
      {children}
    </div>
  );
}
