// Real-Chromium checks for the organiser's live feature controls (answer tools).
// Fixture-only: every /api request is intercepted. No database, no production
// competition or examination, no real participant.
//
// Install temporary test-only dependencies (same as the other browser suites):
//   npm install --no-save --package-lock=false --ignore-scripts @sparticuz/chromium@153.0.0 playwright-core@1.64.1
// Start a local server on port 3101 with mock.invalid environment values:
//   NEXT_PUBLIC_SUPABASE_URL=https://mock.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key \
//   SUPABASE_SERVICE_ROLE_KEY=mock-service-key NEXT_PUBLIC_APP_URL=http://127.0.0.1:3101 \
//   NEXT_PUBLIC_ROOT_DOMAIN=127.0.0.1:3101 LIVE_DISPLAY_TOKEN_SECRET=mock-display-secret \
//   LIVEKIT_API_KEY=mock LIVEKIT_API_SECRET=mock NEXT_PUBLIC_LIVEKIT_URL=wss://mock.invalid \
//   npx next dev --turbopack -H 0.0.0.0 -p 3101      (or: npm run build && npx next start -p 3101)
// Then: LD_LIBRARY_PATH=/tmp/al2023/lib node scripts/test-live-features-browser.mjs
//
// What it proves, in a real browser:
//   Part 1 (live competition, /play/<code>): the switches reach a participant
//     through the state the page already polls, without a reload; each switch
//     hides exactly its own tool; a tool switched off while open closes; what
//     the participant already wrote is never changed; switching back on
//     restores the tool; no switch ever submits an answer.
//   Part 2 (examination, /take-exam/<attempt>): the switches are read from
//     /api/exam/live-features with the attempt token in the Authorization
//     header, refreshed every minute, and a failed read never removes or
//     restores a tool on its own.
import assert from "node:assert/strict";
import { chromium as playwright } from "playwright-core";
import chromium from "@sparticuz/chromium";

const BASE = process.env.BASE ?? "http://127.0.0.1:3101";
process.env.LD_LIBRARY_PATH = ["/tmp/al2023/lib", process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
const executablePath = await chromium.executablePath();
// One browser per part: this Chromium build exits when its last context closes.
const launch = () => playwright.launch({ headless: true, executablePath, args: chromium.args });

const ALL_ON = { standard_keyboard: true, math_keyboard: true, symbols: true, scientific_keyboard: true, equation_editor: true, latex: true };
const only = (off) => ({ ...ALL_ON, ...Object.fromEntries(off.map((key) => [key, false])) });

let checks = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  checks += 1;
  console.log(`  ✓ ${message}`);
}

/** Locators shared by both pages: the same editor renders on each. */
function tools(page) {
  return {
    editor: page.locator(".rce-shell .ProseMirror").first(),
    keyboardToggle: page.getByTitle("Toggle the permanent mathematical keyboard"),
    keyboardPanel: page.locator('[role="tablist"][aria-label="Symbol categories"]'),
    categoryTabs: page.locator('[role="tablist"][aria-label="Symbol categories"] [role="tab"]'),
    equationButton: page.getByTitle("Insert a mathematical equation at the cursor"),
    latexButton: page.getByTitle("Write LaTeX source"),
    textTab: page.getByRole("tab", { name: "Text / Word" }),
    mathTab: page.getByRole("tab", { name: "Math √(x)" }),
    latexTab: page.getByRole("tab", { name: "LaTeX \\frac{}" }),
    onScreenKeyboard: page.getByTitle("MathLive on-screen keyboard"),
    typingOff: page.getByText("Typing is switched off by the organizer"),
  };
}

async function until(page, probe, message, timeout = 20000) {
  const started = Date.now();
  for (;;) {
    if (await probe()) return ok(true, message);
    if (Date.now() - started > timeout) assert.fail(`timed out: ${message}`);
    await page.waitForTimeout(100);
  }
}

// ───────────────────────── Part 1: live competition ─────────────────────────
{
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const server = { features: undefined, polls: 0, answers: 0, unexpected: [] };
  const liveState = () => {
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
        question_deadline_at: new Date(now + 900000).toISOString(),
        time_per_question_seconds: 900,
        // Left out entirely while `undefined`: a session nobody configured.
        live_features: server.features,
      },
      progress: { index: 0, total: 3, remaining_after_current: 2 },
      question: { quiz_question_id: "lq-1", question_id: "lqq-1", type: "open_ended", prompt: "Explain your reasoning", points: 4, media_url: null, media_type: null, options: [] },
      my_answer: null,
      explanation: null,
      participant: { display_name: "Live Student", avatar_key: "owl", status: "active", score: 0, finished: false },
      participant_count: 4,
      leaderboard: null,
      my_rank: null,
    };
  };
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/live/state") {
      server.polls += 1;
      return route.fulfill({ status: 200, json: liveState() });
    }
    if (path === "/api/live/answer") {
      server.answers += 1;
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    server.unexpected.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 404, json: { error: `not mocked: ${path}` } });
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  const t = tools(page);
  /** Change the organiser's switches, then wait until the page has polled them twice. */
  async function organiserSets(features) {
    server.features = features;
    const from = server.polls;
    for (let i = 0; i < 200 && server.polls < from + 2; i += 1) await page.waitForTimeout(100);
    assert.ok(server.polls >= from + 2, "the live page keeps polling its state");
  }
  const written = async () => (await t.editor.innerText()).trim();
  /** The answer on the page is exactly `expected` (the actual text is reported when it is not). */
  const wrote = async (expected, message) => {
    assert.equal(await written(), expected, message);
    ok(true, message);
  };

  console.log("Test A: a session nobody configured keeps every tool");
  await page.goto(`${BASE}/play/LIVE-TST`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate(() => localStorage.setItem("evalora-play-LIVE-TST", JSON.stringify({ participant_id: "p-1", access_token: "a-1", session_id: "session-1" })));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Explain your reasoning").first().waitFor({ timeout: 120000 });
  await t.editor.waitFor({ timeout: 60000 });
  await organiserSets(undefined);
  ok(await t.keyboardToggle.isVisible(), "the mathematics keyboard button is offered");
  ok(await t.equationButton.isVisible(), "the equation editor button is offered");
  ok(await t.latexButton.isVisible(), "the LaTeX button is offered");
  ok((await t.mathTab.isEnabled()) && (await t.latexTab.isEnabled()), "the Math and LaTeX modes can be opened");
  ok(!(await t.typingOff.isVisible()), "no 'typing is switched off' notice is shown");
  await t.editor.click();
  await page.keyboard.type("my working");
  await wrote("my working", "the participant can type an answer");

  console.log("Test B: every switch explicitly on is the same as unconfigured");
  await organiserSets(ALL_ON);
  ok((await t.keyboardToggle.isVisible()) && (await t.equationButton.isVisible()) && (await t.latexButton.isVisible()), "all three tool buttons are still offered");
  await wrote("my working", "the answer is unchanged");
  // The page receives a fresh copy of the switches with every poll. That must
  // not disturb someone who is in the middle of writing.
  await t.editor.click();
  await page.keyboard.press("Home");
  await organiserSets({ ...ALL_ON });
  ok(await page.evaluate(() => document.activeElement?.classList.contains("ProseMirror") === true), "the answer box keeps the focus while the page polls");
  await page.keyboard.type("X");
  await wrote("Xmy working", "the caret stays where the participant put it while the page polls");
  await page.keyboard.press("Backspace");
  await wrote("my working", "…and editing continues normally");

  console.log("Test C: mathematics keyboard and scientific keyboard");
  await t.keyboardToggle.click();
  await until(page, () => t.keyboardPanel.isVisible(), "the mathematics keyboard opens");
  const allCategories = await t.categoryTabs.count();
  ok(allCategories > 1, `the keyboard offers ${allCategories} symbol groups`);
  await organiserSets(only(["scientific_keyboard"]));
  await until(page, async () => (await t.categoryTabs.count()) < allCategories, "switching the scientific keyboard off removes its symbol groups without a reload");
  const basicCategories = await t.categoryTabs.count();
  ok(basicCategories >= 1 && (await t.keyboardPanel.isVisible()), `the mathematics keyboard stays open with ${basicCategories} basic groups`);
  await organiserSets(only(["math_keyboard"]));
  await until(page, async () => !(await t.keyboardToggle.isVisible()), "switching the mathematics keyboard off removes its button without a reload");
  ok(!(await t.keyboardPanel.isVisible()), "the open keyboard closes");
  ok((await t.equationButton.isVisible()) && (await t.latexButton.isVisible()), "the equation editor and LaTeX are not affected");
  await wrote("my working", "the answer is unchanged");
  await organiserSets(ALL_ON);
  await until(page, () => t.keyboardToggle.isVisible(), "switching it back on restores the button");
  await until(page, () => t.keyboardPanel.isVisible(), "the keyboard reopens as the participant left it");
  ok((await t.categoryTabs.count()) === allCategories, "every symbol group is back");
  await t.keyboardToggle.click();
  await until(page, async () => !(await t.keyboardPanel.isVisible()), "the participant can close the keyboard");

  console.log("Test D: equation editor and symbols");
  const answersBeforeSwitches = server.answers;
  await organiserSets(only(["equation_editor"]));
  await until(page, async () => !(await t.equationButton.isVisible()), "switching the equation editor off removes its button");
  ok(!(await t.mathTab.isEnabled()), "the Math mode cannot be opened");
  ok((await t.latexButton.isVisible()) && (await t.latexTab.isEnabled()) && (await t.keyboardToggle.isVisible()), "LaTeX and the mathematics keyboard are not affected");
  await organiserSets(ALL_ON);
  await until(page, () => t.mathTab.isEnabled(), "switching it back on restores the Math mode");
  await t.mathTab.click();
  await until(page, async () => (await t.mathTab.getAttribute("aria-selected")) === "true", "the participant opens the Math mode");
  await until(page, () => t.onScreenKeyboard.isVisible(), "the on-screen symbols keyboard button is offered in Math mode");
  await organiserSets(only(["symbols"]));
  await until(page, async () => !(await t.onScreenKeyboard.isVisible()), "switching symbols off removes the on-screen symbols keyboard button");
  ok((await t.mathTab.getAttribute("aria-selected")) === "true", "the Math mode itself stays open");
  await organiserSets(only(["equation_editor"]));
  await until(page, async () => (await t.textTab.getAttribute("aria-selected")) === "true", "switching the equation editor off while it is open returns to the text view");
  await wrote("my working", "the answer is unchanged");

  console.log("Test E: LaTeX");
  await organiserSets(ALL_ON);
  await until(page, () => t.latexTab.isEnabled(), "LaTeX is available again");
  await t.latexTab.click();
  await until(page, async () => (await t.latexTab.getAttribute("aria-selected")) === "true", "the participant opens the LaTeX mode");
  await organiserSets(only(["latex"]));
  await until(page, async () => (await t.textTab.getAttribute("aria-selected")) === "true", "switching LaTeX off while it is open returns to the text view");
  ok(!(await t.latexButton.isVisible()) && !(await t.latexTab.isEnabled()), "the LaTeX button is removed and the LaTeX mode cannot be opened");
  ok((await t.equationButton.isVisible()) && (await t.mathTab.isEnabled()), "the equation editor is not affected");
  await wrote("my working", "the answer is unchanged");
  ok(server.answers === answersBeforeSwitches, "no switch submitted or saved an answer");

  console.log("Test F: standard keyboard");
  await organiserSets(only(["standard_keyboard"]));
  await until(page, () => t.typingOff.isVisible(), "switching the standard keyboard off tells the participant why typing stopped");
  ok((await t.editor.getAttribute("inputmode")) === "none", "touch devices are told not to open their keyboard");
  await t.editor.click();
  await page.keyboard.press("End");
  // The editor registers a caret move on the browser's selectionchange event,
  // a couple of milliseconds after the key. Nobody types that fast; a script
  // does, and a refused character would then put the caret back where the
  // editor last knew it to be.
  await page.waitForTimeout(150);
  await page.keyboard.type(" more");
  await wrote("my working", "typed text is refused");
  await page.keyboard.press("Backspace");
  await wrote("my workin", "deleting still works, so a mistake can be removed");
  ok((await t.keyboardToggle.isVisible()) && (await t.equationButton.isVisible()), "the mathematics tools stay available");
  await organiserSets(ALL_ON);
  await until(page, async () => !(await t.typingOff.isVisible()), "switching it back on removes the notice");
  ok((await t.editor.getAttribute("inputmode")) !== "none", "the keyboard hint is removed");
  await t.editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type("g again");
  await wrote("my working again", "typing works again");

  console.log("Test G: every tool switched off at once, then restored");
  await organiserSets(only(Object.keys(ALL_ON)));
  await until(page, async () => !(await t.keyboardToggle.isVisible()) && !(await t.equationButton.isVisible()) && !(await t.latexButton.isVisible()), "all tool buttons are removed");
  await wrote("my working again", "the answer is still on the page");
  await organiserSets(undefined);
  await until(page, async () => (await t.keyboardToggle.isVisible()) && (await t.equationButton.isVisible()) && (await t.latexButton.isVisible()), "clearing the configuration restores every tool");
  ok(server.unexpected.length === 0, `no unexpected API call was made (${server.unexpected.join(", ") || "none"})`);
  ok(pageErrors.length === 0, `no script error was raised in the page (${pageErrors[0] ?? "none"})`);
  await browser.close();
}

// ─────────────────────────── Part 2: examination ───────────────────────────
{
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  const aid = "00000000-0000-4000-8000-000000000001";
  const token = "00000000-0000-4000-8000-000000000002";
  const qid = "00000000-0000-4000-8000-000000000003";
  const server = { features: ALL_ON, failing: false, reads: 0, credentialFaults: [], saves: 0, submits: 0, unexpected: [] };
  const examState = () => ({
    server_now: new Date().toISOString(),
    exam: { id: "exam", title: "Mock Examination", description: null, instructions: null, proctoring: false, require_screen_share: false, pass_mark_percent: 50 },
    candidate: { name: "Test Candidate", ref: null },
    attempt: { id: aid, status: "in_progress", deadline: new Date(Date.now() + 3600000).toISOString(), flagged: [], score: null, max_score: null, results_published: false },
    questions: [{ question_id: qid, quiz_question_id: "quiz-0", type: "open_ended", prompt: "Explain your method", points: 4, media_url: null, media_type: null, options: [], saved_answer: null, result: null }],
  });
  await page.addInitScript(({ id, t }) => {
    if (!localStorage.getItem(`evalora-attempt-${id}`)) localStorage.setItem(`evalora-attempt-${id}`, JSON.stringify({ token: t }));
  }, { id: aid, t: token });
  await page.route("**/api/exam/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/exam/live-features") {
      server.reads += 1;
      if (request.method() !== "GET") server.credentialFaults.push(`method ${request.method()}`);
      if (request.headers().authorization !== `Bearer ${token}`) server.credentialFaults.push("missing bearer token");
      if (url.searchParams.get("attempt_id") !== aid) server.credentialFaults.push("wrong attempt id");
      if (url.searchParams.has("token") || url.search.includes(token)) server.credentialFaults.push("token in the URL");
      if (server.failing) return route.fulfill({ status: 500, json: { error: "Examination data is unavailable." } });
      return route.fulfill({ status: 200, json: { features: server.features } });
    }
    if (url.pathname === "/api/exam/state") return route.fulfill({ status: 200, json: examState() });
    if (url.pathname === "/api/exam/save") { server.saves += 1; return route.fulfill({ status: 200, json: { ok: true } }); }
    if (url.pathname === "/api/exam/submit") { server.submits += 1; return route.fulfill({ status: 200, json: { ok: true } }); }
    if (url.pathname === "/api/exam/integrity") return route.fulfill({ status: 200, json: { ok: true, recorded: false, count: 0, level: "none", reason: "duplicate" } });
    if (url.pathname === "/api/exam/messages") return route.fulfill({ status: 200, json: { server_now: new Date().toISOString(), messages: [], unread_from_teacher: 0 } });
    if (url.pathname === "/api/exam/presence") return route.fulfill({ status: 200, json: { ok: true } });
    server.unexpected.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 404, json: { error: `not mocked: ${url.pathname}` } });
  });
  const t = tools(page);
  const written = async () => (await t.editor.innerText()).trim();
  /** The answer on the page is exactly `expected` (the actual text is reported when it is not). */
  const wrote = async (expected, message) => {
    assert.equal(await written(), expected, message);
    ok(true, message);
  };
  /** One minute passes for the page (its own timers only); wait for the next read to land. */
  async function aMinutePasses() {
    const from = server.reads;
    await page.clock.fastForward(61000);
    for (let i = 0; i < 100 && server.reads === from; i += 1) await page.waitForTimeout(100);
    assert.ok(server.reads > from, "the examination page re-reads the switches after a minute");
    await page.waitForTimeout(400);
  }

  console.log("Test H: an examination whose switches cannot be read keeps every tool");
  server.failing = true;
  await page.clock.install();
  await page.goto(`${BASE}/take-exam/${aid}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByText("Mock Examination").first().waitFor({ timeout: 120000 });
  await t.editor.waitFor({ timeout: 60000 });
  await until(page, async () => server.reads >= 1, "the examination page asks for its switches when the paper opens");
  await page.waitForTimeout(400);
  ok((await t.keyboardToggle.isVisible()) && (await t.equationButton.isVisible()) && (await t.latexButton.isVisible()), "a failed read leaves the candidate every tool");
  await t.editor.click();
  await page.keyboard.type("exam working");
  await wrote("exam working", "the candidate can type an answer");

  console.log("Test I: the switches are refreshed every minute, without a reload");
  server.failing = false;
  server.features = only(["math_keyboard", "latex"]);
  await page.keyboard.press("Home");
  await aMinutePasses();
  await until(page, async () => !(await t.keyboardToggle.isVisible()) && !(await t.latexButton.isVisible()), "tools switched off for the examination disappear at the next refresh");
  ok((await t.equationButton.isVisible()) && (await t.mathTab.isEnabled()), "the equation editor is not affected");
  await wrote("exam working", "the answer is unchanged");
  ok(await page.evaluate(() => document.activeElement?.classList.contains("ProseMirror") === true), "the answer box keeps the focus when the switches change");
  await page.keyboard.type("X");
  await wrote("Xexam working", "the caret stays where the candidate put it when the switches change");
  await page.keyboard.press("Backspace");
  await wrote("exam working", "…and editing continues normally");

  console.log("Test J: a failed refresh keeps the last confirmed switches");
  server.failing = true;
  await aMinutePasses();
  ok(!(await t.keyboardToggle.isVisible()) && !(await t.latexButton.isVisible()), "a failed refresh does not hand back a tool that was switched off");
  ok(await t.equationButton.isVisible(), "a failed refresh does not remove a tool either");
  server.failing = false;
  server.features = ALL_ON;
  await aMinutePasses();
  await until(page, async () => (await t.keyboardToggle.isVisible()) && (await t.latexButton.isVisible()), "tools switched back on return at the next refresh");
  await wrote("exam working", "the answer is unchanged");

  console.log("Test K: the request is safe");
  ok(server.credentialFaults.length === 0, `every read was a GET with the attempt id and the token in the Authorization header only (${server.credentialFaults[0] ?? "no fault"})`);
  ok(server.submits === 0, "no switch submitted the paper");
  ok(server.unexpected.length === 0, `no unexpected API call was made (${server.unexpected.join(", ") || "none"})`);
  ok(pageErrors.length === 0, `no script error was raised in the page (${pageErrors[0] ?? "none"})`);
  console.log(`  reads of /api/exam/live-features: ${server.reads}, answer saves: ${server.saves}`);
  await browser.close();
}

console.log(`PASS: real Chromium live feature controls (live competition and examination). ${checks} browser checks passed`);
