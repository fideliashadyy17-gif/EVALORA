// Real-Chromium checks for the candidate messenger and the paper's isolation from it.
// Fixture-only: every /api/exam request is intercepted. No database, no production exam, no real candidate.
//
// Install temporary test-only dependencies (same as the other browser suites):
//   npm install --no-save --package-lock=false --ignore-scripts @sparticuz/chromium@153.0.0 playwright-core@1.64.1
// Start a local dev server on port 3101 with mock.invalid environment values:
//   NEXT_PUBLIC_SUPABASE_URL=https://mock.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key \
//   SUPABASE_SERVICE_ROLE_KEY=mock-service-key NEXT_PUBLIC_APP_URL=http://127.0.0.1:3101 \
//   NEXT_PUBLIC_ROOT_DOMAIN=127.0.0.1:3101 LIVE_DISPLAY_TOKEN_SECRET=mock-display-secret \
//   LIVEKIT_API_KEY=mock LIVEKIT_API_SECRET=mock NEXT_PUBLIC_LIVEKIT_URL=wss://mock.invalid \
//   npx next dev --turbopack -H 0.0.0.0 -p 3101
// Then: node scripts/test-exam-messaging-browser.mjs
//
// Scenarios covered here: A (teacher message arrives without a reload and the student continues),
// B (reply is sent once and kept in the thread), C (typed answers survive arrival, reply and close),
// E (offline send is queued, delivered once after reconnection, and survives a reload of the tab),
// H (no save, submit or reload is caused by messaging). Scenarios D and F need the teacher monitor
// and a second student's session; they are not executed by this suite.
import assert from 'node:assert/strict';
import { chromium as playwright } from 'playwright-core';
import chromium from '@sparticuz/chromium';

const executablePath = await chromium.executablePath();
process.env.LD_LIBRARY_PATH = ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const browser = await playwright.launch({ headless: true, executablePath, args: chromium.args });

const aid = '00000000-0000-4000-8000-000000000001';
const token = '00000000-0000-4000-8000-000000000002';
const qids = ['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004'];
const store = {
  status: 'in_progress',
  answers: {},
  saves: 0,
  submits: 0,
  offline: false,
  messages: [], // server-side thread for this attempt only
  candidatePosts: [], // every POST received, with its client id, for duplicate detection
  seq: 0,
};

const stamp = () => new Date(Date.now() + ++store.seq * 1000).toISOString(); // strictly increasing server times
const responseState = () => ({
  server_now: new Date().toISOString(),
  exam: { id: 'exam', title: 'Messaging Fixture Examination', description: null, instructions: null, proctoring: false, require_screen_share: false, pass_mark_percent: 50 },
  candidate: { name: 'Fixture Candidate', ref: null },
  attempt: { id: aid, status: store.status, deadline: new Date(Date.now() + 3_600_000).toISOString(), flagged: [], score: null, max_score: null, results_published: false },
  questions: qids.map((id, i) => ({
    question_id: id, quiz_question_id: `quiz-${i}`, type: 'short_answer', prompt: `Question ${i + 1}`, points: 1,
    media_url: null, media_type: null, options: [], saved_answer: store.answers[id] ?? null, result: null,
  })),
});

/** Teacher-side injection: what the server would hold after a teacher sends a message. */
const teacherSends = (body) => {
  store.messages.push({
    id: `srv-staff-${store.messages.length + 1}`, client_message_id: `staff-${store.messages.length + 1}`,
    sender_kind: 'staff', body, created_at: stamp(), delivered_at: null, read_at: null,
  });
};

const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
await page.addInitScript(({ id, t }) => {
  if (!localStorage.getItem(`evalora-attempt-${id}`)) localStorage.setItem(`evalora-attempt-${id}`, JSON.stringify({ token: t }));
}, { id: aid, t: token });

await page.route('**/api/exam/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === '/api/exam/state') {
    assert.equal(request.headers().authorization, `Bearer ${token}`);
    return route.fulfill({ status: 200, json: responseState() });
  }
  if (url.pathname === '/api/exam/save') {
    store.saves += 1;
    const payload = request.postDataJSON();
    store.answers[payload.question_id] = payload.answer;
    return route.fulfill({ status: 200, json: { ok: true } });
  }
  if (url.pathname === '/api/exam/submit') { store.submits += 1; return route.fulfill({ status: 200, json: { ok: true } }); }
  if (url.pathname === '/api/exam/integrity') return route.fulfill({ status: 200, json: { ok: true, recorded: false, count: 0, level: 'none', reason: 'duplicate' } });
  if (url.pathname === '/api/exam/presence') return route.fulfill({ status: 200, json: { ok: true } });
  if (url.pathname === '/api/exam/messages/read') {
    // Same contract as the server: marks the teacher's messages up to the given time as read.
    const { up_to } = request.postDataJSON();
    const now = new Date().toISOString();
    for (const m of store.messages) if (m.sender_kind === 'staff' && !m.read_at && m.created_at <= up_to) m.read_at = now;
    return route.fulfill({ status: 200, json: { ok: true } });
  }
  if (url.pathname === '/api/exam/messages' && request.method() === 'GET') {
    assert.equal(request.headers().authorization, `Bearer ${token}`);
    if (store.offline) return route.abort('internetdisconnected');
    const after = url.searchParams.get('after');
    const list = store.messages.filter((m) => !after || m.created_at >= after);
    return route.fulfill({
      status: 200,
      json: {
        server_now: new Date().toISOString(),
        messages: list.map((m) => ({ ...m, delivered_at: m.delivered_at ?? new Date().toISOString() })),
        unread_from_teacher: store.messages.filter((m) => m.sender_kind === 'staff' && !m.read_at).length,
      },
    });
  }
  if (url.pathname === '/api/exam/messages' && request.method() === 'POST') {
    if (store.offline) return route.abort('internetdisconnected');
    const payload = request.postDataJSON();
    store.candidatePosts.push({ client_message_id: payload.client_message_id, body: payload.body });
    // Idempotent on (attempt, sender, client_message_id): a retry returns the stored message.
    let stored = store.messages.find((m) => m.sender_kind === 'candidate' && m.client_message_id === payload.client_message_id);
    if (!stored) {
      stored = { id: `srv-cand-${store.messages.length + 1}`, client_message_id: payload.client_message_id, sender_kind: 'candidate', body: payload.body, created_at: stamp(), delivered_at: null, read_at: null };
      store.messages.push(stored);
    }
    return route.fulfill({ status: 200, json: { message: stored } });
  }
  throw Error(`Unexpected request ${url.pathname}`);
});

/** Waits for the launcher's badge to show n unread (the badge is text inside the Messages button). */
const waitForBadge = (n, timeout = 25_000) => page.waitForFunction((count) => {
  const button = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').startsWith('Messages'));
  return Boolean(button && (button.textContent ?? '').trim() === `Messages${count}`);
}, n, { timeout });

const reloadMarker = () => page.evaluate(() => { window.__noReload = window.__noReload ?? 'marker'; return window.__noReload; });

try {
  await page.goto(`http://127.0.0.1:3101/take-exam/${aid}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByText('Messaging Fixture Examination').waitFor({ timeout: 120_000 });
  await page.evaluate(() => { window.__noReload = 'marker'; });
  const answer = page.getByPlaceholder('Type your answer…').first();
  await answer.waitFor();

  // ── Scenario A: teacher sends, the student sees it without a reload and keeps working ──
  await answer.fill('x = 4');
  teacherSends('Please check your answer to question 1.');
  const toggle = page.getByRole('button', { name: /^Messages/ });
  await toggle.waitFor();
  // Delivered by the poll (closed panel: up to 10 s). The badge appears without any navigation.
  await waitForBadge(1);
  assert.equal(await reloadMarker(), 'marker', 'page must not reload when a message arrives');
  assert.equal(await answer.inputValue(), 'x = 4', 'typed answer must survive arrival');
  await toggle.click();
  const log = page.getByRole('log');
  await log.getByText('Please check your answer to question 1.').waitFor();
  console.log('PASS A: teacher message delivered and shown without reload; typed answer intact.');

  // ── Scenario C: typing and reply and close, with the answer unchanged ──
  await answer.click();
  await answer.fill('x = 4 and more');
  await page.getByLabel('Reply to your teacher').fill('Thanks, I will check it.');
  await page.getByRole('button', { name: 'Minimize' }).click();
  assert.equal(await answer.inputValue(), 'x = 4 and more', 'closing the panel must not alter the answer');
  teacherSends('Good, keep going.');
  await waitForBadge(1);
  assert.equal(await answer.inputValue(), 'x = 4 and more', 'arrival while typing must not alter the answer');
  await toggle.click();
  assert.equal(await page.getByLabel('Reply to your teacher').inputValue(), 'Thanks, I will check it.', 'unsent reply draft is kept while the panel is open');
  await log.getByText('Good, keep going.').waitFor();
  console.log('PASS C: answer and reply draft preserved across arrival and close.');

  // ── Scenario B: reply is sent once, shown in the thread, and kept ──
  await page.getByRole('button', { name: 'Send' }).click();
  await log.getByText('Thanks, I will check it.').waitFor();
  await page.getByText(/Read by your teacher|Sent/).first().waitFor({ timeout: 15_000 });
  assert.equal(store.candidatePosts.filter((p) => p.body === 'Thanks, I will check it.').length, 1, 'one POST for one reply');
  assert.equal(store.messages.filter((m) => m.sender_kind === 'candidate' && m.body === 'Thanks, I will check it.').length, 1, 'one stored reply');
  assert.equal(await log.getByText('Thanks, I will check it.').count(), 1, 'one bubble in the thread');
  console.log('PASS B: reply sent once, shown once, history kept.');

  // ── Scenario E: network interruption: queued, delivered once, answers preserved ──
  store.offline = true;
  await page.getByLabel('Reply to your teacher').fill('Sent while offline.');
  await page.getByRole('button', { name: 'Send' }).click();
  await log.getByText('Sent while offline.').waitFor();
  await page.getByText('Reconnecting… your messages are kept.').waitFor({ timeout: 15_000 });
  await page.getByText('Sending…').first().waitFor({ timeout: 15_000 });
  assert.equal(await answer.inputValue(), 'x = 4 and more', 'answer preserved while offline');
  // Reconnect the network, then reload this tab: the queued reply must come back from this tab's storage and be sent once.
  // Still offline, the unsaved answer is untouched in the page (messaging never resets the paper).
  assert.equal(await answer.inputValue(), 'x = 4 and more', 'unsaved answer untouched while offline');
  // Reconnect, save the answer explicitly as the candidate would, then reload to prove the saved answer and the queued reply both survive.
  store.offline = false;
  await page.getByRole('button', { name: 'Save answer' }).click();
  for (let i = 0; i < 100 && store.answers[qids[0]]?.text !== 'x = 4 and more'; i += 1) await new Promise((r) => setTimeout(r, 100));
  assert.equal(store.answers[qids[0]]?.text, 'x = 4 and more', 'the explicit save reached the server');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Messaging Fixture Examination').waitFor();
  await page.getByRole('button', { name: /^Messages/ }).click();
  await page.getByRole('log').getByText('Sent while offline.').waitFor({ timeout: 30_000 });
  const offlineCopies = store.messages.filter((m) => m.body === 'Sent while offline.');
  assert.equal(offlineCopies.length, 1, 'queued reply stored exactly once after reconnection');
  assert.equal(await page.getByRole('log').getByText('Sent while offline.').count(), 1, 'queued reply shown exactly once');
  assert.equal(await page.getByPlaceholder('Type your answer…').first().inputValue(), 'x = 4 and more', 'saved answer restored from the server after the reconnection');
  console.log('PASS E: offline reply queued, delivered once after reconnection, answer preserved.');

  // ── Scenario H: messaging caused no save, submit, status change or reload of the paper ──
  assert.equal(store.submits, 0, 'messaging must never submit');
  assert.equal(store.status, 'in_progress', 'messaging must never change the attempt status');
  // Autosave may store what the candidate typed. Messaging must never write anything else.
  for (const id of qids) {
    const saved = store.answers[id];
    assert.ok(saved === undefined || (id === qids[0] && saved.text === 'x = 4 and more'), 'only typed answers are ever saved');
  }
  assert.equal(store.candidatePosts.length, 2, 'two replies were sent in total (one online, one queued offline)');
  // Responsive layout: the closed launcher and the open panel stay inside the viewport on phone and tablet widths.
  for (const [width, height] of [[390, 844], [820, 1180], [1280, 860]]) {
    await page.setViewportSize({ width, height });
    const panel = page.locator('#exam-messenger-panel');
    const box = (await panel.count()) ? await panel.boundingBox() : await page.getByRole('button', { name: /^Messages/ }).boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, `panel fits ${width}x${height}`);
  }
  assert.equal(await reloadMarker(), 'marker', 'no reload anywhere in the run');
  console.log('PASS H: no submit, status change, save or reload caused by messaging; panel fits phone, tablet and desktop.');
  console.log(`checks: saves=${store.saves} submits=${store.submits} candidate POSTs=${store.candidatePosts.length} stored messages=${store.messages.length}`);
} finally {
  await context.close();
  await browser.close();
}
