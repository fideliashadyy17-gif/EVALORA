// Exercises the real proposeAiMarks / decideAiProposal server actions with a
// stubbed provider. The point of most checks here is what does NOT happen: no
// credential, a failed model call or an unusable reply must leave every mark
// untouched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const file = path.resolve('scripts/__virtual_ai_marking_actions.cjs');

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '12121212-1212-4212-8212-121212121212';
const EXAM = '22222222-2222-4222-8222-222222222222';
const QUIZ = '33333333-3333-4333-8333-333333333333';
const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const ANSWER = '55555555-5555-4555-8555-555555555555';
const QUESTION = '66666666-6666-4666-8666-666666666666';
const RUBRIC = '77777777-7777-4777-8777-777777777777';
const C1 = '88888888-8888-4888-8888-888888888888';
const C2 = '99999999-9999-4999-8999-999999999999';
const MARKER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let state;
let writes;
const ai = { configured: true, calls: [], response: null, failure: null };

class AiMarkingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AiMarkingError';
    this.code = code;
  }
}

function setup() {
  state = {
    org: ORG,
    allowed: true,
    exam: { id: EXAM, quiz_id: QUIZ },
    attempt: { id: ATTEMPT, exam_id: EXAM, status: 'submitted' },
    answer: {
      id: ANSWER,
      attempt_id: ATTEMPT,
      question_id: QUESTION,
      quiz_question_id: null,
      answer: { text: 'Photosynthesis has a light stage and a dark stage.' },
      points_awarded: null,
      questions: { organization_id: ORG, points: 8, type: 'open_ended', prompt: 'Describe photosynthesis.' },
    },
    quizQuestion: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', points: 8 },
    rubric: { id: RUBRIC },
    link: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
    criteria: [
      { id: C1, code: 'A1', label: 'Names the light stage', description: 'Mentions light', max_marks: 4, position: 0 },
      { id: C2, code: 'A2', label: 'Names the dark stage', description: 'Mentions Calvin cycle', max_marks: 4, position: 1 },
    ],
    scores: [],
    proposals: [],
    answers: [{ points_awarded: null, is_correct: null }],
    fail: {},
  };
  writes = [];
  ai.configured = true;
  ai.calls = [];
  ai.failure = null;
  ai.response = {
    provider: 'openai',
    model: 'gpt-4o-mini',
    promptDigest: 'a'.repeat(64),
    suggestions: [
      { criterionId: C1, marks: 3, rationale: 'Names the light stage directly.' },
      { criterionId: C2, marks: 2.5, rationale: 'Mentions the dark stage but not the cycle.' },
    ],
  };
}

function resolve(table, ctx, single) {
  const op = ctx.op;
  if (state.fail[table]) return { data: null, error: { message: 'failure' } };

  if (table === 'ai_marking_proposals') {
    if (op === 'insert') {
      const incoming = Array.isArray(ctx.payload) ? ctx.payload : [ctx.payload];
      writes.push({ op: 'insert', table, payload: incoming });
      for (const row of incoming) {
        state.proposals.push({ decided_by: null, decided_marks: null, decided_at: null, decision_note: null, status: 'proposed', ...row });
      }
      return { data: null, error: null };
    }
    if (op === 'update') {
      writes.push({ op: 'update', table, payload: ctx.payload, filters: ctx.filters });
      for (const row of state.proposals) {
        if (ctx.filters.every(([k, v]) => row[k] === v)) Object.assign(row, ctx.payload);
      }
      return { data: null, error: null };
    }
    const rows = state.proposals.filter((row) => ctx.filters.every(([k, v]) => row[k] === v));
    return { data: single ? rows[0] ?? null : rows, error: null };
  }

  if (table === 'answer_rubric_scores') {
    if (op === 'upsert') {
      writes.push({ op: 'upsert', table, payload: ctx.payload });
      const existing = state.scores.find(
        (row) => row.answer_id === ctx.payload.answer_id && row.criterion_id === ctx.payload.criterion_id,
      );
      if (existing) Object.assign(existing, ctx.payload);
      else state.scores.push({ ...ctx.payload });
      return { data: null, error: null };
    }
    if (op === 'delete') {
      writes.push({ op: 'delete', table, filters: ctx.filters });
      return { data: null, error: null };
    }
    const rows = state.scores.filter((row) => ctx.filters.every(([k, v]) => row[k] === v));
    return { data: single ? rows[0] ?? null : rows, error: null };
  }

  if (table === 'exam_answers' && op === 'update') {
    writes.push({ op: 'update', table, payload: ctx.payload });
    if (ctx.payload.points_awarded !== undefined) {
      state.answer.points_awarded = ctx.payload.points_awarded;
      state.answers = [{ points_awarded: ctx.payload.points_awarded, is_correct: ctx.payload.is_correct ?? null }];
    }
    return { data: single ? { id: state.answer.id } : [{ id: state.answer.id }], error: null };
  }
  if (table === 'exam_attempts' && op === 'update') {
    writes.push({ op: 'update', table, payload: ctx.payload });
    return { data: single ? { id: state.attempt.id } : [{ id: state.attempt.id }], error: null };
  }

  if (table === 'grading_rubric_criteria') return { data: state.criteria, error: null };
  if (table === 'exam_answers' && ctx.cols && ctx.cols.includes('points_awarded, is_correct')) {
    return { data: state.answers, error: null };
  }

  const rows = {
    exams: state.exam,
    exam_attempts: state.attempt,
    exam_answers: state.answer,
    quiz_questions: state.quizQuestion,
    grading_rubrics: state.rubric,
    exam_rubric_links: state.link,
  }[table];
  if (rows === undefined || rows === null) return { data: single ? null : [], error: null };
  const matches = ctx.filters.every(([key, value]) => !(key in rows) || rows[key] === value);
  if (!matches) return { data: single ? null : [], error: null };
  return { data: single ? rows : [rows], error: null };
}

function from(table) {
  const ctx = { op: 'select', filters: [], cols: null, payload: null };
  const api = {
    select(cols) { ctx.cols = String(cols); return api; },
    delete() { ctx.op = 'delete'; return api; },
    insert(payload) { ctx.op = 'insert'; ctx.payload = payload; return api; },
    update(payload) { ctx.op = 'update'; ctx.payload = payload; return api; },
    upsert(payload) { ctx.op = 'upsert'; ctx.payload = payload; return api; },
    eq(k, v) { ctx.filters.push([k, v]); return api; },
    or() { return api; },
    in(col, values) { ctx.filters.push([col, values]); return api; },
    order() { return api; },
    limit() { return api; },
    maybeSingle() { return Promise.resolve(resolve(table, ctx, true)); },
    then(onOk, onErr) { return Promise.resolve(resolve(table, ctx, false)).then(onOk, onErr); },
  };
  return api;
}

const db = { from };

const stub = {
  '@/lib/auth': {},
  '@/lib/entitlements': { withinLimit: () => true, isPlanLimitError: () => false },
  '@/lib/capabilities': { getCapabilities: async () => ({ entitlement: {}, capabilities: {} }) },
  '@/lib/supabase/server': { createClient: async () => db, createAdminClient: () => db },
  '@/lib/utils': { genCode: () => 'CODE1234' },
  '@/lib/ai-marking': {
    describeAiMarking: () =>
      ai.configured ? { configured: true, provider: 'openai', model: 'gpt-4o-mini' } : { configured: false, reason: 'none' },
    suggestCriterionMarks: async (request) => {
      ai.calls.push(request);
      if (ai.failure === 'provider') throw new AiMarkingError('provider', 'refused');
      if (ai.failure === 'invalid_response') throw new AiMarkingError('invalid_response', 'unusable');
      return ai.response;
    },
    AiMarkingError,
  },
  'next/cache': { revalidatePath: () => {} },
  'next/navigation': { redirect: (url) => { const e = Error(url); e.url = url; throw e; } },
};

const load = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === file && stub[request]) {
    if (request === '@/lib/auth') {
      return {
        requireUser: async () => ({ org: { id: state.org }, allowed: state.allowed, user: { id: MARKER, email: 'marker@example.com' } }),
        activeOrg: (ctx) => (ctx.org ? ctx.org : null),
        can: (ctx) => ctx.allowed,
        CREATOR_ROLES: [],
        MARKER_ROLES: [],
        PROCTOR_ROLES: [],
      };
    }
    return stub[request];
  }
  return load.apply(this, arguments);
};

const mod = new Module(file);
mod.filename = file;
mod.paths = Module._nodeModulePaths(path.dirname(file));
mod._compile(
  ts.transpileModule(readFileSync('src/app/dashboard/exams/actions.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  file,
);
Module._load = load;

function form(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, String(v));
  return fd;
}
const proposeForm = () => form({ answer_id: ANSWER, attempt_id: ATTEMPT, exam_id: EXAM, rubric_id: RUBRIC });
async function run(action, fd) {
  try {
    await action(fd);
    throw new Error('expected a redirect');
  } catch (e) {
    if (!e.url) throw e;
    return e.url;
  }
}

let n = 0;
async function test(name, fn) {
  setup();
  await fn();
  n++;
  console.log('  ✓ ' + name);
}

await test('with no credential the action refuses and writes nothing', async () => {
  ai.configured = false;
  const url = await run(mod.exports.proposeAiMarks, proposeForm());
  assert.match(url, /ai_error=unconfigured/);
  assert.equal(ai.calls.length, 0, 'the provider is never asked');
  assert.equal(writes.length, 0, 'nothing is written');
});

await test('a suggestion run stores proposals and marks nothing', async () => {
  const url = await run(mod.exports.proposeAiMarks, proposeForm());
  assert.match(url, /ai_ok=proposed/);
  const insert = writes.find((w) => w.op === 'insert' && w.table === 'ai_marking_proposals');
  assert.ok(insert, 'proposals were inserted');
  assert.equal(insert.payload.length, 2);
  assert.equal(insert.payload[0].provider, 'openai');
  assert.equal(insert.payload[0].model, 'gpt-4o-mini');
  assert.equal(insert.payload[0].prompt_digest.length, 64);
  assert.equal(insert.payload[0].answer_digest.length, 64);
  assert.equal(insert.payload[0].status, 'proposed');
  assert.equal(insert.payload[0].requested_by, MARKER);
  assert.equal(
    writes.some((w) => w.table === 'exam_answers'),
    false,
    'no mark is written by a suggestion',
  );
  assert.equal(state.scores.length, 0);
});

await test('a newer suggestion supersedes the old live ones', async () => {
  state.proposals.push({ id: P1, answer_id: ANSWER, criterion_id: C1, status: 'proposed', proposed_marks: 1 });
  await run(mod.exports.proposeAiMarks, proposeForm());
  const supersede = writes.find((w) => w.op === 'update' && w.table === 'ai_marking_proposals');
  assert.ok(supersede, 'old proposals are retired');
  assert.equal(supersede.payload.status, 'superseded');
  assert.equal(state.proposals.find((p) => p.id === P1).status, 'superseded');
});

await test('a provider failure writes nothing', async () => {
  ai.failure = 'provider';
  const url = await run(mod.exports.proposeAiMarks, proposeForm());
  assert.match(url, /ai_error=provider/);
  assert.equal(writes.length, 0);
});

await test('an unusable model reply is refused rather than coerced', async () => {
  ai.failure = 'invalid_response';
  const url = await run(mod.exports.proposeAiMarks, proposeForm());
  assert.match(url, /ai_error=invalid_response/);
  assert.equal(writes.length, 0);
});

await test('a rubric that is not attached is refused before any model call', async () => {
  state.link = null;
  const url = await run(mod.exports.proposeAiMarks, proposeForm());
  assert.match(url, /ai_error=rubric/);
  assert.equal(ai.calls.length, 0);
  assert.equal(writes.length, 0);
});

await test('a caller without marking rights is sent away', async () => {
  state.allowed = false;
  const url = await run(mod.exports.proposeAiMarks, proposeForm());
  assert.equal(url, '/dashboard/exams');
  assert.equal(ai.calls.length, 0);
  assert.equal(writes.length, 0);
});

const acceptForm = (overrides = {}) =>
  form({ proposal_id: P1, answer_id: ANSWER, exam_id: EXAM, decision: 'accept', ...overrides });

function seedProposal(overrides = {}) {
  state.proposals = [
    {
      id: P1,
      answer_id: ANSWER,
      attempt_id: ATTEMPT,
      exam_id: EXAM,
      organization_id: ORG,
      rubric_id: RUBRIC,
      criterion_id: C1,
      proposed_marks: 3,
      rationale: 'names the light stage',
      status: 'proposed',
      ...overrides,
    },
  ];
}

await test('accepting writes the criterion mark and marks the answer AI-assisted', async () => {
  seedProposal();
  // The other criterion is already scored by this marker, so the total is final.
  state.scores.push({ answer_id: ANSWER, criterion_id: C2, marks_awarded: 2, grader_id: MARKER });
  const url = await run(mod.exports.decideAiProposal, acceptForm());
  assert.match(url, /ai_ok=accepted/);
  const upsert = writes.find((w) => w.op === 'upsert' && w.table === 'answer_rubric_scores');
  assert.ok(upsert, 'the accepted criterion is scored');
  assert.equal(Number(upsert.payload.marks_awarded), 3);
  assert.equal(upsert.payload.grader_id, MARKER);
  const answerUpdate = writes.find((w) => w.table === 'exam_answers' && w.op === 'update');
  assert.ok(answerUpdate, 'the answer mark is written');
  assert.equal(Number(answerUpdate.payload.points_awarded), 5);
  assert.equal(answerUpdate.payload.grading_method, 'ai_assisted');
  assert.equal(state.proposals[0].status, 'accepted');
  assert.equal(state.proposals[0].decided_by, MARKER);
  assert.equal(Number(state.proposals[0].decided_marks), 3);
});

await test('the accepted mark can be edited by the reviewer', async () => {
  seedProposal();
  state.scores.push({ answer_id: ANSWER, criterion_id: C2, marks_awarded: 2, grader_id: MARKER });
  await run(mod.exports.decideAiProposal, acceptForm({ marks: '1.5', note: 'too generous' }));
  assert.equal(Number(state.scores.find((s) => s.criterion_id === C1).marks_awarded), 1.5);
  assert.equal(Number(state.proposals[0].decided_marks), 1.5);
  assert.equal(Number(state.answer.points_awarded), 3.5);
});

await test('a mark above the criterion maximum is refused and nothing is written', async () => {
  seedProposal();
  const url = await run(mod.exports.decideAiProposal, acceptForm({ marks: '9' }));
  assert.match(url, /ai_error=marks/);
  assert.equal(writes.length, 0);
  assert.equal(state.proposals[0].status, 'proposed');
});

await test('a partial acceptance leaves the answer total alone', async () => {
  seedProposal();
  const url = await run(mod.exports.decideAiProposal, acceptForm());
  assert.match(url, /ai_ok=remaining-1/, 'one criterion is still unscored');
  assert.equal(
    writes.some((w) => w.table === 'exam_answers'),
    false,
    'a half-marked answer must not be given a total',
  );
  assert.equal(state.proposals[0].status, 'accepted', 'the criterion decision itself is recorded');
});

await test('rejecting writes no mark at all', async () => {
  seedProposal();
  const url = await run(mod.exports.decideAiProposal, form({ proposal_id: P1, answer_id: ANSWER, exam_id: EXAM, decision: 'reject' }));
  assert.match(url, /ai_ok=rejected/);
  assert.equal(writes.filter((w) => w.table === 'answer_rubric_scores').length, 0);
  assert.equal(writes.filter((w) => w.table === 'exam_answers').length, 0);
  assert.equal(state.proposals[0].status, 'rejected');
  assert.equal(state.proposals[0].decided_by, MARKER);
});

await test('an already decided suggestion cannot be decided twice', async () => {
  seedProposal({ status: 'accepted' });
  const url = await run(mod.exports.decideAiProposal, acceptForm());
  assert.match(url, /ai_error=decided/);
  assert.equal(writes.length, 0);
});

await test('a suggestion from another workspace is invisible', async () => {
  seedProposal({ organization_id: OTHER_ORG });
  const url = await run(mod.exports.decideAiProposal, acceptForm());
  assert.match(url, /ai_error=invalid/);
  assert.equal(writes.length, 0);
});

await test('a suggestion for another examination cannot be decided from this one', async () => {
  seedProposal({ exam_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' });
  const url = await run(mod.exports.decideAiProposal, acceptForm());
  assert.match(url, /ai_error=invalid/);
  assert.equal(writes.length, 0);
});

console.log(`\n${n} AI-marking action checks passed (real actions, stubbed provider).`);
