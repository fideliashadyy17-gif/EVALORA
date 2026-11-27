// Real-Chromium regression test for the candidate paper: the draft guard, the
// offline answer queue, same-tab recovery after a reload, discard, and a
// confirmed submission that tears the candidate session down.
//
// Fixture-only: every /api/exam request is intercepted below, so no database, no
// production examination and no real candidate is ever touched.
//
//   node scripts/setup-browser.mjs        # Chromium + the Amazon Linux libraries
//   # a production server built against the mock Supabase origin on :3101
//   node scripts/test-exam-browser.mjs
//
// The flow follows what the paper does today, not what it used to do:
//   * typing marks the answer dirty and offers "Discard unsaved changes";
//   * "Submit examination" flushes that draft into the offline queue and opens
//     the final-check dialog, which states how many answers the SERVER holds;
//   * confirming while an answer is still unconfirmed is refused in the UI with
//     an explanation, and no POST /api/exam/submit is ever made;
//   * a queued answer survives navigation and a same-tab reload, and is delivered
//     once the connection returns;
//   * a confirmed submission renders the locked confirmation screen and purges
//     the candidate token, the active-session pointer and writes the
//     closed-attempt marker, so a shared browser is never left holding a paper.

import assert from "node:assert/strict";
import { chromium as playwright } from "playwright-core";
import chromium from "@sparticuz/chromium";

const executablePath = await chromium.executablePath();
process.env.LD_LIBRARY_PATH = ["/tmp/al2023/lib", process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
const browser = await playwright.launch({ headless: true, executablePath, args: chromium.args });
const context = await browser.newContext();
const page = await context.newPage();

const aid = "00000000-0000-4000-8000-000000000001";
const token = "00000000-0000-4000-8000-000000000002";
const qids = ["00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004"];

// `online` is the fixture's network switch: while it is false every save is
// refused with 503, which is what puts an answer into the local queue.
const server = { online: false, answers: {}, status: "in_progress", submits: 0, saves: 0 };

const responseState = () => ({
  server_now: new Date().toISOString(),
  exam: { id: "exam", title: "Mock Examination", description: null, instructions: null, proctoring: false, require_screen_share: false, pass_mark_percent: 50 },
  candidate: { name: "Test Candidate", ref: null },
  attempt: { id: aid, status: server.status, deadline: new Date(Date.now() + 3_600_000).toISOString(), flagged: [], score: null, max_score: null, results_published: false },
  questions: qids.map((id, i) => ({
    question_id: id, quiz_question_id: `quiz-${i}`, type: "short_answer", prompt: `Question ${i + 1}`, points: 1,
    media_url: null, media_type: null, options: [], saved_answer: server.answers[id] ?? null, result: null,
  })),
});

let requests = 0;

// The candidate token lives in localStorage for this attempt only; the paper
// must send it as a bearer header and never as a query parameter.
await page.addInitScript(({ id, t }) => {
  if (!localStorage.getItem(`evalora-attempt-${id}`)) localStorage.setItem(`evalora-attempt-${id}`, JSON.stringify({ token: t }));
}, { id: aid, t: token });

await page.route("**/api/exam/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === "/api/exam/state") {
    assert.equal(url.searchParams.has("token"), false, "the candidate token must never travel in a query string");
    assert.equal(request.headers().authorization, `Bearer ${token}`);
    requests += 1;
    return route.fulfill({ status: 200, json: responseState() });
  }
  if (url.pathname === "/api/exam/save") {
    server.saves += 1;
    if (!server.online) return route.fulfill({ status: 503, json: { error: "offline" } });
    const payload = request.postDataJSON();
    server.answers[payload.question_id] = payload.answer;
    return route.fulfill({ status: 200, json: { ok: true } });
  }
  if (url.pathname === "/api/exam/submit") {
    server.submits += 1;
    server.status = "submitted";
    return route.fulfill({ status: 200, json: { ok: true } });
  }
  // The integrity monitor reports page_leave when the document unloads (the
  // reload below). Accept it without recording anything.
  if (url.pathname === "/api/exam/integrity") return route.fulfill({ status: 200, json: { ok: true, recorded: false, count: 0, level: "none", reason: "duplicate" } });
  // Candidate messenger: an empty thread and an accepted heartbeat.
  if (url.pathname === "/api/exam/messages") return route.fulfill({ status: 200, json: { server_now: new Date().toISOString(), messages: [], unread_from_teacher: 0 } });
  if (url.pathname === "/api/exam/presence") return route.fulfill({ status: 200, json: { ok: true } });
  if (url.pathname === "/api/exam/retake") return route.fulfill({ status: 200, json: { requests: [], usable_grant: null } });
  if (url.pathname === "/api/exam/hint/usage") return route.fulfill({ status: 200, json: { ok: true } });
  throw Error(`Unexpected request ${url.pathname}`);
});

const editor = () => page.getByPlaceholder("Type your answer…").first();
const queueBanner = () => page.getByText(/answer\(s\) awaiting confirmation/).first().innerText().catch(() => "");
const confirmedBanner = () => page.getByText(/answers? confirmed by the server/).first().innerText().catch(() => "");

/** Clicks a button that the paper confirms with window.confirm() first. */
async function clickWithConfirm(name, accept) {
  const messages = [];
  page.once("dialog", async (dialog) => {
    messages.push(dialog.message());
    if (accept) await dialog.accept();
    else await dialog.dismiss();
  });
  await page.getByRole("button", { name }).click();
  await page.waitForTimeout(900);
  return messages;
}

try {
  await page.goto(`http://127.0.0.1:3101/take-exam/${aid}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByText("Mock Examination").waitFor({ timeout: 120_000 });
  await page.getByText("0 of 2 answers confirmed by the server.").waitFor({ timeout: 30_000 });

  // ── 1. A typed answer is dirty, and the paper says so ────────────────────
  await editor().fill("draft value");
  await page.getByRole("status").filter({ hasText: "This answer has unsaved changes." }).waitFor({ timeout: 15_000 });
  assert.ok(await page.getByRole("button", { name: "Discard unsaved changes" }).isVisible(), "a dirty answer must offer a discard");
  assert.equal(server.submits, 0);
  assert.deepEqual(server.answers, {}, "typing alone must never reach the server");

  // ── 2. Submitting a dirty answer queues it and opens the final check ─────
  await page.getByRole("button", { name: "Submit examination" }).click();
  await page.getByRole("dialog").getByText("Submit your examination?").waitFor({ timeout: 20_000 });
  assert.match(await page.getByRole("dialog").innerText(), /You have saved 0 of 2 answers\./, "the final check must state what the SERVER holds");
  assert.match(await queueBanner(), /1 answer\(s\) awaiting confirmation/, "the draft must be queued on the device, not dropped");
  assert.equal(server.submits, 0, "an unconfirmed answer must never be submitted");

  // ── 3. Confirming anyway is refused in the UI, with no request ───────────
  await page.getByRole("button", { name: "Yes, submit now" }).click();
  await page.getByRole("alert").filter({ hasText: "Some answers are not confirmed yet." }).waitFor({ timeout: 20_000 });
  assert.equal(server.submits, 0, "the paper must not POST a submit while an answer is unconfirmed");
  assert.match(await queueBanner(), /1 answer\(s\) awaiting confirmation/, "the refused submission must leave the answer queued");
  await page.getByRole("button", { name: "Keep working" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 15_000 });

  // ── 4. The queued answer survives navigation ─────────────────────────────
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByText("Question 2 of 2").waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "Previous" }).click();
  await page.getByText("Question 1 of 2").waitFor({ timeout: 15_000 });
  assert.equal(await editor().inputValue(), "draft value", "a queued answer must still be on screen after navigating away and back");
  assert.match(await queueBanner(), /1 answer\(s\) awaiting confirmation/);

  // ── 5. An explicit save while offline is refused and stays queued ────────
  await page.getByRole("button", { name: "Save answer" }).click();
  await page.getByText("The answer could not be confirmed yet.").waitFor({ timeout: 20_000 });
  assert.ok(await page.getByRole("button", { name: "Retry saving" }).isVisible(), "a refused save must offer a retry");
  assert.ok(server.saves >= 1, "the save must actually have been attempted");
  assert.deepEqual(server.answers, {}, "a 503 must not be reported as a saved answer");

  // ── 6. A same-tab reload recovers the answer and the queue ───────────────
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByText("Mock Examination").waitFor({ timeout: 60_000 });
  await page.getByText(/1 answer\(s\) awaiting confirmation/).waitFor({ timeout: 30_000 });
  assert.equal(await editor().inputValue(), "draft value", "the queued answer must be restored into the editor after a reload");
  assert.equal(server.submits, 0, "a reload must never submit the paper");

  // ── 7. Reconnecting delivers exactly the queued answer ───────────────────
  server.online = true;
  await page.getByRole("button", { name: "Retry saving" }).click();
  await page.getByText("1 of 2 answers confirmed by the server.").waitFor({ timeout: 30_000 });
  assert.equal(server.answers[qids[0]]?.text, "draft value", "the retried save must deliver the candidate's own text");
  assert.equal(server.answers[qids[1]], undefined, "no other answer may be invented");
  assert.match(await confirmedBanner(), /1 of 2 answers confirmed by the server\./);

  // ── 8. Discard asks, and clearing works ──────────────────────────────────
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByText("Question 2 of 2").waitFor({ timeout: 15_000 });
  await editor().fill("temporary");
  await page.getByRole("status").filter({ hasText: "This answer has unsaved changes." }).waitFor({ timeout: 15_000 });
  const discardMessages = await clickWithConfirm("Discard unsaved changes", true);
  assert.deepEqual(discardMessages, ["Discard the unsaved changes to this answer?"], "discard must be confirmed before it clears an answer");
  assert.equal(await editor().inputValue(), "", "an accepted discard must clear the editor");
  assert.equal(server.answers[qids[1]], undefined, "a discarded draft must never reach the server");

  // ── 9. A clean paper submits once and locks the session ──────────────────
  await page.getByRole("button", { name: "Submit examination" }).click();
  await page.getByRole("dialog").getByText("Submit your examination?").waitFor({ timeout: 20_000 });
  assert.match(await page.getByRole("dialog").innerText(), /You have saved 1 of 2 answers\./, "the final check must count the one confirmed answer");
  await page.getByRole("button", { name: "Yes, submit now" }).click();
  await page.getByText("Thank you for completing your examination!").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);

  const afterSubmit = await page.evaluate(({ id }) => ({
    token: localStorage.getItem(`evalora-attempt-${id}`),
    pointer: localStorage.getItem("evalora-active-candidate-session"),
    marker: sessionStorage.getItem(`evalora-closed-attempt-${id}`),
  }), { id: aid });

  assert.equal(server.submits, 1, "exactly one submission may reach the server");
  assert.equal(afterSubmit.token, null, "submitted candidate token must be purged");
  assert.equal(afterSubmit.pointer, null, "active pointer must be purged");
  assert.ok(afterSubmit.marker, "a closed-attempt marker must be written");
  assert.ok(requests >= 3, `the paper must re-read its state from the server (saw ${requests} state requests)`);

  console.log("PASS: real Chromium examination flow against a mocked API — dirty-answer guard, final check on what the server holds, refused submission while an answer is unconfirmed, offline queue, navigation and reload recovery, retry on reconnect, confirmed discard, single submission, session teardown.");
  console.log(`state requests=${requests}, save attempts=${server.saves}, submissions=${server.submits}`);
} finally {
  await context.close();
  await browser.close();
}
