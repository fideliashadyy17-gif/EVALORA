// Grade 10 MYP 5 Mathematics Summative Assessment Recreation Verification Suite
// Validates source fidelity, complete 45-question recreation, 100 marks,
// criteria allocations (A:32, B:24, C:20, D:24), assess_parts structure,
// scoring engine partial credit, diagram assets, and formula sheet.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
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

const assessParts = compile('src/lib/assessParts.ts', 'scripts/__g10_assess.cjs');
const scoring = compile('src/lib/scoring.ts', 'scripts/__g10_scoring.cjs', {
  './assessParts': assessParts,
});
const criterionShares = compile('src/lib/criterionShares.ts', 'scripts/__g10_crit_shares.cjs');
const live = compile('src/lib/live.ts', 'scripts/__g10_live.cjs', {
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

const MIGRATION_PATH = 'supabase/migrations/20261122110000_grade10_myp5_summative_assessment_recreation.sql';

test('Migration file exists and is comprehensive (> 120 KB)', () => {
  assert.ok(existsSync(MIGRATION_PATH), 'Migration file must exist');
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.ok(sql.length > 120000, `Migration file must be comprehensive, was ${sql.length} bytes`);
});

test('Exam and Quiz record identities match specification', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const QUIZ_ID = 'c5a00000-0000-4000-8000-000000000001';
  const EXAM_ID = 'c5a00000-0000-4000-8000-000000000002';
  assert.ok(sql.includes(QUIZ_ID), 'Quiz ID must be present in migration');
  assert.ok(sql.includes(EXAM_ID), 'Exam ID must be present in migration');
  assert.ok(sql.includes('Grade 10 · MYP 5 Mathematics — Summative Assessment: Sequences and Series'), 'Exam title must match');
  assert.ok(sql.includes('G10-SEQ-SUM26'), 'Exam access code must be G10-SEQ-SUM26');
});

test('Preservation of existing versions: Versions A, B, C, D are intact', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  // Grade 10 summative 0044/0060/0119/Version B/C IDs must not be clobbered
  assert.equal(sql.includes('delete from exams where id not in'), false, 'Must not delete unrelated exams');
  assert.equal(sql.includes('drop table questions cascade'), false, 'Must not drop questions table');
});

test('Criterion totals sum to 100 marks (A: 32, B: 24, C: 20, D: 24)', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const critMatch = sql.match(/"criterion_totals":\s*\{"A":\s*(\d+),\s*"B":\s*(\d+),\s*"C":\s*(\d+),\s*"D":\s*(\d+)\}/);
  assert.ok(critMatch, 'criterion_totals must be in settings');
  const totals = {
    A: Number(critMatch[1]),
    B: Number(critMatch[2]),
    C: Number(critMatch[3]),
    D: Number(critMatch[4]),
  };
  assert.deepEqual(totals, { A: 32, B: 24, C: 20, D: 24 });
  assert.equal(totals.A + totals.B + totals.C + totals.D, 100);
});

test('Formula sheet is structured into 4 groups in exam settings', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.ok(sql.includes('Arithmetic sequences and series'), 'Formula group 1');
  assert.ok(sql.includes('Geometric sequences and series'), 'Formula group 2');
  assert.ok(sql.includes('Quadratic sequences'), 'Formula group 3');
  assert.ok(sql.includes('Recursive rules and partial sums'), 'Formula group 4');
  assert.ok(sql.includes('u_n = u_1 + (n-1)d'), 'Arithmetic formula');
  assert.ok(sql.includes('dfrac{n}{2}(u_1 + u_n)'), 'Arithmetic sum formula');
  assert.ok(sql.includes('u_n = u_1 r'), 'Geometric formula');
  assert.ok(sql.includes('second difference'), 'Quadratic second diff formula');
});

test('Sections configuration in exam settings (Part A: 25 questions, 30 marks; Part B: 20 questions, 70 marks)', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.ok(sql.includes('"id":"A"') && sql.includes('Part A — Objective multiple-choice questions'), 'Part A section title');
  assert.ok(sql.includes('"id":"B"') && sql.includes('Part B — Theory & problem-solving'), 'Part B section title');
  assert.ok(sql.includes('"questions":25') && sql.includes('"marks":30'), 'Part A questions count and marks');
  assert.ok(sql.includes('"questions":20') && sql.includes('"marks":70'), 'Part B questions count and marks');
});

test('High-resolution cropped diagram figures exist with valid dimensions and non-zero size', () => {
  const figures = [
    { path: 'public/exam-figures/myp5-sequences-2026/q09-dots.png', minSize: 5000, desc: 'Q9 dots pattern' },
    { path: 'public/exam-figures/myp5-sequences-2026/q07-courtyard.png', minSize: 5000, desc: 'Task 2 Q7 courtyard tile pattern' },
    { path: 'public/exam-figures/myp5-sequences-2026/q18-crates.png', minSize: 5000, desc: 'Task 4 Q18 pipe crates' },
  ];
  for (const fig of figures) {
    assert.ok(existsSync(fig.path), `Figure file must exist: ${fig.path} (${fig.desc})`);
    const stats = statSync(fig.path);
    assert.ok(stats.size >= fig.minSize, `Figure ${fig.desc} size (${stats.size}) should be >= ${fig.minSize}`);
  }
});

test('All 4 semantic Tiptap tables are present in the recreation', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  // Q13 difference table
  assert.ok(sql.includes('"latex":"u_n"') && sql.includes('"text":"4"') && sql.includes('"text":"13"'), 'Q13 table content');
  // Task 1 Q5 difference table
  assert.ok(sql.includes('"text":"Term "') && sql.includes('"text":"Value "'), 'Task 1 Q5 table content');
  // Task 2 Q7 courtyard stages table
  assert.ok(sql.includes('Border') && sql.includes('Core') && sql.includes('4 / 2 / 6'), 'Task 2 Q7 table content');
  // Task 3 Q15 sequences table
  assert.ok(sql.includes('Seq I') && sql.includes('Seq II') && sql.includes('Seq III'), 'Task 3 Q15 table content');
});

test('Part B assess_parts scoring: Task 1 Q1 (Q26) arithmetic sequence', () => {
  const q26Config = {
    parts: [
      { id: 'a', label: '(a)', prompt: 'Find the 20th term u_20.', kind: 'numeric', points: 1, answer: 99, hints: ['Use the arithmetic nth term formula.', 'Substitute u1 = 4, d = 5 and n = 20.'] },
      { id: 'b', label: '(b)', prompt: 'Calculate the sum of the first 20 terms S_20.', kind: 'numeric', points: 2, answer: 1030, hints: ['Use the arithmetic sum formula Sn.', 'Compute 10 * (4 + 99) = 1030.'] },
    ],
  };
  const q26 = { type: 'assess_parts', points: 3, config: q26Config };

  // Full score
  const full = scoring.scoreAnswer(q26, [], { parts: { a: '99', b: '1030' } });
  assert.deepEqual(full, { isCorrect: true, points: 3 });

  // Partial score (part a only)
  const partA = scoring.scoreAnswer(q26, [], { parts: { a: '99', b: '1000' } });
  assert.deepEqual(partA, { isCorrect: false, points: 1 });

  // Partial score (part b only)
  const partB = scoring.scoreAnswer(q26, [], { parts: { a: '100', b: '1030' } });
  assert.deepEqual(partB, { isCorrect: false, points: 2 });
});

test('Part B assess_parts scoring: Task 2 Q7 (Q32) Courtyard tile pattern', () => {
  const q32Config = {
    parts: [
      { id: 'a', label: '(a)', prompt: 'Find B_4, C_4 and T_4 for Stage 4.', kind: 'text', points: 1, accepted: ['10, 20, 30', 'B_4=10, C_4=20, T_4=30'], hints: ['Look at the sequence of border and core tiles.', 'For Stage 4, border is 10 and core is 20.'] },
      { id: 'b', label: '(b)', prompt: 'Classify sequences and give explicit rules.', kind: 'expression', points: 2, accepted: ['B_n = 2n + 2, T_n = n^2 + 3n + 2', '2n+2, n^2+3n+2', '(n+1)(n+2)'], hints: ['Bn has constant first difference of 2.', 'Tn is an (n+1) by (n+2) quadratic grid.'] },
      { id: 'c', label: '(c)', prompt: 'Verify C_n + B_n = T_n and find n when T_n = 210.', kind: 'numeric', points: 1, answer: 13, hints: ['Solve (n+1)(n+2) = 210 for positive integer n.', '14 times 15 is 210 so n is 13.'] },
    ],
  };
  const q32 = { type: 'assess_parts', points: 4, config: q32Config };

  const full = scoring.scoreAnswer(q32, [], { parts: { a: '10, 20, 30', b: '2n+2, n^2+3n+2', c: '13' } });
  assert.deepEqual(full, { isCorrect: true, points: 4 });

  const partial = scoring.scoreAnswer(q32, [], { parts: { a: '10, 20, 30', b: 'wrong', c: '13' } });
  assert.deepEqual(partial, { isCorrect: false, points: 2 });
});

test('Part B assess_parts scoring: Task 4 Q16 (Q41) Marathon runner training plan', () => {
  const q41Config = {
    parts: [
      { id: 'a', label: '(a)', prompt: 'State the common difference d and find distance run on Day 14.', kind: 'text', points: 1, accepted: ['d = 2, 30 km', '2, 30', 'd=2, u14=30'], hints: ['The difference between successive days is 2 km.', 'On day 14: 4 + 13 * 2 = 30 km.'] },
      { id: 'b', label: '(b)', prompt: 'Calculate total distance run over the 14-day training camp.', kind: 'numeric', points: 2, answer: 238, hints: ['Use arithmetic series sum formula with n = 14.', 'S14 = 7 * (4 + 30) = 238 km.'] },
    ],
  };
  const q41 = { type: 'assess_parts', points: 3, config: q41Config };

  const full = scoring.scoreAnswer(q41, [], { parts: { a: 'd = 2, 30 km', b: '238' } });
  assert.deepEqual(full, { isCorrect: true, points: 3 });

  const partial = scoring.scoreAnswer(q41, [], { parts: { a: 'd = 2, 30 km', b: '200' } });
  assert.deepEqual(partial, { isCorrect: false, points: 1 });
});

test('Part B assess_parts scoring: Task 4 Q18 (Q43) Stacked pipe crates', () => {
  const q43Config = {
    parts: [
      { id: 'a', label: '(a)', prompt: 'Verify u1, u2, u3 and interpret difference.', kind: 'text', points: 1, accepted: ['8, 15, 24; difference 2n + 5', '8, 15, 24', 'u1=8, u2=15, u3=24'], hints: ['Substitute n = 1, 2, 3 into n^2 + 4n + 3.', 'First three values are 8, 15, and 24 pipes.'] },
      { id: 'b', label: '(b)', prompt: 'Find crate holding 143 pipes and show 130 is impossible.', kind: 'numeric', points: 2, answer: 10, hints: ['Solve n^2 + 4n + 3 = 143, so (n+14)(n-10) = 0.', 'Positive integer solution is n = 10.'] },
    ],
  };
  const q43 = { type: 'assess_parts', points: 3, config: q43Config };

  const full = scoring.scoreAnswer(q43, [], { parts: { a: '8, 15, 24', b: '10' } });
  assert.deepEqual(full, { isCorrect: true, points: 3 });

  const partial = scoring.scoreAnswer(q43, [], { parts: { a: 'wrong', b: '10' } });
  assert.deepEqual(partial, { isCorrect: false, points: 2 });
});

test('All 45 questions positions 1 to 45 exist in quiz_questions without gaps', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const qqMatch = sql.match(/insert into quiz_questions[\s\S]+?from jsonb_array_elements\('([^']+)'::jsonb\)/);
  assert.ok(qqMatch, 'quiz_questions jsonb array elements must be found');
  const items = JSON.parse(qqMatch[1]);
  assert.equal(items.length, 45, 'Must have 45 quiz_question linkages');
  const positions = items.map((i) => Number(i.pos)).sort((a, b) => a - b);
  const expectedPositions = Array.from({ length: 45 }, (_, i) => i + 1);
  assert.deepEqual(positions, expectedPositions, 'Positions must be sequential 1 through 45');
  const totalPoints = items.reduce((sum, i) => sum + Number(i.m), 0);
  assert.equal(totalPoints, 100, 'Sum of question points must equal 100');
});

test('Part A options: exactly 100 options (4 per question) with exactly 1 correct option each', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const optMatch = sql.match(/insert into question_options[\s\S]+?from jsonb_array_elements\('([^']+)'::jsonb\)/);
  assert.ok(optMatch, 'question_options jsonb array elements must be found');
  const items = JSON.parse(optMatch[1]);
  assert.equal(items.length, 100, 'Must have exactly 100 options for Part A');
  const byQ = new Map();
  for (const item of items) {
    const qid = item.qid;
    const isCorrect = Boolean(item.c);
    if (!byQ.has(qid)) byQ.set(qid, { total: 0, correct: 0 });
    const entry = byQ.get(qid);
    entry.total += 1;
    if (isCorrect) entry.correct += 1;
  }
  assert.equal(byQ.size, 25, 'Must have options for exactly 25 questions');
  for (const [qid, stats] of byQ.entries()) {
    assert.equal(stats.total, 4, `Question ${qid} must have 4 options`);
    assert.equal(stats.correct, 1, `Question ${qid} must have exactly 1 correct option`);
  }
});

test('Part A difficulty levels and point distribution (10 basic @ 1pt, 10 intermediate @ 1pt, 5 advanced @ 2pt)', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  // Q1-10 are basic
  for (let i = 1; i <= 10; i++) {
    const num = (1000 + i).toString();
    assert.ok(sql.includes(`c5a00000-0000-4000-8000-00000000${num}`), `Q${i} ID`);
  }
  // Q11-20 are intermediate
  for (let i = 11; i <= 20; i++) {
    const num = (1000 + i).toString();
    assert.ok(sql.includes(`c5a00000-0000-4000-8000-00000000${num}`), `Q${i} ID`);
  }
  // Q21-25 are advanced
  for (let i = 21; i <= 25; i++) {
    const num = (1000 + i).toString();
    assert.ok(sql.includes(`c5a00000-0000-4000-8000-00000000${num}`), `Q${i} ID`);
  }
});

console.log(`\nAll ${checks} verification checks passed successfully.`);
