/**
 * A question that spans more than one MYP criterion.
 *
 * The paper prints a criterion beside every question, and the MYP 4 matching
 * exercise is a single question whose four one-mark rows carry two Criterion A
 * marks and two Criterion C marks. Storing that split beside the question lets
 * the results engine keep the paper's criterion totals exact without inventing
 * extra question records.
 *
 * The split is marking metadata, not candidate information (it describes the
 * marks, never an answer), so it is safe to project alongside `criterion`.
 */
export interface CriterionShare {
  criterion: string;
  points: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * Repair a stored split. Returns null when there is no usable split, or when
 * the shares do not add up to the question's marks. Callers must then fall back
 * to the question's single `criterion`; an inconsistent split is never trusted.
 */
export function normaliseCriterionShares(raw: unknown, totalPoints: number): CriterionShare[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const total = Number(totalPoints);
  if (!Number.isFinite(total) || total <= 0) return null;
  const merged = new Map<string, number>();
  for (const entry of raw.slice(0, 8)) {
    if (!isRecord(entry)) return null;
    const criterion = typeof entry.criterion === "string" ? entry.criterion.trim().toUpperCase() : "";
    const points = Number(entry.points);
    if (!criterion || !Number.isFinite(points) || points <= 0) return null;
    merged.set(criterion, (merged.get(criterion) ?? 0) + points);
  }
  if (!merged.size) return null;
  const sum = [...merged.values()].reduce((totalMarks, points) => totalMarks + points, 0);
  if (Math.abs(sum - total) > 0.001) return null;
  return [...merged.entries()].map(([criterion, points]) => ({ criterion, points }));
}

/** The marks a split question contributes to one criterion. */
export function criterionSharePoints(
  shares: CriterionShare[] | null | undefined,
  criterion: string | null | undefined,
): number {
  const code = typeof criterion === "string" ? criterion.trim().toUpperCase() : "";
  if (!shares?.length || !code) return 0;
  return shares
    .filter((share) => share.criterion === code)
    .reduce((sum, share) => sum + share.points, 0);
}
