/**
 * Venn diagram specification — the constructive counterpart of the read-only
 * `venn2` assess diagram.
 *
 * A candidate does not draw pixels: they build a *mathematical* diagram. The
 * specification stores the set names, the region contents (members or counts)
 * and which set each region belongs to, so the same object can be
 *   · edited in the workspace,
 *   · serialised into the saved answer,
 *   · re-rendered identically for the marker, the print view and a review.
 *
 * Region keys are set expressions, not coordinates:
 *
 *   two sets A, B     three sets A, B, C
 *   A                 A            A∩B∩C
 *   B                 B            A∩B (only)
 *   A∩B               C            A∩C (only)
 *   neither           A∩B          B∩C (only)
 *                     A∩C          A only
 *                     B∩C          B only
 *                     A∩B∩C        C only
 *                     neither      neither
 *
 * That keying is what makes the diagram markable: a candidate who puts the
 * right numbers in the right regions has answered the set question, whatever
 * their drawing looks like. Anything unknown is normalised away rather than
 * invented — a corrupt spec falls back to an empty diagram.
 */

export const VENN_SPEC_VERSION = 1;

export const VENN_SET_COUNTS = [2, 3] as const;
export type VennSetCount = (typeof VENN_SET_COUNTS)[number];

/** Region keys for a two-set diagram. */
export const VENN_REGION_KEYS_2 = ["A", "B", "AnB", "neither"] as const;
/** Region keys for a three-set diagram. */
export const VENN_REGION_KEYS_3 = ["A", "B", "C", "AnB", "AnC", "BnC", "AnBnC", "neither"] as const;

export type VennRegionKey =
  | (typeof VENN_REGION_KEYS_2)[number]
  | (typeof VENN_REGION_KEYS_3)[number];

export interface VennRegion {
  key: VennRegionKey;
  /** What the candidate wrote in this region (usually a number or members). */
  value: string;
  /** Shown greyed out; a teacher can pre-fill regions that are given. */
  locked?: boolean;
}

/** A movable member tile. `bank` means it has not been placed in a region yet. */
export interface VennItem {
  id: string;
  label: string;
  region: VennRegionKey | "bank";
}

export interface VennSpec {
  version: number;
  sets: VennSetCount;
  /** Set names, e.g. ["A", "B", "C"] or ["Football", "Music"]. */
  labels: string[];
  /** Label of the universal set, drawn outside the circles. */
  universalLabel: string;
  regions: Record<string, string>;
  /** Optional draggable elements, stored separately from region counts. */
  items: VennItem[];
  title: string;
  /** Candidate-facing instruction shown above the diagram. */
  instructions: string;
  showCounts: boolean;
}

export const VENN_LIMITS = {
  label: 24,
  universalLabel: 40,
  value: 120,
  title: 80,
  instructions: 400,
  items: 60,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function text(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

export function regionKeysFor(sets: VennSetCount): readonly VennRegionKey[] {
  return sets === 3 ? VENN_REGION_KEYS_3 : VENN_REGION_KEYS_2;
}

/** Human-readable name of a region, used by the editor, the marker and print. */
export function regionLabel(spec: VennSpec, key: VennRegionKey): string {
  const [a, b, c] = spec.labels;
  switch (key) {
    case "A": return `${a} only`;
    case "B": return `${b} only`;
    case "C": return `${c} only`;
    case "AnB": return spec.sets === 3 ? `${a} ∩ ${b} (only)` : `${a} ∩ ${b}`;
    case "AnC": return `${a} ∩ ${c} (only)`;
    case "BnC": return `${b} ∩ ${c} (only)`;
    case "AnBnC": return `${a} ∩ ${b} ∩ ${c}`;
    case "neither": return `Outside all sets`;
    default: return key;
  }
}

export function emptyVennSpec(overrides: Partial<VennSpec> = {}): VennSpec {
  const sets = (overrides.sets === 3 ? 3 : 2) as VennSetCount;
  return {
    version: VENN_SPEC_VERSION,
    sets,
    labels: sets === 3 ? ["A", "B", "C"] : ["A", "B"],
    universalLabel: "ξ",
    regions: {},
    items: [],
    title: "",
    instructions: "",
    showCounts: true,
    ...overrides,
  };
}

function normaliseLabels(raw: unknown, sets: VennSetCount): string[] {
  const fallback = sets === 3 ? ["A", "B", "C"] : ["A", "B"];
  if (!Array.isArray(raw)) return fallback;
  return fallback.map((defaultLabel, index) => {
    const value = raw[index];
    const label = typeof value === "string" ? value.trim().slice(0, VENN_LIMITS.label) : "";
    return label || defaultLabel;
  });
}

/** Repair any stored specification; unknown regions are dropped, never kept. */
export function normaliseVennSpec(raw: unknown, fallback: VennSpec = emptyVennSpec()): VennSpec {
  if (!isRecord(raw)) return fallback;
  const sets = (raw.sets === 3 ? 3 : raw.sets === 2 ? 2 : fallback.sets) as VennSetCount;
  const allowed = new Set<string>(regionKeysFor(sets));
  const regions: Record<string, string> = {};
  if (isRecord(raw.regions)) {
    for (const [key, value] of Object.entries(raw.regions)) {
      if (!allowed.has(key)) continue;
      if (typeof value !== "string") continue;
      regions[key] = value.slice(0, VENN_LIMITS.value);
    }
  }
  const itemIds = new Set<string>();
  const items: VennItem[] = Array.isArray(raw.items)
    ? raw.items.slice(0, VENN_LIMITS.items).flatMap((value, index) => {
        if (!isRecord(value) || typeof value.label !== "string" || !value.label.trim()) return [];
        const requestedId = typeof value.id === "string" && value.id.trim() ? value.id.trim().slice(0, 80) : `item-${index + 1}`;
        const id = itemIds.has(requestedId) ? `item-${index + 1}` : requestedId;
        itemIds.add(id);
        const target = typeof value.region === "string" ? value.region : "bank";
        // Switching a diagram from three sets to two must not erase a placed
        // element. Return an unavailable region to the element bank instead.
        const region = target === "bank" || allowed.has(target) ? target : "bank";
        return [{
          id,
          label: value.label.trim().slice(0, VENN_LIMITS.value),
          region: region as VennRegionKey | "bank",
        }];
      })
    : (fallback.items ?? []).map((item, index) => ({
      ...item,
      region: item.region === "bank" || allowed.has(item.region) ? item.region : "bank",
      id: item.id || `item-${index + 1}`,
    }));
  return {
    version: VENN_SPEC_VERSION,
    sets,
    labels: normaliseLabels(raw.labels, sets),
    universalLabel: text(raw.universalLabel, "ξ", VENN_LIMITS.universalLabel),
    regions,
    items,
    title: text(raw.title, fallback.title, VENN_LIMITS.title),
    instructions: text(raw.instructions, fallback.instructions, VENN_LIMITS.instructions),
    showCounts: raw.showCounts !== false,
  };
}

/** True when the candidate has written anything into any region. */
export function vennSpecHasWork(spec: VennSpec | null | undefined): boolean {
  if (!spec) return false;
  return Object.values(spec.regions ?? {}).some((value) => typeof value === "string" && value.trim().length > 0) ||
    spec.items.some((item) => item.region !== "bank");
}

/** Number of filled regions / total regions, for the candidate's own progress. */
export function vennProgress(spec: VennSpec): { filled: number; total: number } {
  const keys = regionKeysFor(spec.sets);
  const filled = keys.filter((key) => (spec.regions[key] ?? "").trim().length > 0 || spec.items.some((item) => item.region === key)).length;
  return { filled, total: keys.length };
}

/** One-line summary for the marker's list view and for print. */
export function vennSummary(spec: VennSpec | null | undefined): string {
  if (!spec || !vennSpecHasWork(spec)) return "No Venn diagram";
  const parts = regionKeysFor(spec.sets)
    .map((key) => {
      const value = (spec.regions[key] ?? "").trim();
      const items = spec.items.filter((item) => item.region === key).map((item) => item.label).join(", ");
      return value || items ? `${regionLabel(spec, key)}: ${[value, items].filter(Boolean).join("; ")}` : "";
    })
    .filter(Boolean);
  return parts.join("; ");
}

/**
 * Concatenate a candidate's region values so the existing textual marking
 * rubric can inspect them without re-implementing region lookup.
 */
export function vennPlainText(spec: VennSpec | null | undefined): string {
  if (!spec) return "";
  return regionKeysFor(spec.sets)
    .map((key) => `${regionLabel(spec, key)} ${[spec.regions[key] ?? "", spec.items.filter((item) => item.region === key).map((item) => item.label).join(" ")].filter(Boolean).join(" ")}`)
    .join(" | ");
}
