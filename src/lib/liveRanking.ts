import { revealedPlaces, type PresentationStage } from "./liveControl";

/**
 * Ranking presentation helpers.
 *
 * Scores themselves are never calculated here: they come from
 * `session_participants.score`, which the server updates when it validates
 * and scores an answer. This module only turns a stored snapshot into the
 * rows the audience sees, including how each position moved compared with the
 * previous closed question.
 */

export interface RankingEntry {
  participant_id: string;
  display_name: string;
  avatar_key: string;
  score: number;
  rank: number;
}

export interface RankingRow extends RankingEntry {
  /** Positive = climbed, negative = dropped, null = first appearance. */
  delta: number | null;
  movement: "up" | "down" | "same" | "new";
  is_leader: boolean;
  is_new_leader: boolean;
}

export function entryFromParticipant(
  participant: { id: string; display_name: string; avatar_key?: string | null; score: number | string },
  rank: number,
): RankingEntry {
  return {
    participant_id: participant.id,
    display_name: participant.display_name,
    avatar_key: participant.avatar_key ?? "owl",
    score: Number(participant.score ?? 0),
    rank,
  };
}

export function snapshotFromRanked(
  ranked: { id: string; display_name: string; avatar_key?: string | null; score: number | string }[],
): RankingEntry[] {
  return ranked.map((participant, index) => entryFromParticipant(participant, index + 1));
}

/** Normalises whatever was stored in jsonb back into safe ranking entries. */
export function parseRankingEntries(raw: unknown): RankingEntry[] {
  if (!Array.isArray(raw)) return [];
  const rows: RankingEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.participant_id !== "string") continue;
    rows.push({
      participant_id: row.participant_id,
      display_name: typeof row.display_name === "string" ? row.display_name : "Participant",
      avatar_key: typeof row.avatar_key === "string" ? row.avatar_key : "owl",
      score: Number(row.score ?? 0),
      rank: Number.isFinite(Number(row.rank)) ? Number(row.rank) : rows.length + 1,
    });
  }
  return rows.sort((a, b) => a.rank - b.rank);
}

/**
 * Adds movement information by comparing the new snapshot with the one taken
 * after the previous closed question. A participant who did not appear before
 * is marked "new"; a change of leader is flagged explicitly.
 */
export function withMovement(current: RankingEntry[], previous: RankingEntry[] | null): RankingRow[] {
  const previousRanks = new Map<string, number>();
  for (const row of previous ?? []) previousRanks.set(row.participant_id, row.rank);
  const previousLeader = previous?.[0]?.participant_id ?? null;
  return current.map((row) => {
    const before = previousRanks.get(row.participant_id);
    const delta = before === undefined ? null : before - row.rank;
    return {
      ...row,
      delta,
      movement: delta === null ? "new" : delta > 0 ? "up" : delta < 0 ? "down" : "same",
      is_leader: row.rank === 1,
      is_new_leader: row.rank === 1 && previousLeader !== null && previousLeader !== row.participant_id,
    };
  });
}

/** Rows the projector may show at this reveal stage (suspense-safe). */
export function gatedRanking(rows: RankingRow[], stage: PresentationStage, convert: boolean): {
  rows: RankingRow[];
  hidden: number;
} {
  const places = revealedPlaces(stage);
  if (!convert) return { rows: [], hidden: rows.length };
  if (!Number.isFinite(places)) return { rows, hidden: 0 };
  return { rows: rows.slice(0, Math.max(0, places)), hidden: Math.max(0, rows.length - places) };
}

/**
 * Podium rows already revealed at this stage, ordered for presentation
 * (third, then second, then champion). One revealed place is *third* place,
 * never the winner — the champion is always the last thing on screen.
 */
export function revealedPodium<T extends { rank: number }>(rows: T[], stage: PresentationStage): T[] {
  const places = revealedPlaces(stage);
  if (!places) return [];
  const top = rows.slice(0, 3);
  const count = Number.isFinite(places) ? Math.min(places, top.length) : top.length;
  // Revealed last-to-first: third place is the first name the room hears.
  return top.slice(top.length - count).sort((a, b) => b.rank - a.rank);
}

/** True only when the stage has revealed the champion. */
export function championRevealed(stage: PresentationStage) {
  return revealedPlaces(stage) >= 3 || stage === "board";
}

export interface RankingHistoryPoint {
  question_index: number;
  leader_name: string;
  leader_avatar: string;
  is_final: boolean;
}

export function historyPoints(
  snapshots: { question_index: number; entries: unknown; is_final?: boolean | null }[],
): RankingHistoryPoint[] {
  return [...snapshots]
    .sort((a, b) => a.question_index - b.question_index)
    .map((snapshot) => {
      const leader = parseRankingEntries(snapshot.entries)[0] ?? null;
      return {
        question_index: snapshot.question_index,
        leader_name: leader?.display_name ?? "—",
        leader_avatar: leader?.avatar_key ?? "owl",
        is_final: Boolean(snapshot.is_final),
      };
    });
}

export function rankOf(rows: RankingEntry[], participantId: string): number | null {
  return rows.find((row) => row.participant_id === participantId)?.rank ?? null;
}
