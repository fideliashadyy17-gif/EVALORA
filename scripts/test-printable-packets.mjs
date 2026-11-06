// Pure builders for the printable answer sheet, marker grid and candidate
// packets. No database, no JSX: the compiled module is loaded from a temp dir so
// the extensionless relative import resolves the same way it does in the app.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const outDir = path.join(os.tmpdir(), `evalora-packets-${process.pid}`);
mkdirSync(outDir, { recursive: true });
const compile = (source, target) => {
  const { outputText } = ts.transpileModule(readFileSync(source, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  writeFileSync(path.join(outDir, target), outputText);
};
compile('src/lib/grading.ts', 'grading.js');
compile('src/lib/printablePackets.ts', 'printablePackets.js');
writeFileSync(path.join(outDir, 'package.json'), '{"type":"commonjs"}');

const require = createRequire(import.meta.url);
const {
  answerLinesFor, buildAnswerSheet, buildCandidatePackets, buildMarkerGrid, PrintablePacketError,
} = require(path.join(outDir, 'printablePackets.js'));

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('  ✓ ' + name); };

const items = [
  { quiz_question_id: 'qq1', question_id: 'q1', type: 'single_choice', points: 2, options: [{}, {}, {}] },
  { quiz_question_id: 'qq2', question_id: 'q2', type: 'open_ended', points: 10, options: [] },
  { quiz_question_id: 'qq3', question_id: 'q3', type: 'short_answer', points: 4, options: [] },
  { quiz_question_id: 'qq4', question_id: 'q4', type: 'numeric', points: 1, options: [] },
];
const criteria = new Map([
  ['r-exam', [
    { id: 'c1', code: 'A1', label: 'Structure', maxMarks: 4 },
    { id: 'c2', code: 'A2', label: 'Evidence', maxMarks: 6 },
  ]],
  ['r-q2', [
    { id: 'c3', code: null, label: 'Names both stages', maxMarks: 5 },
    { id: 'c4', code: null, label: 'Explains the link', maxMarks: 5 },
  ]],
]);
const examLink = { id: 'l1', rubric_id: 'r-exam', question_id: null, grading_rubrics: { title: 'General essay' } };
const questionLink = { id: 'l2', rubric_id: 'r-q2', question_id: 'q2', grading_rubrics: { title: 'Photosynthesis' } };

await test('writing space follows the question type', async () => {
  assert.equal(answerLinesFor('open_ended'), 7);
  assert.equal(answerLinesFor('short_answer'), 4);
  assert.equal(answerLinesFor('numeric'), 2);
  assert.equal(answerLinesFor('single_choice'), 0);
  assert.equal(answerLinesFor('true_false'), 0);
});

await test('the answer sheet numbers every question and keeps its marks', async () => {
  const sheet = buildAnswerSheet(items);
  assert.deepEqual(sheet.map((row) => row.number), [1, 2, 3, 4]);
  assert.deepEqual(sheet.map((row) => row.points), [2, 10, 4, 1]);
});

await test('printed-option questions get boxes, written ones get lines', async () => {
  const sheet = buildAnswerSheet(items);
  assert.equal(sheet[0].kind, 'choices');
  assert.deepEqual(sheet[0].choiceLabels, ['A', 'B', 'C']);
  assert.equal(sheet[1].kind, 'lines');
  assert.equal(sheet[1].lines, 7);
  assert.equal(sheet[3].kind, 'lines');
  assert.equal(sheet[3].lines, 2);
});

await test('a choice question with no options still gets writing space', async () => {
  const sheet = buildAnswerSheet([{ quiz_question_id: 'qq', question_id: 'q', type: 'single_choice', points: 1, options: [] }]);
  assert.equal(sheet[0].kind, 'lines');
  assert.equal(sheet[0].lines, 2, 'the row must never be empty');
});

await test('the examination-level rubric applies to every question', async () => {
  const grid = buildMarkerGrid(items, [examLink], criteria);
  assert.equal(grid.length, 4);
  for (const row of grid) {
    assert.equal(row.rubricId, 'r-exam');
    assert.equal(row.level, 'exam');
    assert.equal(row.criteria.length, 2);
    assert.equal(row.criteriaTotal, 10);
    assert.equal(row.rubricTitle, 'General essay');
  }
});

await test('a question-level rubric overrides the examination rubric', async () => {
  const grid = buildMarkerGrid(items, [examLink, questionLink], criteria);
  assert.equal(grid[1].rubricId, 'r-q2');
  assert.equal(grid[1].level, 'question');
  assert.equal(grid[1].rubricTitle, 'Photosynthesis');
  assert.deepEqual(grid[1].criteria.map((c) => c.label), ['Names both stages', 'Explains the link']);
  assert.equal(grid[0].rubricId, 'r-exam', 'the other questions keep the general rubric');
});

await test('a question with no rubric still gets a single-mark row', async () => {
  const grid = buildMarkerGrid(items, [], criteria);
  assert.equal(grid.length, 4);
  for (const row of grid) {
    assert.equal(row.criteria.length, 0);
    assert.equal(row.rubricId, null);
    assert.equal(row.level, null);
  }
  assert.equal(grid[1].points, 10, 'the marker still sees what the question is worth');
});

await test('a criterion without a usable maximum is refused', async () => {
  const broken = new Map([['r-x', [{ id: 'cx', code: null, label: 'Broken', maxMarks: 0 }]]]);
  assert.throws(
    () => buildMarkerGrid(items, [{ id: 'l', rubric_id: 'r-x', question_id: null }], broken),
    (error) => error instanceof PrintablePacketError && /valid maximum/.test(error.message),
  );
});

const candidates = [
  { id: 'c-1', full_name: 'zoe adams', access_code: 'AAA111' },
  { id: 'c-2', full_name: 'Aaron Brown', access_code: 'BBB222' },
  { id: 'c-1', full_name: 'zoe adams', access_code: 'AAA111' },
  { id: 'c-3', full_name: 'Mary Chen', access_code: null },
];

await test('packets are ordered by name and never duplicated', async () => {
  const packets = buildCandidatePackets(candidates, items, [examLink], criteria);
  assert.deepEqual(packets.map((p) => p.candidate.full_name), ['Aaron Brown', 'Mary Chen', 'zoe adams']);
  assert.deepEqual(packets.map((p) => p.index), [0, 1, 2], 'index drives the page break');
});

await test('every packet carries the same sheet, grid and total', async () => {
  const packets = buildCandidatePackets(candidates, items, [examLink, questionLink], criteria);
  assert.equal(packets.length, 3);
  for (const packet of packets) {
    assert.equal(packet.answerSheet.length, 4);
    assert.equal(packet.markerGrid.length, 4);
    assert.equal(packet.totalMarks, 17);
    assert.equal(packet.markerGrid[1].rubricId, 'r-q2');
  }
});

await test('a candidate without an access code is still printable', async () => {
  const packets = buildCandidatePackets(candidates, items, [], criteria);
  const mary = packets.find((p) => p.candidate.full_name === 'Mary Chen');
  assert.equal(mary.candidate.access_code, null);
  assert.equal(mary.markerGrid[0].criteria.length, 0);
});

await test('no candidates means no packets, and says so', async () => {
  assert.throws(
    () => buildCandidatePackets([], items, [examLink], criteria),
    (error) => error instanceof PrintablePacketError && /no candidates/.test(error.message),
  );
});

await test('blank or duplicate ids are dropped before numbering', async () => {
  const packets = buildCandidatePackets(
    [{ id: '', full_name: 'Ghost' }, { id: 'c-9', full_name: 'Real Person' }],
    items, [], criteria,
  );
  assert.equal(packets.length, 1);
  assert.equal(packets[0].candidate.full_name, 'Real Person');
});

await test('marks are summed to two decimals', async () => {
  const odd = [{ quiz_question_id: 'a', question_id: 'q', type: 'numeric', points: 2.005, options: [] }];
  const packets = buildCandidatePackets([{ id: 'c', full_name: 'X' }], odd, [], criteria);
  assert.equal(packets[0].totalMarks, 2.01);
});

try {
  console.log(`\n${n} printable packet checks passed (pure builders).`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
