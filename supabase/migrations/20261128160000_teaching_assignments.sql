-- Teaching assignments: teacher × class × subject, with homeroom as a first-class
-- responsibility rather than a role a teacher has to choose instead.
--
-- WHAT WAS WRONG
--
-- The platform had three separate, unconnected ideas of what a teacher is:
--
--   organization_members.role = 'teacher'   a single organization-wide role
--   teacher_subjects (profile_id, subject_id)   a subject, with NO class
--   classes.teacher_id                        a class, with NO subject
--
-- So "Teacher A teaches Mathematics in Grade 9 A" was not representable. The
-- only class dimension was `classes.teacher_id`, which cannot say which subject,
-- and the only subject dimension was `teacher_subjects`, which cannot say which
-- class. `teacher_subjects` has 2 rows in production and `classes.teacher_id`
-- covers 6 classes; neither is used for authorization anywhere — the exam and
-- question pages read them only to pick a default dropdown value.
--
-- The consequence was not a missing UI feature. Authorization was
-- ORGANIZATION-WIDE:
--
--   questions.q_select   staff_org_ids()                       any staff, any subject
--   questions.q_update   can_create_content(organization_id)   any teacher, any question
--   exams.exam_update    can_create_content(organization_id)   any teacher, any exam
--
-- where can_create_content is `org_role in ('owner','admin','teacher','organizer')`.
-- A Physics teacher could UPDATE the Literature examination in the same
-- organization. That is the defect this migration begins to close.
--
-- THE MODEL
--
-- One row per responsibility. Rows are additive, never exclusive:
--
--   teacher              class   subject   role
--   Teacher A            Grade 9A  Maths    subject_teacher
--   Teacher A            Grade 9A  NULL     class_teacher     <- homeroom
--   Teacher A            Grade 10B Maths    subject_teacher
--
-- A teacher may hold any combination, in any number of classes and subjects, on
-- one account. `class_id` is nullable to permit a subject assignment that has
-- not been placed in a class yet; a `class_teacher` row always names a class.

create table if not exists public.teaching_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid references public.classes (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete cascade,
  academic_year_id uuid references public.academic_years (id) on delete set null,
  role text not null check (role in ('class_teacher', 'subject_teacher')),
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A homeroom responsibility is always about a class and never about a subject.
  constraint teaching_assignments_class_teacher_shape
    check (role <> 'class_teacher' or (class_id is not null and subject_id is null)),
  -- A subject responsibility always names a subject.
  constraint teaching_assignments_subject_teacher_shape
    check (role <> 'subject_teacher' or subject_id is not null)
);

-- One homeroom teacher per class: otherwise "the class teacher" has no referent.
create unique index if not exists teaching_assignments_one_homeroom
  on public.teaching_assignments (class_id)
  where role = 'class_teacher';

-- The same teacher cannot be assigned the same subject in the same class twice.
create unique index if not exists teaching_assignments_unique_subject
  on public.teaching_assignments (teacher_id, class_id, subject_id)
  where role = 'subject_teacher' and class_id is not null;

create index if not exists teaching_assignments_teacher_idx
  on public.teaching_assignments (teacher_id, organization_id);
create index if not exists teaching_assignments_class_idx
  on public.teaching_assignments (class_id);
create index if not exists teaching_assignments_subject_idx
  on public.teaching_assignments (subject_id);

comment on table public.teaching_assignments is
  'One row per responsibility: (teacher, class, subject). Homeroom is role=class_teacher with subject_id NULL. Rows are additive — a teacher may be homeroom in one class and a subject teacher in others, on one account.';

/*
 * The predicates the guards use.
 *
 * Deliberately SECURITY DEFINER and org-scoped by argument: a policy that called
 * these with the row's own organization_id could not tell a manager of org A
 * from a teacher of org B.
 */

create or replace function public.teaches_subject_in_class(
  p_user uuid, p_org uuid, p_class uuid, p_subject uuid
) returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.teaching_assignments ta
    where ta.teacher_id = p_user
      and ta.organization_id = p_org
      and ta.role = 'subject_teacher'
      and ta.subject_id = p_subject
      -- A class-specific assignment only covers that class; an assignment with no
      -- class yet covers the subject everywhere the teacher is placed, which for
      -- now means "in this organization".
      and (ta.class_id is null or p_class is null or ta.class_id = p_class)
  );
$$;

create or replace function public.is_class_teacher_of(p_user uuid, p_org uuid, p_class uuid)
returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.teaching_assignments ta
    where ta.teacher_id = p_user
      and ta.organization_id = p_org
      and ta.role = 'class_teacher'
      and ta.class_id = p_class
  );
$$;

/** True when the caller may author or edit content for this subject at all. */
create or replace function public.can_author_subject(p_org uuid, p_subject uuid)
returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select case
    -- Owners, admins and organizers are the school's academic leadership and keep
    -- organization-wide authority; narrowing them would break existing workflows
    -- and is not what the brief asks for. The restriction is aimed at the
    -- `teacher` role, which previously had exactly the same reach.
    when public.org_role(p_org) in ('owner', 'admin', 'organizer') then true
    when public.org_role(p_org) = 'teacher' then
      p_subject is null
        -- A teacher with no subject placement at all keeps the old behaviour,
        -- because there are exactly zero such placements in production today and
        -- locking them out would silently break every existing teacher.
        -- `assignment_coverage` below reports this rather than hiding it.
        or not exists (
          select 1 from public.teaching_assignments ta
          where ta.teacher_id = (select auth.uid())
            and ta.organization_id = p_org
            and ta.role = 'subject_teacher'
        )
        or exists (
          select 1 from public.teaching_assignments ta
          where ta.teacher_id = (select auth.uid())
            and ta.organization_id = p_org
            and ta.role = 'subject_teacher'
            and ta.subject_id = p_subject
        )
    else false
  end;
$$;

comment on function public.can_author_subject(uuid, uuid) is
  'Whether the caller may author/edit content in this subject. Owners/admins/organizers: yes. Teachers: only their assigned subjects, and unrestricted while no subject assignment exists (reported by assignment_coverage).';

/**
 * How far each teacher's assignments actually reach, so "no assignments" is
 * visible to administrators instead of silently meaning "everything".
 */
create or replace view public.assignment_coverage as
select
  m.organization_id,
  m.user_id as teacher_id,
  p.full_name,
  p.email,
  count(ta.id) filter (where ta.role = 'subject_teacher') as subject_assignments,
  count(ta.id) filter (where ta.role = 'class_teacher') as homeroom_assignments,
  count(distinct ta.class_id) as distinct_classes,
  count(distinct ta.subject_id) as distinct_subjects,
  count(ta.id) = 0 as unrestricted
from public.organization_members m
join public.profiles p on p.id = m.user_id
left join public.teaching_assignments ta
  on ta.teacher_id = m.user_id and ta.organization_id = m.organization_id
where m.status = 'active' and m.role = 'teacher'
group by m.organization_id, m.user_id, p.full_name, p.email;

comment on view public.assignment_coverage is
  'Per-teacher assignment totals. `unrestricted` is true when a teacher has no teaching assignment at all, which currently means they may author in every subject — the state before any assignments exist.';
