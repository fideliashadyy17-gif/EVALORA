/**
 * Production readiness verification for high-concurrency Version C examinations:
 *   1. Section-aware randomization keeps Section B in authored order while shuffling Section A.
 *   2. Monitor row builder supports SQL-aggregated `answer_stats` + `incident_count` identically to raw answers.
 *   3. Candidate UX fixes (`assess_parts` autosave/flush, Bearer leave beacon, strict multi-display check).
 *   4. Desktop Secure Browser allows `*.evalora-edu.online` institutional portals.
 *   5. Vercel function co-location (`cdg1`) and additive high-concurrency SQL migration presence.
 *
 * Run: node scripts/test-exam-production-readiness.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

function compileTs(filePath, shims = {}) {
  const resolved = path.resolve(filePath);
  const mod = new Module(resolved);
  mod.filename = resolved;
  mod.paths = Module._nodeModulePaths(path.dirname(resolved));
  const origLoad = Module._load;
  Module._load = function (request, parent) {
    if (parent?.filename === resolved && Object.hasOwn(shims, request)) return shims[request];
    if (request.startsWith("./") || request.startsWith("../")) {
      const base = path.resolve(path.dirname(parent.filename), request);
      for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        if (existsSync(candidate)) return compileTs(candidate, shims);
      }
    }
    return origLoad.apply(this, arguments);
  };
  try {
    const out = ts.transpileModule(readFileSync(resolved, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    mod._compile(out, resolved);
  } finally {
    Module._load = origLoad;
  }
  return mod.exports;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("\n1. Section-aware randomization (MYP4/MYP5 Version C)");
const live = compileTs("src/lib/live.ts");
const versionCSections = [
  {
    id: "A",
    title: "SECTION A — MULTIPLE CHOICE QUESTIONS",
    questions: 30,
    marks: 60,
    instructions: "Answer all questions in this section. Question and answer-option order is randomized within this section for each candidate.",
  },
  {
    id: "B",
    title: "SECTION B — THEORY QUESTIONS",
    questions: 4,
    marks: 40,
    instructions: "Answer all questions in this section. Show complete working. Randomization is disabled where questions share source material or depend on each other.",
  },
];
const samplePaper = [
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `secA-${i + 1}`,
    questions: { config: { paper_section: "A" } },
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `secB-${i + 1}`,
    questions: { config: { paper_section: "B" } },
  })),
];

check("Section A shuffles deterministically while Section B stays in exact authored order", () => {
  const order1 = live.randomizeQuestionRows(samplePaper, "exam:candidate-1", versionCSections).map((r) => r.id);
  const order2 = live.randomizeQuestionRows(samplePaper, "exam:candidate-2", versionCSections).map((r) => r.id);
  const order1Repeat = live.randomizeQuestionRows(samplePaper, "exam:candidate-1", versionCSections).map((r) => r.id);

  assert.deepEqual(order1, order1Repeat, "same seed must produce identical order");
  assert.equal(order1.length, samplePaper.length, "no questions lost or duplicated");
  assert.deepEqual(order1.slice(12), ["secB-1", "secB-2", "secB-3", "secB-4"], "Section B stays in authored order for candidate 1");
  assert.deepEqual(order2.slice(12), ["secB-1", "secB-2", "secB-3", "secB-4"], "Section B stays in authored order for candidate 2");
  assert.notDeepEqual(order1.slice(0, 12), order2.slice(0, 12), "Section A differs across candidates");
  assert.equal(new Set(order1).size, samplePaper.length, "all question IDs unique");
});

check("Explicit randomize:false disables randomization on that section", () => {
  const ordered = live.randomizeQuestionRows(samplePaper, "exam:candidate-3", [
    { id: "A", randomize: false },
    { id: "B", randomize: true },
  ]).map((r) => r.id);
  assert.deepEqual(ordered.slice(0, 12), samplePaper.slice(0, 12).map((r) => r.id));
});

console.log("\n2. Monitor row SQL aggregate stats parity");
const monitorRows = compileTs("src/lib/monitorRows.ts");
check("buildMonitorRow with SQL answer_stats matches raw answer computation and exposes incident_count", () => {
  const paper = [
    { id: "q1", questions: {} },
    { id: "q2", questions: {} },
    { id: "q3", questions: {} },
    { id: "q4", questions: {} },
  ];
  const nowMs = Date.parse("2026-11-26T09:00:00Z");
  const baseInput = {
    id: "att-1",
    status: "in_progress",
    started_at: "2026-11-26T08:30:00Z",
    submitted_at: null,
    track: null,
    question_order: ["q1", "q2", "q3", "q4"],
    candidate_name: "Ada Lovelace",
    candidate_ref: "OAK-01",
    class_name: "MYP4",
    deadline: "2026-11-26T10:30:00Z",
    extension_minutes: 0,
    presence: { last_seen_at: "2026-11-26T08:59:50Z", current_question: 3, pending_saves: 0 },
    unread_from_candidate: 1,
    incident_count: 2,
  };
  const fromRaw = monitorRows.buildMonitorRow(
    {
      ...baseInput,
      answers: [
        { quiz_question_id: "q1", answer: { option_id: "a" }, is_correct: true, points_awarded: 2 },
        { quiz_question_id: "q2", answer: { parts: { a: "42" } }, is_correct: null, points_awarded: null },
        { quiz_question_id: "q3", answer: { text: "" }, is_correct: null, points_awarded: null },
      ],
    },
    paper,
    nowMs,
  );
  const fromRpc = monitorRows.buildMonitorRow(
    {
      ...baseInput,
      answers: [],
      answer_stats: { answered: 2, correct: 1, incorrect: 0, awaiting_grading: 1, marked: 0 },
    },
    paper,
    nowMs,
  );
  assert.deepEqual(fromRpc, fromRaw);
  assert.equal(fromRpc.answered, 2);
  assert.equal(fromRpc.unanswered, 2);
  assert.equal(fromRpc.progress_percent, 50);
  assert.equal(fromRpc.incident_count, 2);
});

console.log("\n3. Candidate UX, lockdown, desktop, & deployment configuration");
check("QuestionRunner autosaves assess_parts and registers synchronous draft flush", () => {
  const runnerSrc = readFileSync("src/components/QuestionRunner.tsx", "utf8");
  assert.ok(runnerSrc.includes("scheduleAssessPartsAutosave"), "assess_parts debounced autosave present");
  assert.ok(runnerSrc.includes("onRegisterFlush"), "synchronous flush hook present");
});

check("TakeExamClient flushes drafts before navigation/submit and uses Bearer + event:leave", () => {
  const clientSrc = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
  assert.ok(clientSrc.includes("flushDraftRef.current()"), "auto-flush before navigation/submit");
  assert.ok(clientSrc.includes('Authorization: `Bearer ${token}`'), "leave beacon carries Bearer token");
  assert.ok(clientSrc.includes('event: "leave"'), "leave beacon uses event:leave schema");
  assert.ok(!clientSrc.includes('action: "leave"'), "broken action:leave removed");
});

check("JoinClient enforces strict_multi_display via checkIntegrity()", () => {
  const joinSrc = readFileSync("src/app/exam/join/[token]/JoinClient.tsx", "utf8");
  assert.ok(joinSrc.includes("strictMultiDisplay"), "strictMultiDisplay prop accepted");
  assert.ok(joinSrc.includes("lockdownApi.checkIntegrity()"), "checkIntegrity called before admission");
  assert.ok(joinSrc.includes("display_count"), "display_count evaluated");
});

check("Desktop Secure Browser permits *.evalora-edu.online subdomains", () => {
  const mainJs = readFileSync("desktop/src/main.js", "utf8");
  assert.ok(mainJs.includes('host.endsWith(".evalora-edu.online")'), "institutional subdomain host allowlist present");
});

check("Vercel co-location (cdg1) and high-concurrency migration exist", () => {
  const vercelCfg = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.deepEqual(vercelCfg.regions, ["cdg1"], "Vercel functions co-located in Paris (cdg1)");
  const sql = readFileSync("supabase/migrations/20261125200000_exam_high_concurrency_performance.sql", "utf8");
  assert.ok(sql.includes("save_exam_answer_fast"), "save_exam_answer_fast RPC defined");
  assert.ok(sql.includes("apply_graded_exam_answers"), "apply_graded_exam_answers RPC defined");
  assert.ok(sql.includes("record_exam_heartbeat"), "record_exam_heartbeat RPC defined");
  assert.ok(sql.includes("find_exam_candidates_for_join"), "find_exam_candidates_for_join RPC defined");
  assert.ok(sql.includes("exam_monitor_answer_stats"), "exam_monitor_answer_stats RPC defined");
});

console.log(`\nALL ${passed} PRODUCTION READINESS CHECKS PASSED\n`);
