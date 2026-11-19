// Version C mathematics papers: source-shape checks, structured marking and
// answer-presence rules. No database, no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const assessParts = compile('src/lib/assessParts.ts', 'scripts/__version_c_assess.cjs');
const scoring = compile('src/lib/scoring.ts', 'scripts/__version_c_scoring.cjs', {
  './assessParts': assessParts,
});
const criterionShares = compile('src/lib/criterionShares.ts', 'scripts/__version_c_crit_shares.cjs');
const live = compile('src/lib/live.ts', 'scripts/__version_c_live.cjs', {
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
const presence = compile('src/lib/answerPresence.ts', 'scripts/__version_c_presence.cjs');
const diagram = compile('src/lib/assessDiagram.ts', 'scripts/__version_c_diagram.cjs');

let checks = 0;
function test(name, fn) {
  fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
}

test('answer presence distinguishes real zero/false from empty work', () => {
  assert.equal(presence.answerIsPresent({ value: 0 }), true);
  assert.equal(presence.answerIsPresent({ option_id: 'a' }), true);
  assert.equal(presence.answerIsPresent({ text: '  ' }), false);
  assert.equal(presence.answerIsPresent({ type: 'doc', content: [] }), false);
  assert.equal(presence.answerIsPresent({ parts: { a: { value: 0 } } }), true);
  assert.equal(presence.answerIsPresent({ parts: {} }), false);
});

test('assess-parts partial credit uses algebraic and numeric equivalence', () => {
  const config = {
    parts: [
      { id: 'd', label: '(i)', prompt: 'd', kind: 'numeric', points: 1, answer: 6, hints: ['Use the difference between terms.', 'Divide by the number of gaps.'] },
      { id: 'u', label: '(ii)', prompt: 'u25', kind: 'numeric', points: 1, answer: 149, tolerance: 0.01, hints: ['Find the first term first.', 'Substitute n = 25.'] },
      { id: 'f', label: '(iii)', prompt: 'rule', kind: 'expression', points: 2, accepted: ['4n-1', '4*n - 1'], hints: ['Find d and u1.', 'Write u1 + (n-1)d.'] },
    ],
  };
  const q = { type: 'assess_parts', points: 4, config };
  assert.deepEqual(scoring.scoreAnswer(q, [], { parts: { d: '6', u: '149.00', f: '4n − 1' } }), { isCorrect: true, points: 4 });
  assert.deepEqual(scoring.scoreAnswer(q, [], { parts: { d: 'd = 6', u: 'u25 = 149', f: '4n − 1' } }), { isCorrect: true, points: 4 });
  assert.deepEqual(scoring.scoreAnswer(q, [], { parts: { d: 6, u: 150, f: 'n' } }), { isCorrect: false, points: 1 });
  assert.deepEqual(scoring.scoreAnswer(q, [], { parts: { d: 6 } }), { isCorrect: false, points: 1 });
});

test('intelligent numerical answer grading handles labels, units, fractions, and context', () => {
  const numQ = {
    type: 'numeric',
    points: 2,
    config: { numeric_answer: 5, tolerance: 0 },
    prompt: 'State the minimum value.',
  };
  // Flexible input formats
  assert.deepEqual(scoring.scoreAnswer(numQ, [], { value: '5' }), { isCorrect: true, points: 2 });
  assert.deepEqual(scoring.scoreAnswer(numQ, [], { value: 'Min = 5' }), { isCorrect: true, points: 2 });
  assert.deepEqual(scoring.scoreAnswer(numQ, [], { value: 'The minimum is 5' }), { isCorrect: true, points: 2 });
  assert.deepEqual(scoring.scoreAnswer(numQ, [], { value: 'min: 5 cm' }), { isCorrect: true, points: 2 });
  assert.deepEqual(scoring.scoreAnswer(numQ, [], { value: 'Answer: 5' }), { isCorrect: true, points: 2 });
  assert.deepEqual(scoring.scoreAnswer(numQ, [], { value: 'x = 5' }), { isCorrect: true, points: 2 });

  // Anti-substring checks
  assert.deepEqual(scoring.scoreAnswer(numQ, [], { value: '15' }), { isCorrect: false, points: 0 });
  assert.deepEqual(scoring.scoreAnswer(numQ, [], { value: '50' }), { isCorrect: false, points: 0 });
  assert.deepEqual(scoring.scoreAnswer(numQ, [], { value: '-5' }), { isCorrect: false, points: 0 });
  assert.deepEqual(scoring.scoreAnswer(numQ, [], { value: '0.5' }), { isCorrect: false, points: 0 });
  assert.deepEqual(scoring.scoreAnswer(numQ, [], { value: '5.5' }), { isCorrect: false, points: 0 });

  // Conflicting choices fails closed
  assert.throws(() => scoring.scoreAnswer(numQ, [], { value: '5 or 6' }), scoring.ScoringError);

  // Invalid non-numeric input for numeric question fails closed with ScoringError
  assert.throws(() => scoring.scoreAnswer(numQ, [], { value: 'I do not know' }), scoring.ScoringError);

  // Multi-part context-aware mapping
  const statsConfig = {
    parts: [
      { id: 'mode', label: 'Mode', prompt: 'mode', kind: 'numeric', points: 1, answer: 18, hints: ['Find the most frequent score.', 'Look for the leaf that repeats.'] },
      { id: 'median', label: 'Median', prompt: 'median', kind: 'numeric', points: 1, answer: 26, hints: ['Find the middle of ordered scores.', 'Locate the 6th of 11 scores.'] },
    ],
  };
  const statsQ = { type: 'assess_parts', points: 2, config: statsConfig };
  assert.deepEqual(scoring.scoreAnswer(statsQ, [], {
    parts: {
      mode: 'Mode = 18, Median = 26',
      median: 'Mode = 18, Median = 26',
    },
  }), { isCorrect: true, points: 2 });
});

test('a plotted graph earns point-by-point partial credit', () => {
  const q = {
    type: 'assess_parts',
    points: 3,
    config: {
      parts: [
        { id: 'rule', label: '(ii)', prompt: 'explicit rule', kind: 'expression', points: 1, accepted: ['n^2'], hints: ['Compare u_n with n squared.', 'Check each term.'] },
      ],
      structured_marks: [{
        id: 'plot', label: '(i) plotted terms', tool: 'graph', mode: 'graph_points', points: 2,
        expected: { points: [{ x: 3, y: 9 }, { x: 4, y: 16 }] }, tolerance: 0.01, part: 'rule',
      }],
    },
  };
  const one = scoring.scoreAnswer(q, [], {
    parts: { rule: 'n^2' },
    working: { rule: { graph: { points: [{ x: 3, y: 9 }] } } },
  });
  assert.deepEqual(one, { isCorrect: false, points: 2 });
  const both = scoring.scoreAnswer(q, [], {
    parts: { rule: 'n^2' },
    working: { rule: { graph: { points: [{ x: 3, y: 9 }, { x: 3.99, y: 16.005 }] } } },
  });
  assert.deepEqual(both, { isCorrect: true, points: 3 });
  const missing = scoring.scoreAnswerDetailed(q, [], { parts: { rule: 'n^2' } });
  assert.equal(missing.structured[0].status, 'missing');
  assert.equal(missing.structured[0].earned, 0);
});

test('back-to-back stem-and-leaf marks each side in the printed order', () => {
  const rows = [
    { stem: '11', left: ['9', '8', '5'], right: [] },
    { stem: '12', left: ['8', '4', '2'], right: ['8', '9'] },
  ];
  const q = {
    type: 'open_ended', points: 3,
    config: { structured_marks: [{ id: 'stem', label: 'stem', tool: 'stem_leaf', mode: 'stem_leaf', points: 3, expected: { rows } }] },
  };
  const answer = {
    stem_leaf: {
      layout: 'back_to_back',
      rows: rows.map((row) => ({ stem: row.stem, leftLeaves: row.left.join(' '), rightLeaves: row.right.join(' ') })),
    },
  };
  assert.deepEqual(scoring.scoreAnswer(q, [], answer), { isCorrect: true, points: 3 });
  const reversed = { stem_leaf: { layout: 'back_to_back', rows: [{ stem: '11', leftLeaves: '5 8 9', rightLeaves: '' }, { stem: '12', leftLeaves: '8 4 2', rightLeaves: '8 9' }] } };
  const partial = scoring.scoreAnswer(q, [], reversed);
  assert.equal(partial.isCorrect, false);
  assert.ok(partial.points > 0 && partial.points < 3);
});

test('an unequal-width histogram is marked against frequencies, not drawn heights', () => {
  const q = {
    type: 'open_ended', points: 1,
    config: { structured_marks: [{
      id: 'hist', label: 'histogram', tool: 'statistics', mode: 'statistics', points: 1,
      expected: { chart: 'histogram', groups: [{ from: 0, to: 10, frequency: 12 }, { from: 10, to: 20, frequency: 18 }, { from: 20, to: 40, frequency: 20 }] },
    }] },
  };
  assert.deepEqual(scoring.scoreAnswer(q, [], { statistics: { chart: 'histogram', groups: [
    { from: 0, to: 10, frequency: 12 }, { from: 10, to: 20, frequency: 18 }, { from: 20, to: 40, frequency: 20 },
  ] } }), { isCorrect: true, points: 1 });
  assert.deepEqual(scoring.scoreAnswer(q, [], { statistics: { chart: 'bar_chart', groups: [] } }), { isCorrect: false, points: 0 });
});

test('individualized question randomization generates distinct, stable permutations with no duplicates or omissions', () => {
  // Generate 25 sample questions
  const mockRows = Array.from({ length: 25 }, (_, i) => ({
    id: `qq-${i + 1}`,
    points: 1,
    questions: {
      id: `q-${i + 1}`,
      type: 'single_choice',
      config: { paper_section: i < 20 ? 'A' : 'B' },
    },
  }));

  const orderA = live.randomizeQuestionRows(mockRows, 'exam-1:student-A');
  const orderB = live.randomizeQuestionRows(mockRows, 'exam-1:student-B');
  const orderC = live.randomizeQuestionRows(mockRows, 'exam-1:student-C');

  // Length preserved
  assert.equal(orderA.length, 25);
  assert.equal(orderB.length, 25);
  assert.equal(orderC.length, 25);

  // No duplicates and no missing questions
  assert.equal(new Set(orderA.map((r) => r.id)).size, 25);
  assert.equal(new Set(orderB.map((r) => r.id)).size, 25);
  assert.equal(new Set(orderC.map((r) => r.id)).size, 25);

  // Different students get different orders
  const diffA_B = orderA.some((r, idx) => r.id !== orderB[idx].id);
  const diffB_C = orderB.some((r, idx) => r.id !== orderC[idx].id);
  assert.equal(diffA_B, true, 'Student A and B must receive different question orders');
  assert.equal(diffB_C, true, 'Student B and C must receive different question orders');

  // Stability across refreshes/reconnects (same seed produces identical order)
  const orderAReloaded = live.randomizeQuestionRows(mockRows, 'exam-1:student-A');
  assert.deepEqual(orderA.map((r) => r.id), orderAReloaded.map((r) => r.id));
});

test('answer choice randomization shuffles multiple choice while preserving keys and avoiding order-dependent types', () => {
  const mcRow = {
    id: 'qq-1',
    points: 1,
    questions: {
      id: 'q-mc',
      type: 'single_choice',
      prompt: 'Sample question',
      config: {},
      question_options: [
        { id: 'opt-1', label: 'Option 1', is_correct: false },
        { id: 'opt-2', label: 'Option 2', is_correct: true },
        { id: 'opt-3', label: 'Option 3', is_correct: false },
        { id: 'opt-4', label: 'Option 4', is_correct: false },
      ],
    },
  };

  const pubA = live.publicQuestion(mcRow, { randomizeOptions: true, seed: 'attempt-A' });
  const pubB = live.publicQuestion(mcRow, { randomizeOptions: true, seed: 'attempt-B' });

  // Option count preserved
  assert.equal(pubA.options.length, 4);
  assert.equal(pubB.options.length, 4);
  // All option IDs preserved
  assert.equal(new Set(pubA.options.map((o) => o.id)).size, 4);

  // Stability for same attempt
  const pubAReload = live.publicQuestion(mcRow, { randomizeOptions: true, seed: 'attempt-A' });
  assert.deepEqual(pubA.options.map((o) => o.id), pubAReload.options.map((o) => o.id));

  // True/False must NOT be randomized
  const tfRow = {
    id: 'qq-tf',
    points: 1,
    questions: {
      id: 'q-tf',
      type: 'true_false',
      prompt: 'Sample statement',
      config: {},
      question_options: [
        { id: 'opt-t', label: 'True', is_correct: true },
        { id: 'opt-f', label: 'False', is_correct: false },
      ],
    },
  };
  const pubTf = live.publicQuestion(tfRow, { randomizeOptions: true, seed: 'attempt-A' });
  assert.equal(pubTf.options[0].id, 'opt-t');
  assert.equal(pubTf.options[1].id, 'opt-f');

  // "All of the above" must NOT be randomized
  const allAboveRow = {
    id: 'qq-all',
    points: 1,
    questions: {
      id: 'q-all',
      type: 'single_choice',
      prompt: 'Sample',
      config: {},
      question_options: [
        { id: 'opt-a', label: 'Fact A', is_correct: false },
        { id: 'opt-b', label: 'Fact B', is_correct: false },
        { id: 'opt-c', label: 'All of the above', is_correct: true },
      ],
    },
  };
  const pubAll = live.publicQuestion(allAboveRow, { randomizeOptions: true, seed: 'attempt-A' });
  assert.equal(pubAll.options[2].id, 'opt-c');
});

for (const [label, file, prefix] of [
  ['Grade 9 Version C', 'supabase/migrations/20261118054730_myp4_grade9_statistics_version_c.sql', 'cd000000-0000-4000-8000-'],
  ['Grade 10 Version C', 'supabase/migrations/20261118054739_myp5_grade10_sequences_version_c.sql', 'ce000000-0000-4000-8000-'],
]) {
  test(`${label}: 34 questions, 100 marks and untouched existing papers`, () => {
    const sql = readFileSync(file, 'utf8');
    assert.match(sql, new RegExp(prefix.replace(/-/g, '\\-') + '000000000002'));
    assert.equal((sql.match(/\{"n":\d+,"m":\d+\}/g) ?? []).length, 34);
    const marks = (sql.match(/\{"n":\d+,"m":(\d+)\}/g) ?? []).reduce((sum, row) => sum + Number(row.match(/"m":(\d+)/)[1]), 0);
    assert.equal(marks, 100);
    assert.equal(sql.includes('cc000000-0000-4000-8000-'), false, 'Version B identifiers must not be reused');
    assert.equal(sql.includes('cb000000-0000-4000-8000-'), false, 'MYP4 term-1 identifiers must not be reused');
    assert.equal(sql.includes('insert into quizzes'), true);
    assert.equal(sql.includes('structured_marks'), true);
    assert.equal(sql.includes('source_reference'), true);
    assert.equal((sql.match(/on conflict \(id\) do nothing/g) ?? []).length >= 2, true);
  });
}

console.log(`\n${checks} Version C examination checks passed (source shape, structured marking, presence).`);
