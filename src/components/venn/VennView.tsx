/**
 * VennView — the SVG renderer for a `VennSpec`.
 *
 * Server-render safe (no hooks, no browser APIs) so the identical picture is
 * used by the candidate workspace, the marker, the print view and the question
 * editor preview. Geometry is fixed in a viewBox and scales with the container,
 * which is why it behaves on a phone, a tablet and a projector without a
 * second implementation.
 */
import { regionKeysFor, regionLabel, type VennRegionKey, type VennSpec } from "@/lib/vennSpec";

interface Props {
  spec: VennSpec;
  /** Region to emphasise (the candidate is editing it). */
  highlight?: string | null;
  className?: string;
  /** Hide the values (used by the question editor preview of a blank diagram). */
  hideValues?: boolean;
}

interface Placed {
  key: VennRegionKey;
  x: number;
  y: number;
  /** Text colour class. */
  tone?: "ink" | "soft";
  size?: number;
}

const TWO_SET: Placed[] = [
  { key: "A", x: 100, y: 116 },
  { key: "AnB", x: 180, y: 116 },
  { key: "B", x: 260, y: 116 },
  { key: "neither", x: 180, y: 222, tone: "soft" },
];

const THREE_SET: Placed[] = [
  { key: "A", x: 106, y: 86 },
  { key: "B", x: 294, y: 86 },
  { key: "C", x: 200, y: 232 },
  { key: "AnB", x: 200, y: 92 },
  { key: "AnC", x: 150, y: 166 },
  { key: "BnC", x: 250, y: 166 },
  { key: "AnBnC", x: 200, y: 145 },
  { key: "neither", x: 360, y: 274, tone: "soft" },
];

/** Break a long region value onto at most two SVG lines. */
function wrap(value: string, perLine = 9): string[] {
  const clean = value.trim();
  if (!clean) return [];
  if (clean.length <= perLine) return [clean];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= perLine) current = `${current} ${word}`;
    else { lines.push(current); current = word; }
    if (lines.length === 2) break;
  }
  if (lines.length < 2 && current) lines.push(current);
  return lines.slice(0, 2);
}

function RegionText({ placed, spec, hideValues, highlight }: {
  placed: Placed;
  spec: VennSpec;
  hideValues?: boolean;
  highlight?: string | null;
}) {
  if (hideValues) return null;
  const raw = spec.regions[placed.key] ?? "";
  const lines = wrap(raw);
  const active = highlight === placed.key;
  if (!lines.length) {
    // An empty region still shows a faint dot so a candidate can see it exists.
    return <circle cx={placed.x} cy={placed.y} r={2.5} className="fill-evergreen-900/20" />;
  }
  const startY = placed.y - (lines.length - 1) * 8;
  return (
    <text
      x={placed.x}
      y={startY}
      textAnchor="middle"
      dominantBaseline="middle"
      className={active ? "fill-evergreen-900 font-bold" : placed.tone === "soft" ? "fill-ink-soft font-medium" : "fill-evergreen-950 font-semibold"}
      style={{ fontSize: 13, fontFamily: "var(--font-sans, system-ui)" }}
    >
      {lines.map((line, index) => (
        <tspan key={index} x={placed.x} dy={index === 0 ? 0 : 16}>{line}</tspan>
      ))}
    </text>
  );
}

export function VennView({ spec, highlight = null, className, hideValues }: Props) {
  const keys = regionKeysFor(spec.sets);
  const three = spec.sets === 3;
  const width = three ? 400 : 360;
  const height = three ? 296 : 244;
  const placed = three ? THREE_SET : TWO_SET;
  const [a, b, c] = spec.labels;

  const ring = (cx: number, cy: number) => (
    <circle cx={cx} cy={cy} r={three ? 72 : 82} className="fill-evergreen-900/[0.045] stroke-evergreen-900/45" strokeWidth={1.6} />
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Venn diagram with sets ${spec.labels.join(", ")}`}
      className={className ?? "h-auto w-full max-w-xl"}
      data-venn-sets={spec.sets}
    >
      {/* Universal set */}
      <rect x={1} y={1} width={width - 2} height={height - 2} rx={10} className="fill-white stroke-evergreen-900/25" strokeWidth={1.2} />
      <text x={12} y={20} className="fill-ink-soft font-semibold" style={{ fontSize: 12 }}>{spec.universalLabel || "ξ"}</text>

      {three ? (
        <>
          {ring(160, 112)}
          {ring(240, 112)}
          {ring(200, 186)}
          <text x={160} y={26} textAnchor="middle" className="fill-evergreen-900 font-bold" style={{ fontSize: 14 }}>{a}</text>
          <text x={240} y={26} textAnchor="middle" className="fill-evergreen-900 font-bold" style={{ fontSize: 14 }}>{b}</text>
          <text x={200} y={290} textAnchor="middle" className="fill-evergreen-900 font-bold" style={{ fontSize: 14 }}>{c}</text>
        </>
      ) : (
        <>
          {ring(140, 118)}
          {ring(220, 118)}
          <text x={140} y={27} textAnchor="middle" className="fill-evergreen-900 font-bold" style={{ fontSize: 14 }}>{a}</text>
          <text x={220} y={27} textAnchor="middle" className="fill-evergreen-900 font-bold" style={{ fontSize: 14 }}>{b}</text>
        </>
      )}

      {placed.map((spot) => (
        <RegionText key={spot.key} placed={spot} spec={spec} hideValues={hideValues} highlight={highlight} />
      ))}

      {highlight && keys.includes(highlight as VennRegionKey) ? (
        <text x={width / 2} y={height - 6} textAnchor="middle" className="fill-evergreen-700 font-medium" style={{ fontSize: 11 }}>
          {regionLabel(spec, highlight as VennRegionKey)}
        </text>
      ) : null}
    </svg>
  );
}

export default VennView;
