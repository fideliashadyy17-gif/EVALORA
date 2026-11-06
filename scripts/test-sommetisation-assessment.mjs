/**
 * Checks for the Sommetisation Assessment — Grade 10 seed
 * (supabase/migrations/0041_sommetisation_assessment_grade10.sql).
 *
 * The migration is the source of truth for the 50 questions, their four
 * options, the keyed answer of each and the examination configuration, so the
 * assertions below read the SQL that will actually be applied — not a copy.
 *
 * Run: node scripts/test-sommetisation-assessment.mjs
 */
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/0041_sommetisation_assessment_grade10.sql", "utf8");

let passed = 0;
const ok = (name, condition, detail) => {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

/* ── The document's own answer key (PDF key table, cross-checked against the
      marking scheme: 50 rows, 0 mismatches, 0 missing). ── */
const DOCUMENT_KEY = {
  1: "B", 2: "D", 3: "D", 4: "A", 5: "D", 6: "B", 7: "B", 8: "C", 9: "C",
  10: "A", 11: "A", 12: "B", 13: "B", 14: "C", 15: "D", 16: "B",
  17: "D", 18: "C", 19: "C", 20: "A", 21: "C", 22: "D", 23: "C", 24: "D", 25: "A",
  26: "B", 27: "C", 28: "D", 29: "C", 30: "D", 31: "C", 32: "B", 33: "B",
  34: "A", 35: "A", 36: "D", 37: "A", 38: "B", 39: "C", 40: "D", 41: "A", 42: "D",
  43: "A", 44: "A", 45: "B", 46: "A", 47: "B", 48: "C", 49: "B", 50: "C",
};

/* ── Extract the option rows from the `opts` CTE ── */
const optionRows = [...sql.matchAll(/^\s*\((\d+), \$txt\$([ABCD])\$txt\$, (\d), (true|false), \$txt\$/gm)].map(
  (m) => ({ n: Number(m[1]), letter: m[2], position: Number(m[3]), correct: m[4] === "true" }),
);

ok("200 option rows are written (50 questions × 4)", optionRows.length === 200, `found ${optionRows.length}`);
ok(
  "positions are exactly 1–4 for every question",
  Array.from({ length: 50 }, (_, i) => i + 1).every((n) => {
    const rows = optionRows.filter((r) => r.n === n).sort((a, b) => a.position - b.position);
    return rows.length === 4 && rows.map((r) => r.position).join(",") === "1,2,3,4";
  }),
);
ok(
  "each question has exactly one correct option",
  Array.from({ length: 50 }, (_, i) => i + 1).every((n) => optionRows.filter((r) => r.n === n && r.correct).length === 1),
);
ok(
  "the keyed option of every question matches the document key",
  Object.entries(DOCUMENT_KEY).every(([n, letter]) => {
    const correct = optionRows.find((r) => r.n === Number(n) && r.correct);
    return correct?.letter === letter;
  }),
);
ok(
  "every question number 1–50 is present exactly once",
  new Set(optionRows.map((r) => r.n)).size === 50,
);
ok(
  "option letters cover all four choices in every question",
  Array.from({ length: 50 }, (_, i) => i + 1).every((n) => {
    const letters = optionRows.filter((r) => r.n === n).map((r) => r.letter).sort().join("");
    return letters === "ABCD";
  }),
);

/* ── Question rows: 50 seed tuples with prompt + explanation ── */
const seedBlock = sql.slice(sql.indexOf("with seed("), sql.indexOf("),\n  inserted as ("));
const seedRowStarts = [...seedBlock.matchAll(/^\s*\((\d+), \$txt\$/gm)].map((m) => Number(m[1]));
ok("50 question rows are written", seedRowStarts.length === 50, `found ${seedRowStarts.length}`);
ok(
  "question numbers are 1–50 in printed order",
  seedRowStarts.join(",") === Array.from({ length: 50 }, (_, i) => i + 1).join(","),
);
ok("every question row carries an explanation", (seedBlock.match(/\$txt\$1\. /g) ?? []).length === 50);
ok(
  "no question prompt is empty",
  !/\$txt\$\s*\$txt\$/.test(seedBlock),
);

/* ── Structure of the migration ── */
ok("all questions are single-choice", /'single_choice'|single_choice/.test(sql));
ok("questions are published and approved", /'published', 'approved'/.test(sql));
ok("each question is worth exactly 1 mark", /select v_org, 'single_choice'.*?, 1, s.difficulty/s.test(sql));
ok(
  "the source marker is stored on every question",
  /jsonb_build_object\('source', 'myp5-sequences-and-series-e-assessment'/.test(sql),
);
ok("the migration verifies 50 questions and 200 options before continuing", /v_questions <> 50 or v_options <> 200/.test(sql));
ok("re-running the migration is a no-op", /if v_existing is not null then/.test(sql));
ok("the target class is validated in the same tenant", /classes where id = v_class and organization_id = v_org/.test(sql));

/* ── Quiz / paper ── */
ok("one quiz holds the paper", /insert into public\.quizzes/.test(sql));
ok("the quiz is published", /'published',\s*\n\s*jsonb_build_object\('randomize_questions', false, 'randomize_options', false\)/.test(sql));
ok("paper questions are created from the seeded question bank", /insert into public\.quiz_questions/.test(sql));
ok("paper order follows the question number", /order by \(q\.config ->> 'question_number'\)::int/.test(sql));

/* ── Examination configuration ── */
ok("the examination is open, not a draft", /'open',/.test(sql));
ok("the examination is attached to the Grade 10 — MYP 5 class", /v_class uuid := '0a400000-0000-4000-8000-000000000110'/.test(sql));
ok("the examination lasts 60 minutes", /\n    60,\n/.test(sql));
ok("the shared link is enabled", /true,\n\s*jsonb_build_object\(\s*\n\s*'proctoring'/.test(sql));
ok("results are released immediately after submission", /'results_published', true/.test(sql));
ok("question order is fixed so the printed key stays valid", /'randomize_questions', false/.test(sql));
ok("option order is fixed so the printed key stays valid", /'randomize_options', false/.test(sql));
ok("no proctoring is configured for this assessment", /'proctoring', false/.test(sql));
ok("the access code is set", /'MYP5-SEQ-2026'/.test(sql));

/* ── Notation fidelity ── */
ok("flattened exponentials were restored (2ⁿ, 2ⁿ⁻¹)", /2\u207f/.test(sql) && /2\u207f\u207b\u00b9/.test(sql));
ok("Q39 distractor keeps the linear rule 2n", /L\u2099 = 2n\$txt\$/.test(sql));
ok("no mojibake or replacement characters", !/\ufffd/.test(sql));

console.log(`\n${passed} checks passed.`);
