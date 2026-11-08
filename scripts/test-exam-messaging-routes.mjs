// HTTP checks for the messaging and monitoring routes, against a running server (production build by default).
// No database is needed: every case below is decided before any query (credentials, validation, session).
//   BASE=http://127.0.0.1:3102 node scripts/test-exam-messaging-routes.mjs
// Start the server first, e.g.: npx next start -p 3102 (after npm run build, with mock.invalid environment values).
import assert from 'node:assert/strict';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3102';
const attempt = '00000000-0000-4000-8000-000000000001';
const exam = '00000000-0000-4000-8000-000000000009';
const token = '00000000-0000-4000-8000-000000000002';
let checks = 0;

async function call(method, path, { headers = {}, body } = {}) {
  const init = { method, headers: { ...headers }, redirect: 'manual' };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const response = await fetch(`${BASE}${path}`, init);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, headers: response.headers, json, text };
}

const bearer = { authorization: `Bearer ${token}` };

// ── Candidate routes: credentials and validation are checked before any data is read ──
{
  const r = await call('GET', `/api/exam/messages?attempt_id=${attempt}`);
  assert.equal(r.status, 400, 'candidate GET without a bearer token is refused');
  assert.match(r.headers.get('cache-control') ?? '', /no-store/, 'candidate responses are never cached');
  checks += 1;
}
{
  const r = await call('GET', `/api/exam/messages?attempt_id=not-a-uuid`, { headers: bearer });
  assert.equal(r.status, 400, 'candidate GET with a malformed attempt id is refused');
  checks += 1;
}
{
  const r = await call('GET', `/api/exam/messages?attempt_id=${attempt}`, { headers: { authorization: 'Bearer not-a-token' } });
  assert.equal(r.status, 400, 'candidate GET with a malformed token is refused');
  checks += 1;
}
{
  const r = await call('POST', '/api/exam/messages', { headers: bearer, body: '{not json' });
  assert.equal(r.status, 400, 'candidate POST with broken JSON is refused');
  checks += 1;
}
{
  const r = await call('POST', '/api/exam/messages', { headers: bearer, body: { attempt_id: attempt, client_message_id: 'not-a-uuid', body: 'hi' } });
  assert.equal(r.status, 400, 'candidate POST without a valid client_message_id is refused (no duplicate protection without it)');
  checks += 1;
}
{
  const r = await call('POST', '/api/exam/messages', { headers: { authorization: 'Bearer nope' }, body: { attempt_id: attempt, client_message_id: exam, body: 'hi' } });
  assert.equal(r.status, 400, 'candidate POST with a malformed token is refused');
  checks += 1;
}
{
  const r = await call('POST', '/api/exam/messages', { headers: bearer, body: { attempt_id: attempt, client_message_id: exam, body: 'x'.repeat(4001) } });
  assert.equal(r.status, 400, 'candidate POST with an oversized body is refused before any write');
  checks += 1;
}
{
  const r = await call('POST', '/api/exam/presence', { body: { attempt_id: attempt, current_question: 1, total_questions: 5, saved_count: 0, pending_saves: 0 } });
  assert.equal(r.status, 400, 'presence without a bearer token is refused');
  checks += 1;
}
{
  const r = await call('POST', '/api/exam/presence', { headers: bearer, body: { attempt_id: attempt, current_question: 'one', total_questions: 5, saved_count: 0, pending_saves: 0 } });
  assert.equal(r.status, 400, 'presence with a non-numeric question is refused');
  checks += 1;
}
{
  const r = await call('POST', '/api/exam/messages/read', { body: { attempt_id: attempt, up_to: new Date().toISOString() } });
  assert.equal(r.status, 400, 'candidate read receipt without a bearer token is refused');
  checks += 1;
}

// ── Staff routes: a signed-in staff session is required, anonymous callers are refused ──
const staffPaths = [
  ['GET', `/api/monitor/exams/${exam}`],
  ['GET', `/api/monitor/attempts/${attempt}/messages`],
  ['POST', `/api/monitor/attempts/${attempt}/messages`],
  ['POST', `/api/monitor/attempts/${attempt}/read`],
];
for (const [method, path] of staffPaths) {
  const body = method === 'POST' ? (path.endsWith('/read') ? { up_to: new Date().toISOString() } : { client_message_id: exam, body: 'Keep going.' }) : undefined;
  const r = await call(method, path, { body });
  assert.equal(r.status, 401, `${method} ${path} without a session is refused with 401`);
  assert.match(r.headers.get('cache-control') ?? '', /no-store/, `${method} ${path} is never cached`);
  checks += 1;
}

console.log(`${checks} checks passed (messaging and monitoring routes, HTTP)`);
