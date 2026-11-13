#!/usr/bin/env node
/**
 * Proof for the safe forward MYP mock migrations.
 *
 * Historical mock imports only insert on conflict, so this starts from those
 * exact already-existing rows, deliberately makes them stale, then runs the
 * timestamped forward migrations. It proves updates happen in place (stable
 * UUIDs), never delete historical support rows, preserve operational settings,
 * replay cleanly, and fail closed if an attempt exists.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const ORG = "0a400000-0000-4000-8000-000000000001";
const CLASS_ID = "0a400000-0000-4000-8000-000000000107";
const MYP2_QUIZ = "d2000000-0000-4000-8000-000000000001";
const MYP2_EXAM = "d2000000-0000-4000-8000-000000000002";
const MYP2_Q1 = "d2000000-0000-4000-8000-000000000101";
const MYP2_Q24 = "d2000000-0000-4000-8000-000000000124";
const MYP2_Q40 = "d2000000-0000-4000-8000-000000000140";
const MYP4_Q32 = "d4000000-0000-4000-8000-000000000132";
const MYP4_Q43 = "d4000000-0000-4000-8000-000000000143";

const migrations = readdirSync("supabase/migrations").sort();
const historical = migrations.filter((file) => /^\d{4}_myp[245]_mock_[a-z]\.sql$/.test(file));
const forward = migrations.filter((file) => /^2026111312000[0-2]_myp[245]_mock_forward_update\.sql$/.test(file));
assert.equal(historical.length, 19, "all regenerated historical mock parts are present");
assert.equal(forward.length, 3, "three timestamped forward updates are present");

const sql = (file) => readFileSync(`supabase/migrations/${file}`, "utf8");
const db = new PGlite();
let checks = 0;
function check(name, condition, detail = "") {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}
const one = async (query, params = []) => (await db.query(query, params)).rows[0];

await db.exec(`
  create schema if not exists public;
  create table public.classes (id uuid primary key, organization_id uuid not null, name text not null, grade_order int);
  create table public.questions (
    id uuid primary key, organization_id uuid not null, type text not null,
    prompt text not null, prompt_doc jsonb, explanation text, explanation_doc jsonb,
    points numeric not null default 1, difficulty text not null default 'medium', topic text, subtopic text,
    tags text[] not null default '{}', status text not null default 'draft', config jsonb not null default '{}'::jsonb,
    created_by uuid, curriculum text, curriculum_course text, subject_id uuid,
    review_status text default 'draft', creation_method text, class_id uuid
  );
  create table public.question_options (
    id uuid primary key, question_id uuid not null references public.questions(id) on delete cascade,
    label text not null, is_correct boolean not null default false, position int not null default 0, content_doc jsonb
  );
  create table public.quizzes (
    id uuid primary key, organization_id uuid not null, title text not null, description text,
    status text not null default 'draft', settings jsonb not null default '{}'::jsonb, created_by uuid
  );
  create table public.quiz_questions (
    id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.quizzes(id) on delete cascade,
    question_id uuid not null references public.questions(id) on delete cascade, position int not null, points numeric,
    time_limit_seconds int, unique (quiz_id, question_id)
  );
  create table public.exams (
    id uuid primary key, organization_id uuid not null, quiz_id uuid, class_id uuid, title text not null,
    description text, instructions text, duration_minutes int not null default 60, status text not null default 'draft',
    access_code text unique not null, shared_link_enabled boolean not null default true,
    settings jsonb not null default '{}'::jsonb, created_by uuid
  );
  create table public.question_hints (
    id uuid primary key, organization_id uuid not null, exam_id uuid not null references public.exams(id) on delete cascade,
    question_id uuid not null references public.questions(id) on delete cascade, level smallint not null,
    body text not null, body_doc jsonb, status text not null default 'draft', source text not null default 'manual',
    created_by uuid, approved_by uuid, approved_at timestamptz, published_at timestamptz,
    unique (exam_id, question_id, level)
  );
  create table public.platform_settings (key text primary key, value jsonb not null);
  create table public.exam_attempts (
    id uuid primary key, exam_id uuid not null references public.exams(id) on delete cascade,
    candidate_id uuid, status text not null default 'in_progress'
  );
  create table public.exam_answers (
    id uuid primary key, attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
    question_id uuid not null references public.questions(id) on delete cascade, answer jsonb not null default '{}'::jsonb
  );
  insert into public.classes (id, organization_id, name, grade_order)
  values ('${CLASS_ID}', '${ORG}', 'MYP 2 A', 7);
`);

for (const file of historical) await db.exec(sql(file));
check("historical fixtures seed all three existing papers", (await one("select count(*)::int as n from public.questions")).n === 135);
check("historical fixtures seed expected option total", (await one("select count(*)::int as n from public.question_options")).n === 264);

const optionBefore = await one("select id, label from public.question_options where question_id = $1 and position = 1", [MYP2_Q1]);
const hintBefore = await one("select id from public.question_hints where exam_id = $1 and question_id = $2 and level = 1", [MYP2_EXAM, MYP2_Q40]);
assert.ok(optionBefore?.id && hintBefore?.id, "fixture support rows exist");

// Simulate the stale production records discovered in the audit without
// changing any identity or relationship. The forward migration must repair
// their authored content in place.
await db.exec(`
  update public.questions set prompt = 'stale question', config = '{"legacy":true}'::jsonb where id = '${MYP2_Q40}';
  update public.questions set prompt = 'stale stem leaf', config = '{"legacy":true}'::jsonb where id = '${MYP4_Q32}';
  update public.questions set prompt = 'stale standard stem leaf', config = '{"legacy":true}'::jsonb where id = '${MYP4_Q43}';
  update public.question_options set label = 'stale option', is_correct = false where id = '${optionBefore.id}';
  update public.question_hints set body = 'This stale guidance must be replaced.' where id = '${hintBefore.id}';
  update public.exams set settings = '{"results_published":true,"access_mode":"private","custom_live_setting":"keep"}'::jsonb where id = '${MYP2_EXAM}';
`);

for (const file of forward) await db.exec(sql(file));

const tree = await one("select prompt, config from public.questions where id = $1", [MYP2_Q40]);
check("MYP2 Q40 is updated in place to its probability-tree workspace", tree.config.response_tools.includes("probability_tree") && tree.config.response_probability_tree.starter.rootLabel === "First draw");
const q24 = await one("select config from public.questions where id = $1", [MYP2_Q24]);
check("MYP2 Q24 stays an ordinary typed set question, not a tree", !JSON.stringify(q24.config).includes("probability_tree"));
const backToBack = await one("select config from public.questions where id = $1", [MYP4_Q32]);
check("MYP4 Q32 restores a back-to-back stem-and-leaf starter", backToBack.config.response_tools.includes("stem_leaf") && backToBack.config.response_stem_leaf.starter.layout === "back_to_back");
const standard = await one("select config from public.questions where id = $1", [MYP4_Q43]);
check("MYP4 Q43 restores a standard stem-and-leaf starter", standard.config.response_stem_leaf.starter.layout === "standard");

const optionAfter = await one("select id, label, is_correct from public.question_options where question_id = $1 and position = 1", [MYP2_Q1]);
check("existing option UUID is preserved while authored text/key update", optionAfter.id === optionBefore.id && optionAfter.label !== "stale option" && optionAfter.is_correct === true);
const hintAfter = await one("select id, body, status from public.question_hints where exam_id = $1 and question_id = $2 and level = 1", [MYP2_EXAM, MYP2_Q40]);
check("existing hint UUID is preserved while authored guidance updates", hintAfter.id === hintBefore.id && hintAfter.body !== "This stale guidance must be replaced." && hintAfter.status === "published");

const paperCounts = await one(`
  select
    (select count(*)::int from public.quiz_questions where quiz_id = '${MYP2_QUIZ}') as questions,
    (select sum(points)::int from public.quiz_questions where quiz_id = '${MYP2_QUIZ}') as marks,
    (select count(*)::int from public.question_hints where exam_id = '${MYP2_EXAM}') as hints
`);
check("forward update preserves one 45-question MYP2 paper with authored marks", paperCounts.questions === 45 && paperCounts.marks === 189);
check("forward update provides authored question-level hints without deleting rows", paperCounts.hints >= 68);

const exam = await one("select duration_minutes, settings from public.exams where id = $1", [MYP2_EXAM]);
check("operational exam settings survive the source metadata merge", exam.duration_minutes === 150 && exam.settings.results_published === true && exam.settings.access_mode === "private" && exam.settings.custom_live_setting === "keep");

const snapshot = await db.query(`
  select q.id, q.prompt, q.config, qq.position, qq.points
    from public.questions q join public.quiz_questions qq on qq.question_id = q.id
   where qq.quiz_id in ('d2000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001')
   order by q.id
`);
for (const file of forward) await db.exec(sql(file));
const replay = await db.query(`
  select q.id, q.prompt, q.config, qq.position, qq.points
    from public.questions q join public.quiz_questions qq on qq.question_id = q.id
   where qq.quiz_id in ('d2000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001')
   order by q.id
`);
check("replaying forward updates is content-idempotent", JSON.stringify(snapshot.rows) === JSON.stringify(replay.rows));

// The fail-closed guard is the non-destructive safety boundary. A content
// rewrite must never silently change an existing candidate's view or evidence.
await db.exec(`
  update public.questions set prompt = 'must remain while attempt exists' where id = '${MYP2_Q40}';
  insert into public.exam_attempts (id, exam_id, candidate_id, status)
  values ('f2000000-0000-4000-8000-000000000001', '${MYP2_EXAM}', null, 'in_progress');
`);
let refused = false;
try {
  await db.exec(sql("20261113120000_myp2_mock_forward_update.sql"));
} catch (error) {
  refused = /refusing to rewrite a paper with 1 attempt/.test(String(error.message));
  await db.exec("rollback").catch(() => {});
}
const guarded = await one("select prompt from public.questions where id = $1", [MYP2_Q40]);
check("forward update fails closed and leaves an active attempt's paper untouched", refused && guarded.prompt === "must remain while attempt exists");

console.log(`\n${checks} checks passed (MYP mock forward updates).`);
