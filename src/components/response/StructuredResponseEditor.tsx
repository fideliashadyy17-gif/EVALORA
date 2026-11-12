"use client";

import { RichContentEditor } from "@/components/editor/RichContentEditor";
import { RichContent } from "@/components/RichContent";
import { GraphEditor } from "@/components/graph/GraphEditor";
import { GeometryEditor } from "@/components/geometry/GeometryEditor";
import { GraphView } from "@/components/graph/GraphView";
import { GeometryView } from "@/components/geometry/GeometryView";
import { StatsEditor } from "@/components/stats/StatsEditor";
import { DataTableEditor } from "@/components/stats/DataTableEditor";
import { emptyDoc, docToPlainText, textToDoc, type RichDoc } from "@/lib/content";
import { emptyGraphSpec, graphSpecHasWork, normaliseGraphSpec, type GraphSpec } from "@/lib/graphSpec";
import { emptyGeometrySpec, geometrySpecHasWork, normaliseGeometrySpec, type GeometrySpec } from "@/lib/geometrySpec";
import { emptyStatsSpec, normaliseStatsSpec, statsSpecHasWork, type StatsSpec } from "@/lib/statsSpec";
import { emptyDataTableSpec, dataTableHasWork, normaliseDataTableSpec, type DataTableSpec } from "@/lib/dataTableSpec";
import type { ResponseWorkspace } from "@/lib/responseTools";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Tab = "written" | "graph" | "geometry" | "statistics" | "data_table";

/**
 * The student composition environment for constructed responses.
 *
 * It adapts to the question: ordinary writing and mathematics are always
 * available; tables, the science palette, the graph workspace and the geometry
 * workspace appear only when the question needs them. Every change is a
 * structured document, and — in an examination — it is autosaved through the
 * existing durable exam save queue, so navigating, refreshing or losing the
 * connection does not lose the response.
 */
export function StructuredResponseEditor({
  workspace,
  initial,
  disabled = false,
  autosave = false,
  submitLabel = "Save answer",
  emit,
  onDirtyChange,
}: {
  workspace: ResponseWorkspace;
  initial: Record<string, unknown> | null;
  disabled?: boolean;
  autosave?: boolean;
  submitLabel?: string;
  emit: (payload: Record<string, unknown>) => boolean | void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const initialDoc = useMemo<RichDoc>(() => {
    const raw = initial?.doc;
    if (raw && typeof raw === "object" && (raw as RichDoc).type === "doc") return raw as RichDoc;
    // Compatibility with answers written before the structured editor existed:
    // a plain-text answer is converted (including legacy $…$ mathematics) so a
    // candidate who resumes an older attempt still sees and keeps their work.
    if (typeof initial?.text === "string" && initial.text.trim()) return textToDoc(initial.text);
    return emptyDoc();
  }, [initial]);
  const [doc, setDoc] = useState<RichDoc>(initialDoc);
  // Every pane is normally present. A payload from an older build (or a future
  // projection mistake) may omit `statistics`/`dataTable`; default them so one
  // missing key can never blank an entire examination paper.
  const statsPane = workspace.statistics ?? ({
    enabled: workspace.tools.includes("statistics"),
    title: "Your statistics chart",
    instructions: "",
    chart: "any",
    starter: emptyStatsSpec(),
  } as NonNullable<typeof workspace.statistics>);
  const tablePane = workspace.dataTable ?? ({
    enabled: workspace.tools.includes("data_table"),
    title: "Your data table",
    instructions: "",
    starter: emptyDataTableSpec(),
  } as NonNullable<typeof workspace.dataTable>);
  const [graph, setGraph] = useState<GraphSpec>(() => {
    const saved = initial?.graph;
    return saved ? normaliseGraphSpec(saved) : normaliseGraphSpec(workspace.graph.starter, emptyGraphSpec());
  });
  const [geometry, setGeometry] = useState<GeometrySpec>(() => {
    const saved = initial?.geometry;
    return saved ? normaliseGeometrySpec(saved) : normaliseGeometrySpec(workspace.geometry.starter, emptyGeometrySpec());
  });
  const [statistics, setStatistics] = useState<StatsSpec>(() => {
    const saved = initial?.statistics;
    const base = saved ? normaliseStatsSpec(saved) : normaliseStatsSpec(statsPane.starter, emptyStatsSpec());
    return statsPane.chart === "any" ? base : { ...base, chart: statsPane.chart };
  });
  const [dataTable, setDataTable] = useState<DataTableSpec>(() => {
    const saved = initial?.data_table;
    return saved ? normaliseDataTableSpec(saved) : normaliseDataTableSpec(tablePane.starter, emptyDataTableSpec());
  });
  const [statsReset, setStatsReset] = useState(0);
  const graphOn = workspace.graph.enabled;
  const geometryOn = workspace.geometry.enabled;
  const statsOn = statsPane.enabled;
  const tableOn = tablePane.enabled;
  const [tab, setTab] = useState<Tab>("written");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const lastEmitted = useRef<string>(JSON.stringify(initial ?? {}));

  // A workspace without prose (rare, teacher-configured) opens on its first tool.
  useEffect(() => {
    if (!workspace.tools.includes("rich_text")) {
      setTab(graphOn ? "graph" : geometryOn ? "geometry" : statsOn ? "statistics" : tableOn ? "data_table" : "written");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payload = useCallback((): Record<string, unknown> => {
    const graphWork = graphSpecHasWork(graph) ? graph : null;
    const geometryWork = geometrySpecHasWork(geometry) ? geometry : null;
    const statsWork = statsSpecHasWork(statistics) ? statistics : null;
    const tableWork = dataTableHasWork(dataTable) ? dataTable : null;
    return {
      version: 1,
      text: docToPlainText(doc),
      doc,
      // A tool the teacher later turns off must not silently delete work the
      // candidate already saved: existing work remains in the answer.
      ...(graphOn || graphWork ? { graph: graphWork } : {}),
      ...(geometryOn || geometryWork ? { geometry: geometryWork } : {}),
      ...(statsOn || statsWork ? { statistics: statsWork } : {}),
      ...(tableOn || tableWork ? { data_table: tableWork } : {}),
    };
  }, [doc, graph, geometry, statistics, dataTable, graphOn, geometryOn, statsOn, tableOn]);

  const markDirty = useCallback(() => {
    setDirty(true);
    onDirtyChange?.(true);
  }, [onDirtyChange]);

  const save = useCallback(() => {
    const next = payload();
    const serialized = JSON.stringify(next);
    if (serialized === lastEmitted.current) {
      setDirty(false);
      onDirtyChange?.(false);
      return;
    }
    const accepted = emit(next);
    if (accepted !== false) {
      lastEmitted.current = serialized;
      setDirty(false);
      onDirtyChange?.(false);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }
  }, [emit, payload, onDirtyChange]);

  // Autosave is enabled only inside an examination, where the save queue is
  // durable. In a live quiz the candidate submits explicitly, so no answer is
  // sent before they press the button.
  useEffect(() => {
    if (!autosave || disabled || !dirty) return;
    const timer = setTimeout(() => save(), 1400);
    return () => clearTimeout(timer);
  }, [autosave, disabled, dirty, save]);

  // Leaving the question (navigate/refresh/unmount) hands the latest response to
  // the queue synchronously; the queue persists it in the tab and retries.
  const latestPayload = useRef(payload);
  latestPayload.current = payload;
  const acceptedRef = useRef<((value: Record<string, unknown>) => boolean | void) | null>(null);
  acceptedRef.current = emit;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => () => {
    if (!autosave || !dirtyRef.current) return;
    try { acceptedRef.current?.(latestPayload.current()); } catch { /* the queue reports its own errors */ }
  }, [autosave]);

  const graphPreview = graphOn && graphSpecHasWork(graph) ? graph : null;
  const geometryPreview = geometryOn && geometrySpecHasWork(geometry) ? geometry : null;
  const statsPreview = statsOn && statsSpecHasWork(statistics) ? statistics : null;
  const tablePreview = tableOn && dataTableHasWork(dataTable) ? dataTable : null;
  const missingRequired =
    (workspace.requirement === "graph" && !graphPreview) ||
    (workspace.requirement === "geometry" && !geometryPreview) ||
    (workspace.requirement === "statistics" && !statsPreview) ||
    (workspace.requirement === "data_table" && !tablePreview) ||
    (workspace.requirement === "text" && !docToPlainText(doc).trim());

  return (
    <div className="structured-response" data-testid="structured-response">
      <div className="structured-tabs" role="tablist" aria-label="Answer tools">
        {workspace.tools.includes("rich_text") && (
          <button type="button" role="tab" aria-selected={tab === "written"} className={cn("structured-tab", tab === "written" && "is-active")} onClick={() => setTab("written")}>
            ✎ Written answer
          </button>
        )}
        {graphOn && (
          <button type="button" role="tab" aria-selected={tab === "graph"} className={cn("structured-tab", tab === "graph" && "is-active")} onClick={() => setTab("graph")}>
            📈 Graph {graphPreview ? "✓" : ""}
          </button>
        )}
        {geometryOn && (
          <button type="button" role="tab" aria-selected={tab === "geometry"} className={cn("structured-tab", tab === "geometry" && "is-active")} onClick={() => setTab("geometry")}>
            △ Geometry {geometryPreview ? "✓" : ""}
          </button>
        )}
        {statsOn && (
          <button type="button" role="tab" aria-selected={tab === "statistics"} className={cn("structured-tab", tab === "statistics" && "is-active")} onClick={() => setTab("statistics")}>
            📊 Statistics {statsPreview ? "✓" : ""}
          </button>
        )}
        {tableOn && (
          <button type="button" role="tab" aria-selected={tab === "data_table"} className={cn("structured-tab", tab === "data_table" && "is-active")} onClick={() => setTab("data_table")}>
            ▦ Data table {tablePreview ? "✓" : ""}
          </button>
        )}
        <span className="ml-auto hidden text-[11px] text-ink-soft sm:inline">
          {disabled ? "Answer locked" : dirty ? "Unsaved changes" : savedAt ? `Saved at ${savedAt}` : autosave ? "Autosave on" : "Not yet saved"}
        </span>
      </div>

      {workspace.guidance && <p className="structured-guidance">{workspace.guidance}</p>}

      {tab === "written" && workspace.tools.includes("rich_text") && (
        <div className="structured-pane">
          <p className="structured-hint">
            Write your reasoning in full. Use the mathematics tools for any expression, and the table tool for data.
          </p>
          {disabled ? (
            // A locked answer is displayed, never mounted as an editor: after
            // the deadline the candidate must not be able to change text.
            <div className="rounded-lg border border-evergreen-900/10 bg-white p-3">
              <RichContent doc={doc} />
            </div>
          ) : (
            <RichContentEditor
              value={doc}
              onChange={(next) => { setDoc(next); markDirty(); }}
              ariaLabel="Your written answer"
              allowDiagrams={false}
              allowImages={false}
              allowLinks={false}
              placeholder="Write your answer…"
            />
          )}
          {workspace.tools.includes("science") && (
            <p className="structured-hint">Need a unit or a chemical symbol? Open the <strong>Science</strong> group in the mathematics keyboard.</p>
          )}
        </div>
      )}

      {tab === "graph" && graphOn && (
        <div className="structured-pane">
          {(workspace.graph.instructions || workspace.graph.title) && (
            <p className="structured-hint">
              {workspace.graph.instructions || "Draw or plot your graph on the axes below. You can add points, functions, segments and labels."}
            </p>
          )}
          <GraphEditor
            initial={graph}
            onChange={(next) => { setGraph(next); markDirty(); }}
            readOnly={disabled}
            allowFunctions={workspace.graph.allowFunctions}
            title={workspace.graph.title || "Your graph"}
          />
          {!disabled && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => { setGraph(normaliseGraphSpec(workspace.graph.starter, emptyGraphSpec())); markDirty(); }}>
                Reset graph axes
              </Button>
              <span className="text-xs text-ink-soft">Your graph is stored as editable data, so your teacher can inspect every point and curve.</span>
            </div>
          )}
          {graphPreview && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-evergreen-800">Preview of the graph you will submit</summary>
              <div className="mt-2"><GraphView spec={graphPreview} /></div>
            </details>
          )}
        </div>
      )}

      {tab === "geometry" && geometryOn && (
        <div className="structured-pane">
          <p className="structured-hint">
            {workspace.geometry.instructions || "Construct your figure. Drag the free points; midpoints, measurements and intersections update automatically."}
          </p>
          <GeometryEditor
            initial={geometry}
            onChange={(next) => { setGeometry(next); markDirty(); }}
            readOnly={disabled}
            title={workspace.geometry.title || "Your construction"}
          />
          {geometryPreview && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-evergreen-800">Preview of the construction you will submit</summary>
              <div className="mt-2"><GeometryView spec={geometryPreview} /></div>
            </details>
          )}
        </div>
      )}

      {tab === "statistics" && statsOn && (
        <div className="structured-pane">
          <p className="structured-hint">
            {statsPane.instructions || "Enter your data and choose the representation the question asks for."}
          </p>
          <StatsEditor
            initial={statistics}
            onChange={(next) => { setStatistics(next); markDirty(); }}
            readOnly={disabled}
            allowChartChange={statsPane.chart === "any"}
            resetToken={statsReset}
          />
          {!disabled && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const starter = normaliseStatsSpec(statsPane.starter, emptyStatsSpec());
                  setStatistics(statsPane.chart === "any" ? starter : { ...starter, chart: statsPane.chart });
                  setStatsReset((value) => value + 1);
                  markDirty();
                }}
              >
                Reset statistics workspace
              </Button>
              <span className="text-xs text-ink-soft">Your chart is stored as data, so your teacher can reopen the values.</span>
            </div>
          )}
        </div>
      )}

      {tab === "data_table" && tableOn && (
        <div className="structured-pane">
          <p className="structured-hint">
            {tablePane.instructions || "Complete the table. Each value keeps its row and column when your teacher marks it."}
          </p>
          <DataTableEditor
            spec={dataTable}
            onChange={(next) => { setDataTable(next); markDirty(); }}
            readOnly={disabled}
            allowStructure={!disabled}
            title={tablePane.title || "Data table"}
          />
          {!disabled && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDataTable(normaliseDataTableSpec(tablePane.starter, emptyDataTableSpec()));
                  markDirty();
                }}
              >
                Reset table
              </Button>
            </div>
          )}
        </div>
      )}

      {missingRequired && (
        <p role="status" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This question asks for {requirementLabel(workspace.requirement)}. Add it before saving your final answer.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={disabled || !dirty} onClick={() => save()} variant="gold">
          {disabled ? "Answer locked" : dirty ? submitLabel : "Answer saved"}
        </Button>
        {autosave && !disabled && (
          <span className="text-xs text-ink-soft">{dirty ? "Saving automatically…" : "Your work is saved with this attempt automatically."}</span>
        )}
      </div>
    </div>
  );
}

function requirementLabel(requirement: ResponseWorkspace["requirement"]): string {
  switch (requirement) {
    case "text": return "a written response";
    case "graph": return "a graph";
    case "geometry": return "a geometric construction";
    case "statistics": return "a statistics chart";
    case "data_table": return "a completed data table";
    default: return "a response";
  }
}

export function isStructuredWorkspace(workspace: ResponseWorkspace): boolean {
  return workspace.tools.includes("rich_text") || workspace.graph.enabled || workspace.geometry.enabled ||
    workspace.statistics.enabled || workspace.dataTable.enabled;
}
