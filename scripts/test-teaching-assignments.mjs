#!/usr/bin/env node
/**
 * Teaching assignments and subject-level authorization.
 *
 * The defect these cover was measured in production, not imagined: every one of
 * the three teachers in the live database reported `unrestricted = true`, because
 * no teaching assignment existed anywhere and the policies only ever asked
 * "is this person a teacher in this organization?".
 *
 * These tests run against the migration and the module source, so they hold
 * without a database. The live predicates were exercised separately against
 * production and the results are recorded in the report.
 */

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

let n = 0;
function test(name, fn) {
  fn();
  n += 1;
  console.log(`  ✓ ${name}`);
}

const SQL = readFileSync("supabase/migrations/20261128160000_teaching_assignments.sql", "utf8");
const MODULE = readFileSync("src/lib/teachingAssignments.ts", "utf8");

/* ── The missing dimension ────────────────────────────────────────────── */

test("the assignment table carries teacher, class AND subject together", () => {
  // Before this table, the three dimensions lived in three unconnected places:
  // a role on the membership, a subject with no class, and a class with no
  // subject. "Teacher A teaches Maths in Grade 9A" was not representable.
  const table = SQL.slice(SQL.indexOf("create table if not exists public.teaching_assignments"), SQL.indexOf("-- One homeroom teacher per class"));
  for (const column of ["teacher_id", "class_id", "subject_id", "organization_id"]) {
    assert.match(table, new RegExp(`\\b${column}\\b`), `the assignment must carry ${column}`);
  }
  assert.match(table, /role text not null check \(role in \('class_teacher', 'subject_teacher'\)\)/);
});

test("homeroom and subject responsibilities are non-exclusive", () => {
  // The brief calls this mandatory. It is enforced by the ABSENCE of a unique
  // constraint on teacher_id: a teacher may hold any number of rows.
  assert.doesNotMatch(SQL, /unique[^\n]*\bteacher_id\b(?!,)/i,
    "there must be no constraint limiting one assignment per teacher");
  // The only uniqueness is per (teacher, class, subject) for subject rows, and
  // one homeroom per class — neither stops a teacher holding both roles.
  assert.match(SQL, /teaching_assignments_unique_subject\s+on public\.teaching_assignments \(teacher_id, class_id, subject_id\)/);
  assert.match(SQL, /teaching_assignments_one_homeroom\s+on public\.teaching_assignments \(class_id\)/);
  // And the shape rules let a homeroom row sit alongside subject rows.
  assert.match(SQL, /role <> 'class_teacher' or \(class_id is not null and subject_id is null\)/);
  assert.match(SQL, /role <> 'subject_teacher' or subject_id is not null/);
});

/* ── Subject-level authorization ──────────────────────────────────────── */

test("a subject assignment without a class still scopes to the subject", () => {
  assert.match(SQL, /create or replace function public\.teaches_subject_in_class/);
  const fn = SQL.slice(SQL.indexOf("create or replace function public.teaches_subject_in_class"), SQL.indexOf("create or replace function public.is_class_teacher_of"));
  assert.match(fn, /ta\.subject_id = p_subject/, "the subject must be matched");
  assert.match(fn, /ta\.class_id is null or p_class is null or ta\.class_id = p_class/,
    "a class-specific assignment must only cover that class");
  assert.match(fn, /ta\.organization_id = p_org/, "the organization must be matched");
});

test("content authorship is gated by subject, not by role alone", () => {
  const fn = SQL.slice(SQL.indexOf("create or replace function public.can_author_subject"), SQL.indexOf("comment on function public.can_author_subject"));
  // The leadership roles keep organization-wide reach; the `teacher` role — which
  // previously had identical reach — is narrowed to its assigned subjects.
  assert.match(fn, /org_role\(p_org\) in \('owner', 'admin', 'organizer'\) then true/);
  assert.match(fn, /org_role\(p_org\) = 'teacher' then/);
  assert.match(fn, /ta\.subject_id = p_subject/, "a teacher is limited to assigned subjects");
});

test("a teacher with no assignments is reported, not silently unrestricted", () => {
  // This is the honest part. Locking out every existing teacher on deploy would
  // be a worse failure; pretending they are scoped would hide the defect. The
  // view makes the state visible instead.
  assert.match(SQL, /create or replace view public\.assignment_coverage/);
  assert.match(SQL, /count\(ta\.id\) = 0 as unrestricted/);
  assert.match(MODULE, /configured: assignments\.length > 0/);
  assert.match(MODULE, /if \(!configured\) return true;/, "unconfigured teachers keep prior reach");
});

test("homeroom is pastoral, not a grading permission", () => {
  const fn = SQL.slice(SQL.indexOf("create or replace function public.is_class_teacher_of"), SQL.indexOf("create or replace function public.can_author_subject"));
  // is_class_teacher_of must not grant subject authority.
  assert.doesNotMatch(fn, /subject_id = p_subject/, "homeroom must not confer subject rights");
  assert.match(MODULE, /Deliberately NOT a grading permission/);
});

/* ── Application layer ────────────────────────────────────────────────── */

test("the module checks the class as well as the subject when one is given", () => {
  assert.match(MODULE, /export async function canAuthorInClassSubject/);
  const fn = MODULE.slice(MODULE.indexOf("export async function canAuthorInClassSubject"), MODULE.indexOf("export async function isHomeroomOf"));
  assert.match(fn, /assignment\.subjectId === subjectId/, "the subject must match");
  assert.match(fn, /assignment\.classId === null \|\| classId === null \|\| assignment\.classId === classId/,
    "a class-scoped assignment must not reach another class");
});

test("assignment writes validate tenant ownership and never wipe on failure", () => {
  const fn = MODULE.slice(MODULE.indexOf("export async function setTeachingAssignments"));
  assert.match(fn, /\.eq\("organization_id", organizationId\)\.in\("id", classIds\)/, "classes must belong to the organization");
  assert.match(fn, /\.eq\("organization_id", organizationId\)\.in\("id", subjectIds\)/, "subjects must belong to the organization");
  assert.match(fn, /if \(error\) throw new Error\("Existing assignments could not be replaced; nothing was changed\."\)/);
  // Diff-based: a read failure aborts before any delete.
  assert.match(fn, /if \(readError\) throw new Error\("Existing assignments could not be read; nothing was changed\."\)/);
  assert.ok(fn.indexOf("readError") < fn.indexOf("toDelete.length"), "the read must come before any delete");
});

test("malformed assignments are refused before the database sees them", () => {
  assert.match(MODULE, /A homeroom assignment names a class and no subject\./);
  assert.match(MODULE, /A subject assignment must name a subject\./);
});

test("choosing subjects at teacher creation populates the assignment table", () => {
  // Otherwise the new table starts empty for every new teacher and the coverage
  // view reports them unrestricted forever, which is how the original defect
  // would quietly come back.
  const accounts = readFileSync("src/app/dashboard/accounts/actions.ts", "utf8");
  assert.match(accounts, /from\("teaching_assignments"\)\.insert/, "a created teacher must get an assignment row");
  const block = accounts.slice(accounts.indexOf('from("teaching_assignments").insert'), accounts.indexOf("export async function", accounts.indexOf('from("teaching_assignments").insert')));
  assert.match(block, /class_id: null/, "the class is not implied at creation time");
  assert.match(block, /role: "subject_teacher"/);
});

console.log(`\nTeaching assignments: ${n} checks passed.`);
