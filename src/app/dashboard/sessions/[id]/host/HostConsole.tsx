"use client";

import { RichContent } from "@/components/RichContent";
import type { RichDoc } from "@/lib/content";
import { Badge, Button, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { mmss } from "@/lib/utils";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { hostEnd, hostNext, hostPauseToggle, hostRemoveParticipant, hostStart, hostToggleLeaderboard } from "./actions";

interface Session {
  id: string; join_code: string; title: string | null; mode: string; status: string;
  current_question_index: number; question_started_at: string | null;
  settings: { show_leaderboard?: boolean; max_participants?: number };
}
interface QRow { id: string; prompt: string; prompt_doc?: RichDoc | null; type: string; time_limit_seconds: number | null }
interface Participant { id: string; display_name: string; participant_ref: string | null; score: number; status: string }

export function HostConsole({
  session: initial,
  questions,
  timePerQuestion,
  appUrl,
}: {
  session: Session;
  questions: QRow[];
  timePerQuestion: number;
  appUrl: string;
}) {
  const [session, setSession] = useState(initial);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [answered, setAnswered] = useState(0);
  const [qr, setQr] = useState<string>("");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const supabaseRef = useRef(createClient());

  const joinUrl = `${appUrl}/play/${session.join_code}`;
  const current = questions[session.current_question_index] ?? null;
  const timeLimit = current?.time_limit_seconds ?? timePerQuestion;

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 220, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [joinUrl]);

  const broadcast = useCallback(async () => {
    try {
      await supabaseRef.current.channel(`live:${session.id}`).send({
        type: "broadcast", event: "state-changed", payload: { at: Date.now() },
      });
    } catch { /* polling still covers it */ }
  }, [session.id]);

  const refresh = useCallback(async () => {
    const supabase = supabaseRef.current;
    const [{ data: s }, { data: ps }] = await Promise.all([
      supabase.from("quiz_sessions").select("*").eq("id", session.id).single(),
      supabase.from("session_participants").select("id, display_name, participant_ref, score, status").eq("session_id", session.id).order("score", { ascending: false }),
    ]);
    if (s) setSession(s as Session);
    if (ps) setParticipants(ps as Participant[]);
    const cur = questions[(s as Session)?.current_question_index ?? -1];
    if (cur) {
      const { count } = await supabase
        .from("participant_answers")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id)
        .eq("quiz_question_id", cur.id);
      setAnswered(count ?? 0);
    }
  }, [session.id, questions]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 2500);
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [refresh]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    await fn();
    await refresh();
    await broadcast();
    setBusy(false);
  }

  const remaining = session.question_started_at
    ? Math.max(0, timeLimit - (now - new Date(session.question_started_at).getTime()) / 1000)
    : null;
  const admitted = participants.filter((p) => p.status !== "rejected");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge tone={session.status === "live" ? "amber" : session.status === "ended" ? "gray" : "green"} className="px-3 py-1">
                {session.status === "live" && <span className="live-dot mr-1 inline-block h-2 w-2 rounded-full bg-red-600" />}
                {session.status.toUpperCase()}
              </Badge>
              <Badge tone="gray">{session.mode === "synchronized" ? "Synchronized" : "Self-paced"}</Badge>
              <span className="text-sm text-ink-soft">{admitted.length} participant(s)</span>
            </div>
            {remaining !== null && session.status === "live" && session.mode === "synchronized" && (
              <span className="font-display text-3xl font-bold tabular-nums text-evergreen-950">{mmss(Math.ceil(remaining))}</span>
            )}
          </div>

          {session.status !== "ended" && (
            <div className="mt-5 rounded-xl border border-evergreen-700/25 bg-evergreen-50 p-5">
              <div className="flex flex-wrap items-center gap-5">
                {qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="QR code to join" className="h-28 w-28 rounded-lg border border-evergreen-900/15 bg-white p-1" />
                )}
                <div>
                  <p className="text-sm text-ink-soft">Participants join at</p>
                  <p className="font-mono text-sm text-ink">{joinUrl}</p>
                  <p className="mt-2 text-sm text-ink-soft">or with code</p>
                  <p className="font-display text-4xl font-bold tracking-[0.2em] text-evergreen-800">{session.join_code}</p>
                  <a href={`/live/${session.join_code}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-evergreen-700 underline underline-offset-2">
                    Open projector screen ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {session.mode === "synchronized" && session.status === "live" && current && (
            <div className="mt-5 rounded-xl border border-evergreen-900/10 bg-cream p-5">
              <p className="text-sm font-medium text-ink-soft">
                Question {session.current_question_index + 1} of {questions.length} · {answered}/{admitted.length} answered
              </p>
              <div className="mt-2 text-lg font-medium text-ink"><RichContent doc={current.prompt_doc ?? null} text={current.prompt} /></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-evergreen-100">
                <div className="h-full bg-gold-500 transition-all" style={{ width: `${admitted.length ? (answered / admitted.length) * 100 : 0}%` }} />
              </div>
            </div>
          )}

          {session.status === "ended" && (
            <div className="mt-5 rounded-xl bg-evergreen-50 p-5">
              <p className="font-semibold text-evergreen-950">Session ended.</p>
              <p className="mt-1 text-sm text-ink-soft">
                Full results, per-question analysis and CSV export are ready in{" "}
                <a href={`/dashboard/reports/session/${session.id}`} className="font-semibold text-evergreen-700 underline underline-offset-2">the session report</a>.
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {session.status === "lobby" && (
              <Button variant="gold" disabled={busy} onClick={() => act(() => hostStart(session.id))} className="px-6 py-3">
                ▶ Start{session.mode === "synchronized" ? " — release question 1" : " session"}
              </Button>
            )}
            {session.mode === "synchronized" && (session.status === "live" || session.status === "paused") && (
              <Button variant="gold" disabled={busy} onClick={() => act(() => hostNext(session.id))} className="px-6 py-3">
                {session.current_question_index + 1 >= questions.length ? "Finish session 🏁" : "Next question →"}
              </Button>
            )}
            {(session.status === "live" || session.status === "paused") && (
              <Button variant="outline" disabled={busy} onClick={() => act(() => hostPauseToggle(session.id))} className="py-3">
                {session.status === "paused" ? "Resume" : "Pause"}
              </Button>
            )}
            {session.status !== "ended" && (
              <Button variant="danger" disabled={busy} onClick={() => { if (confirm("End this session for everyone?")) act(() => hostEnd(session.id)); }} className="py-3">
                End session
              </Button>
            )}
            <label className="ml-auto flex items-center gap-2 text-sm font-medium text-evergreen-900">
              <input
                type="checkbox"
                className="h-5 w-5 accent-evergreen-700"
                checked={Boolean(session.settings?.show_leaderboard)}
                onChange={(e) => act(async () => { await hostToggleLeaderboard(session.id, e.target.checked); })}
              />
              Show leaderboard
            </label>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Questions in this session</h2>
          <ol className="mt-3 divide-y divide-evergreen-900/10">
            {questions.map((q, i) => (
              <li key={q.id} className={`flex items-center gap-3 py-2.5 ${i === session.current_question_index && session.status === "live" ? "rounded-lg bg-gold-50 px-2 font-semibold" : ""}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-evergreen-100 text-xs font-bold text-evergreen-800">{i + 1}</span>
                <span className="line-clamp-1 flex-1 text-sm"><RichContent doc={q.prompt_doc ?? null} text={q.prompt} /></span>
                <Badge tone="gray">{q.type.replace(/_/g, " ")}</Badge>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card className="h-fit p-6 lg:sticky lg:top-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Lobby &amp; leaderboard</h2>
        {admitted.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No participants yet. Share the code or QR code to fill the lobby.</p>
        ) : (
          <ol className="mt-3 space-y-1">
            {participants.map((p, i) => (
              <li key={p.id} className={`flex items-center gap-2 rounded-lg px-2 py-2 ${p.status === "rejected" ? "opacity-40" : "hover:bg-cream"}`}>
                <span className="w-6 text-sm font-bold text-ink-soft">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.display_name}</span>
                  {p.participant_ref && <span className="block text-xs text-ink-soft">{p.participant_ref}</span>}
                </span>
                <span className="tabular-nums font-semibold">{Number(p.score)}</span>
                {p.status !== "rejected" && session.status !== "ended" && (
                  <button
                    className="text-xs text-red-700 underline-offset-2 hover:underline"
                    onClick={() => act(() => hostRemoveParticipant(session.id, p.id))}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
