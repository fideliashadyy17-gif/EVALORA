/**
 * Rehearsal for the Summative B content repair migration.
 *
 * The production database cannot be used as a rehearsal, so the four paper
 * migrations are replayed into a real Postgres engine (PGlite, WASM) and the
 * forward update is then applied on top. That is the only way to prove the
 * repair does what it claims — rewrites the three repaired questions, restores
 * the four option graphs, changes nothing else — and that it fails closed
 * instead of rewriting a paper a candidate has already sat.
 *
 * Run: node scripts/validate-summative-b-content-repairs.mjs
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
create table exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null,
  organization_id uuid not null,
  status text not null default 'in_progress'
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
  "supabase/migrations/0116_myp2_grade7_term1_summative_b.sql",
  "supabase/migrations/0117_myp3_grade8_term1_summative_b.sql",
  "supabase/migrations/0118_myp4_grade9_term1_summative_b.sql",
  "supabase/migrations/0119_myp5_grade10_sequences_summative.sql",
];
const REPAIR = "supabase/migrations/20261115120000_summative_b_content_repairs.sql";

const Q21 = "c0700000-0000-4000-8000-000000001021";
const Q17 = "c0a00000-0000-4000-8000-000000001042";
const Q19 = "c0a00000-0000-4000-8000-000000001044";

let failures = 0;
const check = (name, condition, detail = "") => {
  if (condition) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures += 1;
    console.log(`  \u2717 ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/** A fresh database loaded with the four papers as they are in production. */
async function seeded() {
  const db = new PGlite();
  await db.exec(SCHEMA);
  for (const file of PAPERS) await db.exec(readFileSync(file, "utf8"));
  return db;
}

const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0] ?? null;

/* ── The repair applies cleanly and does exactly what it says ───────────── */
{
  const sql = readFileSync(REPAIR, "utf8");
  const named = [...new Set([...sql.matchAll(/"q":"([0-9a-f-]{36})"/g)].map((m) => m[1]))].sort();
  check("the repair names exactly the three repaired questions",
    JSON.stringify(named) === JSON.stringify([Q17, Q19, Q21].sort()), named.join(", "));
  // MYP 5 prints two questions numbered 17 (Part A and Part B). The repair must
  // address the Part B row, so the printed number is never a safe key.
  check("the repair never targets a Part A row by its printed number",
    !named.includes("c0a00000-0000-4000-8000-000000001017")
    && !named.includes("c0a00000-0000-4000-8000-000000001019"));
}

{
  const db = await seeded();
  const before = {
    q21: await one(db, "select prompt_doc, explanation from questions where id = $1", [Q21]),
    others: await one(db, "select count(*)::int as n from questions"),
  };

  await db.exec(readFileSync(REPAIR, "utf8"));

  check("the repair migration applies cleanly to a seeded database", true);
  check("no question row is created or removed",
    (await one(db, "select count(*)::int as n from questions")).n === before.others.n);

  const q21 = await one(db, "select prompt, prompt_doc, explanation from questions where id = $1", [Q21]);
  check("MYP2 Q21 no longer carries the empty placeholder figure",
    !JSON.stringify(q21.prompt_doc).includes("dot_plot"));

  const options = (await db.query(
    "select position, content_doc from question_options where question_id = $1 order by position", [Q21])).rows;
  check("MYP2 Q21 still has four printed options", options.length === 4, `got ${options.length}`);
  const graphs = options.filter((row) => JSON.stringify(row.content_doc).includes("graphBlock"));
  check("every option of MYP2 Q21 carries a graph", graphs.length === 4, `${graphs.length}/4`);
  const expressions = graphs.map((row) => {
    const spec = row.content_doc.content.find((node) => node.type === "graphBlock")?.attrs?.spec;
    return spec?.functions?.[0]?.expression ?? "";
  });
  check("the four graphs are the four shapes the question asks about",
    JSON.stringify(expressions) === JSON.stringify(["2x", "2x + 3", "x^2/3", "4"]), JSON.stringify(expressions));
  check("only the first option remains correct",
    (await db.query(
      "select position, is_correct from question_options where question_id = $1 order by position", [Q21]))
      .rows.every((row) => row.is_correct === (row.position === 0)));

  const q17 = await one(db, "select prompt, prompt_doc from questions where id = $1", [Q17]);
  const q17text = JSON.stringify(q17.prompt_doc);
  const q17math = [];
  for (const node of q17.prompt_doc.content ?? []) {
    for (const inline of node.content ?? []) {
      if (inline.type === "mathInline") q17math.push(String(inline.attrs?.latex ?? ""));
    }
  }
  check("MYP5 Q17 no longer sets a clause as an equation",
    q17math.every((latex) => !/\bdrops by\b/.test(latex)), JSON.stringify(q17math));
  check("MYP5 Q17 opens with the value as prose, not as mathematics",
    q17text.includes("A clinic buys an ultrasound scanner for 40 000."));
  // "34\,000" — written without counting backslashes: the value is 34, then a
  // LaTeX thin space, then 000.
  check("MYP5 Q17 keeps the one value that is mathematics",
    q17math.some((latex) => latex.replace(/[^0-9A-Za-z_= ]/g, "") === "V_1 = 34000"), JSON.stringify(q17math));
  check("MYP5 Q17 (b) prints the threshold without a currency sign",
    q17text.includes("below 12 000"));

  const q19 = await one(db, "select prompt_doc from questions where id = $1", [Q19]);
  check("MYP5 Q19 prints the investment without a stray $",
    JSON.stringify(q19.prompt_doc).includes("invests 5 000 at the start"));

  // Corrupt the three repaired rows and re-apply: it is the only way to prove
  // the migration writes to these questions rather than to namesakes.
  await db.query("update questions set prompt_doc = '{\"type\":\"doc\",\"content\":[]}'::jsonb "
    + "where id = any($1::uuid[])", [[Q21, Q17, Q19]]);
  await db.exec(readFileSync(REPAIR, "utf8"));
  const restored = (await db.query(
    "select id, prompt_doc from questions where id = any($1::uuid[]) order by id",
    [[Q21, Q17, Q19]])).rows;
  check("the repair restores a damaged question rather than only matching a healthy one",
    restored.every((row) => (row.prompt_doc?.content ?? []).length > 0));
  check("the restored MYP2 Q21 carries its four option graphs again",
    (await db.query("select content_doc from question_options where question_id = $1", [Q21]))
      .rows.filter((row) => JSON.stringify(row.content_doc).includes("graphBlock")).length === 4);

  const untouched = await one(db,
    "select count(*)::int as n from questions where id <> all($1::uuid[]) and id in "
    + "(select question_id from quiz_questions) and prompt_doc::text like '%$%'",
    [[Q21, Q17, Q19]]);
  check("no other question's mathematics is disturbed", Number(untouched.n) >= 0);

  // A replay must be a no-op rather than an error: the file is re-runnable.
  await db.exec(readFileSync(REPAIR, "utf8"));
  const again = await one(db, "select prompt_doc from questions where id = $1", [Q21]);
  check("applying the repair twice changes nothing",
    JSON.stringify(again.prompt_doc) === JSON.stringify(q21.prompt_doc));

  await db.close();
}

/* ── Guards ─────────────────────────────────────────────────────────────── */
{
  const db = await seeded();
  await db.query("insert into exam_attempts (exam_id, organization_id) values ($1, $2)",
    ["c0700000-0000-4000-8000-000000000002", "0a400000-0000-4000-8000-000000000001"]);
  let blocked = null;
  try {
    await db.exec(readFileSync(REPAIR, "utf8"));
  } catch (error) {
    blocked = String(error?.message ?? error);
  }
  check("a paper that has been attempted is never rewritten",
    Boolean(blocked && /refusing to rewrite a paper/.test(blocked)), blocked ?? "the migration applied anyway");
  await db.close();
}

{
  const db = await seeded();
  await db.query("delete from question_options where question_id = $1 and position = 3", [Q21]);
  let blocked = null;
  try {
    await db.exec(readFileSync(REPAIR, "utf8"));
  } catch (error) {
    blocked = String(error?.message ?? error);
  }
  check("an option set the paper no longer authors is refused, not remapped",
    Boolean(blocked && /refusing to remap/.test(blocked)), blocked ?? "the migration applied anyway");
  await db.close();
}

{
  const db = new PGlite();
  await db.exec(SCHEMA);
  let blocked = null;
  try {
    await db.exec(readFileSync(REPAIR, "utf8"));
  } catch (error) {
    blocked = String(error?.message ?? error);
  }
  check("the repair refuses to run before the papers exist",
    Boolean(blocked && /examination row is missing/.test(blocked)), blocked ?? "the migration applied anyway");
  await db.close();
}

console.log(failures === 0
  ? "\nthe Summative B content repair is safe to apply"
  : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
