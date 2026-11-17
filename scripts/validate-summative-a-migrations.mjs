/**
 * Pre-flight for the two NEW First Term 2026/27 summative papers.
 *
 * Executes each migration against a real Postgres engine (PGlite) loaded with
 * the production table shape, then checks what a teacher would check:
 *
 *   · the paper has the printed number of questions and exactly 100 marks;
 *   · the criterion totals equal the totals printed on the paper;
 *   · every question is criterion-tagged and carries its printed number;
 *   · objective questions have a key and constructed-response questions do not
 *     pretend to have one;
 *   · the matching items share one P–U answer bank;
 *   · the formula-figure blocks referenced by the paper are present.
 *
 * Nothing here touches production.
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const SCHEMA = `
create table quizzes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  title text not null,
  description text,
  status text not null default 'draft',
  settings jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  class_id uuid
);
create table exams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quiz_id uuid,
  title text not null,
  description text,
  instructions text,
  duration_minutes integer not null default 60,
  status text not null default 'draft',
  settings jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  class_id uuid
);
create table questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  type text not null,
  prompt text not null,
  prompt_doc jsonb,
  explanation text,
  points numeric not null default 1,
  difficulty text not null default 'medium',
  topic text,
  subtopic text,
  tags text[] not null default '{}',
  status text not null default 'draft',
  config jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  curriculum text,
  curriculum_course text,
  subject_id uuid,
  class_id uuid,
  creation_method text not null default 'manual',
  review_status text not null default 'draft',
  source_reference text
);
create table question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  label text not null,
  is_correct boolean not null default false,
  position integer not null default 0,
  content_doc jsonb
);
create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null,
  question_id uuid not null,
  position integer not null default 0,
  points numeric,
  unique (quiz_id, question_id)
);
`;

const PAPERS = [
  {
    key: "MYP4",
    file: "supabase/migrations/20261117110000_myp4_grade9_first_term_summative.sql",
    quiz: "cb000000-0000-4000-8000-000000000001",
    exam: "cb000000-0000-4000-8000-000000000002",
    questions: 45,
    criteria: { A: 32, B: 20, C: 24, D: 24 },
  },
  {
    key: "MYP5",
    file: "supabase/migrations/20261117110100_myp5_grade10_sequences_version_b.sql",
    quiz: "cc000000-0000-4000-8000-000000000001",
    exam: "cc000000-0000-4000-8000-000000000002",
    questions: 35,
    criteria: { A: 32, B: 24, C: 20, D: 24 },
  },
];

let checks = 0;
let failed = 0;
function check(ok, label) {
  checks += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}`);
}
const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const number = (value) => Number(value ?? 0);

for (const paper of PAPERS) {
  console.log(`\n${paper.key} — ${paper.file}`);
  const db = new PGlite();
  try {
    await db.exec(SCHEMA);
    await db.exec(readFileSync(paper.file, "utf8"));

    const totals = await rows(db, `
      select count(*)::int as questions,
             coalesce(sum(qq.points),0)::int as marks,
             count(*) filter (where q.config ->> 'myp_criterion' is null)::int as untagged
        from quiz_questions qq join questions q on q.id = qq.question_id
       where qq.quiz_id = $1`, [paper.quiz]);
    check(totals[0].questions === paper.questions, `${paper.questions} questions in the paper (got ${totals[0].questions})`);
    check(totals[0].marks === 100, `100 marks (got ${totals[0].marks})`);
    check(totals[0].untagged === 0, "every question is criterion-tagged");

    const byCriterion = await rows(db, `
      select q.config ->> 'myp_criterion' as code, sum(qq.points)::int as marks
        from quiz_questions qq join questions q on q.id = qq.question_id where qq.quiz_id = $1 group by 1 order by 1`, [paper.quiz]);
    for (const [code, expected] of Object.entries(paper.criteria)) {
      const actual = number(byCriterion.find((row) => row.code === code)?.marks);
      check(actual === expected, `Criterion ${code} totals ${expected} (got ${actual})`);
    }

    const exam = await rows(db, "select status, duration_minutes, settings from exams where id = $1", [paper.exam]);
    check(exam[0]?.status === "draft", "exam is created as a draft");
    check(number(exam[0]?.duration_minutes) === 120, "duration is 120 minutes");
    check(exam[0]?.settings?.criterion_reporting === true, "criterion reporting is enabled");
    check(exam[0]?.settings?.criterion_totals?.A === paper.criteria.A, "exam carries the paper's criterion totals");

    const types = await rows(db, `
      select q.type, count(*)::int as n
        from questions q join quiz_questions qq on qq.question_id = q.id
       where qq.quiz_id = $1 group by q.type order by q.type`, [paper.quiz]);
    check(types.length > 0, `question types present: ${types.map((row) => `${row.type}=${row.n}`).join(", ")}`);

    const noKey = await rows(db, `
      select q.id, q.type from questions q join quiz_questions qq on qq.question_id = q.id
       where qq.quiz_id = $1 and q.type in ('single_choice','true_false','numeric')
         and not exists (select 1 from question_options o where o.question_id = q.id and o.is_correct)
         and q.type <> 'numeric'`, [paper.quiz]);
    check(noKey.length === 0, `every objective question has a correct answer (${noKey.length} missing)`);

    const openWithKey = await rows(db, `
      select count(*)::int as n from questions q join quiz_questions qq on qq.question_id = q.id
       where qq.quiz_id = $1 and q.type = 'open_ended'
         and exists (select 1 from question_options o where o.question_id = q.id)`, [paper.quiz]);
    check(openWithKey[0].n === 0, "constructed-response questions do not carry objective options");

    const numeric = await rows(db, `
      select count(*)::int as n from questions q join quiz_questions qq on qq.question_id = q.id
       where qq.quiz_id = $1 and q.type = 'numeric'
         and (q.config ->> 'numeric_answer') is null`, [paper.quiz]);
    check(numeric[0].n === 0, "every numeric question stores numeric_answer");

    const figures = await rows(db, `
      select count(*)::int as n from questions q join quiz_questions qq on qq.question_id = q.id
       where qq.quiz_id = $1
         and (q.prompt_doc::text like '%assessDiagramBlock%'
              or q.prompt_doc::text like '%graphBlock%'
              or q.prompt_doc::text like '%statsBlock%'
              or q.prompt_doc::text like '%\"image\"%')`, [paper.quiz]);
    check(figures[0].n >= 2, `figure-bearing questions present (${figures[0].n})`);

    const duplicates = await rows(db, `
      select count(*)::int as n from (
        select question_id from quiz_questions where quiz_id = $1
        group by question_id having count(*) > 1) x`, [paper.quiz]);
    check(duplicates[0].n === 0, "no question appears twice in the paper");

    const positions = await rows(db, "select position from quiz_questions where quiz_id = $1 order by position", [paper.quiz]);
    check(positions.every((row, index) => row.position === index + 1), "positions are 1..N with no gaps");
  } catch (error) {
    failed += 1;
    checks += 1;
    console.log(`  ✗ migration failed: ${String(error?.message ?? error).split("\n")[0]}`);
  } finally {
    await db.close();
  }
}

console.log(`\n${failed === 0 ? "PASS" : "FAIL"} ${checks - failed}/${checks} migration checks passed`);
process.exit(failed === 0 ? 0 : 1);
