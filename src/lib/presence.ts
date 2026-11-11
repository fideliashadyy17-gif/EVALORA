/**
 * Real time presence helpers, shared by live quizzes/competitions and
 * examinations.
 *
 * Presence is deliberately tiny: a name, an avatar, and when the device last
 * spoke to us. It never carries an answer, a score, a question number, a hint or
 * anything a proctor sees. Classification happens from `last_seen_at` alone, so
 * a dropped network reads as "unstable"/"offline" and never as "submitted".
 */

import { AVATAR_KEYS, type AvatarKey } from "@/lib/avatars";
import { normalizeAvatarKey } from "@/lib/avatars";

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
