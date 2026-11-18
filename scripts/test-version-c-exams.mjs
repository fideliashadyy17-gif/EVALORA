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
  assert.deepEqual(scoring.scoreAnswer(q, [], { parts: { d: 6, u: 150, f: 'n' } }), { isCorrect: false, points: 1 });
  assert.deepEqual(scoring.scoreAnswer(q, [], { parts: { d: 6 } }), { isCorrect: false, points: 1 });
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

test('new top/bottom tile-grid style is accepted and rendered as a grid', () => {
  const spec = diagram.normaliseAssessDiagram({
    kind: 'grid_pattern', title: 'Courtyard',
    gridPatterns: [
      { label: 'Stage 1', cols: 2, rows: 3, style: 'top_bottom_border' },
      { label: 'Stage 2', cols: 3, rows: 4, style: 'top_bottom_border' },
    ],
  });
  assert.equal(spec.gridPatterns.length, 2);
  assert.equal(spec.gridPatterns[0].style, 'top_bottom_border');
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
