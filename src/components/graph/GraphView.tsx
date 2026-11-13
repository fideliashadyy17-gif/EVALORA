import {
  GRAPH_VIEW,
  formatAxisLabel,
  graphIntersections,
  graphLayout,
  gridValues,
  sampleGraphFunction,
  type GraphSpec,
} from "@/lib/graphSpec";

/**
 * Read-only renderer for a graph specification. Server-component safe: no
 * hooks, no browser APIs. The editor uses the same specification, so what a
 * teacher authors, a candidate reads and a marker inspects is the same SVG.
 */
export function GraphView({
  spec,
  className,
  ariaLabel,
  compact = false,
}: {
  spec: GraphSpec;
  className?: string;
  ariaLabel?: string;
  compact?: boolean;
}) {
  const layout = graphLayout(spec);
  const { toX, toY, xTicks, yTicks, xStep, yStep } = layout;
  const sampled = spec.functions
    .filter((fn) => fn.visible && fn.expression.trim())
    .map((fn) => sampleGraphFunction(fn, spec));
  const intersections = spec.domain.showIntersections ? graphIntersections(spec, sampled) : [];
  const xAxisY = toY(Math.min(Math.max(0, spec.domain.yMin), spec.domain.yMax));
  const yAxisX = toX(Math.min(Math.max(0, spec.domain.xMin), spec.domain.xMax));
  const gridX = spec.domain.gridStep ? gridValues(spec.domain.xMin, spec.domain.xMax, spec.domain.gridStep) : xTicks;
  const gridY = spec.domain.gridStep ? gridValues(spec.domain.yMin, spec.domain.yMax, spec.domain.gridStep) : yTicks;

  return (
    <figure className={`graph-figure ${className ?? ""}`}>
      {spec.title ? <figcaption className="graph-title">{spec.title}</figcaption> : null}
      <div className="graph-scroll">
        <svg
          viewBox={`0 0 ${GRAPH_VIEW.width} ${GRAPH_VIEW.height}`}
          role="img"
          aria-label={ariaLabel ?? spec.title ?? "Coordinate graph"}
          className="graph-svg"
        >
          <rect x={0} y={0} width={GRAPH_VIEW.width} height={GRAPH_VIEW.height} fill="#ffffff" />
          {spec.domain.showGrid && (
            <g aria-hidden>
              {gridX.map((x) => (
                <line key={`gx-${x}`} x1={toX(x)} y1={GRAPH_VIEW.top} x2={toX(x)} y2={GRAPH_VIEW.height - GRAPH_VIEW.bottom}
                  stroke={Math.abs(x % (xStep * 5)) < 1e-9 ? "#cdd9d3" : "#e8eeeb"} strokeWidth={1} />
              ))}
              {gridY.map((y) => (
                <line key={`gy-${y}`} x1={GRAPH_VIEW.left} y1={toY(y)} x2={GRAPH_VIEW.width - GRAPH_VIEW.right} y2={toY(y)}
                  stroke={Math.abs(y % (yStep * 5)) < 1e-9 ? "#cdd9d3" : "#e8eeeb"} strokeWidth={1} />
              ))}
            </g>
          )}
          {spec.domain.showAxes && (
            <g aria-hidden>
              <line x1={GRAPH_VIEW.left} y1={xAxisY} x2={GRAPH_VIEW.width - GRAPH_VIEW.right} y2={xAxisY} stroke="#16241c" strokeWidth={1.6} />
              <line x1={yAxisX} y1={GRAPH_VIEW.top} x2={yAxisX} y2={GRAPH_VIEW.height - GRAPH_VIEW.bottom} stroke="#16241c" strokeWidth={1.6} />
              <polygon points={`${GRAPH_VIEW.width - GRAPH_VIEW.right},${xAxisY} ${GRAPH_VIEW.width - GRAPH_VIEW.right - 8},${xAxisY - 4} ${GRAPH_VIEW.width - GRAPH_VIEW.right - 8},${xAxisY + 4}`} fill="#16241c" />
              <polygon points={`${yAxisX},${GRAPH_VIEW.top} ${yAxisX - 4},${GRAPH_VIEW.top + 8} ${yAxisX + 4},${GRAPH_VIEW.top + 8}`} fill="#16241c" />
              <text x={GRAPH_VIEW.width - GRAPH_VIEW.right + 4} y={xAxisY + 4} fontSize={13} fill="#16241c" fontStyle="italic">x</text>
              <text x={yAxisX + 6} y={GRAPH_VIEW.top + 2} fontSize={13} fill="#16241c" fontStyle="italic">y</text>
            </g>
          )}
          {spec.domain.showCoordinates && (
            <g aria-hidden>
              {xTicks.map((x) => (
                <text key={`tx-${x}`} x={toX(x)} y={xAxisY + 16} fontSize={11} textAnchor="middle" fill="#4b5a52">
                  {formatAxisLabel(x)}
                </text>
              ))}
              {yTicks.map((y) => (
                <text key={`ty-${y}`} x={yAxisX - 7} y={toY(y) + 4} fontSize={11} textAnchor="end" fill="#4b5a52">
                  {formatAxisLabel(y)}
                </text>
              ))}
            </g>
          )}
          {(spec.regions ?? []).filter((r) => r.visible).map((r) => {
            const x = Math.min(toX(r.x1), toX(r.x2));
            const y = Math.min(toY(r.y1), toY(r.y2));
            const w = Math.abs(toX(r.x2) - toX(r.x1));
            const h = Math.abs(toY(r.y2) - toY(r.y1));
            return (
              <g key={r.id}>
                <rect x={x} y={y} width={w} height={h} fill={r.color} fillOpacity={0.14} stroke={r.color} strokeWidth={1.2} strokeDasharray="6 4" />
                {r.label ? (
                  <text x={x + 5} y={y + 15} fontSize={11} fill={r.color} fontWeight={600}>{r.label}</text>
                ) : null}
              </g>
            );
          })}
          {(spec.strokes ?? []).filter((s) => s.visible && s.points.length >= 2).map((s) => (
            <polyline
              key={s.id}
              points={s.points.map((p) => `${toX(p.x)},${toY(p.y)}`).join(" ")}
              fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round"
            />
          ))}
          {spec.segments.filter((s) => s.visible).map((s) => (
            <g key={s.id}>
              <line x1={toX(s.x1)} y1={toY(s.y1)} x2={toX(s.x2)} y2={toY(s.y2)}
                stroke={s.color} strokeWidth={s.width} strokeDasharray={dash(s.style)} strokeLinecap="round" />
              {s.label ? (
                <text x={(toX(s.x1) + toX(s.x2)) / 2 + 4} y={(toY(s.y1) + toY(s.y2)) / 2 - 6} fontSize={12} fill={s.color}>{s.label}</text>
              ) : null}
            </g>
          ))}
          {sampled.map((fn) => (
            <g key={fn.id}>
              {fn.path ? (
                <path d={fn.path} fill="none" stroke={fn.color} strokeWidth={fn.width} strokeDasharray={dash(fn.style)} strokeLinecap="round" strokeLinejoin="round" />
              ) : null}
            </g>
          ))}
          {intersections.map((point) => (
            <g key={`i-${point.x}-${point.y}`}>
              <circle cx={toX(point.x)} cy={toY(point.y)} r={4.5} fill="#fff" stroke={point.color} strokeWidth={2} />
              <text x={toX(point.x) + 7} y={toY(point.y) - 7} fontSize={11} fill={point.color}>{point.label}</text>
            </g>
          ))}
          {spec.points.filter((p) => p.visible).map((p) => (
            <g key={p.id}>
              <circle cx={toX(p.x)} cy={toY(p.y)} r={5} fill={p.open ? "#fff" : p.color} stroke={p.color} strokeWidth={2} />
              {(p.showCoordinates || p.label) && (
                <text x={toX(p.x) + 8} y={toY(p.y) - 8} fontSize={12} fill={p.color} fontWeight={600}>
                  {p.label ? `${p.label} ` : ""}
                  {p.showCoordinates ? `(${formatAxisLabel(p.x)}, ${formatAxisLabel(p.y)})` : ""}
                </text>
              )}
            </g>
          ))}
          {spec.annotations.filter((a) => a.text.trim()).map((a) => (
            <g key={a.id}>
              <text x={toX(a.x)} y={toY(a.y)} fontSize={12} fill={a.color}>{a.text}</text>
            </g>
          ))}
        </svg>
      </div>
      {!compact && spec.domain.showLegend && sampled.length > 0 && (
        <ul className="graph-legend">
          {sampled.map((fn) => (
            <li key={fn.id}>
              <span className="graph-legend-line" style={{ background: fn.color }} aria-hidden />
              <span>{fn.label}</span>
              {fn.error ? <span className="graph-error">· {fn.error}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

function dash(style: string): string | undefined {
  if (style === "dashed") return "9 6";
  if (style === "dotted") return "2 5";
  return undefined;
}
