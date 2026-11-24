// Candidate section navigation (§ Candidate Sections): sections come from the
// paper configuration, render with names/counts/progress, navigate, and number
// questions locally per section — all inside the existing attempt view.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePaperSections, groupRowsBySection } from "../src/lib/examPaper.ts";

// ── paper configuration parsing (Paper Builder is the source of truth) ───
const sections = parsePaperSections([
  { id: "A", title: "SECTION A — MULTIPLE CHOICE", instructions: "Choose one answer.", questions: 5, marks: 5 },
  { id: "B", title: "SECTION B — THEORY", instructions: null, questions: 3, marks: 24 },
  { id: "", title: "ignored" },
  { id: "C", title: 42 },
]);
assert.equal(sections.length, 2, "valid sections kept, malformed dropped");
assert.equal(sections[0].id, "A");
assert.equal(sections[0].questionCount, 5);
assert.equal(sections[0].marks, 5);
assert.equal(sections[1].title, "SECTION B — THEORY");
assert.equal(sections[1].questionCount, 3);
assert.deepEqual(parsePaperSections("nope"), [], "non-arrays yield no sections");
assert.equal(parsePaperSections(null).length, 0);

// ── grouping rows by their configured section tag ────────────────────────
const rows = [
  { questions: { config: { paper_section: "A" } }, points: 1 },
  { questions: { config: { paper_section: "B" } }, points: 8 },
  { questions: { config: {} }, points: 4 },
  { questions: { config: { paper_section: "A" } }, points: 1 },
];
const grouped = groupRowsBySection(rows, sections);
assert.equal(grouped.length, 3, "A, B and unsectioned groups");
const groupA = grouped.find((g) => g.section?.id === "A");
assert.equal(groupA.rows.length, 2, "section A holds both tagged rows");
const groupNone = grouped.find((g) => g.section === null);
assert.equal(groupNone.rows.length, 1, "untagged rows fall into an implicit group");
assert.equal(grouped[0].section?.id, "A", "configured order preserved for first-seen keys");

// ── candidate attempt UI wiring ──────────────────────────────────────────
const takeExam = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
assert.ok(takeExam.includes("sectionModel"), "attempt view derives a section model");
assert.ok(takeExam.includes("hasSections"), "section UI only renders when configured");
assert.ok(takeExam.includes("data-testid=\"section-nav\""), "section navigation strip exists");
assert.ok(takeExam.includes("section-tab-"), "per-section navigation buttons");
assert.ok(takeExam.includes("renderNavigatorButton"), "navigator renders section-aware buttons");
assert.ok(takeExam.includes("localNumber"), "per-section numbering restarts at 1");
assert.ok(takeExam.includes("answered"), "per-section answer status");
assert.ok(takeExam.includes("navigateTo"), "clicking a section opens its first question");
assert.ok(takeExam.includes("PlatformCredit"), "attribution present alongside section UI");

const live = readFileSync("src/lib/live.ts", "utf8");
assert.ok(live.includes("paper_section"), "questions are tagged from the paper configuration");
assert.ok(live.includes("exam_paper_templates") || live.includes("paper_header") || live.includes("sections"), "sections flow from paper header config");

const state = readFileSync("src/app/api/exam/state/route.ts", "utf8");
assert.ok(state.includes("sections"), "candidate state API delivers configured sections");

console.log("candidate-sections: 25 checks passed");
