"use client";

import { Logo } from "@/components/Logo";
import { ParticipantAvatar } from "@/components/ParticipantAvatar";
import { RichContent } from "@/components/RichContent";
import type { PublicQuestion } from "@/components/QuestionRunner";
import { mmss } from "@/lib/utils";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioControls, AudioEnableChip } from "@/components/AudioControls";
import { useLiveAudio } from "@/lib/useLiveAudio";
import { trackForPhase, type CueKey } from "@/lib/liveMusic";
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
  /** Public screen address may be the competition; this is the live session. */
  competition_id: string | null;
  session_id: string;
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
  audio: {
    enabled: boolean;
    volume: number;
    theme: "evergreen" | "focus" | "celebration" | "off";
    sound_effects: boolean;
    music_enabled?: boolean;
    sfx_enabled?: boolean;
  };
  presentation: { animations_enabled: boolean; show_join_code_on_screen: boolean };
}

interface ControlParticipant {
  participant_id: string;
  display_name: string;
  avatar_key: string;
  status: string;
  connected: boolean;
  answered: boolean;
  reconnect_count: number;
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
  session_id?: string;
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
  | "reveal_answer"
  | "hide_answer"
  | "open_join"
  | "close_join"
  | "show_board"
  | "hide_board"
  | "reveal_results"
  | "reveal_next"
  | "show_full_board"
  | "replay_podium"
  | "finish";

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
  const [control, setControl] = useState<ControlState | null>(null);
  const [participants, setParticipants] = useState<ControlParticipant[]>([]);
  const [busy, setBusy] = useState<LiveCommand | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [barOpen, setBarOpen] = useState(true);
  const [roundCountdown, setRoundCountdown] = useState<number | null>(null);
  // The projection screen shows live questions to a room of students. It is a
  // protected surface for as long as it is open: copy, cut, paste and the context
  // menu are cancelled, and the displayed text is not selectable.
  useAssessmentLockdown(true);
  const offset = useRef(0);
  const playedEvents = useRef(new Set<string>());
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

  // The screen is addressed by `/live/<id>/screen`, where <id> is the
  // competition for competition-linked sessions and the session id only for
  // legacy standalone ones. Host commands must address the *session*, so the
  // probe waits for the payload and uses the session id it reports. Asking the
  // control endpoint about the URL segment instead made it answer "not found"
  // and silently hid the whole organizer toolbar.
  const controlSessionId = data?.session_id ?? null;

  // Organizer authorization probe. It returns a boolean, the current control
  // state and the participant roster for browsers that host this session.
  const loadControl = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/live/control?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      if (json?.authorized) {
        setControl(json.state as ControlState);
        setParticipants((json.participants as ControlParticipant[] | undefined) ?? []);
      } else {
        setControl(null);
        setParticipants([]);
      }
    } catch {
      // The public presentation must never depend on the control probe.
    }
  }, []);

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
    if (!controlSessionId) return;
    void loadControl(controlSessionId);
    // Keeps the toolbar and participant panel in step with the host console
    // (or a second organizer device) and restores them after a refresh.
    const timer = setInterval(() => void loadControl(controlSessionId), 5000);
    return () => clearInterval(timer);
  }, [controlSessionId, loadControl]);

  const send = useCallback(
    async (command: LiveCommand) => {
      if (busy || !controlSessionId) return;
      setBusy(command);
      setCommandError(null);
      try {
        const res = await fetch("/api/live/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: controlSessionId, command }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) setCommandError(json?.error ?? "That command was not accepted.");
        else if (json?.state) setControl(json.state as ControlState);
        if (Array.isArray(json?.participants)) setParticipants(json.participants as ControlParticipant[]);
        await load();
      } catch {
        setCommandError("Connection problem — the command was not sent. Try again.");
      } finally {
        setBusy(null);
      }
    },
    [busy, controlSessionId, load],
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

  const serverNow = now + offset.current;
  const startsAt = data?.question_started_at ? new Date(data.question_started_at).getTime() : null;
  const startsIn = startsAt && serverNow < startsAt ? Math.ceil((startsAt - serverNow) / 1000) : null;

  // ── Original EVALORA soundtrack ─────────────────────────────────────
  // The projection device is the room's single audio owner: the soundtrack
  // plays here, never on participant phones, so a room can never hear the same
  // track twice. Host switches (music / effects / volume) arrive with the
  // public payload; each listener's own volumes are stored on the device.
  const remainingSeconds = data?.question_deadline_at
    ? Math.max(0, (new Date(data.question_deadline_at).getTime() - serverNow) / 1000)
    : null;
  // Coarse bucket: the engine only restarts when the musical cue actually
  // changes, not on every 200 ms clock tick.
  const remainingBucket = remainingSeconds === null ? null : remainingSeconds <= 0 ? 0 : remainingSeconds <= 5 ? 5 : Math.ceil(remainingSeconds / 10) * 10;
  const audioTrack = useMemo(
    () =>
      data && data.audio.theme !== "off"
        ? trackForPhase(data.phase, {
            status: data.status,
            stage: data.presentation_stage,
            remaining: remainingBucket,
          })
        : null,
    [data, remainingBucket],
  );
  const {
    snapshot: audioSnapshot,
    updatePreferences: updateAudioPreferences,
    unlock: unlockAudio,
    cue: playCue,
  } = useLiveAudio({
    role: "screen",
    sessionId: liveId,
    server: data?.audio ?? { enabled: true, volume: 0.6 },
    track: audioTrack,
    variant:
      data?.audio.theme === "focus" ? "focus" : data?.audio.theme === "celebration" ? "celebration" : "evergreen",
  });

  // One-shot musical cues, synchronised to authoritative state. Each key is
  // played at most once, so a network retry or a re-render cannot double a cue.
  useEffect(() => {
    if (!data) return;
    const once = (key: string, c: CueKey) => {
      if (playedEvents.current.has(key)) return;
      playedEvents.current.add(key);
      playCue(c);
    };
    const q = data.progress.index;
    const stage = data.presentation_stage;
    if (data.phase === "question" && data.status === "live") once(`question:${q}`, "transition");
    if (data.phase === "time_expired") once(`expired:${q}`, "lock");
    if (data.phase === "answer_reveal") once(`reveal:${q}`, "board");
    if (data.phase === "leaderboard") once(`board:${q}:${data.joined}`, "board");
    if (data.phase === "countdown" && startsIn !== null && startsIn <= 3 && startsIn > 0) {
      once(`countdown:${q}:${startsIn}`, "tick");
    }
    if (data.phase === "question" && remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= 5) {
      once(`final:${q}:${Math.ceil(remainingSeconds)}`, "tick");
    }
    if (stage === "suspense") once("reveal:suspense", "reveal");
    if (stage === "third") once("reveal:third", "podium-third");
    if (stage === "second") once("reveal:second", "podium-second");
    if (stage === "champion") once("reveal:champion", "podium-champion");
    if (stage === "board") once("reveal:board", "board");
  }, [data, playCue, remainingSeconds, startsIn]);

  async function enablePresentation() {
    unlockAudio();
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
          <AudioControls
            snapshot={audioSnapshot}
            onPreferences={updateAudioPreferences}
            onUnlock={unlockAudio}
            variant="screen"
          />
          <button onClick={enablePresentation} className="rounded-full bg-gold-500 px-4 py-2 text-sm font-bold text-evergreen-950 shadow hover:bg-gold-400">
            {audioSnapshot?.running ? "⛶ Fullscreen" : "▶ Sound & fullscreen"}
          </button>
        </div>
      </header>

      {audioSnapshot?.blocked && (
        <div className="relative z-20 flex justify-center bg-evergreen-900/80 px-4 py-2">
          <AudioEnableChip snapshot={audioSnapshot} onUnlock={unlockAudio} variant="screen" />
        </div>
      )}

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
          participants={participants}
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
  participants,
  busy,
  error,
  onCommand,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  state: ControlState;
  data: ScreenState;
  participants: ControlParticipant[];
  busy: LiveCommand | null;
  error: string | null;
  onCommand: (command: LiveCommand) => void;
}) {
  const [showPeople, setShowPeople] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (!open) return null;
  const connectedCount = participants.filter((p) => p.connected).length;
  const answeredCount = participants.filter((p) => p.answered).length;
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
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-semibold normal-case tracking-normal text-emerald-100">
              Participants connected: {connectedCount}/{participants.length}
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
          <CtrlButton
            onClick={() => onCommand(state.admission_open ? "close_join" : "open_join")}
            busy={busy === "open_join" || busy === "close_join"}
            disabled={state.ended}
            title="Stop or allow new participants. Everyone already in the room stays connected and keeps their answers; the competition is not paused."
          >
            {state.admission_open ? "Close joining" : "Open joining"}
          </CtrlButton>
          {state.phase === "answer_reveal" ? (
            <CtrlButton
              onClick={() => onCommand("hide_answer")}
              busy={busy === "hide_answer"}
              disabled={state.ended}
              title="Hide the correct answer again. Submitted answers are untouched."
            >
              🙈 Hide answer
            </CtrlButton>
          ) : (
            <CtrlButton
              onClick={() => onCommand("reveal_answer")}
              busy={busy === "reveal_answer"}
              disabled={state.status === "lobby" || state.ended || state.phase === "leaderboard"}
              title="Show the correct answer on the projected screen. Nobody's answer is submitted, changed or re-scored."
            >
              👁 Reveal answer
            </CtrlButton>
          )}
          <CtrlButton onClick={() => setShowPeople((open) => !open)} disabled={false} tone={showPeople ? "gold" : "default"}>
            👥 Participants ({participants.length})
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
            confirmEnd ? (
              <span className="flex flex-wrap items-center gap-1.5 rounded-lg border border-red-400/60 bg-red-500/15 px-2 py-1">
                <span className="text-xs font-bold text-red-100">
                  End now? Answers stay saved — no data is deleted.
                </span>
                <CtrlButton
                  onClick={() => {
                    setConfirmEnd(false);
                    onCommand("end");
                  }}
                  busy={busy === "end"}
                  tone="danger"
                >
                  Yes, end competition
                </CtrlButton>
                <CtrlButton onClick={() => setConfirmEnd(false)}>Cancel</CtrlButton>
              </span>
            ) : (
              <CtrlButton
                onClick={() => setConfirmEnd(true)}
                busy={busy === "end"}
                tone="danger"
                disabled={state.status === "lobby"}
                title="Close the competition now, lock answers and prepare the results reveal. Every submitted answer is preserved."
              >
                🏁 End competition
              </CtrlButton>
            )
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
      {showPeople && (
        <ParticipantPanel
          participants={participants}
          connectedCount={connectedCount}
          answeredCount={answeredCount}
          admissionOpen={state.admission_open}
          onClose={() => setShowPeople(false)}
        />
      )}
    </div>
  );
}

/**
 * Organizer-only roster. Names, avatars and connection state come from the
 * authorized control payload (never from the public projection), and the rows
 * refresh with the same poll as the toolbar — including who has just joined,
 * who dropped off and who has submitted for the question on screen.
 */
function ParticipantPanel({
  participants,
  connectedCount,
  answeredCount,
  admissionOpen,
  onClose,
}: {
  participants: ControlParticipant[];
  connectedCount: number;
  answeredCount: number;
  admissionOpen: boolean;
  onClose: () => void;
}) {
  return (
    <aside className="fixed bottom-24 right-3 top-3 z-40 flex w-[min(23rem,calc(100vw-1.5rem))] flex-col rounded-2xl border border-white/20 bg-evergreen-950/95 p-3 text-white shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold-300">Participants</p>
          <p className="mt-1 text-sm text-evergreen-100">
            Connected: {connectedCount}/{participants.length} · Answered this question: {answeredCount}
          </p>
          <p className="mt-0.5 text-xs text-evergreen-200">
            {admissionOpen ? "Joining is open to new participants." : "Joining is closed — existing participants remain."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/20 px-2.5 py-1 text-xs font-bold text-evergreen-100 hover:bg-white/10"
          aria-label="Close participant panel"
        >
          ✕
        </button>
      </div>
      <ul className="mt-3 flex-1 space-y-1.5 overflow-y-auto pr-1 scroll-slim">
        {participants.length === 0 && <li className="text-sm text-evergreen-200">Nobody has joined yet.</li>}
        {participants.map((p) => (
          <li
            key={p.participant_id}
            className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${
              p.status === "waiting" ? "border-amber-300/40 bg-amber-400/10" : "border-white/15 bg-white/[0.06]"
            }`}
          >
            <span className="relative">
              <ParticipantAvatar avatarKey={p.avatar_key} name={p.display_name} size={32} />
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-evergreen-950 ${p.connected ? "bg-emerald-400" : "bg-slate-400"}`}
                aria-label={p.connected ? "connected" : "disconnected"}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{p.display_name}</span>
              <span className="block text-[11px] text-evergreen-200">
                {p.connected ? "connected" : "disconnected"}
                {p.status === "waiting" ? " · awaiting approval" : ""}
                {p.reconnect_count > 0 ? ` · ${p.reconnect_count} reconnect(s)` : ""}
              </span>
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.answered ? "bg-emerald-500 text-emerald-950" : "bg-white/10 text-evergreen-100"}`}
            >
              {p.answered ? "answered" : "waiting"}
            </span>
          </li>
        ))}
      </ul>
    </aside>
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
