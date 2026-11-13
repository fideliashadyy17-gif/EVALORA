// Exercise the real organizer pause route (src/app/api/monitor/exams/[id]/pause)
// with a mocked database + auth boundary. Run: node scripts/test-pause-route.mjs
//
// Covers §10 (backend-enforced authorization, tenant isolation, audit) and the
// API contract of Features B and C:
//   * no session / non-monitor role / invisible exam → refused before any RPC;
//   * malformed bodies → 400; a candidate can never reach a pause transition;
//   * exam scope → exam_set_pause RPC, not_open → 409, audit row written;
//   * attempt scope → the attempt must belong to THIS exam and be in_progress;
//   * RPC failure → 500, never a false "ok"; audit failure does not roll back
//     a successful transition.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const filename = path.resolve("scripts/__virtual_pause_route.cjs");
const compiled = ts.transpileModule(
  readFileSync("src/app/api/monitor/exams/[id]/pause/route.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } },
).outputText;

const ORG = "0a400000-0000-4000-8000-000000000001";
const EXAM = "c4000000-0000-4000-8000-000000000002";
const ATTEMPT = "aaaaaaaa-1111-4111-8111-111111111111";
const ACTOR = "bbbbbbbb-0000-4000-8000-000000000009";
const FOREIGN_ATTEMPT = "aaaaaaaa-9999-4999-8999-999999999999";

let scenario;
function setup(overrides = {}) {
  scenario = {
    session: true, // signed-in staff with a monitor role
    examVisible: true,
    examRpc: { paused: true, attempts_updated: 2 }, // exam_set_pause result
    examRpcError: false,
    attempt: { id: ATTEMPT, exam_id: EXAM, status: "in_progress", pause_reasons: [] },
    attemptRpc: { paused: true, reasons: ["student"], credited_minutes: 0 },
    attemptRpcError: false,
    auditError: false,
    rpcCalls: [],
    audits: [],
    ...overrides,
  };
}

const NO_STORE = { "Cache-Control": "private, no-store" };
const deny = (status, error) => ({ ok: false, response: Response.json({ error }, { status, headers: NO_STORE }) });

const staffExamAccess = async (examId) => {
  if (!scenario.session) return deny(401, "Sign in to continue.");
  if (!scenario.examVisible || examId !== EXAM) return deny(404, "Examination not found.");
  return { ok: true, ctx: { user: { id: ACTOR } }, supabase: {}, organization_id: ORG };
};

const admin = {
  async rpc(fn, args) {
    scenario.rpcCalls.push({ fn, args });
    if (fn === "exam_set_pause") {
      if (scenario.examRpcError) return { data: null, error: { message: "rpc failed" } };
      return { data: scenario.examRpc, error: null };
    }
    if (fn === "exam_attempt_set_pause") {
      if (scenario.attemptRpcError) return { data: null, error: { message: "rpc failed" } };
      return { data: scenario.attemptRpc, error: null };
    }
    throw new Error(`Unexpected rpc ${fn}`);
  },
  from(table) {
    if (table === "exam_attempts") {
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        async maybeSingle() {
          const a = scenario.attempt;
          return { data: a && a.id === filters.id && a.exam_id === filters.exam_id ? a : null, error: null };
        },
      };
      return query;
    }
    if (table === "exam_pause_events") {
      return {
        async insert(row) {
          if (scenario.auditError) throw new Error("audit write failed");
          scenario.audits.push(row);
          return { error: null };
        },
      };
    }
    throw new Error(`Unexpected table ${table}`);
  },
};

const virtual = new Module(filename);
virtual.filename = filename;
virtual.paths = Module._nodeModulePaths(path.dirname(filename));
virtual.require = (id) => {
  if (id === "@/lib/examMessaging") return { isUuid: (v) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) };
  if (id === "@/lib/monitorAccess") return { staffExamAccess };
  if (id === "@/lib/supabase/server") return { createAdminClient: () => admin };
  if (id === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } };
  return require(id); // zod stays real
};
virtual._compile(compiled, filename);
const POST = virtual.exports.POST;

async function request(body, examId = EXAM) {
  return POST(
    new Request(`http://test.local/api/monitor/exams/${examId}/pause`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: examId }) },
  );
}

let count = 0;
async function check(label, fn) { await fn(); console.log(`  ✓ ${label}`); count++; }

await check("no session → 401 and no RPC is ever reached", async () => {
  setup({ session: false });
  const r = await request({ scope: "exam", action: "pause" });
  assert.equal(r.status, 401);
  assert.equal(scenario.rpcCalls.length, 0);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
});

await check("a signed-in user without a monitor role → 404 (exam invisible), no RPC", async () => {
  setup({ examVisible: false });
  const r = await request({ scope: "exam", action: "pause" });
  assert.equal(r.status, 404);
  assert.equal(scenario.rpcCalls.length, 0);
});

await check("malformed exam id → 404 before auth", async () => {
  setup();
  const r = await request({ scope: "exam", action: "pause" }, "not-a-uuid");
  assert.equal(r.status, 404);
});

await check("malformed bodies → 400, no RPC", async () => {
  for (const body of [
    null,
    {},
    { scope: "exam" },
    { action: "pause" },
    { scope: "everything", action: "pause" },
    { scope: "exam", action: "freeze" },
    { scope: "attempt", action: "pause", attempt_id: "nope" },
  ]) {
    setup();
    const r = await request(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(scenario.rpcCalls.length, 0);
  }
});

await check("exam scope pause → exam_set_pause RPC + audit row with actor and states", async () => {
  setup();
  const r = await request({ scope: "exam", action: "pause" });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body, { ok: true, paused: true, attempts_updated: 2, duplicate: false });
  assert.deepEqual(scenario.rpcCalls, [{ fn: "exam_set_pause", args: { p_exam_id: EXAM, p_paused: true } }]);
  assert.equal(scenario.audits.length, 1);
  const a = scenario.audits[0];
  assert.equal(a.organization_id, ORG);
  assert.equal(a.exam_id, EXAM);
  assert.equal(a.attempt_id, null);
  assert.equal(a.actor_id, ACTOR);
  assert.deepEqual([a.scope, a.action, a.reason], ["exam", "pause", "assessment"]);
  assert.deepEqual(a.pause_reasons_before, []);
  assert.deepEqual(a.pause_reasons_after, ["assessment"]);
});

await check("exam scope resume → p_paused false and inverse audit states", async () => {
  setup({ examRpc: { paused: false, attempts_updated: 2 } });
  const r = await request({ scope: "exam", action: "resume" });
  assert.equal(r.status, 200);
  assert.deepEqual(scenario.rpcCalls[0].args, { p_exam_id: EXAM, p_paused: false });
  const a = scenario.audits[0];
  assert.deepEqual([a.action, a.pause_reasons_before, a.pause_reasons_after], ["resume", [], []]);
});

await check("pausing a non-open exam → 409 with the RPC's not_open mapped, no audit", async () => {
  setup({ examRpc: { error: "not_open" } });
  const r = await request({ scope: "exam", action: "pause" });
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /open examination/i);
  assert.equal(scenario.audits.length, 0);
});

await check("missing exam (RPC null) → 404", async () => {
  setup({ examRpc: null });
  assert.equal((await request({ scope: "exam", action: "pause" })).status, 404);
});

await check("duplicate pause passes through as duplicate:true, attempts_updated 0", async () => {
  setup({ examRpc: { paused: true, attempts_updated: 0, duplicate: true } });
  const r = await request({ scope: "exam", action: "pause" });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, paused: true, attempts_updated: 0, duplicate: true });
});

await check("RPC failure → 500, never a false ok", async () => {
  setup({ examRpcError: true });
  assert.equal((await request({ scope: "exam", action: "pause" })).status, 500);
  setup({ attemptRpcError: true });
  assert.equal((await request({ scope: "attempt", action: "pause", attempt_id: ATTEMPT })).status, 500);
});

await check("attempt scope: missing attempt_id → 400, no RPC", async () => {
  setup();
  const r = await request({ scope: "attempt", action: "pause" });
  assert.equal(r.status, 400);
  assert.equal(scenario.rpcCalls.length, 0);
});

await check("attempt scope: an attempt of ANOTHER examination → 404, no RPC (tenant isolation)", async () => {
  setup({ attempt: { id: FOREIGN_ATTEMPT, exam_id: "c4000000-0000-4000-8000-0000000000ff", status: "in_progress", pause_reasons: [] } });
  const r = await request({ scope: "attempt", action: "pause", attempt_id: FOREIGN_ATTEMPT });
  assert.equal(r.status, 404);
  assert.equal(scenario.rpcCalls.length, 0);
});

await check("attempt scope: a submitted attempt → 409, no RPC", async () => {
  setup({ attempt: { id: ATTEMPT, exam_id: EXAM, status: "submitted", pause_reasons: [] } });
  const r = await request({ scope: "attempt", action: "pause", attempt_id: ATTEMPT });
  assert.equal(r.status, 409);
  assert.equal(scenario.rpcCalls.length, 0);
});

await check("attempt scope pause → student-reason RPC + audit with before/after reasons", async () => {
  setup();
  const r = await request({ scope: "attempt", action: "pause", attempt_id: ATTEMPT });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, paused: true, reasons: ["student"], credited_minutes: 0, duplicate: false });
  assert.deepEqual(scenario.rpcCalls, [
    { fn: "exam_attempt_set_pause", args: { p_attempt_id: ATTEMPT, p_reason: "student", p_paused: true } },
  ]);
  const a = scenario.audits[0];
  assert.equal(a.attempt_id, ATTEMPT);
  assert.equal(a.actor_id, ACTOR);
  assert.deepEqual([a.scope, a.action, a.reason], ["attempt", "pause", "student"]);
  assert.deepEqual(a.pause_reasons_before, []);
  assert.deepEqual(a.pause_reasons_after, ["student"]);
});

await check("attempt scope resume reports the credited minutes and the remaining reasons", async () => {
  setup({
    attempt: { id: ATTEMPT, exam_id: EXAM, status: "in_progress", pause_reasons: ["assessment", "student"] },
    attemptRpc: { paused: true, reasons: ["assessment"], credited_minutes: 0 },
  });
  const r = await request({ scope: "attempt", action: "resume", attempt_id: ATTEMPT });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.paused, true, "still paused: the assessment reason remains open");
  assert.deepEqual(body.reasons, ["assessment"]);
  const a = scenario.audits[0];
  assert.deepEqual(a.pause_reasons_before, ["assessment", "student"]);
  assert.deepEqual(a.pause_reasons_after, ["assessment"]);
});

await check("RPC null on attempt scope (race: submitted meanwhile) → 409", async () => {
  setup({ attemptRpc: null });
  const r = await request({ scope: "attempt", action: "pause", attempt_id: ATTEMPT });
  assert.equal(r.status, 409);
});

await check("an audit write failure never rolls back or masks a successful transition", async () => {
  setup({ auditError: true });
  const r = await request({ scope: "exam", action: "pause" });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  assert.equal(scenario.rpcCalls.length, 1, "the RPC ran exactly once");
});

console.log(`\n${count} pause route checks passed (mocked DB/auth).`);
