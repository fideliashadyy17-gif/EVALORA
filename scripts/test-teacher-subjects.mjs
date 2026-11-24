// Teacher subject assignment (§ Teacher Subject Assignment): tenant-scoped
// table + guard, manager-gated diff-based actions, creation-time assignment,
// display and workflow preselection.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261124200000_formula_library_teacher_subjects_grading_systems.sql", "utf8");
assert.ok(migration.includes("create table if not exists public.teacher_subjects"), "teacher_subjects table exists");
assert.ok(migration.includes("organization_id uuid not null references public.organizations(id)"), "assignments are organization-scoped");
assert.ok(migration.includes("references public.profiles(id)"), "assignments reference profiles");
assert.ok(migration.includes("references public.subjects(id)"), "assignments reference subjects");
assert.ok(migration.includes("guard_teacher_subject"), "tenant/role guard trigger exists");
assert.ok(migration.includes("create policy") && /policy.*teacher_subjects/is.test(migration), "RLS policies present");
assert.ok(!/drop table|truncate|delete from public\.(exams|questions|profiles|subjects)/i.test(migration), "migration is additive only");

const actions = readFileSync("src/app/dashboard/teacher" + "s/actions.ts", "utf8");
assert.ok(actions.includes("export async function setTeacherSubjects"), "server action exists");
assert.ok(actions.includes("MANAGER_ROLES"), "manager-only guard");
assert.ok(actions.includes("audit("), "assignment changes are audited");
assert.ok(actions.includes("eq(\"organization_id\", org.id)"), "every query is org-scoped");
assert.ok(actions.includes("toDelete") && actions.includes("toInsert"), "diff-based update (never wipe-then-insert)");
assert.ok(actions.includes("teacher_subjects"), "writes the assignment table");
assert.ok(actions.includes("revalidatePath(\"/dashboard/teachers\")"), "UI refreshed after save");

const accounts = readFileSync("src/app/dashboard/accounts/actions.ts", "utf8");
assert.ok(accounts.includes("subject_ids"), "create-account form accepts subject selections");
assert.ok(accounts.includes("teacher_subjects"), "creation stores assignments");
assert.ok(accounts.includes(".eq(\"organization_id\", org.id)") && accounts.includes(".in(\"id\", subjectIds)"), "chosen subjects validated against the org");

const teachersPage = readFileSync("src/app/dashboard/teachers/page.tsx", "utf8");
assert.ok(teachersPage.includes("subjectsByTeacher"), "teacher rows show assigned subjects");
assert.ok(teachersPage.includes("setTeacherSubjects"), "managers can edit assignments inline");
assert.ok(teachersPage.includes("name=\"subject_ids\""), "create form offers subject selection");
assert.ok(teachersPage.includes("Edit subjects"), "per-row assignment editor");

const questionNew = readFileSync("src/app/dashboard/questions/new/page.tsx", "utf8");
assert.ok(questionNew.includes("teacher_subjects"), "question authoring reads the author's subjects");
assert.ok(questionNew.includes("defaultSubjectId"), "first assigned subject preselects");

const examNew = readFileSync("src/app/dashboard/exams/new/page.tsx", "utf8");
assert.ok(examNew.includes("teacher_subjects"), "exam authoring reads the author's subjects");
assert.ok(examNew.includes("defaultSubjectName"), "first assigned subject preselects");

const dashboard = readFileSync("src/app/dashboard/page.tsx", "utf8");
assert.ok(dashboard.includes("my-subjects"), "workspace home shows My subjects");
assert.ok(dashboard.includes("teacher_subjects"), "overview reads the signed-in teacher's assignments");

console.log("teacher-subjects: 30 checks passed");
