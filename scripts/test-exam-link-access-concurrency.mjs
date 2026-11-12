// Concurrency + forgiving-code test for the REAL shared-link admission route
// (src/app/api/exam/link-access/route.ts), compiled from source with only the
// database, the paper loader and the retake service replaced — the same
// pattern as scripts/test-exam-submission-lifecycle.mjs. The canonical code
// matcher under test (src/lib/exam-access.ts) is the real production module.
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import ts from "typescript";

const sha256 = (v) => createHash("sha256").update(v, "utf8").digest("hex");
const EXAM_ID = "39cd63a4-4212-4e1e-9f2a-0db4d5db0da7";
const TOKEN = "ed7e862e-0abb-4905-b60a-b0483de69cc9";
const CLASS_ID = "0a400000-0000-4000-8000-000000000107";

/* ── in-memory fake DB (supabase-js chain subset used by the route) ── */
const tables = {
  exams: [{
    id: EXAM_ID, organization_id: "org1", quiz_id: "quiz1",
    title: "ZZ CONCURRENCY TEST (DELETE AFTER)", status: "open",
    starts_at: null, ends_at: null, shared_link_enabled: true,
    invite_token: TOKEN, invite_expires_at: null, invite_activates_at: null,
    invite_no_expiry: true, invite_disabled_at: null, event_id: null,
    class_id: CLASS_ID, duration_minutes: 60,
    access_code: "TESTJOIN-40X", access_code_hash: sha256("TESTJOIN-40X"),
    settings: {
      access_mode: "shared_link", identity_fields: [],
      eligible_class_ids: [CLASS_ID], attempt_policy: "single_resume",
      randomize_questions: false, proctoring: false,
    },
  }],
  classes: [{ id: CLASS_ID, organization_id: "org1", curriculum_track: null }],
  competition_phase_classes: [],
  exam_candidates: [],
  exam_attempts: [],
};
function run(name, st) {
  const rows = tables[name];
  const match = (r) => st.filters.every((f) => f(r));
  if (st.op === "insert") {
    const row = {
      id: randomUUID(), access_token: randomUUID(), status: "in_progress",
      started_at: new Date().toISOString(), attempt_number: 1,
      extension_minutes: 0, identity_data: {}, ...st.patch,
    };
    if (name === "exam_candidates") row.status = st.patch.status ?? "registered";
    rows.push(row);
    return Promise.resolve({ data: st.single ? row : [row], error: null });
  }
  if (st.op === "update") {
    const hit = rows.filter(match);
    hit.forEach((r) => Object.assign(r, st.patch));
    return Promise.resolve({ data: st.single ? (hit[0] ?? null) : hit, error: null });
  }
  let out = rows.filter(match);
  if (st.single === "maybe") return Promise.resolve({ data: out[0] ?? null, error: null });
  if (st.single === "one") return Promise.resolve({ data: out[0] ?? null, error: out[0] ? null : { message: "no rows" } });
  return Promise.resolve({ data: out, error: null });
}
function table(name) {
  const st = { filters: [], op: "select", patch: null, single: false };
  const api = {
    select() { return api; },
    insert(row) { st.op = "insert"; st.patch = row; return api; },
    update(patch) { st.op = "update"; st.patch = patch; return api; },
    eq(c, v) { st.filters.push((r) => r[c] === v); return api; },
    in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return api; },
    is(c, v) { st.filters.push((r) => (r[c] ?? null) === v); return api; },
    not() { return api; },
    order() { return api; },
    limit() { return api; },
    maybeSingle() { st.single = "maybe"; return run(name, st); },
    single() { st.single = "one"; return run(name, st); },
    then(res, rej) { return run(name, st).then(res, rej); },
  };
  return api;
}
const admin = { from: table };

/* ── module loader (real route + real pure libs, infra overridden) ── */
function load(source, overrides = {}) {
  const file = path.resolve(source);
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const originalLoad = Module._load;
  Module._load = function (request, parent) {
    if (parent?.filename === file) {
      if (overrides[request]) return overrides[request];
      if (request.startsWith("@/lib/")) return load(path.resolve("src", `${request.slice(2)}.ts`));
      if (request === "next/server")
        return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    const js = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    mod._compile(js, file);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const route = load("src/app/api/exam/link-access/route.ts", {
  "@/lib/supabase/server": {
    createAdminClient: () => admin,
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
  },
  "@/lib/live": {
    loadQuizQuestions: async () => Array.from({ length: 25 }, (_, i) => ({ id: `q${i + 1}` })),
    seededShuffle: (rows) => rows,
  },
  "@/lib/examRetakeServer": {
    findUsableGrant: async () => null,
    startRetakeAttempt: async () => ({ ok: false, error: "not used" }),
  },
  "@/lib/exam": {
    attemptDeadline: (exam, startedAt, ext = 0) =>
      new Date(Date.parse(startedAt) + (exam.duration_minutes + ext) * 60000),
  },
});

const post = (body) => route.POST({ json: async () => body });
const joinBody = (i, code, guestKey = randomUUID()) => ({
  invite_token: TOKEN, access_code: code,
  first_name: "Concurrent", last_name: `Tester${String(i).padStart(2, "0")}`,
  class_id: CLASS_ID, guest_key: guestKey, identity: {}, consent: true,
});

/* ── 40 students at once: 4 plausible transcriptions of the same code ── */
const variants = [
  ...Array(10).fill("TESTJOIN-40X"),
  ...Array(10).fill("testjoin40x"),
  ...Array(10).fill("TEST JOIN 40X"),
  ...Array(10).fill("TESTJ0IN-4OX"),
];
const t0 = Date.now();
const responses = await Promise.all(variants.map((code, i) => post(joinBody(i + 1, code))));
const elapsed = Date.now() - t0;
const bodies = await Promise.all(responses.map((r) => r.json().catch(() => null)));
const entered = bodies.filter((b) => b?.attempt_id);
const failures = responses.map((r, i) => ({ status: r.status, body: bodies[i] })).filter((r) => !r.body?.attempt_id);
console.log(`40 concurrent joins: ${entered.length}/40 entered in ${elapsed}ms; distinct attempts=${new Set(entered.map((b) => b.attempt_id)).size}; candidates=${tables.exam_candidates.length}; attempts=${tables.exam_attempts.length}`);
if (failures.length) console.log("FAILURES:", JSON.stringify(failures.slice(0, 3)));

/* ── a wrong code is still refused ── */
const wrong = await post(joinBody(99, "TESTJOIN-99Z"));
console.log(`wrong code refused: HTTP ${wrong.status} (expect 403)`);

/* ── resume: same browser, same student, mistyped code variant ── */
const key = randomUUID();
const first = await (await post(joinBody(50, "TESTJOIN-40X", key))).json();
const resumed = await (await post(joinBody(50, "testjoin40x", key))).json();
console.log(`resume with variant code: same attempt = ${first.attempt_id === resumed.attempt_id}; attempts total still ${tables.exam_attempts.length} (expect 41)`);

const pass = entered.length === 40 && wrong.status === 403 && first.attempt_id === resumed.attempt_id && tables.exam_attempts.length === 41;
console.log(pass ? "CONCURRENCY TEST: PASS" : "CONCURRENCY TEST: FAIL");
process.exit(pass ? 0 : 1);
