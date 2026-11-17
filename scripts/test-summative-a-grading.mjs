/**
 * Criterion-level grading for the two new First Term papers.
 *
 * Uses the REAL MYP engine (src/lib/myp.ts) against the REAL paper rows written
 * by the migrations, executed in PGlite. Three candidates are graded:
 *
 *   1. every objective answer correct, all constructed-response questions blank;
 *   2. every objective answer wrong, all constructed-response questions blank;
 *   3. objective answered, a constructed response carries content but no mark.
 *
 * The first two must produce a FINAL result with all four criteria present and
 * explicit zeros where nothing was earned. The third must stay provisional and
 * must never turn an unmarked answer into a zero.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const outDir = "/tmp/evalora-summative-a-grading";
execSync(`rm -rf ${outDir} && mkdir -p ${outDir}`);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`);

const built = new Set();
function build(rel) {
  if (built.has(rel)) return;
  built.add(rel);
  const emitted = ts.transpileModule(readFileSync(rel, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const deps = [...emitted.matchAll(/require\("(\.[^"]+)"\)/g)].map((match) => match[1]);
  const normalised = emitted.replace(/require\("(\.[^"]+?)(\.ts)?"\)/g, (_match, spec) => `require("${spec}.js")`);
  const dest = path.join(outDir, rel.replace(/^src\//, "").replace(/\.ts$/, ".js"));
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, normalised);
  for (const dep of deps) build(path.join(path.dirname(rel), `${dep.replace(/\.ts$/, "")}.ts`));
}
build("src/lib/myp.ts");
const require = createRequire(import.meta.url);
const M = require(`${outDir}/lib/myp.js`);

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
    quiz: "cb000000-0000-4000-8000-000000000001",
    title: "MYP 4 (Grade 9) Mathematics — Term 1 Summative Assessment" },
  { key: "MYP5", file: "supabase/migrations/20261117110100_myp5_grade10_sequences_version_b.sql",
    quiz: "cc000000-0000-4000-8000-000000000001",
    title: "MYP 5 (Grade 10) Mathematics — Summative Assessment: Sequences and Series (Version B)" },
];

const rules = {
  criteria: M.presetForSubject("Mathematics").criteria.map((criterion, index) => ({
    ...criterion, description: null, position: index,
  })),
  levelBoundaries: M.DEFAULT_LEVEL_BOUNDARIES,
  gradeBoundaries: M.DEFAULT_GRADE_BOUNDARIES,
  levelSource: "default MYP 0–8 boundaries",
  gradeSource: "default MYP 1–7 boundaries",
  requireAllCriteria: true,
  criteriaMaxLevel: 8,
  source: "configured",
};

let passed = 0;
let failed = 0;
const check = (name, ok) => {
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}`); }
};

for (const paper of PAPERS) {
  console.log(`\n${paper.key}`);
  const db = new PGlite();
  try {
    await db.exec(SCHEMA);
    await db.exec(readFileSync(paper.file, "utf8"));
    const rows = (await db.query(`
      select qq.position, q.type, q.points::float as points, q.config ->> 'myp_criterion' as criterion
        from quiz_questions qq join questions q on q.id = qq.question_id
       where qq.quiz_id = $1 order by qq.position`, [paper.quiz])).rows;
    const paperQuestions = rows.map((row) => ({
      questionId: String(row.position), points: row.points, criterion: row.criterion, topic: "Paper",
    }));

    const grade = (answers) => M.buildMypResult({
      attempt: {
        attemptId: "attempt-1", examId: "exam-1", organizationId: "org-1",
        organizationName: "Oak International School", examTitle: paper.title, examDate: null,
        attemptStatus: "submitted", submittedAt: "2026-11-17T10:00:00.000Z",
        score: null, maxScore: 100, published: false, studentName: "Test Candidate", className: "Grade",
        mypYear: null, subjectNames: ["Mathematics"], subjectLabel: "Mathematics",
        subjectId: null, reportingPeriod: "First Term",
      },
      paper: paperQuestions,
      answers,
      rules,
    });

    const objective = rows.filter((row) => row.type !== "open_ended");
    const constructed = rows.filter((row) => row.type === "open_ended");

    const allRight = grade(objective.map((row) => ({
      questionId: String(row.position), pointsAwarded: row.points, hasContent: true, isCorrect: true,
    })));
    check("all-objective-correct attempt is final", allRight.gradeStatus === "final");
    check("all four criteria are present", allRight.criteria.map((c) => c.code).join("") === "ABCD");
    check("constructed-response questions score zero when blank",
      allRight.criteria.every((criterion) => criterion.questionCount > 0) &&
      allRight.criteria.every((criterion) => !["pending_marking","partially_marked"].includes(criterion.status)));

    const allWrong = grade(objective.map((row) => ({
      questionId: String(row.position), pointsAwarded: 0, hasContent: true, isCorrect: false,
    })));
    check("all-objective-wrong attempt is final", allWrong.gradeStatus === "final");
    check("every assessed criterion still appears", allWrong.criteria.length === 4);
    check("a criterion with no marks is an explicit zero, not missing",
      allWrong.criteria.every((criterion) => criterion.questionCount > 0 && criterion.marksAwarded === 0 &&
        criterion.level === 0 && !["pending_marking","partially_marked"].includes(criterion.status)));
    check("the overall grade is a 1–7 grade, not blank",
      Number.isInteger(allWrong.overallGrade) && allWrong.overallGrade >= 1 && allWrong.overallGrade <= 7);

    const pendingAnswers = [
      ...objective.map((row) => ({
        questionId: String(row.position), pointsAwarded: row.points, hasContent: true, isCorrect: true,
      })),
      { questionId: String(constructed[0].position), pointsAwarded: null, hasContent: true },
    ];
    const pending = grade(pendingAnswers);
    check("content-bearing unmarked work stays provisional", pending.gradeStatus !== "final");
    check("the unmarked criterion is pending, never zero", pending.criteria.some((criterion) => ["pending_marking","partially_marked"].includes(criterion.status)));
    check("no overall grade is fabricated while marking is incomplete", pending.overallGrade === null);

    const criteriaTotals = new Map();
    for (const row of rows) criteriaTotals.set(row.criterion, (criteriaTotals.get(row.criterion) ?? 0) + row.points);
    check("paper totals match the engine's maxima",
      allRight.criteria.every((criterion) => criterion.marksMax === criteriaTotals.get(criterion.code)));
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${paper.key} grading failed: ${error?.stack ?? error}`);
  } finally {
    await db.close();
  }
}

console.log(`\n${passed} grading checks passed${failed ? `, ${failed} failed` : ""}.`);
process.exit(failed === 0 ? 0 : 1);
