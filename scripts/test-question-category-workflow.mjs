// Exercise the actual Super Admin category server actions against an isolated
// tenant-aware in-memory database adapter. No production services are called.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const file = path.resolve("scripts/__question_category_actions.cjs");
const ORG_A = "90000000-0000-4000-8000-000000000001";
const ORG_B = "90000000-0000-4000-8000-000000000002";
let rows, auditRows, idCounter;
function setup() {
  rows = [{ id: "category-b", organization_id: ORG_B, name: "Biology" }];
  auditRows = [];
  idCounter = 1;
}
class Query {
  constructor() { this.op = "select"; this.filters = []; this.payload = null; this.returning = false; }
  select() { this.returning = true; return this; }
  eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
  ilike(key, value) { const needle = value.replace(/^%|%$/g, "").toLocaleLowerCase(); this.filters.push((row) => String(row[key]).toLocaleLowerCase().includes(needle)); return this; }
  insert(value) { this.op = "insert"; this.payload = value; return this; }
  update(value) { this.op = "update"; this.payload = value; return this; }
  delete() { this.op = "delete"; return this; }
  async result() {
    if (this.op === "insert") {
      const row = { id: `category-${idCounter++}`, ...this.payload };
      rows.push(row); return { data: row, error: null };
    }
    const matching = rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.op === "update") for (const row of matching) Object.assign(row, this.payload);
    if (this.op === "delete") rows = rows.filter((row) => !matching.includes(row));
    const data = this.returning ? (this.op === "delete" ? matching : matching) : null;
    return { data, error: null };
  }
  async maybeSingle() { const result = await this.result(); return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data }; }
  async single() { return this.maybeSingle(); }
  then(resolve, reject) { return this.result().then(resolve, reject); }
}
const db = { from(table) { assert.equal(table, "question_categories"); return new Query(); } };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === file) {
    if (request === "@/lib/admin") return {
      requireSuperAdmin: async () => ({ user: { id: "platform-admin" } }),
      fstr: (form, key, max) => String(form.get(key) ?? "").trim().slice(0, max),
      audit: async (_ctx, action, _table, id, organizationId, metadata) => auditRows.push({ action, id, organizationId, metadata }),
    };
    if (request === "@/lib/supabase/server") return { createAdminClient: () => db };
    if (request === "next/cache") return { revalidatePath() {} };
    if (request === "next/navigation") return { redirect(url) { const error = new Error(url); error.url = url; throw error; } };
    if (request === "@/lib/questionValidation") return {};
    if (request === "@/lib/questionOptions") return {};
    if (request === "@/lib/questionGeneration") return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};
const action = new Module(file);
action.filename = file;
action.paths = Module._nodeModulePaths(path.dirname(file));
action._compile(ts.transpileModule(readFileSync("src/app/admin/questions/actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
Module._load = originalLoad;

function form(fields) { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; }
async function redirected(fn, data) { try { await fn(data); throw new Error("expected redirect"); } catch (error) { if (!error.url) throw error; return error.url; } }
let checks = 0;
async function test(name, fn) { setup(); await fn(); checks++; console.log(`  ✓ ${name}`); }

await test("creates organization-scoped category and audits persisted create", async () => {
  assert.match(await redirected(action.exports.saveQuestionCategoryAsAdmin, form({ organization_id: ORG_A, name: "Algebra" })), /ok=category_saved/);
  assert.deepEqual(rows.find((r) => r.organization_id === ORG_A), { id: "category-1", organization_id: ORG_A, name: "Algebra" });
  assert.equal(auditRows[0].action, "question_category.created");
});
await test("renames only the category selected within its owning organization", async () => {
  rows.push({ id: "category-a", organization_id: ORG_A, name: "Maths" });
  assert.match(await redirected(action.exports.saveQuestionCategoryAsAdmin, form({ organization_id: ORG_A, id: "category-a", name: "Mathematics" })), /ok=category_saved/);
  assert.equal(rows.find((r) => r.id === "category-a").name, "Mathematics");
  assert.equal(rows.find((r) => r.id === "category-b").name, "Biology");
});
await test("case-insensitive duplicate names are rejected without a write", async () => {
  rows.push({ id: "category-a", organization_id: ORG_A, name: "Algebra" });
  assert.match(await redirected(action.exports.saveQuestionCategoryAsAdmin, form({ organization_id: ORG_A, name: "algebra" })), /e=category_exists/);
  assert.equal(rows.filter((r) => r.organization_id === ORG_A).length, 1);
});
await test("cross-organization rename fails closed and leaves both tenants untouched", async () => {
  assert.match(await redirected(action.exports.saveQuestionCategoryAsAdmin, form({ organization_id: ORG_A, id: "category-b", name: "Changed" })), /e=category_failed/);
  assert.equal(rows[0].name, "Biology");
  assert.equal(auditRows.length, 0);
});
await test("category deletion requires confirmation and reports absent foreign rows", async () => {
  rows.push({ id: "category-a", organization_id: ORG_A, name: "Calculus" });
  assert.match(await redirected(action.exports.deleteQuestionCategoryAsAdmin, form({ organization_id: ORG_A, id: "category-a" })), /e=confirm/);
  assert.match(await redirected(action.exports.deleteQuestionCategoryAsAdmin, form({ organization_id: ORG_A, id: "category-b", confirm: "on" })), /e=category_failed/);
  assert.equal(rows.length, 2);
});
await test("confirmed deletion removes only the scoped category and records the action", async () => {
  rows.push({ id: "category-a", organization_id: ORG_A, name: "Calculus" });
  assert.match(await redirected(action.exports.deleteQuestionCategoryAsAdmin, form({ organization_id: ORG_A, id: "category-a", confirm: "on" })), /ok=category_deleted/);
  assert.deepEqual(rows, [{ id: "category-b", organization_id: ORG_B, name: "Biology" }]);
  assert.equal(auditRows[0].action, "question_category.deleted");
});

console.log(`${checks} checks passed (actual category server actions with isolated tenant adapter).`);
