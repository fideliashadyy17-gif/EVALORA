// Unit checks for the scheduled closure of expired examination attempts (src/lib/expiredAttempts.ts).
// The real exam.ts and expiredAttempts.ts are compiled; only the question loader and the scorer are
// replaced by stubs, and the database is an in-memory fake. No network, no real data.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const compile = (src) => ts.transpileModule(src, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;

const dir = mkdtempSync(path.join(tmpdir(), 'expired-sweep-'));
writeFileSync(path.join(dir, 'exam.js'), compile(readFileSync('src/lib/exam.ts', 'utf8')));
// The sweep no longer owns a private copy of the closing logic: it calls the same
// lifecycle and the same deadline rule the candidate routes use, so both are
// compiled from source here too.
writeFileSync(path.join(dir, 'examDeadline.js'), compile(readFileSync('src/lib/examDeadline.ts', 'utf8')));
writeFileSync(path.join(dir, 'examSubmission.js'), compile(readFileSync('src/lib/examSubmission.ts', 'utf8')));
writeFileSync(path.join(dir, 'expiredAttempts.js'), compile(readFileSync('src/lib/expiredAttempts.ts', 'utf8')));
// Stubs for the two modules exam.ts imports from. Grading rule for the fixture: a saved answer
// {text:'ok'} is correct and earns the question's points; anything else earns nothing.
writeFileSync(path.join(dir, 'live.js'), `exports.loadQuizQuestions = async (admin, quizId) => (admin.papers[quizId] ?? []);
exports.seededShuffle = (rows) => rows;`);
writeFileSync(path.join(dir, 'scoring.js'), `exports.scoreAnswer = (q, _options, answer, points) => {
  const ok = answer && answer.text === 'ok';
  return {isCorrect: Boolean(ok), points: ok ? Number(points ?? q.points) : 0};
};`);

const {sweepExpiredAttempts, isPastDeadline, cronAuthorized, SWEEP_BATCH} = await import(path.join(dir, 'expiredAttempts.js'));

const NOW = Date.parse('2026-11-08T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const MIN = 60_000;

let db;
function reset() {
  db = {
    attempts: [], answers: [], exams: [], candidates: [], papers: {}, writes: [],
    failOn: {}, candidateFail: false, raceAttempt: null,
  };
}

/** Minimal chainable fake of the supabase-js query builder used by the sweep and grading. */
function table(name) {
  const st = {filters: [], order: null, limit: null, op: 'select', patch: null};
  const api = {
    select() { return api; },
    update(patch) { st.op = 'update'; st.patch = patch; return api; },
    eq(c, v) { st.filters.push((r) => r[c] === v); return api; },
    in(c, v) { st.filters.push((r) => v.includes(r[c])); return api; },
    is(c, v) { st.filters.push((r) => (r[c] ?? null) === v); return api; },
    order(c, opts) { st.order = [c, opts?.ascending !== false]; return api; },
    limit(n) { st.limit = n; return api; },
    async maybeSingle() { return exec(name, st, true); },
    then(resolve, reject) { return exec(name, st, false).then(resolve, reject); },
  };
  return api;
}

// Table name in the code -> key in the fake database.
const STORE = {exam_attempts: 'attempts', exam_answers: 'answers', exam_candidates: 'candidates', exams: 'exams'};

async function exec(name, st, single) {
  const store = STORE[name];
  if (!store) throw new Error(`fake database has no table ${name}`);
  let rows = (db[store] ?? []).filter((r) => st.filters.every((f) => f(r)));
  if (st.op === 'select') {
    if (st.order) {
      const [col, asc] = st.order;
      rows = [...rows].sort((a, b) => (Date.parse(a[col]) - Date.parse(b[col])) * (asc ? 1 : -1));
    }
    if (st.limit) rows = rows.slice(0, st.limit);
    if (single) return {data: rows[0] ?? null, error: null};
    return {data: rows, error: null};
  }
  // update
  if (db.failOn[name]) return {data: null, error: {message: 'write failed'}};
  if (name === 'exam_candidates' && db.candidateFail) return {data: null, error: {message: 'candidate write failed'}};
  if (name === 'exam_attempts' && db.raceAttempt) {
    // Simulates a candidate submission that commits between the sweep's read and its write.
    const raced = db.attempts.find((a) => a.id === db.raceAttempt);
    if (raced) raced.status = 'submitted';
    db.raceAttempt = null;
    rows = (db[store] ?? []).filter((r) => st.filters.every((f) => f(r)));
  }
  for (const r of rows) Object.assign(r, st.patch);
  db.writes.push({table: name, ids: rows.map((r) => r.id), patch: st.patch});
  const data = rows.map((r) => ({id: r.id}));
  return single ? {data: data[0] ?? null, error: null} : {data, error: null};
}

const admin = {from: (name) => table(name), get papers() { return db.papers; }};

let checks = 0;
const check = async (name, fn) => {
  reset();
  await fn();
  checks += 1;
};

// Fixtures: one paper with one question worth 2 points; a 120-minute exam.
const paper = {quiz: [{id: 'q1', points: 2, questions: {id: 'q1', type: 'short', points: 2, config: {}, question_options: []}}]};
const exam = (over = {}) => ({id: 'e1', duration_minutes: 120, ends_at: null, quiz_id: 'quiz1', settings: {}, ...over});
const attempt = (over = {}) => ({
  id: 'a1', exam_id: 'e1', candidate_id: 'c1', started_at: iso(NOW - 3 * 60 * MIN), extension_minutes: 0,
  question_order: [], status: 'in_progress', access_token: 'secret-token-must-not-leak', submitted_at: null, score: null, max_score: null,
  ...over,
});
const answer = (attemptId, text = 'ok') => ({id: `ans-${attemptId}`, attempt_id: attemptId, question_id: 'q1', answer: {text}, marked_by: null, points_awarded: null, is_correct: null});
function seed(attempts, examRows = [exam()]) {
  db.papers.quiz1 = paper.quiz;
  db.attempts = attempts;
  db.exams = examRows;
  db.candidates = attempts.map((a) => ({id: a.candidate_id, status: 'in_progress'}));
  db.answers = attempts.map((a) => answer(a.id));
}

await check('an expired attempt is closed as auto_submitted at its deadline, graded, candidate marked submitted', async () => {
  seed([attempt()]);
  const r = await sweepExpiredAttempts(admin, NOW);
  assert.deepEqual(r.closed, ['a1']);
  const a = db.attempts[0];
  assert.equal(a.status, 'auto_submitted');
  assert.equal(a.submitted_at, iso(NOW - 60 * MIN), 'submitted_at is the deadline instant, not the sweep time');
  assert.equal(a.score, 2);
  assert.equal(a.max_score, 2);
  assert.equal(db.candidates[0].status, 'submitted');
  assert.equal(JSON.stringify(r).includes('secret-token'), false, 'sweep result never carries an access token');
  console.log('  ✓ expired attempt closed as auto_submitted, deadline timestamp, graded');
});

await check('an attempt still inside its time is never touched', async () => {
  seed([attempt({started_at: iso(NOW - 30 * MIN)})]);
  const r = await sweepExpiredAttempts(admin, NOW);
  assert.equal(r.expired, 0);
  assert.equal(db.writes.length, 0);
  assert.equal(db.attempts[0].status, 'in_progress');
  console.log('  ✓ attempt inside its time is untouched');
});

await check('the deadline is strict and always waits for the clock margin', async () => {
  const deadline = NOW - 60 * MIN;
  seed([attempt({id: 'a1', started_at: iso(deadline - 120 * MIN)})]);
  // The recorded deadline instant itself is never a closure: the sweep waits for
  // SUBMISSION_CLOCK_MARGIN_MS on top of it, so it can only ever close LATE.
  assert.equal(isPastDeadline(db.attempts[0], exam(), deadline), false, 'the deadline instant itself is still open');
  assert.equal(isPastDeadline(db.attempts[0], exam(), deadline + 1), false, 'one millisecond later is still open');
  assert.equal(isPastDeadline(db.attempts[0], exam(), deadline + 2_000), true, 'the margin elapses and closure follows');
  console.log('  ✓ deadline boundary is strict and margin-guarded');
});

await check('an authorized extension moves the deadline, and removing it closes the attempt again', async () => {
  seed([attempt({extension_minutes: 90})]);
  assert.equal((await sweepExpiredAttempts(admin, NOW)).closed.length, 0, 'extended attempt still has 30 minutes');
  db.attempts[0].extension_minutes = 0;
  assert.equal((await sweepExpiredAttempts(admin, NOW)).closed.length, 1, 'without the extension it has expired');
  console.log('  ✓ extension honoured on both sides');
});

await check('the exam window end is the earlier limit when it precedes the duration', async () => {
  const windowEnd = NOW - 10 * MIN;
  seed([attempt({started_at: iso(NOW - 60 * MIN)})], [exam({duration_minutes: 240, ends_at: iso(windowEnd)})]);
  const r = await sweepExpiredAttempts(admin, NOW);
  assert.deepEqual(r.closed, ['a1']);
  assert.equal(db.attempts[0].submitted_at, iso(windowEnd));
  console.log('  ✓ exam window end applied as the deadline');
});

await check('only in-progress attempts are selected; submitted ones are never rewritten', async () => {
  seed([attempt({id: 'a1', status: 'submitted', submitted_at: iso(NOW - 90 * MIN), score: 1, max_score: 2})]);
  const r = await sweepExpiredAttempts(admin, NOW);
  assert.equal(r.checked, 0);
  assert.equal(db.writes.length, 0);
  assert.equal(db.attempts[0].score, 1);
  console.log('  ✓ submitted attempts are not rewritten');
});

await check('running the sweep twice closes once', async () => {
  seed([attempt()]);
  await sweepExpiredAttempts(admin, NOW);
  const second = await sweepExpiredAttempts(admin, NOW);
  assert.equal(second.expired, 0);
  assert.equal(db.writes.filter((w) => w.table === 'exam_attempts').length, 1);
  console.log('  ✓ repeat sweep is a no-op');
});

await check('a candidate submission committed first is never overwritten', async () => {
  seed([attempt()]);
  db.raceAttempt = 'a1';
  const r = await sweepExpiredAttempts(admin, NOW);
  assert.deepEqual(r.already_closed, ['a1']);
  assert.deepEqual(r.closed, []);
  assert.equal(db.attempts[0].status, 'submitted', 'the candidate status set by the race is kept');
  assert.equal(db.writes.filter((w) => w.table === 'exam_candidates').length, 0, 'candidate not re-marked');
  console.log('  ✓ lost race leaves the candidate submission intact');
});

await check('a missing paper closes nothing, is reported, and the rest of the batch still closes', async () => {
  seed([attempt({id: 'a1', exam_id: 'e1'}), attempt({id: 'a2', candidate_id: 'c2', exam_id: 'e2'})], [exam(), exam({id: 'e2', quiz_id: 'gone'})]);
  db.papers = {quiz1: paper.quiz};
  const r = await sweepExpiredAttempts(admin, NOW);
  assert.deepEqual(r.closed, ['a1']);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].reason, 'paper_unavailable');
  assert.equal(db.attempts.find((a) => a.id === 'a2').status, 'in_progress');
  console.log('  ✓ paper failure is isolated to its attempt');
});

await check('a grading write failure leaves the attempt open and is reported', async () => {
  seed([attempt()]);
  db.failOn.exam_answers = true;
  const r = await sweepExpiredAttempts(admin, NOW);
  assert.equal(r.failed[0].reason, 'grading_failed');
  assert.equal(db.attempts[0].status, 'in_progress');
  console.log('  ✓ grading failure does not close the attempt');
});

await check('a close failure is reported and the candidate is not marked', async () => {
  seed([attempt()]);
  db.failOn.exam_attempts = true;
  const r = await sweepExpiredAttempts(admin, NOW);
  assert.equal(r.failed[0].reason, 'close_failed');
  assert.equal(db.writes.filter((w) => w.table === 'exam_candidates').length, 0);
  console.log('  ✓ close failure reported, candidate untouched');
});

await check('a candidate-status failure after closure is reported, not hidden', async () => {
  seed([attempt()]);
  db.candidateFail = true;
  const r = await sweepExpiredAttempts(admin, NOW);
  assert.equal(r.failed[0].reason, 'candidate_status_failed');
  assert.equal(db.attempts[0].status, 'auto_submitted', 'the attempt itself is closed');
  console.log('  ✓ partial failure reported explicitly');
});

await check('an attempt whose exam row is missing is reported', async () => {
  seed([attempt({exam_id: 'nope'})], [exam()]);
  const r = await sweepExpiredAttempts(admin, NOW);
  assert.equal(r.failed[0].reason, 'exam_missing');
  console.log('  ✓ missing exam reported');
});

await check('one sweep examines at most SWEEP_BATCH attempts', async () => {
  const many = Array.from({length: SWEEP_BATCH + 25}, (_, i) => attempt({id: `a${i}`, candidate_id: `c${i}`, started_at: iso(NOW - (3 * 60 + i) * MIN)}));
  seed(many);
  const r = await sweepExpiredAttempts(admin, NOW);
  assert.equal(r.checked, SWEEP_BATCH);
  console.log('  ✓ batch bounded');
});

await check('the cron bearer check accepts only the exact secret', async () => {
  const secret = 'x'.repeat(40);
  assert.equal(cronAuthorized(`Bearer ${secret}`, secret), true);
  assert.equal(cronAuthorized(`bearer ${secret}`, secret), true, 'scheme is case-insensitive');
  assert.equal(cronAuthorized(null, secret), false);
  assert.equal(cronAuthorized('', secret), false);
  assert.equal(cronAuthorized(`Basic ${secret}`, secret), false);
  assert.equal(cronAuthorized(`Bearer ${secret}x`, secret), false);
  assert.equal(cronAuthorized(`Bearer ${secret.slice(1)}`, secret), false);
  assert.equal(cronAuthorized(`Bearer ${secret}`, ''), false, 'an empty configured secret never authorizes');
  console.log('  ✓ bearer check strict');
});

console.log(`${checks} sweep checks passed (expired attempt closure, against an in-memory database)`);
