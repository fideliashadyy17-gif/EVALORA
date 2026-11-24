// Configurable grading engine (§ Flexible grading engine): Beninese /20 with
// coefficients, custom boundaries, AP section weights with NO fabricated 1–5
// scale, MYP pointer — plus the org configuration UI wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GRADING_CURRICULA,
  BENIN_DEFAULT_LETTERS,
  gradeBenin,
  weightedAverage,
  gradeFromBoundaries,
  gradeAp,
  applyGrading,
} from "../src/lib/gradingSystems.ts";

// ── curriculum families ──────────────────────────────────────────────────
assert.deepEqual([...GRADING_CURRICULA], ["myp", "ap", "beninese", "custom", "cambridge", "british"]);
assert.ok(BENIN_DEFAULT_LETTERS.length >= 5, "default francophone letter ladder present");

// ── Beninese /20 ─────────────────────────────────────────────────────────
const benin = gradeBenin(15, {});
assert.equal(benin.mark20, 15, "mark already on /20 stays /20");
assert.equal(benin.percent, 75);
assert.equal(benin.letter, "Assez Bien", "15/20 → Assez Bien with the default ladder");

const scaled = gradeBenin(30, { scale_max: 40 });
assert.equal(scaled.mark20, 15, "40-scale mark converted to /20");
assert.equal(scaled.letter, "Assez Bien");

const customLetters = gradeBenin(17, { scale_max: 20, benin_letters: [{ min: 16, label: "B+" }, { min: 0, label: "E" }] });
assert.equal(customLetters.letter, "B+", "org-configured letters win over defaults");

assert.equal(gradeBenin("n/a", {}).mark20, null, "non-numeric mark → null, never NaN");

// ── weighted average (subject coefficients) ──────────────────────────────
assert.equal(weightedAverage([{ mark: 15, coefficient: 3 }, { mark: 12, coefficient: 1 }]), 14.25, "Σ(mark×coef)÷Σcoef");
assert.equal(weightedAverage([{ mark: 10 }, { mark: 20 }]), 15, "missing coefficient defaults to 1");
assert.equal(weightedAverage([]), null, "no rows → null");
assert.equal(weightedAverage([{ mark: 15, coefficient: 0 }]), null, "invalid coefficients ignored");

// ── custom boundaries ────────────────────────────────────────────────────
const boundaries = [
  { min_percent: 0, label: "F" },
  { min_percent: 50, label: "D" },
  { min_percent: 60, label: "C" },
  { min_percent: 70, label: "B" },
  { min_percent: 80, label: "A" },
];
assert.equal(gradeFromBoundaries(85, boundaries), "A");
assert.equal(gradeFromBoundaries(70, boundaries), "B", "inclusive threshold");
assert.equal(gradeFromBoundaries(49.9, boundaries), "F");
assert.equal(gradeFromBoundaries(85, []), null, "no boundaries → null, not a guess");

// ── AP: never fabricates the 1–5 scale ───────────────────────────────────
const apConfig = {
  ap_course: "AP Calculus AB",
  ap_sections: [
    { name: "Section I — Multiple choice", weight_percent: 50 },
    { name: "Section II — Free response", weight_percent: 50 },
  ],
};
const apScored = gradeAp(
  [
    { name: "Section I — Multiple choice", raw: 40, max: 50 },
    { name: "Section II — Free response", raw: 14, max: 20 },
  ],
  apConfig,
);
assert.equal(apScored.percent, 75, "weighted section percent (80×50 + 70×50)/100");
assert.equal(apScored.score, null, "no thresholds configured → NO invented score");
assert.equal(apScored.note, "score_thresholds_not_configured");

const apWithThresholds = gradeAp(
  [
    { name: "Section I — Multiple choice", raw: 45, max: 50 },
    { name: "Section II — Free response", raw: 18, max: 20 },
  ],
  { ...apConfig, ap_score_thresholds: [{ score: 5, min_percent: 90 }, { score: 4, min_percent: 80 }] },
);
assert.equal(apWithThresholds.percent, 90);
assert.equal(apWithThresholds.score, 5, "organisation-supplied threshold applied");

const apPartial = gradeAp([{ name: "Section I — Multiple choice", raw: 40, max: 50 }], apConfig);
assert.equal(apPartial.percent, 80, "unscored section renormalised (provisional)");
assert.equal(apPartial.score, null);

assert.equal(gradeAp([], {}).note, "no_sections_configured", "empty config reported honestly");

// ── dispatcher ───────────────────────────────────────────────────────────
const beninOutcome = applyGrading({ id: "g1", organization_id: "o", name: "Grade 10", curriculum: "beninese", config: {} }, { mark: 16 });
assert.equal(beninOutcome.mark20, 16);
assert.equal(beninOutcome.label, "Bien");
assert.equal(beninOutcome.curriculum, "beninese");

const weightedOutcome = applyGrading(
  { id: "g2", organization_id: "o", name: "Benin weighted", curriculum: "beninese", config: {} },
  { rows: [{ mark: 15, coefficient: 3 }, { mark: 12, coefficient: 1 }] },
);
assert.equal(weightedOutcome.mark20, 14.25);

const customOutcome = applyGrading(
  { id: "g3", organization_id: "o", name: "Custom", curriculum: "custom", config: { boundaries } },
  { mark: 85, scale_max: 100 },
);
assert.equal(customOutcome.percent, 85);
assert.equal(customOutcome.label, "A");

const mypOutcome = applyGrading(
  { id: "g4", organization_id: "o", name: "MYP", curriculum: "myp", config: {} },
  { mark: 42, scale_max: 60 },
);
assert.equal(mypOutcome.percent, 70, "MYP reports percent only");
assert.equal(mypOutcome.label, null, "MYP levels come from myp results, never guessed here");
assert.equal(mypOutcome.note, "see_myp_results_for_levels");

const camOutcome = applyGrading(
  { id: "g5", organization_id: "o", name: "British", curriculum: "british", config: { boundaries } },
  { mark: 72, scale_max: 100 },
);
assert.equal(camOutcome.label, "B", "cambridge/british fall through to boundaries");

const emptyOutcome = applyGrading(
  { id: "g6", organization_id: "o", name: "Empty", curriculum: "custom", config: {} },
  {},
);
assert.equal(emptyOutcome.note, "no_marks", "missing marks reported, not invented");

// ── configuration UI + persistence wiring ────────────────────────────────
const page = readFileSync("src/app/dashboard/grading/page.tsx", "utf8");
assert.ok(page.includes("grading_systems"), "org grading systems page reads stored configs");
assert.ok(page.includes("GradingSystemsClient"), "configurator rendered");

const client = readFileSync("src/components/grading/GradingSystemsClient.tsx", "utf8");
assert.ok(client.includes("beninese") && client.includes("ap") && client.includes("custom"), "families offered");
assert.ok(client.includes("scale_max"), "Beninese scale configured");
assert.ok(client.includes("ap_score_thresholds") || client.includes("ap_threshold"), "AP thresholds optional and explicit");
assert.ok(client.includes("never invented") || client.includes("never"), "AP scale honesty stated in UI");

const actions = readFileSync("src/app/dashboard/grading/actions.ts", "utf8");
assert.ok(actions.includes("MANAGER_ROLES"), "manager-only configuration");
assert.ok(actions.includes("audit("), "configuration changes audited");
assert.ok(actions.includes("setExamGradingSystem"), "per-examination attachment action");
assert.ok(actions.includes("setQuizGradingSystem"), "per-quiz attachment action");
assert.ok(actions.includes("eq(\"organization_id\", org.id)"), "tenant-scoped everywhere");

const workspace = readFileSync("src/app/dashboard/exams/[id]/page.tsx", "utf8");
assert.ok(workspace.includes("Grading configuration"), "exam workspace hosts the selection");
assert.ok(workspace.includes("grading_system_id"), "exam settings store the chosen system");

const quizPage = readFileSync("src/app/dashboard/quizzes/[id]/page.tsx", "utf8");
assert.ok(quizPage.includes("quiz-grading-config"), "quiz workspace hosts the selection");

const migration = readFileSync("supabase/migrations/20261124200000_formula_library_teacher_subjects_grading_systems.sql", "utf8");
assert.ok(migration.includes("create table if not exists public.grading_systems"), "grading_systems table exists");
assert.ok(migration.includes("curriculum text not null"), "curriculum column present");

console.log("grading-systems: 52 checks passed");
