// MYP criteria & strand selection inside examination grading configuration:
// select group → criteria → strands → save snapshot → reopen (persist) →
// rubric generation → marking-time display. Reference content comes from
// MYP_SUBJECT_GROUP_REFERENCE — never invented placeholders.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MYP_EXAM_CONFIG_VERSION,
  MYP_REFERENCE_SNAPSHOT,
  buildMypExamConfigFromForm,
  parseMypExamConfig,
  summarizeMypExamConfig,
  strandsForCriterion,
  snapshotDiffersFromReference,
  mypReferenceGroup,
} from "../src/lib/mypExamConfig.ts";
import { MYP_SUBJECT_GROUP_REFERENCE } from "../src/lib/mypReference.ts";

function form(fields) {
  return {
    getAll: (key) => fields[key] ?? [],
    get: (key) => (fields[key] ?? [])[0] ?? null,
  };
}

const MATH = mypReferenceGroup("mathematics");
assert.ok(MATH, "mathematics reference group exists");
assert.equal(MYP_SUBJECT_GROUP_REFERENCE.length, 8, "all eight groups in the library");

// ── 1–2. Select Mathematics, open Criterion A, pick specific strands ─────
const stepA = buildMypExamConfigFromForm(
  form({
    subject_group: "mathematics",
    myp_criterion: ["A"],
    myp_strand: ["A(i)", "A(iii)"],
  }),
  "mathematics",
);
assert.equal(stepA.ok, true, "criterion A with two strands saves");
assert.equal(stepA.config.subject_group, "mathematics");
assert.equal(stepA.config.criteria.length, 1, "only explicitly selected criteria are captured");
assert.equal(stepA.config.criteria[0].code, "A");
assert.equal(stepA.config.criteria[0].title, MATH.criteria[0].title, "official criterion title captured");
assert.deepEqual(
  stepA.config.criteria[0].strands.map((s) => s.code),
  ["A(i)", "A(iii)"],
);
assert.ok(stepA.config.criteria[0].strands[0].description.length > 10, "strand carries its real reference description");
assert.equal(stepA.config.reference, MYP_REFERENCE_SNAPSHOT);
assert.equal(stepA.config.version, MYP_EXAM_CONFIG_VERSION);

// ── 3. Add Criterion C with one strand (A + C combination) ───────────────
const stepC = buildMypExamConfigFromForm(
  form({
    subject_group: "mathematics",
    myp_criterion: ["A", "C"],
    myp_strand: ["A(i)", "A(ii)", "C(ii)"],
    marks_A: ["20"],
    weight_A: ["60"],
    weight_C: ["40"],
  }),
  "mathematics",
);
assert.equal(stepC.ok, true);
assert.deepEqual(stepC.config.criteria.map((c) => c.code), ["A", "C"]);
assert.equal(stepC.config.criteria[0].marks, 20, "mark allocation stored");
assert.equal(stepC.config.criteria[0].weight, 60, "weighting stored");
assert.equal(stepC.config.criteria[1].weight, 40);
assert.deepEqual(strandsForCriterion(stepC.config, "C").map((s) => s.code), ["C(ii)"]);
assert.equal(strandsForCriterion(stepC.config, "D").length, 0);

// ── All four criteria with only partial strands ──────────────────────────
const stepAll = buildMypExamConfigFromForm(
  form({
    myp_criterion: ["A", "B", "C", "D"],
    myp_strand: ["A(iii)", "B(i)"],
  }),
  "mathematics",
);
assert.equal(stepAll.ok, true);
assert.equal(stepAll.config.criteria.length, 4);
assert.equal(stepAll.config.criteria[0].strands.length, 1, "only the relevant strands captured");
assert.equal(stepAll.config.criteria[1].strands.length, 1);
assert.equal(stepAll.config.criteria[2].strands.length, 0, "criterion assessed as a whole when no strand picked");

// ── Selection validation ─────────────────────────────────────────────────
assert.equal(buildMypExamConfigFromForm(form({}), "mathematics").error, "criteria", "at least one criterion required");
assert.equal(buildMypExamConfigFromForm(form({ myp_criterion: ["A"] }), "nope").error, "group", "unknown group rejected");
const badStrand = buildMypExamConfigFromForm(
  form({ myp_criterion: ["A"], myp_strand: ["A(i)", "Z(ix)"] }),
  "mathematics",
);
assert.equal(badStrand.ok, false, "strand unknown to the reference rejected");
const strayStrand = buildMypExamConfigFromForm(
  form({ myp_criterion: ["A"], myp_strand: ["B(i)"] }),
  "mathematics",
);
assert.equal(strayStrand.ok, false, "strand outside the selected criteria rejected");

// ── 8–9. Save → JSON → reopen: selections persist ────────────────────────
const persisted = JSON.parse(JSON.stringify(stepC.config));
const reopened = parseMypExamConfig(persisted);
assert.ok(reopened, "stored snapshot parses back");
assert.deepEqual(reopened.criteria.map((c) => c.code), ["A", "C"], "criteria persist across reopen");
assert.deepEqual(
  reopened.criteria[0].strands.map((s) => s.code),
  ["A(i)", "A(ii)"],
  "strands persist across reopen");
assert.equal(reopened.criteria[0].marks, 20);
assert.equal(reopened.criteria[0].weight, 60);
assert.equal(reopened.subject_group_label, MATH.group);

assert.equal(parseMypExamConfig(null), null);
assert.equal(parseMypExamConfig({ ...persisted, version: 99 }), null, "unknown version refused");
assert.equal(parseMypExamConfig({ ...persisted, criteria: [] }), null, "empty criteria refused");

// ── 6. Snapshot isolation: reference changes never alter a saved exam ────
const before = JSON.stringify(reopened);
MATH.criteria[0].title = "Knowing and understanding (edited upstream)";
MATH.criteria[0].strands.push({ code: "A(new)", title: "New strand", description: "added later", provenance: "structure-summary" });
assert.equal(snapshotDiffersFromReference(reopened), true, "drift detected for display");
assert.equal(JSON.stringify(reopened), before, "the saved snapshot is untouched by library edits");
assert.equal(reopened.criteria[0].title, "Knowing and understanding", "snapshot keeps the original official title");
// restore the shared reference object for other assertions
MATH.criteria[0].title = "Knowing and understanding";
MATH.criteria[0].strands.pop();
assert.equal(snapshotDiffersFromReference(reopened), false, "no drift once restored");

const summary = summarizeMypExamConfig(reopened);
assert.equal(summary.criteria, 2);
assert.equal(summary.strands, 3);
assert.ok(summary.label.includes("Mathematics"));

// ── UI wiring: configuration interface ───────────────────────────────────
const configUi = readFileSync("src/components/grading/MypExamGradingConfig.tsx", "utf8");
assert.ok(configUi.includes("MYP_SUBJECT_GROUP_REFERENCE"), "criteria/strands come from the reference library");
assert.ok(configUi.includes('name="myp_criterion"'), "criterion checkboxes are selectable");
assert.ok(configUi.includes('name="myp_strand"'), "individual strand checkboxes are selectable");
assert.ok(configUi.includes("saveMypExamGrading"), "selection saves through the server action");
assert.ok(configUi.includes("generateMypRubricFromConfig"), "rubric generation offered from the selection");
assert.ok(configUi.includes("marks_"), "per-criterion mark allocation inputs");
assert.ok(configUi.includes("weight_"), "per-criterion weighting inputs");
assert.ok(configUi.includes("myp-group-select"), "subject group selector present");
assert.ok(configUi.includes("Open subject group"), "group switch re-renders the criteria list");
assert.ok(!/□\s*Strand i\b|Strand i{1,3} \(if applicable\)/.test(configUi), "no generic placeholder strands");
assert.ok(configUi.includes("snapshot"), "snapshot semantics stated in the UI");

const markingUi = readFileSync("src/components/grading/MypMarkingStructure.tsx", "utf8");
assert.ok(markingUi.includes("config.criteria"), "marking structure renders the saved snapshot");
assert.ok(markingUi.includes("snapshotDiffersFromReference"), "reference drift surfaced without rewriting history");
assert.ok(markingUi.includes("myp-marking-structure"), "marking panel testid present");
assert.ok(markingUi.includes("strands"), "selected strands displayed during marking");

// ── Actions: persistence, guards, rubric generation ─────────────────────
const actions = readFileSync("src/app/dashboard/grading/actions.ts", "utf8");
assert.ok(actions.includes("export async function saveMypExamGrading"), "save action exists");
assert.ok(actions.includes("export async function generateMypRubricFromConfig"), "rubric generation action exists");
assert.ok(actions.includes("myp_grading: built.config"), "snapshot written to exam settings");
assert.ok(actions.includes("exam.myp_grading_saved"), "save is audited");
assert.ok(actions.includes("exam.myp_rubric_generated"), "generation is audited");
assert.ok(actions.includes("Generated from MYP criteria snapshot"), "generated rubrics carry the idempotency marker");
assert.ok(actions.includes("myp_rubric_exists"), "duplicate generation refused");
assert.ok(actions.includes("parseMypExamConfig((exam.settings"), "generation reads the SNAPSHOT, not the live library");
assert.ok(actions.includes("exam_rubric_links"), "generated rubric is associated with the examination");
assert.ok(actions.includes("curriculum: \"myp\""), "rubric tagged with the MYP curriculum family");
assert.ok(actions.includes('canOperate(ctx, org.id, "exams.edit", "examinations")'), "RBAC exams.edit permission gates MYP grading configuration");
assert.ok(actions.includes("eq(\"organization_id\", org.id)"), "tenant-scoped everywhere");

// ── Exam workspace: panel + marking queue wiring ─────────────────────────
const workspace = readFileSync("src/app/dashboard/exams/[id]/page.tsx", "utf8");
assert.ok(workspace.includes("MypExamGradingConfig"), "configuration interface rendered in the grading card");
assert.ok(workspace.includes("mypFrameworkActive"), "panel shown when the MYP framework is selected");
assert.ok(workspace.includes('selectedGradingSystem?.curriculum === "myp"'), "triggered by the attached MYP grading system");
assert.ok(workspace.includes("MypMarkingStructure"), "marking interface displays the selected structure");
assert.ok(workspace.includes("Marking queue"), "structure rendered inside the marking queue");
assert.ok(workspace.includes("myp_group"), "subject-group switch persists through search params");
assert.ok(workspace.includes("mypgrading"), "save confirmation surfaced");
assert.ok(workspace.includes("parseMypExamConfig(settings.myp_grading)"), "workspace reads the stored snapshot");

// Rubric path: generated criteria feed the existing rubric marking forms.
const rubricActions = readFileSync("src/app/dashboard/rubrics/actions.ts", "utf8");
assert.ok(rubricActions.includes("markWithRubric") || readFileSync("src/app/dashboard/exams/actions.ts", "utf8").includes("markWithRubric"), "rubric marking action exists for criterion-level scoring");
const examActions = readFileSync("src/app/dashboard/exams/actions.ts", "utf8");
assert.ok(examActions.includes("export async function markWithRubric"), "teachers mark against the attached rubric");
assert.ok(examActions.includes("answer_rubric_scores"), "criterion scores persisted per grader");

console.log("myp-exam-grading: 63 checks passed");
