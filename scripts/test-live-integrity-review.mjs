// Live-activity integrity events are review evidence only. This route test uses
// an isolated in-memory Supabase facade; it does not contact production.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const routeFile = "src/app/api/live/integrity/route.ts";
const routePath = path.resolve("scripts/__live_integrity_route.cjs");
const records = [];
const writes = [];
let sessionStatus = "live";
let participantStatus = "admitted";
let policy = {};
let validToken = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const participantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const quizId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const orgId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function db() {
  return {
    rpc: async () => ({ data: { allowed: true }, error: null }),
    from(table) {
      const state = { table, filters: {}, operation: "read" };
      const q = {
        select(_columns, options) { state.operation = "select"; state.countRequested = Boolean(options?.count); return q; },
        eq(key, value) { state.filters[key] = value; return q; },
        like(key, value) { state.filters[key] = value; return q; },
        not(key, op, value) { state.filters[`not:${key}`] = [op, value]; return q; },
        order() { return q; },
        limit() { return q; },
        maybeSingle: async () => {
          if (table === "session_participants") return state.filters.access_token === validToken
            ? { data: { id: participantId, session_id: sessionId, status: participantStatus }, error: null }
            : { data: null, error: null };
          if (table === "quiz_sessions") return { data: { id: sessionId, quiz_id: quizId, organization_id: orgId, status: sessionStatus, settings: { integrity: policy } }, error: null };
          return { data: null, error: null };
        },
        insert(row) {
          writes.push({ table, op: "insert", row });
          records.push({ ...row, created_at: new Date().toISOString() });
          return Promise.resolve({ error: null });
        },
        then(resolve, reject) {
          let result;
          if (table === "proctoring_incidents" && state.countRequested && Object.hasOwn(state.filters, "not:type")) {
            result = { count: records.filter((r) => r.session_id === sessionId && r.participant_id === participantId && !["integrity_tab_visible", "integrity_focus_back", "integrity_online"].includes(r.type)).length, error: null };
          } else if (table === "proctoring_incidents" && state.countRequested) {
            result = { count: records.filter((r) => r.session_id === sessionId && r.participant_id === participantId).length, error: null };
          } else if (table === "proctoring_incidents") {
            result = { data: records.filter((r) => r.session_id === sessionId && r.participant_id === participantId).sort((a, b) => b.created_at.localeCompare(a.created_at)), error: null };
          } else result = { data: null, error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    },
  };
}

const originalLoad = Module._load;
Module._load = function (request, parent) {
  if (request === "@/lib/supabase/server") return { createAdminClient: db };
  if (request === "@/lib/integrity") return compile("src/lib/integrity.ts", "scripts/__live_integrity_rules.cjs");
  if (request === "next/server") return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } };
  return originalLoad.apply(this, arguments);
};
function compile(file, dest) {
  const filename = path.resolve(dest);
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return mod.exports;
}
const route = compile(routeFile, "scripts/__live_integrity_route.cjs");
Module._load = originalLoad;
const request = (body) => ({ json: async () => body });
let checks = 0;
function check(name, condition) { assert.ok(condition, name); console.log(`  ✓ ${name}`); checks++; }

records.length = 0; writes.length = 0; policy = {}; sessionStatus = "live"; participantStatus = "admitted";
let response = await route.POST(request({ participant_id: participantId, token: validToken, event: "meta_key", detail: { key: "meta" } }));
check("OS-key event inserts one scoped review observation", response.status === 200 && response.body.recorded && writes.length === 1 && writes[0].table === "proctoring_incidents" && writes[0].row.organization_id === orgId && writes[0].row.quiz_id === quizId && writes[0].row.session_id === sessionId && writes[0].row.participant_id === participantId);
check("integrity route does not close, submit, grade, or mutate any timed work", writes.every((w) => w.table === "proctoring_incidents" && w.op === "insert"));
check("recorded signal escalates to a human-review level only through policy thresholds", response.body.level === "warn" && records[0].status === "open");

writes.length = 0;
response = await route.POST(request({ participant_id: participantId, token: "ffffffff-ffff-4fff-8fff-ffffffffffff", event: "focus_lost" }));
check("a mismatched participant token is rejected without writes", response.status === 404 && writes.length === 0);

sessionStatus = "ended";
response = await route.POST(request({ participant_id: participantId, token: validToken, event: "focus_lost" }));
check("ended sessions cannot accept active participant observations", response.status === 409);
sessionStatus = "live";

participantStatus = "pending";
response = await route.POST(request({ participant_id: participantId, token: validToken, event: "focus_lost" }));
check("participants not yet admitted cannot write observations", response.status === 404);
participantStatus = "admitted";

policy = { enabled: false };
const beforeDisabled = records.length;
response = await route.POST(request({ participant_id: participantId, token: validToken, event: "focus_lost" }));
check("disabled integrity policy records no incident", response.status === 200 && response.body.recorded === false && records.length === beforeDisabled);
policy = {};

records.push({ type: "integrity_focus_lost", session_id: sessionId, participant_id: participantId, created_at: new Date().toISOString() });
const beforeDuplicate = records.length;
response = await route.POST(request({ participant_id: participantId, token: validToken, event: "focus_lost" }));
check("duplicate event burst is deduplicated server-side", response.status === 200 && response.body.reason === "duplicate" && records.length === beforeDuplicate);

response = await route.POST(request({ participant_id: "bad", token: validToken, event: "focus_lost" }));
check("malformed identities are rejected before database writes", response.status === 400);
console.log(`\n${checks} live integrity review checks passed`);
