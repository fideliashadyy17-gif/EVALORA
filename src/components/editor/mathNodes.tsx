"use client";

import { renderLatex } from "@/lib/content";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

/**
 * Mathematical nodes for the unified editor. A math node stores LaTeX source
 * and renders with KaTeX. Clicking a node selects it; the "Edit" affordance
 * (and double-click) asks the host editor to open it in Math/LaTeX mode via
 * `editor.storage.mathNodes.onEditRequest(pos, latex, display)`.
 */

type EditRequest = (pos: number, latex: string, display: boolean) => void;

function MathNodeView({ node, getPos, extension, selected }: NodeViewProps) {
  const latex = String(node.attrs.latex ?? "");
  const display = node.type.name === "mathBlock";
  const html = renderLatex(latex || "\\square", display);

  const requestEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = typeof getPos === "function" ? getPos() : 0;
    const fn = (extension.storage as { onEditRequest?: EditRequest }).onEditRequest;
    if (typeof pos === "number") fn?.(pos, latex, display);
  };

  if (display) {
    return (
      <NodeViewWrapper
        className={`rce-math-node rce-math-block-node${selected ? " is-selected" : ""}`}
        data-latex={latex}
        onDoubleClick={requestEdit}
        title="Double-click to edit this equation"
      >
        <span dangerouslySetInnerHTML={{ __html: html }} />
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper
      as="span"
      className={`rce-math-node${selected ? " is-selected" : ""}`}
      data-latex={latex}
      onDoubleClick={requestEdit}
      title="Double-click to edit this equation"
    >
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </NodeViewWrapper>
  );
}

function makeMathNode(name: "mathInline" | "mathBlock") {
  const display = name === "mathBlock";
  return Node.create({
    name,
    group: display ? "block" : "inline",
    inline: !display,
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      return {
        latex: {
          default: "",
          parseHTML: (el: HTMLElement) => el.getAttribute("data-latex") ?? "",
          renderHTML: (attrs: Record<string, unknown>) => ({ "data-latex": attrs.latex ?? "" }),
        },
      };
    },

    parseHTML() {
      return [{ tag: display ? "div[data-math-block]" : "span[data-math-inline]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return display
        ? ["div", mergeAttributes(HTMLAttributes, { "data-math-block": "true" })]
        : ["span", mergeAttributes(HTMLAttributes, { "data-math-inline": "true" })];
    },

    addNodeView() {
      return ReactNodeViewRenderer(MathNodeView);
    },

    addStorage() {
      return { onEditRequest: undefined as EditRequest | undefined };
    },
  });
}

export const MathInline = makeMathNode("mathInline");
export const MathBlock = makeMathNode("mathBlock");
