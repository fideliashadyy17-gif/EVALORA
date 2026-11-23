// Exercise candidate registration/import and code rotation server actions with
// an isolated database adapter. Active attempts are never altered.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const file = path.resolve("scripts/__candidate_access_actions.cjs");
const examId = "50000000-0000-4000-8000-000000000001";
const organizationId = "90000000-0000-4000-8000-000000000001";
let state, auditRows, generated, flash;
function setup() {
  state = {
    exams: [{ id: examId, organization_id: organizationId, status: "scheduled", access_code: "EXAM0001" }],
    exam_candidates: [],
    exam_attempts: [],
  };
  auditRows = [];
  generated = ["CAND0001", "CAND0002", "EXAM0002"];
  flash = [];
}
class Query {
  constructor(table) { this.table = table; this.filters = []; this.op = "select"; this.payload = null; this.head = false; this.wantCount = false; this.returning = false; }
  select(_columns, options = {}) { this.head = Boolean(options.head); this.wantCount = options.count === "exact"; this.returning = true; return this; }
  eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
  limit() { return this; }
  insert(value) { this.op = "insert"; this.payload = value; return this; }
  update(value) { this.op = "update"; this.payload = value; return this; }
  async rows() {
    const table = state[this.table];
    if (this.op === "insert") {
      const values = Array.isArray(this.payload) ? this.payload : [this.payload];
      const added = values.map((row, i) => ({ id: `candidate-${state.exam_candidates.length + i + 1}`, ...row }));
      table.push(...added);
      return { data: Array.isArray(this.payload) ? added : added[0], error: null };
    }
    const matching = table.filter((row) => this.filters.every((f) => f(row)));
    if (this.wantCount) return { data: null, count: matching.length, error: null };
    if (this.op === "update") {
      matching.forEach((row) => Object.assign(row, this.payload));
      return { data: this.returning ? matching : null, error: null };
    }
    return { data: this.head ? null : matching, count: matching.length, error: null };
  }
  async maybeSingle() { const result = await this.rows(); return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data }; }
  async single() { return this.maybeSingle(); }
  then(resolve, reject) { return this.rows().then(resolve, reject); }
}
const db = { from(table) { assert.ok(state[table], `unexpected table ${table}`); return new Query(table); } };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === file) {
    if (request === "@/lib/admin") return {
      requireSuperAdmin: async () => ({ user: { id: "platform-admin" } }),
      fstr: (form, key, max) => String(form.get(key) ?? "").trim().slice(0, max) || null,
      audit: async (...args) => auditRows.push(args), FLASH_COOKIE: "evalora-flash",
    };
    if (request === "@/lib/csv") return { isEmail: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), parseCsv: (text) => text.split(/\r?\n/).filter(Boolean).map((line) => line.split(",")) };
    if (request === "@/lib/supabase/server") return { createAdminClient: () => db };
    if (request === "@/lib/utils") return { genCode: () => generated.shift() ?? "FALLBACK1" };
    if (request === "next/cache") return { revalidatePath() {} };
    if (request === "next/headers") return { cookies: async () => ({ set: (...args) => flash.push(args) }) };
    if (request === "next/navigation") return { redirect(url) { const error = new Error(url); error.url = url; throw error; } };
    if (["@/lib/exam", "@/lib/platform", "@/lib/examLanguage", "@/lib/scoring"].includes(request)) return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};
const action = new Module(file);
action.filename = file;
action.paths = Module._nodeModulePaths(path.dirname(file));
action._compile(ts.transpileModule(readFileSync("src/app/admin/examinations/actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
Module._load = originalLoad;
function form(fields) { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; }
async function redirected(fn, data) { try { await fn(data); throw new Error("expected redirect"); } catch (error) { if (!error.url) throw error; return error.url; } }
let checks = 0;
async function test(name, fn) { setup(); await fn(); checks++; console.log(`  ✓ ${name}`); }

await test("registers one candidate with unique code and audit entry", async () => {
  assert.match(await redirected(action.exports.addExamCandidateAsAdmin, form({ exam_id: examId, full_name: "Ada Lovelace", email: "ADA@example.test", candidate_ref: "A-1" })), /ok=candidate_added/);
  assert.deepEqual(state.exam_candidates[0], { id: "candidate-1", exam_id: examId, full_name: "Ada Lovelace", email: "ada@example.test", candidate_ref: "A-1", access_code: "CAND0001" });
  assert.equal(auditRows.length, 1);
});
await test("rejects invalid registration input before inserting", async () => {
  assert.match(await redirected(action.exports.addExamCandidateAsAdmin, form({ exam_id: examId, full_name: "Ada", email: "not-an-email" })), /e=email/);
  assert.equal(state.exam_candidates.length, 0);
});
await test("imports valid CSV candidates, skips duplicate and malformed rows, and reports results", async () => {
  const csv = "full_name,email,candidate_ref\nAda,ada@example.test,A1\nDuplicate,ada@example.test,A2\nNo email,invalid,A3\nGrace,grace@example.test,G1";
  assert.match(await redirected(action.exports.importExamCandidatesAsAdmin, form({ exam_id: examId, csv })), /ok=import_done/);
  assert.equal(state.exam_candidates.length, 2);
  assert.deepEqual(state.exam_candidates.map((row) => row.access_code), ["CAND0001", "CAND0002"]);
  assert.equal(flash.length, 1);
  assert.match(decodeURIComponent(flash[0][1]), /2 registered, 2 skipped/);
});
await test("does not rotate a candidate code during an open exam or in-progress attempt", async () => {
  state.exams[0].status = "open";
  state.exam_candidates.push({ id: "candidate-1", exam_id: examId, full_name: "Ada", status: "in_progress", access_code: "CAND0001", exams: { organization_id: organizationId, status: "open" } });
  state.exam_attempts.push({ id: "attempt-1", candidate_id: "candidate-1", exam_id: examId, status: "in_progress" });
  assert.match(await redirected(action.exports.regenerateCandidateCodeAsAdmin, form({ candidate_id: "candidate-1" })), /e=active_attempt/);
  assert.equal(state.exam_candidates[0].access_code, "CAND0001");
  state.exams[0].status = "scheduled";
  state.exam_candidates[0].status = "registered";
  state.exam_candidates[0].exams.status = "scheduled";
  assert.match(await redirected(action.exports.regenerateCandidateCodeAsAdmin, form({ candidate_id: "candidate-1" })), /e=active_attempt/);
  assert.equal(state.exam_candidates[0].access_code, "CAND0001");
});
await test("fails closed if active-attempt status cannot be checked", async () => {
  state.exams[0].status = "scheduled";
  state.exam_candidates.push({ id: "candidate-1", exam_id: examId, full_name: "Ada", status: "registered", access_code: "CAND0001", exams: { organization_id: organizationId, status: "scheduled" } });
  const originalFrom = db.from;
  db.from = (table) => { const query = originalFrom(table); if (table === "exam_attempts") query.rows = async () => ({ count: null, error: { message: "offline" }, data: null }); return query; };
  try { assert.match(await redirected(action.exports.regenerateCandidateCodeAsAdmin, form({ candidate_id: "candidate-1" })), /e=availability/); }
  finally { db.from = originalFrom; }
  assert.equal(state.exam_candidates[0].access_code, "CAND0001");
});
await test("exam access code cannot be rotated while open or while attempts are active", async () => {
  state.exams[0].status = "open";
  assert.match(await redirected(action.exports.regenerateExamCodeAsAdmin, form({ exam_id: examId, confirm: "on" })), /e=active_attempt/);
  assert.equal(state.exams[0].access_code, "EXAM0001");
  state.exams[0].status = "scheduled";
  state.exam_attempts.push({ id: "attempt-1", exam_id: examId, status: "in_progress" });
  assert.match(await redirected(action.exports.regenerateExamCodeAsAdmin, form({ exam_id: examId, confirm: "on" })), /e=active_attempt/);
  assert.equal(state.exams[0].access_code, "EXAM0001");
});

console.log(`${checks} checks passed (actual candidate registration/code server actions with isolated database adapter).`);
