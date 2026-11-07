// Real Chromium browser flow against an isolated mocked API; no production
// assessment or Supabase record is created.
import assert from "node:assert/strict";
import { existsSync, unlinkSync } from "node:fs";
process.env.AWS_LAMBDA_JS_RUNTIME ??= "nodejs22.x";
const { chromium: playwright } = await import("playwright-core");
const { default: chromium } = await import("@sparticuz/chromium");
if (existsSync("/tmp/chromium") && !existsSync("/tmp/al2023/lib/libnspr4.so")) unlinkSync("/tmp/chromium");
const executablePath = await chromium.executablePath();
process.env.LD_LIBRARY_PATH = ["/tmp/al2023/lib", process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
const browser = await playwright.launch({ headless: true, executablePath, args: chromium.args });
const context = await browser.newContext();
const page = await context.newPage();
const code = "MOCK1234";
const identity = {
  participant_id: "00000000-0000-4000-8000-000000000001",
  access_token: "00000000-0000-4000-8000-000000000002",
  session_id: "00000000-0000-4000-8000-000000000003",
};
const questionId = "00000000-0000-4000-8000-000000000004";
const server = { online: false, status: "live", answer: null, answerAttempts: 0, incidents: [] };
const questionStartedAt = new Date(Date.now() - 1000).toISOString();
const questionDeadlineAt = new Date(Date.now() + 120000).toISOString();
const question = {
  quiz_question_id: questionId,
  question_id: "00000000-0000-4000-8000-000000000005",
  type: "short_answer",
  prompt: "What is the saved response?",
  points: 1,
  media_url: null,
  media_type: null,
  options: [],
};
const state = () => ({
  server_now: new Date().toISOString(),
  session: {
    id: identity.session_id,
    title: "Mock Live Competition",
    status: server.status,
    mode: "synchronized",
    phase: "question",
    question_started_at: questionStartedAt,
    question_deadline_at: questionDeadlineAt,
    time_per_question_seconds: 120,
    integrity: { enabled: true, tabSwitch: true, focusLoss: true, fullscreen: true, clipboard: true, sound: false, warnAfter: 3, reviewAfter: 5 },
  },
  progress: { index: 0, total: 1, remaining_after_current: 0 },
  question,
  my_answer: server.answer ? { submitted: true, answer: server.answer, response_ms: 5000 } : null,
  explanation: null,
  participant: { display_name: "Browser Participant", avatar_key: "owl", status: "admitted", score: 0, finished: false },
  participant_count: 1,
  leaderboard: null,
  my_rank: null,
});
await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `evalora-play-${code}`, value: identity });
await page.route("**/api/live/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === "/api/live/state") return route.fulfill({ status: 200, json: state() });
  if (url.pathname === "/api/live/integrity") {
    const item = request.postDataJSON();
    server.incidents.push(item);
    const count = server.incidents.filter((event) => !["tab_visible", "focus_back", "online"].includes(event.event)).length;
    return route.fulfill({ status: 200, json: { ok: true, recorded: true, count, level: count >= 5 ? "review" : count >= 3 ? "strong" : "warn" } });
  }
  if (url.pathname === "/api/live/answer") {
    server.answerAttempts++;
    if (!server.online) return route.fulfill({ status: 503, json: { error: "isolated test network interruption" } });
    server.answer = request.postDataJSON().answer;
    return route.fulfill({ status: 200, json: { ok: true, submitted: true, response_ms: 5000 } });
  }
  throw new Error(`Unexpected live API request: ${url.pathname}`);
});
try {
  await page.goto(`http://127.0.0.1:3101/play/${code}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByText("Mock Live Competition").waitFor({ timeout: 120000 });
  const timer = await page.locator("text=/\\d+:\\d{2}/").first().innerText();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta", bubbles: true }));
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  await page.getByText("Repeated activity recorded").waitFor({ timeout: 15000 });
  await page.getByText(/does not submit or stop your work/i).waitFor();
  assert.equal(server.incidents.length, 3);
  assert.equal(server.status, "live");
  assert.equal(server.answer, null);
  await page.waitForTimeout(2300);
  const currentTimer = await page.locator("text=/\\d+:\\d{2}/").first().innerText();
  const toSeconds = (value) => { const [minutes, seconds] = value.split(":").map(Number); return minutes * 60 + seconds; };
  assert.ok(toSeconds(currentTimer) < toSeconds(timer), `server-derived timer continues to count down while incidents are recorded (${timer} -> ${currentTimer})`);
  assert.equal(server.answerAttempts, 0, "focus/OS/fullscreen events do not invoke answer submission");

  const input = page.getByPlaceholder("Type your answer…");
  await input.fill("recover this live answer");
  await page.getByRole("button", { name: "Submit answer" }).click();
  await page.getByText(/not yet confirmed by the server/i).waitFor();
  await page.waitForTimeout(1100);
  assert.equal(server.answer, null);
  assert.ok(server.answerAttempts >= 2, `failed answer request is safely retried once (attempts ${server.answerAttempts})`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Mock Live Competition").waitFor();
  await page.getByText(/not yet confirmed by the server/i).waitFor();
  assert.equal(await page.getByPlaceholder("Type your answer…").inputValue(), "recover this live answer");
  assert.equal(server.status, "live", "reloading after a focus/network interruption does not close the session");

  server.online = true;
  await page.waitForTimeout(1500);
  if (!server.answer) {
    const retryButton = page.getByRole("button", { name: "Retry saved answer" });
    await retryButton.waitFor({ timeout: 5000 });
    await retryButton.click();
  }
  await page.getByText("Answer recorded").waitFor({ timeout: 10000 });
  assert.deepEqual(server.answer, { text: "recover this live answer" });
  assert.equal(server.status, "live");
  console.log("PASS: real Chromium live-competition flow with isolated mocked APIs: focus loss, Windows key, fullscreen exit, repeated warning without stopping timer/session, offline answer recovery across reload, and idempotent retry.");
  console.log(`integrity events=${server.incidents.length}, answer attempts=${server.answerAttempts}, saved answer=${JSON.stringify(server.answer)}`);
} finally {
  await context.close();
  await browser.close();
}
