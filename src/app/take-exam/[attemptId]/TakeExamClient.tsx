"use client";

import { ExamCountdown } from "@/components/exam/ExamCountdown";
import { Logo } from "@/components/Logo";
import { ExamCorrige } from "@/components/ExamCorrige";
import { IntegrityMonitor } from "@/lib/integrityMonitor";
import { useProtectedSurface } from "@/lib/useAssessmentLockdown";
import { parseIntegrityPolicy, type IntegrityPolicy, type IntegrityWarning } from "@/lib/integrity";
import { QuestionRunner, type PublicQuestion } from "@/components/QuestionRunner";
import { answerKeyLine, optionMarkings, resultLabel } from "@/lib/examResults";
import { questionFeedback, resultSummary } from "@/lib/examFeedback";
import { RichContent } from "@/components/RichContent";
import type { RichDoc } from "@/lib/content";
import {
  ExamSaveQueue,
  createDurableExamQueueStorage,
  createQueueIdempotencyKey,
  type ExamQueueState,
} from "@/lib/examSaveQueue";
import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import "@livekit/components-styles";
import { LiveKitRoom, VideoTrack, useConnectionState, useLocalParticipant, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Flag, ShieldAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExamMessenger } from "./ExamMessenger";
import { RetakePanel } from "./RetakePanel";
import { HintPanel, type CandidateHint } from "./HintPanel";
import { PresenceRail } from "@/components/PresenceRail";
import { answerStateFor } from "@/lib/hintAttention";
import { PRESENCE_HEARTBEAT_MS, PRESENCE_REFRESH_MS, type PresenceRoster } from "@/lib/presence";

interface ExamState {
  server_now: string;
  exam: { id: string; title: string; description: string | null; instructions: string | null; proctoring: boolean; require_screen_share: boolean; pass_mark_percent: number; integrity?: IntegrityPolicy | null };
  candidate: { name: string; ref: string | null; first_name?: string | null; last_name?: string | null; class_id?: string | null };
  attempt: { id: string; status: string; attempt_number?: number; previous_attempt_id?: string | null; deadline: string; flagged: string[]; score: number | null; max_score: number | null; results_published: boolean; track?: "AB" | "BC" | null; paused?: boolean; pause_reasons?: ("assessment" | "student" | "connection")[]; paused_at?: string | null; pause_notice?: "assessment" | "student" | null };
  hint_usage?: { question_id: string; part_id: string; level: number; times_opened: number }[];
  questions: (PublicQuestion & {
    /** Published pedagogical guidance, delivered with the paper. Never an answer. */
    hints?: CandidateHint[] | null;
    saved_answer: Record<string, unknown> | null;
    topic?: string | null;
    criterion?: string | null;
    strand?: string | null;
    result: {
      is_correct: boolean | null;
      points_awarded: number | null;
      answered?: boolean;
      selected_option_ids?: string[];
      correct_option_ids?: string[];
      explanation: string | null;
      explanation_doc?: RichDoc | null;
    } | null;
    reveal?: { correct_option_ids: string[]; summary: string[]; marking_criteria?: string | null; next_time_hint?: string | null } | null;
  })[];
}

function LocalCamera() {
  const tracks = useTracks([Track.Source.Camera]);
  const local = tracks.find((t) => t.participant.isLocal);
  if (!local) return <div className="flex h-28 items-center justify-center rounded-xl bg-evergreen-950 text-xs text-white">Starting camera…</div>;
  return (
    <div className="overflow-hidden rounded-xl border-2 border-gold-500">
      <VideoTrack trackRef={local} className="h-28 w-full object-cover" />
    </div>
  );
}

function ScreenShareButton() {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function toggle() {
    setBusy(true);
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
      setErr(null);
    } catch {
      setErr("Screen sharing could not be changed. Contact your invigilator if it is required.");
    } finally { setBusy(false); }
  }
  return (
    <div>
      <Button variant="outline" className="w-full text-xs" disabled={busy} onClick={toggle}>
        {isScreenShareEnabled ? "Stop sharing screen" : "Share my screen"}
      </Button>
      {err && <p role="alert" className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
}

function CandidateVideoStatus({ onRetry, mediaError }: { onRetry: () => void; mediaError: string | null }) {
  const connection = useConnectionState();
  const { isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant();
  const connected = connection === "connected";
  const status = connected ? "Video room connected" : connection === "reconnecting" || connection === "signalReconnecting"
    ? "Video room reconnecting" : connection === "connecting" ? "Connecting to video room" : "Video room disconnected";
  return <div className="space-y-2" aria-live="polite">
    <p className="text-xs font-semibold text-evergreen-900">{status}</p>
    {connected && <p className="text-xs text-ink-soft">Camera {isCameraEnabled ? "enabled" : "not enabled"} · Microphone {isMicrophoneEnabled ? "enabled" : "not enabled"} on this device.</p>}
    {mediaError && <p role="alert" className="text-xs text-red-700">{mediaError}</p>}
    {(connection === "disconnected" || mediaError) && <Button variant="outline" className="w-full text-xs" onClick={onRetry}>Retry video connection</Button>}
    <LocalCamera />
  </div>;
}

/** Glyph, colour and label for one question in the post-submission navigator. */
function resultMark(result: { is_correct: boolean | null; answered?: boolean }) {
  if (result.answered === false) return { glyph: "–", tone: "bg-ink/50", label: "not answered, 0 marks" };
  if (result.is_correct === true) return { glyph: "✓", tone: "bg-evergreen-600", label: "correct" };
  if (result.is_correct === false) return { glyph: "✗", tone: "bg-red-600", label: "incorrect" };
  return { glyph: "…", tone: "bg-amber-500", label: "awaiting manual marking" };
}

/**
 * Colour for a result panel. A blank question is neutral, not a failure: it is
 * simply worth zero marks and its worked solution is still worth reading.
 */
function resultTone(result: { is_correct: boolean | null; answered?: boolean }): string {
  if (result.answered === false) return "border border-evergreen-900/15 bg-white text-ink";
  if (result.is_correct === true) return "bg-evergreen-50 text-evergreen-900";
  if (result.is_correct === false) return "bg-red-50 text-red-900";
  return "bg-amber-50 text-amber-900";
}

export function TakeExamClient({ attemptId }: { attemptId: string }) {
  const [token, setToken] = useState<string | null>(null);
  // Participant rail: presence only. It is fetched on its own slow cadence and
  // can never touch an answer, a deadline or the save queue.
  const [presence, setPresence] = useState<PresenceRoster | null>(null);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const presenceBusy = useRef(false);
  // Roster/heartbeat loops must be harmless in a non-browser environment (the
  // React test renderer mounts this component without a `document`).
  const pageHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
  const presenceMeta = useRef({ current_question: 1, total_questions: 1, saved_count: 0, pending_saves: 0 });
  /*
   * Individual connection-pause state. The browser only ever CLAIMS an outage
   * window; the server validates it against its own clock and the last
   * confirmed heartbeat, and credits the pause through the attempt's
   * extension (see /api/exam/presence). One student's outage never touches
   * another student's timer: everything here is keyed to this attempt.
   */
  const [connState, setConnState] = useState<"online" | "lost" | "restored">("online");
  const [pauseNotice, setPauseNotice] = useState<string | null>(null);
  /*
   * Manual organizer pause (assessment-wide or individual). The server owns
   * this state: /api/exam/state delivers it with the paper and every
   * heartbeat echoes it, so a pause or resume reaches this screen within one
   * heartbeat WITHOUT a refresh. While paused the countdown freezes, answers
   * cannot be saved (the server refuses them), and everything already saved
   * is preserved.
   */
  const [manualPause, setManualPause] = useState<{ paused: boolean; notice: "assessment" | "student" | null }>({ paused: false, notice: null });
  const manualPauseRef = useRef(manualPause);
  manualPauseRef.current = manualPause;
  const outageRef = useRef<{ fails: number; lostAt: number | null; hiddenMs: number; toReport: { lost_at: string; hidden_ms: number } | null }>({ fails: 0, lostAt: null, hiddenMs: 0, toReport: null });
  const connStateRef = useRef(connState);
  connStateRef.current = connState;
  const [state, setState] = useState<ExamState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [queueState, setQueueState] = useState<ExamQueueState>({ pending: 0, syncing: false, error: null, durable: true });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const queueRef = useRef<ExamSaveQueue | null>(null);
  const submitIdempotencyRef = useRef<string | null>(null);
  const hasLoadedStateRef = useRef(false);
  const lastPresenceSentAtRef = useRef(0);
  const activeRef = useRef(false);
  const dirtyRef = useRef(false);
  const [answerDirty, setAnswerDirtyState] = useState(false);
  const [draftWarning, setDraftWarning] = useState(false);
  const [runnerVersion, setRunnerVersion] = useState(0);
  const setAnswerDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    setAnswerDirtyState(dirty);
    if (!dirty) setDraftWarning(false);
  }, []);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  // One-page corrigé: every question of the paper, answered or left blank.
  const [corrigeAll, setCorrigeAll] = useState(false);
  // Integrity: the browser reports what it can observe (tab hidden, focus lost,
  // full-screen exit, clipboard use); the server records it and owns the count.
  const [warning, setWarning] = useState<IntegrityWarning | null>(null);
  const monitorRef = useRef<IntegrityMonitor | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const lastBeepAt = useRef(0);
  const attemptStatus = state?.attempt.status ?? "in_progress";
  const attemptActive = attemptStatus === "in_progress";
  const activePolicy = useMemo(() => parseIntegrityPolicy(state?.exam.integrity), [state?.exam.integrity]);
  const [lk, setLk] = useState<{ token: string; serverUrl: string } | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [videoRetry, setVideoRetry] = useState(0);
  const retryVideo = useCallback(() => {
    setLk(null); setVideoError(null); setMediaError(null); setVideoRetry((n) => n + 1);
  }, []);
  const offset = useRef(0);

  // A single short tone, created only after the candidate has interacted with
  // the page (browser autoplay rules) and never allowed to break the paper.
  const beep = useCallback(() => {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audioRef.current ??= new Ctor();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.4);
    } catch {
      // Audio is a courtesy, never a requirement.
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`evalora-attempt-${attemptId}`);
      if (raw) setToken(JSON.parse(raw).token);
      else setError("We couldn't verify this session. Please go through the examination entry page again.");
    } catch {
      setError("We couldn't verify this session.");
    }
  }, [attemptId]);

  // The shared integrity monitor: the same class a quiz can use, given this
  // attempt's token as its transport. It stops the moment the paper is
  // submitted, so nothing is reported after the attempt is closed.
  useEffect(() => {
    // The monitor also carries the clipboard and context-menu lockdown, which
    // follows the clipboard switch even when integrity recording is off.
    if (!token || attemptStatus !== "in_progress" || (!activePolicy.enabled && !activePolicy.clipboard)) return;
    // Effects do not run on the server, but the paper is also rendered in
    // environments without a DOM (print preview, embedded viewers). Never let
    // the monitor be the reason a candidate cannot sit the examination.
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const monitor = new IntegrityMonitor(
      { document, window, now: () => Date.now() },
      activePolicy,
      async (event, detail) => {
        try {
          const response = await fetch("/api/exam/integrity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attempt_id: attemptId, token, event, detail }),
            keepalive: true,
          });
          if (!response.ok) return null;
          const data = await response.json().catch(() => null);
          return data && typeof data.count === "number" ? { count: data.count } : null;
        } catch {
          return null;
        }
      },
      (next) => {
        setWarning(next);
        if (activePolicy.sound && Date.now() - lastBeepAt.current > 1000) {
          lastBeepAt.current = Date.now();
          beep();
        }
      },
    );
    monitor.start();
    monitorRef.current = monitor;
    return () => {
      monitor.stop();
      monitorRef.current = null;
    };
  }, [token, attemptId, attemptStatus, activePolicy, beep]);

  // While the paper is open for answering, the page is a protected surface: no
  // text selection, no image dragging, and the clipboard and context menu are
  // cancelled (the monitor above does the cancelling and the recording). When the
  // attempt closes, the flag drops and the browser behaves normally again.
  useProtectedSurface(Boolean(token) && attemptStatus === "in_progress" && activePolicy.clipboard);

  const ensureQueue = useCallback((currentToken: string) => {
    if (queueRef.current) return queueRef.current;
    // Durable local queue: sessionStorage primary + localStorage backup when available,
    // so queued answers survive both refreshes and accidental tab closures during outages.
    // No attempt token is ever stored in the recovery queue.
    const sessionStore = {
      getItem: (key: string) => sessionStorage.getItem(key),
      setItem: (key: string, value: string) => sessionStorage.setItem(key, value),
      removeItem: (key: string) => sessionStorage.removeItem(key),
    };
    const storage = createDurableExamQueueStorage(
      sessionStore,
      typeof localStorage !== "undefined" ? localStorage : undefined,
    );
    queueRef.current = new ExamSaveQueue(storage, `evalora-exam-pending-${attemptId}`, async (entry) => {
      let response: Response;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        response = await fetch("/api/exam/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attempt_id: attemptId,
            token: currentToken,
            question_id: entry.questionId,
            quiz_question_id: entry.quizQuestionId,
            answer: entry.answer,
            flagged: entry.flagged,
            ...(entry.idempotencyKey ? { idempotency_key: entry.idempotencyKey } : {}),
            ...(entry.queuedAt ? { client_queued_at: entry.queuedAt } : {}),
            ...(entry.recoveredFromStorage || entry.queuedAt ? { recovery: true } : {}),
          }),
          signal: controller.signal,
        });
      } catch {
        throw new Error("Connection interrupted. Your answer is safely saved on this device and will sync automatically when you reconnect.");
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        if (response.status === 409) {
          const errBody = typeof response.json === "function"
            ? ((await response.json().catch(() => null)) as { paused?: boolean; error?: string } | null)
            : null;
          if (errBody?.paused) {
            throw new Error(errBody.error ?? "This assessment is paused by your organizer. Your answer is saved on this device and will sync automatically when resumed.");
          }
          throw new Error("The examination is closed or time has expired. Contact your invigilator about unsaved answers.");
        }
        throw new Error("The answer could not be confirmed yet. It remains safely queued on this device; retry or wait for reconnection.");
      }
      if (typeof response.json === "function") {
        const ack = (await response.json().catch(() => ({ ok: true }))) as { ok?: boolean } | null;
        if (ack && ack.ok === false) {
          throw new Error("Server persistence could not be verified. Your answer remains safely queued for retry.");
        }
      }
    }, setQueueState, (entry) => setSavedIds((previous) => new Set(previous).add(entry.questionId)));
    return queueRef.current;
  }, [attemptId]);

  const loadRef = useRef<(() => Promise<boolean>) | null>(null);
  const load = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    const queue = ensureQueue(token);
    // Flush any pre-deadline locally queued answers BEFORE reading `/api/exam/state`
    // so an outage-delayed reload never auto-closes an expired attempt ahead of its queued saves.
    if (queue.state().pending > 0 && !manualPauseRef.current.paused) {
      await queue.flush();
    }
    const pendingBeforeState = queue.state().pending;
    let res: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (pendingBeforeState > 0) headers["X-Exam-Pending-Saves"] = String(pendingBeforeState);
      res = await fetch(`/api/exam/state?attempt_id=${encodeURIComponent(attemptId)}`, {
        headers,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      if (!hasLoadedStateRef.current) {
        setError("Could not connect to the examination. Your saved and queued answers on this device are protected — check your connection and retry.");
      }
      return false;
    } finally {
      clearTimeout(timer);
    }
    const data: ExamState | null = await res.json().catch(() => null);
    if (!res.ok || !data) {
      if (!hasLoadedStateRef.current) {
        setError("Could not load the examination right now. Your answers on this device are protected — retry or contact your invigilator.");
      }
      return false;
    }
    setError(null);
    hasLoadedStateRef.current = true;
    activeRef.current = data.attempt.status === "in_progress";
    const pending = queue.snapshot();
    if (activeRef.current && pending.length) {
      const byQuestion = new Map(pending.map((entry) => [entry.questionId, entry]));
      data.questions = data.questions.map((question) => {
        const entry = byQuestion.get(question.question_id);
        return entry ? { ...question, saved_answer: entry.answer } : question;
      });
    }
    offset.current = new Date(data.server_now).getTime() - Date.now();
    setState(data);
    setManualPause({ paused: Boolean(data.attempt.paused), notice: data.attempt.pause_notice ?? null });
    setFlagged(activeRef.current && pending.length ? pending[pending.length - 1].flagged : data.attempt.flagged ?? []);
    setSavedIds(new Set(data.questions.filter((q) => q.saved_answer && !pending.some((entry) => entry.questionId === q.question_id)).map((q) => q.question_id)));
    if (activeRef.current && pending.length) void queue.flush();
    return true;
  }, [attemptId, token, ensureQueue]);

  loadRef.current = load;
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    presenceMeta.current = {
      current_question: index + 1,
      total_questions: state?.questions.length ?? 1,
      saved_count: savedIds.size,
      pending_saves: queueState.pending,
    };
  });

  /*
   * Presence rail (candidate side).
   *
   * Two independent, deliberately slow loops:
   *   · a heartbeat every 20 s that writes one small row on the server;
   *   · a roster refresh every 15 s that reads names + avatars + connection
   *     state for this examination only.
   *
   * Neither loop submits, saves, reloads, reorders or touches the deadline, and
   * both stop when the attempt is no longer in progress or the tab is hidden.
   * A failed heartbeat is *not* a submission: the UI keeps saying "Reconnecting"
   * and answers stay in the save queue exactly as they were.
   */
  useEffect(() => {
    if (!token || !attemptActive) {
      setPresence(null);
      return;
    }
    const heartbeat = async (event: "heartbeat" | "leave" | "restored") => {
      const outage = outageRef.current;
      try {
        lastPresenceSentAtRef.current = Date.now();
        const meta = presenceMeta.current;
        const res = await fetch("/api/exam/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            attempt_id: attemptId,
            current_question: meta.current_question,
            total_questions: meta.total_questions,
            saved_count: meta.saved_count,
            pending_saves: meta.pending_saves,
            event,
            ...(event === "restored" && outage.toReport ? outage.toReport : {}),
          }),
          keepalive: event === "leave",
        });
        if (!res.ok) throw new Error(`presence ${res.status}`);
        const data = (await res.json().catch(() => null)) as
          | { deadline?: string; pause_credit?: { credit_ms: number; extension_minutes: number } | null; paused?: boolean; pause_notice?: "assessment" | "student" | null }
          | null;
        // Organizer pause transitions arrive on the heartbeat: update the
        // banner immediately, and reload the paper when the pause lifts so
        // the credited deadline and any queued saves resync in one step.
        if (typeof data?.paused === "boolean") {
          const was = manualPauseRef.current.paused;
          setManualPause({ paused: data.paused, notice: data.pause_notice ?? null });
          if (was && !data.paused) void loadRef.current?.();
        }
        outage.fails = 0;
        if (event === "restored") outage.toReport = null;
        if (outage.lostAt !== null) {
          // Back online after a confirmed outage: the server has validated the
          // window; resync to its authoritative deadline and resume.
          outage.lostAt = null;
          outage.hiddenMs = 0;
          setConnState("restored");
          setPauseNotice(
            data?.pause_credit && data.pause_credit.credit_ms > 0
              ? `Connection restored — ${Math.round(data.pause_credit.credit_ms / 60000)} minute(s) of paused time added back to your countdown.`
              : "Connection restored — your remaining assessment time is continuing.",
          );
          window.setTimeout(() => setConnState((c) => (c === "restored" ? "online" : c)), 8000);
        } else if (connStateRef.current !== "online") {
          setConnState("online");
        }
        if (data?.deadline) {
          // Server-authoritative countdown resync (includes any pause credit).
          setState((prev) => (prev ? { ...prev, attempt: { ...prev.attempt, deadline: data.deadline as string } } : prev));
        }
        // Reconnected: push any answers that were queued while offline.
        if (activeRef.current && queueRef.current?.state().pending) void queueRef.current.flush();
      } catch {
        // The server is unreachable from this device. A hidden page is not an
        // outage (heartbeats pause on purpose), so only a visible page with
        // repeated failed heartbeats — or the browser's own offline event —
        // starts the individual pause window.
        outage.fails += 1;
        if (outage.lostAt === null && (outage.fails >= 2 || (typeof navigator !== "undefined" && navigator.onLine === false))) {
          outage.lostAt = Date.now();
          setConnState("lost");
          setPauseNotice(null);
        }
      }
    };


    void heartbeat("heartbeat");
    const beat = setInterval(() => {
      if (pageHidden()) return;
      if (outageRef.current.lostAt !== null) {
        const lost = outageRef.current;
        lost.toReport = { lost_at: new Date(lost.lostAt ?? Date.now()).toISOString(), hidden_ms: Math.round(lost.hiddenMs) };
        void heartbeat("restored");
        return;
      }
      void heartbeat("heartbeat");
    }, PRESENCE_HEARTBEAT_MS);

    // While an outage window is open, time the page spends hidden is tracked
    // so the server can subtract it (a lid closed for 20 minutes is not a
    // 20-minute internet outage).
    const hiddenWatch = setInterval(() => {
      const outage = outageRef.current;
      if (outage.lostAt !== null && pageHidden()) outage.hiddenMs += 1000;
    }, 1000);
    const onOffline = () => {
      const outage = outageRef.current;
      if (outage.lostAt === null && !pageHidden()) {
        outage.lostAt = Date.now();
        setConnState("lost");
      }
    };
    const onOnline = () => {
      if (outageRef.current.lostAt !== null && !pageHidden()) void heartbeat("restored");
    };
    if (typeof window !== "undefined") {
      window.addEventListener("offline", onOffline);
      window.addEventListener("online", onOnline);
    }
    const onHide = () => {
      if (pageHidden()) void heartbeat("leave");
    };
    const pageHide = () => {
      if (typeof navigator === "undefined" || navigator.onLine !== false) void heartbeat("leave");
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onHide);
    if (typeof window !== "undefined") window.addEventListener("pagehide", pageHide);

    return () => {
      clearInterval(beat);
      clearInterval(hiddenWatch);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onHide);
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", pageHide);
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("online", onOnline);
      }
    };
  }, [attemptActive, attemptId, token]);

  useEffect(() => {
    if (!token || !attemptActive) return;
    let stopped = false;
    const refresh = async () => {
      if (stopped || pageHidden() || presenceBusy.current) return;
      presenceBusy.current = true;
      try {
        const res = await fetch(`/api/exam/presence?attempt_id=${encodeURIComponent(attemptId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = (await res.json().catch(() => null)) as { roster?: PresenceRoster } | null;
        if (stopped) return;
        if (res.ok && data?.roster) {
          setPresence(data.roster);
          setPresenceError(null);
        } else {
          setPresenceError("The participant list could not be refreshed yet.");
        }
      } catch {
        if (!stopped) setPresenceError("Connection interrupted — the list refreshes itself when you are back.");
      } finally {
        presenceBusy.current = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), PRESENCE_REFRESH_MS);
    const onVisible = () => {
      if (!pageHidden()) void refresh();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    };
  }, [attemptActive, attemptId, token]);

  // Throttled presence update when question position or save/queue count changes,
  // replacing the duplicate loop previously run inside ExamMessenger.
  useEffect(() => {
    if (!token || !attemptActive || !hasLoadedStateRef.current) return;
    const elapsed = Date.now() - lastPresenceSentAtRef.current;
    const delay = Math.max(400, 4_000 - elapsed);
    const timer = setTimeout(() => {
      if (pageHidden()) return;
      lastPresenceSentAtRef.current = Date.now();
      const meta = presenceMeta.current;
      void fetch("/api/exam/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          attempt_id: attemptId,
          current_question: meta.current_question,
          total_questions: meta.total_questions,
          saved_count: meta.saved_count,
          pending_saves: meta.pending_saves,
          event: "heartbeat",
        }),
      }).catch(() => undefined);
    }, delay);
    return () => clearTimeout(timer);
  }, [attemptActive, attemptId, token, index, savedIds.size, queueState.pending]);

  // When the displayed countdown reaches zero, ask the server to check the
  // official deadline (after flushing any pending saves inside `load()`).
  // Uses exponential backoff (3s -> 6s -> 12s -> 24s -> 60s) and an in-flight
  // guard so simultaneous deadline expiries during an outage never flood `/api/exam/state`.
  const nextDeadlineCheckAt = useRef(0);
  const deadlineCheckFailures = useRef(0);
  const deadlineCheckBusy = useRef(false);
  useEffect(() => {
    if (!state || state.attempt.status !== "in_progress") {
      deadlineCheckFailures.current = 0;
      nextDeadlineCheckAt.current = 0;
      return;
    }
    const checkDeadline = () => {
      const now = Date.now();
      const remaining = new Date(state.attempt.deadline).getTime() - (now + offset.current);
      if (!Number.isFinite(remaining) || remaining > 0) return;
      if (deadlineCheckBusy.current || now < nextDeadlineCheckAt.current) return;
      deadlineCheckBusy.current = true;
      void load()
        .then((ok) => {
          if (ok) {
            deadlineCheckFailures.current = 0;
            nextDeadlineCheckAt.current = Date.now() + 5_000;
          } else {
            deadlineCheckFailures.current += 1;
            const backoff = Math.min(60_000, 3_000 * 2 ** Math.min(deadlineCheckFailures.current - 1, 4));
            nextDeadlineCheckAt.current = Date.now() + backoff;
          }
        })
        .finally(() => {
          deadlineCheckBusy.current = false;
        });
    };
    // Poll the authoritative state without rerendering the entire answer tree.
    checkDeadline();
    const timer = setInterval(checkDeadline, 500);
    return () => clearInterval(timer);
  }, [state, load]);
  useEffect(() => {
    const retry = () => { if (activeRef.current) void queueRef.current?.flush(); };
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || queueRef.current?.state().pending) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("online", retry);
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("online", retry); window.removeEventListener("beforeunload", warn); };
  }, []);
  useEffect(() => () => { queueRef.current?.dispose(); queueRef.current = null; }, []);

  // A token is not a connection. Report failures and allow an explicit retry.
  useEffect(() => {
    if (!state?.exam.proctoring || !token || state.attempt.status !== "in_progress") return;
    let cancelled = false;
    setVideoError(null);
    fetch("/api/livekit/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exam_id: state.exam.id, attempt_id: attemptId, token, role: "candidate" }),
    }).then(async (r) => {
      const d: unknown = await r.json().catch(() => null);
      if (!r.ok || !d || typeof d !== "object" || !("token" in d) || !("serverUrl" in d) ||
          typeof d.token !== "string" || !d.token || typeof d.serverUrl !== "string" || !d.serverUrl)
        throw new Error("Video access unavailable");
      if (!cancelled) setLk({ token: d.token, serverUrl: d.serverUrl });
    }).catch(() => {
      if (!cancelled) setVideoError("Could not connect to video supervision. Retry or contact your invigilator.");
    });
    return () => { cancelled = true; };
  }, [state?.exam.proctoring, state?.exam.id, state?.attempt.status, token, attemptId, videoRetry]);

  function save(questionId: string, quizQuestionId: string, payload: Record<string, unknown>, newFlagged = flagged) {
    const queue = queueRef.current;
    // While the organizer pause is open the server refuses saves; the client
    // does not even queue them — the runner is disabled and the draft stays
    // visible on screen exactly as it was.
    if (manualPauseRef.current.paused) return false;
    if (!queue || !activeRef.current || !queue.enqueue(questionId, quizQuestionId, payload, newFlagged)) return false;
    setSavedIds((previous) => { const next = new Set(previous); next.delete(questionId); return next; });
    // Keep the most recent response visible when navigating away and back,
    // including while it is waiting for a network connection.
    setState((previous) => previous ? { ...previous, questions: previous.questions.map((question) =>
      question.question_id === questionId ? { ...question, saved_answer: payload } : question) } : previous);
    return true;
  }

  function navigateTo(nextIndex: number) {
    if (nextIndex === index) return;
    if (dirtyRef.current && !window.confirm("This answer has unsaved changes. Discard them and leave this question?")) return;
    setAnswerDirty(false);
    setIndex(nextIndex);
  }

  function requestSubmit() {
    if (manualPauseRef.current.paused) return;
    if (dirtyRef.current) { setDraftWarning(true); return; }
    setSubmitError(null);
    setConfirmSubmit(true);
  }

  async function submit() {
    if (!token || submitting || !queueRef.current || dirtyRef.current) return;
    setSubmitting(true);
    setSubmitError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const saved = await queueRef.current.flush();
      if (!saved || queueRef.current.state().pending) {
        setSubmitError("Some answers are not confirmed yet. They are safely saved on this device — reconnect and retry saving before submitting.");
        return;
      }
      submitIdempotencyRef.current ??= createQueueIdempotencyKey();
      const response = await fetch("/api/exam/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attempt_id: attemptId,
          token,
          idempotency_key: submitIdempotencyRef.current,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        setSubmitError("Submission was not confirmed. Your answers remain saved — please retry or contact your invigilator.");
        return;
      }
      const payload = typeof response.json === "function"
        ? ((await response.json().catch(() => null)) as { ok?: boolean; status?: string } | null)
        : { ok: true, status: "submitted" };
      if (!payload || payload.ok === false || (payload.status && payload.status === "in_progress")) {
        setSubmitError("Server persistence could not be verified yet. Please retry submitting.");
        return;
      }
      submitIdempotencyRef.current = null;
      setConfirmSubmit(false);
      const reloaded = await load();
      if (!reloaded) {
        setState((prev) =>
          prev
            ? {
                ...prev,
                attempt: {
                  ...prev.attempt,
                  status: payload.status ?? "submitted",
                },
              }
            : prev,
        );
      }
    } catch {
      setSubmitError("Could not connect. Submission was not confirmed; your answers are preserved — reconnect and retry.");
    } finally {
      clearTimeout(timer);
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <Centered>
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">Examination unavailable</h1>
        <p className="mt-2 text-ink-soft">{error}</p>
        {queueState.pending > 0 && (
          <p role="status" className="mt-3 rounded-lg bg-evergreen-50 p-3 text-xs text-evergreen-900">
            {queueState.pending} answer(s) are safely preserved on this device and will sync automatically when the connection recovers.
          </p>
        )}
        {token ? (
          <div className="mt-4">
            <Button onClick={() => { setError(null); void load(); }}>Retry connection</Button>
          </div>
        ) : null}
        <a href="/exam-access" className="mt-4 inline-block font-semibold text-evergreen-700 underline underline-offset-2">Go to examination entry</a>
      </Centered>
    );
  }
  if (!state) return <Centered><p className="text-ink-soft">Loading your examination paper…</p></Centered>;

  const { exam, attempt, questions } = state;
  const submitted = attempt.status !== "in_progress";
  const countdownFrozen = connState === "lost" || manualPause.paused;
  const current = questions[index];
  const currentMarkings = optionMarkings(current?.result ?? null);
  const currentKeyLine = answerKeyLine(current?.reveal?.summary);
  const showCorrige = submitted && attempt.results_published;
  const answeredCount = questions.filter((q) => q.result && q.result.answered !== false).length;
  const correctCount = questions.filter((q) => q.result?.is_correct === true).length;

  const pct = attempt.score !== null && attempt.max_score ? (attempt.score / attempt.max_score) * 100 : null;

  const examBody = (
    <div className="min-h-screen bg-cream">
      {manualPause.paused && !submitted && (
        <div role="status" aria-live="polite" className="border-b border-sky-300 bg-sky-100 px-4 py-3 text-center text-sm font-semibold text-sky-950 print:hidden">
          {manualPause.notice === "student"
            ? <>ASSESSMENT PAUSED FOR YOU — Your organizer has paused your assessment. Your answers and remaining time are preserved. Please wait to be resumed.</>
            : <>ASSESSMENT PAUSED — Your assessment has temporarily been paused by the organizer. Your answers and remaining time are preserved. Please wait for the assessment to resume.</>}
        </div>
      )}
      {(connState !== "online" || pauseNotice) && !submitted && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "px-4 py-2 text-center text-sm font-semibold print:hidden",
            connState === "lost" ? "bg-amber-100 text-amber-900" : "bg-evergreen-100 text-evergreen-900",
          )}
        >
          {connState === "lost" ? (
            <>CONNECTION LOST — Your assessment time has been paused. Your progress is being preserved; keep working, it saves automatically when you are back online.</>
          ) : connState === "restored" ? (
            <>CONNECTION RESTORED — {pauseNotice ?? "Your remaining assessment time is continuing."}</>
          ) : (
            <>{pauseNotice}</>
          )}
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-evergreen-900/15 bg-paper print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Logo href={null} iconOnly />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold text-evergreen-950">{exam.title}</p>
            <p className="text-xs text-ink-soft">
              {state.candidate.first_name || state.candidate.last_name
                ? `${state.candidate.first_name ?? ""} ${state.candidate.last_name ?? ""}`.trim()
                : state.candidate.name}
              {state.candidate.ref ? ` · ${state.candidate.ref}` : ""}
            </p>
          </div>
          {!submitted && (
            <ExamCountdown deadline={attempt.deadline} serverOffsetMs={offset.current} paused={countdownFrozen} />
          )}
          <Badge tone={submitted ? "green" : "gold"}>{submitted ? attempt.status.replace(/_/g, " ") : "In progress"}</Badge>
          <PresenceRail
            roster={presence}
            variant="exam"
            title="Candidates"
            loading={!presence && !presenceError}
            error={presenceError}
          />
        </div>
      </header>

      <main className={cn("mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr]", corrigeAll && "block")}>
        <aside className={cn("space-y-4 lg:sticky lg:top-24 lg:h-fit print:hidden", corrigeAll && "hidden")}>
          {exam.proctoring && !submitted && (
            <Card className="space-y-2 p-3">
              <p className="text-xs font-semibold text-evergreen-900">Video supervision</p>
              {lk ? <LiveKitRoom token={lk.token} serverUrl={lk.serverUrl} connect video audio data-lk-theme="default"
                onError={() => setMediaError("Video connection failed. Retry or contact your invigilator.")}
                onMediaDeviceFailure={() => setMediaError("Camera or microphone could not be enabled. Check permissions and contact your invigilator.")}>
                <CandidateVideoStatus onRetry={retryVideo} mediaError={mediaError} />
                {exam.require_screen_share && <ScreenShareButton />}
              </LiveKitRoom> : videoError ? <>
                <p role="alert" className="text-xs text-red-700">{videoError}</p>
                <Button variant="outline" className="w-full text-xs" onClick={retryVideo}>Retry video connection</Button>
              </> : <p className="text-xs text-ink-soft">Requesting video access…</p>}
            </Card>
          )}
          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold text-evergreen-950">
              {showCorrige ? `Corrigé · ${questions.length} questions` : "Questions"}
            </p>
            {!showCorrige && <div className="mb-4">
              <div className="mb-2 flex justify-between text-xs text-ink-soft"><span>Confirmed answers</span><span>{savedIds.size} / {questions.length}</span></div>
              <progress aria-label="Server-confirmed answers" className="exam-answer-progress h-2 w-full" max={Math.max(1, questions.length)} value={savedIds.size} />
            </div>}
            <div className="flex flex-wrap gap-1.5">
              {questions.map((q, i) => (
                <button
                  key={q.question_id}
                  onClick={() => navigateTo(i)}
                  aria-current={i === index ? "step" : undefined}
                  aria-label={`Question ${i + 1}, ${savedIds.has(q.question_id) ? "answer confirmed" : "not confirmed"}${flagged.includes(q.question_id) ? ", marked for review" : ""}${q.result ? `, ${resultMark(q.result).label}` : ""}`}
                  className={cn(
                    "relative flex h-11 w-11 items-center justify-center rounded-xl text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-evergreen-700",
                    i === index ? "bg-evergreen-700 text-white" : savedIds.has(q.question_id) ? "bg-evergreen-100 text-evergreen-900" : "bg-white text-ink border border-evergreen-900/15",
                  )}
                >
                  {i + 1}
                  {flagged.includes(q.question_id) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-gold-500 ring-2 ring-white" />}
                  {q.result && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white",
                        resultMark(q.result).tone,
                      )}
                    >
                      {resultMark(q.result).glyph}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 text-xs text-ink-soft" aria-label="Question navigator legend">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-evergreen-700" />Current</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded border border-evergreen-700 bg-evergreen-100" />Confirmed</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gold-500" />Review</span>
            </div>
            {showCorrige ? (
              <p className="mt-3 text-xs text-ink-soft">
                {correctCount} correct · {answeredCount} answered · {questions.length - answeredCount} left blank (0 marks)
              </p>
            ) : (
              <p className="mt-3 text-xs text-ink-soft" aria-live="polite">{savedIds.size} of {questions.length} answers confirmed by the server.</p>
            )}
            <p className="mt-1 text-xs text-ink-soft" aria-live="polite">
              {queueState.pending ? `${queueState.pending} answer(s) awaiting confirmation${queueState.syncing ? " · saving…" : ""}.` : "No answer saves waiting."}
            </p>
            {queueState.error && <p role="alert" className="mt-2 text-xs text-red-700">{queueState.error}</p>}
            {!queueState.durable && <p role="alert" className="mt-2 text-xs text-red-700">Local recovery is unavailable. Do not refresh or close this tab while answers are waiting.</p>}
            {queueState.pending > 0 && !queueState.syncing && !submitted && <Button variant="outline" className="mt-2 w-full text-xs" onClick={() => void queueRef.current?.flush()}>Retry saving</Button>}
            <p className="mt-2 text-xs text-ink-soft">Written, mathematical and graphical answers save automatically; <strong>Save answer</strong> confirms immediately. Flags are sent when an answer is saved. Waiting answers are stored in this tab for refresh recovery; closing the tab can remove them. Use a private device.</p>
          </Card>
          {exam.instructions && (
            <Card className="p-4">
              <p className="text-sm font-semibold text-evergreen-950">Instructions</p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-soft">{exam.instructions}</p>
            </Card>
          )}
        </aside>

        <section>
          {warning && (
            <div
              role="alert"
              className="mb-5 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-950 print:hidden"
            >
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{warning.title}</p>
                  <p className="mt-1">{warning.body}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setWarning(null)}
                  aria-label="Dismiss this warning"
                  className="rounded p-1 text-amber-800 transition hover:bg-amber-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {corrigeAll && showCorrige ? (
            <ExamCorrige
              exam={{
                title: exam.title,
                candidateName:
                  state.candidate.first_name || state.candidate.last_name
                    ? `${state.candidate.first_name ?? ""} ${state.candidate.last_name ?? ""}`.trim()
                    : state.candidate.name,
                score: attempt.score,
                maxScore: attempt.max_score,
                passMarkPercent: exam.pass_mark_percent,
              }}
              questions={questions}
              onBack={() => setCorrigeAll(false)}
            />
          ) : null}

          {submitted && !corrigeAll ? (
            <Card className="p-7 text-center">
              {queueState.pending > 0 && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{queueState.pending} answer(s) were not confirmed before submission or expiry. Contact your invigilator; do not close this tab.</p>}
              <p className="text-5xl">📋</p>
              <h1 className="mt-3 font-display text-3xl font-semibold text-evergreen-950">
                {attempt.status === "auto_submitted" ? "Time expired — paper submitted automatically" : "Your paper has been submitted"}
              </h1>
              {typeof attempt.attempt_number === "number" && (
                <p className="mt-2 text-sm text-ink-soft" data-testid="attempt-number">
                  {attempt.attempt_number === 1 ? "First attempt" : attempt.attempt_number === 2 ? "Second attempt" : `Attempt ${attempt.attempt_number}`}
                  {" · "}this attempt is permanently locked
                </p>
              )}
              {attempt.track && (
                <p className="mt-3 text-sm text-ink-soft" data-testid="exam-track">
                  Track: <strong className="text-evergreen-900">{attempt.track === "AB" ? "Calculus AB" : "Calculus BC"}</strong>
                  {attempt.track === "AB" ? " · questions 1–44" : " · questions 1–50"}
                </p>
              )}
              {attempt.results_published && attempt.score !== null ? (
                <div className="mt-4">
                  <p className="text-lg">Score: <strong className="text-evergreen-800">{attempt.score} / {attempt.max_score}</strong> ({pct?.toFixed(1)}%)</p>
                  <Badge tone={(pct ?? 0) >= exam.pass_mark_percent ? "green" : "red"} className="mt-2 px-3 py-1">
                    {(pct ?? 0) >= exam.pass_mark_percent ? "PASS" : "Below pass mark"} · pass mark {exam.pass_mark_percent}%
                  </Badge>
                  <p className="mt-3 text-sm text-ink-soft">The complete corrigé is open: use the question navigator to review all {questions.length} questions with the correct answer and the official explanation. Blank answers score 0 and are shown too.</p>
                  {(() => {
                    const usage = state.hint_usage ?? [];
                    const hintedQuestions = new Set(usage.map((u) => u.question_id)).size;
                    const summary = resultSummary(
                      questions.map((q) => ({
                        type: q.type,
                        topic: q.topic ?? null,
                        criterion: q.criterion ?? null,
                        points: q.points,
                        result: q.result ? { is_correct: q.result.is_correct, points_awarded: q.result.points_awarded } : null,
                      })),
                      exam.pass_mark_percent,
                    );
                    return (
                      <div className="mx-auto mt-5 max-w-2xl space-y-4 text-left" data-testid="feedback-summary">
                        <div className="rounded-xl border border-evergreen-900/15 bg-white p-4">
                          <p className="font-display text-base font-semibold text-evergreen-950">How this paper was marked</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <p className="text-sm">
                              <span className="font-semibold text-evergreen-900">Objective questions</span>
                              <span className="block text-ink-soft">
                                {summary.objective.awarded} / {summary.objective.max} marks ({summary.objective.percent}%) · {summary.objective.count} question{summary.objective.count === 1 ? "" : "s"} auto-marked
                              </span>
                            </p>
                            <p className="text-sm">
                              <span className="font-semibold text-evergreen-900">Structured questions</span>
                              <span className="block text-ink-soft">
                                {summary.structured.awarded} / {summary.structured.max} marks ({summary.structured.percent}%) · {summary.structured.count} question{summary.structured.count === 1 ? "" : "s"}
                              </span>
                            </p>
                          </div>
                          {summary.pendingManual ? (
                            <p role="status" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                              {summary.pendingCount} structured answer{summary.pendingCount === 1 ? " is" : "s are"} still awaiting your examiner&rsquo;s mark. Your percentage is provisional until that marking is complete.
                            </p>
                          ) : null}
                        </div>

                        <div className="rounded-xl border border-evergreen-900/15 bg-white p-4">
                          <p className="font-display text-base font-semibold text-evergreen-950">Your result in context</p>
                          <p className="mt-2 text-sm leading-relaxed text-evergreen-950" data-testid="personalised-message">{summary.message}</p>
                          <p className="mt-2 text-xs text-ink-soft">
                            Hints used: <strong className="text-evergreen-900">{usage.length}</strong> on {hintedQuestions} question{hintedQuestions === 1 ? "" : "s"} — a hint never costs marks; it shows you where to revise.
                          </p>
                        </div>

                        <div className="rounded-xl border border-evergreen-900/15 bg-white p-4">
                          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Performance by topic</p>
                          <ul className="mt-1 divide-y divide-evergreen-900/10">
                            {summary.topics.map((topic) => (
                              <li key={topic.topic} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                                <span className="min-w-0 flex-1 truncate capitalize">{topic.topic}</span>
                                <span className="shrink-0 text-ink-soft">
                                  {topic.awarded}/{topic.max} · <strong className={topic.band === "Strong" ? "text-evergreen-800" : topic.band === "Developing" ? "text-gold-700" : "text-red-700"}>{topic.band}</strong>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {summary.criteria.length ? (
                          <div className="rounded-xl border border-evergreen-900/15 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Performance by MYP criterion (indicative level band)</p>
                            <ul className="mt-1 divide-y divide-evergreen-900/10">
                              {summary.criteria.map((criterion) => (
                                <li key={criterion.criterion} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                                  <span className="min-w-0 flex-1">
                                    <strong>Criterion {criterion.criterion}</strong>
                                    <span className="block text-xs text-ink-soft">
                                      {{ A: "Knowing and understanding", B: "Investigating patterns", C: "Communicating", D: "Applying mathematics in real-life contexts" }[criterion.criterion] ?? ""}
                                    </span>
                                  </span>
                                  <span className="shrink-0 text-right text-ink-soft">
                                    {criterion.awarded}/{criterion.max} · <strong className="text-evergreen-900">Level {criterion.level}</strong>
                                  </span>
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-[11px] text-ink-soft">The level band is indicative only: it is derived from the marks on this paper, not from an eAssessment moderation.</p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                  <div className="mt-4 flex flex-wrap justify-center gap-2 print:hidden">
                    <Button onClick={() => setCorrigeAll(true)}>Voir le corrigé complet ({questions.length} questions)</Button>
                    <Button variant="outline" onClick={() => window.print()} disabled={!attempt.results_published}>Imprimer / PDF</Button>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-ink-soft">Results will appear here once your institution publishes them.{queueState.pending === 0 && !queueState.error ? " You can close this page." : " Keep this tab open and contact your invigilator about the unconfirmed recovery data."}</p>
              )}
              <RetakePanel attemptId={attemptId} token={token} submitted={submitted} />
            </Card>
          ) : null}

          {current && !corrigeAll && (
            <Card className={`${submitted ? "mt-5" : ""} p-6 sm:p-7`}>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge tone="green">Question {index + 1} of {questions.length}</Badge>
                <Badge tone="gold">{current.points} point(s)</Badge>
                {current.criterion ? (
                  <Badge tone="green">
                    Criterion {current.criterion}
                    {current.strand ? ` · ${current.strand}` : ""}
                    {" — "}
                    {{ A: "Knowing and understanding", B: "Investigating patterns", C: "Communicating", D: "Applying mathematics in real-life contexts" }[current.criterion] ?? ""}
                  </Badge>
                ) : null}
                {/* Inline, keyed by question: the hint can never belong to the
                    previous question, and opening it touches no answer, timer,
                    save queue or submission state. */}
                <HintPanel
                  key={`hint-${current.question_id}`}
                  attemptId={attemptId}
                  token={token}
                  questionId={current.question_id}
                  initialHints={current.hints ?? null}
                  disabled={submitted}
                  answerState={answerStateFor({
                    hasSavedAnswer: Boolean(current.saved_answer) || answerDirty,
                    isCorrect: current.result?.is_correct ?? null,
                  })}
                />
                <button
                  disabled={submitted || submitting}
                  onClick={() => {
                    const next = flagged.includes(current.question_id)
                      ? flagged.filter((f) => f !== current.question_id)
                      : [...flagged, current.question_id];
                    setFlagged(next);
                    if (current.saved_answer) save(current.question_id, current.quiz_question_id, current.saved_answer, next);
                  }}
                  className={cn("ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium", flagged.includes(current.question_id) ? "bg-gold-100 text-gold-700" : "text-ink-soft hover:bg-cream")}
                >
                  <Flag className="h-4 w-4" /> {flagged.includes(current.question_id) ? "Flagged for review" : "Flag for review"}
                </button>
              </div>

              <QuestionRunner
                key={`${current.question_id}-${runnerVersion}`}
                question={current}
                initial={current.saved_answer}
                disabled={submitted || submitting || manualPause.paused}
                submitLabel="Save answer"
                autosave
                onAnswer={(payload) => save(current.question_id, current.quiz_question_id, payload)}
                onHintUse={(partId, level) => {
                  if (!token) return;
                  void fetch("/api/exam/hint/usage", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ attempt_id: attemptId, question_id: current.question_id, part_id: partId, level }),
                  }).catch(() => { /* best-effort formative record */ });
                }}
                onDirtyChange={setAnswerDirty}
                markings={currentMarkings}
              />

              {answerDirty && !submitted && <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">This answer has unsaved changes. Select Save answer before leaving or submitting.</p>}
              {answerDirty && !submitted && <Button variant="outline" className="mt-2" disabled={submitting} onClick={() => {
                if (window.confirm("Discard the unsaved changes to this answer?")) { setRunnerVersion((version) => version + 1); setAnswerDirty(false); }
              }}>Discard unsaved changes</Button>}
              {draftWarning && <p role="alert" className="mt-2 text-sm text-red-700">Save this answer or discard the changes before submitting.</p>}

              {current.result && !corrigeAll && (
                <div className={`mt-5 rounded-xl p-4 text-sm ${resultTone(current.result)}`}>
                  <p className="font-semibold">{resultLabel(current.result, current.points)}</p>
                  {currentKeyLine && <p className="mt-1 font-medium">{currentKeyLine}</p>}
                  {(current.result.explanation || current.result.explanation_doc) && (
                    <div className="mt-1"><RichContent doc={current.result.explanation_doc ?? null} text={current.result.explanation ?? ""} /></div>
                  )}
                  {(() => {
                    const feedback = questionFeedback({
                      topic: current.topic ?? null,
                      criterion: current.criterion ?? null,
                      markingCriteria: current.reveal?.marking_criteria ?? null,
                      nextTimeHint: current.reveal?.next_time_hint ?? null,
                    });
                    if (!feedback.any) return null;
                    return (
                      <dl className="mt-3 space-y-2 border-t border-evergreen-900/10 pt-3 text-sm" data-testid="question-feedback">
                        {feedback.assessed ? (
                          <div>
                            <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">What this question assesses</dt>
                            <dd className="capitalize">{feedback.assessed}</dd>
                          </div>
                        ) : null}
                        {feedback.scheme ? (
                          <div>
                            <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Marking scheme</dt>
                            <dd className="whitespace-pre-wrap leading-relaxed">{feedback.scheme}</dd>
                          </div>
                        ) : null}
                        {feedback.improve ? (
                          <div>
                            <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">How to improve next time</dt>
                            <dd className="leading-relaxed">{feedback.improve}</dd>
                          </div>
                        ) : null}
                      </dl>
                    );
                  })()}
                  {/* The marking scheme is published for every question, so a blank one is revision material too. */}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-evergreen-900/10 pt-4">
                <Button variant="outline" disabled={index === 0} onClick={() => navigateTo(index - 1)}>← Previous</Button>
                <Button variant="outline" disabled={index === questions.length - 1} onClick={() => navigateTo(index + 1)}>Next →</Button>
                {!submitted && (
                  <Button variant="danger" className="ml-auto" onClick={requestSubmit}>Submit examination</Button>
                )}
              </div>
            </Card>
          )}

          {confirmSubmit && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-evergreen-950/70 px-4">
              <Card className="w-full max-w-md p-6">
                <h2 className="font-display text-xl font-semibold text-evergreen-950">Submit your paper?</h2>
                <p className="mt-2 text-sm text-ink-soft">
                  You have answered {savedIds.size} of {questions.length} questions
                  {flagged.length ? ` and flagged ${flagged.length} for review` : ""}.
                  After submission you cannot change any answer.
                </p>
                {submitError && <p role="alert" className="mt-3 text-sm text-red-700">{submitError}</p>}
                <div className="mt-4 flex gap-2">
                  <Button variant="danger" className="flex-1" disabled={submitting} onClick={() => void submit()}>{submitting ? "Checking saves…" : "Yes, submit now"}</Button>
                  <Button variant="outline" className="flex-1" disabled={submitting} onClick={() => setConfirmSubmit(false)}>Keep working</Button>
                </div>
              </Card>
            </div>
          )}
        </section>
      </main>
    </div>
  );

  // The messenger is a sibling of the paper: it never wraps, replaces or remounts it.
  return (
    <>
      {examBody}
      {token ? (
        <ExamMessenger
          attemptId={attemptId}
          token={token}
          active={!submitted}
          questionNumber={index + 1}
          totalQuestions={questions.length}
          savedCount={savedIds.size}
          pendingSaves={queueState.pending}
          managePresence={false}
        />
      ) : null}
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10 text-center">
      <Logo className="mb-6" />
      <Card className="w-full max-w-md p-7">{children}</Card>
    </div>
  );
}
