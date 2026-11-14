"use client";

import dynamic from "next/dynamic";

import { RichContent } from "@/components/RichContent";

import { GraphView } from "@/components/graph/GraphView";
import { GeometryView } from "@/components/geometry/GeometryView";

import { emptyDoc, docToPlainText, textToDoc, type RichDoc } from "@/lib/content";
import { emptyGraphSpec, graphSpecHasWork, normaliseGraphSpec, type GraphSpec } from "@/lib/graphSpec";
import { emptyGeometrySpec, geometrySpecHasWork, normaliseGeometrySpec, type GeometrySpec } from "@/lib/geometrySpec";
import { emptyStatsSpec, normaliseStatsSpec, statsSpecHasWork, type StatsSpec } from "@/lib/statsSpec";
import { emptyDataTableSpec, dataTableHasWork, normaliseDataTableSpec, type DataTableSpec } from "@/lib/dataTableSpec";

import { emptyVennSpec, normaliseVennSpec, vennSpecHasWork, type VennSpec } from "@/lib/vennSpec";

import { ProbabilityTreeView } from "@/components/probability/ProbabilityTreeView";
import { emptyProbabilityTreeSpec, normaliseProbabilityTreeSpec, probabilityTreeHasWork, type ProbabilityTreeSpec } from "@/lib/probabilityTreeSpec";

import { StemLeafView } from "@/components/stem-leaf/StemLeafView";
import { emptyStemLeafSpec, normaliseStemLeafSpec, stemLeafHasWork, type StemLeafSpec } from "@/lib/stemLeafSpec";
import type { ResponseWorkspace } from "@/lib/responseTools";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function ToolLoading() {
  return <p role="status" className="min-h-48 rounded-xl border border-evergreen-900/10 bg-paper p-5 text-sm text-ink-soft">Opening response tool… Your saved work is retained.</p>;
}

// Tool state stays in this parent. A tool chunk is requested only when its
// workspace is rendered; switching tabs cannot erase a construction.
const RichContentEditor = dynamic(() => import("@/components/editor/RichContentEditor").then(m => m.RichContentEditor), { loading: ToolLoading });
const GraphEditor = dynamic(() => import("@/components/graph/GraphEditor").then(m => m.GraphEditor), { loading: ToolLoading });
const GeometryEditor = dynamic(() => import("@/components/geometry/GeometryEditor").then(m => m.GeometryEditor), { loading: ToolLoading });
const StatsEditor = dynamic(() => import("@/components/stats/StatsEditor").then(m => m.StatsEditor), { loading: ToolLoading });
const DataTableEditor = dynamic(() => import("@/components/stats/DataTableEditor").then(m => m.DataTableEditor), { loading: ToolLoading });
const VennEditor = dynamic(() => import("@/components/venn/VennEditor").then(m => m.VennEditor), { loading: ToolLoading });
const ProbabilityTreeEditor = dynamic(() => import("@/components/probability/ProbabilityTreeEditor").then(m => m.ProbabilityTreeEditor), { loading: ToolLoading });
const StemLeafEditor = dynamic(() => import("@/components/stem-leaf/StemLeafEditor").then(m => m.StemLeafEditor), { loading: ToolLoading });

type Tab = "written" | "graph" | "geometry" | "statistics" | "data_table" | "venn" | "probability_tree" | "stem_leaf";

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
  onPayloadChange,
}: {
  workspace: ResponseWorkspace;
  initial: Record<string, unknown> | null;
  disabled?: boolean;
  autosave?: boolean;
  submitLabel?: string;
  emit: (payload: Record<string, unknown>) => boolean | void;
  onDirtyChange?: (dirty: boolean) => void;
  /** Receives the latest local construction before it has been saved. */
  onPayloadChange?: (payload: Record<string, unknown>) => void;
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
    const base = saved ? normaliseStatsSpec(saved) : normaliseStatsSpec(workspace.statistics.starter, emptyStatsSpec());
    return workspace.statistics.chart === "any" ? base : { ...base, chart: workspace.statistics.chart };
  });
  const [venn, setVenn] = useState<VennSpec>(() => {
    const saved = initial?.venn;
    return saved ? normaliseVennSpec(saved) : normaliseVennSpec(workspace.venn.starter, emptyVennSpec());
  });
  const [probabilityTree, setProbabilityTree] = useState<ProbabilityTreeSpec>(() => {
    const saved = initial?.probability_tree;
    return saved ? normaliseProbabilityTreeSpec(saved) : normaliseProbabilityTreeSpec(workspace.probabilityTree.starter, emptyProbabilityTreeSpec());
  });
  const [stemLeaf, setStemLeaf] = useState<StemLeafSpec>(() => {
    const saved = initial?.stem_leaf;
    return saved ? normaliseStemLeafSpec(saved) : normaliseStemLeafSpec(workspace.stemLeaf.starter, emptyStemLeafSpec());
  });
  const [dataTable, setDataTable] = useState<DataTableSpec>(() => {
    const saved = initial?.data_table;
    return saved ? normaliseDataTableSpec(saved) : normaliseDataTableSpec(workspace.dataTable.starter, emptyDataTableSpec());
  });
  const [statsReset, setStatsReset] = useState(0);
  const graphOn = workspace.graph.enabled;
  const geometryOn = workspace.geometry.enabled;
  const statsOn = workspace.statistics.enabled;
  const vennOn = workspace.venn.enabled;
  const probabilityTreeOn = workspace.probabilityTree.enabled;
  const stemLeafOn = workspace.stemLeaf.enabled;
  const tableOn = workspace.dataTable.enabled;
  const [tab, setTab] = useState<Tab>(() => {
    const desired = workspace.defaultTool;
    if (desired === "graph" || desired === "geometry" || desired === "statistics" || desired === "data_table" || desired === "venn" || desired === "probability_tree" || desired === "stem_leaf") return desired;
    return workspace.tools.includes("rich_text") ? "written" : "graph";
  });
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const lastEmitted = useRef<string>(JSON.stringify(initial ?? {}));

  // A workspace without prose (rare, teacher-configured) opens on its first tool.
  useEffect(() => {
    if (!workspace.tools.includes("rich_text")) {
      setTab(graphOn ? "graph" : geometryOn ? "geometry" : statsOn ? "statistics" : tableOn ? "data_table" : vennOn ? "venn" : probabilityTreeOn ? "probability_tree" : stemLeafOn ? "stem_leaf" : "written");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payload = useCallback((): Record<string, unknown> => {
    const graphWork = graphSpecHasWork(graph) ? graph : null;
    const geometryWork = geometrySpecHasWork(geometry) ? geometry : null;
    const statsWork = statsSpecHasWork(statistics) ? statistics : null;
    const vennWork = vennSpecHasWork(venn) ? venn : null;
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
      ...(vennOn || vennWork ? { venn: vennWork } : {}),
      ...(probabilityTreeOn || probabilityTreeHasWork(probabilityTree) ? { probability_tree: probabilityTreeHasWork(probabilityTree) ? probabilityTree : null } : {}),
      ...(stemLeafOn || stemLeafHasWork(stemLeaf) ? { stem_leaf: stemLeafHasWork(stemLeaf) ? stemLeaf : null } : {}),
    };
  }, [doc, graph, geometry, statistics, dataTable, venn, probabilityTree, stemLeaf, graphOn, geometryOn, statsOn, tableOn, vennOn, probabilityTreeOn, stemLeafOn]);

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
  const vennPreview = vennOn && vennSpecHasWork(venn) ? venn : null;
  const probabilityTreePreview = probabilityTreeOn && probabilityTreeHasWork(probabilityTree) ? probabilityTree : null;
  const stemLeafPreview = stemLeafOn && stemLeafHasWork(stemLeaf) ? stemLeaf : null;
  const missingRequired =
    (workspace.requirement === "graph" && !graphPreview) ||
    (workspace.requirement === "geometry" && !geometryPreview) ||
    (workspace.requirement === "statistics" && !statsPreview) ||
    (workspace.requirement === "data_table" && !tablePreview) ||
    (workspace.requirement === "venn" && !vennPreview) ||
    (workspace.requirement === "probability_tree" && !probabilityTreePreview) ||
    (workspace.requirement === "stem_leaf" && !stemLeafPreview) ||
    (workspace.requirement === "text" && !docToPlainText(doc).trim());

  // This lets an assess-parts runner include unsaved construction state in its
  // own atomic answer payload. Keep the callback in a ref: its parent commonly
  // recreates the callback while saving, and making that identity a dependency
  // would turn a harmless state hand-off into a render loop.
  const payloadChangeRef = useRef(onPayloadChange);
  payloadChangeRef.current = onPayloadChange;
  useEffect(() => { payloadChangeRef.current?.(payload()); }, [payload]);

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
        {vennOn && (
          <button type="button" role="tab" aria-selected={tab === "venn"} className={cn("structured-tab", tab === "venn" && "is-active")} onClick={() => setTab("venn")}>
            ◎ Venn diagram {vennPreview ? "✓" : ""}
          </button>
        )}
        {probabilityTreeOn && (
          <button type="button" role="tab" aria-selected={tab === "probability_tree"} className={cn("structured-tab", tab === "probability_tree" && "is-active")} onClick={() => setTab("probability_tree")}>
            ⑂ Probability tree {probabilityTreePreview ? "✓" : ""}
          </button>
        )}
        {stemLeafOn && (
          <button type="button" role="tab" aria-selected={tab === "stem_leaf"} className={cn("structured-tab", tab === "stem_leaf" && "is-active")} onClick={() => setTab("stem_leaf")}>
            ┃ Stem-and-leaf {stemLeafPreview ? "✓" : ""}
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
              // Inline graphs, constructions, charts and data tables can be
              // embedded in the written answer itself: the doc carries their
              // full structured specification, so one answer can combine text,
              // mathematics, tables and diagrams exactly as the candidate built it.
              allowDiagrams
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
            {workspace.statistics.instructions || "Enter your data and choose the representation the question asks for."}
          </p>
          <StatsEditor
            initial={statistics}
            onChange={(next) => { setStatistics(next); markDirty(); }}
            readOnly={disabled}
            allowChartChange={workspace.statistics.chart === "any"}
            resetToken={statsReset}
          />
          {!disabled && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const starter = normaliseStatsSpec(workspace.statistics.starter, emptyStatsSpec());
                  setStatistics(workspace.statistics.chart === "any" ? starter : { ...starter, chart: workspace.statistics.chart });
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

      {tab === "venn" && vennOn && (
        <div className="structured-pane">
          <p className="structured-hint">
            {workspace.venn.instructions || "Build the diagram the question asks for: name the sets, then write the value of each region."}
          </p>
          <VennEditor
            value={venn}
            onChange={(next) => { setVenn(next); markDirty(); }}
            allowSetChange={workspace.venn.allowSetChange}
            disabled={disabled}
          />
          {!disabled && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="structured-reset"
                onClick={() => {
                  setVenn(normaliseVennSpec(workspace.venn.starter, emptyVennSpec()));
                  markDirty();
                }}
              >
                Reset Venn diagram
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "probability_tree" && probabilityTreeOn && (
        <div className="structured-pane">
          <p className="structured-hint">{workspace.probabilityTree.instructions || "Build the branches, label each event and write every branch probability."}</p>
          <ProbabilityTreeEditor value={probabilityTree} onChange={(next) => { setProbabilityTree(next); markDirty(); }} disabled={disabled} allowStructure={workspace.probabilityTree.allowStructure} />
          {!disabled && <div className="mt-2"><Button variant="outline" onClick={() => { setProbabilityTree(normaliseProbabilityTreeSpec(workspace.probabilityTree.starter, emptyProbabilityTreeSpec())); markDirty(); }}>Reset probability tree</Button></div>}
          {probabilityTreePreview && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-evergreen-800">Preview of the tree you will submit</summary><ProbabilityTreeView spec={probabilityTreePreview} /></details>}
        </div>
      )}

      {tab === "stem_leaf" && stemLeafOn && (
        <div className="structured-pane">
          <p className="structured-hint">{workspace.stemLeaf.instructions || "Complete the stems, ordered leaves and key directly in the diagram."}</p>
          <StemLeafEditor value={stemLeaf} onChange={(next) => { setStemLeaf(next); markDirty(); }} disabled={disabled} />
          {!disabled && <div className="mt-2"><Button variant="outline" onClick={() => { setStemLeaf(normaliseStemLeafSpec(workspace.stemLeaf.starter, emptyStemLeafSpec())); markDirty(); }}>Reset stem-and-leaf diagram</Button></div>}
          {stemLeafPreview && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-evergreen-800">Preview of the diagram you will submit</summary><StemLeafView spec={stemLeafPreview} /></details>}
        </div>
      )}

      {tab === "data_table" && tableOn && (
        <div className="structured-pane">
          <p className="structured-hint">
            {workspace.dataTable.instructions || "Complete the table. Each value keeps its row and column when your teacher marks it."}
          </p>
          <DataTableEditor
            spec={dataTable}
            onChange={(next) => { setDataTable(next); markDirty(); }}
            readOnly={disabled}
            allowStructure={!disabled}
            title={workspace.dataTable.title || "Data table"}
          />
          {!disabled && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDataTable(normaliseDataTableSpec(workspace.dataTable.starter, emptyDataTableSpec()));
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
    case "venn": return "a Venn diagram";
    case "probability_tree": return "a probability tree";
    case "stem_leaf": return "a stem-and-leaf diagram";
    default: return "a response";
  }
}

export function isStructuredWorkspace(workspace: ResponseWorkspace): boolean {
  return workspace.tools.includes("rich_text") || workspace.graph.enabled || workspace.geometry.enabled ||
    workspace.statistics.enabled || workspace.dataTable.enabled || workspace.venn.enabled ||
    workspace.probabilityTree.enabled || workspace.stemLeaf.enabled;
}
