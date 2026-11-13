"use client";

import { Logo } from "@/components/Logo";
import { ParticipantAvatar } from "@/components/ParticipantAvatar";
import { RichContent } from "@/components/RichContent";
import { QuestionRunner, type PublicQuestion } from "@/components/QuestionRunner";
import { Badge, Button, Card, Field, Input } from "@/components/ui";
import { AVATARS, type AvatarKey } from "@/lib/avatars";
import type { RichDoc } from "@/lib/content";
import type { LiveFeatureControls } from "@/lib/liveFeatures";
import { createClient } from "@/lib/supabase/client";
import { mmss } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAssessmentLockdown } from "@/lib/useAssessmentLockdown";

interface SubmittedAnswer {
  submitted: true;
  answer: Record<string, unknown>;
  is_correct?: boolean | null;
  points_awarded?: number;
  response_ms?: number | null;
  submitted_at?: string;
  needs_marking?: boolean;
}

interface FinalRow {
  display_name: string;
  avatar_key: string;
  score: number;
  rank: number;
  is_me: boolean;
}

interface FinalBlock {
  stage: string;
  label: string;
  my_rank: number | null;
  my_score: number;
  my_entry: { display_name: string; avatar_key: string; score: number; rank: number } | null;
  revealed: number;
  total: number;
  podium: FinalRow[];
  full: FinalRow[] | null;
  away_from_board: number;
}

interface LiveState {
  server_now: string;
  session: {
    id: string;
    title: string;
    status: string;
    mode: string;
    phase: string;
    answer_locked?: boolean;
    presentation_stage?: string;
    question_started_at: string | null;
    question_deadline_at: string | null;
    time_per_question_seconds: number;
    /** Answer tools the organiser allows; absent (older server) = every tool. */
    live_features?: LiveFeatureControls;
  };
  progress: { index: number; total: number; remaining_after_current: number };
  question: PublicQuestion | null;
  my_answer: SubmittedAnswer | null;
  explanation: string | null;
  explanation_doc?: RichDoc | null;
  participant: { display_name: string; avatar_key: string; status: string; score: number; finished: boolean };
  participant_count: number;
  /** Presence only: names, avatars, connection state. Never answers or scores. */
  presence?: PresenceRoster | null;
  presence_heartbeat_ms?: number;
  /** Host-authorised audio switches for this room. */
  audio?: { enabled: boolean; volume: number; music_enabled?: boolean; sfx_enabled?: boolean; sound_effects?: boolean };
  leaderboard: { display_name: string; avatar_key: string; score: number; is_me: boolean }[] | null;
  my_rank: number | null;
  final?: FinalBlock | null;
  next_session?: { session_id: string; join_code: string } | null;
}

interface LocalSubmission extends SubmittedAnswer {
  quiz_question_id: string;
}

import { AudioControls, AudioEnableChip } from "@/components/AudioControls";
import { PresenceRail } from "@/components/PresenceRail";
import { useLiveAudio } from "@/lib/useLiveAudio";
import { trackForPhase } from "@/lib/liveMusic";
import type { PresenceRoster } from "@/lib/presence";

export function PlayClient({ code }: { code: string }) {
  const storeKey = `evalora-play-${code}`;
  const [identity, setIdentity] = useState<{ participant_id: string; access_token: string; session_id: string } | null>(null);
  const [name, setName] = useState("");
  const [refValue, setRefValue] = useState("");
  const [qualificationToken, setQualificationToken] = useState("");
  const [avatar, setAvatar] = useState<AvatarKey>("owl");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [state, setState] = useState<LiveState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [localSubmission, setLocalSubmission] = useState<LocalSubmission | null>(null);
  const [connection, setConnection] = useState<"connecting" | "online" | "reconnecting">("connecting");
  const [now, setNow] = useState(Date.now());
  // Once the participant has joined, the live question is an assessment surface:
  // copy, cut, paste and the context menu are cancelled and the text is not
  // selectable. Live quiz incidents are not recorded (there is no participant
  // incident table), so this is prevention only. The join screen stays open so
  // the participant can paste a code or name.
  useAssessmentLockdown(Boolean(identity));
  const offsetRef = useRef(0);

  // ── Audio ────────────────────────────────────────────────────────────
  // Participants stay silent by default: the room's soundtrack belongs to the
  // public screen, so a phone in the same room can never double the music. The
  // host can share it (music_enabled), and every listener can still choose
  // their own volumes or mute. Sound effects are per-device feedback.
  const audioServer = state?.audio ?? { enabled: true, volume: 0.6, music_enabled: false };
  const phaseTrack = useMemo(() => {
    if (!state || !audioServer.music_enabled) return null;
    const remaining = state.session.question_deadline_at
      ? Math.max(0, (new Date(state.session.question_deadline_at).getTime() - (now + offsetRef.current)) / 1000)
      : null;
    return trackForPhase(state.session.phase, {
      status: state.session.status,
      stage: state.session.presentation_stage,
      remaining: remaining === null ? null : remaining <= 0 ? 0 : remaining <= 5 ? 5 : Math.ceil(remaining / 10) * 10,
    });
  }, [audioServer.music_enabled, now, state]);
  const {
    snapshot: audioSnapshot,
    updatePreferences: updateAudioPreferences,
    unlock: unlockAudio,
    cue: playCue,
  } = useLiveAudio({
    role: "participant",
    sessionId: state?.session.id ?? `play-${code}`,
    server: audioServer,
    track: phaseTrack,
  });

  // Local, non-competitive feedback on the device that answered: a bright
  // arpeggio for a confirmed correct answer, a soft falling third for an
  // incorrect one, and a neutral confirmation when marking is pending. This is
  // a short musical cue, never a stamp or a buzzer.
  const playAnswerCue = (isCorrect?: boolean | null) => {
    if (isCorrect === true) playCue("correct");
    else if (isCorrect === false) playCue("incorrect");
    else playCue("lock");
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) setIdentity(JSON.parse(raw));
    } catch {
      // A corrupt local identity simply returns to the join form.
    }
  }, [storeKey]);

  const fetchState = useCallback(
    async (id = identity) => {
      if (!id) return;
      try {
        const res = await fetch(
          `/api/live/state?participant_id=${id.participant_id}&token=${id.access_token}`,
          { cache: "no-store" },
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          if (data?.removed) {
            setRemoved(true);
            setError(data.error);
          } else if (res.status === 404) {
            localStorage.removeItem(storeKey);
            setIdentity(null);
            setState(null);
            setError("That saved participant session is no longer available. Please join again.");
          }
          setConnection("reconnecting");
          return;
        }
        offsetRef.current = new Date(data.server_now).getTime() - Date.now();
        setState(data);
        setConnection("online");
      } catch {
        setConnection("reconnecting");
      }
    },
    [identity, storeKey],
  );

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    if (!identity) return;
    const poll = setInterval(() => fetchState(), 1500);
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
    if (joining) return;
    setJoining(true);
    setError(null);
    try {
      const res = await fetch("/api/live/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          display_name: name.trim(),
          participant_ref: refValue.trim() || undefined,
          qualification_token: qualificationToken.trim() || undefined,
          avatar_key: avatar,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Could not join.");
        return;
      }
      const id = {
        participant_id: data.participant_id,
        access_token: data.access_token,
        session_id: data.session_id,
      };
      localStorage.setItem(storeKey, JSON.stringify(id));
      setIdentity(id);
      void fetchState(id);
    } catch {
      setError("Connection problem. Check the network and try again — you have not joined yet.");
    } finally {
      setJoining(false);
    }
  }

  async function postAnswer(payload: Record<string, unknown>) {
    if (!identity || !state?.question) throw new Error("No active question");
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
    return { res, data };
  }

  async function answer(payload: Record<string, unknown>) {
    if (!identity || !state?.question || submitting || submittedForCurrent) return;
    if (state.session.answer_locked) {
      setSubmitMessage("The organizer has locked answers for this question.");
      return;
    }
    setSubmitting(true);
    setSubmitMessage("Sending your answer…");
    const quizQuestionId = state.question.quiz_question_id;
    try {
      let result = await postAnswer(payload);
      if (!result.res.ok && result.res.status >= 500) {
        setSubmitMessage("Connection hiccup — safely retrying the same answer…");
        await new Promise((resolve) => setTimeout(resolve, 800));
        result = await postAnswer(payload);
      }
      if (!result.res.ok) {
        setSubmitMessage(result.data?.error ?? "Your answer could not be submitted. It has not been recorded.");
        void fetchState();
        return;
      }
      setLocalSubmission({
        quiz_question_id: quizQuestionId,
        submitted: true,
        answer: payload,
        is_correct: result.data?.is_correct,
        points_awarded: result.data?.points_awarded,
        response_ms: result.data?.response_ms,
        needs_marking: result.data?.needs_marking,
      });
      setSubmitMessage("Answer recorded ✓");
      playAnswerCue(result.data?.is_correct);
      void fetchState();
    } catch {
      // One idempotent retry: the unique participant/question row means
      // a request that reached the server cannot create a duplicate.
      try {
        setSubmitMessage("Connection dropped — safely retrying the same answer…");
        await new Promise((resolve) => setTimeout(resolve, 900));
        const retry = await postAnswer(payload);
        if (retry.res.ok) {
          setLocalSubmission({ quiz_question_id: quizQuestionId, submitted: true, answer: payload, response_ms: retry.data?.response_ms });
          setSubmitMessage("Answer recorded ✓");
          playAnswerCue(retry.data?.is_correct);
          void fetchState();
        } else {
          setSubmitMessage(retry.data?.error ?? "Still offline. Your selected answer is still shown; tap it again when reconnected.");
        }
      } catch {
        setSubmitMessage("Still offline. Your selected answer is still shown; tap it again when reconnected.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (removed) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">Session notice</h1>
        <p className="mt-2 text-ink-soft">{error ?? "You are no longer in this session."}</p>
      </Shell>
    );
  }

  if (!identity) {
    const selectedAvatar = AVATARS.find((a) => a.key === avatar) ?? AVATARS[0];
    return (
      <Shell wide>
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-evergreen-700">Student answer screen</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-evergreen-950">Join session {code}</h1>
          <p className="mt-1 text-sm text-ink-soft">Choose your name and avatar. They will stay with you on rankings and the podium.</p>
        </div>

        <form onSubmit={join} className="mt-6 space-y-5">
          {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

          <div className="flex items-center gap-4 rounded-2xl bg-cream p-4">
            <ParticipantAvatar avatarKey={avatar} name={name || "Participant"} size={72} />
            <div>
              <p className="font-display text-xl font-semibold text-evergreen-950">{name.trim() || "Your name"}</p>
              <p className="text-sm font-medium text-evergreen-700">{selectedAvatar.name}</p>
              <p className="text-sm text-ink-soft">{selectedAvatar.description}</p>
            </div>
          </div>

          <Field label="Display name">
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marie Dubois" autoFocus autoComplete="name" />
          </Field>
          <Field label="Class / reference (optional)">
            <Input value={refValue} onChange={(e) => setRefValue(e.target.value)} placeholder="e.g. Grade 7B" />
          </Field>
          <Field label="Qualification admission token (required for Semi-Final / Grand Final)" hint="If you qualified, paste the one-time token issued by the organizer. It is verified on the server on every request.">
            <Input value={qualificationToken} onChange={(e) => setQualificationToken(e.target.value)} placeholder="One-time approved qualification token" autoComplete="off" />
          </Field>

          <fieldset>
            <legend className="text-sm font-semibold text-evergreen-950">Choose your avatar</legend>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {AVATARS.map((item) => {
                const selected = avatar === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setAvatar(item.key)}
                    aria-pressed={selected}
                    className={`rounded-2xl border-2 p-2 text-center transition ${selected ? "border-evergreen-700 bg-evergreen-50 shadow" : "border-evergreen-900/10 bg-white hover:border-evergreen-500"}`}
                  >
                    <ParticipantAvatar avatarKey={item.key} size={52} className="mx-auto" />
                    <span className="mt-1 block truncate text-[11px] font-semibold text-ink">{item.name.split(" ").at(-1)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Button type="submit" variant="gold" disabled={joining} className="w-full py-3.5 text-base">
            {joining ? "Joining…" : "Enter the waiting room"}
          </Button>
        </form>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell>
        <p className="text-center text-ink-soft">{connection === "reconnecting" ? "Reconnecting to your session…" : "Connecting to the session…"}</p>
      </Shell>
    );
  }

  const { session, progress, question, participant } = state;
  const submittedForCurrent =
    state.my_answer ??
    (localSubmission?.quiz_question_id === question?.quiz_question_id ? localSubmission : null);
  const serverNow = now + offsetRef.current;
  const startsAt = session.question_started_at ? new Date(session.question_started_at).getTime() : null;
  const deadlineAt = session.question_deadline_at
    ? new Date(session.question_deadline_at).getTime()
    : startsAt
      ? startsAt + session.time_per_question_seconds * 1000
      : null;
  const startsIn = startsAt && serverNow < startsAt ? Math.ceil((startsAt - serverNow) / 1000) : null;
  const remaining = session.mode === "synchronized" && deadlineAt ? Math.max(0, (deadlineAt - serverNow) / 1000) : null;
  const progressPercent = progress.total
    ? Math.min(100, ((Math.max(progress.index, 0) + (session.status === "ended" ? 1 : 0)) / progress.total) * 100)
    : 0;

  return (
    <Shell wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ParticipantAvatar avatarKey={participant.avatar_key} name={participant.display_name} size={54} />
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-semibold text-evergreen-950 sm:text-2xl">{session.title}</h1>
            <p className="text-sm text-ink-soft">
              {participant.display_name} · {state.participant_count} participant(s)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PresenceRail
            roster={state.presence ?? null}
            variant="live"
            title="Participants"
            error={connection === "reconnecting" ? "Reconnecting — the list updates itself." : null}
          />
          <AudioControls
            snapshot={audioSnapshot}
            onPreferences={updateAudioPreferences}
            onUnlock={unlockAudio}
            variant="participant"
          />
          {audioSnapshot?.blocked && audioSnapshot.ownsMusic && (
            <AudioEnableChip snapshot={audioSnapshot} onUnlock={unlockAudio} variant="participant" />
          )}
          {remaining !== null && session.status === "live" && session.phase === "question" && (
            <Badge tone={remaining <= 5 ? "red" : "gold"} className="px-3 py-1 text-base font-bold tabular-nums">
              {mmss(Math.ceil(remaining))}
            </Badge>
          )}
          <Badge tone="green" className="px-3 py-1 text-base font-bold">{participant.score} pts</Badge>
          {state.my_rank && !state.final && <Badge tone="gray" className="px-3 py-1 text-base">#{state.my_rank}</Badge>}
          {session.answer_locked && session.status !== "ended" && (
            <Badge tone="red" className="px-3 py-1 text-base">🔒 Answers locked</Badge>
          )}
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between text-xs font-medium text-ink-soft">
        <span>
          {progress.total && progress.index >= 0 ? `Question ${Math.min(progress.index + 1, progress.total)} of ${progress.total}` : "Waiting room"}
          {progress.total ? ` · ${progress.remaining_after_current} remaining after this` : ""}
        </span>
        <span className={connection === "online" ? "text-emerald-700" : "text-amber-700"}>
          ● {connection === "online" ? "Connected" : "Reconnecting…"}
        </span>
      </div>
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-evergreen-100">
        <div className="h-full bg-evergreen-700 transition-all" style={{ width: `${progressPercent}%` }} />
      </div>

      {participant.status === "pending" ? (
        <CenterState
          icon="⏳"
          title="Waiting for organizer approval"
          body="Your name and avatar are in the organizer's private monitor. Keep this page open — you will enter automatically when approved."
        />
      ) : session.status === "lobby" ? (
        <div className="py-8 text-center">
          <ParticipantAvatar avatarKey={participant.avatar_key} name={participant.display_name} size={92} className="mx-auto" />
          <h2 className="mt-4 font-display text-3xl font-semibold text-evergreen-950">You&apos;re in, {participant.display_name}!</h2>
          <p className="mt-2 text-ink-soft">Waiting for the organizer to start. Keep this device open and ready.</p>
        </div>
      ) : session.status === "paused" ? (
        <CenterState icon="⏸️" title="Paused by the organizer" body={submittedForCurrent ? "Your current answer is safely recorded. The competition will continue shortly." : "The competition will continue shortly. Stay on this page."} />
      ) : state.next_session ? (
        <NextRoundCard joinCode={state.next_session.join_code} />
      ) : state.final ? (
        <FinalResult final={state.final} />
      ) : session.status === "ended" && session.presentation_stage === "final_pending" ? (
        <CenterState
          icon="🎬"
          title="Final results are locked"
          body="Your answers and scores are saved. The organizer will reveal the podium here in a moment — stay on this page."
        />
      ) : session.phase === "countdown" ? (
        <div className="py-10 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-evergreen-700">Get ready</p>
          <p className="mt-3 font-display text-8xl font-extrabold tabular-nums text-evergreen-800">{startsIn ?? "…"}</p>
          <p className="mt-3 text-ink-soft">Question {progress.index + 1} is about to appear on every screen.</p>
        </div>
      ) : ["leaderboard", "podium"].includes(session.phase) && session.status !== "ended" ? (
        <Leaderboard state={state} title={session.phase === "podium" ? "Final podium" : "Current rankings"} />
      ) : session.status === "live" && session.phase === "answer_reveal" && question ? (
        <AnswerReveal state={state} submitted={submittedForCurrent} />
      ) : session.status === "live" && question && !submittedForCurrent ? (
        <div>
          <p className="mb-3 text-sm font-medium text-ink-soft">
            Question {progress.index + 1} of {progress.total} · {question.points} point(s)
          </p>
          {session.answer_locked && (
            <p className="mb-3 rounded-xl bg-amber-100 px-4 py-2.5 text-sm font-semibold text-amber-950">
              🔒 The organizer has locked answers. You can still read the question — nothing you already submitted is lost.
            </p>
          )}
          <QuestionRunner
            key={question.quiz_question_id}
            question={question}
            onAnswer={answer}
            disabled={submitting || Boolean(session.answer_locked) || session.phase === "time_expired" || (remaining !== null && remaining <= 0)}
            liveFeatures={session.live_features}
          />
          {submitMessage && <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{submitMessage}</p>}
          {(session.phase === "time_expired" || (remaining !== null && remaining <= 0)) && (
            <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">Time is up — answers are locked while the organizer decides what to show next.</p>
          )}
        </div>
      ) : session.status === "live" && submittedForCurrent ? (
        <div className="py-6 text-center">
          <p className="text-5xl">✅</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-evergreen-950">Answer recorded</h2>
          <p className="mt-2 text-ink-soft">Your response is safely saved on the server. It cannot be submitted twice.</p>
          <SubmittedAnswerSummary question={question} submitted={submittedForCurrent} />
          {submittedForCurrent.is_correct !== undefined && session.mode === "self_paced" && (
            <p className="mt-3 font-semibold text-evergreen-800">
              {submittedForCurrent.is_correct ? `Correct! +${submittedForCurrent.points_awarded ?? 0} points` : submittedForCurrent.is_correct === false ? "Not quite this time." : "Submitted for marking."}
            </p>
          )}
          <p className="mt-4 text-ink-soft">Waiting for the organizer to reveal the answer or release the next question…</p>
        </div>
      ) : session.status === "live" && !participant.finished ? (
        <CenterState icon="👀" title="Waiting for the next screen" body="The organizer is preparing the next question or presentation." />
      ) : null}

      {(session.status === "ended" || participant.finished) &&
        participant.status !== "pending" &&
        !state.final &&
        !state.next_session && (
        <div className="py-4 text-center">
          <ParticipantAvatar avatarKey={participant.avatar_key} name={participant.display_name} size={84} className="mx-auto" />
          <h2 className="mt-4 font-display text-3xl font-semibold text-evergreen-950">
            {participant.finished && session.status !== "ended" ? "You finished!" : "Competition complete"}
          </h2>
          <p className="mt-2 text-lg text-ink">
            Your score: <strong className="text-evergreen-800">{participant.score} points</strong>
            {state.my_rank ? <> · Rank <strong>#{state.my_rank}</strong></> : null}
          </p>
          {state.leaderboard ? (
            <Leaderboard state={state} title={session.phase === "podium" ? "Final podium" : "Final rankings"} />
          ) : (
            <p className="mt-4 text-sm text-ink-soft">The organizer has not released the final rankings on this screen.</p>
          )}
        </div>
      )}
    </Shell>
  );
}

function CenterState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-5xl">{icon}</p>
      <h2 className="mt-3 font-display text-2xl font-semibold text-evergreen-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-ink-soft">{body}</p>
    </div>
  );
}

function AnswerReveal({ state, submitted }: { state: LiveState; submitted: SubmittedAnswer | LocalSubmission | null }) {
  const question = state.question!;
  const correctIds = new Set(question.reveal?.correct_option_ids ?? []);
  return (
    <div>
      <div className="rounded-2xl bg-evergreen-950 px-5 py-4 text-center text-white">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-300">Answer reveal</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">
          {submitted?.is_correct === true
            ? `Correct! +${submitted.points_awarded ?? 0} points`
            : submitted?.is_correct === false
              ? "Not quite this time"
              : submitted
                ? "Your answer was recorded"
                : "Here is the correct answer"}
        </h2>
      </div>

      <div className="mt-5 text-lg font-medium text-ink">
        <RichContent doc={question.prompt_doc ?? null} text={question.prompt} />
      </div>

      {question.options.length > 0 && (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {question.options.map((o, i) => {
            const correct = correctIds.has(o.id);
            const mine = submitted?.answer.option_id === o.id || (submitted?.answer.option_ids as string[] | undefined)?.includes(o.id);
            return (
              <div key={o.id} className={`flex items-start gap-3 rounded-xl border-2 px-4 py-3.5 ${correct ? "border-emerald-600 bg-emerald-50" : mine ? "border-red-400 bg-red-50" : "border-evergreen-900/15 bg-white"}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${correct ? "bg-emerald-600 text-white" : "bg-gold-400 text-evergreen-950"}`}>{String.fromCharCode(65 + i)}</span>
                <span className="min-w-0 flex-1"><RichContent doc={o.content_doc ?? null} text={o.label} /></span>
                {correct && <span aria-label="Correct answer">✅</span>}
                {mine && !correct && <span className="text-xs font-bold text-red-700">Your answer</span>}
              </div>
            );
          })}
        </div>
      )}

      {question.options.length === 0 && question.reveal?.summary?.length ? (
        <div className="mt-4 rounded-2xl bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-950">Correct answer</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-emerald-950">
            {question.reveal.summary.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      ) : null}

      <SubmittedAnswerSummary question={question} submitted={submitted} />
      {(state.explanation || question.explanation) && (
        <div className="mt-4 rounded-2xl bg-evergreen-50 p-4 text-left text-sm text-evergreen-950">
          <p className="mb-1 font-bold">Explanation</p>
          <RichContent doc={state.explanation_doc ?? question.explanation_doc ?? null} text={state.explanation ?? question.explanation ?? ""} />
        </div>
      )}
      <p className="mt-4 text-center text-sm text-ink-soft">Waiting for the organizer…</p>
    </div>
  );
}

function SubmittedAnswerSummary({
  question,
  submitted,
}: {
  question: PublicQuestion | null;
  submitted: SubmittedAnswer | LocalSubmission | null;
}) {
  if (!submitted) return null;
  const answer = submitted.answer;
  const optionLabel = (id: unknown) => {
    const idx = question?.options.findIndex((o) => o.id === id) ?? -1;
    const option = idx >= 0 ? question?.options[idx] : null;
    return option ? `${String.fromCharCode(65 + idx)}. ${option.label}` : "Selected option";
  };
  let summary = "Your submitted answer is saved.";
  if (typeof answer.option_id === "string") summary = `Your answer: ${optionLabel(answer.option_id)}`;
  else if (Array.isArray(answer.option_ids)) summary = `Your answers: ${answer.option_ids.map(optionLabel).join("; ")}`;
  else if (typeof answer.text === "string" && answer.text) summary = `Your answer: ${answer.text}`;
  else if (answer.value !== undefined) summary = `Your answer: ${String(answer.value)}`;
  else if (Array.isArray(answer.order)) summary = `Your order: ${answer.order.join(" → ")}`;
  else if (Array.isArray(answer.pairs)) summary = `You submitted ${answer.pairs.length} matching pair(s).`;
  else if (answer.acknowledged) summary = "You confirmed this slide.";

  return <p className="mx-auto mt-4 max-w-lg rounded-xl bg-cream px-4 py-3 text-sm font-medium text-ink">{summary}</p>;
}

function Leaderboard({ state, title }: { state: LiveState; title: string }) {
  if (!state.leaderboard) {
    return <CenterState icon="🏆" title={title} body="Rankings are being prepared by the organizer." />;
  }
  return (
    <div className="mx-auto mt-2 max-w-lg">
      <h2 className="text-center font-display text-2xl font-semibold text-evergreen-950">{title}</h2>
      <ol className="mt-4 space-y-2">
        {state.leaderboard.map((p, i) => (
          <li key={`${p.display_name}-${i}`} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${p.is_me ? "border-gold-500 bg-gold-50" : "border-evergreen-900/10 bg-white"}`}>
            <span className="w-7 font-display text-xl font-bold text-evergreen-800">{i + 1}</span>
            <ParticipantAvatar avatarKey={p.avatar_key} name={p.display_name} size={42} />
            <span className="min-w-0 flex-1 truncate font-medium">{p.display_name}{p.is_me ? " (you)" : ""}</span>
            <strong className="tabular-nums">{p.score}</strong>
          </li>
        ))}
      </ol>
      {state.my_rank && <p className="mt-3 text-center text-sm text-ink-soft">Your rank: #{state.my_rank}</p>}
    </div>
  );
}

/**
 * The participant's own final result plus the podium the organizer has
 * already revealed. The server sends only the revealed places, so a
 * participant cannot learn the champion before the projector does.
 */
function FinalResult({ final }: { final: FinalBlock }) {
  const mine = final.my_entry;
  const rankLabel = (rank: number) => {
    const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][rank % 10] ?? "th";
    return `${rank}${suffix}`;
  };
  const pendingPlaces = Math.max(0, Math.min(3, final.total) - final.revealed);
  return (
    <div className="py-2">
      <div className="rounded-2xl bg-evergreen-950 px-5 py-5 text-center text-white">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-gold-300">Your final result</p>
        {mine ? (
          <>
            <ParticipantAvatar avatarKey={mine.avatar_key} name={mine.display_name} size={86} className="mx-auto mt-3" />
            <h2 className="mt-3 font-display text-2xl font-semibold">{mine.display_name}</h2>
            <p className="mt-2 font-display text-5xl font-extrabold text-gold-300">{rankLabel(mine.rank)}</p>
            <p className="mt-1 text-lg text-evergreen-100">place of {final.total}</p>
            <p className="mt-3 text-2xl font-bold tabular-nums">{mine.score} points</p>
          </>
        ) : (
          <>
            <p className="mt-3 font-display text-2xl font-semibold">Final position not available</p>
            <p className="mt-2 text-evergreen-100">Your score: {final.my_score} points</p>
          </>
        )}
      </div>

      <div className="mt-5">
        <h3 className="text-center font-display text-xl font-semibold text-evergreen-950">Podium</h3>
        {final.podium.length ? (
          <ol className="mt-3 space-y-2">
            {[...final.podium]
              .sort((a, b) => a.rank - b.rank)
              .map((row) => (
                <li
                  key={`${row.rank}-${row.display_name}`}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${row.rank === 1 ? "border-gold-500 bg-gold-50" : "border-evergreen-900/10 bg-white"} ${row.is_me ? "ring-2 ring-evergreen-700" : ""}`}
                >
                  <span className="w-8 text-xl">{row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}</span>
                  <ParticipantAvatar avatarKey={row.avatar_key} name={row.display_name} size={38} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {row.display_name}
                    {row.is_me ? " (you)" : ""}
                  </span>
                  <strong className="tabular-nums">{row.score}</strong>
                </li>
              ))}
          </ol>
        ) : (
          <p className="mt-3 text-center text-sm text-ink-soft">The organizer is building the suspense — the podium appears here as each place is announced.</p>
        )}
        {pendingPlaces > 0 && final.stage !== "board" && (
          <p className="mt-3 text-center text-sm text-ink-soft">{pendingPlaces} podium place(s) still to be announced.</p>
        )}
      </div>

      {final.full ? (
        <div className="mt-5">
          <h3 className="text-center font-display text-xl font-semibold text-evergreen-950">Full final leaderboard</h3>
          <ol className="mt-3 space-y-1.5">
            {final.full.map((row) => (
              <li
                key={`full-${row.rank}-${row.display_name}`}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${row.is_me ? "bg-evergreen-50 font-semibold" : "bg-cream"}`}
              >
                <span className="w-7 font-bold text-evergreen-800">{row.rank}</span>
                <span className="min-w-0 flex-1 truncate">{row.display_name}{row.is_me ? " (you)" : ""}</span>
                <strong className="tabular-nums">{row.score}</strong>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        final.away_from_board > 0 && (
          <p className="mt-4 text-center text-sm text-ink-soft">
            The full leaderboard with all {final.total} participants appears when the organizer shows it.
          </p>
        )
      )}
    </div>
  );
}

function NextRoundCard({ joinCode }: { joinCode: string }) {
  return (
    <div className="py-8 text-center">
      <p className="text-5xl">🎉</p>
      <h2 className="mt-3 font-display text-3xl font-semibold text-evergreen-950">This round is complete</h2>
      <p className="mt-2 text-ink-soft">Your result is saved. The organizer has opened a fresh waiting room for the next competition.</p>
      <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-evergreen-700">New competition code</p>
      <p className="mt-1 font-display text-5xl font-extrabold tracking-[0.16em] text-evergreen-900">{joinCode}</p>
      <a
        href={`/play/${joinCode}`}
        className="mt-5 inline-flex rounded-xl bg-evergreen-800 px-6 py-3 font-semibold text-white hover:bg-evergreen-700"
      >
        Join the next round
      </a>
    </div>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-cream px-3 py-6 sm:px-4 sm:py-8">
      <Logo className="mb-5" />
      <Card className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} p-5 sm:p-8`}>{children}</Card>
      <p className="mt-5 text-center text-xs text-ink-soft">Fair play guaranteed — timing &amp; scoring run on the server.</p>
    </div>
  );
}
