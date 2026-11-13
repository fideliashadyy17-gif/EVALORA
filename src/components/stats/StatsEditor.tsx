"use client";

import {
  STATS_CHART_LABELS,
  STATS_CHART_TYPES,
  STATS_LIMITS,
  groupedSeries,
  groupSeriesIssues,
  normaliseStatsSpec,
  type StatsChartType,
  type StatsDataMode,
  type StatsGroup,
  type StatsSpec,
} from "@/lib/statsSpec";
import { useEffect, useId, useMemo, useState } from "react";
import { StatsView } from "./StatsView";

const control =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-evergreen-900/20 bg-white px-3 text-[13px] font-semibold text-evergreen-950 hover:bg-evergreen-50 disabled:opacity-40";
const input =
  "min-h-10 w-full rounded-lg border border-evergreen-900/15 bg-white px-2 py-1 text-sm text-evergreen-950 focus:border-evergreen-600 focus:outline-none";

function parseValues(raw: string): { values: number[]; invalid: string[] } {
  const tokens = raw.split(/[\s,;]+/).map((token) => token.trim()).filter(Boolean);
  const values: number[] = [];
  const invalid: string[] = [];
  for (const token of tokens) {
    const value = Number(token);
    if (Number.isFinite(value) && Math.abs(value) <= STATS_LIMITS.magnitude) values.push(value);
    else invalid.push(token);
    if (values.length >= STATS_LIMITS.values) break;
  }
  return { values, invalid };
}

/**
 * The student/teacher statistics workspace.
 *
 * Data is entered once and may be shown as a dot plot, bar chart, histogram,
 * box plot or cumulative-frequency chart. Every change publishes the complete
 * specification, so the answer is saved as data rather than as a picture.
 */
export function StatsEditor({
  initial,
  onChange,
  readOnly = false,
  allowChartChange = true,
  resetToken = 0,
}: {
  initial: StatsSpec;
  onChange?: (next: StatsSpec) => void;
  readOnly?: boolean;
  allowChartChange?: boolean;
  /** Change this value to reload the data text (used by “Reset workspace”). */
  resetToken?: number;
}) {
  const spec = useMemo(() => normaliseStatsSpec(initial), [initial]);
  const helpId = useId();
  const [rawValues, setRawValues] = useState(() => spec.values.join(", "));
  const [rawCategories, setRawCategories] = useState(() => spec.categories);
  const [rawGroups, setRawGroups] = useState<StatsGroup[]>(() => spec.groups ?? []);

  useEffect(() => {
    setRawValues(spec.values.join(", "));
    setRawCategories(spec.categories);
    setRawGroups(spec.groups ?? []);
    // Reload only on an explicit reset; typing must not be reformatted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  if (readOnly) return <StatsView spec={spec} showTable />;

  function publish(next: StatsSpec) {
    onChange?.(normaliseStatsSpec(next, spec));
  }

  const parsed = parseValues(rawValues);

  function changeRawValues(raw: string) {
    setRawValues(raw);
    publish({ ...spec, values: parseValues(raw).values });
  }

  function setChart(chart: StatsChartType) {
    publish({ ...spec, chart });
  }

  const mode: StatsDataMode = spec.dataMode === "grouped" ? "grouped" : "raw";

  function setMode(next: StatsDataMode) {
    publish({ ...spec, dataMode: next });
  }

  function setGroup(index: number, patch: Partial<StatsGroup>) {
    const next = rawGroups.map((group, position) => (position === index ? { ...group, ...patch } : group));
    setRawGroups(next);
    publish({ ...spec, dataMode: "grouped", groups: next });
  }

  function addGroup() {
    const last = rawGroups[rawGroups.length - 1];
    const width = last ? Math.max(1, last.to - last.from) : 10;
    const from = last ? last.to : 0;
    const next = [...rawGroups, { id: `grp-${Date.now().toString(36)}`, from, to: from + width, frequency: 0 }];
    setRawGroups(next);
    publish({ ...spec, dataMode: "grouped", groups: next });
  }

  function removeGroup(index: number) {
    const next = rawGroups.filter((_, position) => position !== index);
    setRawGroups(next);
    publish({ ...spec, dataMode: "grouped", groups: next });
  }

  function setCategory(index: number, patch: Partial<{ label: string; value: number }>) {
    const next = spec.categories.map((category, position) => (position === index ? { ...category, ...patch } : category));
    setRawCategories(next);
    publish({ ...spec, categories: next });
  }

  function addCategory() {
    const next = [...spec.categories, { id: `cat-${Date.now().toString(36)}`, label: "", value: 0 }];
    setRawCategories(next);
    publish({ ...spec, categories: next });
  }

  function removeCategory(index: number) {
    const next = spec.categories.filter((_, position) => position !== index);
    setRawCategories(next);
    publish({ ...spec, categories: next });
  }

  return (
    <div className="stats-editor">
      <div className="stats-editor-head">
        <label className="min-w-[11rem] flex-1">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Chart type</span>
          <select
            className={input}
            value={spec.chart}
            disabled={!allowChartChange}
            onChange={(event) => setChart(event.target.value as StatsChartType)}
          >
            {STATS_CHART_TYPES.map((chart) => (
              <option key={chart} value={chart}>{STATS_CHART_LABELS[chart]}</option>
            ))}
          </select>
        </label>
        <label className="min-w-[11rem] flex-1">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Chart title</span>
          <input
            className={input}
            value={spec.title}
            placeholder="Optional title"
            onChange={(event) => publish({ ...spec, title: event.target.value })}
          />
        </label>
      </div>

      <div className="stats-editor-head">
        <label className="min-w-[13rem] flex-1">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">How is the data given?</span>
          <select
            className={input}
            value={mode}
            onChange={(event) => setMode(event.target.value === "grouped" ? "grouped" : "raw")}
          >
            <option value="raw">List of values</option>
            <option value="grouped">Grouped frequency table</option>
          </select>
        </label>
      </div>

      {spec.chart === "bar_chart" ? (
        <div className="stats-editor-block">
          <p className="stats-editor-label">Categories and counts</p>
          <div className="space-y-2">
            {rawCategories.map((category, index) => (
              <div key={category.id} className="flex items-center gap-2">
                <input
                  className={input}
                  value={category.label}
                  placeholder={`Category ${index + 1}`}
                  aria-label={`Category ${index + 1} label`}
                  onChange={(event) => setCategory(index, { label: event.target.value })}
                />
                <input
                  className={`${input} max-w-24`}
                  type="number"
                  min={0}
                  step="any"
                  value={Number.isFinite(category.value) ? category.value : 0}
                  aria-label={`Category ${index + 1} value`}
                  onChange={(event) => setCategory(index, { value: Math.max(0, Number(event.target.value) || 0) })}
                />
                <button type="button" className="text-sm text-red-700" onClick={() => removeCategory(index)} aria-label={`Remove category ${index + 1}`}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" className={`${control} mt-2`} onClick={addCategory}>+ Add category</button>
        </div>
      ) : (
        <div className={`stats-editor-block ${mode === "grouped" ? "hidden" : ""}`}>
          <label className="block">
            <span className="stats-editor-label">Data values</span>
            <textarea
              className="min-h-24 w-full rounded-lg border border-evergreen-900/15 bg-white p-2 font-mono text-sm text-evergreen-950 focus:border-evergreen-600 focus:outline-none"
              value={rawValues}
              spellCheck={false}
              aria-label="Data values"
              aria-describedby={helpId}
              placeholder="4, 7, 7, 8, 10, 12…"
              onChange={(event) => changeRawValues(event.target.value)}
            />
          </label>
          <p id={helpId} className="mt-1 text-[11px] text-ink-soft">
            Separate values with commas, spaces or new lines. {parsed.values.length} value{parsed.values.length === 1 ? "" : "s"}
            {parsed.invalid.length ? ` · ignored: ${parsed.invalid.slice(0, 4).join(", ")}` : ""}.
          </p>
          {spec.chart === "histogram" && (
            <label className="mt-2 flex min-h-10 items-center gap-2 text-xs text-evergreen-900">
              Bin width
              <input
                className={`${input} max-w-28`}
                type="number"
                min={0}
                step="any"
                value={spec.binWidth ?? ""}
                placeholder="automatic"
                aria-label="Histogram bin width"
                onChange={(event) => {
                  const value = Number(event.target.value);
                  publish({ ...spec, binWidth: Number.isFinite(value) && value > 0 ? value : null });
                }}
              />
            </label>
          )}
        </div>
      )}

      <div className="stats-editor-head">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Horizontal axis label</span>
          <input
            className={input}
            value={spec.xLabel}
            placeholder={spec.chart === "bar_chart" ? "Category" : "Value"}
            onChange={(event) => publish({ ...spec, xLabel: event.target.value })}
          />
        </label>
        {spec.chart !== "bar_chart" && spec.chart !== "box_plot" && (
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Vertical axis label</span>
            <input
              className={input}
              value={spec.yLabel}
              placeholder="Frequency"
              onChange={(event) => publish({ ...spec, yLabel: event.target.value })}
            />
          </label>
        )}
      </div>

      {mode === "grouped" && spec.chart !== "bar_chart" ? (
        <div className="stats-editor-block">
          <p className="stats-editor-label">Class intervals and frequencies</p>
          <div className="space-y-2">
            {rawGroups.map((group, index) => (
              <div key={group.id} className="flex flex-wrap items-end gap-2">
                <label className="w-20">
                  <span className="text-[10px] uppercase tracking-wide text-ink-soft">from</span>
                  <input
                    className={input}
                    type="number"
                    step="any"
                    value={Number.isFinite(group.from) ? group.from : 0}
                    aria-label={`Class ${index + 1} lower boundary`}
                    onChange={(event) => setGroup(index, { from: Number(event.target.value) })}
                  />
                </label>
                <span className="pb-2 text-sm text-ink-soft">≤ x &lt;</span>
                <label className="w-20">
                  <span className="text-[10px] uppercase tracking-wide text-ink-soft">to</span>
                  <input
                    className={input}
                    type="number"
                    step="any"
                    value={Number.isFinite(group.to) ? group.to : 0}
                    aria-label={`Class ${index + 1} upper boundary`}
                    onChange={(event) => setGroup(index, { to: Number(event.target.value) })}
                  />
                </label>
                <label className="w-20">
                  <span className="text-[10px] uppercase tracking-wide text-ink-soft">f</span>
                  <input
                    className={input}
                    type="number"
                    min={0}
                    step="any"
                    value={Number.isFinite(group.frequency) ? group.frequency : 0}
                    aria-label={`Class ${index + 1} frequency`}
                    onChange={(event) => setGroup(index, { frequency: Math.max(0, Number(event.target.value) || 0) })}
                  />
                </label>
                <button type="button" className="pb-2 text-sm text-red-700" onClick={() => removeGroup(index)} aria-label={`Remove class ${index + 1}`}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" className={`${control} mt-2`} onClick={addGroup}>+ Add class</button>
          {(() => {
            const issues = groupSeriesIssues(rawGroups);
            const series = groupedSeries(rawGroups);
            return (
              <>
                {issues.length ? (
                  <ul className="mt-2 list-disc pl-5 text-[11px] text-red-700">
                    {issues.map((issue) => <li key={issue}>{issue}</li>)}
                  </ul>
                ) : null}
                {series.rows.length ? (
                  <p className="mt-2 text-[11px] text-ink-soft">
                    Σf = {series.totalFrequency}
                    {series.estimatedMean !== null ? ` · estimated mean = ${series.estimatedMean}` : ""}
                    {series.unequalWidths ? " · class widths differ, so the histogram plots frequency density" : ""}
                  </p>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}

      <details className="stats-editor-preview" open>
        <summary className="cursor-pointer text-xs font-semibold text-evergreen-800">Chart preview</summary>
        <div className="mt-2">
          <StatsView spec={{ ...spec, title: spec.title }} showTable />
        </div>
      </details>
    </div>
  );
}
