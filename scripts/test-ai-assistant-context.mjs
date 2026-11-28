#!/usr/bin/env node
/**
 * The assistant's context, and where it is embedded.
 *
 * The brief asks the native assistant to understand the page it is being asked
 * from — organization, year, class, subject and the caller's permissions — and
 * to be integrated into the pages where the work happens rather than living only
 * in its own room. These tests cover both halves, and the rule that matters most:
 * a context is a HINT about intent and grants nothing. Every tool call it leads
 * to is still authorized on its own merits.
 */

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

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

const SRC = readFileSync("src/app/dashboard/ai/pageContext.ts", "utf8");
const ACTIONS = readFileSync("src/app/dashboard/ai/actions.ts", "utf8");
const PANEL = readFileSync("src/components/dashboard/AssistantPanel.tsx", "utf8");
const CLIENT = readFileSync("src/app/dashboard/ai/AssistantClient.tsx", "utf8");
const PLANNER = readFileSync("src/lib/ai/planner.ts", "utf8");

const ORG = "de000000-0000-4000-8000-000000000001";
const OTHER_ORG = "0a400000-0000-4000-8000-000000000001";
const CLASS_JSS1A = "de000000-0000-4000-8000-0000000000f1";
const MATHS = "de000000-0000-4000-8000-0000000000e7";
const EXAM = "ee000000-0000-4000-8000-000000000001";
const STUDENT = "dd000000-0000-4000-8000-000000000001";

/* ── Route mapping, driven from the real module ───────────────────────── */

const JS = ts
  .transpileModule(SRC, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "pageContext.ts",
  })
  .outputText.replace(/^import\s.*?;\s*$/gm, "")
  .replace(/^export\s+/gm, "");

const { describeRoute, loadAssistantPageContext, renderPageContextForModel } = new Function(
  `${JS}
   return { describeRoute, loadAssistantPageContext, renderPageContextForModel };`,
)();

await test("every workspace surface named in the brief is mapped", () => {
  const surfaces = {
    "/dashboard/students": "students",
    "/dashboard/teachers/assignments": "teaching_assignments",
    "/dashboard/academics/classes": "classes",
    "/dashboard/subjects": "subjects",
    "/dashboard/academic-years": "other",
    "/dashboard/questions": "question_bank",
    [`/dashboard/questions/${MATHS}`]: "question_detail",
    "/dashboard/exams": "examinations",
    [`/dashboard/exams/${EXAM}`]: "exam_detail",
    "/dashboard/quizzes": "quizzes",
    "/dashboard/grading": "grading",
    "/dashboard/attendance": "attendance",
    "/dashboard/results": "results",
    "/dashboard/analytics": "analytics",
  };
  for (const [path, surface] of Object.entries(surfaces)) {
    assert.equal(describeRoute(path).surface, surface, `${path} should map to ${surface}`);
  }
});

await test("a page id in the route is extracted for the entity it names", () => {
  assert.equal(describeRoute(`/dashboard/exams/${EXAM}`).ids.examId, EXAM);
  assert.equal(describeRoute(`/dashboard/academics/classes/${CLASS_JSS1A}`).ids.classId, CLASS_JSS1A);
  assert.equal(describeRoute("/dashboard/students").ids.studentId, undefined);
});

await test("an unmapped route is 'other', not a guess", () => {
  assert.equal(describeRoute("/dashboard/whatever").surface, "other");
});

/* ── The context is resolved, scoped and honest ───────────────────────── */

function fakeClient() {
  const tables = {
    organizations: [
      { id: ORG, name: "Demo Academy" },
      { id: OTHER_ORG, name: "Oak International School" },
    ],
    classes: [{ id: CLASS_JSS1A, organization_id: ORG, name: "JSS 1A", education_levels: { name: "JSS 1" } }],
    subjects: [{ id: MATHS, organization_id: ORG, name: "Mathematics" }],
    exams: [{ id: EXAM, organization_id: ORG, title: "Mock", status: "draft", subject_id: MATHS }],
    quizzes: [],
    questions: [],
    students: [{ id: STUDENT, organization_id: ORG, full_name: "Ada Obi" }],
    academic_years: [{ id: "yy000000-0000-4000-8000-000000000001", organization_id: ORG, name: "2025/2026", status: "active" }],
  };
  return {
    from(name) {
      let rows = (tables[name] ?? []).slice();
      const api = {
        select() { return api; },
        eq(column, value) { rows = rows.filter((r) => r[column] === value); return api; },
        limit(count) { rows = rows.slice(0, count); return api; },
        maybeSingle() { return Promise.resolve({ data: rows.length ? rows[0] : null, error: null }); },
        then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
      };
      return api;
    },
  };
}

await test("the page context names the class, subject and examination the page refers to", async () => {
  const context = await loadAssistantPageContext(fakeClient(), ORG, {
    path: `/dashboard/exams/${EXAM}`,
    permissions: { canUseAssistant: true, mayWrite: true },
  });
  assert.equal(context.exam?.id, EXAM);
  assert.equal(context.organization.name, "Demo Academy");
  assert.equal(context.academicYear?.name, "2025/2026", "the active year is used when the page names none");
  assert.equal(context.permissions.mayWrite, true);
});

await test("an entity from another organization does not resolve", async () => {
  // Same shape, wrong tenant: the lookup is scoped by organization, so this
  // must come back empty rather than describing another school's class.
  const context = await loadAssistantPageContext(fakeClient(), OTHER_ORG, {
    path: `/dashboard/academics/classes/${CLASS_JSS1A}`,
    permissions: { canUseAssistant: true, mayWrite: false },
  });
  assert.equal(context.class, null);
  assert.ok(context.notes.some((note) => /could not be found/.test(note)), "the miss must be stated");
});

await test("a page with no specific record says so rather than inventing one", async () => {
  const context = await loadAssistantPageContext(fakeClient(), ORG, {
    path: "/dashboard/students",
    permissions: { canUseAssistant: true, mayWrite: true },
  });
  assert.equal(context.class, null);
  assert.match(context.summary, /ask which one/i);
});

await test("the summary states the caller's write position", async () => {
  const reader = await loadAssistantPageContext(fakeClient(), ORG, {
    path: "/dashboard/students",
    permissions: { canUseAssistant: true, mayWrite: false },
  });
  assert.match(reader.summary, /draft but not commit/);
});

await test("a missing organization is an error, not an empty school", async () => {
  await assert.rejects(
    () => loadAssistantPageContext(fakeClient(), "ffffffff-ffff-4fff-8fff-ffffffffffff", {
      path: "/dashboard/students",
      permissions: { canUseAssistant: true, mayWrite: false },
    }),
    /could not be read/,
  );
});

await test("the model is shown the summary and the notes together", async () => {
  const context = await loadAssistantPageContext(fakeClient(), ORG, {
    path: "/dashboard/students",
    permissions: { canUseAssistant: true, mayWrite: true },
  });
  const text = renderPageContextForModel(context);
  assert.match(text, /Demo Academy/);
});

/* ── Wiring: the context reaches the planner and the gate ─────────────── */

await test("the assistant loads page context from a server-validated path only", () => {
  assert.match(ACTIONS, /pagePath\.startsWith\("\/dashboard\/"\)/);
  assert.match(ACTIONS, /loadAssistantPageContext\(admin, org\.id/);
  assert.match(ACTIONS, /Only the\s*\n?\s*\/\/ path is taken from the client/);
});

await test("a context that cannot be read is stated, not silently dropped", () => {
  assert.match(ACTIONS, /The page context could not be read, so ask the teacher which class/);
});

await test("the page context is given to both the preview and the execute planner", () => {
  const occurrences = [...ACTIONS.matchAll(/renderContextForModel\(context, 3000\), pageContextText/g)];
  assert.equal(occurrences.length, 2, "preview and execute must both see the page");
});

await test("the planner passes the subject gate into every step it executes", () => {
  // A plan's steps run through the engine. Without the resolver, an absent
  // subjectScope reads as "no subject scope to enforce" and the gate is skipped.
  assert.match(PLANNER, /subjectScope: deps\.subjectScope/);
  assert.match(PLANNER, /subjectScope\?: EngineDeps\["subjectScope"\]/);
  assert.match(ACTIONS, /subjectScope: subjectScopeGate\(admin, org\.id, ctx\.user\.id\)/);
});

await test("the turn reports the context back, so the teacher can see what was understood", () => {
  assert.match(ACTIONS, /pageContext: pageContext/);
  assert.match(CLIENT, /turn\.pageContext/);
});

/* ── Integration into the pages the brief names ───────────────────────── */

const PAGES = [
  ["src/app/dashboard/students/page.tsx", "student registration and the roster"],
  ["src/app/dashboard/teachers/assignments/page.tsx", "teaching assignments"],
  ["src/app/dashboard/questions/page.tsx", "the question bank"],
  ["src/app/dashboard/exams/[id]/page.tsx", "one examination"],
  ["src/app/dashboard/grading/page.tsx", "marking"],
  ["src/app/dashboard/results/page.tsx", "results"],
];

await test("the assistant is embedded on the surfaces the brief names", () => {
  for (const [file, what] of PAGES) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /<AssistantPanel/, `${what} must carry the assistant`);
  }
});

await test("every embedded panel renders at page level, not inside a conditional", () => {
  for (const [file, what] of PAGES) {
    const source = readFileSync(file, "utf8");
    const at = source.indexOf("<AssistantPanel");
    // A panel nested inside `{condition && ...}` would vanish for some users and
    // appear for others depending on data, which is not a decision the panel makes.
    const before = source.slice(Math.max(0, at - 400), at);
    const depth = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
    assert.ok(depth <= 2, `${what}: the panel sits ${depth} braces deep inside a block`);
  }
});

await test("the panel renders nothing when the assistant is unavailable", () => {
  // Not a disabled shell: a school without the module must not carry a dead panel.
  assert.match(PANEL, /if \(!moduleEnabled\(entitlement\.modules, "ai_assistant"\)\) return null;/);
  assert.match(PANEL, /if \(!canUse\) return null;/);
  assert.match(PANEL, /activeOrg\(ctx\)[\s\S]{0,80}return null/);
});

await test("the embedded panel is the same component and the same server action", () => {
  // A second component would be a second assistant that happens to agree today.
  assert.match(PANEL, /<AssistantClient\s+embedded/);
  assert.match(CLIENT, /const turn = await runAssistant\(/);
  assert.match(CLIENT, /pagePath: pathname/);
});

await test("the embedded composer keeps preview and execute separate", () => {
  const embedded = CLIENT.slice(CLIENT.indexOf("if (embedded)"), CLIENT.indexOf("return (\n    <div className=\"grid gap-6"));
  assert.match(embedded, /submit\("preview"\)/);
  assert.match(embedded, /submit\("execute"\)/);
  assert.match(embedded, /Nothing is created or changed by/);
});

await test("sensitive operations still require approval when embedded", () => {
  assert.match(CLIENT, /approval_required/);
  assert.match(CLIENT, /Needs a human approval before it can run/);
});

console.log(`\nAssistant page context: ${n} checks passed.`);
if (failures.length) {
  console.error(`\n${failures.length} failed:`);
  for (const failure of failures) console.error(`  ✗ ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
