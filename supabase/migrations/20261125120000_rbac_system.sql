-- ═════════════════════════════════════════════════════════════════════════════════
-- EVALORA 20261125120000 — Centralized Role-Based Access Control (RBAC) system
--
-- Adds:
--   1. access_permissions        — permission catalog (key, name, category, scope…)
--   2. access_roles              — role definitions (system vs custom, org-scoped)
--   3. access_role_permissions   — role → permission grants (grant / explicit deny)
--   4. access_user_roles         — user → role assignments (organization-scoped)
--   5. access_permission_overrides — explicit per-user/per-org permission overrides
--
-- All changes are additive: no existing tables, columns, policies or data are
-- altered. Existing platform_role / organization_members.role continue to work
-- alongside the new system; the resolver layers RBAC on top of them.
-- ═════════════════════════════════════════════════════════════════════════════════

-- ─── Permission catalog ────────────────────────────────────────────────────
create table public.access_permissions (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  description text,
  category text not null,
  scope text not null default 'organization' check (scope in ('system','organization')),
  is_system boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_access_permissions_key on public.access_permissions(key);
create index idx_access_permissions_category on public.access_permissions(category);

-- ─── Role definitions ──────────────────────────────────────────────────────
create table public.access_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  type text not null default 'custom' check (type in ('system','custom')),
  is_system boolean not null default false,
  is_active boolean not null default true,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_access_roles_slug on public.access_roles(slug);
create index idx_access_roles_org on public.access_roles(organization_id);

-- ─── Role → permission assignments ─────────────────────────────────────────
create table public.access_role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.access_roles(id) on delete cascade,
  permission_id uuid not null references public.access_permissions(id) on delete cascade,
  granted boolean not null default true,
  created_at timestamptz not null default now(),
  unique (role_id, permission_id)
);

create index idx_access_role_permissions_role on public.access_role_permissions(role_id);
create index idx_access_role_permissions_perm on public.access_role_permissions(permission_id);

-- ─── User → role assignments (organization-scoped) ─────────────────────────
create table public.access_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.access_roles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  status text not null default 'active' check (status in ('active','revoked')),
  assigned_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (user_id, role_id, organization_id)
);

create index idx_access_user_roles_user on public.access_user_roles(user_id);
create index idx_access_user_roles_org on public.access_user_roles(organization_id);
create index idx_access_user_roles_role on public.access_user_roles(role_id);

-- ─── Explicit per-user / per-org permission overrides ──────────────────────
create table public.access_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  permission_id uuid not null references public.access_permissions(id) on delete cascade,
  granted boolean not null default true,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (user_id, organization_id, permission_id)
);

create index idx_access_permission_overrides_user on public.access_permission_overrides(user_id);
create index idx_access_permission_overrides_org on public.access_permission_overrides(organization_id);

-- ─── RLS ───────────────────────────────────────────────────────────────────
alter table public.access_permissions enable row level security;
alter table public.access_roles enable row level security;
alter table public.access_role_permissions enable row level security;
alter table public.access_user_roles enable row level security;
alter table public.access_permission_overrides enable row level security;

-- Permissions: readable by all authenticated; writable by super admin
create policy access_perm_select on public.access_permissions for select to authenticated using (true);
create policy access_perm_write on public.access_permissions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Roles: readable by all authenticated; writable by super admin
create policy access_role_select on public.access_roles for select to authenticated using (public.is_super_admin() or organization_id is null or public.is_org_member(organization_id));
create policy access_role_write on public.access_roles for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Role permissions: readable by all authenticated; writable by super admin
create policy access_roleperm_select on public.access_role_permissions for select to authenticated using (public.is_super_admin() or exists(select 1 from public.access_roles r where r.id=role_id and (r.organization_id is null or public.is_org_member(r.organization_id))));
create policy access_roleperm_write on public.access_role_permissions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- User roles: readable by org members + super admin; writable by super admin
create policy access_userrole_select on public.access_user_roles for select to authenticated
  using (public.is_super_admin()
     or public.is_org_member(organization_id)
     or user_id = auth.uid());
create policy access_userrole_write on public.access_user_roles for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Permission overrides: readable by org members + super admin; writable by super admin
create policy access_override_select on public.access_permission_overrides for select to authenticated
  using (public.is_super_admin()
     or public.is_org_member(organization_id)
     or user_id = auth.uid());
create policy access_override_write on public.access_permission_overrides for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Authoritative resolver: the caller may inspect only their own effective access.
-- An override grant NEVER defeats an explicit role deny. All grants require
-- active membership, active tenant/profile/role, matching role scope and an
-- enabled, known, organization-level permission.
create or replace function public.access_has_permission(
  p_user_id uuid, p_organization_id uuid, p_permission_key text
) returns boolean language plpgsql security definer
set search_path = public, pg_temp stable as $$
declare v_permission public.access_permissions; v_override boolean;
begin
  if auth.uid() is distinct from p_user_id and not public.is_super_admin() then return false; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and status='active') then return false; end if;
  select * into v_permission from public.access_permissions where key=p_permission_key;
  if not found or not v_permission.enabled then return false; end if;
  if exists(select 1 from public.profiles where id=p_user_id and platform_role='super_admin' and status='active') then return true; end if;
  if v_permission.scope <> 'organization' then return false; end if;
  -- Founder is a ceiling as well as a role: extra roles/overrides cannot
  -- turn a supervision-only account into an academic operator.
  if exists(select 1 from public.access_user_roles ur join public.access_roles r on r.id=ur.role_id
      where ur.user_id=p_user_id and ur.status='active' and r.slug='school_founder'
      and (ur.expires_at is null or ur.expires_at>now())) and
    (p_permission_key !~ '\.(view|analytics|monitor)$' or p_permission_key ~ '^(users|students|roles|permissions|proctoring)\.') then return false; end if;
  if not exists(select 1 from public.organizations where id=p_organization_id and status='active') then return false; end if;
  if not exists(select 1 from public.organization_members where user_id=p_user_id and organization_id=p_organization_id and status='active') then return false; end if;
  select granted into v_override from public.access_permission_overrides
    where user_id=p_user_id and organization_id=p_organization_id and permission_id=v_permission.id;
  if v_override = false then return false; end if;
  if exists (
    select 1 from public.access_user_roles ur join public.access_roles r on r.id=ur.role_id
    join public.access_role_permissions rp on rp.role_id=r.id
    where ur.user_id=p_user_id and ur.organization_id=p_organization_id and ur.status='active'
      and (ur.expires_at is null or ur.expires_at>now()) and r.is_active
      and (r.organization_id is null or r.organization_id=p_organization_id)
      and rp.permission_id=v_permission.id and not rp.granted
  ) then return false; end if;
  return coalesce(v_override,false) or exists (
    select 1 from public.access_user_roles ur join public.access_roles r on r.id=ur.role_id
    join public.access_role_permissions rp on rp.role_id=r.id
    where ur.user_id=p_user_id and ur.organization_id=p_organization_id and ur.status='active'
      and (ur.expires_at is null or ur.expires_at>now()) and r.is_active
      and (r.organization_id is null or r.organization_id=p_organization_id)
      and rp.permission_id=v_permission.id and rp.granted
  );
end $$;
revoke all on function public.access_has_permission(uuid,uuid,text) from public, anon;
grant execute on function public.access_has_permission(uuid,uuid,text) to authenticated;

-- ─── Seed: core system permissions ─────────────────────────────────────────
insert into public.access_permissions (key, name, description, category, scope, is_system) values
-- Dashboard and analytics
('dashboard.view', 'View Dashboard', 'View the organization dashboard overview.', 'Dashboard and analytics', 'organization', true),
('dashboard.analytics', 'View Analytics', 'View organizational analytics and metrics.', 'Dashboard and analytics', 'organization', true),

-- User accounts and authentication
('users.view', 'View Users', 'View user accounts and memberships.', 'User accounts and authentication', 'organization', true),
('users.create', 'Create Users', 'Create new user accounts.', 'User accounts and authentication', 'organization', true),
('users.edit', 'Edit Users', 'Edit user account details.', 'User accounts and authentication', 'organization', true),
('users.delete', 'Delete Users', 'Delete user accounts.', 'User accounts and authentication', 'organization', true),
('users.suspend', 'Suspend Users', 'Suspend or reactivate user accounts.', 'User accounts and authentication', 'organization', true),

-- Organizations and memberships
('organizations.view', 'View Organizations', 'View organization details.', 'Organizations and memberships', 'organization', true),
('organizations.edit', 'Edit Organizations', 'Edit organization settings and details.', 'Organizations and memberships', 'organization', true),
('organizations.manage_members', 'Manage Members', 'Add, remove and manage organization members.', 'Organizations and memberships', 'organization', true),

-- Classes and academic structures
('classes.view', 'View Classes', 'View classes and academic structures.', 'Classes and academic structures', 'organization', true),
('classes.create', 'Create Classes', 'Create new classes.', 'Classes and academic structures', 'organization', true),
('classes.edit', 'Edit Classes', 'Edit class details.', 'Classes and academic structures', 'organization', true),
('classes.delete', 'Delete Classes', 'Delete classes.', 'Classes and academic structures', 'organization', true),

-- Question bank and question management
('questions.view', 'View Questions', 'View questions in the question bank.', 'Question bank and question management', 'organization', true),
('questions.create', 'Create Questions', 'Create new questions.', 'Question bank and question management', 'organization', true),
('questions.edit', 'Edit Questions', 'Edit existing questions.', 'Question bank and question management', 'organization', true),
('questions.delete', 'Delete Questions', 'Delete questions.', 'Question bank and question management', 'organization', true),
('questions.publish', 'Publish Questions', 'Publish questions for use in assessments.', 'Question bank and question management', 'organization', true),

-- Paper Builder and assessment design
('paper_builder.view', 'View Paper Builder', 'View the Question Paper Builder.', 'Paper Builder and assessment design', 'organization', true),
('paper_builder.create', 'Create Papers', 'Create examination papers.', 'Paper Builder and assessment design', 'organization', true),
('paper_builder.edit', 'Edit Papers', 'Edit examination papers.', 'Paper Builder and assessment design', 'organization', true),
('paper_builder.delete', 'Delete Papers', 'Delete examination papers.', 'Paper Builder and assessment design', 'organization', true),
('paper_builder.publish', 'Publish Papers', 'Publish examination papers.', 'Paper Builder and assessment design', 'organization', true),

-- Examination management
('exams.view', 'View Examinations', 'View examinations.', 'Examination management', 'organization', true),
('exams.create', 'Create Examinations', 'Create new examinations.', 'Examination management', 'organization', true),
('exams.edit', 'Edit Examinations', 'Edit examination settings.', 'Examination management', 'organization', true),
('exams.delete', 'Delete Examinations', 'Delete examinations.', 'Examination management', 'organization', true),
('exams.schedule', 'Schedule Examinations', 'Schedule examination sessions.', 'Examination management', 'organization', true),
('exams.monitor', 'Monitor Examinations', 'Monitor live examination sessions.', 'Examination management', 'organization', true),

-- Quizzes and live competitions
('quizzes.view', 'View Quizzes', 'View quizzes.', 'Quizzes and live competitions', 'organization', true),
('quizzes.create', 'Create Quizzes', 'Create new quizzes.', 'Quizzes and live competitions', 'organization', true),
('quizzes.edit', 'Edit Quizzes', 'Edit quiz settings.', 'Quizzes and live competitions', 'organization', true),
('quizzes.delete', 'Delete Quizzes', 'Delete quizzes.', 'Quizzes and live competitions', 'organization', true),
('competitions.view', 'View Competitions', 'View live competitions.', 'Quizzes and live competitions', 'organization', true),
('competitions.create', 'Create Competitions', 'Create live competitions.', 'Quizzes and live competitions', 'organization', true),
('competitions.edit', 'Edit Competitions', 'Edit competition settings.', 'Quizzes and live competitions', 'organization', true),
('competitions.delete', 'Delete Competitions', 'Delete competitions.', 'Quizzes and live competitions', 'organization', true),

-- Marking and grading
('grading.view', 'View Grading', 'View marking and grading.', 'Marking and grading', 'organization', true),
('grading.edit', 'Edit Grading', 'Edit marks and grades.', 'Marking and grading', 'organization', true),
('grading.validate', 'Validate Grading', 'Validate and confirm grading.', 'Marking and grading', 'organization', true),

-- Results management and publication
('results.view', 'View Results', 'View results and result summaries.', 'Results management and publication', 'organization', true),
('results.publish', 'Publish Results', 'Publish validated results.', 'Results management and publication', 'organization', true),
('results.unpublish', 'Unpublish Results', 'Unpublish results.', 'Results management and publication', 'organization', true),
('results.validate', 'Validate Results', 'Validate results before publication.', 'Results management and publication', 'organization', true),

-- Candidate admission links and exam access
('candidate_links.view', 'View Candidate Links', 'View candidate admission links.', 'Candidate admission links and exam access', 'organization', true),
('candidate_links.create', 'Create Candidate Links', 'Create candidate admission links.', 'Candidate admission links and exam access', 'organization', true),
('candidate_links.edit', 'Edit Candidate Links', 'Edit candidate admission links.', 'Candidate admission links and exam access', 'organization', true),
('candidate_links.revoke', 'Revoke Candidate Links', 'Revoke candidate admission links.', 'Candidate admission links and exam access', 'organization', true),

-- Students and candidate records
('students.view', 'View Students', 'View student records.', 'Students and candidate records', 'organization', true),
('students.create', 'Create Students', 'Create student records.', 'Students and candidate records', 'organization', true),
('students.edit', 'Edit Students', 'Edit student records.', 'Students and candidate records', 'organization', true),
('students.delete', 'Delete Students', 'Delete student records.', 'Students and candidate records', 'organization', true),

-- Proctoring and monitoring
('proctoring.view', 'View Proctoring', 'View proctoring sessions and incidents.', 'Proctoring and monitoring', 'organization', true),
('proctoring.manage', 'Manage Proctoring', 'Manage proctoring configuration.', 'Proctoring and monitoring', 'organization', true),

-- Reports and analytics
('reports.view', 'View Reports', 'View reports and exports.', 'Reports and analytics', 'organization', true),
('reports.export', 'Export Reports', 'Export reports and data.', 'Reports and analytics', 'organization', true),

-- Subscription and billing
('billing.view', 'View Billing', 'View subscription and billing details.', 'Subscription and billing', 'organization', true),
('billing.manage', 'Manage Billing', 'Manage subscription and billing.', 'Subscription and billing', 'organization', true),

-- System configuration
('system.configure', 'Configure System', 'Configure system-wide settings.', 'System configuration', 'system', true),
('system.manage_plans', 'Manage Plans', 'Manage subscription plans.', 'System configuration', 'system', true),
('system.manage_modules', 'Manage Modules', 'Enable/disable platform modules.', 'System configuration', 'system', true),

-- Security and audit logs
('security.view_audit', 'View Audit Logs', 'View audit logs.', 'Security and audit logs', 'system', true),
('security.manage_security', 'Manage Security', 'Manage security settings.', 'Security and audit logs', 'system', true),

-- Role and permission administration
('roles.view', 'View Roles', 'View roles and permissions.', 'Role and permission administration', 'system', true),
('roles.create', 'Create Roles', 'Create custom roles.', 'Role and permission administration', 'system', true),
('roles.edit', 'Edit Roles', 'Edit role definitions and permissions.', 'Role and permission administration', 'system', true),
('roles.delete', 'Delete Roles', 'Delete custom roles.', 'Role and permission administration', 'system', true),
('roles.assign', 'Assign Roles', 'Assign roles to users.', 'Role and permission administration', 'system', true),
('roles.revoke', 'Revoke Roles', 'Revoke role assignments.', 'Role and permission administration', 'system', true);

-- ─── Seed: core system roles ────────────────────────────────────────────────
insert into public.access_roles (name, slug, description, type, is_system, is_active, organization_id) values
('Super Admin', 'super_admin', 'Full platform access across all organizations.', 'system', true, true, null),
('Organization Owner', 'org_owner', 'Full control within their organization.', 'system', true, true, null),
('Organization Admin', 'org_admin', 'Administrative access within their organization.', 'system', true, true, null),
('Teacher', 'teacher', 'Teaching staff: create questions, quizzes, exams; mark.', 'system', true, true, null),
('Organizer', 'organizer', 'Organizes assessments and competitions.', 'system', true, true, null),
('Supervisor', 'supervisor', 'Supervises proctoring and live sessions.', 'system', true, true, null),
('Corrector', 'corrector', 'Marks and grades candidate answers.', 'system', true, true, null),
('School Founder / Institutional Supervisor', 'school_founder',
 'Institutional supervision through privacy-preserving summaries and examination metadata. No academic or administrative mutations.', 'system', true, true, null),
('Candidate', 'candidate', 'Candidate taking examinations.', 'system', true, true, null),
('Student', 'student', 'Student participant.', 'system', true, true, null),
('Parent', 'parent', 'Guardian with limited visibility.', 'system', true, true, null);

-- ─── Seed: role → permission mappings for system roles ──────────────────────
-- Helper for readability: we insert grants below using permission keys.
-- Super Admin: all permissions (system scope) — effectively everything.
insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
cross join public.access_permissions p
where r.slug = 'super_admin'
  and r.is_system
  and p.is_system;

-- Organization Owner: all organization-scoped permissions.
insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
cross join public.access_permissions p
where r.slug = 'org_owner'
  and r.is_system
  and p.scope = 'organization';

-- Organization Admin: most organization-scoped permissions (no user/role management).
insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
cross join public.access_permissions p
where r.slug = 'org_admin'
  and r.is_system
  and p.scope = 'organization'
  and p.key not in (
    'users.delete','users.suspend','roles.create','roles.edit','roles.delete','roles.assign','roles.revoke',
    'system.configure','system.manage_plans','system.manage_modules','security.manage_security'
  );

-- Teacher: create/view questions, quizzes, exams; mark; view results.
insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
cross join public.access_permissions p
where r.slug = 'teacher'
  and r.is_system
  and p.key in (
    'dashboard.view','dashboard.analytics',
    'questions.view','questions.create','questions.edit',
    'paper_builder.view','paper_builder.create','paper_builder.edit',
    'exams.view','exams.create','exams.edit','exams.monitor',
    'quizzes.view','quizzes.create','quizzes.edit',
    'grading.view','grading.edit',
    'results.view',
    'students.view','students.create','students.edit',
    'proctoring.view',
    'reports.view'
  );

-- Organizer: create/edit exams, quizzes, competitions; manage candidates.
insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
cross join public.access_permissions p
where r.slug = 'organizer'
  and r.is_system
  and p.key in (
    'dashboard.view','dashboard.analytics',
    'questions.view','questions.create','questions.edit',
    'paper_builder.view','paper_builder.create','paper_builder.edit',
    'exams.view','exams.create','exams.edit','exams.schedule','exams.monitor',
    'quizzes.view','quizzes.create','quizzes.edit',
    'competitions.view','competitions.create','competitions.edit',
    'candidate_links.view','candidate_links.create','candidate_links.edit',
    'students.view','students.create','students.edit',
    'proctoring.view','proctoring.manage',
    'results.view','reports.view'
  );

-- Supervisor: view exams, sessions, proctoring; monitor.
insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
cross join public.access_permissions p
where r.slug = 'supervisor'
  and r.is_system
  and p.key in (
    'dashboard.view','dashboard.analytics',
    'exams.view','exams.monitor',
    'quizzes.view',
    'competitions.view',
    'grading.view',
    'results.view',
    'students.view',
    'proctoring.view','proctoring.manage',
    'reports.view'
  );

-- Corrector: view and grade answers; view results.
insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
cross join public.access_permissions p
where r.slug = 'corrector'
  and r.is_system
  and p.key in (
    'dashboard.view','dashboard.analytics',
    'exams.view',
    'grading.view','grading.edit',
    'results.view',
    'students.view',
    'reports.view'
  );

-- School Founder / Institutional Supervisor: read-only supervisory access.
insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
cross join public.access_permissions p
where r.slug = 'school_founder'
  and r.is_system
  and p.key in (
    'dashboard.view','dashboard.analytics',
    'classes.view',
    'questions.view',
    'paper_builder.view',
    'exams.view','exams.monitor',
    'quizzes.view',
    'competitions.view',
    'grading.view',
    'results.view',
    'candidate_links.view',


    'reports.view',
    'billing.view'
  );

-- Candidate: minimal — view own exams/results only (enforced by RLS, not role).
insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
cross join public.access_permissions p
where r.slug = 'candidate'
  and r.is_system
  and p.key in ('dashboard.view','results.view');

-- Student: minimal — view own data only (enforced by RLS, not role).
insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
cross join public.access_permissions p
where r.slug = 'student'
  and r.is_system
  and p.key in ('dashboard.view','results.view');

-- Parent: minimal — view own child data only (enforced by RLS, not role).
insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
cross join public.access_permissions p
where r.slug = 'parent'
  and r.is_system
  and p.key in ('dashboard.view','results.view');

-- ─── Comment ───────────────────────────────────────────────────────────────
comment on table public.access_permissions is 'Central permission catalog for the RBAC system.';
comment on table public.access_roles is 'Role definitions: system roles (protected) and custom roles.';
comment on table public.access_role_permissions is 'Grants and explicit denies linking roles to permissions.';
comment on table public.access_user_roles is 'Organization-scoped user-to-role assignments.';
comment on table public.access_permission_overrides is 'Explicit per-user permission overrides (DENY always wins).';
comment on function public.access_has_permission(uuid, uuid, text) is 'Centralized effective-permission resolver for the RBAC system.';
-- Fail early rather than allowing cross-tenant or platform-level assignments.
create function public.access_validate_assignment() returns trigger language plpgsql
set search_path=public,pg_temp as $$
declare r public.access_roles;
begin
  select * into strict r from public.access_roles where id=new.role_id;
  if r.slug='super_admin' then raise exception 'Platform administrators are managed separately'; end if;
  if new.status='active' and (not r.is_active or (r.organization_id is not null and r.organization_id<>new.organization_id)) then
    raise exception 'Inactive or out-of-scope role'; end if;
  if new.status='active' and not exists(select 1 from public.organization_members
      where organization_id=new.organization_id and user_id=new.user_id and status='active') then
    raise exception 'Active organization membership required'; end if;
  return new;
end $$;
create trigger access_assignment_guard before insert or update on public.access_user_roles
for each row execute function public.access_validate_assignment();

-- Transactional, append-only security change history (including direct DB writes).
create table public.access_audit_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid, organization_id uuid,
  action text not null, entity text not null, previous_state jsonb, new_state jsonb,
  created_at timestamptz not null default now()
);
alter table public.access_audit_events enable row level security;
create policy access_audit_read on public.access_audit_events for select to authenticated using(public.is_super_admin());
revoke all on public.access_audit_events from anon, authenticated;
grant select on public.access_audit_events to authenticated;
create function public.access_log_change() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
begin
  insert into public.access_audit_events(actor_id,organization_id,action,entity,previous_state,new_state)
  values(auth.uid(), nullif(coalesce(to_jsonb(new)->>'organization_id',to_jsonb(old)->>'organization_id'),'')::uuid,
    tg_op,tg_table_name,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
  return coalesce(new,old);
end $$;
create trigger access_roles_audit after insert or update or delete on public.access_roles for each row execute function public.access_log_change();
create trigger access_permissions_audit after insert or update or delete on public.access_permissions for each row execute function public.access_log_change();
create trigger access_role_permissions_audit after insert or update or delete on public.access_role_permissions for each row execute function public.access_log_change();
create trigger access_user_roles_audit after insert or update or delete on public.access_user_roles for each row execute function public.access_log_change();
create trigger access_overrides_audit after insert or update or delete on public.access_permission_overrides for each row execute function public.access_log_change();

-- Atomic role mutation: validation, role metadata and permission changes share
-- one transaction. Platform Super Admin status is never changed by this RPC.
create function public.access_save_role(
 p_slug text, p_name text, p_description text, p_organization_id uuid,
 p_active boolean, p_permission_keys text[], p_create boolean
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.access_roles; v_role_id uuid;
begin
 if not public.is_super_admin() then raise exception 'Active Super Admin required' using errcode='42501'; end if;
 if p_slug !~ '^[a-z][a-z0-9_-]{1,79}$' then raise exception 'Invalid role identifier'; end if;
 if p_permission_keys is not null and exists(select 1 from unnest(p_permission_keys) k where not exists(select 1 from public.access_permissions p where p.key=k)) then raise exception 'Unknown permission identifier'; end if;
 if p_create then
   if length(trim(p_name)) not between 2 and 120 then raise exception 'Role name must have 2 to 120 characters'; end if;
   insert into public.access_roles(name,slug,description,organization_id) values(trim(p_name),p_slug,p_description,p_organization_id) returning id into v_role_id;
 else
   select * into strict r from public.access_roles where slug=p_slug for update;
   v_role_id:=r.id;
   if r.is_system and r.slug<>'school_founder' then raise exception 'Protected system role'; end if;
   if not r.is_system then
     update public.access_roles set name=coalesce(nullif(trim(p_name),''),name),description=p_description,is_active=coalesce(p_active,is_active),updated_at=now() where id=v_role_id;
   end if;
 end if;
 if p_slug='school_founder' and p_permission_keys is not null and exists(select 1 from unnest(p_permission_keys) k where k !~ '\.(view|analytics|monitor)$' or k like 'proctoring.%' or k like 'users.%' or k like 'students.%' or k like 'roles.%' or k like 'permissions.%') then raise exception 'Founder permissions must remain privacy-safe and read-only'; end if;
 if p_permission_keys is not null then
   delete from public.access_role_permissions where access_role_permissions.role_id=v_role_id;
   insert into public.access_role_permissions(role_id,permission_id,granted) select v_role_id,id,true from public.access_permissions where key=any(p_permission_keys);
 end if;
 return v_role_id;
end $$;
revoke all on function public.access_save_role(text,text,text,uuid,boolean,text[],boolean) from public, anon;
grant execute on function public.access_save_role(text,text,text,uuid,boolean,text[],boolean) to authenticated;

-- System role identity is immutable through direct REST writes as well.
create function public.access_protect_system_role() returns trigger language plpgsql
set search_path=public,pg_temp as $$
begin
 if old.is_system and (tg_op='DELETE' or new.slug is distinct from old.slug
   or new.name is distinct from old.name or new.is_system is distinct from old.is_system
   or new.type is distinct from old.type or new.organization_id is distinct from old.organization_id) then
   raise exception 'Protected system role identity'; end if;
 return coalesce(new,old);
end $$;
create trigger access_system_role_guard before update or delete on public.access_roles
for each row execute function public.access_protect_system_role();

create function public.access_inspect_permissions(p_user uuid,p_org uuid) returns jsonb
language plpgsql security definer stable set search_path=public,pg_temp as $$
declare result jsonb; begin
 if not public.is_super_admin() then raise exception 'Active Super Admin required' using errcode='42501'; end if;
 select jsonb_object_agg(key,public.access_has_permission(p_user,p_org,key)) into result from public.access_permissions;
 return coalesce(result,'{}'::jsonb);
end $$;
revoke all on function public.access_inspect_permissions(uuid,uuid) from public,anon;
grant execute on function public.access_inspect_permissions(uuid,uuid) to authenticated;

-- Explicit ACLs: never depend on deployment-specific default privileges.
revoke all on public.access_permissions,public.access_roles,public.access_role_permissions,public.access_user_roles,public.access_permission_overrides from anon;
grant select,insert,update,delete on public.access_permissions,public.access_roles,public.access_role_permissions,public.access_user_roles,public.access_permission_overrides to authenticated;
