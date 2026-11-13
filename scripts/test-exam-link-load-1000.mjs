// Part C — real completed load test: 100 / 500 / 1000 SIMULTANEOUS students
// entering the SAME shared link + access code through the REAL admission
// route (src/app/api/exam/link-access/route.ts), compiled from source with
// only infrastructure replaced by an isolated in-memory database (the same
// harness pattern as scripts/test-exam-link-access-concurrency.mjs — nothing
// here touches production).
//
// Measured per scale: success %, P50/P95/P99 latency, duplicate attempts,
// candidate/attempt row integrity. Target: ≥99% success, zero duplicates.
// Exit code 0 only if EVERY scale meets the target — no claim without a run.
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import ts from "typescript";

const sha256 = (v) => createHash("sha256").update(v, "utf8").digest("hex");
const EXAM_ID = randomUUID();
const TOKEN = randomUUID();
const CLASS_ID = "0a400000-0000-4000-8000-000000000107";
const CODE = "LOADTEST-1000";

/* ── isolated in-memory fake DB (supabase-js chain subset used by the route) ── */
function makeTables() {
  return {
    exams: [{
      id: EXAM_ID, organization_id: "org1", quiz_id: "quiz1",
      title: "ZZ LOAD TEST (in-memory, delete after)", status: "open",
      starts_at: null, ends_at: null, shared_link_enabled: true,
      invite_token: TOKEN, invite_expires_at: "2026-12-12T00:00:00Z",
      invite_activates_at: null, invite_no_expiry: false, invite_disabled_at: null,
      event_id: null, class_id: CLASS_ID, duration_minutes: 60,
      access_code: CODE, access_code_hash: sha256(CODE),
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
}
let tables = makeTables();

const normName = (v) => String(v ?? "").trim().toLowerCase();
function run(name, st) {
  const rows = tables[name];
  const match = (r) => st.filters.every((f) => f(r));
  if (st.op === "insert") {
    const row = {
      id: randomUUID(), access_token: randomUUID(), status: "in_progress",
      started_at: new Date().toISOString(), attempt_number: 1,
      extension_minutes: 0, identity_data: {}, ...st.patch,
    };
    if (name === "exam_candidates") {
      row.status = st.patch.status ?? "registered";
      // Enforce uq_exam_candidate_shared_identity (migration 0096):
      // (exam_id, guest_key_hash, lower(btrim(first)), lower(btrim(last)), class_id).
      const clash = rows.find((r) =>
        r.exam_id === row.exam_id &&
        r.guest_key_hash === row.guest_key_hash &&
        normName(r.first_name) === normName(row.first_name) &&
        normName(r.last_name) === normName(row.last_name) &&
        String(r.class_id ?? "") === String(row.class_id ?? ""));
      if (clash)
        return Promise.resolve({
          data: null,
          error: { code: "23505", message: "duplicate key value violates unique constraint \"uq_exam_candidate_shared_identity\"" },
        });
    }
    if (name === "exam_attempts") {
      // Enforce uq_exam_attempts_one_active: one in_progress attempt per candidate.
      const active = rows.find((r) => r.candidate_id === row.candidate_id && r.status === "in_progress");
      if (active)
        return Promise.resolve({
          data: null,
          error: { code: "23505", message: "duplicate key value violates unique constraint \"uq_exam_attempts_one_active\"" },
        });
    }
    rows.push(row);
    return Promise.resolve({ data: st.single ? row : [row], error: null });
  }
  if (st.op === "update") {
    const hit = rows.filter(match);
    hit.forEach((r) => Object.assign(r, st.patch));
    return Promise.resolve({ data: st.single ? (hit[0] ?? null) : hit, error: null });
  }
  const out = rows.filter(match);
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

// Plausible touch-keyboard transcriptions of the SAME code (the forgiving
// matcher must accept every one — a variant must never look like a wrong code).
const codeVariants = [CODE, CODE.toLowerCase(), "LOADTEST1000", "LOAD TEST 1000", "L0ADTEST-1OOO"];

function joinBody(i, guestKey) {
  return {
    invite_token: TOKEN,
    access_code: codeVariants[i % codeVariants.length],
    first_name: "Load",
    last_name: `Student${String(i).padStart(4, "0")}`,
    class_id: CLASS_ID,
    guest_key: guestKey,
    identity: {},
    consent: true,
  };
}

const percentile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0;
const sharedKeySeed = randomUUID();

async function runScale(n, sharedDevices) {
  tables = makeTables(); // isolated per scale
  // sharedDevices: how many distinct browsers the n students arrive from
  // (n students over d devices = the shared-lab reality; migration 0096's
  // per-person-per-browser index must let every distinct student in).
  const devices = sharedDevices ? Math.max(1, Math.floor(n / sharedDevices)) : n;
  const requests = Array.from({ length: n }, (_, idx) => ({
    i: idx + 1,
    // Stable per device (the schema requires 16-120 chars).
    guestKey: `lab-browser-${String(idx % devices).padStart(6, "0")}-${sharedKeySeed}`,
  }));
  // Fire ALL n joins simultaneously — one Promise.all, no staggering.
  const t0 = process.hrtime.bigint();
  const results = await Promise.all(requests.map(async ({ i, guestKey }) => {
    const start = process.hrtime.bigint();
    const res = await post(joinBody(i, guestKey));
    const body = await res.json().catch(() => null);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    return { status: res.status, body, ms };
  }));
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;

  const entered = results.filter((r) => r.body?.attempt_id);
  const failed = results.filter((r) => !r.body?.attempt_id);
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const distinctAttempts = new Set(entered.map((r) => r.body.attempt_id)).size;
  const distinctCandidates = new Set(
    tables.exam_candidates.map((c) => `${c.guest_key_hash}|${c.last_name}`),
  ).size;
  // Duplicate = more attempts than distinct students admitted.
  const duplicateAttempts = tables.exam_attempts.length - distinctAttempts;
  const successPct = (entered.length / n) * 100;

  const report = {
    n,
    devices,
    success: entered.length,
    successPct: successPct.toFixed(2),
    failed: failed.length,
    p50: percentile(latencies, 50).toFixed(1),
    p95: percentile(latencies, 95).toFixed(1),
    p99: percentile(latencies, 99).toFixed(1),
    wallMs: wallMs.toFixed(0),
    attempts: tables.exam_attempts.length,
    candidates: tables.exam_candidates.length,
    distinctAttempts,
    distinctCandidates,
    duplicateAttempts,
    failureSample: failed.slice(0, 3).map((f) => ({ status: f.status, error: f.body?.error })),
  };
  console.log(
    `${String(n).padStart(4)} concurrent joins over ${String(devices).padStart(4)} devices: ` +
    `${entered.length}/${n} entered (${report.successPct}%) in ${report.wallMs}ms wall — ` +
    `P50=${report.p50}ms P95=${report.p95}ms P99=${report.p99}ms — ` +
    `attempts=${report.attempts} candidates=${report.candidates} duplicates=${duplicateAttempts}`,
  );
  if (failed.length) console.log(`   failure sample: ${JSON.stringify(report.failureSample)}`);
  return report;
}

/* ── the three required scales ── */
console.log("Part C load test — real route, isolated in-memory DB, all joins fired simultaneously\n");
const reports = [];
reports.push(await runScale(100, 0));    // 100 students, 100 devices
reports.push(await runScale(500, 0));    // 500 students, 500 devices
reports.push(await runScale(1000, 0));   // 1000 students, 1000 devices
reports.push(await runScale(1000, 25));  // 1000 students sharing 25 lab browsers

/* ── shared-device resume semantics under the same load model ── */
tables = makeTables();
const sharedKey = `lab-browser-shared-${sharedKeySeed}`;
const firstJoin = await (await post({ ...joinBody(1, sharedKey) })).json();
const secondJoin = await (await post({ ...joinBody(1, sharedKey) })).json();
const otherStudentSameDevice = await (await post({ ...joinBody(2, sharedKey) })).json();
const resumeOk = firstJoin.attempt_id && firstJoin.attempt_id === secondJoin.attempt_id;
const secondStudentOk = Boolean(otherStudentSameDevice.attempt_id) &&
  otherStudentSameDevice.attempt_id !== firstJoin.attempt_id;
const noDupes = tables.exam_attempts.length === 2;
console.log(`\nshared device: same student resumes = ${resumeOk}; second student admitted separately = ${secondStudentOk}; attempts = ${tables.exam_attempts.length} (expect 2)`);

/* ── true race: the SAME person double-fires on one device simultaneously ── */
tables = makeTables();
const raceKey = `lab-browser-race-${sharedKeySeed}`;
const raceBodies = [joinBody(7, raceKey), joinBody(7, raceKey)];
const raceResults = await Promise.all(raceBodies.map((b) => post(b)));
const raceJson = await Promise.all(raceResults.map((r) => r.json().catch(() => null)));
const raceIds = raceJson.map((b) => b?.attempt_id).filter(Boolean);
const raceOk = raceIds.length === 2 && raceIds[0] === raceIds[1] &&
  tables.exam_attempts.length === 1 && tables.exam_candidates.length === 1 &&
  raceResults.every((r) => r.status === 200);
console.log(`same-person double-fire race: one attempt = ${tables.exam_attempts.length === 1}; one candidate = ${tables.exam_candidates.length === 1}; both requests resolved to the same attempt = ${raceIds.length === 2 && raceIds[0] === raceIds[1]}`);

const meetsTarget = reports.every((r) => Number(r.successPct) >= 99 && r.duplicateAttempts === 0 &&
  r.attempts === r.n && r.candidates === r.n);
const pass = meetsTarget && resumeOk && secondStudentOk && noDupes && raceOk;
console.log(pass
  ? "\nLOAD TEST: PASS — ≥99% success, zero duplicates at 100/500/1000 (incl. 1000 over 25 shared devices, plus same-person double-fire race)"
  : "\nLOAD TEST: FAIL");
process.exit(pass ? 0 : 1);
