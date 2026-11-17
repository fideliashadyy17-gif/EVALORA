/**
 * MYP 4 (Grade 9) Q15–18 — one typed-letter matching exercise.
 *
 * Runs the applied paper plus the forward correction in a real Postgres
 * (PGlite), then checks the paper structure and the real server scorer:
 *
 *   · six formulas P–U, four definitions, one parent question worth 4 marks;
 *   · Q16–18 no longer separate quiz items (rows archived, not deleted);
 *   · the printed 2 Criterion A + 2 Criterion C split still totals A32/C24;
 *   · uppercase/lowercase letters mark equally, invalid letters never score;
 *   · every other question, mark, duration and criterion is untouched.
 *
 * Run: node scripts/test-matching-letters.mjs
 */
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

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

const QUIZ = "cb000000-0000-4000-8000-000000000001";
const PARENT = "cb000000-0000-4000-8000-000000001015";
const ABSORBED = [
  "cb000000-0000-4000-8000-000000001016",
  "cb000000-0000-4000-8000-000000001017",
  "cb000000-0000-4000-8000-000000001018",
];

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}`);
  }
}

function compile(src, name, stubs = {}) {
  const file = path.resolve(name);
  const mod = new Module(file);
  const original = Module._load;
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  Module._load = function (id, parent) {
    if (parent?.filename === file && id in stubs) return stubs[id];
    return original.apply(this, arguments);
  };
  try {
    mod._compile(ts.transpileModule(readFileSync(src, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, file);
    return mod.exports;
  } finally {
    Module._load = original;
  }
}

const assessParts = compile("src/lib/assessParts.ts", "scripts/__assess_parts_matching_letters.cjs");
const { scoreAnswer } = compile(
  "src/lib/scoring.ts",
  "scripts/__scoring_matching_letters.cjs",
  { "./assessParts": assessParts },
);
const criterionShares = compile("src/lib/criterionShares.ts", "scripts/__criterion_shares_matching_letters.cjs");
const live = compile("src/lib/live.ts", "scripts/__live_matching_letters.cjs", {
  "./responseTools": {
    responseWorkspaceFor: () => ({
      tools: [], graph: { enabled: false }, geometry: { enabled: false }, guidance: "",
      requirement: "any", defaultTool: null, calculator: { enabled: true },
    }),
  },
  "./assessParts": assessParts,
  "./criterionShares": criterionShares,
  "./examResults": { criterionTitle: (code) => code ? `Criterion ${code}` : null },
});

const db = new PGlite();
await db.exec(SCHEMA);
await db.exec(readFileSync("supabase/migrations/20261117110000_myp4_grade9_first_term_summative.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261118120000_myp4_q15_18_matching_exercise.sql", "utf8"));

const parent = (await db.query(
  "select type, prompt, prompt_doc, points, config, status, explanation from questions where id = $1",
  [PARENT],
)).rows[0];
const links = (await db.query(
  "select qq.position, qq.points, q.id, q.type, q.points as question_points, q.status, q.config " +
  "from quiz_questions qq join questions q on q.id = qq.question_id " +
  "where qq.quiz_id = $1 order by qq.position",
  [QUIZ],
)).rows;
const absorbed = (await db.query(
  "select id, status, review_status, config from questions where id = any($1::uuid[]) order by id",
  [ABSORBED],
)).rows;

check("the quiz keeps one question record for Q15–18", links.filter((row) => row.position >= 15 && row.position <= 18).length === 1);
check("the parent record is a matching question worth 4 marks", parent.type === "matching" && Number(parent.points) === 4);
check("the quiz row carries the four marks", Number(links.find((row) => row.id === PARENT)?.points) === 4);
check("Q16–18 are no longer quiz items", !links.some((row) => ABSORBED.includes(row.id)));
check("Q16–18 are archived, not deleted", absorbed.length === 3 && absorbed.every((row) => row.status === "archived" && row.review_status === "archived"));
check("the archived rows point at their parent", absorbed.every((row) => row.config.superseded_by === PARENT));

const cfg = parent.config;
const bank = cfg.letter_choices ?? [];
const pairs = cfg.pairs ?? [];
const rows = cfg.rows ?? [];
check("six formulas are labelled P, Q, R, S, T, U", JSON.stringify(bank) === JSON.stringify(["P", "Q", "R", "S", "T", "U"]));
check("the four definitions are preserved verbatim", rows.map((row) => row.left).join("|") === [
  "Diagram showing distribution shape while retaining every exact raw data value",
  "Formula for frequency density when constructing an unequal-width histogram",
  "Exact formula for the population standard deviation σ of N values",
  "Graph used to estimate median, quartiles and percentiles of grouped continuous data",
].join("|"));
check("each definition keeps its printed number and criterion",
  JSON.stringify(rows.map((row) => [row.number, row.criterion])) === JSON.stringify([[15, "C"], [16, "A"], [17, "A"], [18, "C"]]));
check("the key is T, P, Q, R", JSON.stringify(pairs.map((pair) => [pair.left, pair.right])) === JSON.stringify(rows.map((row, i) => [row.left, ["T", "P", "Q", "R"][i]])));
check("the question prints the P–U formula bank once", (() => {
  const table = (parent.prompt_doc.content ?? []).find((node) => node.type === "assessDiagramBlock");
  return table?.attrs?.spec?.columns?.join("") === "PQRSTU" &&
    table?.attrs?.spec?.rows?.flat()?.length === 6;
})());
check("the printed 2 A + 2 C split adds up to 4", (() => {
  const shares = cfg.criterion_shares ?? [];
  return shares.length === 2 &&
    shares.reduce((sum, share) => sum + share.points, 0) === 4 &&
    shares.find((share) => share.criterion === "A")?.points === 2 &&
    shares.find((share) => share.criterion === "C")?.points === 2;
})());

// The candidate-safe projection is what the student UI receives. It must carry
// the six formulas (in prompt_doc), the four boxes and no key.
const projected = live.publicQuestion({
  id: "quiz-question-15",
  points: 4,
  questions: {
    id: PARENT,
    type: parent.type,
    prompt: parent.prompt,
    prompt_doc: parent.prompt_doc,
    config: parent.config,
    topic: "Statistical vocabulary",
    question_options: [],
  },
});
check("the student projection keeps the typed-letter mode", projected.match_mode === "letters");
check("the student projection carries four definition rows but no answer letters",
  projected.matching_rows.length === 4 &&
  JSON.stringify(projected.matching_rows.map((row) => row.label)) === JSON.stringify(["15", "16", "17", "18"]) &&
  JSON.stringify(projected.matching_rows.map((row) => row.criterion)) === JSON.stringify(["C", "A", "A", "C"]) &&
  projected.matching_rows.every((row) => !("right" in row) && !("answer" in row)));
check("the student projection never serialises the pair key",
  !JSON.stringify(projected).includes('"right"') && projected.matching_rights.length === 0);
check("the student projection reports both criteria, not one invented criterion",
  projected.criterion === null && projected.criterion_shares.length === 2 &&
  projected.question_meta.criterion_label === "Criteria A and C");
check("the student projection keeps the printed Q15–18 label and four-number span",
  projected.question_meta.question_label === "15–18" && projected.question_meta.question_span === 4);

const totalMarks = links.reduce((sum, row) => sum + Number(row.points), 0);
const partA = links.filter((row) => row.position <= 25).reduce((sum, row) => sum + Number(row.points), 0);
const criteria = { A: 0, B: 0, C: 0, D: 0 };
for (const row of links) {
  const shares = row.config?.criterion_shares;
  if (Array.isArray(shares) && shares.length) {
    for (const share of shares) criteria[share.criterion] += share.points;
  } else {
    criteria[row.config?.myp_criterion] += Number(row.points);
  }
}
check("the paper still totals 100 marks", totalMarks === 100);
check("Part A still totals 30 marks", partA === 30);
check("criterion totals are still A 32, B 20, C 24, D 24",
  criteria.A === 32 && criteria.B === 20 && criteria.C === 24 && criteria.D === 24);
check("the other 41 questions are unchanged", links.length === 42 && links.filter((row) => row.id !== PARENT).length === 41);
const exam = (await db.query(
  "select duration_minutes, settings from exams where id = 'cb000000-0000-4000-8000-000000000002'",
)).rows[0];
check("duration, criteria and class settings are untouched",
  exam.duration_minutes === 120 &&
  JSON.stringify(exam.settings.criterion_totals) === JSON.stringify({ A: 32, B: 20, C: 24, D: 24 }) &&
  JSON.stringify(exam.settings.eligible_class_ids) === JSON.stringify(["0a400000-0000-4000-8000-000000000109"]));

const question = { type: parent.type, points: Number(parent.points), config: cfg };
const key = pairs.map((pair) => ({ left: pair.left, right: pair.right }));
check("all four correct letters score 4/4", JSON.stringify(scoreAnswer(question, [], { pairs: key })) === JSON.stringify({ isCorrect: true, points: 4 }));
check("small letters mark the same as capitals",
  JSON.stringify(scoreAnswer(question, [], { pairs: key.map((pair) => ({ ...pair, right: pair.right.toLowerCase() })) })) === JSON.stringify({ isCorrect: true, points: 4 }));
check("two correct letters earn two marks",
  JSON.stringify(scoreAnswer(question, [], { pairs: key.slice(0, 2) })) === JSON.stringify({ isCorrect: false, points: 2 }));
check("a wrong letter earns nothing for that field",
  JSON.stringify(scoreAnswer(question, [], { pairs: [{ ...key[0], right: "U" }, ...key.slice(1)] })) === JSON.stringify({ isCorrect: false, points: 3 }));
check("a letter outside P–U cannot score", JSON.stringify(scoreAnswer(question, [], { pairs: key.map((pair) => ({ ...pair, right: "A" })) })) === JSON.stringify({ isCorrect: false, points: 0 }));
check("the answer payload has four fields, not four question IDs", key.length === 4);
check("the stored explanation carries all four keyed reasons",
  ["15 → T", "16 → P", "17 → Q", "18 → R"].every((part) => String(parent.explanation).includes(part)));

await db.close();
console.log(`\n${passed} matching-letter checks passed${failed ? `, ${failed} failed` : ""}.`);
process.exit(failed === 0 ? 0 : 1);
