/**
 * Serializable stem-and-leaf construction.
 *
 * The diagram is persisted as editable rows rather than a flattened image.
 * `back_to_back` deliberately keeps left and right leaves separately, so a
 * marker can tell which class each leaf belongs to after an attempt resumes.
 */

export const STEM_LEAF_SPEC_VERSION = 1;
export const STEM_LEAF_LIMITS = { rows: 60, text: 120, title: 100, key: 120 } as const;

export type StemLeafLayout = "standard" | "back_to_back";

export interface StemLeafRow {
  id: string;
  stem: string;
  /** Standard-diagram leaves; retained for compatibility with version 1 payloads. */
  leaves: string;
  /** Leaves on the left side of a back-to-back diagram. */
  leftLeaves?: string;
  /** Leaves on the right side of a back-to-back diagram. */
  rightLeaves?: string;
}

export interface StemLeafSpec {
  version: number;
  title: string;
  layout: StemLeafLayout;
  stemLabel: string;
  leafLabel: string;
  leftLeafLabel: string;
  rightLeafLabel: string;
  key: string;
  rows: StemLeafRow[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, fallback: string, maximum: number = STEM_LEAF_LIMITS.text) =>
  typeof value === "string" ? value.slice(0, maximum) : fallback;

export function isStemLeafLayout(value: unknown): value is StemLeafLayout {
  return value === "standard" || value === "back_to_back";
}

export function emptyStemLeafSpec(overrides: Partial<StemLeafSpec> = {}): StemLeafSpec {
  const layout: StemLeafLayout = overrides.layout === "back_to_back" ? "back_to_back" : "standard";
  return {
    version: STEM_LEAF_SPEC_VERSION,
    title: "",
    layout,
    stemLabel: "Stem",
    leafLabel: "Leaf",
    leftLeafLabel: "Left leaves",
    rightLeafLabel: "Right leaves",
    key: "Key: 4 | 7 means 47",
    rows: [{ id: "row-1", stem: "", leaves: "", leftLeaves: "", rightLeaves: "" }],
    ...overrides,
  };
}

function cloneRows(rows: StemLeafRow[]): StemLeafRow[] {
  return rows.map((row) => ({ ...row }));
}

/** Repair malformed data while preserving all valid candidate-entered cells. */
export function normaliseStemLeafSpec(raw: unknown, fallback: StemLeafSpec = emptyStemLeafSpec()): StemLeafSpec {
  if (!isRecord(raw)) return { ...fallback, rows: cloneRows(fallback.rows) };
  const layout: StemLeafLayout = isStemLeafLayout(raw.layout) ? raw.layout : fallback.layout;
  const rows = Array.isArray(raw.rows)
    ? raw.rows.slice(0, STEM_LEAF_LIMITS.rows).map((value, index) => {
        const row = isRecord(value) ? value : {};
        const leaves = text(row.leaves, "");
        return {
          id: typeof row.id === "string" && row.id.trim() ? row.id.slice(0, 80) : `row-${index + 1}`,
          stem: text(row.stem, ""),
          leaves,
          leftLeaves: text(row.leftLeaves, ""),
          // Legacy diagrams with a single `leaves` cell become the right side
          // if an author later changes the layout, rather than losing work.
          rightLeaves: text(row.rightLeaves, layout === "back_to_back" ? leaves : ""),
        };
      })
    : cloneRows(fallback.rows);
  return {
    version: STEM_LEAF_SPEC_VERSION,
    title: text(raw.title, fallback.title, STEM_LEAF_LIMITS.title),
    layout,
    stemLabel: text(raw.stemLabel, fallback.stemLabel, 40) || "Stem",
    leafLabel: text(raw.leafLabel, fallback.leafLabel, 40) || "Leaf",
    leftLeafLabel: text(raw.leftLeafLabel, fallback.leftLeafLabel || "Left leaves", 40) || "Left leaves",
    rightLeafLabel: text(raw.rightLeafLabel, fallback.rightLeafLabel || "Right leaves", 40) || "Right leaves",
    key: text(raw.key, fallback.key, STEM_LEAF_LIMITS.key),
    rows: rows.length ? rows : [{ id: "row-1", stem: "", leaves: "", leftLeaves: "", rightLeaves: "" }],
  };
}

export function stemLeafHasWork(spec: StemLeafSpec | null | undefined): boolean {
  return Boolean(spec?.rows.some((row) =>
    row.stem.trim() || row.leaves.trim() || (row.leftLeaves ?? "").trim() || (row.rightLeaves ?? "").trim()));
}

export function stemLeafSummary(spec: StemLeafSpec | null | undefined): string {
  if (!spec || !stemLeafHasWork(spec)) return "No stem-and-leaf diagram";
  return spec.rows
    .filter((row) => row.stem.trim() || row.leaves.trim() || (row.leftLeaves ?? "").trim() || (row.rightLeaves ?? "").trim())
    .map((row) => spec.layout === "back_to_back"
      ? `${row.leftLeaves ?? ""} | ${row.stem} | ${row.rightLeaves ?? row.leaves}`
      : `${row.stem} | ${row.leaves}`)
    .join("; ");
}
