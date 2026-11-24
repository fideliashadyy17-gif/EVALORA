"use client";

/**
 * Grading systems browser + configurator. Curriculum-specific sections are
 * shown only for the selected family; every stored config is interpreted by
 * src/lib/gradingSystems.ts (pure, unit-tested).
 */

import { useState } from "react";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { saveGradingSystem, archiveGradingSystem } from "@/app/dashboard/grading/actions";
import { Plus, Pencil } from "lucide-react";

const CURRICULA: { value: string; label: string }[] = [
  { value: "beninese", label: "Beninese curriculum (marks / 20, coefficients)" },
  { value: "custom", label: "Custom — percentages, letters, boundaries" },
  { value: "ap", label: "Advanced Placement (College Board structure)" },
  { value: "myp", label: "IB MYP (levels configured in MYP Results)" },
  { value: "cambridge", label: "Cambridge International" },
  { value: "british", label: "British Curriculum" },
];

const DEFAULT_LETTERS = [
  { min: 18, label: "Très Bien" },
  { min: 16, label: "Bien" },
  { min: 14, label: "Assez Bien" },
  { min: 12, label: "Passable" },
  { min: 10, label: "Facultatif" },
  { min: 0, label: "Insuffisant" },
];

const DEFAULT_BOUNDARIES = [
  { min_percent: 80, label: "A" },
  { min_percent: 70, label: "B" },
  { min_percent: 60, label: "C" },
  { min_percent: 50, label: "D" },
  { min_percent: 0, label: "F" },
];

const DEFAULT_AP_SECTIONS = [
  { name: "Section I — Multiple choice", weight_percent: 50 },
  { name: "Section II — Free response", weight_percent: 50 },
];

interface SystemRow {
  id: string;
  name: string;
  curriculum: string;
  subject_id: string | null;
  grade_label: string | null;
  assessment_kind: string;
  config: Record<string, unknown>;
  status: string;
}

export function GradingSystemsClient({
  systems,
  subjects,
  canEdit,
}: {
  systems: Record<string, unknown>[];
  subjects: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const rows = systems as unknown as SystemRow[];
  const [editing, setEditing] = useState<SystemRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [curriculum, setCurriculum] = useState("beninese");

  const open = (row: SystemRow | null) => {
    setEditing(row);
    setCreating(!row);
    setCurriculum(row?.curriculum ?? "beninese");
  };

  const config = (editing?.config ?? {}) as {
    boundaries?: { min_percent: number; label: string }[];
    benin_letters?: { min: number; label: string }[];
    scale_max?: number;
    ap_course?: string;
    ap_sections?: { name: string; weight_percent: number }[];
    ap_score_thresholds?: { score: number; min_percent: number }[];
    pass_percent?: number;
    cambridge_qualification?: string;
    cambridge_level?: string;
    cambridge_components?: { code: string; name: string; weight_percent: number }[];
    cambridge_thresholds?: { min_percent: number; grade: string }[];
  };

  const letters = config.benin_letters?.length ? config.benin_letters : DEFAULT_LETTERS;
  const boundaries = config.boundaries?.length ? config.boundaries : DEFAULT_BOUNDARIES;
  const apSections = config.ap_sections?.length ? config.ap_sections : DEFAULT_AP_SECTIONS;

  return (
    <div className="space-y-5" data-testid="grading-systems">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-evergreen-900/10 pb-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Configured systems</h2>
          <p className="mt-0.5 text-sm text-ink-soft">{rows.length} system(s) · attach one per examination</p>
        </div>
        {canEdit && !editing && (
          <Button type="button" variant="primary" className="text-xs" onClick={() => open(null)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> New grading system
          </Button>
        )}
      </div>

      {rows.length === 0 && !editing && (
        <p className="rounded-lg border border-dashed border-evergreen-900/20 bg-cream/60 px-4 py-6 text-sm text-ink-soft">
          No grading systems yet. Create one — for example a Beninese /20 system with your subject coefficients, or a
          custom letter-grade scheme — then attach it to an examination.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <article key={row.id} className="rounded-xl border border-evergreen-900/15 bg-white p-4" data-testid="grading-system-row">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-evergreen-950">{row.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone="green">{row.curriculum}</Badge>
                  {row.grade_label && <Badge tone="gold">{row.grade_label}</Badge>}
                  <Badge tone={row.status === "active" ? "green" : "gray"}>{row.status}</Badge>
                  <Badge tone="gold">{row.assessment_kind}</Badge>
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-ink-soft hover:bg-cream hover:text-evergreen-900"
                    aria-label={`Edit ${row.name}`}
                    onClick={() => open(row)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <form action={archiveGradingSystem}>
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
                      className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      {row.status === "archived" ? "Restore" : "Archive"}
                    </button>
                  </form>
                </div>
              )}
            </div>
            <div className="mt-2 space-y-1 text-xs text-ink-soft">
              {row.curriculum === "beninese" && (
                <p>
                  Scale /{configOf(row).scale_max ?? 20} ·{" "}
                  {(configOf(row).benin_letters ?? DEFAULT_LETTERS).length} letter rules (org-configurable)
                </p>
              )}
              {row.curriculum === "custom" && <p>{(configOf(row).boundaries ?? DEFAULT_BOUNDARIES).length} boundary rules</p>}
              {row.curriculum === "ap" && (
                <p>
                  {configOf(row).ap_course || "AP course"} ·{" "}
                  {(configOf(row).ap_sections ?? []).map((s) => s.name).join(" + ") || "no sections"}
                </p>
              )}
              {row.curriculum === "myp" && <p>Conversion data configured in MYP Results → Settings</p>}
            </div>
          </article>
        ))}
      </div>

      {editing !== null || creating ? (
        <div className="rounded-xl border border-evergreen-700/40 bg-cream/70 p-4" data-testid="grading-system-editor">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-evergreen-950">
              {creating ? "New grading system" : `Edit ${editing?.name ?? ""}`}
            </h3>
            <Button type="button" variant="outline" className="text-xs" onClick={() => { setEditing(null); setCreating(false); }}>
              Cancel
            </Button>
          </div>
          <form action={saveGradingSystem} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input name="name" required defaultValue={editing?.name ?? ""} maxLength={160} placeholder="Grade 10 — Beninese /20" />
              </Field>
              <Field label="Curriculum family">
                {/* Always enabled: a disabled select submits nothing, which
                    made every edit-save fail server-side validation. */}
                <Select
                  name="curriculum"
                  value={curriculum}
                  onChange={(e) => setCurriculum(e.target.value)}
                  data-testid="grading-curriculum-select"
                >
                  {CURRICULA.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Subject (optional)">
                <Select name="subject_id" defaultValue={editing?.subject_id ?? ""}>
                  <option value="">Any subject</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Grade / class (optional)">
                <Input name="grade_label" defaultValue={editing?.grade_label ?? ""} maxLength={80} placeholder="MYP4" />
              </Field>
              <Field label="Applies to">
                <Select name="assessment_kind" defaultValue={editing?.assessment_kind ?? "any"}>
                  <option value="any">Examinations and quizzes</option>
                  <option value="exam">Examinations only</option>
                  <option value="quiz">Quizzes only</option>
                </Select>
              </Field>
              <Field label="Pass mark (%)">
                <Input name="pass_percent" type="number" min={0} max={100} defaultValue={String(config.pass_percent ?? 50)} />
              </Field>
            </div>

            {curriculum === "beninese" && (
              <div className="rounded-lg border border-evergreen-900/15 bg-white p-3">
                <p className="mb-2 text-sm font-semibold text-evergreen-950">Beninese /20 rules</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Scale maximum">
                    <Input name="scale_max" type="number" min={1} max={100} defaultValue={String(config.scale_max ?? 20)} />
                  </Field>
                </div>
                <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Letter thresholds (minimum mark out of {config.scale_max ?? 20}) — edit to match your institution
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {letters.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        name="benin_min"
                        type="number"
                        defaultValue={String(rule.min)}
                        className="w-20"
                        aria-label={`Letter ${i + 1} minimum`}
                      />
                      <Input
                        name="benin_label"
                        defaultValue={rule.label}
                        aria-label={`Letter ${i + 1} label`}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-ink-soft">
                  Defaults follow the common francophone Bénin convention; they are YOUR configuration, not a ministry
                  directive. Coefficients are applied per assessment when marking weighted averages.
                </p>
              </div>
            )}

            {curriculum === "custom" && (
              <div className="rounded-lg border border-evergreen-900/15 bg-white p-3">
                <p className="mb-2 text-sm font-semibold text-evergreen-950">Percentage boundaries</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {boundaries.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        name="boundary_min"
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={String(rule.min_percent)}
                        className="w-20"
                        aria-label={`Boundary ${i + 1} minimum percent`}
                      />
                      <Input
                        name="boundary_label"
                        defaultValue={rule.label}
                        aria-label={`Boundary ${i + 1} label`}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-ink-soft">
                  The highest threshold at or below the achieved percent wins. Add rows by editing the defaults to your
                  institution&apos;s ranges.
                </p>
              </div>
            )}

            {curriculum === "ap" && (
              <div className="rounded-lg border border-evergreen-900/15 bg-white p-3">
                <p className="mb-2 text-sm font-semibold text-evergreen-950">
                  AP course structure (College Board CED)
                </p>
                <Field label="Course code / name">
                  <Input name="ap_course" defaultValue={config.ap_course ?? ""} maxLength={80} placeholder="AP Calculus AB" />
                </Field>
                <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Sections &amp; weights (%)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {apSections.map((section, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        name="ap_section_name"
                        defaultValue={section.name}
                        aria-label={`Section ${i + 1} name`}
                      />
                      <Input
                        name="ap_section_weight"
                        type="number"
                        min={1}
                        max={100}
                        defaultValue={String(section.weight_percent)}
                        className="w-20"
                        aria-label={`Section ${i + 1} weight`}
                      />
                    </div>
                  ))}
                </div>
                <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Optional score thresholds (percent → 1–5)
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[5, 4, 3, 2, 1].map((score) => {
                    const existing = config.ap_score_thresholds?.find((t) => t.score === score);
                    return (
                      <div key={score} className="flex items-center gap-2">
                        <Input
                          name="ap_score"
                          type="number"
                          min={1}
                          max={5}
                          defaultValue={String(score)}
                          className="w-16"
                          aria-label={`Score ${score}`}
                          readOnly
                        />
                        <Input
                          name="ap_threshold"
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={existing ? String(existing.min_percent) : ""}
                          placeholder={`min % for ${score}`}
                          aria-label={`Minimum percent for score ${score}`}
                        />
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-ink-soft">
                  AP 1–5 cut points are set annually by College Board through equating and are never invented here —
                  leave thresholds empty to report percent only, or enter the values your institution has been given.
                  Section weightings follow the course&apos;s published Course and Exam Description.
                </p>
              </div>
            )}

            {curriculum === "cambridge" && (
              <div className="rounded-lg border border-evergreen-900/15 bg-white p-3">
                <p className="mb-2 text-sm font-semibold text-evergreen-950">Cambridge qualification structure</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Qualification (e.g. IGCSE, AS Level)">
                    <Input name="cambridge_qualification" defaultValue={config.cambridge_qualification ?? ""} maxLength={120} placeholder="Cambridge IGCSE" />
                  </Field>
                  <Field label="Level / cohort (optional)">
                    <Input name="cambridge_level" defaultValue={config.cambridge_level ?? ""} maxLength={80} placeholder="Grade 10" />
                  </Field>
                </div>
                <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Assessment components &amp; weighting (%)</p>
                <div className="grid gap-2">
                  {(config.cambridge_components?.length
                    ? config.cambridge_components
                    : [{ code: "", name: "", weight_percent: 100 }]
                  ).map((component, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <Input name="cambridge_component_code" defaultValue={component.code} className="w-24" placeholder="Paper 1" aria-label={`Component ${i + 1} code`} />
                      <Input name="cambridge_component_name" defaultValue={component.name} className="w-56" placeholder="Multiple choice" aria-label={`Component ${i + 1} name`} />
                      <Input name="cambridge_component_weight" type="number" min={1} max={100} defaultValue={String(component.weight_percent)} className="w-20" aria-label={`Component ${i + 1} weight`} />
                    </div>
                  ))}
                </div>
                <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Grade thresholds — minimum percent per grade (your institution&apos;s configuration)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(config.cambridge_thresholds?.length
                    ? config.cambridge_thresholds
                    : [
                        { min_percent: 80, grade: "A*" },
                        { min_percent: 70, grade: "A" },
                        { min_percent: 60, grade: "B" },
                        { min_percent: 50, grade: "C" },
                        { min_percent: 40, grade: "D" },
                        { min_percent: 0, grade: "E" },
                      ]
                  ).map((threshold, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input name="cambridge_min" type="number" min={0} max={100} defaultValue={String(threshold.min_percent)} className="w-20" aria-label={`Threshold ${i + 1} minimum percent`} />
                      <Input name="cambridge_grade" defaultValue={threshold.grade} aria-label={`Threshold ${i + 1} grade`} />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-ink-soft">
                  These thresholds and weightings are YOUR institution&apos;s configuration — EVALORA does not fabricate
                  official Cambridge grade boundaries or assessment rules. Raw marks are reported alongside the grade.
                </p>
              </div>
            )}

            {(curriculum === "myp" || curriculum === "british") && (
              <p className="rounded-lg bg-white px-3 py-2 text-xs text-ink-soft">
                {curriculum === "myp"
                  ? "MYP achievement levels (0–8) and 1–7 boundaries are configured per subject in MYP Results → Settings. This system acts as the selectable pointer for examinations."
                  : "British systems store your institution's own boundaries and weighting rules using the custom rule engine."}
              </p>
            )}

            <Button type="submit" variant="primary" className="text-xs">
              Save grading system
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function configOf(row: SystemRow): {
  scale_max?: number;
  benin_letters?: { min: number; label: string }[];
  boundaries?: { min_percent: number; label: string }[];
  ap_course?: string;
  ap_sections?: { name: string; weight_percent: number }[];
} {
  return (row.config ?? {}) as ReturnType<typeof configOf>;
}
