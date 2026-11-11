"use client";

import { GraphEditor } from "@/components/graph/GraphEditor";
import { GeometryEditor } from "@/components/geometry/GeometryEditor";
import { StatsEditor } from "@/components/stats/StatsEditor";
import { DataTableEditor } from "@/components/stats/DataTableEditor";
import { emptyGeometrySpec, normaliseGeometrySpec, type GeometrySpec } from "@/lib/geometrySpec";
import { emptyGraphSpec, normaliseGraphSpec, type GraphSpec } from "@/lib/graphSpec";
import { emptyStatsSpec, normaliseStatsSpec, type StatsSpec } from "@/lib/statsSpec";
import { emptyDataTableSpec, normaliseDataTableSpec, type DataTableSpec } from "@/lib/dataTableSpec";
import { useEffect, useState } from "react";
import type { DiagramKind, DiagramSpec } from "./diagramNodes";

const TITLES: Record<DiagramKind, string> = {
  graph: "Graph builder",
  geometry: "Geometry builder",
  statistics: "Statistics builder",
  data_table: "Table builder",
};

const DESCRIPTIONS: Record<DiagramKind, string> = {
  graph: "Plot functions or draw by hand. The graph is stored as editable data, not an image.",
  geometry: "Construct points, lines, circles and polygons. Measurements and derived points follow your construction.",
  statistics: "Enter data and choose a representation. The chart is stored as values, not as a picture.",
  data_table: "Build a table with fixed columns and rows. The cell positions survive into marking.",
};

/**
 * Full-screen (or near-full-screen on a phone) editor for one diagram embedded
 * in a question. Mobile-first: the palette scrolls horizontally, every control
 * is at least 40 px tall, and the drawing surface stays usable with a finger.
 */
export function DiagramEditorDialog({
  kind,
  initial,
  onSave,
  onClose,
}: {
  kind: DiagramKind;
  initial: unknown;
  onSave: (spec: DiagramSpec) => void;
  onClose: () => void;
}) {
  const [graph, setGraph] = useState<GraphSpec>(() => normaliseGraphSpec(kind === "graph" ? initial ?? emptyGraphSpec() : emptyGraphSpec()));
  const [geometry, setGeometry] = useState<GeometrySpec>(() => normaliseGeometrySpec(kind === "geometry" ? initial ?? emptyGeometrySpec() : emptyGeometrySpec()));
  const [statistics, setStatistics] = useState<StatsSpec>(() => normaliseStatsSpec(kind === "statistics" ? initial ?? emptyStatsSpec() : emptyStatsSpec()));
  const [dataTable, setDataTable] = useState<DataTableSpec>(() => normaliseDataTableSpec(kind === "data_table" ? initial ?? emptyDataTableSpec() : emptyDataTableSpec()));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    if (kind === "graph") onSave(graph);
    else if (kind === "geometry") onSave(geometry);
    else if (kind === "statistics") onSave(statistics);
    else onSave(dataTable);
  }

  return (
    <div className="diagram-dialog" role="dialog" aria-modal="true" aria-label={TITLES[kind]}>
      <div className="diagram-dialog-panel">
        <header className="flex flex-wrap items-center gap-3 border-b border-evergreen-900/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">{TITLES[kind]}</h2>
            <p className="text-xs text-ink-soft">{DESCRIPTIONS[kind]}</p>
          </div>
          <button type="button" className="min-h-10 rounded-lg border border-evergreen-900/20 px-3 text-sm font-semibold" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="min-h-10 rounded-lg bg-evergreen-700 px-4 text-sm font-semibold text-white hover:bg-evergreen-800"
            onClick={save}
          >
            Insert into question
          </button>
        </header>
        <div className="diagram-dialog-body">
          {kind === "graph" && <GraphEditor initial={graph} onChange={setGraph} title="Graph builder" />}
          {kind === "geometry" && <GeometryEditor initial={geometry} onChange={setGeometry} title="Geometry builder" />}
          {kind === "statistics" && <StatsEditor initial={statistics} onChange={setStatistics} />}
          {kind === "data_table" && <DataTableEditor spec={dataTable} onChange={setDataTable} title="Table builder" />}
        </div>
      </div>
    </div>
  );
}
