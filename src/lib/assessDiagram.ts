/**
 * Native Assess Prep diagrams, stored as data inside a question document
 * (`assessDiagramBlock`) and drawn as clean, labelled SVG — never images.
 *
 * Kinds cover the three formative papers:
 *   tape               ratio bar / tape diagram (labelled segments)
 *   double_number_line two aligned number lines
 *   venn2              two-set Venn diagram with region counts/labels
 *   stem_leaf          stem-and-leaf, optionally back-to-back
 *   box_plot           box-and-whisker from a five-number summary
 *   cumulative_curve   cumulative frequency curve (points joined smoothly)
 *   histogram          bars over class intervals (frequency or frequency density)
 *   shape_pattern      matchstick/dot shape patterns, one figure per pattern
 *   term_graph         term-number graph (points, optionally joined)
 *   table              a plain data table
 */

export const ASSESS_DIAGRAM_KINDS = [
  "tape", "double_number_line", "venn2", "stem_leaf", "box_plot",
  "cumulative_curve", "histogram", "shape_pattern", "term_graph", "table",
] as const;
export type AssessDiagramKind = (typeof ASSESS_DIAGRAM_KINDS)[number];

export interface AssessDiagramSpec {
  version: 1;
  kind: AssessDiagramKind;
  title: string;
  // tape
  tapeRows?: { label: string; segments: { label: string; span: number; shade?: boolean }[] }[];
  // double_number_line
  lines?: { label: string; unit: string; ticks: { at: number; label: string }[]; max: number }[];
  // venn2
  venn?: { leftLabel: string; rightLabel: string; leftOnly: string; both: string; rightOnly: string; outside: string; universalLabel?: string };
  // stem_leaf (back-to-back when rows carry `left`)
  stemRows?: { stem: string; leaves: string[]; left?: string[] }[];
  stemKey?: string;
  leftTitle?: string;
  rightTitle?: string;
  // box_plot / cumulative / histogram / term_graph share axis fields
  xMin?: number; xMax?: number; yMin?: number; yMax?: number;
  xLabel?: string; yLabel?: string;
  fiveNumber?: { min: number; q1: number; median: number; q3: number; max: number };
  points?: [number, number][];
  joinPoints?: boolean;
  bars?: { from: number; to: number; height: number }[];
  // shape_pattern
  patterns?: { label: string; squares: number; dots?: number }[];
  // table
  columns?: string[];
  rows?: string[][];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);
const s = (v: unknown, fb = "") => (typeof v === "string" ? v.slice(0, 120) : fb);
const n = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;

export function normaliseAssessDiagram(raw: unknown): AssessDiagramSpec | null {
  if (!isRecord(raw)) return null;
  const kind = s(raw.kind) as AssessDiagramKind;
  if (!(ASSESS_DIAGRAM_KINDS as readonly string[]).includes(kind)) return null;
  const spec: AssessDiagramSpec = { version: 1, kind, title: s(raw.title) };

  if (kind === "tape" && Array.isArray(raw.tapeRows)) {
    spec.tapeRows = raw.tapeRows.slice(0, 4).map((r) => {
      const row = isRecord(r) ? r : {};
      return {
        label: s(row.label),
        segments: (Array.isArray(row.segments) ? row.segments : []).slice(0, 16).map((g) => {
          const seg = isRecord(g) ? g : {};
          return { label: s(seg.label), span: Math.max(1, n(seg.span) ?? 1), shade: seg.shade === true };
        }),
      };
    }).filter((r) => r.segments.length);
  }
  if (kind === "double_number_line" && Array.isArray(raw.lines)) {
    spec.lines = raw.lines.slice(0, 2).map((l) => {
      const line = isRecord(l) ? l : {};
      return {
        label: s(line.label), unit: s(line.unit), max: n(line.max) ?? 10,
        ticks: (Array.isArray(line.ticks) ? line.ticks : []).slice(0, 24).map((t) => {
          const tick = isRecord(t) ? t : {};
          return { at: n(tick.at) ?? 0, label: s(tick.label) };
        }),
      };
    });
  }
  if (kind === "venn2" && isRecord(raw.venn)) {
    const v = raw.venn;
    spec.venn = {
      leftLabel: s(v.leftLabel), rightLabel: s(v.rightLabel), leftOnly: s(v.leftOnly),
      both: s(v.both), rightOnly: s(v.rightOnly), outside: s(v.outside),
      ...(s(v.universalLabel) ? { universalLabel: s(v.universalLabel) } : {}),
    };
  }
  if (kind === "stem_leaf" && Array.isArray(raw.stemRows)) {
    spec.stemRows = raw.stemRows.slice(0, 24).map((r) => {
      const row = isRecord(r) ? r : {};
      const strs = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, 40).map((x) => s(x));
      return { stem: s(row.stem), leaves: strs(row.leaves), ...(Array.isArray(row.left) ? { left: strs(row.left) } : {}) };
    });
    spec.stemKey = s(raw.stemKey); spec.leftTitle = s(raw.leftTitle); spec.rightTitle = s(raw.rightTitle);
  }
  for (const key of ["xMin", "xMax", "yMin", "yMax"] as const) {
    const v = n(raw[key]);
    if (v !== null) spec[key] = v;
  }
  spec.xLabel = s(raw.xLabel); spec.yLabel = s(raw.yLabel);
  if (isRecord(raw.fiveNumber)) {
    const f = raw.fiveNumber;
    const vals = [n(f.min), n(f.q1), n(f.median), n(f.q3), n(f.max)];
    if (vals.every((v) => v !== null)) {
      spec.fiveNumber = { min: vals[0]!, q1: vals[1]!, median: vals[2]!, q3: vals[3]!, max: vals[4]! };
    }
  }
  if (Array.isArray(raw.points)) {
    spec.points = raw.points.slice(0, 120).flatMap((p) => {
      if (!Array.isArray(p)) return [];
      const x = n(p[0]); const y = n(p[1]);
      return x === null || y === null ? [] : [[x, y] as [number, number]];
    });
    spec.joinPoints = raw.joinPoints !== false;
  }
  if (Array.isArray(raw.bars)) {
    spec.bars = raw.bars.slice(0, 30).flatMap((b) => {
      if (!isRecord(b)) return [];
      const from = n(b.from); const to = n(b.to); const height = n(b.height);
      return from === null || to === null || height === null ? [] : [{ from, to, height }];
    });
  }
  if (Array.isArray(raw.patterns)) {
    spec.patterns = raw.patterns.slice(0, 6).map((p) => {
      const pat = isRecord(p) ? p : {};
      return { label: s(pat.label), squares: Math.max(0, Math.floor(n(pat.squares) ?? 0)), ...(n(pat.dots) !== null ? { dots: Math.max(0, Math.floor(n(pat.dots)!)) } : {}) };
    });
  }
  if (Array.isArray(raw.columns)) spec.columns = raw.columns.slice(0, 8).map((c) => s(c));
  if (Array.isArray(raw.rows)) {
    spec.rows = raw.rows.slice(0, 24).map((r) => (Array.isArray(r) ? r : []).slice(0, 8).map((c) => s(c)));
  }
  return spec;
}

export function assessDiagramSummary(spec: AssessDiagramSpec): string {
  return `${spec.kind.replace(/_/g, " ")} diagram${spec.title ? `: ${spec.title}` : ""}`;
}
