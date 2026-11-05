-- 0011 — Class-based Question Bank, curriculum programmes, multi-phase
-- competition events and traceable qualification records.
--
-- Extends (never replaces) the existing classes/questions/quizzes/exams/
-- competitions model:
--  • questions gain class/curriculum/subject metadata, creation method,
--    source references and a review workflow status;
--  • classes gain a level band + grade order and can be associated with
--    curriculum programmes (configurable per organization) and subjects;
--  • quizzes, exams and competitions can reference a class directly;
--  • competition_events groups phases (examination + live competitions)
--    with per-class phase records and auditable qualification decisions.

-- ─── Classes: level band + grade order ─────────────────────────────────
alter table public.classes
  add column if not exists level_band text,
  add column if not exists grade_order int;

alter table public.classes drop constraint if exists classes_level_band_check;
alter table public.classes add constraint classes_level_band_check
  check (level_band is null or level_band in ('early_years_primary','myp_secondary','advanced_secondary','other'));

create index if not exists classes_org_grade_idx
  on public.classes (organization_id, grade_order, name);

-- ─── Curriculum programmes (per organization, configurable) ────────────
create table if not exists public.curriculum_programmes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  language text not null default 'en',
  level_band text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table if not exists public.class_curricula (
  class_id uuid not null references public.classes(id) on delete cascade,
  programme_id uuid not null references public.curriculum_programmes(id) on delete cascade,
  course_label text,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (class_id, programme_id)
);

create table if not exists public.class_subjects (
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, subject_id)
);

-- ─── Questions: class-first metadata + review workflow ─────────────────
alter table public.questions
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists subject_id uuid references public.subjects(id) on delete set null,
  add column if not exists curriculum text,
  add column if not exists curriculum_course text,
  add column if not exists subtopic text,
  add column if not exists creation_method text not null default 'manual',
  add column if not exists source_reference text,
  add column if not exists source_url text,
  add column if not exists review_status text not null default 'draft',
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists generation_meta jsonb not null default '{}'::jsonb,
  add column if not exists prompt_hash text;

alter table public.questions drop constraint if exists questions_creation_method_check;
alter table public.questions add constraint questions_creation_method_check
  check (creation_method in ('manual','imported','ai_generated'));

alter table public.questions drop constraint if exists questions_review_status_check;
alter table public.questions add constraint questions_review_status_check
  check (review_status in ('draft','reviewed','approved','rejected','archived'));

-- Difficulty gains a dedicated competition tier (existing values unchanged).
alter table public.questions drop constraint if exists questions_difficulty_check;
alter table public.questions add constraint questions_difficulty_check
  check (difficulty in ('easy','medium','hard','competition'));

create index if not exists questions_org_class_idx
  on public.questions (organization_id, class_id, status);
create index if not exists questions_class_curriculum_idx
  on public.questions (class_id, curriculum, review_status);
create unique index if not exists questions_org_prompt_hash_key
  on public.questions (organization_id, prompt_hash) where prompt_hash is not null;

comment on column public.questions.class_id is
  'Primary relational class reference for the class-based Question Bank.';
comment on column public.questions.review_status is
  'Review workflow: draft → reviewed → approved (or rejected/archived). Only approved questions may enter finalized competitions.';

-- ─── Class references on quizzes / exams / competitions ────────────────
alter table public.quizzes
  add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.exams
  add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.competitions
  add column if not exists class_id uuid references public.classes(id) on delete set null;

-- ─── Multi-phase competition events ────────────────────────────────────
create table if not exists public.competition_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft','scheduled','open','completed','archived')),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
create index if not exists comp_events_org_idx on public.competition_events (organization_id, status);

create table if not exists public.competition_event_phases (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.competition_events(id) on delete cascade,
  phase_key text not null check (phase_key in ('elimination','semi_final','grand_final')),
  phase_type text not null check (phase_type in ('examination','live_competition')),
  title text not null,
  status text not null default 'draft'
    check (status in ('draft','scheduled','open','completed','archived')),
  max_questions int not null default 20 check (max_questions > 0),
  qualification_rule jsonb not null default '{}'::jsonb,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, phase_key)
);

create table if not exists public.competition_phase_classes (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.competition_event_phases(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete set null,
  exam_id uuid references public.exams(id) on delete set null,
  competition_id uuid references public.competitions(id) on delete set null,
  session_id uuid references public.quiz_sessions(id) on delete set null,
  question_count int not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  unique (phase_id, class_id)
);
create index if not exists phase_classes_class_idx on public.competition_phase_classes (class_id);

alter table public.competitions
  add column if not exists event_id uuid references public.competition_events(id) on delete set null;
alter table public.exams
  add column if not exists event_id uuid references public.competition_events(id) on delete set null;

-- ─── Qualification records (fully traceable) ───────────────────────────
create table if not exists public.qualification_records (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.competition_events(id) on delete cascade,
  from_phase_id uuid references public.competition_event_phases(id) on delete set null,
  to_phase_id uuid not null references public.competition_event_phases(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  candidate_id uuid references public.exam_candidates(id) on delete set null,
  participant_id uuid references public.session_participants(id) on delete set null,
  display_name text not null,
  source_score numeric,
  source_max_score numeric,
  source_rank int,
  status text not null default 'eligible'
    check (status in ('eligible','approved','rejected','manual_approved','manual_rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists qual_event_class_idx
  on public.qualification_records (event_id, class_id, status);
create unique index if not exists qual_unique_person_idx
  on public.qualification_records (
    to_phase_id, class_id,
    coalesce(student_id::text, candidate_id::text, participant_id::text, lower(display_name))
  );

-- ─── RLS ────────────────────────────────────────────────────────────────
alter table public.curriculum_programmes enable row level security;
alter table public.class_curricula enable row level security;
alter table public.class_subjects enable row level security;
alter table public.competition_events enable row level security;
alter table public.competition_event_phases enable row level security;
alter table public.competition_phase_classes enable row level security;
alter table public.qualification_records enable row level security;

drop policy if exists curr_select on public.curriculum_programmes;
create policy curr_select on public.curriculum_programmes for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
drop policy if exists curr_write on public.curriculum_programmes;
create policy curr_write on public.curriculum_programmes for all to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin())
  with check (public.can_manage_org(organization_id) or public.is_super_admin());

-- Class associations inherit the parent class organization through a
-- security-definer helper to avoid policy recursion.
create or replace function public.class_org(p_class uuid)
returns uuid language sql security definer set search_path = public stable as $$
  select organization_id from public.classes where id = p_class;
$$;

drop policy if exists ccurr_all on public.class_curricula;
create policy ccurr_all on public.class_curricula for all to authenticated
  using (public.is_org_member(public.class_org(class_id)) or public.is_super_admin())
  with check (public.can_create_content(public.class_org(class_id)) or public.is_super_admin());

drop policy if exists csubj_all on public.class_subjects;
create policy csubj_all on public.class_subjects for all to authenticated
  using (public.is_org_member(public.class_org(class_id)) or public.is_super_admin())
  with check (public.can_create_content(public.class_org(class_id)) or public.is_super_admin());

drop policy if exists cevt_select on public.competition_events;
create policy cevt_select on public.competition_events for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
drop policy if exists cevt_write on public.competition_events;
create policy cevt_write on public.competition_events for all to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());

create or replace function public.event_org(p_event uuid)
returns uuid language sql security definer set search_path = public stable as $$
  select organization_id from public.competition_events where id = p_event;
$$;
create or replace function public.phase_org(p_phase uuid)
returns uuid language sql security definer set search_path = public stable as $$
  select e.organization_id from public.competition_event_phases p
  join public.competition_events e on e.id = p.event_id where p.id = p_phase;
$$;

drop policy if exists cphase_all on public.competition_event_phases;
create policy cphase_all on public.competition_event_phases for all to authenticated
  using (public.is_org_member(public.event_org(event_id)) or public.is_super_admin())
  with check (public.can_create_content(public.event_org(event_id)) or public.is_super_admin());

drop policy if exists cpclass_all on public.competition_phase_classes;
create policy cpclass_all on public.competition_phase_classes for all to authenticated
  using (public.is_org_member(public.phase_org(phase_id)) or public.is_super_admin())
  with check (public.can_create_content(public.phase_org(phase_id)) or public.is_super_admin());

drop policy if exists qual_all on public.qualification_records;
create policy qual_all on public.qualification_records for all to authenticated
  using (public.is_org_member(public.event_org(event_id)) or public.is_super_admin())
  with check (public.can_create_content(public.event_org(event_id)) or public.is_super_admin());
