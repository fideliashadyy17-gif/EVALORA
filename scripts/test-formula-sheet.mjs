// Formula Sheet library + per-exam configuration + candidate display wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateFormulaInput,
  validateSheetDraft,
  groupLibraryEntries,
  unwrapMathDelimiters,
  FORMULA_LIMITS,
} from "../src/lib/formulaLibrary.ts";
import { parseFormulaSheet } from "../src/lib/examFormulas.ts";

const EXAM_A = "11111111-1111-4111-8111-111111111111";
const EXAM_B = "22222222-2222-4222-8222-222222222222";

// ── formulaLibrary validation ────────────────────────────────────────────
assert.equal(validateFormulaInput({ topic: "Algebra", title: "Quadratic formula", latex: "x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}" }).ok, true);
assert.equal(validateFormulaInput({ topic: "Algebra", title: "   ", latex: "x^2" }).ok, false, "blank titles rejected");
assert.equal(validateFormulaInput({ topic: "Algebra", title: "x".repeat(FORMULA_LIMITS.title + 1), latex: "x" }).ok, false, "title length capped");
assert.equal(validateFormulaInput({ topic: "Algebra", title: "Times", latex: "a \\times b" }).ok, true, "latex control words allowed");
const ctrl = validateFormulaInput({ topic: "Algebra", title: "Bad", latex: "bad \u0000 null\u0007" });
assert.equal(ctrl.ok, true, "control characters are stripped, not stored");
assert.equal(ctrl.ok && ctrl.value.latex, "bad null");
assert.equal(validateFormulaInput({ topic: "", title: "T", latex: "x" }).ok, false, "topic required");
assert.equal(validateFormulaInput({ topic: "Algebra", title: "No latex", latex: "" }).ok, false, "latex required");

assert.equal(unwrapMathDelimiters("$ x = 1 $"), "x = 1", "one surrounding $ pair stripped");
assert.equal(unwrapMathDelimiters("$$ x = 1 $$"), "$$ x = 1 $$", "double $$ left intact (renderer owns its own delimiters)");
assert.equal(unwrapMathDelimiters("\\( y \\)"), "\\( y \\)", "latex group delimiters untouched");
assert.equal(unwrapMathDelimiters("  z  "), "z");

const sheetDraft = validateSheetDraft([
  {
    title: "Mechanics",
    items: [
      { latex: "F = ma", note: "Newton's second law" },
      { latex: "$$E_k = \\frac{1}{2}mv^2$$" },
    ],
  },
]);
assert.equal(sheetDraft.ok, true, "valid draft accepted");
assert.deepEqual(sheetDraft.groups[0].items.map((f) => f.latex), ["F = ma", "$$E_k = \\frac{1}{2}mv^2$$"], "single-$ delimiters unwrapped, $$ preserved");
assert.equal(sheetDraft.groups[0].items[0].note, "Newton's second law");

assert.equal(validateSheetDraft([]).ok, false, "empty draft rejected");
const badDraft = validateSheetDraft([{ title: "G", items: [{ latex: "ok" }, { latex: "" }] }]);
assert.equal(badDraft.ok, false, "empty formula rejected");
assert.equal(badDraft.error, "item_latex");

const grouped = groupLibraryEntries([
  { topic: "Algebra", chapter: null, title: "Quadratic formula", latex: "x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}", note: null },
  { topic: "Algebra", chapter: "Factoring", title: "Difference of squares", latex: "a^2-b^2", note: null },
  { topic: "Calculus", chapter: null, title: "Power rule", latex: "\\frac{d}{dx}x^n = nx^{n-1}", note: null },
  { topic: "Geometry", chapter: null, title: "Pythagoras", latex: "a^2+b^2=c^2", note: null },
]);
assert.equal(grouped.length, 3, "grouped by topic");
const algebra = grouped.find((g) => g.topic === "Algebra");
assert.ok(algebra, "algebra topic present");
assert.equal(algebra.chapters.length, 2, "chapters within a topic");
assert.ok(algebra.chapters.some((c) => c.chapter === "Factoring"));
assert.ok(algebra.chapters.some((c) => c.chapter === null));
assert.equal(grouped.find((g) => g.topic === "Calculus").chapters[0].entries[0].title, "Power rule");

// ── per-exam storage gate (exams.settings.formula_sheet) ─────────────────
const stored = {
  version: 1,
  exam_id: EXAM_A,
  enabled: true,
  title: "Approved formulas",
  groups: [
    { title: "Mechanics", items: [{ latex: "F = ma", note: "Newton's second law" }, { latex: "E_k = \\frac{1}{2}mv^2" }] },
  ],
};

const parsed = parseFormulaSheet(stored, EXAM_A);
assert.ok(parsed, "valid sheet parses for its own exam");
assert.equal(parsed.title, "Approved formulas");
assert.equal(parsed.groups[0].items.length, 2);
assert.equal(parsed.exam_id, EXAM_A);

assert.equal(parseFormulaSheet(stored, EXAM_B), null, "sheet bound to another exam is refused");
assert.equal(parseFormulaSheet({ ...stored, enabled: false }, EXAM_A), null, "per-exam disable hides the sheet from candidates");
assert.equal(parseFormulaSheet(undefined, EXAM_A), null, "no sheet → null");
assert.equal(parseFormulaSheet({ ...stored, groups: [] }, EXAM_A), null, "empty groups rejected");
assert.equal(parseFormulaSheet({ ...stored, version: 99 }, EXAM_A), null, "unknown version rejected");
assert.equal(parseFormulaSheet({ ...stored, exam_id: undefined }, EXAM_A), null, "exam binding required");

// ── candidate + authoring wiring ─────────────────────────────────────────
const stateRoute = readFileSync("src/app/api/exam/state/route.ts", "utf8");
assert.ok(stateRoute.includes("parseFormulaSheet(settings.formula_sheet, exam.id)"), "candidate state API parses with the exam-id gate");

const takeExam = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
assert.ok(takeExam.includes("formulas-button"), "candidate header offers the formula toggle");
assert.ok(takeExam.includes("exam.formula_sheet"), "panel renders only when a sheet was delivered");
assert.ok(takeExam.includes("FormulaPanel"), "panel is rendered inside the attempt view (no navigation away)");
assert.ok(takeExam.includes("PlatformCredit"), "attribution stays on the candidate page");

const panel = readFileSync("src/app/take-exam/[attemptId]/FormulaPanel.tsx", "utf8");
assert.ok(panel.includes("sheet"), "panel consumes the delivered sheet");

const examActions = readFileSync("src/app/dashboard/exams/actions.ts", "utf8");
assert.ok(examActions.includes("formula_sheet"), "exam settings persist the sheet snapshot");
assert.ok(examActions.includes("exam.formula_sheet_enabled") && examActions.includes("exam.formula_sheet_disabled"), "enable/disable is audited");

const examCard = readFileSync("src/components/formulas/ExamFormulaSheetCard.tsx", "utf8");
assert.ok(examCard.includes("formula-enabled-toggle"), "per-exam enable/disable switch exists");
assert.ok(examCard.includes("library") || examCard.includes("Library"), "authoring card browses the exact-formula library");

const workspace = readFileSync("src/app/dashboard/exams/[id]/page.tsx", "utf8");
assert.ok(workspace.includes("ExamFormulaSheetCard"), "the real exam workspace hosts the card");
assert.ok(workspace.includes("formula_library"), "workspace loads the org library for exact selection");

const formulasPage = readFileSync("src/app/dashboard/formulas/page.tsx", "utf8");
assert.ok(formulasPage.includes("formula_library"), "organization formula library page exists");

const formulasActions = readFileSync("src/app/dashboard/formulas/actions.ts", "utf8");
assert.ok(formulasActions.includes("organization_id"), "library actions are tenant-scoped");

const chrome = readFileSync("src/components/dashboard/DashboardChrome.tsx", "utf8");
assert.ok(chrome.includes("/dashboard/formulas"), "library is reachable from workspace navigation");

console.log("formula-sheet: 34 checks passed");
