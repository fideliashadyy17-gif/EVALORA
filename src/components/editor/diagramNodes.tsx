"use client";

import { normaliseGeometrySpec, emptyGeometrySpec, type GeometrySpec } from "@/lib/geometrySpec";
import { normaliseGraphSpec, emptyGraphSpec, type GraphSpec } from "@/lib/graphSpec";
import { normaliseStatsSpec, emptyStatsSpec, type StatsSpec } from "@/lib/statsSpec";
import { normaliseDataTableSpec, emptyDataTableSpec, type DataTableSpec } from "@/lib/dataTableSpec";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { GraphView } from "@/components/graph/GraphView";
import { GeometryView } from "@/components/geometry/GeometryView";
import { StatsView } from "@/components/stats/StatsView";
import { DataTableView } from "@/components/stats/DataTableView";

/**
 * Diagram nodes for the unified editor. Like the mathematics nodes, they store
 * their complete source (a JSON graph/geometry/statistics/table specification)
 * inside the document, so a question or an answer can be reopened and edited.
 * Unlike an image, nothing here is flattened: the SVG or table is generated from
 * the specification.
 */

export type DiagramKind = "graph" | "geometry" | "statistics" | "data_table";
export type DiagramSpec = GraphSpec | GeometrySpec | StatsSpec | DataTableSpec;
export type DiagramEditRequest = (pos: number, kind: DiagramKind, spec: unknown) => void;

const NODE_NAMES: Record<DiagramKind, string> = {
  graph: "graphBlock",
  geometry: "geometryBlock",
  statistics: "statsBlock",
  data_table: "dataTableBlock",
};

const SPEC_ATTRIBUTES: Record<DiagramKind, string> = {
  graph: "data-graph-spec",
  geometry: "data-geometry-spec",
  statistics: "data-stats-spec",
  data_table: "data-table-spec",
};

const BLOCK_ATTRIBUTES: Record<DiagramKind, string> = {
  graph: "data-graph-block",
  geometry: "data-geometry-block",
  statistics: "data-stats-block",
  data_table: "data-table-block",
};

const EDIT_LABELS: Record<DiagramKind, string> = {
  graph: "Edit graph",
  geometry: "Edit figure",
  statistics: "Edit chart",
  data_table: "Edit table",
};

const ARIA_LABELS: Record<DiagramKind, string> = {
  graph: "Graph authored in the question",
  geometry: "Geometry construction authored in the question",
  statistics: "Statistics chart authored in the question",
  data_table: "Data table authored in the question",
};

export function emptyDiagramSpec(kind: DiagramKind): DiagramSpec {
  if (kind === "graph") return emptyGraphSpec();
  if (kind === "geometry") return emptyGeometrySpec();
  if (kind === "statistics") return emptyStatsSpec();
  return emptyDataTableSpec();
}

export function normaliseDiagramSpec(kind: DiagramKind, raw: unknown): DiagramSpec {
  if (kind === "graph") return normaliseGraphSpec(raw);
  if (kind === "geometry") return normaliseGeometrySpec(raw);
  if (kind === "statistics") return normaliseStatsSpec(raw);
  return normaliseDataTableSpec(raw);
}

function readSpec(raw: string | null, kind: DiagramKind): DiagramSpec {
  if (!raw) return emptyDiagramSpec(kind);
  try {
    return normaliseDiagramSpec(kind, JSON.parse(raw));
  } catch {
    return emptyDiagramSpec(kind);
  }
}

function DiagramNodeView({ kind, node, getPos, extension, selected }: NodeViewProps & { kind: DiagramKind }) {
  const spec = normaliseDiagramSpec(kind, node.attrs.spec);
  const requestEdit = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const pos = typeof getPos === "function" ? getPos() : null;
    const handler = (extension.storage as { onEditRequest?: DiagramEditRequest }).onEditRequest;
    if (typeof pos === "number") handler?.(pos, kind, spec);
  };

  return (
    <NodeViewWrapper
      className={`rce-diagram-node${selected ? " is-selected" : ""}`}
      data-diagram={kind}
      onDoubleClick={requestEdit}
    >
      {kind === "graph" && <GraphView spec={spec as GraphSpec} compact ariaLabel={ARIA_LABELS.graph} />}
      {kind === "geometry" && <GeometryView spec={spec as GeometrySpec} compact ariaLabel={ARIA_LABELS.geometry} />}
      {kind === "statistics" && <StatsView spec={spec as StatsSpec} compact />}
      {kind === "data_table" && <DataTableView spec={spec as DataTableSpec} compact />}
      <div className="rce-diagram-actions">
        <button type="button" className="rce-diagram-edit" onClick={requestEdit}>{EDIT_LABELS[kind]}</button>
      </div>
    </NodeViewWrapper>
  );
}

const NodeViews: Record<DiagramKind, (props: NodeViewProps) => React.JSX.Element> = {
  graph: (props) => <DiagramNodeView {...props} kind="graph" />,
  geometry: (props) => <DiagramNodeView {...props} kind="geometry" />,
  statistics: (props) => <DiagramNodeView {...props} kind="statistics" />,
  data_table: (props) => <DiagramNodeView {...props} kind="data_table" />,
};

function makeDiagramNode(kind: DiagramKind) {
  const name = NODE_NAMES[kind];
  const attribute = SPEC_ATTRIBUTES[kind];
  const blockAttribute = BLOCK_ATTRIBUTES[kind];
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      return {
        spec: {
          default: emptyDiagramSpec(kind),
          parseHTML: (element: HTMLElement) => readSpec(element.getAttribute(attribute), kind),
          // The parsed object is the stored source of truth; the HTML copy is
          // only a fallback for documents that pass through HTML serialisation.
          renderHTML: (attributes: Record<string, unknown>) => ({
            [attribute]: JSON.stringify(normaliseDiagramSpec(kind, attributes.spec)),
          }),
        },
      };
    },
    parseHTML() {
      return [{ tag: `div[${blockAttribute}]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { [blockAttribute]: "true" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(NodeViews[kind]);
    },
    addStorage() {
      return { onEditRequest: undefined as DiagramEditRequest | undefined };
    },
  });
}

export const GraphBlock = makeDiagramNode("graph");
export const GeometryBlock = makeDiagramNode("geometry");
export const StatsBlock = makeDiagramNode("statistics");
export const DataTableBlock = makeDiagramNode("data_table");
