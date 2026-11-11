"use client";

import { GraphEditor } from "@/components/graph/GraphEditor";
import { GeometryEditor } from "@/components/geometry/GeometryEditor";
import { emptyGeometrySpec, normaliseGeometrySpec, type GeometrySpec } from "@/lib/geometrySpec";
import { emptyGraphSpec, normaliseGraphSpec, type GraphSpec } from "@/lib/graphSpec";
import { useEffect, useState } from "react";
import type { DiagramKind } from "./diagramNodes";

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
  onSave: (spec: GraphSpec | GeometrySpec) => void;
  onClose: () => void;
}) {
  const [graph, setGraph] = useState<GraphSpec>(() => normaliseGraphSpec(initial ?? emptyGraphSpec()));
  const [geometry, setGeometry] = useState<GeometrySpec>(() => normaliseGeometrySpec(initial ?? emptyGeometrySpec()));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="diagram-dialog" role="dialog" aria-modal="true" aria-label={kind === "graph" ? "Graph editor" : "Geometry editor"}>
      <div className="diagram-dialog-panel">
        <header className="flex flex-wrap items-center gap-3 border-b border-evergreen-900/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">
              {kind === "graph" ? "Graph builder" : "Geometry builder"}
            </h2>
            <p className="text-xs text-ink-soft">
              {kind === "graph"
                ? "Plot functions or draw by hand. The graph is stored as editable data, not an image."
                : "Construct points, lines, circles and polygons. Measurements and derived points follow your construction."}
            </p>
          </div>
          <button type="button" className="min-h-10 rounded-lg border border-evergreen-900/20 px-3 text-sm font-semibold" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="min-h-10 rounded-lg bg-evergreen-700 px-4 text-sm font-semibold text-white hover:bg-evergreen-800"
            onClick={() => onSave(kind === "graph" ? graph : geometry)}
          >
            Insert into question
          </button>
        </header>
        <div className="diagram-dialog-body">
          {kind === "graph"
            ? <GraphEditor initial={graph} onChange={setGraph} title="Graph builder" />
            : <GeometryEditor initial={geometry} onChange={setGeometry} title="Geometry builder" />}
        </div>
      </div>
    </div>
  );
}
