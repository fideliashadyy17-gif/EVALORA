// The organizer control endpoint with a mocked database and session.
//
// Proves the backend — not the browser — decides who may command a live
// competition: a signed-out visitor, a signed-in user without organizer rights
// and a double click are all rejected, while the authorized organizer's
// command is applied once, snapshotted once and never duplicated.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
};
const checkAsync = async (name, fn) => {
  await fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
};

function compile(source, dest, stubs = {}) {
  const file = path.resolve(dest);
  const mod = new Module(file);
  const original = Module._load;
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  Module._load = function (request, parent) {
    if (parent?.filename === file && request in stubs) return stubs[request];
    return original.apply(this, arguments);
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
    Module._load = original;
  }
}

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const HOST_ID = "33333333-3333-4333-8333-333333333333";

const engine = compile("src/lib/liveControl.ts", "scripts/__live_control_engine.cjs");
const ranking = compile("src/lib/liveRanking.ts", "scripts/__live_control_ranking.cjs", { "./liveControl": engine });

/* ── Mocked collaborators ─────────────────────────────────────────────── */
let authContext = null;
let canResult = false;
let sessionRow = null;
let updateApplies = true;
const snapshots = [];
const nextRounds = [];
const audits = [];

const serverStub = {
  loadControlTiming: async () => ({ questionCount: 3, durationFor: () => 20, quizSettings: {}, rows: [{ id: "qq-1" }, { id: "qq-2" }, { id: "qq-3" }] }),
  saveRankingSnapshot: async (_admin, input) => {
    snapshots.push(input);
    return { ok: true, entries: [] };
  },
  createNextRoundSession: async () => {
    nextRounds.push(1);
    return { ok: true, sessionId: "44444444-4444-4444-8444-444444444444" };
  },
  stageOf: (session) => engine.parsePresentationStage(session.presentation_stage),
};

const adminStub = {
  createAdminClient: () => ({
    from(table) {
      const context = { table, filters: [] };
      const api = {
        select() {
          return api;
        },
        update(patch) {
          context.patch = patch;
          return api;
        },
        eq(key, value) {
          context.filters.push([key, value]);
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        maybeSingle() {
          if (table === "quiz_sessions") {
            if (!context.patch) return Promise.resolve({ data: sessionRow, error: null });
            return Promise.resolve({ data: updateApplies ? { id: SESSION_ID } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          return this.maybeSingle();
        },
        then(resolve) {
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return api;
    },
  }),
};

const authStub = {
  CREATOR_ROLES: ["owner", "admin", "teacher", "organizer"],
  getSessionContext: async () => authContext,
  can: () => canResult,
};

const adminLibStub = {
  audit: async (_ctx, action) => {
    audits.push(action);
  },
};

const nextServerStub = {
  NextResponse: {
    json: (body, options) => ({ status: options?.status ?? 200, body }),
  },
};

const route = compile("src/app/api/live/control/route.ts", "scripts/__live_control_route.cjs", {
  "@/lib/liveControl": engine,
  "@/lib/liveRanking": ranking,
  "@/lib/liveControlServer": serverStub,
  "@/lib/supabase/server": adminStub,
  "@/lib/auth": authStub,
  "@/lib/admin": adminLibStub,
  "next/server": nextServerStub,
});

const post = (body) => route.POST({ json: async () => body });
const get = (sessionId = SESSION_ID) =>
  route.GET({ url: `https://evalora.test/api/live/control?session_id=${sessionId}` });

function reset(overrides = {}) {
  authContext = { user: { id: HOST_ID }, profile: { status: "active", platform_role: "user" }, memberships: [] };
  canResult = false;
  updateApplies = true;
  snapshots.length = 0;
  nextRounds.length = 0;
  audits.length = 0;
  sessionRow = {
    id: SESSION_ID,
    quiz_id: "55555555-5555-4555-8555-555555555555",
    organization_id: ORG_ID,
    host_id: HOST_ID,
    join_code: "ABC123",
    status: "live",
    phase: "question",
    mode: "synchronized",
    current_question_index: 0,
    question_started_at: "2026-11-10T10:00:00.000Z",
    question_deadline_at: "2026-11-10T10:00:20.000Z",
    answer_locked: false,
    admission_open: true,
    presentation_stage: "idle",
    paused_total_ms: 0,
    settings: {},
    ...overrides,
  };
}

/* ── Authorization ────────────────────────────────────────────────────── */
await checkAsync("a signed-out visitor cannot read the organizer state", async () => {
  reset();
  authContext = null;
  const res = await get();
  assert.equal(res.status, 200);
  assert.equal(res.body.authorized, false);
});

await checkAsync("a signed-out visitor cannot command a live competition", async () => {
  reset();
  authContext = null;
  const res = await post({ session_id: SESSION_ID, command: "next" });
  assert.equal(res.status, 401);
  assert.equal(snapshots.length, 0);
});

await checkAsync("a signed-in user without organizer rights is refused by the backend", async () => {
  reset({ host_id: "99999999-9999-4999-8999-999999999999" });
  canResult = false;
  const state = await get();
  assert.equal(state.body.authorized, false);
  const res = await post({ session_id: SESSION_ID, command: "next" });
  assert.equal(res.status, 403);
  assert.equal(snapshots.length, 0);
});

await checkAsync("a participant token cannot impersonate the organizer", async () => {
  reset({ host_id: "99999999-9999-4999-8999-999999999999" });
  authContext = { user: { id: "participant" }, profile: { status: "active", platform_role: "user" }, memberships: [] };
  const res = await post({ session_id: SESSION_ID, command: "reveal_results" });
  assert.equal(res.status, 403);
});

await checkAsync("the session host is authorized even without an org role", async () => {
  reset();
  canResult = false;
  const state = await get();
  assert.equal(state.body.authorized, true);
  assert.equal(state.body.state.question_count, 3);
});

await checkAsync("a Super Admin is authorized on any tenant's session", async () => {
  reset({ host_id: "99999999-9999-4999-8999-999999999999" });
  authContext = { user: { id: "admin" }, profile: { status: "active", platform_role: "super_admin" }, memberships: [] };
  canResult = true;
  const state = await get();
  assert.equal(state.body.authorized, true);
  const res = await post({ session_id: SESSION_ID, command: "pause" });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

/* ── Command handling ─────────────────────────────────────────────────── */
await checkAsync("only known commands are accepted", async () => {
  reset();
  const res = await post({ session_id: SESSION_ID, command: "auto_win" });
  assert.equal(res.status, 400);
});

await checkAsync("an invalid session id is rejected", async () => {
  reset();
  const res = await post({ session_id: "session", command: "next" });
  assert.equal(res.status, 400);
});

await checkAsync("advancing a question stores one ranking snapshot", async () => {
  reset();
  const res = await post({ session_id: SESSION_ID, command: "next" });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].questionIndex, 0);
  assert.equal(snapshots[0].isFinal, false);
  assert.equal(audits[0], "live.command.next");
});

await checkAsync("a double click cannot produce a second transition or snapshot", async () => {
  reset();
  updateApplies = false; // the compare-and-set no longer matches
  const res = await post({ session_id: SESSION_ID, command: "next" });
  assert.equal(res.status, 200);
  assert.equal(res.body.duplicate, true);
  assert.equal(snapshots.length, 0);
});

await checkAsync("results cannot be revealed while the competition is running", async () => {
  reset();
  const res = await post({ session_id: SESSION_ID, command: "reveal_results" });
  assert.equal(res.status, 409);
  assert.equal(snapshots.length, 0);
});

await checkAsync("the final reveal recalculates the final standing from scores", async () => {
  reset({ status: "ended", phase: "completed", current_question_index: 2, presentation_stage: "final_pending" });
  const res = await post({ session_id: SESSION_ID, command: "reveal_results" });
  assert.equal(res.status, 200);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].questionIndex, 2);
  assert.equal(snapshots[0].isFinal, true);
  assert.equal(snapshots[0].recompute, true);
});

await checkAsync("finishing the presentation opens exactly one new round", async () => {
  reset({ status: "ended", phase: "podium", current_question_index: 2, presentation_stage: "board" });
  const first = await post({ session_id: SESSION_ID, command: "finish" });
  assert.equal(first.status, 200);
  assert.equal(nextRounds.length, 1);
  // A second click is rejected by the compare-and-set on the reveal stage.
  updateApplies = false;
  const second = await post({ session_id: SESSION_ID, command: "finish" });
  assert.equal(second.body.duplicate, true);
  assert.equal(nextRounds.length, 1);
});

await checkAsync("a refused command leaves the room untouched", async () => {
  reset({ status: "lobby", phase: "waiting", current_question_index: -1 });
  const res = await post({ session_id: SESSION_ID, command: "prev" });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /first question|has not started/i);
  assert.equal(snapshots.length, 0);
});

console.log(`\n${checks} checks passed`);
