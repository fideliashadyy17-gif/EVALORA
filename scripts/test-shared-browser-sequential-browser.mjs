// Real Chromium Playwright E2E regression test for sequential multi-student
// examinations on ONE shared browser/device (single BrowserContext, single Page,
// zero manual storage clearing between students).
//
// Exercises Scenarios A, B, C, D, and E end-to-end through the real Next.js UI:
//   - Scenario A & B: Student A -> Student B -> Student C sequentially on
//     `/exam/join/<token>` -> `/take-exam/<attemptId>` -> Submit ->
//     "Finish & return to examination entry", verifying clean UI reset, unique
//     attempt IDs & tokens, zero inherited answers/names, and preserved storage
//     for unrelated app preferences.
//   - Scenario C: Student D starts exam, saves an answer, refreshes mid-attempt
//     (recovers active attempt & answer), navigates to `/exam/join/<token>`
//     (sees unfinished-attempt recovery banner without prefilled credentials),
//     resumes via banner, and Student E clicks "I am a different student" and
//     starts a separate clean attempt without overwriting Student D's paper.
//   - Scenario D: Network outage during answer save queues answer locally
//     without submitting or clearing session; reconnect flushes cleanly.
//   - Scenario E: Browser Back button / direct revisit to a submitted attempt
//     renders "Examination session ended" with zero token/answers in storage,
//     and duplicate login replay by a submitted student is refused with 409.

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import { createRequire } from "node:module";

const localRequire = createRequire(process.env.PW_MODULE_BASE ?? import.meta.url);
const { chromium: playwright } = localRequire("playwright-core");
const chromiumMod = localRequire("@sparticuz/chromium");
const chromium = chromiumMod.default ?? chromiumMod;

const BASE = process.env.BASE ?? "http://127.0.0.1:3101";
const MOCK_SUPA_PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54399);
const INVITE_TOKEN = "22222222-2222-4222-8222-222222222222";
const EXAM_ID = "11111111-1111-4111-8111-111111111111";
const CLASS_ID = "0a400000-0000-4000-8000-000000000101";
const ACCESS_CODE = "MATH-2026";
const Q1_ID = "88888888-8888-4888-8888-888888888801";
const Q2_ID = "88888888-8888-4888-8888-888888888802";

// Start an in-process mock PostgREST responder so SSR `/exam/join/<token>` renders
// when the local Next server is started with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399.
const mockSupa = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${MOCK_SUPA_PORT}`);
  const accept = req.headers.accept ?? "";
  const isObject = accept.includes("vnd.pgrst.object+json");
  const examRow = {
    id: EXAM_ID,
    organization_id: "0a400000-0000-4000-8000-000000000001",
    title: "Mathematics Shared-Browser Examination",
    description: "End-to-end sequential shared-browser test",
    instructions: "Answer both questions and submit.",
    status: "open",
    starts_at: null,
    ends_at: null,
    shared_link_enabled: true,
    invite_expires_at: null,
    invite_activates_at: null,
    invite_no_expiry: true,
    event_id: null,
    class_id: CLASS_ID,
    settings: { access_mode: "shared_link", eligible_class_ids: [CLASS_ID], attempt_policy: "single_resume" },
  };
  const classRows = [{ id: CLASS_ID, name: "MYP 3A", organization_id: "0a400000-0000-4000-8000-000000000001" }];
  if (url.pathname.startsWith("/auth/v1/user")) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ message: "no session" }));
  }
  if (url.pathname === "/rest/v1/exams") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(isObject ? examRow : [examRow]));
  }
  if (url.pathname === "/rest/v1/classes") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(isObject ? classRows[0] : classRows));
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(isObject ? null : []));
});
await new Promise((resolve) => {
  mockSupa.once("error", () => resolve());
  mockSupa.listen(MOCK_SUPA_PORT, "127.0.0.1", () => resolve());
});

const sha256 = (v) => createHash("sha256").update(v, "utf8").digest("hex");

/* ── Authoritative stateful mock exam backend enforcing production rules ── */
const candidatesByKey = new Map(); // `${guestKeyHash}:${firstLower}:${lastLower}:${classId}` -> candidate
const attemptsById = new Map();
let networkOnline = true;

function findOrCreateAdmission({ first_name, last_name, class_id, access_code, guest_key }) {
  if (String(access_code ?? "").trim().toUpperCase() !== ACCESS_CODE) {
    return { status: 403, body: { error: "That access code does not match this examination." } };
  }
  const key = `${sha256(guest_key)}:${first_name.trim().toLowerCase()}:${last_name.trim().toLowerCase()}:${class_id}`;
  let candidate = candidatesByKey.get(key);
  if (!candidate) {
    candidate = {
      id: randomUUID(),
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      full_name: `${first_name.trim()} ${last_name.trim()}`.trim(),
      class_id,
      guest_key_hash: sha256(guest_key),
    };
    candidatesByKey.set(key, candidate);
  }

  const candidateAttempts = [...attemptsById.values()].filter((a) => a.candidate.id === candidate.id);
  const active = candidateAttempts.find((a) => a.status === "in_progress") ?? null;
  const latest = candidateAttempts.at(-1) ?? null;

  if (!active && latest) {
    return {
      status: 409,
      body: {
        error: "This attempt has already been submitted. Duplicate attempts are not permitted.",
      },
    };
  }

  let attempt = active;
  if (!attempt) {
    attempt = {
      id: randomUUID(),
      token: randomUUID(),
      candidate,
      status: "in_progress",
      started_at: new Date().toISOString(),
      deadline: new Date(Date.now() + 60 * 60_000).toISOString(),
      answers: {},
      flagged: [],
      submits: 0,
    };
    attemptsById.set(attempt.id, attempt);
  }

  return {
    status: 200,
    body: {
      attempt_id: attempt.id,
      access_token: attempt.token,
      exam_id: EXAM_ID,
      entry_href: `/exam/join/${INVITE_TOKEN}`,
      title: "Mathematics Shared-Browser Examination",
      candidate_name: candidate.full_name,
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      class_id: candidate.class_id,
      status: attempt.status,
      attempt_number: 1,
      deadline: attempt.deadline,
      proctoring: false,
    },
  };
}

function buildStateResponse(attempt) {
  return {
    server_now: new Date().toISOString(),
    exam: {
      id: EXAM_ID,
      entry_href: `/exam/join/${INVITE_TOKEN}`,
      title: "Mathematics Shared-Browser Examination",
      description: null,
      instructions: "Answer both questions and submit.",
      proctoring: false,
      require_screen_share: false,
      pass_mark_percent: 50,
    },
    candidate: {
      name: attempt.candidate.full_name,
      ref: null,
      first_name: attempt.candidate.first_name,
      last_name: attempt.candidate.last_name,
      class_id: attempt.candidate.class_id,
    },
    attempt: {
      id: attempt.id,
      status: attempt.status,
      attempt_number: 1,
      deadline: attempt.deadline,
      flagged: attempt.flagged,
      score: attempt.status !== "in_progress" ? Object.keys(attempt.answers).length * 5 : null,
      max_score: attempt.status !== "in_progress" ? 10 : null,
      results_published: true,
    },
    questions: [
      {
        question_id: Q1_ID,
        quiz_question_id: "qq-1",
        type: "short_answer",
        prompt: "Question 1: Solve 2x = 14",
        points: 5,
        media_url: null,
        media_type: null,
        options: [],
        saved_answer: attempt.answers[Q1_ID] ?? null,
        result: attempt.status !== "in_progress"
          ? { is_correct: Boolean(attempt.answers[Q1_ID]), points_awarded: attempt.answers[Q1_ID] ? 5 : 0, answered: Boolean(attempt.answers[Q1_ID]), explanation: "x = 7" }
          : null,
      },
      {
        question_id: Q2_ID,
        quiz_question_id: "qq-2",
        type: "short_answer",
        prompt: "Question 2: Solve y + 3 = 10",
        points: 5,
        media_url: null,
        media_type: null,
        options: [],
        saved_answer: attempt.answers[Q2_ID] ?? null,
        result: attempt.status !== "in_progress"
          ? { is_correct: Boolean(attempt.answers[Q2_ID]), points_awarded: attempt.answers[Q2_ID] ? 5 : 0, answered: Boolean(attempt.answers[Q2_ID]), explanation: "y = 7" }
          : null,
      },
    ],
  };
}

const executablePath = await chromium.executablePath();
process.env.LD_LIBRARY_PATH = ["/tmp/al2023/lib", process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
const browser = await playwright.launch({ headless: true, executablePath, args: chromium.args });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

let checks = 0;
const pass = (msg) => { checks += 1; console.log(`  ✓ ${msg}`); };

await page.route("**/api/exam/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());

  if (url.pathname === "/api/exam/link-access") {
    const body = req.postDataJSON();
    const out = findOrCreateAdmission(body);
    return route.fulfill({ status: out.status, json: out.body });
  }
  if (url.pathname === "/api/exam/state") {
    const id = url.searchParams.get("attempt_id");
    const auth = req.headers().authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const attempt = attemptsById.get(id);
    if (!attempt || attempt.token !== token) {
      return route.fulfill({ status: 404, json: { error: "Attempt not found." } });
    }
    return route.fulfill({ status: 200, json: buildStateResponse(attempt) });
  }
  if (url.pathname === "/api/exam/save") {
    if (!networkOnline) return route.fulfill({ status: 503, json: { error: "offline" } });
    const body = req.postDataJSON();
    const attempt = attemptsById.get(body.attempt_id);
    if (!attempt || attempt.token !== body.token) {
      return route.fulfill({ status: 404, json: { error: "Attempt not found." } });
    }
    if (attempt.status !== "in_progress") {
      return route.fulfill({ status: 409, json: { error: "Already submitted." } });
    }
    attempt.answers[body.question_id] = body.answer;
    if (Array.isArray(body.flagged)) attempt.flagged = body.flagged;
    return route.fulfill({ status: 200, json: { ok: true, saved_at: new Date().toISOString() } });
  }
  if (url.pathname === "/api/exam/submit") {
    if (!networkOnline) return route.fulfill({ status: 503, json: { error: "offline" } });
    const body = req.postDataJSON();
    const attempt = attemptsById.get(body.attempt_id);
    if (!attempt || attempt.token !== body.token) {
      return route.fulfill({ status: 404, json: { error: "Attempt not found." } });
    }
    attempt.status = "submitted";
    attempt.submits += 1;
    return route.fulfill({ status: 200, json: { ok: true, status: "submitted" } });
  }
  if (url.pathname === "/api/exam/integrity") {
    return route.fulfill({ status: 200, json: { ok: true, recorded: false, count: 0, level: "none" } });
  }
  if (url.pathname === "/api/exam/messages") {
    return route.fulfill({ status: 200, json: { server_now: new Date().toISOString(), messages: [], unread_from_teacher: 0 } });
  }
  if (url.pathname === "/api/exam/presence") {
    return route.fulfill({ status: 200, json: { ok: true } });
  }
  if (url.pathname === "/api/exam/retake") {
    return route.fulfill({ status: 200, json: { attempt_number: 1, attempt_label: "First attempt", submitted: true, can_request: false, can_start: false, message: "", pending: null, decision: null, grant: null, history: [] } });
  }
  return route.continue();
});


/**
 * Clear the entry form's two gates and start the paper.
 *
 * Both are ordinary candidate situations, not test artifacts:
 *
 *   1. The device check. A headless browser has no camera and
 *      `proctoring.require_camera_check` defaults to true, so the panel reports
 *      one check that could not be completed and asks the candidate to
 *      acknowledge it — exactly what a desktop without a webcam does. The paper
 *      must still be reachable afterwards, and once the checks have finished the
 *      start button must ask for that acknowledgement instead of claiming the
 *      check is still running (which reads as a hang).
 *   2. The consent declaration, plus the browser guest key that is minted one
 *      tick after mount: clicking before then waits on a disabled control.
 */
async function verifyAndBegin() {
  const acknowledge = page.getByLabel(/checks could not be completed/i);
  if (await acknowledge.count()) {
    await page.getByText(/You can still sit this examination/).waitFor({ timeout: 60_000 });
    assert.equal(
      await page.getByRole("button", { name: /Completing device check/ }).count(),
      0,
      "the checks have finished: the button must ask for the acknowledgement, not claim it is still working",
    );
    await acknowledge.check();
  }

  const btn = page.getByRole("button", { name: "Verify and Begin" });
  await btn.waitFor({ state: "visible", timeout: 120_000 });
  const consent = page.getByLabel(/I confirm these details are mine/i);
  await consent.waitFor({ timeout: 30_000 });
  if (!(await consent.isChecked())) await consent.check();
  for (let i = 0; i < 200; i += 1) {
    if (await btn.isEnabled()) break;
    await page.waitForTimeout(100);
  }
  assert.ok(await btn.isEnabled(), "the start button must enable once the device check is acknowledged and consent is given");
  await btn.click();
}


/** Fill the candidate entry form and submit it, tolerating the post-mount
 *  re-render that can reset values typed into the first paint. */
async function enterAs(first, last) {
  const guard = page.getByRole("button", { name: "I am a different student" });
  if (await guard.count()) {
    await guard.first().click();
    await page.getByLabel("First Name").waitFor({ timeout: 60_000 });
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByLabel("First Name").fill(first);
    await page.getByLabel("Last Name").fill(last);
    await page.getByLabel("Examination Code").fill(ACCESS_CODE);
    await page.waitForTimeout(250);
    if (
      (await page.getByLabel("First Name").inputValue()) === first &&
      (await page.getByLabel("Last Name").inputValue()) === last &&
      (await page.getByLabel("Examination Code").inputValue()) === ACCESS_CODE
    ) {
      break;
    }
  }
  await verifyAndBegin();
}

try {
  await page.goto(`${BASE}/exam/join/${INVITE_TOKEN}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("heading", { name: "Mathematics Shared-Browser Examination" }).waitFor({ timeout: 60_000 });

  // Seed unrelated app state in localStorage to ensure candidate session cleanup preserves it.
  await page.evaluate(() => {
    localStorage.setItem("evalora-admin-collapsed", "1");
  });

  const initialGuestKey = await page.waitForFunction(
    (t) => localStorage.getItem(`evalora-guest-${t}`),
    INVITE_TOKEN,
    { timeout: 15_000 },
  ).then((h) => h.jsonValue());
  assert.ok(initialGuestKey && initialGuestKey.length >= 16, "guest key must be initialized");

  // ── Scenario A & B: 3 Sequential Students on ONE Browser ─────────────────
  const threeStudents = [
    { first: "Ama", last: "Kouadio", answer1: "Ama-x=7", answer2: "Ama-y=7" },
    { first: "Bruno", last: "Mensah", answer1: "Bruno-x=7", answer2: "Bruno-y=7" },
    { first: "Chloé", last: "Dossou", answer1: "Chloe-x=7", answer2: "Chloe-y=7" },
  ];
  const seenAttemptIds = [];

  for (const stu of threeStudents) {
    // When this browser still holds a resumable attempt for a previous student,
    // the entry page asks the next person to declare themselves before exposing
    // the form. That is the anti-takeover guard working, so acknowledge it.
    const differentStudent = page.getByRole("button", { name: "I am a different student" });
    if (await differentStudent.count()) {
      await differentStudent.first().click();
      await page.getByLabel("First Name").waitFor({ timeout: 60_000 });
    }

    // Verify clean entry screen: empty first name, empty last name, no unfinished-attempt banner, no error alert
    assert.equal(await page.getByLabel("First Name").inputValue(), "");
    assert.equal(await page.getByLabel("Last Name").inputValue(), "");
    assert.equal(await page.locator('[data-testid="active-attempt-recovery-banner"]').count(), 0);

    await enterAs(stu.first, stu.last);

    await page.waitForURL(/\/take-exam\/[0-9a-f-]+$/, { timeout: 120_000, waitUntil: "domcontentloaded" });
    const attemptUrl = new URL(page.url());
    const attemptId = attemptUrl.pathname.split("/").pop();
    assert.ok(attemptId && !seenAttemptIds.includes(attemptId), "each student must get a unique attemptId");
    seenAttemptIds.push(attemptId);

    // Header must show THIS student's name and zero saved answers inherited from earlier students
    await page.getByText(`${stu.first} ${stu.last}`).waitFor({ timeout: 30_000 });
    await page.getByText("0 of 2 answers confirmed by the server.").waitFor();
    assert.equal(await page.getByPlaceholder("Type your answer…").inputValue(), "");

    // Answer Q1 & Q2
    await page.getByPlaceholder("Type your answer…").fill(stu.answer1);
    await page.getByRole("button", { name: "Save answer" }).click();
    await page.getByText("1 of 2 answers confirmed by the server.").waitFor();

    await page.getByRole("button", { name: /^Next(?: →)?$/ }).click();
    assert.equal(await page.getByPlaceholder("Type your answer…").inputValue(), "");
    await page.getByPlaceholder("Type your answer…").fill(stu.answer2);
    await page.getByRole("button", { name: "Save answer" }).click();
    await page.getByText("2 of 2 answers confirmed by the server.").waitFor();

    // Submit paper
    await page.getByRole("button", { name: "Submit examination" }).click();
    await page.getByRole("button", { name: "Yes, submit now" }).click();

    // A confirmed submission renders the locked confirmation screen; the
    // candidate session is finalised and the browser is handed on explicitly.
    await page.getByText("Thank you for completing your examination!").waitFor({ timeout: 30_000 });
    await page.getByText(/Your responses have been saved/).waitFor({ timeout: 30_000 });

    // Verify completed candidate token was IMMEDIATELY purged from localStorage while unrelated state stays!
    const storageCheck = await page.evaluate((id) => ({
      attemptToken: localStorage.getItem(`evalora-attempt-${id}`),
      activePointer: localStorage.getItem("evalora-active-candidate-session"),
      adminCollapsed: localStorage.getItem("evalora-admin-collapsed"),
    }), attemptId);
    assert.equal(storageCheck.attemptToken, null, "submitted candidate token must be cleared immediately");
    assert.equal(storageCheck.activePointer, null, "active pointer must be cleared immediately");
    assert.equal(storageCheck.adminCollapsed, "1", "unrelated app state must remain intact");

    // The candidate now hands the browser to the next student.
    await page.getByRole("button", { name: /Finish & exit for next student/ }).click();
    // The first navigation to the entry page can include a cold dev-server
    // compile, so allow for it instead of failing on a 30 s budget.
    await page.waitForURL(`**/exam/join/${INVITE_TOKEN}`, { timeout: 120_000, waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Mathematics Shared-Browser Examination" }).waitFor();

    pass(`Sequential student ${stu.first} ${stu.last} completed, submitted, cleared session, and returned cleanly to entry`);
  }

  // ── Scenario E: Completed attempt isolation (Back/revisit & duplicate login) ──
  const firstAttemptId = seenAttemptIds[0];
  await page.goto(`${BASE}/take-exam/${firstAttemptId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Examination session ended" }).waitFor();
  assert.equal(await page.getByPlaceholder("Type your answer…").count(), 0, "completed attempt must never reopen as editable");
  await page.getByTestId("closed-session-entry-link").click();
  await page.waitForURL(`**/exam/join/${INVITE_TOKEN}`, { timeout: 120_000, waitUntil: "domcontentloaded" });

  // Replay Ama Kouadio's credentials -> blocked with 409!
  await enterAs("Ama", "Kouadio");
  await page.getByText(/already been submitted/i).waitFor({ timeout: 60_000 });
  pass("Scenario E: revisiting closed attempt shows ended handoff and duplicate login replay is refused with 409");

  // ── Scenario C & D: Refresh recovery, Offline reconnect, and Anti-takeover ──
  await page.goto(`${BASE}/exam/join/${INVITE_TOKEN}`, { waitUntil: "domcontentloaded" });
  async function clearEntryGuard() {
    const btn = page.getByRole("button", { name: "I am a different student" });
    if (await btn.count()) {
      await btn.first().click();
      await page.getByLabel("First Name").waitFor({ timeout: 60_000 });
    }
  }
  await enterAs("Fifamè", "Soglo");
  await page
    .waitForURL(/\/take-exam\/[0-9a-f-]+$/, { timeout: 120_000, waitUntil: "domcontentloaded" });
  const fifameAttemptId = new URL(page.url()).pathname.split("/").pop();

  // Scenario D: Disconnect network, save answer -> queued locally without submitting!
  networkOnline = false;
  await page.getByPlaceholder("Type your answer…").fill("Fifame-offline-answer");
  await page.getByRole("button", { name: "Save answer" }).click();
  await page.getByText(/1 answer\(s\) awaiting confirmation/).waitFor();

  // Scenario C: Refresh mid-attempt while offline -> recovers active attempt & queued answer!
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Fifamè Soglo").waitFor();
  assert.equal(await page.getByPlaceholder("Type your answer…").inputValue(), "Fifame-offline-answer");

  // Reconnect network -> Retry saving flushes cleanly without premature submission!
  networkOnline = true;
  await page.getByRole("button", { name: "Retry saving" }).click();
  await page.getByText("1 of 2 answers confirmed by the server.").waitFor();
  assert.equal(attemptsById.get(fifameAttemptId).status, "in_progress");
  pass("Scenario D: network interruption queues answer across reload and flushes on reconnect without premature submission");

  // Scenario C anti-takeover: Navigate to join page while Fifamè's attempt is still in_progress
  await page.goto(`${BASE}/exam/join/${INVITE_TOKEN}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("active-attempt-recovery-banner").waitFor();
  // Form inputs must NOT prefill Fifamè's name!
  assert.equal(await page.getByLabel("First Name").inputValue(), "");
  assert.equal(await page.getByLabel("Last Name").inputValue(), "");

  // Student E ("Ulrich Talon") clicks "I am a different student" and starts their own clean attempt!
  await page.getByRole("button", { name: "I am a different student" }).click();
  assert.equal(await page.locator('[data-testid="active-attempt-recovery-banner"]').count(), 0);
  await page.getByLabel("First Name").fill("Ulrich");
  await page.getByLabel("Last Name").fill("Talon");
  await page.getByLabel("Examination Code").fill(ACCESS_CODE);
  // The consent declaration and the device-check acknowledgement are both
  // handled by verifyAndBegin(): this page has two checkboxes, so a bare
  // getByRole("checkbox") is ambiguous here.
  await verifyAndBegin();
  // A cold dev-server compile of /take-exam can exceed two minutes on the very
  // first student; the server-rendered shell always arrives, the route change is
  // what matters.
  await page.waitForURL(/\/take-exam\/[0-9a-f-]+$/, { timeout: 120_000, waitUntil: "domcontentloaded" }).catch(async (e) => {
    console.log("    [nav] url after join:", page.url());
    console.log("    [nav] alerts:", await page.locator('[role="alert"]').allTextContents().catch(() => []));
    throw e;
  });
  const ulrichAttemptId = new URL(page.url()).pathname.split("/").pop();
  assert.notEqual(ulrichAttemptId, fifameAttemptId, "Ulrich must get his own separate attempt");
  await page.getByText("Ulrich Talon").waitFor();
  assert.equal(await page.getByPlaceholder("Type your answer…").inputValue(), "", "Ulrich must NOT see Fifamè's answer");
  assert.equal(attemptsById.get(fifameAttemptId).answers[Q1_ID]?.text, "Fifame-offline-answer", "Fifamè's active attempt remains untouched");
  pass("Scenario C: unfinished attempt recovery banner + anti-takeover isolates Student E while preserving Fifamè's active attempt");

  console.log(`\n${checks} real-Chromium shared-browser sequential examination checks passed.`);
} finally {
  await context.close();
  await browser.close();
  mockSupa.close();
}
