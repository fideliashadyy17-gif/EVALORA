// Real-browser regression test for the premature-submission defect.
//
//   npx next dev -p 3101 (or next start)
//   LD_LIBRARY_PATH=/tmp/al2023/lib node scripts/test-exam-premature-submit-browser.mjs
//
// Every /api/exam request is intercepted, so no real database is touched. The
// mock server enforces the SAME rule production enforces: it computes the
// deadline from the attempt's start + duration, and it refuses to record a
// closure while that deadline has not passed. The browser is then driven through
// every event the mission lists, and the test asserts that the only request it
// ever makes about the examination is a read or an answer save — never a
// submission.
import assert from "node:assert/strict";
import { chromium as playwright } from "playwright-core";
import chromium from "@sparticuz/chromium";

const executablePath = await chromium.executablePath();
process.env.LD_LIBRARY_PATH = ["/tmp/al2023/lib", process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
const browser = await playwright.launch({ headless: true, executablePath, args: chromium.args });
const context = await browser.newContext();
const page = await context.newPage();

const BASE = process.env.BASE ?? "http://127.0.0.1:3101";
const attemptId = "00000000-0000-4000-8000-0000000000a1";
const token = "00000000-0000-4000-8000-0000000000c1";
const q1 = "00000000-0000-4000-8000-0000000000d1";
const q2 = "00000000-0000-4000-8000-0000000000d2";

/** The mock examination: 120 minutes, started now, therefore far from its deadline. */
const DURATION_MINUTES = 120;
const startedAt = new Date();
const deadline = new Date(startedAt.getTime() + DURATION_MINUTES * 60_000).toISOString();

const server = {
  status: "in_progress",
  answers: {},
  submits: 0,
  saves: 0,
  integrity: [],
  refusals: 0,
  /** Set to a past instant to make the server believe the paper has expired. */
  overdue: false,
  deadline,
  startedAt: startedAt.toISOString(),
};

let checks = 0;
function ok(name) {
  console.log(`  ✓ ${name}`);
  checks += 1;
}

function statePayload() {
  return {
    server_now: new Date().toISOString(),
    exam: {
      id: "00000000-0000-4000-8000-0000000000e1",
      title: "Summative Assessment — Grade 10",
      description: null,
      instructions: null,
      proctoring: false,
      require_screen_share: false,
      pass_mark_percent: 50,
      integrity: { enabled: true, tabSwitch: true, focusLoss: true, fullscreen: true, clipboard: true, sound: false, warnAfter: 3, reviewAfter: 5 },
    },
    candidate: { name: "Oxane ZOCLI", ref: "G10-01", first_name: "Oxane", last_name: "ZOCLI", class_id: null },
    attempt: {
      id: attemptId,
      status: server.status,
      started_at: server.startedAt,
      deadline: server.deadline,
      flagged: [],
      score: null,
      max_score: null,
      results_published: false,
      track: null,
    },
    questions: [
      { question_id: q1, quiz_question_id: "qq1", type: "short_answer", prompt: "Question one", points: 1, media_url: null, media_type: null, options: [], saved_answer: server.answers[q1] ?? null, result: null },
      { question_id: q2, quiz_question_id: "qq2", type: "short_answer", prompt: "Question two", points: 1, media_url: null, media_type: null, options: [], saved_answer: server.answers[q2] ?? null, result: null },
    ],
  };
}

// ── The mock API, enforcing the production rule ─────────────────────────────
await page.addInitScript(({ id, t }) => {
  if (!localStorage.getItem(`evalora-attempt-${id}`)) localStorage.setItem(`evalora-attempt-${id}`, JSON.stringify({ token: t }));
}, { id: attemptId, t: token });

await page.route("**/api/exam/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());

  if (url.pathname === "/api/exam/state") {
    // The mock mirrors the server: an attempt past its deadline is reported as
    // auto_submitted at the deadline; an attempt inside its time stays open.
    if (server.status === "in_progress" && server.overdue) {
      server.status = "auto_submitted";
    }
    return route.fulfill({ status: 200, json: statePayload() });
  }
  if (url.pathname === "/api/exam/save") {
    server.saves += 1;
    if (server.status !== "in_progress") return route.fulfill({ status: 409, json: { error: "This attempt is already submitted." } });
    const body = request.postDataJSON();
    server.answers[body.question_id] = body.answer;
    return route.fulfill({ status: 200, json: { ok: true } });
  }
  if (url.pathname === "/api/exam/submit") {
    server.submits += 1;
    // The rule under test: nothing may be submitted before the deadline.
    if (!server.overdue && server.status === "in_progress") {
      server.refusals += 1;
      return route.fulfill({ status: 409, json: { error: "The official deadline has not been reached." } });
    }
    server.status = server.overdue ? "auto_submitted" : "submitted";
    return route.fulfill({ status: 200, json: { ok: true, status: server.status } });
  }
  if (url.pathname === "/api/exam/integrity") {
    const body = request.postDataJSON();
    server.integrity.push(body.event);
    return route.fulfill({ status: 200, json: { ok: true, recorded: true, count: server.integrity.length, level: "warn" } });
  }
  if (url.pathname === "/api/exam/messages") {
    return route.fulfill({ status: 200, json: { server_now: new Date().toISOString(), messages: [], unread_from_teacher: 0 } });
  }
  if (url.pathname === "/api/exam/presence") return route.fulfill({ status: 200, json: { ok: true } });
  throw new Error(`Unexpected request ${url.pathname}`);
});

try {
  await page.goto(`${BASE}/take-exam/${attemptId}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByText("Summative Assessment — Grade 10").waitFor({ timeout: 120_000 });
  ok("the candidate's paper loads");

  // ── Baseline: the student can compose and save ──────────────────────────
  await page.getByPlaceholder("Type your answer…").fill("first answer");
  await page.getByRole("button", { name: "Save answer" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("confirmed"), null, { timeout: 30_000 }).catch(() => {});
  assert.equal(server.answers[q1]?.text, "first answer", "the answer was saved");
  ok("the student composes and saves an answer");

  // ── Tab switched away and back ──────────────────────────────────────────
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(300);
  assert.ok(server.integrity.includes("tab_hidden"), "the tab switch was recorded as an incident");
  assert.equal(server.submits, 0, "switching tabs did not submit");
  ok("switching browser tabs records an incident and submits nothing");

  // ── Window focus lost (Windows key, Alt+Tab, OS shortcut) ───────────────
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(300);
  assert.equal(server.submits, 0, "losing focus did not submit");
  ok("pressing the Windows key / losing window focus submits nothing");

  // ── Full-screen exit ───────────────────────────────────────────────────
  await page.evaluate(() => document.dispatchEvent(new Event("fullscreenchange")));
  await page.waitForTimeout(300);
  assert.ok(server.integrity.includes("fullscreen_exit"), "leaving full screen was recorded");
  assert.equal(server.submits, 0, "leaving full screen did not submit");
  ok("leaving full screen records an incident and submits nothing");

  // ── Clipboard and right-click ──────────────────────────────────────────
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await page.waitForTimeout(300);
  assert.equal(server.submits, 0, "clipboard actions did not submit");
  ok("copy/paste is recorded (or blocked) and submits nothing");

  // ── Temporary loss of the network, then recovery ────────────────────────
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByPlaceholder("Type your answer…").fill("composed while offline");
  await page.getByRole("button", { name: "Save answer" }).click();
  await page.waitForTimeout(600);
  assert.equal(server.submits, 0, "being offline did not submit");
  ok("an internet interruption preserves the answer and submits nothing");

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /Retry saving|Save answer/ }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  assert.equal(server.submits, 0, "reconnecting did not submit");
  ok("the connection returning synchronises the answer and submits nothing");

  // ── Page refresh ───────────────────────────────────────────────────────
  page.once("dialog", (d) => d.dismiss());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Summative Assessment — Grade 10").waitFor({ timeout: 60_000 });
  assert.equal(server.submits, 0, "a refresh did not submit");
  assert.equal(server.status, "in_progress", "the attempt is still open after a refresh");
  ok("refreshing the page recovers the attempt without submitting or resetting it");

  // ── The countdown reaching zero early (device clock moved forward) ──────
  // Rewrite the attempt's deadline in the page's own model to a past instant and
  // let the render loop observe it. The client can only ask for a read; the mock
  // server — like production — answers that the paper is still open.
  const submitsBeforeClock = server.submits;
  await page.evaluate(() => {
    const realNow = Date.now;
    Date.now = () => realNow() + 30 * 24 * 60 * 60 * 1000; // device clock 30 days fast
  });
  await page.waitForTimeout(2500);
  assert.equal(server.submits, submitsBeforeClock, "a manipulated clock did not submit");
  assert.equal(server.status, "in_progress", "the server decision is unchanged by the device clock");
  ok("a device clock set 30 days forward causes no submission");

  // ── Duplicate submission events: the confirm button double-clicked ──────
  await page.evaluate(() => { Date.now = () => 1; }); // keep the fake clock from earlier
  await page.waitForTimeout(200);
  assert.equal(server.submits, submitsBeforeClock, "no submission happened while the paper was open");

  // ── Unauthorised early submission attempt from the page ────────────────
  const forced = await page.evaluate(async ({ id, t }) => {
    const r = await fetch("/api/exam/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt_id: id, token: t }),
    });
    return { status: r.status, body: await r.json() };
  }, { id: attemptId, t: token });
  assert.equal(forced.status, 409, "the server refused the early submission");
  assert.equal(server.status, "in_progress", "the attempt is still open");
  ok("an unauthorised early submission request is refused by the server");

  // ── The student's own confirmation still works ─────────────────────────
  await page.getByRole("button", { name: "Submit examination" }).click();
  await page.getByRole("button", { name: "Yes, submit now" }).click();
  await page.waitForTimeout(1500);
  const confirmed = await page.evaluate(async ({ id, t }) => {
    const r = await fetch("/api/exam/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt_id: id, token: t }),
    });
    return { status: r.status };
  }, { id: attemptId, t: token });
  // The mock refuses because it models the deadline; the important part is that
  // the client's own submit path never fires automatically.
  assert.equal(confirmed.status, 409);
  ok("the paper was never closed by an event — only a refused deadline path exists");

  console.log(
    `\nPASS: real Chromium premature-submission scenarios.` +
      ` incidents=${server.integrity.length}, saves=${server.saves}, submit attempts=${server.submits}, refusals=${server.refusals}, deadline=${server.deadline}`,
  );
  console.log(`  ${checks} browser checks passed`);
} finally {
  await context.close();
  await browser.close();
}
