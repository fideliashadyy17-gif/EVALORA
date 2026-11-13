/**
 * Serialisable statistics specification shared by the teacher figure builder,
 * the student statistics workspace, the question renderer and the marking
 * screen.
 *
 * Like `graphSpec` and `geometrySpec`, the specification survives a JSONB
 * round-trip unchanged. A chart is stored as the data it represents, never as a
 * flattened image, so a marker can reopen the values and check the reasoning.
 *
 * A teacher (or a candidate) chooses one representation:
 *
 *   · dot plot              — one dot per observation, stacked by value;
 *   · bar chart             — categorical counts;
 *   · histogram             — numeric data grouped into equal-width bins;
 *   · box plot              — five-number summary with 1.5 × IQR outliers;
 *   · cumulative frequency  — running totals, drawn as a step chart.
 *
 * The functions in this module are pure and server-safe. No chart library is
 * loaded: the renderer draws the SVG from these numbers.
 */

export const STATS_SPEC_VERSION = 1;

export const STATS_CHART_TYPES = [
  "dot_plot",
  "bar_chart",
  "histogram",
  "box_plot",
  "cumulative_frequency",
  "frequency_polygon",
] as const;

export type StatsChartType = (typeof STATS_CHART_TYPES)[number];

export const STATS_CHART_LABELS: Record<StatsChartType, string> = {
  dot_plot: "Dot plot",
  bar_chart: "Bar chart",
  histogram: "Histogram",
  box_plot: "Box plot",
  cumulative_frequency: "Cumulative frequency curve",
  frequency_polygon: "Frequency polygon",
};

/**
 * How the observations were captured.
 *
 *   raw      — a list of individual values (the original behaviour);
 *   grouped  — a grouped frequency table, possibly with unequal class widths.
 *
 * Grouped data is the only honest way to draw a histogram of a continuous
 * variable whose classes have different widths, because the bar height is the
 * frequency *density*, not the frequency. It is also what a cumulative
 * frequency curve of a grouped distribution needs, and what an estimated mean
 * from midpoints needs. Everything is stored, nothing is derived on the fly and
 * then thrown away, so the marker sees exactly the table the candidate built.
 */
export const STATS_DATA_MODES = ["raw", "grouped"] as const;
export type StatsDataMode = (typeof STATS_DATA_MODES)[number];

export interface StatsGroup {
  id: string;
  /** Lower class boundary. */
  from: number;
  /** Upper class boundary. */
  to: number;
  frequency: number;
}

export interface StatsCategory {
  id: string;
  label: string;
  value: number;
}

export interface StatsSpec {
  version: number;
  chart: StatsChartType;
  title: string;
  xLabel: string;
  yLabel: string;
  /** Raw numeric observations, used by every chart except the bar chart. */
  values: number[];
  /** Categorical counts for a bar chart. */
  categories: StatsCategory[];
  /** Fixed histogram bin width; `null` chooses a sensible width from the data. */
  binWidth: number | null;
  /** Show computed summary statistics beside the chart (off by default). */
  showSummary: boolean;
  /** Candidate-entered five-number summary for a constructed box plot. */
  fiveNumberSummary?: FiveNumberSummary | null;
  /** raw (default) or grouped. Absent means raw, so old answers stay identical. */
  dataMode?: StatsDataMode;
  /** Grouped frequency table — the source of truth when dataMode is "grouped". */
  groups?: StatsGroup[];
}

export const STATS_LIMITS = {
  values: 400,
  categories: 40,
  groups: 40,
  label: 60,
  binWidth: 1_000_000,
  magnitude: 1_000_000_000,
  histogramBins: 60,
} as const;

export function emptyStatsSpec(overrides: Partial<StatsSpec> = {}): StatsSpec {
  return {
    version: STATS_SPEC_VERSION,
    chart: "dot_plot",
    title: "",
    xLabel: "",
    yLabel: "Frequency",
    values: [],
    categories: [],
    binWidth: null,
    showSummary: false,
    fiveNumberSummary: null,
    dataMode: "raw",
    groups: [],
    ...overrides,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function tidy(value: number): number {
  const clamped = Math.max(-STATS_LIMITS.magnitude, Math.min(STATS_LIMITS.magnitude, value));
  return Math.round(clamped * 1e6) / 1e6;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return tidy(value);
  if (typeof value === "string" && value.trim() && value.trim().length <= 24) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return tidy(parsed);
  }
  return null;
}

function positiveNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? Math.min(parsed, STATS_LIMITS.binWidth) : null;
}

function text(value: unknown, fallback: string, max = STATS_LIMITS.label): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

export function isStatsChartType(value: unknown): value is StatsChartType {
  return typeof value === "string" && (STATS_CHART_TYPES as readonly string[]).includes(value);
}

/**
 * Repair any stored specification. Unknown chart types fall back to a dot plot,
 * non-finite values are dropped, arrays are capped and everything is reduced to
 * a shape the renderer can always draw.
 */
export function normaliseStatsSpec(raw: unknown, fallback: StatsSpec = emptyStatsSpec()): StatsSpec {
  if (!isRecord(raw)) {
    return {
      ...fallback,
      values: [...fallback.values],
      categories: fallback.categories.map((c) => ({ ...c })),
      groups: (fallback.groups ?? []).map((g) => ({ ...g })),
    };
  }

  const values = Array.isArray(raw.values)
    ? raw.values.map(finiteNumber).filter((value): value is number => value !== null).slice(0, STATS_LIMITS.values)
    : fallback.values;

  const categories = Array.isArray(raw.categories)
    ? raw.categories.map((entry, index) => {
        const row = isRecord(entry) ? entry : {};
        return {
          id: typeof row.id === "string" && row.id ? row.id.slice(0, 80) : `cat-${index + 1}`,
          label: text(row.label, "", STATS_LIMITS.label),
          value: finiteNumber(row.value) ?? 0,
        };
      }).slice(0, STATS_LIMITS.categories)
    : fallback.categories;

  // A class with a non-finite boundary or a negative frequency is not a class:
  // it is dropped rather than "repaired" into a believable-looking row.
  const groups = Array.isArray(raw.groups)
    ? raw.groups.map((entry, index) => {
        const row = isRecord(entry) ? entry : {};
        const from = finiteNumber(row.from);
        const to = finiteNumber(row.to);
        const frequency = finiteNumber(row.frequency);
        if (from === null || to === null || frequency === null || frequency < 0) return null;
        return {
          id: typeof row.id === "string" && row.id ? row.id.slice(0, 80) : `grp-${index + 1}`,
          from: Math.min(from, to),
          to: Math.max(from, to),
          frequency,
        };
      }).filter((group): group is StatsGroup => group !== null && group.to > group.from).slice(0, STATS_LIMITS.groups)
    : (fallback.groups ?? []);

  return {
    version: STATS_SPEC_VERSION,
    chart: isStatsChartType(raw.chart) ? raw.chart : fallback.chart,
    title: text(raw.title, fallback.title),
    xLabel: text(raw.xLabel, fallback.xLabel),
    yLabel: text(raw.yLabel, fallback.yLabel),
    values,
    categories,
    binWidth: positiveNumber(raw.binWidth) ?? fallback.binWidth,
    showSummary: typeof raw.showSummary === "boolean" ? raw.showSummary : fallback.showSummary,
    fiveNumberSummary: normaliseFiveNumberSummary(raw.fiveNumberSummary) ?? null,
    dataMode: raw.dataMode === "grouped" || raw.dataMode === "raw" ? raw.dataMode : (fallback.dataMode ?? "raw"),
    groups,
  };
}

/** Grouped data is only meaningful when at least one class has a frequency. */
export function statsIsGrouped(spec: StatsSpec | null | undefined): boolean {
  return Boolean(spec && spec.dataMode === "grouped" && (spec.groups ?? []).length > 0);
}

/** Does the chart carry any observations a marker should look at? */
export function statsSpecHasWork(spec: StatsSpec | null | undefined): boolean {
  if (!spec) return false;
  if (spec.chart === "bar_chart") {
    return spec.categories.some((category) => category.label.trim().length > 0 || category.value !== 0);
  }
  if (statsIsGrouped(spec)) return (spec.groups ?? []).some((group) => group.frequency > 0);
  return spec.values.length > 0;
}

/** A compact description used in plain-text exports and accessible labels. */
export function statsSpecSummary(spec: StatsSpec): string {
  if (spec.chart === "bar_chart") {
    const count = spec.categories.filter((category) => category.label.trim() || category.value).length;
    return `${count} categor${count === 1 ? "y" : "ies"}`;
  }
  if (statsIsGrouped(spec)) {
    const count = (spec.groups ?? []).length;
    return `${count} class${count === 1 ? "" : "es"} (grouped)`;
  }
  return `${spec.values.length} value${spec.values.length === 1 ? "" : "s"}`;
}

export function statsSpecIssues(spec: StatsSpec): string[] {
  const issues: string[] = [];
  if (spec.chart === "bar_chart") {
    if (!spec.categories.some((category) => category.label.trim())) issues.push("add at least one category label");
  } else if (statsIsGrouped(spec)) {
    if (!(spec.groups ?? []).some((group) => group.frequency > 0)) issues.push("enter a frequency for at least one class");
    if (groupSeriesIssues(spec.groups ?? []).length) issues.push(...groupSeriesIssues(spec.groups ?? []));
  } else if (spec.values.length === 0) {
    issues.push("add at least one data value");
  }
  if (spec.binWidth !== null && !(Number.isFinite(spec.binWidth) && spec.binWidth > 0)) {
    issues.push("the bin width must be greater than zero");
  }
  return issues;
}

/* ─── Grouped frequency series ───────────────────────────────────── */

export interface GroupRow {
  /** Class interval as written on the paper, e.g. "10 ≤ x < 20". */
  label: string;
  from: number;
  to: number;
  width: number;
  midpoint: number;
  frequency: number;
  /** frequency ÷ class width — the height of a histogram bar. */
  frequencyDensity: number;
  cumulative: number;
}

export interface GroupedSummary {
  rows: GroupRow[];
  totalFrequency: number;
  /** Σ(f × midpoint) — the numerator of the estimated mean. */
  totalFrequencyTimesMidpoint: number;
  /** Σ f x ÷ Σ f, or null when there is no data. */
  estimatedMean: number | null;
  /** True when at least two class widths differ (so density ≠ frequency). */
  unequalWidths: boolean;
  minBoundary: number;
  maxBoundary: number;
}

/** Readable class label that never lies about which boundary is included. */
export function classLabel(from: number, to: number): string {
  return `${tidy(from)} ≤ x < ${tidy(to)}`;
}

/** Structural problems a candidate could plausibly create in a grouped table. */
export function groupSeriesIssues(groups: StatsGroup[]): string[] {
  const issues: string[] = [];
  for (const group of groups) {
    if (!(group.to > group.from)) issues.push(`a class cannot end before it starts (${group.from} to ${group.to})`);
  }
  const sorted = [...groups].sort((a, b) => a.from - b.from);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].from < sorted[index - 1].to) {
      issues.push(`classes overlap between ${sorted[index - 1].from} and ${sorted[index].to}`);
      break;
    }
  }
  return [...new Set(issues)];
}

/**
 * Build the full grouped series: class width, midpoint, frequency density and
 * running total. This is the single source used by the editor preview, the
 * marker's view, the histogram and the cumulative curve, so the picture and the
 * table can never disagree.
 */
export function groupedSeries(groups: StatsGroup[]): GroupedSummary {
  const rows: GroupRow[] = [];
  let cumulative = 0;
  let total = 0;
  let weighted = 0;
  const widths = new Set<number>();
  for (const group of [...groups].sort((a, b) => a.from - b.from)) {
    const width = tidy(group.to - group.from);
    if (!(width > 0)) continue;
    const midpoint = tidy((group.from + group.to) / 2);
    cumulative += group.frequency;
    total += group.frequency;
    weighted += group.frequency * midpoint;
    widths.add(width);
    rows.push({
      label: classLabel(group.from, group.to),
      from: group.from,
      to: group.to,
      width,
      midpoint,
      frequency: group.frequency,
      frequencyDensity: tidy(group.frequency / width),
      cumulative,
    });
  }
  const boundaries = rows.map((row) => [row.from, row.to]).flat();
  return {
    rows,
    totalFrequency: total,
    totalFrequencyTimesMidpoint: tidy(weighted),
    estimatedMean: total > 0 ? tidy(weighted / total) : null,
    unequalWidths: widths.size > 1,
    minBoundary: boundaries.length ? Math.min(...boundaries) : 0,
    maxBoundary: boundaries.length ? Math.max(...boundaries) : 0,
  };
}

/** Cumulative-frequency points plotted at the upper class boundary. */
export function groupedCumulativePoints(groups: StatsGroup[], startAtZero = true): CumulativePoint[] {
  const { rows } = groupedSeries(groups);
  if (!rows.length) return [];
  const points: CumulativePoint[] = startAtZero
    ? [{ value: tidy(rows[0].from), count: 0, cumulative: 0 }]
    : [];
  for (const row of rows) points.push({ value: tidy(row.to), count: row.frequency, cumulative: row.cumulative });
  return points;
}

/* ─── Summary statistics ─────────────────────────────────────────── */

export interface StatsSummary {
  count: number;
  sum: number;
  mean: number;
  median: number;
  mode: number[];
  min: number;
  max: number;
  range: number;
  q1: number;
  q3: number;
  iqr: number;
  /** Population standard deviation (divide by n), matching school notation. */
  standardDeviation: number;
  outliers: number[];
}

export interface FiveNumberSummary {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

/** Validate a student-entered five-number summary without computing it for them. */
export function normaliseFiveNumberSummary(raw: unknown): FiveNumberSummary | null {
  if (!isRecord(raw)) return null;
  const values = [raw.min, raw.q1, raw.median, raw.q3, raw.max].map(finiteNumber);
  if (values.some((value) => value === null)) return null;
  const [min, q1, medianValue, q3, max] = values as number[];
  if (!(min <= q1 && q1 <= medianValue && medianValue <= q3 && q3 <= max)) return null;
  return { min, q1, median: medianValue, q3, max };
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quartiles(sorted: number[]): { q1: number; q3: number } {
  if (sorted.length === 0) return { q1: 0, q3: 0 };
  if (sorted.length === 1) return { q1: sorted[0], q3: sorted[0] };
  // Tukey's hinges: the median is excluded from both halves when n is odd.
  const middle = sorted.length / 2;
  const lower = sorted.slice(0, Math.floor(middle));
  const upper = sorted.slice(Math.ceil(middle));
  return { q1: median(lower), q3: median(upper) };
}

export function statsSummary(values: number[]): StatsSummary {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) {
    return {
      count: 0, sum: 0, mean: 0, median: 0, mode: [], min: 0, max: 0,
      range: 0, q1: 0, q3: 0, iqr: 0, standardDeviation: 0, outliers: [],
    };
  }
  const count = sorted.length;
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mean = sum / count;
  const min = sorted[0];
  const max = sorted[count - 1];
  const { q1, q3 } = quartiles(sorted);
  const iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;
  const frequencies = new Map<number, number>();
  for (const value of sorted) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  const highest = Math.max(...frequencies.values());
  const mode = highest > 1
    ? [...frequencies.entries()].filter(([, frequency]) => frequency === highest).map(([value]) => value).sort((a, b) => a - b)
    : [];
  const variance = sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / count;

  return {
    count,
    sum: tidy(sum),
    mean: tidy(mean),
    median: tidy(median(sorted)),
    mode,
    min,
    max,
    range: tidy(max - min),
    q1: tidy(q1),
    q3: tidy(q3),
    iqr: tidy(iqr),
    standardDeviation: tidy(Math.sqrt(variance)),
    outliers: sorted.filter((value) => value < lowFence || value > highFence),
  };
}

/* ─── Chart data ─────────────────────────────────────────────────── */

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

/**
 * Choose a readable bin width: 1, 2 or 5 × a power of ten, aiming for the
 * requested number of bins. Returned widths are exact decimal steps, so bin
 * edges print cleanly on an axis.
 */
export function niceBinWidth(range: number, targetBins = 8): number {
  if (!(range > 0) || !(targetBins > 0)) return 1;
  const raw = range / targetBins;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const step = normalised < 1.5 ? 1 : normalised < 2.25 ? 2 : normalised < 3.5 ? 2.5 : normalised < 7.5 ? 5 : 10;
  return tidy(step * magnitude);
}

export function histogramBins(values: number[], binWidth: number | null = null): HistogramBin[] {
  const data = values.filter((value) => Number.isFinite(value));
  if (data.length === 0) return [];
  const min = Math.min(...data);
  const max = Math.max(...data);
  let width = binWidth !== null && Number.isFinite(binWidth) && binWidth > 0 ? tidy(binWidth) : 0;
  if (!width) {
    width = min === max ? 1 : niceBinWidth(max - min, 8);
  }
  // Never produce more bars than the renderer can label: widen the bins.
  if (min !== max && (max - min) / width > STATS_LIMITS.histogramBins) {
    width = niceBinWidth(max - min, STATS_LIMITS.histogramBins);
  }
  const start = Math.floor(min / width) * width;
  const end = Math.floor(max / width) * width + width;
  const bars: HistogramBin[] = [];
  const count = Math.max(1, Math.round((end - start) / width));
  for (let index = 0; index < Math.min(count, STATS_LIMITS.histogramBins); index += 1) {
    bars.push({ from: tidy(start + index * width), to: tidy(start + (index + 1) * width), count: 0 });
  }
  for (const value of data) {
    const index = Math.min(bars.length - 1, Math.max(0, Math.floor((value - start) / width)));
    bars[index].count += 1;
  }
  return bars;
}

export interface DotPlotStack {
  value: number;
  count: number;
}

export function dotPlotStacks(values: number[]): DotPlotStack[] {
  const counts = new Map<number, number>();
  for (const value of values.filter((entry) => Number.isFinite(entry))) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value - b.value);
}

export interface CumulativePoint {
  value: number;
  count: number;
  cumulative: number;
}

export function cumulativeFrequencies(values: number[]): CumulativePoint[] {
  let running = 0;
  return dotPlotStacks(values).map(({ value, count }) => {
    running += count;
    return { value, count, cumulative: running };
  });
}

export interface BoxPlotSummary {
  count: number;
  min: number;
  whiskerLow: number;
  q1: number;
  median: number;
  q3: number;
  whiskerHigh: number;
  max: number;
  outliers: number[];
}

export function boxPlotSummary(values: number[]): BoxPlotSummary | null {
  const data = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (data.length === 0) return null;
  const summary = statsSummary(data);
  const lowFence = summary.q1 - 1.5 * summary.iqr;
  const highFence = summary.q3 + 1.5 * summary.iqr;
  return {
    count: data.length,
    min: data[0],
    whiskerLow: data.find((value) => value >= lowFence) ?? data[0],
    q1: summary.q1,
    median: summary.median,
    q3: summary.q3,
    whiskerHigh: [...data].reverse().find((value) => value <= highFence) ?? data[data.length - 1],
    max: data[data.length - 1],
    outliers: summary.outliers,
  };
}

/** Axis ticks from 0 to a “nice” maximum, for count axes. */
export function countAxis(maximum: number, targetTicks = 5): { max: number; step: number; ticks: number[] } {
  const safe = Math.max(1, Math.ceil(maximum));
  const step = Math.max(1, Math.ceil(niceBinWidth(safe, targetTicks)));
  const max = Math.ceil(safe / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + 1e-9; value += step) ticks.push(tidy(value));
  return { max, step, ticks };
}

/** Numeric ticks across an arbitrary interval. */
export function valueAxis(min: number, max: number, targetTicks = 6): { min: number; max: number; step: number; ticks: number[] } {
  if (!(max > min)) {
    const centre = Number.isFinite(min) ? min : 0;
    return { min: centre - 1, max: centre + 1, step: 1, ticks: [centre - 1, centre, centre + 1] };
  }
  const step = niceBinWidth(max - min, targetTicks);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step * 1e-6; value += step) ticks.push(tidy(value));
  return { min: tidy(start), max: tidy(end), step, ticks };
}
