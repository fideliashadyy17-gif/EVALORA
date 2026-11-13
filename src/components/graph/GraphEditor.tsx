"use client";

import {
  GRAPH_COLORS,
  GRAPH_VIEW,
  formatAxisLabel,
  graphIntersections,
  graphLayout,
  graphSpecIssues,
  normaliseGraphSpec,
  sampleGraphFunction,
  type GraphAnnotation,
  type GraphPoint,
  type GraphRegion,
  type GraphSegment,
  type GraphSpec,
  type GraphStroke,
  type GraphDomain,
} from "@/lib/graphSpec";
import { compileExpression, stripEquation } from "@/lib/mathExpr";
import { useCallback, useMemo, useRef, useState } from "react";
import { GraphView } from "./GraphView";

type Tool = "move" | "point" | "segment" | "annotation" | "freehand" | "region";

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const toolButton =
  "inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-evergreen-900/20 bg-white px-3 py-1.5 text-[13px] font-semibold text-evergreen-950 hover:bg-evergreen-50 disabled:opacity-40";
const toolActive = "border-evergreen-700 bg-evergreen-700 text-white hover:bg-evergreen-700";

/**
 * Interactive Cartesian graph workspace.
 *
 * Used by teachers to author a graph inside a question, and by candidates to
 * construct a graph in an answer. The result is a JSON specification — not an
 * image — so axes, functions, points, labels and colours remain editable and
 * inspectable after saving.
 */
export function GraphEditor({
  initial,
  onChange,
  readOnly = false,
  allowFunctions = true,
  allowAnnotations = true,
  compact = false,
  title = "Graph workspace",
}: {
  initial: GraphSpec;
  onChange?: (spec: GraphSpec) => void;
  readOnly?: boolean;
  allowFunctions?: boolean;
  allowAnnotations?: boolean;
  compact?: boolean;
  title?: string;
}) {
  const [spec, setSpec] = useState<GraphSpec>(() => normaliseGraphSpec(initial));
  const [tool, setTool] = useState<Tool>("move");
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingSegment, setPendingSegment] = useState<{ x1: number; y1: number } | null>(null);
  const [pendingRegion, setPendingRegion] = useState<{ x1: number; y1: number } | null>(null);
  const strokeRef = useRef<GraphStroke | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState<{ x: number; y: number } | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const [showSettings, setShowSettings] = useState(!compact);
  const [history, setHistory] = useState<GraphSpec[]>([]);
  const [future, setFuture] = useState<GraphSpec[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; kind: "point" | "segment-end" | "segment-start"; snapshot: GraphSpec } | null>(null);
  const layout = useMemo(() => graphLayout(spec), [spec]);
  const sampled = useMemo(
    () => spec.functions.filter((f) => f.visible && f.expression.trim()).map((f) => sampleGraphFunction(f, spec)),
    [spec],
  );
  const showIntersections = spec.domain.showIntersections;
  const intersections = useMemo(() => (showIntersections ? graphIntersections(spec, sampled) : []), [spec, sampled, showIntersections]);
  const issues = useMemo(() => graphSpecIssues(spec), [spec]);
  const { toX, toY, fromClientX, fromClientY, xTicks, yTicks } = layout;

  const publish = useCallback((next: GraphSpec, remember = true) => {
    setSpec(next);
    if (remember) setHistory((previous) => [...previous.slice(-40), spec]);
    setFuture([]);
    onChange?.(next);
  }, [onChange, spec]);

  function updateDomain(patch: Partial<GraphDomain>) {
    publish({ ...spec, domain: { ...spec.domain, ...patch } });
  }

  function pointFromEvent(event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const px = ((event.clientX - rect.left) / rect.width) * GRAPH_VIEW.width;
    const py = ((event.clientY - rect.top) / rect.height) * GRAPH_VIEW.height;
    const rawX = fromClientX(px);
    const rawY = fromClientY(py);
    const step = spec.domain.gridStep ?? layout.xStep;
    const snap = (v: number, s: number) => Math.round(v / s) * s;
    return {
      x: Math.round(snap(rawX, step) * 100) / 100,
      y: Math.round(snap(rawY, step) * 100) / 100,
    };
  }

  function onCanvasPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (readOnly) return;
    if (event.target !== event.currentTarget && (event.target as Element).closest("[data-graph-handle]")) return;
    const position = pointFromEvent(event);
    if (tool === "point") {
      const point: GraphPoint = {
        id: uid("pt"), x: position.x, y: position.y, label: "", color: GRAPH_COLORS[0],
        showCoordinates: true, open: false, visible: true,
      };
      publish({ ...spec, points: [...spec.points, point] });
      setSelected(point.id);
      return;
    }
    if (tool === "segment") {
      if (!pendingSegment) { setPendingSegment({ x1: position.x, y1: position.y }); return; }
      const segment: GraphSegment = {
        id: uid("seg"), x1: pendingSegment.x1, y1: pendingSegment.y1, x2: position.x, y2: position.y,
        color: GRAPH_COLORS[1], style: "solid", width: 2, label: "", visible: true,
      };
      publish({ ...spec, segments: [...spec.segments, segment] });
      setPendingSegment(null);
      setSelected(segment.id);
      return;
    }
    if (tool === "annotation" && allowAnnotations) {
      setAnnotationDraft({ x: position.x, y: position.y });
      setAnnotationText("");
      return;
    }
    if (tool === "freehand") {
      // Record the pre-stroke state once so undo removes the whole stroke.
      setHistory((previous) => [...previous.slice(-40), spec]);
      setFuture([]);
      strokeRef.current = {
        id: uid("stroke"), points: [{ x: position.x, y: position.y }],
        color: GRAPH_COLORS[2], width: 2.5, visible: true,
      };
      return;
    }
    if (tool === "region") {
      if (!pendingRegion) { setPendingRegion({ x1: position.x, y1: position.y }); return; }
      const region: GraphRegion = {
        id: uid("region"), x1: pendingRegion.x1, y1: pendingRegion.y1, x2: position.x, y2: position.y,
        color: GRAPH_COLORS[4], label: "", visible: true,
      };
      publish({ ...spec, regions: [...(spec.regions ?? []), region] });
      setPendingRegion(null);
      setSelected(region.id);
      return;
    }
    setSelected(null);
  }

  function startDrag(event: React.PointerEvent<SVGElement>, id: string, kind: "point" | "segment-end" | "segment-start") {
    if (readOnly) return;
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    dragRef.current = { id, kind, snapshot: spec };
    setSelected(id);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const stroke = strokeRef.current;
    if (stroke && !readOnly) {
      const position = pointFromEvent(event);
      const last = stroke.points[stroke.points.length - 1];
      // Throttle: skip negligible moves so a long stroke stays within limits.
      if (stroke.points.length < 600 && (!last || Math.hypot(position.x - last.x, position.y - last.y) > 0.02)) {
        stroke.points.push({ x: position.x, y: position.y });
        const next = { ...spec, strokes: [...(spec.strokes ?? []).filter((s) => s.id !== stroke.id), { ...stroke, points: [...stroke.points] }] };
        setSpec(next);
        onChange?.(next);
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag || readOnly) return;
    const position = pointFromEvent(event);
    let next: GraphSpec;
    if (drag.kind === "point") {
      next = { ...spec, points: spec.points.map((p) => (p.id === drag.id ? { ...p, x: position.x, y: position.y } : p)) };
    } else {
      next = {
        ...spec,
        segments: spec.segments.map((s) => (s.id !== drag.id ? s : drag.kind === "segment-start"
          ? { ...s, x1: position.x, y1: position.y }
          : { ...s, x2: position.x, y2: position.y })),
      };
    }
    setSpec(next);
    onChange?.(next);
  }

  function endDrag() {
    const stroke = strokeRef.current;
    if (stroke) {
      strokeRef.current = null;
      if (stroke.points.length < 2) {
        // A tap without movement is not a stroke: drop it and the history entry.
        setHistory((previous) => previous.slice(0, -1));
        const next = { ...spec, strokes: (spec.strokes ?? []).filter((s) => s.id !== stroke.id) };
        setSpec(next);
        onChange?.(next);
      }
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    setHistory((previous) => [...previous.slice(-40), drag.snapshot]);
    setFuture([]);
  }

  function addFunction() {
    if (!allowFunctions) return;
    const index = spec.functions.length;
    const expression = index === 0 ? "2x + 3" : "";
    publish({
      ...spec,
      functions: [...spec.functions, {
        id: uid("fn"), expression, color: GRAPH_COLORS[index % GRAPH_COLORS.length],
        style: "solid", width: 2, label: "", from: null, to: null, visible: true,
      }],
    });
  }

  function setFunction(id: string, patch: Partial<GraphSpec["functions"][number]>) {
    publish({ ...spec, functions: spec.functions.map((f) => (f.id === id ? { ...f, ...patch } : f)) }, false);
  }

  function remove(id: string, kind: "function" | "point" | "segment" | "annotation" | "stroke" | "region") {
    if (kind === "function") publish({ ...spec, functions: spec.functions.filter((f) => f.id !== id) });
    if (kind === "point") publish({ ...spec, points: spec.points.filter((p) => p.id !== id) });
    if (kind === "segment") publish({ ...spec, segments: spec.segments.filter((s) => s.id !== id) });
    if (kind === "annotation") publish({ ...spec, annotations: spec.annotations.filter((a) => a.id !== id) });
    if (kind === "stroke") publish({ ...spec, strokes: (spec.strokes ?? []).filter((s) => s.id !== id) });
    if (kind === "region") publish({ ...spec, regions: (spec.regions ?? []).filter((r) => r.id !== id) });
    if (selected === id) setSelected(null);
  }

  /** Remove every drawn element but keep the axes configuration. */
  function clearDrawing() {
    publish({ ...spec, functions: [], points: [], segments: [], annotations: [], strokes: [], regions: [] });
    setSelected(null);
    setPendingSegment(null);
    setPendingRegion(null);
  }

  function undo() {
    setHistory((previous) => {
      if (!previous.length) return previous;
      const last = previous[previous.length - 1];
      setFuture((f) => [...f, spec]);
      setSpec(last);
      onChange?.(last);
      return previous.slice(0, -1);
    });
  }

  function redo() {
    setFuture((previous) => {
      if (!previous.length) return previous;
      const last = previous[previous.length - 1];
      setHistory((h) => [...h, spec]);
      setSpec(last);
      onChange?.(last);
      return previous.slice(0, -1);
    });
  }

  function commitAnnotation() {
    if (!annotationDraft || !annotationText.trim()) { setAnnotationDraft(null); return; }
    const annotation: GraphAnnotation = {
      id: uid("note"), x: annotationDraft.x, y: annotationDraft.y,
      text: annotationText.trim().slice(0, 160), color: GRAPH_COLORS[0],
    };
    publish({ ...spec, annotations: [...spec.annotations, annotation] });
    setAnnotationDraft(null);
    setAnnotationText("");
  }

  function zoom(factor: number) {
    const cx = (spec.domain.xMin + spec.domain.xMax) / 2;
    const cy = (spec.domain.yMin + spec.domain.yMax) / 2;
    const halfX = ((spec.domain.xMax - spec.domain.xMin) / 2) * factor;
    const halfY = ((spec.domain.yMax - spec.domain.yMin) / 2) * factor;
    publish({
      ...spec,
      domain: {
        ...spec.domain,
        xMin: Math.round((cx - halfX) * 100) / 100,
        xMax: Math.round((cx + halfX) * 100) / 100,
        yMin: Math.round((cy - halfY) * 100) / 100,
        yMax: Math.round((cy + halfY) * 100) / 100,
      },
    });
  }

  const selectedPoint = spec.points.find((p) => p.id === selected) ?? null;
  const selectedSegment = spec.segments.find((s) => s.id === selected) ?? null;
  const selectedStroke = (spec.strokes ?? []).find((s) => s.id === selected) ?? null;
  const selectedRegion = (spec.regions ?? []).find((r) => r.id === selected) ?? null;

  return (
    <section className="graph-editor" aria-label={title} data-testid="graph-editor">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-evergreen-900/10 bg-cream/60 px-2 py-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-evergreen-800">Graph</span>
        {!readOnly && (
          <>
            <button type="button" className={`${toolButton} ${tool === "move" ? toolActive : ""}`} aria-pressed={tool === "move"} onClick={() => { setTool("move"); setPendingSegment(null); setPendingRegion(null); }}>✥ Select</button>
            <button type="button" className={`${toolButton} ${tool === "point" ? toolActive : ""}`} aria-pressed={tool === "point"} onClick={() => { setTool("point"); setPendingSegment(null); setPendingRegion(null); }}>• Point</button>
            <button type="button" className={`${toolButton} ${tool === "segment" ? toolActive : ""}`} aria-pressed={tool === "segment"} onClick={() => { setTool("segment"); setPendingSegment(null); setPendingRegion(null); }}>╱ Segment</button>
            {allowFunctions && <button type="button" className={toolButton} onClick={addFunction}>ƒ(x) Function</button>}
            {allowAnnotations && (
              <button type="button" className={`${toolButton} ${tool === "annotation" ? toolActive : ""}`} aria-pressed={tool === "annotation"} onClick={() => { setTool("annotation"); setPendingSegment(null); setPendingRegion(null); }}>T Label</button>
            )}
            <button type="button" className={`${toolButton} ${tool === "freehand" ? toolActive : ""}`} aria-pressed={tool === "freehand"} onClick={() => { setTool("freehand"); setPendingSegment(null); setPendingRegion(null); }}>✎ Freehand</button>
            <button type="button" className={`${toolButton} ${tool === "region" ? toolActive : ""}`} aria-pressed={tool === "region"} onClick={() => { setTool("region"); setPendingSegment(null); setPendingRegion(null); }}>▨ Region</button>
          </>
        )}
        <span className="mx-1 h-5 w-px bg-evergreen-900/15" />
        <button type="button" className={toolButton} onClick={() => zoom(0.8)} aria-label="Zoom in">+</button>
        <button type="button" className={toolButton} onClick={() => zoom(1.25)} aria-label="Zoom out">−</button>
        <button type="button" className={toolButton} onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
          Axes…
        </button>
        {!readOnly && (
          <>
            <button type="button" className={toolButton} onClick={undo} disabled={!history.length} aria-label="Undo">↩</button>
            <button type="button" className={toolButton} onClick={redo} disabled={!future.length} aria-label="Redo">↪</button>
            <button type="button" className={toolButton} onClick={clearDrawing} aria-label="Clear drawing">🗑 Clear</button>
          </>
        )}
        {spec.domain.showIntersections && <span className="text-xs text-ink-soft">{intersections.length} intersection(s)</span>}
      </div>

      {tool === "segment" && (
        <p className="border-b border-evergreen-900/10 bg-evergreen-50 px-3 py-1.5 text-xs text-evergreen-900">
          {pendingSegment ? `First point (${formatAxisLabel(pendingSegment.x1)}, ${formatAxisLabel(pendingSegment.y1)}) — tap the second point.` : "Tap the first endpoint of the segment."}
        </p>
      )}
      {tool === "region" && (
        <p className="border-b border-evergreen-900/10 bg-evergreen-50 px-3 py-1.5 text-xs text-evergreen-900">
          {pendingRegion ? `First corner (${formatAxisLabel(pendingRegion.x1)}, ${formatAxisLabel(pendingRegion.y1)}) — tap the opposite corner.` : "Tap one corner of the region you want to highlight."}
        </p>
      )}
      {tool === "freehand" && (
        <p className="border-b border-evergreen-900/10 bg-evergreen-50 px-3 py-1.5 text-xs text-evergreen-900">
          Press and drag on the plane to draw a freehand curve. Undo removes the last stroke.
        </p>
      )}
      {annotationDraft && (
        <div className="flex flex-wrap items-center gap-2 border-b border-evergreen-900/10 bg-gold-50 px-3 py-2">
          <input
            autoFocus
            value={annotationText}
            onChange={(e) => setAnnotationText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitAnnotation(); } }}
            placeholder={`Label at (${formatAxisLabel(annotationDraft.x)}, ${formatAxisLabel(annotationDraft.y)})`}
            className="h-9 min-w-40 flex-1 rounded-md border border-evergreen-900/25 px-2 text-sm"
            aria-label="Annotation text"
          />
          <button type="button" className={toolButton} onClick={commitAnnotation}>Add label</button>
          <button type="button" className={toolButton} onClick={() => setAnnotationDraft(null)}>Cancel</button>
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
          viewBox={`0 0 ${GRAPH_VIEW.width} ${GRAPH_VIEW.height}`}
          className={`graph-svg ${readOnly ? "" : "graph-svg-interactive"}`}
          role="application"
          aria-label={title}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          data-testid="graph-canvas"
        >
          <rect x={0} y={0} width={GRAPH_VIEW.width} height={GRAPH_VIEW.height} fill="#fff" />
          {spec.domain.showGrid && (
            <g aria-hidden>
              {xTicks.map((x) => (
                <line key={`gx-${x}`} x1={toX(x)} y1={GRAPH_VIEW.top} x2={toX(x)} y2={GRAPH_VIEW.height - GRAPH_VIEW.bottom} stroke="#e8eeeb" />
              ))}
              {yTicks.map((y) => (
                <line key={`gy-${y}`} x1={GRAPH_VIEW.left} y1={toY(y)} x2={GRAPH_VIEW.width - GRAPH_VIEW.right} y2={toY(y)} stroke="#e8eeeb" />
              ))}
            </g>
          )}
          {spec.domain.showAxes && (() => {
            const xAxisY = toY(Math.min(Math.max(0, spec.domain.yMin), spec.domain.yMax));
            const yAxisX = toX(Math.min(Math.max(0, spec.domain.xMin), spec.domain.xMax));
            return (
              <g aria-hidden>
                <line x1={GRAPH_VIEW.left} y1={xAxisY} x2={GRAPH_VIEW.width - GRAPH_VIEW.right} y2={xAxisY} stroke="#16241c" strokeWidth={1.6} />
                <line x1={yAxisX} y1={GRAPH_VIEW.top} x2={yAxisX} y2={GRAPH_VIEW.height - GRAPH_VIEW.bottom} stroke="#16241c" strokeWidth={1.6} />
                <text x={GRAPH_VIEW.width - GRAPH_VIEW.right + 2} y={xAxisY + 4} fontSize={13} fontStyle="italic">x</text>
                <text x={yAxisX + 5} y={GRAPH_VIEW.top + 2} fontSize={13} fontStyle="italic">y</text>
              </g>
            );
          })()}
          {spec.domain.showCoordinates && (() => {
            const xAxisY = toY(Math.min(Math.max(0, spec.domain.yMin), spec.domain.yMax));
            const yAxisX = toX(Math.min(Math.max(0, spec.domain.xMin), spec.domain.xMax));
            return (
              <g aria-hidden>
                {xTicks.map((x) => (
                  <text key={`tx-${x}`} x={toX(x)} y={xAxisY + 16} fontSize={11} textAnchor="middle" fill="#4b5a52">{formatAxisLabel(x)}</text>
                ))}
                {yTicks.map((y) => (
                  <text key={`ty-${y}`} x={yAxisX - 6} y={toY(y) + 4} fontSize={11} textAnchor="end" fill="#4b5a52">{formatAxisLabel(y)}</text>
                ))}
              </g>
            );
          })()}
          {(spec.regions ?? []).filter((r) => r.visible).map((r) => {
            const x = Math.min(toX(r.x1), toX(r.x2));
            const y = Math.min(toY(r.y1), toY(r.y2));
            const w = Math.abs(toX(r.x2) - toX(r.x1));
            const h = Math.abs(toY(r.y2) - toY(r.y1));
            return (
              <g key={r.id} data-graph-element="region">
                <rect x={x} y={y} width={w} height={h} fill={r.color} fillOpacity={0.14}
                  stroke={selected === r.id ? r.color : "none"} strokeWidth={1.5} strokeDasharray="6 4"
                  onClick={(e) => { e.stopPropagation(); setSelected(r.id); }} style={{ cursor: "pointer" }} />
                {r.label && <text x={x + 5} y={y + 15} fontSize={11} fill={r.color} fontWeight={600} pointerEvents="none">{r.label}</text>}
              </g>
            );
          })}
          {(spec.strokes ?? []).filter((st) => st.visible && st.points.length >= 2).map((st) => (
            <polyline key={st.id} data-graph-element="stroke"
              points={st.points.map((pt) => `${toX(pt.x)},${toY(pt.y)}`).join(" ")}
              fill="none" stroke={st.color} strokeWidth={st.width} strokeLinecap="round" strokeLinejoin="round"
              onClick={(e) => { e.stopPropagation(); setSelected(st.id); }} style={{ cursor: "pointer" }} />
          ))}
          {spec.segments.filter((s) => s.visible).map((s) => {
            const isSelected = selected === s.id;
            return (
              <g key={s.id}>
                <line x1={toX(s.x1)} y1={toY(s.y1)} x2={toX(s.x2)} y2={toY(s.y2)} stroke={s.color} strokeWidth={s.width}
                  strokeDasharray={s.style === "dashed" ? "9 6" : s.style === "dotted" ? "2 5" : undefined} strokeLinecap="round" />
                {s.label && <text x={(toX(s.x1) + toX(s.x2)) / 2 + 4} y={(toY(s.y1) + toY(s.y2)) / 2 - 6} fontSize={12} fill={s.color}>{s.label}</text>}
                {!readOnly && isSelected && (
                  <circle cx={(toX(s.x1) + toX(s.x2)) / 2} cy={(toY(s.y1) + toY(s.y2)) / 2} r={4} fill={s.color} opacity={0.5} />
                )}
              </g>
            );
          })}
          {sampled.map((fn) => fn.path && (
            <path key={fn.id} d={fn.path} fill="none" stroke={fn.color} strokeWidth={fn.width}
              strokeDasharray={fn.style === "dashed" ? "9 6" : fn.style === "dotted" ? "2 5" : undefined} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {intersections.map((point) => (
            <g key={`int-${point.x.toFixed(4)}-${point.y.toFixed(4)}`}>
              <circle cx={toX(point.x)} cy={toY(point.y)} r={4.5} fill="#fff" stroke={point.color} strokeWidth={2} />
              <text x={toX(point.x) + 7} y={toY(point.y) - 7} fontSize={11} fill={point.color}>{point.label}</text>
            </g>
          ))}
          {spec.points.filter((p) => p.visible).map((p) => (
            <g key={p.id} data-graph-element="point">
              <circle cx={toX(p.x)} cy={toY(p.y)} r={5} fill={p.open ? "#fff" : p.color} stroke={p.color} strokeWidth={2} />
              {(p.showCoordinates || p.label) && (
                <text x={toX(p.x) + 8} y={toY(p.y) - 8} fontSize={12} fill={p.color} fontWeight={600} pointerEvents="none">
                  {p.label ? `${p.label} ` : ""}{p.showCoordinates ? `(${formatAxisLabel(p.x)}, ${formatAxisLabel(p.y)})` : ""}
                </text>
              )}
              {!readOnly && (
                <circle
                  data-graph-handle="point"
                  cx={toX(p.x)} cy={toY(p.y)} r={16} fill="transparent"
                  style={{ cursor: "grab", touchAction: "none" }}
                  onPointerDown={(e) => startDrag(e, p.id, "point")}
                  onClick={(e) => { e.stopPropagation(); setSelected(p.id); }}
                >
                  <title>Drag point {p.label || ""}</title>
                </circle>
              )}
            </g>
          ))}
          {!readOnly && spec.segments.map((s) => (
            <g key={`h-${s.id}`}>
              <circle data-graph-handle="segment" cx={toX(s.x1)} cy={toY(s.y1)} r={14} fill="transparent" style={{ cursor: "grab", touchAction: "none" }}
                onPointerDown={(e) => startDrag(e, s.id, "segment-start")} onClick={(e) => { e.stopPropagation(); setSelected(s.id); }} />
              <circle data-graph-handle="segment" cx={toX(s.x2)} cy={toY(s.y2)} r={14} fill="transparent" style={{ cursor: "grab", touchAction: "none" }}
                onPointerDown={(e) => startDrag(e, s.id, "segment-end")} onClick={(e) => { e.stopPropagation(); setSelected(s.id); }} />
            </g>
          ))}
          {spec.annotations.filter((a) => a.text.trim()).map((a) => (
            <text key={a.id} x={toX(a.x)} y={toY(a.y)} fontSize={12} fill={a.color} onClick={(e) => { e.stopPropagation(); setSelected(a.id); }}>{a.text}</text>
          ))}
        </svg>
      </div>

      {showSettings && (
        <div className="graph-panel" aria-label="Axis settings">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([["xMin", "x minimum"], ["xMax", "x maximum"], ["yMin", "y minimum"], ["yMax", "y maximum"]] as const).map(([key, label]) => (
              <label key={key} className="text-[11px] font-medium text-ink-soft">
                {label}
                <input
                  type="number" step="any" value={spec.domain[key]} disabled={readOnly}
                  onChange={(e) => updateDomain({ [key]: Number(e.target.value) } as Partial<GraphDomain>)}
                  className="mt-0.5 h-9 w-full rounded-md border border-evergreen-900/20 px-2 text-sm text-ink"
                />
              </label>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink">
            <label className="flex items-center gap-1.5">
              Grid interval
              <input
                type="number" min={0.01} step="any" value={spec.domain.gridStep ?? ""} placeholder="auto" disabled={readOnly}
                onChange={(e) => updateDomain({ gridStep: e.target.value === "" ? null : Number(e.target.value) })}
                className="h-8 w-20 rounded-md border border-evergreen-900/20 px-2 text-sm"
              />
            </label>
            {([
              ["showGrid", "Grid"], ["showAxes", "Axes"], ["showCoordinates", "Numbers"],
              ["showLegend", "Legend"], ["showIntersections", "Intersections"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5">
                <input type="checkbox" checked={Boolean(spec.domain[key])} disabled={readOnly}
                  onChange={(e) => updateDomain({ [key]: e.target.checked } as Partial<GraphDomain>)} />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-1.5">
              Title
              <input value={spec.title} onChange={(e) => publish({ ...spec, title: e.target.value.slice(0, 100) }, false)}
                className="h-8 w-44 rounded-md border border-evergreen-900/20 px-2 text-sm" placeholder="Optional graph title" />
            </label>
          </div>
        </div>
      )}

      {allowFunctions && spec.functions.length > 0 && (
        <div className="graph-panel" aria-label="Functions">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-evergreen-800">Functions</p>
          <div className="space-y-2">
            {spec.functions.map((fn) => {
              const compiled = fn.expression.trim() ? compileExpression(stripEquation(fn.expression)) : null;
              return (
                <div key={fn.id} className="grid gap-1.5 rounded-lg border border-evergreen-900/10 bg-white p-2 sm:grid-cols-[1fr_auto]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-sm text-ink-soft">y =</span>
                    <input
                      value={fn.expression}
                      aria-label={`Function ${spec.functions.indexOf(fn) + 1}`}
                      placeholder="2x + 3 or x^2 - 4x + 3"
                      disabled={readOnly}
                      onChange={(e) => setFunction(fn.id, { expression: e.target.value.slice(0, 240) })}
                      className="h-9 min-w-40 flex-1 rounded-md border border-evergreen-900/25 px-2 font-mono text-sm"
                      inputMode="text"
                    />
                    <input value={fn.label} placeholder="Legend label" disabled={readOnly}
                      onChange={(e) => setFunction(fn.id, { label: e.target.value.slice(0, 60) })}
                      className="h-9 w-32 rounded-md border border-evergreen-900/20 px-2 text-xs" aria-label="Legend label" />
                    <input type="color" value={fn.color} disabled={readOnly} aria-label="Line colour"
                      onChange={(e) => setFunction(fn.id, { color: e.target.value })}
                      className="h-9 w-9 rounded border border-evergreen-900/20" />
                    <select value={fn.style} disabled={readOnly} aria-label="Line style"
                      onChange={(e) => setFunction(fn.id, { style: e.target.value as typeof fn.style })}
                      className="h-9 rounded-md border border-evergreen-900/20 px-1 text-xs">
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs text-ink-soft">
                      <input type="checkbox" checked={fn.visible} disabled={readOnly} onChange={(e) => setFunction(fn.id, { visible: e.target.checked })} /> visible
                    </label>
                    {!readOnly && (
                      <button type="button" className="min-h-8 rounded-md px-2 text-sm text-red-700 hover:bg-red-50" onClick={() => remove(fn.id, "function")} aria-label={`Remove function ${fn.expression}`}>✕</button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {compiled && !compiled.ok ? (
                      <span role="alert" className="text-xs text-red-700">{compiled.error}</span>
                    ) : (
                      <span className="text-xs text-evergreen-700">✓ plotted{fn.visible ? "" : " (hidden)"}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(selectedPoint || selectedSegment || selectedStroke || selectedRegion) && !readOnly && (
        <div className="graph-panel" aria-label="Selected element">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-evergreen-800">Selected element</p>
          {selectedPoint && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1">x
                <input type="number" step="any" value={selectedPoint.x}
                  onChange={(e) => publish({ ...spec, points: spec.points.map((p) => p.id === selectedPoint.id ? { ...p, x: Number(e.target.value) } : p) })}
                  className="h-9 w-24 rounded-md border border-evergreen-900/20 px-2" />
              </label>
              <label className="flex items-center gap-1">y
                <input type="number" step="any" value={selectedPoint.y}
                  onChange={(e) => publish({ ...spec, points: spec.points.map((p) => p.id === selectedPoint.id ? { ...p, y: Number(e.target.value) } : p) })}
                  className="h-9 w-24 rounded-md border border-evergreen-900/20 px-2" />
              </label>
              <label className="flex items-center gap-1">Label
                <input value={selectedPoint.label} placeholder="A"
                  onChange={(e) => publish({ ...spec, points: spec.points.map((p) => p.id === selectedPoint.id ? { ...p, label: e.target.value.slice(0, 20) } : p) }, false)}
                  className="h-9 w-20 rounded-md border border-evergreen-900/20 px-2" />
              </label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={selectedPoint.showCoordinates}
                onChange={(e) => publish({ ...spec, points: spec.points.map((p) => p.id === selectedPoint.id ? { ...p, showCoordinates: e.target.checked } : p) })} /> coordinates</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={selectedPoint.open}
                onChange={(e) => publish({ ...spec, points: spec.points.map((p) => p.id === selectedPoint.id ? { ...p, open: e.target.checked } : p) })} /> open dot</label>
              <button type="button" className="text-sm text-red-700" onClick={() => remove(selectedPoint.id, "point")}>Delete point</button>
            </div>
          )}
          {selectedSegment && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-soft">Segment ({formatAxisLabel(selectedSegment.x1)}, {formatAxisLabel(selectedSegment.y1)}) → ({formatAxisLabel(selectedSegment.x2)}, {formatAxisLabel(selectedSegment.y2)})</span>
              <label className="flex items-center gap-1">Label
                <input value={selectedSegment.label} placeholder="optional"
                  onChange={(e) => publish({ ...spec, segments: spec.segments.map((s) => s.id === selectedSegment.id ? { ...s, label: e.target.value.slice(0, 20) } : s) }, false)}
                  className="h-9 w-28 rounded-md border border-evergreen-900/20 px-2" />
              </label>
              <button type="button" className="text-sm text-red-700" onClick={() => remove(selectedSegment.id, "segment")}>Delete segment</button>
            </div>
          )}
          {selectedStroke && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-soft">Freehand stroke ({selectedStroke.points.length} point{selectedStroke.points.length === 1 ? "" : "s"})</span>
              <label className="flex items-center gap-1">Colour
                <input type="color" value={selectedStroke.color} aria-label="Stroke colour"
                  onChange={(e) => publish({ ...spec, strokes: (spec.strokes ?? []).map((s) => s.id === selectedStroke.id ? { ...s, color: e.target.value } : s) }, false)}
                  className="h-9 w-10 rounded border border-evergreen-900/20" />
              </label>
              <label className="flex items-center gap-1">Width
                <input type="number" min={1} max={8} step={0.5} value={selectedStroke.width} aria-label="Stroke width"
                  onChange={(e) => publish({ ...spec, strokes: (spec.strokes ?? []).map((s) => s.id === selectedStroke.id ? { ...s, width: Math.min(8, Math.max(1, Number(e.target.value) || 2.5)) } : s) })}
                  className="h-9 w-20 rounded-md border border-evergreen-900/20 px-2" />
              </label>
              <button type="button" className="text-sm text-red-700" onClick={() => remove(selectedStroke.id, "stroke")}>Delete stroke</button>
            </div>
          )}
          {selectedRegion && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-soft">Region ({formatAxisLabel(selectedRegion.x1)}, {formatAxisLabel(selectedRegion.y1)}) → ({formatAxisLabel(selectedRegion.x2)}, {formatAxisLabel(selectedRegion.y2)})</span>
              <label className="flex items-center gap-1">Label
                <input value={selectedRegion.label} placeholder="e.g. solution set"
                  onChange={(e) => publish({ ...spec, regions: (spec.regions ?? []).map((r) => r.id === selectedRegion.id ? { ...r, label: e.target.value.slice(0, 60) } : r) }, false)}
                  className="h-9 w-36 rounded-md border border-evergreen-900/20 px-2" />
              </label>
              <label className="flex items-center gap-1">Colour
                <input type="color" value={selectedRegion.color} aria-label="Region colour"
                  onChange={(e) => publish({ ...spec, regions: (spec.regions ?? []).map((r) => r.id === selectedRegion.id ? { ...r, color: e.target.value } : r) }, false)}
                  className="h-9 w-10 rounded border border-evergreen-900/20" />
              </label>
              <button type="button" className="text-sm text-red-700" onClick={() => remove(selectedRegion.id, "region")}>Delete region</button>
            </div>
          )}
        </div>
      )}

      <details className="graph-panel">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-evergreen-800">Preview exactly as students see it</summary>
        <div className="mt-2">
          <GraphView spec={spec} />
        </div>
      </details>
    </section>
  );
}
