"use client";

/**
 * Private messages from the teacher, shown beside the paper without touching it.
 *
 * Isolation (see TakeExamClient): this component is a sibling of the paper, memoized, with
 * its own state, its own timers and its own storage key. Receiving or sending a message
 * re-renders only this panel. It never reads or writes the answer, the save queue, the
 * question position, the deadline or the attempt status.
 *
 * Delivery: the server is the source of truth. The panel polls with a cursor, de-duplicates
 * by id, and keeps unsent replies in an outbox (sessionStorage, like the answer queue) that is
 * retried with the same client_message_id, so a retry can never create a second message.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  MESSAGE_MAX_LENGTH,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_MIN_GAP_MS,
  mergeMessages,
  newClientMessageId,
  newestCursor,
  nextPollDelay,
  normalizeMessageBody,
  type ThreadMessage,
} from "@/lib/examMessaging";

interface MessengerProps {
  attemptId: string;
  token: string;
  /** False once the paper is submitted: history stays readable, presence and sending stop. */
  active: boolean;
  questionNumber: number;
  totalQuestions: number;
  savedCount: number;
  pendingSaves: number;
  /** False when the parent exam client already owns the presence heartbeat loop. */
  managePresence?: boolean;
}

interface OutboxEntry {
  client_message_id: string;
  body: string;
  created_at: string;
}

const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 30_000;
const outboxKey = (attemptId: string) => `evalora-message-outbox-${attemptId}`;

function readOutbox(attemptId: string): OutboxEntry[] {
  try {
    const raw = sessionStorage.getItem(outboxKey(attemptId));
    const data: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    return data.filter((e): e is OutboxEntry => typeof e?.client_message_id === "string" && typeof e?.body === "string" && typeof e?.created_at === "string");
  } catch {
    return [];
  }
}

function writeOutbox(attemptId: string, entries: OutboxEntry[]) {
  try {
    if (entries.length) sessionStorage.setItem(outboxKey(attemptId), JSON.stringify(entries));
    else sessionStorage.removeItem(outboxKey(attemptId));
  } catch {
    // Storage can be unavailable (private mode). Messages still send while this page is open.
  }
}

function clock(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusLine(m: ThreadMessage): string | null {
  if (m.sender_kind !== "candidate") return null;
  if (m.status === "sending") return "Sending…";
  if (m.status === "failed") return "Not sent yet. It will be retried.";
  if (m.read_at) return "Read by your teacher";
  return "Sent";
}

function ExamMessengerInner({ attemptId, token, active, questionNumber, totalQuestions, savedCount, pendingSaves, managePresence = true }: MessengerProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const [connection, setConnection] = useState<"ok" | "reconnecting">("ok");
  const [notice, setNotice] = useState<string | null>(null);

  const openRef = useRef(false);
  openRef.current = open;
  const cursorRef = useRef<string | null>(null);
  const failuresRef = useRef(0);
  const outboxRef = useRef<OutboxEntry[]>([]);
  const flushingRef = useRef(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const readUpToRef = useRef<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef(0);
  const auth = { Authorization: `Bearer ${token}` };

  // ── Restore unsent replies from this tab's storage (survives a reload, never leaves the tab). ──
  useEffect(() => {
    outboxRef.current = readOutbox(attemptId);
    if (outboxRef.current.length) {
      setMessages((prev) => mergeMessages(prev, outboxRef.current.map((e) => ({
        id: null, client_message_id: e.client_message_id, sender_kind: "candidate" as const, body: e.body,
        created_at: e.created_at, delivered_at: null, read_at: null, status: "sending" as const,
      }))));
    }
  }, [attemptId]);

  // ── Replies: send in order, idempotently, with backoff while the connection is down. ──
  const flushOutbox = useCallback(async () => {
    if (flushingRef.current || !active) return;
    flushingRef.current = true;
    try {
      while (outboxRef.current.length) {
        const entry = outboxRef.current[0];
        let response: Response | null = null;
        try {
          response = await fetch("/api/exam/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...auth },
            body: JSON.stringify({ attempt_id: attemptId, client_message_id: entry.client_message_id, body: entry.body }),
            cache: "no-store",
          });
        } catch {
          response = null;
        }
        if (response && response.ok) {
          const data = await response.json().catch(() => null) as { message?: ThreadMessage } | null;
          if (data?.message) setMessages((prev) => mergeMessages(prev, [{ ...data.message!, status: undefined }]));
          outboxRef.current = outboxRef.current.slice(1);
          writeOutbox(attemptId, outboxRef.current);
          retryCountRef.current = 0;
          setConnection("ok");
          continue;
        }
        if (response && response.status >= 400 && response.status < 500 && response.status !== 429) {
          // Refused for a reason that a retry cannot change (closed, expired, invalid).
          const data = await response.json().catch(() => null) as { error?: string } | null;
          setMessages((prev) => prev.map((m) => (m.client_message_id === entry.client_message_id ? { ...m, status: "failed" } : m)));
          setNotice(data?.error ?? "This message could not be sent.");
          outboxRef.current = outboxRef.current.slice(1);
          writeOutbox(attemptId, outboxRef.current);
          continue;
        }
        // Network failure, server error or rate limit: keep the message and retry later.
        setConnection("reconnecting");
        const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(retryCountRef.current, 4));
        retryCountRef.current += 1;
        if (retryRef.current) clearTimeout(retryRef.current);
        retryRef.current = setTimeout(() => { retryRef.current = null; void flushOutbox(); }, delay);
        break;
      }
    } finally {
      flushingRef.current = false;
    }
    // `auth` is derived from the token prop; the token is stable for the life of the attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attemptId, token]);

  // ── Incoming messages: a cursor poll that de-duplicates by id and recovers after any gap. ──
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      try {
        const url = cursorRef.current
          ? `/api/exam/messages?attempt_id=${encodeURIComponent(attemptId)}&after=${encodeURIComponent(cursorRef.current)}`
          : `/api/exam/messages?attempt_id=${encodeURIComponent(attemptId)}`;
        const response = await fetch(url, { headers: auth, cache: "no-store" });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = await response.json() as { messages: ThreadMessage[]; unread_from_teacher: number };
        if (stopped) return;
        const incoming = data.messages ?? [];
        setMessages((prev) => mergeMessages(prev, incoming));
        cursorRef.current = newestCursor(incoming) ?? cursorRef.current;
        setUnread(openRef.current ? 0 : data.unread_from_teacher ?? 0);
        failuresRef.current = 0;
        setConnection("ok");
      } catch {
        failuresRef.current += 1;
        setConnection("reconnecting");
      }
      if (stopped) return;
      timer = setTimeout(tick, nextPollDelay({
        open: openRef.current,
        visible: typeof document === "undefined" || document.visibilityState === "visible",
        failures: failuresRef.current,
      }));
    };

    void tick();
    const onOnline = () => { failuresRef.current = 0; if (timer) clearTimeout(timer); void tick(); void flushOutbox(); };
    window.addEventListener("online", onOnline);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
    // The token and attempt are fixed for this mounted panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, token, flushOutbox]);

  // Anything still in the outbox goes out as soon as the panel is active.
  useEffect(() => {
    if (active) void flushOutbox();
    return () => { if (retryRef.current) clearTimeout(retryRef.current); };
  }, [active, flushOutbox]);

  // ── Read receipts: marking read only while the panel is open, once per newest message. ──
  useEffect(() => {
    if (!open) return;
    const staff = messages.filter((m) => m.sender_kind === "staff" && m.id);
    const newest = staff.length ? staff[staff.length - 1].created_at : null;
    if (!newest || (readUpToRef.current && Date.parse(newest) <= Date.parse(readUpToRef.current))) return;
    readUpToRef.current = newest;
    fetch("/api/exam/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ attempt_id: attemptId, up_to: newest }),
      cache: "no-store",
    })
      .then((r) => { if (r.ok) setUnread(0); else readUpToRef.current = null; })
      .catch(() => { readUpToRef.current = null; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messages, attemptId, token]);

  // Keep the newest message in view when one arrives. Only the thread scrolls, never the page.
  useEffect(() => {
    if (!open || !threadRef.current) return;
    if (messages.length > lastCountRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
    lastCountRef.current = messages.length;
  }, [messages, open]);

  // ── Presence: a light heartbeat, with the question and unsaved count, for the teacher's monitor. ──
  const latest = useRef({ questionNumber, totalQuestions, savedCount, pendingSaves });
  latest.current = { questionNumber, totalQuestions, savedCount, pendingSaves };
  const lastPresenceRef = useRef(0);
  const sendPresence = useCallback(async () => {
    lastPresenceRef.current = Date.now();
    const v = latest.current;
    try {
      await fetch("/api/exam/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({
          attempt_id: attemptId,
          current_question: v.questionNumber > 0 ? v.questionNumber : null,
          total_questions: v.totalQuestions > 0 ? v.totalQuestions : null,
          saved_count: v.savedCount,
          pending_saves: v.pendingSaves,
        }),
        keepalive: true,
        cache: "no-store",
      });
    } catch {
      // Presence is advisory. The next heartbeat tries again.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, token]);

  useEffect(() => {
    if (!active || !managePresence) return;
    const wait = Math.max(0, PRESENCE_MIN_GAP_MS - (Date.now() - lastPresenceRef.current));
    const timer = setTimeout(() => void sendPresence(), wait);
    return () => clearTimeout(timer);
  }, [active, managePresence, questionNumber, savedCount, pendingSaves, sendPresence]);

  useEffect(() => {
    if (!active || !managePresence) return;
    const id = setInterval(() => void sendPresence(), PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [active, managePresence, sendPresence]);

  // ── Sending ──
  const send = () => {
    const normalized = normalizeMessageBody(draft);
    if (!normalized.ok) { setNotice(normalized.error); return; }
    if (!active) { setNotice("The examination is closed. Messages are read-only."); return; }
    const entry: OutboxEntry = { client_message_id: newClientMessageId(), body: normalized.body, created_at: new Date().toISOString() };
    outboxRef.current = [...outboxRef.current, entry];
    writeOutbox(attemptId, outboxRef.current);
    setMessages((prev) => mergeMessages(prev, [{
      id: null, client_message_id: entry.client_message_id, sender_kind: "candidate", body: entry.body,
      created_at: entry.created_at, delivered_at: null, read_at: null, status: "sending",
    }]));
    setDraft("");
    setNotice(null);
    void flushOutbox();
  };

  const staffUnread = unread > 0 ? unread : 0;

  return (
    <div className="print:hidden">
      {!open && (
        <button
          type="button"
          aria-expanded={false}
          aria-controls="exam-messenger-panel"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-evergreen-900/20 bg-evergreen-950 px-4 py-2.5 text-sm font-semibold text-paper shadow-lg hover:bg-evergreen-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          Messages
          {staffUnread > 0 && (
            <span aria-label={`${staffUnread} unread message${staffUnread === 1 ? "" : "s"}`} className="rounded-full bg-gold-500 px-2 py-0.5 text-xs font-bold text-evergreen-950">
              {staffUnread > 99 ? "99+" : staffUnread}
            </span>
          )}
        </button>
      )}

      {open && (
        <section
          id="exam-messenger-panel"
          aria-label="Messages from your teacher"
          className="fixed bottom-4 right-4 z-40 flex max-h-[60vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-evergreen-900/20 bg-paper shadow-2xl"
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        >
          <header className="flex items-center justify-between gap-2 border-b border-evergreen-900/10 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-evergreen-950">Messages from your teacher</p>
              <p className="text-xs text-ink-soft" role="status">
                {connection === "reconnecting" ? "Reconnecting… your messages are kept." : active ? "Replies go to your teacher." : "Examination closed. Read-only."}
              </p>
            </div>
            <button type="button" aria-expanded aria-controls="exam-messenger-panel" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-sm font-semibold text-evergreen-700 hover:bg-evergreen-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">
              Minimize
            </button>
          </header>

          <div ref={threadRef} role="log" aria-live="polite" aria-relevant="additions" className="min-h-[7rem] flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {messages.length === 0 && <p className="text-sm text-ink-soft">No messages yet. Your teacher can write to you here during the examination.</p>}
            {messages.map((m) => (
              <div key={`${m.sender_kind}-${m.client_message_id}`} className={`flex flex-col ${m.sender_kind === "candidate" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${m.sender_kind === "candidate" ? "bg-evergreen-900 text-paper" : "bg-gold-50 text-evergreen-950 ring-1 ring-gold-500/30"}`}>
                  {m.body}
                </div>
                <p className="mt-0.5 text-[11px] text-ink-soft">
                  {m.sender_kind === "staff" ? "Teacher" : "You"} · {clock(m.created_at)}
                  {statusLine(m) ? ` · ${statusLine(m)}` : ""}
                </p>
              </div>
            ))}
          </div>

          {notice && <p role="alert" className="border-t border-evergreen-900/10 px-4 py-2 text-xs text-amber-900 bg-amber-50">{notice}</p>}

          <form className="border-t border-evergreen-900/10 p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <label htmlFor="exam-messenger-reply" className="sr-only">Reply to your teacher</label>
            <textarea
              id="exam-messenger-reply"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
              rows={2}
              maxLength={MESSAGE_MAX_LENGTH}
              disabled={!active}
              placeholder={active ? "Write a reply…" : "Examination closed"}
              className="w-full resize-none rounded-xl border border-evergreen-900/20 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-ink-soft">{draft.length > 800 ? `${draft.length}/${MESSAGE_MAX_LENGTH}` : ""}</span>
              <button type="submit" disabled={!active || draft.trim().length === 0} className="rounded-xl bg-evergreen-950 px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50">
                Send
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

/** Memoized: the paper re-renders every half second for the timer; this panel must not follow it. */
export const ExamMessenger = memo(ExamMessengerInner);
