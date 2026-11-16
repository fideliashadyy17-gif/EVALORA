/**
 * Rehearsal for the automatic-marking rubric seed
 * (supabase/migrations/0122_summative_b_auto_marking.sql).
 *
 * The four paper migrations are replayed into a real Postgres engine (PGlite),
 * the seed is applied on top, and every rubric that lands in the database is
 * compared with the JSON the marking engine compiles from — the database and
 * the engine must never disagree about what a question is worth.
 *
 * Run: node scripts/validate-summative-b-rubric-seed.mjs
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const SCHEMA = readFileSync("scripts/validate-summative-b-content-repairs.mjs", "utf8")
  .match(/const SCHEMA = `([\s\S]*?)`;/)[1];

const PAPERS = [
  "supabase/migrations/0116_myp2_grade7_term1_summative_b.sql",
  "supabase/migrations/0117_myp3_grade8_term1_summative_b.sql",
  "supabase/migrations/0118_myp4_grade9_term1_summative_b.sql",
  "supabase/migrations/0119_myp5_grade10_sequences_summative.sql",
];
const SEED = "supabase/migrations/0122_summative_b_auto_marking.sql";
const RUBRICS = JSON.parse(readFileSync("src/lib/marking/summativeBRubrics.json", "utf8"));

let failures = 0;
const check = (name, condition, detail = "") => {
  if (condition) console.log(`  \u2713 ${name}`);
  else {
    failures += 1;
    console.log(`  \u2717 ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

async function seeded() {
  const db = new PGlite();
  await db.exec(SCHEMA);
  for (const file of PAPERS) await db.exec(readFileSync(file, "utf8"));
  return db;
}

const db = await seeded();
await db.exec(readFileSync(SEED, "utf8"));
check("the rubric seed applies cleanly to the four papers", true);

const rows = (await db.query(`
  select q.id, q.type, q.config, qq.points, qq.quiz_id
    from questions q
    join quiz_questions qq on qq.question_id = q.id
   where qq.quiz_id in (
     'c0700000-0000-4000-8000-000000000001'::uuid,
     'c0800000-0000-4000-8000-000000000001'::uuid,
     'c0900000-0000-4000-8000-000000000001'::uuid,
     'c0a00000-0000-4000-8000-000000000001'::uuid)
   order by q.id`)).rows;

/** Postgres normalises a jsonb value (key order, whitespace), so compare canonically. */
function canon(value) {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = canon(value[key]);
      return out;
    }, {});
  }
  return value;
}

const expected = Object.entries(RUBRICS).filter(([id]) => !id.startsWith("_"));
check("the paper carries 65 constructed responses", rows.filter((r) => r.type === "open_ended").length === 65,
  `${rows.filter((r) => r.type === "open_ended").length}`);
check("every rubric in the source of truth has a question", expected.length === 65, `${expected.length}`);

const withRubric = rows.filter((row) => row.type === "open_ended" && row.config?.auto_marking);
check("every constructed response now carries a rubric", withRubric.length === 65, `${withRubric.length}/65`);

const mismatched = [];
let totalMarks = 0;
for (const row of rows) {
  if (row.type !== "open_ended") continue;
  const stored = row.config?.auto_marking;
  const authored = RUBRICS[row.id];
  if (!authored) {
    mismatched.push(`${row.id}: no rubric in the source of truth`);
    continue;
  }
  // Compare parts and rules, not key order: jsonb reorders keys on the way in.
  const canonStored = JSON.stringify(canon(stored));
  const canonAuthored = JSON.stringify(canon(authored));
  if (canonStored !== canonAuthored) {
    const at = [...canonStored].findIndex((ch, i) => ch !== canonAuthored[i]);
    mismatched.push(`${row.id}: stored rubric differs near ${canonStored.slice(Math.max(0, at - 40), at + 40)}`);
  }
  const total = (authored.parts ?? []).reduce((sum, part) => sum + Number(part.marks ?? 0), 0);
  if (total !== Number(row.points)) mismatched.push(`${row.id}: rubric ${total} vs paper ${row.points}`);
  if (authored.criterion !== row.config?.myp_criterion) {
    mismatched.push(`${row.id}: rubric criterion ${authored.criterion} vs paper ${row.config?.myp_criterion}`);
  }
  totalMarks += Number(row.points);
}
check("every stored rubric matches the engine's own definition and the printed marks",
  mismatched.length === 0, mismatched.slice(0, 3).join(" | "));
check("the rubrics cover all 260 marks of constructed response", totalMarks === 260, `${totalMarks}`);

// Nothing objective may be given a rubric: a single choice is marked by its key.
const objectiveWithRubric = rows.filter((row) => row.type !== "open_ended" && row.config?.auto_marking);
check("no objective question is given a rubric", objectiveWithRubric.length === 0,
  objectiveWithRubric.map((row) => row.id).join(", "));

// Replay: jsonb_set with the same definition overwrites in place.
await db.exec(readFileSync(SEED, "utf8"));
const after = (await db.query(`
  select q.config->'auto_marking' as rubric
    from questions q join quiz_questions qq on qq.question_id = q.id
   where q.type = 'open_ended'
     and qq.quiz_id in (
       'c0700000-0000-4000-8000-000000000001'::uuid,
       'c0800000-0000-4000-8000-000000000001'::uuid,
       'c0900000-0000-4000-8000-000000000001'::uuid,
       'c0a00000-0000-4000-8000-000000000001'::uuid)
   order by q.id`)).rows;
check("applying the seed twice changes nothing",
  JSON.stringify(after.map((row) => canon(row.rubric))) === JSON.stringify(withRubric.map((row) => canon(row.config?.auto_marking))));
await db.close();

/* The seed must refuse to run against a paper it does not recognise. */
{
  const partial = new PGlite();
  await partial.exec(SCHEMA);
  await partial.exec(readFileSync(PAPERS[0], "utf8"));
  let blocked = null;
  try {
    await partial.exec(readFileSync(SEED, "utf8"));
  } catch (error) {
    blocked = String(error?.message ?? error);
  }
  check("the seed refuses to run unless all four papers are present",
    Boolean(blocked && /found \d+ of the expected 65/.test(blocked)), blocked ?? "the seed applied anyway");
  await partial.close();
}

console.log(failures === 0
  ? "\nthe automatic-marking rubric seed is safe to apply"
  : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
