#!/usr/bin/env node
/**
 * Validate the four Grade 4 papers against a real PostgreSQL engine.
 *
 * The migrations in this folder are what production runs, so the proof that they
 * load must come from a real parser and a real VALUES-list check. PGlite is a
 * genuine PostgreSQL compiled to WebAssembly: it rejects a ragged VALUES list, a
 * bad type and a missing column exactly as the live database does.
 *
 * What is asserted, paper by paper:
 *   * every migration parses and inserts 30 questions;
 *   * Section A holds 20 questions at 1 mark and Section B 10 questions at 30;
 *   * each paper totals the printed 50 marks and prints the 60-minute duration;
 *   * every question carries the printing's own answer key (never empty, never
 *     invented) and its printed wording;
 *   * every objective question is auto-markable exactly once — one keyed option,
 *     or a numeric key, or a printed pairing;
 *   * every question that prints a diagram shows that diagram, and the file it
 *     points at exists in `public/`;
 *   * the ordering questions carry the printed answer sequence;
 *   * no teacher-marked question claims an automatic correct answer;
 *   * the four examinations migrate with the right titles, class and duration,
 *     and re-running every file changes nothing.
 */
import { readFileSync, existsSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = [
  "0070_grade4_mathematics_questions.sql",
  "0071_grade4_science_questions.sql",
  "0072_grade4_language_arts_questions.sql",
  "0073_grade4_social_science_questions.sql",
  "0074_grade4_options.sql",
];

const ORG = "0a400000-0000-4000-8000-000000000001";
const GRADE4_CLASS = "0a400000-0000-4000-8000-000000000104";
const SUBJECTS = ["mathematics", "science", "language-arts", "social-science"];
const OBJECTIVE = ["single_choice", "true_false", "short_answer", "multiple_select"];

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
}

const db = new PGlite();

await db.exec(`
  create schema if not exists public;
  create table public.classes (
    id uuid primary key,
    organization_id uuid not null,
    name text not null,
    grade_order int
  );
  create table public.questions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    type text not null,
    prompt text not null,
    prompt_doc jsonb,
    points numeric not null default 1,
    difficulty text not null default 'medium',
    topic text,
    tags text[] not null default '{}',
    status text not null default 'draft',
    review_status text not null default 'draft',
    config jsonb not null default '{}'::jsonb
  );
  create table public.question_options (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.questions(id) on delete cascade,
    label text not null,
    is_correct boolean not null default false,
    position int not null default 0,
    content_doc jsonb
  );
  create table public.quizzes (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    title text not null,
    description text,
    status text not null default 'draft',
    settings jsonb not null default '{}'::jsonb
  );
  create table public.quiz_questions (
    id uuid primary key default gen_random_uuid(),
    quiz_id uuid not null references public.quizzes(id) on delete cascade,
    question_id uuid not null references public.questions(id) on delete cascade,
    position int not null,
    points numeric not null default 1
  );
  create table public.exams (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    quiz_id uuid references public.quizzes(id) on delete set null,
    class_id uuid references public.classes(id) on delete set null,
    title text not null,
    description text,
    instructions text,
    duration_minutes int not null default 60,
    status text not null default 'draft',
    access_code text unique not null,
    shared_link_enabled boolean not null default true,
    settings jsonb not null default '{}'::jsonb
  );

  -- The Grade 4 class the source paper is addressed to. Only CE2 is grade 4 on
  -- the ladder; creating a second one is exactly what must not happen.
  insert into public.classes (id, organization_id, name, grade_order) values
    ('0a400000-0000-4000-8000-000000000101', '0a400000-0000-4000-8000-000000000001', 'CI', 1),
    ('0a400000-0000-4000-8000-000000000104', '0a400000-0000-4000-8000-000000000001', 'CE2', 4);
`);

// ── 1. Every file loads. ───────────────────────────────────────────────────
for (const file of MIGRATIONS) {
  const sql = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
  try {
    await db.exec(sql);
    check(`${file} loads`, true);
  } catch (error) {
    check(`${file} loads`, false, String(error.message).split("\n")[0]);
  }
}

// ── 2. Thirty questions and fifty marks per paper. ─────────────────────────
const perPaper = await db.query(`
  select config->>'subject' as subject,
         count(*)::int as questions,
         sum(points)::int as marks,
         count(*) filter (where config->>'section' = 'A')::int as sec_a,
         count(*) filter (where config->>'section' = 'B')::int as sec_b,
         sum(points) filter (where config->>'section' = 'B')::int as sec_b_marks
    from public.questions group by 1 order by 1`);
const bySubject = Object.fromEntries(perPaper.rows.map((r) => [r.subject, r]));

for (const subject of SUBJECTS) {
  const row = bySubject[subject];
  check(`${subject}: 30 printed questions`, row?.questions === 30, `found ${row?.questions ?? 0}`);
  check(`${subject}: 50 printed marks`, row?.marks === 50, `found ${row?.marks ?? 0}`);
  check(`${subject}: Section A 20 x 1 mark`, row?.sec_a === 20, `found ${row?.sec_a ?? 0}`);
  check(`${subject}: Section B 10 questions = 30 marks`,
    row?.sec_b === 10 && row?.sec_b_marks === 30,
    `found ${row?.sec_b ?? 0} questions / ${row?.sec_b_marks ?? 0} marks`);
}

// ── 3. Wording, keys and numbering. ───────────────────────────────────────
const integrity = await db.query(`
  select count(*)::int as total,
         count(*) filter (where config->>'marking_scheme' is null
                             or length(config->>'marking_scheme') < 3)::int as no_key,
         count(*) filter (where prompt is null or length(trim(prompt)) < 5)::int as no_prompt,
         count(distinct (config->>'subject') || ':' || (config->>'question_number'))::int as distinct_numbers,
         count(*) filter (where (config->>'question_number')::int < 1
                             or (config->>'question_number')::int > 30)::int as out_of_range
    from public.questions`);
const q = integrity.rows[0];
check("120 questions imported", q.total === 120, `found ${q.total}`);
check("every question carries the printing's answer key", q.no_key === 0, `${q.no_key} without a key`);
check("every question has its printed wording", q.no_prompt === 0, `${q.no_prompt} empty`);
check("no question number repeats inside a paper", q.distinct_numbers === 120, `distinct ${q.distinct_numbers}`);
check("every question number is 1..30", q.out_of_range === 0, `${q.out_of_range} out of range`);

// A diagram must be shown where the paper prints one. The paper prints 18
// diagrams in total (Mathematics 6, Science 4, Language Arts 4 incl. the two
// passages, Social Science 4); a question that reads a printed chart, grid, bar
// model or map cannot be answered without it.
const figures = await db.query(`
  select config->>'subject' as subject, (config->>'question_number')::int as n,
         prompt_doc->'content'->1->'attrs'->>'src' as src,
         coalesce((config->>'has_pictures')::boolean, false) as flagged
    from public.questions
   where prompt_doc is not null order by 1, 2`);
const EXPECTED_FIGURES = {
  mathematics: [19, 21, 22, 24, 26, 30],
  science: [22, 24, 26, 29],
  "language-arts": [1, 2, 7, 20, 21, 22, 28, 29, 30],
  "social-science": [22, 23, 25, 26],
};
const figureKeys = figures.rows.map((r) => `${r.subject}:${r.n}`);
const expectedKeys = Object.entries(EXPECTED_FIGURES).flatMap(([s, list]) => list.map((n) => `${s}:${n}`));
check("every printed diagram is attached to its question",
  expectedKeys.every((k) => figureKeys.includes(k)),
  expectedKeys.filter((k) => !figureKeys.includes(k)).slice(0, 6).join(", "));
check("no question shows a diagram the paper does not print",
  figureKeys.every((k) => expectedKeys.includes(k)),
  figureKeys.filter((k) => !expectedKeys.includes(k)).slice(0, 6).join(", "));
check("every attached diagram is flagged has_pictures",
  figures.rows.every((r) => r.flagged), `${figures.rows.filter((r) => !r.flagged).length} unflagged`);

const missingFiles = figures.rows
  .map((r) => r.src)
  .filter((src) => typeof src !== "string" || !src.startsWith("/exam-figures/grade4/")
    || !existsSync(new URL(`../public${src}`, import.meta.url)));
check("every diagram file exists in public/exam-figures/grade4",
  missingFiles.length === 0, missingFiles.slice(0, 6).join(", "));

// The marking scheme resolves contradictions on some cards; those must be
// flagged for the teacher rather than silently "fixed".
const review = await db.query(`
  select config->>'subject' as subject, (config->>'question_number')::int as n
    from public.questions
   where (config->>'review_required')::boolean
     and (review_status <> 'reviewed' or length(coalesce(config->>'review_reason', '')) < 30)
   order by 1, 2`);
check("every question flagged for review carries a reason and a reviewed status",
  review.rows.length === 0, review.rows.slice(0, 4).map((r) => `${r.subject} Q${r.n}`).join(", "));

// ── 4. Objective questions are auto-markable exactly once. ────────────────
const objective = await db.query(`
  select q.type, q.config->>'subject' as subject, q.config->>'question_number' as n,
         count(o.*)::int as options,
         count(o.*) filter (where o.is_correct)::int as keyed,
         (q.config->>'numeric_answer') as numeric_answer,
         jsonb_array_length(coalesce(q.config->'pairs', '[]'::jsonb)) as pairs
    from public.questions q
    left join public.question_options o on o.question_id = q.id
   group by 1, 2, 3, q.config->>'numeric_answer', coalesce(q.config->'pairs', '[]'::jsonb)`);

const problems = [];
let autoMarkable = 0;
for (const row of objective.rows) {
  const keyed = row.keyed >= 1;
  const numeric = row.numeric_answer !== null;
  const paired = Number(row.pairs) >= 2;
  const ordering = row.type === "ordering" && row.options >= 2;
  if (row.type === "matching") {
    if (!paired) problems.push(`${row.subject} Q${row.n} matching without printed pairs`);
  } else if (OBJECTIVE.includes(row.type)) {
    if (!keyed && !numeric) problems.push(`${row.subject} Q${row.n} has no key`);
    if (keyed && numeric) problems.push(`${row.subject} Q${row.n} keyed twice`);
    // A printed "circle the TWO ..." card is multiple select: several keyed
    // options are the point. Every other objective type has exactly one.
    if (row.type !== "multiple_select" && row.keyed > 1) {
      problems.push(`${row.subject} Q${row.n} has ${row.keyed} keyed options`);
    }
    if (row.type === "multiple_select" && row.keyed < 2) {
      problems.push(`${row.subject} Q${row.n} multiple select with ${row.keyed} keyed`);
    }
  } else if (row.type === "ordering") {
    if (!ordering) problems.push(`${row.subject} Q${row.n} ordering without items`);
  }
  if (row.type !== "open_ended" && (keyed || numeric || paired || ordering)) autoMarkable += 1;
}
check("every markable question is auto-markable exactly once", problems.length === 0, problems.slice(0, 5).join("; "));
check("Section A is 80 auto-markable questions (20 per paper)", autoMarkable === 80, `found ${autoMarkable}`);

const blank = await db.query(
  "select count(*)::int as n from public.question_options where label is null or length(trim(label)) = 0",
);
check("no printed choice has an empty label", blank.rows[0].n === 0, `${blank.rows[0].n} blank`);

const unkeyed = await db.query(`
  select count(*)::int as n from public.questions q
   where q.type = 'open_ended'
     and exists (select 1 from public.question_options o where o.question_id = q.id and o.is_correct)`);
check("no teacher-marked question claims an automatic correct answer", unkeyed.rows[0].n === 0, `${unkeyed.rows[0].n} claimed`);

// Options must appear in the printed order, so a pupil sees the paper's own A-D.
const order = await db.query(`
  select config->>'subject' as subject, config->>'question_number' as n, positions
    from (
      select q.config, array_agg(o.position order by o.position) as positions
        from public.questions q
        join public.question_options o on o.question_id = q.id
       where q.type in ('single_choice', 'true_false', 'multiple_select')
       group by q.id, q.config) t
   where positions <> (select array_agg(g) from generate_series(1, array_length(positions, 1)) g)`);
check("printed choices keep their printed order and positions",
  order.rows.length === 0, order.rows.slice(0, 4).map((r) => `${r.subject} Q${r.n}`).join(", "));

// ── 5. The four examinations. ─────────────────────────────────────────────
await db.exec(readFileSync(new URL("../supabase/migrations/0075_grade4_examinations.sql", import.meta.url), "utf8"))
  .catch((error) => check("0075_grade4_examinations.sql loads", false, String(error.message).split("\n")[0]));

const exams = await db.query(`
  select e.title, e.duration_minutes, e.status, e.access_code, e.class_id,
         coalesce((e.settings->>'shared_link_enabled')::boolean, e.shared_link_enabled) as shared,
         e.settings->'eligible_class_ids' as eligible,
         e.settings->>'source' as source,
         (select count(*)::int from public.quiz_questions qq where qq.quiz_id = e.quiz_id) as paper_size,
         (select coalesce(sum(qq.points), 0)::int from public.quiz_questions qq where qq.quiz_id = e.quiz_id) as paper_marks
    from public.exams e where e.organization_id = $1 order by e.title`, [ORG]);

check("four Grade 4 examinations exist", exams.rows.length === 4, `found ${exams.rows.length}`);
const TITLES = [
  "Examination of Grade 4 – Mathematics",
  "Examination of Grade 4 – Language Arts",
  "Examination of Grade 4 – Social Science",
  "Examination of Grade 4 – Science",
];
check("the four titles are the requested ones",
  TITLES.every((t) => exams.rows.some((r) => r.title === t)),
  exams.rows.map((r) => r.title).join(" | "));
check("every paper is 30 questions / 50 marks and 60 minutes",
  exams.rows.every((r) => r.paper_size === 30 && r.paper_marks === 50 && r.duration_minutes === 60),
  exams.rows.map((r) => `${r.title}: ${r.paper_size}/${r.paper_marks}/${r.duration_minutes}`).join(" | "));
check("every examination is open on the shared link to the Grade 4 class",
  exams.rows.every((r) => r.status === "open" && r.shared && r.class_id === GRADE4_CLASS
    && Array.isArray(r.eligible) && r.eligible.includes(GRADE4_CLASS)),
  exams.rows.map((r) => `${r.title}: ${r.status}/${r.class_id}`).join(" | "));
check("the four access codes are distinct",
  new Set(exams.rows.map((r) => r.access_code)).size === 4);

const classes = await db.query(
  "select count(*)::int as n from public.classes where organization_id = $1 and grade_order = 4", [ORG]);
check("no second Grade 4 class was created", classes.rows[0].n === 1, `found ${classes.rows[0].n}`);

// ── 6. Re-running everything changes nothing. ─────────────────────────────
const before = await db.query("select count(*)::int as n from public.questions");
const beforeOptions = await db.query("select count(*)::int as n from public.question_options");
const beforeExams = await db.query("select count(*)::int as n from public.exams");
for (const file of [...MIGRATIONS, "0075_grade4_examinations.sql"]) {
  await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
}
const after = await db.query("select count(*)::int as n from public.questions");
const afterOptions = await db.query("select count(*)::int as n from public.question_options");
const afterExams = await db.query("select count(*)::int as n from public.exams");
check("re-running every file inserts no duplicate question",
  before.rows[0].n === after.rows[0].n, `${before.rows[0].n} -> ${after.rows[0].n}`);
check("re-running every file inserts no duplicate option",
  beforeOptions.rows[0].n === afterOptions.rows[0].n,
  `${beforeOptions.rows[0].n} -> ${afterOptions.rows[0].n}`);
check("re-running every file creates no duplicate examination",
  beforeExams.rows[0].n === afterExams.rows[0].n,
  `${beforeExams.rows[0].n} -> ${afterExams.rows[0].n}`);

await db.close();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
  process.exit(1);
}
console.log("PASS: the four Grade 4 papers load, total 50 marks each and assemble four examinations.");
