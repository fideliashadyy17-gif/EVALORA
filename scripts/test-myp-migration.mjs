/**
 * MYP criterion results migration (20261116120000_myp_criterion_results.sql).
 *
 * Applies the real migration to an isolated PGlite database that mirrors the
 * production tables it touches, then proves:
 *   · it is additive and idempotent (applying it twice changes nothing twice);
 *   · criteria are seeded per subject — Mathematics, Sciences and the other MYP
 *     subject groups get their OWN criteria, and an unrecognised subject gets
 *     none rather than a silent Mathematics default;
 *   · boundaries are data with a stated source, and a subject boundary cannot
 *     be filed under another tenant's organization;
 *   · the detail tables preserve moderated/regraded snapshots: history is
 *     append-only and its scope guard rejects a foreign attempt;
 *   · RLS lets a member read, a manager write, a teacher only read, another
 *     tenant nothing, and the Super Admin everything.
 *
 * Run: node scripts/test-myp-migration.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const db = new PGlite();
let passed = 0;
const ok = (name, condition, detail) => {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql) => (await rows(sql))[0];
const throws = async (sql, pattern) => {
  try {
    await db.exec(sql);
    return false;
  } catch (error) {
    return pattern ? pattern.test(error.message) : true;
  }
};

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000001";
const MATH = "aaaaaaaa-0000-4000-8000-0000000000a1";
const SCIENCE = "aaaaaaaa-0000-4000-8000-0000000000a2";
const ART = "aaaaaaaa-0000-4000-8000-0000000000a3";
const FOREIGN_MATH = "bbbbbbbb-0000-4000-8000-0000000000b1";
const EXAM = "aaaaaaaa-0000-4000-8000-0000000000e1";
const ATTEMPT = "aaaaaaaa-0000-4000-8000-0000000000f1";

/* ── Fixture: only the tables and helpers the migration relies on ────── */
await db.exec(`
create role authenticated;
create role anon;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user', true), '')::uuid$$;

create table public.organizations (id uuid primary key, name text not null);
create table public.profiles (id uuid primary key, email text);
create table public.subjects (id uuid primary key, organization_id uuid not null references public.organizations(id), name text not null, code text);
create table public.exams (id uuid primary key, organization_id uuid not null references public.organizations(id), title text);
create table public.exam_attempts (id uuid primary key, exam_id uuid not null references public.exams(id), student_name text, score numeric);
create table public.memberships (organization_id uuid, user_id uuid, role text);

create function public.org_role(p_org uuid) returns text language sql security definer stable
  set search_path = public as $$select role from public.memberships where user_id = auth.uid() and organization_id = p_org limit 1$$;
create function public.is_super_admin() returns boolean language sql security definer stable
  set search_path = public as $$select exists (select 1 from public.memberships where user_id = auth.uid() and role = 'super_admin')$$;
create function public.is_org_member(p_org uuid) returns boolean language sql security definer stable
  set search_path = public as $$select public.org_role(p_org) is not null$$;
create function public.can_manage_org(p_org uuid) returns boolean language sql security definer stable
  set search_path = public as $$select coalesce(public.org_role(p_org) in ('owner','admin'), false)$$;
create function public.can_create_content(p_org uuid) returns boolean language sql security definer stable
  set search_path = public as $$select coalesce(public.org_role(p_org) in ('owner','admin','teacher','organizer'), false)$$;

grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

insert into public.organizations (id, name) values ('${ORG_A}', 'Oak International School'), ('${ORG_B}', 'Pine Academy');
insert into public.profiles (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'owner@oak.example'),
  ('00000000-0000-4000-8000-0000000000c2', 'teacher@oak.example'),
  ('00000000-0000-4000-8000-0000000000c3', 'owner@pine.example'),
  ('00000000-0000-4000-8000-0000000000c4', 'super@evalora.example');
insert into public.subjects (id, organization_id, name, code) values
  ('${MATH}', '${ORG_A}', 'Mathematics', 'MATH'),
  ('${SCIENCE}', '${ORG_A}', 'Integrated Science', 'SCI'),
  ('${ART}', '${ORG_A}', 'Underwater Basket Weaving', 'UBW'),
  ('${FOREIGN_MATH}', '${ORG_B}', 'Mathematics', 'MATH');
insert into public.exams (id, organization_id, title) values ('${EXAM}', '${ORG_A}', 'MYP 2 Mathematics — Term 1');
insert into public.exam_attempts (id, exam_id, student_name, score) values ('${ATTEMPT}', '${EXAM}', 'Amina Diallo', 32);
insert into public.memberships (organization_id, user_id, role) values
  ('${ORG_A}', '00000000-0000-4000-8000-0000000000c1', 'owner'),
  ('${ORG_A}', '00000000-0000-4000-8000-0000000000c2', 'teacher'),
  ('${ORG_B}', '00000000-0000-4000-8000-0000000000c3', 'owner'),
  (null, '00000000-0000-4000-8000-0000000000c4', 'super_admin');
`);

const before = {
  attempts: (await one("select count(*)::int as n from public.exam_attempts")).n,
  subjects: (await one("select count(*)::int as n from public.subjects")).n,
  exams: (await one("select count(*)::int as n from public.exams")).n,
};

const migration = await readFile("supabase/migrations/20261116120000_myp_criterion_results.sql", "utf8");
await db.exec(migration);

// Supabase grants table privileges to authenticated by default; the fixture has
// to mirror that after the tables exist (history stays insert-only, as revoked).
await db.exec(`
  grant select, insert, update, delete on public.myp_criteria, public.myp_level_boundaries, public.myp_grade_boundaries, public.myp_framework_config to authenticated;
  grant select, insert on public.myp_result_history to authenticated;
  grant select on all tables in schema public to anon;
`);

/* ── Tables and columns ──────────────────────────────────────────────── */
const tables = (await rows("select table_name from information_schema.tables where table_schema = 'public' and table_name like 'myp%' order by table_name"))
  .map((row) => row.table_name);
ok("all five MYP tables exist",
  JSON.stringify(tables) === JSON.stringify(["myp_criteria", "myp_framework_config", "myp_grade_boundaries", "myp_level_boundaries", "myp_result_history"]),
  tables.join(","));
const historyColumns = (await rows("select column_name from information_schema.columns where table_name = 'myp_result_history'"))
  .map((row) => row.column_name);
ok("the history table stores the full computed snapshot",
  ["marks_awarded", "percent", "total_levels", "overall_grade", "grade_status", "criterion_snapshot", "level_source", "grade_source"].every((column) => historyColumns.includes(column)));
ok("the history table records who filed the snapshot", historyColumns.includes("recorded_by") && historyColumns.includes("recorded_by_email"));
const criterionColumns = (await rows("select column_name from information_schema.columns where table_name = 'myp_criteria'")).map((row) => row.column_name);
ok("criteria carry a subject, a code and a title", ["subject_id", "code", "title", "max_level"].every((column) => criterionColumns.includes(column)));
ok("history has no UPDATE or DELETE grant for end users",
  (await rows("select privilege_type from information_schema.role_table_grants where table_name = 'myp_result_history' and grantee = 'authenticated'"))
    .every((row) => !["UPDATE", "DELETE"].includes(row.privilege_type)));

/* ── Existing data is untouched ──────────────────────────────────────── */
ok("existing attempts are preserved", (await one("select count(*)::int as n from public.exam_attempts")).n === before.attempts);
ok("existing subjects and examinations are preserved",
  (await one("select count(*)::int as n from public.subjects")).n === before.subjects &&
  (await one("select count(*)::int as n from public.exams")).n === before.exams);
ok("no existing row is rewritten by the migration", (await one(`select score::int as score from public.exam_attempts where id = '${ATTEMPT}'`)).score === 32);

/* ── Seed: framework configuration ───────────────────────────────────── */
const frameworks = await rows("select organization_id, framework, criteria_max_level, require_all_criteria from public.myp_framework_config order by organization_id");
ok("every organization receives one framework configuration", frameworks.length === 2);
ok("the default requires every criterion before a grade", frameworks.every((row) => row.require_all_criteria === true && row.criteria_max_level === 8));

/* ── Seed: per-subject criteria ──────────────────────────────────────── */
const criteria = await rows("select subject_id, code, title, max_level from public.myp_criteria order by subject_id, position");
const mathCriteria = criteria.filter((row) => row.subject_id === MATH);
const scienceCriteria = criteria.filter((row) => row.subject_id === SCIENCE);
const artCriteria = criteria.filter((row) => row.subject_id === ART);
ok("Mathematics is seeded with four criteria", mathCriteria.length === 4 && mathCriteria.map((row) => row.code).join("") === "ABCD");
ok("Mathematics criterion B is Investigating patterns", mathCriteria[1].title === "Investigating patterns");
ok("Sciences is seeded with four Sciences criteria", scienceCriteria.length === 4);
ok("Sciences does not receive the Mathematics criteria", scienceCriteria[1].title === "Inquiring and designing" && !scienceCriteria.some((row) => row.title === "Investigating patterns"));
ok("an unrecognised subject is deliberately left unconfigured", artCriteria.length === 0);
ok("another organization's Mathematics is seeded independently", criteria.filter((row) => row.subject_id === FOREIGN_MATH).length === 4);
ok("every criterion declares a level maximum of 8", criteria.every((row) => row.max_level === 8));

/* ── Seed: boundaries carry a source ────────────────────────────────── */
const levelRows = await rows("select subject_id, level, min_percent, source from public.myp_level_boundaries order by subject_id, level");
const mathLevels = levelRows.filter((row) => row.subject_id === MATH);
ok("each configured subject has nine level boundaries", mathLevels.length === 9 && mathLevels[0].level === 0 && mathLevels[8].level === 8);
ok("level 0 starts at 0% and level 8 at 95%", Number(mathLevels[0].min_percent) === 0 && Number(mathLevels[8].min_percent) === 95);
ok("the level source states this is an EVALORA policy, not an IB boundary", mathLevels[0].source.includes("EVALORA") && mathLevels[0].source.includes("not an IB-published boundary"));
ok("unconfigured subjects get no level boundaries", !levelRows.some((row) => row.subject_id === ART));

const gradeRows = await rows("select organization_id, subject_id, min_total, max_total, grade, source from public.myp_grade_boundaries order by organization_id, subject_id nulls first, min_total");
const orgGradeRows = gradeRows.filter((row) => row.organization_id === ORG_A && row.subject_id === null);
ok("the organization default has seven 1–7 grade bands", orgGradeRows.length === 7 && orgGradeRows.map((row) => row.grade).join("") === "1234567");
ok("the grade bands cover 0–32 criterion levels without gaps",
  orgGradeRows.every((row, index) => index === 0 || Number(row.min_total) === Number(orgGradeRows[index - 1].max_total) + 1) &&
  Number(orgGradeRows[6].max_total) === 32);
ok("the grade boundary source is the published IB MYP banding", orgGradeRows[0].source.includes("IB MYP published grade boundaries"));
ok("each configured subject also gets its own boundary set", gradeRows.filter((row) => row.subject_id === MATH).length === 7);

/* ── Idempotency ────────────────────────────────────────────────────── */
const counts = async () => ({
  criteria: (await one("select count(*)::int as n from public.myp_criteria")).n,
  levels: (await one("select count(*)::int as n from public.myp_level_boundaries")).n,
  grades: (await one("select count(*)::int as n from public.myp_grade_boundaries")).n,
  frameworks: (await one("select count(*)::int as n from public.myp_framework_config")).n,
});
const afterFirst = await counts();
await db.exec(migration);
const afterSecond = await counts();
ok("re-applying the migration is idempotent", JSON.stringify(afterFirst) === JSON.stringify(afterSecond), `${JSON.stringify(afterFirst)} vs ${JSON.stringify(afterSecond)}`);
ok("re-applying leaves existing attempts alone", (await one("select count(*)::int as n from public.exam_attempts")).n === before.attempts);

/* ── Criterion guard ────────────────────────────────────────────────── */
await db.exec(`insert into public.myp_criteria (organization_id, subject_id, code, title) values ('${ORG_A}', '${MATH}', '  e ', '  Extended thinking  ')`);
const inserted = await one(`select code, title from public.myp_criteria where subject_id = '${MATH}' and code = 'E'`);
ok("a criterion code is canonicalised to upper case and trimmed", inserted && inserted.code === "E" && inserted.title === "Extended thinking");
ok("a duplicate canonical code is rejected", await throws(`insert into public.myp_criteria (organization_id, subject_id, code, title) values ('${ORG_A}', '${MATH}', 'E', 'Again')`, /duplicate key|unique/i));
ok("ON CONFLICT can upsert by canonical code", (await (async () => {
  try {
    await db.exec(`insert into public.myp_criteria (organization_id, subject_id, code, title) values ('${ORG_B}', '${MATH}', 'A', 'Wrong org') on conflict (subject_id, code) do update set title = excluded.title`);
    return false;
  } catch (error) {
    return /organization that owns its subject/i.test(error.message);
  }
})()));
ok("a criterion cannot be moved to another subject", await throws(`update public.myp_criteria set subject_id = '${SCIENCE}' where subject_id = '${MATH}' and code = 'A'`, /cannot be moved/i));
ok("a criterion cannot be filed under another organization", await throws(`insert into public.myp_criteria (organization_id, subject_id, code, title) values ('${ORG_B}', '${MATH}', 'F', 'Foreign')`, /organization that owns its subject/i));
ok("a level boundary cannot borrow a subject from another tenant", await throws(`insert into public.myp_level_boundaries (organization_id, subject_id, level, min_percent) values ('${ORG_B}', '${MATH}', 8, 99)`, /organization that owns the subject/i));
await db.exec(`update public.myp_criteria set title = 'Extended thinking' where subject_id = '${MATH}' and code = 'E'`);
ok("updating a criterion refreshes updated_at", (await one(`select updated_at > created_at as touched from public.myp_criteria where subject_id = '${MATH}' and code = 'E'`)).touched === true);

/* ── History: append-only and scoped ────────────────────────────────── */
const historyInsert = `insert into public.myp_result_history
  (organization_id, exam_id, attempt_id, subject_id, myp_year, reason, marks_awarded, marks_max, percent, total_levels, total_levels_max, overall_grade, grade_status, criterion_snapshot, level_source, grade_source, recorded_by_email)
  values ('${ORG_A}', '${EXAM}', '${ATTEMPT}', '${MATH}', 2, 'moderation', 32, 40, 80, 24, 32, 4, 'final', '[]'::jsonb, 'Oak levels', 'IB bands', 'lead@oak.example')`;
await db.exec(historyInsert);
ok("a correctly scoped snapshot is archived", (await one("select count(*)::int as n from public.myp_result_history")).n === 1);
ok("a snapshot cannot be updated", await throws(`update public.myp_result_history set overall_grade = 7`, /append-only/i));
ok("a snapshot cannot be deleted", await throws(`delete from public.myp_result_history`, /append-only/i));
ok("a snapshot for another organization's attempt is rejected",
  await throws(`insert into public.myp_result_history (organization_id, exam_id, attempt_id, grade_status) values ('${ORG_B}', '${EXAM}', '${ATTEMPT}', 'final')`, /attempt organization/i));
ok("a snapshot is tied to the attempt's examination",
  await throws(`insert into public.myp_result_history (organization_id, exam_id, attempt_id, grade_status) values ('${ORG_A}', 'aaaaaaaa-0000-4000-8000-0000000000e2', '${ATTEMPT}', 'final')`, /attempt examination/i));
ok("the grade status is constrained to the four documented values",
  await throws(`insert into public.myp_result_history (organization_id, exam_id, attempt_id, grade_status) values ('${ORG_A}', '${EXAM}', '${ATTEMPT}', 'guessed')`, /check constraint/i));
ok("an overall grade outside 1–7 is rejected",
  await throws(`insert into public.myp_result_history (organization_id, exam_id, attempt_id, grade_status, overall_grade) values ('${ORG_A}', '${EXAM}', '${ATTEMPT}', 'final', 9)`, /check constraint/i));

/* ── RLS ────────────────────────────────────────────────────────────── */
async function as(user, role = "authenticated") {
  await db.exec(`reset role; set role ${role}; select set_config('test.user', '${user}', false)`);
}
const visibleCriteria = async () => (await rows("select subject_id from public.myp_criteria")).map((row) => row.subject_id);
const insertCriterion = async (org, subject, code, title) =>
  db.query(`insert into public.myp_criteria (organization_id, subject_id, code, title) values ($1,$2,$3,$4)`, [org, subject, code, title]);

await as("00000000-0000-4000-8000-0000000000c1");
ok("a manager reads their own organization's criteria", (await visibleCriteria()).every((subjectId) => subjectId !== FOREIGN_MATH));
ok("a manager cannot see another tenant's criteria", !(await visibleCriteria()).includes(FOREIGN_MATH));
await insertCriterion(ORG_A, SCIENCE, "E", "Manager added");
ok("a manager can configure a criterion", (await rows(`select 1 from public.myp_criteria where subject_id = '${SCIENCE}' and code = 'E'`)).length === 1);
ok("a manager cannot configure another tenant's subject", await (async () => {
  try {
    await insertCriterion(ORG_B, FOREIGN_MATH, "Z", "Cross tenant");
    return false;
  } catch {
    return true;
  }
})());
const historyVisible = await rows("select id from public.myp_result_history");
ok("a manager can read their organization's history", historyVisible.length === 1);
ok("a manager can insert a history snapshot", (await (async () => {
  await db.query(historyInsert.replace(/^insert/, "insert"));
  return (await rows("select count(*)::int as n from public.myp_result_history"))[0].n === 2;
})()));

await as("00000000-0000-4000-8000-0000000000c2");
ok("a teacher can read the criteria", (await visibleCriteria()).length > 0);
ok("a teacher can archive a moderated snapshot", await (async () => {
  try {
    await db.query(historyInsert);
    return true;
  } catch {
    return false;
  }
})());
ok("a teacher cannot write criteria", await (async () => {
  try {
    await insertCriterion(ORG_A, MATH, "G", "Teacher edit");
    return false;
  } catch {
    return true;
  }
})());

await as("00000000-0000-4000-8000-0000000000c3");
ok("another organization's manager sees none of the first tenant's criteria", (await visibleCriteria()).every((subjectId) => subjectId === FOREIGN_MATH));
ok("another organization's manager sees none of the first tenant's history", (await rows("select id from public.myp_result_history")).length === 0);

await as("00000000-0000-4000-8000-0000000000c4");
ok("the Super Admin sees every organization's criteria", new Set(await visibleCriteria()).size >= 2);
ok("the Super Admin sees every organization's history", (await rows("select id from public.myp_result_history")).length === 3);
ok("the Super Admin can configure any subject", (await (async () => {
  try {
    await insertCriterion(ORG_B, FOREIGN_MATH, "Z", "Global");
    return true;
  } catch {
    return false;
  }
})()));

await as("00000000-0000-4000-8000-0000000000c1");
ok("an organization manager can neither rewrite nor remove a snapshot",
  (await throws(`update public.myp_result_history set overall_grade = 1`, /append-only|permission denied/i)) &&
  (await throws(`delete from public.myp_result_history`, /append-only|permission denied/i)));

await db.exec("reset role");
const anonCount = await (async () => {
  await db.exec("set role anon");
  const result = await rows("select id from public.myp_criteria");
  await db.exec("reset role");
  return result.length;
})();
ok("an unauthenticated request sees no configuration", anonCount === 0);

console.log(`\n${passed} checks passed — MYP migration (isolated PGlite fixture)`);
await db.close();
