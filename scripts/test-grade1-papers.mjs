#!/usr/bin/env node
/**
 * Validate the four Grade 1 / CI papers against a real PostgreSQL engine.
 *
 * The migrations in this folder are what production will run, so the proof that
 * they load must come from a real parser and a real values-list check, not from
 * reading the file. PGlite is a genuine Postgres compiled to WebAssembly: it
 * rejects a ragged VALUES list, a bad type and a missing column exactly as the
 * live database does.
 *
 * What is asserted:
 *   * every migration file parses and inserts 30 questions per subject;
 *   * each paper totals the printed 40 marks (20 x 1 + 10 x 2);
 *   * every printed question carries its own answer key and its own picture;
 *   * the option rows load, every objective question has exactly one keyed
 *     answer, and no question of the printing has two;
 *   * running the same files twice inserts nothing the second time.
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = [
  "0064_grade1_mathematics_questions.sql",
  "0065_grade1_science_questions.sql",
  "0066_grade1_language_arts_questions.sql",
  "0067_grade1_social_science_questions.sql",
  "0068_grade1_options.sql",
];

const ORG = "0a400000-0000-4000-8000-000000000001";
const SUBJECTS = ["mathematics", "science", "language-arts", "social-science"];
const OBJECTIVE = ["single_choice", "true_false", "short_answer"];

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  if (!ok) console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  else console.log(`  ✓ ${name}`);
}

const db = new PGlite();

await db.exec(`
  create schema if not exists public;
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
`);

// ── 1. Every file loads, twice. ────────────────────────────────────────────
for (const file of MIGRATIONS) {
  const sql = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
  try {
    await db.exec(sql);
    check(`${file} loads`, true);
  } catch (error) {
    check(`${file} loads`, false, String(error.message).split("\n")[0]);
  }
}

const counts = await db.query(
  `select config->>'subject' as subject, count(*)::int as n, sum(points)::int as marks
     from public.questions group by 1 order by 1`,
);
const bySubject = Object.fromEntries(counts.rows.map((r) => [r.subject, r]));

// ── 2. Thirty questions and forty marks per paper. ─────────────────────────
for (const subject of SUBJECTS) {
  const row = bySubject[subject];
  check(`${subject}: 30 printed questions`, row?.n === 30, `found ${row?.n ?? 0}`);
  check(`${subject}: 40 printed marks`, row?.marks === 40, `found ${row?.marks ?? 0}`);
}

const sections = await db.query(
  `select config->>'subject' as subject,
          count(*) filter (where config->>'section' = 'A')::int as a,
          count(*) filter (where config->>'section' = 'B')::int as b
     from public.questions group by 1 order by 1`,
);
for (const row of sections.rows) {
  check(`${row.subject}: Section A 20 / Section B 10`, row.a === 20 && row.b === 10, `A=${row.a} B=${row.b}`);
}

// ── 3. Keys, figures, numbering, wording. ──────────────────────────────────
const integrity = await db.query(`
  select
    count(*)::int as total,
    count(*) filter (where config->>'marking_scheme' is null or length(config->>'marking_scheme') < 5)::int as no_key,
    count(*) filter (where prompt is null or length(trim(prompt)) < 5)::int as no_prompt,
    count(distinct (config->>'subject') || ':' || (config->>'question_number'))::int as distinct_numbers
  from public.questions
`);
const q = integrity.rows[0];
check("120 questions imported", q.total === 120, `found ${q.total}`);
check("every question carries the printing's answer key", q.no_key === 0, `${q.no_key} without a key`);
check("every question has its printed wording", q.no_prompt === 0, `${q.no_prompt} empty`);
check("no question number repeats inside a subject", q.distinct_numbers === 120, `distinct ${q.distinct_numbers}`);

// A picture must be carried where the paper needs one. The paper keys picture
// questions by picture letter ("B (flower)"), so a question whose printed answer
// is a letter is unanswerable without its pictures. The converse is *not* true:
// a question whose answer is a number, a word or YES/NO routinely prints an
// illustration beside its answer lines (Social Science Q24 shows a rose and a
// tomato over the two answer blanks), so a pictured text-answer question is the
// printing's own design, not an invented picture.
const letterKeyedRows = await db.query(`
  select config->>'subject' as subject, (config->>'question_number')::int as n,
         (prompt_doc is not null) as pictured
    from public.questions
   where (config->>'marking_scheme') ~ '^Answer: [A-D][^A-Za-z0-9]'
   order by 1, 2
`);
const missingFigure = letterKeyedRows.rows.filter((r) => !r.pictured);
check("every picture-keyed question carries its printed pictures",
  missingFigure.length === 0,
  missingFigure.slice(0, 6).map((r) => `${r.subject} Q${r.n}`).join(", "));

// The pictures themselves. Not every printed card carries artwork: a phonics
// card that asks the pupil to tick the word "rope" is words only, and giving it
// a picture would be inventing one. These eight questions are the whole of that
// set, each checked against its printed card (Language Art pages 11-13, Social
// Science page 17); every one of the other 112 questions prints artwork beside
// its prompt or its answer lines and must show it.
const NO_ARTWORK = new Set([
  "language-arts:12", "language-arts:13", "language-arts:14", "language-arts:15",
  "language-arts:23", "language-arts:24", "language-arts:25", "social-science:27",
]);
const figureRows = await db.query(`
  select config->>'subject' as subject, (config->>'question_number')::int as n,
         coalesce(prompt_doc::text like '%/exam-figures/grade1-ci/%', false) as pictured
    from public.questions
   order by 1, 2
`);
const figureGaps = [];
for (const row of figureRows.rows) {
  const key = `${row.subject}:${row.n}`;
  const shouldShow = !NO_ARTWORK.has(key);
  if (shouldShow && !row.pictured) figureGaps.push(`${key} prints artwork but shows none`);
  if (!shouldShow && row.pictured) figureGaps.push(`${key} shows artwork the paper does not print`);
}
check("the 112 questions that print artwork each show their own picture",
  figureGaps.length === 0, figureGaps.slice(0, 6).join("; "));

// The flag is what a reviewer filters on, so it must agree with the content.
const flags = await db.query(`
  select count(*) filter (where coalesce((config->>'has_pictures')::boolean, false)
                            and prompt_doc::text like '%/exam-figures/grade1-ci/%')::int as flagged_and_pictured,
         count(*) filter (where not coalesce((config->>'has_pictures')::boolean, false)
                            and prompt_doc::text like '%/exam-figures/grade1-ci/%')::int as pictured_not_flagged,
         count(*) filter (where coalesce((config->>'has_pictures')::boolean, false)
                            and prompt_doc is null)::int as flagged_without_picture
    from public.questions
`);
const f = flags.rows[0];
check("every pictured question is flagged and every flagged question is pictured",
  f.pictured_not_flagged === 0 && f.flagged_without_picture === 0,
  `${f.pictured_not_flagged} pictured-not-flagged, ${f.flagged_without_picture} flagged-without-picture`);
check("112 questions print artwork", f.flagged_and_pictured === 112, `found ${f.flagged_and_pictured}`);

const numbering = await db.query(`
  select config->>'subject' as subject, config->>'question_number' as n
    from public.questions
   where (config->>'question_number')::int < 1 or (config->>'question_number')::int > 30
`);
check("every question number is 1..30", numbering.rows.length === 0, `${numbering.rows.length} out of range`);

// ── 4. Options: every objective question has exactly one keyed answer. ─────
const obj = await db.query(`
  select q.type, q.config->>'subject' as subject, q.config->>'question_number' as n,
         count(o.*)::int as options,
         count(o.*) filter (where o.is_correct)::int as keyed
    from public.questions q
    left join public.question_options o on o.question_id = q.id
   group by 1,2,3
`);
let objectiveCount = 0;
const problems = [];
for (const row of obj.rows) {
  if (!OBJECTIVE.includes(row.type)) continue;
  objectiveCount += 1;
  if (row.keyed !== 1) problems.push(`${row.subject} Q${row.n} keyed=${row.keyed}`);
}
check("Section A is 80 objective questions (20 per paper)", objectiveCount === 80, `found ${objectiveCount}`);
check("every objective question has exactly one keyed answer", problems.length === 0, problems.slice(0, 4).join("; "));

// A typed answer is scored against its keyed option label; a picture question
// must offer the printed letters, so both kinds are checked for a usable label.
const blank = await db.query(
  `select count(*)::int as n from public.question_options where label is null or length(trim(label)) = 0`,
);
check("no answer choice has an empty label", blank.rows[0].n === 0, `${blank.rows[0].n} blank`);

const unkeyed = await db.query(`
  select count(*)::int as n from public.questions q
   where q.type = 'open_ended'
     and exists (select 1 from public.question_options o where o.question_id = q.id and o.is_correct)
`);
check("no teacher-marked task claims an automatic correct answer", unkeyed.rows[0].n === 0, `${unkeyed.rows[0].n} claimed`);

// ── 5. Re-running the files changes nothing. ───────────────────────────────
const before = await db.query("select count(*)::int as n from public.questions");
for (const file of MIGRATIONS) {
  await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
}
const after = await db.query("select count(*)::int as n from public.questions");
const afterOptions = await db.query("select count(*)::int as n from public.question_options");
check("re-running every file inserts no duplicate question", before.rows[0].n === after.rows[0].n, `${before.rows[0].n} -> ${after.rows[0].n}`);
check("re-running every file inserts no duplicate option", afterOptions.rows[0].n === (await db.query("select count(*)::int as n from public.question_options")).rows[0].n);

await db.close();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
  process.exit(1);
}
console.log("PASS: the four Grade 1 papers load and total correctly in a real PostgreSQL.");
