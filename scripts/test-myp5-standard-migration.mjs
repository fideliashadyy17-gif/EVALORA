// Applies the May 2025 MYP 5 Standard migration to a throwaway PGlite database
// and inspects what actually landed.
//
//   node scripts/test-myp5-standard-migration.mjs
//
// This is the check that matters before the file is applied to production: it
// catches SQL that merely looks right. The schema is minimal — only the columns
// the migration writes — so this validates syntax, escaping and content, not
// every production constraint.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const sql = readFileSync("supabase/migrations/0123_ib_myp5_standard_may2025_eassessment.sql", "utf8");
const spec = JSON.parse(readFileSync("scripts/exam-import/myp5_standard_may2025_spec.json", "utf8"));

const db = await new PGlite();
let checks = 0;
const ok = (label, condition, detail) => {
  checks += 1;
  console.log(`  ${condition ? "✓" : "✗"} ${label}`);
  if (!condition && detail !== undefined) console.log(`      ${detail}`);
  if (!condition) process.exitCode = 1;
};

console.log("Migration parses and applies");

await db.exec(`
create table quizzes (id uuid primary key, organization_id uuid, title text,
  description text, status text, settings jsonb, created_by uuid);
create table questions (id uuid primary key, organization_id uuid, type text, prompt text,
  prompt_doc jsonb, explanation text, points numeric, difficulty text, topic text, subtopic text,
  tags text[], status text, config jsonb, created_by uuid, curriculum text, curriculum_course text,
  subject_id uuid, review_status text, creation_method text, class_id uuid, source_reference text);
create table quiz_questions (quiz_id uuid, question_id uuid, position integer, points numeric,
  primary key (quiz_id, question_id));
create table exams (id uuid primary key, organization_id uuid, quiz_id uuid, title text,
  description text, instructions text, duration_minutes integer, status text, settings jsonb,
  created_by uuid, class_id uuid);
`);

let applyError = null;
try {
  await db.exec(sql);
} catch (error) {
  applyError = error;
}
ok("the whole file executes", applyError === null, applyError?.message);
if (applyError) process.exit(1);

// Running it twice must be a no-op, not an error and not a duplicate.
let reapplyError = null;
try {
  await db.exec(sql);
} catch (error) {
  reapplyError = error;
}
ok("re-running it is a no-op", reapplyError === null, reapplyError?.message);

const one = async (query) => (await db.query(query)).rows[0];

console.log("\nWhat landed");

const quiz = await one("select * from quizzes");
ok("one quiz row", !!quiz);
ok("the quiz title names the paper", /IB MYP 5 Mathematics.*Standard.*May 2025/.test(quiz.title), quiz.title);
ok("the description is a real string, not an identifier",
  typeof quiz.description === "string" && quiz.description.startsWith("IB MYP 5"), quiz.description);
ok("the description survived with its apostrophes intact",
  !quiz.description.includes("''"), quiz.description);

const exam = await one("select * from exams");
ok("one exam row", !!exam);
ok("the exam links to the quiz", exam.quiz_id === quiz.id);
ok("the exam is 120 minutes", exam.duration_minutes === 120, String(exam.duration_minutes));

const questions = (await db.query(
  "select * from questions order by (config->>'paper_question')::int, config->>'part_label'")).rows;
ok("13 question rows", questions.length === 13, String(questions.length));
const storedTotal = Number((await one("select sum(points) total from quiz_questions")).total);
ok("the stored total is the sum of the stored marks", storedTotal === 73, String(storedTotal));

const paper = (await db.query(
  "select (q.config->>'paper_question')::int n, sum(qq.points) m from quiz_questions qq "
  + "join questions q on q.id = qq.question_id group by 1 order by 1")).rows;
ok("every paper question 1-7 is present",
  JSON.stringify(paper.map((r) => r.n)) === "[1,2,3,4,5,6,7]", JSON.stringify(paper.map((r) => r.n)));
const printed = { 1: 6, 3: 6, 5: 8, 6: 15, 7: 20 };
for (const [n, marks] of Object.entries(printed)) {
  const row = paper.find((r) => r.n === Number(n));
  ok(`Question ${n} is ${marks} marks, as the paper printed`, Number(row.m) === marks, String(row.m));
}

console.log("\nContent survived the SQL round trip");
ok("every row kept its config", questions.every((q) => q.config && typeof q.config === "object"));
ok("no row lost its marks_note",
  questions.every((q) => typeof q.config.marks_note === "string" && q.config.marks_note.length > 20));
ok("apostrophes were restored, not doubled",
  questions.every((q) => !JSON.stringify(q.config).includes("''")));
ok("Étienne survived as Étienne",
  questions.some((q) => q.prompt.includes("Étienne")),
  questions.find((q) => q.prompt.includes("tienne"))?.prompt?.slice(0, 60));
ok("the maths notation survived",
  questions.some((q) => q.prompt.includes("\\frac{3}{8}")));
ok("prompt_doc is valid JSON for every row",
  questions.every((q) => q.prompt_doc && typeof q.prompt_doc === "object"));
const warehouse = questions.find((q) => q.config.part_label === "Question 7");
const graphBlock = (warehouse?.prompt_doc?.content ?? []).find((node) => node.type === "graphBlock");
const points = graphBlock?.attrs?.spec?.points ?? [];
ok("the warehouse diagram is a graph block", !!graphBlock);
ok("the diagram plots A, P and B at the printed coordinates",
  JSON.stringify(points.map((pt) => [pt.id, pt.x, pt.y])) === '[["A",0,0],["P",16,12],["B",32,16]]',
  JSON.stringify(points.map((pt) => [pt.id, pt.x, pt.y])));
ok("the diagram is labelled not to scale",
  (graphBlock?.attrs?.spec?.title ?? "").includes("not to scale"));
ok("the diagram shows the 32 m and 16 m dimensions",
  (graphBlock?.attrs?.spec?.annotations ?? []).map((a) => a.text).join("|") === "32 m|16 m",
  JSON.stringify((graphBlock?.attrs?.spec?.annotations ?? []).map((a) => a.text)));

console.log("\nMarking configuration");
const auto = questions.filter((q) => q.type === "assess_parts");
const manual = questions.filter((q) => q.type === "open_ended");
ok("there are auto-marked rows", auto.length > 0, String(auto.length));
ok("there are teacher-marked rows", manual.length > 0, String(manual.length));
ok("every teacher-marked row is flagged manual", manual.every((q) => q.config.manual_marking === true));
ok("every auto-marked row carries parts", auto.every((q) => Array.isArray(q.config.parts) && q.config.parts.length));
ok("no auto-marked row is missing a key",
  auto.every((q) => q.config.parts.every((p) => p.kind === "numeric"
    ? Number.isFinite(p.answer) : Array.isArray(p.accepted) && p.accepted.length)));
ok("part marks add up to the row mark",
  auto.every((q) => Math.abs(q.config.parts.reduce((s, p) => s + p.points, 0) - Number(q.points)) < 1e-9));
ok("the row marks match the import spec",
  questions.every((q) => {
    const want = spec.find((s) => s.cfg.part_label === q.config.part_label);
    return want && Number(q.points) === want.m;
  }));

const settings = exam.settings;
ok("criterion reporting is off for students", settings.criterion_reporting === false);
ok("the overall result is shown", settings.show_overall_result === true);
ok("the passing threshold is configured, not hardcoded", settings.pass_mark_percent === 50);
ok("one attempt only", settings.attempt_mode === "limited" && settings.max_attempts === 1);
ok("the formula booklet is enabled for this paper", settings.formula_reference?.enabled === true);
ok("the formula reference is marked examination-specific",
  settings.formula_reference?.kind === "examination_specific");
ok("the exam is open for candidates", exam.status === "open");

if (process.exitCode) { console.log(`\nFAILED`); process.exit(process.exitCode); }
console.log(`\n${checks} MYP 5 Standard migration checks passed against a real Postgres (PGlite).`);
