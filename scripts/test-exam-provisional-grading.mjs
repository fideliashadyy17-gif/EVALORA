// Real `gradeAttempt` with an in-memory Supabase boundary. Not E2E.
//
// Covers the rule the candidate-facing result depends on: an objective answer
// is marked at once, a written answer waits for a teacher — but only if the
// student actually wrote something. A blank must score zero and get out of the
// way, so one empty box can never hold a whole result back as "provisional".
import assert from "node:assert/strict";
import { compile } from "./lib/loadTs.mjs";

const responseTools = {
  responseWorkspaceFor: () => ({
    tools: [],
    graph: { enabled: false, title: "Graph", instructions: "", allowFunctions: true, starter: null },
    geometry: { enabled: false, title: "Geometry", instructions: "", starter: null },
    guidance: "",
    requirement: "any",
    source: "native",
  }),
};
const assessParts = compile("src/lib/assessParts.ts", "scripts/__virtual_assess_parts_prov.cjs");
const examResults = compile("src/lib/examResults.ts", "scripts/__virtual_exam_results_prov.cjs");
const live = compile("src/lib/live.ts", "scripts/__virtual_live_prov.cjs", {
  "./responseTools": responseTools,
  "./assessParts": assessParts,
  "./examResults": examResults,
});
const scoring = compile("src/lib/scoring.ts", "scripts/__virtual_scoring_prov.cjs", { "./assessParts": assessParts });
const examDeadline = compile("src/lib/examDeadline.ts", "scripts/__virtual_exam_deadline_prov.cjs");
const { attemptRows, gradeAttempt } = compile("src/lib/exam.ts", "scripts/__virtual_exam_prov.cjs", {
  "./live": live,
  "./scoring": scoring,
  "./examDeadline": examDeadline,
});

// ── an in-memory stand-in for the tables grading touches ──────────────────────
const OBJECTIVE = (id, points) => ({
  id: "qq" + id,
  question_id: id,
  quiz_id: "quiz",
  position: 1,
  points,
  questions: {
    id,
    type: "single_choice",
    points,
    config: {},
    question_options: [
      { id: "correct", label: "yes", is_correct: true, position: 0 },
      { id: "wrong", label: "no", is_correct: false, position: 1 },
    ],
  },
});
// A constructed response: the machine can score it, but a teacher must confirm it.
const WRITTEN = (id, points) => ({
  id: "qq" + id,
  question_id: id,
  quiz_id: "quiz",
  position: 1,
  points,
  questions: { id, type: "open_ended", points, config: { manual_marking: true } },
});

let tables;
let gradeWrites;
const db = {
  from(table) {
    const filters = [];
    let patch = null;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
      order() { return query; },
      update(data) { patch = data; return query; },
      async maybeSingle() {
        const row = tables[table].find((r) => filters.every((f) => f(r)));
        if (!row) return { data: null, error: null };
        Object.assign(row, patch);
        gradeWrites.push({ id: row.id, ...patch });
        return { data: { id: row.id }, error: null };
      },
      then(resolve, reject) {
        return Promise.resolve({ data: tables[table].filter((r) => filters.every((f) => f(r))), error: null })
          .then(resolve, reject);
      },
    };
    return query;
  },
};

const exam = { quiz_id: "quiz", settings: {} };
const attempt = { id: "attempt", question_order: [] };
let passed = 0;

async function scenario(name, questions, answers, fn) {
  tables = {
    quiz_questions: questions,
    exam_answers: answers.map((a, i) => ({ id: "a" + i, attempt_id: "attempt", marked_by: null, ...a })),
  };
  gradeWrites = [];
  attempt.question_order = questions.map((q) => q.id);
  const rows = await attemptRows(db, exam, attempt);
  const result = await gradeAttempt(db, "attempt", rows);
  await fn(result, gradeWrites);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("Provisional and final grading");

await scenario("a correct objective answer is marked immediately and is final",
  [OBJECTIVE("q1", 2)],
  [{ question_id: "q1", answer: { option_id: "correct" } }],
  async (r) => {
    assert.deepEqual(r, { score: 2, max: 2, autoScore: 2, autoMax: 2, pendingManual: 0, status: "final" });
  });

await scenario("a wrong objective answer is also final — being wrong is not being unmarked",
  [OBJECTIVE("q1", 2)],
  [{ question_id: "q1", answer: { option_id: "wrong" } }],
  async (r) => {
    assert.deepEqual(r, { score: 0, max: 2, autoScore: 0, autoMax: 2, pendingManual: 0, status: "final" });
  });

await scenario("a written answer awaits a teacher, so the result is provisional",
  [WRITTEN("q1", 3)],
  [{ question_id: "q1", answer: { text: "The base is 60 m, so h = 3022 m." } }],
  async (r) => {
    assert.equal(r.status, "provisional");
    assert.equal(r.pendingManual, 1);
    assert.equal(r.score, 0, "no marks are invented before a teacher sees it");
    assert.equal(r.max, 3, "the mark is still counted in the total available");
    assert.equal(r.autoMax, 0);
  });

await scenario("a blank written answer scores zero and does NOT hold the result back",
  [WRITTEN("q1", 3)],
  [{ question_id: "q1", answer: { text: "   " } }],
  async (r) => {
    assert.equal(r.status, "final", "an empty box must not make a finished exam provisional");
    assert.equal(r.pendingManual, 0);
    assert.equal(r.score, 0);
    assert.equal(r.max, 3);
    assert.equal(r.autoMax, 3, "the machine judged it, so it is not left out of the pool");
  });

await scenario("a nil answer is treated as blank, not as pending",
  [WRITTEN("q1", 3)],
  [{ question_id: "q1", answer: null }],
  async (r) => {
    assert.equal(r.status, "final");
    assert.equal(r.pendingManual, 0);
    assert.equal(r.score, 0);
    assert.equal(r.max, 3);
  });

await scenario("objective marks are banked at once even while a written part waits",
  [OBJECTIVE("q1", 2), WRITTEN("q2", 3), OBJECTIVE("q3", 5)],
  [
    { question_id: "q1", answer: { option_id: "correct" } },
    { question_id: "q2", answer: { text: "working…" } },
    { question_id: "q3", answer: { option_id: "correct" } },
  ],
  async (r) => {
    assert.equal(r.status, "provisional");
    assert.equal(r.pendingManual, 1);
    assert.equal(r.autoScore, 7, "2 + 5 objective marks are awarded immediately");
    assert.equal(r.autoMax, 7);
    assert.equal(r.score, 7, "the provisional total already includes the objective marks");
    assert.equal(r.max, 10);
  });

await scenario("two written answers both wait, and both are counted",
  [WRITTEN("q1", 3), WRITTEN("q2", 4)],
  [
    { question_id: "q1", answer: { text: "first" } },
    { question_id: "q2", answer: { text: "second" } },
  ],
  async (r) => {
    assert.equal(r.status, "provisional");
    assert.equal(r.pendingManual, 2);
    assert.equal(r.max, 7);
  });

await scenario("a human mark is trusted and does not count as pending",
  [WRITTEN("q1", 3)],
  [{ question_id: "q1", answer: { text: "working…" }, marked_by: "teacher-1", points_awarded: 2.5 }],
  async (r) => {
    assert.equal(r.status, "final");
    assert.equal(r.pendingManual, 0);
    assert.equal(r.score, 2.5);
    assert.equal(r.max, 3);
    assert.equal(r.autoMax, 0, "human-marked work is excluded from the automatic pool");
  });

await scenario("one human mark clears a paper that also has an untouched written part",
  [WRITTEN("q1", 3), WRITTEN("q2", 4)],
  [
    { question_id: "q1", answer: { text: "a" }, marked_by: "teacher-1", points_awarded: 3 },
    { question_id: "q2", answer: { text: "b" } },
  ],
  async (r) => {
    assert.equal(r.status, "provisional", "one part is still unmarked");
    assert.equal(r.pendingManual, 1);
    assert.equal(r.score, 3, "the teacher's mark is already in the total");
    assert.equal(r.max, 7);
  });

await scenario("the last human mark flips a provisional result to final",
  [WRITTEN("q1", 3), WRITTEN("q2", 4)],
  [
    { question_id: "q1", answer: { text: "a" }, marked_by: "teacher-1", points_awarded: 3 },
    { question_id: "q2", answer: { text: "b" }, marked_by: "teacher-1", points_awarded: 2 },
  ],
  async (r) => {
    assert.equal(r.status, "final");
    assert.equal(r.pendingManual, 0);
    assert.equal(r.score, 5);
    assert.equal(r.max, 7);
  });

await scenario("an empty paper is final with zero, never stuck",
  [OBJECTIVE("q1", 2), WRITTEN("q2", 3)],
  [],
  async (r) => {
    assert.equal(r.status, "final");
    assert.equal(r.pendingManual, 0);
    assert.equal(r.score, 0);
    assert.equal(r.max, 5);
  });

// The percentage the student sees has to come out of these same numbers.
await scenario("percentage comes from score over max, not from the auto pool alone",
  [OBJECTIVE("q1", 10), WRITTEN("q2", 30)],
  [
    { question_id: "q1", answer: { option_id: "correct" } },
    { question_id: "q2", answer: { text: "working" } },
  ],
  async (r) => {
    const percent = (r.score / r.max) * 100;
    assert.equal(percent, 25, "10 of 40 is 25%, and the unmarked 30 is still in the total");
    assert.equal(r.status, "provisional");
  });

console.log(`\n${passed} provisional/final grading checks passed (real grading logic; mocked DB).`);
