-- ═══════════════════════════════════════════════════════════════════════
-- EVALORA — formula library, teacher subject assignments, configurable
-- grading systems and assessment-grid (rubric) extensions.
--
-- Everything here is ADDITIVE. No existing table, row, column, policy,
-- constraint, trigger, mark, attempt or result is modified or removed:
--   • New tables: formula_library, teacher_subjects, grading_systems.
--   • New nullable/defaulted columns on grading_rubrics and
--     grading_rubric_criteria (existing rows keep working unchanged).
-- Existing data is untouched; RLS stays tenant-scoped throughout.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Reusable formula library (§ Formula Sheet) ─────────────────────
-- Teachers keep formulas organized by subject, topic and chapter once and
-- attach the exact set they want to an examination (the per-exam sheet in
-- exams.settings.formula_sheet remains the candidate-facing snapshot).
create table if not exists public.formula_library (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  topic text not null check (char_length(btrim(topic)) between 1 and 120),
  chapter text check (chapter is null or char_length(btrim(chapter)) between 1 and 120),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  latex text not null check (char_length(btrim(latex)) between 1 and 300),
  note text check (note is null or char_length(btrim(note)) between 1 and 240),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_formula_library_org
  on public.formula_library(organization_id, topic, chapter);
create index if not exists idx_formula_library_subject
  on public.formula_library(organization_id, subject_id);

-- A formula can only reference a subject inside its own organization.
create or replace function public.guard_formula_library()
returns trigger language plpgsql security definer set search_path=public as $$
declare subject_org uuid;
begin
  if new.subject_id is not null then
    select organization_id into subject_org from public.subjects where id = new.subject_id for share;
    if not found then raise exception 'Subject not found.'; end if;
    if new.organization_id is not null and new.organization_id is distinct from subject_org then
      raise exception 'A formula must belong to the organization that owns its subject.';
    end if;
    new.organization_id := subject_org;
  end if;
  new.topic := btrim(new.topic);
  new.title := btrim(new.title);
  new.latex := btrim(new.latex);
  if new.chapter is not null then new.chapter := btrim(new.chapter); end if;
  if new.note is not null then new.note := btrim(new.note); end if;
  return new;
end $$;

drop trigger if exists formula_library_guard on public.formula_library;
create trigger formula_library_guard
  before insert or update on public.formula_library
  for each row execute function public.guard_formula_library();

alter table public.formula_library enable row level security;
create policy formula_select on public.formula_library for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy formula_write on public.formula_library for all to authenticated
  using (public.can_create_content(organization_id))
  with check (public.can_create_content(organization_id));

-- ─── 2. Teacher ↔ subject assignments (per organization) ───────────────
-- A teacher can teach different subjects in different organizations, so the
-- assignment is a membership-scoped join — never a column on profiles.
create table if not exists public.teacher_subjects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, profile_id, subject_id)
);
create index if not exists idx_teacher_subjects_profile
  on public.teacher_subjects(organization_id, profile_id);
create index if not exists idx_teacher_subjects_subject
  on public.teacher_subjects(organization_id, subject_id);

-- The profile must actually belong to the organization and the subject must
-- be the organization's own — tenant isolation is enforced, not assumed.
create or replace function public.guard_teacher_subject()
returns trigger language plpgsql security definer set search_path=public as $$
declare subject_org uuid; member_role text;
begin
  select organization_id into subject_org from public.subjects where id = new.subject_id for share;
  if not found then raise exception 'Subject not found.'; end if;
  if new.organization_id is not null and new.organization_id is distinct from subject_org then
    raise exception 'A teacher-subject assignment must use a subject of the same organization.';
  end if;
  new.organization_id := subject_org;
  select role into member_role
    from public.organization_members
   where organization_id = new.organization_id and user_id = new.profile_id;
  if not found then raise exception 'The profile is not a member of this organization.'; end if;
  if member_role not in ('owner','admin','teacher','organizer') then
    raise exception 'Only teaching staff can be assigned subjects.';
  end if;
  return new;
end $$;

drop trigger if exists teacher_subject_guard on public.teacher_subjects;
create trigger teacher_subject_guard
  before insert or update on public.teacher_subjects
  for each row execute function public.guard_teacher_subject();

alter table public.teacher_subjects enable row level security;
create policy teacher_subject_select on public.teacher_subjects for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy teacher_subject_write on public.teacher_subjects for all to authenticated
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

-- ─── 3. Configurable grading systems (reusable, curriculum-aware) ──────
-- Reference curricula (MYP/AP strand libraries, official scales) live in
-- code as reference data; this table holds the ORGANIZATION'S OWN
-- configurations: Beninese /20 rules, letter boundaries, AP course weights,
-- MYP conversion policies — selectable per examination, quiz or paper.
create table if not exists public.grading_systems (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  curriculum text not null check (curriculum in ('myp','ap','beninese','custom','cambridge','british')),
  subject_id uuid references public.subjects(id) on delete set null,
  grade_label text check (grade_label is null or char_length(btrim(grade_label)) <= 80),
  assessment_kind text not null default 'any' check (assessment_kind in ('exam','quiz','any')),
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_grading_systems_org
  on public.grading_systems(organization_id, curriculum, status);

create or replace function public.guard_grading_system()
returns trigger language plpgsql security definer set search_path=public as $$
declare subject_org uuid;
begin
  if new.subject_id is not null then
    select organization_id into subject_org from public.subjects where id = new.subject_id for share;
    if not found then raise exception 'Subject not found.'; end if;
    if new.organization_id is not null and new.organization_id is distinct from subject_org then
      raise exception 'A grading system must belong to the organization that owns its subject.';
    end if;
    new.organization_id := subject_org;
  end if;
  new.name := btrim(new.name);
  return new;
end $$;

drop trigger if exists grading_system_guard on public.grading_systems;
create trigger grading_system_guard
  before insert or update on public.grading_systems
  for each row execute function public.guard_grading_system();

alter table public.grading_systems enable row level security;
create policy grading_system_select on public.grading_systems for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy grading_system_write on public.grading_systems for all to authenticated
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

-- ─── 4. Assessment-grid extensions (rubric builder) ────────────────────
-- Existing rubrics keep working: every new column is nullable or defaulted.
--   levels   — performance levels with descriptors and mark ranges
--   weight   — relative weighting inside the grid (calculation rule input)
--   curriculum / subject_id / grade_label — library organization
--   version / parent_id — duplication lineage so historical links keep the
--     exact grid version an assessment was marked against.
alter table public.grading_rubrics
  add column if not exists curriculum text,
  add column if not exists subject_id uuid references public.subjects(id) on delete set null,
  add column if not exists grade_label text check (grade_label is null or char_length(btrim(grade_label)) <= 80),
  add column if not exists version integer not null default 1 check (version >= 1),
  add column if not exists parent_id uuid references public.grading_rubrics(id) on delete set null;

alter table public.grading_rubric_criteria
  add column if not exists levels jsonb,
  add column if not exists weight numeric(8,3) check (weight is null or weight >= 0);

create index if not exists idx_grading_rubrics_lineage
  on public.grading_rubrics(organization_id, parent_id);

comment on column public.grading_rubrics.version is
  'Grid version; duplications increment it and record the source grid in parent_id.';
comment on column public.grading_rubric_criteria.levels is
  'Performance levels: [{level,label,description,min_marks,max_marks}] — optional per criterion.';
