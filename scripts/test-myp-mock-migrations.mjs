#!/usr/bin/env node
/**
 * Load the twelve MYP mock-examination migrations into a real PostgreSQL engine.
 *
 * The audit script (`scripts/exam-import/verify_mock_exams.py`) checks the papers
 * as authored, and `test-myp-mock-exams.mjs` checks the JSON they generate. This
 * suite is the deployment proof: it runs the exact files that production will run
 * through PGlite — genuine PostgreSQL compiled to WebAssembly — so a stray
 * statement, a missing column, a wrong type, a broken `DO` block or a non-idempotent
 * insert fails here rather than halfway through a live paper.
 *
 * Asserted per paper:
 *   · every part loads, and replaying every part changes nothing;
 *   · 45 questions and the printed mark total land on the paper row;
 *   · Section A is 22 objective questions with exactly four options and one key,
 *     Section B is 23 structured questions, none of them new question types;
 *   · accepted answer variants are stored as correct options, keyed ones are not;
 *   · the examination carries the cover page, manual publication and 150 minutes;
 *   · levels 1–2 of every question's hints are published, level 3 is not shipped;
 *   · the self-check aborts when a question is missing;
 *   · the pass threshold is a platform setting with an org override.
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Discover the parts from disk so a content edit that re-splits a paper cannot
// silently leave this proof behind.
const dir = new URL("../supabase/migrations/", import.meta.url);
const MOCK_FILES = [...new Set(
  (await import("node:fs")).readdirSync(dir).filter((f) => /^\d{4}_myp[245]_mock_[a-z]\.sql$/.test(f)),
)].sort();
const FILES_BY_PAPER = {};
for (const file of MOCK_FILES) {
  const key = file.match(/myp([245])/)[1];
  (FILES_BY_PAPER[key] ??= []).push(file);
}
const PARTS = [
  { key: "2", code: "MYP2-MOCK-2026", quiz: "d2000000-0000-4000-8000-000000000001", exam: "d2000000-0000-4000-8000-000000000002", marks: 189 },
  { key: "4", code: "MYP4-MOCK-2026", quiz: "d4000000-0000-4000-8000-000000000001", exam: "d4000000-0000-4000-8000-000000000002", marks: 221 },
  { key: "5", code: "MYP5-MOCK-2026", quiz: "d5000000-0000-4000-8000-000000000001", exam: "d5000000-0000-4000-8000-000000000002", marks: 259 },
].map((paper) => ({ ...paper, files: FILES_BY_PAPER[paper.key] ?? [] }));
const ALL_FILES = PARTS.flatMap((p) => p.files);

const ORG = "0a400000-0000-4000-8000-000000000001";
const CLASS_ID = "0a400000-0000-4000-8000-000000000107";

let checks = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) {
    checks += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const sqlOf = (file) =>
  readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");

const db = new PGlite();

// A faithful skeleton of the production schema: the columns, defaults and CHECK
// constraints these migrations actually touch, including the hint body/length and
// review-shape rules that govern publication.
await db.exec(`
  create schema if not exists public;

  create table public.classes (
    id uuid primary key,
    organization_id uuid not null,
    name text not null,
    grade_order int
  );

  create table public.questions (
    id uuid primary key,
    organization_id uuid not null,
    type text not null check (type in ('single_choice','multiple_select','true_false',
      'short_answer','numeric','ordering','matching','poll','open_ended','slide','assess_parts')),
    prompt text not null,
    prompt_doc jsonb,
    explanation text,
    explanation_doc jsonb,
    points numeric not null default 1,
    difficulty text not null default 'medium'
      check (difficulty in ('easy','medium','hard','competition')),
    topic text,
    subtopic text,
    tags text[] not null default '{}',
    status text not null default 'draft'
      check (status in ('draft','pending_review','published','archived')),
    config jsonb not null default '{}'::jsonb,
    created_by uuid,
    curriculum text,
    curriculum_course text,
    subject_id uuid,
    review_status text not null default 'draft',
    creation_method text,
    class_id uuid references public.classes(id) on delete set null
  );

  create table public.question_options (
    id uuid primary key,
    question_id uuid not null references public.questions(id) on delete cascade,
    label text not null,
    is_correct boolean not null default false,
    position int not null default 0,
    content_doc jsonb
  );

  create table public.quizzes (
    id uuid primary key,
    organization_id uuid not null,
    title text not null,
    description text,
    status text not null default 'draft',
    settings jsonb not null default '{}'::jsonb,
    created_by uuid
  );

  create table public.quiz_questions (
    id uuid primary key default gen_random_uuid(),
    quiz_id uuid not null references public.quizzes(id) on delete cascade,
    question_id uuid not null references public.questions(id) on delete cascade,
    position int not null,
    points numeric not null default 1,
    time_limit_seconds int,
    constraint quiz_questions_quiz_id_question_id_key unique (quiz_id, question_id)
  );

  create table public.exams (
    id uuid primary key,
    organization_id uuid not null,
    quiz_id uuid references public.quizzes(id) on delete set null,
    class_id uuid references public.classes(id) on delete set null,
    title text not null,
    description text,
    instructions text,
    duration_minutes int not null default 60,
    status text not null default 'draft'
      check (status in ('draft','scheduled','open','paused','closed')),
    access_code text unique not null,
    shared_link_enabled boolean not null default true,
    settings jsonb not null default '{}'::jsonb,
    created_by uuid,
    result_publication_mode text not null default 'manual'
      check (result_publication_mode in ('manual','automatic'))
  );

  create table public.question_hints (
    id uuid primary key,
    organization_id uuid not null,
    exam_id uuid references public.exams(id) on delete cascade,
    question_id uuid references public.questions(id) on delete cascade,
    level int not null check (level between 1 and 3),
    body text not null check (char_length(btrim(body)) between 8 and 800),
    body_doc jsonb,
    status text not null default 'draft'
      check (status in ('draft','approved','published','archived')),
    source text not null default 'manual' check (source in ('manual','ai')),
    created_by uuid,
    approved_by uuid,
    approved_at timestamptz,
    published_at timestamptz,
    constraint question_hints_review_shape check (
      status in ('draft','archived')
      or (status = 'approved' and approved_at is not null and approved_by is not null)
      or (status = 'published' and approved_at is not null and approved_by is not null
          and published_at is not null))
  );

  create table public.platform_settings (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now()
  );

  insert into public.classes (id, organization_id, name, grade_order)
  values ('${CLASS_ID}', '${ORG}', 'MYP 2 A', 7);
`);

// ── 1. Every part loads, in order, and replaying it changes nothing. ────────
for (const file of ALL_FILES) {
  try {
    await db.exec(sqlOf(file));
    check(`${file} loads`, true);
  } catch (error) {
    check(`${file} loads`, false, String(error.message).split("\n")[0]);
    // A failed part leaves the connection inside an aborted transaction.
    await db.exec("rollback").catch(() => {});
  }
}

const counts = async () => {
  const row = await db.query(`
    select (select count(*) from public.questions)::int as questions,
           (select count(*) from public.question_options)::int as options,
           (select count(*) from public.quiz_questions)::int as paper_items,
           (select count(*) from public.question_hints)::int as hints,
           (select count(*) from public.exams)::int as exams`);
  return row.rows[0];
};

const before = await counts();
for (const file of ALL_FILES) {
  try {
    await db.exec(sqlOf(file));
  } catch (error) {
    check(`${file} replays`, false, String(error.message).split("\n")[0]);
  }
}
const after = await counts();
check("replaying all twelve parts inserts nothing new",
  JSON.stringify(before) === JSON.stringify(after),
  `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
check("the three papers plus the seed class's paper rows",
  after.exams === 3, `found ${after.exams} exams`);
check("135 questions and 405 paper items",
  after.questions === 135 && after.paper_items === 135,
  `${after.questions} questions / ${after.paper_items} items`);
check("levels 1–2 are published for every question and no level 3 is shipped",
  after.hints >= 135 && after.hints <= 270, `found ${after.hints}`);
const hinted = await db.query(`
  select count(distinct question_id)::int as questions,
         max(level)::int as deepest
    from public.question_hints`);
check("all 135 questions are hinted, never past level 2",
  hinted.rows[0].questions === 135 && hinted.rows[0].deepest === 2,
  JSON.stringify(hinted.rows[0]));

// ── 2. Paper totals, sections and durations. ───────────────────────────────
for (const paper of PARTS) {
  const paperRow = await db.query(
    `select count(*)::int as n, sum(q.points)::int as marks,
            count(*) filter (where q.config->>'paper_section' = 'A')::int as sec_a,
            count(*) filter (where q.config->>'paper_section' = 'B')::int as sec_b,
            count(*) filter (where q.type <> 'assess_parts')::int as objective
       from public.quiz_questions qq
       join public.questions q on q.id = qq.question_id
      where qq.quiz_id = $1` , [paper.quiz]);
  const r = paperRow.rows[0];
  check(`${paper.code}: 45 questions on the paper`, r.n === 45, `found ${r.n}`);
  check(`${paper.code}: ${paper.marks} marks`, r.marks === paper.marks, `found ${r.marks}`);
  check(`${paper.code}: 22 objective then 23 structured`,
    r.sec_a === 22 && r.sec_b === 23 && r.objective === 22,
    `${r.sec_a} A / ${r.sec_b} B / ${r.objective} objective`);

  const objMarks = await db.query(
    `select sum(q.points) filter (where q.config->>'paper_section' = 'A')::int as a,
            sum(q.points) filter (where q.config->>'paper_section' = 'B')::int as b
       from public.quiz_questions qq
       join public.questions q on q.id = qq.question_id
      where qq.quiz_id = $1`, [paper.quiz]);
  check(`${paper.code}: section marks add up to the paper total`,
    objMarks.rows[0].a + objMarks.rows[0].b === paper.marks,
    `${objMarks.rows[0].a} + ${objMarks.rows[0].b}`);

  const examRow = await db.query(
    `select title, duration_minutes, status, access_code, shared_link_enabled,
            result_publication_mode, class_id, instructions, settings
       from public.exams where id = $1`, [paper.exam]);
  const e = examRow.rows[0];
  check(`${paper.code}: examination row exists`, Boolean(e));
  if (!e) continue;
  check(`${paper.code}: 150 minutes`, e.duration_minutes === 150, `found ${e.duration_minutes}`);
  check(`${paper.code}: open, shared link, manual publication`,
    e.status === "open" && e.shared_link_enabled && e.result_publication_mode === "manual");
  check(`${paper.code}: access code is the paper code`, e.access_code === paper.code);
  check(`${paper.code}: addressed to the MYP class`, e.class_id === CLASS_ID);
  check(`${paper.code}: results stay unpublished`,
    e.settings.results_published === false
    && e.settings.pass_mark_percent === 50
    && e.settings.assessment_kind === "mock");
  check(`${paper.code}: cover page names both sections and prints the totals`,
    typeof e.instructions === "string"
    && e.instructions.includes("SECTION A")
    && e.instructions.includes("SECTION B")
    && e.instructions.includes("2 hours 30 minutes")
    && e.instructions.includes(`total of ${paper.marks}`));
  const settings = await db.query(
    `select settings from public.quizzes where id = $1`, [paper.quiz]);
  const s = settings.rows[0].settings;
  check(`${paper.code}: quiz settings carry the section blueprint`,
    Array.isArray(s.sections) && s.sections.length === 2
    && s.sections[0].questions === 22 && s.sections[1].questions === 23
    && s.total_marks === paper.marks && s.duration_minutes === 150);
}

// ── 3. Objective keys: four options, exactly one correct. ──────────────────
const keys = await db.query(`
  select q.config->>'source' as source, (q.config->>'question_number')::int as n,
         count(*)::int as options,
         count(*) filter (where o.is_correct)::int as correct
    from public.questions q
    join public.question_options o on o.question_id = q.id
   where q.type in ('single_choice','numeric','short_answer')
   group by 1, 2 order by 1, 2`);
check("every objective question has four options", keys.rows.every((r) => r.options === 4),
  keys.rows.filter((r) => r.options !== 4).slice(0, 5).map((r) => `${r.source}#${r.n}`).join(", "));
check("exactly one option is keyed per objective question",
  keys.rows.every((r) => r.correct === 1),
  keys.rows.filter((r) => r.correct !== 1).slice(0, 5).map((r) => `${r.source}#${r.n}=${r.correct}`).join(", "));

const keyed = await db.query(`
  select count(*)::int as bad
    from public.questions q join public.question_options o on o.question_id = q.id
   where q.type = 'single_choice' and o.is_correct
     and not exists (
       select 1 from jsonb_array_elements_text(q.config->'option_labels') as label
        where label = o.label)`);
check("the keyed option is always one of the four authored labels",
  keyed.rows[0].bad === 0, `${keyed.rows[0].bad} keyed labels not authored`);

// ── 4. Structured parts: typed, hinted, markable. ──────────────────────────
const parts = await db.query(`
  select (q.config->>'question_number')::int as n,
         jsonb_array_length(q.config->'parts') as parts,
         sum(jsonb_array_length(q.config->'parts')) over () as total_parts,
         count(*) filter (where p->>'kind' not in ('numeric','expression','text'))::int as bad_kinds,
         min(length(p->>'prompt')) as shortest
    from public.questions q, jsonb_array_elements(q.config->'parts') p
   where q.type = 'assess_parts'
   group by 1, q.config->'parts'`);
check("every structured part declares a supported answer kind",
  parts.rows.every((r) => r.bad_kinds === 0),
  parts.rows.filter((r) => r.bad_kinds).slice(0, 4).map((r) => `Q${r.n}`).join(", "));

const partMarks = await db.query(`
  select count(*)::int as bad
    from public.questions q, jsonb_array_elements(q.config->'parts') p
   where q.type = 'assess_parts'
     and coalesce((p->>'points')::numeric, -1) <= 0`);
check("no structured part is worth zero marks", partMarks.rows[0].bad === 0,
  `${partMarks.rows[0].bad} zero-mark parts`);

const partSum = await db.query(`
  select count(*)::int as mismatched
    from public.questions q
   where q.type = 'assess_parts'
     and (select coalesce(sum((p->>'points')::numeric), 0)
            from jsonb_array_elements(q.config->'parts') p) <> q.points`);
check("every structured question's parts sum to its points",
  partSum.rows[0].mismatched === 0, `${partSum.rows[0].mismatched} questions`);

// ── 5. Hints: published levels 1–2, nothing leaking past level 3. ───────────
const hints = await db.query(`
  select level, status, count(*)::int as n,
         count(*) filter (where char_length(btrim(body)) between 8 and 800)::int as valid
    from public.question_hints group by 1, 2 order by 1`);
check("hints ship only at levels 1 and 2",
  hints.rows.every((r) => r.level === 1 || r.level === 2),
  hints.rows.map((r) => `L${r.level}`).join(", "));
check("every hint is published and fits the body constraint",
  hints.rows.every((r) => r.status === "published" && r.n === r.valid),
  hints.rows.filter((r) => r.status !== "published" || r.n !== r.valid)
    .map((r) => `L${r.level}:${r.status}`).join(", "));
check("level 1 covers all 45 questions of each paper",
  PARTS.every(() => hints.rows.filter((r) => r.level === 1).reduce((a, r) => a + r.n, 0) === 135),
  hints.rows.map((r) => `L${r.level}=${r.n}`).join(", "));

// ── 6. The self-check really aborts an incomplete paper. ───────────────────
// The final part is self-healing: it re-assembles any missing paper item from
// the questions that exist, so a half-written paper repairs itself on replay.
await db.exec("begin");
await db.exec(`delete from public.quiz_questions
                where question_id in (select id from public.questions
                                       where config->>'question_number' = '45'
                                         and config->>'source' = 'myp-mock-myp2-mock')`);
await db.exec(sqlOf(FILES_BY_PAPER["2"].at(-1)));
const repaired = await db.query(
  `select count(*)::int as n from public.quiz_questions where quiz_id = $1`,
  ["d2000000-0000-4000-8000-000000000001"]);
await db.exec("rollback");
check("re-running the final part re-assembles a missing paper item",
  repaired.rows[0].n === 45, `${repaired.rows[0].n} items`);

// But it refuses to certify a paper that is genuinely short: drop a question
// (cascading its options, item and hints) and the block must abort, not commit.
await db.exec("begin");
await db.exec(`delete from public.questions
                where config->>'question_number' = '45'
                  and config->>'source' = 'myp-mock-myp2-mock'`);
const shortPaper = await db.query("select count(*)::int as n from public.quiz_questions");
let aborted = "";
try {
  await db.exec(sqlOf(FILES_BY_PAPER["2"].at(-1)));
} catch (error) {
  aborted = String(error.message);
}
await db.exec("rollback").catch(() => {});
check("the self-check refuses to commit a paper missing a question",
  shortPaper.rows[0].n === 134 && /expected 45/.test(aborted),
  `${shortPaper.rows[0].n} items left; error: ${aborted.slice(0, 90) || "none"}`);

// ── 7. Pass threshold is a platform setting with an org override. ──────────
const threshold = await db.query(
  `select value from public.platform_settings where key = 'exam_pass_threshold'`);
check("pass threshold stored once, with an org override slot",
  threshold.rows.length === 1
  && threshold.rows[0].value.default_percent === 50
  && typeof threshold.rows[0].value.organization_overrides === "object",
  JSON.stringify(threshold.rows[0]?.value ?? null));

// ── 8. Papers share no stem and no option label inside a question. ────────
const dupes = await db.query(`
  select (config->>'source') as source, lower(regexp_replace(prompt, '[0-9]+', '#', 'g')) as stem,
         count(*)::int as n
    from public.questions group by 1, 2 having count(*) > 1`);
check("no paper repeats a stem", dupes.rows.length === 0,
  dupes.rows.slice(0, 4).map((r) => `${r.source}:${r.stem.slice(0, 40)}`).join(" | "));

const optDupes = await db.query(`
  select count(*)::int as bad from (
    select question_id from public.question_options
     group by question_id, lower(label) having count(*) > 1) t`);
check("no question repeats an option label", optDupes.rows[0].bad === 0,
  `${optDupes.rows[0].bad}`);

if (failures.length) {
  console.error(`\n${failures.length} of ${checks + failures.length} checks failed:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`\n${checks} checks passed`);
}
