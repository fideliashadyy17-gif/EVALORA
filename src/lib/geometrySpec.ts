/**
 * Serialisable geometry construction shared by the teacher geometry builder,
 * the student geometry workspace, question rendering and marking.
 *
 * Constructions are relational, not pictures: a midpoint stays the midpoint,
 * a perpendicular stays perpendicular, an intersection follows both lines and
 * a circle keeps its radius when its centre or rim point is dragged. Every
 * coordinate is stored in mathematics-plane units, so the construction can be
 * re-opened at any size and rendered identically on a phone, a tablet or a
 * printed page.
 */

export const GEOMETRY_SPEC_VERSION = 1;
export const GEOMETRY_COLORS = ["#0a5c36", "#b45309", "#1d4ed8", "#b91c1c", "#7c3aed", "#0e7490"];
export const GEOMETRY_LINE_STYLES = ["solid", "dashed", "dotted"] as const;
export type GeometryLineStyle = (typeof GEOMETRY_LINE_STYLES)[number];

export type GeometryPointKind = "free" | "midpoint" | "foot" | "intersection";

export interface GeometryPoint {
  id: string;
  x: number;
  y: number;
  /** `free` points are dragged; the others are recomputed from their parents. */
  kind: GeometryPointKind;
  /** Parent point ids (midpoint, foot) or line ids (intersection). */
  dependsOn: string[];
  label: string;
  color: string;
  showLabel: boolean;
}

export type GeometryLineKind = "segment" | "line" | "ray";

export interface GeometryLine {
  id: string;
  kind: GeometryLineKind;
  /** First point id. */
  a: string;
  /** Second point id; omitted for a relation line. */
  b: string | null;
  /** Parallel/perpendicular construction: a line through `point` related to `to`. */
  relation: { type: "parallel" | "perpendicular"; point: string; to: string } | null;
  color: string;
  style: GeometryLineStyle;
  width: number;
  label: string;
  showMeasurement: boolean;
}

export interface GeometryCircle {
  id: string;
  center: string;
  through: string;
  color: string;
  style: GeometryLineStyle;
  width: number;
  label: string;
  showMeasurement: boolean;
}

export interface GeometryPolygon {
  id: string;
  points: string[];
  color: string;
  fill: string;
  style: GeometryLineStyle;
  width: number;
  label: string;
  showMeasurement: boolean;
}

export interface GeometryAngle {
  id: string;
  a: string;
  vertex: string;
  b: string;
  color: string;
  label: string;
  showMeasurement: boolean;
}

export interface GeometryAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

export interface GeometryDomain {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  gridStep: number | null;
  showGrid: boolean;
  showAxes: boolean;
  snap: boolean;
}

export interface GeometrySpec {
  version: number;
  title: string;
  domain: GeometryDomain;
  points: GeometryPoint[];
  lines: GeometryLine[];
  circles: GeometryCircle[];
  polygons: GeometryPolygon[];
  angles: GeometryAngle[];
  annotations: GeometryAnnotation[];
}

export const GEOMETRY_LIMITS = {
  points: 160,
  lines: 120,
  circles: 60,
  polygons: 40,
  angles: 60,
  annotations: 60,
} as const;

export function emptyGeometryDomain(overrides: Partial<GeometryDomain> = {}): GeometryDomain {
  return {
    xMin: -6,
    xMax: 6,
    yMin: -4,
    yMax: 4,
    gridStep: 1,
    showGrid: true,
    showAxes: true,
    snap: true,
    ...overrides,
  };
}

export function emptyGeometrySpec(overrides: Partial<GeometrySpec> = {}): GeometrySpec {
  return {
    version: GEOMETRY_SPEC_VERSION,
    title: "",
    domain: emptyGeometryDomain(),
    points: [],
    lines: [],
    circles: [],
    polygons: [],
    angles: [],
    annotations: [],
    ...overrides,
  };
}

const finite = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v: unknown, f: boolean): boolean => (typeof v === "boolean" ? v : f);
const text = (v: unknown, max = 120): string => (typeof v === "string" ? v.slice(0, max) : "");
const colour = (v: unknown, f: string): string => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : f);
const style = (v: unknown): GeometryLineStyle =>
  GEOMETRY_LINE_STYLES.includes(v as GeometryLineStyle) ? (v as GeometryLineStyle) : "solid";
const idText = (v: unknown): string => (typeof v === "string" ? v.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) : "");

/** Coerce stored JSON into a valid construction, dropping dangling references. */
export function normaliseGeometrySpec(raw: unknown, fallback: GeometrySpec = emptyGeometrySpec()): GeometrySpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const source = raw as Record<string, unknown>;
  const rawDomain = (source.domain && typeof source.domain === "object" ? source.domain : {}) as Record<string, unknown>;
  const domain: GeometryDomain = {
    xMin: finite(rawDomain.xMin, fallback.domain.xMin),
    xMax: finite(rawDomain.xMax, fallback.domain.xMax),
    yMin: finite(rawDomain.yMin, fallback.domain.yMin),
    yMax: finite(rawDomain.yMax, fallback.domain.yMax),
    gridStep: rawDomain.gridStep == null || rawDomain.gridStep === "" ? 1 : Math.max(0.01, finite(rawDomain.gridStep, 1)),
    showGrid: bool(rawDomain.showGrid, true),
    showAxes: bool(rawDomain.showAxes, true),
    snap: bool(rawDomain.snap, true),
  };
  if (domain.xMax - domain.xMin < 0.5) { domain.xMin = -6; domain.xMax = 6; }
  if (domain.yMax - domain.yMin < 0.5) { domain.yMin = -4; domain.yMax = 4; }

  const pointIds = new Set<string>();
  const points: GeometryPoint[] = [];
  for (const [i, row] of (Array.isArray(source.points) ? source.points : []).slice(0, GEOMETRY_LIMITS.points).entries()) {
    const p = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const id = idText(p.id) || `P${i + 1}`;
    if (pointIds.has(id)) continue;
    pointIds.add(id);
    const kind: GeometryPointKind = ["midpoint", "foot", "intersection"].includes(String(p.kind))
      ? (p.kind as GeometryPointKind)
      : "free";
    points.push({
      id,
      x: finite(p.x, 0),
      y: finite(p.y, 0),
      kind,
      dependsOn: (Array.isArray(p.dependsOn) ? p.dependsOn : []).filter((v): v is string => typeof v === "string").slice(0, 4),
      label: text(p.label, 12),
      color: colour(p.color, GEOMETRY_COLORS[0]),
      showLabel: bool(p.showLabel, true),
    });
  }

  const lineIds = new Set<string>();
  const lines: GeometryLine[] = [];
  for (const [i, row] of (Array.isArray(source.lines) ? source.lines : []).slice(0, GEOMETRY_LIMITS.lines).entries()) {
    const l = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const id = idText(l.id) || `l${i + 1}`;
    if (lineIds.has(id)) continue;
    const relationRaw = (l.relation && typeof l.relation === "object" ? l.relation : null) as Record<string, unknown> | null;
    const relation: { type: "parallel" | "perpendicular"; point: string; to: string } | null =
      relationRaw && (relationRaw.type === "parallel" || relationRaw.type === "perpendicular") &&
      typeof relationRaw.point === "string" && typeof relationRaw.to === "string"
        ? { type: relationRaw.type, point: relationRaw.point, to: relationRaw.to }
        : null;
    const kind: GeometryLineKind = ["line", "ray"].includes(String(l.kind)) ? (l.kind as GeometryLineKind) : "segment";
    const a = typeof l.a === "string" ? l.a : "";
    const b = typeof l.b === "string" ? l.b : null;
    if (relation) {
      if (!pointIds.has(relation.point)) continue;
      lineIds.add(id);
      lines.push({
        id, kind, a: relation.point, b: null, relation,
        color: colour(l.color, GEOMETRY_COLORS[2]),
        style: style(l.style), width: Math.min(6, Math.max(1, finite(l.width, 2))),
        label: text(l.label, 20), showMeasurement: bool(l.showMeasurement, false),
      });
      continue;
    }
    if (!pointIds.has(a) || !b || !pointIds.has(b) || a === b) continue;
    lineIds.add(id);
    lines.push({
      id, kind, a, b, relation: null,
      color: colour(l.color, GEOMETRY_COLORS[1]),
      style: style(l.style), width: Math.min(6, Math.max(1, finite(l.width, 2))),
      label: text(l.label, 20), showMeasurement: bool(l.showMeasurement, true),
    });
  }

  const circles: GeometryCircle[] = (Array.isArray(source.circles) ? source.circles : [])
    .slice(0, GEOMETRY_LIMITS.circles)
    .map((row, i) => ({ row, i }))
    .flatMap(({ row, i }) => {
      const c = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      if (typeof c.center !== "string" || typeof c.through !== "string") return [];
      if (!pointIds.has(c.center) || !pointIds.has(c.through) || c.center === c.through) return [];
      return [{
        id: idText(c.id) || `c${i + 1}`,
        center: c.center,
        through: c.through,
        color: colour(c.color, GEOMETRY_COLORS[3]),
        style: style(c.style),
        width: Math.min(6, Math.max(1, finite(c.width, 2))),
        label: text(c.label, 20),
        showMeasurement: bool(c.showMeasurement, true),
      } satisfies GeometryCircle];
    });

  const polygons: GeometryPolygon[] = (Array.isArray(source.polygons) ? source.polygons : [])
    .slice(0, GEOMETRY_LIMITS.polygons)
    .flatMap((row, i) => {
      const p = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const ids = (Array.isArray(p.points) ? p.points : []).filter((v): v is string => typeof v === "string" && pointIds.has(v));
      if (new Set(ids).size < 3) return [];
      return [{
        id: idText(p.id) || `poly${i + 1}`,
        points: ids.slice(0, 24),
        color: colour(p.color, GEOMETRY_COLORS[0]),
        fill: colour(p.fill, "#bfd8cc"),
        style: style(p.style),
        width: Math.min(6, Math.max(1, finite(p.width, 2))),
        label: text(p.label, 20),
        showMeasurement: bool(p.showMeasurement, true),
      } satisfies GeometryPolygon];
    });

  const angles: GeometryAngle[] = (Array.isArray(source.angles) ? source.angles : [])
    .slice(0, GEOMETRY_LIMITS.angles)
    .flatMap((row, i) => {
      const a = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      if (typeof a.a !== "string" || typeof a.vertex !== "string" || typeof a.b !== "string") return [];
      if (![a.a, a.vertex, a.b].every((id) => pointIds.has(id))) return [];
      return [{
        id: idText(a.id) || `ang${i + 1}`,
        a: a.a, vertex: a.vertex, b: a.b,
        color: colour(a.color, GEOMETRY_COLORS[4]),
        label: text(a.label, 20),
        showMeasurement: bool(a.showMeasurement, true),
      } satisfies GeometryAngle];
    });

  const annotations: GeometryAnnotation[] = (Array.isArray(source.annotations) ? source.annotations : [])
    .slice(0, GEOMETRY_LIMITS.annotations)
    .map((row, i) => {
      const a = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        id: idText(a.id) || `note${i + 1}`,
        x: finite(a.x, 0), y: finite(a.y, 0),
        text: text(a.text, 160),
        color: colour(a.color, GEOMETRY_COLORS[0]),
      } satisfies GeometryAnnotation;
    });

  return {
    version: GEOMETRY_SPEC_VERSION,
    title: text(source.title, 100),
    domain,
    points,
    lines,
    circles,
    polygons,
    angles,
    annotations,
  };
}

export function geometrySpecHasWork(spec: GeometrySpec | null | undefined): boolean {
  if (!spec) return false;
  return spec.points.length > 0 || spec.lines.length > 0 || spec.circles.length > 0 ||
    spec.polygons.length > 0 || spec.angles.length > 0 || spec.annotations.some((a) => a.text.trim());
}

export function geometrySpecSummary(spec: GeometrySpec | null | undefined): string {
  if (!spec) return "";
  const parts: string[] = [];
  if (spec.points.length) parts.push(`${spec.points.length} point(s)`);
  if (spec.lines.length) parts.push(`${spec.lines.length} line/segment(s)`);
  if (spec.circles.length) parts.push(`${spec.circles.length} circle(s)`);
  if (spec.polygons.length) parts.push(`${spec.polygons.length} polygon(s)`);
  if (spec.angles.length) parts.push(`${spec.angles.length} angle(s)`);
  return parts.join(" · ");
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Resolution: relational constructions → coordinates                         */
/* ────────────────────────────────────────────────────────────────────────── */

export interface ResolvedPoint {
  id: string;
  x: number;
  y: number;
  kind: GeometryPointKind;
  label: string;
  color: string;
  showLabel: boolean;
}

export interface ResolvedLine {
  id: string;
  kind: GeometryLineKind;
  a: { x: number; y: number };
  b: { x: number; y: number } | null;
  direction: { dx: number; dy: number } | null;
  relation: GeometryLine["relation"];
  color: string;
  style: GeometryLineStyle;
  width: number;
  label: string;
  showMeasurement: boolean;
}

export interface ResolvedGeometry {
  points: Map<string, ResolvedPoint>;
  lines: ResolvedLine[];
}

function lineThrough(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return null;
  return { dx, dy, length };
}

function intersectionOf(
  a: { x: number; y: number }, da: { dx: number; dy: number },
  b: { x: number; y: number }, db: { dx: number; dy: number },
): { x: number; y: number } | null {
  const denominator = da.dx * db.dy - da.dy * db.dx;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((b.x - a.x) * db.dy - (b.y - a.y) * db.dx) / denominator;
  const x = a.x + t * da.dx;
  const y = a.y + t * da.dy;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function footOf(p: { x: number; y: number }, a: { x: number; y: number }, d: { dx: number; dy: number }) {
  const len2 = d.dx * d.dx + d.dy * d.dy;
  if (len2 < 1e-9) return null;
  const t = ((p.x - a.x) * d.dx + (p.y - a.y) * d.dy) / len2;
  return { x: a.x + t * d.dx, y: a.y + t * d.dy };
}

/**
 * Compute every coordinate, including derived points and relational lines.
 * Runs a small fixed-point iteration: a derivation whose inputs are not ready
 * yet is retried, so construction order never matters.
 */
export function resolveGeometry(spec: GeometrySpec): ResolvedGeometry {
  const points = new Map<string, ResolvedPoint>();
  const pending = new Map<string, GeometryPoint>();
  for (const p of spec.points) {
    const resolved: ResolvedPoint = { id: p.id, x: p.x, y: p.y, kind: p.kind, label: p.label, color: p.color, showLabel: p.showLabel };
    if (p.kind === "free") points.set(p.id, resolved);
    else pending.set(p.id, p);
  }

  const lineDirections = new Map<string, { a: { x: number; y: number }; d: { dx: number; dy: number } }>();
  const lineById = new Map(spec.lines.map((l) => [l.id, l]));

  const resolveLineDirection = (line: GeometryLine): { a: { x: number; y: number }; d: { dx: number; dy: number } } | null => {
    const cached = lineDirections.get(line.id);
    if (cached) return cached;
    if (line.relation) {
      const through = points.get(line.relation.point);
      const base = lineById.get(line.relation.to);
      if (!through || !base || base.id === line.id) return null;
      const baseDir = resolveLineDirection(base);
      if (!baseDir) return null;
      const d = line.relation.type === "perpendicular"
        ? { dx: -baseDir.d.dy, dy: baseDir.d.dx }
        : { dx: baseDir.d.dx, dy: baseDir.d.dy };
      const result = { a: { x: through.x, y: through.y }, d };
      lineDirections.set(line.id, result);
      return result;
    }
    const a = line.a ? points.get(line.a) : null;
    const b = line.b ? points.get(line.b) : null;
    if (!a || !b) return null;
    const direction = lineThrough(a, b);
    if (!direction) return null;
    const result = { a: { x: a.x, y: a.y }, d: { dx: direction.dx, dy: direction.dy } };
    lineDirections.set(line.id, result);
    return result;
  };

  for (let round = 0; round < 8 && pending.size; round += 1) {
    let progressed = false;
    for (const [id, p] of [...pending]) {
      let solved: { x: number; y: number } | null = null;
      if (p.kind === "midpoint") {
        const a = points.get(p.dependsOn[0]);
        const b = points.get(p.dependsOn[1]);
        if (a && b) solved = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      } else if (p.kind === "foot") {
        const from = points.get(p.dependsOn[0]);
        const line = p.dependsOn[1] ? lineById.get(p.dependsOn[1]) : null;
        if (from && line) {
          const dir = resolveLineDirection(line);
          if (dir) solved = footOf(from, dir.a, dir.d);
        }
      } else if (p.kind === "intersection") {
        const l1 = p.dependsOn[0] ? lineById.get(p.dependsOn[0]) : null;
        const l2 = p.dependsOn[1] ? lineById.get(p.dependsOn[1]) : null;
        if (l1 && l2) {
          const d1 = resolveLineDirection(l1);
          const d2 = resolveLineDirection(l2);
          if (d1 && d2) solved = intersectionOf(d1.a, d1.d, d2.a, d2.d);
        }
      }
      if (solved) {
        points.set(id, { id, x: solved.x, y: solved.y, kind: p.kind, label: p.label, color: p.color, showLabel: p.showLabel });
        pending.delete(id);
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  const lines: ResolvedLine[] = [];
  for (const line of spec.lines) {
    const dir = line.relation ? resolveLineDirection(line) : null;
    if (line.relation) {
      if (!dir) continue;
      lines.push({
        id: line.id, kind: line.kind,
        a: dir.a, b: null, direction: dir.d, relation: line.relation,
        color: line.color, style: line.style, width: line.width, label: line.label, showMeasurement: line.showMeasurement,
      });
      continue;
    }
    const a = line.a ? points.get(line.a) : null;
    const b = line.b ? points.get(line.b) : null;
    if (!a || !b) continue;
    const d = lineThrough(a, b);
    lines.push({
      id: line.id, kind: line.kind,
      a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y },
      direction: d ? { dx: d.dx, dy: d.dy } : null,
      relation: null,
      color: line.color, style: line.style, width: line.width, label: line.label, showMeasurement: line.showMeasurement,
    });
  }

  return { points, lines };
}

export const GEOMETRY_VIEW = { width: 760, height: 520, left: 40, right: 24, top: 24, bottom: 42 } as const;

export interface GeometryLayout {
  spec: GeometrySpec;
  toX: (x: number) => number;
  toY: (y: number) => number;
  fromClientX: (px: number) => number;
  fromClientY: (py: number) => number;
  step: number;
  xTicks: number[];
  yTicks: number[];
}

function niceStep(range: number, target = 10): number {
  const rough = range / Math.max(2, target);
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const scaled = rough / power;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * power;
}

export function geometryLayout(spec: GeometrySpec): GeometryLayout {
  const { xMin, xMax, yMin, yMax } = spec.domain;
  const width = GEOMETRY_VIEW.width;
  const height = GEOMETRY_VIEW.height;
  const plotWidth = width - GEOMETRY_VIEW.left - GEOMETRY_VIEW.right;
  const plotHeight = height - GEOMETRY_VIEW.top - GEOMETRY_VIEW.bottom;
  const spanX = Math.max(0.5, xMax - xMin);
  const spanY = Math.max(0.5, yMax - yMin);
  const toX = (x: number) => GEOMETRY_VIEW.left + ((x - xMin) / spanX) * plotWidth;
  const toY = (y: number) => GEOMETRY_VIEW.top + ((yMax - y) / spanY) * plotHeight;
  const step = spec.domain.gridStep ?? niceStep(spanX, 12);
  const ticks = (min: number, max: number, s: number) => {
    const arr: number[] = [];
    const start = Math.ceil(min / s) * s;
    for (let v = start, guard = 0; v <= max + s * 1e-6 && guard < 300; v += s, guard += 1) {
      arr.push(Math.abs(v) < s * 1e-9 ? 0 : Math.round(v * 1e6) / 1e6);
    }
    return arr;
  };
  return {
    spec,
    toX, toY,
    fromClientX: (px: number) => xMin + ((px - GEOMETRY_VIEW.left) / plotWidth) * spanX,
    fromClientY: (py: number) => yMax - ((py - GEOMETRY_VIEW.top) / plotHeight) * spanY,
    step,
    xTicks: ticks(xMin, xMax, step),
    yTicks: ticks(yMin, yMax, step),
  };
}

export function snapToGrid(value: number, step: number, enabled: boolean): number {
  if (!enabled || !(step > 0)) return Math.round(value * 100) / 100;
  return Math.round(value / step) * step;
}

/** Clip an infinite line to the drawing rectangle (used for `line` and rays). */
export function clipLineToRect(
  a: { x: number; y: number },
  direction: { dx: number; dy: number },
  rect: { minX: number; maxX: number; minY: number; maxY: number },
): { x1: number; y1: number; x2: number; y2: number } | null {
  const candidates: { x: number; y: number; t: number }[] = [];
  const test = (t: number) => {
    const x = a.x + direction.dx * t;
    const y = a.y + direction.dy * t;
    if (x >= rect.minX - 1e-9 && x <= rect.maxX + 1e-9 && y >= rect.minY - 1e-9 && y <= rect.maxY + 1e-9) candidates.push({ x, y, t });
  };
  if (Math.abs(direction.dx) > 1e-12) {
    test((rect.minX - a.x) / direction.dx);
    test((rect.maxX - a.x) / direction.dx);
  }
  if (Math.abs(direction.dy) > 1e-12) {
    test((rect.minY - a.y) / direction.dy);
    test((rect.maxY - a.y) / direction.dy);
  }
  const unique = [...new Map(candidates.map((c) => [`${c.x.toFixed(4)}:${c.y.toFixed(4)}`, c])).values()].sort((p, q) => p.t - q.t);
  if (unique.length < 2) return null;
  return { x1: unique[0].x, y1: unique[0].y, x2: unique[unique.length - 1].x, y2: unique[unique.length - 1].y };
}

export function formatMeasurement(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * Math.pow(10, digits)) / Math.pow(10, digits);
  return String(rounded);
}

export interface GeometryMeasurement {
  id: string;
  kind: "length" | "radius" | "angle" | "area" | "perimeter";
  text: string;
}

/** Measurements recomputed from the current construction. */
export function geometryMeasurements(spec: GeometrySpec, resolved: ResolvedGeometry = resolveGeometry(spec)): GeometryMeasurement[] {
  const out: GeometryMeasurement[] = [];
  for (const line of spec.lines) {
    if (line.kind !== "segment" || !line.showMeasurement) continue;
    const a = resolved.points.get(line.a);
    const b = line.b ? resolved.points.get(line.b) : null;
    if (!a || !b) continue;
    out.push({ id: line.id, kind: "length", text: `${formatMeasurement(Math.hypot(b.x - a.x, b.y - a.y))} units` });
  }
  for (const circle of spec.circles) {
    if (!circle.showMeasurement) continue;
    const center = resolved.points.get(circle.center);
    const through = resolved.points.get(circle.through);
    if (!center || !through) continue;
    out.push({ id: circle.id, kind: "radius", text: `r = ${formatMeasurement(Math.hypot(through.x - center.x, through.y - center.y))}` });
  }
  for (const angle of spec.angles) {
    if (!angle.showMeasurement) continue;
    const a = resolved.points.get(angle.a);
    const v = resolved.points.get(angle.vertex);
    const b = resolved.points.get(angle.b);
    if (!a || !v || !b) continue;
    const v1 = { x: a.x - v.x, y: a.y - v.y };
    const v2 = { x: b.x - v.x, y: b.y - v.y };
    const la = Math.hypot(v1.x, v1.y);
    const lb = Math.hypot(v2.x, v2.y);
    if (la < 1e-9 || lb < 1e-9) continue;
    const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / (la * lb)));
    out.push({ id: angle.id, kind: "angle", text: `${formatMeasurement((Math.acos(cos) * 180) / Math.PI, 1)}°` });
  }
  for (const poly of spec.polygons) {
    if (!poly.showMeasurement) continue;
    const pts = poly.points.map((id) => resolved.points.get(id)).filter(Boolean) as ResolvedPoint[];
    if (pts.length < 3) continue;
    let area = 0;
    let perimeter = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      area += p.x * q.y - q.x * p.y;
      perimeter += Math.hypot(q.x - p.x, q.y - p.y);
    }
    out.push({ id: poly.id, kind: "area", text: `A = ${formatMeasurement(Math.abs(area) / 2)} sq units` });
    out.push({ id: `${poly.id}-p`, kind: "perimeter", text: `P = ${formatMeasurement(perimeter)} units` });
  }
  return out;
}

export function geometrySpecIssues(spec: GeometrySpec): string[] {
  const issues: string[] = [];
  if (!(spec.domain.xMax > spec.domain.xMin) || !(spec.domain.yMax > spec.domain.yMin)) issues.push("the axis range must be positive in both directions");
  if (spec.points.length > GEOMETRY_LIMITS.points) issues.push("too many points");
  if (spec.lines.length > GEOMETRY_LIMITS.lines) issues.push("too many lines");
  if (spec.circles.length > GEOMETRY_LIMITS.circles) issues.push("too many circles");
  if (spec.polygons.length > GEOMETRY_LIMITS.polygons) issues.push("too many polygons");
  if (spec.angles.length > GEOMETRY_LIMITS.angles) issues.push("too many angles");
  const pointIds = new Set(spec.points.map((p) => p.id));
  for (const line of spec.lines) {
    if (line.relation && !pointIds.has(line.relation.point)) issues.push(`“${line.id}” is missing its point`);
    if (!line.relation && (!pointIds.has(line.a) || !line.b || !pointIds.has(line.b))) issues.push(`“${line.id}” is missing an endpoint`);
  }
  for (const circle of spec.circles) {
    if (!pointIds.has(circle.center) || !pointIds.has(circle.through)) issues.push(`“${circle.id}” is missing its centre or rim point`);
  }
  return issues;
}

export function geometryAnswerText(spec: GeometrySpec, resolved: ResolvedGeometry = resolveGeometry(spec)): string {
  const lines: string[] = [];
  for (const p of spec.points) {
    const r = resolved.points.get(p.id);
    if (r) lines.push(`${p.label || p.id}(${formatMeasurement(r.x)}, ${formatMeasurement(r.y)})`);
  }
  for (const l of spec.lines) {
    if (l.kind === "segment") lines.push(`segment ${l.a}–${l.b ?? "?"}`);
    else if (l.relation) lines.push(`${l.kind} through ${l.relation.point} ${l.relation.type} to ${l.relation.to}`);
  }
  for (const c of spec.circles) lines.push(`circle centre ${c.center} through ${c.through}`);
  for (const poly of spec.polygons) lines.push(`polygon ${poly.points.join("–")}`);
  for (const a of spec.angles) lines.push(`angle ${a.a}${a.vertex}${a.b}`);
  return lines.join("; ");
}
