import katex from "katex";
import { graphSpecHasWork, graphSpecSummary, normaliseGraphSpec } from "./graphSpec";
import { geometrySpecHasWork, geometrySpecSummary, normaliseGeometrySpec } from "./geometrySpec";
import { normaliseStatsSpec, statsSpecHasWork, statsSpecSummary } from "./statsSpec";
import { dataTableHasWork, dataTableSummary, normaliseDataTableSpec } from "./dataTableSpec";
import { assessDiagramSummary, normaliseAssessDiagram } from "./assessDiagram";

/**
 * Structured rich content (Tiptap JSON) used by the unified question editor.
 *
 * A document mixes ordinary text, formatting, lists, tables, images and
 * mathematical nodes. Math nodes (`mathInline`, `mathBlock`) carry their
 * LaTeX source in `attrs.latex` — the LaTeX is the source of truth for the
 * mathematics and is rendered with KaTeX everywhere (editor preview, quiz,
 * live competition, examination, results, explanations).
 *
 * For backwards compatibility every document also serializes to the legacy
 * plain-text form where math appears as $…$ / $$…$$ — which is exactly what
 * the original `MathText` renderer understands. Old questions without a
 * document parse back with `textToDoc`.
 */

export interface RichNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export type RichDoc = RichNode; // root node has type "doc"

export function emptyDoc(): RichDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function nodeText(node: RichNode): string {
  switch (node.type) {
    case "text":
      return node.text ?? "";
    case "mathInline":
      return `$${String(node.attrs?.latex ?? "")}$`;
    case "mathBlock":
      return `\n$$${String(node.attrs?.latex ?? "")}$$\n`;
    case "hardBreak":
      return "\n";
    case "image":
      return "";
    case "graphBlock": {
      const spec = normaliseGraphSpec(node.attrs?.spec);
      return graphSpecHasWork(spec) ? `[Graph: ${graphSpecSummary(spec)}]` : "";
    }
    case "geometryBlock": {
      const spec = normaliseGeometrySpec(node.attrs?.spec);
      return geometrySpecHasWork(spec) ? `[Geometry: ${geometrySpecSummary(spec)}]` : "";
    }
    case "statsBlock": {
      const spec = normaliseStatsSpec(node.attrs?.spec);
      return statsSpecHasWork(spec) ? `[Statistics: ${statsSpecSummary(spec)}]` : "";
    }
    case "dataTableBlock": {
      const spec = normaliseDataTableSpec(node.attrs?.spec);
      return dataTableHasWork(spec) ? `[Data table: ${dataTableSummary(spec)}]` : "";
    }
    case "assessDiagramBlock": {
      const spec = normaliseAssessDiagram(node.attrs?.spec);
      return spec ? `[Diagram: ${assessDiagramSummary(spec)}]` : "";
    }
    default: {
      const inner = (node.content ?? []).map(nodeText).join("");
      const isBlock = [
        "paragraph", "heading", "blockquote", "listItem",
        "tableRow", "codeBlock",
      ].includes(node.type);
      return isBlock && inner ? `${inner}\n` : inner;
    }
  }
}

/** Serialize a document to the legacy plain-text form ($…$ math). */
export function docToPlainText(doc: RichDoc | null | undefined): string {
  if (!doc?.content) return "";
  return doc.content.map(nodeText).join("").replace(/\n{3,}/g, "\n\n").trim();
}

/** Single-line plain text (for option labels / list cells). */
export function docToLabel(doc: RichDoc | null | undefined): string {
  const text = docToPlainText(doc).replace(/\s*\n\s*/g, " ").trim();
  if (text) return text;
  // Image-only content: fall back to the image's alt/caption.
  let alt = "";
  const walk = (n: RichNode) => {
    if (n.type === "image" && !alt) alt = String(n.attrs?.alt || n.attrs?.title || "");
    (n.content ?? []).forEach(walk);
  };
  if (doc) walk(doc);
  return alt || "[Image]";
}

export function docIsEmpty(doc: RichDoc | null | undefined): boolean {
  if (!doc?.content?.length) return true;
  let hasContent = false;
  const walk = (n: RichNode) => {
    if (n.type === "text" && (n.text ?? "").trim()) hasContent = true;
    if (n.type === "mathInline" || n.type === "mathBlock" || n.type === "image" ||
      n.type === "graphBlock" || n.type === "geometryBlock" ||
      n.type === "statsBlock" || n.type === "dataTableBlock" || n.type === "assessDiagramBlock") hasContent = true;
    (n.content ?? []).forEach(walk);
  };
  walk(doc);
  return !hasContent;
}

/** Parse legacy plain text (with $…$ / $$…$$ math) into a document. */
export function textToDoc(text: string | null | undefined): RichDoc {
  if (!text?.trim()) return emptyDoc();
  const blocks: RichNode[] = [];
  for (const rawBlock of text.split(/\n\s*\n/)) {
    const block = rawBlock.trim();
    if (!block) continue;
    // A block that is purely a display equation becomes a mathBlock.
    const displayOnly = block.match(/^\$\$([\s\S]+?)\$\$$/);
    if (displayOnly) {
      blocks.push({ type: "mathBlock", attrs: { latex: displayOnly[1].trim() } });
      continue;
    }
    const inline: RichNode[] = [];
    // Split on $$…$$ first (becomes inline-position display→mathBlock is
    // block-level, so mid-paragraph $$ is kept as inline for safety), then $…$.
    const parts = block.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g).filter(Boolean);
    let blockMath: string | null = null;
    const flushInline = () => {
      if (inline.length) blocks.push({ type: "paragraph", content: [...inline] });
      inline.length = 0;
    };
    for (const part of parts) {
      if (part.startsWith("$$") && part.endsWith("$$")) {
        blockMath = part.slice(2, -2).trim();
        flushInline();
        blocks.push({ type: "mathBlock", attrs: { latex: blockMath } });
      } else if (part.startsWith("$") && part.endsWith("$")) {
        inline.push({ type: "mathInline", attrs: { latex: part.slice(1, -1).trim() } });
      } else {
        part.split("\n").forEach((line, i, arr) => {
          if (line) inline.push({ type: "text", text: line });
          if (i < arr.length - 1) inline.push({ type: "hardBreak" });
        });
      }
    }
    flushInline();
  }
  return blocks.length ? { type: "doc", content: blocks } : emptyDoc();
}

/** Validate LaTeX source. Returns an error message or null when valid. */
export function validateLatex(latex: string): string | null {
  const src = (latex ?? "").trim();
  if (!src) return "Enter some LaTeX first.";
  // Cheap brace balance check for a friendlier message.
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\\") { i++; continue; }
    if (src[i] === "{") depth++;
    if (src[i] === "}") depth--;
    if (depth < 0) return "Unbalanced braces: a closing } has no opening {.";
  }
  if (depth > 0) return `Unbalanced braces: ${depth} opening { without a closing }.`;
  try {
    katex.renderToString(src, { throwOnError: true, strict: false });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message.replace(/^KaTeX parse error:\s*/, "") : "Invalid LaTeX.";
  }
}

/** Render LaTeX to HTML (safe: trust disabled, errors never throw). */
export function renderLatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex ?? "", {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: false,
    });
  } catch {
    return "";
  }
}
