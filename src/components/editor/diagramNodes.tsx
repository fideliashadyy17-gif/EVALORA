"use client";

import { normaliseGeometrySpec, emptyGeometrySpec, type GeometrySpec } from "@/lib/geometrySpec";
import { normaliseGraphSpec, emptyGraphSpec, type GraphSpec } from "@/lib/graphSpec";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { GraphView } from "@/components/graph/GraphView";
import { GeometryView } from "@/components/geometry/GeometryView";

/**
 * Diagram nodes for the unified editor. Like the mathematics nodes, they store
 * their complete source (a JSON graph/geometry specification) inside the
 * document, so a question or an answer can be reopened and edited. Unlike an
 * image, nothing here is flattened: the SVG is generated from the specification.
 */

export type DiagramKind = "graph" | "geometry";
export type DiagramEditRequest = (pos: number, kind: DiagramKind, spec: unknown) => void;

function readSpec(raw: string | null, kind: DiagramKind): GraphSpec | GeometrySpec {
  if (!raw) return kind === "graph" ? emptyGraphSpec() : emptyGeometrySpec();
  try {
    const parsed: unknown = JSON.parse(raw);
    return kind === "graph" ? normaliseGraphSpec(parsed) : normaliseGeometrySpec(parsed);
  } catch {
    return kind === "graph" ? emptyGraphSpec() : emptyGeometrySpec();
  }
}

function GraphNodeView({ node, getPos, extension, selected }: NodeViewProps) {
  const spec = normaliseGraphSpec(node.attrs.spec);
  const requestEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = typeof getPos === "function" ? getPos() : null;
    const fn = (extension.storage as { onEditRequest?: DiagramEditRequest }).onEditRequest;
    if (typeof pos === "number") fn?.(pos, "graph", spec);
  };
  return (
    <NodeViewWrapper className={`rce-diagram-node${selected ? " is-selected" : ""}`} data-diagram="graph" onDoubleClick={requestEdit}>
      <GraphView spec={spec} compact ariaLabel="Graph authored in the question" />
      <div className="rce-diagram-actions">
        <button type="button" className="rce-diagram-edit" onClick={requestEdit}>Edit graph</button>
      </div>
    </NodeViewWrapper>
  );
}

function GeometryNodeView({ node, getPos, extension, selected }: NodeViewProps) {
  const spec = normaliseGeometrySpec(node.attrs.spec);
  const requestEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = typeof getPos === "function" ? getPos() : null;
    const fn = (extension.storage as { onEditRequest?: DiagramEditRequest }).onEditRequest;
    if (typeof pos === "number") fn?.(pos, "geometry", spec);
  };
  return (
    <NodeViewWrapper className={`rce-diagram-node${selected ? " is-selected" : ""}`} data-diagram="geometry" onDoubleClick={requestEdit}>
      <GeometryView spec={spec} compact ariaLabel="Geometry construction authored in the question" />
      <div className="rce-diagram-actions">
        <button type="button" className="rce-diagram-edit" onClick={requestEdit}>Edit figure</button>
      </div>
    </NodeViewWrapper>
  );
}

function makeDiagramNode(kind: DiagramKind) {
  const name = kind === "graph" ? "graphBlock" : "geometryBlock";
  const attr = kind === "graph" ? "data-graph-spec" : "data-geometry-spec";
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      return {
        spec: {
          default: kind === "graph" ? emptyGraphSpec() : emptyGeometrySpec(),
          parseHTML: (el: HTMLElement) => readSpec(el.getAttribute(attr), kind),
          // The parsed object is the stored source of truth; the HTML copy is
          // only a fallback for documents that pass through HTML serialisation.
          renderHTML: (attributes: Record<string, unknown>) => ({
            [attr]: JSON.stringify(kind === "graph"
              ? normaliseGraphSpec(attributes.spec)
              : normaliseGeometrySpec(attributes.spec)),
          }),
        },
      };
    },
    parseHTML() {
      return [{ tag: `div[data-${kind}-block]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { [`data-${kind}-block`]: "true" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(kind === "graph" ? GraphNodeView : GeometryNodeView);
    },
    addStorage() {
      return { onEditRequest: undefined as DiagramEditRequest | undefined };
    },
  });
}

export const GraphBlock = makeDiagramNode("graph");
export const GeometryBlock = makeDiagramNode("geometry");
