// Exercises the production Question Paper Builder server action against a
// deterministic in-memory Supabase fluent-query mock, plus route/UI wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const QUIZ = "33333333-3333-4333-8333-333333333333";
const Q1 = "44444444-4444-4444-8444-444444444444";
const Q2 = "55555555-5555-4555-8555-555555555555";
const CLASS = "66666666-6666-4666-8666-666666666666";
const SUBJECT = "77777777-7777-4777-8777-777777777777";
const ACTION_FILE = path.resolve("scripts/__virtual_paper_actions.cjs");
let state;
let allowed;
let nextId;

function setup() {
  allowed = true;
  nextId = 1;
  state = {
    quizzes: [], quiz_questions: [], exams: [], quiz_sessions: [],
    questions: [
      { id: Q1, organization_id: ORG, status: "published", points: 4 },
      { id: Q2, organization_id: ORG, status: "published", points: 3 },
    ],
    classes: [{ id: CLASS, organization_id: ORG }],
    subjects: [{ id: SUBJECT, organization_id: ORG }],
  };
}
class Query {
  constructor(table) { this.table = table; this.op = "select"; this.filters = []; this.inFilters = []; this.payload = null; this.wantCount = false; this.head = false; }
  select(_columns, options = {}) { this.wantCount = options.count === "exact"; this.head = Boolean(options.head); return this; }
  eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
  in(key, values) { this.inFilters.push((row) => values.includes(row[key])); return this; }
  order() { return this; }
  limit() { return this; }
  insert(value) { this.op = "insert"; this.payload = value; return this; }
  update(value) { this.op = "update"; this.payload = value; return this; }
  delete() { this.op = "delete"; return this; }
  async maybeSingle() { const out = await this.run(); return { ...out, data: Array.isArray(out.data) ? out.data[0] ?? null : out.data }; }
  async single() { const out = await this.maybeSingle(); return out; }
  then(resolve, reject) { return this.run().then(resolve, reject); }
  async run() {
    let rows = state[this.table];
    if (!rows) throw new Error(`unexpected table ${this.table}`);
    if (this.op === "insert") {
      const input = Array.isArray(this.payload) ? this.payload : [this.payload];
      const added = input.map((r) => ({ id: r.id ?? `generated-${nextId++}`, ...r }));
      rows.push(...added);
      return { data: Array.isArray(this.payload) ? added : added[0], error: null };
    }
    const matches = rows.filter((row) => this.filters.every((f) => f(row)) && this.inFilters.every((f) => f(row)));
    if (this.wantCount) return { data: null, count: matches.length, error: null };
    if (this.op === "update") {
      matches.forEach((row) => Object.assign(row, this.payload));
      return { data: matches, error: null };
    }
    if (this.op === "delete") {
      state[this.table] = rows.filter((row) => !matches.includes(row));
      return { data: matches, error: null };
    }
    return { data: this.head ? null : matches, count: matches.length, error: null };
  }
}

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === ACTION_FILE) {
    if (request === "@/lib/auth") return { requireUser: async () => ({ user: { id: "teacher" }, profile: { platform_role: "user" } }), activeOrg: () => ({ id: ORG }), can: () => allowed, CREATOR_ROLES: ["teacher"] };
    if (request === "@/lib/capabilities") return { hasCapability: async () => allowed };
    if (request === "@/lib/entitlements") return { getEntitlementFor: async () => ({ planName: "Test", limits: { max_quizzes: 5 } }), withinLimit: (limit, usage) => limit === -1 || usage < limit };
    if (request === "@/lib/supabase/server") return { createClient: async () => ({ from: (table) => new Query(table) }) };
    if (request === "next/cache") return { revalidatePath() {} };
    if (request === "next/navigation") return { redirect(url) { const error = new Error(url); error.url = url; throw error; } };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const action = new Module(ACTION_FILE); action.filename = ACTION_FILE; action.paths = Module._nodeModulePaths(path.dirname(ACTION_FILE));
action._compile(ts.transpileModule(readFileSync("src/app/dashboard/papers/actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, ACTION_FILE);
Module._load = originalLoad;

function paperInput(extra = {}) {
  const sections = [
    { id: "sec-a", title: "Section A", question_ids: [Q1] },
    { id: "sec-b", title: "Section B", question_ids: [Q2] },
  ];
  return { title: "Grade 8 Algebra", description: "Term test", instructions: "Show your working", status: "draft", class_id: CLASS, subject_id: SUBJECT, programme: "MYP", curriculum: "Mathematics", max_marks: 7, randomize_questions: false, randomize_options: false, sections, items: [{ question_id: Q1, points: 4, section_id: "sec-a" }, { question_id: Q2, points: 3, section_id: "sec-b" }], ...extra };
}
let checks = 0;
async function test(name, fn) { setup(); await fn(); checks++; console.log(`  ✓ ${name}`); }
await test("creates a reusable draft from scratch and saves sections, marks and metadata", async () => {
  const result = await action.exports.savePaper(paperInput());
  assert.equal(result.ok, true); assert.ok(result.id);
  assert.equal(state.quizzes.length, 1);
  const saved = state.quizzes[0];
  assert.equal(saved.organization_id, ORG); assert.equal(saved.status, "draft");
  assert.equal(saved.settings.paper_builder.instructions, "Show your working");
  assert.deepEqual(saved.settings.paper_builder.sections.map((s) => s.title), ["Section A", "Section B"]);
  assert.deepEqual(state.quiz_questions.sort((a, b) => a.position - b.position).map((q) => [q.question_id, q.points]), [[Q1, 4], [Q2, 3]]);
});
await test("publishes only non-empty papers using questions owned by the tenant", async () => {
  const result = await action.exports.savePaper(paperInput({ status: "published" }));
  assert.equal(result.ok, true); assert.equal(state.quizzes[0].status, "published");
  const empty = await action.exports.savePaper(paperInput({ status: "published", items: [], sections: [{ id: "sec-a", title: "Section A", question_ids: [] }] }));
  assert.match(empty.error, /at least one question/);
});
await test("rejects cross-tenant questions and metadata without creating a paper", async () => {
  state.questions[0].organization_id = OTHER_ORG;
  const result = await action.exports.savePaper(paperInput());
  assert.match(result.error, /unavailable in this organization/); assert.equal(state.quizzes.length, 0);
  const foreignClass = await action.exports.savePaper(paperInput({ items: [], sections: [{ id: "sec-a", title: "Section A", question_ids: [] }], class_id: "88888888-8888-4888-8888-888888888888" }));
  assert.match(foreignClass.error, /class does not belong/);
});
await test("does not edit a paper attached to an exam or live session", async () => {
  state.quizzes.push({ id: QUIZ, organization_id: ORG, title: "Historical paper", description: null, status: "published", settings: {} });
  state.quiz_questions.push({ id: "link-1", quiz_id: QUIZ, question_id: Q1, position: 0, points: 4 });
  state.exams.push({ id: "exam-1", quiz_id: QUIZ });
  const result = await action.exports.savePaper(paperInput({ id: QUIZ, title: "Changed" }));
  assert.match(result.error, /protected from edits/);
  assert.equal(state.quizzes[0].title, "Historical paper"); assert.equal(state.quiz_questions.length, 1);
});
await test("updates a safe unreferenced draft and replaces order/mark links", async () => {
  state.quizzes.push({ id: QUIZ, organization_id: ORG, title: "Old title", description: null, status: "draft", settings: { custom: true } });
  state.quiz_questions.push({ id: "old", quiz_id: QUIZ, question_id: Q1, position: 0, points: 1 });
  const result = await action.exports.savePaper(paperInput({ id: QUIZ, title: "Updated title" }));
  assert.equal(result.ok, true); assert.equal(state.quizzes[0].title, "Updated title");
  assert.equal(state.quizzes[0].settings.custom, true);
  assert.deepEqual(state.quiz_questions.filter((q) => q.quiz_id === QUIZ).sort((a, b) => a.position - b.position).map((q) => q.points), [4, 3]);
});
await test("denies roles or missing subscription capabilities before writes", async () => {
  allowed = false;
  const result = await action.exports.savePaper(paperInput());
  assert.match(result.error, /permission|plan/); assert.equal(state.quizzes.length, 0);
});
await test("enforces the organization quiz/paper quota before creating a new paper", async () => {
  state.quizzes.push(...Array.from({ length: 5 }, (_, i) => ({ id: `existing-${i}`, organization_id: ORG })));
  const result = await action.exports.savePaper(paperInput());
  assert.match(result.error, /plan allows 5 quizzes\/papers/);
  assert.equal(state.quizzes.length, 5);
});

const newExam = readFileSync("src/app/dashboard/exams/new/page.tsx", "utf8");
const paperSelection = readFileSync("src/app/dashboard/exams/new/PaperSelectionFields.tsx", "utf8");
const questionNew = readFileSync("src/app/dashboard/questions/new/page.tsx", "utf8");
const questionForm = readFileSync("src/components/QuestionForm.tsx", "utf8");
const nav = readFileSync("src/components/dashboard/DashboardChrome.tsx", "utf8");
const builder = readFileSync("src/app/dashboard/papers/PaperBuilder.tsx", "utf8");
const actionSource = readFileSync("src/app/dashboard/papers/actions.ts", "utf8");
assert.match(newExam, /\/dashboard\/papers\/new\?return_to=examination/);
assert.match(newExam, /initialPaperId=\{sp\.paper \?\? ""\}/);
assert.match(paperSelection, /setInstructions\(papers\.find\(\(paper\) => paper\.id === nextId\)\?\.instructions \?\? ""\)/);
assert.match(questionNew, /\?addQuestion=\{id\}/);
assert.match(questionForm, /successHref\.replace\("\{id\}"/);
assert.match(nav, /label: "Question Paper Builder".*capability: "examinations"/);
assert.match(builder, /Candidate paper preview/);
assert.match(builder, /RichContent doc=\{q\?\.prompt_doc/);
assert.match(builder, /sections/);
assert.match(actionSource, /\.eq\("organization_id", org\.id\)/);
assert.match(actionSource, /protected from edits/);
console.log(`\n${checks + 9} question-paper builder checks passed (server action with mocked tenant database, workflow and safety guards).`);
