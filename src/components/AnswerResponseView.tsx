import { RichContent } from "./RichContent";
import { MathText } from "./MathText";
import { GraphView } from "./graph/GraphView";
import { GeometryView } from "./geometry/GeometryView";
import { StatsView } from "./stats/StatsView";
import { VennView } from "./venn/VennView";
import { DataTableView } from "./stats/DataTableView";
import type { RichDoc } from "@/lib/content";
import { graphSpecHasWork, normaliseGraphSpec } from "@/lib/graphSpec";
import { geometrySpecHasWork, normaliseGeometrySpec } from "@/lib/geometrySpec";
import { normaliseStatsSpec, statsSpecHasWork } from "@/lib/statsSpec";
import { dataTableHasWork, normaliseDataTableSpec } from "@/lib/dataTableSpec";
import { normaliseVennSpec, vennSpecHasWork, vennSummary } from "@/lib/vennSpec";
import { describeAnswerComponents } from "@/lib/responseTools";
import { assessPartsFromConfig } from "@/lib/assessParts";

/**
 * Per-part working that a candidate chose to show. It is displayed beside the
 * part it belongs to so a marker can credit a correct method even where the
 * typed answer is wrong — and it can never change the automatic part score,
 * because the score is computed from the typed answers only.
 */
function PartWorking({ partId, payload }: { partId: string; payload: unknown }) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return (
    <div className="rounded-lg border border-evergreen-900/12 bg-cream/50 p-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Working shown for part {partId}</p>
      <AnswerResponseView answer={payload as Record<string, unknown>} />
    </div>
  );
}

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
  const statistics = answer.statistics ? normaliseStatsSpec(answer.statistics) : null;
  const dataTable = answer.data_table ? normaliseDataTableSpec(answer.data_table) : null;
  const venn = answer.venn ? normaliseVennSpec(answer.venn) : null;
  const vennWork = venn && vennSpecHasWork(venn);
  const statisticsWork = statistics && statsSpecHasWork(statistics);
  const tableWork = dataTable && dataTableHasWork(dataTable);
  const components = describeAnswerComponents(answer);
  const working = answer.working && typeof answer.working === "object" && !Array.isArray(answer.working)
    ? (answer.working as Record<string, unknown>) : {};
  const assessParts = Array.isArray((answer as { parts?: unknown }).parts)
    ? assessPartsFromConfig({ parts: (answer as { parts?: unknown }).parts })
    : [];
  const structured = doc || graph || geometry || statistics || dataTable || venn ||
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
      {Object.keys(working).length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Working shown by the candidate</p>
          {Object.entries(working).map(([partId, payload]) => (
            <PartWorking key={partId} partId={partId} payload={payload} />
          ))}
        </div>
      ) : null}
      {vennWork && venn && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Venn diagram submitted by the candidate</p>
          <VennView spec={venn} />
          <p className="mt-1 text-xs text-ink-soft">{vennSummary(venn)}</p>
        </div>
      )}

      {!doc && !text.trim() && !(graph && graphSpecHasWork(graph)) && !(geometry && geometrySpecHasWork(geometry)) &&
        !statisticsWork && !tableWork && !vennWork && !assessParts.length && !Object.keys(working).length && (
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
