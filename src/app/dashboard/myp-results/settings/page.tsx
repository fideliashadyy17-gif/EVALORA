import { Badge, Button, ButtonLink, Card, PageTitle, Select } from "@/components/ui";
import { isMypLearner, mypAccess } from "@/lib/mypAccess";
import { MYP_CRITERION_PRESETS, presetForSubject } from "@/lib/myp";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { applyMypCriteriaPreset, removeMypCriterion, saveMypBoundaries, saveMypFramework } from "../actions";

export const metadata: Metadata = { title: "MYP grading settings" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  framework: "Aggregation rule saved. Reports recalculate from the stored configuration immediately.",
  boundaries: "Criterion-level conversion and overall grade boundaries saved for this subject.",
  preset: "Official MYP criteria added for this subject, with a default percentage-to-level conversion.",
  criterion_removed: "Criterion removed.",
  level: "Every level needs a percentage between 0 and 100.",
  level_order: "The percentage required for each level must rise with the level.",
  grade: "Every grade band needs a valid total range.",
  grade_overlap: "Grade bands must not overlap or touch each other.",
  grade_save: "The grade boundaries could not be saved.",
  level_save: "The criterion-level conversion could not be saved.",
  subject: "That subject is not in this organization.",
  preset_save: "The criteria could not be saved.",
  criterion: "That criterion could not be removed.",
  criterion_used: "This criterion is already used by questions on a paper, so it can be renamed but not removed.",
  criterion_delete: "The criterion could not be removed.",
};

const DEFAULT_LEVELS = [0, 1, 20, 35, 50, 65, 75, 85, 95];
const DEFAULT_GRADES = [
  [0, 5, 1],
  [6, 9, 2],
  [10, 14, 3],
  [15, 18, 4],
  [19, 23, 5],
  [24, 27, 6],
  [28, 32, 7],
] as const;

interface SubjectRow {
  id: string;
  name: string;
  code: string | null;
}

interface CriterionRow {
  id: string;
  subject_id: string;
  code: string;
  title: string;
  description: string | null;
  position: number;
}

export default async function MypGradingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; ok?: string; e?: string }>;
}) {
  const access = await mypAccess();
  if (!access.org) redirect("/dashboard");
  if (isMypLearner(access.org.role)) redirect("/student");
  if (!access.organizationIds.length) redirect("/dashboard");
  const { subject: requestedSubject, ok, e } = await searchParams;

  const supabase = await createClient();
  const [{ data: subjectsData }, { data: criteriaData }, { data: frameworkData }] = await Promise.all([
    supabase.from("subjects").select("id, name, code").eq("organization_id", access.org.id).order("sort").order("name"),
    supabase
      .from("myp_criteria")
      .select("id, subject_id, code, title, description, position")
      .eq("organization_id", access.org.id)
      .order("position"),
    supabase
      .from("myp_framework_config")
      .select("require_all_criteria, criteria_max_level, note")
      .eq("organization_id", access.org.id)
      .maybeSingle(),
  ]);

  const subjects = (subjectsData ?? []) as SubjectRow[];
  const allCriteria = (criteriaData ?? []) as CriterionRow[];
  const criteriedSubjectIds = new Set(allCriteria.map((row) => row.subject_id));
  const selected =
    subjects.find((row) => row.id === requestedSubject) ??
    subjects.find((row) => criteriedSubjectIds.has(row.id)) ??
    subjects[0];

  const criteria = selected ? allCriteria.filter((row) => row.subject_id === selected.id) : [];

  const [{ data: levelsData }, { data: gradesData }] = selected
    ? await Promise.all([
        supabase
          .from("myp_level_boundaries")
          .select("level, min_percent")
          .eq("organization_id", access.org.id)
          .eq("subject_id", selected.id)
          .order("level"),
        supabase
          .from("myp_grade_boundaries")
          .select("min_total, max_total, grade, subject_id")
          .eq("organization_id", access.org.id)
          .in("subject_id", [selected.id])
          .order("min_total"),
      ])
    : [{ data: null }, { data: null }];

  const storedLevels = new Map(
    ((levelsData ?? []) as { level: number; min_percent: number }[]).map((row) => [row.level, Number(row.min_percent)]),
  );
  const storedGrades = new Map(
    ((gradesData ?? []) as { min_total: number; max_total: number; grade: number }[]).map((row) => [
      String(row.grade),
      row,
    ]),
  );
  const suggestedPreset = presetForSubject(selected?.name ?? "");
  const canManage = access.canManage;

  return (
    <>
      <PageTitle
        eyebrow="Assessment · MYP grading"
        title="MYP grading configuration"
        subtitle={`Criteria, achievement-level conversion and overall 1–7 boundaries for ${access.org.name}. Configuration is data: every screen, PDF and workbook reads these stored values.`}
        action={<ButtonLink href="/dashboard/myp-results" variant="outline">← MYP results</ButtonLink>}
      />

      {(ok || e) && (
        <div className={`mb-5 rounded-xl px-4 py-3 text-sm ${ok ? "bg-evergreen-50 text-evergreen-900" : "bg-red-50 text-red-800"}`}>
          {ok ? MESSAGES[ok] ?? "Saved." : MESSAGES[e ?? ""] ?? "That action could not be completed."}
        </div>
      )}

      {!canManage && (
        <div className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You can review the configuration but only an organization owner or administrator can change it.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Aggregation rule</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            This governs when an overall MYP grade may be calculated. The default requires every required criterion to be
            marked. Allowing a provisional grade aggregates only the criteria that are fully marked and labels the result
            provisional — it never treats an unmarked criterion as zero.
          </p>
          <form action={saveMypFramework} className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">When is an overall grade calculated?</span>
              <Select name="require_all_criteria" defaultValue={String(frameworkData?.require_all_criteria ?? true)} className="text-xs">
                <option value="true">Only when every required criterion is fully marked (recommended)</option>
                <option value="false">Also aggregate fully marked criteria, as a provisional grade</option>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Maximum achievement level per criterion</span>
              <Select name="criteria_max_level" defaultValue={String(frameworkData?.criteria_max_level ?? 8)} className="text-xs">
                <option value="8">8 (IB MYP standard)</option>
                <option value="7">7 (school configuration)</option>
                <option value="6">6 (school configuration)</option>
              </Select>
            </label>
            <Button type="submit" className="text-xs" disabled={!canManage}>Save aggregation rule</Button>
            {frameworkData?.note && <p className="text-[11px] text-ink-soft">{frameworkData.note}</p>}
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Subject criteria</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Criteria are configured per subject. Mathematics&apos; A–D is never assumed for another subject: choose the
            subject&apos;s official subject-group criteria from the presets.
          </p>
          <form method="get" action="/dashboard/myp-results/settings" className="mt-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Subject</span>
              <Select name="subject" defaultValue={selected?.id ?? ""} className="text-xs">
                {subjects.length === 0 && <option value="">No subjects configured</option>}
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                    {criteriedSubjectIds.has(subject.id) ? " — configured" : ""}
                  </option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="outline" className="mt-2 text-xs">Show subject</Button>
          </form>

          {selected && (
            <div className="mt-4 space-y-3">
              {criteria.length === 0 ? (
                <p className="rounded-lg border border-dashed border-evergreen-900/30 px-3 py-3 text-xs text-ink-soft">
                  No criteria configured for {selected.name}. Reports currently show the criterion letters found on the paper
                  without official titles. Add the subject&apos;s criteria below.
                </p>
              ) : (
                <ul className="space-y-2">
                  {criteria.map((criterion) => (
                    <li key={criterion.id} className="rounded-lg border border-evergreen-900/15 bg-white px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-evergreen-950">
                            Criterion {criterion.code} — {criterion.title}
                          </p>
                          {criterion.description && <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{criterion.description}</p>}
                        </div>
                        {canManage && (
                          <form action={removeMypCriterion}>
                            <input type="hidden" name="subject_id" value={selected.id} />
                            <input type="hidden" name="criterion_id" value={criterion.id} />
                            <button type="submit" className="text-[11px] font-semibold text-red-700 underline underline-offset-2">
                              Remove
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {canManage && (
                <form action={applyMypCriteriaPreset} className="rounded-lg border border-evergreen-900/15 bg-cream p-3">
                  <input type="hidden" name="subject_id" value={selected.id} />
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                      Apply official criteria (adds or updates A–D)
                    </span>
                    <Select name="preset" defaultValue={suggestedPreset?.key ?? ""} className="text-xs">
                      <option value="">Choose a subject group…</option>
                      {MYP_CRITERION_PRESETS.map((preset) => (
                        <option key={preset.key} value={preset.key}>
                          {preset.label}
                          {suggestedPreset?.key === preset.key ? " (suggested for this subject)" : ""}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button type="submit" className="mt-2 text-xs">Apply criteria</Button>
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
                    Titles and descriptions come from the published IB MYP subject briefs. They can be edited afterwards by
                    re-applying a preset; marks already recorded are never changed by a configuration edit.
                  </p>
                </form>
              )}
            </div>
          )}
        </Card>
      </div>

      {selected && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-semibold text-evergreen-950">Percentage → achievement level</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  The minimum percentage of a criterion&apos;s marks that earns each level. A fully marked criterion that
                  earns nothing is level 0; a criterion with no questions is never converted to level 0.
                </p>
              </div>
              <Badge tone="gold">{selected.name}</Badge>
            </div>
            <form action={saveMypBoundaries} className="mt-4">
              <input type="hidden" name="subject_id" value={selected.id} />
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((level) => (
                  <label key={level} className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Level {level} ≥</span>
                    <input
                      type="number"
                      name={`level_${level}`}
                      min={0}
                      max={100}
                      step="0.5"
                      defaultValue={storedLevels.get(level) ?? DEFAULT_LEVELS[level]}
                      className="w-full rounded-lg border border-evergreen-900/20 bg-white px-2 py-1.5 text-xs tabular-nums text-ink outline-none focus:border-evergreen-600"
                      disabled={!canManage}
                    />
                  </label>
                ))}
              </div>

              <h3 className="mt-5 text-sm font-semibold text-evergreen-950">Overall grade boundaries (total criterion levels)</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                Defaults are the published IB MYP boundaries for four criteria of eight: 0–5 → 1, 6–9 → 2, 10–14 → 3,
                15–18 → 4, 19–23 → 5, 24–27 → 6, 28–32 → 7.
              </p>
              <div className="mt-2 space-y-2">
                {[1, 2, 3, 4, 5, 6, 7].map((grade) => {
                  const stored = storedGrades.get(String(grade));
                  const fallback = DEFAULT_GRADES.find((row) => row[2] === grade) ?? [0, 0, grade];
                  return (
                    <div key={grade} className="flex items-center gap-2">
                      <span className="w-16 text-[11px] font-semibold text-evergreen-900">Grade {grade}</span>
                      <label className="flex items-center gap-1 text-[11px] text-ink-soft">
                        from
                        <input
                          type="number"
                          name={`grade_${grade}_min`}
                          min={0}
                          max={64}
                          defaultValue={stored ? Number(stored.min_total) : fallback[0]}
                          className="w-16 rounded border border-evergreen-900/20 bg-white px-2 py-1 text-xs tabular-nums text-ink"
                          disabled={!canManage}
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-ink-soft">
                        to
                        <input
                          type="number"
                          name={`grade_${grade}_max`}
                          min={0}
                          max={64}
                          defaultValue={stored ? Number(stored.max_total) : fallback[1]}
                          className="w-16 rounded border border-evergreen-900/20 bg-white px-2 py-1 text-xs tabular-nums text-ink"
                          disabled={!canManage}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
              <Button type="submit" className="mt-4 text-xs" disabled={!canManage}>Save boundaries for {selected.name}</Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">How the configured values are used</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-xs leading-relaxed text-ink">
              <li>A question&apos;s criterion comes from the paper itself (<code>questions.config.myp_criterion</code>); the subject&apos;s configured criteria provide the official title and order.</li>
              <li>Marks are summed per criterion from the authoritative marked answers. A question the candidate left blank on a submitted paper counts as zero out of its value; an unmarked question stays pending.</li>
              <li>The criterion percentage is converted to an achievement level 0–8 using the boundaries above.</li>
              <li>The levels of the required criteria are summed and mapped through the grade boundaries to the overall grade 1–7. The raw examination percentage is never converted directly.</li>
              <li>Every report names the boundary set it used, and configuration changes never rewrite an archived snapshot.</li>
            </ul>
            <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
              Historical note: a moderated or regraded mark changes the live figure immediately because results are
              recomputed from the answer rows; use “Archive current result” on a student result to preserve a snapshot of
              the state at publication or after moderation.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
