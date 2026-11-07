// In-memory workflow tests for server-authoritative publication and notifications.
// Fixtures are synthetic local objects; this suite never connects to Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const broadcasts = [];
const publishedEvents = [];
const channelAdmin = {
  channel(name) { return { send: async (message) => { broadcasts.push({ name, message }); return 'ok'; } }; },
};
function compile(src, filename, stubs = {}) {
  const file = path.resolve(filename);
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const previous = Module._load;
  Module._load = function (request, parent) {
    if (parent?.filename === file && request in stubs) return stubs[request];
    return previous.apply(this, arguments);
  };
  try {
    mod._compile(ts.transpileModule(readFileSync(src, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, file);
    return mod.exports;
  } finally { Module._load = previous; }
}
const resultPublication = compile('src/lib/resultPublication.ts', 'scripts/__publication_helper.cjs', {
  '@/lib/supabase/server': { createAdminClient: () => channelAdmin },
  '@/lib/scoring': {
    hasAnswerContent: (answer) => Boolean(answer && typeof answer === 'object' && !Array.isArray(answer) && Object.values(answer).some((value) => typeof value === 'string' ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined)),
    isAutoGradableQuestion: (type) => ['single_choice','multiple_select','true_false','short_answer','numeric','ordering','matching'].includes(type),
  },
});

function makeDb({ sessions = [], participants = [], answers = [], exams = [], competitions = [] } = {}) {
  const tables = { quiz_sessions: sessions, session_participants: participants, participant_answers: answers, exam_attempts: exams, exam_result_events: [], live_result_events: [], competitions };
  const admin = {
    tables,
    channel: channelAdmin.channel,
    from(table) {
      let operation = 'select'; let payload; const filters = [];
      const q = {
        select() { if (operation === 'select') operation = 'select'; return q; },
        update(value) { operation = 'update'; payload = value; return q; },
        insert(value) { operation = 'insert'; payload = value; return q; },
        eq(key, value) { filters.push((row) => row[key] === value); return q; },
        is(key, value) { filters.push((row) => (row[key] ?? null) === value); return q; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return q; },
        gt(key, value) { filters.push((row) => Number(row[key]) > Number(value)); return q; },
        limit() { return q; },
        find() { return (tables[table] ?? []).filter((row) => filters.every((test) => test(row))); },
        apply() {
          if (operation === 'insert') {
            const rows = Array.isArray(payload) ? payload : [payload];
            tables[table].push(...rows.map((row) => ({ ...row })));
            return { data: rows, error: null };
          }
          const found = q.find();
          if (operation === 'update') found.forEach((row) => Object.assign(row, payload));
          return { data: operation === 'update' ? found : found, error: null };
        },
        async maybeSingle() {
          const result = q.apply();
          const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
          if (table === 'exam_attempts' && operation === 'update' && data) return { data: { id: data.id, access_token: data.access_token }, error: null };
          if (table === 'session_participants' && operation === 'update' && data && payload.result_publication_status === 'published') return { data: { id: data.id }, error: null };
          if (table === 'quiz_sessions' && operation === 'update' && data) return { data: { id: data.id }, error: null };
          return { data, error: null };
        },
        then(resolve, reject) {
          const result = q.apply();
          return Promise.resolve({ data: result.data, error: result.error }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return admin;
}
const liveResults = compile('src/lib/liveResults.ts', 'scripts/__live_results_helper.cjs', {
  '@/lib/resultPublication': resultPublication,
  '@/lib/scoring': { hasAnswerContent: resultPublication.hasAnswerContent },
});
let count = 0;
async function test(name, fn) { await fn(); count++; console.log(`  ✓ ${name}`); }

await test('automatic exam publication is persisted once and broadcasts only a token-scoped signal', async () => {
  broadcasts.length = 0; publishedEvents.length = 0;
  const attempt = { id: 'attempt-1', exam_id: 'exam-1', status: 'submitted', grading_status: 'graded', pending_manual_count: 0, published_at: null, access_token: 'candidate-secret' };
  const db = makeDb({ exams: [attempt] });
  const input = { organizationId: 'org-1', examId: 'exam-1', attemptId: 'attempt-1', processingMs: 12 };
  assert.equal(await resultPublication.publishAutomaticExamAttempt(db, input), true);
  assert.ok(attempt.published_at);
  assert.equal(db.tables.exam_result_events[0].event_type, 'auto_published');
  assert.equal(await resultPublication.publishAutomaticExamAttempt(db, input), false, 'second call is idempotent');
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0].message.event, 'result-published');
  assert.equal(JSON.stringify(broadcasts[0]).includes('candidate-secret'), false);
  assert.equal(JSON.stringify(broadcasts[0]).includes('score'), false);
});

await test('attempts awaiting written marking remain unpublished', async () => {
  broadcasts.length = 0;
  const attempt = { id: 'attempt-2', exam_id: 'exam-1', status: 'submitted', grading_status: 'awaiting_manual_grading', pending_manual_count: 1, published_at: null, access_token: 'secret' };
  const db = makeDb({ exams: [attempt] });
  assert.equal(await resultPublication.publishAutomaticExamAttempt(db, { organizationId: 'org', examId: 'exam-1', attemptId: 'attempt-2' }), false);
  assert.equal(attempt.published_at, null);
  assert.equal(db.tables.exam_result_events.length, 0);
  assert.equal(broadcasts.length, 0);
});

await test('manual and legacy self-paced sessions never auto-publish a participant', async () => {
  for (const mode of ['manual', 'legacy']) {
    const session = { id: 'session-1', organization_id: 'org-1', status: 'live', mode: 'self_paced', settings: { result_publication_mode: mode }, results_published: false };
    const participant = { id: 'p-1', session_id: session.id, status: 'finished', results_published_at: null };
    const db = makeDb({ sessions: [session], participants: [participant] });
    const result = await liveResults.publishFinishedLiveParticipant(db, session.id, participant.id);
    assert.equal(result.published, false);
    assert.equal(participant.results_published_at, null);
  }
});

await test('automatic self-paced objective result publishes only the completed participant', async () => {
  broadcasts.length = 0;
  const session = { id: 'session-2', organization_id: 'org-1', status: 'live', mode: 'self_paced', settings: { result_publication_mode: 'automatic' }, results_published: false };
  const done = { id: 'p-done', session_id: session.id, status: 'finished', results_published_at: null };
  const other = { id: 'p-other', session_id: session.id, status: 'admitted', results_published_at: null };
  const db = makeDb({ sessions: [session], participants: [done, other] });
  const result = await liveResults.publishFinishedLiveParticipant(db, session.id, done.id);
  assert.equal(result.published, true);
  assert.ok(done.results_published_at);
  assert.equal(other.results_published_at, null);
  assert.equal(db.tables.live_result_events[0].event_type, 'auto_published');
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0].name, `live:${session.id}`);
  assert.equal(broadcasts[0].message.event, 'state-changed');
});

await test('automatic self-paced written response stays pending until a human mark exists', async () => {
  const session = { id: 'session-3', organization_id: 'org-1', status: 'live', mode: 'self_paced', settings: { result_publication_mode: 'automatic' }, results_published: false };
  const participant = { id: 'p-essay', session_id: session.id, status: 'finished', results_published_at: null };
  const answer = { id: 'answer-1', session_id: session.id, participant_id: participant.id, answer: { text: 'A response' }, is_correct: null, questions: { type: 'open_ended' } };
  const db = makeDb({ sessions: [session], participants: [participant], answers: [answer] });
  const result = await liveResults.publishFinishedLiveParticipant(db, session.id, participant.id);
  assert.equal(result.published, false);
  assert.equal(result.pending, true);
  assert.equal(participant.results_published_at, null);
  assert.equal(participant.result_publication_status, 'awaiting_manual_grading');
  assert.equal(db.tables.live_result_events[0].event_type, 'awaiting_manual_grading');
});

await test('manual session publication refuses unfinished sessions and pending written answers', async () => {
  const live = { id: 'session-4', organization_id: 'org-1', status: 'live', settings: { result_publication_mode: 'manual' }, results_published: false };
  const liveDb = makeDb({ sessions: [live] });
  assert.equal((await liveResults.finalizeLiveSessionResults(liveDb, live.id, { manualPublish: true })).published, false);
  live.status = 'ended';
  const pendingDb = makeDb({ sessions: [live], answers: [{ id: 'essay', session_id: live.id, participant_id: 'p', answer: { text: 'written' }, is_correct: null, questions: { type: 'open_ended' } }] });
  const pending = await liveResults.finalizeLiveSessionResults(pendingDb, live.id, { manualPublish: true });
  assert.equal(pending.pending, true);
  assert.equal(live.results_published, false);
});

await test('authorized manual live publication persists session and participant release state', async () => {
  broadcasts.length = 0;
  const session = { id: 'session-5', organization_id: 'org-1', status: 'ended', settings: { result_publication_mode: 'manual' }, results_published: false };
  const participant = { id: 'p-1', session_id: session.id, status: 'finished', results_published_at: null };
  const competition = { id: 'competition-1', session_id: session.id, results_published: false };
  const db = makeDb({ sessions: [session], participants: [participant], competitions: [competition] });
  const result = await liveResults.finalizeLiveSessionResults(db, session.id, { actorId: 'marker', manualPublish: true });
  assert.equal(result.published, true);
  assert.equal(session.results_published, true);
  assert.equal(participant.result_publication_status, 'published');
  assert.ok(participant.results_published_at);
  assert.equal(competition.results_published, true);
  assert.equal(db.tables.live_result_events[0].event_type, 'manually_published');
  assert.equal(broadcasts.at(-1).name, `live:${session.id}`);
});

console.log(`\n${count} result-publication workflow checks passed (in-memory DB; no network/production data).`);
