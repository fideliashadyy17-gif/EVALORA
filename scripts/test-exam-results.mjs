// Run: node scripts/test-exam-results.mjs
// Pure tests for the post-submission corrigé helpers (src/lib/examResults.ts).
// The rule under test: once results are published, EVERY question of the paper
// carries a result and its worked solution — including blank ones, which are
// worth zero marks and must never be reported as "Incorrect".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const source = readFileSync("src/lib/examResults.ts", "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const file = path.resolve("scripts/__virtual_exam_results_test.cjs");
const virtual = new Module(file);
virtual.filename = file;
virtual.paths = Module._nodeModulePaths(path.dirname(file));
virtual._compile(js, file);
const { buildExamResult, selectedOptionIds, optionMarkings, resultLabel, answerKeyLine } = virtual.exports;

let passed = 0;
function ok(name, condition) {
  assert.ok(condition, name);
  console.log(`  ✓ ${name}`);
  passed++;
}

const KEY = ["opt-b"];
const EXPLANATION = "Median of an even set is the mean of the two middle values, so (8 + 10) / 2 = 9.";

/* ── Blank question ── */
const blank = buildExamResult({ saved: null, correctOptionIds: KEY, explanation: EXPLANATION });
ok("blank: answered is false", blank.answered === false);
ok("blank: zero marks awarded", blank.points_awarded === 0);
ok("blank: not correct, but not an error either", blank.is_correct === false);
ok("blank: no option is reported as chosen", blank.selected_option_ids.length === 0);
ok("blank: the key is still published", blank.correct_option_ids.join() === "opt-b");
ok("blank: the document's explanation is still published", blank.explanation === EXPLANATION);
ok("blank: the label reads \"Not answered · 0 / 1 point\"", resultLabel(blank, 1) === "Not answered · 0 / 1 point");
ok("blank: the label never says Incorrect", !/Incorrect/i.test(resultLabel(blank, 1)));
ok("blank: plural points are handled", resultLabel(blank, 2) === "Not answered · 0 / 2 points");
ok("blank: only the correct option is marked green", JSON.stringify(optionMarkings(blank)) === JSON.stringify({ "opt-b": "correct" }));

/* ── Answered, wrong ── */
const wrong = buildExamResult({
  saved: { is_correct: false, points_awarded: 0, answer: { option_id: "opt-a" } },
  correctOptionIds: KEY,
  explanation: EXPLANATION,
});
ok("wrong: answered is true", wrong.answered === true);
ok("wrong: the chosen option is reported", wrong.selected_option_ids.join() === "opt-a");
ok("wrong: the label reads \"Incorrect · 0 / 1 point\"", resultLabel(wrong, 1) === "Incorrect · 0 / 1 point");
ok("wrong: chosen-and-wrong plus the correct option are marked",
  JSON.stringify(optionMarkings(wrong)) === JSON.stringify({ "opt-b": "correct", "opt-a": "wrong" }));

/* ── Answered, right ── */
const right = buildExamResult({
  saved: { is_correct: true, points_awarded: "1", answer: { option_id: "opt-b" } },
  correctOptionIds: KEY,
  explanation: EXPLANATION,
});
ok("right: numeric points are coerced from the database string", right.points_awarded === 1);
ok("right: the label reads \"Correct · 1 / 1 point\"", resultLabel(right, 1) === "Correct · 1 / 1 point");
ok("right: the correct option stays green, never red", JSON.stringify(optionMarkings(right)) === JSON.stringify({ "opt-b": "correct" }));

/* ── Manual marking still pending ── */
const pending = buildExamResult({ saved: { is_correct: null, points_awarded: null, answer: { text: "12" } }, correctOptionIds: [] });
ok("pending: an unmarked answer says it awaits the examiner", resultLabel(pending, 4) === "Awaiting manual marking by your examiner.");
ok("pending: an unmarked answer awards nothing yet", pending.points_awarded === null);

/* ── Saved answer payload shapes ── */
ok("multi-select answers are read from option_ids", selectedOptionIds({ option_ids: ["x", "y"] }).join() === "x,y");
ok("single answers are read from option_id", selectedOptionIds({ option_id: "x" }).join() === "x");
ok("non-string ids are dropped", selectedOptionIds({ option_ids: ["x", 3, null] }).join() === "x");
ok("a missing answer yields no choices", selectedOptionIds(null).length === 0 && selectedOptionIds(undefined).length === 0);
ok("an empty markings input is harmless", Object.keys(optionMarkings(null)).length === 0 && Object.keys(optionMarkings(undefined)).length === 0);

/* ── Answer key line ── */
ok("answer key line names the correct letter", answerKeyLine(["B"]) === "Correct answer: B");
ok("multi-key papers list every accepted answer", answerKeyLine(["B", "D"]) === "Correct answer: B, D");
ok("blank keys render nothing", answerKeyLine([]) === null && answerKeyLine(null) === null && answerKeyLine(undefined) === null);
ok("blank key strings are ignored", answerKeyLine(["", "  "]) === null);

/* ── The API contract this depends on ── */
const route = readFileSync("src/app/api/exam/state/route.ts", "utf8");
ok("state route reveals answers only after submission AND publication",
  /const reveal = submitted && resultsPublished \? answerReveal\(row\) : null;/.test(route));
ok("state route builds a result for every question, not only saved ones",
  /result: reveal\s*\n?\s*\? buildExamResult\(\{/.test(route) && !/submitted && resultsPublished && s\s*\n?\s*\? \{ is_correct/.test(route));

const runner = readFileSync("src/components/QuestionRunner.tsx", "utf8");
ok("the question runner accepts post-submission markings", /markings\?: Record<string, "correct" \| "wrong">;/.test(runner));
ok("marked options win over the plain selected styling", /if \(mark === "correct"\) return/.test(runner) && /if \(mark === "wrong"\) return/.test(runner));

const client = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
ok("the exam screen marks every option from the published result", /markings=\{currentMarkings\}/.test(client));
ok("the exam screen shows the correct answer line", /currentKeyLine/.test(client));
ok("the exam screen counts the blank questions instead of hiding them", /left blank \(0 marks\)/.test(client));
ok("a blank question is painted neutrally, not as a failure", /result\.answered === false\) return "border/.test(client));
ok("the navigator marks every question after publication", /showCorrige \? `Corrigé/.test(client));

console.log(`\n${passed} checks passed.`);
