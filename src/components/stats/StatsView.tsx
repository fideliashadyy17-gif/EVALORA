import type { ReactNode } from "react";
import {
  STATS_CHART_LABELS,
  boxPlotSummary,
  countAxis,
  cumulativeFrequencies,
  dotPlotStacks,
  groupedCumulativePoints,
  groupedSeries,
  histogramBins,
  normaliseFiveNumberSummary,
  normaliseStatsSpec,
  statsIsGrouped,
  statsSpecSummary,
  statsSummary,
  valueAxis,
  type StatsSpec,
} from "@/lib/statsSpec";

const WIDTH = 640;
const HEIGHT = 380;
const LEFT = 54;
const RIGHT = 18;
const TOP = 26;
const BOTTOM = 58;
const PLOT_LEFT = LEFT;
const PLOT_RIGHT = WIDTH - RIGHT;
const PLOT_TOP = TOP;
const PLOT_BOTTOM = HEIGHT - BOTTOM;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 1e6) / 1e6;
  if (Math.abs(rounded) >= 10_000) return rounded.toExponential(2).replace("e+", "e");
  return String(rounded);
}

function formatTick(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Number.isInteger(rounded) ? String(rounded) : String(Number(rounded.toFixed(3)));
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, Math.max(1, max - 1))}…` : clean;
}

function xScale(min: number, max: number): (value: number) => number {
  const span = max - min || 1;
  return (value: number) => PLOT_LEFT + ((value - min) / span) * PLOT_WIDTH;
}

function yScale(max: number): (value: number) => number {
  const safe = max || 1;
  return (value: number) => PLOT_BOTTOM - (value / safe) * PLOT_HEIGHT;
}

function AxisTitle({ children, x, y, rotate = false }: { children: string; x: number; y: number; rotate?: boolean }) {
  if (!children) return null;
  return (
    <text
      x={x}
      y={y}
      fontSize={12}
      fill="#4b5a52"
      textAnchor="middle"
      transform={rotate ? `rotate(-90 ${x} ${y})` : undefined}
    >
      {children}
    </text>
  );
}

function GridLines({ ticks, y }: { ticks: number[]; y: (value: number) => number }) {
  return (
    <g aria-hidden>
      {ticks.map((tick) => (
        <line key={`grid-${tick}`} x1={PLOT_LEFT} y1={y(tick)} x2={PLOT_RIGHT} y2={y(tick)} stroke="#e8eeeb" strokeWidth={1} />
      ))}
    </g>
  );
}

function CountAxis({ maximum, label }: { maximum: number; label: string }) {
  const axis = countAxis(maximum);
  const y = yScale(axis.max);
  return (
    <g aria-hidden>
      <GridLines ticks={axis.ticks} y={y} />
      <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_LEFT} y2={PLOT_BOTTOM} stroke="#16241c" strokeWidth={1.4} />
      {axis.ticks.map((tick) => (
        <g key={`y-${tick}`}>
          <line x1={PLOT_LEFT - 4} y1={y(tick)} x2={PLOT_LEFT} y2={y(tick)} stroke="#16241c" strokeWidth={1} />
          <text x={PLOT_LEFT - 8} y={y(tick) + 4} fontSize={11} textAnchor="end" fill="#4b5a52">{formatTick(tick)}</text>
        </g>
      ))}
      <AxisTitle x={16} y={(PLOT_TOP + PLOT_BOTTOM) / 2} rotate>{label}</AxisTitle>
    </g>
  );
}

function NumericAxis({
  min, max, label, ticks: fixedTicks,
}: {
  min: number;
  max: number;
  label: string;
  ticks?: number[];
}) {
  const x = xScale(min, max);
  const ticks = (fixedTicks ?? valueAxis(min, max).ticks)
    .filter((tick) => tick >= min - 1e-9 && tick <= max + 1e-9);
  return (
    <g aria-hidden>
      <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke="#16241c" strokeWidth={1.4} />
      {ticks.map((tick) => (
        <g key={`x-${tick}`}>
          <line x1={x(tick)} y1={PLOT_BOTTOM} x2={x(tick)} y2={PLOT_BOTTOM + 4} stroke="#16241c" strokeWidth={1} />
          <text x={x(tick)} y={PLOT_BOTTOM + 17} fontSize={11} textAnchor="middle" fill="#4b5a52">{formatTick(tick)}</text>
        </g>
      ))}
      <AxisTitle x={(PLOT_LEFT + PLOT_RIGHT) / 2} y={HEIGHT - 12}>{label}</AxisTitle>
    </g>
  );
}

/**
 * Read-only statistics renderer. Server-component safe: no hooks, no browser
 * APIs, no chart dependency. Every representation is drawn from the stored
 * values, so editing the data always changes the picture and the picture a
 * marker sees is the one the candidate saw.
 */
export function StatsView({
  spec,
  className,
  ariaLabel,
  compact = false,
  showSummary,
  showTable = false,
}: {
  spec: StatsSpec;
  className?: string;
  ariaLabel?: string;
  compact?: boolean;
  /** Override the specification's summary switch (used by the marking view). */
  showSummary?: boolean;
  showTable?: boolean;
}) {
  const clean = normaliseStatsSpec(spec);
  const label = ariaLabel ?? (clean.title || STATS_CHART_LABELS[clean.chart]);
  const description = `${STATS_CHART_LABELS[clean.chart]}: ${statsSpecSummary(clean)}`;
  const summary = showSummary ?? clean.showSummary;

  const grouped = statsIsGrouped(clean);
  let chart: ReactNode;
  if (clean.chart === "bar_chart") chart = <BarChart spec={clean} />;
  else if (clean.chart === "histogram") chart = grouped ? <GroupedHistogramChart spec={clean} /> : <HistogramChart spec={clean} />;
  else if (clean.chart === "box_plot") chart = <BoxPlotChart spec={clean} />;
  else if (clean.chart === "cumulative_frequency") chart = grouped ? <GroupedCumulativeChart spec={clean} /> : <CumulativeChart spec={clean} />;
  else if (clean.chart === "frequency_polygon") chart = grouped ? <GroupedPolygonChart spec={clean} /> : <PolygonChart spec={clean} />;
  else chart = <DotPlotChart spec={clean} />;

  const empty = clean.chart === "bar_chart"
    ? clean.categories.filter((category) => category.label.trim() || category.value).length === 0
    : grouped
      ? !(clean.groups ?? []).some((group) => group.frequency > 0) || (clean.groups ?? []).length === 0
      : clean.values.length === 0;
  const computed = clean.chart === "bar_chart" ? null : statsSummary(clean.values);

  return (
    <figure className={`stats-figure ${className ?? ""}`}>
      {clean.title ? <figcaption className="stats-title">{clean.title}</figcaption> : null}
      <div className="stats-scroll">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={label}
          className="stats-svg"
        >
          <title>{label}</title>
          <desc>{description}</desc>
          <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="#ffffff" />
          {empty ? (
            <text x={WIDTH / 2} y={HEIGHT / 2} textAnchor="middle" fontSize={14} fill="#6b7a72">
              {clean.chart === "bar_chart" ? "Add a category to see the chart." : "Add data values to see the chart."}
            </text>
          ) : chart}
        </svg>
      </div>

      {summary && grouped && (() => {
        const series = groupedSeries(clean.groups ?? []);
        if (!series.rows.length) return null;
        return (
          <ul className="stats-summary" aria-label="Grouped data summary">
            <li><span>Classes</span> <strong>{series.rows.length}</strong></li>
            <li><span>Σf</span> <strong>{formatNumber(series.totalFrequency)}</strong></li>
            {series.estimatedMean !== null ? (
              <li><span>Estimated mean</span> <strong>{formatNumber(series.estimatedMean)}</strong></li>
            ) : null}
          </ul>
        );
      })()}

      {summary && !grouped && computed && computed.count > 0 && (
        <ul className="stats-summary" aria-label="Summary statistics">
          {[
            ["Mean", computed.mean],
            ["Median", computed.median],
            ["Range", computed.range],
            ["IQR", computed.iqr],
          ].map(([name, value]) => (
            <li key={String(name)}>
              <span>{name}</span> <strong>{formatNumber(Number(value))}</strong>
            </li>
          ))}
          <li><span>n</span> <strong>{computed.count}</strong></li>
        </ul>
      )}

      {!compact && showTable && clean.chart !== "box_plot" && (
        <details className="stats-data-details">
          <summary>View the data</summary>
          {grouped ? (
            <table>
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Midpoint</th>
                  <th scope="col">f</th>
                  <th scope="col">f &times; midpoint</th>
                  <th scope="col">Cumulative f</th>
                </tr>
              </thead>
              <tbody>
                {groupedSeries(clean.groups ?? []).rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>{formatNumber(row.midpoint)}</td>
                    <td>{formatNumber(row.frequency)}</td>
                    <td>{formatNumber(row.frequency * row.midpoint)}</td>
                    <td>{formatNumber(row.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : clean.chart === "bar_chart" ? (
            <table>
              <thead><tr><th scope="col">Category</th><th scope="col">Value</th></tr></thead>
              <tbody>
                {clean.categories.map((category) => (
                  <tr key={category.id}><th scope="row">{category.label || "—"}</th><td>{formatNumber(category.value)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead><tr><th scope="col">Value</th><th scope="col">Frequency</th></tr></thead>
              <tbody>
                {dotPlotStacks(clean.values).map((stack) => (
                  <tr key={stack.value}><th scope="row">{formatNumber(stack.value)}</th><td>{stack.count}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </details>
      )}
    </figure>
  );
}

function BarChart({ spec }: { spec: StatsSpec }) {
  const categories = spec.categories.filter((category) => category.label.trim() || category.value);
  const maxValue = Math.max(1, ...categories.map((category) => Math.max(0, category.value)));
  const axis = countAxis(maxValue);
  const y = yScale(axis.max);
  const band = PLOT_WIDTH / Math.max(1, categories.length);
  const barWidth = Math.min(64, band * 0.62);
  const rotate = categories.length > 6 || categories.some((category) => category.label.length > 11);

  return (
    <g>
      <CountAxis maximum={maxValue} label={spec.yLabel} />
      <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke="#16241c" strokeWidth={1.4} />
      {categories.map((category, index) => {
        const centre = PLOT_LEFT + band * index + band / 2;
        const top = y(Math.max(0, category.value));
        const height = PLOT_BOTTOM - top;
        return (
          <g key={category.id}>
            <rect
              x={centre - barWidth / 2}
              y={top}
              width={barWidth}
              height={Math.max(0, height)}
              rx={3}
              fill="#0a5c36"
            >
              <title>{`${category.label || "Unlabelled"}: ${formatNumber(category.value)}`}</title>
            </rect>
            <text
              x={centre}
              y={PLOT_BOTTOM + 16}
              fontSize={11}
              textAnchor={rotate ? "end" : "middle"}
              fill="#4b5a52"
              transform={rotate ? `rotate(-32 ${centre} ${PLOT_BOTTOM + 16})` : undefined}
            >
              {truncate(category.label, 14)}
            </text>
          </g>
        );
      })}
      <AxisTitle x={(PLOT_LEFT + PLOT_RIGHT) / 2} y={HEIGHT - 8}>{spec.xLabel}</AxisTitle>
    </g>
  );
}

function DotPlotChart({ spec }: { spec: StatsSpec }) {
  const stacks = dotPlotStacks(spec.values);
  const values = stacks.map((stack) => stack.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const maxCount = Math.max(1, ...stacks.map((stack) => stack.count));
  const axis = countAxis(maxCount);
  const x = xScale(min, max);
  const unit = PLOT_HEIGHT / (axis.max + 0.5);
  const radius = Math.max(4, Math.min(8, unit * 0.28));

  return (
    <g>
      <CountAxis maximum={maxCount} label={spec.yLabel} />
      <NumericAxis min={min} max={max} label={spec.xLabel} />
      {stacks.map((stack) => (
        <g key={stack.value}>
          {Array.from({ length: stack.count }, (_, level) => (
            <circle
              key={`${stack.value}-${level}`}
              cx={x(stack.value)}
              cy={PLOT_BOTTOM - (level + 0.5) * unit}
              r={radius}
              fill="#0a5c36"
              stroke="#ffffff"
              strokeWidth={1}
            />
          ))}
          <title>{`${formatNumber(stack.value)} occurs ${stack.count} time${stack.count === 1 ? "" : "s"}`}</title>
        </g>
      ))}
    </g>
  );
}

function HistogramChart({ spec }: { spec: StatsSpec }) {
  const bins = histogramBins(spec.values, spec.binWidth);
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));
  const min = bins[0].from;
  const max = bins[bins.length - 1].to;
  const x = xScale(min, max);
  const y = yScale(countAxis(maxCount).max);
  const edgeTicks = bins.map((bin) => bin.from).concat(max);
  const stride = Math.max(1, Math.ceil(edgeTicks.length / 9));

  return (
    <g>
      <CountAxis maximum={maxCount} label={spec.yLabel} />
      <NumericAxis
        min={min}
        max={max}
        label={spec.xLabel}
        ticks={edgeTicks.filter((_, index) => index % stride === 0 || index === edgeTicks.length - 1)}
      />
      {bins.map((bin) => {
        const left = x(bin.from);
        const right = x(bin.to);
        const top = y(bin.count);
        return (
          <g key={`${bin.from}-${bin.to}`}>
            <rect
              x={left + 1}
              y={top}
              width={Math.max(1, right - left - 2)}
              height={Math.max(0, PLOT_BOTTOM - top)}
              fill="#0a5c36"
              stroke="#ffffff"
              strokeWidth={1}
            >
              <title>{`${formatTick(bin.from)} ≤ x < ${formatTick(bin.to)}: ${bin.count}`}</title>
            </rect>
            {bin.count > 0 && (
              <text x={(left + right) / 2} y={top - 5} fontSize={11} textAnchor="middle" fill="#0a5c36" fontWeight={600}>
                {bin.count}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function CumulativeChart({ spec }: { spec: StatsSpec }) {
  const points = cumulativeFrequencies(spec.values);
  let min = points[0].value;
  let max = points[points.length - 1].value;
  if (min === max) { min -= 1; max += 1; }
  const total = points[points.length - 1].cumulative;
  const axis = countAxis(total);
  const x = xScale(min, max);
  const y = yScale(axis.max);

  let path = `M ${x(min)} ${y(0)}`;
  for (const point of points) {
    path += ` H ${x(point.value)} V ${y(point.cumulative)}`;
  }

  return (
    <g>
      <CountAxis maximum={total} label={spec.yLabel} />
      <NumericAxis
        min={min}
        max={max}
        label={spec.xLabel}
        ticks={points
          .map((point) => point.value)
          .filter((_, index) => index % Math.max(1, Math.ceil(points.length / 9)) === 0 ||
            index === points.length - 1)}
      />
      <path d={path} fill="none" stroke="#0a5c36" strokeWidth={2.2} strokeLinejoin="round" />
      {points.map((point) => (
        <g key={point.value}>
          <circle cx={x(point.value)} cy={y(point.cumulative)} r={4} fill="#0a5c36" stroke="#ffffff" strokeWidth={1.5}>
            <title>{`≤ ${formatNumber(point.value)}: ${point.cumulative}`}</title>
          </circle>
        </g>
      ))}
    </g>
  );
}

function BoxPlotChart({ spec }: { spec: StatsSpec }) {
  // When a question asks for construction from a five-number summary, preserve
  // and draw precisely the values entered by the candidate. Raw data retains
  // the existing derived-box-plot behaviour for exploratory questions.
  const entered = normaliseFiveNumberSummary((spec as StatsSpec & { fiveNumberSummary?: unknown }).fiveNumberSummary);
  const computed = boxPlotSummary(spec.values);
  const box = entered ? {
    count: spec.values.length,
    min: entered.min,
    whiskerLow: entered.min,
    q1: entered.q1,
    median: entered.median,
    q3: entered.q3,
    whiskerHigh: entered.max,
    max: entered.max,
    outliers: [],
  } : computed;
  if (!box) return null;
  const candidates = [box.min, box.max, ...box.outliers];
  let min = Math.min(...candidates);
  let max = Math.max(...candidates);
  if (min === max) { min -= 1; max += 1; }
  const axis = valueAxis(min, max);
  const domainMin = Math.min(axis.min, min);
  const domainMax = Math.max(axis.max, max);
  const x = xScale(domainMin, domainMax);
  const mid = PLOT_TOP + PLOT_HEIGHT * 0.52;
  const boxHeight = Math.min(76, PLOT_HEIGHT * 0.34);
  const cap = boxHeight * 0.55;

  return (
    <g>
      <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke="#16241c" strokeWidth={1.4} />
      {axis.ticks.map((tick) => (
        <g key={`tick-${tick}`}>
          <line x1={x(tick)} y1={PLOT_BOTTOM} x2={x(tick)} y2={PLOT_BOTTOM + 4} stroke="#16241c" strokeWidth={1} />
          <text x={x(tick)} y={PLOT_BOTTOM + 17} fontSize={11} textAnchor="middle" fill="#4b5a52">{formatTick(tick)}</text>
        </g>
      ))}
      <line x1={x(box.whiskerLow)} y1={mid} x2={x(box.whiskerHigh)} y2={mid} stroke="#0a5c36" strokeWidth={2} />
      <line x1={x(box.whiskerLow)} y1={mid - cap / 2} x2={x(box.whiskerLow)} y2={mid + cap / 2} stroke="#0a5c36" strokeWidth={2} />
      <line x1={x(box.whiskerHigh)} y1={mid - cap / 2} x2={x(box.whiskerHigh)} y2={mid + cap / 2} stroke="#0a5c36" strokeWidth={2} />
      <rect
        x={x(box.q1)}
        y={mid - boxHeight / 2}
        width={Math.max(1, x(box.q3) - x(box.q1))}
        height={boxHeight}
        fill="#dcefe5"
        stroke="#0a5c36"
        strokeWidth={2}
        rx={2}
      />
      <line x1={x(box.median)} y1={mid - boxHeight / 2} x2={x(box.median)} y2={mid + boxHeight / 2} stroke="#b45309" strokeWidth={3} />
      {box.outliers.map((value, index) => (
        <circle key={`outlier-${value}-${index}`} cx={x(value)} cy={mid} r={4.5} fill="#ffffff" stroke="#b45309" strokeWidth={1.8}>
          <title>{`Outlier: ${formatNumber(value)}`}</title>
        </circle>
      ))}
      {[
        ["Q1", box.q1],
        ["median", box.median],
        ["Q3", box.q3],
      ].map(([name, value]) => (
        <text
          key={String(name)}
          x={x(Number(value))}
          y={mid + boxHeight / 2 + 15}
          fontSize={10}
          textAnchor="middle"
          fill="#4b5a52"
        >
          {name}
        </text>
      ))}
      <text x={x(box.whiskerLow)} y={mid - cap / 2 - 6} fontSize={10} textAnchor="middle" fill="#4b5a52">{formatNumber(box.whiskerLow)}</text>
      <text x={x(box.whiskerHigh)} y={mid - cap / 2 - 6} fontSize={10} textAnchor="middle" fill="#4b5a52">{formatNumber(box.whiskerHigh)}</text>
      <AxisTitle x={(PLOT_LEFT + PLOT_RIGHT) / 2} y={HEIGHT - 12}>{spec.xLabel}</AxisTitle>
    </g>
  );
}

/* ─── Grouped-series charts ─────────────────────────────────────────
 *
 * A histogram of a grouped table must have area proportional to frequency, so
 * the bar height is the frequency *density* (frequency ÷ class width). With
 * equal widths that is a constant multiple of the frequency and the picture is
 * the familiar one; with unequal widths it is the only honest picture, and the
 * y-axis says so. The candidate's table is the source: the chart never invents
 * a bar the table does not support.
 */

function GroupedHistogramChart({ spec }: { spec: StatsSpec }) {
  const series = groupedSeries(spec.groups ?? []);
  if (!series.rows.length) return null;
  const density = series.unequalWidths;
  const heights = series.rows.map((row) => (density ? row.frequencyDensity : row.frequency));
  const maxHeight = Math.max(1, ...heights.filter((value) => Number.isFinite(value)));
  const axis = countAxis(maxHeight, 6);
  const x = xScale(series.minBoundary, series.maxBoundary);
  const y = yScale(axis.max);
  const edges = series.rows.map((row) => row.from).concat(series.maxBoundary);
  const stride = Math.max(1, Math.ceil(edges.length / 10));
  const axisLabel = density ? "Frequency density" : (spec.yLabel || "Frequency");

  return (
    <g>
      <CountAxis maximum={maxHeight} label={axisLabel} />
      <NumericAxis
        min={series.minBoundary}
        max={series.maxBoundary}
        label={spec.xLabel}
        ticks={edges.filter((_, index) => index % stride === 0 || index === edges.length - 1)}
      />
      {series.rows.map((row) => {
        const left = x(row.from);
        const right = x(row.to);
        const height = density ? row.frequencyDensity : row.frequency;
        const top = y(height);
        return (
          <g key={`${row.from}-${row.to}`}>
            <rect
              x={left + 1}
              y={top}
              width={Math.max(1, right - left - 2)}
              height={Math.max(0, PLOT_BOTTOM - top)}
              fill="#0a5c36"
              stroke="#ffffff"
              strokeWidth={1}
            >
              <title>{`${row.label}: f = ${formatNumber(row.frequency)}${density ? `, density = ${formatNumber(row.frequencyDensity)}` : ""}`}</title>
            </rect>
            {row.frequency > 0 && (
              <text x={(left + right) / 2} y={top - 5} fontSize={11} textAnchor="middle" fill="#0a5c36" fontWeight={600}>
                {formatNumber(row.frequency)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function GroupedCumulativeChart({ spec }: { spec: StatsSpec }) {
  const points = groupedCumulativePoints(spec.groups ?? []);
  if (points.length < 2) return null;
  const series = groupedSeries(spec.groups ?? []);
  const min = series.minBoundary;
  const max = series.maxBoundary;
  const total = points[points.length - 1].cumulative;
  const axis = countAxis(total, 6);
  const x = xScale(min, max);
  const y = yScale(axis.max);

  // A cumulative frequency curve is a smooth polygon through the plotted
  // points (upper class boundaries), not a staircase: that is what a student
  // is taught to read a median from.
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.value)} ${y(point.cumulative)}`)
    .join(" ");
  const edgeTicks = points.map((point) => point.value);

  return (
    <g>
      <CountAxis maximum={total} label={spec.yLabel || "Cumulative frequency"} />
      <NumericAxis min={min} max={max} label={spec.xLabel} ticks={edgeTicks} />
      <path d={path} fill="none" stroke="#0a5c36" strokeWidth={2.4} strokeLinejoin="round" />
      {points.map((point) => (
        <circle key={point.value} cx={x(point.value)} cy={y(point.cumulative)} r={4} fill="#0a5c36" stroke="#ffffff" strokeWidth={1.5}>
          <title>{`x ≤ ${formatNumber(point.value)}: ${point.cumulative}`}</title>
        </circle>
      ))}
      <text x={PLOT_LEFT + 6} y={PLOT_TOP + 12} fontSize={11} fill="#4b5a52">
        n = {formatNumber(total)}
      </text>
    </g>
  );
}

/** Frequency polygon through the class midpoints (grouped data). */
function GroupedPolygonChart({ spec }: { spec: StatsSpec }) {
  const series = groupedSeries(spec.groups ?? []);
  if (!series.rows.length) return null;
  const maxCount = Math.max(1, ...series.rows.map((row) => row.frequency));
  const axis = countAxis(maxCount, 6);
  const x = xScale(series.minBoundary, series.maxBoundary);
  const y = yScale(axis.max);
  const points = series.rows.map((row) => ({ x: x(row.midpoint), y: y(row.frequency), row }));

  return (
    <g>
      <CountAxis maximum={maxCount} label={spec.yLabel || "Frequency"} />
      <NumericAxis
        min={series.minBoundary}
        max={series.maxBoundary}
        label={spec.xLabel}
        ticks={series.rows.map((row) => row.midpoint)}
      />
      <path
        d={points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")}
        fill="none"
        stroke="#0a5c36"
        strokeWidth={2.2}
      />
      {points.map((point) => (
        <g key={point.row.label}>
          <circle cx={point.x} cy={point.y} r={4.5} fill="#0a5c36" stroke="#ffffff" strokeWidth={1.5}>
            <title>{`${point.row.label} (midpoint ${formatNumber(point.row.midpoint)}): ${formatNumber(point.row.frequency)}`}</title>
          </circle>
          <text x={point.x} y={point.y - 9} fontSize={10} textAnchor="middle" fill="#0a5c36" fontWeight={600}>
            {formatNumber(point.row.frequency)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Frequency polygon over raw observations (one point per distinct value). */
function PolygonChart({ spec }: { spec: StatsSpec }) {
  const stacks = dotPlotStacks(spec.values);
  if (!stacks.length) return null;
  let min = Math.min(...stacks.map((stack) => stack.value));
  let max = Math.max(...stacks.map((stack) => stack.value));
  if (min === max) { min -= 1; max += 1; }
  const maxCount = Math.max(1, ...stacks.map((stack) => stack.count));
  const axis = countAxis(maxCount, 6);
  const x = xScale(min, max);
  const y = yScale(axis.max);
  const path = stacks.map((stack, index) => `${index === 0 ? "M" : "L"} ${x(stack.value)} ${y(stack.count)}`).join(" ");

  return (
    <g>
      <CountAxis maximum={maxCount} label={spec.yLabel || "Frequency"} />
      <NumericAxis min={min} max={max} label={spec.xLabel} />
      <path d={path} fill="none" stroke="#0a5c36" strokeWidth={2.2} />
      {stacks.map((stack) => (
        <circle key={stack.value} cx={x(stack.value)} cy={y(stack.count)} r={4} fill="#0a5c36" stroke="#ffffff" strokeWidth={1.5}>
          <title>{`${formatNumber(stack.value)}: ${stack.count}`}</title>
        </circle>
      ))}
    </g>
  );
}
