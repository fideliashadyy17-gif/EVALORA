// G10 Examination import checks (supabase/migrations/0060_g10_examination.sql).
// Loads the exact question payload from the migration and runs it through the platform's own
// publication rules (src/lib/questionValidation.ts) and scorer (src/lib/scoring.ts).
// Database-level counts were rehearsed separately in PGlite (replay of 0001–0060).
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const load = (file) => {
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const dir = mkdtempSync(path.join(tmpdir(), 'g10-import-'));
  const out = path.join(dir, path.basename(file, '.ts') + '.cjs');
  writeFileSync(out, source);
  return import(out);
};
const validation = await load('src/lib/questionValidation.ts');
const scoring = await (async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'g10-import-'));
  for (const [f, out] of [['src/lib/assessParts.ts', 'assessParts.js'], ['src/lib/scoring.ts', 'scoring.cjs']]) {
    const source = ts.transpileModule(readFileSync(f, 'utf8'), {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
    }).outputText;
    writeFileSync(path.join(dir, out), source);
  }
  return import(path.join(dir, 'scoring.cjs'));
})();
const {questionPublishIssues} = validation.default ?? validation;
const {scoreAnswer} = scoring.default ?? scoring;

const sql = readFileSync('supabase/migrations/0060_g10_examination.sql', 'utf8');
const match = sql.match(/v_items jsonb := \$zj\$([\s\S]*?)\$zj\$::jsonb/);
assert.ok(match, 'payload literal not found in 0060');
const items = JSON.parse(match[1]);

let count = 0;
const test = (name, fn) => { fn(); count++; console.log(`  ✓ ${name}`); };

test('105 scored parts, each with a prompt and a valid publication state', () => {
  assert.equal(items.length, 105);
  for (const item of items) {
    assert.ok(String(item.prompt).trim(), `empty prompt at position ${item.position}`);
    assert.deepEqual(questionPublishIssues({type: item.type, prompt: item.prompt, points: item.points, options: item.options, config: item.config}), [],
      `publication issues at position ${item.position} (${item.config.question_number}${item.config.part})`);
  }
});

test('printed marks: each question sums to its printed total, overall 100', () => {
  const byQuestion = new Map();
  for (const item of items) {
    const n = item.config.question_number;
    byQuestion.set(n, (byQuestion.get(n) ?? 0) + Number(item.points));
  }
  assert.equal(byQuestion.size, 50);
  for (const item of items) {
    const n = item.config.question_number;
    assert.equal(Math.round(byQuestion.get(n) * 100), Math.round(item.config.printed_question_marks * 100), `Q${n}`);
  }
  const total = items.reduce((sum, item) => sum + Number(item.points), 0);
  assert.equal(Math.round(total * 100), 10000);
});

test('chapter totals match the paper: 16/11/16/19/20/18 marks across 9/7/9/8/9/8 questions', () => {
  const chapters = new Map();
  for (const item of items) {
    const c = chapters.get(item.config.chapter) ?? {questions: new Set(), marks: 0};
    c.questions.add(item.config.question_number);
    c.marks += Number(item.points);
    chapters.set(item.config.chapter, c);
  }
  const expected = [
    ['Recursive and explicit formulas', 9, 16], ['Linear sequences', 7, 11], ['Arithmetic sequences', 9, 16],
    ['Quadratic sequences', 8, 19], ['Geometric sequences', 9, 20], ['Arithmetic series', 8, 18],
  ];
  for (const [name, questions, marks] of expected) {
    const c = chapters.get(name);
    assert.ok(c, name);
    assert.equal(c.questions.size, questions, `${name} questions`);
    assert.equal(Math.round(c.marks * 100), marks * 100, `${name} marks`);
  }
});

test('interaction types: sort and match modes, ordering, numeric and manual parts', () => {
  const modeOf = (n) => items.find((i) => i.config.question_number === n).config.match_mode;
  for (const n of [6, 13, 30, 39]) assert.equal(modeOf(n), 'sort', `Q${n} should be sort mode`);
  for (const n of [2, 16, 19, 36, 49]) assert.equal(modeOf(n), 'match', `Q${n} should be match mode`);
  const types = items.reduce((acc, i) => ({...acc, [i.type]: (acc[i.type] ?? 0) + 1}), {});
  assert.deepEqual(types, {numeric: 60, open_ended: 33, ordering: 3, matching: 9});
});

test('every auto-marked key scores full marks when answered exactly', () => {
  for (const item of items) {
    if (item.type === 'open_ended') continue;
    const options = (item.options ?? []).map((o, i) => ({id: `o${i}`, label: o.label, is_correct: o.is_correct}));
    const question = {type: item.type, points: item.points, config: item.config};
    let answer;
    if (item.type === 'numeric') answer = {value: item.config.numeric_answer};
    else if (item.type === 'ordering') answer = {order: options.map((o) => o.label)};
    else answer = {pairs: item.config.pairs};
    const result = scoreAnswer(question, options, answer);
    assert.equal(result.isCorrect, true, `Q${item.config.question_number}${item.config.part}`);
    assert.equal(result.points, Number(item.points));
  }
});

test('wrong numeric answers score zero; manual parts are not auto-scored', () => {
  const numeric = items.find((i) => i.type === 'numeric' && i.config.question_number === 3);
  assert.equal(scoreAnswer({type: 'numeric', points: numeric.points, config: numeric.config}, [], {value: 84}).points, 0);
  const open = items.find((i) => i.type === 'open_ended');
  assert.deepEqual(scoreAnswer({type: 'open_ended', points: open.points, config: open.config}, [], {text: 'x'}), {isCorrect: null, points: 0});
});

test('partial credit for a sort with one tile misplaced is proportional', () => {
  const sortItem = items.find((i) => i.config.question_number === 6);
  const wrong = sortItem.config.pairs.map((p, i) => (i === 0 ? {left: p.left, right: 'List only (no rule)'} : p));
  const result = scoreAnswer({type: 'matching', points: sortItem.points, config: sortItem.config}, [], {pairs: wrong});
  assert.equal(result.isCorrect, false);
  assert.equal(Math.round(result.points * 100), Math.round((Number(sortItem.points) * 5 / 6) * 100));
});

console.log(`\n${count} G10 examination import checks passed.`);
