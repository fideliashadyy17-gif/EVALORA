// Run: node scripts/test-live-features-reporting.mjs
//
// Checks for the two features that shipped together:
//
//   1. Live assessment feature controls — the single resolution rule
//      (src/lib/liveFeatures.ts) and the wiring that makes it safe: a session
//      nobody configured keeps every tool, the switches are written only by an
//      authenticated server action, and candidates read them through their own
//      token, never straight from the database.
//
//   2. Advanced results & reporting — per-candidate MYP criterion marks
//      (src/lib/examResults.ts) and the Word export (src/lib/docxExport.ts),
//      which must be a real .docx that an independent reader can open.
//
// It also guards the mistake that broke the production build: source lines
// collapsed onto one line with literal "\n" sequences where newlines belonged.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire, Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);

function load(source) {
  const js = ts.transpileModule(readFileSync(source, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const file = path.resolve(`scripts/__virtual_${path.basename(source, ".ts")}_lfr_test.cjs`);
  const virtual = new Module(file);
  virtual.filename = file;
  virtual.paths = Module._nodeModulePaths(path.dirname(file));
  virtual._compile(js, file);
  return virtual.exports;
}

let passed = 0;
function ok(name, condition) {
  assert.ok(condition, name);
  console.log(`  ✓ ${name}`);
  passed++;
}
const read = (file) => readFileSync(file, "utf8");

/* ══ 1. Live feature controls: the resolution rule ═══════════════════════ */
const {
  LIVE_FEATURE_KEYS,
  LIVE_FEATURE_LABELS,
  allLiveFeaturesEnabled,
  isLiveFeatureKey,
  liveFeaturesFromSettings,
  resolveLiveFeatures,
  sameLiveFeatures,
  withLiveFeature,
} = load("src/lib/liveFeatures.ts");

const everyTool = (features) => LIVE_FEATURE_KEYS.every((key) => features[key] === true);

ok("six switches are defined, each with a label", LIVE_FEATURE_KEYS.length === 6 && LIVE_FEATURE_KEYS.every((key) => LIVE_FEATURE_LABELS[key]));
ok("no configuration at all means every tool", everyTool(resolveLiveFeatures(undefined)) && everyTool(resolveLiveFeatures(null)));
ok("an empty object means every tool", everyTool(resolveLiveFeatures({})));
ok("malformed values (string, array, number) mean every tool", everyTool(resolveLiveFeatures("off")) && everyTool(resolveLiveFeatures([false])) && everyTool(resolveLiveFeatures(0)));
ok("settings without a live_features key mean every tool", everyTool(liveFeaturesFromSettings({ show_leaderboard: true, max_participants: 200 })));
ok("settings that are null or not an object mean every tool", everyTool(liveFeaturesFromSettings(null)) && everyTool(liveFeaturesFromSettings("x")));

const onlyLatexOff = resolveLiveFeatures({ latex: false });
ok("an explicit false switches exactly that tool off", onlyLatexOff.latex === false && LIVE_FEATURE_KEYS.filter((key) => key !== "latex").every((key) => onlyLatexOff[key] === true));
ok("falsy values other than false never switch a tool off", everyTool(resolveLiveFeatures({ latex: 0, symbols: null, math_keyboard: "", equation_editor: "false", scientific_keyboard: undefined })));
ok("unknown keys are ignored", everyTool(resolveLiveFeatures({ calculator: false, everything: false })) && !("calculator" in resolveLiveFeatures({ calculator: false })));
ok("the resolved object is a fresh copy each time", resolveLiveFeatures({}) !== resolveLiveFeatures({}) && allLiveFeaturesEnabled() !== allLiveFeaturesEnabled());

ok("isLiveFeatureKey accepts the six keys only", LIVE_FEATURE_KEYS.every(isLiveFeatureKey) && !isLiveFeatureKey("calculator") && !isLiveFeatureKey("") && !isLiveFeatureKey(null) && !isLiveFeatureKey("__proto__"));
ok("sameLiveFeatures compares resolved tools, not object shapes", sameLiveFeatures(undefined, {}) && sameLiveFeatures({ latex: true }, null) && !sameLiveFeatures({ latex: false }, {}));

const original = { show_leaderboard: true, max_participants: 120, audio: { enabled: true }, live_features: { symbols: false } };
const frozen = JSON.stringify(original);
const changed = withLiveFeature(original, "latex", false);
ok("changing one switch keeps every other session setting", changed.show_leaderboard === true && changed.max_participants === 120 && changed.audio.enabled === true);
ok("changing one switch keeps the other switches", changed.live_features.symbols === false && changed.live_features.latex === false && changed.live_features.math_keyboard === true);
ok("changing a switch never mutates the settings it was given", JSON.stringify(original) === frozen);
ok("a switch can be turned back on", withLiveFeature(changed, "latex", true).live_features.latex === true);
ok("a session with no settings can still be configured", withLiveFeature(null, "symbols", false).live_features.symbols === false);

/* ══ 2. Live feature controls: safe wiring ════════════════════════════════ */
const takeExam = read("src/app/take-exam/[attemptId]/TakeExamClient.tsx");
const playClient = read("src/app/play/[code]/PlayClient.tsx");
const liveState = read("src/app/api/live/state/route.ts");
const examFeaturesRoute = read("src/app/api/exam/live-features/route.ts");
const editor = read("src/components/editor/RichContentEditor.tsx");
const runner = read("src/components/QuestionRunner.tsx");
const structured = read("src/components/response/StructuredResponseEditor.tsx");
const actions = read("src/app/admin/actions/competitions.ts");
const toggles = read("src/app/admin/competitions/LiveFeatureToggles.tsx");
const livePage = read("src/app/admin/competitions/live/page.tsx");
const detailPage = read("src/app/admin/competitions/[id]/page.tsx");
const migration = read("supabase/migrations/20261113120003_live_features_settings.sql");

// A candidate must never start with the mathematics tools switched off.
const restrictiveDefault = /(math_keyboard|symbols|scientific_keyboard|equation_editor|latex)\s*:\s*false/;
for (const [name, source] of [["examination page", takeExam], ["live play page", playClient], ["editor", editor], ["question runner", runner]]) {
  ok(`${name} has no built-in "tool off" default`, !restrictiveDefault.test(source));
}
ok("the editor resolves the switches with the shared rule", editor.includes("resolveLiveFeatures(liveFeatures)") && editor.includes('from "@/lib/liveFeatures"'));
ok("the switches travel QuestionRunner → StructuredResponseEditor → RichContentEditor", (runner.match(/liveFeatures=\{liveFeatures\}/g) ?? []).length === 2 && structured.includes("liveFeatures={liveFeatures}"));
ok("authoring keeps every tool: QuestionForm passes no switches", !read("src/components/QuestionForm.tsx").includes("liveFeatures"));

ok("the examination page does not subscribe to database tables from the browser", !takeExam.includes("postgres_changes") && !takeExam.includes("@/lib/supabase/client"));
ok("the examination page reads its switches with the attempt token", takeExam.includes("/api/exam/live-features?attempt_id=") && /Authorization: `Bearer \$\{token\}`/.test(takeExam));
ok("a failed request can never remove a tool on the examination page", /catch\s*\{\s*\/\/ Offline or interrupted/.test(takeExam) && takeExam.includes("if (!res.ok || cancelled) return;"));
ok("the examination save queue is read by its real field name", takeExam.includes("entry.questionId === q.question_id") && !takeExam.includes("entry.question_id"));

ok("the examination endpoint authenticates by attempt id and token", examFeaturesRoute.includes('.eq("id", attemptId)') && examFeaturesRoute.includes('.eq("access_token", token)'));
ok("the examination endpoint takes the examination from the attempt, not from the request", examFeaturesRoute.includes('.eq("id", attempt.exam_id)') && !/searchParams\.get\("exam_id"\)/.test(examFeaturesRoute));
ok("the examination endpoint is read-only", !/\.(insert|update|upsert|delete|rpc)\(/.test(examFeaturesRoute));
ok("the examination endpoint answers are never cached", examFeaturesRoute.includes("no-store"));

ok("live participants receive the switches from their own session state", liveState.includes("live_features: liveFeaturesFromSettings(session.settings)"));
ok("the live play page hands the switches to the question runner", playClient.includes("liveFeatures={session.live_features}"));

const actionBody = actions.slice(actions.indexOf("export async function setLiveFeature"));
ok("the toggle action exists and re-checks the super-admin session first", actionBody.startsWith("export async function setLiveFeature") && /^export async function setLiveFeature\(formData: FormData\) \{\s*const ctx = await requireSuperAdmin\(\);/.test(actionBody));
ok("the toggle action validates the switch name and the session id", actionBody.includes("isLiveFeatureKey(feature)") && actionBody.includes("UUID_RE.test(sessionId)"));
ok("the toggle action preserves the other session settings", actionBody.includes("withLiveFeature(session.settings, feature, enabled)"));
ok("the toggle action only writes while the session status is unchanged (a pause or resume rewrites the same column)", actionBody.includes('.eq("status", session.status)') && /select\("id, organization_id, status, settings"\)/.test(actionBody));
ok("the toggle action is audit logged", actionBody.includes("await audit(ctx,"));
ok("the toggle action refreshes both admin screens", actionBody.includes('revalidatePath("/admin/competitions/live")') && actionBody.includes("revalidatePath(`/admin/competitions/${competitionId}`)"));

ok("the toggles are a client component posting to the server action", toggles.startsWith('"use client";') && toggles.includes("action={setLiveFeature}") && toggles.includes("useFormStatus"));
for (const [name, source] of [["live monitoring page", livePage], ["competition page", detailPage]]) {
  ok(`${name} stays a server component: no hooks, handlers or inline actions`, !/React\.useState|useState\(|onClick=|window\.location|"use server"|"use client"/.test(source));
  ok(`${name} renders the shared toggles`, source.includes("<LiveFeatureToggles"));
}

ok("the migration never rewrites existing sessions", !/^\s*(UPDATE|DELETE|TRUNCATE|DROP)\b/im.test(migration.replace(/^\s*--.*$/gm, "")));

/* ══ 2b. Behaviour: the toggle action and the examination endpoint ════════ */
// The real modules, run against an in-memory stand-in for the database.
// Nothing here opens a network connection.
function loadWithMocks(source, mocks) {
  const js = ts.transpileModule(read(source), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const file = path.resolve(`scripts/__virtual_${source.replace(/\W+/g, "_")}_lfr_test.cjs`);
  const virtual = new Module(file);
  virtual.filename = file;
  virtual.paths = Module._nodeModulePaths(path.dirname(file));
  const original = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (parent?.filename !== file) return original.call(this, request, parent, ...rest);
    if (Object.hasOwn(mocks, request)) return mocks[request];
    throw new Error(`${source} imports ${request}, which this test does not provide`);
  };
  try {
    virtual._compile(js, file);
  } finally {
    Module._load = original;
  }
  return virtual.exports;
}
const liveFeaturesModule = load("src/lib/liveFeatures.ts");

/** `quiz_sessions` with exactly the two statements the action issues. */
function fakeSessions(initial) {
  const rows = initial.map((row) => structuredClone(row));
  const db = { rows, reads: 0, writes: 0, landed: 0, afterRead: null, failWrites: false };
  const matching = (filters) => rows.find((row) => Object.entries(filters).every(([column, value]) => row[column] === value));
  db.client = {
    from(table) {
      assert.equal(table, "quiz_sessions", "the toggle action touches no other table");
      return {
        select(columns) {
          const filters = {};
          const query = {
            eq(column, value) { filters[column] = value; return query; },
            async maybeSingle() {
              db.reads += 1;
              const row = matching(filters);
              const data = row ? structuredClone(Object.fromEntries(columns.split(",").map((c) => [c.trim(), row[c.trim()]]))) : null;
              // Another writer (the organiser's console) may change the row right after this read.
              db.afterRead?.(rows, db.reads);
              return { data, error: null };
            },
          };
          return query;
        },
        update(patch) {
          const filters = {};
          const query = {
            eq(column, value) { filters[column] = value; return query; },
            select() { return query; },
            async maybeSingle() {
              db.writes += 1;
              if (db.failWrites) return { data: null, error: { message: "database unavailable" } };
              const row = matching(filters);
              if (!row) return { data: null, error: null };
              Object.assign(row, structuredClone(patch));
              db.landed += 1;
              return { data: { id: row.id }, error: null };
            },
          };
          return query;
        },
      };
    },
  };
  return db;
}

const SESSION = "11111111-1111-4111-8111-111111111111";
const COMPETITION = "22222222-2222-4222-8222-222222222222";
const ORG = "33333333-3333-4333-8333-333333333333";
const BASE_SETTINGS = { show_leaderboard: true, max_participants: 200, audio: { enabled: true, volume: 0.4 } };
const PAUSE_SNAPSHOT = { paused_at: "2026-11-13T10:00:00.000Z", question_started_at: "2026-11-13T09:59:30.000Z", question_deadline_at: "2026-11-13T10:01:30.000Z", phase: "question" };
const world = { superAdmin: true, db: null, audits: [], revalidated: [] };
const { setLiveFeature } = loadWithMocks("src/app/admin/actions/competitions.ts", {
  "@/lib/admin": {
    FLASH_COOKIE: "evalora_flash",
    fdate: () => null,
    fint: () => null,
    // Same rule as src/lib/admin.ts: trimmed, bounded, empty → null.
    fstr: (fd, key, max = 2000) => String(fd.get(key) ?? "").trim().slice(0, max) || null,
    requireSuperAdmin: async () => {
      if (!world.superAdmin) throw new Error("NEXT_REDIRECT /login");
      return { user: { id: "super-admin-1" } };
    },
    audit: async (ctx, action, entity, entityId, orgId, metadata) => {
      world.audits.push({ actor: ctx.user.id, action, entity, entityId, orgId, metadata });
    },
  },
  "@/lib/auth": { ADMIN_ORG_COOKIE: "evalora_admin_org" },
  "@/lib/brand": { COMPETITION_FORMATS: [], COMPETITION_STATUSES: [] },
  "@/lib/csv": { parseCsvRecords: () => [] },
  "@/lib/live": { defaultLiveSessionSettings: () => ({}) },
  "@/lib/liveFeatures": liveFeaturesModule,
  "@/lib/supabase/server": { createAdminClient: () => world.db.client },
  "@/lib/utils": { genCode: () => "CODE" },
  "next/cache": { revalidatePath: (target) => world.revalidated.push(target) },
  "next/headers": { cookies: async () => ({ get: () => undefined, set() {}, delete() {} }) },
  "next/navigation": { redirect: (target) => { throw new Error(`NEXT_REDIRECT ${target}`); } },
});
function toggleForm(fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ session_id: SESSION, competition_id: COMPETITION, feature: "latex", enabled: "0", ...fields })) {
    if (value !== undefined) form.set(key, value);
  }
  return form;
}
function freshWorld(session = { id: SESSION, organization_id: ORG, status: "live", settings: BASE_SETTINGS }) {
  world.superAdmin = true;
  world.audits = [];
  world.revalidated = [];
  world.db = fakeSessions(session ? [session] : []);
  return world.db;
}
const stored = (db) => db.rows[0].settings;
const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
/** The stored switches are always the complete set: exactly these tools off, every other one on. */
const storedOff = (db, off) => {
  const switches = stored(db).live_features ?? {};
  return Object.keys(switches).sort().join() === [...LIVE_FEATURE_KEYS].sort().join() && LIVE_FEATURE_KEYS.every((key) => switches[key] === !off.includes(key));
};

{
  const db = freshWorld();
  world.superAdmin = false;
  await assert.rejects(() => setLiveFeature(toggleForm({})), /NEXT_REDIRECT/);
  ok("a visitor who is not the super admin is turned away before anything is read or written", db.reads === 0 && db.writes === 0 && world.audits.length === 0);
}
{
  const db = freshWorld();
  await setLiveFeature(toggleForm({ feature: "pause_snapshot" }));
  await setLiveFeature(toggleForm({ feature: "__proto__" }));
  await setLiveFeature(toggleForm({ session_id: "not-a-uuid" }));
  await setLiveFeature(toggleForm({ session_id: undefined }));
  ok("an unknown switch name or a malformed session id never reaches the database", db.reads === 0 && db.writes === 0 && world.audits.length === 0);
  ok("…and the stored settings are untouched", JSON.stringify(stored(db)) === JSON.stringify(BASE_SETTINGS));
}
{
  const db = freshWorld();
  await setLiveFeature(toggleForm({ feature: "latex", enabled: "0" }));
  ok("switching a tool off stores that switch off and the five others on", storedOff(db, ["latex"]));
  ok("every other session setting is written back unchanged", JSON.stringify(without(stored(db), "live_features")) === JSON.stringify(BASE_SETTINGS));
  ok("participants of that session lose only that tool", (() => {
    const resolved = liveFeaturesFromSettings(stored(db));
    return resolved.latex === false && LIVE_FEATURE_KEYS.filter((key) => key !== "latex").every((key) => resolved[key] === true);
  })());
  ok("the change is audit logged once, with the actor, the session, the organisation and the switch", world.audits.length === 1
    && JSON.stringify(world.audits[0]) === JSON.stringify({ actor: "super-admin-1", action: "live_session.feature_disabled", entity: "quiz_sessions", entityId: SESSION, orgId: ORG, metadata: { feature: "latex", competition_id: COMPETITION } }));
  ok("both admin screens are refreshed", world.revalidated.includes("/admin/competitions/live") && world.revalidated.includes(`/admin/competitions/${COMPETITION}`));
  ok("one read and one write were enough", db.reads === 1 && db.writes === 1 && db.landed === 1);

  await setLiveFeature(toggleForm({ feature: "math_keyboard", enabled: "0" }));
  await setLiveFeature(toggleForm({ feature: "latex", enabled: "1" }));
  ok("switches accumulate and can be switched back on", storedOff(db, ["math_keyboard"]));
  ok("switching back on is logged as enabled", world.audits.at(-1).action === "live_session.feature_enabled" && world.audits.length === 3);
}
{
  const db = freshWorld();
  world.revalidated = [];
  await setLiveFeature(toggleForm({ competition_id: "../../etc" }));
  ok("a malformed competition id is ignored: only the live screen is refreshed and it is not logged", world.revalidated.length === 1 && world.revalidated[0] === "/admin/competitions/live" && !("competition_id" in world.audits[0].metadata) && db.landed === 1);
}
{
  // The organiser pauses between this action's read and its write.
  const db = freshWorld();
  db.afterRead = (rows, reads) => {
    if (reads !== 1) return;
    rows[0].status = "paused";
    rows[0].settings = { ...rows[0].settings, pause_snapshot: PAUSE_SNAPSHOT };
  };
  await setLiveFeature(toggleForm({ feature: "equation_editor", enabled: "0" }));
  ok("a pause that lands between the read and the write is not overwritten", JSON.stringify(stored(db).pause_snapshot) === JSON.stringify(PAUSE_SNAPSHOT) && db.rows[0].status === "paused");
  ok("…and the switch is still applied, on a second attempt", storedOff(db, ["equation_editor"]) && db.reads === 2 && db.writes === 2 && db.landed === 1 && world.audits.length === 1);
}
{
  // The organiser resumes between this action's read and its write.
  const db = freshWorld({ id: SESSION, organization_id: ORG, status: "paused", settings: { ...BASE_SETTINGS, pause_snapshot: PAUSE_SNAPSHOT } });
  db.afterRead = (rows, reads) => {
    if (reads !== 1) return;
    rows[0].status = "live";
    rows[0].settings = without(rows[0].settings, "pause_snapshot");
  };
  await setLiveFeature(toggleForm({ feature: "symbols", enabled: "0" }));
  ok("a resume that lands between the read and the write is not undone", !("pause_snapshot" in stored(db)) && db.rows[0].status === "live" && storedOff(db, ["symbols"]) && db.landed === 1);
}
{
  // The status changes after every single read: the action must stop, not spin.
  const db = freshWorld();
  db.afterRead = (rows) => { rows[0].status = rows[0].status === "live" ? "paused" : "live"; };
  await setLiveFeature(toggleForm({}));
  ok("a session whose status keeps changing is given up on after four attempts", db.reads === 4 && db.writes === 4 && db.landed === 0);
  ok("…nothing is stored or logged, and the screens are still refreshed to show the truth", !("live_features" in stored(db)) && world.audits.length === 0 && world.revalidated.includes("/admin/competitions/live"));
}
{
  const db = freshWorld();
  db.failWrites = true;
  await setLiveFeature(toggleForm({}));
  ok("a database error is not retried, not logged as done, and does not throw", db.writes === 1 && db.landed === 0 && world.audits.length === 0 && world.revalidated.length === 2);
}
{
  const db = freshWorld(null);
  await setLiveFeature(toggleForm({}));
  ok("a session that does not exist is never created or written", db.reads === 1 && db.writes === 0 && db.rows.length === 0 && world.audits.length === 0);
}

/** `exam_attempts` and `exams`, read-only: any other statement throws. */
function fakeExams({ attempts, exams }) {
  const db = { queries: [] };
  db.client = new Proxy({}, {
    get(_target, property) {
      if (property !== "from") throw new Error(`the examination endpoint must not call ${String(property)}()`);
      return (table) => new Proxy({}, {
        get(_inner, method) {
          if (method !== "select") throw new Error(`the examination endpoint must not ${String(method)} ${table}`);
          return (columns) => {
            const filters = {};
            const query = {
              eq(column, value) { filters[column] = value; return query; },
              async maybeSingle() {
                db.queries.push(`${table}(${columns}) by ${Object.keys(filters).join("+")}`);
                const source = table === "exam_attempts" ? attempts : table === "exams" ? exams : null;
                if (!source) throw new Error(`unexpected table ${table}`);
                const row = source.find((candidate) => Object.entries(filters).every(([column, value]) => candidate[column] === value));
                return { data: row ? structuredClone(row) : null, error: null };
              },
            };
            return query;
          };
        },
      });
    },
  });
  return db;
}
const ATTEMPT = "44444444-4444-4444-8444-444444444444";
const TOKEN = "55555555-5555-4555-8555-555555555555";
const OTHER_ATTEMPT = "66666666-6666-4666-8666-666666666666";
const OTHER_TOKEN = "77777777-7777-4777-8777-777777777777";
const examWorld = { db: null };
const featuresRoute = loadWithMocks("src/app/api/exam/live-features/route.ts", {
  "@/lib/examMessaging": load("src/lib/examMessaging.ts"),
  "@/lib/liveFeatures": liveFeaturesModule,
  "@/lib/supabase/server": { createAdminClient: () => examWorld.db.client },
  "next/server": require("next/server"),
});
function examDb(examSettings, otherSettings = { live_features: { standard_keyboard: false } }) {
  examWorld.db = fakeExams({
    attempts: [
      { id: ATTEMPT, exam_id: "exam-1", access_token: TOKEN },
      { id: OTHER_ATTEMPT, exam_id: "exam-2", access_token: OTHER_TOKEN },
    ],
    exams: [
      ...(examSettings === undefined ? [] : [{ id: "exam-1", settings: examSettings }]),
      { id: "exam-2", settings: otherSettings },
    ],
  });
  return examWorld.db;
}
async function askFeatures({ attempt = ATTEMPT, token = TOKEN, query = "" } = {}) {
  const url = `https://evalora.test/api/exam/live-features?${attempt ? `attempt_id=${attempt}` : ""}${query}`;
  const response = await featuresRoute.GET(new Request(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
  return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
}
{
  const db = examDb({});
  const missing = await askFeatures({ token: null });
  const inUrl = await askFeatures({ token: null, query: `&token=${TOKEN}` });
  const malformed = await askFeatures({ attempt: "1 or 1=1" });
  const noAttempt = await askFeatures({ attempt: null });
  ok("a request without the attempt token in the Authorization header is refused before any query", [missing, inUrl, malformed, noAttempt].every((r) => r.status === 400 && r.cache === "private, no-store") && db.queries.length === 0);
}
{
  const db = examDb({});
  const wrongToken = await askFeatures({ token: OTHER_TOKEN });
  ok("another candidate's token does not open this attempt, and no examination is read", wrongToken.status === 404 && wrongToken.cache === "private, no-store" && db.queries.length === 1 && db.queries[0].startsWith("exam_attempts("));
  ok("the attempt is matched on its id and its token together", db.queries[0].endsWith("by id+access_token"));
}
{
  const db = examDb({});
  const unrestricted = await askFeatures();
  ok("an examination nobody configured answers with every tool on", unrestricted.status === 200 && unrestricted.cache === "private, no-store" && everyTool(unrestricted.body.features));
  ok("the answer is six switches and nothing else", Object.keys(unrestricted.body).join() === "features" && Object.keys(unrestricted.body.features).sort().join() === [...LIVE_FEATURE_KEYS].sort().join());
  ok("only the attempt and its own examination are read", db.queries.length === 2 && db.queries[1] === "exams(settings) by id");
}
{
  examDb({ pass_mark: 50, live_features: { latex: false, math_keyboard: false, unknown_tool: false } });
  const restricted = (await askFeatures()).body.features;
  ok("switches stored on the examination are returned for its own candidates", restricted.latex === false && restricted.math_keyboard === false && LIVE_FEATURE_KEYS.filter((key) => !["latex", "math_keyboard"].includes(key)).every((key) => restricted[key] === true));
  ok("an unknown stored key is not passed on", !("unknown_tool" in restricted));
  const other = (await askFeatures({ attempt: OTHER_ATTEMPT, token: OTHER_TOKEN })).body.features;
  ok("each candidate receives the switches of their own examination only", other.standard_keyboard === false && other.latex === true && other.math_keyboard === true);
}
{
  for (const damaged of [{ live_features: "off" }, { live_features: [false, false] }, { live_features: { latex: "false", symbols: 0, equation_editor: null } }, null]) {
    examDb(damaged);
    const answer = await askFeatures();
    ok(`damaged settings (${JSON.stringify(damaged)}) never take a tool away`, answer.status === 200 && everyTool(answer.body.features));
  }
}
{
  examDb(undefined);
  const orphan = await askFeatures();
  ok("an attempt whose examination cannot be read is an error, never a restriction", orphan.status === 500 && orphan.cache === "private, no-store" && !("features" in orphan.body));
}

/* ══ 3. MYP criterion reporting ═══════════════════════════════════════════ */
const {
  MYP_CRITERIA,
  aggregateCriterionStats,
  criterionOfConfig,
  formatCriterionStats,
  parseCriterion,
  participantCriterionStats,
  sumCriterionStats,
} = load("src/lib/examResults.ts");

ok("criteria are A, B, C and D", MYP_CRITERIA.join("") === "ABCD");
ok("criterion tags are normalised", parseCriterion(" b ") === "B" && parseCriterion("D") === "D" && parseCriterion("E") === null && parseCriterion(null) === null && parseCriterion(3) === null);
ok("the criterion is read from a question's config", criterionOfConfig({ myp_criterion: "c", parts: [] }) === "C" && criterionOfConfig({}) === null && criterionOfConfig(null) === null);

// A paper with two A questions (4 + 6), one B (5), one C (10, manually marked) and one unmapped; no D.
const paper = [
  { question_id: "q1", criterion: "A", points: 4 },
  { question_id: "q2", criterion: "a", points: "6" },
  { question_id: "q3", criterion: "B", points: 5 },
  { question_id: "q4", criterion: "C", points: 10 },
  { question_id: "q5", criterion: null, points: 3 },
];
const answers = [
  // Ama: everything answered, C still awaiting a human mark.
  { participant_id: "ama", question_id: "q1", is_correct: true, points_awarded: 4 },
  { participant_id: "ama", question_id: "q2", is_correct: true, points_awarded: "4.5" },
  { participant_id: "ama", question_id: "q3", is_correct: false, points_awarded: 0 },
  { participant_id: "ama", question_id: "q4", is_correct: null, points_awarded: null },
  { participant_id: "ama", question_id: "q5", is_correct: true, points_awarded: 3 },
  // Kofi: one A question only, C marked 7/10, an over-award and a duplicate row.
  { participant_id: "kofi", question_id: "q1", is_correct: true, points_awarded: 99 },
  { participant_id: "kofi", question_id: "q1", is_correct: true, points_awarded: 4 },
  { participant_id: "kofi", question_id: "q4", is_correct: true, points_awarded: 7 },
  // Noise: an answer to a question that is not on this paper, and one from a stranger.
  { participant_id: "kofi", question_id: "zz", is_correct: true, points_awarded: 50 },
  { participant_id: "stranger", question_id: "q1", is_correct: true, points_awarded: 4 },
];
const by = participantCriterionStats(["ama", "kofi", "yaa"], answers, paper);
const ama = by.get("ama");
const kofi = by.get("kofi");
const yaa = by.get("yaa");

ok("every listed participant gets a breakdown, strangers do not", by.size === 3 && !by.has("stranger"));
ok("marks are summed per participant, not shared across the class", ama.A.marks === 8.5 && kofi.A.marks === 4 && yaa.A.marks === 0);
ok("the maximum is the whole paper for everyone", ama.A.max === 10 && kofi.A.max === 10 && yaa.A.max === 10);
ok("a blank question counts as zero out of its marks", kofi.A.percentage === 40 && kofi.B.marks === 0 && kofi.B.max === 5 && kofi.B.percentage === 0);
ok("someone who answered nothing still has a complete breakdown", yaa.A.percentage === 0 && yaa.B.percentage === 0 && yaa.C.percentage === 0 && yaa.C.pending === 0);
ok("an answer awaiting manual marking is pending, not zero-and-final", ama.C.marks === 0 && ama.C.max === 10 && ama.C.pending === 1);
ok("a marked constructed response counts", kofi.C.marks === 7 && kofi.C.percentage === 70 && kofi.C.pending === 0);
ok("an award is never worth more than the question", kofi.A.marks === 4);
ok("a criterion the paper does not assess is reported as such", ama.D.notAssessed && ama.D.percentage === null && kofi.D.notAssessed && yaa.D.notAssessed);
ok("an assessed criterion is never 'not assessed', even at zero", !yaa.A.notAssessed && !yaa.B.notAssessed && !yaa.C.notAssessed);
ok("percentages are whole numbers", ama.A.percentage === 85 && Number.isInteger(ama.A.percentage));

const everyone = aggregateCriterionStats([{ id: "ama" }, { id: "kofi" }, { id: "yaa" }], answers, paper);
ok("the group total is everyone's marks over everyone's available marks", everyone.A.marks === 12.5 && everyone.A.max === 30 && everyone.A.percentage === 42);
ok("the group total carries pending answers", everyone.C.pending === 1 && everyone.C.marks === 7 && everyone.C.max === 30);
ok("the group total keeps 'not assessed'", everyone.D.notAssessed && everyone.D.percentage === null);
ok("the group total differs from an individual's figures", everyone.A.marks !== ama.A.marks && everyone.A.percentage !== ama.A.percentage);

const school = sumCriterionStats([ama, yaa, undefined], paper);
ok("a school's figures cover only its own participants", school.A.marks === 8.5 && school.A.max === 20 && school.A.percentage === 43);
const nobody = sumCriterionStats([], paper);
ok("an empty group is zero out of zero, and the paper still decides what is assessed", nobody.A.max === 0 && nobody.A.percentage === null && !nobody.A.notAssessed && nobody.D.notAssessed);
ok("a paper with no criterion mapping assesses nothing", MYP_CRITERIA.every((c) => participantCriterionStats(["ama"], answers, [{ question_id: "q1", criterion: null, points: 4 }]).get("ama")[c].notAssessed));

ok("full format: marks and percentage", formatCriterionStats(kofi.C) === "7/10 (70%)");
ok("marks format", formatCriterionStats(kofi.C, "marks") === "7/10");
ok("percent format", formatCriterionStats(kofi.C, "percent") === "70%");
ok("not assessed format", formatCriterionStats(ama.D) === "Not assessed" && formatCriterionStats(undefined) === "Not assessed");
ok("pending answers are announced", formatCriterionStats(ama.C) === "0/10 (0%) · 1 awaiting marking");

const resultsTab = read("src/app/admin/competitions/[id]/tabs/ResultsTab.tsx");
const examReport = read("src/app/dashboard/reports/exam/[id]/page.tsx");
ok("the competition results query uses real quiz_questions columns", resultsTab.includes('.select("question_id, points, position, questions(config, points)")') && !resultsTab.includes("quiz_question_id"));
ok("the competition results show each participant's own criterion marks", resultsTab.includes("criteriaByParticipant.get(p.id)") && resultsTab.includes("criteriaByOrg.get(r.org)"));
ok("the examination report loads the marks each question carries", examReport.includes('.select("question_id, points, questions(prompt, prompt_doc, type, topic, difficulty, config, points), position")'));
ok("the examination report shows each candidate's own criterion marks", examReport.includes("criteriaByAttempt.get(a.id)"));
ok("a paper's own marks override the question's default", resultsTab.includes("row.points ?? row.questions?.points ?? 0") && examReport.includes("r.points ?? r.questions?.points ?? 0"));

/* ══ 4. Word export: a real .docx ═════════════════════════════════════════ */
const { buildDocxParts, DOCX_MIME } = load("src/lib/docxExport.ts");
const XLSX = require("@e965/xlsx");
const mammoth = require("mammoth");

const report = {
  title: "Examination Report: MYP 5 Mock <A> & \"B\"",
  subtitle: "Pass mark: 50% · Results: published",
  sections: [
    {
      heading: "Candidate Results",
      table: {
        head: ["Candidate", "Score", "Criterion A"],
        rows: [
          ["Adjoa <script>alert(1)</script>", 12, "8.5/10 (85%)"],
          ["Kofi & Sons\nref K-01", 7.5, "Not assessed"],
          ["Short row 🥇"],
          ["Yaa\u0000\u0008 Mensah", null, undefined],
        ],
      },
    },
    { heading: "Notes", paragraphs: ["First paragraph."], bullets: ["Criterion A: 12.5/30 (42%)"] },
    { heading: "Empty", emptyNote: "No attempts yet.", table: { head: ["A", "B"], rows: [] } },
  ],
};
const parts = buildDocxParts(report);
const partPaths = parts.map((part) => part.path);
ok("the package has the parts Word requires", ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels", "word/styles.xml"].every((p) => partPaths.includes(p)));
ok("every part is declared as UTF-8 XML", parts.every((part) => part.xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')));
ok("the MIME type is the Word document type", DOCX_MIME === "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

const documentXml = parts.find((part) => part.path === "word/document.xml").xml;
ok("user text is escaped, never written as markup", documentXml.includes("Adjoa &lt;script&gt;alert(1)&lt;/script&gt;") && !documentXml.includes("<script>"));
ok("ampersands and quotes in titles are escaped", documentXml.includes("MYP 5 Mock &lt;A&gt; &amp; &quot;B&quot;"));
ok("characters XML cannot carry are dropped", documentXml.includes("Yaa Mensah") && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(documentXml));
ok("a line break inside a cell becomes a Word line break", /Kofi &amp; Sons<\/w:t><w:br\/><w:t xml:space="preserve">ref K-01/.test(documentXml));
ok("every table row has the same number of cells", (() => {
  const rows = documentXml.split("<w:tr>").slice(1).map((row) => (row.split("</w:tr>")[0].match(/<w:tc>/g) ?? []).length);
  return rows.length === 5 && rows.every((n) => n === 3);
})());
ok("an empty table shows its note instead", documentXml.includes("No attempts yet.") && (documentXml.match(/<w:tbl>/g) ?? []).length === 1);

// Well-formedness: every element that is opened is closed, in order.
function wellFormed(xml) {
  const stack = [];
  const tags = xml.replace(/^<\?xml[^>]*\?>\s*/, "").match(/<[^>]+>/g) ?? [];
  for (const tag of tags) {
    if (tag.endsWith("/>")) continue;
    const name = /^<\/?([^\s>/]+)/.exec(tag)[1];
    if (tag.startsWith("</")) {
      if (stack.pop() !== name) return false;
    } else stack.push(name);
  }
  return stack.length === 0 && !/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml);
}
ok("every part is well-formed XML", parts.every((part) => wellFormed(part.xml)));

// Pack exactly as the Export Word button does, then open it with an independent reader.
const zip = XLSX.CFB.utils.cfb_new();
const encoder = new TextEncoder();
for (const part of parts) XLSX.CFB.utils.cfb_add(zip, part.path, encoder.encode(part.xml));
const packed = Buffer.from(Uint8Array.from(XLSX.CFB.write(zip, { fileType: "zip", type: "array", compression: true })));
ok("the packed file is a ZIP archive", packed[0] === 0x50 && packed[1] === 0x4b && packed.length > 600);

const text = (await mammoth.extractRawText({ buffer: packed })).value;
const html = (await mammoth.convertToHtml({ buffer: packed })).value;
ok("an independent .docx reader opens the document", text.includes("Examination Report: MYP 5 Mock <A> & \"B\""));
ok("the reader sees headings, paragraphs and bullets", text.includes("Candidate Results") && text.includes("First paragraph.") && text.includes("Criterion A: 12.5/30 (42%)"));
ok("the reader sees a real table with every row", (html.match(/<table>/g) ?? []).length === 1 && (html.match(/<tr>/g) ?? []).length === 5);
ok("the reader sees user text as text", text.includes("Adjoa <script>alert(1)</script>") && html.includes("Adjoa &lt;script&gt;alert(1)&lt;/script&gt;"));
ok("non-ASCII text survives (emoji, accents)", text.includes("Short row 🥇") && (await mammoth.extractRawText({ buffer: Buffer.from(Uint8Array.from((() => {
  const z = XLSX.CFB.utils.cfb_new();
  for (const part of buildDocxParts({ title: "Résultats — Élèves de Cotonou", sections: [] })) XLSX.CFB.utils.cfb_add(z, part.path, encoder.encode(part.xml));
  return XLSX.CFB.write(z, { fileType: "zip", type: "array", compression: true });
})())) })).value.includes("Résultats — Élèves de Cotonou"));

const exportTools = read("src/components/ExportTools.tsx");
ok("the Word button builds the package from data, not from HTML", exportTools.includes("buildDocxParts(report)") && !exportTools.includes("mammoth") && !exportTools.includes("convertToWordProcessingOptions"));
ok("the export buttons are typed (no `any`)", !/\bany\b/.test(exportTools.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));

/* ══ 5. The build-breaking corruption cannot come back unnoticed ══════════ */
// Literal backslash-n immediately followed by a JSX tag or a closing brace on
// the same source line is what collapsed markup looks like.
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}
const collapsed = [];
for (const file of walk("src")) {
  read(file).split("\n").forEach((line, index) => {
    if (/\\n\s*(<\/?[A-Za-z]|\{\/\*|\)\}|\}\))/.test(line) && (line.match(/\\n/g) ?? []).length >= 2) collapsed.push(`${file}:${index + 1}`);
  });
}
ok(`no source line is collapsed markup with literal \\n sequences${collapsed.length ? ` (found: ${collapsed.slice(0, 5).join(", ")})` : ""}`, collapsed.length === 0);

console.log(`\n${passed} checks passed.`);
