/**
 * Pre-flight for the four Summative B paper migrations.
 *
 * The production database cannot be used as a rehearsal, so each migration is
 * executed against a real Postgres engine (PGlite, WASM) loaded with a stub of
 * the five tables it writes to, mirroring the production column types, NOT NULL
 * constraints and defaults exactly as information_schema reports them. Anything
 * Postgres would reject - a malformed literal, a type mismatch, a missing
 * column - fails here instead of in production.
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

const FILES = [
  ["0116", "supabase/migrations/0116_myp2_grade7_term1_summative_b.sql", "c0700000-0000-4000-8000-000000000001", "c0700000-0000-4000-8000-000000000002", 100],
  ["0117", "supabase/migrations/0117_myp3_grade8_term1_summative_b.sql", "c0800000-0000-4000-8000-000000000001", "c0800000-0000-4000-8000-000000000002", 100],
  ["0118", "supabase/migrations/0118_myp4_grade9_term1_summative_b.sql", "c0900000-0000-4000-8000-000000000001", "c0900000-0000-4000-8000-000000000002", 100],
  ["0119", "supabase/migrations/0119_myp5_grade10_sequences_summative.sql", "c0a00000-0000-4000-8000-000000000001", "c0a00000-0000-4000-8000-000000000002", 100],
];

let failed = 0;
for (const [key, file, quizId, examId, expectedMarks] of FILES) {
  const sql = readFileSync(file, "utf8");
  const db = new PGlite();
  try {
    await db.exec(SCHEMA);
    await db.exec(sql);
    const q = (await db.query("select count(*)::int as n, coalesce(sum(points),0)::int as marks from quiz_questions where quiz_id = $1", [quizId])).rows[0];
    const e = (await db.query("select status, duration_minutes from exams where id = $1", [examId])).rows[0];
    const opts = (await db.query("select count(*)::int as n from question_options o join quiz_questions qq on qq.question_id = o.question_id where qq.quiz_id = $1", [quizId])).rows[0];
    const tagged = (await db.query("select count(*)::int as n from questions q join quiz_questions qq on qq.question_id = q.id where qq.quiz_id = $1 and q.config ->> 'myp_criterion' is not null", [quizId])).rows[0];
    const ok = q.n === 45 && q.marks === expectedMarks && e?.status === "draft" && tagged.n === 45;
    if (!ok) failed += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${key}  questions=${q.n} marks=${q.marks}/${expectedMarks} options=${opts.n} criterion-tagged=${tagged.n} exam=${e?.status} ${e?.duration_minutes}min`,
    );
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${key}  ${String(error?.message ?? error).split("\n")[0]}`);
  } finally {
    await db.close();
  }
}
console.log(failed === 0 ? "\nall four migrations execute cleanly against a real Postgres engine" : `\n${failed} migration(s) failed`);
process.exit(failed === 0 ? 0 : 1);
