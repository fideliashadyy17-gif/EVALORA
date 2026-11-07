// Optional real-browser suite for the assessment copy, cut, paste and context-menu lockdown.
// Install temporary test-only dependencies (same as test-exam-browser.mjs):
//   npm install --no-save --package-lock=false --ignore-scripts @sparticuz/chromium@153.0.0 playwright-core@1.64.1
// Start a local Next dev server on port 3101 with mock.invalid Supabase values:
//   NEXT_PUBLIC_SUPABASE_URL=https://mock.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key \
//   SUPABASE_SERVICE_ROLE_KEY=mock-service-key NEXT_PUBLIC_APP_URL=http://127.0.0.1:3101 \
//   NEXT_PUBLIC_ROOT_DOMAIN=127.0.0.1:3101 LIVE_DISPLAY_TOKEN_SECRET=mock-display-secret \
//   LIVEKIT_API_KEY=mock LIVEKIT_API_SECRET=mock NEXT_PUBLIC_LIVEKIT_URL=wss://mock.invalid \
//   npx next dev --turbopack -H 0.0.0.0 -p 3101
// Then run: node scripts/test-assessment-lockdown-browser.mjs
// Every /api request is intercepted. Nothing reaches a real database, and no
// production assessment is created or changed.
import assert from "node:assert/strict";
import { chromium as playwright } from "playwright-core";
import chromium from "@sparticuz/chromium";

const BASE = "http://127.0.0.1:3101";
const COPY_NOTICE = "Copying, cutting and pasting are disabled during this assessment.";
const MENU_NOTICE = "The right-click menu is disabled during this assessment.";
const aid = "00000000-0000-4000-8000-000000000001";
const token = "00000000-0000-4000-8000-000000000002";
const qids = ["00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004"];
const PLACEHOLDER = "Type your answer…";

const executablePath = await chromium.executablePath();
process.env.LD_LIBRARY_PATH = ["/tmp/al2023/lib", process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
const browser = await playwright.launch({ headless: true, executablePath, args: chromium.args });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });

// Records what happened at the document, after the lockdown's window-capture
// listeners had their say: whether each event was cancelled (defaultPrevented).
await context.addInitScript(() => {
  window.__probe = [];
  for (const type of ["keydown", "copy", "cut", "paste", "contextmenu", "beforeinput", "selectstart", "dragstart"]) {
    document.addEventListener(
      type,
      (e) => window.__probe.push({ type, key: e.key ?? null, inputType: e.inputType ?? null, prevented: e.defaultPrevented }),
      false,
    );
  }
});

const server = {
  status: "in_progress",
  answers: {},
  submits: 0,
  saves: 0,
  integrity: [],
  unexpected: [],
  stateRequests: 0,
};
const liveNow = () => new Date().toISOString();

function examState() {
  return {
    server_now: liveNow(),
    exam: {
      id: "exam",
      title: "Mock Examination",
      description: null,
      instructions: null,
      proctoring: false,
      require_screen_share: false,
      pass_mark_percent: 50,
      integrity: { enabled: true, clipboard: true, tabSwitch: true, focusLoss: true, fullscreen: false, sound: false, warnAfter: 3, reviewAfter: 5 },
    },
    candidate: { name: "Test Candidate", ref: null },
    attempt: {
      id: aid,
      status: server.status,
      deadline: new Date(Date.now() + 3600000).toISOString(),
      flagged: [],
      score: null,
      max_score: null,
      results_published: false,
    },
    questions: qids.map((id, i) => ({
      question_id: id,
      quiz_question_id: `quiz-${i}`,
      type: "short_answer",
      prompt: `Question ${i + 1}`,
      points: 1,
      media_url: null,
      media_type: null,
      options: [],
      saved_answer: server.answers[id] ?? null,
      result: null,
    })),
  };
}

function liveQuizState() {
  const now = Date.now();
  return {
    server_now: new Date(now).toISOString(),
    session: {
      id: "session-1",
      title: "Live Quiz Title",
      status: "live",
      mode: "live",
      phase: "question",
      question_started_at: new Date(now).toISOString(),
      question_deadline_at: new Date(now + 120000).toISOString(),
      time_per_question_seconds: 120,
    },
    progress: { index: 0, total: 3, remaining_after_current: 2 },
    question: {
      quiz_question_id: "lq-1",
      question_id: "lqq-1",
      type: "short_answer",
      prompt: "Live question prompt",
      points: 1,
      media_url: null,
      media_type: null,
      options: [],
    },
    my_answer: null,
    explanation: null,
    participant: { display_name: "Live Student", avatar_key: "owl", status: "active", score: 0, finished: false },
    participant_count: 4,
    leaderboard: null,
    my_rank: null,
  };
}

function publicScreenState() {
  return {
    server_now: liveNow(),
    title: "Public Screen Title",
    organization: null,
    instructions: null,
    join_code: "ABC123",
    status: "lobby",
    mode: "live",
    phase: "waiting",
    progress: { index: 0, total: 3, remaining_after_current: 3 },
    question: null,
    question_started_at: null,
    question_deadline_at: null,
    time_per_question_seconds: 30,
    joined: 0,
    answered_current: 0,
    leaderboard: null,
    audio: { enabled: false, volume: 0.5, theme: "off", sound_effects: false },
    presentation: { animations_enabled: false, show_join_code_on_screen: true },
  };
}

await context.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  if (path === "/api/exam/state") {
    assert.equal(request.headers().authorization, `Bearer ${token}`);
    server.stateRequests += 1;
    return route.fulfill({ status: 200, json: examState() });
  }
  if (path === "/api/exam/save") {
    server.saves += 1;
    const payload = request.postDataJSON();
    server.answers[payload.question_id] = payload.answer;
    return route.fulfill({ status: 200, json: { ok: true } });
  }
  if (path === "/api/exam/submit") {
    server.submits += 1;
    server.status = "submitted";
    return route.fulfill({ status: 200, json: { ok: true } });
  }
  if (path === "/api/exam/integrity") {
    const payload = request.postDataJSON();
    server.integrity.push(payload);
    const count = server.integrity.length;
    return route.fulfill({ status: 200, json: { ok: true, recorded: true, count, level: count >= 3 ? "strong" : "warn" } });
  }
  if (path === "/api/live/state") return route.fulfill({ status: 200, json: liveQuizState() });
  if (path === "/api/live/answer") return route.fulfill({ status: 200, json: { ok: true } });
  if (path === "/api/live/screen") return route.fulfill({ status: 200, json: publicScreenState() });
  server.unexpected.push(path);
  return route.fulfill({ status: 404, json: { error: `not mocked: ${path}` } });
});

const page = await context.newPage();
let checks = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  console.log(`  ✓ ${message}`);
  checks += 1;
}

const probe = () => page.evaluate(() => window.__probe.slice());
const clearProbe = () => page.evaluate(() => { window.__probe.length = 0; });
const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
const setClipboard = (text) => page.evaluate((t) => navigator.clipboard.writeText(t), text);

// Press a key combination and report whether the page cancelled that keydown.
async function pressCancelled(combo, key) {
  await clearProbe();
  await page.keyboard.press(combo);
  const events = await probe();
  const hit = events.find((e) => e.type === "keydown" && e.key && e.key.toLowerCase() === key.toLowerCase());
  assert.ok(hit, `keydown for ${combo} was observed`);
  return hit.prevented;
}

async function selectText(text) {
  await page.evaluate((t) => {
    const nodes = [...document.querySelectorAll("body *")].filter((e) => e.childElementCount === 0 && e.textContent?.trim() === t);
    const el = nodes.at(-1);
    if (!el) throw new Error(`no node with text ${t}`);
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, text);
}

async function openExam(reset = {}) {
  Object.assign(server, { status: "in_progress", answers: {}, submits: 0, saves: 0, integrity: [] }, reset);
  await page.addInitScript(
    ({ id, t }) => {
      if (!localStorage.getItem(`evalora-attempt-${id}`)) localStorage.setItem(`evalora-attempt-${id}`, JSON.stringify({ token: t }));
    },
    { id: aid, t: token },
  );
  await page.goto(`${BASE}/take-exam/${aid}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByText("Mock Examination").waitFor({ timeout: 120000 });
  await page.getByText("Question 1", { exact: true }).first().waitFor();
  await clearProbe();
}

const answerBox = () => page.getByPlaceholder(PLACEHOLDER);
const prompt = () => page.getByText("Question 1", { exact: true }).first();
const timerText = () => page.locator("p.tabular-nums").filter({ hasText: /^\d{1,3}:\d{2}(:\d{2})?$/ }).first().textContent();

try {
  console.log("Test A: copying question text is cancelled, not only reported");
  await openExam();
  ok(await page.evaluate(() => document.documentElement.classList.contains("assessment-protected")), "the paper is marked as a protected surface while in progress");
  ok((await page.evaluate(() => getComputedStyle(document.body).userSelect)) === "none", "question text cannot be selected in the body");
  await setClipboard("SENTINEL-A");
  await selectText("Question 1");
  ok((await pressCancelled("Control+c", "c")) === true, "Ctrl+C on selected question text is cancelled");
  ok((await clipboard()) === "SENTINEL-A", "the clipboard is unchanged after Ctrl+C on question text");
  await page.getByText(COPY_NOTICE).first().waitFor();
  ok(true, "the candidate sees: " + COPY_NOTICE);
  const synthetic = await page.evaluate(() => document.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true })));
  ok(synthetic === false, "a copy event dispatched on the document is cancelled (dispatchEvent returns false)");

  console.log("Test B: cut is blocked in answer fields");
  await openExam();
  await answerBox().fill("keep this");
  await setClipboard("SENTINEL-B");
  await answerBox().click();
  await page.keyboard.press("Control+a");
  ok((await pressCancelled("Control+x", "x")) === true, "Ctrl+X in an answer field is cancelled");
  ok((await answerBox().inputValue()) === "keep this", "the answer text survives Ctrl+X");
  ok((await pressCancelled("Shift+Delete", "Delete")) === true, "Shift+Delete in an answer field is cancelled");
  ok((await answerBox().inputValue()) === "keep this", "the answer text survives Shift+Delete");
  ok((await clipboard()) === "SENTINEL-B", "the clipboard was not overwritten by a cut");

  console.log("Test C: paste is blocked in answer fields");
  await openExam();
  await setClipboard("PASTED-C");
  await answerBox().fill("mine");
  await answerBox().click();
  await page.keyboard.press("End");
  ok((await pressCancelled("Control+v", "v")) === true, "Ctrl+V is cancelled");
  ok((await pressCancelled("Shift+Insert", "Insert")) === true, "Shift+Insert is cancelled");
  ok((await pressCancelled("Control+Shift+V", "v")) === true, "Ctrl+Shift+V (paste as plain text) is cancelled");
  ok((await answerBox().inputValue()) === "mine", "pasted text never reaches the answer");
  const pasteInput = await page.evaluate(() => {
    const field = document.querySelector("input[placeholder='Type your answer…']");
    return field.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertFromPaste", bubbles: true, cancelable: true }));
  });
  ok(pasteInput === false, "a paste through the Edit menu or drop path (beforeinput) is cancelled too");
  ok((await copyCountCheck()) === true, "Ctrl+Insert is cancelled");

  console.log("Test D: right-click on the paper is cancelled");
  await openExam();
  await clearProbe();
  await prompt().click({ button: "right" });
  const menu = (await probe()).find((e) => e.type === "contextmenu");
  ok(menu && menu.prevented === true, "the browser context menu is cancelled on right-click");
  await page.getByText(MENU_NOTICE).first().waitFor();
  ok(true, "the candidate sees: " + MENU_NOTICE);

  console.log("Test E: keyboard routes to the context menu are cancelled");
  await openExam();
  ok((await pressCancelled("ContextMenu", "ContextMenu")) === true, "the Menu key is cancelled");
  ok((await pressCancelled("Shift+F10", "F10")) === true, "Shift+F10 is cancelled");

  console.log("Test F: ordinary editing still works");
  await openExam();
  await answerBox().click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  ok((await answerBox().inputValue()) === "", "Backspace clears the answer");
  ok((await pressCancelled("c", "c")) === false, "typing the letter c is not cancelled");
  await page.keyboard.type("vx");
  ok((await answerBox().inputValue()) === "cvx", "letters c, v and x type normally");
  ok((await pressCancelled("Backspace", "Backspace")) === false, "Backspace is not cancelled");
  ok((await answerBox().inputValue()) === "cv", "Backspace removes the last character");
  await page.keyboard.press("ArrowLeft");
  ok((await pressCancelled("Delete", "Delete")) === false, "arrows and Delete are not cancelled");
  ok((await answerBox().inputValue()) === "c", "Delete removes the character after the caret");
  ok((await pressCancelled("Control+z", "z")) === false, "undo (Ctrl+Z) is not cancelled");
  ok((await pressCancelled("Shift+ArrowLeft", "ArrowLeft")) === false, "selection with Shift+arrows is not cancelled");
  await page.keyboard.press("Control+a");
  await page.keyboard.type("final");
  ok((await answerBox().inputValue()) === "final", "select-all then typing still replaces the answer");

  console.log("Test G: blocked actions never submit, stop the timer or drop progress");
  await openExam();
  await answerBox().fill("draft kept");
  const before = await timerText();
  for (let i = 0; i < 3; i += 1) {
    await pressCancelled("Control+c", "c");
    await pressCancelled("Control+x", "x");
    await pressCancelled("Control+v", "v");
  }
  await page.waitForTimeout(2200);
  const after = await timerText();
  ok(before !== after, `the timer keeps running (${before} → ${after})`);
  ok(server.submits === 0, "no submission was made by blocked actions");
  ok(!(await page.getByText("Your paper has been submitted").isVisible().catch(() => false)), "the paper is still open for answering");
  ok((await answerBox().inputValue()) === "draft kept", "the draft answer is still in the field");
  await page.getByRole("button", { name: "Save answer" }).click();
  for (let i = 0; i < 30 && server.answers[qids[0]]?.text !== "draft kept"; i += 1) await page.waitForTimeout(100);
  ok(server.answers[qids[0]]?.text === "draft kept", "the answer saves normally after blocked actions");

  console.log("Test H: blocked actions are recorded through the integrity endpoint");
  await openExam();
  await pressCancelled("Control+c", "c");
  await pressCancelled("Control+c", "c");
  await pressCancelled("Control+x", "x");
  await pressCancelled("Control+v", "v");
  await pressCancelled("ContextMenu", "ContextMenu");
  await page.waitForTimeout(800);
  const types = new Set(server.integrity.map((p) => p.event));
  ok(["copy", "cut", "paste", "context_menu"].every((t) => types.has(t)), "copy, cut, paste and context_menu are each recorded");
  ok(server.integrity.every((p) => p.attempt_id === aid && p.token === token), "every record carries only the attempt id and token");
  ok(server.integrity.filter((p) => p.event === "copy").length === 1, "two rapid Ctrl+C presses are one recorded incident, not two");
  await page.waitForTimeout(2600);
  await pressCancelled("Control+c", "c");
  await page.waitForTimeout(800);
  ok(server.integrity.filter((p) => p.event === "copy").length === 2, "a later copy after the burst window is recorded again");
  ok(server.unexpected.length === 0, "no unexpected API calls were made");

  console.log("Test I: the lockdown is released once the paper is submitted");
  await openExam();
  await answerBox().fill("final answer");
  await page.getByRole("button", { name: "Save answer" }).click();
  for (let i = 0; i < 30 && !server.answers[qids[0]]; i += 1) await page.waitForTimeout(100);
  await page.getByRole("button", { name: "Submit examination" }).click();
  await page.getByRole("button", { name: "Yes, submit now" }).click();
  await page.getByText("Your paper has been submitted").waitFor();
  ok(server.submits === 1, "the paper was submitted once, by the candidate");
  ok(!(await page.evaluate(() => document.documentElement.classList.contains("assessment-protected"))), "the protected-surface class is removed after submission");
  const integrityBefore = server.integrity.length;
  await clearProbe();
  const released = await page.evaluate(() => document.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true })));
  ok(released === true, "copying works again on the submitted results page");
  await page.waitForTimeout(300);
  ok(server.integrity.length === integrityBefore, "nothing is recorded after the attempt is closed");

  console.log("Test J: the live quiz is locked once the participant has joined");
  await page.goto(`${BASE}/play/LIVE-TST`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate(() => localStorage.setItem("evalora-play-LIVE-TST", JSON.stringify({ participant_id: "p-1", access_token: "a-1", session_id: "session-1" })));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Live question prompt").first().waitFor({ timeout: 120000 });
  await clearProbe();
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("body *")].filter((e) => e.childElementCount === 0 && e.textContent?.trim() === "Live question prompt").at(-1);
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  await page.keyboard.press("Control+c");
  const liveCopy = (await probe()).find((e) => e.type === "keydown" && e.key === "c");
  ok(liveCopy && liveCopy.prevented === true, "Ctrl+C on the live question is cancelled");
  await page.getByText("Live question prompt").first().click({ button: "right" });
  ok((await probe()).some((e) => e.type === "contextmenu" && e.prevented), "right-click on the live question is cancelled");
  await page.getByPlaceholder(PLACEHOLDER).fill("live answer");
  ok((await page.getByPlaceholder(PLACEHOLDER).inputValue()) === "live answer", "the participant can still type an answer");
  ok((await page.evaluate(() => document.documentElement.classList.contains("assessment-protected"))) === true, "the live page is marked as protected");

  console.log("Test K: the projection screen is locked while open");
  await page.goto(`${BASE}/live/LIVE-1/screen?token=display-token`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByText("Public Screen Title").first().waitFor({ timeout: 120000 });
  await clearProbe();
  await page.getByText("Public Screen Title").first().click({ button: "right" });
  ok((await probe()).some((e) => e.type === "contextmenu" && e.prevented), "right-click on the projection screen is cancelled");
  ok((await page.evaluate(() => document.documentElement.classList.contains("assessment-protected"))) === true, "the projection screen is marked as protected");
  ok((await page.evaluate(() => getComputedStyle(document.body).userSelect)) === "none", "the projection screen text cannot be selected");

  console.log(
    `PASS: real Chromium lockdown suite (Tests A–I on the examination, J on the live quiz, K on the projection screen). Unexpected API calls: ${server.unexpected.length}.`,
  );
  console.log(`${checks} browser checks passed.`);
} finally {
  await context.close();
  await browser.close();
}

async function copyCountCheck() {
  return pressCancelled("Control+Insert", "Insert");
}
