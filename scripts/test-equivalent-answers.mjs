// Equivalent-answer scoring at the question boundary: short answers and
// numeric entry use the same normalisation as multi-part answers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

function compile(src, name, deps = {}) {
  const file = path.resolve(name);
  const m = new Module(file);
  const old = Module._load;
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  Module._load = function (id, parent) {
    if (parent?.filename === file && id in deps) return deps[id];
    return old.apply(this, arguments);
  };
  try {
    m._compile(ts.transpileModule(readFileSync(src, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, file);
    return m.exports;
  } finally {
    Module._load = old;
  }
}

const assessParts = compile("src/lib/assessParts.ts", "scripts/__virtual_assess_parts_equivalent.cjs");
const { scoreAnswer } = compile("src/lib/scoring.ts", "scripts/__virtual_scoring_equivalent.cjs", { "./assessParts": assessParts });

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };

check("numeric entry accepts working, currency and comma decimals", () => {
  const q = { type: "numeric", points: 1, config: { numeric_answer: 24, tolerance: 0 } };
  assert.equal(scoreAnswer(q, [], { value: "18+6=24" }).points, 1);
  assert.equal(scoreAnswer(q, [], { value: "M25=4(25)+1=24" }).points, 1);
  assert.equal(scoreAnswer(q, [], { value: "$24" }).points, 1);
  const decimal = { type: "numeric", points: 1, config: { numeric_answer: 8.75, tolerance: 0.01 } };
  assert.equal(scoreAnswer(decimal, [], { value: "8,75" }).points, 1);
  assert.equal(scoreAnswer(q, [], { value: "8,75" }).points, 0);
});

check("short answers accept labels, equivalents, lists and one typo", () => {
  const short = (label, text, config = {}) => scoreAnswer(
    { type: "short_answer", points: 1, config },
    [{ id: "o1", label, is_correct: true }],
    { text },
  ).points;
  assert.equal(short("20-30", "modal class= 20-30"), 1);
  assert.equal(short("1/2", "1/2, 0.5, 4/8, 50%"), 1);
  assert.equal(short("0.5", "1/2"), 1);
  assert.equal(short("0.5", "50%"), 1);
  assert.equal(short("50", "0.5"), 0);
  assert.equal(short("solvent", "solvant"), 1);
  assert.equal(short("quantitative discrete", "quantitative discrite"), 1);
  assert.equal(short("quantitative discrete", "qualitative"), 0);
  assert.equal(short("1/2", "3/8"), 0);
});

check("expression short answers keep algebraic equivalence", () => {
  const config = { normalize_expression: true };
  const result = scoreAnswer(
    { type: "short_answer", points: 2, config },
    [{ id: "o1", label: "T=n^2", is_correct: true }],
    { text: "tn=n²" },
  );
  assert.deepEqual(result, { isCorrect: true, points: 2 });
});

console.log(`\nEquivalent-answer suite: ${checks} checks passed.`);
