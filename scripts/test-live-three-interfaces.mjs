/**
 * Functional/security checks for the three-interface live competition
 * architecture: phase derivation, answer-key isolation, authorized
 * reveals, avatar consistency, rankings and display-token revocation.
 * Run: node scripts/test-live-three-interfaces.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

process.env.LIVE_DISPLAY_TOKEN_SECRET = "test-only-display-secret";

const outDir = "/tmp/evalora-live-three-test";
execSync(
  `npx tsc src/lib/live.ts src/lib/liveDisplayToken.ts src/lib/avatars.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --strict --esModuleInterop --skipLibCheck --moduleResolution node`,
  { stdio: "inherit" },
);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`, { stdio: "inherit" });

const require = createRequire(import.meta.url);
const live = require(`${outDir}/lib/live.js`);
const tokens = require(`${outDir}/lib/liveDisplayToken.js`);
const avatars = require(`${outDir}/lib/avatars.js`);

let passed = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const makeRow = (overrides = {}) => ({
  id: "qq-1",
  question_id: "q-1",
  position: 0,
  points: null,
  time_limit_seconds: 20,
  questions: {
    id: "q-1",
    type: "single_choice",
    prompt: "What is $2+2$?",
    prompt_doc: null,
    explanation: "Two plus two equals four.",
    explanation_doc: null,
    points: 10,
    config: {},
    question_options: [
      { id: "o-wrong", label: "3", content_doc: null, is_correct: false, position: 0 },
      { id: "o-correct", label: "4", content_doc: null, is_correct: true, position: 1 },
    ],
  },
  ...overrides,
});

/* ── Avatars ───────────────────────────────────────────────────────── */
ok("avatar gallery has 12 original choices", avatars.AVATARS.length === 12);
ok("avatar keys are unique", new Set(avatars.AVATAR_KEYS).size === 12);
ok("valid avatar preserved", avatars.normalizeAvatarKey("penguin") === "penguin");
ok("unknown avatar safely defaults", avatars.normalizeAvatarKey("proprietary-character") === "owl");

/* ── Public question isolation and authorized reveal ───────────────── */
const pub = live.publicQuestion(makeRow(), {});
ok("public question keeps answer options", pub.options.length === 2);
ok("public question strips correctness flags", !JSON.stringify(pub).includes("is_correct"));
ok("public question has no reveal payload", !("reveal" in pub));

const shortRow = makeRow({
  questions: {
    ...makeRow().questions,
    type: "short_answer",
    prompt: "Capital of France?",
    question_options: [
      { id: "accepted", label: "Paris", content_doc: null, is_correct: true, position: 0 },
    ],
  },
});
const shortPublic = live.publicQuestion(shortRow, {});
ok("short-answer accepted answers are never serialized", shortPublic.options.length === 0 && !JSON.stringify(shortPublic).includes("Paris"));

const reveal = live.revealedQuestion(makeRow(), {});
ok("authorized reveal identifies correct option", reveal.reveal.correct_option_ids.join() === "o-correct");
ok("authorized reveal includes explanation", reveal.explanation.includes("four"));
ok("short-answer reveal releases accepted answer", live.answerReveal(shortRow).accepted_answers.join() === "Paris");

const numericRow = makeRow({
  questions: {
    ...makeRow().questions,
    type: "numeric",
    config: { numeric_answer: 42, tolerance: 0.5 },
    question_options: [],
  },
});
ok("numeric reveal is explicit", live.answerReveal(numericRow).summary[0] === "42 (± 0.5)");

const matchingRow = makeRow({
  questions: {
    ...makeRow().questions,
    type: "matching",
    config: { pairs: [{ left: "H2O", right: "Water" }, { left: "CO2", right: "Carbon dioxide" }] },
    question_options: [],
  },
});
ok("matching public sides hide pair mapping", !JSON.stringify(live.publicQuestion(matchingRow, {})).includes("H2O → Water"));
ok("matching reveal releases pairs", live.answerReveal(matchingRow).summary[0] === "H2O → Water");

const assessWorkspaceRow = makeRow({
  questions: {
    ...makeRow().questions,
    type: "assess_parts",
    prompt: "Construct and explain each representation.",
    question_options: [],
    config: {
      parts: [{ id: "a", label: "(a)", prompt: "State the probability.", kind: "numeric", points: 1, answer: 0.75, tolerance: 0, hints: ["Count favourable outcomes first.", "Divide favourable outcomes by all outcomes."] }],
      response_tools: ["probability_tree", "stem_leaf", "venn", "statistics", "data_table"],
      response_requirement: "probability_tree",
      response_default_tool: "probability_tree",
      response_probability_tree: { title: "Draw tree", starter: { rootLabel: "First draw" } },
      response_stem_leaf: { title: "Leaves", starter: { layout: "back_to_back", leftLeafLabel: "A", rightLeafLabel: "B" } },
      response_venn: { title: "Sets", starter: { sets: 3, labels: ["P", "Q", "R"] }, allow_set_change: false },
      response_stats: { title: "Frequency", chart: "histogram", starter: { chart: "histogram", values: [2, 4, 4] } },
      response_data_table: { title: "Frequencies", starter: { columns: ["Value", "f"], rows: [["2", ""], ["4", ""]] } },
    },
  },
});
const assessWorkspacePublic = live.publicQuestion(assessWorkspaceRow, {});
const assessWorkspace = assessWorkspacePublic.response_workspace;
ok("assess-parts public workspace includes every configured construction", Boolean(
  assessWorkspace?.statistics && assessWorkspace?.dataTable && assessWorkspace?.venn &&
  assessWorkspace?.probabilityTree && assessWorkspace?.stemLeaf,
));
ok("assess-parts public workspace preserves tree and stem-leaf starters", assessWorkspace?.probabilityTree?.starter?.rootLabel === "First draw" && assessWorkspace?.stemLeaf?.starter?.layout === "back_to_back");
ok("assess-parts workspace strips typed-answer keys", !JSON.stringify(assessWorkspacePublic).includes('"answer":0.75'));

/* ── Server phases and deadlines ───────────────────────────────────── */
const now = new Date("2026-11-04T12:00:00.000Z");
const baseSession = {
  status: "live",
  mode: "synchronized",
  phase: "question",
  current_question_index: 0,
  question_started_at: "2026-11-04T11:59:55.000Z",
  question_deadline_at: "2026-11-04T12:00:15.000Z",
};
ok("lobby derives waiting phase", live.effectivePhase({ ...baseSession, status: "lobby", phase: "question" }, makeRow(), {}, now) === "waiting");
ok("future server start derives countdown", live.effectivePhase({ ...baseSession, question_started_at: "2026-11-04T12:00:03.000Z", question_deadline_at: "2026-11-04T12:00:23.000Z" }, makeRow(), {}, now) === "countdown");
ok("inside server window derives question", live.effectivePhase(baseSession, makeRow(), {}, now) === "question");
ok("after server deadline derives time_expired", live.effectivePhase(baseSession, makeRow(), {}, new Date("2026-11-04T12:00:16.000Z")) === "time_expired");
ok("stored reveal phase is authoritative", live.effectivePhase({ ...baseSession, phase: "answer_reveal" }, makeRow(), {}, now) === "answer_reveal");
ok("ended podium is distinct from completed", live.effectivePhase({ ...baseSession, status: "ended", phase: "podium" }, makeRow(), {}, now) === "podium");
ok("stored server deadline wins", live.questionDeadlineAt(baseSession, makeRow(), {}) === baseSession.question_deadline_at);
ok(
  "fallback deadline uses question duration",
  live.questionDeadlineAt({ ...baseSession, question_deadline_at: null }, makeRow(), {}) === "2026-11-04T12:00:15.000Z",
);

/* ── Settings, connection and fair ranking ─────────────────────────── */
const defaults = live.defaultLiveSessionSettings(300);
const parsedDefaults = live.parseLiveSettings(defaults);
ok("new sessions do not publish leaderboard by accident", parsedDefaults.show_leaderboard === false);
ok("new sessions enable secure projector by default", parsedDefaults.projector_enabled === true);
ok("audio volume is clamped", live.parseLiveSettings({ audio: { volume: 9 } }).audio.volume === 1);
ok("unknown audio theme falls back", live.parseLiveSettings({ audio: { theme: "unknown" } }).audio.theme === "evergreen");
ok("fresh heartbeat is connected", live.isParticipantConnected(new Date(now.getTime() - 5000).toISOString(), now.getTime()));
ok("stale heartbeat is disconnected", !live.isParticipantConnected(new Date(now.getTime() - 20000).toISOString(), now.getTime()));

const ranked = live.rankedParticipants(
  [
    { id: "slow", display_name: "Slow", avatar_key: "fox", score: 10, joined_at: "2026-01-01T00:00:00Z" },
    { id: "fast", display_name: "Fast", avatar_key: "owl", score: 10, joined_at: "2026-01-01T00:01:00Z" },
    { id: "low", display_name: "Low", avatar_key: "bee", score: 5, joined_at: "2026-01-01T00:00:00Z" },
  ],
  [
    { participant_id: "slow", response_ms: 9000 },
    { participant_id: "fast", response_ms: 3000 },
  ],
);
ok("score ties rank faster total response first", ranked.map((p) => p.id).join() === "fast,slow,low");

/* ── Signed, revocable display token ───────────────────────────────── */
const sessionId = "11111111-1111-4111-8111-111111111111";
const token = tokens.createDisplayToken(sessionId, 3, now);
ok("valid display token verifies", tokens.verifyDisplayToken(token, sessionId, 3, now));
ok("display token is session-scoped", !tokens.verifyDisplayToken(token, "22222222-2222-4222-8222-222222222222", 3, now));
ok("version increment revokes display token", !tokens.verifyDisplayToken(token, sessionId, 4, now));
ok("tampered display token is rejected", !tokens.verifyDisplayToken(`${token}x`, sessionId, 3, now));
ok("expired display token is rejected", !tokens.verifyDisplayToken(token, sessionId, 3, new Date(now.getTime() + 8 * 24 * 3600 * 1000)));
ok("screen path uses dedicated route", tokens.publicScreenPath("comp-1", sessionId, 3).startsWith("/live/comp-1/screen?token="));

/* ── Separate routes and endpoint guards ───────────────────────────── */
ok("organizer route exists", existsSync("src/app/dashboard/sessions/[id]/host/page.tsx"));
ok("public screen route exists", existsSync("src/app/live/[liveId]/screen/page.tsx"));
ok("participant route exists", existsSync("src/app/play/[code]/PlayClient.tsx"));
const screenRoute = readFileSync("src/app/api/live/screen/route.ts", "utf8");
ok("public screen verifies display token", screenRoute.includes("verifyDisplayToken"));
ok("public screen payload contains no access tokens", !screenRoute.includes("access_token"));
ok("public screen reveals only in answer_reveal", screenRoute.includes('phase === "answer_reveal"'));
const legacyProjector = readFileSync("src/app/api/live/projector/route.ts", "utf8");
ok("legacy join-code projector endpoint is retired", legacyProjector.includes("status: 410"));
const hostPage = readFileSync("src/app/dashboard/sessions/[id]/host/page.tsx", "utf8");
ok("host page requires creator/host role", hostPage.includes("CREATOR_ROLES") && hostPage.includes("session.host_id"));
const participantState = readFileSync("src/app/api/live/state/route.ts", "utf8");
ok("participant state is token scoped", participantState.includes('.eq("access_token", token)'));
ok("participant feedback waits for reveal", participantState.includes('phase === "answer_reveal"'));
const migration = readFileSync("supabase/migrations/0008_live_three_interfaces.sql", "utf8");
ok("migration tightens participant-answer RLS", migration.includes("can_host_live_session") && migration.includes("pa_select"));
ok("migration persists avatars", migration.includes("avatar_key"));
const sessionRlsHelper = readFileSync("supabase/migrations/0010_live_session_rls_helper.sql", "utf8");
ok("session RLS avoids policy recursion", sessionRlsHelper.includes("is_linked_live_participant"));
ok("three-interface operations guide exists", existsSync("docs/LIVE_COMPETITION_INTERFACES.md"));

console.log(`\n${passed} live three-interface checks passed`);
