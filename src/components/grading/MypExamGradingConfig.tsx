/**
 * MYP assessment configuration inside the examination's grading card.
 * Server-rendered: group switch via GET (re-renders criteria from the live
 * reference), selection saved through `saveMypExamGrading` as a snapshot.
 * Strands and descriptions come from MYP_SUBJECT_GROUP_REFERENCE — never
 * hardcoded placeholders.
 */

import { Badge, Button, Field, Select } from "@/components/ui";
import { saveMypExamGrading, generateMypRubricFromConfig } from "@/app/dashboard/grading/actions";
import { MYP_SUBJECT_GROUP_REFERENCE } from "@/lib/mypReference";
import { mypReferenceGroup, summarizeMypExamConfig, type MypExamGradingConfig } from "@/lib/mypExamConfig";

export function MypExamGradingConfig({
  examId,
  groupKey,
  savedConfig,
  canEdit,
}: {
  examId: string;
  groupKey: string;
  savedConfig: MypExamGradingConfig | null;
  canEdit: boolean;
}) {
  const group = mypReferenceGroup(groupKey) ?? MYP_SUBJECT_GROUP_REFERENCE[0];
  // Pre-checks apply only when the saved snapshot belongs to the group being
  // viewed — a snapshot for another group must not tick this group's boxes.
  const saved = savedConfig?.subject_group === groupKey ? savedConfig : null;
  const summary = savedConfig ? summarizeMypExamConfig(savedConfig) : null;
  const hasSaved = Boolean(savedConfig);

  return (
    <div className="mt-5 rounded-xl border border-evergreen-700/40 bg-cream/60 p-4" data-testid="myp-grading-config">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-evergreen-900/10 pb-3">
        <div>
          <h3 className="font-display text-base font-semibold text-evergreen-950">
            MYP criteria &amp; strands for this examination
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            Choose the subject group, then select exactly the criteria and strands this paper assesses. Saving stores a
            snapshot on the examination — later reference-library edits never change it.
          </p>
        </div>
        {savedConfig && summary && (
          <div className="flex flex-wrap gap-1.5" data-testid="myp-saved-summary">
            <Badge tone="green">Saved · {summary.label}</Badge>
            <Badge tone="gold">{savedConfig.reference}</Badge>
          </div>
        )}
      </div>

      {/* Subject group switch — GET re-renders the criteria list server-side. */}
      <form method="get" action={`/dashboard/exams/${examId}`} className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="MYP subject group">
          <Select
            name="myp_group"
            defaultValue={group.key}
            className="min-w-64"
            disabled={!canEdit}
            data-testid="myp-group-select"
          >
            {MYP_SUBJECT_GROUP_REFERENCE.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.group}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="outline" className="text-xs" disabled={!canEdit}>
          Open subject group
        </Button>
        <a
          href={group.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center text-xs font-semibold text-evergreen-700 underline underline-offset-2"
        >
          Source: {group.source}
        </a>
      </form>

      <form action={saveMypExamGrading} className="mt-4 space-y-3">
        <input type="hidden" name="exam_id" value={examId} />
        <input type="hidden" name="subject_group" value={group.key} />

        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft" data-testid="myp-group-label">
          {group.group} — select criteria and strands
        </p>

        <div className="space-y-2">
          {group.criteria.map((criterion) => {
            const savedCriterion = saved?.criteria.find((entry) => entry.code === criterion.code);
            const criterionChecked = Boolean(savedCriterion);
            const strandCodes = new Set(savedCriterion?.strands.map((strand) => strand.code) ?? []);
            return (
              <details
                key={criterion.code}
                open={criterionChecked}
                className="rounded-lg border border-evergreen-900/15 bg-white"
                data-testid={`myp-criterion-${criterion.code}`}
              >
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-evergreen-950">
                  Criterion {criterion.code} — {criterion.title}
                  {criterionChecked && (
                    <span className="ml-2 rounded bg-evergreen-100 px-1.5 py-0.5 text-[10px] font-medium text-evergreen-800">
                      selected
                    </span>
                  )}
                </summary>
                <div className="space-y-2 border-t border-evergreen-900/10 px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-evergreen-950">
                    <input
                      type="checkbox"
                      name="myp_criterion"
                      value={criterion.code}
                      defaultChecked={criterionChecked}
                      disabled={!canEdit}
                      className="h-4 w-4 accent-evergreen-700"
                      data-testid={`myp-criterion-check-${criterion.code}`}
                    />
                    Assess Criterion {criterion.code} in this examination
                  </label>
                  <p className="text-[11px] leading-relaxed text-ink">{criterion.description}</p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                      Marks for criterion {criterion.code} (optional)
                      <input
                        type="number"
                        name={`marks_${criterion.code}`}
                        min={0}
                        max={1000}
                        step="0.5"
                        defaultValue={savedCriterion?.marks ?? ""}
                        disabled={!canEdit}
                        className="mt-1 w-full rounded-lg border border-evergreen-900/20 bg-white px-2 py-1.5 text-xs tabular-nums text-ink"
                        data-testid={`myp-marks-${criterion.code}`}
                      />
                    </label>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                      Weight % (optional, between selected criteria)
                      <input
                        type="number"
                        name={`weight_${criterion.code}`}
                        min={0}
                        max={100}
                        step="1"
                        defaultValue={savedCriterion?.weight ?? ""}
                        disabled={!canEdit}
                        className="mt-1 w-full rounded-lg border border-evergreen-900/20 bg-white px-2 py-1.5 text-xs tabular-nums text-ink"
                        data-testid={`myp-weight-${criterion.code}`}
                      />
                    </label>
                  </div>

                  {criterion.strands.length > 0 ? (
                    <ul className="space-y-1.5">
                      {criterion.strands.map((strand) => (
                        <li
                          key={strand.code}
                          className="rounded bg-cream/70 px-2.5 py-2"
                          data-testid={`myp-strand-${strand.code}`}
                        >
                          <label className="flex cursor-pointer items-start gap-2 text-xs text-evergreen-950">
                            <input
                              type="checkbox"
                              name="myp_strand"
                              value={strand.code}
                              defaultChecked={strandCodes.has(strand.code)}
                              disabled={!canEdit}
                              className="mt-0.5 h-4 w-4 accent-evergreen-700"
                              data-testid={`myp-strand-check-${strand.code}`}
                            />
                            <span className="min-w-0">
                              <span className="font-semibold">
                                {strand.code} {strand.title}
                              </span>
                              <span className="mt-0.5 block leading-relaxed text-ink-soft">{strand.description}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] italic text-ink-soft">
                      No strand table published for this criterion — assess at criterion level.
                    </p>
                  )}
                  <p className="text-[10px] uppercase tracking-wide text-ink-soft">{criterion.provenance === "official-subject-brief" ? "Official subject brief" : "Summary of published guide structure"}</p>
                </div>
              </details>
            );
          })}
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" className="text-xs" data-testid="myp-save">
              Save MYP grading configuration
            </Button>
            <span className="text-[11px] text-ink-soft">
              Only the checked criteria and strands become part of this examination&apos;s assessment configuration.
            </span>
          </div>
        )}
      </form>

      {hasSaved && canEdit && (
        <form action={generateMypRubricFromConfig} className="mt-3 flex flex-wrap items-center gap-2 border-t border-evergreen-900/10 pt-3">
          <input type="hidden" name="exam_id" value={examId} />
          <Button type="submit" variant="outline" className="text-xs" data-testid="myp-generate-rubric">
            Build &amp; attach MYP rubric from selection
          </Button>
          <span className="text-[11px] text-ink-soft">
            Creates a draft rubric whose criteria mirror the selected MYP criteria and strands, and associates it with
            this examination for marking.
          </span>
        </form>
      )}
      {!canEdit && (
        <p className="mt-3 text-xs text-ink-soft">Read-only: only owners, administrators and teachers can configure MYP grading.</p>
      )}
    </div>
  );
}
