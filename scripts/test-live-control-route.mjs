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
let competitionRow = null;
let rosterRows = [];
let answerRows = [];
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
        in() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        maybeSingle() {
          // Respect the id filter: a lookup by a competition/public id must not
          // accidentally return the session row.
          const idFilter = context.filters.find(([key]) => key === "id")?.[1];
          if (table === "quiz_sessions") {
            if (context.patch) return Promise.resolve({ data: updateApplies ? { id: SESSION_ID } : null, error: null });
            const match = !idFilter || idFilter === SESSION_ID;
            return Promise.resolve({ data: match ? sessionRow : null, error: null });
          }
          if (table === "competitions") {
            const match = competitionRow && (!idFilter || idFilter === competitionRow.id);
            return Promise.resolve({ data: match ? competitionRow : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          return this.maybeSingle();
        },
        then(resolve) {
          if (table === "session_participants") return Promise.resolve({ data: rosterRows, error: null }).then(resolve);
          if (table === "participant_answers") return Promise.resolve({ data: answerRows, error: null }).then(resolve);
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

const liveLibStub = {
  isParticipantConnected: (lastSeenAt) => Boolean(lastSeenAt) && Date.now() - new Date(lastSeenAt).getTime() <= 10_000,
};

const route = compile("src/app/api/live/control/route.ts", "scripts/__live_control_route.cjs", {
  "@/lib/live": liveLibStub,
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
  competitionRow = null;
  rosterRows = [];
  answerRows = [];
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
  assert.equal(res.body.signed_in, false);
  assert.equal(res.body.reason, "signed_out");
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
  assert.equal(state.body.signed_in, true);
  assert.equal(state.body.reason, "not_organizer");
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

/* ── Competition-addressed screens (regression guard) ──────────────────── */
//
// The projected page is addressed by `/live/<id>/screen`, where <id> is the
// competition for competition-linked sessions. The control endpoint used to
// look that id up as a quiz session, answer "not found", and silently hide the
// entire organizer toolbar. These checks pin the resolution in place.

const COMPETITION_ID = "66666666-6666-4666-8666-666666666666";
const UNKNOWN_ID = "77777777-7777-4777-8777-777777777777";

await checkAsync("a screen addressed by its competition resolves the live session", async () => {
  reset();
  competitionRow = { id: COMPETITION_ID, session_id: SESSION_ID };
  const res = await get(COMPETITION_ID);
  assert.equal(res.status, 200);
  assert.equal(res.body.authorized, true, "the organizer must be authorized on a competition-addressed screen");
  assert.equal(res.body.signed_in, true);
  assert.equal(res.body.session_id, SESSION_ID);
  assert.equal(res.body.state.question_count, 3);
  assert.ok(res.body.commands.includes("start"));
  assert.ok(res.body.commands.includes("next"));
  assert.ok(res.body.commands.includes("prev"));
  assert.ok(res.body.commands.includes("pause"));
  assert.ok(res.body.commands.includes("resume"));
  assert.ok(res.body.commands.includes("close_join"));
  assert.ok(res.body.commands.includes("end"));
  assert.ok(res.body.commands.includes("reveal_answer"));
  assert.ok(res.body.commands.includes("hide_answer"));
});

await checkAsync("host commands from a competition-addressed screen hit the session exactly once", async () => {
  reset({ status: "lobby", phase: "waiting", current_question_index: -1 });
  competitionRow = { id: COMPETITION_ID, session_id: SESSION_ID };
  const started = await post({ session_id: COMPETITION_ID, command: "start" });
  assert.equal(started.status, 200);
  assert.equal(started.body.session_id, SESSION_ID);
  assert.equal(audits.filter((action) => action === "live.command.start").length, 1);

  reset({ current_question_index: 0, phase: "question" });
  competitionRow = { id: COMPETITION_ID, session_id: SESSION_ID };
  const next = await post({ session_id: COMPETITION_ID, command: "next" });
  assert.equal(next.status, 200);
  assert.equal(snapshots.length, 1, "closing question 1 stores exactly one ranking snapshot");
  assert.equal(snapshots[0].questionIndex, 0);
});

await checkAsync("an unknown public id is refused instead of silently hiding the controls", async () => {
  reset();
  competitionRow = null;
  const state = await get(UNKNOWN_ID);
  assert.equal(state.status, 200);
  assert.equal(state.body.authorized, false);
  assert.equal(state.body.signed_in, true);
  assert.equal(state.body.reason, "unknown_session");
  const command = await post({ session_id: UNKNOWN_ID, command: "next" });
  assert.equal(command.status, 404);
  assert.equal(snapshots.length, 0);
});

await checkAsync("a competition without a live session cannot be commanded", async () => {
  reset();
  competitionRow = { id: COMPETITION_ID, session_id: null };
  const state = await get(COMPETITION_ID);
  assert.equal(state.body.authorized, false);
  const command = await post({ session_id: COMPETITION_ID, command: "start" });
  assert.equal(command.status, 404);
});

await checkAsync("a student holding the competition screen link still cannot command it", async () => {
  reset({ host_id: "99999999-9999-4999-8999-999999999999" });
  competitionRow = { id: COMPETITION_ID, session_id: SESSION_ID };
  canResult = false;
  const state = await get(COMPETITION_ID);
  assert.equal(state.body.authorized, false);
  for (const command of ["start", "next", "prev", "pause", "resume", "close_join", "open_join", "reveal_answer", "hide_answer", "end"]) {
    const res = await post({ session_id: COMPETITION_ID, command });
    assert.equal(res.status, 403, `${command} must be refused for a student`);
  }
  assert.equal(snapshots.length, 0);
  assert.equal(audits.length, 0);
});

await checkAsync("the organizer roster reports presence, approval state and submissions", async () => {
  reset({ current_question_index: 0, phase: "question" });
  competitionRow = { id: COMPETITION_ID, session_id: SESSION_ID };
  rosterRows = [
    {
      id: "p1",
      display_name: "Ada",
      avatar_key: "owl",
      status: "admitted",
      last_seen_at: new Date().toISOString(),
      reconnect_count: 1,
      joined_at: "2026-11-10T10:00:00.000Z",
    },
    {
      id: "p2",
      display_name: "Bilal",
      avatar_key: "fox",
      status: "pending",
      last_seen_at: "2026-11-10T09:00:00.000Z",
      reconnect_count: 0,
      joined_at: "2026-11-10T10:00:05.000Z",
    },
  ];
  answerRows = [{ participant_id: "p1" }];
  const res = await get(COMPETITION_ID);
  assert.equal(res.body.participants.length, 2);
  const [ada, bilal] = res.body.participants;
  assert.equal(ada.connected, true);
  assert.equal(ada.answered, true);
  assert.equal(ada.reconnect_count, 1);
  assert.equal(bilal.connected, false, "a participant seen long ago is shown as disconnected");
  assert.equal(bilal.answered, false);
  assert.equal(bilal.status, "waiting", "pending approvals are labelled waiting, as on the projection");
});

await checkAsync("a signed-in non-organizer is told apart from a signed-out viewer", async () => {
  // The screen uses this to explain a missing toolbar only on host links; it is
  // not authorization and it never reveals who the organizer is.
  reset();
  authContext = null;
  const anonymous = await get();
  assert.equal(anonymous.body.reason, "signed_out");

  reset({ host_id: "99999999-9999-4999-8999-999999999999" });
  canResult = false;
  const outsider = await get();
  assert.equal(outsider.body.reason, "not_organizer");
  assert.equal(outsider.body.signed_in, true);
  assert.equal(outsider.body.authorized, false);
});

await checkAsync("an inactive account is reported without authorizing it", async () => {
  reset();
  authContext = { user: { id: HOST_ID }, profile: { status: "suspended", platform_role: "user" }, memberships: [] };
  const res = await get();
  assert.equal(res.body.authorized, false);
  assert.equal(res.body.signed_in, true);
  assert.equal(res.body.reason, "inactive_account");
});

console.log(`\n${checks} checks passed`);
