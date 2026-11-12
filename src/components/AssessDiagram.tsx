import type { AssessDiagramSpec } from "@/lib/assessDiagram";

/**
 * Native SVG renderer for Assess Prep diagrams. Pure presentation from the
 * stored spec: labelled, gridlined where values must be read, and fluid-width
 * so it stays readable on a phone.
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

function renderKind(spec: AssessDiagramSpec) {
  switch (spec.kind) {
    case "tape": return <Tape spec={spec} />;
    case "double_number_line": return <DoubleLine spec={spec} />;
    case "venn2": return <Venn spec={spec} />;
    case "stem_leaf": return <StemLeaf spec={spec} />;
    case "table": return <Table spec={spec} />;
    case "shape_pattern": return <Shapes spec={spec} />;
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
            <text x={4} y={ri * rowH + 30} fontSize={14} fontWeight={600} fill={ink}>{row.label}</text>
            {row.segments.map((seg, si) => {
              const w = (seg.span / total) * (width - 132);
              const el = (
                <g key={si}>
                  <rect x={x} y={ri * rowH + 6} width={w} height={32} fill={seg.shade ? gold : "#e7efe9"} stroke={accent} strokeWidth={1.4} />
                  <text x={x + w / 2} y={ri * rowH + 27} textAnchor="middle" fontSize={13} fontWeight={600} fill={ink}>{seg.label}</text>
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
            <text x={4} y={y + 4} fontSize={13} fontWeight={600} fill={ink}>{line.label}</text>
            <line x1={left} y1={y} x2={right} y2={y} stroke={accent} strokeWidth={2} />
            {line.ticks.map((t, ti) => (
              <g key={ti}>
                <line x1={sx(t.at)} y1={y - 7} x2={sx(t.at)} y2={y + 7} stroke={accent} strokeWidth={2} />
                <text x={sx(t.at)} y={li === 0 ? y - 14 : y + 26} textAnchor="middle" fontSize={12.5} fill={ink}>{t.label}</text>
              </g>
            ))}
            <text x={right} y={y - 16} textAnchor="end" fontSize={11.5} fill={ink}>{line.unit}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Venn({ spec }: { spec: AssessDiagramSpec }) {
  const v = spec.venn;
  if (!v) return null;
  return (
    <svg viewBox="0 0 460 300" className="mx-auto w-full max-w-[460px]" role="img">
      <rect x={8} y={8} width={444} height={284} fill="none" stroke={ink} strokeWidth={1.6} />
      <text x={20} y={32} fontSize={14} fontWeight={700} fill={ink}>{v.universalLabel ?? "ξ"}</text>
      <circle cx={185} cy={155} r={105} fill="#0a5c36" fillOpacity={0.13} stroke={accent} strokeWidth={2} />
      <circle cx={285} cy={155} r={105} fill="#c9a227" fillOpacity={0.18} stroke="#8a6d14" strokeWidth={2} />
      <text x={140} y={78} textAnchor="middle" fontSize={15} fontWeight={700} fill={accent}>{v.leftLabel}</text>
      <text x={330} y={78} textAnchor="middle" fontSize={15} fontWeight={700} fill="#8a6d14">{v.rightLabel}</text>
      <text x={150} y={162} textAnchor="middle" fontSize={17} fontWeight={700} fill={ink}>{v.leftOnly}</text>
      <text x={235} y={162} textAnchor="middle" fontSize={17} fontWeight={700} fill={ink}>{v.both}</text>
      <text x={320} y={162} textAnchor="middle" fontSize={17} fontWeight={700} fill={ink}>{v.rightOnly}</text>
      <text x={428} y={278} textAnchor="end" fontSize={16} fontWeight={700} fill={ink}>{v.outside}</text>
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
            {backToBack && <th className="px-3 py-1 text-right font-sans font-semibold">{spec.leftTitle ?? ""}</th>}
            {backToBack && <th className="border-x-2 border-evergreen-800 px-3 py-1 font-sans font-semibold">Stem</th>}
            {!backToBack && <th className="border-r-2 border-evergreen-800 px-3 py-1" aria-label="stem" />}
            <th className="px-3 py-1 text-left font-sans font-semibold">{backToBack ? (spec.rightTitle ?? "") : "Leaves"}</th>
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
      {spec.stemKey ? <p className="mt-2 text-center text-sm text-ink-soft">Key: {spec.stemKey}</p> : null}
    </div>
  );
}

function Table({ spec }: { spec: AssessDiagramSpec }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm text-ink">
        <thead>
          <tr>{(spec.columns ?? []).map((c, i) => <th key={i} className="border border-evergreen-900/25 bg-evergreen-50 px-3 py-2 text-left font-semibold">{c}</th>)}</tr>
        </thead>
        <tbody>
          {(spec.rows ?? []).map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className="border border-evergreen-900/20 px-3 py-1.5 tabular-nums">{c}</td>)}</tr>
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
        const cols = Math.min(10, Math.max(1, p.squares));
        const rowsN = Math.ceil(p.squares / cols) || 1;
        const dots = p.dots ?? 0;
        const w = Math.max(cols * cell + 8, dots ? Math.ceil(Math.sqrt(dots)) * cell + 8 : 0);
        return (
          <div key={i} className="text-center">
            <svg viewBox={`0 0 ${w} ${rowsN * cell + 8}`} className="mx-auto" style={{ width: Math.max(60, w) }} role="img" aria-label={p.label}>
              {Array.from({ length: p.squares }, (_, k) => (
                <rect key={k} x={4 + (k % cols) * cell} y={4 + Math.floor(k / cols) * cell} width={cell - 2} height={cell - 2} fill="#e7efe9" stroke={accent} strokeWidth={1.4} />
              ))}
              {Array.from({ length: dots }, (_, k) => {
                const dc = Math.ceil(Math.sqrt(dots)) || 1;
                return <circle key={`d${k}`} cx={8 + (k % dc) * cell} cy={8 + Math.floor(k / dc) * cell} r={5} fill={gold} stroke="#8a6d14" />;
              })}
            </svg>
            <p className="mt-1 text-sm font-semibold text-ink">{p.label}</p>
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
      {ticks(yMin, yMax, 6).map((v) => (
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
      <text x={L + pw / 2} y={H - 4} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={ink}>{spec.xLabel}</text>
      <text x={15} y={T + ph / 2} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={ink} transform={`rotate(-90 15 ${T + ph / 2})`}>{spec.yLabel}</text>

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
            <text x={L + 4} y={sy(cy + 0.48)} fontSize={12} fontWeight={700} fill={ink}>{b.label}</text>
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
