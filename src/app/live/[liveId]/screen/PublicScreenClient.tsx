"use client";

import { Logo } from "@/components/Logo";
import { ParticipantAvatar } from "@/components/ParticipantAvatar";
import { RichContent } from "@/components/RichContent";
import type { PublicQuestion } from "@/components/QuestionRunner";
import { mmss } from "@/lib/utils";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

interface ScreenState {
  server_now: string;
  title: string;
  organization: { name: string; logo_url: string | null } | null;
  instructions: string | null;
  join_code: string | null;
  status: string;
  mode: string;
  phase: string;
  progress: { index: number; total: number; remaining_after_current: number };
  question: PublicQuestion | null;
  question_started_at: string | null;
  question_deadline_at: string | null;
  time_per_question_seconds: number;
  joined: number;
  answered_current: number;
  leaderboard: { display_name: string; avatar_key: string; score: number }[] | null;
  audio: { enabled: boolean; volume: number; theme: "evergreen" | "focus" | "celebration" | "off"; sound_effects: boolean };
  presentation: { animations_enabled: boolean; show_join_code_on_screen: boolean };
}

const THEME_NOTES: Record<string, number[]> = {
  evergreen: [261.63, 329.63, 392.0, 523.25, 392.0, 329.63],
  focus: [220.0, 261.63, 329.63, 392.0],
  celebration: [392.0, 523.25, 659.25, 783.99, 659.25, 523.25],
};

/**
 * Dedicated Public Live Screen. It has no organizer data and renders
 * only the scoped payload authorized by the signed display token.
 * Generated WebAudio tones/music are original, require an explicit
 * operator click, and event keys prevent repeat playback on reconnect.
 */
export function PublicScreenClient({ liveId, token }: { liveId: string; token: string }) {
  const [data, setData] = useState<ScreenState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [qr, setQr] = useState("");
  const [soundUnlocked, setSoundUnlocked] = useState(false);
  const offset = useRef(0);
  const audioContext = useRef<AudioContext | null>(null);
  const playedEvents = useRef(new Set<string>());
  const musicIndex = useRef(0);

  const load = useCallback(async () => {
    if (!token) {
      setError("A secure organizer-issued screen link is required.");
      return;
    }
    try {
      const res = await fetch(`/api/live/screen?id=${encodeURIComponent(liveId)}&token=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (!data) setError(json?.error ?? "This public screen is unavailable.");
        else setReconnecting(true);
        return;
      }
      offset.current = new Date(json.server_now).getTime() - Date.now();
      setData(json);
      setError(null);
      setReconnecting(false);
    } catch {
      if (data) setReconnecting(true);
      else setError("Could not connect to the live screen. Retrying…");
    }
  }, [liveId, token, data]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 1250);
    const tick = setInterval(() => setNow(Date.now()), 200);
    const online = () => load();
    window.addEventListener("online", online);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("online", online);
    };
  }, [load]);

  useEffect(() => {
    if (!data?.join_code) {
      setQr("");
      return;
    }
    QRCode.toDataURL(`${window.location.origin}/play/${data.join_code}`, { width: 260, margin: 1 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [data?.join_code]);

  const playTone = useCallback(
    (frequency: number, delay = 0, duration = 0.28, volumeScale = 0.07, type: OscillatorType = "sine") => {
      if (!soundUnlocked || !audioContext.current || !data) return;
      try {
        const ctx = audioContext.current;
        const start = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, data.audio.volume * volumeScale), start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.03);
      } catch {
        // Presentation audio must never break the visual screen.
      }
    },
    [data, soundUnlocked],
  );

  // Original generated background music, only on this projection device.
  useEffect(() => {
    if (!soundUnlocked || !data?.audio.enabled || data.audio.theme === "off" || !["waiting", "countdown", "question", "leaderboard", "podium"].includes(data.phase)) return;
    const notes = THEME_NOTES[data.audio.theme] ?? THEME_NOTES.evergreen;
    const intervalMs = data.audio.theme === "focus" ? 720 : data.audio.theme === "celebration" ? 440 : 540;
    const timer = setInterval(() => {
      const note = notes[musicIndex.current % notes.length];
      playTone(note, 0, 0.42, 0.038, "triangle");
      if (musicIndex.current % 4 === 0) playTone(note / 2, 0, 0.55, 0.025, "sine");
      musicIndex.current += 1;
    }, intervalMs);
    return () => clearInterval(timer);
  }, [data?.audio.enabled, data?.audio.theme, data?.phase, playTone, soundUnlocked]);

  const serverNow = now + offset.current;
  const startsAt = data?.question_started_at ? new Date(data.question_started_at).getTime() : null;
  const startsIn = startsAt && serverNow < startsAt ? Math.ceil((startsAt - serverNow) / 1000) : null;

  // One-shot, state-synchronized sound effects.
  useEffect(() => {
    if (!data || !soundUnlocked || !data.audio.sound_effects) return;
    const once = (key: string, fn: () => void) => {
      if (playedEvents.current.has(key)) return;
      playedEvents.current.add(key);
      fn();
    };
    const q = data.progress.index;
    if (data.phase === "question") once(`question:${q}`, () => { playTone(659.25, 0, 0.2, 0.08); playTone(880, 0.11, 0.28, 0.08); });
    if (data.phase === "time_expired") once(`expired:${q}`, () => playTone(196, 0, 0.5, 0.09, "sawtooth"));
    if (data.phase === "answer_reveal") once(`reveal:${q}`, () => { playTone(523.25, 0, 0.22, 0.08); playTone(783.99, 0.13, 0.35, 0.08); });
    if (data.phase === "leaderboard") once(`board:${q}:${data.joined}`, () => playTone(587.33, 0, 0.3, 0.07));
    if (data.phase === "podium") once("podium", () => { [392, 523.25, 659.25, 783.99].forEach((f, i) => playTone(f, i * 0.13, 0.38, 0.09, "triangle")); });
    if (data.phase === "countdown" && startsIn !== null && startsIn <= 3 && startsIn > 0) {
      once(`countdown:${q}:${startsIn}`, () => playTone(startsIn === 1 ? 880 : 587.33, 0, 0.16, 0.08));
    }
  }, [data, playTone, soundUnlocked, startsIn]);

  async function enablePresentation() {
    try {
      const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContext.current ??= new AudioCtor();
      await audioContext.current.resume();
      setSoundUnlocked(true);
    } catch {
      setSoundUnlocked(false);
    }
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      // Sound can still be enabled when fullscreen is unavailable.
    }
  }

  if (error && !data) return <Center><p className="max-w-xl text-2xl leading-relaxed">{error}</p></Center>;
  if (!data) return <Center><p className="text-2xl">Loading the Public Live Screen…</p></Center>;

  const deadlineAt = data.question_deadline_at ? new Date(data.question_deadline_at).getTime() : null;
  const remaining = deadlineAt ? Math.max(0, (deadlineAt - serverNow) / 1000) : null;
  const timerPercent = remaining !== null && data.time_per_question_seconds
    ? Math.max(0, Math.min(100, (remaining / data.time_per_question_seconds) * 100))
    : 0;
  const animations = data.presentation.animations_enabled;
  const stateKey = `${data.status}-${data.phase}-${data.progress.index}`;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-evergreen-950 text-white">
      <div className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-evergreen-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-10 h-96 w-96 rounded-full bg-gold-500/15 blur-3xl" />

      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/15 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-4">
          <Logo variant="light" href={null} />
          {data.organization?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.organization.logo_url} alt="" className="hidden h-12 w-12 rounded-full bg-white object-contain p-1 md:block" />
          )}
          <div>
            <p className="font-display text-xl font-semibold sm:text-2xl">{data.title}</p>
            {data.organization?.name && <p className="text-sm text-evergreen-100">{data.organization.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-white/20 px-3 py-1.5 text-sm sm:inline-flex">
            {phaseLabel(data)}
          </span>
          <button onClick={enablePresentation} className="rounded-full bg-gold-500 px-4 py-2 text-sm font-bold text-evergreen-950 shadow hover:bg-gold-400">
            {soundUnlocked ? "🔊 Sound on · Fullscreen" : "▶ Enable sound & fullscreen"}
          </button>
        </div>
      </header>

      {reconnecting && (
        <div className="relative z-20 bg-amber-400 px-5 py-2 text-center text-sm font-bold text-amber-950">
          Connection interrupted — showing the last confirmed state and reconnecting…
        </div>
      )}

      <main key={stateKey} className={`relative z-10 flex flex-1 flex-col px-5 py-5 sm:px-8 sm:py-7 ${animations ? "evalora-screen-in" : ""}`}>
        {data.phase === "waiting" && <Waiting data={data} qr={qr} />}
        {data.phase === "countdown" && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-lg font-bold uppercase tracking-[0.28em] text-gold-300">Get ready</p>
            <p className="mt-4 font-display text-[11rem] font-extrabold leading-none tabular-nums text-white sm:text-[15rem]">{startsIn ?? "…"}</p>
            <p className="mt-4 text-2xl text-evergreen-100">Question {data.progress.index + 1} of {data.progress.total} is coming to every device.</p>
          </div>
        )}

        {["question", "time_expired", "answer_reveal"].includes(data.phase) && data.question && (
          <QuestionPresentation data={data} remaining={remaining} timerPercent={timerPercent} />
        )}

        {data.phase === "leaderboard" && <Leaderboard data={data} />}
        {data.phase === "podium" && <Podium data={data} animations={animations} />}

        {data.status === "paused" && !["leaderboard", "answer_reveal"].includes(data.phase) && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-8xl">⏸️</p>
            <h1 className="mt-5 font-display text-6xl font-semibold">Paused</h1>
            <p className="mt-3 text-2xl text-evergreen-100">The organizer will resume in a moment.</p>
          </div>
        )}

        {data.phase === "completed" && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-8xl">🏁</p>
            <h1 className="mt-5 font-display text-6xl font-semibold">Competition complete</h1>
            <p className="mt-3 max-w-2xl text-2xl text-evergreen-100">Thank you to every participant. The organizer will reveal the final celebration when ready.</p>
          </div>
        )}

        {data.mode === "self_paced" && data.status === "live" && !["leaderboard", "podium"].includes(data.phase) && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="font-display text-6xl font-semibold">Competition in progress</p>
            <p className="mt-4 text-2xl text-evergreen-100">{data.joined} participant(s) are answering independently on their own devices.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function Waiting({ data, qr }: { data: ScreenState; qr: string }) {
  return (
    <div className="grid flex-1 items-center gap-8 lg:grid-cols-[1.25fr_0.75fr]">
      <section>
        <p className="text-base font-bold uppercase tracking-[0.28em] text-gold-300">Welcome to</p>
        <h1 className="mt-3 font-display text-6xl font-semibold leading-[0.95] sm:text-7xl xl:text-8xl">{data.title}</h1>
        {data.instructions && <p className="mt-6 max-w-3xl whitespace-pre-wrap text-2xl leading-relaxed text-evergreen-100">{data.instructions}</p>}
        <div className="mt-8 flex flex-wrap gap-3 text-lg">
          <span className="rounded-full bg-white/10 px-4 py-2">{data.joined} participant(s) joined</span>
          <span className="rounded-full bg-white/10 px-4 py-2">{data.progress.total} question(s)</span>
          <span className="rounded-full bg-gold-500 px-4 py-2 font-bold text-evergreen-950">Waiting for the organizer</span>
        </div>
      </section>
      <section className="rounded-[2rem] border border-white/15 bg-white/[0.07] p-7 text-center shadow-2xl">
        {data.join_code ? (
          <>
            <p className="text-lg text-evergreen-100">Join on your tablet or phone</p>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code to join this competition" className="mx-auto mt-5 h-56 w-56 rounded-2xl bg-white p-2" />
            )}
            <p className="mt-5 text-sm uppercase tracking-[0.2em] text-evergreen-200">Competition code</p>
            <p className="mt-1 font-display text-6xl font-extrabold tracking-[0.14em] text-gold-300">{data.join_code}</p>
            <p className="mt-3 text-evergreen-100">Enter your name and choose your avatar.</p>
          </>
        ) : (
          <>
            <p className="text-7xl">🎉</p>
            <p className="mt-4 font-display text-4xl font-semibold">The room is ready</p>
            <p className="mt-3 text-xl text-evergreen-100">Watch this screen — the first question will appear here and on participant devices.</p>
          </>
        )}
      </section>
    </div>
  );
}

function QuestionPresentation({ data, remaining, timerPercent }: { data: ScreenState; remaining: number | null; timerPercent: number }) {
  const q = data.question!;
  const revealed = data.phase === "answer_reveal";
  const correctIds = new Set(q.reveal?.correct_option_ids ?? []);
  const circumference = 2 * Math.PI * 54;
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-evergreen-100">
            Question <strong className="text-white">{data.progress.index + 1}</strong> of {data.progress.total}
            <span className="text-evergreen-200"> · {data.progress.remaining_after_current} remaining after this</span>
          </p>
          <p className="mt-1 text-sm text-evergreen-200">{data.answered_current}/{data.joined} answers received</p>
        </div>
        <div className="relative h-32 w-32 shrink-0" aria-label={remaining !== null ? `${Math.ceil(remaining)} seconds remaining` : "Question timer"}>
          <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
            <circle cx="64" cy="64" r="54" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="10" />
            <circle
              cx="64" cy="64" r="54" fill="none"
              stroke={revealed ? "#34d399" : remaining !== null && remaining <= 5 ? "#f87171" : "#dcb94a"}
              strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - timerPercent / 100)}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-center">
            <span className="font-display text-4xl font-extrabold tabular-nums">
              {revealed ? "✓" : data.phase === "time_expired" ? "0" : remaining !== null ? mmss(Math.ceil(remaining)) : "—"}
            </span>
          </div>
        </div>
      </div>

      <section className="rounded-[2rem] bg-[#fffaf0] p-6 text-ink shadow-2xl sm:p-9">
        {q.media_url && q.media_type === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.media_url} alt="" className="mb-6 max-h-[38vh] w-full rounded-2xl object-contain" />
        )}
        {q.media_url && q.media_type === "audio" && <audio controls src={q.media_url} className="mb-6 w-full" />}
        {q.media_url && q.media_type === "video" && <video controls src={q.media_url} className="mb-6 max-h-[42vh] w-full rounded-2xl" />}
        <div className="font-display text-4xl font-semibold leading-tight text-evergreen-950 sm:text-5xl xl:text-6xl">
          <RichContent doc={q.prompt_doc ?? null} text={q.prompt} />
        </div>
        {data.instructions && <p className="mt-4 max-w-4xl text-lg text-ink-soft">{data.instructions}</p>}
      </section>

      {data.phase === "time_expired" && (
        <p className="mt-4 rounded-2xl bg-red-500/20 px-5 py-3 text-center text-2xl font-bold text-red-100">Time&apos;s up — answers are locked.</p>
      )}

      {q.options.length > 0 ? (
        <section className="mt-5 grid gap-4 md:grid-cols-2" aria-label="Answer options">
          {q.options.map((o, i) => {
            const correct = revealed && correctIds.has(o.id);
            const colors = ["bg-red-500", "bg-sky-600", "bg-amber-500", "bg-emerald-600", "bg-violet-600", "bg-pink-600"];
            return (
              <div key={o.id} className={`flex min-h-28 items-center gap-4 rounded-[1.4rem] p-5 text-2xl font-semibold shadow-xl sm:text-3xl ${correct ? "bg-emerald-400 text-emerald-950 ring-4 ring-white" : `${colors[i % colors.length]} text-white`} ${revealed && !correct ? "opacity-55" : ""}`}>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-2xl font-extrabold text-evergreen-950">{String.fromCharCode(65 + i)}</span>
                <span className="min-w-0 flex-1"><RichContent doc={o.content_doc ?? null} text={o.label} /></span>
                {correct && <span className="text-4xl" aria-label="Correct answer">✓</span>}
              </div>
            );
          })}
        </section>
      ) : q.type === "matching" ? (
        <section className="mt-5 grid gap-4 md:grid-cols-2">
          <PublicList title="Match these" items={revealed && q.reveal?.summary?.length ? q.reveal.summary : (q.matching_lefts ?? [])} />
          {!revealed && <PublicList title="With these" items={q.matching_rights ?? []} />}
        </section>
      ) : (
        <section className="mt-5 rounded-[1.4rem] border border-white/15 bg-white/[0.07] p-6 text-center">
          <p className="font-display text-3xl font-semibold">{revealed ? "Correct answer" : "Answer on your own device"}</p>
          {revealed && q.reveal?.summary?.length ? (
            <ul className="mx-auto mt-3 max-w-2xl list-disc text-left text-2xl">
              {q.reveal.summary.map((item, i) => <li key={i} className="ml-6">{item}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-xl text-evergreen-100">Use the Student Answer Screen to submit before the timer ends.</p>
          )}
        </section>
      )}

      {revealed && (q.explanation || data.question?.explanation) && (
        <section className="mt-5 rounded-[1.4rem] bg-white/[0.08] p-6">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-gold-300">Explanation</p>
          <div className="mt-2 text-2xl leading-relaxed">
            <RichContent doc={q.explanation_doc ?? null} text={q.explanation ?? ""} />
          </div>
        </section>
      )}
    </div>
  );
}

function PublicList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[1.4rem] border border-white/15 bg-white/[0.07] p-6">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <ul className="mt-4 space-y-3 text-2xl">
        {items.map((item, i) => <li key={`${item}-${i}`} className="rounded-xl bg-white/10 px-4 py-3">{item}</li>)}
      </ul>
    </div>
  );
}

function Leaderboard({ data }: { data: ScreenState }) {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1">
      <p className="text-center text-base font-bold uppercase tracking-[0.28em] text-gold-300">Organizer-released rankings</p>
      <h1 className="mt-2 text-center font-display text-6xl font-semibold">Leaderboard</h1>
      <ol className="mt-8 space-y-3">
        {(data.leaderboard ?? []).map((p, i) => (
          <li key={`${p.display_name}-${i}`} className={`flex items-center gap-4 rounded-3xl px-5 py-4 text-2xl ${i === 0 ? "bg-gold-500 font-extrabold text-evergreen-950" : "bg-white/[0.08]"}`}>
            <span className="w-12 font-display text-4xl font-extrabold">{i + 1}</span>
            <ParticipantAvatar avatarKey={p.avatar_key} name={p.display_name} size={58} />
            <span className="min-w-0 flex-1 truncate">{p.display_name}</span>
            <strong className="tabular-nums">{p.score}</strong>
          </li>
        ))}
      </ol>
      {(!data.leaderboard || data.leaderboard.length === 0) && <p className="mt-8 text-center text-2xl text-evergreen-100">No scores yet.</p>}
    </div>
  );
}

function Podium({ data, animations }: { data: ScreenState; animations: boolean }) {
  const top = (data.leaderboard ?? []).slice(0, 3);
  const ordered = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden">
      {animations && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {Array.from({ length: 36 }).map((_, i) => (
            <span
              key={i}
              className="evalora-confetti absolute top-0 h-3 w-2 rounded-sm"
              style={{
                left: `${(i * 29) % 100}%`,
                background: ["#dcb94a", "#34d399", "#f87171", "#60a5fa", "#facc15"][i % 5],
                animationDelay: `${(i % 12) * 0.35}s`,
              }}
            />
          ))}
        </div>
      )}
      <p className="relative text-base font-bold uppercase tracking-[0.3em] text-gold-300">Champions</p>
      <h1 className="relative mt-2 text-center font-display text-7xl font-semibold">Final podium 🏆</h1>
      {top.length ? (
        <div className="relative mt-12 grid w-full max-w-5xl items-end gap-4 sm:grid-cols-3">
          {ordered.map((p) => {
            const rank = top.indexOf(p) + 1;
            const first = rank === 1;
            return (
              <div key={`${p.display_name}-${rank}`} className="text-center">
                <ParticipantAvatar avatarKey={p.avatar_key} name={p.display_name} size={first ? 130 : 96} className="mx-auto" />
                <p className="mt-3 truncate font-display text-3xl font-bold">{p.display_name}</p>
                <p className="text-xl text-evergreen-100">{p.score} points</p>
                <div className={`mt-4 flex items-start justify-center rounded-t-3xl pt-4 font-display text-6xl font-extrabold ${first ? "h-48 bg-gold-500 text-evergreen-950" : rank === 2 ? "h-36 bg-slate-200 text-slate-800" : "h-28 bg-amber-700 text-white"}`}>
                  {rank}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="relative mt-8 text-2xl text-evergreen-100">Final scores are being prepared.</p>
      )}
      {(data.leaderboard?.length ?? 0) > 3 && (
        <p className="relative mt-8 text-xl text-evergreen-100">Congratulations to all {data.joined} participants!</p>
      )}
    </div>
  );
}

function phaseLabel(data: ScreenState) {
  if (data.status === "paused") return "Paused";
  return {
    waiting: "Waiting room",
    countdown: "Starting",
    question: "Live question",
    time_expired: "Time expired",
    answer_reveal: "Answer reveal",
    leaderboard: "Rankings",
    podium: "Final podium",
    completed: "Completed",
  }[data.phase] ?? data.phase.replace(/_/g, " ");
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-evergreen-950 px-6 text-center text-white">
      <Logo variant="light" href={null} />
      <div className="mt-10">{children}</div>
    </div>
  );
}
