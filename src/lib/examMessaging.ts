/**
 * Shared, pure rules for teacher–candidate messaging and live monitoring.
 * No database, no React, no network: the server routes, the monitoring dashboard
 * and the candidate messenger all use these same definitions, so a number shown to a
 * teacher is computed exactly the way the server computes it.
 */

/** Longest message body accepted anywhere (also enforced by the database). */
export const MESSAGE_MAX_LENGTH = 1000;
/** Messages returned to a candidate or teacher per request (history is paged). */
export const MESSAGE_PAGE_SIZE = 50;
/** Hard ceiling on conversation length per attempt, so one attempt cannot flood the table. */
export const MESSAGE_CAP_PER_ATTEMPT = 300;

/** Candidate presence is written on every change (throttled) and at least this often. */
export const PRESENCE_HEARTBEAT_MS = 30_000;
export const PRESENCE_MIN_GAP_MS = 3_000;
/** A heartbeat older than this is "online" with one beat of tolerance. */
export const ONLINE_MAX_AGE_MS = 75_000;
/** Older than this (but seen before) is "offline"; in between it is "reconnecting". */
export const RECONNECTING_MAX_AGE_MS = 180_000;

/** Teacher dashboard: coalesce bursts of realtime events into one reload. */
export const MONITOR_REFRESH_DEBOUNCE_MS = 800;
/** Teacher dashboard: safety reload even if a realtime event was missed. */
export const MONITOR_RECONCILE_MS = 15_000;

export type SenderKind = "staff" | "candidate";

export interface ThreadMessage {
  id: string | null;
  client_message_id: string;
  sender_kind: SenderKind;
  body: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  /** Local state for a message this browser sent and the server has not confirmed yet. */
  status?: "sending" | "failed";
}

export type NormalizedBody = { ok: true; body: string } | { ok: false; error: string };

/** Trims and validates a message body. Control characters other than tab and newline are removed. */
export function normalizeMessageBody(raw: unknown): NormalizedBody {
  if (typeof raw !== "string") return { ok: false, error: "Write a message before sending." };
  const body = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (body.length === 0) return { ok: false, error: "Write a message before sending." };
  if (body.length > MESSAGE_MAX_LENGTH) return { ok: false, error: `Messages are limited to ${MESSAGE_MAX_LENGTH} characters.` };
  return { ok: true, body };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Creates a client message id. Retrying a send with the same id never creates a second message. */
export function newClientMessageId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback for environments without randomUUID: still a valid version-4 UUID shape.
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * True when a saved answer contains something a candidate actually entered. Empty text,
 * empty lists and empty objects are not answers, so clearing a question does not count as answered.
 */
export function hasAnswerContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(hasAnswerContent);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some(hasAnswerContent);
  return false;
}

/**
 * What a teacher may state about one question. Correct and incorrect are only ever
 * stated from a grading result that exists (is_correct). A subjective answer that has
 * been marked, but not classified right or wrong, is "marked". Nothing is guessed.
 */
export type AnswerState = "not_answered" | "saved_awaiting_grading" | "marked" | "correct" | "incorrect";

export interface SavedAnswerFacts {
  answer?: unknown;
  is_correct?: boolean | null;
  points_awarded?: number | string | null;
}

export function answerState(saved: SavedAnswerFacts | null | undefined): AnswerState {
  if (!saved || !hasAnswerContent(saved.answer)) return "not_answered";
  if (saved.is_correct === true) return "correct";
  if (saved.is_correct === false) return "incorrect";
  if (saved.points_awarded !== null && saved.points_awarded !== undefined) return "marked";
  return "saved_awaiting_grading";
}

export interface ProgressSummary {
  total: number;
  answered: number;
  unanswered: number;
  correct: number;
  incorrect: number;
  awaiting_grading: number;
  marked: number;
  progress_percent: number;
}

/**
 * Counts for one attempt. The caller passes only saved answers to questions of THIS candidate's paper,
 * and `total` is that paper's length (never the whole question bank).
 */
export function summarizeProgress(total: number, saved: SavedAnswerFacts[]): ProgressSummary {
  const safeTotal = Math.max(0, Math.floor(total) || 0);
  let answered = 0;
  let correct = 0;
  let incorrect = 0;
  let awaiting = 0;
  let marked = 0;
  for (const row of saved) {
    const state = answerState(row);
    if (state === "not_answered") continue;
    answered += 1;
    if (state === "correct") correct += 1;
    else if (state === "incorrect") incorrect += 1;
    else if (state === "saved_awaiting_grading") awaiting += 1;
    else if (state === "marked") marked += 1;
  }
  return {
    total: safeTotal,
    answered,
    unanswered: Math.max(0, safeTotal - answered),
    correct,
    incorrect,
    awaiting_grading: awaiting,
    marked,
    progress_percent: safeTotal > 0 ? Math.round((answered / safeTotal) * 100) : 0,
  };
}

export type ConnectionStatus = "online" | "reconnecting" | "offline" | "not_connected";

export function connectionStatus(lastSeenAt: string | null | undefined, nowMs: number): ConnectionStatus {
  if (!lastSeenAt) return "not_connected";
  const seen = Date.parse(lastSeenAt);
  if (Number.isNaN(seen)) return "not_connected";
  const age = nowMs - seen;
  if (age <= ONLINE_MAX_AGE_MS) return "online";
  if (age <= RECONNECTING_MAX_AGE_MS) return "reconnecting";
  return "offline";
}

/** Remaining time from the server's authoritative deadline, corrected by the server clock offset. */
export function remainingSeconds(deadlineIso: string, serverNowIso: string, localNowMs: number): number {
  const deadline = Date.parse(deadlineIso);
  const serverNow = Date.parse(serverNowIso);
  if (Number.isNaN(deadline) || Number.isNaN(serverNow)) return 0;
  const offset = serverNow - localNowMs;
  return Math.max(0, Math.floor((deadline - (localNowMs + offset)) / 1000));
}

function sortKey(m: ThreadMessage): number {
  const t = Date.parse(m.created_at);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

/**
 * Merges server messages into a thread without duplicates. A message is identified by its
 * server id, or by (sender, client_message_id) for a local send that is now confirmed. Calling
 * this with the same input twice yields the same thread: retries and overlapping polls are safe.
 */
export function mergeMessages(current: ThreadMessage[], incoming: ThreadMessage[]): ThreadMessage[] {
  const out = [...current];
  for (const message of incoming) {
    const index = out.findIndex((m) =>
      (message.id !== null && m.id === message.id) ||
      (m.sender_kind === message.sender_kind && m.client_message_id === message.client_message_id));
    if (index >= 0) {
      const existing = out[index];
      // Keep the earliest timestamp seen, and the richest delivery/read state.
      out[index] = {
        ...existing,
        ...message,
        created_at: existing.id ? existing.created_at : message.created_at,
        delivered_at: message.delivered_at ?? existing.delivered_at,
        read_at: message.read_at ?? existing.read_at,
        status: undefined,
      };
    } else {
      out.push(message);
    }
  }
  // Confirmed messages are ordered by server time; local sends not yet confirmed follow in send order.
  return out
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ka = sortKey(a.m);
      const kb = sortKey(b.m);
      if (ka !== kb) return ka - kb;
      return a.i - b.i;
    })
    .map(({ m }) => m);
}

/**
 * Overlap subtracted from the cursor. created_at is the transaction start time, so a row can commit
 * after a later-stamped row became visible. Re-reading the overlap closes that gap; mergeMessages
 * de-duplicates by id, so the re-read is a no-op.
 */
export const CURSOR_OVERLAP_MS = 15_000;

/** Cursor for the next incremental fetch: the newest server time already seen, minus the overlap. */
export function newestCursor(messages: ThreadMessage[]): string | null {
  let best: number | null = null;
  for (const m of messages) {
    if (!m.id) continue;
    const t = Date.parse(m.created_at);
    if (Number.isNaN(t)) continue;
    if (best === null || t > best) best = t;
  }
  return best === null ? null : new Date(best - CURSOR_OVERLAP_MS).toISOString();
}

/**
 * Delay before the next message poll. Open panel: fast. Closed but visible: slower. Hidden tab:
 * slowest. Consecutive failures back off exponentially up to one minute, so an interrupted
 * connection does not hammer the server, and recovery is still automatic.
 */
export function nextPollDelay(input: { open: boolean; visible: boolean; failures: number }): number {
  const base = input.open ? 4_000 : input.visible ? 10_000 : 20_000;
  if (input.failures <= 0) return base;
  return Math.min(60_000, base * 2 ** Math.min(input.failures, 6));
}

export const MESSAGE_SENDER_LABEL: Record<SenderKind, string> = {
  staff: "Teacher",
  candidate: "You",
};
