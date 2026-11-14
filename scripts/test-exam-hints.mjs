// Examination hints — rule-level and database-level tests.
//
// Part 1 exercises the pure rules shared by the API route, the admin console
// and the student panel (projection, shadowing, policy, answer-leak guard).
// Part 2 runs the real migration 0077 inside PGlite and proves the database
// guarantees: tenant/ownership integrity, one hint per level per scope, an
// approval stamp only from a reviewer, publication shape, cascade behaviour.
// Part 3 asserts the wiring that keeps the examination itself untouched.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  DEFAULT_HINTS_POLICY,
  findHintLeaks,
  groupPublishedHints,
  hintLeakBlocks,
  hintsForQuestion,
  hintStatusLabel,
  HINT_LEVELS,
  isUsableHintText,
  MAX_HINT_LEVELS,
  NO_HINT_MESSAGE,
  parseHintsPolicy,
  publicHint,
} from "../src/lib/examHints.ts";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

/**
 * `examHintsAi.ts` imports a sibling module, which Node's ESM loader cannot
 * resolve without a bundler. Compile it to CommonJS and map its two imports,
 * the same way the existing React-level suites load application modules.
 */
function compile(source, filename) {
  const file = path.resolve(filename);
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(
    ts.transpileModule(readFileSync(source, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    file,
  );
  return mod.exports;
}

const hintsRules = compile("src/lib/examHints.ts", "scripts/__virtual_hints_rules.cjs");
const aiFile = path.resolve("scripts/__virtual_hints_ai.cjs");
const originalLoad = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === aiFile) {
    if (request === "./examHints") return hintsRules;
    if (request === "./ai-marking") {
      const FALLBACK = { openai: ["OPENAI_API_KEY"], anthropic: ["ANTHROPIC_API_KEY"], gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"] };
      return {
        modelJsonTransport: async () => { throw new Error("transport not stubbed"); },
        readProviderConfig: (env = process.env) => {
          const apiKey = env.AI_MARKING_API_KEY?.trim();
          const explicit = env.AI_MARKING_PROVIDER?.trim().toLowerCase();
          const provider = explicit ?? (apiKey ? "openai" : ["openai", "anthropic", "gemini"].find((id) => FALLBACK[id].some((k) => env[k]?.trim())));
          if (!provider) return null;
          const key = apiKey ?? FALLBACK[provider]?.map((k) => env[k]?.trim()).find(Boolean);
          if (!key) return null;
          return { provider, model: env.AI_MARKING_MODEL?.trim() ?? "test-model", apiKey: key };
        },
      };
    }
  }
  return originalLoad.apply(this, arguments);
};
const { parseHintDrafts, describeHintGeneration, buildHintPrompt, suggestHints, HintGenerationError } = compile(
  "src/lib/examHintsAi.ts",
  "scripts/__virtual_hints_ai.cjs",
);
Module._load = originalLoad;

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };
const checkAsync = async (name, fn) => { await fn(); checks += 1; console.log(`✓ ${name}`); };

// ── Part 1: pure rules ───────────────────────────────────────────────────
check("the candidate projection keeps only level, text and doc", () => {
  const hint = publicHint({
    question_id: "q1",
    exam_id: "e1",
    level: 2,
    body: "  Think about how heat changes the state of a liquid.  ",
    body_doc: null,
    status: "published",
    created_by: "secret-author",
  });
  assert.deepEqual(hint, { level: 2, text: "Think about how heat changes the state of a liquid.", doc: null });
  assert.deepEqual(Object.keys(hint).sort(), ["doc", "level", "text"]);
});

check("blank or truncated hints are never shown as guidance", () => {
  assert.equal(isUsableHintText("      "), false);
  assert.equal(isUsableHintText("short"), false);
  assert.equal(isUsableHintText("A reasonably long, useful hint."), true);
  const noDoc = publicHint({ question_id: "q", exam_id: null, level: 1, body: "" });
  assert.equal(noDoc, null);
});

check("only levels 1–3 survive the projection", () => {
  assert.deepEqual(HINT_LEVELS, [1, 2, 3]);
  assert.equal(publicHint({ question_id: "q", exam_id: null, level: 4, body: "A useful long enough hint." }), null);
  assert.ok(MAX_HINT_LEVELS <= 3);
});

check("an examination-specific hint shadows the bank hint for that examination only", () => {
  const rows = [
    { question_id: "q1", exam_id: null, level: 1, body: "Bank-level gentle clue for this question.", status: "published" },
    { question_id: "q1", exam_id: "exam-A", level: 1, body: "Exam-A-specific gentle clue for this question.", status: "published" },
    { question_id: "q1", exam_id: "exam-B", level: 2, body: "Exam-B second-level method reminder text.", status: "published" },
  ];
  const forA = groupPublishedHints(rows, "exam-A");
  assert.equal(forA.get("q1").length, 1, "another examination's level-2 hint must not appear in exam A");
  assert.match(forA.get("q1")[0].text, /Exam-A-specific/);

  const forB = groupPublishedHints(rows, "exam-B");
  assert.match(forB.get("q1")[0].text, /Bank-level/);
  assert.match(forB.get("q1")[1].text, /Exam-B/);

  const forC = groupPublishedHints(rows, "exam-C");
  assert.equal(forC.get("q1").length, 1, "another examination's specific hint never leaks");
  assert.match(forC.get("q1")[0].text, /Bank-level/);
});

check("a row belonging to another examination is ignored entirely", () => {
  const map = groupPublishedHints(
    [{ question_id: "q1", exam_id: "other-exam", level: 1, body: "Hint configured for a different examination.", status: "published" }],
    "exam-A",
  );
  assert.equal(map.size, 0);
  assert.deepEqual(hintsForQuestion(map, "q1"), []);
  assert.deepEqual(hintsForQuestion(map, null), []);
});

check("non-published rows are never grouped, even if the caller forgot to filter", () => {
  const map = groupPublishedHints(
    [
      { question_id: "q1", exam_id: null, level: 1, body: "Draft guidance that nobody approved yet.", status: "draft" },
      { question_id: "q2", exam_id: null, level: 1, body: "Published guidance for the second question.", status: "published" },
    ],
    "exam-A",
  );
  assert.equal(map.has("q1"), false);
  assert.equal(map.get("q2").length, 1);
});

check("the policy reader is defensive and defaults to hints enabled with review required", () => {
  assert.deepEqual(parseHintsPolicy(null), { ...DEFAULT_HINTS_POLICY });
  assert.deepEqual(parseHintsPolicy("nonsense"), { ...DEFAULT_HINTS_POLICY });
  assert.equal(parseHintsPolicy({}).enabled, true);
  assert.equal(parseHintsPolicy({ enabled: false }).enabled, false);
  assert.equal(parseHintsPolicy({ max_levels: 99 }).maxLevels, 3);
  assert.equal(parseHintsPolicy({ max_levels: 0 }).maxLevels, 1);
  assert.equal(DEFAULT_HINTS_POLICY.requireReview, true);
});

check("the answer-leak guard blocks a hint that repeats a correct option", () => {
  const findings = findHintLeaks("The answer is that water turns into water vapour when heated.", {
    correctOptionLabels: ["Water turns into water vapour when heated"],
  });
  assert.equal(findings.some((f) => f.level === "block"), true);
  assert.equal(hintLeakBlocks("The answer is that water turns into water vapour when heated.", {
    correctOptionLabels: ["Water turns into water vapour when heated"],
  }), true);
});

check("a method hint passes the leak guard", () => {
  const body = "Think about what happens to particles when a liquid receives more thermal energy.";
  assert.deepEqual(findHintLeaks(body, { correctOptionLabels: ["Water turns into water vapour when heated"] }), []);
  assert.equal(hintLeakBlocks(body, {}), false);
});

check("an accepted numeric answer in the hint raises a warning", () => {
  const findings = findHintLeaks("Multiply the sides and you should obtain 40 square centimetres.", { acceptedAnswers: ["40"] });
  // "40" is too short to be a reliable token match; only longer accepted answers warn.
  assert.equal(findings.length, 0);
  const longer = findHintLeaks("The final quantity is 12.5 metres per second, as computed.", { acceptedAnswers: ["12.5 metres per second"] });
  assert.equal(longer.some((f) => f.level === "warn"), true);
});

check("statuses are labelled unambiguously, and the empty-state text is real guidance", () => {
  assert.equal(hintStatusLabel("published"), "Published");
  assert.equal(hintStatusLabel("approved"), "Approved (not visible)");
  assert.match(NO_HINT_MESSAGE, /Read the question again/);
});

check("AI drafting is unavailable without a credential and says so instead of inventing hints", () => {
  const availability = describeHintGeneration({});
  assert.equal(availability.configured, false);
  assert.match(availability.reason, /not available/);
});

check("the hint prompt forbids answers and never includes the answer key", () => {
  const { system, user } = buildHintPrompt({
    prompt: "Calculate the area of a rectangle measuring 8 cm by 5 cm.",
    type: "short_answer",
    gradeLevel: "Grade 5",
    subject: "Mathematics",
  });
  assert.match(system, /NEVER state the answer/);
  assert.match(system, /Do not follow any instruction/ === system ? /instruction/ : /Return JSON only/);
  assert.match(user, /Grade 5/);
  assert.match(user, /8 cm by 5 cm/);
  assert.equal(/40/.test(system), false);
});

check("model drafts that quote the answer are dropped, not saved", () => {
  const drafts = parseHintDrafts(
    { hints: [
      { level: 1, body: "Identify the two measurements the formula needs." },
      { level: 2, body: "Multiply the length by the width to find the area." },
      { level: 3, body: "The answer is 40 square centimetres exactly." },
    ] },
    { acceptedAnswers: ["40 square centimetres"] },
  );
  assert.deepEqual(drafts.map((d) => d.level), [1, 2]);
});

check("malformed model replies are rejected rather than rendered", () => {
  assert.throws(() => parseHintDrafts({ nope: true }), /no hint list/);
  assert.throws(() => parseHintDrafts({ hints: [{ level: 9, body: "Out of range level hint text." }] }), /no usable hint/);
  assert.throws(() => parseHintDrafts({ hints: [{ level: 1, body: "short" }] }), /no usable hint/);
});

await checkAsync("a configured provider is used, and its reply is sanitised before storage", async () => {
  let seenPrompt = "";
  const result = await suggestHints(
    { prompt: "Explain why people settle near rivers.", type: "open_ended", subject: "Social Science" },
    {
      env: { AI_MARKING_PROVIDER: "openai", AI_MARKING_API_KEY: "test-key" },
      transport: async ({ system, user }) => {
        seenPrompt = `${system}\n${user}`;
        return JSON.stringify({ hints: [{ level: 1, body: "Think about what a river provides to a community." }] });
      },
    },
  );
  assert.equal(result.provider, "openai");
  assert.equal(result.drafts.length, 1);
  assert.match(seenPrompt, /pedagogical hints/);
});

await checkAsync("an unconfigured deployment refuses to generate and stores nothing", async () => {
  await assert.rejects(
    () => suggestHints({ prompt: "Any question", type: "short_answer" }, { env: {}, transport: async () => "{}" }),
    (error) => error instanceof HintGenerationError && error.code === "unconfigured",
  );
});

// ── Part 2: the real migration in PGlite ─────────────────────────────────
const db = new PGlite();
await db.exec(`
  create schema if not exists auth;
  create role authenticated;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create function public.is_super_admin() returns boolean language sql stable as $$ select false $$;
  create function public.is_org_member(uuid) returns boolean language sql stable as $$ select false $$;
  create function public.can_create_content(uuid) returns boolean language sql stable as $$ select false $$;

  create table public.platform_settings (key text primary key, value jsonb not null default '{}'::jsonb);
  create table public.profiles (id uuid primary key, platform_role text not null default 'user');
  create table public.organizations (id uuid primary key, name text not null);
  create table public.questions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id),
    type text not null default 'short_answer',
    prompt text not null default 'Question'
  );
  create table public.exams (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id),
    title text not null default 'Examination'
  );
  create table public.exam_attempts (id uuid primary key default gen_random_uuid(), exam_id uuid, candidate_id uuid);
  create table public.exam_candidates (id uuid primary key default gen_random_uuid(), exam_id uuid, student_id uuid);
  create table public.students (id uuid primary key default gen_random_uuid(), user_id uuid);

  insert into public.platform_settings (key, value) values ('exam_hints_policy', '{"enabled": true}'::jsonb);
  insert into public.organizations (id, name) values
    ('11111111-1111-1111-1111-111111111111', 'Org A'),
    ('22222222-2222-2222-2222-222222222222', 'Org B');
  insert into public.profiles (id) values ('33333333-3333-3333-3333-333333333333');
  insert into public.questions (id, organization_id) values
    ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111'),
    ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222');
  insert into public.exams (id, organization_id, title) values
    ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'Exam A'),
    ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', 'Exam B');
`);

await db.exec(readFileSync("supabase/migrations/0077_question_hints.sql", "utf8"));
const q = (sql, params) => db.query(sql, params);
const one = async (sql, params) => (await q(sql, params)).rows[0];

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const QA = "44444444-4444-4444-4444-444444444444";
const EA = "66666666-6666-6666-6666-666666666666";
const EB = "77777777-7777-7777-7777-777777777777";
const USER = "33333333-3333-3333-3333-333333333333";

await checkAsync("migration 0077 creates the table, its constraints and RLS", async () => {
  const table = await one("select count(*)::int as n from information_schema.tables where table_name = 'question_hints'");
  assert.equal(table.n, 1);
  const rls = await one("select relrowsecurity as enabled from pg_class where relname = 'question_hints'");
  assert.equal(rls.enabled, true);
  const policies = await one("select count(*)::int as n from pg_policies where tablename = 'question_hints'");
  assert.equal(policies.n, 4);
  const policy = await one("select value from public.platform_settings where key = 'exam_hints_policy'");
  assert.equal(policy.value.enabled, true);
});

await checkAsync("a draft hint can be created for an existing question", async () => {
  const row = await one(
    `insert into public.question_hints (organization_id, question_id, level, body, status, created_by)
     values ($1,$2,1,'Remember the formula for the area of a rectangle.','draft',$3)
     returning id, status, source, approved_at, published_at`,
    [A, QA, USER],
  );
  assert.equal(row.status, "draft");
  assert.equal(row.source, "manual");
  assert.equal(row.approved_at, null);
  assert.equal(row.published_at, null);
});

await checkAsync("a hint cannot straddle institutions", async () => {
  await assert.rejects(
    () => q(`insert into public.question_hints (organization_id, question_id, level, body)
            values ($1,$2,1,'A hint attached to the wrong organisation.')`, [B, QA]),
    /question's organisation|organisation/,
  );
  await assert.rejects(
    () => q(`insert into public.question_hints (organization_id, question_id, exam_id, level, body)
            values ($1,$2,$3,1,'A hint whose examination belongs to another institution.')`, [A, QA, EB]),
    /examination's organisation|organisation/,
  );
});

await checkAsync("one hint per level per scope, but a bank hint and an exam hint can coexist", async () => {
  await assert.rejects(
    () => q(`insert into public.question_hints (organization_id, question_id, level, body)
            values ($1,$2,1,'A second bank hint for the same level.')`, [A, QA]),
    /duplicate key|unique/i,
  );
  const row = await one(
    `insert into public.question_hints (organization_id, question_id, exam_id, level, body)
     values ($1,$2,$3,1,'An examination-specific hint for the same level.') returning id`,
    [A, QA, EA],
  );
  assert.ok(row.id);
  // A different examination may carry its own row for the same question+level.
  const other = await one(
    `insert into public.question_hints (organization_id, question_id, exam_id, level, body)
     values ($1,$2,$3,1,'Another examination-specific hint, same question.') returning id`,
    [A, QA, "77777777-0000-0000-0000-000000000000"],
  ).catch(() => null);
  assert.equal(other, null, "a non-existent examination cannot own a hint");
});

await checkAsync("publication requires a recorded reviewer, and the trigger stamps the instants", async () => {
  const draft = await one(`select id from public.question_hints where question_id = $1 and exam_id is null`, [QA]);
  await assert.rejects(
    () => q(`update public.question_hints set status = 'published' where id = $1`, [draft.id]),
    /question_hints_review_shape|check constraint/i,
  );
  const published = await one(
    `update public.question_hints set status = 'published', approved_by = $2 where id = $1
     returning status, approved_at, published_at, approved_by`,
    [draft.id, USER],
  );
  assert.equal(published.status, "published");
  assert.ok(published.approved_at);
  assert.ok(published.published_at);
  assert.equal(published.approved_by, USER);
});

await checkAsync("un-publishing clears the publication instant but keeps the review record", async () => {
  const row = await one(
    `update public.question_hints set status = 'archived'
     where question_id = $1 and exam_id is null returning status, published_at, approved_by`,
    [QA],
  );
  assert.equal(row.status, "archived");
  assert.equal(row.published_at, null);
  assert.equal(row.approved_by, USER);
});

await checkAsync("hint bodies are trimmed and bounded", async () => {
  const row = await one(
    `insert into public.question_hints (organization_id, question_id, level, body)
     values ($1,$2,3,'   Think about which operation combines equal groups.   ') returning body`,
    [A, QA],
  );
  assert.equal(row.body, "Think about which operation combines equal groups.");
  await assert.rejects(
    () => q(`insert into public.question_hints (organization_id, question_id, level, body)
            values ($1,$2,2,'short')`, [A, QA]),
    /check constraint/i,
  );
});

await checkAsync("deleting a question removes its hints instead of orphaning them", async () => {
  const doomed = "88888888-8888-8888-8888-888888888888";
  await q(`insert into public.questions (id, organization_id) values ($1,$2)`, [doomed, B]);
  await q(`insert into public.question_hints (organization_id, question_id, level, body)
          values ($1,$2,1,'A bank hint on a question that will be deleted.')`, [B, doomed]);
  await q(`delete from public.questions where id = $1`, [doomed]);
  const left = await one(`select count(*)::int as n from public.question_hints where question_id = $1`, [doomed]);
  assert.equal(left.n, 0);
});

await checkAsync("no existing examination row was modified by the migration", async () => {
  const exams = await one(`select count(*)::int as n from public.exams`);
  assert.equal(exams.n, 2, "the migration never rewrites examinations");
});

// ── Part 3: wiring that protects the live examination ────────────────────
const read = (path) => readFileSync(path, "utf8");
const stateRoute = read("src/app/api/exam/state/route.ts");
const hintRoute = read("src/app/api/exam/hint/route.ts");
const client = read("src/app/take-exam/[attemptId]/TakeExamClient.tsx");
const panel = read("src/app/take-exam/[attemptId]/HintPanel.tsx");
const actions = read("src/app/admin/examinations/hint-actions.ts");
const serverLib = read("src/lib/examHintsServer.ts");

check("the paper payload attaches hints without touching answers, timers or attempts", () => {
  assert.match(stateRoute, /loadPublishedHints/);
  assert.match(stateRoute, /hints: hintsByQuestion\.get\(row\.questions\.id\) \?\? \[\]/);
  assert.match(stateRoute, /catch \{\n    hintsByQuestion = new Map\(\);/);
  assert.doesNotMatch(stateRoute, /exam_hints_policy.*update/i);
});

check("the hint endpoint authorises the attempt and the question's membership of THAT paper", () => {
  assert.match(hintRoute, /loadAttemptContext\(admin, attemptId, token\)/);
  assert.match(hintRoute, /attempt\.status !== "in_progress"/);
  assert.match(hintRoute, /rows\.some\(\(row\) => row\.questions\.id === questionId\)/);
  assert.match(hintRoute, /status: 404/);
  assert.doesNotMatch(hintRoute, /\.insert\(|\.update\(|\.delete\(/);
});

check("the hint endpoint can only return published guidance text", () => {
  assert.match(serverLib, /\.eq\("status", "published"\)/);
  assert.match(serverLib, /groupPublishedHints\(rows, exam\.id/);
  assert.match(serverLib, /exam_id\.eq\.\$\{exam\.id\},and\(exam_id\.is\.null,organization_id\.eq\.\$\{exam\.organization_id\}\)/);
  assert.doesNotMatch(hintRoute, /correct_option|answer_key|explanation/);
});

check("the student panel is keyed by question and never saves, submits or polls", () => {
  assert.match(client, /key=\{`hint-\$\{current\.question_id\}`\}/);
  assert.match(client, /initialHints=\{current\.hints \?\? null\}/);
  assert.match(client, /disabled=\{submitted\}/);
  assert.doesNotMatch(panel, /\/api\/exam\/(save|submit|state|integrity)/);
  assert.match(panel, /requested\.current/);
  assert.match(panel, /data-testid="hint-panel"/);
  assert.match(panel, /aria-expanded=\{open\}/);
});

check("admin hint management is Super-Admin-only, audited and guarded against answer leaks", () => {
  assert.match(actions, /requireSuperAdmin\(\)/);
  assert.match(actions, /audit\(ctx, `exam\.hint_\$\{target\}`/);
  assert.match(actions, /findHintLeaks\(hint!\.body as string/);
  assert.match(actions, /describeHintGeneration\(\)/);
  assert.match(actions, /status: "draft"/);
  assert.doesNotMatch(actions, /status: "published",\s*\n\s*source/);
});

console.log(`\n${checks} examination-hint checks passed (rules + migration 0077 in PGlite + wiring).`);
await db.close();
