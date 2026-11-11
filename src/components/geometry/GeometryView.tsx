import {
  GEOMETRY_VIEW,
  clipLineToRect,
  formatMeasurement,
  geometryLayout,
  geometryMeasurements,
  resolveGeometry,
  type GeometrySpec,
  type ResolvedLine,
  type ResolvedPoint,
} from "@/lib/geometrySpec";

/**
 * Read-only renderer for a geometry construction. Server-component safe and
 * driven entirely by the specification — the same figure a teacher builds is
 * what a candidate sees and what a marker inspects.
 */
export function GeometryView({
  spec,
  className,
  ariaLabel,
  compact = false,
}: {
  spec: GeometrySpec;
  className?: string;
  ariaLabel?: string;
  compact?: boolean;
}) {
  const layout = geometryLayout(spec);
  const { toX, toY, xTicks, yTicks } = layout;
  const resolved = resolveGeometry(spec);
  const measurements = geometryMeasurements(spec, resolved);
  const measureFor = (id: string) => measurements.filter((m) => m.id === id);
  const rect = { minX: spec.domain.xMin, maxX: spec.domain.xMax, minY: spec.domain.yMin, maxY: spec.domain.yMax };
  const xAxisY = toY(Math.min(Math.max(0, spec.domain.yMin), spec.domain.yMax));
  const yAxisX = toX(Math.min(Math.max(0, spec.domain.xMin), spec.domain.xMax));

  const lineEnds = (line: ResolvedLine): { a: { x: number; y: number }; b: { x: number; y: number } } | null => {
    if (line.kind === "segment" && line.b) return { a: line.a, b: line.b };
    if (!line.direction) return null;
    const clipped = clipLineToRect(line.a, line.direction, rect);
    if (!clipped) return null;
    if (line.kind === "ray") {
      // Keep the end that lies in the direction of travel; the other one is
      // behind the origin of the ray.
      const t1 = (clipped.x1 - line.a.x) * line.direction.dx + (clipped.y1 - line.a.y) * line.direction.dy;
      const t2 = (clipped.x2 - line.a.x) * line.direction.dx + (clipped.y2 - line.a.y) * line.direction.dy;
      const far = t1 >= t2 ? { x: clipped.x1, y: clipped.y1 } : { x: clipped.x2, y: clipped.y2 };
      return { a: line.a, b: far };
    }
    return { a: { x: clipped.x1, y: clipped.y1 }, b: { x: clipped.x2, y: clipped.y2 } };
  };

  const dash = (style: string) => (style === "dashed" ? "9 6" : style === "dotted" ? "2 5" : undefined);

  return (
    <figure className={`geometry-figure ${className ?? ""}`}>
      {spec.title ? <figcaption className="graph-title">{spec.title}</figcaption> : null}
      <div className="graph-scroll">
        <svg
          viewBox={`0 0 ${GEOMETRY_VIEW.width} ${GEOMETRY_VIEW.height}`}
          role="img"
          aria-label={ariaLabel ?? spec.title ?? "Geometric construction"}
          className="graph-svg"
        >
          <rect x={0} y={0} width={GEOMETRY_VIEW.width} height={GEOMETRY_VIEW.height} fill="#ffffff" />
          {spec.domain.showGrid && (
            <g aria-hidden>
              {xTicks.map((x) => (
                <line key={`gx-${x}`} x1={toX(x)} y1={GEOMETRY_VIEW.top} x2={toX(x)} y2={GEOMETRY_VIEW.height - GEOMETRY_VIEW.bottom} stroke="#e8eeeb" strokeWidth={1} />
              ))}
              {yTicks.map((y) => (
                <line key={`gy-${y}`} x1={GEOMETRY_VIEW.left} y1={toY(y)} x2={GEOMETRY_VIEW.width - GEOMETRY_VIEW.right} y2={toY(y)} stroke="#e8eeeb" strokeWidth={1} />
              ))}
            </g>
          )}
          {spec.domain.showAxes && (
            <g aria-hidden>
              <line x1={GEOMETRY_VIEW.left} y1={xAxisY} x2={GEOMETRY_VIEW.width - GEOMETRY_VIEW.right} y2={xAxisY} stroke="#8a9a91" strokeWidth={1.2} />
              <line x1={yAxisX} y1={GEOMETRY_VIEW.top} x2={yAxisX} y2={GEOMETRY_VIEW.height - GEOMETRY_VIEW.bottom} stroke="#8a9a91" strokeWidth={1.2} />
              {xTicks.filter((x) => x !== 0).map((x) => (
                <text key={`tx-${x}`} x={toX(x)} y={xAxisY + 14} fontSize={10} textAnchor="middle" fill="#6b7a72">{formatMeasurement(x, 2)}</text>
              ))}
              {yTicks.filter((y) => y !== 0).map((y) => (
                <text key={`ty-${y}`} x={yAxisX - 5} y={toY(y) + 3} fontSize={10} textAnchor="end" fill="#6b7a72">{formatMeasurement(y, 2)}</text>
              ))}
            </g>
          )}

          {spec.polygons.map((poly) => {
            const pts = poly.points.map((id) => resolved.points.get(id)).filter(Boolean) as ResolvedPoint[];
            if (pts.length < 3) return null;
            const points = pts.map((p) => `${toX(p.x)},${toY(p.y)}`).join(" ");
            const centroid = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
            const area = measureFor(poly.id);
            return (
              <g key={poly.id}>
                <polygon points={points} fill={poly.fill} fillOpacity={0.35} stroke={poly.color} strokeWidth={poly.width} strokeDasharray={dash(poly.style)} />
                {(poly.label || area.length > 0) && (
                  <text x={toX(centroid.x)} y={toY(centroid.y)} fontSize={11} textAnchor="middle" fill={poly.color} fontWeight={600}>
                    {poly.label ? `${poly.label} ` : ""}
                    {area.map((m) => m.text).join(" · ")}
                  </text>
                )}
              </g>
            );
          })}

          {spec.circles.map((circle) => {
            const center = resolved.points.get(circle.center);
            const through = resolved.points.get(circle.through);
            if (!center || !through) return null;
            const r = Math.hypot(through.x - center.x, through.y - center.y);
            const measurement = measureFor(circle.id);
            const rx = (r * (GEOMETRY_VIEW.width - GEOMETRY_VIEW.left - GEOMETRY_VIEW.right)) / Math.max(0.5, spec.domain.xMax - spec.domain.xMin);
            const ry = (r * (GEOMETRY_VIEW.height - GEOMETRY_VIEW.top - GEOMETRY_VIEW.bottom)) / Math.max(0.5, spec.domain.yMax - spec.domain.yMin);
            return (
              <g key={circle.id}>
                <ellipse cx={toX(center.x)} cy={toY(center.y)} rx={rx} ry={ry}
                  fill="none" stroke={circle.color} strokeWidth={circle.width} strokeDasharray={dash(circle.style)} />
                {measurement.length > 0 && (
                  <text x={toX((center.x + through.x) / 2)} y={toY((center.y + through.y) / 2) - 6} fontSize={11} fill={circle.color} fontWeight={600}>
                    {measurement[0].text}
                  </text>
                )}
              </g>
            );
          })}

          {resolved.lines.map((line) => {
            const ends = lineEnds(line);
            if (!ends) return null;
            const measurement = measureFor(line.id);
            return (
              <g key={line.id}>
                <line x1={toX(ends.a.x)} y1={toY(ends.a.y)} x2={toX(ends.b.x)} y2={toY(ends.b.y)}
                  stroke={line.color} strokeWidth={line.width} strokeDasharray={dash(line.style)} strokeLinecap="round" />
                {line.kind === "segment" && (line.label || measurement.length > 0) && (
                  <text
                    x={toX((ends.a.x + ends.b.x) / 2)}
                    y={toY((ends.a.y + ends.b.y) / 2) - 6}
                    fontSize={11}
                    fill={line.color}
                    fontWeight={600}
                  >
                    {line.label ? `${line.label} ` : ""}
                    {measurement.map((m) => m.text).join(" · ")}
                  </text>
                )}
              </g>
            );
          })}

          {spec.angles.map((angle) => {
            const a = resolved.points.get(angle.a);
            const v = resolved.points.get(angle.vertex);
            const b = resolved.points.get(angle.b);
            if (!a || !v || !b) return null;
            const angle1 = Math.atan2(toY(a.y) - toY(v.y), toX(a.x) - toX(v.x));
            const angle2 = Math.atan2(toY(b.y) - toY(v.y), toX(b.x) - toX(v.x));
            let delta = angle2 - angle1;
            while (delta <= -Math.PI) delta += Math.PI * 2;
            while (delta > Math.PI) delta -= Math.PI * 2;
            const radius = 26;
            const start = { x: toX(v.x) + Math.cos(angle1) * radius, y: toY(v.y) + Math.sin(angle1) * radius };
            const end = { x: toX(v.x) + Math.cos(angle1 + delta) * radius, y: toY(v.y) + Math.sin(angle1 + delta) * radius };
            const measurement = measureFor(angle.id);
            return (
              <g key={angle.id}>
                <path d={`M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 0 ${delta >= 0 ? 1 : 0} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`}
                  fill="none" stroke={angle.color} strokeWidth={1.8} />
                {(angle.label || measurement.length > 0) && (
                  <text x={toX(v.x) + Math.cos(angle1 + delta / 2) * (radius + 14)} y={toY(v.y) + Math.sin(angle1 + delta / 2) * (radius + 14)} fontSize={11} fill={angle.color} textAnchor="middle" fontWeight={600}>
                    {angle.label ? `${angle.label} ` : ""}
                    {measurement.map((m) => m.text).join("")}
                  </text>
                )}
              </g>
            );
          })}

          {[...resolved.points.values()].map((point) => (
            <g key={point.id}>
              <circle cx={toX(point.x)} cy={toY(point.y)} r={point.kind === "free" ? 4.5 : 3.8}
                fill={point.kind === "free" ? point.color : "#ffffff"} stroke={point.color} strokeWidth={2} />
              {point.showLabel && (
                <text x={toX(point.x) + 7} y={toY(point.y) - 7} fontSize={11.5} fill={point.color} fontWeight={600}>
                  {point.label || point.id}
                </text>
              )}
            </g>
          ))}

          {spec.annotations.filter((a) => a.text.trim()).map((a) => (
            <text key={a.id} x={toX(a.x)} y={toY(a.y)} fontSize={11.5} fill={a.color}>{a.text}</text>
          ))}
        </svg>
      </div>
      {!compact && measurements.length > 0 && (
        <ul className="graph-legend">
          {measurements.map((m) => <li key={m.id}>{m.text}</li>)}
        </ul>
      )}
    </figure>
  );
}
