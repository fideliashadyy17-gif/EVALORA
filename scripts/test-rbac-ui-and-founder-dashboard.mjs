// Comprehensive PGlite + TypeScript verification for:
//   - Migration 20261125150000_rbac_ui_and_founder_dashboard_access.sql
//   - Organization-scoped RBAC RPCs & strict non-escalation / tenant boundaries
//   - School Founder operational dashboard read access, sensitive-table isolation,
//     write/storage ceiling, workspace_overview code masking, and invitation acceptance
//   - Super Admin RBAC UI, Org RBAC UI, LiveKit/Proctor hardening, and route guards
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = [
  "supabase/migrations/20261125120000_rbac_system.sql",
  "supabase/migrations/20261125121000_founder_supervision.sql",
  "supabase/migrations/20261125122000_reconcile_legacy_rbac.sql",
  "supabase/migrations/20261125123000_legacy_membership_permission_bridge.sql",
  "supabase/migrations/20261125124000_rbac_enforcement_and_founder_supervision.sql",
  "supabase/migrations/20261125125000_harden_supervision_jsonb_casts.sql",
  "supabase/migrations/20261125150000_rbac_ui_and_founder_dashboard_access.sql",
].map((p) => ({ path: p, sql: readFileSync(p, "utf8") }));

let checks = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  checks += 1;
}

const ORG_A = "0a400000-0000-4000-8000-000000000001";
const ORG_B = "0b400000-0000-4000-8000-000000000002";
const U_SUPER = "10000000-0000-4000-8000-000000000001";
const U_OWNER_A = "10000000-0000-4000-8000-000000000002";
const U_ADMIN_A = "10000000-0000-4000-8000-000000000003";
const U_TEACHER_A = "10000000-0000-4000-8000-000000000004";
const U_FOUNDER_A = "10000000-0000-4000-8000-000000000005";
const U_ADMIN_B = "10000000-0000-4000-8000-000000000006";
const U_INVITED_FOUNDER = "10000000-0000-4000-8000-000000000007";
const U_WRONG_EMAIL = "10000000-0000-4000-8000-000000000008";

async function asUser(db, uid, fn) {
  await db.exec("begin;");
  try {
    await db.exec(`set local role authenticated; select set_config('test.uid', '${uid}', true);`);
    const res = await fn();
    await db.exec("commit;");
    return res;
  } catch (err) {
    await db.exec("rollback;");
    throw err;
  }
}

async function setupDb() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

    create table profiles(id uuid primary key, email text, full_name text, platform_role text not null default 'user', status text not null default 'active');
    create table organizations(
      id uuid primary key, name text not null, slug text not null, status text not null default 'active',
      portal_enabled boolean default true, custom_domain text, platform_domain_status text default 'active'
    );
    create table organization_members(
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      organization_id uuid not null,
      role text not null,
      status text not null default 'active',
      unique (user_id, organization_id)
    );
    create table invitations(
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      email text not null,
      role text not null,
      token text not null unique,
      status text not null default 'pending',
      invited_by uuid,
      expires_at timestamptz not null default (now() + interval '7 days'),
      created_at timestamptz not null default now()
    );

    create function public.is_super_admin() returns boolean language sql stable security definer as $$
      select exists(select 1 from public.profiles where id = auth.uid() and platform_role = 'super_admin' and status = 'active')
    $$;
    create function public.is_org_member(p_org uuid) returns boolean language sql stable security definer as $$
      select exists(select 1 from public.organization_members where user_id = auth.uid() and organization_id = p_org and status = 'active')
    $$;
    create function public.staff_org_ids() returns setof uuid language sql stable security definer as $$
      select organization_id from public.organization_members
      where user_id = auth.uid() and status = 'active' and role in ('owner','admin','teacher','organizer','supervisor','corrector')
    $$;

    create table plans(id uuid primary key, slug text not null, name text not null, modules jsonb not null default '{}'::jsonb);
    create table subscriptions(id uuid primary key, organization_id uuid not null, plan_id uuid not null, status text not null, current_period_end timestamptz, trial_ends_at timestamptz, modules_override jsonb, created_at timestamptz default now());

    -- Operational tables
    create table classes(id uuid primary key, organization_id uuid not null, name text not null, code text, status text default 'active', level_band text, curriculum_track text);
    create table subjects(id uuid primary key, organization_id uuid not null, name text not null);
    create table departments(id uuid primary key, organization_id uuid not null, name text not null);
    create table academic_years(id uuid primary key, organization_id uuid not null, name text not null);
    create table grading_systems(id uuid primary key, organization_id uuid not null, name text not null);
    create table grading_rubrics(id uuid primary key, organization_id uuid not null, title text not null);
    create table students(id uuid primary key, organization_id uuid not null, full_name text not null);
    create table student_enrollments(id uuid primary key, organization_id uuid not null, student_id uuid not null, class_id uuid not null);
    create table questions(id uuid primary key, organization_id uuid not null, type text, difficulty text, status text default 'published', prompt text);
    create table quizzes(id uuid primary key, organization_id uuid not null, title text not null, status text default 'published', updated_at timestamptz default now());
    create table quiz_sessions(id uuid primary key, organization_id uuid not null, quiz_id uuid, title text, status text default 'live', join_code text default 'JOIN-SECRET', created_at timestamptz default now());
    create table exam_paper_templates(id uuid primary key, organization_id uuid not null, name text not null);
    create table exams(
      id uuid primary key, organization_id uuid not null, title text not null, status text default 'open',
      duration_minutes int default 60, starts_at timestamptz, ends_at timestamptz,
      access_code text default 'EXAM-SECRET', shared_link_enabled boolean default true,
      result_publication_mode text default 'manual', grades_published_at timestamptz,
      paused_at timestamptz, deleted_at timestamptz, created_at timestamptz default now(),
      settings jsonb not null default '{}'::jsonb
    );
    create table exam_candidates(id uuid primary key, exam_id uuid not null, full_name text not null, access_code text default 'CAND-SECRET', status text default 'submitted', source text default 'link', class_id uuid);
    create table exam_attempts(id uuid primary key, exam_id uuid not null, candidate_id uuid, status text default 'submitted', grading_status text default 'graded', score numeric, max_score numeric, pending_manual_count int default 0, access_token uuid default gen_random_uuid());
    create table exam_answers(id uuid primary key, attempt_id uuid not null, points_awarded numeric, grading_status text default 'graded', moderation_status text);
    create table competitions(id uuid primary key, organization_id uuid not null, title text not null, status text default 'live', format text default 'live_synchronous', results_published boolean default true);
    create table proctoring_rooms(id uuid primary key, organization_id uuid not null, exam_id uuid, status text default 'active');
    create table proctoring_incidents(id uuid primary key, organization_id uuid not null, exam_id uuid, status text default 'open');

    -- Sensitive tables that MUST stay blocked for school_founder
    create table audit_logs(id uuid primary key, organization_id uuid not null, action text not null);
    create table payment_requests(id uuid primary key, organization_id uuid not null, amount numeric not null);
    create table proctoring_recordings(id uuid primary key, organization_id uuid not null, storage_path text not null);
    create table competition_access_codes(id uuid primary key, organization_id uuid not null, code text not null);
    create table exam_lockdown_challenges(id uuid primary key, exam_id uuid not null, secret text not null);
    create table support_tickets(id uuid primary key, organization_id uuid not null, subject text not null);
    create table organization_admin_setup(id uuid primary key, organization_id uuid not null, code_hash text not null);

    create schema storage;
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null);
    alter table storage.objects enable row level security;
    create policy logo_read on storage.objects for select to authenticated using (bucket_id in ('org-logos', 'student-imports'));
    create policy logo_write on storage.objects for insert to authenticated with check (bucket_id in ('org-logos', 'student-imports'));
    create policy logo_delete on storage.objects for delete to authenticated using (bucket_id in ('org-logos', 'student-imports'));
    grant usage on schema storage to authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
  `);

  // Operational tables: realistic staff-only RLS (using staff_org_ids()) so Founder relies on 150000's founder_can_read policies!
  for (const t of [
    "exams", "questions", "quizzes", "quiz_sessions", "exam_paper_templates",
    "classes", "subjects", "departments", "academic_years", "grading_systems",
    "grading_rubrics", "students", "student_enrollments", "competitions",
    "proctoring_rooms", "proctoring_incidents",
  ]) {
    await db.exec(`
      alter table public.${t} enable row level security;
      create policy ${t}_staff_all on public.${t} for all to authenticated
        using (organization_id in (select public.staff_org_ids()) or public.is_super_admin())
        with check (organization_id in (select public.staff_org_ids()) or public.is_super_admin());
      grant select, insert, update, delete on public.${t} to authenticated;
    `);
  }
  for (const t of ["exam_candidates", "exam_attempts"]) {
    await db.exec(`
      alter table public.${t} enable row level security;
      create policy ${t}_staff_all on public.${t} for all to authenticated
        using (exists (select 1 from public.exams e where e.id = exam_id and (e.organization_id in (select public.staff_org_ids()) or public.is_super_admin())))
        with check (exists (select 1 from public.exams e where e.id = exam_id and (e.organization_id in (select public.staff_org_ids()) or public.is_super_admin())));
      grant select, insert, update, delete on public.${t} to authenticated;
    `);
  }
  await db.exec(`
    alter table public.exam_answers enable row level security;
    create policy exam_answers_staff_all on public.exam_answers for all to authenticated
      using (exists (select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id where a.id = attempt_id and (e.organization_id in (select public.staff_org_ids()) or public.is_super_admin())))
      with check (exists (select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id where a.id = attempt_id and (e.organization_id in (select public.staff_org_ids()) or public.is_super_admin())));
    grant select, insert, update, delete on public.exam_answers to authenticated;
  `);

  // Sensitive tables: permissive member SELECT so ONLY access_founder_private_reads restricts Founder!
  for (const t of [
    "audit_logs", "payment_requests", "invitations", "proctoring_recordings",
    "competition_access_codes", "exam_lockdown_challenges", "support_tickets", "organization_admin_setup",
  ]) {
    await db.exec(`
      alter table public.${t} enable row level security;
      create policy ${t}_member_read on public.${t} for select to authenticated using (true);
      grant select, insert, update, delete on public.${t} to authenticated;
    `);
  }
  await db.exec(`grant select, insert, update, delete on public.organizations, public.organization_members, public.profiles, public.plans, public.subscriptions to authenticated;`);

  // Apply the complete migration chain 120000 -> 150000
  for (const m of MIGRATIONS) {
    await db.exec(m.sql);
  }
  // Idempotency check: re-run 150000 cleanly!
  await db.exec(MIGRATIONS[MIGRATIONS.length - 1].sql);
  ok(true, "Migration chain 120000..150000 applies cleanly and 150000 is idempotent");

  // Seed organizations, users, memberships, and operational + sensitive rows in Org A and Org B
  await db.exec(`
    insert into organizations(id, name, slug, status) values
      ('${ORG_A}', 'Oak International School', 'ois', 'active'),
      ('${ORG_B}', 'Other Academy', 'other', 'active');

    insert into profiles(id, email, full_name, platform_role, status) values
      ('${U_SUPER}', 'super@evalora.test', 'Super Admin', 'super_admin', 'active'),
      ('${U_OWNER_A}', 'owner-a@ois.test', 'Oak Owner', 'user', 'active'),
      ('${U_ADMIN_A}', 'admin-a@ois.test', 'Oak Admin', 'user', 'active'),
      ('${U_TEACHER_A}', 'teacher-a@ois.test', 'Oak Teacher', 'user', 'active'),
      ('${U_FOUNDER_A}', 'founder-a@ois.test', 'Oak Founder', 'user', 'active'),
      ('${U_ADMIN_B}', 'admin-b@other.test', 'Other Admin', 'user', 'active'),
      ('${U_INVITED_FOUNDER}', 'Infos@oisbenin.bj', 'Oak Invited Founder', 'user', 'active'),
      ('${U_WRONG_EMAIL}', 'intruder@example.test', 'Intruder', 'user', 'active');

    insert into organization_members(user_id, organization_id, role, status) values
      ('${U_OWNER_A}', '${ORG_A}', 'owner', 'active'),
      ('${U_ADMIN_A}', '${ORG_A}', 'admin', 'active'),
      ('${U_TEACHER_A}', '${ORG_A}', 'teacher', 'active'),
      ('${U_FOUNDER_A}', '${ORG_A}', 'school_founder', 'active'),
      ('${U_ADMIN_B}', '${ORG_B}', 'admin', 'active');

    insert into access_user_roles(user_id, role_id, organization_id, status, assigned_by)
    select '${U_FOUNDER_A}', r.id, '${ORG_A}', 'active', '${U_SUPER}'
    from access_roles r where r.slug = 'school_founder';

    insert into classes(id, organization_id, name) values
      ('21000000-0000-4000-8000-000000000001', '${ORG_A}', 'Grade 10 MYP5'),
      ('21000000-0000-4000-8000-000000000002', '${ORG_B}', 'Other Class');
    insert into students(id, organization_id, full_name) values
      ('22000000-0000-4000-8000-000000000001', '${ORG_A}', 'Ada Student'),
      ('22000000-0000-4000-8000-000000000002', '${ORG_B}', 'Other Student');
    insert into student_enrollments(id, organization_id, student_id, class_id) values
      ('23000000-0000-4000-8000-000000000001', '${ORG_A}', '22000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001'),
      ('23000000-0000-4000-8000-000000000002', '${ORG_B}', '22000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002');
    insert into questions(id, organization_id, type, difficulty, prompt) values
      ('24000000-0000-4000-8000-000000000001', '${ORG_A}', 'single_choice', 'medium', 'Oak Math Q1'),
      ('24000000-0000-4000-8000-000000000002', '${ORG_B}', 'single_choice', 'medium', 'Other Q1');
    insert into quizzes(id, organization_id, title) values
      ('25000000-0000-4000-8000-000000000001', '${ORG_A}', 'Oak Term Quiz'),
      ('25000000-0000-4000-8000-000000000002', '${ORG_B}', 'Other Quiz');
    insert into quiz_sessions(id, organization_id, quiz_id, title, join_code) values
      ('26000000-0000-4000-8000-000000000001', '${ORG_A}', '25000000-0000-4000-8000-000000000001', 'Oak Live Session', 'OAK-JOIN-999'),
      ('26000000-0000-4000-8000-000000000002', '${ORG_B}', '25000000-0000-4000-8000-000000000002', 'Other Session', 'OTH-JOIN-888');
    insert into exams(id, organization_id, title, access_code) values
      ('27000000-0000-4000-8000-000000000001', '${ORG_A}', 'Oak Physics Term Exam', 'OAK-EXAM-777'),
      ('27000000-0000-4000-8000-000000000002', '${ORG_B}', 'Other Physics Exam', 'OTH-EXAM-666');
    insert into exam_candidates(id, exam_id, full_name, access_code) values
      ('28000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'Ada Candidate', 'CAND-OAK-1'),
      ('28000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000002', 'Other Candidate', 'CAND-OTH-2');
    insert into exam_attempts(id, exam_id, candidate_id, score, max_score) values
      ('29000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-000000000001', 82, 100),
      ('29000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000002', '28000000-0000-4000-8000-000000000002', 90, 100);
    insert into exam_answers(id, attempt_id, points_awarded) values
      ('2a000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', 10),
      ('2a000000-0000-4000-8000-000000000002', '29000000-0000-4000-8000-000000000002', 10);
    insert into competitions(id, organization_id, title) values
      ('2b000000-0000-4000-8000-000000000001', '${ORG_A}', 'Oak Olympiad'),
      ('2b000000-0000-4000-8000-000000000002', '${ORG_B}', 'Other Olympiad');
    insert into proctoring_rooms(id, organization_id, exam_id) values
      ('2c000000-0000-4000-8000-000000000001', '${ORG_A}', '27000000-0000-4000-8000-000000000001'),
      ('2c000000-0000-4000-8000-000000000002', '${ORG_B}', '27000000-0000-4000-8000-000000000002');
    insert into proctoring_incidents(id, organization_id, exam_id) values
      ('2d000000-0000-4000-8000-000000000001', '${ORG_A}', '27000000-0000-4000-8000-000000000001'),
      ('2d000000-0000-4000-8000-000000000002', '${ORG_B}', '27000000-0000-4000-8000-000000000002');
    insert into grading_rubrics(id, organization_id, title) values
      ('2e000000-0000-4000-8000-000000000001', '${ORG_A}', 'Oak MYP Rubric'),
      ('2e000000-0000-4000-8000-000000000002', '${ORG_B}', 'Other Rubric');

    -- Sensitive rows in Org A
    insert into audit_logs(id, organization_id, action) values ('a1000000-0000-4000-8000-000000000001', '${ORG_A}', 'secret.event');
    insert into payment_requests(id, organization_id, amount) values ('a2000000-0000-4000-8000-000000000001', '${ORG_A}', 500000);
    insert into proctoring_recordings(id, organization_id, storage_path) values ('a3000000-0000-4000-8000-000000000001', '${ORG_A}', 'oak/vid.webm');
    insert into competition_access_codes(id, organization_id, code) values ('a4000000-0000-4000-8000-000000000001', '${ORG_A}', 'COMP-SECRET-1');
    insert into exam_lockdown_challenges(id, exam_id, secret) values ('a5000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'CHALLENGE-SECRET');
    insert into support_tickets(id, organization_id, subject) values ('a6000000-0000-4000-8000-000000000001', '${ORG_A}', 'Private Billing Ticket');
    insert into organization_admin_setup(id, organization_id, code_hash) values ('a7000000-0000-4000-8000-000000000001', '${ORG_A}', 'HASH-SECRET');
    insert into storage.objects(bucket_id, name) values
      ('org-logos', 'oak-logo.png'),
      ('student-imports', 'oak-private-roster.csv');

    -- Seed a Founder invitation for Infos@oisbenin.bj
    insert into invitations(organization_id, email, role, token, invited_by) values
      ('${ORG_A}', 'infos@oisbenin.bj', 'school_founder', 'oak-founder-invite-token-123', '${U_SUPER}');
  `);

  return db;
}

const db = await setupDb();

// 1. Permission grants: org_owner/org_admin get roles.view+roles.assign; school_founder gets read-only ceiling
await asUser(db, U_ADMIN_A, async () => {
  const { rows } = await db.query(
    `select public.access_check_permissions($1, $2, array['roles.view','roles.assign','roles.create','roles.edit','roles.delete','permissions.manage']) as p`,
    [U_ADMIN_A, ORG_A],
  );
  const p = rows[0].p;
  ok(p["roles.view"] === true && p["roles.assign"] === true, "org_admin has roles.view + roles.assign");
  ok(
    p["roles.create"] === false && p["roles.edit"] === false && p["roles.delete"] === false && p["permissions.manage"] === false,
    "org_admin NEVER has global role/permission schema mutation rights",
  );
});

await asUser(db, U_FOUNDER_A, async () => {
  const { rows } = await db.query(
    `select public.access_check_permissions($1, $2, array[
      'dashboard.view','dashboard.analytics','exams.view','exams.monitor','results.view','reports.view',
      'quizzes.view','questions.view','classes.view','students.view','competitions.view','paper_builder.view',
      'proctoring.view','grading.view',
      'exams.create','exams.edit','exams.delete','results.publish','reports.export','proctoring.manage',
      'candidate_links.edit','billing.view','billing.manage','roles.view','roles.assign','organizations.edit'
    ]) as p`,
    [U_FOUNDER_A, ORG_A],
  );
  const p = rows[0].p;
  for (const granted of [
    "dashboard.view", "dashboard.analytics", "exams.view", "exams.monitor", "results.view", "reports.view",
    "quizzes.view", "questions.view", "classes.view", "students.view", "competitions.view", "paper_builder.view",
    "proctoring.view", "grading.view",
  ]) {
    ok(p[granted] === true, `school_founder has read-only permission ${granted}`);
  }
  for (const denied of [
    "exams.create", "exams.edit", "exams.delete", "results.publish", "reports.export",
    "proctoring.manage", "candidate_links.edit", "billing.view", "billing.manage",
    "roles.view", "roles.assign", "organizations.edit",
  ]) {
    ok(p[denied] === false, `school_founder is DENIED ${denied}`);
  }
});

// 2. Internal _access_eval_permission is NOT callable by authenticated users
{
  let denied = false;
  try {
    await asUser(db, U_ADMIN_A, async () => {
      await db.query(`select public._access_eval_permission($1, $2, 'exams.view')`, [U_TEACHER_A, ORG_A]);
    });
  } catch (err) {
    denied = /permission denied/i.test(String(err.message));
  }
  ok(denied, "authenticated role cannot call internal _access_eval_permission directly");
}

// 3. access_has_permission preserves self/super_admin check; access_org_inspect_permissions works in-org only
await asUser(db, U_ADMIN_A, async () => {
  const { rows: direct } = await db.query(
    `select public.access_has_permission($1, $2, 'exams.view') as ok`,
    [U_TEACHER_A, ORG_A],
  );
  ok(direct[0].ok === false, "access_has_permission still returns false when non-super-admin queries another user");

  const { rows: inspected } = await db.query(
    `select public.access_org_inspect_permissions($1, $2) as map`,
    [ORG_A, U_TEACHER_A],
  );
  const map = inspected[0].map;
  ok(map["exams.view"] === true && map["roles.assign"] === false, "org_admin can inspect in-org teacher's effective permissions");
});

{
  let crossTenantBlocked = false;
  try {
    await asUser(db, U_ADMIN_A, async () => {
      await db.query(`select * from public.access_org_inspect_permissions($1, $2)`, [ORG_A, U_ADMIN_B]);
    });
  } catch (err) {
    crossTenantBlocked = /not a member/i.test(String(err.message));
  }
  ok(crossTenantBlocked, "org_admin of Org A cannot inspect a user who belongs only to Org B");
}

// 4. Org-scoped role assignment, privilege-escalation protection, and org-scoped audit trail
await asUser(db, U_ADMIN_A, async () => {
  const { rows: assigned } = await db.query(
    `select public.access_org_assign_role($1, $2, 'corrector') as id`,
    [ORG_A, U_TEACHER_A],
  );
  ok(Boolean(assigned[0].id), "org_admin can assign corrector role within Org A");

  const { rows: events } = await db.query(
    `select organization_id, action, entity from public.access_org_get_audit_events($1, 20)`,
    [ORG_A],
  );
  ok(events.length >= 1 && events.every((e) => e.organization_id === ORG_A), "access_org_get_audit_events returns ONLY Org A events");
});

// Privilege escalation tests: org_admin cannot assign org_admin, org_owner, school_founder, or super_admin
for (const forbiddenRole of ["org_admin", "org_owner", "school_founder", "super_admin"]) {
  let failed = false;
  try {
    await asUser(db, U_ADMIN_A, async () => {
      await db.query(`select public.access_org_assign_role($1, $2, $3)`, [ORG_A, U_TEACHER_A, forbiddenRole]);
    });
  } catch {
    failed = true;
  }
  ok(failed, `org_admin is blocked from assigning ${forbiddenRole}`);
}

// org_owner CAN assign org_admin in Org A, CANNOT assign school_founder or super_admin, CANNOT act on Org B
await asUser(db, U_OWNER_A, async () => {
  const { rows } = await db.query(`select public.access_org_assign_role($1, $2, 'org_admin') as id`, [ORG_A, U_TEACHER_A]);
  ok(Boolean(rows[0].id), "org_owner can assign org_admin in Org A");
  await db.query(`select public.access_org_revoke_role($1, $2)`, [ORG_A, rows[0].id]);
  ok(true, "org_owner can revoke org_admin in Org A");
});

for (const forbiddenRole of ["school_founder", "org_owner", "super_admin"]) {
  let failed = false;
  try {
    await asUser(db, U_OWNER_A, async () => {
      await db.query(`select public.access_org_assign_role($1, $2, $3)`, [ORG_A, U_TEACHER_A, forbiddenRole]);
    });
  } catch {
    failed = true;
  }
  ok(failed, `org_owner is blocked from assigning ${forbiddenRole}`);
}

// Cross-tenant & non-manager blocks
for (const [label, uid, targetOrg] of [
  ["org_owner on Org B", U_OWNER_A, ORG_B],
  ["teacher on Org A", U_TEACHER_A, ORG_A],
  ["school_founder on Org A", U_FOUNDER_A, ORG_A],
]) {
  let failed = false;
  try {
    await asUser(db, uid, async () => {
      await db.query(`select public.access_org_assign_role($1, $2, 'corrector')`, [targetOrg, U_TEACHER_A]);
    });
  } catch {
    failed = true;
  }
  ok(failed, `${label} cannot call access_org_assign_role`);
}

// 5. School Founder operational read access (Org A visible, Org B invisible, sensitive tables invisible, writes/storage blocked)
await asUser(db, U_FOUNDER_A, async () => {
  const operationalTables = [
    ["exams", "organization_id"],
    ["quizzes", "organization_id"],
    ["quiz_sessions", "organization_id"],
    ["questions", "organization_id"],
    ["students", "organization_id"],
    ["student_enrollments", "organization_id"],
    ["classes", "organization_id"],
    ["competitions", "organization_id"],
    ["proctoring_rooms", "organization_id"],
    ["proctoring_incidents", "organization_id"],
    ["grading_rubrics", "organization_id"],
  ];
  for (const [table, orgCol] of operationalTables) {
    const { rows } = await db.query(`select ${orgCol} as org_id from public.${table}`);
    ok(rows.length === 1 && rows[0].org_id === ORG_A, `Founder reads ONLY Org A rows from ${table} (got ${rows.length})`);
  }

  for (const child of ["exam_candidates", "exam_attempts", "exam_answers"]) {
    const { rows } = await db.query(`select id from public.${child}`);
    ok(rows.length === 1 && rows[0].id.endsWith("000000000001"), `Founder reads ONLY Org A rows from child table ${child}`);
  }

  for (const sensitive of [
    "audit_logs", "payment_requests", "invitations", "proctoring_recordings",
    "competition_access_codes", "exam_lockdown_challenges", "support_tickets", "organization_admin_setup",
  ]) {
    const { rows } = await db.query(`select count(*)::int as c from public.${sensitive}`);
    ok(rows[0].c === 0, `Founder sees ZERO rows in sensitive table ${sensitive}`);
  }

  const { rows: privateStorage } = await db.query(`select count(*)::int as c from storage.objects where bucket_id = 'student-imports'`);
  ok(privateStorage[0].c === 0, "Founder sees ZERO rows in private storage.objects buckets (student-imports)");
  const { rows: publicLogo } = await db.query(`select count(*)::int as c from storage.objects where bucket_id = 'org-logos'`);
  ok(publicLogo[0].c === 1, "Founder can still render public org-logos assets");
});

// Founder storage write/delete blocks
for (const sql of [
  `insert into storage.objects(bucket_id, name) values ('org-logos', 'hacked.png')`,
  `delete from storage.objects where bucket_id = 'org-logos'`,
]) {
  let blocked = false;
  try {
    await asUser(db, U_FOUNDER_A, async () => {
      const res = await db.query(sql);
      if (res.affectedRows === 0) blocked = true;
    });
  } catch {
    blocked = true;
  }
  ok(blocked, `Founder storage mutation blocked: ${sql.slice(0, 42)}...`);
}

// Founder write blocks
for (const sql of [
  `insert into public.exams(id, organization_id, title) values (gen_random_uuid(), '${ORG_A}', 'Hacked Exam')`,
  `update public.exams set title = 'Tampered' where organization_id = '${ORG_A}'`,
  `delete from public.exams where organization_id = '${ORG_A}'`,
  `insert into public.students(id, organization_id, full_name) values (gen_random_uuid(), '${ORG_A}', 'Fake Student')`,
]) {
  let blocked = false;
  try {
    await asUser(db, U_FOUNDER_A, async () => {
      const res = await db.query(sql);
      if (res.affectedRows === 0) blocked = true;
    });
  } catch {
    blocked = true;
  }
  ok(blocked, `Founder write blocked: ${sql.slice(0, 42)}...`);
}

// 6. workspace_overview exact JSONB shape + join_code/access_code masking for Founder vs intact for Admin
await asUser(db, U_FOUNDER_A, async () => {
  const { rows } = await db.query(`select public.workspace_overview($1) as ov`, [ORG_A]);
  const ov = rows[0].ov;
  ok(ov.counts.exams === 1 && ov.counts.quizzes === 1 && ov.counts.questions === 1 && ov.counts.sessions === 1, "workspace_overview returns accurate counts for Founder");
  ok(ov.platform.slug === "ois" && ov.platform.name === "Oak International School", "workspace_overview preserves platform object shape");
  ok(ov.recentExams.length === 1 && ov.recentExams[0].access_code === null, "workspace_overview masks exam access_code to null for Founder");
  ok(ov.recentSessions.length === 1 && ov.recentSessions[0].join_code === null, "workspace_overview masks session join_code to null for Founder");
  ok(!JSON.stringify(ov).includes("OAK-EXAM-777") && !JSON.stringify(ov).includes("OAK-JOIN-999"), "Zero secret join/access codes in Founder workspace_overview payload");
});

await asUser(db, U_ADMIN_A, async () => {
  const { rows } = await db.query(`select public.workspace_overview($1) as ov`, [ORG_A]);
  const ov = rows[0].ov;
  ok(ov.recentExams[0].access_code === "OAK-EXAM-777" && ov.recentSessions[0].join_code === "OAK-JOIN-999", "workspace_overview preserves join/access codes for Org Admin");
});

// 7. accept_invitation syncs BOTH organization_members and access_user_roles for school_founder
{
  let wrongEmailRejected = false;
  try {
    await asUser(db, U_WRONG_EMAIL, async () => {
      await db.query(`select public.accept_invitation('oak-founder-invite-token-123', $1)`, [U_WRONG_EMAIL]);
    });
  } catch {
    wrongEmailRejected = true;
  }
  ok(wrongEmailRejected, "accept_invitation rejects a different email address");

  await asUser(db, U_INVITED_FOUNDER, async () => {
    const { rows } = await db.query(
      `select public.accept_invitation('oak-founder-invite-token-123', $1) as outcome`,
      [U_INVITED_FOUNDER],
    );
    ok(rows[0].outcome === "ok", "accept_invitation returns 'ok' for Infos@oisbenin.bj (case-insensitive email match)");
  });

  const { rows: mem } = await db.query(
    `select role, status from public.organization_members where user_id = $1 and organization_id = $2`,
    [U_INVITED_FOUNDER, ORG_A],
  );
  ok(mem.length === 1 && mem[0].role === "school_founder" && mem[0].status === "active", "accept_invitation inserts active school_founder organization_members row");

  const { rows: aur } = await db.query(
    `select r.slug from public.access_user_roles ur join public.access_roles r on r.id = ur.role_id where ur.user_id = $1 and ur.organization_id = $2`,
    [U_INVITED_FOUNDER, ORG_A],
  );
  ok(aur.length === 1 && aur[0].slug === "school_founder", "accept_invitation syncs school_founder into access_user_roles");
}

// 8. TypeScript routing, navAccess, and UI/API security static invariants
function loadTs(relPath) {
  const file = path.resolve(relPath);
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
  return m.exports;
}

const routing = loadTs("src/lib/roleRouting.ts");
const navAccess = loadTs("src/lib/navAccess.ts");

ok(
  routing.postAuthDestination(
    { platformRole: "user", role: "school_founder", hasOrg: true },
    null,
  ) === "/dashboard",
  "school_founder default landing path is /dashboard",
);
ok(
  routing.postAuthDestination(
    { platformRole: "user", role: "school_founder", hasOrg: true },
    "/dashboard/exams",
  ) === "/dashboard/exams",
  "school_founder preserves valid /dashboard/* next path",
);
ok(
  routing.postAuthDestination(
    { platformRole: "user", role: "school_founder", hasOrg: true },
    "/supervision",
  ) === "/supervision",
  "school_founder preserves /supervision next path",
);
ok(
  routing.postAuthDestination(
    { platformRole: "user", role: "school_founder", hasOrg: true },
    "/admin",
  ) === "/dashboard",
  "school_founder cannot use next hint to land in /admin",
);
ok(navAccess.canSeeAudience("operational", "school_founder") === true, "school_founder sees operational nav items");
ok(navAccess.canSeeAudience("managers", "school_founder") === false, "school_founder NEVER sees manager-only nav items");
ok(navAccess.canSeeAudience("staff", "school_founder") === false, "school_founder NEVER sees staff-only nav items");
ok(navAccess.canSeeAudience("operational", "student") === false, "student NEVER sees operational nav items");

// Verify security invariants across UI & API source files
const livekitSrc = readFileSync("src/app/api/livekit/token/route.ts", "utf8");
ok(livekitSrc.includes('"proctoring.manage"') && !livekitSrc.includes('"proctoring.view"'), "LiveKit token API requires proctoring.manage");

const proctorPageSrc = readFileSync("src/app/dashboard/exams/[id]/proctor/page.tsx", "utf8");
ok(proctorPageSrc.includes('"proctoring.manage"'), "Proctor room page requires proctoring.manage");

const monitorClientSrc = readFileSync("src/app/dashboard/exams/[id]/monitor/ExamMonitor.tsx", "utf8");
ok(monitorClientSrc.includes("canManage = true") && monitorClientSrc.includes("{canManage && (") && monitorClientSrc.includes("{canManage ? ("), "ExamMonitor gates pause/resume and messaging behind canManage");

const adminShellSrc = readFileSync("src/app/admin/AdminShell.tsx", "utf8");
ok(adminShellSrc.includes('href: "/admin/rbac"') && adminShellSrc.includes("admin.rbacManagement"), "Super Admin sidebar has dedicated RBAC & User Role Management nav item");

const orgRbacActionsSrc = readFileSync("src/app/dashboard/rbac/actions.ts", "utf8");
ok(orgRbacActionsSrc.includes('rpc("access_org_assign_role"') && orgRbacActionsSrc.includes('rpc("access_org_revoke_role"') && !orgRbacActionsSrc.includes("createAdminClient"), "Org RBAC server actions execute strictly through caller-scoped access_org_* RPCs (no service-role bypass)");

const orgRbacPageSrc = readFileSync("src/app/dashboard/rbac/page.tsx", "utf8");
ok(orgRbacPageSrc.includes('rpc("access_org_get_audit_events"') && orgRbacPageSrc.includes('rpc("access_org_inspect_permissions"'), "Org RBAC page loads audit trail and effective permissions via org-scoped RPCs");

for (const adminPage of [
  "src/app/dashboard/billing/page.tsx",
  "src/app/dashboard/settings/page.tsx",
  "src/app/dashboard/platform/page.tsx",
  "src/app/dashboard/grading/page.tsx",
  "src/app/dashboard/teachers/page.tsx",
  "src/app/dashboard/team/page.tsx",
  "src/app/dashboard/accounts/page.tsx",
  "src/app/dashboard/rbac/page.tsx",
]) {
  const src = readFileSync(adminPage, "utf8");
  ok(
    src.includes('/dashboard?e=forbidden') || src.includes('org.role === "school_founder"'),
    `${adminPage} redirects unauthorized/Founder direct access to /dashboard?e=forbidden`,
  );
}

const examDetailSrc = readFileSync("src/app/dashboard/exams/[id]/page.tsx", "utf8");
ok(examDetailSrc.includes("canManageLinks") && examDetailSrc.includes("canManageProctor"), "Exam detail page masks candidate tokens/codes and proctoring controls");

const resultsPageSrc = readFileSync("src/app/dashboard/results/page.tsx", "utf8");
ok(resultsPageSrc.includes("isOperationalRole") && resultsPageSrc.includes("canManageLinks"), "Results page opens read-only to Founder while masking individual access_token links");

await db.close();
console.log(`\n${checks} RBAC UI & Founder Dashboard Access checks passed (PGlite + Routing + Security Invariants).`);
