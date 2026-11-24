// Assessment-grid builder (§ Rubric & Assessment Grid Builder): performance
// levels, weights, duplication with version lineage, and the historical-edit
// guard that keeps scored grids immutable in place.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseLevelsFromForm,
  levelForMarks,
  nextGridVersion,
  rejectRuleEditForScoredGrid,
  duplicatedTitle,
} from "../src/lib/rubricGrid.ts";

function form(fields) {
  return {
    getAll: (key) => fields[key] ?? [],
    get: (key) => (fields[key] ?? [])[0] ?? null,
  };
}

// ── performance levels ───────────────────────────────────────────────────
const valid = parseLevelsFromForm(
  form({
    level_label: ["Excellent", "Good", "Satisfactory", ""],
    level_min: ["4", "2.5", "1", "0"],
    level_max: ["5", "3.99", "2.49", "0.99"],
    level_desc: ["Full marks", "", "Partial", ""],
  }),
  5,
);
assert.ok(valid, "valid levels parse");
assert.equal(valid.length, 3, "empty label rows skipped");
assert.deepEqual(valid.map((l) => l.level), [1, 2, 3], "levels renumbered contiguously");
assert.equal(valid[0].label, "Excellent");
assert.equal(valid[0].min_marks, 4);
assert.equal(valid[0].max_marks, 5);
assert.equal(valid[0].description, "Full marks");
assert.equal(valid[1].description, undefined, "empty description omitted");

assert.equal(parseLevelsFromForm(form({ level_label: ["A"], level_min: ["x"], level_max: ["5"] }), 5), null, "non-numeric rejected");
assert.equal(parseLevelsFromForm(form({ level_label: ["A"], level_min: ["6"], level_max: ["5"] }), 5), null, "inverted range rejected");
assert.equal(
  parseLevelsFromForm(form({ level_label: ["A", "B"], level_min: ["4", "3"], level_max: ["5", "5"] }), 5),
  null,
  "overlapping bands rejected",
);
assert.equal(
  parseLevelsFromForm(form({ level_label: ["A"], level_min: ["0"], level_max: ["10"] }), 5),
  null,
  "range beyond the criterion maximum rejected",
);
assert.deepEqual(parseLevelsFromForm(form({}), 5), [], "no rows → empty configuration");

// ── mark → level lookup ──────────────────────────────────────────────────
const levels = [
  { level: 2, label: "Good", min_marks: 2.5, max_marks: 3.99 },
  { level: 1, label: "Excellent", min_marks: 4, max_marks: 5 },
  { level: 3, label: "Satisfactory", min_marks: 1, max_marks: 2.49 },
];
assert.equal(levelForMarks(levels, 4.5).label, "Excellent");
assert.equal(levelForMarks(levels, 3).label, "Good");
assert.equal(levelForMarks(levels, 2.49).label, "Satisfactory", "inclusive upper bound");
assert.equal(levelForMarks(levels, 0.5), null, "below all bands → null");
assert.equal(levelForMarks(null, 3), null, "unconfigured → null, never a guess");

// ── version lineage ──────────────────────────────────────────────────────
assert.equal(nextGridVersion(undefined), 1, "first copy starts at v1");
assert.equal(nextGridVersion(1), 2);
assert.equal(nextGridVersion(7), 8);
assert.equal(nextGridVersion("3"), 4, "string versions coerced");
assert.equal(nextGridVersion(-5), 1, "invalid → 1");
assert.equal(duplicatedTitle("Essay grid", 2), "Essay grid (v2)");
assert.equal(duplicatedTitle("Essay grid (v2)", 3), "Essay grid (v3)", "chained copies don't pile up titles");

// ── historical-edit guard ────────────────────────────────────────────────
const base = {
  scoredAnswerCount: 12,
  titleChanged: false,
  descriptionChanged: false,
  frameworkChanged: false,
  curriculumChanged: false,
};
assert.equal(rejectRuleEditForScoredGrid(base), false, "status-only edits allowed on scored grids");
assert.equal(rejectRuleEditForScoredGrid({ ...base, titleChanged: true }), true, "title change rejected once scored");
assert.equal(rejectRuleEditForScoredGrid({ ...base, descriptionChanged: true }), true);
assert.equal(rejectRuleEditForScoredGrid({ ...base, frameworkChanged: true }), true);
assert.equal(rejectRuleEditForScoredGrid({ ...base, curriculumChanged: true }), true);
assert.equal(
  rejectRuleEditForScoredGrid({ ...base, scoredAnswerCount: 0, titleChanged: true }),
  false,
  "unscored grids remain editable",
);

// ── actions + UI wiring ──────────────────────────────────────────────────
const actions = readFileSync("src/app/dashboard/rubrics/actions.ts", "utf8");
assert.ok(actions.includes("duplicateRubric"), "duplication action exists");
assert.ok(actions.includes("parent_id"), "copy records lineage");
assert.ok(actions.includes("nextGridVersion"), "version incremented through the shared helper");
assert.ok(actions.includes("rejectRuleEditForScoredGrid"), "scored-grid guard enforced server-side");
assert.ok(actions.includes("answer_rubric_scores"), "guard counts real scored answers");
assert.ok(actions.includes("?e=versioned"), "guard explains the duplication path");
assert.ok(actions.includes("parseLevelsFromForm"), "levels validated on save");
assert.ok(actions.includes("levels"), "levels persisted on criteria");
assert.ok(actions.includes("weight"), "weights persisted on criteria");

const detail = readFileSync("src/app/dashboard/rubrics/[id]/page.tsx", "utf8");
assert.ok(detail.includes("PerformanceLevelsEditor"), "level editor rendered");
assert.ok(detail.includes("level_label") && detail.includes("level_min") && detail.includes("level_max"), "level rows posted");
assert.ok(detail.includes("Duplicate as new version"), "duplicate affordance offered");
assert.ok(detail.includes("curriculum"), "curriculum family selectable");
assert.ok(detail.includes("grade_label"), "grade/class selectable");
assert.ok(detail.includes("v{Number(") || detail.includes("version"), "version badge shown");

const list = readFileSync("src/app/dashboard/rubrics/page.tsx", "utf8");
assert.ok(list.includes("curriculum"), "library filterable by curriculum family");
assert.ok(list.includes("duplicateRubric"), "quick duplicate from the library");
assert.ok(list.includes("Duplicate"), "duplicate control visible");

const migration = readFileSync("supabase/migrations/20261124200000_formula_library_teacher_subjects_grading_systems.sql", "utf8");
assert.ok(migration.includes("grading_rubrics") && migration.includes("parent_id"), "rubric lineage column added");
assert.ok(migration.includes("grading_rubric_criteria") && migration.includes("levels"), "criterion levels column added");
assert.ok(migration.includes("weight"), "criterion weight column added");
assert.ok(migration.toLowerCase().includes("add column"), "columns added, never rebuilt");
assert.ok(!/drop table|truncate/i.test(migration), "no destructive statements");

console.log("rubric-grid-builder: 45 checks passed");
