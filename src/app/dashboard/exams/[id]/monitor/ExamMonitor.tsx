"use client";

/**
 * Live monitoring for one examination: progress per candidate, connection state, and a private
 * conversation with each candidate. Numbers come from the server snapshot (computed from saved
 * answers). Realtime changes only trigger a reload, so the dashboard never shows a value the
 * database does not hold. A reconciliation reload runs even if a realtime event was missed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MESSAGE_MAX_LENGTH,
  MONITOR_RECONCILE_MS,
  MONITOR_REFRESH_DEBOUNCE_MS,
  mergeMessages,
  newClientMessageId,
  newestCursor,
  normalizeMessageBody,
  remainingSeconds,
  type ThreadMessage,
} from "@/lib/examMessaging";
import type { MonitorRow, MonitorSnapshot } from "@/lib/monitorRows";

const QUICK_MESSAGES = [
  "Keep going! You are making good progress.",
  "Please read the question carefully.",
  "Take your time and check your work.",
  "Remember the sign rules when performing these calculations.",
  "There is a technical issue with your connection. Your saved answers are protected.",
];

const CONNECTION_LABEL: Record<MonitorRow["connection"], { text: string; tone: string }> = {
  online: { text: "Online", tone: "bg-emerald-100 text-emerald-900" },
  reconnecting: { text: "Reconnecting", tone: "bg-amber-100 text-amber-900" },
  offline: { text: "Offline", tone: "bg-red-100 text-red-900" },
  not_connected: { text: "Not connected", tone: "bg-gray-100 text-gray-700" },
};

function formatRemaining(seconds: number, closed: boolean): string {
  if (closed) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clock(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

interface ThreadState {
  messages: ThreadMessage[];
  cursor: string | null;
  error: string | null;
}

export function ExamMonitor({ examId, initial }: { examId: string; initial: MonitorSnapshot }) {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot>(initial);
  const [offsetMs, setOffsetMs] = useState(() => Date.parse(initial.server_now) - Date.now());
  const [now, setNow] = useState(Date.now());
  const [live, setLive] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, ThreadState>>({});
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, { client_message_id: string; body: string }>>({});
  const refreshingRef = useRef(false);
  const refreshFailuresRef = useRef(0);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 10_000) : null;
    try {
      const response = await fetch(`/api/monitor/exams/${examId}`, {
        cache: "no-store",
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as MonitorSnapshot;
      refreshFailuresRef.current = 0;
      setOffsetMs(Date.parse(data.server_now) - Date.now());
      setSnapshot(data);
      setLoadError(null);
    } catch {
      refreshFailuresRef.current += 1;
      setLoadError("Live progress could not be refreshed. Retrying automatically.");
    } finally {
      if (timer) clearTimeout(timer);
      refreshingRef.current = false;
    }
  }, [examId]);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { debounceRef.current = null; void refresh(); }, MONITOR_REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  // Conversation with one candidate: full latest page on open, then incremental by cursor.
  const loadThread = useCallback(async (attemptId: string) => {
    const current = threadsRef.current[attemptId];
    const url = `/api/monitor/attempts/${attemptId}/messages${current?.cursor ? `?after=${encodeURIComponent(current.cursor)}` : ""}`;
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { messages: ThreadMessage[] };
      setThreads((prev) => {
        const before = prev[attemptId] ?? { messages: [], cursor: null, error: null };
        const merged = mergeMessages(before.messages, data.messages ?? []);
        return { ...prev, [attemptId]: { messages: merged, cursor: newestCursor(merged) ?? before.cursor, error: null } };
      });
    } catch {
      setThreads((prev) => ({ ...prev, [attemptId]: { messages: prev[attemptId]?.messages ?? [], cursor: prev[attemptId]?.cursor ?? null, error: "Messages could not be loaded. Retrying." } }));
    }
  }, []);

  // Opening a conversation marks the candidate's messages as read (only the newest is sent).
  useEffect(() => {
    if (!selectedId) return;
    void loadThread(selectedId);
  }, [selectedId, loadThread]);

  const selectedThread = selectedId ? threads[selectedId] : undefined;
  useEffect(() => {
    if (!selectedId || !selectedThread) return;
    const unread = selectedThread.messages.filter((m) => m.sender_kind === "candidate" && m.id && !m.read_at);
    if (!unread.length) return;
    const up_to = unread[unread.length - 1].created_at;
    void fetch(`/api/monitor/attempts/${selectedId}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ up_to }),
      cache: "no-store",
    }).then((r) => {
      if (!r.ok) return;
      setThreads((prev) => {
        const t = prev[selectedId];
        if (!t) return prev;
        return { ...prev, [selectedId]: { ...t, messages: t.messages.map((m) => (m.sender_kind === "candidate" && m.created_at <= up_to ? { ...m, read_at: m.read_at ?? new Date().toISOString() } : m)) } };
      });
      scheduleRefresh();
    }).catch(() => undefined);
  }, [selectedId, selectedThread, scheduleRefresh]);

  // Realtime: presence, answer-progress signals and messages for THIS examination only.
  // Under RLS a teacher receives only rows of organizations they may monitor.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`exam-monitor-${examId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_presence", filter: `exam_id=eq.${examId}` }, () => scheduleRefresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_messages", filter: `exam_id=eq.${examId}` }, (payload) => {
        scheduleRefresh();
        const attemptId = (payload.new as { attempt_id?: string } | null)?.attempt_id;
        if (attemptId && attemptId === selectedRef.current) void loadThread(attemptId);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLive("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setLive("reconnecting");
      });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [examId, scheduleRefresh, loadThread]);

  // Reconciliation: a reload every few seconds while the tab is visible, whatever realtime did,
  // with adaptive backoff on repeated refresh errors to prevent request storms.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") await refresh();
      if (cancelled) return;
      const delay = Math.min(60_000, MONITOR_RECONCILE_MS * Math.pow(2, Math.min(refreshFailuresRef.current, 3)));
      timer = setTimeout(() => void loop(), delay);
    };
    timer = setTimeout(() => void loop(), MONITOR_RECONCILE_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  // The clock for remaining time: one tick a second, corrected by the server offset.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const rows = snapshot.rows;
  const selected = useMemo(() => rows.find((r) => r.attempt_id === selectedId) ?? null, [rows, selectedId]);
  const serverNowAt = (localNow: number) => new Date(localNow + offsetMs).toISOString();

  const send = async (body: string, retryId?: string) => {
    if (!selectedId) return;
    const normalized = normalizeMessageBody(body);
    if (!normalized.ok) { setSendError(normalized.error); return; }
    const clientId = retryId ?? newClientMessageId();
    const local: ThreadMessage = {
      id: null, client_message_id: clientId, sender_kind: "staff", body: normalized.body,
      created_at: new Date().toISOString(), delivered_at: null, read_at: null, status: "sending",
    };
    setThreads((prev) => {
      const t = prev[selectedId] ?? { messages: [], cursor: null, error: null };
      return { ...prev, [selectedId]: { ...t, messages: mergeMessages(t.messages, [local]) } };
    });
    setSendError(null);
    if (!retryId) setDraft("");
    try {
      const response = await fetch(`/api/monitor/attempts/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_message_id: clientId, body: normalized.body }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as { message?: ThreadMessage; error?: string } | null;
      if (!response.ok || !data?.message) throw new Error(data?.error ?? "The message could not be sent.");
      delete pendingRef.current[selectedId];
      setThreads((prev) => {
        const t = prev[selectedId];
        if (!t) return prev;
        return { ...prev, [selectedId]: { ...t, messages: mergeMessages(t.messages, [{ ...data.message!, status: undefined }]) } };
      });
      scheduleRefresh();
    } catch (error) {
      pendingRef.current[selectedId] = { client_message_id: clientId, body: normalized.body };
      setThreads((prev) => {
        const t = prev[selectedId];
        if (!t) return prev;
        return { ...prev, [selectedId]: { ...t, messages: t.messages.map((m) => (m.client_message_id === clientId ? { ...m, status: "failed" } : m)) } };
      });
      setSendError(error instanceof Error ? error.message : "The message could not be sent.");
    }
  };

  const retry = () => {
    if (!selectedId) return;
    const pending = pendingRef.current[selectedId];
    if (pending) void send(pending.body, pending.client_message_id);
  };

  const thread = selectedId ? threads[selectedId] : undefined;
  const closed = selected ? selected.status !== "in_progress" : false;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`rounded-full px-3 py-1 font-semibold ${live === "live" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
          {live === "live" ? "Live updates on" : live === "reconnecting" ? "Reconnecting… updates every 15 seconds" : "Connecting…"}
        </span>
        <span className="text-ink-soft">Last refreshed {clock(snapshot.server_now)}</span>
        {loadError && <span role="alert" className="text-amber-900">{loadError}</span>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Candidates" className="min-w-0 overflow-x-auto rounded-2xl border border-evergreen-900/15 bg-paper">
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-ink-soft">No candidate has started this examination yet.</p>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-evergreen-900/10 text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Connection</th>
                  <th className="px-3 py-2">Question</th>
                  <th className="px-3 py-2">Progress</th>
                  <th className="px-3 py-2">Answers</th>
                  <th className="px-3 py-2">Remaining</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"><span className="sr-only">Message</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const conn = CONNECTION_LABEL[r.connection];
                  const remaining = remainingSeconds(r.deadline, serverNowAt(now), now);
                  const gradedAny = r.correct + r.incorrect > 0;
                  return (
                    <tr key={r.attempt_id} className={`border-b border-evergreen-900/5 align-top ${selectedId === r.attempt_id ? "bg-evergreen-50" : ""}`}>
                      <td className="px-3 py-3">
                        <p className="font-medium text-evergreen-950">{r.candidate_name}</p>
                        <p className="text-xs text-ink-soft">{[r.class_name, r.candidate_ref].filter(Boolean).join(" · ") || "—"}</p>
                        {r.unread_from_candidate > 0 && (
                          <span className="mt-1 inline-block rounded-full bg-gold-500 px-2 py-0.5 text-[11px] font-bold text-evergreen-950">{r.unread_from_candidate} new</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${conn.tone}`}>{conn.text}</span>
                        {r.last_seen_at && <p className="mt-1 text-[11px] text-ink-soft">seen {clock(r.last_seen_at)}</p>}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {r.current_question !== null ? `${r.current_question} / ${r.total_questions}` : `— / ${r.total_questions}`}
                      </td>
                      <td className="px-3 py-3 min-w-[120px]">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-evergreen-900/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.progress_percent} aria-label={`Progress for ${r.candidate_name}`}>
                          <div className="h-2 rounded-full bg-evergreen-700" style={{ width: `${r.progress_percent}%` }} />
                        </div>
                        <p className="mt-1 text-xs tabular-nums text-ink-soft">{r.progress_percent}%</p>
                      </td>
                      <td className="px-3 py-3 text-xs leading-5">
                        <p><span className="font-semibold text-evergreen-950 tabular-nums">{r.answered}</span> saved · <span className="tabular-nums">{r.unanswered}</span> not answered</p>
                        {r.awaiting_grading > 0 && <p className="text-ink-soft">{r.awaiting_grading} awaiting grading</p>}
                        {r.marked > 0 && <p className="text-ink-soft">{r.marked} marked</p>}
                        <p className="text-ink-soft">
                          {gradedAny || r.status !== "in_progress"
                            ? <>{r.correct} correct · {r.incorrect} incorrect</>
                            : "Correct / incorrect: after marking"}
                        </p>
                        {r.pending_saves > 0 && <p className="font-medium text-amber-900">{r.pending_saves} not yet saved in the browser</p>}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {formatRemaining(remaining, r.status !== "in_progress")}
                        <p className="text-[11px] text-ink-soft">ends {clock(r.deadline)}</p>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <p className="font-semibold text-evergreen-950">{r.status === "in_progress" ? "In progress" : r.status.replace(/_/g, " ")}</p>
                        {r.submitted_at && <p className="text-ink-soft">{clock(r.submitted_at)}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedId(r.attempt_id)}
                          aria-pressed={selectedId === r.attempt_id}
                          className="rounded-lg border border-evergreen-900/20 px-3 py-1.5 text-xs font-semibold text-evergreen-900 hover:bg-evergreen-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                        >
                          Message
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <aside aria-label="Conversation with the selected candidate" className="flex min-h-[420px] flex-col rounded-2xl border border-evergreen-900/15 bg-paper">
          {!selected ? (
            <p className="m-auto px-6 py-10 text-center text-sm text-ink-soft">Choose a candidate to open a private conversation. Only that candidate sees these messages.</p>
          ) : (
            <>
              <header className="border-b border-evergreen-900/10 px-4 py-3">
                <p className="font-semibold text-evergreen-950">{selected.candidate_name}</p>
                <p className="text-xs text-ink-soft">{[selected.class_name, selected.candidate_ref].filter(Boolean).join(" · ")}</p>
                {closed && <p className="mt-1 text-xs font-medium text-amber-900">This attempt is closed. The conversation is read-only.</p>}
              </header>

              <div role="log" aria-live="polite" className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {(thread?.messages ?? []).length === 0 && <p className="text-sm text-ink-soft">No messages yet.</p>}
                {(thread?.messages ?? []).map((m) => (
                  <div key={`${m.sender_kind}-${m.client_message_id}`} className={`flex flex-col ${m.sender_kind === "staff" ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${m.sender_kind === "staff" ? "bg-evergreen-900 text-paper" : "bg-gold-50 text-evergreen-950 ring-1 ring-gold-500/30"}`}>
                      {m.body}
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-soft">
                      {m.sender_kind === "staff" ? "You" : selected.candidate_name} · {clock(m.created_at)}
                      {m.sender_kind === "staff" && m.status === "sending" && " · Sending…"}
                      {m.sender_kind === "staff" && m.status === "failed" && " · Not sent"}
                      {m.sender_kind === "staff" && !m.status && (m.read_at ? " · Read" : m.delivered_at ? " · Delivered" : " · Sent")}
                    </p>
                    {m.status === "failed" && (
                      <button type="button" onClick={retry} className="mt-0.5 text-xs font-semibold text-evergreen-700 underline underline-offset-2">Retry (same message, sent once)</button>
                    )}
                  </div>
                ))}
                {thread?.error && <p role="alert" className="text-xs text-amber-900">{thread.error}</p>}
              </div>

              <div className="border-t border-evergreen-900/10 p-3">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {QUICK_MESSAGES.map((text) => (
                    <button key={text} type="button" disabled={closed} onClick={() => void send(text)} className="rounded-full border border-evergreen-900/15 px-2.5 py-1 text-left text-[11px] text-evergreen-900 hover:bg-evergreen-50 disabled:opacity-50">
                      {text}
                    </button>
                  ))}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
                  <label htmlFor="monitor-reply" className="sr-only">Message to {selected.candidate_name}</label>
                  <textarea
                    id="monitor-reply"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
                    rows={2}
                    maxLength={MESSAGE_MAX_LENGTH}
                    disabled={closed}
                    placeholder={closed ? "Attempt closed" : "Write a private message…"}
                    className="w-full resize-none rounded-xl border border-evergreen-900/20 bg-paper px-3 py-2 text-sm disabled:opacity-60"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-ink-soft">Messages never change answers, marks or the deadline.</span>
                    <button type="submit" disabled={closed || draft.trim().length === 0} className="rounded-xl bg-evergreen-950 px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50">Send</button>
                  </div>
                  {sendError && <p role="alert" className="mt-2 text-xs text-red-700">{sendError}</p>}
                </form>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
