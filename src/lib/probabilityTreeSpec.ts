/**
 * Serializable probability-tree construction.
 *
 * A branch is stored as a node whose `parentId` is the node it grows from.
 * The root is explicit and every other node contains the event label and
 * probability written on the incoming branch. This makes a finished tree
 * editable, inspectable and markable without flattening it into an image.
 */

export const PROBABILITY_TREE_SPEC_VERSION = 1;
export const PROBABILITY_TREE_LIMITS = {
  title: 100,
  instructions: 500,
  label: 80,
  probability: 32,
  outcome: 100,
  nodes: 80,
} as const;

export interface ProbabilityTreeNode {
  id: string;
  /** `null` is reserved for the single root. */
  parentId: string | null;
  /** Event label written beside the incoming branch. */
  label: string;
  /** Probability written beside the incoming branch, e.g. `3/8` or `0.375`. */
  probability: string;
  /** Optional terminal outcome / ordered outcome label. */
  outcome: string;
}

export interface ProbabilityTreeSpec {
  version: number;
  title: string;
  instructions: string;
  rootLabel: string;
  nodes: ProbabilityTreeNode[];
}

const ROOT_ID = "root";

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, fallback: string, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : fallback;
}

function cleanId(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const id = value.trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return id || fallback;
}

export function emptyProbabilityTreeSpec(overrides: Partial<ProbabilityTreeSpec> = {}): ProbabilityTreeSpec {
  return {
    version: PROBABILITY_TREE_SPEC_VERSION,
    title: "",
    instructions: "",
    rootLabel: "Start",
    nodes: [{ id: ROOT_ID, parentId: null, label: "", probability: "", outcome: "" }],
    ...overrides,
  };
}

/** Repair a stored tree while retaining only a connected, acyclic forest rooted at `root`. */
export function normaliseProbabilityTreeSpec(
  raw: unknown,
  fallback: ProbabilityTreeSpec = emptyProbabilityTreeSpec(),
): ProbabilityTreeSpec {
  if (!record(raw)) {
    return { ...fallback, nodes: fallback.nodes.map((node) => ({ ...node })) };
  }

  const candidate = Array.isArray(raw.nodes) ? raw.nodes.slice(0, PROBABILITY_TREE_LIMITS.nodes) : fallback.nodes;
  const provisional: ProbabilityTreeNode[] = [];
  const ids = new Set<string>([ROOT_ID]);

  // There is always one predictable root; an old or malformed root is never
  // allowed to give a child a dangling parent reference.
  provisional.push({ id: ROOT_ID, parentId: null, label: "", probability: "", outcome: "" });
  for (let index = 0; index < candidate.length; index += 1) {
    const value = candidate[index];
    if (!record(value)) continue;
    const requested = cleanId(value.id, `branch-${index + 1}`);
    if (requested === ROOT_ID || ids.has(requested)) continue;
    ids.add(requested);
    provisional.push({
      id: requested,
      parentId: typeof value.parentId === "string" ? cleanId(value.parentId, ROOT_ID) : ROOT_ID,
      label: text(value.label, "", PROBABILITY_TREE_LIMITS.label),
      probability: text(value.probability, "", PROBABILITY_TREE_LIMITS.probability),
      outcome: text(value.outcome, "", PROBABILITY_TREE_LIMITS.outcome),
    });
  }

  // Keep branches only when their parent has already become reachable. A
  // topological pass lets authors list nodes in any order and drops cycles.
  const connected: ProbabilityTreeNode[] = [provisional[0]];
  const reachable = new Set<string>([ROOT_ID]);
  let pending = provisional.slice(1);
  while (pending.length) {
    const next: ProbabilityTreeNode[] = [];
    let progressed = false;
    for (const node of pending) {
      if (node.parentId && reachable.has(node.parentId) && node.parentId !== node.id) {
        connected.push(node);
        reachable.add(node.id);
        progressed = true;
      } else next.push(node);
    }
    if (!progressed) break;
    pending = next;
  }

  return {
    version: PROBABILITY_TREE_SPEC_VERSION,
    title: text(raw.title, fallback.title, PROBABILITY_TREE_LIMITS.title),
    instructions: text(raw.instructions, fallback.instructions, PROBABILITY_TREE_LIMITS.instructions),
    rootLabel: text(raw.rootLabel, fallback.rootLabel || "Start", PROBABILITY_TREE_LIMITS.label) || "Start",
    nodes: connected,
  };
}

export function treeChildren(spec: ProbabilityTreeSpec, parentId: string): ProbabilityTreeNode[] {
  return spec.nodes.filter((node) => node.parentId === parentId);
}

export function treeDepth(spec: ProbabilityTreeSpec, id: string): number {
  let depth = 0;
  let current = spec.nodes.find((node) => node.id === id) ?? null;
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = spec.nodes.find((node) => node.id === current?.parentId) ?? null;
  }
  return depth;
}

export function probabilityTreeHasWork(spec: ProbabilityTreeSpec | null | undefined): boolean {
  if (!spec) return false;
  return spec.nodes.some((node) => node.id !== ROOT_ID && (node.label.trim() || node.probability.trim() || node.outcome.trim()));
}

/** Parse common school probability notation without executing user input. */
export function parseProbability(value: string): number | null {
  const trimmed = value.trim().replace(/\s+/g, "");
  if (!trimmed) return null;
  const fraction = trimmed.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  const parsed = fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

export interface ProbabilityTreePath {
  leafId: string;
  branches: ProbabilityTreeNode[];
  product: number | null;
}

/** Every terminal route, with a numeric product only when all branch labels are valid probabilities. */
export function probabilityTreePaths(spec: ProbabilityTreeSpec): ProbabilityTreePath[] {
  const leaves = spec.nodes.filter((node) => node.id !== ROOT_ID && treeChildren(spec, node.id).length === 0);
  return leaves.map((leaf) => {
    const branches: ProbabilityTreeNode[] = [];
    let current: ProbabilityTreeNode | undefined = leaf;
    const seen = new Set<string>();
    while (current && current.id !== ROOT_ID && !seen.has(current.id)) {
      seen.add(current.id);
      branches.unshift(current);
      current = spec.nodes.find((node) => node.id === current?.parentId);
    }
    const parsed = branches.map((branch) => parseProbability(branch.probability));
    return {
      leafId: leaf.id,
      branches,
      product: parsed.every((value): value is number => value !== null)
        ? parsed.reduce((total, value) => total * value, 1)
        : null,
    };
  });
}

export function probabilityTreeSummary(spec: ProbabilityTreeSpec | null | undefined): string {
  if (!spec || !probabilityTreeHasWork(spec)) return "No probability tree";
  const paths = probabilityTreePaths(spec);
  return paths.map((path) => {
    const labels = path.branches.map((branch) => `${branch.label || "?"} (${branch.probability || "?"})`).join(" → ");
    return `${labels}${path.product === null ? "" : ` = ${Math.round(path.product * 1e6) / 1e6}`}`;
  }).join("; ");
}

export function removeProbabilityTreeNode(spec: ProbabilityTreeSpec, id: string): ProbabilityTreeSpec {
  if (id === ROOT_ID) return spec;
  const removed = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of spec.nodes) {
      if (node.parentId && removed.has(node.parentId) && !removed.has(node.id)) {
        removed.add(node.id);
        changed = true;
      }
    }
  }
  return { ...spec, nodes: spec.nodes.filter((node) => !removed.has(node.id)) };
}
