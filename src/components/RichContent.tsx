import { docIsEmpty, renderLatex, type RichDoc, type RichNode } from "@/lib/content";
import { normaliseGraphSpec } from "@/lib/graphSpec";
import { normaliseGeometrySpec } from "@/lib/geometrySpec";
import { normaliseStatsSpec } from "@/lib/statsSpec";
import { normaliseDataTableSpec } from "@/lib/dataTableSpec";
import { MathText } from "./MathText";
import { GraphView } from "./graph/GraphView";
import { GeometryView } from "./geometry/GeometryView";
import { StatsView } from "./stats/StatsView";
import { DataTableView } from "./stats/DataTableView";

/**
 * Renders structured question content (rich document) identically everywhere:
 * admin previews, quiz play, live competitions, examinations, results and
 * explanations. Falls back to the legacy plain-text + $math$ renderer when a
 * question predates structured content. Server-component safe.
 */
export function RichContent({
  doc,
  text,
  className,
}: {
  doc?: RichDoc | null;
  text?: string | null;
  className?: string;
}) {
  if (doc && !docIsEmpty(doc)) {
    return <div className={`rich-content ${className ?? ""}`}>{renderNodes(doc.content ?? [])}</div>;
  }
  return <MathText text={text ?? ""} className={className} />;
}

function renderNodes(nodes: RichNode[], keyPrefix = ""): React.ReactNode[] {
  return nodes.map((node, i) => renderNode(node, `${keyPrefix}${i}`));
}

function alignStyle(node: RichNode): React.CSSProperties | undefined {
  const align = node.attrs?.textAlign as string | undefined;
  return align ? { textAlign: align as React.CSSProperties["textAlign"] } : undefined;
}

function renderNode(node: RichNode, key: string): React.ReactNode {
  const children = node.content ? renderNodes(node.content, `${key}-`) : null;
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "paragraph":
      return <p key={key} style={alignStyle(node)}>{children}</p>;
    case "heading": {
      const level = Number(node.attrs?.level ?? 2);
      const style = alignStyle(node);
      if (level <= 1) return <h3 key={key} style={style} className="text-xl">{children}</h3>;
      if (level === 2) return <h4 key={key} style={style} className="text-lg">{children}</h4>;
      return <h5 key={key} style={style} className="text-base">{children}</h5>;
    }
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return <ol key={key}>{children}</ol>;
    case "listItem":
      return <li key={key}>{children}</li>;
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "codeBlock":
      return <pre key={key}><code>{children}</code></pre>;
    case "horizontalRule":
      return <hr key={key} />;
    case "hardBreak":
      return <br key={key} />;
    case "mathInline":
      return (
        <span
          key={key}
          className="rich-math-inline"
          dangerouslySetInnerHTML={{ __html: renderLatex(String(node.attrs?.latex ?? ""), false) }}
        />
      );
    case "mathBlock":
      return (
        <div
          key={key}
          className="rich-math-block"
          dangerouslySetInnerHTML={{ __html: renderLatex(String(node.attrs?.latex ?? ""), true) }}
        />
      );
    case "graphBlock":
      return <GraphView key={key} spec={normaliseGraphSpec(node.attrs?.spec)} compact />;
    case "geometryBlock":
      return <GeometryView key={key} spec={normaliseGeometrySpec(node.attrs?.spec)} compact />;
    case "statsBlock":
      return <StatsView key={key} spec={normaliseStatsSpec(node.attrs?.spec)} compact />;
    case "dataTableBlock":
      return <DataTableView key={key} spec={normaliseDataTableSpec(node.attrs?.spec)} compact />;
    case "image": {
      const src = String(node.attrs?.src ?? "");
      if (!src) return null;
      const width = Number(node.attrs?.width ?? 100);
      const alt = String(node.attrs?.alt ?? "");
      const caption = String(node.attrs?.title ?? "");
      return (
        <figure key={key} className="rich-figure" style={{ maxWidth: `${Math.min(Math.max(width, 10), 100)}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} loading="lazy" />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      );
    }
    case "table":
      return (
        <div key={key} className="rich-table-wrap">
          <table><tbody>{children}</tbody></table>
        </div>
      );
    case "tableRow":
      return <tr key={key}>{children}</tr>;
    case "tableHeader":
      return <th key={key} colSpan={Number(node.attrs?.colspan ?? 1)} rowSpan={Number(node.attrs?.rowspan ?? 1)}>{children}</th>;
    case "tableCell":
      return <td key={key} colSpan={Number(node.attrs?.colspan ?? 1)} rowSpan={Number(node.attrs?.rowspan ?? 1)}>{children}</td>;
    default:
      return <span key={key}>{children}</span>;
  }
}

function renderText(node: RichNode, key: string): React.ReactNode {
  let out: React.ReactNode = node.text ?? "";
  const marks = node.marks ?? [];
  // Apply marks inside-out; order is cosmetic for these inline styles.
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        out = <strong>{out}</strong>;
        break;
      case "italic":
        out = <em>{out}</em>;
        break;
      case "underline":
        out = <u>{out}</u>;
        break;
      case "strike":
        out = <s>{out}</s>;
        break;
      case "code":
        out = <code>{out}</code>;
        break;
      case "link": {
        const href = String(mark.attrs?.href ?? "");
        if (/^(https?:|mailto:)/.test(href)) {
          out = (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {out}
            </a>
          );
        }
        break;
      }
      case "textStyle": {
        const style: React.CSSProperties = {};
        if (mark.attrs?.color) style.color = String(mark.attrs.color);
        if (mark.attrs?.fontFamily) style.fontFamily = String(mark.attrs.fontFamily);
        if (mark.attrs?.fontSize) style.fontSize = String(mark.attrs.fontSize);
        if (Object.keys(style).length) out = <span style={style}>{out}</span>;
        break;
      }
      case "highlight": {
        const color = mark.attrs?.color ? String(mark.attrs.color) : undefined;
        out = <mark style={color ? { backgroundColor: color } : undefined}>{out}</mark>;
        break;
      }
      default:
        break;
    }
  }
  return <span key={key}>{out}</span>;
}
