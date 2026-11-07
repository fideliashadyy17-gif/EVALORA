// Real Chromium verification of the exam and live-participant integrity UI.
// Run a production Next server on port 3101 with non-secret mock environment,
// then run this script. API responses are intercepted locally; no real records
// or assessments are touched. Production DB verification is a separate step.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium as playwright } from "playwright-core";
import chromium, { inflate } from "@sparticuz/chromium";

const out = "test-results/integrity-browser";
mkdirSync(out, { recursive: true });
const executablePath = await chromium.executablePath();
// The sandbox is Debian rather than Amazon Linux, so the package does not
// auto-extract its bundled NSS dependencies. They remain in /tmp, not Git.
await inflate("node_modules/@sparticuz/chromium/bin/al2023.tar.br");
process.env.LD_LIBRARY_PATH = ["/tmp/al2023/lib", process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
const launchArgs = chromium.args.filter((arg) => !["--single-process", "--no-zygote", "--in-process-gpu"].includes(arg));
const browser = await playwright.launch({ headless: true, executablePath, args: launchArgs });
const version = browser.version();
const base = "http://127.0.0.1:3101";
const ids = {
  attempt: "10000000-0000-4000-8000-000000000001",
  examToken: "10000000-0000-4000-8000-000000000002",
  question: "10000000-0000-4000-8000-000000000003",
  quizQuestion: "10000000-0000-4000-8000-000000000004",
  participant: "20000000-0000-4000-8000-000000000001",
  liveToken: "20000000-0000-4000-8000-000000000002",
  session: "20000000-0000-4000-8000-000000000003",
  quiz: "20000000-0000-4000-8000-000000000004",
};
const policy = { enabled: true, tabSwitch: true, focusLoss: true, fullscreen: true, clipboard: true, sound: false, warnAfter: 2, reviewAfter: 4 };
const informational = new Set(["tab_visible", "focus_back", "online"]);
const question = {
  question_id: ids.question,
  quiz_question_id: ids.quizQuestion,
  type: "short_answer",
  prompt: "Type a short answer",
  points: 1,
  media_url: null,
  media_type: null,
  options: [],
};
const results = { browser: `Chromium ${version}`, transport: "Playwright request interception against the real built Next.js UI; no production DB", live: [], exam: [] };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, message, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${message}`);
}
const countViolations = (events) => events.filter((e) => !informational.has(e.event)).length;
async function injectedVisibility(page, hidden) {
  // This fallback is deliberately identified as an injected browser signal,
  // not physical OS/tab switching. The packaged Chromium headless shell keeps
  // every page visible even under Xvfb; do not turn that limitation into a
  // false acceptance claim.
  await page.evaluate((isHidden) => {
    window.__integrityTestHidden = isHidden;
    if (!window.__integrityTestVisibilityInstalled) {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => Boolean(window.__integrityTestHidden) });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => window.__integrityTestHidden ? "hidden" : "visible" });
      window.__integrityTestVisibilityInstalled = true;
    }
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}
async function switchTab(context, page, events, event) {
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await sleep(400);
  let native = events.some((e) => e.event === event);
  if (!native) await injectedVisibility(page, true);
  await waitFor(() => events.some((e) => e.event === event), `${event} after tab activation or disclosed injected signal`);
  await page.bringToFront();
  await sleep(250);
  const returnEvent = event === "tab_hidden" ? "tab_visible" : "focus_back";
  if (!events.some((e) => e.event === returnEvent)) await injectedVisibility(page, false);
  await waitFor(() => events.some((e) => e.event === returnEvent), "return after tab switch signal");
  await other.close();
  return native ? "native" : "injected";
}
async function focusCycle(context, page, events) {
  // Keep this independent of the monitor's intentional tab/blur collapse.
  await sleep(1100);
  const second = await context.newPage();
  await second.goto("about:blank");
  await second.bringToFront();
  await sleep(400);
  const native = events.some((e) => e.event === "focus_lost");
  if (!native) await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await waitFor(() => events.some((e) => e.event === "focus_lost"), "window focus loss signal");
  await page.bringToFront();
  await sleep(250);
  if (!events.some((e) => e.event === "focus_back")) await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => events.some((e) => e.event === "focus_back"), "window focus return signal");
  await second.close();
  return native ? "native" : "injected";
}
async function clipboard(page, key) {
  const input = page.getByPlaceholder("Type your answer…");
  await input.click();
  await input.fill("legitimate answer text");
  await input.press("Control+a");
  await page.keyboard.press(`Control+${key}`);
}
async function fullscreen(page) {
  // Attach to a real click so Chromium's transient-user-activation rule is met.
  const nativeButton = page.getByRole("button", { name: "Enter full screen" });
  const button = await nativeButton.count() ? nativeButton : page.getByRole("button", { name: "Save answer" }).first();
  if (!(await nativeButton.count())) {
    await button.evaluate((el) => el.addEventListener("click", () => {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
    }, { once: true }));
  }
  await button.click();
  await waitFor(() => page.evaluate(() => Boolean(document.fullscreenElement)), "fullscreen entered");
  await page.evaluate(() => document.exitFullscreen());
  await waitFor(() => page.evaluate(() => !document.fullscreenElement), "fullscreen exited");
}
async function reload(page, events) {
  const before = events.filter((e) => e.event === "page_leave").length;
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitFor(() => events.filter((e) => e.event === "page_leave").length > before, "page_leave keepalive request");
}
async function offlineCycle(context, page, events) {
  await context.setOffline(true);
  await waitFor(() => page.evaluate(() => !navigator.onLine), "browser offline state");
  await context.setOffline(false);
  await waitFor(() => page.evaluate(() => navigator.onLine), "browser online state");
  await waitFor(() => events.some((e) => e.event === "online"), "online event after network recovery");
}

try {
  /* ── Live quiz: real participant component, intercepted transport ── */
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    const events = [];
    let savedAnswer = null;
    const state = () => ({
      server_now: new Date().toISOString(),
      session: { id: ids.session, title: "Browser Integrity Live Quiz", status: "live", mode: "self_paced", phase: "question", question_started_at: new Date(Date.now() - 2000).toISOString(), question_deadline_at: null, time_per_question_seconds: 60 },
      progress: { index: 0, total: 2, remaining_after_current: 1 },
      question,
      my_answer: savedAnswer ? { submitted: true, answer: savedAnswer, is_correct: true, points_awarded: 1 } : null,
      explanation: null,
      participant: { display_name: "Browser Test Participant", avatar_key: "owl", status: "admitted", score: savedAnswer ? 1 : 0, finished: false },
      participant_count: 1,
      integrity: policy,
      leaderboard: null,
      my_rank: null,
    });
    await page.addInitScript(({ participant, liveToken, session }) => {
      localStorage.setItem("evalora-play-TEST01", JSON.stringify({ participant_id: participant, access_token: liveToken, session_id: session }));
    }, ids);
    await page.route("**/api/live/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/live/state") return route.fulfill({ status: 200, json: state() });
      if (path === "/api/live/integrity") {
        const body = request.postDataJSON();
        assert.equal(body.participant_id, ids.participant);
        assert.equal(body.token, ids.liveToken);
        events.push({ event: body.event, participant_id: body.participant_id, session_id: ids.session, quiz_id: ids.quiz, organization_id: "mock-live-org" });
        return route.fulfill({ status: 200, json: { ok: true, recorded: true, count: countViolations(events) } });
      }
      if (path === "/api/live/answer") {
        savedAnswer = request.postDataJSON().answer;
        return route.fulfill({ status: 200, json: { ok: true, submitted: true, is_correct: true, points_awarded: 1 } });
      }
      throw new Error(`Unexpected live request ${path}`);
    });
    await page.goto(`${base}/play/TEST01`, { waitUntil: "domcontentloaded" });
    await page.getByText("Browser Integrity Live Quiz").waitFor();
    results.live.push("PASS participant joined existing live-question UI with the quiz policy");

    const liveTabMode = await switchTab(context, page, events, "tab_hidden");
    await page.getByRole("alert").filter({ hasText: /left the assessment tab|Repeated activity|flagged/ }).waitFor();
    await page.screenshot({ path: `${out}/live-tab-warning.png`, fullPage: true });
    results.live.push(`PASS (${liveTabMode} signal) tab_hidden warning + tab_visible return`);
    results.liveTabMode = liveTabMode;

    const liveFocusMode = await focusCycle(context, page, events);
    results.live.push(`PASS (${liveFocusMode} signal) focus_lost/focus_back warning and server requests`);
    results.liveFocusMode = liveFocusMode;

    await clipboard(page, "c");
    await waitFor(() => events.some((e) => e.event === "copy"), "real keyboard copy");
    await clipboard(page, "v");
    await waitFor(() => events.some((e) => e.event === "paste"), "real keyboard paste");
    await clipboard(page, "x");
    await waitFor(() => events.some((e) => e.event === "cut"), "real keyboard cut");
    await page.getByPlaceholder("Type your answer…").fill("answer after clipboard checks");
    results.live.push("PASS keyboard copy/paste/cut detected; legitimate answer entry still works");

    await fullscreen(page);
    await waitFor(() => events.some((e) => e.event === "fullscreen_exit"), "fullscreen_exit after browser Fullscreen API exit");
    results.live.push("PASS full-screen entered and exit detected");

    await page.getByRole("button", { name: "Submit answer" }).click();
    await waitFor(() => savedAnswer?.text === "answer after clipboard checks", "answer saved before reload");
    await reload(page, events);
    await page.getByText(/Your answer: answer after clipboard checks/).waitFor();
    results.live.push("PASS reload/page_leave recorded and participant + submitted answer restored");

    await offlineCycle(context, page, events);
    await page.getByText(/Connected/).waitFor();
    results.live.push("PASS offline/online transition reconnects with identity and answer intact");
    await page.screenshot({ path: `${out}/live-final.png`, fullPage: true });
    await context.tracing.stop({ path: `${out}/live-trace.zip` });
    results.liveEvidence = events;
    await context.close();
  }

  /* ── Examination: same monitor on the existing candidate component ── */
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    const events = [];
    let savedAnswer = null;
    const state = () => ({
      server_now: new Date().toISOString(),
      exam: { id: "mock-exam", title: "Browser Integrity Examination", description: null, instructions: null, proctoring: false, require_screen_share: false, pass_mark_percent: 50, integrity: policy },
      candidate: { name: "Browser Test Candidate", ref: null },
      attempt: { id: ids.attempt, status: "in_progress", deadline: new Date(Date.now() + 3600000).toISOString(), flagged: [], score: null, max_score: null, results_published: false },
      questions: [{ ...question, saved_answer: savedAnswer, result: null }],
    });
    await page.addInitScript(({ attempt, examToken }) => {
      localStorage.setItem(`evalora-attempt-${attempt}`, JSON.stringify({ token: examToken }));
    }, ids);
    await page.route("**/api/exam/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/exam/state") return route.fulfill({ status: 200, json: state() });
      if (path === "/api/exam/integrity") {
        const body = request.postDataJSON();
        assert.equal(body.attempt_id, ids.attempt);
        assert.equal(body.token, ids.examToken);
        events.push({ event: body.event, attempt_id: body.attempt_id, exam_id: "mock-exam", candidate_id: "mock-candidate", organization_id: "mock-exam-org" });
        return route.fulfill({ status: 200, json: { ok: true, recorded: true, count: countViolations(events) } });
      }
      if (path === "/api/exam/save") {
        savedAnswer = request.postDataJSON().answer;
        return route.fulfill({ status: 200, json: { ok: true } });
      }
      if (path === "/api/exam/submit") return route.fulfill({ status: 200, json: { ok: true } });
      throw new Error(`Unexpected exam request ${path}`);
    });
    await page.goto(`${base}/take-exam/${ids.attempt}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Browser Integrity Examination").waitFor();
    results.exam.push("PASS candidate started existing examination UI with its own policy");

    const examTabMode = await switchTab(context, page, events, "tab_hidden");
    await page.getByRole("alert").filter({ hasText: /left the assessment tab|Repeated activity|flagged/ }).waitFor();
    await page.screenshot({ path: `${out}/exam-tab-warning.png`, fullPage: true });
    results.exam.push(`PASS (${examTabMode} signal) warning + server request + return event`);
    results.examTabMode = examTabMode;
    const examFocusMode = await focusCycle(context, page, events);
    results.exam.push(`PASS (${examFocusMode} signal) focus_lost/focus_back warning and server requests`);
    results.examFocusMode = examFocusMode;

    await clipboard(page, "c");
    await waitFor(() => events.some((e) => e.event === "copy"), "exam keyboard copy");
    await clipboard(page, "v");
    await waitFor(() => events.some((e) => e.event === "paste"), "exam keyboard paste");
    results.exam.push("PASS prohibited clipboard actions detected without blocking answer entry");

    await fullscreen(page);
    await waitFor(() => events.some((e) => e.event === "fullscreen_exit"), "exam fullscreen exit");
    results.exam.push("PASS examination full-screen exit detected");

    await page.getByRole("button", { name: "Save answer" }).click();
    await waitFor(() => savedAnswer?.text === "legitimate answer text", "exam answer saved");
    await reload(page, events);
    await page.getByPlaceholder("Type your answer…").waitFor();
    assert.equal(await page.getByPlaceholder("Type your answer…").inputValue(), "legitimate answer text");
    results.exam.push("PASS reload/page_leave and saved answer recovery");

    await offlineCycle(context, page, events);
    results.exam.push("PASS offline/online transition observed without losing attempt or answer");
    await page.screenshot({ path: `${out}/exam-final.png`, fullPage: true });
    await context.tracing.stop({ path: `${out}/exam-trace.zip` });
    results.examEvidence = events;
    await context.close();
  }

  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  console.log(`PASS: real Chromium integrity flows. Evidence: ${out}`);
} finally {
  await browser.close();
}
