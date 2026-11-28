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

/* ── The database policies themselves ─────────────────────────────────── */

const POLICIES = readFileSync("supabase/migrations/20261128170000_subject_scoped_content_policies.sql", "utf8");

test("every write policy on questions and exams is subject-scoped", () => {
  // The defect was unauthorised MODIFICATION, and it lived in the policies:
  // can_create_content(organization_id) takes an organization and nothing else,
  // so it cannot distinguish a Physics teacher from the Literature teacher.
  for (const policy of ["q_insert", "q_update", "q_delete", "exam_insert", "exam_update", "exam_delete"]) {
    const at = POLICIES.indexOf(`policy ${policy} on`);
    assert.ok(at > 0, `${policy} must be redefined`);
    const block = POLICIES.slice(at, POLICIES.indexOf(";", at));
    assert.match(block, /can_author_subject\(organization_id, subject_id\)/, `${policy} must check the subject`);
    assert.doesNotMatch(block, /can_create_content/, `${policy} must no longer use the org-only predicate`);
  }
});

test("UPDATE checks the new row as well as the old one", () => {
  // USING alone would let a teacher take a question they may edit and MOVE it into
  // a subject they may not touch: the old row passes, the new row is never
  // examined. WITH CHECK is the clause that stops that.
  const at = POLICIES.indexOf("policy q_update on");
  const block = POLICIES.slice(at, POLICIES.indexOf(";", at));
  assert.match(block, /using \(/, "q_update needs a USING clause");
  assert.match(block, /with check \(/, "q_update needs a WITH CHECK clause");
  const examAt = POLICIES.indexOf("policy exam_update on");
  const examBlock = POLICIES.slice(examAt, POLICIES.indexOf(";", examAt));
  assert.match(examBlock, /using \(/);
  assert.match(examBlock, /with check \(/);
});

test("homeroom status earns nothing on content", () => {
  // can_author_subject must not consult class_teacher rows at all.
  const at = SQL.indexOf("create or replace function public.can_author_subject");
  const fn = SQL.slice(at, SQL.indexOf("comment on function public.can_author_subject"));
  assert.doesNotMatch(fn, /is_class_teacher_of/, "homeroom must not widen content authorship");
  assert.match(fn, /ta\.role = 'subject_teacher'/, "only subject responsibilities count");
});

test("the migration is additive and cannot destroy existing content authority", () => {
  // 558 of 2,492 questions have a NULL subject and there were zero teaching
  // assignments in production. A policy that treated either as "denied" would
  // lock every teacher out of every existing question on deploy.
  assert.match(POLICIES, /add column if not exists subject_id/, "the new column must be additive");
  assert.match(POLICIES, /can_author_subject treats NULL as unrestricted/);
  assert.doesNotMatch(POLICIES, /delete from public\.questions/i);
  assert.doesNotMatch(POLICIES, /update public\.questions/i);
  assert.doesNotMatch(POLICIES, /drop table/i);
});


/* ── Marks are scoped too, not just content ───────────────────────────── */

const MARKS = readFileSync("supabase/migrations/20261128200000_subject_scoped_marks_policies.sql", "utf8");

test("the marking tables no longer accept any teacher in the school", () => {
  // The defect measured in production: eans_update and ea_update were pure
  // org_role(), so a Mathematics teacher could rewrite a Literature exam's marks.
  for (const [table, policy] of [
    ["exam_answers", "eans_update"],
    ["exam_attempts", "ea_update"],
    ["answer_rubric_scores", "ars_all"],
  ]) {
    const at = MARKS.indexOf(`create policy ${policy} on public.${table}`);
    assert.ok(at > 0, `${policy} must be recreated`);
    const block = MARKS.slice(at, MARKS.indexOf(";\n", at));
    assert.match(block, /can_author_exam_result/, `${policy} must ask the subject predicate`);
    assert.doesNotMatch(block, /org_role\(/, `${policy} must not fall back to the org-wide role`);
  }
});

test("a marking policy keeps USING and WITH CHECK paired", () => {
  // USING alone lets a caller take marks they may edit and move them to another
  // examination's attempt: the old row passes, the new one is never examined.
  for (const policy of ["eans_update", "ea_update", "ars_all"]) {
    const at = MARKS.indexOf(`create policy ${policy}`);
    const block = MARKS.slice(at, MARKS.indexOf(";\n", at));
    assert.match(block, /using \(/, `${policy} needs USING`);
    assert.match(block, /with check \(/, `${policy} needs WITH CHECK`);
  }
});

test("an examination from another organization is refused, not grandfathered", () => {
  // Found by probing production: the first version answered TRUE for a real
  // Demo Academy examination asked about under Oak's organization id, because
  // the "no subject" arm matched the absence of a row rather than a row with no
  // subject. A predicate that answers "allowed" about another tenant is a
  // landmine even when the policy never asks that way.
  const at = MARKS.indexOf("when not exists (\n      select 1\n        from public.exams e\n       where e.id = p_exam");
  assert.ok(at > 0, "the tenant branch must exist");
  assert.match(MARKS.slice(at, at + 400), /then false/, "a foreign examination must be denied");
});

test("grandfathering survives, or every current teacher would lose their marking", () => {
  assert.match(MARKS, /not exists \(\s*\n\s*select 1\s*\n\s*from public.teaching_assignments/);
  // The SQL arm, not the comment beside it.
  assert.match(MARKS, /join public\.subjects s on s\.id = e\.subject_id[\s\S]{0,200}then true/);
});

test("leadership and correctors keep their existing reach", () => {
  assert.match(MARKS, /role in \('owner', 'admin', 'organizer', 'corrector'\)/);
});

test("the predicate is definer and search_path-pinned", () => {
  assert.match(MARKS, /security definer/);
  assert.match(MARKS, /set search_path to 'public', 'pg_temp'/);
});

test("the migration is additive where it cannot be, and says so", () => {
  // assessment_contribution_scores has only a SELECT policy; inventing a write
  // policy would GRANT an ability that does not exist in the name of tightening.
  assert.match(MARKS, /acs_staff_select/);
  assert.match(MARKS, /deliberately unchanged/);
  assert.doesNotMatch(MARKS, /delete from public\.exam_answers/i);
});


test("the marking action enforces class+subject in the application, not only the policy", () => {
  // A policy cannot express "assigned to this subject IN THIS CLASS" without a
  // join, and a screen that only fails at the UPDATE gives the marker a form to
  // fill and a silent no-op. The action must refuse with a reason.
  const ACTIONS = readFileSync("src/app/dashboard/exams/actions.ts", "utf8");
  assert.match(ACTIONS, /canAuthorInClassSubject\(supabase, org\.id, ctx\.user\.id, classId, subjectId\)/);
  assert.match(ACTIONS, /fail\("subject_scope"\)/);
  const PAGE = readFileSync("src/app/dashboard/exams/[id]/page.tsx", "utf8");
  assert.match(PAGE, /subject_scope:/, "the refusal must reach the person who tried");
  assert.match(PAGE, /not yours to change/);
});

test("the application predicate is the one the module documents, not a second copy", () => {
  const MODULE = readFileSync("src/lib/teachingAssignments.ts", "utf8");
  const ACTIONS = readFileSync("src/app/dashboard/exams/actions.ts", "utf8");
  assert.match(MODULE, /export async function canAuthorInClassSubject/);
  assert.match(ACTIONS, /import \{ canAuthorInClassSubject \}/);
});

console.log(`\nTeaching assignments: ${n} checks passed.`);
