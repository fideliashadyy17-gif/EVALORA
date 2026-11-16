/**
 * Competition rounds: opening the NEXT round without losing the last one.
 *
 * A round is never a reset. The finished session keeps its participants,
 * answers, scores, snapshots and champion; the new round is a brand-new
 * session in its own waiting room with its own join code. This suite drives the
 * real `createNextRoundSession` against a fake database, then checks that the
 * Super Admin action which exposes it applies the same lifecycle cascade as
 * `setCompetitionStatus` and refuses every state where a new round would
 * discard live work.
 *
 * Run: node scripts/test-competition-next-round.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

let checks = 0;
const check = (name, fn) => {
  const condition = typeof fn === "function" ? fn() : fn;
  assert.ok(condition, name);
  checks += 1;
  console.log(`  \u2713 ${name}`);
};
const checkAsync = async (name, fn) => { await fn(); checks += 1; console.log(`  ✓ ${name}`); };

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

const NEW_SESSION_ID = "44444444-4444-4444-8444-444444444444";
const engine = compile("src/lib/liveControl.ts", "scripts/__next_round_engine.cjs");
const server = compile("src/lib/liveControlServer.ts", "scripts/__next_round_server.cjs", {
  "./live": { loadQuizQuestions: async () => [], rankedParticipants: async () => [] },
  "./liveRanking": { parseRankingEntries: () => [], snapshotFromRanked: () => [], historyPoints: () => [] },
  "./liveControl": { parsePresentationStage: engine.parsePresentationStage },
  "./utils": compile("src/lib/utils.ts", "scripts/__next_round_utils.cjs"),
});

/**
 * Fake PostgREST client. Only the tables the round transition touches are
 * modelled; anything else would fail the test loudly rather than silently.
 */
function fakeAdmin({ competition = null, phaseClass = null } = {}) {
  const log = { inserted: [], updates: [], joinCodeLookups: [] };
  let joinCodeIsFree = true;
  const api = (table) => {
    const ctx = {};
    const chain = {
      select() { return chain; },
      insert(row) { ctx.row = row; return chain; },
      update(patch) { ctx.patch = patch; return chain; },
      eq(key, value) { ctx.filters = { ...(ctx.filters ?? {}), [key]: value }; return chain; },
      single() {
        if (table === "quiz_sessions" && ctx.row) {
          log.inserted.push(ctx.row);
          return Promise.resolve({ data: { id: NEW_SESSION_ID }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle() {
        if (table === "quiz_sessions") {
          log.joinCodeLookups.push(ctx.filters?.join_code ?? null);
          return Promise.resolve({ data: joinCodeIsFree ? null : { id: "taken" }, error: null });
        }
        if (table === "competitions") {
          const match = competition && (!ctx.filters?.session_id || ctx.filters.session_id === competition.session_id);
          return Promise.resolve({ data: match ? { id: competition.id } : null, error: null });
        }
        if (table === "competition_phase_classes") {
          const match = phaseClass && (!ctx.filters?.competition_id || ctx.filters.competition_id === phaseClass.competition_id);
          return Promise.resolve({ data: match ? { id: phaseClass.id } : null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    // Capture updates: the chain resolves when awaited (update().eq() is a thenable here).
    chain.then = (onOk) => {
      if (ctx.patch) log.updates.push({ table, patch: ctx.patch, filters: ctx.filters ?? {} });
      return Promise.resolve({ data: { id: "ok" }, error: null }).then(onOk);
    };
    return chain;
  };
  return {
    admin: { from: api },
    log,
    setJoinCodeTaken(v) { joinCodeIsFree = !v; },
  };
}

const finishedSession = {
  id: "11111111-1111-4111-8111-111111111111",
  quiz_id: "55555555-5555-4555-8555-555555555555",
  organization_id: "22222222-2222-4222-8222-222222222222",
  host_id: "33333333-3333-4333-8333-333333333333",
  title: "National Maths Bowl",
  mode: "synchronized",
  session_round: 2,
  settings: { require_approval: false, pause_snapshot: { at: "2026-11-10T10:00:00Z" }, showLeaderboard: true },
};

/* ── The new session is a clean round, not a reset ──────────────────── */
await checkAsync("a new round is inserted as a new session row, never an update of the old one", async () => {
  const { admin, log } = fakeAdmin();
  const result = await server.createNextRoundSession(admin, finishedSession);
  assert.equal(result.ok, true);
  assert.equal(result.sessionId, NEW_SESSION_ID);
  assert.equal(log.inserted.length, 1);
  assert.equal(log.updates.filter((u) => u.table === "quiz_sessions").length, 0);
});

await checkAsync("the new round starts in its own waiting room, not mid-question", async () => {
  const { admin, log } = fakeAdmin();
  await server.createNextRoundSession(admin, finishedSession);
  const row = log.inserted[0];
  assert.equal(row.status, "lobby");
  assert.equal(row.phase, "waiting");
  assert.equal(row.current_question_index, -1);
  assert.equal(row.question_started_at, null);
  assert.equal(row.question_deadline_at, null);
  assert.equal(row.answer_locked, false);
  assert.equal(row.presentation_stage, "idle");
  assert.equal(row.paused_total_ms, 0);
  assert.equal(row.admission_open, true);
});

await checkAsync("the round number advances and the finished round is chained to it", async () => {
  const { admin, log } = fakeAdmin();
  await server.createNextRoundSession(admin, finishedSession);
  assert.equal(log.inserted[0].session_round, 3);
  assert.equal(log.inserted[0].previous_session_id, finishedSession.id);
});

await checkAsync("a round always starts at round 2 when the previous round number is missing", async () => {
  const { admin, log } = fakeAdmin();
  await server.createNextRoundSession(admin, { ...finishedSession, session_round: null });
  assert.equal(log.inserted[0].session_round, 2);
});

await checkAsync("the new round keeps the quiz, organization, host, title and mode", async () => {
  const { admin, log } = fakeAdmin();
  await server.createNextRoundSession(admin, finishedSession);
  const row = log.inserted[0];
  assert.equal(row.quiz_id, finishedSession.quiz_id);
  assert.equal(row.organization_id, finishedSession.organization_id);
  assert.equal(row.host_id, finishedSession.host_id);
  assert.equal(row.title, "National Maths Bowl");
  assert.equal(row.mode, "synchronized");
});

await checkAsync("a self-paced competition stays self-paced into the next round", async () => {
  const { admin, log } = fakeAdmin();
  await server.createNextRoundSession(admin, { ...finishedSession, mode: "self_paced" });
  assert.equal(log.inserted[0].mode, "self_paced");
});

await checkAsync("an unreadable mode falls back to synchronized, never to a NULL mode", async () => {
  const { admin, log } = fakeAdmin();
  await server.createNextRoundSession(admin, { ...finishedSession, mode: null });
  assert.equal(log.inserted[0].mode, "synchronized");
});

await checkAsync("a frozen pause is never carried into the new round", async () => {
  const { admin, log } = fakeAdmin();
  await server.createNextRoundSession(admin, finishedSession);
  assert.equal("pause_snapshot" in (log.inserted[0].settings ?? {}), false,
    "pause_snapshot must not leak into the new round");
  assert.equal(log.inserted[0].settings.require_approval, false, "other settings are preserved");
});

await checkAsync("a plain competition follows the new round and returns to live", async () => {
  const { admin, log } = fakeAdmin({
    competition: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", session_id: finishedSession.id },
  });
  await server.createNextRoundSession(admin, finishedSession);
  const patch = log.updates.find((u) => u.table === "competitions");
  assert.ok(patch, "the competition is relinked");
  assert.equal(patch.patch.session_id, NEW_SESSION_ID);
  assert.equal(patch.patch.status, "live");
  assert.equal(patch.filters.id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
});

await checkAsync("a multi-phase competition keeps its own phase linkage", async () => {
  const { admin, log } = fakeAdmin({
    competition: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", session_id: finishedSession.id },
    phaseClass: { id: "pppppppp-pppp-4ppp-8ppp-pppppppppppp", competition_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
  });
  await server.createNextRoundSession(admin, finishedSession);
  assert.equal(log.updates.filter((u) => u.table === "competitions").length, 0);
});

await checkAsync("a session with no competition is still given a clean round", async () => {
  const { admin, log } = fakeAdmin();
  const result = await server.createNextRoundSession(admin, finishedSession);
  assert.equal(result.ok, true);
  assert.equal(log.updates.length, 0);
});

await checkAsync("a join-code collision is retried rather than written twice", async () => {
  const { admin, log, setJoinCodeTaken } = fakeAdmin();
  setJoinCodeTaken(true);
  const result = await server.createNextRoundSession(admin, finishedSession);
  assert.equal(result.ok, false, "six retries all collide, so it reports failure");
  assert.equal(log.inserted.length, 0, "nothing is written with a taken code");
});

/* ── The Super Admin action that exposes it ─────────────────────────── */
const actions = readFileSync("src/app/admin/actions/competitions.ts", "utf8");
const page = readFileSync("src/app/admin/competitions/[id]/page.tsx", "utf8");

check("the action reuses the round transition instead of re-implementing it",
  /import \{ createNextRoundSession \} from "@\/lib\/liveControlServer"/.test(actions));

check("the action is Super Admin only",
  /export async function startNextCompetitionRound\([\s\S]{0,200}?requireSuperAdmin\(\)/.test(actions));

check("a cancelled or archived competition cannot open another round",
  /\["cancelled", "archived"\]\.includes\(String\(comp!\.status\)\)/.test(actions)
  && /e=round_cancelled/.test(actions));

check("an unfinished round is never silently ended to make room for the next",
  /session!\.status !== "ended"/.test(actions)
  && /e=round_not_ended/.test(actions));

check("a competition with no session is refused rather than given a stray round",
  /e=round_no_session/.test(actions)
  && (actions.match(/e=round_no_session/g) ?? []).length >= 2);

check("a failed creation is reported, never treated as success",
  /if \(!created\.ok\) redirect\(`\/admin\/competitions\/\$\{id\}\?e=round_failed`\)/.test(actions));

check("the cascade mirrors setCompetitionStatus: the competition follows the new session",
  /from\("competitions"\)\s*\.update\(\{ session_id: created\.sessionId, status: "live", updated_at: new Date\(\)\.toISOString\(\) \}\)/.test(actions));

check("a multi-phase competition's phase linkage follows the new round too",
  /from\("competition_phase_classes"\)\s*\.update\(\{ session_id: created\.sessionId \}\)/.test(actions));

check("the transition is audited with both session ids and the new round number",
  /audit\(ctx, "competition\.next_round"/.test(actions)
  && /from_session_id: session!\.id/.test(actions)
  && /to_session_id: created\.sessionId/.test(actions)
  && /round: Math\.max\(1, Number\(session!\.session_round \?\? 1\)\) \+ 1/.test(actions));

check("the control room offers the next round only once the current one has finished",
  /monitor\.session\.status === "ended"/.test(page)
  && /action=\{startNextCompetitionRound\}/.test(page)
  && /!\["cancelled", "archived"\]\.includes\(comp\.status\)/.test(page));

check("the control room shows which round is running and names the next one",
  /Round \{Math\.max\(1, Number\(monitor\.session\.session_round \?\? 1\)\)\}/.test(page)
  && /Open round \{Math\.max\(1, Number\(monitor\.session\.session_round \?\? 1\)\) \+ 1\}/.test(page));

check("the control room explains that the finished round is preserved",
  /Round \{Math\.max\(1, Number\(monitor\.session\.session_round \?\? 1\)\)\} stays as it finished/.test(page));

check("every refusal and the success have organizer-readable copy",
  ["next_round", "round_no_session", "round_not_ended", "round_failed", "round_cancelled"]
    .every((key) => new RegExp(`${key}: "`).test(page)));

console.log(`\n${checks} checks passed (competition next round: real transition module, fake database).`);
