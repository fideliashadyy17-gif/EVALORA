"use client";

import { Logo } from "@/components/Logo";
import { ParticipantAvatar } from "@/components/ParticipantAvatar";
import { RichContent } from "@/components/RichContent";
import type { PublicQuestion } from "@/components/QuestionRunner";
import { mmss } from "@/lib/utils";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAssessmentLockdown } from "@/lib/useAssessmentLockdown";

interface RankingRowDto {
  participant_id: string;
  display_name: string;
  avatar_key: string;
  score: number;
  rank: number;
  delta: number | null;
  movement: "up" | "down" | "same" | "new";
  is_leader: boolean;
  is_new_leader: boolean;
}

interface RankingBlock {
  question_index: number;
  is_final: boolean;
  rows: RankingRowDto[];
  hidden: number;
  answered_count: number;
  participant_count: number;
}

interface FinalBlock {
  stage: string;
  places: number;
  podium: RankingRowDto[];
  full: RankingRowDto[] | null;
  participant_count: number;
  history: { question_index: number; leader_name: string; leader_avatar: string; is_final: boolean }[];
}

interface ScreenState {
  server_now: string;
  title: string;
  organization: { name: string; logo_url: string | null } | null;
  instructions: string | null;
  join_code: string | null;
  status: string;
  mode: string;
  phase: string;
  presentation_stage: string;
  session_round: number;
  answer_locked: boolean;
  admission_open: boolean;
  show_leaderboard: boolean;
  progress: { index: number; total: number; remaining_after_current: number };
  question: PublicQuestion | null;
  question_started_at: string | null;
  question_deadline_at: string | null;
  time_per_question_seconds: number;
  joined: number;
  connected: number;
  participants: { display_name: string; avatar_key: string; status: string; connected: boolean }[];
  answered_current: number;
  leaderboard: { display_name: string; avatar_key: string; score: number }[] | null;
  ranking: RankingBlock | null;
  strip: RankingRowDto[];
  final: FinalBlock | null;
  next_session: { session_id: string; join_code: string; screen_path: string } | null;
  audio: { enabled: boolean; volume: number; theme: "evergreen" | "focus" | "celebration" | "off"; sound_effects: boolean };
  presentation: { animations_enabled: boolean; show_join_code_on_screen: boolean };
}

interface ControlState {
  status: string;
  phase: string;
  current_question_index: number;
  question_count: number;
  answer_locked: boolean;
  admission_open: boolean;
  presentation_stage: string;
  results_revealed: boolean;
  paused: boolean;
  ended: boolean;
  mode: string;
}

type LiveCommand =
  | "start"
  | "prev"
  | "next"
  | "end"
  | "pause"
  | "resume"
  | "lock"
  | "unlock"
  | "open_join"
  | "close_join"
  | "show_board"
  | "hide_board"
  | "reveal_results"
  | "reveal_next"
  | "show_full_board"
  | "replay_podium"
  | "finish";

const THEME_NOTES: Record<string, number[]> = {
  evergreen: [261.63, 329.63, 392.0, 523.25, 392.0, 329.63],
  focus: [220.0, 261.63, 329.63, 392.0],
  celebration: [392.0, 523.25, 659.25, 783.99, 659.25, 523.25],
};

/**
 * Dedicated Public Live Screen — and, for the authenticated organizer, the
 * competition's control centre.
 *
 * The projected page renders only the token-scoped public payload. The
 * organizer toolbar is shown only when the server confirms, for this browser
 * session, that the viewer hosts or administers this exact session, and every
 * command is re-authorized on the server. A visitor holding only the screen
 * token can watch but cannot command.
 */
export function PublicScreenClient({ liveId, token }: { liveId: string; token: string }) {
  const [data, setData] = useState<ScreenState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [qr, setQr] = useState("");
  const [soundUnlocked, setSoundUnlocked] = useState(false);
  const [control, setControl] = useState<ControlState | null>(null);
  const [busy, setBusy] = useState<LiveCommand | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [barOpen, setBarOpen] = useState(true);
  const [roundCountdown, setRoundCountdown] = useState<number | null>(null);
  // The projection screen shows live questions to a room of students. It is a
  // protected surface for as long as it is open: copy, cut, paste and the context
  // menu are cancelled, and the displayed text is not selectable.
  useAssessmentLockdown(true);
  const offset = useRef(0);
  const audioContext = useRef<AudioContext | null>(null);
  const playedEvents = useRef(new Set<string>());
  const musicIndex = useRef(0);
  const dataRef = useRef<ScreenState | null>(null);
  dataRef.current = data;

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
        if (!dataRef.current) setError(json?.error ?? "This public screen is unavailable.");
        else setReconnecting(true);
        return;
      }
      offset.current = new Date(json.server_now).getTime() - Date.now();
      setData(json);
      setError(null);
      setReconnecting(false);
    } catch {
      if (dataRef.current) setReconnecting(true);
      else setError("Could not connect to the live screen. Retrying…");
    }
  }, [liveId, token]);

  // Organizer authorization probe. It returns nothing but a boolean plus the
  // current control state for browsers that host this session.
  const loadControl = useCallback(async () => {
    try {
      const res = await fetch(`/api/live/control?session_id=${encodeURIComponent(liveId)}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      if (json?.authorized) setControl(json.state as ControlState);
      else setControl(null);
    } catch {
      // The public presentation must never depend on the control probe.
    }
  }, [liveId]);

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
    loadControl();
    const timer = setInterval(loadControl, 15000);
    return () => clearInterval(timer);
  }, [loadControl]);

  const send = useCallback(
    async (command: LiveCommand) => {
      if (busy) return;
      setBusy(command);
      setCommandError(null);
      try {
        const res = await fetch("/api/live/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: liveId, command }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) setCommandError(json?.error ?? "That command was not accepted.");
        else if (json?.state) setControl(json.state as ControlState);
        await load();
      } catch {
        setCommandError("Connection problem — the command was not sent. Try again.");
      } finally {
        setBusy(null);
      }
    },
    [busy, liveId, load],
  );

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
      if (!soundUnlocked || !audioContext.current || !dataRef.current) return;
      try {
        const ctx = audioContext.current;
        const start = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(
          Math.max(0.0002, dataRef.current.audio.volume * volumeScale),
          start + 0.025,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.03);
      } catch {
        // Presentation audio must never break the visual screen.
      }
    },
    [soundUnlocked],
  );

  // Original generated background music, only on this projection device.
  const audioTheme = data?.audio.theme;
  const audioEnabled = data?.audio.enabled;
  const phase = data?.phase;
  useEffect(() => {
    if (!soundUnlocked || !audioEnabled || audioTheme === "off" || !phase) return;
    if (!["waiting", "countdown", "question", "leaderboard", "podium"].includes(phase)) return;
    const notes = THEME_NOTES[audioTheme ?? "evergreen"] ?? THEME_NOTES.evergreen;
    const intervalMs = audioTheme === "focus" ? 720 : audioTheme === "celebration" ? 440 : 540;
    const timer = setInterval(() => {
      const note = notes[musicIndex.current % notes.length];
      playTone(note, 0, 0.42, 0.038, "triangle");
      if (musicIndex.current % 4 === 0) playTone(note / 2, 0, 0.55, 0.025, "sine");
      musicIndex.current += 1;
    }, intervalMs);
    return () => clearInterval(timer);
  }, [audioEnabled, audioTheme, phase, playTone, soundUnlocked]);

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
    if (data.phase === "countdown" && startsIn !== null && startsIn <= 3 && startsIn > 0) {
      once(`countdown:${q}:${startsIn}`, () => playTone(startsIn === 1 ? 880 : 587.33, 0, 0.16, 0.08));
    }
    const stage = data.presentation_stage;
    if (stage === "suspense") once("reveal:suspense", () => { [196, 196, 196, 246.94].forEach((f, i) => playTone(f, i * 0.5, 0.4, 0.05, "triangle")); });
    if (stage === "third") once("reveal:third", () => { playTone(392, 0, 0.3, 0.08); playTone(523.25, 0.18, 0.42, 0.08); });
    if (stage === "second") once("reveal:second", () => { playTone(440, 0, 0.3, 0.08); playTone(587.33, 0.18, 0.42, 0.08); });
    if (stage === "champion") once("reveal:champion", () => { [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => playTone(f, i * 0.16, 0.5, 0.1, "triangle")); });
    if (stage === "board") once("reveal:board", () => playTone(659.25, 0, 0.4, 0.07));
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

  const authorized = Boolean(control);
  const command = useCallback(
    (name: LiveCommand) => {
      if (!authorized) return;
      void send(name);
    },
    [authorized, send],
  );

  // Organizer keyboard shortcuts on the projected page: the organizer never
  // has to leave fullscreen or look for another window.
  useEffect(() => {
    if (!authorized) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const state = control;
      if (!state) return;
      const key = event.key.toLowerCase();
      if (key === "arrowright" || key === "n") {
        event.preventDefault();
        command("next");
      } else if (key === "arrowleft") {
        event.preventDefault();
        command("prev");
      } else if (key === "p") {
        event.preventDefault();
        command(state.paused ? "resume" : "pause");
      } else if (key === "l") {
        event.preventDefault();
        command(state.answer_locked ? "unlock" : "lock");
      } else if (key === "b") {
        event.preventDefault();
        command(state.phase === "leaderboard" ? "hide_board" : "show_board");
      } else if (key === "r" && state.ended) {
        event.preventDefault();
        if (state.results_revealed) command("reveal_next");
        else command("reveal_results");
      } else if (key === "h") {
        event.preventDefault();
        setBarOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authorized, command, control]);

  // After the podium, the same projected page returns to a fresh waiting room.
  const nextScreenPath = data?.next_session?.screen_path ?? null;
  const finishedStage = data?.presentation_stage === "finished";
  useEffect(() => {
    if (!finishedStage || !nextScreenPath) {
      setRoundCountdown(null);
      return;
    }
    setRoundCountdown(4);
    const tick = setInterval(() => setRoundCountdown((value) => (value === null ? null : Math.max(0, value - 1))), 1000);
    const go = setTimeout(() => {
      window.location.replace(nextScreenPath);
    }, 4200);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [finishedStage, nextScreenPath]);

  if (error && !data) return <Center><p className="max-w-xl text-2xl leading-relaxed">{error}</p></Center>;
  if (!data) return <Center><p className="text-2xl">Loading the Public Live Screen…</p></Center>;

  const deadlineAt = data.question_deadline_at ? new Date(data.question_deadline_at).getTime() : null;
  const remaining = deadlineAt ? Math.max(0, (deadlineAt - serverNow) / 1000) : null;
  const timerPercent = remaining !== null && data.time_per_question_seconds
    ? Math.max(0, Math.min(100, (remaining / data.time_per_question_seconds) * 100))
    : 0;
  const animations = data.presentation.animations_enabled;
  const stage = data.presentation_stage;
  const stateKey = `${data.status}-${data.phase}-${data.progress.index}-${stage}-${data.final?.places ?? 0}`;
  const resultsStage = ["suspense", "third", "second", "champion", "board"].includes(stage);
  const paused = data.status === "paused";

  return (
    <div className={`relative flex min-h-screen flex-col overflow-hidden bg-evergreen-950 text-white ${authorized && barOpen ? "pb-32" : "pb-4"}`}>
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
        <div className="flex flex-wrap items-center gap-2.5">
          {data.session_round > 1 && (
            <span className="rounded-full border border-gold-300/50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-gold-300">
              Round {data.session_round}
            </span>
          )}
          <span className="hidden rounded-full border border-white/20 px-3 py-1.5 text-sm sm:inline-flex">
            {phaseLabel(data)}
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold tabular-nums">
            👥 {data.joined} {data.connected > 0 && data.connected < data.joined ? `· ${data.connected} online` : ""}
          </span>
          {data.answer_locked && ["live", "paused"].includes(data.status) && (
            <span className="rounded-full bg-red-500/90 px-3 py-1.5 text-sm font-bold text-white">🔒 Answers locked</span>
          )}
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
        {data.phase === "waiting" && <Waiting data={data} qr={qr} animations={animations} />}

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

        {data.phase === "leaderboard" && !resultsStage && <Leaderboard data={data} animations={animations} />}

        {resultsStage && <ResultsStage data={data} animations={animations} />}

        {paused && !["leaderboard", "answer_reveal"].includes(data.phase) && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-evergreen-950/95 text-center">
            <p className="text-8xl">⏸️</p>
            <h1 className="mt-5 font-display text-6xl font-semibold">Paused</h1>
            <p className="mt-3 text-2xl text-evergreen-100">The organizer will resume in a moment.</p>
          </div>
        )}

        {data.phase === "completed" && stage !== "finished" && !resultsStage && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-8xl">🏁</p>
            <h1 className="mt-5 font-display text-6xl font-semibold">Competition complete</h1>
            <p className="mt-3 max-w-2xl text-2xl text-evergreen-100">
              Final scores are locked. The organizer will reveal the results and the champion in a moment.
            </p>
          </div>
        )}

        {stage === "finished" && <NextRound data={data} countdown={roundCountdown} qr={qr} />}

        {data.mode === "self_paced" && data.status === "live" && !["leaderboard", "podium"].includes(data.phase) && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="font-display text-6xl font-semibold">Competition in progress</p>
            <p className="mt-4 text-2xl text-evergreen-100">{data.joined} participant(s) are answering independently on their own devices.</p>
          </div>
        )}
      </main>

      {authorized && control && (
        <OrganizerBar
          open={barOpen}
          setOpen={setBarOpen}
          state={control}
          data={data}
          busy={busy}
          error={commandError}
          onCommand={command}
        />
      )}
      {authorized && !barOpen && (
        <button
          type="button"
          onClick={() => setBarOpen(true)}
          className="fixed bottom-4 right-4 z-50 rounded-full border border-white/25 bg-evergreen-900/90 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-gold-300 shadow-xl backdrop-blur hover:bg-evergreen-800"
          aria-label="Show organizer controls (H)"
        >
          ⋯ Organizer
        </button>
      )}
    </div>
  );
}

/* ── Organizer control layer ──────────────────────────────────────────── */

function OrganizerBar({
  open,
  setOpen,
  state,
  data,
  busy,
  error,
  onCommand,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  state: ControlState;
  data: ScreenState;
  busy: LiveCommand | null;
  error: string | null;
  onCommand: (command: LiveCommand) => void;
}) {
  if (!open) return null;
  const total = state.question_count;
  const index = state.current_question_index;
  const isLastQuestion = index >= total - 1;
  const stage = state.presentation_stage;
  const resultsStage = ["suspense", "third", "second", "champion", "board"].includes(stage);
  const revealLabel =
    stage === "suspense"
      ? "Reveal 3rd place"
      : stage === "third"
        ? "Reveal 2nd place"
        : stage === "second"
          ? "Reveal champion 🏆"
          : stage === "champion"
            ? "Show full leaderboard"
            : "Reveal next";

  const nextLabel = state.status === "lobby"
    ? "Start competition"
    : state.phase === "leaderboard"
      ? "Next question →"
      : isLastQuestion
        ? "Finish & lock results"
        : "Next question →";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-evergreen-900/95 px-3 py-2.5 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] backdrop-blur sm:px-5">
      <div className="mx-auto flex max-w-[1700px] flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-gold-300">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 live-dot" aria-hidden="true" />
            Organizer controls
            <span className="rounded bg-white/10 px-2 py-0.5 font-semibold normal-case tracking-normal text-evergreen-100">
              Q {Math.max(index, 0) + 1}/{total} · {state.phase} · {state.paused ? "paused" : state.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="max-w-xs truncate text-xs font-semibold text-red-300" role="status">{error}</span>}
            <span className="hidden text-[11px] text-evergreen-200 lg:inline">← → navigate · P pause · L lock · B rankings · R reveal · H hide</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-white/20 px-2.5 py-1 text-[11px] font-bold text-evergreen-100 hover:bg-white/10"
              aria-label="Hide organizer controls (H)"
            >
              Hide bar
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <CtrlButton onClick={() => onCommand(state.status === "lobby" ? "start" : "next")} busy={busy === "next" || busy === "start"} tone="gold">
            {nextLabel}
          </CtrlButton>
          <CtrlButton onClick={() => onCommand("prev")} busy={busy === "prev"} disabled={state.status === "lobby" || index <= 0}>
            ← Previous
          </CtrlButton>
          <span className="mx-1 h-6 w-px bg-white/20" aria-hidden="true" />
          <CtrlButton onClick={() => onCommand(state.paused ? "resume" : "pause")} busy={busy === "pause" || busy === "resume"} disabled={state.status === "lobby" || state.ended}>
            {state.paused ? "▶ Resume" : "⏸ Pause"}
          </CtrlButton>
          <CtrlButton onClick={() => onCommand(state.answer_locked ? "unlock" : "lock")} busy={busy === "lock" || busy === "unlock"} disabled={state.status === "lobby" || state.ended}>
            {state.answer_locked ? "🔓 Unlock answers" : "🔒 Lock answers"}
          </CtrlButton>
          <CtrlButton onClick={() => onCommand(state.admission_open ? "close_join" : "open_join")} busy={busy === "open_join" || busy === "close_join"} disabled={state.ended}>
            {state.admission_open ? "Close registration" : "Open registration"}
          </CtrlButton>
          <CtrlButton
            onClick={() => onCommand(state.phase === "leaderboard" ? "hide_board" : "show_board")}
            busy={busy === "show_board" || busy === "hide_board"}
            disabled={state.status === "lobby" || state.ended}
          >
            {state.phase === "leaderboard" ? "Hide leaderboard" : "Show leaderboard"}
          </CtrlButton>
          <span className="mx-1 h-6 w-px bg-white/20" aria-hidden="true" />
          {!state.ended ? (
            <CtrlButton
              onClick={() => onCommand("end")}
              busy={busy === "end"}
              tone="danger"
              disabled={state.status === "lobby"}
              title="Close the competition now, lock answers and prepare the reveal"
            >
              🏁 End competition
            </CtrlButton>
          ) : (
            <>
              {!state.results_revealed ? (
                <CtrlButton onClick={() => onCommand("reveal_results")} busy={busy === "reveal_results"} tone="gold">
                  🎬 Reveal final results
                </CtrlButton>
              ) : (
                <CtrlButton onClick={() => onCommand("reveal_next")} busy={busy === "reveal_next"} tone="gold" disabled={resultsStage && stage === "board"}>
                  {revealLabel}
                </CtrlButton>
              )}
              <CtrlButton onClick={() => onCommand("show_full_board")} busy={busy === "show_full_board"} disabled={!state.results_revealed}>
                Full leaderboard
              </CtrlButton>
              <CtrlButton onClick={() => onCommand("replay_podium")} busy={busy === "replay_podium"} disabled={!state.results_revealed}>
                ↺ Replay podium
              </CtrlButton>
              <CtrlButton onClick={() => onCommand("finish")} busy={busy === "finish"} tone="gold">
                ✅ Finish & return to waiting room
              </CtrlButton>
            </>
          )}
          <span className="ml-auto hidden text-[11px] text-evergreen-200 sm:inline">
            {data.mode === "self_paced" ? "Self-paced mode: questions advance per participant." : "Synchronized mode: every device follows this screen."}
          </span>
        </div>
      </div>
    </div>
  );
}

function CtrlButton({
  children,
  onClick,
  busy,
  disabled,
  tone = "default",
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "default" | "gold" | "danger";
  title?: string;
}) {
  const tones = {
    default: "border-white/20 bg-white/10 text-white hover:bg-white/20",
    gold: "border-gold-400 bg-gold-500 text-evergreen-950 hover:bg-gold-400",
    danger: "border-red-400/60 bg-red-500/20 text-red-100 hover:bg-red-500/30",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || Boolean(busy)}
      title={title}
      className={`rounded-lg border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      {busy ? "…" : children}
    </button>
  );
}

/* ── Presentation surfaces ────────────────────────────────────────────── */

function Waiting({ data, qr, animations }: { data: ScreenState; qr: string; animations: boolean }) {
  return (
    <div className="grid flex-1 items-start gap-8 lg:grid-cols-[1.15fr_0.85fr]">
      <section>
        <p className="text-base font-bold uppercase tracking-[0.28em] text-gold-300">Welcome to</p>
        <h1 className="mt-3 font-display text-6xl font-semibold leading-[0.95] sm:text-7xl xl:text-8xl">{data.title}</h1>
        {data.instructions && <p className="mt-6 max-w-3xl whitespace-pre-wrap text-2xl leading-relaxed text-evergreen-100">{data.instructions}</p>}
        <div className="mt-8 flex flex-wrap gap-3 text-lg">
          <span className="rounded-full bg-white/10 px-4 py-2">{data.joined} participant(s) joined</span>
          <span className="rounded-full bg-white/10 px-4 py-2">{data.progress.total} question(s)</span>
          <span className={`rounded-full px-4 py-2 font-bold ${data.admission_open ? "bg-emerald-500 text-emerald-950" : "bg-amber-500 text-amber-950"}`}>
            {data.admission_open ? "Registration open" : "Registration closed"}
          </span>
          <span className="rounded-full bg-gold-500 px-4 py-2 font-bold text-evergreen-950">Waiting for the organizer</span>
        </div>

        <div className="mt-7">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-evergreen-200">In the room ({data.joined})</p>
          {data.participants.length ? (
            <ul className="mt-3 flex max-h-[38vh] flex-wrap gap-2 overflow-y-auto pr-1 scroll-slim">
              {data.participants.map((p, i) => (
                <li
                  key={`${p.display_name}-${i}`}
                  className={`flex items-center gap-2 rounded-2xl border px-2.5 py-1.5 text-base ${p.status === "waiting" ? "border-amber-300/40 bg-amber-400/10" : "border-white/15 bg-white/[0.07]"}`}
                >
                  <span className="relative">
                    <ParticipantAvatar avatarKey={p.avatar_key} name={p.display_name} size={34} />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-evergreen-950 ${p.connected ? "bg-emerald-400" : "bg-slate-400"}`}
                      aria-label={p.connected ? "connected" : "offline"}
                    />
                  </span>
                  <span className="max-w-[10rem] truncate font-semibold">{p.display_name}</span>
                  {p.status === "waiting" && <span className="text-xs font-bold text-amber-200">approval</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className={`mt-3 text-xl text-evergreen-100 ${animations ? "live-dot" : ""}`}>Waiting for the first participant to join…</p>
          )}
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
        <p className="mt-4 rounded-2xl bg-red-500/20 px-5 py-3 text-center text-2xl font-bold text-red-100">
          Time&apos;s up — {data.answer_locked ? "answers are locked." : "answers can no longer change."}
        </p>
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

      {data.strip.length > 0 && (
        <section className="mt-5 rounded-[1.4rem] border border-white/15 bg-white/[0.06] p-3" aria-label="Current top three">
          <p className="px-2 text-xs font-bold uppercase tracking-[0.22em] text-gold-300">Live ranking</p>
          <ol className="mt-2 flex flex-wrap gap-2">
            {data.strip.map((row) => (
              <li key={row.participant_id} className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${row.is_leader ? "bg-gold-500 text-evergreen-950" : "bg-white/10"}`}>
                <span className="font-display text-lg font-extrabold">{row.rank}</span>
                <ParticipantAvatar avatarKey={row.avatar_key} name={row.display_name} size={26} />
                <span className="max-w-[12rem] truncate font-semibold">{row.display_name}</span>
                <strong className="tabular-nums">{row.score}</strong>
                <MovementBadge row={row} />
              </li>
            ))}
          </ol>
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

function MovementBadge({ row }: { row: RankingRowDto }) {
  if (row.movement === "new") return <span className="rounded bg-sky-400/90 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-950">NEW</span>;
  if (row.movement === "up") return <span className="text-sm font-extrabold text-emerald-600">▲{Math.abs(row.delta ?? 0)}</span>;
  if (row.movement === "down") return <span className="text-sm font-extrabold text-red-500">▼{Math.abs(row.delta ?? 0)}</span>;
  return null;
}

function Leaderboard({ data, animations }: { data: ScreenState; animations: boolean }) {
  const rows = data.ranking?.rows ?? [];
  const history = data.final?.history ?? [];
  return (
    <div className="mx-auto w-full max-w-5xl flex-1">
      <p className="text-center text-base font-bold uppercase tracking-[0.28em] text-gold-300">
        Rankings after question {Math.max(1, (data.ranking?.question_index ?? 0) + 1)}
      </p>
      <h1 className="mt-2 text-center font-display text-6xl font-semibold">Leaderboard</h1>
      <p className="mt-2 text-center text-lg text-evergreen-100">
        {data.ranking?.participant_count ?? data.joined} participant(s) · {data.ranking?.answered_count ?? data.answered_current} answered this question
      </p>
      <ol className="mt-7 space-y-2.5">
        {rows.map((row, i) => (
          <li
            key={row.participant_id}
            className={`flex items-center gap-4 rounded-3xl px-5 py-3.5 text-2xl ${row.is_leader ? "bg-gold-500 font-extrabold text-evergreen-950 ring-4 ring-white/60" : "bg-white/[0.08]"} ${animations ? "evalora-rise" : ""}`}
            style={animations ? { animationDelay: `${Math.min(i, 10) * 45}ms` } : undefined}
          >
            <span className="w-12 font-display text-4xl font-extrabold">{row.rank}</span>
            <ParticipantAvatar avatarKey={row.avatar_key} name={row.display_name} size={54} />
            <span className="min-w-0 flex-1 truncate">
              {row.display_name}
              {row.is_new_leader && (
                <span className="ml-3 rounded-full bg-evergreen-950 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wider text-gold-300">New leader</span>
              )}
            </span>
            <MovementBadge row={row} />
            <strong className="tabular-nums">{row.score}</strong>
          </li>
        ))}
      </ol>
      {rows.length === 0 && <p className="mt-8 text-center text-2xl text-evergreen-100">No scores yet.</p>}
      {(data.ranking?.hidden ?? 0) > 0 && (
        <p className="mt-4 text-center text-lg text-evergreen-200">and {data.ranking?.hidden} more participant(s)</p>
      )}
      {history.length > 1 && (
        <div className="mt-7 rounded-2xl border border-white/15 bg-white/[0.06] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-gold-300">Lead changes</p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {history.map((point) => (
              <span key={point.question_index} className="rounded-full bg-white/10 px-3 py-1">
                Q{point.question_index + 1}: <strong>{point.leader_name}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The organizer-driven reveal: suspense → third → second → champion → board.
 * Only the places already revealed by the server are ever rendered.
 */
function ResultsStage({ data, animations }: { data: ScreenState; animations: boolean }) {
  const stage = data.presentation_stage;
  const final = data.final;
  const podium = final?.podium ?? [];
  const byRank = new Map(podium.map((row) => [row.rank, row]));

  if (stage === "suspense") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-lg font-bold uppercase tracking-[0.3em] text-gold-300">The competition has ended</p>
        <h1 className="mt-5 font-display text-7xl font-semibold sm:text-8xl">Results are in…</h1>
        <div className="mt-10 flex h-24 items-end gap-3" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`w-6 rounded-full bg-gold-400/80 ${animations ? "live-dot" : ""}`}
              style={{ height: `${30 + ((i * 37) % 64)}px`, animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </div>
        <p className="mt-10 max-w-2xl text-2xl text-evergreen-100">
          {final?.participant_count ?? data.joined} participants gave everything. The podium is revealed one place at a time.
        </p>
      </div>
    );
  }

  if (stage === "board") {
    const rows = final?.full ?? podium;
    return (
      <div className="mx-auto w-full max-w-5xl flex-1">
        <p className="text-center text-base font-bold uppercase tracking-[0.3em] text-gold-300">Final standings</p>
        <h1 className="mt-2 text-center font-display text-6xl font-semibold">Final leaderboard</h1>
        <ol className="mt-7 space-y-2">
          {rows.map((row, i) => (
            <li
              key={row.participant_id}
              className={`flex items-center gap-4 rounded-2xl px-5 py-2.5 text-xl ${row.rank === 1 ? "bg-gold-500 font-extrabold text-evergreen-950" : row.rank <= 3 ? "bg-white/[0.14]" : "bg-white/[0.07]"} ${animations ? "evalora-rise" : ""}`}
              style={animations ? { animationDelay: `${Math.min(i, 14) * 40}ms` } : undefined}
            >
              <span className="w-10 font-display text-2xl font-extrabold">
                {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}
              </span>
              <ParticipantAvatar avatarKey={row.avatar_key} name={row.display_name} size={40} />
              <span className="min-w-0 flex-1 truncate">{row.display_name}</span>
              <strong className="tabular-nums">{row.score}</strong>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // third / second / champion
  const champion = byRank.get(1);
  const second = byRank.get(2);
  const third = byRank.get(3);
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden">
      {animations && stage === "champion" && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {Array.from({ length: 40 }).map((_, i) => (
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

      {stage === "champion" && champion ? (
        <div className={`relative flex flex-col items-center text-center ${animations ? "evalora-pop" : ""}`}>
          <p className="text-base font-bold uppercase tracking-[0.32em] text-gold-300">EVALORA champion</p>
          <div className="mt-5 rounded-full bg-gold-500/20 p-4 ring-4 ring-gold-400/70">
            <ParticipantAvatar avatarKey={champion.avatar_key} name={champion.display_name} size={150} />
          </div>
          <h1 className="mt-5 font-display text-7xl font-extrabold sm:text-8xl">{champion.display_name}</h1>
          <p className="mt-2 font-display text-4xl tabular-nums text-gold-300">{champion.score} points</p>
          <p className="mt-3 text-2xl text-evergreen-100">🥇 First place — Champion</p>
        </div>
      ) : (
        <div className="relative text-center">
          <p className="text-base font-bold uppercase tracking-[0.3em] text-gold-300">
            {stage === "third" ? "In third place…" : "In second place…"}
          </p>
          <h1 className="mt-4 font-display text-6xl font-semibold">
            {stage === "third" ? "🥉 Third place" : "🥈 Second place"}
          </h1>
        </div>
      )}

      <div className="relative mt-10 grid w-full max-w-5xl items-end gap-4 sm:grid-cols-3">
        {[third, second, champion].map((row, position) => {
          const rank = position === 0 ? 3 : position === 1 ? 2 : 1;
          if (!row) {
            return (
              <div key={rank} className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-evergreen-200">
                <p className="font-display text-3xl">{rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}</p>
                <p className="mt-2 text-lg">Place {rank} still to be revealed</p>
              </div>
            );
          }
          const first = rank === 1;
          return (
            <div key={rank} className={`text-center ${animations ? "evalora-rise" : ""}`}>
              <ParticipantAvatar avatarKey={row.avatar_key} name={row.display_name} size={first ? 132 : 96} className="mx-auto" />
              <p className="mt-3 truncate font-display text-3xl font-bold">{row.display_name}</p>
              <p className="text-xl text-evergreen-100">{row.score} points</p>
              <div className={`mt-4 flex items-start justify-center rounded-t-3xl pt-4 font-display text-6xl font-extrabold ${first ? "h-48 bg-gold-500 text-evergreen-950" : rank === 2 ? "h-36 bg-slate-200 text-slate-800" : "h-28 bg-amber-700 text-white"}`}>
                {rank}
              </div>
            </div>
          );
        })}
      </div>

      {(final?.participant_count ?? 0) > 3 && (
        <p className="relative mt-7 text-xl text-evergreen-100">
          Congratulations to all {final?.participant_count ?? data.joined} participants — the full leaderboard follows.
        </p>
      )}
    </div>
  );
}

function NextRound({ data, countdown, qr }: { data: ScreenState; countdown: number | null; qr: string }) {
  const next = data.next_session;
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-base font-bold uppercase tracking-[0.3em] text-gold-300">Podium complete</p>
      <h1 className="mt-4 font-display text-6xl font-semibold">Next competition starting…</h1>
      <p className="mt-3 max-w-2xl text-2xl text-evergreen-100">
        This round&apos;s results are saved. A fresh waiting room is open{next?.join_code ? <> with code <strong className="text-gold-300">{next.join_code}</strong></> : null}
        {countdown !== null ? ` — returning in ${countdown}s.` : "."}
      </p>
      {qr && next?.join_code && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR code for the next round" className="mt-6 h-40 w-40 rounded-2xl bg-white p-2" />
      )}
      {!next && <p className="mt-4 text-lg text-evergreen-200">Waiting for the organizer to open the next waiting room.</p>}
    </div>
  );
}

function phaseLabel(data: ScreenState) {
  if (data.status === "paused") return "Paused";
  if (["suspense", "third", "second", "champion", "board"].includes(data.presentation_stage)) {
    return {
      suspense: "Results reveal",
      third: "Third place",
      second: "Second place",
      champion: "Champion",
      board: "Final leaderboard",
    }[data.presentation_stage] ?? "Results";
  }
  if (data.presentation_stage === "final_pending") return "Awaiting reveal";
  if (data.presentation_stage === "finished") return "Waiting room";
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
