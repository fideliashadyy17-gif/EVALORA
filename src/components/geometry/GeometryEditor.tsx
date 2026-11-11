"use client";

import {
  GEOMETRY_COLORS,
  GEOMETRY_VIEW,
  clipLineToRect,
  emptyGeometrySpec,
  formatMeasurement,
  geometryLayout,
  geometryMeasurements,
  geometrySpecIssues,
  normaliseGeometrySpec,
  resolveGeometry,
  snapToGrid,
  type GeometryAnnotation,
  type GeometryPoint,
  type GeometrySpec,
} from "@/lib/geometrySpec";
import { useCallback, useMemo, useRef, useState } from "react";
import { GeometryView } from "./GeometryView";

type Tool =
  | "move" | "point" | "segment" | "line" | "ray" | "circle" | "polygon" | "angle"
  | "midpoint" | "intersection" | "perpendicular" | "parallel" | "label" | "delete";

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const btn = "inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-evergreen-900/20 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-evergreen-950 hover:bg-evergreen-50 disabled:opacity-40";
const active = "border-evergreen-700 bg-evergreen-700 text-white hover:bg-evergreen-700";

const POINT_TOOLS: Tool[] = ["segment", "line", "ray", "circle", "polygon", "angle", "midpoint", "perpendicular", "parallel"];
const HINTS: Partial<Record<Tool, string>> = {
  segment: "Tap two points to create a segment (tap empty space to create a point).",
  line: "Tap two points to create a straight line.",
  ray: "Tap the origin, then a second point to set the ray direction.",
  circle: "Tap the centre, then a point on the circle.",
  polygon: "Tap each vertex, then choose Finish polygon.",
  angle: "Tap a point on the first arm, the vertex, then a point on the second arm.",
  midpoint: "Tap the two points whose midpoint you want.",
  intersection: "Tap two lines or segments; their intersection becomes a point that follows both.",
  perpendicular: "Tap a point, then a line: a perpendicular is constructed through the point.",
  parallel: "Tap a point, then a line: a parallel is constructed through the point.",
  label: "Tap the canvas to place a text label.",
};

/**
 * Interactive geometry construction workspace for teachers and candidates.
 * Points are dragged; midpoints, intersections, perpendiculars, parallels,
 * circle radii and measurements are re-derived on every change, so a figure
 * stays mathematically consistent while it is edited.
 */
export function GeometryEditor({
  initial,
  onChange,
  readOnly = false,
  compact = false,
  title = "Geometry workspace",
}: {
  initial: GeometrySpec;
  onChange?: (spec: GeometrySpec) => void;
  readOnly?: boolean;
  compact?: boolean;
  title?: string;
}) {
  const [spec, setSpec] = useState<GeometrySpec>(() => normaliseGeometrySpec(initial ?? emptyGeometrySpec()));
  const [tool, setTool] = useState<Tool>("point");
  const [pending, setPending] = useState<string[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState<{ x: number; y: number } | null>(null);
  const [labelText, setLabelText] = useState("");
  const [showSettings, setShowSettings] = useState(!compact);
  const [history, setHistory] = useState<GeometrySpec[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; snapshot: GeometrySpec } | null>(null);
  const layout = useMemo(() => geometryLayout(spec), [spec]);
  const resolved = useMemo(() => resolveGeometry(spec), [spec]);
  const measurements = useMemo(() => geometryMeasurements(spec, resolved), [spec, resolved]);
  const issues = useMemo(() => geometrySpecIssues(spec), [spec]);
  const { toX, toY, fromClientX, fromClientY, xTicks, yTicks } = layout;

  const publish = useCallback((next: GeometrySpec, remember = true) => {
    setSpec(next);
    if (remember) setHistory((previous) => [...previous.slice(-40), spec]);
    onChange?.(next);
  }, [onChange, spec]);

  function canvasPoint(event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const px = ((event.clientX - rect.left) / rect.width) * GEOMETRY_VIEW.width;
    const py = ((event.clientY - rect.top) / rect.height) * GEOMETRY_VIEW.height;
    const rawX = fromClientX(px);
    const rawY = fromClientY(py);
    const step = spec.domain.gridStep ?? layout.step;
    return {
      x: Math.round(snapToGrid(rawX, step, spec.domain.snap) * 100) / 100,
      y: Math.round(snapToGrid(rawY, step, spec.domain.snap) * 100) / 100,
    };
  }

  function createPoint(x: number, y: number, kind: GeometryPoint["kind"] = "free"): GeometryPoint {
    const used = new Set(spec.points.map((p) => p.label));
    let label = "";
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      if (!used.has(letter)) { label = letter; break; }
    }
    return {
      id: uid("pt"), x, y, kind, dependsOn: [],
      label: label || `P${spec.points.length + 1}`,
      color: GEOMETRY_COLORS[0], showLabel: true,
    };
  }

  function addFreePoint(x: number, y: number) {
    const point = createPoint(x, y);
    publish({ ...spec, points: [...spec.points, point] });
    setSelectedPoint(point.id);
    setPending([]);
    return point;
  }

  function pointAt(x: number, y: number) {
    const tolerance = Math.max(0.12, (spec.domain.xMax - spec.domain.xMin) / 60);
    return spec.points.find((p) => Math.hypot(p.x - x, p.y - y) <= tolerance) ?? null;
  }

  function hitLine(x: number, y: number) {
    const tolerance = Math.max(0.15, (spec.domain.yMax - spec.domain.yMin) / 50);
    for (const line of resolved.lines) {
      if (line.kind === "segment" && line.b) {
        const { a, b } = line;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-9) continue;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
        const px = a.x + t * dx;
        const py = a.y + t * dy;
        if (Math.hypot(x - px, y - py) <= tolerance) return line.id;
        continue;
      }
      if (line.direction) {
        const dx = line.direction.dx;
        const dy = line.direction.dy;
        const len2 = dx * dx + dy * dy;
        const t = ((x - line.a.x) * dx + (y - line.a.y) * dy) / len2;
        if (line.kind === "ray" && t < 0) continue;
        const px = line.a.x + t * dx;
        const py = line.a.y + t * dy;
        if (Math.hypot(x - px, y - py) <= tolerance) return line.id;
      }
    }
    return null;
  }

  function resetPending() { setPending([]); }

  function onPointChosen(id: string) {
    if (tool === "move") { setSelectedPoint(id); setSelectedLine(null); return; }
    if (tool === "delete") {
      publish({ ...spec, points: spec.points.filter((p) => p.id !== id) });
      return;
    }
    if (tool === "perpendicular" || tool === "parallel") { setPending([id]); return; }
    if (tool === "intersection") return;
    if (tool === "polygon") { setPending((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); return; }
    const next = [...pending, id];
    const need = tool === "angle" ? 3 : 2;
    if (next.length < need) { setPending(next); return; }
    const [first, second, third] = next;
    if (tool === "segment" || tool === "line" || tool === "ray") {
      publish({
        ...spec,
        lines: [...spec.lines, {
          id: uid("l"), kind: tool, a: first, b: second, relation: null,
          color: GEOMETRY_COLORS[1], style: "solid", width: 2, label: "", showMeasurement: tool !== "ray",
        }],
      });
    } else if (tool === "circle") {
      publish({
        ...spec,
        circles: [...spec.circles, {
          id: uid("c"), center: first, through: second,
          color: GEOMETRY_COLORS[3], style: "solid", width: 2, label: "", showMeasurement: true,
        }],
      });
    } else if (tool === "angle") {
      publish({
        ...spec,
        angles: [...spec.angles, {
          id: uid("ang"), a: first, vertex: second, b: third,
          color: GEOMETRY_COLORS[4], label: "", showMeasurement: true,
        }],
      });
    } else if (tool === "midpoint") {
      const midpoint: GeometryPoint = {
        ...createPoint(0, 0, "midpoint"),
        dependsOn: [first, second],
        label: `M${spec.points.filter((p) => p.kind === "midpoint").length + 1}`,
      };
      const resolvedMid = ((resolved.points.get(first)?.x ?? 0) + (resolved.points.get(second)?.x ?? 0)) / 2;
      publish({
        ...spec,
        points: [...spec.points, {
          ...midpoint,
          x: resolvedMid,
          y: ((resolved.points.get(first)?.y ?? 0) + (resolved.points.get(second)?.y ?? 0)) / 2,
        }],
      });
    }
    setPending([]);
  }

  function onCanvasClick(event: React.MouseEvent<SVGSVGElement>) {
    if (readOnly) return;
    if ((event.target as Element).closest("[data-geometry-handle]")) return;
    const position = canvasPoint(event);
    const lineHit = hitLine(position.x, position.y);
    if (tool === "intersection") {
      if (!lineHit) return;
      const next = [...pending, lineHit];
      if (next.length === 2) {
        const intersection: GeometryPoint = {
          ...createPoint(position.x, position.y, "intersection"),
          dependsOn: next,
          label: `X${spec.points.filter((p) => p.kind === "intersection").length + 1}`,
        };
        publish({ ...spec, points: [...spec.points, intersection] });
        setPending([]);
      } else setPending(next);
      return;
    }
    if (tool === "perpendicular" || tool === "parallel") {
      if (pending.length === 0) {
        const point = pointAt(position.x, position.y) ?? addFreePoint(position.x, position.y);
        setPending([point.id]);
        return;
      }
      if (!lineHit) return;
      publish({
        ...spec,
        lines: [...spec.lines, {
          id: uid("l"), kind: "line", a: pending[0], b: null,
          relation: { type: tool === "perpendicular" ? "perpendicular" : "parallel", point: pending[0], to: lineHit },
          color: GEOMETRY_COLORS[2], style: "dashed", width: 2, label: "", showMeasurement: false,
        }],
      });
      setPending([]);
      return;
    }
    if (tool === "point") { addFreePoint(position.x, position.y); return; }
    if (tool === "label") { setLabelDraft(position); setLabelText(""); return; }
    if (tool === "delete") {
      if (lineHit) publish({ ...spec, lines: spec.lines.filter((l) => l.id !== lineHit) });
      return;
    }
    // Picking empty space during a construction creates the point you need.
    if (POINT_TOOLS.includes(tool)) onPointChosen(addFreePoint(position.x, position.y).id);
    else { setSelectedPoint(null); setSelectedLine(lineHit); }
  }

  function finishPolygon() {
    if (pending.length < 3) return;
    publish({
      ...spec,
      polygons: [...spec.polygons, {
        id: uid("poly"), points: pending,
        color: GEOMETRY_COLORS[0], fill: "#bfd8cc", style: "solid", width: 2, label: "", showMeasurement: true,
      }],
    });
    setPending([]);
  }

  function onPointerDownPoint(event: React.PointerEvent<SVGElement>, id: string) {
    if (readOnly) return;
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    setSelectedPoint(id);
    setSelectedLine(null);
    dragRef.current = { id, snapshot: spec };
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || readOnly) return;
    const position = canvasPoint(event);
    const next = {
      ...spec,
      points: spec.points.map((p) => (p.id === drag.id && p.kind === "free" ? { ...p, x: position.x, y: position.y } : p)),
    };
    setSpec(next);
    onChange?.(next);
  }

  function endDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    setHistory((previous) => [...previous.slice(-40), drag.snapshot]);
  }

  function updateDomain(patch: Partial<GeometrySpec["domain"]>) {
    publish({ ...spec, domain: { ...spec.domain, ...patch } });
  }

  function commitLabel() {
    if (!labelDraft || !labelText.trim()) { setLabelDraft(null); return; }
    const annotation: GeometryAnnotation = {
      id: uid("note"), x: labelDraft.x, y: labelDraft.y, text: labelText.trim().slice(0, 160), color: GEOMETRY_COLORS[0],
    };
    publish({ ...spec, annotations: [...spec.annotations, annotation] });
    setLabelDraft(null);
    setLabelText("");
  }

  function undo() {
    setHistory((previous) => {
      if (!previous.length) return previous;
      const last = previous[previous.length - 1];
      setSpec(last);
      onChange?.(last);
      return previous.slice(0, -1);
    });
  }

  const selected = selectedPoint ? spec.points.find((p) => p.id === selectedPoint) ?? null : null;
  const selectedLineObj = selectedLine ? spec.lines.find((l) => l.id === selectedLine) ?? null : null;
  const measureFor = (id: string) => measurements.filter((m) => m.id === id);

  const lineEnds = (line: (typeof resolved.lines)[number]) => {
    if (line.kind === "segment" && line.b) return { a: line.a, b: line.b };
    if (!line.direction) return null;
    const clipped = clipLineToRect(line.a, line.direction, {
      minX: spec.domain.xMin, maxX: spec.domain.xMax, minY: spec.domain.yMin, maxY: spec.domain.yMax,
    });
    if (!clipped) return null;
    if (line.kind === "ray") {
      const t1 = (clipped.x1 - line.a.x) * line.direction.dx + (clipped.y1 - line.a.y) * line.direction.dy;
      const t2 = (clipped.x2 - line.a.x) * line.direction.dx + (clipped.y2 - line.a.y) * line.direction.dy;
      return { a: line.a, b: t1 >= t2 ? { x: clipped.x1, y: clipped.y1 } : { x: clipped.x2, y: clipped.y2 } };
    }
    return { a: { x: clipped.x1, y: clipped.y1 }, b: { x: clipped.x2, y: clipped.y2 } };
  };

  return (
    <section className="graph-editor geometry-editor" aria-label={title} data-testid="geometry-editor">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-evergreen-900/10 bg-cream/60 px-2 py-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-evergreen-800">Geometry</span>
        {!readOnly && ((["move", "point", "segment", "line", "ray", "circle", "polygon", "angle", "midpoint", "intersection", "perpendicular", "parallel", "label", "delete"] as Tool[]).map((item) => (
          <button
            key={item}
            type="button"
            className={`${btn} ${tool === item ? active : ""}`}
            aria-pressed={tool === item}
            onClick={() => { setTool(item); resetPending(); }}
          >
            {TOOL_LABEL[item]}
          </button>
        )))}
        <button type="button" className={btn} onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>Axes…</button>
        {!readOnly && <button type="button" className={btn} onClick={undo} disabled={!history.length} aria-label="Undo">↩</button>}
        {tool === "polygon" && pending.length >= 3 && (
          <button type="button" className={`${btn} bg-evergreen-700 text-white`} onClick={finishPolygon}>Finish polygon ({pending.length})</button>
        )}
      </div>

      {!readOnly && HINTS[tool] && (
        <p className="border-b border-evergreen-900/10 bg-evergreen-50 px-3 py-1.5 text-xs text-evergreen-900">
          {HINTS[tool]}
          {pending.length > 0 ? ` · ${pending.length} selected` : ""}
        </p>
      )}
      {labelDraft && (
        <div className="flex flex-wrap items-center gap-2 border-b border-evergreen-900/10 bg-gold-50 px-3 py-2">
          <input autoFocus value={labelText} onChange={(e) => setLabelText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitLabel(); } }}
            placeholder="Label text" className="h-9 min-w-40 flex-1 rounded-md border border-evergreen-900/25 px-2 text-sm" />
          <button type="button" className={btn} onClick={commitLabel}>Add label</button>
          <button type="button" className={btn} onClick={() => setLabelDraft(null)}>Cancel</button>
        </div>
      )}
      {issues.length > 0 && (
        <ul role="status" className="border-b border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {issues.slice(0, 4).map((issue) => <li key={issue}>⚠ {issue}</li>)}
        </ul>
      )}

      <div className="graph-surface">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${GEOMETRY_VIEW.width} ${GEOMETRY_VIEW.height}`}
          className={`graph-svg ${readOnly ? "" : "graph-svg-interactive"}`}
          role="application"
          aria-label={title}
          onClick={onCanvasClick}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          data-testid="geometry-canvas"
        >
          <rect x={0} y={0} width={GEOMETRY_VIEW.width} height={GEOMETRY_VIEW.height} fill="#fff" />
          {spec.domain.showGrid && (
            <g aria-hidden>
              {xTicks.map((x) => <line key={`gx-${x}`} x1={toX(x)} y1={GEOMETRY_VIEW.top} x2={toX(x)} y2={GEOMETRY_VIEW.height - GEOMETRY_VIEW.bottom} stroke="#e8eeeb" />)}
              {yTicks.map((y) => <line key={`gy-${y}`} x1={GEOMETRY_VIEW.left} y1={toY(y)} x2={GEOMETRY_VIEW.width - GEOMETRY_VIEW.right} y2={toY(y)} stroke="#e8eeeb" />)}
            </g>
          )}
          {spec.domain.showAxes && (() => {
            const xAxisY = toY(Math.min(Math.max(0, spec.domain.yMin), spec.domain.yMax));
            const yAxisX = toX(Math.min(Math.max(0, spec.domain.xMin), spec.domain.xMax));
            return (
              <g aria-hidden>
                <line x1={GEOMETRY_VIEW.left} y1={xAxisY} x2={GEOMETRY_VIEW.width - GEOMETRY_VIEW.right} y2={xAxisY} stroke="#8a9a91" strokeWidth={1.2} />
                <line x1={yAxisX} y1={GEOMETRY_VIEW.top} x2={yAxisX} y2={GEOMETRY_VIEW.height - GEOMETRY_VIEW.bottom} stroke="#8a9a91" strokeWidth={1.2} />
                {xTicks.filter((x) => x !== 0).map((x) => <text key={`tx-${x}`} x={toX(x)} y={xAxisY + 14} fontSize={10} textAnchor="middle" fill="#6b7a72">{formatMeasurement(x, 2)}</text>)}
                {yTicks.filter((y) => y !== 0).map((y) => <text key={`ty-${y}`} x={yAxisX - 5} y={toY(y) + 3} fontSize={10} textAnchor="end" fill="#6b7a72">{formatMeasurement(y, 2)}</text>)}
              </g>
            );
          })()}

          {spec.polygons.map((poly) => {
            const pts = poly.points.map((id) => resolved.points.get(id)).filter(Boolean) as { x: number; y: number }[];
            if (pts.length < 3) return null;
            return (
              <g key={poly.id}>
                <polygon points={pts.map((p) => `${toX(p.x)},${toY(p.y)}`).join(" ")} fill={poly.fill} fillOpacity={0.35}
                  stroke={poly.color} strokeWidth={poly.width} strokeDasharray={poly.style === "dashed" ? "9 6" : undefined} />
                <text x={toX(pts.reduce((s, p) => s + p.x, 0) / pts.length)} y={toY(pts.reduce((s, p) => s + p.y, 0) / pts.length)} fontSize={11} textAnchor="middle" fill={poly.color} fontWeight={600}>
                  {poly.label} {measureFor(poly.id).map((m) => m.text).join(" ")}
                </text>
              </g>
            );
          })}

          {spec.circles.map((circle) => {
            const center = resolved.points.get(circle.center);
            const through = resolved.points.get(circle.through);
            if (!center || !through) return null;
            const r = Math.hypot(through.x - center.x, through.y - center.y);
            // The two axes can have different scales, so the image of a circle
            // is an ellipse in screen coordinates. Drawing it with one radius
            // would misrepresent the construction on non-square domains.
            const rx = r * (GEOMETRY_VIEW.width - GEOMETRY_VIEW.left - GEOMETRY_VIEW.right) / Math.max(0.5, spec.domain.xMax - spec.domain.xMin);
            const ry = r * (GEOMETRY_VIEW.height - GEOMETRY_VIEW.top - GEOMETRY_VIEW.bottom) / Math.max(0.5, spec.domain.yMax - spec.domain.yMin);
            return (
              <g key={circle.id}>
                <ellipse cx={toX(center.x)} cy={toY(center.y)} rx={rx} ry={ry} fill="none" stroke={circle.color} strokeWidth={circle.width}
                  strokeDasharray={circle.style === "dashed" ? "9 6" : undefined} />
                {measureFor(circle.id).map((m) => (
                  <text key={m.id} x={toX((center.x + through.x) / 2)} y={toY((center.y + through.y) / 2) - 6} fontSize={11} fill={circle.color} fontWeight={600}>{m.text}</text>
                ))}
              </g>
            );
          })}

          {resolved.lines.map((line) => {
            const ends = lineEnds(line);
            if (!ends) return null;
            return (
              <g key={line.id}>
                <line x1={toX(ends.a.x)} y1={toY(ends.a.y)} x2={toX(ends.b.x)} y2={toY(ends.b.y)}
                  stroke={line.color} strokeWidth={line.width} strokeDasharray={line.style === "dashed" ? "9 6" : line.style === "dotted" ? "2 5" : undefined}
                  strokeLinecap="round" pointerEvents="none" />
                {line.kind === "segment" && (
                  <text x={toX((ends.a.x + ends.b.x) / 2)} y={toY((ends.a.y + ends.b.y) / 2) - 6} fontSize={11} fill={line.color} fontWeight={600} pointerEvents="none">
                    {line.label} {measureFor(line.id).map((m) => m.text).join(" ")}
                  </text>
                )}
                {!readOnly && <line x1={toX(ends.a.x)} y1={toY(ends.a.y)} x2={toX(ends.b.x)} y2={toY(ends.b.y)}
                  stroke="transparent" strokeWidth={18} style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (tool === "delete") { publish({ ...spec, lines: spec.lines.filter((l) => l.id !== line.id) }); return; }
                    if (tool === "intersection") {
                      const next = [...pending, line.id];
                      if (next.length === 2) {
                        publish({
                          ...spec,
                          points: [...spec.points, { ...createPoint(0, 0, "intersection"), dependsOn: next, label: `X${spec.points.filter((p) => p.kind === "intersection").length + 1}` }],
                        });
                        setPending([]);
                      } else setPending(next);
                      return;
                    }
                    if ((tool === "perpendicular" || tool === "parallel") && pending[0]) {
                      publish({
                        ...spec,
                        lines: [...spec.lines, {
                          id: uid("l"), kind: "line", a: pending[0], b: null,
                          relation: { type: tool, point: pending[0], to: line.id },
                          color: GEOMETRY_COLORS[2], style: "dashed", width: 2, label: "", showMeasurement: false,
                        }],
                      });
                      setPending([]);
                      return;
                    }
                    setSelectedLine(line.id);
                    setSelectedPoint(null);
                  }}>
                  <title>{line.kind === "segment" ? "Segment" : line.kind}</title>
                </line>}
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
            const startX = toX(v.x) + Math.cos(angle1) * radius;
            const startY = toY(v.y) + Math.sin(angle1) * radius;
            const endX = toX(v.x) + Math.cos(angle1 + delta) * radius;
            const endY = toY(v.y) + Math.sin(angle1 + delta) * radius;
            return (
              <g key={angle.id}>
                <path d={`M ${startX} ${startY} A ${radius} ${radius} 0 0 ${delta >= 0 ? 1 : 0} ${endX} ${endY}`} fill="none" stroke={angle.color} strokeWidth={1.8} pointerEvents="none" />
                <text x={toX(v.x) + Math.cos(angle1 + delta / 2) * (radius + 14)} y={toY(v.y) + Math.sin(angle1 + delta / 2) * (radius + 14)} fontSize={11} fill={angle.color} textAnchor="middle" fontWeight={600} pointerEvents="none">
                  {angle.label} {measureFor(angle.id).map((m) => m.text).join("")}
                </text>
              </g>
            );
          })}

          {[...resolved.points.values()].map((point) => (
            <g key={point.id} data-geometry-element="point">
              <circle cx={toX(point.x)} cy={toY(point.y)} r={point.kind === "free" ? 5 : 4} fill={point.kind === "free" ? point.color : "#fff"} stroke={point.color} strokeWidth={2} pointerEvents="none" />
              {point.showLabel && <text x={toX(point.x) + 7} y={toY(point.y) - 7} fontSize={11.5} fill={point.color} fontWeight={600} pointerEvents="none">{point.label || point.id}</text>}
              {!readOnly && (
                <circle
                  data-geometry-handle="point"
                  cx={toX(point.x)} cy={toY(point.y)} r={16}
                  fill={pending.includes(point.id) ? "rgba(10,92,54,0.18)" : "transparent"}
                  stroke={pending.includes(point.id) ? "#0a5c36" : "none"}
                  style={{ cursor: point.kind === "free" ? "grab" : "pointer", touchAction: "none" }}
                  onPointerDown={(e) => { if (point.kind === "free" && tool === "move") onPointerDownPoint(e, point.id); }}
                  onClick={(e) => { e.stopPropagation(); onPointChosen(point.id); }}
                >
                  <title>{point.kind === "free" ? `Drag point ${point.label}` : `Construction point ${point.label}`}</title>
                </circle>
              )}
            </g>
          ))}

          {spec.annotations.filter((a) => a.text.trim()).map((a) => (
            <text key={a.id} x={toX(a.x)} y={toY(a.y)} fontSize={11.5} fill={a.color} pointerEvents="none">{a.text}</text>
          ))}
        </svg>
      </div>

      {showSettings && (
        <div className="graph-panel" aria-label="Geometry axis settings">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([["xMin", "x minimum"], ["xMax", "x maximum"], ["yMin", "y minimum"], ["yMax", "y maximum"]] as const).map(([key, label]) => (
              <label key={key} className="text-[11px] font-medium text-ink-soft">
                {label}
                <input type="number" step="any" value={spec.domain[key]} disabled={readOnly}
                  onChange={(e) => updateDomain({ [key]: Number(e.target.value) } as Partial<GeometrySpec["domain"]>)}
                  className="mt-0.5 h-9 w-full rounded-md border border-evergreen-900/20 px-2 text-sm text-ink" />
              </label>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink">
            <label className="flex items-center gap-1.5">Grid
              <input type="checkbox" checked={spec.domain.showGrid} disabled={readOnly} onChange={(e) => updateDomain({ showGrid: e.target.checked })} />
            </label>
            <label className="flex items-center gap-1.5">Axes
              <input type="checkbox" checked={spec.domain.showAxes} disabled={readOnly} onChange={(e) => updateDomain({ showAxes: e.target.checked })} />
            </label>
            <label className="flex items-center gap-1.5">Snap to grid
              <input type="checkbox" checked={spec.domain.snap} disabled={readOnly} onChange={(e) => updateDomain({ snap: e.target.checked })} />
            </label>
            <label className="flex items-center gap-1.5">Grid interval
              <input type="number" min={0.01} step="any" value={spec.domain.gridStep ?? 1} disabled={readOnly}
                onChange={(e) => updateDomain({ gridStep: Math.max(0.01, Number(e.target.value) || 1) })}
                className="h-8 w-20 rounded-md border border-evergreen-900/20 px-2 text-sm" />
            </label>
            <label className="flex items-center gap-1.5">Title
              <input value={spec.title} onChange={(e) => publish({ ...spec, title: e.target.value.slice(0, 100) }, false)}
                className="h-8 w-44 rounded-md border border-evergreen-900/20 px-2 text-sm" placeholder="Optional figure title" />
            </label>
          </div>
        </div>
      )}

      {(selected || selectedLineObj) && !readOnly && (
        <div className="graph-panel" aria-label="Selected construction">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-evergreen-800">Selected construction</p>
          {selected && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{selected.kind === "free" ? "Point" : selected.kind === "midpoint" ? "Midpoint (follows its two points)" : selected.kind === "foot" ? "Perpendicular foot" : "Intersection (follows both lines)"}</span>
              <label className="flex items-center gap-1">Label
                <input value={selected.label} onChange={(e) => publish({ ...spec, points: spec.points.map((p) => p.id === selected.id ? { ...p, label: e.target.value.slice(0, 12) } : p) }, false)}
                  className="h-9 w-20 rounded-md border border-evergreen-900/20 px-2" />
              </label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={selected.showLabel}
                onChange={(e) => publish({ ...spec, points: spec.points.map((p) => p.id === selected.id ? { ...p, showLabel: e.target.checked } : p) })} /> label visible</label>
              {selected.kind === "free" && (
                <>
                  <label className="flex items-center gap-1">x
                    <input type="number" step="any" value={selected.x} onChange={(e) => publish({ ...spec, points: spec.points.map((p) => p.id === selected.id ? { ...p, x: Number(e.target.value) } : p) })}
                      className="h-9 w-20 rounded-md border border-evergreen-900/20 px-2" />
                  </label>
                  <label className="flex items-center gap-1">y
                    <input type="number" step="any" value={selected.y} onChange={(e) => publish({ ...spec, points: spec.points.map((p) => p.id === selected.id ? { ...p, y: Number(e.target.value) } : p) })}
                      className="h-9 w-20 rounded-md border border-evergreen-900/20 px-2" />
                  </label>
                </>
              )}
              <button type="button" className="text-sm text-red-700" onClick={() => {
                publish({ ...spec, points: spec.points.filter((p) => p.id !== selected.id) });
                setSelectedPoint(null);
              }}>Delete point</button>
            </div>
          )}
          {selectedLineObj && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-soft">{selectedLineObj.relation ? `${selectedLineObj.relation.type} line` : selectedLineObj.kind}</span>
              <label className="flex items-center gap-1">Label
                <input value={selectedLineObj.label}
                  onChange={(e) => publish({ ...spec, lines: spec.lines.map((l) => l.id === selectedLineObj.id ? { ...l, label: e.target.value.slice(0, 20) } : l) }, false)}
                  className="h-9 w-24 rounded-md border border-evergreen-900/20 px-2" />
              </label>
              {selectedLineObj.kind === "segment" && (
                <label className="flex items-center gap-1"><input type="checkbox" checked={selectedLineObj.showMeasurement}
                  onChange={(e) => publish({ ...spec, lines: spec.lines.map((l) => l.id === selectedLineObj.id ? { ...l, showMeasurement: e.target.checked } : l) })} /> show length</label>
              )}
              <button type="button" className="text-sm text-red-700" onClick={() => {
                publish({ ...spec, lines: spec.lines.filter((l) => l.id !== selectedLineObj.id) });
                setSelectedLine(null);
              }}>Delete line</button>
            </div>
          )}
        </div>
      )}

      <details className="graph-panel">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-evergreen-800">Preview exactly as students see it</summary>
        <div className="mt-2"><GeometryView spec={spec} /></div>
      </details>
    </section>
  );
}

const TOOL_LABEL: Record<Tool, string> = {
  move: "✥ Move",
  point: "• Point",
  segment: "╱ Segment",
  line: "— Line",
  ray: "→ Ray",
  circle: "○ Circle",
  polygon: "⬠ Polygon",
  angle: "∠ Angle",
  midpoint: "◐ Midpoint",
  intersection: "✕ Intersection",
  perpendicular: "⊥ Perpendicular",
  parallel: "∥ Parallel",
  label: "T Label",
  delete: "⌫ Delete",
};
