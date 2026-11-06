/**
 * Pure ranking/qualification helpers shared by the competition-event
 * administration actions. Ranking is ALWAYS within a single class —
 * EVALORA never merges different class levels into one ranking.
 */

export interface ScoredPerson {
  key: string;
  displayName: string;
  score: number;
  maxScore: number;
  /** tie-break: total response time in ms (lower wins), optional */
  totalResponseMs?: number | null;
}

export interface RankedPerson extends ScoredPerson {
  rank: number;
  percent: number;
}

export function rankWithinClass(people: ScoredPerson[]): RankedPerson[] {
  const sorted = [...people].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = a.totalResponseMs ?? Number.POSITIVE_INFINITY;
    const tb = b.totalResponseMs ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return a.displayName.localeCompare(b.displayName);
  });
  return sorted.map((p, i) => ({
    ...p,
    rank: i + 1,
    percent: p.maxScore > 0 ? Math.round((p.score / p.maxScore) * 1000) / 10 : 0,
  }));
}

export interface QualificationRule {
  /** take the top N candidates per class */
  top_n?: number;
  /** or/and require at least this percentage */
  min_percent?: number;
}

export function parseQualificationRule(raw: unknown): QualificationRule {
  if (!raw || typeof raw !== "object") return { top_n: 10, min_percent: 50 };
  const r = raw as Record<string, unknown>;
  const top = Number(r.top_n);
  const min = Number(r.min_percent);
  return {
    top_n: Number.isFinite(top) && top > 0 ? Math.floor(top) : 10,
    min_percent: Number.isFinite(min) ? Math.max(0, Math.min(100, min)) : 50,
  };
}

export function eligibleByRule(ranked: RankedPerson[], rule: QualificationRule): RankedPerson[] {
  const topN = rule.top_n ?? 10;
  const minPercent = rule.min_percent ?? 0;
  return ranked.filter((p) => p.rank <= topN && p.percent >= minPercent);
}
