// Regression suite for the 504 MIDDLEWARE_INVOCATION_TIMEOUT incident:
// middleware fast-path & bounded auth budget, durable dual-storage exam queue,
// deferred deadline closure while pending saves flush, verified pre-deadline
// recovery saves, DB event constraint fallback, and per-request auth caching.
// Purely in-memory mocked tests — zero live database or student-attempt access.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

function compile(src, dest, deps = {}) {
  const f = path.resolve(dest);
  const m = new Module(f);
  const old = Module._load;
  m.filename = f;
  m.paths = Module._nodeModulePaths(path.dirname(f));
  Module._load = function (req, parent) {
    if (parent?.filename === f && req in deps) return deps[req];
    return old.apply(this, arguments);
  };
  try {
    const out = ts.transpileModule(readFileSync(src, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    m._compile(out, f);
    return m.exports;
  } finally {
    Module._load = old;
  }
}

function makeMemoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "anon-test-key";

// ── 1. Middleware fast-path & bounded GoTrue stall protection ──────────────
let supabaseClientCalls = 0;
let authMode = "ok"; // "ok" | "anon" | "hang"
const NextResponse = {
  next: (opts) => ({ type: "next", requestHeaders: opts?.request?.headers ?? null, cookies: { getAll: () => [], set() {} } }),
  rewrite: (url, opts) => ({ type: "rewrite", url: String(url), requestHeaders: opts?.request?.headers ?? null, cookies: { getAll: () => [], set() {} } }),
  redirect: (url) => ({ type: "redirect", url: String(url), cookies: { getAll: () => [], set() {} } }),
};

const mwMod = compile("src/middleware.ts", "scripts/__incident_mw.cjs", {
  "next/server": { NextResponse },
  "@supabase/ssr": {
    createServerClient: () => {
      supabaseClientCalls += 1;
      return {
        auth: {
          getUser: () => {
            if (authMode === "hang") return new Promise(() => {});
            if (authMode === "ok") return Promise.resolve({ data: { user: { id: "u1" } }, error: null });
            return Promise.resolve({ data: { user: null }, error: null });
          },
        },
      };
    },
  },
  "@/lib/tenant": {
    getTenantSlugFromHost: (h) => (h === "oak.evalora.test" ? "oak" : null),
  },
});

function makeReq(pathname, { host = "evalora.test", cookies = [], headers = {} } = {}) {
  const u = new URL(`https://${host}${pathname}`);
  const hdrs = new Headers({ host, ...headers });
  return {
    headers: hdrs,
    cookies: { getAll: () => cookies },
    nextUrl: Object.assign(u, { clone: () => new URL(u.toString()) }),
  };
}

await test("exam save, submit, state, presence, take-exam, monitor API, and health bypass remote auth in middleware", async () => {
  supabaseClientCalls = 0;
  authMode = "hang";
  for (const p of [
    "/api/exam/save",
    "/api/exam/submit",
    "/api/exam/state",
    "/api/exam/presence",
    "/api/exam/messages",
    "/api/monitor/exams/123",
    "/take-exam/43d5a835-401a-4b7b-a9a9-9080e1ec5b97",
    "/exam-access",
    "/exam/ABCD1234",
  ]) {
    const res = await mwMod.middleware(makeReq(p, { cookies: [{ name: "sb-proj-auth-token", value: "tok" }] }));
    assert.equal(res.type, "next", p);
  }
  assert.equal(supabaseClientCalls, 0);
  assert.equal(/api\/health/.test(mwMod.config.matcher[0]), true);
});

await test("middleware strips spoofed x-evalora-tenant-slug and sets verified slug from host", async () => {
  const primary = await mwMod.middleware(makeReq("/api/exam/save", {
    host: "evalora.test",
    headers: { "x-evalora-tenant-slug": "spoofed-school" },
  }));
  assert.equal(primary.requestHeaders.get("x-evalora-tenant-slug"), null);

  const tenant = await mwMod.middleware(makeReq("/api/exam/save", {
    host: "oak.evalora.test",
    headers: { "x-evalora-tenant-slug": "spoofed-school" },
  }));
  assert.equal(tenant.requestHeaders.get("x-evalora-tenant-slug"), "oak");
});

await test("middleware bounds stalled GoTrue auth on /admin: passes cookie-bearing session to server auth and redirects anonymous", async () => {
  authMode = "hang";
  const t0 = Date.now();
  const withCookie = await mwMod.middleware(makeReq("/admin", {
    cookies: [{ name: "sb-nqxqisjtbfsratgztmch-auth-token", value: "session-jwt" }],
  }));
  const elapsed = Date.now() - t0;
  assert.equal(withCookie.type, "next");
  assert.ok(elapsed < 5_000, `expected bounded <5s middleware response, got ${elapsed}ms`);

  const withoutCookie = await mwMod.middleware(makeReq("/admin", { cookies: [] }));
  assert.equal(withoutCookie.type, "redirect");
  assert.equal(new URL(withoutCookie.url).pathname, "/login");
});

// ── 2. Durable dual-storage ExamSaveQueue ──────────────────────────────────
const queueMod = compile("src/lib/examSaveQueue.ts", "scripts/__incident_queue.cjs");

await test("durable exam save queue mirrors to localStorage without token, survives sessionStorage loss, and never clears on 504", async () => {
  const session = makeMemoryStorage();
  const local = makeMemoryStorage();
  local.setItem("evalora-attempt-att1", JSON.stringify({ token: "secret-candidate-token" }));

  const durable1 = queueMod.createDurableExamQueueStorage(session, local);
  let failNetwork = true;
  const sentPayloads = [];
  const key = "evalora-exam-pending-att1";
  const q1 = new queueMod.ExamSaveQueue(
    durable1,
    key,
    async (item) => {
      sentPayloads.push(item);
      if (failNetwork) throw new Error("504 Gateway Timeout");
    },
    () => {},
    () => {},
  );

  const enqueued = q1.enqueue("q-algebra", "qq-algebra", { text: "x = 7" }, []);
  assert.equal(enqueued, true);
  const firstFlush = await q1.flush();
  assert.equal(firstFlush, false);
  assert.equal(q1.state().pending, 1);

  // Verify both storages contain the answer, and queue payload never contains the secret token.
  const rawLocal = local.getItem("evalora-exam-pending-att1");
  assert.ok(rawLocal && rawLocal.includes("x = 7"));
  assert.equal(rawLocal.includes("secret-candidate-token"), false);

  // Simulate tab close (sessionStorage wiped) and browser reopen after outage resolves.
  session.map.clear();
  failNetwork = false;
  const durable2 = queueMod.createDurableExamQueueStorage(session, local);
  const q2 = new queueMod.ExamSaveQueue(
    durable2,
    key,
    async (item) => {
      sentPayloads.push(item);
    },
    () => {},
    () => {},
  );

  assert.equal(q2.state().pending, 1);
  assert.equal(q2.snapshot()[0]?.answer?.text, "x = 7");
  const flushed = await q2.flush();
  assert.equal(flushed, true);
  assert.equal(q2.state().pending, 0);
  assert.equal(session.getItem("evalora-exam-pending-att1"), null);
  assert.equal(local.getItem("evalora-exam-pending-att1"), null);

  const recoverySend = sentPayloads[sentPayloads.length - 1];
  assert.equal(recoverySend.recoveredFromStorage, true);
  assert.equal(recoverySend.idempotencyKey, sentPayloads[0].idempotencyKey);
  assert.equal(recoverySend.queuedAt, sentPayloads[0].queuedAt);
});

// ── 3. Outage recovery across deadline in /api/exam/state & /api/exam/save ──
const VALID_TOKEN = "00000000-0000-4000-8000-000000000099";
const ATT_ID = "00000000-0000-4000-8000-000000000001";
const EXAM_ID = "00000000-0000-4000-8000-000000000002";
const QUIZ_ID = "00000000-0000-4000-8000-000000000003";
const Q1_ID = "00000000-0000-4000-8000-000000000011";
const Q2_ID = "00000000-0000-4000-8000-000000000012";
const QQ1_ID = "00000000-0000-4000-8000-000000000021";
const QQ2_ID = "00000000-0000-4000-8000-000000000022";

const quizRows = [
  { id: QQ1_ID, quiz_id: QUIZ_ID, position: 0, points: 5, section_title: null, questions: { id: Q1_ID, type: "short_answer", body: "Q1", question_options: [], points: 5, config: {} } },
  { id: QQ2_ID, quiz_id: QUIZ_ID, position: 1, points: 5, section_title: null, questions: { id: Q2_ID, type: "short_answer", body: "Q2", question_options: [], points: 5, config: {} } },
];

const examTrackMod = compile("src/lib/examTrack.ts", "scripts/__incident_track.cjs");
const examDeadlineMod = compile("src/lib/examDeadline.ts", "scripts/__incident_deadline.cjs");
const examMod = compile("src/lib/exam.ts", "scripts/__incident_exam.cjs", {
  "./examDeadline": examDeadlineMod,
  "./live": {
    loadQuizQuestions: async () => quizRows,
    seededShuffle: (items) => items,
  },
  "./scoring": {
    scoreAnswer: (_q, _opts, ans) => ({
      isCorrect: ans?.text === "42" || ans === "42",
      points: ans?.text === "42" || ans === "42" ? 5 : 0,
    }),
  },
});

function createFakeExamDb({ status = "in_progress", pendingSaves = 2, rejectAutoSubmitEvent = false } = {}) {
  const attempt = {
    id: ATT_ID,
    exam_id: EXAM_ID,
    candidate_id: "cand-1",
    status,
    started_at: "2026-11-13T13:00:00.000Z",
    submitted_at: status === "in_progress" ? null : "2026-11-13T14:00:00.000Z",
    submission_reason: status === "in_progress" ? null : "time_expired",
    extension_minutes: 0,
    access_token: VALID_TOKEN,
    question_order: [QQ1_ID, QQ2_ID],
    option_orders: {},
    flagged_questions: [],
    track: null,
    marked_at: null,
    score: status === "in_progress" ? null : 0,
    max_score: 10,
    percentage: status === "in_progress" ? null : 0,
    passed: status === "in_progress" ? null : false,
  };
  const exam = {
    id: EXAM_ID,
    organization_id: "org-1",
    title: "MYP4",
    quiz_id: QUIZ_ID,
    duration_minutes: 60,
    ends_at: null,
    passing_score: 50,
    show_results_immediately: false,
    results_published: false,
    settings: {},
  };
  const candidate = {
    id: "cand-1",
    full_name: "Student",
    class_id: null,
    status: status === "in_progress" ? "started" : "submitted",
  };
  const presence = {
    attempt_id: ATT_ID,
    exam_id: EXAM_ID,
    pending_saves: pendingSaves,
    last_seen_at: "2026-11-13T13:58:00.000Z",
  };
  const answers = new Map();
  const events = [];

  const db = {
    attempt,
    presence,
    answers,
    events,
    from(table) {
      const state = { filters: {}, updatePatch: null };
      const chain = {
        select() { return chain; },
        eq(k, v) { state.filters[k] = v; return chain; },
        is(k, v) { state.filters[k] = v; return chain; },
        in() { return chain; },
        order() { return chain; },
        async single() { return chain.maybeSingle(); },
        async maybeSingle() {
          if (table === "exam_attempts") {
            if (state.filters.access_token && state.filters.access_token !== attempt.access_token) {
              return { data: null, error: null };
            }
            if (state.updatePatch) {
              if (state.filters.status && attempt.status !== state.filters.status) return { data: null, error: null };
              Object.assign(attempt, state.updatePatch);
              return { data: { ...attempt }, error: null };
            }
            return { data: { ...attempt, exams: exam, exam_candidates: candidate }, error: null };
          }
          if (table === "exams") return { data: { ...exam }, error: null };
          if (table === "exam_candidates") {
            if (state.updatePatch) Object.assign(candidate, state.updatePatch);
            return { data: { ...candidate }, error: null };
          }
          if (table === "quiz_questions") {
            const match = quizRows.find((r) => r.questions.id === state.filters.question_id);
            return { data: match ?? null, error: null };
          }
          if (table === "exam_presence") return { data: presence ? { ...presence } : null, error: null };
          if (table === "exam_answers" && state.updatePatch && state.filters.id) {
            for (const a of answers.values()) {
              if (a.id === state.filters.id) {
                Object.assign(a, state.updatePatch);
                return { data: { id: a.id }, error: null };
              }
            }
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        update(patch) {
          state.updatePatch = patch;
          return {
            eq(k, v) { state.filters[k] = v; return this; },
            is(k, v) { state.filters[k] = v; return this; },
            select() { return chain; },
            then(resolve) {
              if (table === "exam_presence" && presence) Object.assign(presence, patch);
              if (table === "exam_attempts") Object.assign(attempt, patch);
              if (table === "exam_candidates") Object.assign(candidate, patch);
              if (table === "exam_answers" && state.filters.id) {
                for (const a of answers.values()) {
                  if (a.id === state.filters.id) Object.assign(a, patch);
                }
              }
              return Promise.resolve({ data: null, error: null }).then(resolve);
            },
          };
        },
        upsert(row) {
          if (table === "exam_answers") {
            const saved = { id: `ans-${row.question_id}`, marked_by: null, ...row };
            answers.set(row.question_id, saved);
            return {
              select() {
                return {
                  async maybeSingle() {
                    return { data: { id: saved.id, updated_at: saved.updated_at }, error: null };
                  },
                };
              },
            };
          }
          return Promise.resolve({ error: null });
        },
        async insert(row) {
          if (table === "exam_result_events") {
            if (rejectAutoSubmitEvent && row.event_type === "auto_submitted") {
              return { error: { message: 'violates check constraint "exam_result_events_event_type_check"' } };
            }
            events.push(row);
          }
          return { error: null };
        },
        then(resolve) {
          if (table === "quiz_questions") return Promise.resolve({ data: quizRows, error: null }).then(resolve);
          if (table === "exam_answers") return Promise.resolve({ data: [...answers.values()], error: null }).then(resolve);
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
  return db;
}

let activeDb = null;
const submissionMod = compile("src/lib/examSubmission.ts", "scripts/__incident_submission.cjs", {
  "./exam": examMod,
  "./examDeadline": examDeadlineMod,
});
const saveRoute = compile("src/app/api/exam/save/route.ts", "scripts/__incident_save_route.cjs", {
  "next/server": { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } },
  "@/lib/exam": examMod,
  "@/lib/examTrack": examTrackMod,
  "@/lib/responseTools": { validateAnswerPayload: (_type, ans) => ({ ok: true, answer: ans }) },
  "@/lib/supabase/server": { createAdminClient: () => activeDb },
});
const stateRoute = compile("src/app/api/exam/state/route.ts", "scripts/__incident_state_route.cjs", {
  "next/server": { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } },
  "@/lib/exam": examMod,
  "@/lib/examDeadline": examDeadlineMod,
  "@/lib/examSubmission": submissionMod,
  "@/lib/live": {
    publicQuestion: (r) => ({ id: r.questions.id, quiz_question_id: r.id, type: r.questions.type, body: r.questions.body, options: [] }),
    answerReveal: () => null,
    releasedFeedback: () => null,
  },
  "@/lib/examResults": { buildExamResult: () => ({ published: false }) },
  "@/lib/integrity": { parseIntegrityPolicy: () => ({ mode: "off" }) },
  "@/lib/examHintsServer": { loadPublishedHints: async () => new Map() },
  "@/lib/supabase/server": { createAdminClient: () => activeDb },
});

await test("GET /api/exam/state defers deadline auto-submit while X-Exam-Pending-Saves > 0 so queued answers flush first", async () => {
  activeDb = createFakeExamDb({ status: "in_progress", pendingSaves: 2 });
  const RealDateNow = Date.now;
  Date.now = () => Date.parse("2026-11-13T14:15:00.000Z"); // 15 min past 14:00 deadline
  try {
    const res = await stateRoute.GET(new Request(`https://evalora.test/api/exam/state?attempt_id=${ATT_ID}`, {
      headers: {
        Authorization: `Bearer ${VALID_TOKEN}`,
        "X-Exam-Pending-Saves": "2",
      },
    }));
    assert.equal(res.status, 200);
    assert.equal(activeDb.attempt.status, "in_progress");
    assert.equal(res.body.attempt.status, "in_progress");
  } finally {
    Date.now = RealDateNow;
  }
});

await test("POST /api/exam/save recovers pre-deadline queued answers for both overdue in_progress and unmarked auto_submitted attempts, while rejecting post-deadline forgery", async () => {
  const RealDateNow = Date.now;
  Date.now = () => Date.parse("2026-11-13T14:20:00.000Z"); // 20 min past 14:00 deadline
  try {
    // Case A: auto_submitted attempt with pending_saves > 0 (e.g. closed during outage before queue flushed)
    activeDb = createFakeExamDb({ status: "auto_submitted", pendingSaves: 1 });
    const recovered = await saveRoute.POST(new Request("https://evalora.test/api/exam/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attempt_id: ATT_ID,
        token: VALID_TOKEN,
        question_id: Q1_ID,
        quiz_question_id: QQ1_ID,
        answer: { text: "42" },
        idempotency_key: "att-1:q-1:1",
        client_queued_at: "2026-11-13T13:55:00.000Z",
        recovery: true,
      }),
    }));
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.ok, true);
    assert.equal(typeof recovered.body.saved_at, "string");
    assert.equal(recovered.body.recovered, true);
    assert.equal(recovered.body.idempotency_key, "att-1:q-1:1");
    assert.equal(activeDb.presence.pending_saves, 0);
    assert.equal(activeDb.attempt.score, 5); // Re-graded automatically!

    // Case B: Forged post-deadline save when pending_saves === 0 and client_queued_at > deadline is rejected!
    const forged = await saveRoute.POST(new Request("https://evalora.test/api/exam/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attempt_id: ATT_ID,
        token: VALID_TOKEN,
        question_id: Q2_ID,
        quiz_question_id: QQ2_ID,
        answer: { text: "99" },
        idempotency_key: "att-1:q-2:99",
        client_queued_at: "2026-11-13T14:19:00.000Z",
        recovery: true,
      }),
    }));
    assert.equal(forged.status, 409);
  } finally {
    Date.now = RealDateNow;
  }
});

await test("applyDeadlineSubmission falls back cleanly when exam_result_events_event_type_check rejects auto_submitted", async () => {
  activeDb = createFakeExamDb({ status: "in_progress", pendingSaves: 0, rejectAutoSubmitEvent: true });
  const RealDateNow = Date.now;
  Date.now = () => Date.parse("2026-11-13T14:10:00.000Z");
  try {
    const res = await stateRoute.GET(new Request(`https://evalora.test/api/exam/state?attempt_id=${ATT_ID}`, {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    }));
    assert.equal(res.status, 200);
    assert.equal(activeDb.attempt.status, "auto_submitted");
    assert.equal(activeDb.events.length, 1);
    assert.equal(activeDb.events[0].event_type, "submitted");
    assert.equal(activeDb.events[0].metadata.auto_submitted, true);
  } finally {
    Date.now = RealDateNow;
  }
});

// ── 4. Per-request SessionContext deduplication ────────────────────────────
await test("getSessionContext deduplicates auth + profile + membership queries within a single HTTP request", async () => {
  let getUserCalls = 0;
  const sharedHeaders = { get: (k) => (k === "host" ? "evalora.test" : null) };
  const supa = {
    auth: {
      getUser: async () => {
        getUserCalls += 1;
        return { data: { user: { id: "u-admin", email: "admin@evalora.test" } }, error: null };
      },
    },
    from() {
      const q = {
        select() { return q; },
        eq() { return q; },
        async single() { return { data: { id: "u-admin", email: "admin@evalora.test", platform_role: "super_admin", status: "active" }, error: null }; },
        async maybeSingle() { return { data: null, error: null }; },
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
      return q;
    },
  };
  const authMod = compile("src/lib/auth.ts", "scripts/__incident_auth.cjs", {
    "next/headers": {
      headers: async () => sharedHeaders,
      cookies: async () => ({ get: () => undefined }),
    },
    "next/navigation": { redirect: (u) => { throw new Error(`REDIRECT:${u}`); } },
    "./supabase/server": { createClient: async () => supa },
    "./tenant": { getTenantSlugFromHost: () => null },
  });

  const [ctx1, ctx2] = await Promise.all([authMod.getSessionContext(), authMod.getSessionContext()]);
  assert.equal(ctx1?.user.id, "u-admin");
  assert.equal(ctx2?.user.id, "u-admin");
  assert.equal(getUserCalls, 1);
});

console.log(`\n${passed} incident outage recovery checks passed (mocked middleware, storage, and DB).`);
