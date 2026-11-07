// Unit checks for AB/BC track selection (src/lib/examTrack.ts). Pure logic, no DB.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('src/lib/examTrack.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const dir = mkdtempSync(path.join(tmpdir(), 'exam-track-'));
const file = path.join(dir, 'examTrack.cjs');
writeFileSync(file, source);
const {paperForTrack, parseTrack, trackSelectionEnabled} = (await import(file)).default ?? (await import(file));

// Paper: items 1–44 plain, 45–50 flagged bc_only (as in migration 0058).
const paper = Array.from({length: 50}, (_, i) => ({
  id: `row-${i + 1}`,
  questions: {config: i + 1 >= 45 ? {bc_only: true, source: 'ap'} : {bc_only: false, source: 'ap'}},
}));

assert.equal(paperForTrack(paper, 'BC').length, 50, 'BC gets all 50 items');
const ab = paperForTrack(paper, 'AB');
assert.equal(ab.length, 44, 'AB gets 44 items');
assert.deepEqual(ab.map((r) => r.id), paper.slice(0, 44).map((r) => r.id), 'AB keeps stored order 1–44');
assert.ok(!ab.some((r) => r.questions.config.bc_only), 'AB never receives a bc_only item');

// Rows without config (non-AP quizzes) are untouched for both tracks.
const plain = [{id: 'a', questions: {config: null}}, {id: 'b', questions: {}}];
assert.equal(paperForTrack(plain, 'AB').length, 2);
assert.equal(paperForTrack(plain, 'BC').length, 2);

assert.equal(trackSelectionEnabled({track_selection: true}), true);
assert.equal(trackSelectionEnabled({track_selection: false}), false);
assert.equal(trackSelectionEnabled({}), false, 'exams without the flag are unchanged');
assert.equal(trackSelectionEnabled(null), false);
assert.equal(parseTrack('AB'), 'AB');
assert.equal(parseTrack('BC'), 'BC');
assert.equal(parseTrack('ab'), null);
assert.equal(parseTrack(undefined), null);

console.log('exam-track: 12 checks passed');
