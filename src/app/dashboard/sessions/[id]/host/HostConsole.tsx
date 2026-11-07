"use client";

import { ParticipantAvatar } from "@/components/ParticipantAvatar";
import { RichContent } from "@/components/RichContent";
import type { RichDoc } from "@/lib/content";
import { parseLiveSettings } from "@/lib/live";
import { describeIncidentType } from "@/lib/integrity";
import { Badge, Button, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { mmss } from "@/lib/utils";
import { Eye, Radio, ShieldAlert, Trophy, UserCheck, Users, UserX, Wifi } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  hostEnd,
  hostNext,
  hostPauseToggle,
  hostRevokeDisplayToken,
  hostRotateDisplayToken,
  hostSetAdmission,
  hostSetApprovalRequired,
  hostSetParticipantStatus,
  hostSetPhase,
  hostStart,
  hostUpdateLiveSettings,
} from "./actions";

interface Session {
  id: string;
  join_code: string;
  title: string | null;
  mode: string;
  status: string;
  phase?: string;
  current_question_index: number;
  question_started_at: string | null;
  question_deadline_at?: string | null;
  admission_open?: boolean;
  require_approval?: boolean;
  display_token_version?: number;
  settings: Record<string, unknown>;
}

interface QRow {
  id: string;
  prompt: string;
  prompt_doc?: RichDoc | null;
  type: string;
  time_limit_seconds: number | null;
}

interface HostParticipant {
  id: string;
  display_name: string;
  participant_ref: string | null;
  avatar_key: string;
  score: number;
  status: string;
  current_index: number;
  joined_at: string;
  last_seen_at: string;
  reconnect_count: number;
  connected: boolean;
  answered_current: boolean;
  answers_count: number;
  average_response_ms: number | null;
  last_response_ms: number | null;
  integrity: { incidents: number; open: number; latest_type: string | null; latest_at: string | null };
}

interface HostState {
  server_now: string;
  session: Session;
  public_screen_path: string;
  progress: { index: number; total: number; remaining_after_current: number; percent: number };
  current_question: {
    type: string;
    time_limit_seconds: number;
    correct_summary: string[];
    correct_option_ids: string[];
    options: { id: string; label: string; content_doc?: RichDoc | null }[];
    option_distribution: Record<string, number>;
  } | null;
  counts: {
    registered: number;
    joined: number;
    active: number;
    pending: number;
    connected: number;
    disconnected: number;
    finished: number;
    answered_current: number;
    not_answered_current: number;
  };
  participants: HostParticipant[];
}

type ActionResult = { ok?: boolean; error?: string; public_screen_path?: string } | void;

export function HostConsole({
  session: initial,
  competition,
  publicScreenPath,
  questions,
  timePerQuestion,
  appUrl,
}: {
  session: Session;
  competition: { id: string; title: string } | null;
  publicScreenPath: string;
  questions: QRow[];
  timePerQuestion: number;
  appUrl: string;
}) {
  const [session, setSession] = useState(initial);
  const [hostData, setHostData] = useState<HostState | null>(null);
  const [screenPath, setScreenPath] = useState(publicScreenPath);
  const [qr, setQr] = useState("");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [volume, setVolume] = useState(() => Math.round(parseLiveSettings(initial.settings).audio.volume * 100));
  const supabaseRef = useRef(createClient());
  const offsetRef = useRef(0);
  const displayVersionRef = useRef(Number(initial.display_token_version ?? 1));

  const joinUrl = `${appUrl}/play/${session.join_code}`;
  const screenUrl = screenPath.startsWith("http") ? screenPath : `${appUrl}${screenPath}`;
  const current = questions[session.current_question_index] ?? null;
  const settings = useMemo(() => parseLiveSettings(session.settings), [session.settings]);
  const participants = hostData?.participants ?? [];
  const counts = hostData?.counts;
  const phase = hostData?.session.phase ?? session.phase ?? "waiting";

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 220, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [joinUrl]);

  const broadcast = useCallback(async () => {
    try {
      await supabaseRef.current.channel(`live:${session.id}`).send({
        type: "broadcast",
        event: "state-changed",
        payload: { at: Date.now() },
      });
    } catch {
      // Polling remains the recovery path; broadcasts carry no data.
    }
  }, [session.id]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/live/host/state?session_id=${session.id}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as HostState | null;
      if (!res.ok || !data) throw new Error("host state unavailable");
      offsetRef.current = new Date(data.server_now).getTime() - Date.now();
      setHostData(data);
      setSession(data.session);
      setConnectionError(false);
      const version = Number(data.session.display_token_version ?? 1);
      if (version !== displayVersionRef.current) {
        displayVersionRef.current = version;
        setScreenPath(data.public_screen_path);
      }
    } catch {
      setConnectionError(true);
    }
  }, [session.id]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 2000);
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  async function act(fn: () => Promise<ActionResult>) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await fn();
      if (result && "error" in result && result.error) setActionError(result.error);
      if (result && "public_screen_path" in result && result.public_screen_path) {
        displayVersionRef.current += 1;
        setScreenPath(result.public_screen_path);
      }
      await refresh();
      await broadcast();
    } catch {
      setActionError("The action could not be completed. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyScreenLink() {
    try {
      await navigator.clipboard.writeText(new URL(screenUrl, window.location.origin).toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setActionError("Copy failed in this browser. Open the screen link and copy it from the address bar.");
    }
  }

  const serverNow = now + offsetRef.current;
  const startsAt = session.question_started_at ? new Date(session.question_started_at).getTime() : null;
  const deadlineAt = session.question_deadline_at
    ? new Date(session.question_deadline_at).getTime()
    : startsAt
      ? startsAt + (current?.time_limit_seconds ?? timePerQuestion) * 1000
      : null;
  const countdownSeconds = startsAt && serverNow < startsAt ? Math.ceil((startsAt - serverNow) / 1000) : null;
  const remainingSeconds = deadlineAt ? Math.max(0, Math.ceil((deadlineAt - serverNow) / 1000)) : null;
  const phaseLabel = livePhaseLabel(session, phase);
  const answered = counts?.answered_current ?? 0;
  const activeCount = counts?.active ?? 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="min-w-0 space-y-6">
        <Card className="overflow-hidden">
          <div className="border-b border-evergreen-900/10 bg-evergreen-950 px-6 py-5 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-gold-300">
                  <Radio className="h-4 w-4" /> Private host control screen
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold">
                  {competition?.title ?? session.title ?? "Live competition"}
                </h2>
                <p className="mt-1 text-sm text-evergreen-100">
                  {competition ? `Competition ${competition.id.slice(0, 8)}… · ` : ""}Session {session.id.slice(0, 8)}… · Code {session.join_code}
                </p>
              </div>
              <div className="text-right">
                <Badge tone={session.status === "live" ? "amber" : session.status === "ended" ? "gray" : "green"} className="px-3 py-1 text-sm">
                  {phaseLabel}
                </Badge>
                {countdownSeconds !== null && session.status === "live" ? (
                  <p className="mt-2 font-display text-3xl font-bold text-gold-300">Starts in {countdownSeconds}s</p>
                ) : remainingSeconds !== null && session.status === "live" && session.mode === "synchronized" ? (
                  <p className="mt-2 font-display text-4xl font-bold tabular-nums">{mmss(remainingSeconds)}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="p-6">
            {connectionError && (
              <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                Reconnecting to the authoritative host state… Controls remain server-validated when the connection returns.
              </p>
            )}
            {actionError && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{actionError}</p>}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Registered" value={counts?.registered ?? "—"} detail={`${counts?.joined ?? 0} joined live`} />
              <Stat label="Connected" value={counts?.connected ?? "—"} detail={`${counts?.disconnected ?? 0} disconnected`} />
              <Stat
                label="Answered current"
                value={session.mode === "synchronized" ? `${answered}/${activeCount}` : "Per participant"}
                detail={session.mode === "synchronized" ? `${counts?.not_answered_current ?? 0} waiting` : "Self-paced progress"}
              />
              <Stat
                label="Question progress"
                value={questions.length ? `${Math.max(0, session.current_question_index + 1)}/${questions.length}` : "—"}
                detail={`${hostData?.progress.remaining_after_current ?? Math.max(0, questions.length - session.current_question_index - 1)} remaining after this`}
              />
            </div>

            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-evergreen-100" aria-label="Competition progress">
              <div
                className="h-full bg-evergreen-700 transition-all"
                style={{ width: `${hostData?.progress.percent ?? 0}%` }}
              />
            </div>

            <section className="mt-6 rounded-2xl border border-evergreen-900/10 bg-cream p-4">
              <h3 className="font-display text-base font-semibold text-evergreen-950">Competition flow</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {session.status === "lobby" && (
                  <Button variant="gold" disabled={busy} onClick={() => act(() => hostStart(session.id))} className="px-6 py-3">
                    ▶ Start competition
                  </Button>
                )}
                {(session.status === "live" || session.status === "paused") && (
                  <Button variant="outline" disabled={busy} onClick={() => act(() => hostPauseToggle(session.id))} className="py-3">
                    {session.status === "paused" ? "Resume" : "Pause"}
                  </Button>
                )}
                {session.mode === "synchronized" && ["live", "paused"].includes(session.status) && phase !== "answer_reveal" && (
                  <Button variant="outline" disabled={busy} onClick={() => act(() => hostSetPhase(session.id, "answer_reveal"))} className="py-3">
                    <Eye className="mr-2 h-4 w-4" /> Reveal correct answer
                  </Button>
                )}
                {session.mode === "synchronized" && ["live", "paused"].includes(session.status) && phase === "answer_reveal" && session.status === "live" && (
                  <Button variant="outline" disabled={busy} onClick={() => act(() => hostSetPhase(session.id, "question"))} className="py-3">
                    Back to question
                  </Button>
                )}
                {["live", "paused"].includes(session.status) && phase !== "leaderboard" && (
                  <Button variant="outline" disabled={busy} onClick={() => act(() => hostSetPhase(session.id, "leaderboard"))} className="py-3">
                    <Trophy className="mr-2 h-4 w-4" /> Show intermediate rankings
                  </Button>
                )}
                {phase === "leaderboard" && session.status === "live" && (
                  <Button variant="outline" disabled={busy} onClick={() => act(() => hostSetPhase(session.id, "question"))} className="py-3">
                    Return to question
                  </Button>
                )}
                {session.mode === "synchronized" && (session.status === "live" || session.status === "paused") && (
                  <Button variant="gold" disabled={busy} onClick={() => act(() => hostNext(session.id))} className="px-6 py-3">
                    {session.current_question_index + 1 >= questions.length ? "Finish competition 🏁" : "Next question →"}
                  </Button>
                )}
                {session.status !== "ended" && (
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      if (confirm("End this competition for everyone? Scores and answers already recorded will be kept.")) {
                        act(() => hostEnd(session.id));
                      }
                    }}
                    className="py-3"
                  >
                    End competition
                  </Button>
                )}
                {session.status === "ended" && phase !== "podium" && (
                  <Button variant="gold" disabled={busy} onClick={() => act(() => hostSetPhase(session.id, "podium"))} className="px-6 py-3">
                    <Trophy className="mr-2 h-4 w-4" /> Display final podium
                  </Button>
                )}
                {session.status === "ended" && phase === "podium" && (
                  <Button variant="outline" disabled={busy} onClick={() => act(() => hostSetPhase(session.id, "completed"))} className="py-3">
                    Hide final podium
                  </Button>
                )}
              </div>
            </section>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-evergreen-900/10 p-4">
                <h3 className="font-display text-base font-semibold text-evergreen-950">Room & admission</h3>
                <div className="mt-3 space-y-3">
                  <Toggle
                    label={session.admission_open !== false ? "Admission open" : "Admission closed"}
                    hint="Existing participants can reconnect; new joins are blocked when closed."
                    checked={session.admission_open !== false}
                    disabled={busy || session.status === "ended"}
                    onChange={(v) => act(() => hostSetAdmission(session.id, v))}
                  />
                  <Toggle
                    label="Require participant approval"
                    hint="New participants wait in Pending until you approve them."
                    checked={Boolean(session.require_approval)}
                    disabled={busy || session.status === "ended"}
                    onChange={(v) => act(() => hostSetApprovalRequired(session.id, v))}
                  />
                  <Toggle
                    label="Allow final leaderboard data"
                    hint="Public rankings still appear only in leaderboard or podium phase."
                    checked={settings.show_leaderboard}
                    disabled={busy}
                    onChange={(v) => act(() => hostUpdateLiveSettings(session.id, { show_leaderboard: v }))}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-evergreen-900/10 p-4">
                <h3 className="font-display text-base font-semibold text-evergreen-950">Participant entry</h3>
                <div className="mt-3 flex items-center gap-4">
                  {qr && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qr} alt="QR code for participants to join" className="h-24 w-24 rounded-lg border border-evergreen-900/15 bg-white p-1" />
                  )}
                  <div className="min-w-0">
                    <p className="break-all font-mono text-xs text-ink-soft">{joinUrl}</p>
                    <p className="mt-1 font-display text-4xl font-bold tracking-[0.18em] text-evergreen-800">{session.join_code}</p>
                    <p className="text-xs text-ink-soft">Students choose a name and illustrated avatar on their own device.</p>
                  </div>
                </div>
              </section>
            </div>

            <section className="mt-4 rounded-2xl border border-gold-500/40 bg-gold-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-evergreen-950">Secure public projection screen</h3>
                  <p className="mt-1 max-w-2xl text-sm text-ink-soft">
                    Open this separate token-protected link on the projector/TV. Rotate or revoke it if the link is shared outside the room.
                  </p>
                </div>
                <Badge tone={settings.projector_enabled ? "green" : "red"}>{settings.projector_enabled ? "Enabled" : "Revoked / disabled"}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={screenUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg bg-evergreen-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-evergreen-700">
                  Open Public Live Screen ↗
                </a>
                <Button variant="outline" disabled={busy} onClick={copyScreenLink}>{copied ? "Copied ✓" : "Copy secure link"}</Button>
                <Button variant="outline" disabled={busy} onClick={() => act(() => hostRotateDisplayToken(session.id))}>
                  Rotate token
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Revoke the current public-screen link and disable the screen?")) act(() => hostRevokeDisplayToken(session.id));
                  }}
                >
                  Revoke screen
                </Button>
              </div>
              <p className="mt-2 break-all font-mono text-[11px] text-ink-soft">{screenUrl}</p>
            </section>
          </div>
        </Card>

        {session.mode === "synchronized" && current && ["live", "paused"].includes(session.status) && (
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-evergreen-700">Organizer-only current question</p>
                <h2 className="mt-1 font-display text-xl font-semibold text-evergreen-950">
                  Question {session.current_question_index + 1} of {questions.length}
                </h2>
              </div>
              <Badge tone={phase === "answer_reveal" ? "green" : phase === "time_expired" ? "red" : "gold"}>{phaseLabel}</Badge>
            </div>
            <div className="mt-4 rounded-2xl bg-cream p-5 text-lg font-medium text-ink">
              <RichContent doc={current.prompt_doc ?? null} text={current.prompt} />
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-sm font-medium text-ink-soft">
                <span>{answered} answered</span>
                <span>{counts?.not_answered_current ?? 0} not answered</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-evergreen-100">
                <div className="h-full bg-gold-500 transition-all" style={{ width: `${activeCount ? (answered / activeCount) * 100 : 0}%` }} />
              </div>
            </div>

            {hostData?.current_question && (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <details className="rounded-2xl border border-evergreen-900/10 p-4">
                  <summary className="cursor-pointer font-semibold text-evergreen-950">Private answer key</summary>
                  {hostData.current_question.correct_summary.length ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink">
                      {hostData.current_question.correct_summary.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-ink-soft">No automatic answer key for this question type.</p>
                  )}
                </details>
                <div className="rounded-2xl border border-evergreen-900/10 p-4">
                  <h3 className="font-semibold text-evergreen-950">Live answer distribution</h3>
                  {hostData.current_question.options.length ? (
                    <div className="mt-3 space-y-2">
                      {hostData.current_question.options.map((o, i) => {
                        const n = hostData.current_question?.option_distribution[o.id] ?? 0;
                        const correct = hostData.current_question?.correct_option_ids.includes(o.id);
                        return (
                          <div key={o.id} className="flex items-center gap-2 text-sm">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${correct ? "bg-evergreen-700 text-white" : "bg-cream text-ink-soft"}`}>{String.fromCharCode(65 + i)}</span>
                            <span className="min-w-0 flex-1 truncate"><RichContent doc={o.content_doc ?? null} text={o.label} /></span>
                            <strong className="tabular-nums">{n}</strong>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-ink-soft">{answered} response(s) recorded. Individual responses stay in the private report.</p>
                  )}
                </div>
              </div>
            )}
          </Card>
        )}

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Public-screen sound & presentation</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Sound plays from the projection computer after its operator presses “Enable sound”. Student devices never start background music.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Toggle
              label="Background music"
              checked={settings.audio.enabled && settings.audio.theme !== "off"}
              disabled={busy}
              onChange={(v) => act(() => hostUpdateLiveSettings(session.id, { audio: { enabled: v } }))}
            />
            <Toggle
              label="Sound effects"
              checked={settings.audio.sound_effects}
              disabled={busy}
              onChange={(v) => act(() => hostUpdateLiveSettings(session.id, { audio: { sound_effects: v } }))}
            />
            <label className="block">
              <span className="text-sm font-semibold text-evergreen-950">Music theme</span>
              <select
                className="mt-2 w-full rounded-xl border border-evergreen-900/20 bg-white px-3 py-2.5"
                value={settings.audio.theme}
                disabled={busy}
                onChange={(e) => act(() => hostUpdateLiveSettings(session.id, { audio: { theme: e.target.value as typeof settings.audio.theme } }))}
              >
                <option value="evergreen">Evergreen — warm classroom energy</option>
                <option value="focus">Focus — calm concentration</option>
                <option value="celebration">Celebration — finals & winners</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-evergreen-950">Volume: {volume}%</span>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                disabled={busy}
                onChange={(e) => setVolume(Number(e.target.value))}
                onMouseUp={() => act(() => hostUpdateLiveSettings(session.id, { audio: { volume: volume / 100 } }))}
                onTouchEnd={() => act(() => hostUpdateLiveSettings(session.id, { audio: { volume: volume / 100 } }))}
                onBlur={() => {
                  if (Math.abs(settings.audio.volume - volume / 100) > 0.001) {
                    act(() => hostUpdateLiveSettings(session.id, { audio: { volume: volume / 100 } }));
                  }
                }}
                className="mt-3 w-full accent-evergreen-700"
              />
            </label>
            <Toggle
              label="Public-screen animations"
              checked={settings.presentation.animations_enabled}
              disabled={busy}
              onChange={(v) => act(() => hostUpdateLiveSettings(session.id, { presentation: { animations_enabled: v } }))}
            />
            <Toggle
              label="Show join code while waiting"
              checked={settings.presentation.show_join_code_on_screen}
              disabled={busy}
              onChange={(v) => act(() => hostUpdateLiveSettings(session.id, { presentation: { show_join_code_on_screen: v } }))}
            />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Questions in this session</h2>
          <ol className="mt-3 divide-y divide-evergreen-900/10">
            {questions.map((q, i) => (
              <li key={q.id} className={`flex items-center gap-3 py-2.5 ${i === session.current_question_index && session.status === "live" ? "rounded-lg bg-gold-50 px-2 font-semibold" : ""}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-evergreen-100 text-xs font-bold text-evergreen-800">{i + 1}</span>
                <span className="line-clamp-1 min-w-0 flex-1 text-sm"><RichContent doc={q.prompt_doc ?? null} text={q.prompt} /></span>
                <Badge tone="gray">{q.type.replace(/_/g, " ")}</Badge>
              </li>
            ))}
          </ol>
          {session.status === "ended" && (
            <p className="mt-4 rounded-xl bg-evergreen-50 px-4 py-3 text-sm text-ink">
              Full results and CSV export are available in the{" "}
              <a href={`/dashboard/reports/session/${session.id}`} className="font-semibold text-evergreen-700 underline underline-offset-2">session report</a>.
            </p>
          )}
        </Card>
      </div>

      <Card className="h-fit overflow-hidden xl:sticky xl:top-6">
        <div className="border-b border-evergreen-900/10 bg-cream px-5 py-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-evergreen-950">
            <Users className="h-5 w-5" /> Live participant monitor
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
            <Wifi className="h-4 w-4" /> {counts?.connected ?? 0} connected · {counts?.pending ?? 0} pending · {participants.length} records
          </p>
        </div>
        <div className="max-h-[78vh] overflow-y-auto p-3">
          {!hostData ? (
            <p className="px-2 py-6 text-sm text-ink-soft">Loading live participants…</p>
          ) : participants.length === 0 ? (
            <p className="px-2 py-6 text-sm text-ink-soft">No participants yet. Share the code or QR code to fill the waiting room.</p>
          ) : (
            <ol className="space-y-2">
              {participants.map((p, i) => (
                <li key={p.id} className={`rounded-2xl border p-3 ${p.status === "pending" ? "border-gold-500/60 bg-gold-50" : "border-evergreen-900/10 bg-white"} ${["rejected", "blocked"].includes(p.status) ? "opacity-55" : ""}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-1 w-5 text-right text-xs font-bold text-ink-soft">{i + 1}</span>
                    <ParticipantAvatar avatarKey={p.avatar_key} name={p.display_name} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate font-semibold text-ink">{p.display_name}</p>
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.connected ? "bg-emerald-500" : "bg-red-400"}`} title={p.connected ? "Connected" : "Disconnected"} />
                      </div>
                      <p className="truncate text-xs text-ink-soft">
                        {p.participant_ref ? `${p.participant_ref} · ` : ""}{statusLabel(p.status)} · last seen {lastSeenLabel(p.last_seen_at, serverNow)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium">
                        <span className="rounded-full bg-evergreen-50 px-2 py-1">{p.score} pts</span>
                        <span className="rounded-full bg-cream px-2 py-1">{p.answers_count} answered</span>
                        {session.mode === "synchronized" && (
                          <span className={`rounded-full px-2 py-1 ${p.answered_current ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
                            {p.answered_current ? "Current ✓" : "Current —"}
                          </span>
                        )}
                        {p.average_response_ms !== null && <span className="rounded-full bg-cream px-2 py-1">avg {(p.average_response_ms / 1000).toFixed(1)}s</span>}
                        {p.reconnect_count > 0 && <span className="rounded-full bg-blue-50 px-2 py-1">↻ reconnected ×{p.reconnect_count}</span>}
                        {p.integrity.incidents > 0 && (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${p.integrity.open > 0 ? "bg-amber-100 text-amber-900" : "bg-cream text-ink-soft"}`}>
                            <ShieldAlert className="h-3 w-3" /> {p.integrity.incidents} integrity · {p.integrity.open} awaiting review
                          </span>
                        )}
                      </div>
                      {p.integrity.latest_type && (
                        <p className="mt-1.5 text-[11px] text-amber-900">
                          Latest: {describeIncidentType(p.integrity.latest_type)}. Authorized proctor roles can inspect the complete immutable history.
                        </p>
                      )}
                      <ParticipantActions participant={p} busy={busy} ended={session.status === "ended"} act={act} sessionId={session.id} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}

function ParticipantActions({
  participant,
  busy,
  ended,
  sessionId,
  act,
}: {
  participant: HostParticipant;
  busy: boolean;
  ended: boolean;
  sessionId: string;
  act: (fn: () => Promise<ActionResult>) => Promise<void>;
}) {
  if (ended) return null;
  const set = (status: "pending" | "admitted" | "rejected" | "blocked") =>
    act(() => hostSetParticipantStatus(sessionId, participant.id, status));
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
      {participant.status === "pending" && (
        <>
          <button disabled={busy} onClick={() => set("admitted")} className="inline-flex items-center gap-1 rounded-full bg-evergreen-700 px-2.5 py-1.5 text-white disabled:opacity-50">
            <UserCheck className="h-3.5 w-3.5" /> Approve
          </button>
          <button disabled={busy} onClick={() => set("rejected")} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1.5 text-red-700 disabled:opacity-50">
            <UserX className="h-3.5 w-3.5" /> Reject
          </button>
        </>
      )}
      {["admitted", "finished"].includes(participant.status) && (
        <button disabled={busy} onClick={() => set("blocked")} className="rounded-full bg-red-50 px-2.5 py-1.5 text-red-700 disabled:opacity-50">
          Remove / block
        </button>
      )}
      {["rejected", "blocked"].includes(participant.status) && (
        <button disabled={busy} onClick={() => set("admitted")} className="rounded-full bg-evergreen-50 px-2.5 py-1.5 text-evergreen-800 disabled:opacity-50">
          Restore
        </button>
      )}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 accent-evergreen-700"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block font-semibold text-evergreen-950">{label}</span>
        {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
      </span>
    </label>
  );
}

function Stat({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) {
  return (
    <div className="rounded-2xl border border-evergreen-900/10 bg-paper p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums text-evergreen-950">{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{detail}</p>
    </div>
  );
}

function livePhaseLabel(session: Session, phase: string) {
  if (session.status === "ended") return phase === "podium" ? "Final podium" : "Completed";
  if (session.status === "paused") return `Paused · ${phase.replace(/_/g, " ")}`;
  if (session.status === "lobby") {
    return session.admission_open === false ? "Preparation · admission closed" : "Waiting room · admission open";
  }
  return (
    {
      countdown: "Starting countdown",
      question: "Live question",
      time_expired: "Time expired",
      answer_reveal: "Answer reveal",
      leaderboard: "Intermediate rankings",
      waiting: "Waiting",
    }[phase] ?? phase.replace(/_/g, " ")
  );
}

function statusLabel(status: string) {
  return {
    pending: "Pending approval",
    admitted: "Admitted",
    finished: "Finished",
    rejected: "Rejected",
    blocked: "Blocked",
  }[status] ?? status;
}

function lastSeenLabel(iso: string, serverNow: number) {
  const diff = Math.max(0, Math.round((serverNow - new Date(iso).getTime()) / 1000));
  if (diff <= 2) return "now";
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}
