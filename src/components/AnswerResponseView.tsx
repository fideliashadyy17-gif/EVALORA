import { RichContent } from "./RichContent";
import { MathText } from "./MathText";
import { GraphView } from "./graph/GraphView";
import { GeometryView } from "./geometry/GeometryView";
import { StatsView } from "./stats/StatsView";
import { VennView } from "./venn/VennView";
import { ProbabilityTreeView } from "./probability/ProbabilityTreeView";
import { StemLeafView } from "./stem-leaf/StemLeafView";
import { DataTableView } from "./stats/DataTableView";
import type { RichDoc } from "@/lib/content";
import { graphSpecHasWork, normaliseGraphSpec } from "@/lib/graphSpec";
import { geometrySpecHasWork, normaliseGeometrySpec } from "@/lib/geometrySpec";
import { normaliseStatsSpec, statsSpecHasWork } from "@/lib/statsSpec";
import { dataTableHasWork, normaliseDataTableSpec } from "@/lib/dataTableSpec";
import { normaliseVennSpec, vennSpecHasWork, vennSummary } from "@/lib/vennSpec";
import { normaliseProbabilityTreeSpec, probabilityTreeHasWork, probabilityTreeSummary } from "@/lib/probabilityTreeSpec";
import { normaliseStemLeafSpec, stemLeafHasWork, stemLeafSummary } from "@/lib/stemLeafSpec";
import { describeAnswerComponents } from "@/lib/responseTools";

/**
 * Candidate-safe subset of an assess-parts question used by a marker view.
 * The answer key deliberately does not belong here: this component only needs
 * the stable part ids and the labels/prompts that let a teacher read a saved
 * answer map in the same order as the question.
 */
export interface MarkerAssessPart {
  id: string;
  label?: string;
  prompt?: string;
  unit?: string;
  points?: number;
  strand?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function markerParts(raw: readonly MarkerAssessPart[] | null | undefined): MarkerAssessPart[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const parts: MarkerAssessPart[] = [];
  for (const part of raw) {
    if (!part || typeof part.id !== "string") continue;
    const id = part.id.trim().slice(0, 40);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    parts.push({
      id,
      ...(typeof part.label === "string" ? { label: part.label.slice(0, 60) } : {}),
      ...(typeof part.prompt === "string" ? { prompt: part.prompt.slice(0, 2_000) } : {}),
      ...(typeof part.unit === "string" ? { unit: part.unit.slice(0, 40) } : {}),
      ...(typeof part.points === "number" && Number.isFinite(part.points) ? { points: part.points } : {}),
      ...(typeof part.strand === "string" ? { strand: part.strand.slice(0, 24) } : {}),
    });
  }
  return parts;
}

/** Preserve an unexpected saved primitive rather than making it disappear. */
function answerText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return "[unreadable saved value]";
  }
}

/**
 * Per-part working that a candidate chose to show. It is displayed beside the
 * typed answer it belongs to so a marker can credit a correct method even where
 * the typed answer is wrong — and it can never change the automatic part score,
 * because the score is computed from the typed answers only.
 */
function PartWorking({
  partId,
  partLabel,
  payload,
}: {
  partId: string;
  partLabel?: string;
  payload: unknown;
}) {
  if (!isRecord(payload)) return null;
  return (
    <div className="mt-3 rounded-lg border border-evergreen-900/12 bg-cream/50 p-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
        Working shown for part {partLabel ?? partId}
      </p>
      <AnswerResponseView answer={payload} />
    </div>
  );
}

function AssessPartsResponse({
  answerParts,
  working,
  assessParts,
}: {
  answerParts: Record<string, unknown>;
  working: Record<string, unknown>;
  assessParts: readonly MarkerAssessPart[] | null | undefined;
}) {
  const configured = markerParts(assessParts);
  const byId = new Map(configured.map((part) => [part.id, part]));
  // Question order comes first; then retain any answer/working keys from an old
  // question revision. A marker must never lose evidence merely because an
  // author subsequently changed the configuration.
  const ids = [
    ...configured.map((part) => part.id),
    ...Object.keys(answerParts),
    ...Object.keys(working),
  ].filter((id, index, all) => Boolean(id) && all.indexOf(id) === index);

  if (!ids.length) return null;

  return (
    <section className="space-y-3" aria-label="Typed answers by question part">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Typed answers by part</p>
      {ids.map((id) => {
        const part = byId.get(id);
        const label = part?.label?.trim() || `(${id})`;
        const value = answerText(answerParts[id]);
        const savedWorking = working[id];
        return (
          <div key={id} className="rounded-xl border border-evergreen-900/12 bg-white p-3">
            <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
              <span className="font-semibold text-evergreen-950">{label}</span>
              {part?.prompt ? <span className="min-w-0 flex-1 text-sm text-evergreen-950"><MathText text={part.prompt} /></span> : <span className="flex-1" />}
              {part?.strand ? <span className="rounded bg-evergreen-50 px-1.5 py-0.5 text-[10px] font-semibold text-evergreen-800">{part.strand}</span> : null}
              {typeof part?.points === "number" ? <span className="text-[11px] font-medium text-ink-soft">{part.points} mark{part.points === 1 ? "" : "s"}</span> : null}
            </div>
            <div className="mt-2 rounded-md bg-cream/60 px-3 py-2 text-sm">
              <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Typed answer</span>
              {value === null ? (
                <span className="text-ink-soft">(no typed answer)</span>
              ) : (
                <span className="text-evergreen-950"><MathText text={value} /></span>
              )}
              {part?.unit ? <span className="ml-2 text-ink-soft">{part.unit}</span> : null}
            </div>
            <PartWorking partId={id} partLabel={label} payload={savedWorking} />
          </div>
        );
      })}
    </section>
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
  assessParts,
}: {
  answer: Record<string, unknown> | null | undefined;
  className?: string;
  showComponents?: boolean;
  /** Candidate-safe part labels from the question configuration, when known. */
  assessParts?: readonly MarkerAssessPart[] | null;
}) {
  if (!answer || typeof answer !== "object") {
    return <p className={`text-sm text-ink-soft ${className ?? ""}`}>(no saved response)</p>;
  }

  const doc = answer.doc && typeof answer.doc === "object" && (answer.doc as RichDoc).type === "doc"
    ? (answer.doc as RichDoc)
    : null;
  const text = typeof answer.text === "string" ? answer.text : "";
  const scalarValue = answerText(answer.value);
  const graph = answer.graph ? normaliseGraphSpec(answer.graph) : null;
  const geometry = answer.geometry ? normaliseGeometrySpec(answer.geometry) : null;
  const statistics = answer.statistics ? normaliseStatsSpec(answer.statistics) : null;
  const dataTable = answer.data_table ? normaliseDataTableSpec(answer.data_table) : null;
  const venn = answer.venn ? normaliseVennSpec(answer.venn) : null;
  const probabilityTree = answer.probability_tree ? normaliseProbabilityTreeSpec(answer.probability_tree) : null;
  const stemLeaf = answer.stem_leaf ? normaliseStemLeafSpec(answer.stem_leaf) : null;
  const vennWork = venn && vennSpecHasWork(venn);
  const probabilityTreeWork = probabilityTree && probabilityTreeHasWork(probabilityTree);
  const stemLeafWork = stemLeaf && stemLeafHasWork(stemLeaf);
  const statisticsWork = statistics && statsSpecHasWork(statistics);
  const tableWork = dataTable && dataTableHasWork(dataTable);
  const components = describeAnswerComponents(answer);
  const working = isRecord(answer.working) ? answer.working : {};
  // A candidate payload is `{ parts: { a: "…", b: "…" } }`. It is not the
  // authored `config.parts` array. Parsing it as authoring config hid every
  // saved typed answer whenever optional per-part working was present.
  const typedParts = isRecord(answer.parts) ? answer.parts : {};
  const hasPartResponse = Object.keys(typedParts).length > 0 || Object.keys(working).length > 0 || markerParts(assessParts).length > 0;
  const structured = doc || graph || geometry || statistics || dataTable || venn || probabilityTree || stemLeaf ||
    scalarValue !== null || hasPartResponse;

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

      {scalarValue !== null ? (
        <div className="rounded-xl border border-evergreen-900/10 bg-white p-4 text-sm">
          <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Submitted answer</span>
          <MathText text={scalarValue} />
        </div>
      ) : null}

      {hasPartResponse ? <AssessPartsResponse answerParts={typedParts} working={working} assessParts={assessParts} /> : null}

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
      {vennWork && venn && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Venn diagram submitted by the candidate</p>
          <VennView spec={venn} />
          <p className="mt-1 text-xs text-ink-soft">{vennSummary(venn)}</p>
        </div>
      )}
      {probabilityTreeWork && probabilityTree && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Probability tree submitted by the candidate</p>
          <ProbabilityTreeView spec={probabilityTree} />
          <p className="mt-1 text-xs text-ink-soft">{probabilityTreeSummary(probabilityTree)}</p>
        </div>
      )}
      {stemLeafWork && stemLeaf && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Stem-and-leaf diagram submitted by the candidate</p>
          <StemLeafView spec={stemLeaf} />
          <p className="mt-1 text-xs text-ink-soft">{stemLeafSummary(stemLeaf)}</p>
        </div>
      )}

      {!doc && !text.trim() && scalarValue === null && !hasPartResponse && !(graph && graphSpecHasWork(graph)) &&
        !(geometry && geometrySpecHasWork(geometry)) && !statisticsWork && !tableWork && !vennWork && !probabilityTreeWork && !stemLeafWork && (
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
