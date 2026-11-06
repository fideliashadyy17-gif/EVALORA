// Run: node scripts/test-exam-corrige.mjs
// Renders the real one-page corrigé (src/components/ExamCorrige.tsx) with the
// real marking rules, and checks that all 50 questions are marked — including
// the 48 the candidate left blank.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function compile(source, dest) {
  const file = path.resolve(dest);
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(
    ts.transpileModule(readFileSync(source, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    file,
  );
  return mod.exports;
}

const results = compile("src/lib/examResults.ts", "scripts/__corrige_results.cjs");
const file = path.resolve("scripts/__corrige_component.cjs");
const original = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === file) {
    if (request === "@/components/RichContent") return { RichContent: ({ text }) => React.createElement("span", null, text ?? "") };
    if (request === "@/components/ui") return { Button: (p) => React.createElement("button", p), Card: (p) => React.createElement("div", p), Badge: (p) => React.createElement("span", p) };
    if (request === "@/lib/utils") return { cn: (...v) => v.filter(Boolean).join(" ") };
    if (request === "@/lib/examResults") return results;
  }
  return original.apply(this, arguments);
};
const { ExamCorrige } = compile("src/components/ExamCorrige.tsx", file);
Module._load = original;

let passed = 0;
function ok(name, condition) {
  assert.ok(condition, name);
  console.log(`  ✓ ${name}`);
  passed++;
}

const KEY = ["opt-b"];
function question(index, { saved = null, correct = false } = {}) {
  return {
    question_id: `q${index}`,
    prompt: `Question ${index} prompt text`,
    points: 1,
    options: [
      { id: "opt-a", label: "Answer A" },
      { id: "opt-b", label: "Answer B" },
      { id: "opt-c", label: "Answer C" },
      { id: "opt-d", label: "Answer D" },
    ],
    result: results.buildExamResult({
      saved: saved ? { is_correct: correct, points_awarded: correct ? 1 : 0, answer: saved } : null,
      correctOptionIds: KEY,
      explanation: `Worked solution for question ${index}.`,
    }),
    reveal: { correct_option_ids: KEY, summary: ["B"] },
  };
}

const questions = [
  question(1, { saved: { option_id: "opt-b" }, correct: true }),
  question(2, { saved: { option_id: "opt-a" } }),
  ...Array.from({ length: 48 }, (_, i) => question(i + 3)),
];

const exam = { title: "Summative Assessment — Grade 9", candidateName: "Arena Corrige", score: 1, maxScore: 50, passMarkPercent: 50 };
let printed = 0;
globalThis.window = { print: () => { printed++; } };

let tree;
await act(async () => {
  tree = TestRenderer.create(React.createElement(ExamCorrige, { exam, questions, onBack: () => {} }));
});
const text = JSON.stringify(tree.toJSON());

/* ── Every question is present ── */
const labels = text.match(/Question \d+/g) ?? [];
ok("the page lists all 50 questions", labels.length === 50);
ok("the last question is number 50", text.includes("Question 50") && !text.includes("Question 51"));
ok("every prompt is printed", questions.every((q) => text.includes(q.prompt)));
ok("every question shows its four options", (text.match(/Answer [ABCD]/g) ?? []).length === 200);

/* ── Blank questions are marked, not hidden ── */
ok("48 blank questions read \"Not answered · 0 / 1 point\"", (text.match(/Not answered · 0 \/ 1 point/g) ?? []).length === 48);
ok("a blank question is never called Incorrect", (text.match(/Incorrect · /g) ?? []).length === 1);
ok("the single wrong answer is the only \"Incorrect\"", text.includes("Incorrect · 0 / 1 point") && text.includes("Correct · 1 / 1 point"));
ok("the summary counts blanks instead of omitting them", text.includes("1 correct · 2 answered · 48 left blank (0 marks)"));

/* ── The marking scheme itself ── */
ok("the answer key line is printed for all 50", (text.match(/Correct answer: B/g) ?? []).length === 50);
ok("the correct option is marked in every question", (text.match(/Correct answer"/g) ?? []).length === 50);
ok("only the chosen wrong option carries the ✗ mark", (text.match(/Your answer, incorrect/g) ?? []).length === 1);
ok("the document's worked solution is printed for all 50", questions.every((q) => text.includes(`Worked solution for question ${q.question_id.slice(1)}.`)));
const bare = [{ ...question(1), result: { ...question(1).result, explanation: null, explanation_doc: null } }];
let bareTree;
await act(async () => {
  bareTree = TestRenderer.create(React.createElement(ExamCorrige, { exam, questions: bare, onBack: () => {} }));
});
const bareText = JSON.stringify(bareTree.toJSON());
await act(() => bareTree.unmount());
ok("a paper missing a solution says so instead of inventing one", bareText.includes("This question carries no written solution in the paper."));
ok("a missing solution is not invented from the answer key", !bareText.includes("Worked solution"));

/* ── Score, controls, printing ── */
ok("the score is shown", text.includes("1 / 50") && text.includes("2.0%") && text.includes("pass mark 50%"));
const buttons = tree.root.findAllByType("button");
const printButton = buttons.find((b) => JSON.stringify(b.props.children) === JSON.stringify("Print / PDF"));
const backButton = buttons.find((b) => JSON.stringify(b.props.children).includes("Back to the questions"));
ok("the corrigé offers a Print / PDF action", Boolean(printButton));
ok("the corrigé offers a way back to the questions", Boolean(backButton));
await act(async () => printButton.props.onClick());
ok("the print action calls window.print", printed === 1);
ok("the block is exposed to the existing print stylesheet", text.includes("paper-print") && text.includes("paper-question"));
await act(() => tree.unmount());

/* ── The exam screen wires it in ── */
const client = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
ok("the results card opens the full corrigé", /setCorrigeAll\(true\)/.test(client) && /Voir le corrigé complet/.test(client));
ok("the full corrigé only renders once results are published", /corrigeAll && showCorrige \?/.test(client) && /const showCorrige = submitted && attempt\.results_published;/.test(client));
ok("the single-question view steps aside for the full corrigé", /submitted && !corrigeAll/.test(client) && /current && !corrigeAll/.test(client));
ok("the exam screen hides its chrome when printing", /print:hidden/.test(client));
const component = readFileSync("src/components/ExamCorrige.tsx", "utf8");
ok("the corrigé reuses the shipped marking rules", /from "@\/lib\/examResults"/.test(component) && /optionMarkings\(question\.result/.test(component) && /resultLabel\(question\.result/.test(component) && /answerKeyLine\(question\.reveal/.test(component));
ok("the corrigé never re-implements correctness", !/is_correct === true \? "Correct"/.test(component));

console.log(`\n${passed} checks passed.`);
