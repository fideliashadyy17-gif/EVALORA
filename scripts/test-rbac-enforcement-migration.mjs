// Comprehensive PGlite live-schema compatibility, storage ceiling, batch RPC,
// baseline parity, and complete School Founder supervision test for migrations
// 20261125120000 through 20261125124000.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const M0 = readFileSync("supabase/migrations/20261125120000_rbac_system.sql", "utf8");
const M1 = readFileSync("supabase/migrations/20261125121000_founder_supervision.sql", "utf8");
const M2 = readFileSync("supabase/migrations/20261125122000_reconcile_legacy_rbac.sql", "utf8");
const M3 = readFileSync("supabase/migrations/20261125123000_legacy_membership_permission_bridge.sql", "utf8");
const M4 = readFileSync("supabase/migrations/20261125124000_rbac_enforcement_and_founder_supervision.sql", "utf8");

let checks = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  checks++;
}

async function setupBase(db, { withLegacyRbac = true, withStorage = true } = {}) {
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles(id uuid primary key, email text, platform_role text not null default 'user', status text not null default 'active');
    create table organizations(id uuid primary key, name text not null, slug text not null, status text not null default 'active');
    create table organization_members(id uuid primary key default gen_random_uuid(), user_id uuid not null, organization_id uuid not null, role text not null, status text not null default 'active');
    create function public.is_super_admin() returns boolean language sql stable security definer as $$ select exists(select 1 from public.profiles where id = auth.uid() and platform_role = 'super_admin' and status = 'active') $$;
    create function public.is_org_member(p_org uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.organization_members where user_id = auth.uid() and organization_id = p_org and status = 'active') $$;
    create table plans(id uuid primary key, slug text not null, name text not null, modules jsonb not null default '{}'::jsonb);
    create table subscriptions(id uuid primary key, organization_id uuid not null, plan_id uuid not null, status text not null, current_period_end timestamptz, trial_ends_at timestamptz, modules_override jsonb, created_at timestamptz default now());
    create table classes(id uuid primary key, organization_id uuid not null, name text not null, code text, status text default 'active', level_band text, curriculum_track text);
    create table subjects(id uuid primary key, organization_id uuid not null, name text not null);
    create table departments(id uuid primary key, organization_id uuid not null, name text not null);
    create table academic_years(id uuid primary key, organization_id uuid not null, name text not null);
    create table grading_systems(id uuid primary key, organization_id uuid not null, name text not null);
    create table questions(id uuid primary key, organization_id uuid not null, type text, difficulty text, status text default 'published', prompt text);
    create table quizzes(id uuid primary key, organization_id uuid not null, title text not null, status text default 'published', updated_at timestamptz default now());
    create table quiz_sessions(id uuid primary key, organization_id uuid not null, quiz_id uuid, status text default 'live', join_code text default 'SECRET-JOIN');
    create table exam_paper_templates(id uuid primary key, organization_id uuid not null, name text not null);
    create table exams(
      id uuid primary key, organization_id uuid not null, title text not null, status text default 'open',
      duration_minutes int default 60, starts_at timestamptz, ends_at timestamptz,
      access_code text default 'SECRET-EXAM-CODE', shared_link_enabled boolean default true,
      result_publication_mode text default 'manual', grades_published_at timestamptz,
      paused_at timestamptz, deleted_at timestamptz,
      settings jsonb not null default '{}'::jsonb
    );
    create table exam_candidates(
      id uuid primary key, exam_id uuid not null, full_name text default 'SECRET CANDIDATE NAME',
      email text default 'secret-student@example.test', access_code text default 'SECRET-CAND-CODE',
      status text default 'submitted', source text default 'link', class_id uuid
    );
    create table exam_attempts(
      id uuid primary key, exam_id uuid not null, candidate_id uuid, status text default 'submitted',
      grading_status text default 'graded', score numeric, max_score numeric, pending_manual_count int default 0,
      first_name text default 'SECRET-FIRST', last_name text default 'SECRET-LAST',
      access_token uuid default gen_random_uuid()
    );
    create table exam_answers(
      id uuid primary key, attempt_id uuid not null, points_awarded numeric,
      grading_status text default 'graded', moderation_status text
    );
    create table competitions(
      id uuid primary key, organization_id uuid not null, title text not null, status text default 'live',
      format text default 'live_synchronous', results_published boolean default true, join_code text default 'SECRET-COMP-CODE'
    );
    create table proctoring_rooms(id uuid primary key, organization_id uuid not null, exam_id uuid, status text default 'active');
    create table proctoring_incidents(id uuid primary key, organization_id uuid not null, exam_id uuid, status text default 'open');
  `);

  for (const t of [
    "exams", "exam_attempts", "exam_answers", "exam_candidates", "questions", "quizzes",
    "quiz_sessions", "exam_paper_templates", "classes", "subjects", "departments",
    "academic_years", "grading_systems", "competitions", "proctoring_rooms", "proctoring_incidents",
  ]) {
    await db.exec(`
      alter table public.${t} enable row level security;
      create policy ${t}_member_all on public.${t} for all to authenticated using (true) with check (true);
      grant select, insert, update, delete on public.${t} to authenticated;
    `);
  }
  await db.exec(`grant select, insert, update, delete on public.organizations, public.organization_members, public.profiles, public.plans, public.subscriptions to authenticated;`);

  if (withStorage) {
    await db.exec(`
      create schema storage;
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null);
      alter table storage.objects enable row level security;
      create policy logo_read on storage.objects for select to authenticated using (bucket_id = 'org-logos');
      create policy logo_write on storage.objects for insert to authenticated with check (bucket_id = 'org-logos');
      create policy logo_delete on storage.objects for delete to authenticated using (bucket_id = 'org-logos');
      create policy simp_read on storage.objects for select to authenticated using (bucket_id = 'student-imports');
      grant usage on schema storage to authenticated;
      grant select, insert, update, delete on storage.objects to authenticated;
    `);
  }

  if (withLegacyRbac) {
    await db.exec(`
      create table rbac_roles(key text primary key, name text not null, description text, type text default 'system', scope text default 'organization', status text default 'active', created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
      create table rbac_role_permissions(role_key text not null, permission_key text not null, enabled boolean not null default true, updated_by uuid, updated_at timestamptz default now());
      create table rbac_user_overrides(organization_id uuid not null, user_id uuid not null, permission_key text not null, enabled boolean not null default true, created_by uuid, created_at timestamptz default now());
      insert into rbac_roles(key, name, type, status) values
        ('owner','Owner','system','active'), ('admin','Admin','system','active'), ('teacher','Teacher','system','active'),
        ('organizer','Organizer','system','active'), ('supervisor','Supervisor','system','active'), ('corrector','Corrector','system','active'),
        ('candidate','Candidate','system','active'), ('student','Student','system','active'), ('parent','Parent','system','active'),
        ('director_demo','Director Demo','system','active');
    `);
  }
}

// ─── Scenario 1: Fresh DB (no legacy rbac_roles) still gets full canonical bridge ───
{
  const db = new PGlite();
  await setupBase(db, { withLegacyRbac: false, withStorage: true });
  for (const sql of [M0, M1, M2, M3, M4]) await db.exec(sql);
  const mapped = await db.query("select legacy_key from public.access_legacy_role_map order by legacy_key");
  assert.deepEqual(
    mapped.rows.map((r) => r.legacy_key),
    ["admin", "candidate", "corrector", "organizer", "owner", "parent", "student", "supervisor", "teacher"],
  );
  ok(true, "fresh DB without legacy rbac_roles still seeds all 9 canonical legacy mappings");
  await db.close();
}

// ─── Scenario 2: Full Live-Schema Replica + Founder Supervision + Storage + Parity ───
{
  const db = new PGlite();
  await setupBase(db, { withLegacyRbac: true, withStorage: true });

  const superAdmin = "10000000-0000-4000-8000-000000000001";
  const founder = "10000000-0000-4000-8000-000000000002";
  const teacher = "10000000-0000-4000-8000-000000000003";
  const organizer = "10000000-0000-4000-8000-000000000004";
  const corrector = "10000000-0000-4000-8000-000000000005";
  const orgAdmin = "10000000-0000-4000-8000-000000000006";
  const customUser = "10000000-0000-4000-8000-000000000007";
  const oakId = "20000000-0000-4000-8000-000000000001";
  const otherOrgId = "20000000-0000-4000-8000-000000000002";
  const planId = "30000000-0000-4000-8000-000000000001";

  await db.exec(`
    insert into profiles(id, email, platform_role, status) values
      ('${superAdmin}', 'sa@test.local', 'super_admin', 'active'),
      ('${founder}', 'founder@test.local', 'user', 'active'),
      ('${teacher}', 'teacher@test.local', 'user', 'active'),
      ('${organizer}', 'organizer@test.local', 'user', 'active'),
      ('${corrector}', 'corrector@test.local', 'user', 'active'),
      ('${orgAdmin}', 'admin@test.local', 'user', 'active'),
      ('${customUser}', 'custom@test.local', 'user', 'active');
    insert into organizations(id, name, slug, status) values
      ('${oakId}', 'Synthetic Oak School', 'synthetic-oak', 'active'),
      ('${otherOrgId}', 'Other Academy', 'other-academy', 'active');
    insert into organization_members(user_id, organization_id, role, status) values
      ('${teacher}', '${oakId}', 'teacher', 'active'),
      ('${organizer}', '${oakId}', 'organizer', 'active'),
      ('${corrector}', '${oakId}', 'corrector', 'active'),
      ('${orgAdmin}', '${oakId}', 'admin', 'active'),
      ('${customUser}', '${oakId}', 'candidate', 'active');
    insert into plans(id, slug, name, modules) values (
      '${planId}', 'institution', 'Institution',
      '{"examinations":true,"exam_results":true,"exam_validation":true,"exam_publication":true,"exam_candidates":true,"exam_reports":true,"exam_monitoring":true,"proctoring":true,"classes":true,"academics":true,"question_bank":true,"paper_builder":true,"quizzes":true,"competitions":true,"competition_code":true,"competition_results":true,"org_reports":true}'::jsonb
    );
    insert into subscriptions(id, organization_id, plan_id, status, current_period_end, modules_override) values (
      gen_random_uuid(), '${oakId}', '${planId}', 'active', '2031-11-06T00:00:00Z',
      '{"academics":true,"examinations":true,"competition_code":true,"competition_results":true}'::jsonb
    );
    insert into classes(id, organization_id, name, code, level_band, curriculum_track) values
      (gen_random_uuid(), '${oakId}', 'Synthetic Grade 9', 'G9', 'MYP', 'IB MYP');
    insert into subjects(id, organization_id, name) values (gen_random_uuid(), '${oakId}', 'Mathematics');
    insert into departments(id, organization_id, name) values (gen_random_uuid(), '${oakId}', 'STEM');
    insert into academic_years(id, organization_id, name) values (gen_random_uuid(), '${oakId}', '2026-2027');
    insert into grading_systems(id, organization_id, name) values (gen_random_uuid(), '${oakId}', 'IB MYP 1-7');
    insert into questions(id, organization_id, type, difficulty, status, prompt) values
      (gen_random_uuid(), '${oakId}', 'mcq', 'medium', 'published', 'SECRET-ANSWER-PROMPT'),
      (gen_random_uuid(), '${oakId}', 'short_answer', 'hard', 'draft', 'DRAFT-PROMPT');
    insert into quizzes(id, organization_id, title, status) values
      (gen_random_uuid(), '${oakId}', 'Synthetic Paper 1', 'published');
    insert into quiz_sessions(id, organization_id, status, join_code) values
      (gen_random_uuid(), '${oakId}', 'live', 'SECRET-JOIN-999');
    insert into exam_paper_templates(id, organization_id, name) values
      (gen_random_uuid(), '${oakId}', 'Standard Official Paper');

    -- 4 synthetic exams covering ALL result/correction states:
    -- 1) Published exam
    insert into exams(id, organization_id, title, status, duration_minutes, grades_published_at, settings) values
      ('40000000-0000-4000-8000-000000000001', '${oakId}', 'Synthetic Published Exam', 'closed', 60, now(),
       '{"results_published":true,"results_validated":true,"proctoring":true,"lockdown":true,"calculator":true}'::jsonb),
      -- 2) Unpublished exam awaiting validation (graded, not validated)
      ('40000000-0000-4000-8000-000000000002', '${oakId}', 'Synthetic Awaiting Validation Exam', 'closed', 90, null,
       '{"results_published":false,"results_validated":false,"proctoring":true}'::jsonb),
      -- 3) Unpublished exam with ongoing manual correction
      ('40000000-0000-4000-8000-000000000003', '${oakId}', 'Synthetic Ongoing Correction Exam', 'open', 75, null,
       '{"results_published":false,"results_validated":false,"lockdown":true}'::jsonb),
      -- 4) Other org exam (must NEVER appear in Oak overview)
      ('40000000-0000-4000-8000-000000000099', '${otherOrgId}', 'FOREIGN-SECRET-EXAM', 'open', 60, null, '{}'::jsonb);

    insert into exam_candidates(id, exam_id, full_name, email, access_code, status, source) values
      (gen_random_uuid(), '40000000-0000-4000-8000-000000000001', 'SECRET STUDENT ALPHA', 'alpha@secret.test', 'SECRET-CODE-A', 'submitted', 'link'),
      (gen_random_uuid(), '40000000-0000-4000-8000-000000000003', 'SECRET STUDENT BETA', 'beta@secret.test', 'SECRET-CODE-B', 'in_progress', 'manual');

    insert into exam_attempts(id, exam_id, status, grading_status, score, max_score, pending_manual_count, first_name, last_name) values
      ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'submitted', 'graded', 84, 100, 0, 'SECRET-A', 'LAST-A'),
      ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'submitted', 'graded', 72, 100, 0, 'SECRET-B', 'LAST-B'),
      ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', 'submitted', 'awaiting_manual_grading', 40, 100, 3, 'SECRET-C', 'LAST-C');

    insert into exam_answers(id, attempt_id, points_awarded, grading_status, moderation_status) values
      (gen_random_uuid(), '50000000-0000-4000-8000-000000000001', 84, 'graded', 'approved'),
      (gen_random_uuid(), '50000000-0000-4000-8000-000000000003', null, 'pending_manual', null);

    insert into competitions(id, organization_id, title, status, results_published, join_code) values
      (gen_random_uuid(), '${oakId}', 'Synthetic Science Bowl', 'live', true, 'SECRET-COMP-JOIN');

    insert into proctoring_rooms(id, organization_id, exam_id, status) values
      (gen_random_uuid(), '${oakId}', '40000000-0000-4000-8000-000000000001', 'active');
    insert into proctoring_incidents(id, organization_id, exam_id, status) values
      (gen_random_uuid(), '${oakId}', '40000000-0000-4000-8000-000000000001', 'open'),
      (gen_random_uuid(), '${oakId}', '40000000-0000-4000-8000-000000000001', 'valid');

    insert into storage.objects(bucket_id, name) values
      ('org-logos', '${oakId}/logo.png'),
      ('student-imports', '${oakId}/roster-secret.csv');
  `);

  // Apply ALL 5 migrations forward-only, then re-run M4 to prove idempotency
  for (const sql of [M0, M1, M2, M3, M4, M4]) await db.exec(sql);
  ok(true, "all 5 forward migrations + idempotent re-run of M4 applied cleanly");

  // Assign synthetic School Founder via access_assign_founder as Super Admin
  await db.exec(`set test.uid='${superAdmin}';`);
  await db.query("select public.access_assign_founder($1, $2, null)", ["founder@test.local", oakId]);

  // 1. Verify baseline operational parity for legacy members via batch RPC
  const checkBatch = async (uid, org, keys) =>
    (await db.query("select public.access_check_permissions($1, $2, $3) as m", [uid, org, keys])).rows[0].m;

  const teacherPerms = await checkBatch(teacher, oakId, [
    "questions.create", "questions.delete", "paper_builder.publish", "exams.create", "exams.delete",
    "competitions.edit", "candidate_links.revoke", "grading.edit", "proctoring.manage", "reports.export",
    "results.publish", "billing.manage", "roles.view",
  ]);
  assert.equal(teacherPerms["questions.create"], true);
  assert.equal(teacherPerms["questions.delete"], true);
  assert.equal(teacherPerms["paper_builder.publish"], true);
  assert.equal(teacherPerms["exams.delete"], true);
  assert.equal(teacherPerms["competitions.edit"], true);
  assert.equal(teacherPerms["candidate_links.revoke"], true);
  assert.equal(teacherPerms["grading.edit"], true);
  assert.equal(teacherPerms["proctoring.manage"], true);
  assert.equal(teacherPerms["reports.export"], true);
  assert.equal(teacherPerms["results.publish"], false, "teacher must NOT publish results");
  assert.equal(teacherPerms["billing.manage"], false, "teacher must NOT manage billing");
  assert.equal(teacherPerms["roles.view"], false, "teacher must NOT access super admin RBAC");
  ok(true, "teacher baseline parity & privilege boundaries verified");

  const correctorPerms = await checkBatch(corrector, oakId, [
    "grading.edit", "proctoring.view", "proctoring.manage", "reports.export", "exams.delete", "results.publish",
  ]);
  assert.equal(correctorPerms["grading.edit"], true);
  assert.equal(correctorPerms["proctoring.view"], true);
  assert.equal(correctorPerms["reports.export"], true);
  assert.equal(correctorPerms["exams.delete"], false);
  assert.equal(correctorPerms["results.publish"], false);
  ok(true, "corrector baseline parity & privilege boundaries verified");

  const organizerPerms = await checkBatch(organizer, oakId, [
    "exams.create", "exams.delete", "competitions.edit", "candidate_links.revoke", "grading.edit", "results.publish",
  ]);
  assert.equal(organizerPerms["exams.create"], true);
  assert.equal(organizerPerms["competitions.edit"], true);
  assert.equal(organizerPerms["candidate_links.revoke"], true);
  assert.equal(organizerPerms["grading.edit"], false, "organizer must NOT grade");
  assert.equal(organizerPerms["results.publish"], false, "organizer must NOT publish results");
  ok(true, "organizer baseline parity & privilege boundaries verified");

  // 2. Custom role creation -> assignment -> immediate grant -> revocation -> immediate denial
  await db.query(
    "select public.access_save_role($1, $2, $3, $4, true, $5, true)",
    ["results-publisher", "Results Publisher", "Publishes validated results", oakId, ["results.view", "results.validate", "results.publish"]],
  );
  await db.exec(`
    insert into public.access_user_roles(user_id, role_id, organization_id, status)
    select '${customUser}', id, '${oakId}', 'active' from public.access_roles where slug = 'results-publisher';
  `);
  const customBefore = await checkBatch(customUser, oakId, ["results.validate", "results.publish", "grading.edit"]);
  assert.equal(customBefore["results.validate"], true);
  assert.equal(customBefore["results.publish"], true);
  assert.equal(customBefore["grading.edit"], false);
  await db.exec(`update public.access_user_roles set status = 'revoked' where user_id = '${customUser}';`);
  const customAfter = await checkBatch(customUser, oakId, ["results.validate", "results.publish"]);
  assert.equal(customAfter["results.validate"], false);
  assert.equal(customAfter["results.publish"], false);
  ok(true, "custom role grant and revocation take effect immediately");

  // 3. School Founder complete read-only supervision + ceiling + zero leakage + storage block
  await db.exec(`set role authenticated; set test.uid='${founder}';`);
  const founderPerms = await checkBatch(founder, oakId, [
    "dashboard.view", "dashboard.analytics", "organizations.view", "classes.view",
    "questions.view", "paper_builder.view", "exams.view", "exams.monitor",
    "quizzes.view", "competitions.view", "grading.view", "results.view",
    "candidate_links.view", "reports.view", "billing.view",
    // MUST BE DENIED:
    "grading.edit", "grading.validate", "results.validate", "results.publish", "results.unpublish",
    "exams.edit", "exams.delete", "questions.edit", "candidate_links.create",
    "proctoring.view", "proctoring.manage", "reports.export", "users.view", "students.view",
    "organizations.edit", "billing.manage", "roles.view", "system.configure",
  ]);
  for (const allowKey of [
    "dashboard.view", "dashboard.analytics", "organizations.view", "classes.view",
    "questions.view", "paper_builder.view", "exams.view", "exams.monitor",
    "quizzes.view", "competitions.view", "grading.view", "results.view",
    "candidate_links.view", "reports.view", "billing.view",
  ]) {
    assert.equal(founderPerms[allowKey], true, `Founder should have ${allowKey}`);
  }
  for (const denyKey of [
    "grading.edit", "grading.validate", "results.validate", "results.publish", "results.unpublish",
    "exams.edit", "exams.delete", "questions.edit", "candidate_links.create",
    "proctoring.view", "proctoring.manage", "reports.export", "users.view", "students.view",
    "organizations.edit", "billing.manage", "roles.view", "system.configure",
  ]) {
    assert.equal(founderPerms[denyKey], false, `Founder MUST BE DENIED ${denyKey}`);
  }
  ok(true, "Founder read-only permission set and mutation/privacy ceiling verified");

  // Complete sanitized overview RPC verification
  const overview = (await db.query("select public.access_supervision_overview($1) as data", [oakId])).rows[0].data;
  const serialized = JSON.stringify(overview);
  for (const secret of ["SECRET", "secret-student", "alpha@secret.test", "beta@secret.test", "FOREIGN-SECRET-EXAM"]) {
    assert.equal(serialized.includes(secret), false, `Supervision overview leaked forbidden value: ${secret}`);
  }
  assert.equal(overview.organization.name, "Synthetic Oak School");
  assert.equal(overview.summary.examinations, 3);
  assert.equal(overview.academic_structures.total_classes, 1);
  assert.equal(overview.academic_structures.subjects_count, 1);
  assert.equal(overview.academic_structures.departments_count, 1);
  assert.equal(overview.question_bank_overview.total, 2);
  assert.equal(overview.question_bank_overview.published, 1);
  assert.equal(overview.paper_builder_overview.total_papers, 1);
  assert.equal(overview.paper_builder_overview.templates_count, 1);
  assert.equal(overview.examinations.length, 3);
  assert.equal(overview.assessment_configuration.length, 3);
  assert.equal(overview.candidate_admission_overview.total_candidates, 2);
  assert.equal(overview.quizzes_overview.total, 1);
  assert.equal(overview.competitions.length, 1);
  assert.equal(overview.marking_progress.graded_attempts, 2);
  assert.equal(overview.marking_progress.awaiting_manual_grading, 1);
  assert.equal(overview.marking_progress.pending_manual_answers, 1);
  // Critical Founder result states: published, unpublished, awaiting validation, ongoing correction
  assert.equal(overview.results.published_exam_count, 1);
  assert.equal(overview.results.published[0].title, "Synthetic Published Exam");
  assert.equal(overview.results.unpublished_exam_count, 2);
  assert.equal(overview.results.awaiting_validation_exam_count, 2);
  assert.equal(overview.results.ongoing_correction_exam_count, 1);
  assert.equal(overview.results.ongoing_correction[0].title, "Synthetic Ongoing Correction Exam");
  assert.equal(overview.results.ongoing_correction[0].pending_manual_items, 3);
  assert.equal(overview.rankings_and_reports.exam_performance_rankings.length, 3);
  assert.equal(overview.proctoring_overview.open_incidents, 1);
  assert.equal(overview.proctoring_overview.active_rooms, 1);
  assert.equal(overview.enabled_modules.plan_slug, "institution");
  assert.equal(overview.enabled_modules.effective_modules.competitions, true);
  assert.equal(overview.enabled_modules.effective_modules.competition_code, true);
  assert.equal(overview.enabled_modules.effective_modules.competition_results, true);
  ok(true, "Founder overview exposes all 17 sanitized supervisory domains including published/unpublished/validation/correction");

  // Cross-org denial
  await assert.rejects(() => db.query("select public.access_supervision_overview($1)", [otherOrgId]), /supervision permission required/);
  ok(true, "Founder denied cross-organization overview");

  // Direct table RLS + storage.objects ceiling
  assert.equal((await db.query("select * from public.exams")).rows.length, 0);
  assert.equal((await db.query("select * from public.exam_attempts")).rows.length, 0);
  assert.equal((await db.query("select * from public.exam_answers")).rows.length, 0);
  assert.equal((await db.query("select * from public.exam_candidates")).rows.length, 0);
  await assert.rejects(() => db.exec(`insert into public.exams(id, organization_id, title) values(gen_random_uuid(), '${oakId}', 'HACK')`), /row-level security/);
  // Storage: org-logos SELECT allowed, student-imports SELECT blocked, org-logos INSERT & DELETE blocked!
  const visibleObjects = (await db.query("select bucket_id, name from storage.objects")).rows;
  assert.deepEqual(visibleObjects, [{ bucket_id: "org-logos", name: `${oakId}/logo.png` }]);
  await assert.rejects(
    () => db.exec(`insert into storage.objects(bucket_id, name) values('org-logos', '${oakId}/hack.png')`),
    /row-level security/,
  );
  const deletedLogos = (await db.query("delete from storage.objects where bucket_id = 'org-logos' returning id")).rows;
  assert.equal(deletedLogos.length, 0, "Founder must NOT delete org-logos");
  ok(true, "Founder restrictive RLS enforced on all operational tables AND storage.objects");

  await db.close();
}

console.log(`\n${checks} RBAC enforcement & Founder supervision migration checks passed (PGlite).`);
