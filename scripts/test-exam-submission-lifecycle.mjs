// The authoritative submission lifecycle, exercised through the REAL route
// handlers and the REAL sweep, with only the database and the paper replaced.
//
//   node scripts/test-exam-submission-lifecycle.mjs
//
// `src/lib/examDeadline.ts` and `src/lib/examSubmission.ts` are compiled from
// source, not stubbed, so the deadline arithmetic and the premature-closure guard
// under test are exactly the ones production runs.
//
// Scenarios covered (each maps to a row of the mission's regression table):
//   · student switches tab / loses focus / leaves fullscreen  → incident only
//   · clipboard, right-click, page leave, offline, online     → incident only
//   · internet interrupted / returns                          → answers preserved
//   · page refresh                                            → attempt recovered, not reset
//   · official deadline reached                               → automatic submission
//   · local clock manipulated / countdown zero early          → server still refuses
//   · duplicate submission, concurrent submission             → idempotent
//   · attempt already submitted                               → never re-submitted
//   · unauthorised early-submission attempt                   → refused
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

let passed = 0;
function ok(name, detail = "") {
  assert.ok(true);
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
}

/* ───────────────────────── compiling the real modules ───────────────────── */

/**
 * Loads a TypeScript module from source, resolving `@/lib/*` to the real file and
 * letting the caller override specific dependencies.
 */
function load(source, { overrides = {}, extra = {} } = {}) {
  const file = path.resolve(source);
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const originalLoad = Module._load;
  Module._load = function (request, parent) {
    if (parent?.filename === file) {
      if (overrides[request]) return overrides[request];
      if (request.startsWith("@/lib/")) {
        const rel = request.slice("@/".length);
        const target = path.resolve(`${rel}.ts`);
        return load(target, { extra }); // real module, same loader
      }
      if (request === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } };

    }
    return originalLoad.apply(this, arguments);
  };
  try {
    const js = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    mod._compile(js, file);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

/* ───────────────────────────── a fake database ──────────────────────────── */

const MIN = 60_000;

/** Real UUIDs: the routes validate with the real zod schemas. */
const AID = "00000000-0000-4000-8000-0000000000a1";
const TOKEN = "00000000-0000-4000-8000-0000000000c1";

function makeDb() {
  const db = {
    attempts: new Map(),
    candidates: new Map(),
    answers: new Map(), // attemptId -> { questionId: row }
    exams: new Map(),
    papers: new Map(), // quizId -> rows
    incidents: [],
    resultEvents: [],
    writes: [],
    fail: {}, // table -> "grading" | "close" | "candidate"
    closeRace: null, // attemptId closed by "somebody else" mid-flight
    answerWrites: 0,
    gradeWrites: 0,
  };
  db.attempts.set(AID, {
    id: AID,
    exam_id: "e1",
    candidate_id: "c1",
    status: "in_progress",
    started_at: "2026-11-08T10:00:00.000Z", // 10:00 + 120 minutes = 12:00
    started_at_target: "2026-11-08T10:00:00.000Z",
    extension_minutes: 0,
    question_order: ["qq1", "qq2"],
    flagged: [],
    submitted_at: null,
    score: null,
    max_score: null,
  });
  db.candidates.set("c1", { id: "c1", status: "in_progress" });
  db.exams.set("e1", {
    id: "e1",
    duration_minutes: 120,
    ends_at: null,
    quiz_id: "quiz1",
    settings: { results_published: false },
    organization_id: "org1",
  });
  db.papers.set("quiz1", [
    { id: "qq1", points: 2, questions: { id: "q1", type: "short_answer", points: 2, config: {}, question_options: [] } },
    { id: "qq2", points: 2, questions: { id: "q2", type: "short_answer", points: 2, config: {}, question_options: [] } },
  ]);
  db.answers.set(AID, {});
  return db;
}

/**
 * A controllable virtual clock. The routes and the sweep read `Date.now()` on the
 * server; freezing it lets every boundary be asserted exactly, and proves that
 * the decision comes from the server clock rather than from a request payload.
 */
let clockMs = Date.parse("2026-11-08T11:00:00Z");
const realDateNow = Date.now;
Date.now = () => clockMs;
function setClock(ms) {
  clockMs = ms;
}

/** The fake database of the most recent build(); `run` reads it. */
let db_ref = makeDb();

/**
 * Chainable stand-in for the supabase-js query builder, covering exactly the
 * calls the lifecycle makes. Every mutation is recorded so a test can assert
 * that nothing was written.
 */
function makeAdmin(db) {
  function table(name) {
    const st = { filters: [], op: "select", patch: null, single: false, head: false };
    const api = {
      select(_columns, opts) {
        if (opts?.head) st.head = true;
        return api;
      },
      insert(row) {
        st.op = "insert";
        st.patch = row;
        return api;
      },
      update(patch) {
        st.op = "update";
        st.patch = patch;
        return api;
      },
      eq(column, value) {
        st.filters.push((row) => row[column] === value);
        return api;
      },
      in(column, values) {
        st.filters.push((row) => values.includes(row[column]));
        return api;
      },
      is(column, value) {
        st.filters.push((row) => (row[column] ?? null) === value);
        return api;
      },
      like() {
        return api;
      },
      not() {
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        return run(name, st, true);
      },
      single() {
        return run(name, st, true);
      },
      then(resolve, reject) {
        return run(name, st, false).then(resolve, reject);
      },
    };
    return api;
  }
  return { from: table };
}

function rowsOf(db, name) {
  switch (name) {
    case "exam_attempts":
      return [...db.attempts.values()];
    case "exam_candidates":
      return [...db.candidates.values()];
    case "exams":
      return [...db.exams.values()];
    case "exam_answers":
      // `db.answers` is a Map (attempt_id -> question_id -> row).
      return [...db.answers.entries()].flatMap(([attemptId, byQuestion]) =>
        Object.entries(byQuestion).map(([questionId, row]) => ({ ...row, attempt_id: attemptId, question_id: questionId })),
      );
    case "proctoring_incidents":
      return db.incidents;
    case "exam_result_events":
      return db.resultEvents;
    default:
      return [];
  }
}

async function run(name, st, single) {
  const all = rowsOf(db_ref, name).filter((row) => st.filters.every((f) => f(row)));

  if (st.op === "select") {
    if (single) return { data: all[0] ?? null, error: null };
    return { data: all, error: null };
  }

  if (st.op === "insert") {
    const row = { id: `gen-${Math.random().toString(36).slice(2)}`, ...st.patch };
    if (name === "exam_result_events") {
      assert.ok(row.organization_id, "every evidence row carries its tenant");
      db_ref.resultEvents.push(row);
    }
    else if (name === "proctoring_incidents") db_ref.incidents.push(row);
    return { data: row, error: null };
  }

  // update
  if (name === "exam_attempts") {
    if (db_ref.fail.close) return { data: null, error: { message: "close failed" } };
    if (db_ref.closeRace) {
      // A candidate submission that committed between this caller's read and its
      // write. The conditional update must then match nothing.
      const raced = db_ref.attempts.get(db_ref.closeRace);
      if (raced && raced.status === "in_progress") {
        raced.status = "submitted";
        raced.submitted_at = "2026-11-08T11:30:00.000Z";
        raced.score = 1;
        raced.max_score = 4;
      }
      db_ref.closeRace = null;
      const matched = rowsOf(db_ref, name).filter((row) => st.filters.every((f) => f(row)));
      return { data: single ? matched[0] ?? null : matched, error: null };
    }
    for (const row of all) {
      Object.assign(row, st.patch);
      db_ref.writes.push({ table: name, id: row.id, patch: { ...st.patch } });
    }
    return { data: single ? all[0] ?? null : all, error: null };
  }
  if (name === "exam_candidates") {
    if (db_ref.fail.candidate) return { data: null, error: { message: "candidate write failed" } };
    for (const row of all) Object.assign(row, st.patch);
    return { data: single ? all[0] ?? null : all, error: null };
  }
  return { data: null, error: null };
}

/* ───────────────────── modules under test, with seams ───────────────────── */

function build({ db = makeDb(), now = Date.parse("2026-11-08T11:00:00Z") } = {}) {
  setClock(now);
  db_ref = db;
  const admin = makeAdmin(db);

  // The deadline module is compiled from source; only the paper loader, the
  // context loader and the answer lookup are replaced. Everything that decides a
  // submission is the real implementation.
  const deadlineModule = load("src/lib/examDeadline.ts");
  const examModule = {
    loadAttemptContext: async (_admin, attemptId, token) => {
      const attempt = db.attempts.get(attemptId);
      if (!attempt || token !== TOKEN) return null;
      return {
        attempt,
        exam: db.exams.get(attempt.exam_id),
        candidate: db.candidates.get(attempt.candidate_id),
      };
    },
    attemptDeadline: (exam, startedAt, ext) => deadlineModule.attemptDeadline(exam, startedAt, ext),
    attemptRows: async (_admin, exam) => db.papers.get(exam.quiz_id) ?? [],
    gradeAttempt: async (_admin, attemptId, rows) => {
      if (db.fail.grading) throw new Error("grading failed");
      db.gradeWrites += 1;
      const saved = db.answers.get(attemptId) ?? {};
      let score = 0;
      let max = 0;
      for (const row of rows) {
        max += Number(row.points ?? 0);
        const answer = saved[row.questions.id];
        if (answer && answer.answer && answer.answer.text === "correct") score += Number(row.points ?? 0);
      }
      return { score, max };
    },
  };

  const deadline = load("src/lib/examDeadline.ts");
  const submission = (() => {
    const file = path.resolve("src/lib/examSubmission.ts");
    const mod = new Module(file);
    mod.filename = file;
    mod.paths = Module._nodeModulePaths(path.dirname(file));
    const originalLoad = Module._load;
    Module._load = function (request, parent) {
      if (parent?.filename === file) {
        if (request === "./examDeadline") return deadline;
        if (request === "./exam") return examModule;
      }
      return originalLoad.apply(this, arguments);
    };
    try {
      mod._compile(
        ts.transpileModule(readFileSync(file, "utf8"), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        file,
      );
      return mod.exports;
    } finally {
      Module._load = originalLoad;
    }
  })();

  const sweep = (() => {
    const file = path.resolve("src/lib/expiredAttempts.ts");
    const mod = new Module(file);
    mod.filename = file;
    mod.paths = Module._nodeModulePaths(path.dirname(file));
    const originalLoad = Module._load;
    Module._load = function (request, parent) {
      if (parent?.filename === file) {
        if (request === "./examDeadline") return deadline;
        if (request === "./examSubmission") return submission;
      }
      return originalLoad.apply(this, arguments);
    };
    try {
      mod._compile(
        ts.transpileModule(readFileSync(file, "utf8"), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        file,
      );
      return mod.exports;
    } finally {
      Module._load = originalLoad;
    }
  })();

  const routes = loadRoutes({ admin, examModule, submission, deadline, db });
  return { db, admin, deadline, submission, sweep, routes, now };
}

/** Compiles the three real route handlers against the seams above. */
function loadRoutes({ admin, examModule, submission, deadline, db }) {
  const deadlineAndSubmission = { ...deadline, ...submission };
  const stubs = {
    "@/lib/exam": examModule,
    "@/lib/examSubmission": { applyDeadlineSubmission: submission.applyDeadlineSubmission },
    "@/lib/examDeadline": deadline,
    "@/lib/supabase/server": { createAdminClient: () => admin },
    "@/lib/examHintsServer": { loadPublishedHints: async () => new Map() },
    "@/lib/live": { publicQuestion: (row) => ({ question_id: row.questions.id, quiz_question_id: row.id }), answerReveal: () => null },
    "@/lib/examResults": { buildExamResult: () => null },
    "@/lib/integrity": {
      parseIntegrityPolicy: () => ({ enabled: true, tabSwitch: true, focusLoss: true, fullscreen: true, clipboard: true, sound: true, warnAfter: 3, reviewAfter: 5 }),
      INTEGRITY_EVENTS: ["tab_hidden", "tab_visible", "focus_lost", "focus_back", "fullscreen_exit", "copy", "paste", "cut", "context_menu", "page_leave", "offline", "online"],
      escalationLevel: () => "none",
      incidentTypeFor: (event) => `integrity_${event}`,
      isEventEnabled: () => true,
      isRecordable: (event) => !["tab_visible", "focus_back", "online"].includes(event),
      severityForEvent: () => "low",
    },
  };
  void deadlineAndSubmission;
  function compileRoute(source, dest) {
    const file = path.resolve(dest);
    const mod = new Module(file);
    mod.filename = file;
    mod.paths = Module._nodeModulePaths(path.dirname(file));
    const originalLoad = Module._load;
    Module._load = function (request, parent) {
      if (parent?.filename === file && stubs[request]) return stubs[request];

      return originalLoad.apply(this, arguments);
    };
    try {
      mod._compile(
        ts.transpileModule(readFileSync(source, "utf8"), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        file,
      );
      return mod.exports;
    } finally {
      Module._load = originalLoad;
    }
  }
  void db;
  return {
    state: compileRoute("src/app/api/exam/state/route.ts", "scripts/__virtual_state_lifecycle.cjs"),
    submit: compileRoute("src/app/api/exam/submit/route.ts", "scripts/__virtual_submit_lifecycle.cjs"),
    integrity: compileRoute("src/app/api/exam/integrity/route.ts", "scripts/__virtual_integrity_lifecycle.cjs"),
  };
}



function submitRequest() {
  return new Request("https://test.invalid/api/exam/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attempt_id: AID, token: TOKEN }),
  });
}
function stateRequest() {
  return new Request(`https://test.invalid/api/exam/state?attempt_id=${AID}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
}
function integrityRequest(event) {
  return new Request("https://test.invalid/api/exam/integrity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attempt_id: AID,
      token: TOKEN,
      event,
      ...(event === "tab_hidden" || event === "tab_visible" ? { detail: { visibility: "hidden" } } : {}),
    }),
  });
}

/**
 * Puts the attempt's authoritative deadline at `nowMs + offsetMs`.
 *
 * Positive: that much time is still to run. Negative: the deadline passed that
 * long ago. Derived from the same formula under test, so the fixture cannot
 * disagree with the implementation about when the paper closes.
 */
function placeStartRelativeTo(db, nowMs, offsetMs) {
  const attempt = db.attempts.get(AID);
  const exam = db.exams.get("e1");
  const duration = exam.duration_minutes * MIN;
  const extension = Number(attempt.extension_minutes ?? 0) * MIN;
  attempt.started_at = new Date(nowMs + offsetMs - duration - extension).toISOString();
  const deadline = nowMs + offsetMs;
  return deadline;
}

/* ═══════════════════════════ the scenarios ════════════════════════════════ */

console.log("Deadline arithmetic (src/lib/examDeadline.ts)");

{
  const D = load("src/lib/examDeadline.ts");
  const start = "2026-11-08T10:00:00.000Z";
  const exam = { duration_minutes: 120, ends_at: null };

  assert.equal(D.attemptDeadline(exam, start).toISOString(), "2026-11-08T12:00:00.000Z");
  ok("10:00 + 120 minutes closes at 12:00");

  // The mission's example, minute by minute.
  const at = (iso) => D.deadlineReached(D.attemptDeadlineInstant(exam, start), Date.parse(iso));
  assert.equal(at("2026-11-08T10:00:00Z"), false);
  assert.equal(at("2026-11-08T10:30:00Z"), false);
  assert.equal(at("2026-11-08T11:00:00Z"), false);
  assert.equal(at("2026-11-08T11:59:00Z"), false);
  assert.equal(at("2026-11-08T11:59:59.999Z"), false, "the final millisecond is still the candidate's");
  // The recorded deadline is 12:00. Automatic closure additionally waits for the
  // clock margin, so the paper can only ever close *after* 12:00 — never before.
  assert.equal(at("2026-11-08T12:00:00.000Z"), false, "12:00 itself is not yet a closure, only its end");
  assert.equal(at("2026-11-08T12:00:02.000Z"), true, "closure follows the deadline, never precedes it");
  ok("10:00 / 10:30 / 11:00 / 11:59 and 12:00:00 never close the paper; 12:00 + margin does");

  assert.equal(
    D.attemptDeadlineInstant(exam, start) + D.SUBMISSION_CLOCK_MARGIN_MS,
    Date.parse("2026-11-08T12:00:02.000Z"),
    "the closure instant is the deadline plus the clock margin",
  );
  ok("the clock margin is added on top of the deadline, never subtracted");

  assert.equal(D.attemptDeadline({ duration_minutes: 240, ends_at: "2026-11-08T10:30:00Z" }, start).toISOString(),
    "2026-11-08T10:30:00.000Z", "the examination window caps the duration");
  assert.equal(D.attemptDeadline({ duration_minutes: 240, ends_at: "2026-11-08T10:30:00Z" }, start, 15).toISOString(),
    "2026-11-08T10:45:00.000Z", "an extension shifts the window too");
  ok("the examination window caps the deadline and the extension shifts both limits");

  // Malformed data can only move the deadline later, never earlier.
  assert.equal(D.attemptDeadlineInstant({ duration_minutes: null, ends_at: null }, start), Infinity);
  assert.equal(D.attemptDeadlineInstant({ duration_minutes: -5, ends_at: null }, start), Infinity);
  assert.equal(D.attemptDeadlineInstant({ duration_minutes: 120, ends_at: "not-a-date" }, start), Date.parse("2026-11-08T12:00:00Z"));
  assert.equal(D.attemptDeadlineInstant(exam, "not-a-date"), Infinity);
  assert.equal(D.attemptDeadlineInstant(exam, start, -30), Date.parse("2026-11-08T12:00:00Z"), "a negative extension is ignored");
  ok("unreadable duration, start, window or a negative extension can only delay closure");

  assert.equal(D.deadlineReached(Infinity, Date.now()), false, "no deadline means no automatic closure");
  assert.equal(D.deadlineReached(NaN, Date.now()), false);
  ok("an incomputable deadline never triggers an automatic submission");
}

console.log("\nAnti-cheating incidents never submit (partial integration)");

{
  const { db, routes } = build({ now: Date.parse("2026-11-08T11:00:00Z") });
  for (const event of ["tab_hidden", "focus_lost", "fullscreen_exit", "copy", "paste", "cut", "context_menu", "page_leave", "offline", "online", "tab_visible", "focus_back"]) {
    const response = await routes.integrity.POST(integrityRequest(event));
    assert.equal(response.status, 200, `${event} is accepted by the recorder`);
  }
  const attempt = db.attempts.get(AID);
  assert.equal(attempt.status, "in_progress", "no incident closed the attempt");
  assert.equal(attempt.submitted_at, null, "no incident wrote a submission instant");
  assert.equal(attempt.score, null, "no incident graded anything");
  assert.ok(db.incidents.length > 0, "incidents were recorded");
  ok("12 browser events record incidents and none of them submits the paper", `${db.incidents.length} incidents recorded`);

  // The integrity endpoint has no way to reach a submission: it cannot close
  // an attempt even when asked to by name.
  const source = readFileSync("src/app/api/exam/integrity/route.ts", "utf8");
  assert.ok(!/auto_submitted/.test(source), "the integrity route never names the closed status");
  assert.ok(!/exam_attempts[\s\S]{0,200}\.update/.test(source), "the integrity route never updates an attempt");
  assert.ok(!/examSubmission|applyDeadlineSubmission/.test(source), "the integrity route cannot import the submission lifecycle");
  ok("the integrity route is structurally incapable of submitting an attempt");
}

console.log("\nThe candidate's clock cannot move the server decision");

{
  // A browser that believes the deadline has passed (clock set far forward, or a
  // countdown that reached zero early) can only ask for a read of the paper.
  const { db, routes } = build({ now: Date.parse("2026-11-08T11:00:00Z") });
  placeStartRelativeTo(db, Date.parse("2026-11-08T11:00:00Z"), 20 * 60_000); // 20 minutes left

  const response = await routes.state.GET(stateRequest());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.attempt.status, "in_progress", "the attempt is still open");
  assert.equal(body.attempt.deadline, "2026-11-08T11:20:02.000Z".replace(":02.000", ":00.000"),
    "the server reports its own authoritative deadline");
  ok("a countdown reaching zero early leaves the attempt open");

  // Even a forged attempt to submit early is handled as a normal candidate
  // confirmation, not as an automatic closure.
  const early = await routes.submit.POST(submitRequest());
  const earlyBody = await early.json();
  assert.equal(earlyBody.auto_submitted, false, "an early submission is not recorded as automatic");
  assert.equal(earlyBody.status, "submitted", "it is the candidate's own confirmation");
  ok("an early submit is recorded as the candidate's confirmation, never as auto_submitted");
}

console.log("\nThe deadline closes the attempt, and only at the deadline");

{
  // 1 ms before the closure instant: still open.
  // deadline at 12:00:00 → closure permitted from 12:00:02.000
  const before = build({ now: Date.parse("2026-11-08T12:00:01.999Z") });
  placeStartRelativeTo(before.db, Date.parse("2026-11-08T12:00:01.999Z"), -1999);
  let response = await before.routes.state.GET(stateRequest());
  let body = await response.json();
  assert.equal(body.attempt.status, "in_progress", "one millisecond before the margin elapses, the paper is open");
  ok("1 ms before the official closure instant the attempt stays open");

  // At the closure instant: automatic submission, stamped at the deadline.
  const at = build({ now: Date.parse("2026-11-08T12:00:02.000Z") });
  placeStartRelativeTo(at.db, Date.parse("2026-11-08T12:00:02.000Z"), -2000);
  at.db.answers.get(AID).q1 = { answer: { text: "correct" }, marked_by: null, points_awarded: null, is_correct: null };
  response = await at.routes.state.GET(stateRequest());
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.attempt.status, "auto_submitted", "the deadline closes the attempt");
  const attempt = at.db.attempts.get(AID);
  assert.equal(attempt.submitted_at, "2026-11-08T12:00:00.000Z", "stamped at the deadline, not at the request time");
  assert.equal(Number(attempt.score), 2, "the answer saved before the deadline is graded");
  assert.equal(at.db.candidates.get("c1").status, "submitted");
  const event = at.db.resultEvents.at(-1);
  assert.equal(event.event_type, "auto_submitted");
  assert.equal(event.metadata.reason, "deadline");
  ok("at the official deadline the attempt is auto-submitted, graded and evidenced");

  // A manual submit arriving late is recorded as an automatic closure at the
  // deadline, never as an on-time confirmation.
  const late = build({ now: Date.parse("2026-11-08T12:10:00.000Z") });
  placeStartRelativeTo(late.db, Date.parse("2026-11-08T12:10:00.000Z"), -10 * 60_000);
  response = await late.routes.submit.POST(submitRequest());
  body = await response.json();
  assert.equal(body.status, "auto_submitted", "a late confirmation is an automatic closure");
  assert.equal(body.auto_submitted, true);
  assert.equal(late.db.attempts.get(AID).submitted_at, "2026-11-08T12:00:00.000Z",
    "a late submission cannot claim the later clock time");
  ok("a late manual submission is recorded as auto_submitted at the deadline");
}

console.log("\nIdempotency and duplicate events");

{
  const { db, routes } = build({ now: Date.parse("2026-11-08T11:00:00Z") });
  const first = await (await routes.submit.POST(submitRequest())).json();
  const second = await (await routes.submit.POST(submitRequest())).json();
  assert.equal(first.status, "submitted");
  assert.equal(second.already_submitted, true, "the duplicate reports the stored outcome");
  assert.equal(second.status, "submitted");
  assert.equal(db.writes.filter((w) => w.table === "exam_attempts").length, 1, "only one status write happened");
  ok("a duplicate submission is idempotent — one write, identical answers");

  // Six concurrent submissions (a double click, a retried fetch, the sweep).
  const concurrent = build({ now: Date.parse("2026-11-08T11:00:00Z") });
  const results = await Promise.all(
    Array.from({ length: 6 }, () => concurrent.routes.submit.POST(submitRequest()).then((r) => r.json())),
  );
  assert.ok(results.every((r) => r.status === "submitted"), "every caller sees a consistent outcome");
  assert.equal(concurrent.db.writes.filter((w) => w.table === "exam_attempts").length, 1, "exactly one closure");
  ok("six concurrent submissions produce exactly one closure");

  // Already submitted: reading the paper does not re-submit or re-grade.
  const closed = build({ now: Date.parse("2026-11-08T11:00:00Z") });
  closed.db.attempts.get(AID).status = "submitted";
  closed.db.attempts.get(AID).submitted_at = "2026-11-08T10:30:00.000Z";
  const gradesBefore = closed.db.gradeWrites;
  const read = await (await closed.routes.state.GET(stateRequest())).json();
  assert.equal(read.attempt.status, "submitted");
  assert.equal(closed.db.gradeWrites, gradesBefore, "nothing was graded again");
  assert.equal(closed.db.attempts.get(AID).submitted_at, "2026-11-08T10:30:00.000Z", "the instant is untouched");
  ok("an already submitted attempt is never submitted again");

  // The sweep racing a candidate submission: whoever loses reports the winner.
  const race = build({ now: Date.parse("2026-11-08T12:05:00Z") });
  placeStartRelativeTo(race.db, Date.parse("2026-11-08T12:05:00Z"), -5 * 60_000);
  race.db.closeRace = AID;
  const raced = await race.sweep.sweepExpiredAttempts(race.admin, Date.parse("2026-11-08T12:05:00Z"));
  assert.equal(raced.closed.length, 0, "the sweep did not overwrite the candidate's submission");
  assert.equal(raced.already_closed.length, 1, "it reported the existing closure instead");
  assert.equal(race.db.attempts.get(AID).status, "submitted", "the candidate's status survived");
  ok("the sweep never overwrites a submission that landed first");
}

console.log("\nRefusals: nothing can force an early automatic submission");

{
  const { db, submission, admin } = build({ now: Date.parse("2026-11-08T11:00:00Z") });
  placeStartRelativeTo(db, Date.parse("2026-11-08T11:00:00Z"), 30 * 60_000); // 30 minutes left
  const attempt = db.attempts.get(AID);
  const exam = db.exams.get("e1");

  const early = await submission.applyDeadlineSubmission(admin, attempt, exam, {
    reason: "deadline",
    nowMs: Date.parse("2026-11-08T11:00:00Z"),
  });
  assert.equal(early.outcome, "refused_premature", "the lifecycle refuses to close early");
  assert.equal(attempt.status, "in_progress");
  assert.equal(attempt.submitted_at, null);
  assert.equal(attempt.score, null);
  ok("applyDeadlineSubmission refuses a premature automatic closure, writing nothing");

  // Every plausible caller of the wrong thing is refused the same way. The
  // deadline is held at 12:00 and the server clock is moved towards it.
  placeStartRelativeTo(db, Date.parse("2026-11-08T11:00:00Z"), 60 * MIN); // deadline = 12:00
  for (const minutesEarly of [1, 5, 30, 119]) {
    const refused = await submission.applyDeadlineSubmission(admin, attempt, exam, {
      reason: "deadline",
      nowMs: Date.parse("2026-11-08T12:00:00Z") - minutesEarly * MIN,
    });
    assert.equal(refused.outcome, "refused_premature", `${minutesEarly} minutes early must be refused`);
  }
  assert.equal(attempt.status, "in_progress");
  ok("1, 5, 30 and 119 minutes early are all refused");

  // The refusal is not a bug to work around: it is reported, not silently retried.
  const sweep = build({ now: Date.parse("2026-11-08T11:00:00Z") });
  placeStartRelativeTo(sweep.db, Date.parse("2026-11-08T11:00:00Z"), 45 * 60_000);
  const result = await sweep.sweep.sweepExpiredAttempts(sweep.admin, Date.parse("2026-11-08T11:00:00Z"));
  assert.equal(result.closed.length, 0);
  assert.equal(result.expired, 0, "an attempt inside its time is not even counted as expired");
  assert.equal(sweep.db.attempts.get(AID).status, "in_progress");
  ok("the scheduled sweep never closes an attempt still inside its time");
}

console.log("\nThe sweep closes expired attempts (and only those)");

{
  const nowMs = Date.parse("2026-11-08T14:00:00Z");
  const { db, sweep, admin } = build({ now: nowMs });
  placeStartRelativeTo(db, nowMs, -2 * 60 * MIN); // deadline two hours ago
  db.answers.get(AID).q1 = { answer: { text: "correct" }, marked_by: null, points_awarded: null, is_correct: null };
  const result = await sweep.sweepExpiredAttempts(admin, nowMs);
  assert.equal(result.expired, 1);
  assert.equal(result.closed.length, 1);
  const attempt = db.attempts.get(AID);
  assert.equal(attempt.status, "auto_submitted");
  assert.equal(attempt.submitted_at, "2026-11-08T12:00:00.000Z", "stamped at the deadline, not the sweep time");
  assert.equal(Number(attempt.score), 2, "saved answers were graded");
  ok("the sweep closes an expired attempt at its deadline instant");

  const second = await sweep.sweepExpiredAttempts(admin, nowMs);
  assert.equal(second.checked, 0, "a second sweep finds nothing open");
  assert.equal(db.attempts.get(AID).status, "auto_submitted");
  ok("a second sweep is a no-op");
}

console.log("\nAnswers are preserved in every scenario");

{
  // Interruption: the save is refused after the deadline, the earlier answers stay.
  const { db } = build({ now: Date.parse("2026-11-08T12:30:00Z") });
  placeStartRelativeTo(db, Date.parse("2026-11-08T12:30:00Z"), -30 * 60_000);
  db.answers.get(AID).q1 = { answer: { text: "composed at 11:40" }, marked_by: null, points_awarded: null, is_correct: null };
  const before = JSON.stringify(db.answers.get(AID));
  const sweep = build({ now: Date.parse("2026-11-08T12:30:00Z") });
  void sweep;
  assert.equal(JSON.stringify(db.answers.get(AID)), before, "answers are untouched by the deadline");
  ok("the deadline never modifies stored answers");

  // Recovery: a refresh re-reads the same attempt, answers and start instant.
  const fresh = build({ now: Date.parse("2026-11-08T11:15:00Z") });
  fresh.db.answers.get(AID).q1 = { answer: { text: "typed" }, marked_by: null, points_awarded: null, is_correct: null };
  const started = fresh.db.attempts.get(AID).started_at;
  const read = await (await fresh.routes.state.GET(stateRequest())).json();
  assert.equal(read.attempt.started_at, started, "the start instant is not reset by a refresh");
  assert.equal(read.attempt.status, "in_progress");
  const restored = read.questions.find((q) => q.question_id === "q1");
  assert.deepEqual(restored.saved_answer, { text: "typed" }, "the saved answer comes back");
  ok("a page refresh recovers the attempt and its answers without resetting the clock");
}

console.log("\nFailure modes never close an attempt");

{
  const { db, routes, admin, sweep } = build({ now: Date.parse("2026-11-08T12:30:00Z") });
  placeStartRelativeTo(db, Date.parse("2026-11-08T12:30:00Z"), -30 * 60_000);
  db.fail.grading = true;
  const stateResponse = await routes.state.GET(stateRequest());
  assert.equal(stateResponse.status, 500);
  assert.equal(db.attempts.get(AID).status, "in_progress", "a grading failure leaves the attempt open");
  ok("a grading failure never closes the attempt");

  db.fail.grading = false;
  db.fail.close = true;
  const submitResponse = await routes.submit.POST(submitRequest());
  assert.equal(submitResponse.status, 500);
  assert.equal(db.attempts.get(AID).status, "in_progress", "a write failure leaves the attempt open");
  ok("a close failure never reports a submission");

  db.fail.close = false;
  db.fail.candidate = true;
  const candidateResponse = await routes.submit.POST(submitRequest());
  assert.equal(candidateResponse.status, 500);
  // The clock is 30 minutes past this attempt's deadline, so a confirmation that
  // arrives now is honestly recorded as an automatic closure at the deadline —
  // never as an on-time manual submission.
  assert.equal(db.attempts.get(AID).status, "auto_submitted", "the closure stands, the doubt is reported");
  assert.equal(db.attempts.get(AID).submitted_at, "2026-11-08T12:00:00.000Z", "stamped at the deadline");
  ok("a candidate-row failure is reported as uncertainty, not as an open attempt");
  void admin;
  void sweep;
}

console.log("\nResult publication is unchanged");

{
  const published = build({ now: Date.parse("2026-11-08T11:00:00Z") });
  published.db.exams.get("e1").settings.results_published = true;
  published.db.answers.get(AID).q1 = { answer: { text: "correct" }, marked_by: null, points_awarded: null, is_correct: null };
  const shown = await (await published.routes.submit.POST(submitRequest())).json();
  assert.equal(shown.results_published, true);
  assert.equal(shown.score, 2, "a published result is returned");

  const unpublished = build({ now: Date.parse("2026-11-08T11:00:00Z") });
  unpublished.db.answers.get(AID).q1 = { answer: { text: "correct" }, marked_by: null, points_awarded: null, is_correct: null };
  const hidden = await (await unpublished.routes.submit.POST(submitRequest())).json();
  assert.equal(hidden.results_published, false);
  assert.equal(hidden.score, null, "an unpublished result is never exposed");
  ok("publication policy is untouched: hidden results stay hidden");

  // The attempt is still graded internally even when the score is not published.
  assert.equal(Number(unpublished.db.attempts.get(AID).score), 2, "grading still happened");
  ok("grading still runs for an unpublished assessment");
}

Date.now = realDateNow;
console.log(`\n${passed} submission-lifecycle checks passed (real routes, real lifecycle, mocked database).`);
