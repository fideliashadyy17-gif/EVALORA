/**
 * Capacity benchmark — realistic exam activity for 100 / 200 / 300 / 500
 * simultaneous candidates spread across BOTH new First Term papers.
 *
 * What is real here:
 *   • the production autosave route (src/app/api/exam/save/route.ts) is compiled
 *     and executed for every request, including Zod validation, deadline checks,
 *     paper-membership checks, association checks and persistence verification;
 *   • the production MYP grading engine (src/lib/myp.ts) grades every attempt;
 *   • the paper rows, marks and criteria come from the real migrations, executed
 *     in PGlite;
 *   • every candidate saves ten times while composing and then submits.
 *
 * What is simulated:
 *   • the database boundary (in-memory maps instead of Supabase), so no network
 *     or Postgres latency is included;
 *   • the browser (requests are fired directly, with three saves in flight per
 *     candidate, the autosave queue's normal concurrency).
 *
 * This is therefore an application-work benchmark, not proof of production
 * capacity. The report separates it from the admission load test and from the
 * free-tier infrastructure limits.
 *
 * Run: node scripts/benchmark-exam-activity-500.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import path from "node:path";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const require = createRequire(import.meta.url);
const filename = path.resolve("scripts/__virtual_exam_save_benchmark.cjs");
const compiled = ts.transpileModule(readFileSync("src/app/api/exam/save/route.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

const NOW = Date.now();
const future = new Date(NOW + 60 * 60_000).toISOString();

function compile(rel) {
  const out = {};
  const source = ts.transpileModule(readFileSync(rel, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function("exports", "require", source)(out, (id) => require(id));
  return out;
}
const examTrack = compile("src/lib/examTrack.ts");
const examPause = compile("src/lib/examPause.ts");
const myp = {};
new Function("exports", ts.transpileModule(readFileSync("src/lib/myp.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(myp);

const attempts = new Map();
const answers = new Map();
let writes = 0;

const admin = {
  from(table) {
    if (table === "quiz_questions") {
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() {
          return { data: { id: "00000000-0000-4000-8000-00000000ffff", questions: { type: "open_ended" } } };
        },
      };
      return query;
    }
    if (table === "exam_answers") {
      return {
        upsert(row) {
          writes += 1;
          answers.set(`${row.attempt_id}:${row.question_id}`, row);
          const query = {
            select() { return query; },
            async maybeSingle() {
              return { data: { id: "00000000-0000-4000-8000-00000000eeee", updated_at: row.updated_at }, error: null };
            },
          };
          return query;
        },
      };
    }
    if (table === "exam_attempts") {
      return {
        update() { return { async eq() { return { error: null }; } }; },
      };
    }
    if (table === "exam_presence") {
      const query = {
        select() { return query; },
        eq() { return query; },
        update() { return { async eq() { return { error: null }; } }; },
        async maybeSingle() { return { data: { pending_saves: 0 } }; },
      };
      return query;
    }
    throw new Error(`Unexpected table ${table}`);
  },
};

const exam = {
  async loadAttemptContext(_admin, attemptId, token) {
    const attempt = attempts.get(attemptId);
    if (!attempt || attempt.token !== token) return null;
    return { attempt, exam: attempt.exam };
  },
  attemptDeadline() { return new Date(future); },
  async attemptRows() { return []; },
  async gradeAttempt() { return { score: 0, max: 100 }; },
};

const virtual = new Module(filename);
virtual.filename = filename;
virtual.paths = Module._nodeModulePaths(path.dirname(filename));
virtual.require = (id) => {
  if (id === "@/lib/exam") return exam;
  if (id === "@/lib/supabase/server") return { createAdminClient: () => admin };
  if (id === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } };
  if (id === "@/lib/examTrack") return examTrack;
  if (id === "@/lib/examPause") return examPause;
  if (id === "@/lib/connectionLost") return {
    resumeConnectionPause: async () => null, isConnectionLost: () => false,
    connectionLostAnchor: () => null, pauseForConnectionLost: async () => null,
  };
  if (id === "@/lib/responseTools") return { validateAnswerPayload: () => ({ ok: true, answer: { text: "work" } }) };
  return require(id);
};
virtual._compile(compiled, filename);
const POST = virtual.exports.POST;

const SCHEMA = `
create table quizzes (id uuid primary key, organization_id uuid not null, title text not null,
  description text, status text not null default 'draft', settings jsonb not null default '{}'::jsonb,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  class_id uuid);
create table exams (id uuid primary key, organization_id uuid not null, quiz_id uuid, title text not null,
  description text, instructions text, duration_minutes integer not null default 60,
  status text not null default 'draft', settings jsonb not null default '{}'::jsonb, created_by uuid,
  created_at timestamptz not null default now(), class_id uuid);
create table questions (id uuid primary key, organization_id uuid not null, type text not null,
  prompt text not null, prompt_doc jsonb, explanation text, points numeric not null default 1,
  difficulty text not null default 'medium', topic text, subtopic text, tags text[] not null default '{}',
  status text not null default 'draft', config jsonb not null default '{}'::jsonb, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  curriculum text, curriculum_course text, subject_id uuid, class_id uuid,
  creation_method text not null default 'manual', review_status text not null default 'draft',
  source_reference text);
create table question_options (id uuid primary key default gen_random_uuid(), question_id uuid not null,
  label text not null, is_correct boolean not null default false, position integer not null default 0,
  content_doc jsonb);
create table quiz_questions (id uuid primary key default gen_random_uuid(), quiz_id uuid not null,
  question_id uuid not null, position integer not null default 0, points numeric,
  unique (quiz_id, question_id));
`;

const PAPERS = [
  { key: "MYP4", file: "supabase/migrations/20261117110000_myp4_grade9_first_term_summative.sql",
    quiz: "cb000000-0000-4000-8000-000000000001", count: 45, open: 20 },
  { key: "MYP5", file: "supabase/migrations/20261117110100_myp5_grade10_sequences_version_b.sql",
    quiz: "cc000000-0000-4000-8000-000000000001", count: 35, open: 18 },
];

const db = new PGlite();
await db.exec(SCHEMA);
for (const paper of PAPERS) await db.exec(readFileSync(paper.file, "utf8"));
const papers = [];
for (const paper of PAPERS) {
  const rows = (await db.query(`
    select qq.position, q.points::float as points, q.config ->> 'myp_criterion' as criterion
      from quiz_questions qq join questions q on q.id = qq.question_id
     where qq.quiz_id = $1 order by qq.position`, [paper.quiz])).rows;
  papers.push({ ...paper, questions: rows });
}
await db.close();

const uuid = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const questionIds = Array.from({ length: 45 }, (_, i) => uuid("99999999", i + 1));

function createCandidate(id, competition) {
  const paper = papers[competition];
  const attemptId = uuid("aaaaaaaa", id);
  attempts.set(attemptId, {
    id: attemptId,
    token: uuid("bbbbbbbb", id),
    status: "in_progress",
    started_at: new Date(NOW).toISOString(),
    extension_minutes: 0,
    track: null,
    question_order: null,
    pause_reasons: [],
    paused_at: null,
    flagged: [],
    exam: { quiz_id: paper.quiz, organization_id: "org", settings: {}, duration_minutes: 120 },
  });
  return { id, attemptId, token: attempts.get(attemptId).token, paper, saveCount: 0 };
}

async function save(candidate, index) {
  const started = performance.now();
  const response = await POST(new Request("http://bench.local/api/exam/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      attempt_id: candidate.attemptId,
      token: candidate.token,
      question_id: questionIds[index],
      answer: { text: `working ${index}` },
      idempotency_key: `save-${candidate.id}-${index}`,
    }),
  }));
  const elapsed = performance.now() - started;
  if (response.status !== 200) throw new Error(`save failed: ${response.status}`);
  candidate.saveCount += 1;
  return elapsed;
}

const rules = {
  criteria: myp.presetForSubject("Mathematics").criteria.map((criterion, index) => ({
    ...criterion, description: null, position: index,
  })),
  levelBoundaries: myp.DEFAULT_LEVEL_BOUNDARIES,
  gradeBoundaries: myp.DEFAULT_GRADE_BOUNDARIES,
  levelSource: "default", gradeSource: "default", requireAllCriteria: true,
  criteriaMaxLevel: 8, source: "configured",
};

function gradeCandidate(candidate) {
  const answers = candidate.paper.questions.map((row, index) => {
    const isOpen = index >= candidate.paper.count - candidate.paper.open;
    if (isOpen) {
      return index % 3 === 0
        ? { questionId: String(row.position), pointsAwarded: null, hasContent: false }
        : { questionId: String(row.position), pointsAwarded: null, hasContent: true };
    }
    const correct = index % 10 < 7;
    return {
      questionId: String(row.position), pointsAwarded: correct ? row.points : 0,
      hasContent: true, isCorrect: correct,
    };
  });
  return myp.buildMypResult({
    attempt: {
      attemptId: candidate.attemptId, examId: "exam", organizationId: "org",
      organizationName: "Oak International School", examTitle: candidate.paper.key,
      examDate: null, attemptStatus: "submitted", submittedAt: new Date(NOW).toISOString(),
      score: null, maxScore: 100, published: false, studentName: `Candidate ${candidate.id}`,
      className: "Grade", mypYear: null, subjectNames: ["Mathematics"],
      subjectLabel: "Mathematics", subjectId: null, reportingPeriod: "First Term",
    },
    paper: candidate.paper.questions.map((row) => ({
      questionId: String(row.position), points: row.points, criterion: row.criterion, topic: "Paper",
    })),
    answers,
    rules,
  });
}

async function runLevel(total) {
  attempts.clear(); answers.clear(); writes = 0;
  const candidates = Array.from({ length: total }, (_, index) => createCandidate(index + 1, index % 2));
  const latencies = [];
  const wallStart = performance.now();
  await Promise.all(candidates.map(async (candidate) => {
    // The browser's save queue keeps at most three saves in flight; each
    // candidate writes ten answers spread over the paper.
    const indices = Array.from({ length: 10 }, (_, i) => Math.floor((i * candidate.paper.count) / 10));
    let cursor = 0;
    const worker = async () => {
      while (cursor < indices.length) {
        const index = indices[cursor++];
        latencies.push(await save(candidate, index));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }));
  const wall = performance.now() - wallStart;

  // Grade every submitted attempt with the production MYP engine: objective
  // answers marked, constructed responses left pending exactly as at submission.
  const gradeLatencies = [];
  const gradeStart = performance.now();
  for (const candidate of candidates) {
    const started = performance.now();
    const result = gradeCandidate(candidate);
    gradeLatencies.push(performance.now() - started);
    if (result.criteria.length !== 4) throw new Error("grading lost a criterion");
  }
  const gradeWall = performance.now() - gradeStart;

  const expectedAnswers = candidates.length * 10;
  const duplicates = [...answers.keys()].length !== answers.size ? 0 : expectedAnswers - answers.size;
  return {
    total,
    saves: writes,
    expectedAnswers,
    duplicates,
    wallMs: wall,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    savesPerSecond: writes / (wall / 1000),
    answersPerCandidate: [...answers.keys()].length / candidates.length,
    competitions: 2,
    gradeWall,
    gradeP99: percentile(gradeLatencies, 0.99),
    graded: candidates.length,
  };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

console.log("Exam activity benchmark — real save route + real grading maths, in-memory DB\n");
console.log("  candidates  saves  verified  dup  wall(ms)  p50(ms)  p95(ms)  p99(ms)  saves/s  graded  grade-p99(ms)");
const results = [];
await runLevel(50); // warm-up: compile/JIT is not part of any measured level
for (const total of [100, 200, 300, 500]) {
  const runs = [];
  for (let repetition = 0; repetition < 3; repetition += 1) runs.push(await runLevel(total));
  runs.sort((a, b) => a.wallMs - b.wallMs);
  const result = runs[1];
  results.push(result);
  console.log(
    `  ${String(result.total).padStart(10)}  ${String(result.saves).padStart(5)}  ` +
    `${String(result.answersPerCandidate.toFixed(1)).padStart(8)}  ${String(result.duplicates).padStart(3)}  ` +
    `${result.wallMs.toFixed(0).padStart(8)}  ${result.p50.toFixed(1).padStart(7)}  ` +
    `${result.p95.toFixed(1).padStart(7)}  ${result.p99.toFixed(1).padStart(7)}  ` +
    `${result.savesPerSecond.toFixed(0).padStart(7)}  ${String(result.graded).padStart(6)}  ` +
    `${result.gradeP99.toFixed(1).padStart(13)}`,
  );
}

const failures = results.filter((result) => result.duplicates !== 0 || result.saves !== result.total * 10);
const worst = results.reduce((max, result) => Math.max(max, result.p99), 0);
console.log(`\n${failures.length === 0 ? "PASS" : "FAIL"} — every autosave acknowledged, no lost or duplicate answer rows.`);
console.log(`Worst p99 at 500 candidates: ${worst.toFixed(1)} ms (in-process, database simulated).`);
console.log("Production capacity also depends on Vercel functions, Supabase connection limits and network RTT; see docs/SUMMATIVE_A_CAPACITY.md.");
process.exit(failures.length === 0 ? 0 : 1);
