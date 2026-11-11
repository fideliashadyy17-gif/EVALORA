import { RichContent } from "./RichContent";
import { MathText } from "./MathText";
import { GraphView } from "./graph/GraphView";
import { GeometryView } from "./geometry/GeometryView";
import type { RichDoc } from "@/lib/content";
import { graphSpecHasWork, normaliseGraphSpec } from "@/lib/graphSpec";
import { geometrySpecHasWork, normaliseGeometrySpec } from "@/lib/geometrySpec";
import { describeAnswerComponents } from "@/lib/responseTools";

/**
 * The complete candidate response, as a marker must see it.
 *
 * Structured responses are rendered — never stringified. A legacy plain-text
 * answer still renders exactly as before, and an unreadable payload is shown as
 * a labelled code block rather than silently appearing empty.
 */
export function AnswerResponseView({
  answer,
  className,
  showComponents = false,
}: {
  answer: Record<string, unknown> | null | undefined;
  className?: string;
  showComponents?: boolean;
}) {
  if (!answer || typeof answer !== "object") {
    return <p className={`text-sm text-ink-soft ${className ?? ""}`}>(no saved response)</p>;
  }

  const doc = answer.doc && typeof answer.doc === "object" && (answer.doc as RichDoc).type === "doc"
    ? (answer.doc as RichDoc)
    : null;
  const text = typeof answer.text === "string" ? answer.text : "";
  const graph = answer.graph ? normaliseGraphSpec(answer.graph) : null;
  const geometry = answer.geometry ? normaliseGeometrySpec(answer.geometry) : null;
  const components = describeAnswerComponents(answer);
  const structured = doc || graph || geometry || typeof answer.value === "string" || typeof answer.value === "number";

  return (
    <div className={`answer-response space-y-3 ${className ?? ""}`}>
      {showComponents && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          Response components: {components.join(" · ")}
        </p>
      )}
      {doc ? (
        <div className="rounded-xl border border-evergreen-900/10 bg-white p-4">
          <RichContent doc={doc} />
        </div>
      ) : text.trim() ? (
        <div className="whitespace-pre-wrap rounded-xl border border-evergreen-900/10 bg-white p-4 text-sm leading-relaxed">
          <MathText text={text} />
        </div>
      ) : null}

      {graph && graphSpecHasWork(graph) && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Graph submitted by the candidate</p>
          <GraphView spec={graph} />
        </div>
      )}
      {geometry && geometrySpecHasWork(geometry) && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Geometric construction submitted by the candidate</p>
          <GeometryView spec={geometry} />
        </div>
      )}

      {!doc && !text.trim() && !(graph && graphSpecHasWork(graph)) && !(geometry && geometrySpecHasWork(geometry)) && (
        structured ? (
          <p className="text-sm text-ink-soft">(empty response)</p>
        ) : (
          <pre className="whitespace-pre-wrap rounded-xl border border-evergreen-900/15 bg-white p-4 text-xs">
            {JSON.stringify(answer, null, 2)}
          </pre>
        )
      )}
    </div>
  );
}
