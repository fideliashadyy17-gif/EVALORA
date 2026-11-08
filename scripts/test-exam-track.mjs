// Unit checks for AB/BC track selection (src/lib/examTrack.ts). Pure logic, no DB.
// The track comes from the candidate's class in the database, never from the browser.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const compile = (src) => ts.transpileModule(src, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const dir = mkdtempSync(path.join(tmpdir(), 'exam-track-'));
const file = path.join(dir, 'examTrack.cjs');
writeFileSync(file, compile(readFileSync('src/lib/examTrack.ts', 'utf8')));
const {
  paperForTrack, parseTrack, trackSelectionEnabled, trackForClass, admissionTrack, attemptAllowsQuizRow,
} = await import(file);

// The AP paper after migration 0061: 50 items; BC-only items are 45, 46, 47, 49 and 50.
// Item 48 (L'Hopital's rule, topic 4.7) is common to AB and BC.
const BC_ONLY = new Set([45, 46, 47, 49, 50]);
const paper = Array.from({length: 50}, (_, i) => ({
  id: `row-${i + 1}`,
  questions: {config: {bc_only: BC_ONLY.has(i + 1), source: 'ap'}},
}));
const idOf = (n) => `row-${n}`;

// Paper distribution per course
const bc = paperForTrack(paper, 'BC');
assert.equal(bc.length, 50, 'BC gets all 50 items');
assert.deepEqual(bc.map((r) => r.id), paper.map((r) => r.id), 'BC keeps stored order');
const ab = paperForTrack(paper, 'AB');
assert.equal(ab.length, 45, 'AB gets 45 common items');
assert.ok(!ab.some((r) => r.questions.config.bc_only), 'AB never receives a bc_only item');
for (const n of [45, 46, 47, 49, 50]) assert.ok(!ab.some((r) => r.id === idOf(n)), `AB excludes BC-only item ${n}`);
assert.ok(ab.some((r) => r.id === idOf(48)), 'AB includes common item 48');
assert.deepEqual(ab.map((r) => r.id), paper.filter((r) => !BC_ONLY.has(Number(r.id.slice(4)))).map((r) => r.id), 'AB keeps stored order');
console.log('exam-track: paper distribution checks passed');

// Rows without config (non-AP quizzes) are untouched for both tracks.
const plain = [{id: 'a', questions: {config: null}}, {id: 'b', questions: {}}];
assert.equal(paperForTrack(plain, 'AB').length, 2);
assert.equal(paperForTrack(plain, 'BC').length, 2);

// Flags and parsing
assert.equal(trackSelectionEnabled({track_selection: true}), true);
assert.equal(trackSelectionEnabled({track_selection: false}), false);
assert.equal(trackSelectionEnabled({}), false, 'exams without the flag are unchanged');
assert.equal(trackSelectionEnabled(null), false);
assert.equal(parseTrack('AB'), 'AB');
assert.equal(parseTrack('BC'), 'BC');
assert.equal(parseTrack('ab'), null);
assert.equal(parseTrack(undefined), null);

// Track comes from the class row, not from anything the browser sends.
assert.equal(trackForClass({curriculum_track: 'AB'}), 'AB');
assert.equal(trackForClass({curriculum_track: 'BC'}), 'BC');
assert.equal(trackForClass({curriculum_track: null}), null);
assert.equal(trackForClass({}), null);
assert.equal(trackForClass(null), null);

// Admission: the four classes map to their course.
const AP1_AB = {id: '884b9ddb-8af1-4488-b697-f5dbb2a23085', curriculum_track: 'AB'};
const AP2_AB = {id: '9de6834d-0d90-4bfe-8b85-58af9ee110fe', curriculum_track: 'AB'};
const AP1_BC = {id: '67ed3b13-a531-4a72-8023-41bdebc32659', curriculum_track: 'BC'};
const AP2_BC = {id: '01edebc6-dca8-4376-9e5c-4462a8f95391', curriculum_track: 'BC'};
assert.deepEqual(admissionTrack(true, AP1_AB), {ok: true, track: 'AB'}, 'AP1 (AB) starts on AB');
assert.deepEqual(admissionTrack(true, AP2_AB), {ok: true, track: 'AB'}, 'AP2 (AB) starts on AB');
assert.deepEqual(admissionTrack(true, AP1_BC), {ok: true, track: 'BC'}, 'AP1 (BC) starts on BC');
assert.deepEqual(admissionTrack(true, AP2_BC), {ok: true, track: 'BC'}, 'AP2 (BC) starts on BC');
// A class with no AP course cannot start a track-selection examination.
const notAp = admissionTrack(true, {id: 'x', curriculum_track: null});
assert.equal(notAp.ok, false, 'class without a course is refused');
assert.match(notAp.error, /not linked to an AP Calculus course/);
assert.equal(admissionTrack(true, null).ok, false, 'missing class is refused');
// Examinations without track selection ignore the class entirely.
assert.deepEqual(admissionTrack(false, AP1_BC), {ok: true, track: null});
assert.deepEqual(admissionTrack(false, null), {ok: true, track: null});

// Answer gate: an attempt answers only rows in its stored order.
const qqOf = (n) => `qq-${paper.findIndex((r) => r.id === idOf(n))}`;
const abStored = paper.filter((r) => !BC_ONLY.has(Number(r.id.slice(4)))).map((r) => `qq-${paper.indexOf(r)}`);
assert.equal(attemptAllowsQuizRow(abStored, qqOf(48), 'AB'), true, 'AB may answer common item 48');
assert.equal(attemptAllowsQuizRow(abStored, qqOf(46), 'AB'), false, 'AB may NOT answer BC-only item 46');
assert.equal(attemptAllowsQuizRow(abStored, qqOf(50), 'AB'), false, 'AB may NOT answer BC-only item 50');
const bcStored = paper.map((_, i) => `qq-${i}`);
assert.equal(attemptAllowsQuizRow(bcStored, qqOf(50), 'BC'), true, 'BC may answer item 50');
assert.equal(attemptAllowsQuizRow([], 'qq-0', 'AB'), false, 'a track attempt with no stored order answers nothing');
assert.equal(attemptAllowsQuizRow(undefined, 'qq-0', null), true, 'examinations without a track keep the paper-wide rule');
assert.equal(attemptAllowsQuizRow([], 'qq-0', null), true, 'legacy attempt without a stored order is unchanged');
assert.equal(attemptAllowsQuizRow(['qq-1'], 'qq-0', null), false, 'a stored order always limits answers');
console.log('exam-track: admission and answer-gate checks passed');

// Route wiring: the browser cannot choose the track, and the save route enforces the gate.
{
  const link = readFileSync('src/app/api/exam/link-access/route.ts', 'utf8');
  const access = readFileSync('src/app/api/exam/access/route.ts', 'utf8');
  const save = readFileSync('src/app/api/exam/save/route.ts', 'utf8');
  for (const [name, src] of [['link-access', link], ['access', access]]) {
    assert.ok(!/track:\s*z\.enum/.test(src), `${name}: body no longer accepts a track`);
    assert.ok(!/requires_track/.test(src), `${name}: no track chooser response`);
    assert.ok(/admissionTrack\(/.test(src), `${name}: track derived from the class`);
  }
  assert.ok(/select\("id,organization_id,curriculum_track"\)/.test(link), 'link-access reads the class course from the database');
  assert.ok(/select\("id,curriculum_track"\)/.test(access), 'access reads the candidate class course from the database');
  assert.ok(/attemptAllowsQuizRow\(attempt\.question_order/.test(save), 'save route enforces the stored paper order');
  console.log('exam-track: route wiring checks passed');
}

console.log('exam-track: all checks passed');

// Class links: settings.linked_class_ids must reach the access parser (src/lib/exam-access.ts).
{
  const accessSrc = ts.transpileModule(readFileSync('src/lib/exam-access.ts', 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const accessFile = path.join(dir, 'exam-access.cjs');
  writeFileSync(accessFile, accessSrc);
  const {parseExamAccessSettings, mergeEligibleClassIds} = await import(accessFile);
  const AP1 = '11111111-1111-4111-8111-111111111111';
  const AP2 = '22222222-2222-4222-8222-222222222222';
  const linked = parseExamAccessSettings({linked_class_ids: [AP1, AP2, 'not-a-uuid']});
  assert.deepEqual(linked.linkedClassIds, [AP1, AP2], 'both AP classes are linked, invalid ids dropped');
  assert.deepEqual(parseExamAccessSettings({}).linkedClassIds, [], 'no link when the key is absent');
  // Existing allowlist behaviour is unchanged: an allowlist still restricts, it does not add classes.
  assert.deepEqual(mergeEligibleClassIds([AP1], []), [AP1]);
  assert.deepEqual(mergeEligibleClassIds([AP1, AP2], [AP2]), [AP2]);
  console.log('exam-track: class-link checks passed');
}
