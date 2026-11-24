-- Official examination paper templates, organization logo storage hardening,
-- Question Paper Builder / calculator / official-paper feature flags, and
-- Version C Section A (MCQ) / Section B (Theory) presentation.
--
-- Non-destructive and idempotent. No question, option, attempt, answer or
-- result row is modified. Version C changes touch only exam/quiz settings
-- metadata (section titles, calculator and randomization switches), which
-- never alters a stored attempt question_order or any historical mark.

begin;

-- ─── 1. Official examination paper templates (organization-scoped) ──────
create table if not exists public.exam_paper_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  period text check (period is null or char_length(period) <= 120),
  academic_year text check (academic_year is null or char_length(academic_year) <= 40),
  grade_label text check (grade_label is null or char_length(grade_label) <= 80),
  subject text check (subject is null or char_length(subject) <= 120),
  instructions text check (instructions is null or char_length(instructions) <= 4000),
  show_logo boolean not null default true,
  is_default boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_exam_paper_templates_org
  on public.exam_paper_templates(organization_id, is_default desc, created_at desc);
-- At most one default template per organization.
create unique index if not exists uq_exam_paper_templates_default
  on public.exam_paper_templates(organization_id) where is_default;

alter table public.exam_paper_templates enable row level security;
drop policy if exists exam_paper_templates_select on public.exam_paper_templates;
drop policy if exists exam_paper_templates_insert on public.exam_paper_templates;
drop policy if exists exam_paper_templates_update on public.exam_paper_templates;
drop policy if exists exam_paper_templates_delete on public.exam_paper_templates;
create policy exam_paper_templates_select on public.exam_paper_templates for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy exam_paper_templates_insert on public.exam_paper_templates for insert to authenticated
  with check (public.can_manage_org(organization_id) or public.is_super_admin());
create policy exam_paper_templates_update on public.exam_paper_templates for update to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin())
  with check (public.can_manage_org(organization_id) or public.is_super_admin());
create policy exam_paper_templates_delete on public.exam_paper_templates for delete to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin());

comment on table public.exam_paper_templates is
  'Organization-owned official examination paper header templates. Organization identity (name/logo) is never stored here; it always comes from organizations so branding cannot leak across tenants.';

-- ─── 2. Organization logo storage: organization-scoped writes ───────────
-- Reads stay public (logos render on portals and papers). Writes are scoped
-- to the organization folder: a member may only write under their own
-- organization id, and the Super Admin may write anywhere. The server
-- actions additionally verify membership before uploading.
drop policy if exists logo_write on storage.objects;
drop policy if exists logo_delete on storage.objects;
create policy logo_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'org-logos'
    and (
      public.is_super_admin()
      or public.is_org_member((storage.foldername(name))[1]::uuid)
    )
  );
create policy logo_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'org-logos'
    and (
      public.is_super_admin()
      or public.is_org_member((storage.foldername(name))[1]::uuid)
    )
  );

-- ─── 3. Platform feature flags: builder, calculator, official paper ─────
update public.platform_settings
   set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
     'question_paper_builder', coalesce((value->>'question_paper_builder')::boolean, true),
     'scientific_calculator', coalesce((value->>'scientific_calculator')::boolean, true),
     'official_exam_paper', coalesce((value->>'official_exam_paper')::boolean, true)
   ),
       updated_at = now()
 where key = 'features';

-- ─── 4. Version C: SECTION A (MCQ) / SECTION B (Theory) presentation ────
-- Only settings metadata changes. Question wording, options, keys, marks and
-- stored attempt orders are untouched, so active and historical attempts
-- keep their exact paper.
update public.exams
   set settings = settings || jsonb_build_object(
     'calculator', true,
     'calculator_mode', 'scientific',
     'calculator_angle_mode', 'deg',
     'randomize_questions', true,
     'randomize_options', true,
     'sections', jsonb_build_array(
       jsonb_build_object(
         'id', 'A',
         'title', 'SECTION A — MULTIPLE CHOICE QUESTIONS',
         'questions', 30,
         'marks', 60,
         'instructions', 'Answer all questions in this section. Question and answer-option order is randomized within this section for each candidate.'
       ),
       jsonb_build_object(
         'id', 'B',
         'title', 'SECTION B — THEORY QUESTIONS',
         'questions', 4,
         'marks', 40,
         'instructions', 'Answer all questions in this section. Show complete working. Randomization is disabled where questions share source material or depend on each other.'
       )
     )
   )
 where id in (
   'cd000000-0000-4000-8000-000000000002',
   'ce000000-0000-4000-8000-000000000002'
 );

update public.quizzes
   set settings = settings || jsonb_build_object(
     'calculator', true,
     'calculator_mode', 'scientific',
     'calculator_angle_mode', 'deg',
     'randomize_questions', true,
     'randomize_options', true,
     'sections', jsonb_build_array(
       jsonb_build_object(
         'id', 'A',
         'title', 'SECTION A — MULTIPLE CHOICE QUESTIONS',
         'questions', 30,
         'marks', 60,
         'instructions', 'Answer all questions in this section. Question and answer-option order is randomized within this section for each candidate.'
       ),
       jsonb_build_object(
         'id', 'B',
         'title', 'SECTION B — THEORY QUESTIONS',
         'questions', 4,
         'marks', 40,
         'instructions', 'Answer all questions in this section. Show complete working. Randomization is disabled where questions share source material or depend on each other.'
       )
     )
   )
 where id in (
   'cd000000-0000-4000-8000-000000000001',
   'ce000000-0000-4000-8000-000000000001'
 );

commit;
