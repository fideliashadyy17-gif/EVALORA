/**
 * Marking-time display of the examination's MYP criteria/strand SNAPSHOT.
 * Reads only `exams.settings.myp_grading` — the historical structure is
 * preserved even when the reference library changes upstream.
 */

import { Badge } from "@/components/ui";
import { snapshotDiffersFromReference, summarizeMypExamConfig, type MypExamGradingConfig } from "@/lib/mypExamConfig";

export function MypMarkingStructure({ config }: { config: MypExamGradingConfig }) {
  const summary = summarizeMypExamConfig(config);
  const drift = snapshotDiffersFromReference(config);
  return (
    <div className="mb-4 rounded-xl border border-evergreen-700/40 bg-cream/60 p-4" data-testid="myp-marking-structure">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold text-evergreen-950">
            MYP assessment structure for this examination
          </h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            {summary.label} · snapshot {config.reference}
            {config.saved_at ? ` · saved ${config.saved_at.slice(0, 10)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="green">Snapshot</Badge>
          {drift && <Badge tone="gold">Reference updated since — snapshot preserved</Badge>}
        </div>
      </div>
      <ol className="mt-3 space-y-2">
        {config.criteria.map((criterion) => (
          <li key={criterion.code} className="rounded-lg border border-evergreen-900/15 bg-white px-3 py-2" data-testid={`myp-marking-criterion-${criterion.code}`}>
            <p className="text-sm font-semibold text-evergreen-950">
              Criterion {criterion.code} — {criterion.title}
              {criterion.marks !== null && <span className="ml-2 text-xs font-normal text-ink-soft">{criterion.marks} marks</span>}
              {criterion.weight !== null && <span className="ml-2 text-xs font-normal text-ink-soft">weight {criterion.weight}%</span>}
            </p>
            {criterion.strands.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {criterion.strands.map((strand) => (
                  <li key={strand.code} className="rounded bg-cream/70 px-2.5 py-1.5 text-xs" data-testid={`myp-marking-strand-${strand.code}`}>
                    <span className="font-semibold text-evergreen-900">
                      {strand.code} {strand.title}
                    </span>
                    <span className="mt-0.5 block leading-relaxed text-ink-soft">{strand.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[11px] italic text-ink-soft">Criterion-level assessment (no strands selected).</p>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-ink-soft">
        Assess candidate evidence against these selected criteria and strands; the attached MYP rubric mirrors this
        structure for criterion-level marks and feedback.
      </p>
    </div>
  );
}
