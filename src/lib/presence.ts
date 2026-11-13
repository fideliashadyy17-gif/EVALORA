/**
 * Real time presence helpers, shared by live quizzes/competitions and
 * examinations.
 *
 * Presence is deliberately tiny: a name, an avatar, and when the device last
 * spoke to us. It never carries an answer, a score, a question number, a hint or
 * anything a proctor sees. Classification happens from `last_seen_at` alone, so
 * a dropped network reads as "unstable"/"offline" and never as "submitted".
 */

import { AVATAR_KEYS, normalizeAvatarKey, type AvatarKey } from "./avatars.ts";

/** A device is online if it spoke to the server in this window. */
export const PRESENCE_ONLINE_MS = 45_000;
/** Between the two windows the connection is degraded, not gone. */
export const PRESENCE_IDLE_MS = 120_000;
/** Heartbeat cadence used by both clients and documented for operators. */
export const PRESENCE_HEARTBEAT_MS = 20_000;
/** Exam roster refresh cadence. Slower than the quiz poll: class sizes are small. */
export const PRESENCE_REFRESH_MS = 15_000;

export type PresenceConnection = "online" | "idle" | "offline";

export interface PresenceEntry {
  /** Stable, non-identifying key for React (never a database id of another user). */
  key: string;
  display_name: string;
  avatar_key: string | null;
  connection: PresenceConnection;
  last_seen_at: string | null;
  is_me: boolean;
  status?: string;
}

export interface PresenceRoster {
  /** Scopes the roster to one session/exam: two rooms can never be mixed. */
  scope: string;
  total: number;
  online: number;
  entries: PresenceEntry[];
  online_window_ms: number;
  /** Server time, so a device with a wrong clock still classifies correctly. */
  generated_at: string;
}

export interface PresenceSourceRow {
  key: string;
  display_name: string | null;
  avatar_key?: string | null;
  last_seen_at: string | null;
  status?: string;
}

export function presenceConnection(lastSeenAt: string | null | undefined, nowMs = Date.now()): PresenceConnection {
  if (!lastSeenAt) return "offline";
  const seen = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(seen)) return "offline";
  const age = nowMs - seen;
  if (age <= PRESENCE_ONLINE_MS) return "online";
  if (age <= PRESENCE_IDLE_MS) return "idle";
  return "offline";
}

export function sanitizeDisplayName(raw: string | null | undefined): string {
  if (!raw) return "Participant";
  const cleaned = String(raw).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 48) || "Participant";
}

/**
 * "*First name* + last initial" is enough to recognise a classmate in a rail
 * and stops the roster becoming a full attendance list a screenshot could leak.
 * Anonymously identified candidates (`Candidate 12`) pass through unchanged.
 */
export function shortDisplayName(raw: string | null | undefined): string {
  const full = sanitizeDisplayName(raw);
  // Anonymous candidates keep their full label: "Candidate 12" has no surname
  // to hide, and shortening it would make two candidates indistinguishable.
  if (/^candidate\s+\d+$/i.test(full)) return full;
  const parts = full.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100000;
  }
  return hash;
}

/** Deterministic avatar so a candidate keeps the same face across refreshes. */
export function avatarForSeed(seed: string): AvatarKey {
  const key = AVATAR_KEYS[hashSeed(seed) % AVATAR_KEYS.length];
  return key ?? "owl";
}

export function buildRoster(input: {
  scope: string;
  rows: PresenceSourceRow[];
  nowMs?: number;
  /** Only used to sort/label "you"; it is never returned as an id. */
  selfKey?: string | null;
  shortenNames?: boolean;
}): PresenceRoster {
  const nowMs = input.nowMs ?? Date.now();
  const entries: PresenceEntry[] = input.rows.map((row, index) => {
    const isMe = Boolean(input.selfKey && row.key === input.selfKey);
    const name = input.shortenNames ? shortDisplayName(row.display_name) : sanitizeDisplayName(row.display_name);
    return {
      key: `${input.scope}:${index}:${hashSeed(row.key)}`,
      display_name: name,
      avatar_key: row.avatar_key ? normalizeAvatarKey(row.avatar_key) : avatarForSeed(row.key),
      connection: presenceConnection(row.last_seen_at, nowMs),
      last_seen_at: row.last_seen_at,
      is_me: isMe,
      ...(row.status ? { status: row.status } : {}),
    };
  });

  const rank: Record<PresenceConnection, number> = { online: 0, idle: 1, offline: 2 };
  entries.sort((a, b) => {
    if (a.is_me !== b.is_me) return a.is_me ? -1 : 1;
    if (rank[a.connection] !== rank[b.connection]) return rank[a.connection] - rank[b.connection];
    return a.display_name.localeCompare(b.display_name);
  });

  return {
    scope: input.scope,
    total: entries.length,
    online: entries.filter((entry) => entry.connection === "online").length,
    entries,
    online_window_ms: PRESENCE_ONLINE_MS,
    generated_at: new Date(nowMs).toISOString(),
  };
}

/** "12 online · 20 in the room" — used as a single accessible label. */
export function presenceSummary(roster: PresenceRoster | null): string {
  if (!roster) return "Participants: loading";
  const room = roster.total === 1 ? "1 in the room" : `${roster.total} in the room`;
  return `${roster.online} online · ${room}`;
}

/**
 * A network drop is not a submission. This helper is the single source of truth
 * for what the UI may say about a candidate who has gone quiet: never
 * "finished", never "submitted", never "completed".
 */
export function presenceStatusLabel(connection: PresenceConnection): string {
  switch (connection) {
    case "online":
      return "Online";
    case "idle":
      return "Reconnecting";
    default:
      return "Offline";
  }
}

/** Big rooms stay readable: collapse to a limit with a "+N more" row. */
export function limitRoster(roster: PresenceRoster | null, limit: number): { visible: PresenceEntry[]; hidden: number } {
  if (!roster) return { visible: [], hidden: 0 };
  if (roster.entries.length <= limit) return { visible: roster.entries, hidden: 0 };
  return { visible: roster.entries.slice(0, limit), hidden: roster.entries.length - limit };
}

/* ─── Connection-pause credit rules (server-authoritative) ──────────────
 *
 * A confirmed internet outage must never cost a student assessment time.
 * The server — never the browser — decides how much pause credit an outage
 * window is worth, and the credit is applied through the attempt's existing
 * `extension_minutes`, so every deadline consumer (state/save/submit, the
 * sweep, monitoring) honors it without change and only THAT student's
 * countdown moves.
 *
 * Honesty anchors:
 *  · the outage window can only start at/after the last instant the server
 *    actually heard from the device (a claimed `lost_at` earlier than that is
 *    clamped — a manipulated device clock cannot invent extra pause time);
 *  · the window always ends at the server's own clock (`now`);
 *  · time the page spent hidden (tab switch, laptop lid — NOT an outage) is
 *    subtracted from the claim;
 *  · a grace allowance covers the normal heartbeat interval plus jitter, so
 *    ordinary cadence gaps are never credited;
 *  · per-event and per-attempt caps bound the total, and every decision is
 *    written to `exam_connection_events` whose unique (attempt_id, lost_at)
 *    index makes duplicate reconnection events credit-free.
 */

/**
 * Jitter guard: windows shorter than this (heartbeat interval + slack) are
 * ordinary cadence noise, not outages, and are never credited. Windows that
 * pass the guard are credited IN FULL from the validated start — the student
 * never loses assessment time to an interruption outside their control.
 */
export const MIN_CREDITABLE_OUTAGE_MS = PRESENCE_HEARTBEAT_MS + 15_000;
/** One outage can credit at most this much (admin can grant more manually). */
export const MAX_CREDIT_PER_EVENT_MS = 30 * 60_000;
/** Total automatic pause credit per attempt. */
export const MAX_CREDIT_PER_ATTEMPT_MS = 120 * 60_000;
/** Pause credit is rounded UP to whole minutes — in the student's favour. */
export const CREDIT_ROUNDING_MS = 60_000;

export interface PauseCreditWindowInput {
  /** Server clock at the reconnection request. */
  nowMs: number;
  /** Last instant the server heard from this device (presence row). */
  lastContactMs: number | null;
  /** Client-claimed outage start (browser clock; treated as a claim only). */
  claimedLostMs: number | null;
  /** Client-claimed time spent with the page hidden during the window. */
  hiddenMs: number;
  /** Credit already granted to this attempt (ms). */
  creditedMs: number;
}

export type PauseCreditOutcome =
  | { kind: "invalid" }
  | { kind: "no_credit"; reason: string; lostMs: number; restoredMs: number; claimedMs: number }
  | { kind: "credit"; lostMs: number; restoredMs: number; claimedMs: number; creditMs: number; capped: boolean };

/**
 * Pure decision for one reconnection claim. Deterministic and idempotent when
 * called with the same server-side facts: the caller additionally guards with
 * the unique (attempt_id, lost_at) ledger index.
 */
export function connectionPauseCredit(input: PauseCreditWindowInput): PauseCreditOutcome {
  const { nowMs, lastContactMs, claimedLostMs, hiddenMs, creditedMs } = input;
  if (claimedLostMs === null || !Number.isFinite(claimedLostMs)) return { kind: "invalid" };
  if (Number.isFinite(hiddenMs) && hiddenMs < 0) return { kind: "invalid" };

  const restoredMs = nowMs;
  // Anchor: the outage can only begin after the last confirmed server contact.
  const anchor = lastContactMs !== null && Number.isFinite(lastContactMs) ? lastContactMs : claimedLostMs;
  const lostMs = Math.max(claimedLostMs, anchor);
  const claimedMs = restoredMs - lostMs;
  if (claimedMs < MIN_CREDITABLE_OUTAGE_MS)
    return { kind: "no_credit", reason: "window_too_short", lostMs, restoredMs, claimedMs };

  const hidden = Math.min(Math.max(Number.isFinite(hiddenMs) ? hiddenMs : 0, 0), claimedMs);
  const uncapped = claimedMs - hidden;
  const creditable = Math.min(uncapped, MAX_CREDIT_PER_EVENT_MS);
  const headroom = Math.max(0, MAX_CREDIT_PER_ATTEMPT_MS - Math.max(0, creditedMs));
  if (creditable <= 0 || headroom <= 0)
    return { kind: "no_credit", reason: headroom <= 0 ? "attempt_cap_reached" : "hidden_time", lostMs, restoredMs, claimedMs };

  const rawCredit = Math.min(creditable, headroom);
  const creditMs = Math.min(Math.ceil(rawCredit / CREDIT_ROUNDING_MS) * CREDIT_ROUNDING_MS, headroom);
  return { kind: "credit", lostMs, restoredMs, claimedMs, creditMs, capped: creditMs < uncapped };
}

/** Whole minutes to add to `extension_minutes` for a credited window. */
export function creditExtensionMinutes(creditMs: number): number {
  return Math.max(0, Math.round(creditMs / CREDIT_ROUNDING_MS));
}
