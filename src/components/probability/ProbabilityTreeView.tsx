import {
  probabilityTreePaths,
  treeChildren,
  treeDepth,
  type ProbabilityTreeSpec,
} from "@/lib/probabilityTreeSpec";

interface Position { x: number; y: number; }

function short(value: string, limit = 18): string {
  const clean = value.trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

/**
 * A deterministic SVG view of a probability tree. Layout is calculated from
 * leaves, not screen coordinates, so the same persisted tree renders in a
 * student's answer, teacher review and printed paper.
 */
export function ProbabilityTreeView({
  spec,
  highlight,
  className,
  showProducts = true,
}: {
  spec: ProbabilityTreeSpec;
  highlight?: string | null;
  className?: string;
  showProducts?: boolean;
}) {
  const leaves = spec.nodes.filter((node) => node.id !== "root" && treeChildren(spec, node.id).length === 0);
  const maxDepth = Math.max(1, ...spec.nodes.map((node) => treeDepth(spec, node.id)));
  const rowCount = Math.max(2, leaves.length);
  const width = Math.max(470, 110 + maxDepth * 190 + 110);
  const height = Math.max(210, 72 + rowCount * 72);
  const positions = new Map<string, Position>();
  const leafY = new Map<string, number>();
  leaves.forEach((leaf, index) => leafY.set(leaf.id, 54 + index * ((height - 104) / Math.max(1, leaves.length - 1))));

  function yFor(id: string): number {
    const existing = positions.get(id);
    if (existing) return existing.y;
    const children = treeChildren(spec, id);
    if (!children.length) return leafY.get(id) ?? height / 2;
    const values = children.map((child) => yFor(child.id));
    return values.reduce((total, value) => total + value, 0) / values.length;
  }

  for (const node of spec.nodes) {
    const depth = treeDepth(spec, node.id);
    positions.set(node.id, { x: 50 + depth * 190, y: node.id === "root" ? height / 2 : yFor(node.id) });
  }

  const paths = showProducts ? probabilityTreePaths(spec) : [];
  const productByLeaf = new Map(paths.map((path) => [path.leafId, path.product]));

  return (
    <figure className={className ?? "my-2 overflow-x-auto rounded-xl border border-evergreen-900/15 bg-white p-2"}>
      {spec.title ? <figcaption className="mb-1 text-sm font-semibold text-evergreen-950">{spec.title}</figcaption> : null}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-w-[420px] w-full" role="img" aria-label={spec.title || "Probability tree diagram"}>
        <title>{spec.title || "Probability tree diagram"}</title>
        <rect width={width} height={height} fill="#ffffff" rx="10" />
        {spec.nodes.filter((node) => node.id !== "root").map((node) => {
          const parent = spec.nodes.find((candidate) => candidate.id === node.parentId);
          const from = parent ? positions.get(parent.id) : undefined;
          const to = positions.get(node.id);
          if (!from || !to) return null;
          const active = highlight === node.id;
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          return (
            <g key={`edge-${node.id}`}>
              <line x1={from.x + 13} y1={from.y} x2={to.x - 13} y2={to.y} stroke={active ? "#0a5c36" : "#668276"} strokeWidth={active ? 3 : 1.8} />
              <text x={midX} y={midY - 7} textAnchor="middle" fontSize="12" fill="#06351f" fontWeight="700">{short(node.label || "event")}</text>
              <text x={midX} y={midY + 10} textAnchor="middle" fontSize="11" fill="#4b5a52">P = {short(node.probability || "?")}</text>
            </g>
          );
        })}
        {spec.nodes.map((node) => {
          const position = positions.get(node.id);
          if (!position) return null;
          const active = highlight === node.id;
          const terminal = node.id !== "root" && treeChildren(spec, node.id).length === 0;
          const product = terminal ? productByLeaf.get(node.id) : null;
          return (
            <g key={node.id}>
              <circle cx={position.x} cy={position.y} r={node.id === "root" ? 17 : 12} fill={active ? "#dcefe5" : "#ffffff"} stroke={active ? "#0a5c36" : "#0a5c36"} strokeWidth={active ? 3 : 1.8} />
              {node.id === "root" ? <text x={position.x} y={position.y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#06351f">{short(spec.rootLabel || "Start", 10)}</text> : null}
              {terminal && (node.outcome || node.label) ? (
                <text x={position.x + 18} y={position.y + 4} fontSize="11" fill="#06351f">{short(node.outcome || node.label, 20)}</text>
              ) : null}
              {terminal && typeof product === "number" ? (
                <text x={position.x + 18} y={position.y + 19} fontSize="10" fill="#4b5a52">path: {Math.round(product * 1e6) / 1e6}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {paths.length > 0 ? <p className="mt-1 text-[11px] text-ink-soft">Path products are shown only when every branch probability is a valid number, decimal or fraction.</p> : null}
    </figure>
  );
}

export default ProbabilityTreeView;
