// Question Studio templates — the reusable authoring library.
//
// This suite executes the REAL template library (src/lib/questionTemplates.ts)
// and the REAL Super Admin actions (src/app/admin/questions/templates/actions.ts)
// with only the database faked, so every assertion is about shipped code:
//
//   • a template is a COPY, never a live link — applying one strips identity,
//     forces a draft, and snapshots the design tokens into the question, so
//     editing or archiving a template can never restyle an examination that is
//     already scheduled, open or published;
//   • tenant isolation: a template made from a question keeps that question's
//     organization even when the form names another one, and an organization can
//     only read its own templates plus the platform-wide library;
//   • the counters and filters behave as documented, including failing soft when
//     the store is unreachable;
//   • every mutation requires a verified Super Admin, is audited, and a delete
//     needs the explicit confirmation tick.
import "./__platform_config_stubs.mjs";

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const ROOT = process.cwd();
let passed = 0;
const failures = [];

function check(label, fn) {
  try {
    const out = fn();
    if (out instanceof Promise) {
      return out.then(
        () => { passed += 1; },
        (e) => { failures.push(`${label}: ${e?.message ?? e}`); },
      );
    }
    passed += 1;
  } catch (error) {
    failures.push(`${label}: ${error?.message ?? error}`);
  }
  return undefined;
}

/* ───────────────────────── source loader ───────────────────────── */
const fakes = new Map();
const loaded = new Map();
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function isFile(candidate) {
  try { return statSync(candidate).isFile(); } catch { return false; }
}
function resolveFile(base, suffix = "") {
  const stem = suffix ? path.resolve(base, suffix) : base;
  if (isFile(stem)) return stem;
  for (const ext of EXTENSIONS) {
    const candidate = `${stem}${ext}`;
    if (isFile(candidate)) return candidate;
  }
  return null;
}
const src = (rel) => path.join(ROOT, rel);
const read = (rel) => readFileSync(src(rel), "utf8");
function resolveRequest(request, parentFile) {
  if (request.startsWith("@/")) return resolveFile(src("src"), request.slice(2));
  if (request.startsWith(".")) return resolveFile(path.dirname(parentFile), request);
  return null;
}
function load(relOrAbs) {
  const file = path.isAbsolute(relOrAbs) ? relOrAbs : src(relOrAbs);
  if (fakes.has(file)) return fakes.get(file);
  if (loaded.has(file)) return loaded.get(file);

  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  loaded.set(file, mod.exports);
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === file) {
      const target = resolveRequest(request, file);
      if (target) return load(target);
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: file,
    });
    mod._compile(outputText, file);
    loaded.set(file, mod.exports);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

/* ───────────────────────── in-memory database ───────────────────────── */
const ORG_A = "de000000-0000-4000-8000-000000000001"; // EVALORA DEMO ACADEMY
const ORG_B = "0a400000-0000-4000-8000-000000000001"; // Oak International School
const ADMIN = randomUUID();

const db = {
  question_templates: [],
  questions: [],
  question_options: [],
  organizations: [
    { id: ORG_A, name: "EVALORA DEMO ACADEMY", slug: "demo", type: "school", status: "active" },
    { id: ORG_B, name: "Oak International School", slug: "ois", type: "school", status: "active" },
  ],
  audit_logs: [],
};
const rpcCalls = [];
const revalidated = [];
/** Every column list a read asked for, so a stale select list can be caught. */
const selectedColumns = [];
let failNextRead = false;
let failNextWrite = false;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Apply the recorded filters of a builder to one row. */
function matches(row, state) {
  for (const [op, column, value] of state.filters) {
    if (op === "eq" && row[column] !== value) return false;
    if (op === "neq" && row[column] === value) return false;
    if (op === "is") {
      const actual = row[column] ?? null;
      if (actual !== (value ?? null)) return false;
    }
    if (op === "in" && !value.includes(row[column])) return false;
    if (op === "ilike") {
      const needle = String(value).replace(/%/g, "");
      if (!String(row[column] ?? "").toLowerCase().includes(needle.toLowerCase())) return false;
    }
  }
  for (const expr of state.orClauses) {
    const clauses = String(expr).split(",");
    const ok = clauses.some((clause) => {
      const [column, op, raw] = clause.split(".");
      if (op === "is") return (row[column] ?? null) === (raw === "null" ? null : raw);
      if (op === "eq") return row[column] === raw;
      return false;
    });
    if (!ok) return false;
  }
  return true;
}

function settle(state) {
  if (failNextWrite && state.mode !== "select") {
    return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" }, count: 0 };
  }
  if (failNextRead && (state.mode === "select" || state.mode === "rpc")) {
    return { data: null, error: { message: "connection terminated", code: "08006" }, count: 0 };
  }
  const table = db[state.table] ?? [];

  if (state.mode === "insert") {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      status: "active",
      usage_count: 0,
      tags: [],
      content: {},
      design: {},
      created_at: now,
      updated_at: now,
      ...clone(state.payload),
    };
    table.push(row);
    db[state.table] = table;
    return { data: state.returnRows ? [clone(row)] : null, error: null, count: 1 };
  }
  if (state.mode === "update") {
    let count = 0;
    for (const row of table) {
      if (matches(row, state)) {
        Object.assign(row, clone(state.payload));
        count += 1;
      }
    }
    return { data: null, error: null, count };
  }
  if (state.mode === "delete") {
    const keep = [];
    let removed = 0;
    for (const row of table) {
      if (matches(row, state)) removed += 1;
      else keep.push(row);
    }
    db[state.table] = keep;
    return { data: null, error: null, count: removed };
  }

  let rows = table.filter((row) => matches(row, state));
  for (const [column, ascending] of [...state.orders].reverse()) {
    rows = [...rows].sort((a, b) => {
      const left = a[column];
      const right = b[column];
      if (left === right) return 0;
      const cmp = left === null || left === undefined ? -1 : right === null || right === undefined ? 1 : left > right ? 1 : -1;
      return ascending ? cmp : -cmp;
    });
  }
  const total = rows.length;
  if (state.limit !== null) rows = rows.slice(0, state.limit);
  return { data: clone(rows), error: null, count: total };
}

/** A lazy thenable builder — work happens on await, never at chain time. */
function builder(table) {
  const state = {
    table,
    mode: "select",
    filters: [],
    orClauses: [],
    orders: [],
    limit: null,
    payload: null,
    returnRows: false,
    single: false,
  };
  const api = {
    select(columns = "*", options) {
      state.returnRows = true;
      if (options?.count) state.counted = true;
      selectedColumns.push({ table, columns });
      return api;
    },
    insert(row) { state.mode = "insert"; state.payload = row; state.returnRows = false; return api; },
    update(patch) { state.mode = "update"; state.payload = patch; return api; },
    delete() { state.mode = "delete"; return api; },
    eq(column, value) { state.filters.push(["eq", column, value]); return api; },
    neq(column, value) { state.filters.push(["neq", column, value]); return api; },
    is(column, value) { state.filters.push(["is", column, value]); return api; },
    in(column, values) { state.filters.push(["in", column, values]); return api; },
    ilike(column, pattern) { state.filters.push(["ilike", column, pattern]); return api; },
    or(expression) { state.orClauses.push(expression); return api; },
    order(column, options) { state.orders.push([column, options?.ascending !== false]); return api; },
    limit(n) { state.limit = n; return api; },
    range(from, to) { state.limit = to - from + 1; return api; },
    single() { state.single = "single"; return api; },
    maybeSingle() { state.single = "maybe"; return api; },
    then(resolve, reject) {
      return Promise.resolve()
        .then(() => settle(state))
        .then((result) => {
          if (!state.single) return result;
          const rows = Array.isArray(result.data) ? result.data : [];
          if (state.single === "single" && rows.length !== 1) {
            return { data: null, error: { message: rows.length ? "multiple rows" : "no rows" }, count: 0 };
          }
          return { data: rows[0] ?? null, error: result.error, count: result.count };
        })
        .then(resolve, reject);
    },
  };
  return api;
}

const fakeClient = {
  from: (table) => builder(table),
  rpc: async (fn, args) => {
    rpcCalls.push({ fn, args });
    if (failNextRead) return { data: null, error: { message: "unavailable" } };
    if (fn !== "question_templates_record_use") return { data: null, error: { message: `unknown function ${fn}` } };
    const row = db.question_templates.find((t) => t.id === args?.p_template_id);
    if (!row) return { data: 0, error: null };
    row.usage_count += 1;
    return { data: row.usage_count, error: null };
  },
  storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: (p) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) }) },
};

fakes.set(src("src/lib/supabase/server.ts"), {
  createAdminClient: () => fakeClient,
  createClient: async () => fakeClient,
  createBrowseClient: () => fakeClient,
});
fakes.set(src("src/lib/auth.ts"), {
  requireSuperAdmin: async () => ({ user: { id: ADMIN }, profile: { platform_role: "super_admin" }, memberships: [] }),
  requireUser: async () => ({ user: { id: ADMIN }, profile: { platform_role: "super_admin" }, memberships: [] }),
  activeOrg: () => ({ id: ORG_A, name: "EVALORA DEMO ACADEMY" }),
});
// `next/cache` is a bare specifier handled by the shared harness stub, so it is
// intercepted at the loader level (installed after the stubs) rather than as a
// faked source file. Recording the paths proves a write refreshes the surfaces
// that render templates.
const stubLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "next/cache") {
    return {
      revalidatePath: (target) => revalidated.push(target),
      revalidateTag: () => {},
      unstable_cache: (fn) => fn,
    };
  }
  return stubLoad.call(this, request, parent, isMain);
};

const templates = load("src/lib/questionTemplates.ts");
const actions = load("src/app/admin/questions/templates/actions.ts");

/* Redirects are thrown by the real next/navigation stub. */
function redirectOf(promise) {
  return promise.then(
    () => ({ url: null }),
    (error) => ({ url: error?.url ?? null, error }),
  );
}
function form(entries) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === null) continue;
    fd.set(key, String(value));
  }
  return fd;
}
function seedTemplate(overrides = {}) {
  const row = {
    id: randomUUID(),
    organization_id: null,
    name: "Platform numeric starter",
    description: "A worked numeric question.",
    question_type: "numeric",
    subject: "Mathematics",
    grade_label: "Grade 9",
    curriculum: "IB MYP Mathematics",
    topic: "Quadratics",
    difficulty: "medium",
    content: { type: "numeric", prompt: "Solve for x.", points: 2, status: "published", config: { numeric_answer: 3, tolerance: 0.01 } },
    design: { numbering_style: "arabic_dot_paren", card_layout: "outline_bold", corner_radius: 4, font_size_px: 17 },
    tags: ["algebra", "worked"],
    status: "active",
    usage_count: 3,
    created_by: ADMIN,
    created_at: "2026-11-01T10:00:00.000Z",
    updated_at: "2026-11-20T10:00:00.000Z",
    ...overrides,
  };
  db.question_templates.push(row);
  return row;
}
function resetDb() {
  db.question_templates.length = 0;
  db.questions.length = 0;
  db.question_options.length = 0;
  db.audit_logs.length = 0;
  rpcCalls.length = 0;
  revalidated.length = 0;
  selectedColumns.length = 0;
  failNextRead = false;
  failNextWrite = false;
}

/* ══════════════ 1. a template is a copy, never a live link ══════════════ */

await check("applying a template strips every identity and forces a draft", () => {
  const row = {
    question_type: "numeric",
    difficulty: "hard",
    topic: "Quadratics",
    content: {
      id: "2f000000-0000-4000-8000-000000000099",
      organization_id: ORG_B,
      type: "numeric",
      prompt: "Solve for x.",
      points: 2,
      status: "published",
      config: { numeric_answer: 3, tolerance: 0.01 },
      smuggled_column: "must not survive",
    },
    design: { numbering_style: "arabic_dot_paren", corner_radius: 4 },
  };
  const initial = templates.templateContentForEditor(row);
  assert.equal(initial.id, undefined, "a template creates a NEW question, never overwrites one");
  assert.equal(initial.organization_id, undefined);
  assert.equal(initial.smuggled_column, undefined, "only keys the editor understands survive");
  assert.equal(initial.status, "draft", "a new question always starts as a draft");
  assert.equal(initial.type, "numeric");
  assert.equal(initial.difficulty, "hard");
  assert.equal(initial.topic, "Quadratics");
  assert.equal(initial.config.numeric_answer, 3, "marking configuration is carried over");
});

await check("the template's design becomes the new question's own snapshot", () => {
  const initial = templates.templateContentForEditor({
    question_type: "single_choice",
    content: { type: "single_choice", prompt: "Pick one.", points: 1, config: { design: { font_size_px: 20 } } },
    design: { numbering_style: "arabic_bracket", card_layout: "outline_bold", corner_radius: 2 },
  });
  const design = initial.config.design;
  assert.equal(design.numberingStyle, "arabic_bracket", "the template's numbering style is applied");
  assert.equal(design.cardLayout, "outline_bold");
  assert.equal(design.cornerRadius, 2);
  assert.equal(design.fontSizePx, 20, "the template payload's own tokens win over the template column");
  assert.equal(typeof design.spacing, "number", "unspecified tokens fall back to the shipped appearance");
});

await check("editing a template afterwards cannot restyle the question made from it", () => {
  const row = seedTemplate({ design: { numbering_style: "arabic_dot_paren", card_layout: "outline_bold" } });
  const first = templates.templateContentForEditor(row);
  row.design = { numbering_style: "roman_lower", card_layout: "panel" };
  row.content.config = { ...(row.content.config ?? {}), numeric_answer: 99 };
  const second = templates.templateContentForEditor(row);
  assert.equal(first.config.design.numberingStyle, "arabic_dot_paren", "the earlier copy is untouched");
  assert.equal(first.config.numeric_answer, 3);
  assert.equal(second.config.design.numberingStyle, "roman_lower", "the later copy follows the new template");
  assert.notDeepEqual(first.config.design, second.config.design);
  resetDb();
});

await check("snapshotting a question moves the design into its own column and drops identity", () => {
  const { content, design } = templates.questionToTemplateContent({
    id: "3a000000-0000-4000-8000-0000000000aa",
    organization_id: ORG_B,
    type: "single_choice",
    prompt: "Which is prime?",
    points: 1,
    difficulty: "easy",
    status: "published",
    options: [{ label: "2", is_correct: true }],
    config: { design: { numbering_style: "arabic_bracket", font_size_px: 18 }, media_url: "/q/media.png" },
    prompt_hash: "abc123",
  });
  assert.equal(content.id, undefined);
  assert.equal(content.organization_id, undefined);
  assert.equal(content.prompt_hash, undefined, "columns a template has no business storing are dropped");
  assert.equal(content.status, "draft", "a template never publishes content by itself");
  assert.equal(content.config.design, undefined, "design tokens live only in the design column");
  assert.equal(content.config.media_url, "/q/media.png");
  assert.equal(design.numberingStyle, "arabic_bracket");
  assert.equal(design.fontSizePx, 18);
  assert.deepEqual(content.options, [{ label: "2", is_correct: true }]);
});

await check("two questions from one template are independent copies", () => {
  const row = seedTemplate();
  const a = templates.templateContentForEditor(row);
  const b = templates.templateContentForEditor(row);
  a.config.numeric_answer = 42;
  a.config.design.fontSizePx = 30;
  assert.equal(b.config.numeric_answer, 3, "the second copy is unaffected by edits to the first");
  assert.equal(b.config.design.fontSizePx, 17);
  resetDb();
});

/* ══════════════ 2. bounded, closed vocabularies ══════════════ */

await check("question types are validated against the real renderer registry", () => {
  assert.equal(templates.knownQuestionType("single_choice"), "single_choice");
  assert.equal(templates.knownQuestionType("assess_parts"), "assess_parts");
  assert.equal(templates.knownQuestionType("  numeric  "), "numeric");
  assert.equal(templates.knownQuestionType("essay_v2"), null, "an invented type would offer something the engine cannot render");
  assert.equal(templates.knownQuestionType(null), null);
  assert.equal(templates.knownQuestionType(7), null);
  assert.equal(templates.knownQuestionType("DROP TABLE questions"), null);
});

await check("tags are trimmed, de-duplicated and bounded", () => {
  assert.deepEqual(templates.normalizeTags("algebra, Algebra ,worked\nexam"), ["algebra", "worked", "exam"]);
  assert.deepEqual(templates.normalizeTags(["a", "", "   ", "b"]), ["a", "b"]);
  assert.equal(templates.normalizeTags(Array.from({ length: 40 }, (_, i) => `tag${i}`)).length, templates.TEMPLATE_LIMITS.tags);
  assert.equal(templates.normalizeTags("x".repeat(200))[0].length, templates.TEMPLATE_LIMITS.tagLength);
  assert.deepEqual(templates.normalizeTags(42), []);
  assert.deepEqual(templates.normalizeTags(null), []);
});

await check("status is a closed pair and anything unknown means active", () => {
  assert.deepEqual([...templates.TEMPLATE_STATUSES], ["active", "archived"]);
  assert.equal(templates.normalizeTemplateStatus("archived"), "archived");
  assert.equal(templates.normalizeTemplateStatus("ARCHIVED"), "active", "only the exact stored value archives");
  assert.equal(templates.normalizeTemplateStatus("deleted"), "active");
  assert.equal(templates.normalizeTemplateStatus(undefined), "active");
});

await check("scope labels are derived, never stored twice", () => {
  assert.equal(templates.describeTemplateScope({ organization_id: null }), "platform");
  assert.equal(templates.describeTemplateScope({ organization_id: ORG_A }), "organization");
});

await check("payload size is checked before anything is written", () => {
  assert.equal(templates.templatePayloadWithinLimits({ prompt: "short" }, {}), true);
  assert.equal(templates.templatePayloadWithinLimits({ prompt: "x".repeat(templates.TEMPLATE_LIMITS.content + 10) }, {}), false);
  const circular = {};
  circular.self = circular;
  assert.equal(templates.templatePayloadWithinLimits(circular, {}), false, "an unserializable payload is refused, not thrown");
});

/* ══════════════ 3. scoped reads: one tenant never sees another ══════════════ */

await check("the Super Admin overview lists every scope", async () => {
  resetDb();
  seedTemplate({ name: "Platform one" });
  seedTemplate({ name: "Demo academy one", organization_id: ORG_A });
  seedTemplate({ name: "Oak one", organization_id: ORG_B });
  const rows = await templates.listQuestionTemplates();
  assert.equal(rows.length, 3);
});

await check("an organization sees its own templates plus the platform library, never another school's", async () => {
  const rows = await templates.listTemplatesForOrganization(ORG_A);
  const names = rows.map((r) => r.name).sort();
  assert.deepEqual(names, ["Demo academy one", "Platform one"]);
  assert.ok(!names.includes("Oak one"), "Oak's authored content must not leak to the demo academy");
});

await check("the platform-wide filter returns only platform templates", async () => {
  const rows = await templates.listQuestionTemplates({ organizationId: null });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Platform one");
});

await check("the exact-scope filter used by the console excludes platform-wide rows", async () => {
  const rows = await templates.listQuestionTemplates({ organizationId: ORG_B });
  assert.deepEqual(rows.map((r) => r.name), ["Oak one"]);
});

await check("a malformed scope never widens to every template", async () => {
  assert.deepEqual(await templates.listQuestionTemplates({ organizationId: "not-a-uuid" }), []);
  assert.deepEqual(await templates.listQuestionTemplates({ organizationId: "1 OR 1=1" }), []);
});

await check("status, type and name filters narrow the list", async () => {
  seedTemplate({ name: "Archived numeric", status: "archived", question_type: "numeric", organization_id: ORG_A });
  const active = await templates.listQuestionTemplates({ status: "active" });
  assert.ok(active.every((r) => r.status === "active"));
  assert.ok(!active.some((r) => r.name === "Archived numeric"));
  const archived = await templates.listQuestionTemplates({ status: "archived" });
  assert.deepEqual(archived.map((r) => r.name), ["Archived numeric"]);
  const numeric = await templates.listQuestionTemplates({ questionType: "numeric" });
  assert.ok(numeric.length >= 2 && numeric.every((r) => r.question_type === "numeric"));
  const search = await templates.listQuestionTemplates({ search: "archived" });
  assert.deepEqual(search.map((r) => r.name), ["Archived numeric"]);
  const unknownType = await templates.listQuestionTemplates({ questionType: "essay_v2" });
  assert.equal(unknownType.length, db.question_templates.length, "an invented type filter is ignored rather than matching nothing silently");
});

await check("archived templates are never offered to authors", async () => {
  const offered = await templates.listTemplatesForOrganization(ORG_A);
  assert.ok(offered.every((r) => r.status === "active"));
  assert.ok(!offered.some((r) => r.name === "Archived numeric"));
});

await check("the list is bounded and fails soft when the store is unreachable", async () => {
  const bounded = await templates.listQuestionTemplates({ limit: 2 });
  assert.equal(bounded.length, 2);
  failNextRead = true;
  assert.deepEqual(await templates.listQuestionTemplates(), [], "an unreachable store must not break the authoring surface");
  failNextRead = false;
});

await check("a single template read is scoped by organization when one is given", async () => {
  const oak = db.question_templates.find((t) => t.name === "Oak one");
  const platform = db.question_templates.find((t) => t.name === "Platform one");
  assert.equal((await templates.getQuestionTemplate(oak.id, ORG_A)), null, "the demo academy cannot read Oak's template");
  assert.equal((await templates.getQuestionTemplate(oak.id, ORG_B)).id, oak.id);
  assert.equal((await templates.getQuestionTemplate(platform.id, ORG_A)).id, platform.id, "platform-wide templates are readable by every tenant");
  assert.equal((await templates.getQuestionTemplate(platform.id)).id, platform.id, "Super Admin reads without a scope filter");
  assert.equal(await templates.getQuestionTemplate("bogus"), null);
  const demo = db.question_templates.find((t) => t.name === "Demo academy one");
  assert.equal(await templates.getQuestionTemplate(demo.id, null), null, "the platform-only filter excludes an org-scoped row");
});

/* ══════════════ 4. the usage counter is real and cannot fail a save ══════════════ */

await check("recording a use increments atomically in Postgres and returns the new count", async () => {
  const row = seedTemplate({ name: "Counted", usage_count: 4 });
  assert.equal(await templates.recordTemplateUse(row.id), 5);
  assert.equal(await templates.recordTemplateUse(row.id), 6);
  assert.equal(db.question_templates.find((t) => t.id === row.id).usage_count, 6);
  assert.deepEqual(rpcCalls.map((c) => c.fn), ["question_templates_record_use", "question_templates_record_use"]);
  assert.deepEqual(rpcCalls[0].args, { p_template_id: row.id });
});

await check("a counter can never throw at a caller", async () => {
  const row = seedTemplate({ name: "Failing counter", usage_count: 1 });
  failNextRead = true;
  assert.equal(await templates.recordTemplateUse(row.id), 0, "an unavailable RPC reports zero, it does not raise");
  failNextRead = false;
  assert.equal(await templates.recordTemplateUse("not-a-uuid"), 0);
  assert.equal(await templates.recordTemplateUse(randomUUID()), 0, "an unknown template counts nothing");
  resetDb();
});

await check("the counter is wired to question creation in both save paths", () => {
  const adminSave = read("src/app/admin/questions/actions.ts");
  const dashboardSave = read("src/app/dashboard/questions/actions.ts");
  assert.ok(adminSave.includes("recordTemplateUse(q.template_id)"), "the Super Admin save counts one use");
  assert.ok(dashboardSave.includes("getQuestionTemplate(q.template_id, org.id)"), "the organization save first checks the template is readable by that organization");
  assert.ok(dashboardSave.includes("recordTemplateUse(q.template_id)"));
  const insertBlock = adminSave.slice(adminSave.indexOf('from("questions").insert(payload)'));
  assert.ok(insertBlock.indexOf("recordTemplateUse") < insertBlock.indexOf("update(payload)") || !insertBlock.includes("update(payload)"),
    "the count happens on the create branch only — editing must not inflate a template's usage");
  const formSource = read("src/components/QuestionForm.tsx");
  assert.ok(formSource.includes("template_id: initial?.id ? null : (initial?.template_id ?? null)"),
    "the editor only reports a template on a first save");
});

/* ══════════════ 5. Super Admin actions ══════════════ */

await check("creating a template writes a platform-wide row, audits it and revalidates the editor", async () => {
  resetDb();
  const result = redirectOf(actions.createQuestionTemplate(form({
    name: "  Multi-step numeric with worked solution  ",
    question_type: "numeric",
    description: "For grade 9 algebra.",
    subject: "Mathematics",
    grade_label: "Grade 9",
    curriculum: "IB MYP Mathematics",
    topic: "Quadratics",
    difficulty: "medium",
    tags: "algebra, worked, Algebra",
    organization_id: "",
  })));
  assert.equal((await result).url, "/admin/questions/templates?ok=created");
  assert.equal(db.question_templates.length, 1);
  const row = db.question_templates[0];
  assert.equal(row.organization_id, null, "no organization chosen = platform-wide");
  assert.equal(row.name, "Multi-step numeric with worked solution", "the name is trimmed");
  assert.equal(row.question_type, "numeric");
  assert.deepEqual(row.tags, ["algebra", "worked"], "tags are de-duplicated case-insensitively");
  assert.equal(row.status, "active");
  assert.equal(row.usage_count, 0);
  assert.deepEqual(row.content, {}, "a new template starts empty — it never carries content nobody reviewed");
  assert.equal(row.created_by, ADMIN);
  assert.deepEqual(db.audit_logs.map((a) => a.action), ["question_template.create"]);
  assert.equal(db.audit_logs[0].entity, "question_templates");
  assert.equal(db.audit_logs[0].organization_id, null);
  assert.deepEqual(db.audit_logs[0].metadata.scope, "platform");
  assert.ok(revalidated.includes("/admin/questions/templates") && revalidated.includes("/admin/questions/new"),
    "the console list and the editor are both refreshed");
});

await check("an organization-scoped template is created for that organization only", async () => {
  resetDb();
  await redirectOf(actions.createQuestionTemplate(form({ name: "Oak starter", question_type: "single_choice", organization_id: ORG_B })));
  assert.equal(db.question_templates[0].organization_id, ORG_B);
  assert.equal(db.audit_logs[0].organization_id, ORG_B);
  assert.deepEqual(db.audit_logs[0].metadata.scope, "organization");
  const demo = await templates.listTemplatesForOrganization(ORG_A);
  assert.equal(demo.length, 0, "the demo academy cannot see Oak's template");
});

await check("a template name must be at least 2 characters", async () => {
  resetDb();
  assert.equal((await redirectOf(actions.createQuestionTemplate(form({ name: "x", question_type: "numeric" })))).url, "/admin/questions/templates?e=name");
  assert.equal((await redirectOf(actions.createQuestionTemplate(form({ name: "   ", question_type: "numeric" })))).url, "/admin/questions/templates?e=name");
  assert.equal((await redirectOf(actions.createQuestionTemplate(form({ question_type: "numeric" })))).url, "/admin/questions/templates?e=name");
  assert.equal(db.question_templates.length, 0);
});

await check("an invented question type is refused", async () => {
  assert.equal((await redirectOf(actions.createQuestionTemplate(form({ name: "Bad type", question_type: "essay_v2" })))).url, "/admin/questions/templates?e=type");
  assert.equal((await redirectOf(actions.createQuestionTemplate(form({ name: "No type" })))).url, "/admin/questions/templates?e=type");
  assert.equal(db.question_templates.length, 0, "nothing is written for a type the engine cannot render");
});

await check("a nonexistent organization is refused before any write", async () => {
  assert.equal((await redirectOf(actions.createQuestionTemplate(form({
    name: "Ghost org", question_type: "numeric", organization_id: randomUUID(),
  })))).url, "/admin/questions/templates?e=org");
  assert.equal(db.question_templates.length, 0);
});

await check("field lengths are bounded by the same limits the database enforces", async () => {
  resetDb();
  await redirectOf(actions.createQuestionTemplate(form({
    name: "n".repeat(400),
    question_type: "numeric",
    description: "d".repeat(2000),
    subject: "s".repeat(400),
    grade_label: "g".repeat(400),
    curriculum: "c".repeat(400),
    topic: "t".repeat(400),
    difficulty: "h".repeat(400),
    tags: Array.from({ length: 60 }, (_, i) => `tag${i}`).join(","),
  })));
  const row = db.question_templates[0];
  const limits = templates.TEMPLATE_LIMITS;
  assert.equal(row.name.length, limits.name);
  assert.equal(row.description.length, limits.description);
  assert.equal(row.subject.length, limits.subject);
  assert.equal(row.grade_label.length, limits.gradeLabel);
  assert.equal(row.curriculum.length, limits.curriculum);
  assert.equal(row.topic.length, limits.topic);
  assert.equal(row.difficulty.length, limits.difficulty);
  assert.equal(row.tags.length, limits.tags);
});

await check("a database failure is reported, never swallowed", async () => {
  resetDb();
  failNextWrite = true;
  assert.equal((await redirectOf(actions.createQuestionTemplate(form({ name: "Will fail", question_type: "numeric" })))).url, "/admin/questions/templates?e=failed");
  assert.equal(db.audit_logs.length, 0, "a failed write is not audited as a success");
  assert.equal(revalidated.length, 0, "a failed write refreshes nothing");
  failNextWrite = false;
});

/* ── snapshotting a question ─────────────────────────────────────────── */

function seedQuestion(overrides = {}) {
  const question = {
    id: randomUUID(),
    organization_id: ORG_B,
    type: "single_choice",
    prompt: "Which of these is a prime number?",
    prompt_doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Which of these is a prime number?" }] }] },
    explanation: "2 is the only even prime.",
    explanation_doc: null,
    points: 1,
    difficulty: "easy",
    topic: "Number theory",
    curriculum: "IB MYP Mathematics",
    curriculum_course: "Mathematics",
    subtopic: "Primes",
    source_reference: "Textbook p.14",
    source_url: null,
    status: "published",
    config: { design: { numbering_style: "arabic_bracket", font_size_px: 18 }, hints_enabled: true },
    ...overrides,
  };
  db.questions.push(question);
  db.question_options.push(
    { id: randomUUID(), question_id: question.id, label: "2", is_correct: true, position: 0, content_doc: null },
    { id: randomUUID(), question_id: question.id, label: "4", is_correct: false, position: 1, content_doc: null },
  );
  return question;
}

await check("a template made from a question inherits that question's organization — it can never be promoted", async () => {
  resetDb();
  const question = seedQuestion({ organization_id: ORG_B });
  const result = await redirectOf(actions.createTemplateFromQuestion(form({
    question_id: question.id,
    name: "Prime number starter",
    description: "Reusable prime-number MCQ.",
    // A hostile form field cannot re-scope another school's content as platform-wide.
    organization_id: "",
    tags: "primes, mcq",
  })));
  assert.equal(result.url, "/admin/questions/templates?ok=created_from_question");
  const row = db.question_templates[0];
  assert.equal(row.organization_id, ORG_B, "the question's organization wins, whatever the form says");
  assert.equal(row.question_type, "single_choice", "the question's own type is carried over");
  assert.equal(row.difficulty, "easy");
  assert.equal(row.topic, "Number theory");
  assert.equal(row.curriculum, "IB MYP Mathematics");
  assert.equal(row.content.id, undefined, "no question identity is stored in a template");
  assert.equal(row.content.organization_id, undefined);
  assert.equal(row.content.status, "draft");
  assert.equal(row.content.prompt, question.prompt);
  assert.equal(row.content.config.design, undefined, "design tokens live in the design column");
  assert.equal(row.content.config.hints_enabled, true);
  assert.equal(row.design.numberingStyle, "arabic_bracket");
  assert.equal(row.content.options.length, 2, "answer options are part of the snapshot");
  assert.deepEqual(db.audit_logs.map((a) => a.action), ["question_template.create_from_question"]);
  assert.equal(db.audit_logs[0].metadata.source_question_id, question.id);
});

await check("the source question itself is never modified", async () => {
  const question = db.questions[0];
  const before = JSON.stringify(question);
  assert.equal(db.questions.length, 1);
  assert.equal(db.question_options.length, 2);
  assert.equal(question.status, "published", "snapshotting must not unpublish a live question");
  assert.equal(JSON.stringify(question), before);
});

await check("a missing question, a bad id or an oversized payload are all refused", async () => {
  resetDb();
  const big = seedQuestion({ organization_id: ORG_A, prompt: "x".repeat(templates.TEMPLATE_LIMITS.content + 1000) });
  assert.equal((await redirectOf(actions.createTemplateFromQuestion(form({ question_id: big.id, name: "Too big" })))).url, "/admin/questions/templates?e=size");
  assert.equal((await redirectOf(actions.createTemplateFromQuestion(form({ question_id: randomUUID(), name: "Ghost" })))).url, "/admin/questions/templates?e=question");
  assert.equal((await redirectOf(actions.createTemplateFromQuestion(form({ question_id: "not-a-uuid", name: "Bad id" })))).url, "/admin/questions/templates?e=question");
  assert.equal((await redirectOf(actions.createTemplateFromQuestion(form({ question_id: db.questions[0].id, name: "" })))).url, "/admin/questions/templates?e=name");
  assert.equal(db.question_templates.length, 0);
});

/* ── archive, restore, delete ───────────────────────────────────────── */

await check("archiving hides a template from authors without deleting it", async () => {
  resetDb();
  const row = seedTemplate({ organization_id: ORG_A, usage_count: 7 });
  const result = await redirectOf(actions.setQuestionTemplateStatus(form({ id: row.id, status: "archived" })));
  assert.equal(result.url, "/admin/questions/templates?ok=archived");
  assert.equal(db.question_templates[0].status, "archived");
  assert.equal(db.question_templates.length, 1, "archiving never deletes");
  assert.equal(db.question_templates[0].usage_count, 7, "the usage history survives");
  assert.deepEqual(db.audit_logs.map((a) => a.action), ["question_template.archive"]);
  assert.equal((await templates.listTemplatesForOrganization(ORG_A)).length, 0, "authors no longer see it");
});

await check("restoring makes a template available again", async () => {
  const row = db.question_templates[0];
  assert.equal((await redirectOf(actions.setQuestionTemplateStatus(form({ id: row.id, status: "active" })))).url, "/admin/questions/templates?ok=active");
  assert.equal(db.question_templates[0].status, "active");
  assert.deepEqual(db.audit_logs.map((a) => a.action), ["question_template.archive", "question_template.restore"]);
  assert.equal((await templates.listTemplatesForOrganization(ORG_A)).length, 1);
});

await check("an unknown status value cannot invent a state", async () => {
  const row = db.question_templates[0];
  await redirectOf(actions.setQuestionTemplateStatus(form({ id: row.id, status: "deleted" })));
  assert.equal(db.question_templates[0].status, "active", "'deleted' is not a status; it normalises to active");
});

await check("deleting a template needs the explicit confirmation tick", async () => {
  resetDb();
  const row = seedTemplate({ usage_count: 5 });
  assert.equal((await redirectOf(actions.deleteQuestionTemplate(form({ id: row.id })))).url, "/admin/questions/templates?e=confirm");
  assert.equal((await redirectOf(actions.deleteQuestionTemplate(form({ id: row.id, confirm: "no" })))).url, "/admin/questions/templates?e=confirm");
  assert.equal(db.question_templates.length, 1, "nothing is deleted without confirmation");
  assert.equal(db.audit_logs.length, 0);
});

await check("deleting removes only the template and records how often it had been used", async () => {
  const row = db.question_templates[0];
  const question = seedQuestion({ organization_id: ORG_A });
  const result = await redirectOf(actions.deleteQuestionTemplate(form({ id: row.id, confirm: "on" })));
  assert.equal(result.url, "/admin/questions/templates?ok=deleted");
  assert.equal(db.question_templates.length, 0);
  assert.equal(db.questions.length, 1, "questions created from a template are independent copies");
  assert.equal(db.questions[0].id, question.id);
  assert.deepEqual(db.audit_logs.map((a) => a.action), ["question_template.delete"]);
  assert.equal(db.audit_logs[0].metadata.usage_count, 5, "the counter is preserved in the audit trail");
  assert.ok(revalidated.includes("/admin/questions/new"));
});

await check("a malformed template id can never delete by accident", async () => {
  resetDb();
  seedTemplate();
  assert.equal((await redirectOf(actions.deleteQuestionTemplate(form({ id: "1=1", confirm: "on" })))).url, "/admin/questions/templates?e=confirm");
  assert.equal((await redirectOf(actions.setQuestionTemplateStatus(form({ id: "*", status: "archived" })))).url, "/admin/questions/templates?e=failed");
  assert.equal(db.question_templates.length, 1);
  assert.equal(db.question_templates[0].status, "active");
  resetDb();
});

/* ══════════════ 6. the surfaces that consume templates ══════════════ */

await check("the console page requires a verified Super Admin", () => {
  const page = read("src/app/admin/questions/templates/page.tsx");
  assert.ok(page.includes("await requireSuperAdmin()"));
  assert.ok(page.includes('export const dynamic = "force-dynamic"'), "the template list is never cached across administrators");
  assert.ok(!page.includes("dangerouslySetInnerHTML"), "template content is never injected as HTML");
  assert.ok(page.includes("createQuestionTemplate") && page.includes("createTemplateFromQuestion") && page.includes("deleteQuestionTemplate"));
});

await check("the organization page is gated by permission and module, and reads only its own scope", () => {
  const page = read("src/app/dashboard/questions/templates/page.tsx");
  assert.ok(page.includes('canOperate(ctx, org.id, "questions.create", "question_bank")'));
  assert.ok(page.includes('requireModule(entitlement, "question_bank"'), "a plan without the question bank never reaches the library");
  assert.ok(page.includes("listTemplatesForOrganization(org.id)"), "the read is scoped to this organization plus the platform library");
  assert.ok(!page.includes("createQuestionTemplate") && !page.includes("deleteQuestionTemplate"), "authors consume templates, they do not curate the library here");
  assert.ok(!page.includes("dangerouslySetInnerHTML"));
});

await check("both editors resolve a template only after the owning organization is known", () => {
  const adminPage = read("src/app/admin/questions/new/page.tsx");
  assert.ok(adminPage.indexOf("if (!selected)") < adminPage.indexOf("resolveQuestionStudioConfig(selected.id)"),
    "the empty-console guard runs first — resolving a studio config for no organization used to throw");
  assert.ok(adminPage.indexOf("if (!selected)") < adminPage.indexOf("getQuestionTemplate(sp.template)"));
  assert.ok(adminPage.includes('template.status === "active"'), "an archived template cannot pre-fill the editor");
  const dashboardPage = read("src/app/dashboard/questions/new/page.tsx");
  assert.ok(dashboardPage.includes("getQuestionTemplate(sp.template, org.id)"), "the dashboard read is organization-scoped");
  assert.ok(dashboardPage.includes('template.status === "active"'));
});

await check("a template opened in the editor is announced as a copy", () => {
  for (const rel of ["src/app/admin/questions/new/page.tsx", "src/app/dashboard/questions/new/page.tsx"]) {
    const page = read(rel);
    assert.ok(page.includes("templateInitial"), `${rel} seeds the form from the template`);
    assert.ok(page.includes("never changes the template"), `${rel} tells the author the payload is a copy`);
  }
});

await check("the template library is reachable from both consoles", () => {
  const shell = read("src/app/admin/AdminShell.tsx");
  assert.ok(shell.includes('href: "/admin/questions/templates"'), "Super Admin nav entry");
  assert.ok(shell.includes('labelKey: "admin.questionTemplates"'));
  const bank = read("src/app/dashboard/questions/page.tsx");
  assert.ok(bank.includes('href="/dashboard/questions/templates"'), "authors reach it from the Question Bank");
  for (const lang of ["en", "fr", "es"]) {
    assert.ok(read(`src/lib/i18n/dictionaries/${lang}.ts`).includes("questionTemplates:"), `${lang} has the label`);
  }
  // The catalog invariant is that every `surface.kind === "nav"` href is offered
  // in the organization sidebar (test-plan-modules.mjs). The library is reached
  // from the Question Bank header instead, so it must NOT be declared there —
  // it enforces the same question_bank module inside the page.
  const modules = read("src/lib/modules.ts");
  const questionBank = modules.slice(modules.indexOf('key: "question_bank"'));
  const entry = questionBank.slice(0, questionBank.indexOf("surface:"));
  assert.ok(entry.includes('capability: "question_bank"'), "the catalog entry was located");
  const surface = questionBank.slice(questionBank.indexOf("surface:"), questionBank.indexOf("surface:") + 200);
  assert.ok(!surface.includes("/dashboard/questions/templates"), "a nav surface may only name a real sidebar link");
  const dashboardTemplates = read("src/app/dashboard/questions/templates/page.tsx");
  assert.ok(dashboardTemplates.includes('requireModule(entitlement, "question_bank"'), "the library is gated by the question_bank module");
});

await check("every column the library reads still exists in the stored table", async () => {
  // Guards against a migration renaming or dropping a column while the select
  // list in src/lib/questionTemplates.ts still names it — that fails at runtime,
  // not at build time.
  resetDb();
  seedTemplate();
  await templates.listQuestionTemplates();
  await templates.getQuestionTemplate(db.question_templates[0].id);
  const ddl = read("supabase/migrations/20261126220000_platform_control_center_config.sql");
  const block = ddl.slice(ddl.indexOf("create table if not exists public.question_templates"));
  const definition = block.slice(0, block.indexOf(");"));
  const templateReads = selectedColumns.filter((entry) => entry.table === "question_templates");
  assert.ok(templateReads.length >= 2, "both reads were exercised");
  for (const { columns } of templateReads) {
    assert.notEqual(columns, "*", "the library names its columns explicitly");
    for (const column of String(columns).split(",").map((c) => c.trim())) {
      assert.ok(
        new RegExp(`^\\s*${column}\\s`, "m").test(definition),
        `question_templates.${column} is selected but no longer defined by the migration`,
      );
    }
  }
  assert.ok(definition.includes("usage_count"), "the counter is a real column");
});

await check("the stored table, its policies and the atomic counter exist in the migration", () => {
  const migration = read("supabase/migrations/20261126220000_platform_control_center_config.sql");
  assert.ok(migration.includes("create table if not exists public.question_templates"));
  assert.ok(migration.includes("question_templates_name_ck check (char_length(trim(name)) between 2 and 160)"), "the name limit is enforced by the database too");
  assert.ok(migration.includes("question_templates_status_ck check (status in ('active','archived'))"));
  assert.ok(migration.includes("create or replace function public.question_templates_record_use"));
  assert.ok(migration.includes("revoke all on function public.question_templates_record_use(uuid) from anon, authenticated"),
    "the counter cannot be called by a signed-in user directly");
  assert.ok(migration.includes("question_templates_select") && migration.includes("question_templates_write"));
  assert.ok(/security definer/i.test(migration.slice(migration.indexOf("question_templates_record_use") - 400, migration.indexOf("question_templates_record_use"))) === false,
    "the counter is SECURITY INVOKER: it must not become a write path around RLS");
});

/* ── report ─────────────────────────────────────────────────────────── */
if (failures.length) {
  console.error(`\nquestion-studio-templates: ${failures.length} FAILURE(S)`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`\n✓ question studio templates — ${passed} checks passed`);
