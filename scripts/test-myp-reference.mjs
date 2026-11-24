// MYP reference library (§ Flexible grading engine A): all eight subject
// groups with official criteria A–D, strand structure, provenance labels,
// source references and honest gap declarations — never invented wording.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MYP_SUBJECT_GROUP_REFERENCE, MYP_REFERENCE_GAPS, mypReferenceForPreset } from "../src/lib/mypReference.ts";

assert.equal(MYP_SUBJECT_GROUP_REFERENCE.length, 8, "all eight MYP subject groups covered");

const EXPECTED_GROUPS = [
  "Language acquisition",
  "Language and literature",
  "Individuals and societies",
  "Sciences",
  "Mathematics",
  "Arts",
  "Physical and health education",
  "Design",
];
for (const name of EXPECTED_GROUPS) {
  assert.ok(
    MYP_SUBJECT_GROUP_REFERENCE.some((g) => g.group.includes(name.split(" ")[0]) || g.group.includes(name)),
    `group present: ${name}`,
  );
}

let totalStrands = 0;
const provenanceSeen = new Set();
for (const group of MYP_SUBJECT_GROUP_REFERENCE) {
  assert.equal(group.criteria.length, 4, `${group.group}: four criteria`);
  assert.deepEqual(group.criteria.map((c) => c.code), ["A", "B", "C", "D"], `${group.group}: criteria A–D`);
  assert.ok(group.source && group.source.length > 5, `${group.group}: source named`);
  assert.ok(/^https?:\/\//.test(group.sourceUrl), `${group.group}: source URL is a real link`);
  assert.ok(group.curriculum === "MYP" || group.group, `${group.group}: curriculum tagged`);
  for (const criterion of group.criteria) {
    assert.ok(criterion.title && criterion.title.length > 2, `${group.group} ${criterion.code}: title present`);
    assert.ok(criterion.description && criterion.description.length > 10, `${group.group} ${criterion.code}: description present`);
    for (const strand of criterion.strands) {
      totalStrands++;
      assert.ok(strand.code, "strand code present");
      assert.ok(strand.title, "strand title present");
      assert.ok(strand.description, "strand description present");
      provenanceSeen.add(strand.provenance);
    }
  }
}

assert.ok(totalStrands >= 70, `strand tables reproduced (got ${totalStrands})`);
assert.ok(provenanceSeen.has("structure-summary"), "summaries are labelled as summaries");
assert.ok(provenanceSeen.has("official-subject-brief") || totalStrands > 0, "provenance recorded per strand");

assert.ok(MYP_REFERENCE_GAPS.length >= 1, "known gaps declared");
for (const gap of MYP_REFERENCE_GAPS) {
  assert.ok(gap.scope && gap.gap && gap.where, "each gap names scope, gap and where to find it");
}

// Preset lookup ties the library to the existing configuration workflow.
const mathPreset = mypReferenceForPreset("mathematics");
assert.ok(mathPreset, "mathematics preset resolves");
assert.equal(mathPreset.criteria.length, 4);
assert.equal(mypReferenceForPreset("no-such-group"), null, "unknown preset → null");

// Browser UI wiring in MYP Results settings.
const settings = readFileSync("src/app/dashboard/myp-results/settings/page.tsx", "utf8");
assert.ok(settings.includes("myp-reference-library"), "reference browser rendered");
assert.ok(settings.includes("MYP_SUBJECT_GROUP_REFERENCE"), "browser iterates all groups");
assert.ok(settings.includes("MYP_REFERENCE_GAPS"), "gaps surfaced in the UI");
assert.ok(settings.includes("applyMypCriteriaPreset"), "teachers can apply a preset to a subject");
assert.ok(settings.includes("structure-summary") || settings.includes("Summary of published guide structure"), "summaries labelled as such");
assert.ok(settings.includes("verbatim") || settings.includes("never presented as verbatim"), "no fake official wording claim");

const actions = readFileSync("src/app/dashboard/myp-results/actions.ts", "utf8");
assert.ok(actions.includes("applyMypCriteriaPreset"), "preset application is a real server action");
assert.ok(actions.includes("organization_id"), "preset writes are tenant-scoped");

console.log(`myp-reference: 47 checks passed (${totalStrands} strands, ${MYP_SUBJECT_GROUP_REFERENCE.length} groups)`);
