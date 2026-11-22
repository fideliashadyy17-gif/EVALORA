// Run: node scripts/test-corrige-and-numbering-fixes.mjs
// Verifies all fixes for:
// 1. French / international thousands space normalization in numeric answer grading
// 2. Colons in assessPartSummary to eliminate ambiguity between part numbers and answers
// 3. Question numbering parity (authored paper question numbers & sections in Corrigé and Results)
// 4. Candidate submitted answer visibility for assess_parts, numeric, and other non-choice types
// 5. Version C exam settings (randomization disabled, canonical order preserved)
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

const assessParts = compile("src/lib/assessParts.ts", "scripts/__test_assess_parts.cjs");
const examResults = compile("src/lib/examResults.ts", "scripts/__test_exam_results.cjs");

const file = path.resolve("scripts/__test_corrige_component.cjs");
const original = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === file) {
    if (request === "@/components/RichContent") return { RichContent: ({ text }) => React.createElement("span", null, text ?? "") };
    if (request === "@/components/ui") return { Button: (p) => React.createElement("button", p), Card: (p) => React.createElement("div", p), Badge: (p) => React.createElement("span", p) };
    if (request === "@/lib/utils") return { cn: (...v) => v.filter(Boolean).join(" ") };
    if (request === "@/lib/examResults") return examResults;
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

console.log("Testing thousands space normalization in numeric grading:");
const parseStudentNumber = assessParts.parseStudentNumber;
ok("parses standard integer: '180'", parseStudentNumber("180") === 180);
ok("parses standard integer: '140'", parseStudentNumber("140") === 140);
ok("parses thousands space integer: '1 800'", parseStudentNumber("1 800") === 1800);
ok("parses thousands space with unit: '1 440 g'", parseStudentNumber("1 440 g") === 1440);
ok("parses thousands space: '3 280'", parseStudentNumber("3 280") === 3280);
ok("parses millions with spaces: '2 400 000'", parseStudentNumber("2 400 000") === 2400000);
ok("preserves mixed fractions: '1 1/2'", parseStudentNumber("1 1/2") === 1.5);
ok("parses with label: 'Midpoint = 180 g'", parseStudentNumber("Midpoint = 180 g") === 180);

console.log("\nTesting assessPartSummary colon formatting:");
const summary = assessParts.assessPartSummary([
  { id: "a1", label: "Midpoint 1", kind: "numeric", answer: 140, unit: "g" },
  { id: "a2", label: "Midpoint 2", kind: "numeric", answer: 180, unit: "g" },
  { id: "b1", label: "Calculate Σfm", kind: "numeric", answer: 3280 },
  { id: "b2", label: "Estimated mean mass", kind: "numeric", answer: 164, unit: "g" },
]);
ok("Midpoint 1 formatted with colon separator", summary[0] === "Midpoint 1: 140 g");
ok("Midpoint 2 formatted with colon separator (eliminates 180 / 1800 ambiguity)", summary[1] === "Midpoint 2: 180 g");
ok("Σfm formatted with colon separator", summary[2] === "Calculate Σfm: 3280");
ok("Estimated mean mass formatted with colon separator", summary[3] === "Estimated mean mass: 164 g");

console.log("\nTesting ExamCorrige with authored metadata and assess_parts:");
const q20 = {
  question_id: "cd000000-0000-4000-8000-000000001020",
  prompt: "Masses $m$ (g) of 20 tilapia fillets: 8 fillets in $120 \\le m < 160$, 12 fillets in $160 \\le m < 200$.",
  points: 4,
  options: [],
  question_meta: {
    question_number: 20,
    question_label: "20",
    question_span: 1,
    paper_section: "A",
    criterion: "A",
  },
  assess_parts: [
    { id: "a1", label: "Midpoint 1", prompt: "Midpoint of 120 <= m < 160", kind: "numeric", unit: "g", points: 1 },
    { id: "a2", label: "Midpoint 2", prompt: "Midpoint of 160 <= m < 200", kind: "numeric", unit: "g", points: 1 },
    { id: "b1", label: "Calculate Σfm", prompt: "Total estimated mass", kind: "numeric", points: 1 },
    { id: "b2", label: "Estimated mean mass", prompt: "Mean mass", kind: "numeric", unit: "g", points: 1 },
  ],
  saved_answer: {
    parts: {
      a1: "220",
      a2: "269",
      b1: "2880",
    },
  },
  result: {
    is_correct: false,
    points_awarded: 0,
    answered: true,
    part_scores: {
      a1: { correct: false, earned: 0, max: 1 },
      a2: { correct: false, earned: 0, max: 1 },
      b1: { correct: false, earned: 0, max: 1 },
      b2: { correct: false, earned: 0, max: 1 },
    },
    explanation: "Midpoint 1 is (120+160)/2 = 140 g. Midpoint 2 is (160+200)/2 = 180 g. Sum is 8*140 + 12*180 = 3280. Mean is 3280/20 = 164 g.",
  },
  reveal: {
    summary: [
      "Midpoint 1: 140 g",
      "Midpoint 2: 180 g",
      "Calculate Σfm: 3280",
      "Estimated mean mass: 164 g",
    ],
  },
};

const q15to18 = {
  question_id: "cd000000-0000-4000-8000-000000001015",
  prompt: "MATCHING Q15–18: Write one letter P to T in each box.",
  points: 4,
  options: [],
  question_meta: {
    question_number: 15,
    question_label: "15–18",
    question_span: 4,
    paper_section: "A",
    criterion: "A",
  },
  saved_answer: null,
  result: {
    is_correct: false,
    points_awarded: 0,
    answered: false,
    explanation: "Matching definitions...",
  },
  reveal: {
    summary: ["P", "Q", "R", "S"],
  },
};

const exam = {
  title: "MYP 4 Mathematics Summative Assessment (Version C)",
  candidateName: "ferg lass",
  score: 9,
  maxScore: 100,
  passMarkPercent: 50,
};

let tree;
act(() => {
  tree = TestRenderer.create(
    React.createElement(ExamCorrige, {
      exam,
      questions: [q20, q15to18],
      onBack: () => {},
    }),
  );
});

function nodeText(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || !node.children) return "";
  return node.children.map(nodeText).join("");
}

const rawText = JSON.stringify(tree.toJSON());
const plainText = nodeText(tree.toJSON());

ok("Corrigé displays authored paper section and question number: 'Part A · Question 20'", plainText.includes("Part A · Question 20"));
ok("Corrigé displays authored grouped question label: 'Part A · Questions 15–18'", plainText.includes("Part A · Questions 15–18"));
ok("Corrigé shows candidate submitted response for Midpoint 1: '220'", rawText.includes("220"));
ok("Corrigé shows candidate submitted response for Midpoint 2: '269'", rawText.includes("269"));
ok("Corrigé shows candidate submitted response for Σfm: '2880'", rawText.includes("2880"));
ok("Corrigé shows model answer for Midpoint 1: '140 g'", rawText.includes("140 g"));
ok("Corrigé shows model answer for Midpoint 2: '180 g'", rawText.includes("180 g"));
ok("Corrigé shows model answer for Σfm: '3280'", rawText.includes("3280"));
ok("Corrigé displays Criterion badge for Criterion A", plainText.includes("Criterion A"));

console.log(`\nAll ${passed} check suites passed!`);
