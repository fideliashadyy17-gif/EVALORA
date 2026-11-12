import { RichContent } from "./RichContent";
import { MathText } from "./MathText";
import { GraphView } from "./graph/GraphView";
import { GeometryView } from "./geometry/GeometryView";
import { StatsView } from "./stats/StatsView";
import { DataTableView } from "./stats/DataTableView";
import type { RichDoc } from "@/lib/content";
import { graphSpecHasWork, normaliseGraphSpec } from "@/lib/graphSpec";
import { geometrySpecHasWork, normaliseGeometrySpec } from "@/lib/geometrySpec";
import { normaliseStatsSpec, statsSpecHasWork } from "@/lib/statsSpec";
import { dataTableHasWork, normaliseDataTableSpec } from "@/lib/dataTableSpec";
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
  /** Assess Prep per-part answers `{ parts: { id: string } }`, rendered as a
      labelled list (through MathText) instead of falling back to raw JSON. */
  const partEntries = answer.parts && typeof answer.parts === "object" && !Array.isArray(answer.parts)
    ? Object.entries(answer.parts as Record<string, unknown>).filter(([, v]) => typeof v === "string" && (v as string).trim())
    : [];
  const graph = answer.graph ? normaliseGraphSpec(answer.graph) : null;
  const geometry = answer.geometry ? normaliseGeometrySpec(answer.geometry) : null;
  const statistics = answer.statistics ? normaliseStatsSpec(answer.statistics) : null;
  const dataTable = answer.data_table ? normaliseDataTableSpec(answer.data_table) : null;
  const statisticsWork = statistics && statsSpecHasWork(statistics);
  const tableWork = dataTable && dataTableHasWork(dataTable);
  const components = describeAnswerComponents(answer);
  const structured = doc || graph || geometry || statistics || dataTable ||
    typeof answer.value === "string" || typeof answer.value === "number";

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

      {!doc && !text.trim() && partEntries.length > 0 && (
        <div className="rounded-xl border border-evergreen-900/10 bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Answer per part</p>
          <dl className="space-y-1.5">
            {partEntries.map(([id, value], index) => (
              <div key={id} className="flex items-baseline gap-2 text-sm">
                <dt className="shrink-0 font-semibold text-evergreen-900">Part {index + 1}</dt>
                <dd className="min-w-0 flex-1 whitespace-pre-wrap leading-relaxed">
                  <MathText text={String(value)} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

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
      {statisticsWork && statistics && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Statistics chart submitted by the candidate</p>
          <StatsView spec={statistics} showTable />
        </div>
      )}
      {tableWork && dataTable && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Data table submitted by the candidate</p>
          <DataTableView spec={dataTable} />
        </div>
      )}

      {!doc && !text.trim() && partEntries.length === 0 && !(graph && graphSpecHasWork(graph)) && !(geometry && geometrySpecHasWork(geometry)) &&
        !statisticsWork && !tableWork && (
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
