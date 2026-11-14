// Real Next/Chromium chunk and answer-retention smoke; all APIs intercepted.
import assert from 'node:assert/strict';
import { chromium as playwright } from 'playwright-core';
import chromium from '@sparticuz/chromium';
const executablePath = await chromium.executablePath();
process.env.LD_LIBRARY_PATH = ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const browser = await playwright.launch({ executablePath, headless: true, args: chromium.args });
const context = await browser.newContext();
const page = await context.newPage();
const aid = '00000000-0000-4000-8000-000000000001';
let answer = null;
await context.addInitScript(({ aid }) => localStorage.setItem(`evalora-attempt-${aid}`, JSON.stringify({ token: '00000000-0000-4000-8000-000000000002' })), { aid });
await page.route('**/api/**', route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/exam/state') return route.fulfill({ json: {
    server_now: new Date().toISOString(), exam: { id: 'exam', title: 'Response tool verification', proctoring: false, require_screen_share: false, instructions: null },
    candidate: { name: 'Test Candidate', ref: null }, attempt: { id: aid, status: 'in_progress', deadline: new Date(Date.now() + 3600000).toISOString(), flagged: [], results_published: false },
    questions: [{ question_id: 'question', quiz_question_id: 'quiz-question', type: 'open_ended', prompt: 'Plot a graph of y = x squared and explain your reasoning.', points: 10, options: [], media_url: null, media_type: null, saved_answer: answer, result: null }],
  } });
  if (path === '/api/exam/save') { answer = route.request().postDataJSON().answer; return route.fulfill({ json: { ok: true } }); }
  if (path === '/api/exam/messages') return route.fulfill({ json: { server_now: new Date().toISOString(), messages: [], unread_from_teacher: 0 } });
  if (path === '/api/exam/submit') throw new Error('Tool use must not submit an attempt');
  return route.fulfill({ json: { ok: true } });
});
try {
  await page.goto(`http://127.0.0.1:3101/take-exam/${aid}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /Written answer/ }).click();
  const editor = page.locator('.tiptap[contenteditable=true]').first();
  await editor.waitFor({ timeout: 15000 }).catch(async e => { console.log(await page.locator('body').innerText()); throw e; });
  await editor.fill('My reasoning remains when I switch tools.');
  const written = page.getByRole('tab', { name: /Written answer/ });
  await written.focus(); await page.keyboard.press('ArrowRight');
  await page.getByTestId('graph-editor').waitFor({ timeout: 30000 });
  assert.equal(await page.getByRole('tab', { name: /Graph/ }).getAttribute('aria-selected'), 'true');
  await written.click();
  assert.match(await editor.innerText(), /My reasoning remains/);
  await page.getByRole('button', { name: 'Save answer', exact: true }).click();
  await page.getByText('1 of 1 answers confirmed by the server.').waitFor();
  assert.ok(answer?.doc, 'structured document reaches the mocked save API');
  for (const width of [390, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `no horizontal page overflow at ${width}px (got ${overflow})`);
  }
  console.log('7 browser checks passed: real dynamic written/graph tools, keyboard tab activation, retained reasoning, confirmed save and phone/tablet/desktop overflow.');
} finally { await context.close(); await browser.close(); }
