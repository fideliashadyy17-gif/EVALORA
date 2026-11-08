// Migration 0061 in isolated PGlite: class-based AB/BC eligibility for the existing AP Examination.
// Minimal schema with the columns the migration touches. No customer data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const ORG = '0a400000-0000-4000-8000-000000000001';
const OTHER_ORG = '0a400000-0000-4000-8000-000000000999';
const AP1_AB = '884b9ddb-8af1-4488-b697-f5dbb2a23085';
const AP2_AB = '9de6834d-0d90-4bfe-8b85-58af9ee110fe';
const AP1_BC = '67ed3b13-a531-4a72-8023-41bdebc32659';
const AP2_BC = '01edebc6-dca8-4376-9e5c-4462a8f95391';
const CE1 = '0a400000-0000-4000-8000-000000000103';
const EXAM = '0e3efd07-5ea6-4d0f-9244-e57a5769cafc';
const QUIZ = '5a0b7e38-60aa-4009-acf3-9d1688dcf00a';
const OTHER_EXAM = '0a400000-0000-4000-8000-000000000604';
const Q48 = '2edd7c5e-26a0-458f-a53b-1a2bbe607e84';
const Q49 = '33435215-790b-466b-96e4-77c0b045fd5b';
const ATTEMPT = '7b1c2d3e-0000-4000-8000-00000000a001';
const migration = readFileSync('supabase/migrations/0061_ap_class_track_eligibility.sql', 'utf8');

const SCHEMA = `
create table classes(id uuid primary key, organization_id uuid not null, name text not null);
create table quizzes(id uuid primary key, organization_id uuid not null, description text);
create table questions(id uuid primary key, organization_id uuid not null, config jsonb);
create table exams(id uuid primary key, organization_id uuid not null, title text not null, access_code text,
  description text, settings jsonb not null default '{}', quiz_id uuid, class_id uuid);
create table exam_attempts(id uuid primary key, exam_id uuid, track text check (track in ('AB','BC')),
  question_order jsonb, status text, score numeric);
`;

async function seed(db) {
  await db.exec(`
    insert into classes values
      ('${AP1_AB}','${ORG}','AP1 (AB)'), ('${AP2_AB}','${ORG}','AP2 (AB)'),
      ('${AP1_BC}','${ORG}','AP1 (BC)'), ('${AP2_BC}','${ORG}','AP2 (BC)'),
      ('${CE1}','${ORG}','CE1');
    insert into quizzes values ('${QUIZ}','${ORG}','AP — AP Calculus AB/BC — Limits Practice Exam. Fifty multiple-choice questions on limits; questions 45–50 are BC only.');
    insert into questions values
      ('${Q48}','${ORG}', '{"source":"ap-calculus-abbc-limits-practice-exam","question_number":48,"bc_only":true}'),
      ('${Q49}','${ORG}', '{"source":"ap-calculus-abbc-limits-practice-exam","question_number":49,"bc_only":true}');
    insert into exams values
      ('${EXAM}','${ORG}','AP Examination','AP-LIM-2026',
       'AP Calculus AB/BC — Limits Practice Exam. 50 multiple-choice questions, one correct answer each. Questions 45–50 are for BC students only.',
       '{"track_selection":true,"access_mode":"shared_link","linked_class_ids":["${AP1_AB}","${AP2_AB}"],"track_policy":{"AB":"questions 1-44 (bc_only items excluded)","BC":"questions 1-50"}}',
       '${QUIZ}', null),
      ('${OTHER_EXAM}','${ORG}','Mental Math CE1','ABCDEFGH','desc','{"linked_class_ids":["${CE1}"]}',null,'${CE1}');
    insert into exams (id, organization_id, title, access_code, settings) values ('0a400000-0000-4000-8000-000000000998','${OTHER_ORG}','AP Examination','AP-LIM-2026','{}');
    insert into exam_attempts values ('${ATTEMPT}','${EXAM}','AB','["x","y"]','submitted',37);
  `);
}

const snapshot = (db, sql) => db.query(sql).then((r) => JSON.stringify(r.rows));
const ATTEMPT_SQL = `select id, exam_id, track, question_order, status, score from exam_attempts order by id`;
const OTHER_SQL = `select id, settings, description from exams where id in ('${OTHER_EXAM}','0a400000-0000-4000-8000-000000000998') order by id`;
const CLASS_SQL = `select name, curriculum_track from classes order by name`;

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`); };

const db = new PGlite();
try {
  await db.exec(SCHEMA);
  await seed(db);
  const attemptBefore = await snapshot(db, ATTEMPT_SQL);
  const otherBefore = await snapshot(db, OTHER_SQL);

  await check('migration applies to the existing AP Examination', async () => {
    await db.exec(migration);
  });

  await check('exactly the four AP classes get a course; CE1 stays unassigned', async () => {
    const rows = (await db.query(CLASS_SQL)).rows;
    assert.deepEqual(rows, [
      {name: 'AP1 (AB)', curriculum_track: 'AB'},
      {name: 'AP1 (BC)', curriculum_track: 'BC'},
      {name: 'AP2 (AB)', curriculum_track: 'AB'},
      {name: 'AP2 (BC)', curriculum_track: 'BC'},
      {name: 'CE1', curriculum_track: null},
    ]);
  });

  await check('all four classes are linked to the same existing exam (no copy)', async () => {
    const r = await db.query(`select count(*)::int as n from exams where title = 'AP Examination' and organization_id = '${ORG}'`);
    assert.equal(r.rows[0].n, 1);
    const e = (await db.query(`select id, access_code, class_id, settings from exams where id = '${EXAM}'`)).rows[0];
    assert.equal(e.access_code, 'AP-LIM-2026', 'access code unchanged');
    assert.equal(e.class_id, null, 'exam.class_id unchanged');
    assert.deepEqual(e.settings.linked_class_ids, [AP1_AB, AP1_BC, AP2_AB, AP2_BC]);
    assert.equal(e.settings.track_selection, true, 'track_selection preserved');
    assert.equal(e.settings.access_mode, 'shared_link', 'other settings preserved');
    assert.deepEqual(e.settings.track_policy, {AB: 'all questions except BC-only items 45, 46, 47, 49 and 50', BC: 'questions 1-50'});
  });

  await check('question 48 becomes common; 49 stays BC-only; review note is recorded', async () => {
    const q48 = (await db.query(`select config from questions where id = '${Q48}'`)).rows[0].config;
    assert.equal(q48.bc_only, false);
    assert.equal(q48.question_number, 48, 'other config preserved');
    assert.match(q48.curriculum_review, /L'Hopital/);
    const q49 = (await db.query(`select config from questions where id = '${Q49}'`)).rows[0].config;
    assert.equal(q49.bc_only, true);
    assert.equal(q49.curriculum_review, undefined);
  });

  await check('descriptions state the new BC-only range', async () => {
    const e = (await db.query(`select description from exams where id = '${EXAM}'`)).rows[0];
    assert.match(e.description, /Questions 45–47, 49 and 50 are for BC students only\./);
    const q = (await db.query(`select description from quizzes where id = '${QUIZ}'`)).rows[0];
    assert.match(q.description, /questions 45–47, 49 and 50 are BC only/);
  });

  await check('attempts, answers and results are not touched', async () => {
    assert.equal(await snapshot(db, ATTEMPT_SQL), attemptBefore);
  });

  await check('other exams, other organizations and their settings are untouched', async () => {
    const after = await snapshot(db, OTHER_SQL);
    assert.equal(after, otherBefore);
  });

  await check('re-running the migration is a no-op on the AP data', async () => {
    const before = await snapshot(db, `select * from exams where id = '${EXAM}' union all select * from exams where id = '${EXAM}'`);
    await db.exec(migration);
    const after = await snapshot(db, `select * from exams where id = '${EXAM}' union all select * from exams where id = '${EXAM}'`);
    assert.equal(after, before);
    assert.equal(await snapshot(db, ATTEMPT_SQL), attemptBefore);
    const q48 = (await db.query(`select config from questions where id = '${Q48}'`)).rows[0].config;
    assert.equal(q48.bc_only, false);
  });

  await check('a missing AP class aborts the migration without partial class writes', async () => {
    const fresh = new PGlite();
    try {
      await fresh.exec(SCHEMA);
      await seed(fresh);
      await fresh.exec(`delete from classes where id = '${AP2_BC}'`);
      await assert.rejects(() => fresh.exec(migration), /expected 4 matching class records, found 3/);
      // The script runs as one transaction: the column is rolled back with the failed step.
      const col = (await fresh.query(`select count(*)::int as n from information_schema.columns where table_name = 'classes' and column_name = 'curriculum_track'`)).rows[0];
      assert.equal(col.n, 0, 'the whole migration was rolled back (no partial schema change)');
      const names = (await fresh.query(`select count(*)::int as n from classes where name like 'AP%'`)).rows[0];
      assert.equal(names.n, 3, 'class rows are unchanged');
    } finally {
      await fresh.close();
    }
  });

  console.log(`\n${passed} AP class-track migration checks passed (actual SQL; isolated PGlite).`);
} finally {
  await db.close();
}
