-- ═══════════════════════════════════════════════════════════════════════
-- EVALORA 0003 — Owner Control Center
--  • Database-level platform-owner permission profile (org_role bypass)
--  • Organizations: full profile fields + archived status
--  • Academics: academic years, levels, departments, subjects, classes,
--    student roster, enrollments
--  • Competitions: first-class entities, multi-code access control,
--    registrations (live play still runs on quiz_sessions)
--  • Payments: manual entry sources, payer/date/description, cancelled
--  • Subscriptions: source labelling, grants, limit overrides, suspended
--  • Platform-owned organization for the Primary Super Admin
-- Tenant isolation for ordinary users is unchanged: every new policy is
-- expressed through the same org helpers; only is_super_admin() widens.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Platform-owner permission profile ────────────────────────────────
-- The Super Admin IS the platform owner: org_role() resolves to 'owner'
-- for an active super admin, so is_org_member / can_manage_org /
-- can_create_content — and therefore every org-scoped RLS policy —
-- recognize the owner in every workspace. Security controls (RLS,
-- privilege trigger, audit) remain fully active.
create or replace function public.org_role(p_org uuid)
returns text language sql security definer set search_path = public stable as $$
  select case
    when public.is_super_admin() then 'owner'
    else (select role from public.organization_members
          where organization_id = p_org and user_id = auth.uid() and status = 'active' limit 1)
  end;
$$;

-- ─── Organizations: full profile + lifecycle ──────────────────────────
alter table public.organizations drop constraint if exists organizations_status_check;
alter table public.organizations add constraint organizations_status_check
  check (status in ('active','suspended','archived'));
alter table public.organizations drop constraint if exists organizations_type_check;
alter table public.organizations add constraint organizations_type_check
  check (type in ('school','university','training_center','exam_board','educational_institution','independent','other'));
alter table public.organizations
  add column if not exists description text,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists logo_url text;

-- ─── Members: students are a first-class role ─────────────────────────
alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members add constraint organization_members_role_check
  check (role in ('owner','admin','teacher','organizer','supervisor','corrector','participant','candidate','parent','student'));

-- ─── Subscriptions: grants, overrides, suspension ─────────────────────
alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('trialing','active','past_due','expired','cancelled','suspended'));
alter table public.subscriptions
  add column if not exists source text not null default 'paid'
    check (source in ('paid','admin_grant','trial','complimentary')),
  add column if not exists granted_by uuid references public.profiles(id),
  add column if not exists limits_override jsonb,
  add column if not exists notes text;

-- ─── Payments: manual operations ──────────────────────────────────────
alter table public.payment_requests drop constraint if exists payment_requests_status_check;
alter table public.payment_requests add constraint payment_requests_status_check
  check (status in ('pending','approved','rejected','expired','refunded','cancelled'));
alter table public.payment_requests alter column plan_id drop not null;
alter table public.payment_requests
  add column if not exists source text not null default 'portal'
    check (source in ('portal','manual','adjustment')),
  add column if not exists payer_name text,
  add column if not exists paid_at timestamptz,
  add column if not exists description text;

-- Payment configuration (methods/currencies edited in Platform Settings)
insert into public.platform_settings (key, value) values
  ('payment_config', '{"methods":["Bank transfer","Mobile money","Cash","Manual deposit","Card","Other"],"currencies":["USD","EUR","XOF","NGN","GHS","KES"],"categories":["Subscription","Service","Competition entry","Other"]}'::jsonb)
on conflict (key) do nothing;

-- ─── Academics ────────────────────────────────────────────────────────
create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  starts_on date,
  ends_on date,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_ay_one_current
  on public.academic_years(organization_id) where is_current;

create table if not exists public.education_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  code text,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  level_id uuid references public.education_levels(id) on delete set null,
  teacher_id uuid references public.profiles(id) on delete set null,
  name text not null,
  capacity int,
  room text,
  created_at timestamptz not null default now()
);
create index if not exists idx_class_org on public.classes(organization_id);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null,
  email text,
  student_ref text,
  gender text,
  date_of_birth date,
  guardian_name text,
  guardian_contact text,
  status text not null default 'active'
    check (status in ('active','suspended','graduated','withdrawn')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_students_org on public.students(organization_id, status);

create table if not exists public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  status text not null default 'active'
    check (status in ('active','completed','withdrawn')),
  enrolled_at timestamptz not null default now(),
  unique (student_id, class_id)
);
create index if not exists idx_enroll_class on public.student_enrollments(class_id);
create index if not exists idx_enroll_student on public.student_enrollments(student_id);

-- ─── Competitions ─────────────────────────────────────────────────────
create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete set null,
  session_id uuid references public.quiz_sessions(id) on delete set null,
  title text not null,
  description text,
  category text not null default 'general',
  format text not null default 'live_synchronous'
    check (format in ('live_synchronous','scheduled_individual','online_examination','school_vs_school','individual_ranking','team')),
  target_audience text,
  education_level text,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes int,
  max_participants int,
  status text not null default 'draft'
    check (status in ('draft','published','scheduled','live','paused','ended','cancelled','archived')),
  visibility text not null default 'private'
    check (visibility in ('public','private','unlisted')),
  instructions text,
  rules text,
  scoring jsonb not null default '{}'::jsonb,
  results_published boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_comp_org on public.competitions(organization_id, status);

create table if not exists public.competition_access_codes (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  code text unique not null,
  label text,
  organization_id uuid references public.organizations(id) on delete cascade, -- restriction
  class_id uuid references public.classes(id) on delete set null,             -- restriction
  max_uses int,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_cac_comp on public.competition_access_codes(competition_id);

create table if not exists public.competition_registrations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  access_code_id uuid references public.competition_access_codes(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  participant_id uuid references public.session_participants(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  full_name text not null,
  participant_ref text,
  status text not null default 'registered'
    check (status in ('registered','admitted','removed')),
  source text not null default 'admin'
    check (source in ('admin','import','code_join','self')),
  created_at timestamptz not null default now()
);
create index if not exists idx_creg_comp on public.competition_registrations(competition_id, status);
create index if not exists idx_creg_code on public.competition_registrations(access_code_id);

-- ─── RLS for new tables (same helper-based pattern as 0001) ───────────
alter table public.academic_years enable row level security;
alter table public.education_levels enable row level security;
alter table public.departments enable row level security;
alter table public.subjects enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.student_enrollments enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_access_codes enable row level security;
alter table public.competition_registrations enable row level security;

create policy ay_select on public.academic_years for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy ay_write on public.academic_years for all to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin())
  with check (public.can_manage_org(organization_id) or public.is_super_admin());

create policy el_select on public.education_levels for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy el_write on public.education_levels for all to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin())
  with check (public.can_manage_org(organization_id) or public.is_super_admin());

create policy dep_select on public.departments for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy dep_write on public.departments for all to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin())
  with check (public.can_manage_org(organization_id) or public.is_super_admin());

create policy subj_select on public.subjects for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy subj_write on public.subjects for all to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin())
  with check (public.can_manage_org(organization_id) or public.is_super_admin());

create policy class_select on public.classes for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy class_write on public.classes for all to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());

create policy stu_select on public.students for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin() or user_id = auth.uid());
create policy stu_write on public.students for all to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());

create policy enr_select on public.student_enrollments for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy enr_write on public.student_enrollments for all to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());

create policy comp_select on public.competitions for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin()
         or (visibility = 'public' and status in ('published','scheduled','live','ended')));
create policy comp_public_select on public.competitions for select to anon
  using (visibility = 'public' and status in ('published','scheduled','live','ended'));
create policy comp_write on public.competitions for all to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());

create policy cac_select on public.competition_access_codes for select to authenticated
  using (public.is_super_admin() or public.is_org_member((select organization_id from public.competitions where id = competition_id)));
create policy cac_write on public.competition_access_codes for all to authenticated
  using (public.is_super_admin() or public.can_create_content((select organization_id from public.competitions where id = competition_id)))
  with check (public.is_super_admin() or public.can_create_content((select organization_id from public.competitions where id = competition_id)));

create policy creg_select on public.competition_registrations for select to authenticated
  using (public.is_super_admin() or user_id = auth.uid()
         or public.is_org_member((select organization_id from public.competitions where id = competition_id)));
create policy creg_write on public.competition_registrations for all to authenticated
  using (public.is_super_admin() or public.can_create_content((select organization_id from public.competitions where id = competition_id)))
  with check (public.is_super_admin() or public.can_create_content((select organization_id from public.competitions where id = competition_id)));

-- ─── Storage: organization logos ──────────────────────────────────────
insert into storage.buckets (id, name, public) values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

create policy logo_read on storage.objects for select to public
  using (bucket_id = 'org-logos');
create policy logo_write on storage.objects for insert to authenticated
  with check (bucket_id = 'org-logos');
create policy logo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-logos' and public.is_super_admin());

-- ─── Platform-owned organization for the Primary Super Admin ──────────
do $$
declare
  v_owner uuid;
  v_org uuid;
begin
  select id into v_owner from public.profiles where is_primary limit 1;
  if v_owner is not null then
    select id into v_org from public.organizations where slug = 'evalora-platform';
    if v_org is null then
      insert into public.organizations (name, slug, type, owner_id, description, settings)
      values (
        'EVALORA Platform', 'evalora-platform', 'other', v_owner,
        'Platform-owned organization operated by the Primary Super Admin for official competitions, demonstrations and internal content.',
        '{"platform_owned": true}'::jsonb
      )
      returning id into v_org;
    end if;
    insert into public.organization_members (organization_id, user_id, role)
    values (v_org, v_owner, 'owner')
    on conflict (organization_id, user_id) do nothing;
    insert into public.audit_logs (actor_id, organization_id, action, entity, entity_id, metadata)
    values (v_owner, v_org, 'organization.platform_established', 'organizations', v_org::text,
            '{"source":"migration_0003"}'::jsonb);
  end if;
end $$;
