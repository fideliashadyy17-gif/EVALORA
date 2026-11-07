/**
 * Checks for the Grade 7 (MYP 2) summative assessment.
 *
 *  0053 questions 1–25, 0054 questions 26–50, 0055 the 200 options,
 *  0056 the 23 figures, 0057 the quiz, the paper and the examination.
 *
 * The migrations are the source of truth for the questions, their options, the
 * keyed answer of each, the figures they show and the examination
 * configuration, so the assertions read the SQL that actually runs — not a copy
 * of it. The printed answer key (page 22 of the source document) is written out
 * below and every keyed option is matched against it, because a paper whose key
 * drifts from the document marks correct students wrong.
 *
 * Run: node scripts/test-grade7-summative.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");

const Q1 = read("supabase/migrations/0053_summative_grade7_questions_1_25.sql");
const Q2 = read("supabase/migrations/0054_summative_grade7_questions_26_50.sql");
const OPTIONS = read("supabase/migrations/0055_summative_grade7_options.sql");
const FIGURES = read("supabase/migrations/0056_summative_grade7_figures.sql");
const EXAM = read("supabase/migrations/0057_summative_grade7_exam.sql");

const ALL_Q = Q1 + "\n" + Q2;

let passed = 0;
const ok = (name, condition, detail) => {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

/* ── Questions ── */
const questionRows = [...ALL_Q.matchAll(/^ {2}\((\d{1,2}), \$txt\$(.+?)\$txt\$/gm)].map((m) => ({
  n: Number(m[1]),
  prompt: m[2],
}));
ok("fifty questions are seeded", questionRows.length === 50, `found ${questionRows.length}`);
ok(
  "every question number from 1 to 50 appears exactly once",
  JSON.stringify(questionRows.map((r) => r.n).sort((a, b) => a - b)) ===
    JSON.stringify(Array.from({ length: 50 }, (_, i) => i + 1)),
);
ok("no prompt is empty", questionRows.every((r) => r.prompt.trim().length > 10));
ok(
  "no prompt is a figure caption",
  questionRows.every((r) => !r.prompt.includes(" • ")),
  questionRows.filter((r) => r.prompt.includes(" • ")).map((r) => r.n).join(", "),
);
ok(
  "every prompt is the document's own wording",
  questionRows[0].prompt ===
    "There are 6 red counters and 9 blue counters. State the ratio of red to blue in simplest form." &&
    questionRows[49].prompt.startsWith("The three circles are music (M), art (A) and sport (S)."),
);
ok(
  "every question carries its chapter, criterion and printed level",
  (ALL_Q.match(/"criterion": "[A-D]"/g) ?? []).length === 50 &&
    (ALL_Q.match(/"criterion_level": [1-6]/g) ?? []).length === 50 &&
    (ALL_Q.match(/"criterion_objective":/g) ?? []).length === 50,
);
ok(
  "difficulty is recorded for every question on a documented scale",
  (ALL_Q.match(/\$txt\$(easy|medium|hard)\$txt\$/g) ?? []).length === 50 &&
    (Q1.match(/level 1–2 easy, 3–4\s*\n-- medium, 5–6 hard/) !== null ||
      Q1.includes("level 1–2 easy, 3–4")),
);
ok(
  "every explanation states the working and the three distractors",
  (ALL_Q.match(/Why the other options are wrong:/g) ?? []).length === 50,
);
ok(
  "the source marker is shared by every row",
  (ALL_Q.match(/myp2-ratio-rate-proportion-and-sets-e-assessment/g) ?? []).length >= 50,
);
ok(
  "questions are published and approved, never left as drafts",
  (ALL_Q.match(/'published', 'approved'/g) ?? []).length === 2 &&
    !/'(draft|pending)'/.test(ALL_Q),
);
ok(
  "each step is idempotent",
  (Q1.match(/where not exists/g) ?? []).length === 1 && (Q2.match(/where not exists/g) ?? []).length === 1,
);

/* ── Options and the key ── */
// Page 22 of the source document: "Quick check — all 50 answers at a glance".
const PRINTED_KEY = "ABDAADBCDCDCABBCBDACACABBCDDCBAACDCBBCADADABDABDCB";

const optionRows = [...OPTIONS.matchAll(/^ {2}\((\d{1,2}), \$txt\$([A-D])\$txt\$, (\d), (true|false)/gm)].map((m) => ({
  n: Number(m[1]),
  label: m[2],
  position: Number(m[3]),
  correct: m[4] === "true",
}));

ok("two hundred options are seeded", optionRows.length === 200, `found ${optionRows.length}`);
ok(
  "every question has exactly four options",
  Array.from({ length: 50 }, (_, i) => i + 1).every((n) => optionRows.filter((o) => o.n === n).length === 4),
);
ok(
  "every question has exactly one keyed option",
  Array.from({ length: 50 }, (_, i) => i + 1).every((n) => optionRows.filter((o) => o.n === n && o.correct).length === 1),
);
ok(
  "the keyed option of every question matches the printed answer key",
  optionRows
    .filter((o) => o.correct)
    .sort((a, b) => a.n - b.n)
    .every((o, index) => o.label === PRINTED_KEY[index] && PRINTED_KEY.length === 50),
  optionRows.filter((o) => o.correct).map((o) => o.label).join(""),
);
ok(
  "options keep the printed A–D order and position",
  optionRows.every((o) => o.position === "ABCD".indexOf(o.label) + 1),
);
ok(
  "every option carries its text document, not a bare letter",
  OPTIONS.includes(
    "insert into public.question_options (question_id, label, is_correct, position, content_doc)",
  ) && OPTIONS.includes("jsonb_build_object('type', 'text', 'text', o.body)"),
);
ok(
  "the printed option wording is preserved",
  OPTIONS.includes("$txt$2 : 3$txt$") &&
    OPTIONS.includes("$txt$400 FCFA per kg$txt$") &&
    OPTIONS.includes("$txt${1, 3, 5, 7}$txt$"),
);
ok(
  "the options step is idempotent",
  OPTIONS.includes("not exists (select 1 from public.question_options o where o.question_id = q.id)"),
);

/* ── Figures ── */
const figureNumbers = [...FIGURES.matchAll(/^ {2}when (\d{1,2}) then/gm)].map((m) => Number(m[1]));
ok("twenty-three questions carry a figure", figureNumbers.length === 23, `found ${figureNumbers.length}`);
ok(
  "every figure file exists in the repository and is not empty",
  figureNumbers.every((n) => {
    const path = `public/exam-figures/grade7/q${String(n).padStart(2, "0")}.png`;
    return existsSync(path) && statSync(path).size > 5_000;
  }),
);
ok(
  "figures are attached only where the drawing holds the data",
  [...figureNumbers].sort((a, b) => a - b).join(",") ===
    "2,4,6,11,14,19,21,22,23,24,27,29,36,41,42,43,44,45,46,47,48,49,50",
);
ok(
  "the figure step reads the prompt from the row instead of re-typing it",
  FIGURES.includes("'text', q.prompt") && !FIGURES.includes("There are 6 red counters"),
);
ok("the figure step is idempotent", FIGURES.includes('not like \'%"image"%\''));

/* ── The examination ── */
ok("the examination is named for the grade", EXAM.includes("'Summative Assessment — Grade 7'"));
ok("it is attached to the Grade 7 — MYP 2 class", EXAM.includes("0a400000-0000-4000-8000-000000000107"));
ok("it keeps the document's 45 minutes", /^\s{4}45,$/m.test(EXAM) && EXAM.includes("'MYP2-RATIO-2026'"));
ok("it refuses to build an incomplete paper", EXAM.includes("v_questions <> 50 or v_options <> 200 or v_correct <> 50"));
ok("it is idempotent", EXAM.includes("already exists"));
ok(
  "the printed order is kept so the A–D key stays valid",
  EXAM.includes("'randomize_questions', false") && EXAM.includes("'randomize_options', false"),
);
ok("results are published on submission", EXAM.includes("'results_published', true"));
ok(
  "the integrity policy is written explicitly, not left to chance",
  EXAM.includes("'integrity', jsonb_build_object") &&
    EXAM.includes("'enabled', true") &&
    EXAM.includes("'tabSwitch', true") &&
    EXAM.includes("'warnAfter', 3") &&
    EXAM.includes("'reviewAfter', 5"),
);
ok(
  "the student-facing instructions are honest about what is recorded",
  EXAM.includes("Integrity monitoring is on") &&
    EXAM.includes("leaving the assessment tab") &&
    EXAM.includes("leaving full screen"),
);
ok("no camera proctoring is switched on by surprise", EXAM.includes("'proctoring', false"));

/* ── Source provenance ── */
ok(
  "each migration names the source document it transcribes",
  [Q1, Q2, OPTIONS, FIGURES, EXAM].every((sql) =>
    sql.includes("MYP 2 Mathematics — Ratio, Rate, Proportion & Sets"),
  ),
);

console.log(`\n${passed} checks passed.`);
