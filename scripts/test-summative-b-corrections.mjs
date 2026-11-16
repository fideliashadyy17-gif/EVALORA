/**
 * Summative B Mathematics audit corrections, rehearsed on a real Postgres.
 *
 * The four paper migrations (0116–0119) are applied to a PGlite database with
 * a stub of the production schema, then the forward correction migration is
 * applied twice. The checks prove that the defects are actually gone, that the
 * papers still carry 45 questions / 100 marks, that only the audited questions
 * changed, and that the formula sheet is bound to its own examination.
 *
 * Run: node scripts/test-summative-b-corrections.mjs
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

const CORRECTIONS = [
  "supabase/migrations/20261116150000_summative_b_maths_corrections_myp2.sql",
  "supabase/migrations/20261116150001_summative_b_maths_corrections_myp3.sql",
  "supabase/migrations/20261116150002_summative_b_maths_corrections_myp4.sql",
  "supabase/migrations/20261116150003_summative_b_maths_corrections_myp5.sql",
];
const CORRECTION_SQL = CORRECTIONS.map((file) => readFileSync(file, "utf8")).join("\n");

const PAPERS = [
  ["0116_myp2_grade7_term1_summative_b.sql", "c0700000-0000-4000-8000-000000000001", "c0700000-0000-4000-8000-000000000002", "c0700000-0000-4000-8000-"],
  ["0117_myp3_grade8_term1_summative_b.sql", "c0800000-0000-4000-8000-000000000001", "c0800000-0000-4000-8000-000000000002", "c0800000-0000-4000-8000-"],
  ["0118_myp4_grade9_term1_summative_b.sql", "c0900000-0000-4000-8000-000000000001", "c0900000-0000-4000-8000-000000000002", "c0900000-0000-4000-8000-"],
  ["0119_myp5_grade10_sequences_summative.sql", "c0a00000-0000-4000-8000-000000000001", "c0a00000-0000-4000-8000-000000000002", "c0a00000-0000-4000-8000-"],
];

let passed = 0;
const ok = (name, condition, detail) => {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const db = new PGlite();
try {
  await db.exec(SCHEMA);
  for (const [file] of PAPERS) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  const before = (await db.query("select count(*)::int n, coalesce(sum(points),0)::int marks from quiz_questions")).rows[0];
  ok("the four papers start with 180 questions and 400 marks", before.n === 180 && before.marks === 400, JSON.stringify(before));

  for (const file of CORRECTIONS) await db.exec(readFileSync(file, "utf8"));

  const qid = (prefix, n) => `${prefix}${String(1000 + n).padStart(12, "0")}`;
  const question = async (id) => (await db.query("select * from questions where id = $1", [id])).rows[0];

  const myp2Prefix = PAPERS[0][3];
  const q21 = await question(qid(myp2Prefix, 21));
  ok("MYP2 Q21 no longer contains an empty chart",
    !JSON.stringify(q21.prompt_doc).includes("statsBlock") && !JSON.stringify(q21.prompt_doc).includes("dot_plot"));
  const q23 = await question(qid(myp2Prefix, 23));
  const venn = q23.prompt_doc.content.find((b) => b.type === "assessDiagramBlock")?.attrs?.spec?.venn;
  ok("MYP2 Q23 marks the intended region as shaded", venn?.shaded === "rightOnly" && venn?.rightOnly === "");
  const q34 = await question(qid(myp2Prefix, 34));
  const table = q34.prompt_doc.content.find((b) => b.type === "assessDiagramBlock")?.attrs?.spec;
  ok("MYP2 Q34 table has one x column, not two", table.columns.filter((c) => c === "$x$").length === 1 && table.columns.length === 4);

  const myp3Prefix = PAPERS[1][3];
  const q9 = await question(qid(myp3Prefix, 9));
  ok("MYP3 Q9 states the unit carried by its options", /\bg\b/.test(q9.prompt) && q9.prompt.includes("mass"));
  const q15 = await question(qid(myp3Prefix, 15));
  const q15Options = (await db.query("select count(*)::int n from question_options where question_id = $1", [q15.id])).rows[0];
  ok("MYP3 Q15 is manual and has no pseudo-options", q15.type === "open_ended" && q15Options.n === 0);
  ok("MYP3 Q15 no longer prints the scheme answer",
    !/scheme|marking scheme/i.test(q15.prompt) && !/scheme answer/i.test(JSON.stringify(q15.prompt_doc)));
  const q17 = await question(qid(myp3Prefix, 17));
  ok("MYP3 Q17 asks for the bank entry with the value one half", /value/i.test(q17.prompt) && /\\dfrac\{1\}\{2\}/.test(JSON.stringify(q17.prompt_doc)));
  const q19 = await question(qid(myp3Prefix, 19));
  const q20 = await question(qid(myp3Prefix, 20));
  ok("MYP3 Q19 is auto-marked numerically", q19.type === "numeric" && Number(q19.config.numeric_answer) === 1.2e12);
  ok("MYP3 Q20 is auto-marked numerically", q20.type === "numeric" && Number(q20.config.numeric_answer) === 6);

  const myp4Prefix = PAPERS[2][3];
  const q32 = await question(qid(myp4Prefix, 32));
  ok("MYP4 Q32 claims the true invariant (median and upper quartile)",
    q32.prompt.includes("upper quartile") && !q32.prompt.includes("and IQR remain constant"));
  ok("MYP4 Q32 carries a correct worked explanation", /IQR, does change/i.test(q32.explanation) && /\$Q_3 = 42\$/.test(q32.explanation));

  const bad = (await db.query(`
    select count(*)::int n from questions q
    where q.config ->> 'source' like 'myp_-term1-summative-b-2026'
      and q.type in ('single_choice','true_false','short_answer')
      and (select count(*) from question_options o where o.question_id = q.id and o.is_correct) <> 1
  `)).rows[0];
  ok("every objective question still has exactly one keyed answer", bad.n === 0, `${bad.n} bad`);
  const unmarkable = (await db.query(`
    select count(*)::int n from questions q
    where q.config ->> 'source' like 'myp_-term1-summative-b-2026'
      and q.type in ('short_answer','numeric')
      and ((q.type = 'short_answer' and not exists (select 1 from question_options o where o.question_id = q.id and o.is_correct))
        or (q.type = 'numeric' and q.config ->> 'numeric_answer' is null))
  `)).rows[0];
  ok("no short-answer or numeric item is left unmarkable", unmarkable.n === 0, `${unmarkable.n} unmarkable`);

  const totals = (await db.query(`
    select quiz_id, count(*)::int n, coalesce(sum(points),0)::int marks
    from quiz_questions group by quiz_id order by quiz_id
  `)).rows;
  ok("all four papers keep 45 questions and 100 marks", totals.length === 4 && totals.every((r) => r.n === 45 && r.marks === 100), JSON.stringify(totals));

  const revised = (await db.query("select count(*)::int n from questions where config ->> 'content_revision' = $1", ["summative-b-maths-audit-2026-11-16"])).rows[0];
  ok("the audit marks exactly the nine corrected questions", revised.n === 9, `${revised.n}`);
  const provenance = (await db.query("select count(*)::int n from questions where config ->> 'content_revision' = $1 and config ->> 'source' is null", ["summative-b-maths-audit-2026-11-16"])).rows[0];
  ok("every corrected question keeps its paper provenance", provenance.n === 0, `${provenance.n}`);

  for (const [file, , examId, prefix] of PAPERS) {
    const exam = (await db.query("select settings from exams where id = $1", [examId])).rows[0];
    const sheet = exam?.settings?.formula_sheet;
    ok(`${file}: formula sheet belongs to its own examination`, sheet?.exam_id === examId);
    ok(`${file}: formula sheet has content`, Array.isArray(sheet?.groups) && sheet.groups.length > 0);
    ok(`${file}: every formula has a note`, sheet.groups.every((g) => g.items.every((i) => i.latex && i.note)));
    ok(`${file}: formula sheet does not quote a question stem`,
      sheet.groups.every((g) => g.items.every((i) => !/\?\s*$/.test(i.note) && i.note.length < 240)));
    void prefix;
  }

  const snapshot = (await db.query("select id, type, prompt, config, (select count(*) from question_options o where o.question_id = questions.id) options from questions order by id")).rows;
  const settings = (await db.query("select id, settings -> 'formula_sheet' sheet from exams order by id")).rows;
  for (const file of CORRECTIONS) await db.exec(readFileSync(file, "utf8"));
  const snapshot2 = (await db.query("select id, type, prompt, config, (select count(*) from question_options o where o.question_id = questions.id) options from questions order by id")).rows;
  const settings2 = (await db.query("select id, settings -> 'formula_sheet' sheet from exams order by id")).rows;
  ok("replaying the migration changes nothing", JSON.stringify(snapshot) === JSON.stringify(snapshot2) && JSON.stringify(settings) === JSON.stringify(settings2));
  ok("the migration touches no attempt or answer table", !/exam_attempts|exam_answers/.test(CORRECTION_SQL));
  const diagram = readFileSync("src/components/AssessDiagram.tsx", "utf8");
  ok("the Venn renderer actually shades the region the spec names",
    /case "rightOnly":\s*return `M/.test(diagram) && /case "both":\s*return `M/.test(diagram) && /data-testid="venn-shaded-region"/.test(diagram));
} finally {
  await db.close();
}
console.log(`\n${passed} Summative B correction checks passed`);
