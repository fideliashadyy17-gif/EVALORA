// Tenant review server-action tests with an in-memory DB facade. No Supabase
// connection is used; the migration integration test separately exercises the
// PostgreSQL history trigger.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const incidentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const userId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
let scenario;
let writes;
let paths;
const ctx = { user: { id: userId }, profile: { platform_role: null }, active_org: { id: tenantId, status: "active" } };

const db = {
  from(table) {
    const state = { table, filters: {}, op: "read", patch: null };
    const q = {
      select() { return q; },
      eq(key, value) { state.filters[key] = value; return q; },
      update(patch) { state.op = "update"; state.patch = patch; writes.push({ table, op: "update", patch, filters: state.filters }); return q; },
      async maybeSingle() {
        if (table === "proctoring_incidents" && state.op === "read") return { data: scenario.incident, error: null };
        if (table === "quiz_sessions") return { data: scenario.session, error: null };
        if (table === "exams") return { data: scenario.exam, error: null };
        if (state.op === "update") return scenario.updateOk ? { data: { id: incidentId }, error: null } : { data: null, error: null };
        return { data: null, error: null };
      },
    };
    return q;
  },
};
function reset() {
  scenario = {
    incident: { id: incidentId, exam_id: null, session_id: sessionId },
    session: { id: sessionId },
    exam: null,
    updateOk: true,
  };
  writes = [];
  paths = [];
}
function compile() {
  const filename = path.resolve("scripts/__workspace_exam_actions.cjs");
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalLoad = Module._load;
  Module._load = function (request, parent) {
    if (request === "@/lib/auth") return { requireUser: async () => ctx, activeOrg: () => ctx.active_org, can: () => true, PROCTOR_ROLES: [], CREATOR_ROLES: [], MARKER_ROLES: [] };
    if (request === "@/lib/entitlements") return {};
    if (request === "@/lib/capabilities") return {};
    if (request === "@/lib/ai-marking") return {};
    if (request === "@/lib/supabase/server") return { createClient: async () => db, createAdminClient: () => db };
    if (request === "@/lib/utils") return { genCode: () => "MOCKCODE" };
    if (request === "next/cache") return { revalidatePath: (path) => paths.push(path) };
    if (request === "next/navigation") return { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } };
    return originalLoad.apply(this, arguments);
  };
  try {
    mod._compile(ts.transpileModule(readFileSync("src/app/dashboard/exams/actions.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, filename);
    return mod.exports;
  } finally { Module._load = originalLoad; }
}
const { reviewIncident } = compile();
function form(overrides = {}) {
  const fd = new FormData();
  for (const [key, value] of Object.entries({ id: incidentId, exam_id: "", session_id: sessionId, expected_status: "open", status: "investigating", return_to: "/dashboard/proctoring", review_note: "Reviewed by organizer", ...overrides })) fd.set(key, value);
  return fd;
}
async function run(overrides = {}) {
  try { await reviewIncident(form(overrides)); } catch (error) { return String(error.message); }
  return "no redirect";
}
let checks = 0;
function check(name, condition) { assert.ok(condition, name); console.log(`  ✓ ${name}`); checks++; }

reset();
let result = await run();
check("live incident review records an authorized tenant-scoped decision", result === "REDIRECT:/dashboard/proctoring?ok=reviewed" && writes.length === 1 && writes[0].patch.status === "investigating" && writes[0].patch.reviewed_by === userId && writes[0].patch.review_note === "Reviewed by organizer");
check("live review update is filtered by incident, organization, session and expected state", writes[0].filters.id === incidentId && writes[0].filters.organization_id === tenantId && writes[0].filters.session_id === sessionId && writes[0].filters.status === "open");
check("review revalidates the history page and does not update session or attempt lifecycle", paths.includes("/dashboard/proctoring") && writes.every((w) => w.table === "proctoring_incidents" && w.op === "update"));

reset();
result = await run({ session_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" });
check("tampered live-session scope is rejected before any update", result.includes("incident_error=scope") && writes.length === 0);

reset();
scenario.session = null;
result = await run();
check("a session outside the authorized tenant cannot be reviewed", result.includes("incident_error=scope") && writes.length === 0);

reset();
scenario.updateOk = false;
result = await run();
check("stale concurrent review decisions fail closed", result.includes("incident_error=review") && writes.length === 1);

reset();
scenario.incident = { id: incidentId, exam_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", session_id: null };
scenario.exam = { id: scenario.incident.exam_id };
result = await run({ exam_id: scenario.incident.exam_id, session_id: "" });
check("the same review action preserves examination scope", result === "REDIRECT:/dashboard/proctoring?ok=reviewed" && writes[0].filters.exam_id === scenario.incident.exam_id);
console.log(`\n${checks} authorized review action checks passed (isolated mock database).`);
