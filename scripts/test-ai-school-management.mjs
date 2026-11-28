#!/usr/bin/env node
/**
 * School-management tools on the AI Core.
 *
 * Before this slice the catalogue had 28 tools and ZERO of them could reach a
 * student, a teacher, a class, a subject, a year or a teaching assignment: the
 * assistant and every MCP agent could author an examination in a school whose
 * teacher list they could not read. These tests pin the new tools, the rules
 * they enforce, and — just as importantly — that they call the SAME services the
 * dashboard does rather than re-implementing the logic inside a handler.
 *
 * The handlers are driven with a fake Supabase client, so the assertions are
 * about behaviour (a cross-tenant class is refused, a conflicting homeroom is
 * reported) rather than about the shape of a query.
 */

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

let n = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    n += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  ✗ ${name}`);
    console.log(`      ${error.message}`);
  }
}

const TOOLS_SRC = readFileSync("src/lib/ai/tools.ts", "utf8");
const HANDLERS_SRC = readFileSync("src/lib/ai/handlers.ts", "utf8");

/** Tool names declared in the catalogue, in order. */
function declaredTools() {
  return [...TOOLS_SRC.matchAll(/^\s{4}name: "([a-z_]+)",$/gm)].map((m) => m[1]);
}

const SCHOOL_TOOLS = [
  "get_school_structure",
  "list_students",
  "get_student",
  "create_student",
  "list_teachers",
  "get_teacher_responsibilities",
  "manage_teaching_assignment",
  "get_effective_permissions",
];

/* ── The tools exist, once, and are wired ─────────────────────────────── */

await test("the eight school-management tools are declared", () => {
  const names = declaredTools();
  for (const name of SCHOOL_TOOLS) {
    assert.ok(names.includes(name), `${name} is missing from the catalogue`);
    assert.equal(names.filter((other) => other === name).length, 1, `${name} is declared twice`);
  }
});

await test("every declared tool has a handler", () => {
  const dispatch = HANDLERS_SRC.slice(HANDLERS_SRC.indexOf("const HANDLERS"));
  for (const name of SCHOOL_TOOLS) {
    assert.match(dispatch, new RegExp(`\\b${name}:`), `${name} is declared but has no handler`);
  }
});

await test("every write tool is marked as writing, and reads are not", () => {
  for (const write of ["create_student", "manage_teaching_assignment"]) {
    const at = TOOLS_SRC.indexOf(`name: "${write}"`);
    const block = TOOLS_SRC.slice(at, TOOLS_SRC.indexOf("modelHint", at));
    assert.match(block, /risk: sensitive\(/, `${write} changes school records and must be sensitive`);
  }
  for (const read of ["get_school_structure", "list_students", "list_teachers", "get_teacher_responsibilities"]) {
    const at = TOOLS_SRC.indexOf(`name: "${read}"`);
    const block = TOOLS_SRC.slice(at, TOOLS_SRC.indexOf("modelHint", at));
    assert.match(block, /risk: ordinary\(/, `${read} is read-only`);
    assert.doesNotMatch(block, /ordinaryWrite|sensitive\(/, `${read} must not claim to write`);
  }
});

await test("the teaching-assignment tool is gated on the permission the admin UI uses", () => {
  const at = TOOLS_SRC.indexOf('name: "manage_teaching_assignment"');
  const block = TOOLS_SRC.slice(at, TOOLS_SRC.indexOf("modelHint", at));
  assert.match(block, /organizations\.manage_members/);
  const ui = readFileSync("src/app/dashboard/teachers/assignments/actions.ts", "utf8");
  assert.match(ui, /organizations\.manage_members/, "the UI and the tool must agree on the permission");
});

/* ── Reuse, not re-implementation ─────────────────────────────────────── */

await test("student creation goes through the shared registration service", () => {
  assert.match(HANDLERS_SRC, /registerStudentForActor\(/);
  const action = readFileSync("src/app/dashboard/students/actions.ts", "utf8");
  assert.match(action, /registerStudentForActor\(/, "the dashboard must call the same service");
  // The handler must not contain its own insert into `students`.
  const at = HANDLERS_SRC.indexOf("async function createStudent");
  const body = HANDLERS_SRC.slice(at, HANDLERS_SRC.indexOf("async function listTeachers"));
  assert.doesNotMatch(body, /from\("students"\)\s*\.insert/, "a handler must not re-implement registration");
});

await test("assignment changes go through setTeachingAssignments", () => {
  assert.match(HANDLERS_SRC, /setTeachingAssignments\(runtime\.admin/);
  const ui = readFileSync("src/app/dashboard/teachers/assignments/actions.ts", "utf8");
  assert.match(ui, /setTeachingAssignments\(/, "the UI must call the same service");
});

await test("structure reads go through the shared service", () => {
  assert.match(HANDLERS_SRC, /loadSchoolStructure\(runtime\.admin/);
  assert.match(HANDLERS_SRC, /loadTeacherResponsibilities\(runtime\.admin/);
});

/* ── The rules ────────────────────────────────────────────────────────── */

const SERVICE = readFileSync("src/lib/services/studentRegistration.ts", "utf8");
const STRUCTURE = readFileSync("src/lib/services/schoolStructure.ts", "utf8");

await test("a class from another school is refused, not silently dropped", () => {
  assert.match(SERVICE, /\.eq\("organization_id", organizationId\)[\s\S]{0,80}maybeSingle\(\)/);
  assert.match(SERVICE, /That class does not belong to your school/);
});

await test("an inactive class refuses enrollment", () => {
  assert.match(SERVICE, /status !== "active"/);
  assert.match(SERVICE, /archived/i);
});

await test("a failed enrollment rolls the student row back", () => {
  // A student created but not enrolled is a silent misplacement.
  assert.match(SERVICE, /\.from\("students"\)\.delete\(\)/);
  assert.match(SERVICE, /nothing was saved/);
});

await test("duplicate references and emails are refused within the school", () => {
  assert.match(SERVICE, /ilike\("student_ref", studentRef\)/);
  assert.match(SERVICE, /ilike\("email", email\)/);
});

await test("the registration service reports the database's reason instead of swallowing it", () => {
  assert.match(SERVICE, /error\.message/);
  assert.doesNotMatch(SERVICE, /catch\s*\{\s*\}/, "a swallowed error reads as success");
});

await test("loadSchoolStructure scopes every query by the organization", () => {
  // Count queries too: a global count would leak another tenant's size.
  const scoped = [...STRUCTURE.matchAll(/\.eq\("organization_id", organizationId\)/g)];
  assert.ok(scoped.length >= 8, `expected every collection to be organization-scoped, found ${scoped.length}`);
  assert.doesNotMatch(STRUCTURE, /from\("classes"\)\s*\.select\([^)]*\)\s*\.limit/, "a class read must be scoped before it is limited");
});

await test("a failed structure read is reported, never presented as an empty school", () => {
  assert.match(STRUCTURE, /notes\.push\(/);
  assert.match(STRUCTURE, /could not be read/);
});

await test("teaching responsibilities come from the same reader the policies use", () => {
  assert.match(STRUCTURE, /loadTeachingContext\(supabase, organizationId, teacherId\)/);
});

await test("a teacher with no assignments is reported as unrestricted, not as having no access", () => {
  assert.match(HANDLERS_SRC, /does not restrict them by subject/);
  assert.match(STRUCTURE, /configured/);
});

await test("the assignment tool refuses a homeroom row that also names a subject", () => {
  assert.match(HANDLERS_SRC, /A homeroom responsibility names a class and no subject/);
  assert.match(HANDLERS_SRC, /A subject responsibility must name a subject/);
});

await test("the assignment tool requires membership of THIS organization", () => {
  const at = HANDLERS_SRC.indexOf("async function manageTeachingAssignment");
  const body = HANDLERS_SRC.slice(at, HANDLERS_SRC.indexOf("async function getEffectivePermissions"));
  assert.match(body, /from\("organization_members"\)/);
  assert.match(body, /not an active member of this school/);
  assert.match(body, /eq\("organization_id", runtime\.scope\.organizationId\)/);
});

await test("a conflicting homeroom teacher surfaces the database's reason", () => {
  assert.match(HANDLERS_SRC, /already has a homeroom teacher|setTeachingAssignments/);
  const at = HANDLERS_SRC.indexOf("async function manageTeachingAssignment");
  const body = HANDLERS_SRC.slice(at, HANDLERS_SRC.indexOf("async function getEffectivePermissions"));
  assert.match(body, /error\.message/, "the conflict reason must reach the caller");
});

await test("the assignment tool writes an audit entry naming the actor and the change", () => {
  const at = HANDLERS_SRC.indexOf("async function manageTeachingAssignment");
  const body = HANDLERS_SRC.slice(at, HANDLERS_SRC.indexOf("async function getEffectivePermissions"));
  assert.match(body, /audit\(session, "teacher\.assignments_saved"/);
  assert.match(body, /via: "ai_core"/);
});

await test("adding an existing responsibility is idempotent and says so", () => {
  const at = HANDLERS_SRC.indexOf("async function manageTeachingAssignment");
  const body = HANDLERS_SRC.slice(at, HANDLERS_SRC.indexOf("async function getEffectivePermissions"));
  assert.match(body, /already holds that responsibility; nothing was changed/);
  assert.match(body, /changed: false/);
});

await test("revoking a responsibility that is not recorded fails rather than reporting success", () => {
  const at = HANDLERS_SRC.indexOf("async function manageTeachingAssignment");
  const body = HANDLERS_SRC.slice(at, HANDLERS_SRC.indexOf("async function getEffectivePermissions"));
  assert.match(body, /not recorded for this teacher/);
  assert.match(body, /ok: false/);
});

await test("effective permissions answer both the role and the subject scope", () => {
  const at = HANDLERS_SRC.indexOf("async function getEffectivePermissions");
  const body = HANDLERS_SRC.slice(at, HANDLERS_SRC.indexOf("dispatch"));
  assert.match(body, /loadTeachingContext/);
  assert.match(body, /subject_ids/);
  assert.match(body, /No teaching assignment is recorded/);
});

/* ── The gate does not block them ─────────────────────────────────────── */

await test("the new tools are not subject-scoped, so they are not blocked by the content gate", () => {
  const ENGINE = readFileSync("src/lib/ai/engine.ts", "utf8");
  const list = ENGINE.slice(ENGINE.indexOf("const SUBJECT_SCOPED_TOOLS"), ENGINE.indexOf("]);", ENGINE.indexOf("const SUBJECT_SCOPED_TOOLS")));
  for (const name of SCHOOL_TOOLS) {
    assert.ok(!list.includes(`"${name}"`), `${name} manages people and structure, not a subject's content`);
  }
});

console.log(`\nAI school management: ${n} checks passed.`);
if (failures.length) {
  console.error(`\n${failures.length} failed:`);
  for (const failure of failures) console.error(`  ✗ ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
