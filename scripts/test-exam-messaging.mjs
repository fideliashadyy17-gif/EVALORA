// Unit checks for the exam messaging and live monitoring rules:
//   src/lib/examMessaging.ts  (delivery, cursors, polling, classification, timers)
//   src/lib/monitorRows.ts    (per-candidate snapshot rows)
// Pure logic, no database and no network. Fixtures only.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const compile = (src) => ts.transpileModule(src, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;

// Same basenames in one directory so the relative imports resolve as they do in the app.
const dir = mkdtempSync(path.join(tmpdir(), 'exam-messaging-'));
for (const name of ['examTrack', 'examMessaging', 'monitorRows']) {
  writeFileSync(path.join(dir, `${name}.js`), compile(readFileSync(`src/lib/${name}.ts`, 'utf8')));
}
const messaging = await import(path.join(dir, 'examMessaging.js'));
const rows = await import(path.join(dir, 'monitorRows.js'));
const {
  normalizeMessageBody, answerState, summarizeProgress, connectionStatus, remainingSeconds,
  mergeMessages, newestCursor, nextPollDelay, newClientMessageId, MESSAGE_MAX_LENGTH, CURSOR_OVERLAP_MS,
  PRESENCE_MIN_GAP_MS, PRESENCE_HEARTBEAT_MS, MONITOR_RECONCILE_MS,
} = messaging;
const {buildMonitorRow, paperForAttempt, sortMonitorRows} = rows;

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
};

// ── Message bodies ─────────────────────────────────────────────
check('empty and whitespace-only bodies are refused', () => {
  assert.equal(normalizeMessageBody('').ok, false);
  assert.equal(normalizeMessageBody('   \n\t ').ok, false);
  assert.equal(normalizeMessageBody(undefined).ok, false);
  assert.equal(normalizeMessageBody(42).ok, false);
});
check('bodies are trimmed, control characters removed, tabs and newlines kept', () => {
  const out = normalizeMessageBody('  hello\u0007\u0000 world\n\tline  ');
  assert.deepEqual(out, {ok: true, body: 'hello world\n\tline'});
});
check('bodies over the limit are refused, not truncated', () => {
  const r = normalizeMessageBody('x'.repeat(MESSAGE_MAX_LENGTH + 1));
  assert.equal(r.ok, false);
  assert.equal(normalizeMessageBody('x'.repeat(MESSAGE_MAX_LENGTH)).ok, true);
});
check('client message ids are version-4 UUIDs and differ per call', () => {
  const a = newClientMessageId();
  const b = newClientMessageId();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});

// ── Answer classification: never guess correct or incorrect ───
check('an empty or cleared answer is not answered', () => {
  assert.equal(answerState(null), 'not_answered');
  assert.equal(answerState({answer: ''}), 'not_answered');
  assert.equal(answerState({answer: {text: '   '}}), 'not_answered');
  assert.equal(answerState({answer: []}), 'not_answered');
});
check('a saved answer with no grading is awaiting grading, never correct', () => {
  assert.equal(answerState({answer: 'x²'}), 'saved_awaiting_grading');
  assert.equal(answerState({answer: 'x²', is_correct: null, points_awarded: null}), 'saved_awaiting_grading');
});
check('a subjective answer that is marked but not classified stays marked', () => {
  assert.equal(answerState({answer: 'essay', is_correct: null, points_awarded: 0}), 'marked');
  assert.equal(answerState({answer: 'essay', is_correct: null, points_awarded: 3.5}), 'marked');
});
check('correct and incorrect are stated only from an explicit grading result', () => {
  assert.equal(answerState({answer: 'B', is_correct: true}), 'correct');
  assert.equal(answerState({answer: 'B', is_correct: false}), 'incorrect');
  assert.equal(answerState({answer: 'B', is_correct: undefined}), 'saved_awaiting_grading');
});

// ── Progress ───────────────────────────────────────────────────
check('progress counts answered, unanswered and percentage over the paper length', () => {
  const s = summarizeProgress(50, [
    {answer: 'A', is_correct: true},
    {answer: 'B', is_correct: false},
    {answer: 'C'},
    {answer: ''},
  ]);
  assert.deepEqual(
    {total: s.total, answered: s.answered, unanswered: s.unanswered, correct: s.correct, incorrect: s.incorrect, awaiting: s.awaiting_grading, pct: s.progress_percent},
    {total: 50, answered: 3, unanswered: 47, correct: 1, incorrect: 1, awaiting: 1, pct: 6},
  );
});
check('progress with an empty paper is zero, never NaN', () => {
  const s = summarizeProgress(0, []);
  assert.equal(s.progress_percent, 0);
  assert.equal(s.unanswered, 0);
});

// ── Connection status ──────────────────────────────────────────
check('connection status follows the age of the last presence heartbeat', () => {
  const now = Date.parse('2026-11-07T10:00:00Z');
  const at = (ms) => new Date(now - ms).toISOString();
  assert.equal(connectionStatus(null, now), 'not_connected');
  assert.equal(connectionStatus(at(5_000), now), 'online');
  assert.equal(connectionStatus(at(100_000), now), 'reconnecting');
  assert.equal(connectionStatus(at(600_000), now), 'offline');
  assert.equal(connectionStatus('not a date', now), 'not_connected');
});

// ── Timer: authoritative server time, independent of the candidate's clock ──
check('remaining time uses the server clock, so a skewed device clock does not change it', () => {
  const localNow = Date.parse('2026-11-07T10:00:00Z');
  const serverNow = '2026-11-07T10:05:00Z'; // device is 5 minutes behind the server
  const deadline = '2026-11-07T10:15:00Z';
  assert.equal(remainingSeconds(deadline, serverNow, localNow), 600);
});
check('remaining time never goes negative and tolerates bad input', () => {
  assert.equal(remainingSeconds('2026-11-07T09:00:00Z', '2026-11-07T10:00:00Z', Date.parse('2026-11-07T10:00:00Z')), 0);
  assert.equal(remainingSeconds('garbage', '2026-11-07T10:00:00Z', 0), 0);
});

// ── Delivery: merge is idempotent and de-duplicated ───────────
const server = (id, kind, at, client = `c-${id}`) => ({
  id, client_message_id: client, sender_kind: kind, body: `m${id}`, created_at: at, delivered_at: null, read_at: null,
});
check('the same server message delivered twice appears once', () => {
  const m = server('1', 'staff', '2026-11-07T10:00:00Z');
  const once = mergeMessages([], [m]);
  const twice = mergeMessages(once, [m, m]);
  assert.equal(twice.length, 1);
  assert.deepEqual(mergeMessages(twice, [m]), twice);
});
check('a local pending reply is replaced by its confirmed server copy, not duplicated', () => {
  const local = {id: null, client_message_id: 'k1', sender_kind: 'candidate', body: 'Hi', created_at: '2026-11-07T10:00:01Z', delivered_at: null, read_at: null, status: 'sending'};
  const confirmed = {id: 'srv-9', client_message_id: 'k1', sender_kind: 'candidate', body: 'Hi', created_at: '2026-11-07T10:00:02Z', delivered_at: null, read_at: null};
  const thread = mergeMessages([local], [confirmed]);
  assert.equal(thread.length, 1);
  assert.equal(thread[0].id, 'srv-9');
  assert.equal(thread[0].status, undefined);
});
check('the same client message id from two senders does not collapse', () => {
  const thread = mergeMessages([], [server('1', 'staff', '2026-11-07T10:00:00Z', 'same'), server('2', 'candidate', '2026-11-07T10:00:01Z', 'same')]);
  assert.equal(thread.length, 2);
});
check('the thread is ordered by server time regardless of arrival order', () => {
  const thread = mergeMessages([], [server('b', 'staff', '2026-11-07T10:00:05Z'), server('a', 'staff', '2026-11-07T10:00:01Z')]);
  assert.deepEqual(thread.map((m) => m.id), ['a', 'b']);
});
check('read receipts from the server update an existing message without losing its timestamp', () => {
  const first = server('1', 'candidate', '2026-11-07T10:00:00Z');
  const read = {...first, read_at: '2026-11-07T10:01:00Z'};
  const thread = mergeMessages(mergeMessages([], [first]), [read]);
  assert.equal(thread[0].read_at, '2026-11-07T10:01:00Z');
  assert.equal(thread[0].created_at, '2026-11-07T10:00:00Z');
});

// ── Cursor: overlap protects against commit-order gaps ────────
check('the cursor is the newest confirmed time minus the overlap', () => {
  const cursor = newestCursor([server('1', 'staff', '2026-11-07T10:00:00Z'), server('2', 'staff', '2026-11-07T10:00:30Z')]);
  assert.equal(cursor, new Date(Date.parse('2026-11-07T10:00:30Z') - CURSOR_OVERLAP_MS).toISOString());
  assert.ok(CURSOR_OVERLAP_MS >= 5_000, 'overlap must cover a realistic commit delay');
});
check('a local message with no server id does not move the cursor', () => {
  assert.equal(newestCursor([{id: null, client_message_id: 'x', sender_kind: 'candidate', body: 'x', created_at: '2026-11-07T10:00:00Z', delivered_at: null, read_at: null}]), null);
});

// ── Polling cadence ────────────────────────────────────────────
check('polling is 4 s when open, 10 s visible, 20 s hidden', () => {
  assert.equal(nextPollDelay({open: true, visible: true, failures: 0}), 4_000);
  assert.equal(nextPollDelay({open: false, visible: true, failures: 0}), 10_000);
  assert.equal(nextPollDelay({open: false, visible: false, failures: 0}), 20_000);
});
check('failures back off exponentially and cap at one minute', () => {
  const a = nextPollDelay({open: false, visible: true, failures: 1});
  const b = nextPollDelay({open: false, visible: true, failures: 2});
  assert.ok(a > 10_000 && b > a);
  assert.equal(nextPollDelay({open: false, visible: true, failures: 50}), 60_000);
});
check('presence throttle and reconcile intervals are bounded', () => {
  assert.ok(PRESENCE_MIN_GAP_MS >= 1_000);
  assert.ok(PRESENCE_HEARTBEAT_MS >= 15_000 && PRESENCE_HEARTBEAT_MS <= 60_000);
  assert.equal(MONITOR_RECONCILE_MS, 15_000);
});

// ── Monitor rows ───────────────────────────────────────────────
const BC_ONLY = new Set([45, 46, 47, 49, 50]);
const paper = Array.from({length: 50}, (_, i) => ({id: `q${i + 1}`, questions: {config: {bc_only: BC_ONLY.has(i + 1)}}}));
const NOW = Date.parse('2026-11-07T10:00:00Z');
const base = {
  id: 'att-1',
  status: 'in_progress',
  started_at: '2026-11-07T09:00:00Z',
  submitted_at: null,
  track: 'AB',
  question_order: null,
  candidate_name: 'Ada Student',
  candidate_ref: 'C-001',
  class_name: 'Calculus AB',
  deadline: '2026-11-07T11:00:00Z',
  answers: [],
  presence: null,
  unread_from_candidate: 0,
};

check('an AB candidate is counted against the AB paper, not the BC items', () => {
  const r = buildMonitorRow(base, paperForAttempt(paper, null, 'AB'), NOW);
  assert.equal(r.total_questions, 45);
});
check('a BC candidate is counted against the full paper', () => {
  const r = buildMonitorRow({...base, track: 'BC'}, paperForAttempt(paper, null, 'BC'), NOW);
  assert.equal(r.total_questions, 50);
});
check('a stored question order is used before the track default', () => {
  const order = ['q3', 'q1'];
  const p = paperForAttempt(paper, order, 'AB');
  assert.deepEqual(p.map((r) => r.id), ['q3', 'q1']);
});
check('answers to questions outside the candidate paper do not count toward progress', () => {
  const answers = [
    {quiz_question_id: 'q1', answer: 'A', is_correct: true},
    {quiz_question_id: 'q46', answer: 'A', is_correct: true}, // BC-only: not on an AB paper
    {quiz_question_id: null, answer: 'A'},
  ];
  const r = buildMonitorRow({...base, answers}, paperForAttempt(paper, null, 'AB'), NOW);
  assert.equal(r.answered, 1);
  assert.equal(r.correct, 1);
});
check('a live attempt never shows correct or incorrect from unmarked answers', () => {
  const answers = [
    {quiz_question_id: 'q1', answer: 'A'},
    {quiz_question_id: 'q2', answer: 'essay', points_awarded: 0},
  ];
  const r = buildMonitorRow({...base, answers}, paperForAttempt(paper, null, 'AB'), NOW);
  assert.equal(r.correct, 0);
  assert.equal(r.incorrect, 0);
  assert.equal(r.awaiting_grading, 1);
  assert.equal(r.marked, 1);
});
check('pause state surfaces on the monitor row (Feature D)', () => {
  const plain = buildMonitorRow(base, paperForAttempt(paper, null, 'AB'), NOW);
  assert.deepEqual(plain.pause_reasons, [], 'legacy rows are never paused');
  assert.equal(plain.paused_at, null);
  const assessment = buildMonitorRow(
    {...base, pause_reasons: ['assessment'], paused_at: '2026-11-07T09:50:00Z'},
    paperForAttempt(paper, null, 'AB'), NOW);
  assert.deepEqual(assessment.pause_reasons, ['assessment']);
  assert.equal(assessment.paused_at, '2026-11-07T09:50:00Z');
  const both = buildMonitorRow(
    {...base, pause_reasons: ['student', 'assessment'], paused_at: '2026-11-07T09:50:00Z'},
    paperForAttempt(paper, null, 'AB'), NOW);
  assert.deepEqual(both.pause_reasons, ['assessment', 'student'], 'reasons are normalized and ordered');
  const junk = buildMonitorRow({...base, pause_reasons: null, paused_at: undefined}, paperForAttempt(paper, null, 'AB'), NOW);
  assert.deepEqual(junk.pause_reasons, []);
});
check('connection, current question and browser-reported unsaved count come from presence', () => {
  const presence = {last_seen_at: new Date(NOW - 5_000).toISOString(), current_question: 12, pending_saves: 2};
  const r = buildMonitorRow({...base, presence}, paperForAttempt(paper, null, 'AB'), NOW);
  assert.equal(r.connection, 'online');
  assert.equal(r.current_question, 12);
  assert.equal(r.pending_saves, 2);
});
check('a submitted attempt is never shown as connected', () => {
  const presence = {last_seen_at: new Date(NOW - 1_000).toISOString(), current_question: 3, pending_saves: 0};
  const r = buildMonitorRow({...base, status: 'submitted', submitted_at: '2026-11-07T09:50:00Z', presence}, paperForAttempt(paper, null, 'AB'), NOW);
  assert.equal(r.connection, 'not_connected');
});
check('monitor rows carry no answer key, marking scheme or access token', () => {
  const r = buildMonitorRow({...base, answers: [{quiz_question_id: 'q1', answer: 'A', is_correct: true}]}, paperForAttempt(paper, null, 'AB'), NOW);
  for (const forbidden of ['answer', 'answers', 'correct_answer', 'marking_scheme', 'access_token', 'question_order', 'score']) {
    assert.equal(Object.prototype.hasOwnProperty.call(r, forbidden), false, `row must not expose ${forbidden}`);
  }
});
check('live attempts sort first, then by candidate name', () => {
  const sorted = sortMonitorRows([
    buildMonitorRow({...base, id: 'b', candidate_name: 'Zed', status: 'submitted'}, paper, NOW),
    buildMonitorRow({...base, id: 'c', candidate_name: 'Bea'}, paper, NOW),
    buildMonitorRow({...base, id: 'a', candidate_name: 'Ana'}, paper, NOW),
  ]);
  assert.deepEqual(sorted.map((r) => r.attempt_id), ['a', 'c', 'b']);
});

console.log(`${checks} checks passed (exam messaging and monitor rows)`);
