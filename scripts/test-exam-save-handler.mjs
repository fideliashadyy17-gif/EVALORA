// Exercise the real exam save route with a mocked database boundary.
// Run: node scripts/test-exam-save-handler.mjs
// This is not a replacement for authenticated, database-backed E2E tests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const filename = path.resolve("scripts/__virtual_exam_save_handler.cjs");
const compiled = ts.transpileModule(readFileSync("src/app/api/exam/save/route.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const examTrackSource = ts.transpileModule(readFileSync("src/lib/examTrack.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const examTrack = {};
new Function("exports", examTrackSource)(examTrack);
const ids = {
  attempt: "00000000-0000-4000-8000-000000000001",
  token: "00000000-0000-4000-8000-000000000002",
  question: "00000000-0000-4000-8000-000000000003",
  quizQuestion: "00000000-0000-4000-8000-000000000004",
  otherQuizQuestion: "00000000-0000-4000-8000-000000000005",
};
let scenario;
function setup(overrides = {}) {
  scenario = { exists: true, authorized: true, expired: false, status: "in_progress", dbError: false, flagError: false, flagWrites: [], writes: [], track: null, questionOrder: undefined, ...overrides };
}
const admin = {
  from(table) {
    if (table === "quiz_questions") {
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        async maybeSingle() {
          assert.equal(filters.quiz_id, "quiz-1");
          assert.equal(filters.question_id, ids.question);
          return { data: scenario.exists ? { id: ids.quizQuestion } : null };
        },
      };
      return query;
    }
    if (table === "exam_answers") return { async upsert(data) { scenario.writes.push(data); return { error: scenario.dbError ? new Error("db") : null }; } };
    if (table === "exam_attempts") return { update(data) { scenario.flagWrites.push(data); return { async eq() { return { error: scenario.flagError ? new Error("flags db") : null }; } }; } };
    throw new Error(`Unexpected table ${table}`);
  },
};
const exam = {
  async loadAttemptContext(_admin, attempt, token) {
    return scenario.authorized && attempt === ids.attempt && token === ids.token
      ? {
          attempt: {
            id: ids.attempt, status: scenario.status, started_at: "2026-01-01", extension_minutes: 0,
            track: scenario.track, question_order: scenario.questionOrder,
          },
          exam: { quiz_id: "quiz-1" },
        }
      : null;
  },
  attemptDeadline() { return new Date(scenario.expired ? "2000-01-01" : "2100-01-01"); },
};
const virtual = new Module(filename);
virtual.filename = filename;
virtual.paths = Module._nodeModulePaths(path.dirname(filename));
virtual.require = (id) => {
  if (id === "@/lib/exam") return exam;
  if (id === "@/lib/supabase/server") return { createAdminClient: () => admin };
  if (id === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } };
  if (id === "@/lib/examTrack") return examTrack;
  return require(id);
};
virtual._compile(compiled, filename);
const POST = virtual.exports.POST;
const body = { attempt_id: ids.attempt, token: ids.token, question_id: ids.question, answer: { text: "answer" } };
async function request(payload = body) {
  return POST(new Request("http://test.local/api/exam/save", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  }));
}
let count = 0;
async function check(label, fn) { await fn(); console.log(`  ✓ ${label}`); count++; }
await check("valid ID accepted and server association stored", async () => {
  setup(); const response = await request({ ...body, quiz_question_id: ids.quizQuestion });
  assert.equal(response.status, 200); assert.equal(scenario.writes[0].quiz_question_id, ids.quizQuestion);
});
await check("omitted optional ID uses server association", async () => {
  setup(); const response = await request(); assert.equal(response.status, 200); assert.equal(scenario.writes[0].quiz_question_id, ids.quizQuestion);
});
await check("mismatched ID rejected without a write", async () => {
  setup(); const response = await request({ ...body, quiz_question_id: ids.otherQuizQuestion });
  assert.equal(response.status, 400); assert.equal(scenario.writes.length, 0);
});
await check("question outside exam rejected without a write", async () => {
  setup({ exists: false }); assert.equal((await request()).status, 400); assert.equal(scenario.writes.length, 0);
});
await check("invalid token rejected without a write", async () => {
  setup({ authorized: false }); assert.equal((await request()).status, 404); assert.equal(scenario.writes.length, 0);
});
await check("expired attempt rejected without a write", async () => {
  setup({ expired: true }); assert.equal((await request()).status, 409); assert.equal(scenario.writes.length, 0);
});
await check("submitted attempt rejected without a write", async () => {
  setup({ status: "submitted" }); assert.equal((await request()).status, 409); assert.equal(scenario.writes.length, 0);
});
await check("database failure does not report success", async () => {
  setup({ dbError: true }); assert.equal((await request()).status, 500);
});
await check("answer and flags are both acknowledged on success", async () => {
  setup(); assert.equal((await request({ ...body, flagged: [ids.question] })).status, 200);
  assert.equal(scenario.writes.length, 1); assert.deepEqual(scenario.flagWrites, [{ flagged: [ids.question] }]);
});
await check("flag failure is reported even if answer was already stored", async () => {
  setup({ flagError: true }); assert.equal((await request({ ...body, flagged: [ids.question] })).status, 500);
  assert.equal(scenario.writes.length, 1); assert.equal(scenario.flagWrites.length, 1);
});
await check("malformed payload rejected", async () => {
  setup(); assert.equal((await request({ ...body, question_id: "not-a-uuid" })).status, 400); assert.equal(scenario.writes.length, 0);
});
await check("AB attempt cannot save an answer to a row outside its stored paper", async () => {
  setup({ track: "AB", questionOrder: ["00000000-0000-4000-8000-0000000000aa"] });
  const response = await request({ ...body, quiz_question_id: ids.quizQuestion });
  assert.equal(response.status, 400); assert.equal(scenario.writes.length, 0, "no write for a BC-only row");
});
await check("AB attempt can save an answer to a row in its stored paper", async () => {
  setup({ track: "AB", questionOrder: [ids.quizQuestion] });
  const response = await request();
  assert.equal(response.status, 200); assert.equal(scenario.writes[0].quiz_question_id, ids.quizQuestion);
});
console.log(`\n${count} exam save handler checks passed (mocked DB).`);
