/**
 * Serialisable graph specification shared by the teacher graph builder, the
 * student graph workspace, the question renderer and the marking screen.
 *
 * The specification is plain JSON: it survives a `questions.config` / 
 * `exam_answers.answer` JSONB round-trip unchanged, so a graph drawn in an
 * examination can be re-opened and inspected later instead of being flattened
 * to an image.
 */
import { compileExpression, evaluateSafe, stripEquation, type CompileResult } from "./mathExpr";

export const GRAPH_SPEC_VERSION = 1;
export const GRAPH_COLORS = ["#0a5c36", "#b45309", "#1d4ed8", "#b91c1c", "#7c3aed", "#0e7490", "#be185d", "#4d7c0f"];
export const GRAPH_LINE_STYLES = ["solid", "dashed", "dotted"] as const;
export type GraphLineStyle = (typeof GRAPH_LINE_STYLES)[number];

export interface GraphDomain {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Optional fixed grid interval; when omitted a “nice” interval is chosen. */
  gridStep: number | null;
  showGrid: boolean;
  showAxes: boolean;
  showCoordinates: boolean;
  showLegend: boolean;
  showIntersections: boolean;
  /** Square units in both directions, useful for geometry-of-functions work. */
  equalScale: boolean;
}

export interface GraphFunction {
  id: string;
  /** Right-hand side in x, e.g. "2x + 3" or "x^2 - 4x + 3". */
  expression: string;
  color: string;
  style: GraphLineStyle;
  width: number;
  label: string;
  /** Optional restricted domain. */
  from: number | null;
  to: number | null;
  visible: boolean;
}

export interface GraphPoint {
  id: string;
  x: number;
  y: number;
  label: string;
  color: string;
  showCoordinates: boolean;
  open: boolean;
  visible: boolean;
}

export interface GraphSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  style: GraphLineStyle;
  width: number;
  label: string;
  visible: boolean;
}

export interface GraphAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

/** A freehand stroke: a polyline the candidate drew directly on the plane. */
export interface GraphStroke {
  id: string;
  /** Plane coordinates, in drawing order. */
  points: { x: number; y: number }[];
  color: string;
  width: number;
  visible: boolean;
}

/** A highlighted rectangular region (e.g. a solution set or an area under a curve). */
export interface GraphRegion {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  label: string;
  visible: boolean;
}

export interface GraphSpec {
  version: number;
  title: string;
  domain: GraphDomain;
  functions: GraphFunction[];
  points: GraphPoint[];
  segments: GraphSegment[];
  annotations: GraphAnnotation[];
  /** Freehand strokes drawn on the plane (added after v1; always safe to default to []). */
  strokes: GraphStroke[];
  /** Highlighted rectangular regions (added after v1; always safe to default to []). */
  regions: GraphRegion[];
}

export const GRAPH_LIMITS = {
  functions: 12,
  points: 150,
  segments: 150,
  annotations: 60,
  expression: 240,
  strokes: 40,
  strokePoints: 600,
  regions: 20,
} as const;

export function emptyGraphSpec(overrides: Partial<GraphSpec> = {}): GraphSpec {
  return {
    version: GRAPH_SPEC_VERSION,
    title: "",
    domain: {
      xMin: -10,
      xMax: 10,
      yMin: -8,
      yMax: 8,
      gridStep: null,
      showGrid: true,
      showAxes: true,
      showCoordinates: true,
      showLegend: true,
      showIntersections: false,
      equalScale: false,
    },
    functions: [],
    points: [],
    segments: [],
    annotations: [],
    strokes: [],
    regions: [],
    ...overrides,
  };
}

export function defaultGraphDomain(overrides: Partial<GraphDomain> = {}): GraphDomain {
  return { ...emptyGraphSpec().domain, ...overrides };
}

const finite = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const text = (value: unknown, max = 120): string => (typeof value === "string" ? value.slice(0, max) : "");
const colour = (value: unknown, fallback: string): string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const style = (value: unknown): GraphLineStyle =>
  GRAPH_LINE_STYLES.includes(value as GraphLineStyle) ? (value as GraphLineStyle) : "solid";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function safeId(value: unknown, prefix: string, index: number): string {
  const raw = typeof value === "string" ? value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) : "";
  return raw || `${prefix}-${index + 1}`;
}

/** Coerce anything stored in the database into a usable graph, without throwing. */
export function normaliseGraphSpec(raw: unknown, fallback: GraphSpec = emptyGraphSpec()): GraphSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const source = raw as Record<string, unknown>;
  const rawDomain = (source.domain && typeof source.domain === "object" ? source.domain : {}) as Record<string, unknown>;
  const xMin = clamp(finite(rawDomain.xMin, fallback.domain.xMin), -1000, 1000);
  const xMax = clamp(finite(rawDomain.xMax, fallback.domain.xMax), -1000, 1000);
  const yMin = clamp(finite(rawDomain.yMin, fallback.domain.yMin), -1000, 1000);
  const yMax = clamp(finite(rawDomain.yMax, fallback.domain.yMax), -1000, 1000);
  const gridStepRaw = rawDomain.gridStep == null || rawDomain.gridStep === "" ? null : finite(rawDomain.gridStep, 0);
  const domain: GraphDomain = {
    xMin: xMax - xMin < 0.5 ? -10 : xMin,
    xMax: xMax - xMin < 0.5 ? 10 : xMax,
    yMin: yMax - yMin < 0.5 ? -8 : yMin,
    yMax: yMax - yMin < 0.5 ? 8 : yMax,
    gridStep: gridStepRaw && gridStepRaw > 0 ? clamp(gridStepRaw, 0.01, 1000) : null,
    showGrid: bool(rawDomain.showGrid, fallback.domain.showGrid),
    showAxes: bool(rawDomain.showAxes, fallback.domain.showAxes),
    showCoordinates: bool(rawDomain.showCoordinates, fallback.domain.showCoordinates),
    showLegend: bool(rawDomain.showLegend, fallback.domain.showLegend),
    showIntersections: bool(rawDomain.showIntersections, false),
    equalScale: bool(rawDomain.equalScale, false),
  };

  const functions = (Array.isArray(source.functions) ? source.functions : [])
    .slice(0, GRAPH_LIMITS.functions)
    .map((row, i) => {
      const fn = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        id: safeId(fn.id, "fn", i),
        expression: text(fn.expression, GRAPH_LIMITS.expression),
        color: colour(fn.color, GRAPH_COLORS[i % GRAPH_COLORS.length]),
        style: style(fn.style),
        width: clamp(finite(fn.width, 2), 1, 6),
        label: text(fn.label, 60),
        from: fn.from == null || fn.from === "" ? null : finite(fn.from, domain.xMin),
        to: fn.to == null || fn.to === "" ? null : finite(fn.to, domain.xMax),
        visible: bool(fn.visible, true),
      } satisfies GraphFunction;
    });

  const points = (Array.isArray(source.points) ? source.points : [])
    .slice(0, GRAPH_LIMITS.points)
    .map((row, i) => {
      const p = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        id: safeId(p.id, "pt", i),
        x: clamp(finite(p.x, 0), -10000, 10000),
        y: clamp(finite(p.y, 0), -10000, 10000),
        label: text(p.label, 40),
        color: colour(p.color, GRAPH_COLORS[i % GRAPH_COLORS.length]),
        showCoordinates: bool(p.showCoordinates, true),
        open: bool(p.open, false),
        visible: bool(p.visible, true),
      } satisfies GraphPoint;
    });

  const segments = (Array.isArray(source.segments) ? source.segments : [])
    .slice(0, GRAPH_LIMITS.segments)
    .map((row, i) => {
      const s = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        id: safeId(s.id, "seg", i),
        x1: finite(s.x1, 0), y1: finite(s.y1, 0), x2: finite(s.x2, 0), y2: finite(s.y2, 0),
        color: colour(s.color, GRAPH_COLORS[(i + 1) % GRAPH_COLORS.length]),
        style: style(s.style),
        width: clamp(finite(s.width, 2), 1, 6),
        label: text(s.label, 40),
        visible: bool(s.visible, true),
      } satisfies GraphSegment;
    });

  const annotations = (Array.isArray(source.annotations) ? source.annotations : [])
    .slice(0, GRAPH_LIMITS.annotations)
    .map((row, i) => {
      const a = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        id: safeId(a.id, "note", i),
        x: finite(a.x, 0), y: finite(a.y, 0),
        text: text(a.text, 160),
        color: colour(a.color, GRAPH_COLORS[0]),
      } satisfies GraphAnnotation;
    });

  const strokes = (Array.isArray(source.strokes) ? source.strokes : [])
    .slice(0, GRAPH_LIMITS.strokes)
    .map((row, i) => {
      const s = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const pts = (Array.isArray(s.points) ? s.points : [])
        .slice(0, GRAPH_LIMITS.strokePoints)
        .map((raw) => {
          const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
          return { x: clamp(finite(p.x, 0), -10000, 10000), y: clamp(finite(p.y, 0), -10000, 10000) };
        })
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      return {
        id: safeId(s.id, "stroke", i),
        points: pts,
        color: colour(s.color, GRAPH_COLORS[2]),
        width: clamp(finite(s.width, 2.5), 1, 8),
        visible: bool(s.visible, true),
      } satisfies GraphStroke;
    })
    .filter((s) => s.points.length >= 2);

  const regions = (Array.isArray(source.regions) ? source.regions : [])
    .slice(0, GRAPH_LIMITS.regions)
    .map((row, i) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        id: safeId(r.id, "region", i),
        x1: finite(r.x1, 0), y1: finite(r.y1, 0), x2: finite(r.x2, 0), y2: finite(r.y2, 0),
        color: colour(r.color, GRAPH_COLORS[4]),
        label: text(r.label, 60),
        visible: bool(r.visible, true),
      } satisfies GraphRegion;
    });

  return {
    version: GRAPH_SPEC_VERSION,
    title: text(source.title, 100),
    domain,
    functions,
    points,
    segments,
    annotations,
    strokes,
    regions,
  };
}

/** Does this specification contain anything a person drew or plotted? */
export function graphSpecHasWork(spec: GraphSpec | null | undefined): boolean {
  if (!spec) return false;
  return spec.functions.some((f) => f.expression.trim()) || spec.points.length > 0 ||
    spec.segments.length > 0 || spec.annotations.some((a) => a.text.trim()) ||
    (spec.strokes ?? []).some((s) => s.points.length >= 2) || (spec.regions ?? []).length > 0;
}

export function graphSpecSummary(spec: GraphSpec | null | undefined): string {
  if (!spec) return "";
  const parts: string[] = [];
  if (spec.functions.length) {
    parts.push(spec.functions.filter((f) => f.expression.trim()).map((f) => `y = ${f.expression}`).join("; "));
  }
  if (spec.points.length) parts.push(`${spec.points.length} plotted point(s)`);
  if (spec.segments.length) parts.push(`${spec.segments.length} drawn segment(s)`);
  if (spec.annotations.length) parts.push(`${spec.annotations.length} annotation(s)`);
  if ((spec.strokes ?? []).length) parts.push(`${spec.strokes.length} freehand stroke(s)`);
  if ((spec.regions ?? []).length) parts.push(`${spec.regions.length} highlighted region(s)`);
  return parts.join(" · ");
}

/** Choose a readable interval (1, 2 or 5 × 10ⁿ) for a range. */
export function niceGridStep(range: number, target = 10): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const rough = range / Math.max(2, target);
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const scaled = rough / power;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * power;
}

export function gridValues(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0 || max <= min) return [];
  const values: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start, guard = 0; v <= max + step * 1e-6 && guard < 400; v += step, guard += 1) {
    values.push(Math.abs(v) < step * 1e-9 ? 0 : Math.round(v * 1e6) / 1e6);
  }
  return values;
}

export function formatAxisLabel(value: number): string {
  if (Math.abs(value) < 1e-9) return "0";
  if (Math.abs(value) >= 1000) return value.toExponential(1).replace("e+", "e");
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export const GRAPH_VIEW = { width: 760, height: 500, left: 54, right: 22, top: 26, bottom: 46 } as const;

export interface GraphLayout {
  spec: GraphSpec;
  plotWidth: number;
  plotHeight: number;
  toX: (x: number) => number;
  toY: (y: number) => number;
  fromClientX: (px: number) => number;
  fromClientY: (py: number) => number;
  xStep: number;
  yStep: number;
  xTicks: number[];
  yTicks: number[];
}

export function graphLayout(spec: GraphSpec): GraphLayout {
  const { xMin, xMax, yMin, yMax } = spec.domain;
  const width = GRAPH_VIEW.width;
  const height = GRAPH_VIEW.height;
  const plotWidth = width - GRAPH_VIEW.left - GRAPH_VIEW.right;
  const plotHeight = height - GRAPH_VIEW.top - GRAPH_VIEW.bottom;
  const spanX = Math.max(0.5, xMax - xMin);
  const spanY = Math.max(0.5, yMax - yMin);
  const scaleX = plotWidth / spanX;
  const scaleY = plotHeight / spanY;
  const toX = (x: number) => GRAPH_VIEW.left + (x - xMin) * scaleX;
  const toY = (y: number) => GRAPH_VIEW.top + (yMax - y) * scaleY;
  const xStep = spec.domain.gridStep ?? niceGridStep(spanX, 12);
  const yStep = Math.max(0.01, (spec.domain.gridStep ?? niceGridStep(spanY, 8)));
  return {
    spec,
    plotWidth,
    plotHeight,
    toX,
    toY,
    fromClientX: (px: number) => xMin + ((px - GRAPH_VIEW.left) / plotWidth) * spanX,
    fromClientY: (py: number) => yMax - ((py - GRAPH_VIEW.top) / plotHeight) * spanY,
    xStep,
    yStep,
    xTicks: gridValues(xMin, xMax, xStep),
    yTicks: gridValues(yMin, yMax, yStep),
  };
}

export interface SampledFunction {
  id: string;
  label: string;
  color: string;
  style: GraphLineStyle;
  width: number;
  path: string;
  samples: { x: number; y: number }[];
  error: string | null;
}

/**
 * Sample a function into a polyline path. Gaps (NaN, poles, huge values) break
 * the path rather than drawing a false vertical line.
 */
export function sampleGraphFunction(fn: GraphFunction, spec: GraphSpec, compiled?: CompileResult): SampledFunction {
  const base = { id: fn.id, label: fn.label || `y = ${fn.expression}`, color: fn.color, style: fn.style, width: fn.width };
  const expression = stripEquation(fn.expression);
  if (!expression) return { ...base, path: "", samples: [], error: null };
  const c = compiled ?? compileExpression(expression);
  if (!c.ok) return { ...base, path: "", samples: [], error: c.error };
  const from = Math.max(spec.domain.xMin, Math.min(spec.domain.xMax, fn.from ?? spec.domain.xMin));
  const to = Math.max(spec.domain.xMin, Math.min(spec.domain.xMax, fn.to ?? spec.domain.xMax));
  if (!(to > from)) return { ...base, path: "", samples: [], error: null };
  const layout = graphLayout(spec);
  const steps = 420;
  const samples: { x: number; y: number }[] = [];
  let d = "";
  let drawing = false;
  let previousPy: number | null = null;
  const yLimit = Math.max(Math.abs(spec.domain.yMin), Math.abs(spec.domain.yMax)) * 40 + 100;
  for (let i = 0; i <= steps; i += 1) {
    const x = from + ((to - from) * i) / steps;
    const y = evaluateSafe(c, x);
    const py = y === null ? null : layout.toY(y);
    const px = layout.toX(x);
    const offScale = y === null || Math.abs(y) > yLimit || (py !== null && (py < GRAPH_VIEW.top - 400 || py > GRAPH_VIEW.height + 400));
    // A steep jump between adjacent samples is treated as a discontinuity if
    // the sign flips across a pole (e.g. 1/x).
    const jump = previousPy !== null && py !== null && Math.abs(py - previousPy) > GRAPH_VIEW.height * 1.6;
    if (offScale || jump) {
      drawing = false;
      previousPy = py;
      continue;
    }
    samples.push({ x, y: y as number });
    if (!drawing) {
      d += `${d ? " " : ""}M ${px.toFixed(2)} ${(py as number).toFixed(2)}`;
      drawing = true;
    } else {
      d += ` L ${px.toFixed(2)} ${(py as number).toFixed(2)}`;
    }
    previousPy = py;
  }
  return { ...base, path: d, samples, error: null };
}

export interface GraphIntersection {
  x: number;
  y: number;
  label: string;
  color: string;
}

/** Numeric intersections of plotted functions, found by sign change + bisection. */
export function graphIntersections(spec: GraphSpec, sampled?: SampledFunction[]): GraphIntersection[] {
  const fnSamples = (sampled ?? spec.functions.map((fn) => sampleGraphFunction(fn, spec)))
    .filter((f) => f.samples.length > 1);
  const found: GraphIntersection[] = [];
  const seen: { x: number; y: number }[] = [];
  for (let i = 0; i < fnSamples.length; i += 1) {
    for (let j = i + 1; j < fnSamples.length; j += 1) {
      const a = fnSamples[i];
      const b = fnSamples[j];
      const ca = compileExpression(stripEquation(spec.functions.find((f) => f.id === a.id)?.expression ?? ""));
      const cb = compileExpression(stripEquation(spec.functions.find((f) => f.id === b.id)?.expression ?? ""));
      if (!ca.ok || !cb.ok) continue;
      const count = Math.min(a.samples.length, b.samples.length);
      for (let k = 1; k < count; k += 1) {
        // Compare at the same x: re-evaluate both to avoid sampling drift.
        const x1 = a.samples[k - 1].x;
        const x2 = a.samples[k].x;
        const f1 = evaluateSafe(ca, x1);
        const g1 = evaluateSafe(cb, x1);
        const f2 = evaluateSafe(ca, x2);
        const g2 = evaluateSafe(cb, x2);
        if (f1 === null || g1 === null || f2 === null || g2 === null) continue;
        const d1 = f1 - g1;
        const d2 = f2 - g2;
        if (d1 === 0) {
          push(x1, f1);
          continue;
        }
        if (d1 * d2 < 0) {
          let lo = x1;
          let hi = x2;
          for (let step = 0; step < 48; step += 1) {
            const mid = (lo + hi) / 2;
            const fm = evaluateSafe(ca, mid);
            const gm = evaluateSafe(cb, mid);
            const fLo = evaluateSafe(ca, lo);
            const gLo = evaluateSafe(cb, lo);
            if (fm === null || gm === null || fLo === null || gLo === null) break;
            if ((fm - gm) * (fLo - gLo) > 0) lo = mid;
            else hi = mid;
          }
          const xm = (lo + hi) / 2;
          const ym = evaluateSafe(ca, xm);
          if (ym !== null) push(xm, ym);
        }
      }
    }
  }
  function push(x: number, y: number) {
    if (found.length >= 40) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (seen.some((p) => Math.abs(p.x - x) < 1e-4 && Math.abs(p.y - y) < 1e-3)) return;
    seen.push({ x, y });
    found.push({ x, y, label: `(${formatAxisLabel(x)}, ${formatAxisLabel(y)})`, color: "#b45309" });
  }
  return found;
}

/** Structural validation used by the teacher form and the save route. */
export function graphSpecIssues(spec: GraphSpec): string[] {
  const issues: string[] = [];
  if (spec.functions.length > GRAPH_LIMITS.functions) issues.push(`at most ${GRAPH_LIMITS.functions} functions`);
  if (spec.points.length > GRAPH_LIMITS.points) issues.push(`at most ${GRAPH_LIMITS.points} points`);
  if (spec.segments.length > GRAPH_LIMITS.segments) issues.push(`at most ${GRAPH_LIMITS.segments} segments`);
  if (spec.annotations.length > GRAPH_LIMITS.annotations) issues.push(`at most ${GRAPH_LIMITS.annotations} annotations`);
  if (!(spec.domain.xMax > spec.domain.xMin) || !(spec.domain.yMax > spec.domain.yMin)) {
    issues.push("the axis range must be positive in both directions");
  }
  for (const fn of spec.functions) {
    if (fn.expression.length > GRAPH_LIMITS.expression) issues.push("a function is too long");
    if (fn.expression.trim()) {
      const compiled = compileExpression(stripEquation(fn.expression));
      if (!compiled.ok) issues.push(`“${fn.expression}”: ${compiled.error}`);
    }
  }
  return issues;
}

/** A compact, human-readable description stored next to the answer. */
export function graphAnswerText(spec: GraphSpec): string {
  const lines: string[] = [];
  if (spec.functions.length) {
    for (const fn of spec.functions.filter((f) => f.expression.trim())) lines.push(`y = ${stripEquation(fn.expression)}`);
  }
  for (const p of spec.points) lines.push(`point (${formatAxisLabel(p.x)}, ${formatAxisLabel(p.y)})${p.label ? ` ${p.label}` : ""}`);
  for (const s of spec.segments) lines.push(`segment (${formatAxisLabel(s.x1)}, ${formatAxisLabel(s.y1)}) → (${formatAxisLabel(s.x2)}, ${formatAxisLabel(s.y2)})`);
  for (const a of spec.annotations) if (a.text.trim()) lines.push(`“${a.text}”`);
  return lines.join("; ");
}
