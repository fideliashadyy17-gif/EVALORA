import type { AssessDiagramSpec } from "@/lib/assessDiagram";
import { hasMathRun, renderMathText } from "@/lib/content";

/**
 * Native SVG renderer for Assess Prep diagrams. Pure presentation from the
 * stored spec: labelled, gridlined where values must be read, and fluid-width
 * so it stays readable on a phone.
 *
 * Labels may mix prose with `$…$` mathematics — a table column headed
 * `$10 \le V < 14$`, a Venn region holding `$2x - 1$` — which is rendered
 * with KaTeX rather than printed as raw LaTeX.
 */
export function AssessDiagram({ spec }: { spec: AssessDiagramSpec }) {
  return (
    <figure className="my-4 overflow-x-auto rounded-xl border border-evergreen-900/15 bg-white p-3" aria-label={spec.title || spec.kind}>
      {spec.title ? <figcaption className="mb-2 text-sm font-semibold text-evergreen-950">{spec.title}</figcaption> : null}
      {renderKind(spec)}
    </figure>
  );
}

const ink = "#16241c";
const grid = "#d8e2da";
const accent = "#0a5c36";
const gold = "#c9a227";

/** HTML for a label that may contain $…$ mathematics. */
function labelHtml(value: string): string {
  return renderMathText(String(value ?? ""));
}

/** A label in an HTML context (a table cell, a figure caption). */
function Label({ value, className }: { value: string; className?: string }) {
  const text = String(value ?? "");
  if (!hasMathRun(text)) return <>{text}</>;
  return <span className={className} dangerouslySetInnerHTML={{ __html: labelHtml(text) }} />;
}

/**
 * A label on the SVG itself. Plain text stays a real <text> node so the
 * diagram keeps its crisp, scalable typography; mathematics is KaTeX output,
 * which is HTML and therefore has to live inside a <foreignObject>. The box is
 * sized generously because a browser clips a foreignObject to its bounds.
 */
function SvgLabel({
  value, x, y, anchor = "start", size = 12, weight, fill = ink, rotate,
}: {
  value: string;
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
  size?: number;
  weight?: number;
  fill?: string;
  rotate?: string;
}) {
  const text = String(value ?? "");
  if (!text) return null;
  if (!hasMathRun(text)) {
    return (
      <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={weight} fill={fill} transform={rotate}>
        {text}
      </text>
    );
  }
  const width = Math.max(30, Math.round(text.length * size * 0.62) + 18);
  const height = Math.round(size * 2.2);
  const left = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  return (
    <foreignObject x={left} y={y - size * 1.2} width={width} height={height} transform={rotate}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          fontSize: `${size}px`,
          fontWeight: weight,
          color: fill,
          whiteSpace: "nowrap",
        }}
        dangerouslySetInnerHTML={{ __html: labelHtml(text) }}
      />
    </foreignObject>
  );
}

function renderKind(spec: AssessDiagramSpec) {
  switch (spec.kind) {
    case "tape": return <Tape spec={spec} />;
    case "double_number_line": return <DoubleLine spec={spec} />;
    case "venn2": return <Venn spec={spec} />;
    case "stem_leaf": return <StemLeaf spec={spec} />;
    case "table": return <Table spec={spec} />;
    case "shape_pattern": return <Shapes spec={spec} />;
    case "grid_pattern": return <GridPattern spec={spec} />;
    default: return <Axes spec={spec} />;
  }
}

function Tape({ spec }: { spec: AssessDiagramSpec }) {
  const rows = spec.tapeRows ?? [];
  const width = 640; const rowH = 44;
  return (
    <svg viewBox={`0 0 ${width} ${rows.length * rowH + 8}`} className="w-full min-w-[320px]" role="img">
      {rows.map((row, ri) => {
        const total = row.segments.reduce((a, g) => a + g.span, 0) || 1;
        let x = 120;
        return (
          <g key={ri}>
            <SvgLabel value={row.label} x={4} y={ri * rowH + 30} size={14} weight={600} />
            {row.segments.map((seg, si) => {
              const w = (seg.span / total) * (width - 132);
              const el = (
                <g key={si}>
                  <rect x={x} y={ri * rowH + 6} width={w} height={32} fill={seg.shade ? gold : "#e7efe9"} stroke={accent} strokeWidth={1.4} />
                  <SvgLabel value={seg.label} x={x + w / 2} y={ri * rowH + 27} anchor="middle" size={13} weight={600} />
                </g>
              );
              x += w;
              return el;
            })}
          </g>
        );
      })}
    </svg>
  );
}

function DoubleLine({ spec }: { spec: AssessDiagramSpec }) {
  const lines = spec.lines ?? [];
  const width = 640; const left = 130; const right = width - 16;
  return (
    <svg viewBox={`0 0 ${width} ${lines.length * 74 + 10}`} className="w-full min-w-[320px]" role="img">
      {lines.map((line, li) => {
        const y = li * 74 + 38;
        const sx = (at: number) => left + (at / (line.max || 1)) * (right - left);
        return (
          <g key={li}>
            <SvgLabel value={line.label} x={4} y={y + 4} size={13} weight={600} />
            <line x1={left} y1={y} x2={right} y2={y} stroke={accent} strokeWidth={2} />
            {line.ticks.map((t, ti) => (
              <g key={ti}>
                <line x1={sx(t.at)} y1={y - 7} x2={sx(t.at)} y2={y + 7} stroke={accent} strokeWidth={2} />
                <SvgLabel value={t.label} x={sx(t.at)} y={li === 0 ? y - 14 : y + 26} anchor="middle" size={12.5} />
              </g>
            ))}
            <SvgLabel value={line.unit} x={right} y={y - 16} anchor="end" size={11.5} />
          </g>
        );
      })}
    </svg>
  );
}

function Venn({ spec }: { spec: AssessDiagramSpec }) {
  const v = spec.venn;
  if (!v) return null;
  // A question that asks "which set is shaded?" prints exactly one shaded
  // region. It is drawn as an explicit path beneath the circle outlines so
  // the shading never hides the numbers written in the regions.
  const cx1 = 185; const cx2 = 285; const cy0 = 155; const rad = 105;
  const shadedPath = (() => {
    switch (v.shaded) {
      // "left" / "right" / "union" shade whole discs; the rest shade the
      // region named by the paper (B only, A only, the overlap, outside).
      case "left":
        return `M${cx1 - rad},${cy0}a${rad},${rad} 0 1,0 ${rad * 2},0a${rad},${rad} 0 1,0 ${-rad * 2},0`;
      case "right":
        return `M${cx2 - rad},${cy0}a${rad},${rad} 0 1,0 ${rad * 2},0a${rad},${rad} 0 1,0 ${-rad * 2},0`;
      case "union":
      case "rightOnly":
      case "leftOnly":
      case "both":
      case "outside":
        return null;
      default:
        return null;
    }
  })();
  return (
    <svg viewBox="0 0 460 300" className="mx-auto w-full max-w-[460px]" role="img">
      <rect x={8} y={8} width={444} height={284} fill="none" stroke={ink} strokeWidth={1.6} />
      <SvgLabel value={v.universalLabel ?? "ξ"} x={20} y={32} size={14} weight={700} />
      {shadedPath ? <path d={shadedPath} fill="#0a5c36" fillOpacity={0.22} /> : null}
      <circle cx={cx1} cy={cy0} r={rad} fill="#0a5c36" fillOpacity={v.shaded ? 0 : 0.13} stroke={accent} strokeWidth={2} />
      <circle cx={cx2} cy={cy0} r={rad} fill="#c9a227" fillOpacity={v.shaded ? 0 : 0.18} stroke="#8a6d14" strokeWidth={2} />
      <SvgLabel value={v.leftLabel} x={140} y={78} anchor="middle" size={15} weight={700} fill={accent} />
      <SvgLabel value={v.rightLabel} x={330} y={78} anchor="middle" size={15} weight={700} fill="#8a6d14" />
      <SvgLabel value={v.leftOnly} x={150} y={162} anchor="middle" size={17} weight={700} />
      <SvgLabel value={v.both} x={235} y={162} anchor="middle" size={17} weight={700} />
      <SvgLabel value={v.rightOnly} x={320} y={162} anchor="middle" size={17} weight={700} />
      <SvgLabel value={v.outside} x={428} y={278} anchor="end" size={16} weight={700} />
    </svg>
  );
}

function StemLeaf({ spec }: { spec: AssessDiagramSpec }) {
  const rows = spec.stemRows ?? [];
  const backToBack = rows.some((r) => r.left);
  return (
    <div className="overflow-x-auto">
      <table className="mx-auto border-collapse text-center font-mono text-[15px] text-ink">
        <thead>
          <tr className="text-sm">
            {backToBack && <th className="px-3 py-1 text-right font-sans font-semibold"><Label value={spec.leftTitle ?? ""} /></th>}
            {backToBack && <th className="border-x-2 border-evergreen-800 px-3 py-1 font-sans font-semibold">Stem</th>}
            {!backToBack && <th className="border-r-2 border-evergreen-800 px-3 py-1" aria-label="stem" />}
            <th className="px-3 py-1 text-left font-sans font-semibold">{backToBack ? <Label value={spec.rightTitle ?? ""} /> : "Leaves"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {backToBack && <td className="px-3 py-0.5 text-right tracking-widest">{(r.left ?? []).join(" ")}</td>}
              <td className={`px-3 py-0.5 font-bold ${backToBack ? "border-x-2 border-evergreen-800" : "border-r-2 border-evergreen-800"}`}>{r.stem}</td>
              <td className="px-3 py-0.5 text-left tracking-widest">{r.leaves.join(" ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {spec.stemKey ? <p className="mt-2 text-center text-sm text-ink-soft">Key: <Label value={spec.stemKey} /></p> : null}
    </div>
  );
}

function Table({ spec }: { spec: AssessDiagramSpec }) {
  const cols = spec.columns?.length ?? 0;
  return (
    <div className="overflow-x-auto">
      {/* Wide tables keep a readable cell width and scroll sideways on a
          phone rather than crushing every column into the screen width. */}
      <table className="w-full border-collapse text-sm text-ink" style={cols > 6 ? { minWidth: `${cols * 76}px` } : undefined}>
        <thead>
          <tr>{(spec.columns ?? []).map((c, i) => <th key={i} className="border border-evergreen-900/25 bg-evergreen-50 px-3 py-2 text-left font-semibold"><Label value={String(c ?? "")} /></th>)}</tr>
        </thead>
        <tbody>
          {(spec.rows ?? []).map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className="border border-evergreen-900/20 px-3 py-1.5 tabular-nums"><Label value={String(c ?? "")} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Shapes({ spec }: { spec: AssessDiagramSpec }) {
  const pats = spec.patterns ?? [];
  const cell = 17;
  return (
    <div className="flex flex-wrap gap-5">
      {pats.map((p, i) => {
        // Explicit dot columns (a pattern built from vertical columns of
        // counters) are drawn exactly as specified: the paper's shading
        // distinguishes the fixed column from the growing ones.
        if (p.columns?.length) {
          const cellC = 17;
          const tallest = Math.max(...p.columns.map((c) => c.count));
          const wC = p.columns.length * cellC + 8;
          const hC = tallest * cellC + 8;
          return (
            <div key={i} className="text-center">
              <svg viewBox={`0 0 ${wC} ${hC}`} className="mx-auto" style={{ width: Math.max(48, wC) }} role="img" aria-label={p.label}>
                {p.columns.map((col, ci) =>
                  Array.from({ length: col.count }, (_, k) => (
                    <circle
                      key={`${ci}-${k}`}
                      cx={8 + ci * cellC}
                      cy={hC - 8 - k * cellC}
                      r={6}
                      fill={col.shade ? accent : "#e7efe9"}
                      stroke={col.shade ? "#06351f" : accent}
                      strokeWidth={1.4}
                    />
                  )),
                )}
              </svg>
              <p className="mt-1 text-sm font-semibold text-ink"><Label value={p.label} /></p>
            </div>
          );
        }
        // Square counts (4, 9, 16…) are drawn as actual square arrangements;
        // other counts run in rows of at most 10. Dots are stacked below any
        // squares (never drawn over them), and the viewBox is tall enough
        // for every dot row — previously dot patterns were clipped to the
        // height of the squares row, hiding most dots.
        const sq = p.squares;
        const sqrtSq = Math.round(Math.sqrt(sq));
        const cols = sq > 1 && sqrtSq * sqrtSq === sq ? sqrtSq : Math.min(10, Math.max(1, sq));
        const rowsN = sq ? Math.ceil(sq / cols) : 0;
        const dots = p.dots ?? 0;
        const dc = dots ? Math.ceil(Math.sqrt(dots)) : 0;
        const dotRows = dots ? Math.ceil(dots / dc) : 0;
        const squaresH = rowsN * cell;
        const w = Math.max(cols * cell, dc * cell) + 8;
        const h = squaresH + dotRows * cell + 8;
        return (
          <div key={i} className="text-center">
            <svg viewBox={`0 0 ${w} ${h}`} className="mx-auto" style={{ width: Math.max(60, w) }} role="img" aria-label={p.label}>
              {Array.from({ length: sq }, (_, k) => (
                <rect key={k} x={4 + (k % cols) * cell} y={4 + Math.floor(k / cols) * cell} width={cell - 2} height={cell - 2} fill="#e7efe9" stroke={accent} strokeWidth={1.4} />
              ))}
              {Array.from({ length: dots }, (_, k) => (
                <circle key={`d${k}`} cx={8 + (k % dc) * cell} cy={8 + squaresH + Math.floor(k / dc) * cell} r={5} fill={gold} stroke="#8a6d14" />
              ))}
            </svg>
            <p className="mt-1 text-sm font-semibold text-ink"><Label value={p.label} /></p>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Rectangular grids of tiles or pipes. `core_border` draws a pale outer ring
 * around a green core (a courtyard-tile pattern); `solid` draws a uniform
 * grid (a stacked crate of pipes).
 */
function GridPattern({ spec }: { spec: AssessDiagramSpec }) {
  const grids = spec.gridPatterns ?? [];
  const cell = 18;
  return (
    <div className="flex flex-wrap items-end gap-6">
      {grids.map((g, i) => {
        const w = g.cols * cell + 8;
        const h = g.rows * cell + 8;
        return (
          <div key={i} className="text-center">
            <svg viewBox={`0 0 ${w} ${h}`} className="mx-auto" style={{ width: Math.max(60, w) }} role="img" aria-label={g.label}>
              {Array.from({ length: g.rows * g.cols }, (_, k) => {
                const c = k % g.cols;
                const r = Math.floor(k / g.cols);
                const onEdge = g.style === "core_border" && (c === 0 || c === g.cols - 1 || r === 0 || r === g.rows - 1);
                return (
                  <rect
                    key={k}
                    x={4 + c * cell}
                    y={4 + r * cell}
                    width={cell - 2}
                    height={cell - 2}
                    rx={2}
                    fill={onEdge ? "#e8e2c8" : "#0a5c36"}
                    fillOpacity={onEdge ? 1 : 0.78}
                    stroke={onEdge ? "#8a6d14" : "#06351f"}
                    strokeWidth={1.1}
                  />
                );
              })}
            </svg>
            <p className="mt-1 text-sm font-semibold text-ink"><Label value={g.label} /></p>
          </div>
        );
      })}
    </div>
  );
}

/** Shared axis renderer: box plot, cumulative curve, histogram, term graph. */
function Axes({ spec }: { spec: AssessDiagramSpec }) {
  const W = 660; const H = 380; const L = 58; const R = 14; const T = 12; const B = 46;
  const pw = W - L - R; const ph = H - T - B;
  let xMin = spec.xMin ?? 0; let xMax = spec.xMax ?? 10; const yMin = spec.yMin ?? 0; let yMax = spec.yMax ?? 10;
  if (spec.kind === "histogram" && spec.bars?.length) {
    xMin = spec.xMin ?? Math.min(...spec.bars.map((b) => b.from));
    xMax = spec.xMax ?? Math.max(...spec.bars.map((b) => b.to));
    yMax = spec.yMax ?? Math.ceil(Math.max(...spec.bars.map((b) => b.height)) * 1.15);
  }
  if ((spec.kind === "cumulative_curve" || spec.kind === "term_graph") && spec.points?.length) {
    xMax = spec.xMax ?? Math.max(...spec.points.map((p) => p[0]));
    yMax = spec.yMax ?? Math.max(...spec.points.map((p) => p[1]));
  }
  if (spec.kind === "box_plot" && spec.fiveNumber) {
    xMin = spec.xMin ?? Math.floor(spec.fiveNumber.min - (spec.fiveNumber.max - spec.fiveNumber.min) * 0.08);
    xMax = spec.xMax ?? Math.ceil(spec.fiveNumber.max + (spec.fiveNumber.max - spec.fiveNumber.min) * 0.08);
  }
  if (spec.kind === "box_plot" && spec.boxPlots?.length) {
    const lo = Math.min(...spec.boxPlots.map((b) => b.min)); const hi = Math.max(...spec.boxPlots.map((b) => b.max));
    xMin = spec.xMin ?? Math.floor(lo - (hi - lo) * 0.08);
    xMax = spec.xMax ?? Math.ceil(hi + (hi - lo) * 0.08);
    yMax = spec.boxPlots.length;
  }
  const sx = (x: number) => L + ((x - xMin) / (xMax - xMin || 1)) * pw;
  const sy = (y: number) => T + ph - ((y - yMin) / (yMax - yMin || 1)) * ph;
  const ticks = (min: number, max: number, count = 8) => {
    const step = (max - min) / count;
    const nice = Math.pow(10, Math.floor(Math.log10(step || 1)));
    const st = Math.max(nice, Math.round(step / nice) * nice) || 1;
    const out: number[] = [];
    for (let v = Math.ceil(min / st) * st; v <= max + 1e-9; v = Math.round((v + st) * 1e6) / 1e6) out.push(v);
    return out;
  };
  const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : String(Math.round(v * 100) / 100));
  const pts = spec.points ?? [];
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(" ");
  const f = spec.fiveNumber;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[340px]" role="img">
      {/* A box plot's vertical axis carries no scale (the boxes sit in
          lanes), so y gridlines/tick numbers would be meaningless noise. */}
      {spec.kind !== "box_plot" && ticks(yMin, yMax, 6).map((v) => (
        <g key={`y${v}`}>
          <line x1={L} y1={sy(v)} x2={W - R} y2={sy(v)} stroke={grid} />
          <text x={L - 6} y={sy(v) + 4} textAnchor="end" fontSize={11.5} fill={ink}>{fmt(v)}</text>
        </g>
      ))}
      {ticks(xMin, xMax, 8).map((v) => (
        <g key={`x${v}`}>
          <line x1={sx(v)} y1={T} x2={sx(v)} y2={T + ph} stroke={grid} />
          <text x={sx(v)} y={T + ph + 18} textAnchor="middle" fontSize={11.5} fill={ink}>{fmt(v)}</text>
        </g>
      ))}
      <line x1={L} y1={T + ph} x2={W - R} y2={T + ph} stroke={ink} strokeWidth={1.6} />
      <line x1={L} y1={T} x2={L} y2={T + ph} stroke={ink} strokeWidth={1.6} />
      <SvgLabel value={spec.xLabel ?? ""} x={L + pw / 2} y={H - 4} anchor="middle" size={12.5} weight={600} />
      <SvgLabel
        value={spec.yLabel ?? ""}
        x={15}
        y={T + ph / 2}
        anchor="middle"
        size={12.5}
        weight={600}
        rotate={`rotate(-90 15 ${T + ph / 2})`}
      />

      {spec.kind === "histogram" && (spec.bars ?? []).map((b, i) => (
        <rect key={i} x={sx(b.from)} y={sy(b.height)} width={Math.max(1, sx(b.to) - sx(b.from))} height={sy(0) - sy(b.height)} fill="#0a5c36" fillOpacity={0.75} stroke="#06351f" strokeWidth={1} />
      ))}

      {(spec.kind === "cumulative_curve" || spec.kind === "term_graph") && (
        <g>
          {spec.joinPoints && pts.length > 1 && <path d={path} fill="none" stroke={accent} strokeWidth={2.4} />}
          {pts.map((p, i) => <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r={spec.kind === "term_graph" ? 4.5 : 3.4} fill={gold} stroke="#8a6d14" strokeWidth={1.2} />)}
        </g>
      )}

      {spec.kind === "box_plot" && (spec.boxPlots ?? []).map((b, i) => {
        const cy = spec.boxPlots!.length - i - 0.5;
        return (
          <g key={`bp${i}`}>
            <line x1={sx(b.min)} y1={sy(cy)} x2={sx(b.max)} y2={sy(cy)} stroke={accent} strokeWidth={2.2} />
            <line x1={sx(b.min)} y1={sy(cy - 0.22)} x2={sx(b.min)} y2={sy(cy + 0.22)} stroke={accent} strokeWidth={2.2} />
            <line x1={sx(b.max)} y1={sy(cy - 0.22)} x2={sx(b.max)} y2={sy(cy + 0.22)} stroke={accent} strokeWidth={2.2} />
            <rect x={sx(b.q1)} y={sy(cy + 0.3)} width={Math.max(2, sx(b.q3) - sx(b.q1))} height={sy(cy - 0.3) - sy(cy + 0.3)} fill="#c9a227" fillOpacity={0.35} stroke={accent} strokeWidth={2} />
            <line x1={sx(b.median)} y1={sy(cy + 0.3)} x2={sx(b.median)} y2={sy(cy - 0.3)} stroke={accent} strokeWidth={2.6} />
            <SvgLabel value={b.label} x={L + 4} y={sy(cy + 0.48)} size={12} weight={700} />
          </g>
        );
      })}

      {spec.kind === "box_plot" && f && (
        <g>
          <line x1={sx(f.min)} y1={sy(0.5)} x2={sx(f.max)} y2={sy(0.5)} stroke={accent} strokeWidth={2.2} />
          <line x1={sx(f.min)} y1={sy(0.28)} x2={sx(f.min)} y2={sy(0.72)} stroke={accent} strokeWidth={2.2} />
          <line x1={sx(f.max)} y1={sy(0.28)} x2={sx(f.max)} y2={sy(0.72)} stroke={accent} strokeWidth={2.2} />
          <rect x={sx(f.q1)} y={sy(0.78)} width={Math.max(2, sx(f.q3) - sx(f.q1))} height={sy(0.22) - sy(0.78)} fill="#c9a227" fillOpacity={0.35} stroke={accent} strokeWidth={2} />
          <line x1={sx(f.median)} y1={sy(0.78)} x2={sx(f.median)} y2={sy(0.22)} stroke={accent} strokeWidth={2.6} />
        </g>
      )}
    </svg>
  );
}
