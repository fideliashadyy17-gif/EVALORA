// Version D mathematics examination checks: source-shape, question grouping,
// auto-grading, diagram specs, and input cursor stability. No database, no network.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

function compile(src, name, deps = {}) {
  const file = path.resolve(name);
  const m = new Module(file);
  const old = Module._load;
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  Module._load = function (request, parent) {
    if (parent?.filename === file && request in deps) return deps[request];
    return old.apply(this, arguments);
  };
  try {
    m._compile(ts.transpileModule(readFileSync(src, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, file);
    return m.exports;
  } finally {
    Module._load = old;
  }
}

const assessParts = compile('src/lib/assessParts.ts', 'scripts/__version_d_assess.cjs');
const scoring = compile('src/lib/scoring.ts', 'scripts/__version_d_scoring.cjs', {
  './assessParts': assessParts,
});
const criterionShares = compile('src/lib/criterionShares.ts', 'scripts/__version_d_crit_shares.cjs');
const live = compile('src/lib/live.ts', 'scripts/__version_d_live.cjs', {
  './assessParts': assessParts,
  './criterionShares': criterionShares,
  './responseTools': {
    responseWorkspaceFor: () => ({
      calculator: { enabled: true },
      tools: [],
      graph: { enabled: false },
      geometry: { enabled: false },
    }),
  },
  './examResults': { criterionTitle: () => null, normaliseCriterionShares: () => null },
  './matchDnd': { normaliseMatchMode: () => 'match' },
});

let checks = 0;
function test(name, fn) {
  fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const MIGRATION_PATH = 'supabase/migrations/20261119100000_myp4_grade9_first_term_summative_version_d.sql';

test('Version D migration file exists and is populated', () => {
  assert.ok(existsSync(MIGRATION_PATH), 'Migration file must exist');
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.ok(sql.length > 50000, 'Migration file must be substantial');
});

test('Version D examination and quiz identity', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const QUIZ_ID = 'cf000000-0000-4000-8000-000000000001';
  const EXAM_ID = 'cf000000-0000-4000-8000-000000000002';
  assert.ok(sql.includes(QUIZ_ID), 'Quiz ID must be present');
  assert.ok(sql.includes(EXAM_ID), 'Exam ID must be present');
  assert.ok(sql.includes('MYP Mathematics — Version D'), 'Exam title must be MYP Mathematics — Version D');
  assert.ok(sql.includes('duration_minutes, status, settings'), 'Exam columns must include status and settings');
});

test('Preservation of existing versions: Versions A, B, and C are not overwritten', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.equal(sql.includes('cb000000-0000-4000-8000-000000000001'), false, 'Version A quiz ID must not be overwritten');
  assert.equal(sql.includes('cb000000-0000-4000-8000-000000000002'), false, 'Version A exam ID must not be overwritten');
  assert.equal(sql.includes('c0900000-0000-4000-8000-000000000001'), false, 'Version B quiz ID must not be overwritten');
  assert.equal(sql.includes('c0900000-0000-4000-8000-000000000002'), false, 'Version B exam ID must not be overwritten');
  assert.equal(sql.includes('cd000000-0000-4000-8000-000000000001'), false, 'Version C quiz ID must not be overwritten');
  assert.equal(sql.includes('cd000000-0000-4000-8000-000000000002'), false, 'Version C exam ID must not be overwritten');
});

test('Total question records: exactly 42 records for 45 numbered questions, totaling 100 marks', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  // Match quiz_questions JSON elements
  const qqMatch = sql.match(/insert into quiz_questions[\s\S]+?from jsonb_array_elements\('([^']+)'::jsonb\)/);
  assert.ok(qqMatch, 'quiz_questions insert statement must be found');
  const items = JSON.parse(qqMatch[1]);
  assert.equal(items.length, 42, 'Must have exactly 42 question records in quiz_questions');
  const totalPoints = items.reduce((sum, item) => sum + item.m, 0);
  assert.equal(totalPoints, 100, 'Sum of marks must equal 100');

  // Verify positions: 1 to 14, 15, 19 to 45
  const positions = items.map((i) => i.n);
  assert.deepEqual(positions.slice(0, 15), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.equal(positions.includes(16), false, '16 must be absorbed into Q15 matching');
  assert.equal(positions.includes(17), false, '17 must be absorbed into Q15 matching');
  assert.equal(positions.includes(18), false, '18 must be absorbed into Q15 matching');
  assert.equal(positions[15], 19, 'Position after 15 must be 19');
  assert.equal(positions[positions.length - 1], 45, 'Last position must be 45');
});

test('Criterion totals sum to 100 marks (A: 32, B: 20, C: 24, D: 24)', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const critMatch = sql.match(/"criterion_totals":\s*\{"A":\s*(\d+),\s*"B":\s*(\d+),\s*"C":\s*(\d+),\s*"D":\s*(\d+)\}/);
  assert.ok(critMatch, 'criterion_totals must be in settings');
  const totals = {
    A: Number(critMatch[1]),
    B: Number(critMatch[2]),
    C: Number(critMatch[3]),
    D: Number(critMatch[4]),
  };
  assert.deepEqual(totals, { A: 32, B: 20, C: 24, D: 24 });
  assert.equal(totals.A + totals.B + totals.C + totals.D, 100);
});

test('Q15 is the single 4-mark matching question with 4 pairs (P–U keys: T, P, Q, R)', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.ok(sql.includes('"t":"matching"'));
  assert.ok(sql.includes('"question_label":"15–18"'));
  assert.ok(sql.includes('"match_mode":"letters"'));
  assert.ok(sql.includes('"letter_choices":["P","Q","R","S","T","U"]'));

  // Test scoring of the matching question
  const matchingQ = {
    type: 'matching',
    points: 4,
    config: {
      pairs: [
        { left: 'Diagram showing distribution shape while retaining every exact raw data value', right: 'T' },
        { left: 'Formula for frequency density when constructing an unequal-width histogram', right: 'P' },
        { left: 'Exact formula for the population standard deviation σ of N values', right: 'Q' },
        { left: 'Graph used to estimate median, quartiles and percentiles of grouped continuous data', right: 'R' },
      ],
    },
  };

  // Full score
  const full = scoring.scoreAnswer(matchingQ, [], {
    pairs: [
      { left: 'Diagram showing distribution shape while retaining every exact raw data value', right: 'T' },
      { left: 'Formula for frequency density when constructing an unequal-width histogram', right: 'P' },
      { left: 'Exact formula for the population standard deviation σ of N values', right: 'Q' },
      { left: 'Graph used to estimate median, quartiles and percentiles of grouped continuous data', right: 'R' },
    ],
  });
  assert.deepEqual(full, { isCorrect: true, points: 4 });

  // Partial score (2 of 4)
  const half = scoring.scoreAnswer(matchingQ, [], {
    pairs: [
      { left: 'Diagram showing distribution shape while retaining every exact raw data value', right: 'T' },
      { left: 'Formula for frequency density when constructing an unequal-width histogram', right: 'P' },
      { left: 'Exact formula for the population standard deviation σ of N values', right: 'S' },
      { left: 'Graph used to estimate median, quartiles and percentiles of grouped continuous data', right: 'U' },
    ],
  });
  assert.deepEqual(half, { isCorrect: false, points: 2 });

  // Case-insensitivity in matching
  const lowercase = scoring.scoreAnswer(matchingQ, [], {
    pairs: [
      { left: 'Diagram showing distribution shape while retaining every exact raw data value', right: 't' },
      { left: 'Formula for frequency density when constructing an unequal-width histogram', right: 'p' },
      { left: 'Exact formula for the population standard deviation σ of N values', right: 'q' },
      { left: 'Graph used to estimate median, quartiles and percentiles of grouped continuous data', right: 'r' },
    ],
  });
  assert.deepEqual(lowercase, { isCorrect: true, points: 4 });
});

test('Statistical diagrams and structured figures are accurately configured in prompt docs', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  // Q2 stem-and-leaf
  assert.ok(sql.includes('"kind":"stem_leaf"'));
  assert.ok(sql.includes('"Mental-maths quiz scores"'));
  assert.ok(sql.includes('"stemKey":"2 | 4 = 24 marks"'));

  // Q5 bar chart crop
  assert.ok(sql.includes('/exam-figures/myp4-a/q05.png'));

  // Q7 box plot
  assert.ok(sql.includes('"kind":"box_plot"'));
  assert.ok(sql.includes('"Box-and-whisker diagram"'));
  assert.ok(sql.includes('"fiveNumber":{"min":15,"q1":22,"median":30,"q3":40,"max":48}'));

  // Q21 cumulative frequency curve
  assert.ok(sql.includes('"kind":"cumulative_curve"'));
  assert.ok(sql.includes('"Lifetimes of 80 cells"'));

  // Q22 histogram
  assert.ok(sql.includes('"kind":"histogram"'));
  assert.ok(sql.includes('"Pebble masses"'));

  // Q30 mango ogive
  assert.ok(sql.includes('"Masses of 60 mangoes"'));

  // Q38 broadband chart
  assert.ok(sql.includes('Tobi\'\'s broadband-speed chart'));
  assert.ok(sql.includes('"chart":"bar_chart"'));

  // Q39 comparative box plot
  assert.ok(sql.includes('"Science scores (%) for Classes 9A and 9B"'));
  assert.ok(sql.includes('"label":"9A"'));
  assert.ok(sql.includes('"label":"9B"'));
});

test('Formula sheet is attached to Version D exam settings', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.ok(sql.includes('"formula_sheet"'));
  assert.ok(sql.includes('Formulas for this paper'));
  assert.ok(sql.includes('Averages'));
  assert.ok(sql.includes('Grouped data'));
  assert.ok(sql.includes('Median, quartiles and spread'));
  assert.ok(sql.includes('Cumulative frequency and coding'));
  assert.ok(sql.includes('cf000000-0000-4000-8000-000000000002'));
});

test('Response tools configured for constructed-response questions Q37 and Q38', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.ok(sql.includes('"response_requirement":"data_table"'));
  assert.ok(sql.includes('"response_requirement":"statistics"'));
  assert.ok(sql.includes('"response_stats":{"chart":"histogram"}'));
});

test('MathAnswerInput maintains selection tracking and inserts at exact caret position', () => {
  const code = readFileSync('src/components/MathAnswerInput.tsx', 'utf8');
  assert.ok(code.includes('lastSelectionRef'), 'Must keep selection ref for tracking cursor position');
  assert.ok(code.includes('recordSelection'), 'Must record selection on input events');
  assert.ok(code.includes('onSelect='), 'Must handle onSelect to update selection range');
  assert.ok(code.includes('onClick='), 'Must handle onClick to update selection range');
  assert.ok(code.includes('onKeyUp='), 'Must handle onKeyUp to update selection range');
  assert.ok(code.includes('onBlur='), 'Must handle onBlur so unfocused insertions still know target position');
});

console.log(`\n${checks} Version D examination checks passed.`);
