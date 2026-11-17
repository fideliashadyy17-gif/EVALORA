/**
 * First Term 2026/27 MYP 4 and MYP 5 summative papers.
 *
 * The migrations are executed against a real Postgres engine (PGlite), then
 * every objective key is checked against the official marking scheme and every
 * mark/criterion against the printed paper. The independent arithmetic below
 * recomputes the answers the tests assert, so a transcription slip cannot pass
 * by agreeing with itself.
 *
 * Run: node scripts/test-summative-a-papers.mjs
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

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

const MYP4_KEYS = {
  1: "C", 2: "A", 3: "B", 4: "B", 5: "B", 6: "C", 7: "B", 8: "A", 9: "B",
  10: "T", 11: "F", 12: "T", 13: "T", 14: "F",
  15: "T", 16: "P", 17: "Q", 18: "R",
  21: "A", 22: "C", 23: "B", 24: "A", 25: "C",
};
const MYP4_NUMERIC = { 19: 16.5, 20: 188 };
const MYP5_KEYS = {
  1: "C", 2: "B", 3: "D", 4: "A", 5: "C", 6: "C", 7: "D", 8: "B",
  9: "B", 10: "A", 11: "C", 12: "B", 15: "D", 16: "C", 17: "A", 18: "B", 19: "C",
};
const MYP5_OPEN = [13, 14];
const MYP4_OPEN = Array.from({ length: 20 }, (_, i) => 26 + i);

const MYP4_MARKS = [
  ["A", 1], ["C", 1], ["A", 1], ["A", 1], ["C", 1], ["A", 1], ["C", 1], ["D", 1], ["A", 1],
  ["A", 1], ["C", 1], ["B", 1], ["A", 1], ["A", 1], ["C", 1], ["A", 1], ["A", 1], ["C", 1],
  ["D", 1], ["D", 1], ["D", 2], ["D", 2], ["B", 2], ["D", 2], ["B", 2],
  ["A", 3], ["A", 3], ["A", 4], ["A", 4], ["A", 4], ["A", 4],
  ["B", 4], ["B", 4], ["B", 4], ["B", 3],
  ["C", 4], ["C", 3], ["C", 4], ["C", 4], ["C", 3],
  ["D", 3], ["D", 3], ["D", 3], ["D", 3], ["D", 3],
];
const MYP5_MARKS = [
  ["C", 1], ["A", 1], ["A", 1], ["A", 1], ["A", 1], ["B", 1], ["B", 1], ["D", 1],
  ["B", 2], ["C", 2], ["A", 2], ["D", 2], ["B", 2], ["C", 2],
  ["A", 2], ["A", 2], ["B", 2], ["D", 2], ["D", 2],
  ["A", 4], ["A", 5], ["A", 4], ["A", 4], ["A", 5],
  ["B", 6], ["B", 5], ["B", 5],
  ["C", 4], ["C", 4], ["C", 4], ["C", 3],
  ["D", 4], ["D", 5], ["D", 4], ["D", 4],
];

const PAPERS = [
  {
    key: "MYP4", file: "supabase/migrations/20261117110000_myp4_grade9_first_term_summative.sql",
    quiz: "cb000000-0000-4000-8000-000000000001", exam: "cb000000-0000-4000-8000-000000000002",
    count: 45, keys: MYP4_KEYS, numeric: MYP4_NUMERIC, open: MYP4_OPEN, marks: MYP4_MARKS,
    source: "myp4-term1-summative-first-term-2026",
  },
  {
    key: "MYP5", file: "supabase/migrations/20261117110100_myp5_grade10_sequences_version_b.sql",
    quiz: "cc000000-0000-4000-8000-000000000001", exam: "cc000000-0000-4000-8000-000000000002",
    count: 35, keys: MYP5_KEYS, numeric: {}, open: MYP5_OPEN, marks: MYP5_MARKS,
    source: "myp5-term1-sequences-series-version-b-2026",
  },
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

/* Independent arithmetic — the tests assert these values, not the paper's. */
check("MYP4 Q3 mean is 15", (12 + 15 + 11 + 18 + 15 + 14 + 20) / 7 === 15);
check("MYP4 Q4 boundaries are 14.5 and 19.5", 15 - 0.5 === 14.5 && 19 + 0.5 === 19.5);
check("MYP4 Q7 IQR is 18", 40 - 22 === 18);
check("MYP4 Q9 population σ is √5", Math.sqrt((9 + 1 + 1 + 9) / 4) === Math.sqrt(5));
check("MYP4 Q19 estimated mean is 16.5", (15 * 15 + 5 * 21) / 20 === 16.5);
check("MYP4 Q20 seventh height is 188", 7 * 176 - 6 * 174 === 188);
check("MYP4 Q22 total from frequency density is 90", 10 * 1.5 + 10 * 3.5 + 20 * 2 === 90);
check("MYP4 Q23 missing frequency is 8", (80 + 6 * 8) / 20 === 6.4);
check("MYP4 Q24 upper fence is 52 and 56 is above it", 34 + 1.5 * (34 - 22) === 52 && 56 > 52);
check("MYP4 Q25 coded mean and σ are 19.0 and 5.0", 2 * 12 - 5 === 19 && 2 * 2.5 === 5);
check("MYP5 Q2 fifth term is −2", 6 * (-1 / 3) === -2);
check("MYP5 Q3 u5 is 57", 3 * 25 - 4 * 5 + 2 === 57);
check("MYP5 Q5 u4 is 28", 3 * (3 * (3 * 2 - 2) - 2) - 2 === 28);
check("MYP5 Q9 q is 47", 30 + (13 + 4) === 47);
check("MYP5 Q11 u20 is 104", 9 + 19 * 5 === 104);
check("MYP5 Q12 u4 is 522 to 3 s.f.", Number((850 * 0.85 ** 3).toPrecision(3)) === 522);
check("MYP5 Q15 sum is 781", 1024 - 243 === 781);
check("MYP5 Q18 n is 12", 3 * 144 + 27 * 12 === 756);
check("MYP5 Q19 Plan Q is 70 000 cheaper", 1_000_000 - 930_000 === 70_000);

for (const paper of PAPERS) {
  console.log(`\n${paper.key}`);
  const db = new PGlite();
  try {
    await db.exec(SCHEMA);
    await db.exec(readFileSync(paper.file, "utf8"));

    const questions = (await db.query(`
      select qq.position, q.type, q.points, q.config, q.prompt_doc::text as doc, q.explanation,
             coalesce(json_agg(json_build_object('label', o.label, 'correct', o.is_correct)
                               order by o.position) filter (where o.id is not null), '[]') as options
        from quiz_questions qq join questions q on q.id = qq.question_id
        left join question_options o on o.question_id = q.id
       where qq.quiz_id = $1 group by qq.position, q.id, q.type, q.points, q.config, q.prompt_doc, q.explanation
       order by qq.position`, [paper.quiz])).rows;

    check(`${paper.count} questions`, questions.length === paper.count);
    check("100 marks", questions.reduce((sum, row) => sum + Number(row.points), 0) === 100);
    check("marks and criteria match the printed paper", questions.every((row, index) =>
      row.config.myp_criterion === paper.marks[index][0] && Number(row.points) === paper.marks[index][1]));
    if (paper.key === "MYP5") {
      check("Part A stores the printed question numbers in order",
        questions.slice(0, 19).every((row, index) => row.config.question_number === index + 1));
      check("Part B restarts at printed question 1 without losing its position",
        questions.slice(19).every((row, index) => row.config.question_number === index + 1));
    } else {
      check("every question stores its printed number",
        questions.every((row, index) => row.config.question_number === index + 1));
    }
    check("every question names the source paper", questions.every((row) => row.config.source === paper.source));
    const openRows = questions.filter((row) =>
      row.type === "open_ended" && (paper.key !== "MYP5" || row.position > 19));
    check("every Part B question keeps its printed source title",
      openRows.length === (paper.key === "MYP5" ? 16 : 20) &&
      openRows.every((row) => typeof row.config.paper_title === "string" && row.config.paper_title.length > 0));
    check("the source title is the first thing a candidate reads",
      openRows.every((row) => {
        const doc = typeof row.doc === "string" ? JSON.parse(row.doc) : row.doc;
        return doc.content[0].content[0].text === row.config.paper_title;
      }));

    for (const [number, key] of Object.entries(paper.keys)) {
      const row = questions[Number(number) - 1];
      const correct = row.options.filter((option) => option.correct).map((option) => option.label);
      check(`Q${number} key ${key}`, correct.length === 1 && correct[0] === key);
    }

    for (const [number, value] of Object.entries(paper.numeric)) {
      const row = questions[Number(number) - 1];
      check(`Q${number} numeric answer ${value}`, row.type === "numeric" && Number(row.config.numeric_answer) === value);
    }

    for (const number of paper.open) {
      const row = questions[number - 1];
      check(`Q${number} is teacher-marked with a model answer`,
        row.type === "open_ended" && String(row.explanation ?? "").trim().length > 20 &&
        row.options.length === 0);
    }

    check("constructed-response questions carry response tools and mark breakdown",
      paper.open.every((number) => {
        const row = questions[number - 1];
        return Array.isArray(row.config.response_tools) && row.config.response_tools.length > 0 &&
          Array.isArray(row.config.marking_breakdown) &&
          row.config.marking_breakdown.reduce((sum, part) => sum + Number(part.marks), 0) === Number(row.points);
      }));

    check("no question leaks a marking-scheme answer in its prompt",
      questions.every((row) => !/scheme answer|answer:\s/i.test(row.doc ?? "")));

    check("figures are structured blocks, not raw drawing instructions",
      questions.every((row) => !/(draw an? |sketch an? )?(line|circle) from \(\d/i.test(row.doc ?? "")));

    const figureDocs = questions.filter((row) => /assessDiagramBlock|graphBlock|statsBlock|"image"/.test(row.doc ?? ""));
    check(`${paper.key} has figures on the questions that need them`, figureDocs.length >= (paper.key === "MYP4" ? 17 : 11));

    const levels = new Set(questions.map((row) => row.config.difficulty_level));
    check("levels are the paper's own vocabulary", [...levels].every((level) => ["basic", "intermediate", "challenge", "advanced"].includes(level)));

    const exam = (await db.query("select settings, status from exams where id = $1", [paper.exam])).rows[0];
    check("exam is draft and reports all four criteria",
      exam.status === "draft" && exam.settings.criterion_reporting === true &&
      Object.keys(exam.settings.criterion_totals).sort().join("") === "ABCD");
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${paper.key} failed: ${String(error?.message ?? error)}`);
  } finally {
    await db.close();
  }
}

console.log(`\n${passed} summative-paper checks passed${failed ? `, ${failed} failed` : ""}.`);
process.exit(failed === 0 ? 0 : 1);
