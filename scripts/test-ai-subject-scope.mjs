#!/usr/bin/env node
/**
 * The AI Core's subject-scope gate.
 *
 * Why this suite exists
 * --------------------
 * The database policies added in 20261128170000 bind browser sessions. They do
 * not bind the AI Core, the MCP server or the native assistant, because all three
 * write through the service-role client and RLS is not evaluated for that role.
 * Those paths were gated only on `tool.risk.permission` — "questions.create" —
 * which is organization-wide, so a Mathematics teacher could ask the assistant
 * to edit a Literature question and nothing refused.
 *
 * The first attempt at closing this read `args.subject_id`. No write tool accepts
 * that argument, so the gate never fired. These tests are written against that
 * failure: they drive the real resolver with a fake client and assert that each
 * real call shape — a subject NAME, an examination id, a paper id, a question id —
 * is resolved to a subject, and that a resource belonging to another tenant is
 * refused rather than treated as "no subject".
 */

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

let n = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    n += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  ✗ ${name}`);
    console.log(`      ${error.message}`);
  }
}

const SRC = readFileSync("src/lib/ai/subjectScope.ts", "utf8");
const ENGINE = readFileSync("src/lib/ai/engine.ts", "utf8");
const TOOLS = readFileSync("src/lib/ai/tools.ts", "utf8");

const ORG = "de000000-0000-4000-8000-000000000001";
const OTHER_ORG = "0a400000-0000-4000-8000-000000000001";
const MATHS = "de000000-0000-4000-8000-0000000000e7";
const ENGLISH = "de000000-0000-4000-8000-0000000000e8";
const EXAM = "ee000000-0000-4000-8000-000000000001";
const FOREIGN_EXAM = "ee000000-0000-4000-8000-0000000000ff";
const QUIZ = "cc000000-0000-4000-8000-000000000001";
const QUESTION = "ab000000-0000-4000-8000-000000000001";

/* ── A fake Supabase client, shaped like the calls the resolver makes ──── */

function table(name, rows) {
  return {
    select() {
      let data = rows.slice();
      let single = false;
      const api = {
        eq(column, value) {
          data = data.filter((row) => row[column] === value);
          return api;
        },
        ilike(column, value) {
          data = data.filter(
            (row) => String(row[column] ?? "").trim().toLowerCase() === String(value).trim().toLowerCase(),
          );
          return api;
        },
        limit(count) {
          data = data.slice(0, count);
          return api;
        },
        order() {
          return api;
        },
        maybeSingle() {
          // PostgREST's maybeSingle returns null for zero rows, so "no rows"
          // must not be mistaken for an error by the resolver.
          single = true;
          return Promise.resolve({ data: data.length ? data[0] : null, error: null });
        },
        then(resolve) {
          return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve);
        },
      };
      return api;
    },
  };
}

function makeClient(state) {
  return {
    from(name) {
      return table(name, state.tables[name] ?? []);
    },
    async rpc(fn, args) {
      if (fn !== "can_author_subject_for") {
        return { data: null, error: { message: `unexpected rpc ${fn}` } };
      }
      state.rpcCalls.push(args);
      if (state.rpcError) return { data: null, error: { message: state.rpcError } };
      // Mirrors the SQL: null actor and cross-tenant actors are denied; a null
      // subject is the grandfathered "unscoped" case; otherwise an exact match.
      if (!args.p_actor) return { data: false, error: null };
      if (args.p_org !== ORG) return { data: false, error: null };
      if (args.p_subject === null) return { data: true, error: null };
      return { data: state.teaches.includes(args.p_subject), error: null };
    },
  };
}

function baseState(overrides = {}) {
  return {
    teaches: [MATHS],
    rpcCalls: [],
    rpcError: null,
    tables: {
      subjects: [
        { id: MATHS, organization_id: ORG, name: "Mathematics" },
        { id: ENGLISH, organization_id: ORG, name: "English" },
        { id: "0a400000-0000-4000-8000-000000000030", organization_id: OTHER_ORG, name: "Mathematics" },
      ],
      exams: [
        { id: EXAM, organization_id: ORG, subject_id: MATHS, settings: { subject: "Mathematics" } },
        { id: FOREIGN_EXAM, organization_id: OTHER_ORG, subject_id: MATHS, settings: { subject: "Mathematics" } },
        {
          id: "ee000000-0000-4000-8000-000000000002",
          organization_id: ORG,
          subject_id: null,
          settings: { subject: "English" },
        },
      ],
      quizzes: [{ id: QUIZ, organization_id: ORG, settings: {} }],
      questions: [{ id: QUESTION, organization_id: ORG, subject_id: ENGLISH }],
    },
    ...overrides,
  };
}

/* The resolver is TypeScript with a `server-only` import. Both are removed with
 * the repository's own compiler rather than with regular expressions — a regex
 * that half-understands the type syntax silently produces a different module
 * than the one shipped, which would make these tests prove nothing. */
const ts = (await import("typescript")).default;
const { outputText } = ts.transpileModule(SRC, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "subjectScope.ts",
});
const BODY = outputText
  .replace(/^import\s.*?;\s*$/gm, "")
  .replace(/^export\s+/gm, "");

const factory = new Function(
  `${BODY}
   return { resolveToolSubject, subjectScopeGate, resolveSubjectByName };`,
);
const { resolveToolSubject, subjectScopeGate } = factory();

/* ── The gap that made the first version useless ──────────────────────── */

await test("the gate is wired to a call-shaped resolver, not args.subject_id", () => {
  assert.match(ENGINE, /subjectScope\?: \(tool: string, args: Record<string, unknown>\)/);
  assert.match(ENGINE, /deps\.subjectScope\(tool\.name, request\.args \?\? \{\}\)/);
  // The old, dead check must be gone.
  assert.doesNotMatch(ENGINE, /typeof request\.args\?\.subject_id === "string"/);
});

await test("no write tool accepts subject_id, which is why the old gate never fired", () => {
  // Documenting the shape that caused the bug: if a future tool gains
  // subject_id, this assertion reminds the author to keep the resolver in step.
  const subjectIdArgs = [...TOOLS.matchAll(/subject_id: uuid\(/g)];
  assert.equal(subjectIdArgs.length, 0, "no AI tool takes subject_id; resolution must go through the resolver");
});

/* ── Resolution of every real call shape ──────────────────────────────── */

await test("a subject NAME resolves to that subject inside the caller's tenant", async () => {
  const scope = await resolveToolSubject(makeClient(baseState()), ORG, { subject: "mathematics" });
  assert.equal(scope.subjectId, MATHS);
  assert.equal(scope.resolved, true);
});

await test("a name that matches nothing is unscoped, not a guess", async () => {
  const scope = await resolveToolSubject(makeClient(baseState()), ORG, { subject: "Astrophysics" });
  assert.equal(scope.subjectId, null);
  assert.equal(scope.resolved, true, "an unregistered subject must not block a paper");
});

await test("a name belonging to another tenant does not resolve to that tenant's subject", async () => {
  // Oak and Demo both have "Mathematics". The resolver must pick Demo's.
  const scope = await resolveToolSubject(makeClient(baseState()), ORG, { subject: "Mathematics" });
  assert.equal(scope.subjectId, MATHS, "must not pick the other organization's Mathematics");
});

await test("an examination id resolves to the examination's subject", async () => {
  const scope = await resolveToolSubject(makeClient(baseState()), ORG, { examination_id: EXAM });
  assert.equal(scope.subjectId, MATHS);
});

await test("a legacy examination resolves from its stored subject name", async () => {
  // Every dashboard-created paper today has a NULL subject_id and a name in
  // settings; without this branch the gate would treat them all as unscoped.
  const scope = await resolveToolSubject(makeClient(baseState()), ORG, {
    examination_id: "ee000000-0000-4000-8000-000000000002",
  });
  assert.equal(scope.subjectId, ENGLISH);
});

await test("another tenant's examination is refused, not treated as subjectless", async () => {
  const scope = await resolveToolSubject(makeClient(baseState()), ORG, { examination_id: FOREIGN_EXAM });
  assert.equal(scope.resolved, false, "an id the caller cannot see must not pass as unscoped");
  assert.equal(scope.subjectId, null);
});

await test("a paper id resolves through the examination that uses it", async () => {
  const scope = await resolveToolSubject(makeClient(baseState()), ORG, { quiz_id: QUIZ });
  // This paper is used by no examination in the fixture and carries no settings
  // subject, so the honest answer is "unscoped" rather than an error.
  assert.equal(scope.resolved, true);
  assert.equal(scope.subjectId, null);
});

await test("a question id resolves to the question's subject", async () => {
  const scope = await resolveToolSubject(makeClient(baseState()), ORG, { question_id: QUESTION });
  assert.equal(scope.subjectId, ENGLISH);
});

await test("a malformed id is refused rather than queried", async () => {
  const scope = await resolveToolSubject(makeClient(baseState()), ORG, { question_id: "not-a-uuid" });
  assert.equal(scope.resolved, false);
});

/* ── The authorization decision itself ────────────────────────────────── */

await test("a teacher assigned Mathematics may author Mathematics", async () => {
  const gate = subjectScopeGate(makeClient(baseState()), ORG, "de000000-0000-4000-8000-000000000066");
  const decision = await gate("create_examination", { subject: "Mathematics" });
  assert.equal(decision.allowed, true);
});

await test("the same teacher may NOT author English in the same school", async () => {
  const gate = subjectScopeGate(makeClient(baseState()), ORG, "de000000-0000-4000-8000-000000000066");
  const decision = await gate("create_question", { subject: "English" });
  assert.equal(decision.allowed, false);
  assert.equal(decision.label, "English");
});

await test("editing a Literature question by id is denied, not passed as unscoped", async () => {
  const gate = subjectScopeGate(makeClient(baseState()), ORG, "de000000-0000-4000-8000-000000000066");
  const decision = await gate("update_quiz", { question_id: QUESTION });
  assert.equal(decision.allowed, false);
});

await test("an unanswerable authorization check fails closed AND reports", async () => {
  const state = baseState({ rpcError: "connection reset" });
  const gate = subjectScopeGate(makeClient(state), ORG, "de000000-0000-4000-8000-000000000066");
  await assert.rejects(
    () => gate("create_examination", { subject: "Mathematics" }),
    /could not be verified: connection reset/,
    "a failed predicate must never read as allowed",
  );
});

await test("the actor id, not a client-supplied value, is what the predicate is asked", async () => {
  const state = baseState();
  const gate = subjectScopeGate(makeClient(state), ORG, "de000000-0000-4000-8000-000000000066");
  await gate("create_question", { subject: "Mathematics" });
  assert.equal(state.rpcCalls.length, 1);
  assert.equal(state.rpcCalls[0].p_actor, "de000000-0000-4000-8000-000000000066");
  assert.equal(state.rpcCalls[0].p_org, ORG);
  assert.equal(state.rpcCalls[0].p_subject, MATHS);
});

/* ── Which tools the gate covers ──────────────────────────────────────── */

await test("every subject-writing tool is gated, and reads are not", () => {
  const list = ENGINE.slice(ENGINE.indexOf("const SUBJECT_SCOPED_TOOLS"));
  const names = [...list.slice(0, list.indexOf("]);")).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  for (const write of [
    "create_examination",
    "update_examination",
    "duplicate_examination",
    "publish_examination",
    "create_question",
    "generate_question",
    "create_quiz",
    "update_quiz",
    "mark_responses",
    "apply_grade_adjustment",
    "publish_results",
  ]) {
    assert.ok(names.includes(write), `${write} writes subject content and must be scoped`);
  }
  for (const read of ["get_examination", "get_question_bank", "list_examinations", "get_exam_results"]) {
    assert.ok(!names.includes(read), `${read} is a read and stays organization-wide`);
  }
});

await test("marking and publication are scoped, so the assistant cannot grade foreign subjects", () => {
  const list = ENGINE.slice(ENGINE.indexOf("const SUBJECT_SCOPED_TOOLS"));
  for (const sensitive of ["mark_responses", "apply_grade_adjustment", "publish_results"]) {
    assert.match(list, new RegExp(`"${sensitive}"`));
  }
});

/* ── One rule, three surfaces ─────────────────────────────────────────── */

await test("MCP, the tool API and the native assistant share one resolver", () => {
  for (const file of [
    "src/app/api/mcp/route.ts",
    "src/app/api/ai/v1/tools/[name]/route.ts",
    "src/app/dashboard/ai/actions.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /subjectScopeGate\(/, `${file} must use the shared gate`);
    assert.doesNotMatch(
      source,
      /rpc\("can_author_subject"/,
      `${file} must not call the session-scoped predicate on a service-role client`,
    );
  }
});

await test("the actor-explicit predicate is what the gate asks", () => {
  assert.match(SRC, /rpc\("can_author_subject_for"/);
  assert.match(SRC, /p_actor: actorId/);
});

/* ── The second half: a policy with nothing to bind to ─────────────────── */

const DERIVE = readFileSync("supabase/migrations/20261128190000_exams_derive_subject.sql", "utf8");

await test("the exam trigger fills subject_id from the stored subject name", () => {
  assert.match(DERIVE, /new\.subject_id := v_id/);
  assert.match(DERIVE, /if new\.subject_id is not null then\s*\n\s*return new;/);
  assert.match(DERIVE, /v_hits = 1/, "only an unambiguous match may be scoped");
});

await await test("the trigger is not SECURITY DEFINER", () => {
  // A definer trigger could resolve a name against another tenant's catalogue.
  // Check the function's own definition, not the file's commentary about it.
  const fn = DERIVE.slice(DERIVE.indexOf("create or replace function"));
  assert.doesNotMatch(fn.slice(0, fn.indexOf("$$;")), /security definer/i);
});

await test("the backfill only touches rows that are currently NULL", () => {
  assert.match(DERIVE, /where e\.id = m\.exam_id\s*\n\s*and e\.subject_id is null/);
  assert.doesNotMatch(DERIVE, /delete from/i);
});

await test("the application stamps subject_id at the source as well", () => {
  const creation = readFileSync("src/lib/services/examinationCreation.ts", "utf8");
  assert.match(creation, /subject_id: subjectId/);
  assert.match(creation, /resolveSubjectIdByName\(supabase, organizationId, subjectName\)/);
});

await test("AI-authored questions record their subject", () => {
  const handlers = readFileSync("src/lib/ai/handlers.ts", "utf8");
  assert.match(handlers, /subject_id: subjectId/);
  assert.match(handlers, /RESOLVE|resolveSubjectIdByName/);
  assert.match(TOOLS, /subject: str\(\s*\n?\s*"The subject this question belongs to/);
});

/* ── Summary ──────────────────────────────────────────────────────────── */

console.log(`\nAI subject scope: ${n} checks passed.`);
if (failures.length) {
  console.error(`\n${failures.length} failed:`);
  for (const failure of failures) console.error(`  ✗ ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
