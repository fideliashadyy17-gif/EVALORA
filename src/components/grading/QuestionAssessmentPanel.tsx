"use client";

/**
 * Question-level Assessment mapping panel (Paper Builder).
 *
 * Sits inside each selected question's row, clearly separated from
 * content / answer key / marks / section. The panel ADAPTS to the chosen
 * framework: IB MYP exposes the real reference subject group → criteria →
 * strands (titles + descriptions from MYP_SUBJECT_GROUP_REFERENCE, never
 * invented); other frameworks expose organisation-owned assessment
 * elements (AP sections, objectives, competency tags…). Every change is
 * emitted as a validated assessment SNAPSHOT (titles copied in), so later
 * reference edits never rewrite a saved paper.
 */

import { useMemo, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { Plus, Trash2, X } from "lucide-react";
import {
  GRADING_CURRICULA,
  type GradingCurriculum,
} from "@/lib/gradingSystems";
import { MYP_REFERENCE_GAPS } from "@/lib/mypReference";
import {
  buildMypExamConfigFromForm,
  mypReferenceGroup,
  type FormLike,
  type MypExamGradingConfig,
} from "@/lib/mypExamConfig";
import {
  buildQuestionAssessment,
  mypSubjectGroups,
  type QuestionAssessment,
  type QuestionAssessmentElement,
} from "@/lib/questionAssessment";

export interface GradingSystemOption {
  id: string;
  name: string;
  curriculum: string;
  config?: Record<string, unknown>;
}

const CURRICULA_LABELS: Record<string, string> = {
  myp: "IB MYP (criteria & strands)",
  ap: "Advanced Placement",
  beninese: "Beninese curriculum (/20)",
  custom: "Custom — percentages / letters",
  cambridge: "Cambridge International",
  british: "British Curriculum",
};

interface MypPanelState {
  groupKey: string;
  criteria: string[];
  strands: string[];
  marks: Record<string, string>;
  weights: Record<string, string>;
}

function stateFromSnapshot(myp: MypExamGradingConfig | undefined, fallbackGroup: string): MypPanelState {
  if (!myp) {
    return { groupKey: fallbackGroup, criteria: [], strands: [], marks: {}, weights: {} };
  }
  return {
    groupKey: myp.subject_group,
    criteria: myp.criteria.map((c) => c.code),
    strands: myp.criteria.flatMap((c) => c.strands.map((s) => s.code)),
    marks: Object.fromEntries(myp.criteria.filter((c) => c.marks != null).map((c) => [c.code, String(c.marks)])),
    weights: Object.fromEntries(myp.criteria.filter((c) => c.weight != null).map((c) => [c.code, String(c.weight)])),
  };
}

function mypFormLike(state: MypPanelState): FormLike {
  const fields: Record<string, string[]> = {
    myp_criterion: state.criteria,
    myp_strand: state.strands,
  };
  for (const [code, value] of Object.entries(state.marks)) {
    if (value !== "") fields[`marks_${code}`] = [value];
  }
  for (const [code, value] of Object.entries(state.weights)) {
    if (value !== "") fields[`weight_${code}`] = [value];
  }
  return {
    getAll: (key) => fields[key] ?? [],
    get: (key) => (fields[key] ?? [])[0] ?? null,
  };
}

/** saved_at is metadata, not content: touching a panel without changing
 *  it must never look like a real change (attempt-locked papers). */
function sameContent(a: QuestionAssessment | null, b: QuestionAssessment): boolean {
  if (!a) return false;
  const strip = (x: QuestionAssessment) => JSON.stringify({ ...x, saved_at: "" });
  return strip(a) === strip(b);
}

export function QuestionAssessmentPanel({
  value,
  onChange,
  gradingSystems,
  testId,
  questionLabel,
}: {
  value: QuestionAssessment | null;
  onChange: (next: QuestionAssessment | null) => void;
  gradingSystems: GradingSystemOption[];
  testId: string;
  questionLabel: string;
}) {
  const [curriculum, setCurriculum] = useState<string>(value?.curriculum ?? "");
  const [systemId, setSystemId] = useState<string>(value?.grading_system_id ?? "");
  const [myp, setMyp] = useState<MypPanelState>(() => stateFromSnapshot(value?.myp, "mathematics"));
  const [elements, setElements] = useState<QuestionAssessmentElement[]>(
    () => value?.elements ?? [],
  );

  const group = curriculum === "myp" ? mypReferenceGroup(myp.groupKey) : null;
  const systemsForCurriculum = useMemo(
    () => gradingSystems.filter((s) => s.curriculum === curriculum),
    [gradingSystems, curriculum],
  );

  function emit(next: QuestionAssessment | null) {
    if (next && sameContent(value, next)) return;
    onChange(next ? { ...next, saved_at: new Date().toISOString() } : null);
  }

  function emitMyp(next: MypPanelState) {
    setMyp(next);
    const result = buildMypExamConfigFromForm(mypFormLike(next), next.groupKey);
    if (!result.ok) return; // state only ever holds reference-valid codes
    emit(
      buildQuestionAssessment({
        curriculum: "myp",
        gradingSystemId: systemId || null,
        myp: result.config,
      }),
    );
  }

  function emitElements(next: QuestionAssessmentElement[]) {
    setElements(next);
    if (curriculum && curriculum !== "myp") {
      emit(
        buildQuestionAssessment({
          curriculum: curriculum as GradingCurriculum,
          gradingSystemId: systemId || null,
          elements: next,
        }),
      );
    }
  }

  function switchCurriculum(next: string) {
    setCurriculum(next);
    setSystemId("");
    if (!next) {
      emit(null);
      return;
    }
    if (next === "myp") {
      const result = buildMypExamConfigFromForm(mypFormLike(myp), myp.groupKey);
      if (result.ok) {
        emit(buildQuestionAssessment({ curriculum: "myp", gradingSystemId: null, myp: result.config }));
      } else {
        // No valid MYP selection yet — record the framework choice with an
        // empty criteria set is NOT valid; keep framework pending until the
        // teacher picks a criterion (panel shows the MYP UI either way).
        emit(null);
      }
      return;
    }
    emit(
      buildQuestionAssessment({
        curriculum: next as GradingCurriculum,
        gradingSystemId: null,
        elements: elements.length ? elements : [],
      }),
    );
  }

  const activeSystem = gradingSystems.find((s) => s.id === systemId) ?? null;

  return (
    <details className="mt-2 rounded-lg border border-evergreen-700/30 bg-white/70" data-testid={testId}>
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-evergreen-900">
        Assessment mapping{value ? ` · ${value.curriculum === "myp" ? `IB MYP${value.myp ? ` · ${value.myp.subject_group_label}` : ""}` : value.curriculum.toUpperCase()}` : " · not mapped"}
      </summary>
      <div className="space-y-3 border-t border-evergreen-900/10 px-3 py-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Grading framework for ${questionLabel}`}>
            <Select
              name="assessment_curriculum"
              value={curriculum}
              onChange={(e) => switchCurriculum(e.target.value)}
              data-testid="assessment-curriculum"
            >
              <option value="">No assessment mapping</option>
              {GRADING_CURRICULA.map((c) => (
                <option key={c} value={c}>{CURRICULA_LABELS[c] ?? c}</option>
              ))}
            </Select>
          </Field>
          {curriculum && systemsForCurriculum.length > 0 && (
            <Field label="Grading system (optional)">
              <Select
                value={systemId}
                onChange={(e) => {
                  setSystemId(e.target.value);
                  const system = gradingSystems.find((s) => s.id === e.target.value);
                  if (system && curriculum === "myp") {
                    // keep current mapping; system is a pointer only
                  }
                  if (value) {
                    emit({
                      ...value,
                      grading_system_id: e.target.value || null,
                    });
                  }
                }}
                data-testid="assessment-system"
              >
                <option value="">None (framework only)</option>
                {systemsForCurriculum.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {curriculum === "myp" && (
          <div className="space-y-3 rounded-lg border border-evergreen-900/15 bg-cream/70 p-3" data-testid="assessment-myp">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="MYP subject group">
                <Select
                  value={myp.groupKey}
                  onChange={(e) => emitMyp({ ...myp, groupKey: e.target.value, criteria: [], strands: [], marks: {}, weights: {} })}
                  data-testid="assessment-group"
                >
                  {mypSubjectGroups().map((g) => (
                    <option key={g.key} value={g.key}>{g.group}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="text-[11px] leading-snug text-ink-soft">
              {group ? (
                <>
                  Reference:{" "}
                  <a href={group.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                    {group.source}
                  </a>{" "}
                  · strand wording is EVALORA&apos;s published structure summary (see MYP Results → Settings → reference
                  for completeness disclosures).
                </>
              ) : (
                "Select a subject group to list its criteria."
              )}
            </p>

            <div className="space-y-2">
              {(group?.criteria ?? []).map((criterion) => {
                const selected = myp.criteria.includes(criterion.code);
                return (
                  <div key={criterion.code} className="rounded-lg border border-evergreen-900/15 bg-white p-2">
                    <label className="flex cursor-pointer items-start gap-2 text-sm font-medium text-evergreen-950">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            emitMyp({ ...myp, criteria: [...myp.criteria, criterion.code] });
                          } else {
                            emitMyp({
                              ...myp,
                              criteria: myp.criteria.filter((c) => c !== criterion.code),
                              strands: myp.strands.filter((code) => !code.startsWith(criterion.code)),
                              marks: Object.fromEntries(Object.entries(myp.marks).filter(([c]) => c !== criterion.code)),
                              weights: Object.fromEntries(Object.entries(myp.weights).filter(([c]) => c !== criterion.code)),
                            });
                          }
                        }}
                        className="mt-0.5 h-4 w-4 accent-evergreen-700"
                        data-testid={`assessment-criterion-check-${criterion.code}`}
                      />
                      <span>
                        Criterion {criterion.code} — {criterion.title}
                        <span className="mt-0.5 block text-[11px] font-normal leading-snug text-ink-soft">
                          {criterion.description}
                        </span>
                      </span>
                    </label>

                    {selected && (
                      <div className="mt-2 space-y-2 border-l-2 border-evergreen-600/40 pl-3" data-testid={`assessment-criterion-${criterion.code}`}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                          Strands — select any subset (more than one allowed)
                        </p>
                        {criterion.strands.map((strand) => {
                          const strandSelected = myp.strands.includes(strand.code);
                          return (
                            <label
                              key={strand.code}
                              className="flex cursor-pointer items-start gap-2 rounded p-1 text-xs hover:bg-cream"
                            >
                              <input
                                type="checkbox"
                                checked={strandSelected}
                                onChange={(e) => {
                                  emitMyp({
                                    ...myp,
                                    strands: e.target.checked
                                      ? [...myp.strands, strand.code]
                                      : myp.strands.filter((c) => c !== strand.code),
                                  });
                                }}
                                className="mt-0.5 h-3.5 w-3.5 accent-evergreen-700"
                                data-testid={`assessment-strand-check-${strand.code}`}
                              />
                              <span>
                                <strong>{strand.code}</strong> — {strand.title}
                                <span className="block text-[11px] leading-snug text-ink-soft">{strand.description}</span>
                              </span>
                            </label>
                          );
                        })}
                        <div className="flex flex-wrap items-end gap-3 pt-1">
                          <Field label="Criterion marks (optional)">
                            <Input
                              type="number"
                              min={0}
                              max={1000}
                              value={myp.marks[criterion.code] ?? ""}
                              onChange={(e) => emitMyp({ ...myp, marks: { ...myp.marks, [criterion.code]: e.target.value } })}
                              className="w-24"
                              data-testid={`assessment-marks-${criterion.code}`}
                            />
                          </Field>
                          <Field label="Weight % (optional)">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={myp.weights[criterion.code] ?? ""}
                              onChange={(e) => emitMyp({ ...myp, weights: { ...myp.weights, [criterion.code]: e.target.value } })}
                              className="w-24"
                              data-testid={`assessment-weight-${criterion.code}`}
                            />
                          </Field>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <details className="text-[11px] text-ink-soft">
              <summary className="cursor-pointer font-medium">Reference completeness disclosures</summary>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {MYP_REFERENCE_GAPS.map((gap) => (
                  <li key={gap.scope}>
                    <strong>{gap.scope}:</strong> {gap.gap} ({gap.where})
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}

        {curriculum && curriculum !== "myp" && (
          <div className="space-y-3 rounded-lg border border-evergreen-900/15 bg-cream/70 p-3" data-testid="assessment-elements">
            <p className="text-[11px] leading-snug text-ink-soft">
              {curriculum === "ap"
                ? "Map this question to your AP course components (e.g. the sections configured on the grading system, or CED units your institution uses). Labels are your own course structure — EVALORA never invents College Board requirements."
                : "Map this question to the objectives, components or competencies your institution uses for this framework. Labels are your own configuration — EVALORA never invents official curriculum requirements."}
            </p>
            {curriculum === "ap" && activeSystem && Array.isArray((activeSystem.config as Record<string, unknown> | undefined)?.ap_sections) && (
              <Button
                type="button"
                variant="outline"
                className="text-xs"
                data-testid="assessment-import-sections"
                onClick={() => {
                  const sections = (activeSystem.config as { ap_sections?: { name: string; weight_percent: number }[] })
                    .ap_sections ?? [];
                  emitElements(
                    sections.map((section, i) => ({
                      code: `S${i + 1}`,
                      label: section.name,
                      description: `Weight ${section.weight_percent}%`,
                    })),
                  );
                }}
              >
                Import sections from “{activeSystem.name}”
              </Button>
            )}
            <div className="space-y-2">
              {elements.map((element, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2 rounded border border-evergreen-900/15 bg-white p-2">
                  <Field label={`Element ${i + 1}`}>
                    <Input
                      value={element.label}
                      onChange={(e) =>
                        emitElements(
                          elements.map((x, j) =>
                            j === i ? { ...x, label: e.target.value, code: `E${i + 1}` } : x,
                          ),
                        )
                      }
                      className="w-48"
                      placeholder="Section I — Multiple choice"
                      data-testid={`assessment-element-label-${i}`}
                    />
                  </Field>
                  <Field label="Description (optional)">
                    <Input
                      value={element.description}
                      onChange={(e) =>
                        emitElements(elements.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
                      }
                      className="w-56"
                      placeholder="What this element assesses"
                    />
                  </Field>
                  <button
                    type="button"
                    className="mb-2 rounded p-1.5 text-red-700 hover:bg-red-50"
                    aria-label={`Remove element ${i + 1}`}
                    onClick={() => emitElements(elements.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="text-xs"
              data-testid="assessment-element-add"
              onClick={() =>
                emitElements([...elements, { code: `E${elements.length + 1}`, label: "", description: "" }])
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add assessment element
            </Button>
          </div>
        )}

        {value && (
          <div>
            <Button
              type="button"
              variant="ghost"
              className="text-xs text-red-700"
              data-testid="assessment-clear"
              onClick={() => {
                setCurriculum("");
                setSystemId("");
                setElements([]);
                setMyp(stateFromSnapshot(undefined, "mathematics"));
                onChange(null);
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Remove mapping
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}
