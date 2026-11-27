-- =============================================================================
-- Assessment Contributions & Grade Consolidation  +  Unlimited Individual
-- Grade Adjustment Ledger
-- =============================================================================
-- Strictly ADDITIVE. Nothing in this file drops, truncates, rewrites or
-- mass-updates an existing table, and no examination artefact is touched:
-- exams, exam_paper_templates, quiz_questions, questions, exam_candidates,
-- exam_attempts, exam_answers, exam_score_adjustments(+items),
-- grade_change_log, myp_result_history, publication flags and candidate
-- access tokens are all left exactly as they are.
--
-- What it adds:
--   1. public.assessment_categories            — organization-defined assessment
--                                                categories (built-ins live in
--                                                src/lib/assessmentContributions.ts)
--   2. public.assessment_contributions         — one assessment record (homework,
--                                                class test, quiz, formative,
--                                                summative, classwork, project,
--                                                participation, oral, practical,
--                                                custom) for a class / subject /
--                                                term, optionally linked to an exam
--   3. public.assessment_contribution_scores   — one independent score per student
--   4. public.assessment_contribution_events   — append-only audit trail
--   5. public.exam_grade_adjustment_entries    — UNLIMITED individual grade
--                                                adjustment ledger (repeated
--                                                positive AND negative entries,
--                                                reasons, categories, actor,
--                                                original/adjusted values)
--   6. public.grade_consolidation_profiles     — configurable consolidation rules
--      public.grade_consolidation_inclusions   — which assessments contribute,
--                                                with what weight / point value
--      public.grade_consolidation_overrides    — per-student / per-assessment
--                                                individual overrides
--      public.grade_consolidation_results      — computed snapshot per attempt
--                                                (original, adjustments,
--                                                contributions, consolidated)
--
-- The original examination score is NEVER overwritten by this layer: the
-- consolidation result stores `original_exam_score` beside the consolidated
-- value, and every subsequent recalculation recomputes from the preserved
-- original.
--
-- Security model (identical to the existing Score Adjustment ledger):
--   * Row Level Security enabled on every table.
--   * Staff-only SELECT through a security-definer resolver (Super Admin, or an
--     active non-learner member holding grading.view / results.view).
--   * ZERO client writes: insert/update/delete are revoked from anon and
--     authenticated, so every mutation must pass the application's
--     authorization boundary (route → server layer → service-role client).
--   * Append-only triggers on the audit trail and the adjustment ledger.
-- =============================================================================

-- ─── 1. Organization-defined assessment categories ──────────────────────────
create table if not exists public.assessment_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key             text not null check (char_length(btrim(key)) between 2 and 40),
  label           text not null check (char_length(btrim(label)) between 2 and 80),
  description     text check (description is null or char_length(description) <= 500),
  is_active       boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uq_assessment_categories_org_key unique (organization_id, key)
);

comment on table public.assessment_categories is
  'Organization-defined supplementary assessment categories. The platform built-in categories (homework, class_test, quiz, formative, summative, classwork, project, participation, oral, practical, other) live in code and are never stored here.';

create index if not exists idx_assessment_categories_org
  on public.assessment_categories (organization_id, is_active, label);

-- Keys and labels are stored canonically so "Homework " and "homework" can
-- never become two categories, and a category can never be created in another
-- organization's name.
create or replace function public.guard_assessment_category()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Canonicalized exactly like `normalizeCategoryKey()` in
  -- src/lib/assessmentContributions.ts, so "Field Trip" and "field_trip" are
  -- the same category whether it was created through the API or by hand.
  new.key   := btrim(lower(btrim(new.key)), '_');
  new.key   := regexp_replace(new.key, '[^a-z0-9_]+', '_', 'g');
  new.key   := btrim(new.key, '_');
  new.label := btrim(new.label);
  if new.key !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'invalid_category_key: use 2-40 lowercase letters, digits or underscores'
      using errcode = '22023';
  end if;
  if new.key in (
    'homework','class_test','quiz','formative','summative','classwork',
    'project','participation','oral','practical','other'
  ) then
    raise exception 'reserved_category_key: % is a built-in assessment category', new.key
      using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_assessment_categories_guard on public.assessment_categories;
create trigger trg_assessment_categories_guard
  before insert or update on public.assessment_categories
  for each row execute function public.guard_assessment_category();

-- ─── 2. Assessment contribution records ─────────────────────────────────────
create table if not exists public.assessment_contributions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  title                  text not null check (char_length(btrim(title)) between 1 and 160),
  category_key           text not null check (char_length(btrim(category_key)) between 2 and 40),
  category_label         text not null check (char_length(btrim(category_label)) between 2 and 80),
  category_is_builtin    boolean not null default false,
  assessed_on            date not null,
  description            text check (description is null or char_length(description) <= 4000),
  subject_id             uuid references public.subjects(id) on delete set null,
  class_id               uuid references public.classes(id) on delete set null,
  academic_year_id       uuid references public.academic_years(id) on delete set null,
  term_label             text check (term_label is null or char_length(btrim(term_label)) between 1 and 120),
  -- Optional examination link. An assessment NEVER requires an examination.
  exam_id                uuid references public.exams(id) on delete set null,
  scope                  text not null default 'class'
                           check (scope in ('class', 'individual', 'mixed')),
  max_score              numeric(8,2) not null check (max_score > 0 and max_score <= 1000),
  -- Criterion mapping is optional and only meaningful for criterion-based
  -- frameworks (MYP). It is never invented for other frameworks.
  criterion_code         text check (criterion_code is null or char_length(btrim(criterion_code)) between 1 and 8),
  criterion_label        text check (criterion_label is null or char_length(btrim(criterion_label)) <= 160),
  framework              text not null default 'general'
                           check (framework in ('general', 'myp', 'ap', 'british', 'cambridge', 'beninese', 'custom')),
  source                 text not null default 'manual'
                           check (source in ('manual', 'import', 'individual')),
  teacher_comment        text check (teacher_comment is null or char_length(teacher_comment) <= 4000),
  -- Contribution settings (the consolidation engine reads these).
  contribution_method    text not null default 'record_only'
                           check (contribution_method in
                             ('direct_points', 'weighted', 'points_based', 'criterion', 'record_only')),
  contribution_weight    numeric(6,2) not null default 0
                           check (contribution_weight >= 0 and contribution_weight <= 100),
  contribution_points    numeric(8,2) not null default 0
                           check (contribution_points >= 0 and contribution_points <= 1000),
  contributes_to_result  boolean not null default false,
  -- Publication / visibility. Drafts are invisible to candidates.
  status                 text not null default 'draft'
                           check (status in ('draft', 'published', 'archived')),
  published_at           timestamptz,
  published_by           uuid references public.profiles(id) on delete set null,
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.assessment_contributions is
  'Supplementary classroom assessment records (homework, class tests, quizzes, projects, ...) that may be recorded independently and later linked to an examination or grading period. Examination papers, questions, attempts, answers and original marks are never modified by this table.';

create index if not exists idx_assessment_contributions_org
  on public.assessment_contributions (organization_id, assessed_on desc);
create index if not exists idx_assessment_contributions_class_subject
  on public.assessment_contributions (organization_id, class_id, subject_id, assessed_on desc);
create index if not exists idx_assessment_contributions_exam
  on public.assessment_contributions (exam_id) where exam_id is not null;
create index if not exists idx_assessment_contributions_status
  on public.assessment_contributions (organization_id, status, category_key);

-- Tenant + referential integrity, enforced in the database rather than assumed
-- from the client: a class, subject, academic year or examination referenced by
-- an assessment must belong to the SAME organization as the assessment.
create or replace function public.guard_assessment_contribution()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  new.title          := btrim(new.title);
  new.category_key   := lower(btrim(new.category_key));
  new.category_label := btrim(new.category_label);
  new.term_label     := nullif(btrim(coalesce(new.term_label, '')), '');
  new.criterion_code := upper(btrim(coalesce(new.criterion_code, '')));
  if new.criterion_code = '' then new.criterion_code := null; end if;
  new.updated_at     := now();

  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  if new.class_id is not null then
    select organization_id into v_org from public.classes where id = new.class_id for share;
    if not found then raise exception 'class_not_found' using errcode = '22023'; end if;
    if v_org is distinct from new.organization_id then
      raise exception 'tenant_violation: class does not belong to this organization' using errcode = '42501';
    end if;
  end if;

  if new.subject_id is not null then
    select organization_id into v_org from public.subjects where id = new.subject_id for share;
    if not found then raise exception 'subject_not_found' using errcode = '22023'; end if;
    if v_org is distinct from new.organization_id then
      raise exception 'tenant_violation: subject does not belong to this organization' using errcode = '42501';
    end if;
  end if;

  if new.academic_year_id is not null then
    select organization_id into v_org from public.academic_years where id = new.academic_year_id for share;
    if not found then raise exception 'academic_year_not_found' using errcode = '22023'; end if;
    if v_org is distinct from new.organization_id then
      raise exception 'tenant_violation: academic year does not belong to this organization' using errcode = '42501';
    end if;
  end if;

  if new.exam_id is not null then
    select organization_id into v_org from public.exams where id = new.exam_id for share;
    if not found then raise exception 'exam_not_found' using errcode = '22023'; end if;
    if v_org is distinct from new.organization_id then
      raise exception 'tenant_violation: examination does not belong to this organization' using errcode = '42501';
    end if;
  end if;

  -- A criterion-based contribution requires a criterion-based framework.
  if new.contribution_method = 'criterion' and new.framework <> 'myp' then
    raise exception 'criterion_requires_framework: criterion contributions require an MYP (criterion-based) framework'
      using errcode = '22023';
  end if;

  -- An assessment that does not contribute must not carry a weight.
  if new.contributes_to_result = false and new.contribution_method <> 'record_only' then
    raise exception 'contribution_disabled: set contributes_to_result to true before choosing a contribution method'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assessment_contributions_guard on public.assessment_contributions;
create trigger trg_assessment_contributions_guard
  before insert or update on public.assessment_contributions
  for each row execute function public.guard_assessment_contribution();

-- ─── 3. One independent score per student ───────────────────────────────────
create table if not exists public.assessment_contribution_scores (
  id              uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.assessment_contributions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id      uuid not null references public.students(id) on delete cascade,
  -- Optional link to the examination attempt this score consolidates into.
  attempt_id      uuid references public.exam_attempts(id) on delete set null,
  student_name    text not null check (char_length(btrim(student_name)) > 0),
  score           numeric(8,2) not null check (score >= 0),
  max_score       numeric(8,2) not null check (max_score > 0 and max_score <= 1000),
  criterion_code  text check (criterion_code is null or char_length(btrim(criterion_code)) between 1 and 8),
  comment         text check (comment is null or char_length(comment) <= 2000),
  status          text not null default 'recorded' check (status in ('recorded', 'excluded')),
  recorded_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- A score can never exceed the assessment's own maximum, so a mismatched
  -- scale can never enter the consolidation engine.
  constraint ck_assessment_score_within_max check (score <= max_score),
  -- Exactly one score per student per assessment: re-entry updates this row and
  -- is written to the audit trail, it never duplicates the student.
  constraint uq_assessment_score_student unique (contribution_id, student_id)
);

comment on table public.assessment_contribution_scores is
  'Per-student supplementary assessment scores. Each student''s score is independent: a class-wide entry or a bulk consolidation never derives one student''s mark from another''s.';

create index if not exists idx_assessment_scores_contribution
  on public.assessment_contribution_scores (contribution_id, student_name);
create index if not exists idx_assessment_scores_student
  on public.assessment_contribution_scores (organization_id, student_id);
create index if not exists idx_assessment_scores_attempt
  on public.assessment_contribution_scores (attempt_id) where attempt_id is not null;

-- Tenant integrity + canonical criterion code for a score row. The
-- `score <= max_score` check constraint above already makes a mismatched scale
-- impossible; this keeps the score inside its own assessment's organization.
create or replace function public.guard_assessment_contribution_score()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  new.student_name   := btrim(new.student_name);
  new.criterion_code := upper(btrim(coalesce(new.criterion_code, '')));
  if new.criterion_code = '' then new.criterion_code := null; end if;
  new.updated_at     := now();

  select organization_id into v_org
  from public.assessment_contributions
  where id = new.contribution_id
  for share;

  if not found then
    raise exception 'contribution_not_found' using errcode = '22023';
  end if;
  if v_org is distinct from new.organization_id then
    raise exception 'tenant_violation: assessment does not belong to this organization' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assessment_score_guard on public.assessment_contribution_scores;
create trigger trg_assessment_score_guard
  before insert or update on public.assessment_contribution_scores
  for each row execute function public.guard_assessment_contribution_score();

-- ─── 5. UNLIMITED individual grade adjustment ledger ────────────────────────
-- The pre-existing `exam_score_adjustment_items` ledger carries a hard
-- `unique (attempt_id, category_type, category_key)` constraint and a
-- `points > 0` check, so it can record exactly ONE positive batch adjustment per
-- student per criterion. That ledger is preserved untouched (the Institution
-- batch workflow and its tests depend on it). This second ledger is the
-- unlimited one: no uniqueness on (attempt, category), signed deltas, an
-- explicit reason category and a full before/after history.
create table if not exists public.exam_grade_adjustment_entries (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  exam_id              uuid not null references public.exams(id) on delete cascade,
  attempt_id           uuid not null references public.exam_attempts(id) on delete cascade,
  candidate_id         uuid references public.exam_candidates(id) on delete set null,
  student_id           uuid references public.students(id) on delete set null,
  candidate_name       text not null check (char_length(btrim(candidate_name)) > 0),
  category_type        text not null check (category_type in
                         ('myp_criterion', 'paper_section', 'overall', 'custom')),
  category_key         text not null check (char_length(btrim(category_key)) > 0),
  category_label       text not null check (char_length(btrim(category_label)) > 0),
  category_max_score   numeric(8,2) not null check (category_max_score >= 0),
  direction            text not null check (direction in ('increase', 'decrease')),
  points_delta         numeric(8,2) not null check (points_delta > 0 and points_delta <= 1000),
  -- Full before/after history: the value this entry started from and ended at.
  previous_value       numeric(8,2) not null check (previous_value >= 0),
  new_value            numeric(8,2) not null check (new_value >= 0),
  baseline_exam_score  numeric(8,2) not null check (baseline_exam_score >= 0),
  effective_exam_score numeric(8,2) not null check (effective_exam_score >= 0),
  exam_max_score       numeric(8,2) not null check (exam_max_score >= 0),
  reason_code          text not null check (reason_code in (
    'formative_assessment', 'homework', 'class_test', 'classwork', 'project',
    'practical_assessment', 'oral_assessment', 'teacher_review',
    'grading_correction', 'other'
  )),
  reason               text not null check (char_length(trim(reason)) >= 3 and char_length(reason) <= 1000),
  teacher_comment      text check (teacher_comment is null or char_length(teacher_comment) <= 4000),
  capped               boolean not null default false,
  cap_reason           text check (cap_reason is null or cap_reason in
                         ('category_max', 'category_min', 'exam_max', 'exam_min', 'both')),
  sequence_no          integer not null check (sequence_no > 0),
  actor_id             uuid references public.profiles(id) on delete set null,
  actor_email          text,
  actor_role           text not null check (char_length(btrim(actor_role)) > 0),
  actor_console        text not null default 'workspace'
                         check (actor_console in ('workspace', 'super_admin')),
  created_at           timestamptz not null default now()
);

comment on table public.exam_grade_adjustment_entries is
  'Unlimited, append-only individual grade adjustment ledger. Any number of repeated positive or negative adjustments per student and per criterion, each with its reason, actor, original value and adjusted value. The original examination score is preserved separately and is never overwritten.';

create index if not exists idx_grade_adj_entries_attempt
  on public.exam_grade_adjustment_entries (attempt_id, category_type, category_key, created_at, sequence_no);
create index if not exists idx_grade_adj_entries_exam
  on public.exam_grade_adjustment_entries (exam_id, created_at desc);
create index if not exists idx_grade_adj_entries_org
  on public.exam_grade_adjustment_entries (organization_id, created_at desc);
create index if not exists idx_grade_adj_entries_student
  on public.exam_grade_adjustment_entries (organization_id, student_id, created_at desc);

-- Integrity: an entry must belong to an attempt of its own examination, inside
-- the attempt's organization, and the recorded before/after pair must match the
-- signed delta (allowing for the cap).
create or replace function public.guard_grade_adjustment_entry()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_exam_id uuid;
  v_org     uuid;
  v_delta   numeric(8,2);
begin
  new.category_key   := btrim(new.category_key);
  new.category_label := btrim(new.category_label);
  new.candidate_name := btrim(new.candidate_name);
  new.reason         := trim(new.reason);
  new.category_type  := lower(new.category_type);
  new.reason_code    := lower(new.reason_code);

  select a.exam_id, e.organization_id into v_exam_id, v_org
  from public.exam_attempts a
  join public.exams e on e.id = a.exam_id
  where a.id = new.attempt_id
  for share of a;

  if not found then
    raise exception 'attempt_not_found' using errcode = '22023';
  end if;
  if v_exam_id is distinct from new.exam_id then
    raise exception 'attempt_not_in_exam' using errcode = '42501';
  end if;
  if v_org is distinct from new.organization_id then
    raise exception 'tenant_violation: attempt does not belong to this organization' using errcode = '42501';
  end if;

  v_delta := case when new.direction = 'decrease' then -new.points_delta else new.points_delta end;
  if abs((new.new_value - new.previous_value) - v_delta) > 0.01 then
    raise exception 'delta_mismatch: recorded before/after values do not match the signed delta'
      using errcode = '22023';
  end if;
  if new.new_value > new.category_max_score + 0.01 then
    raise exception 'score_cap_violation: adjusted value exceeds the category maximum' using errcode = '22023';
  end if;
  if new.effective_exam_score > new.exam_max_score + 0.01 and new.exam_max_score > 0 then
    raise exception 'score_cap_violation: effective examination score exceeds the examination maximum'
      using errcode = '22023';
  end if;

  -- sequence_no is the position of this entry inside its own (attempt,
  -- category) history, so the audit trail stays ordered without a uniqueness
  -- ceiling on the number of entries.
  new.sequence_no := coalesce((
    select count(*) + 1
    from public.exam_grade_adjustment_entries x
    where x.attempt_id = new.attempt_id
      and x.category_type = new.category_type
      and x.category_key = new.category_key
  ), 1);

  return new;
end;
$$;

drop trigger if exists trg_grade_adjustment_entry_guard on public.exam_grade_adjustment_entries;
create trigger trg_grade_adjustment_entry_guard
  before insert on public.exam_grade_adjustment_entries
  for each row execute function public.guard_grade_adjustment_entry();

-- ─── 6. Consolidation profiles, inclusions, overrides, results ──────────────
create table if not exists public.grade_consolidation_profiles (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  exam_id               uuid not null references public.exams(id) on delete cascade,
  name                  text not null check (char_length(btrim(name)) between 1 and 160),
  method                text not null check (method in
                          ('direct_points', 'weighted', 'points_based', 'criterion', 'record_only')),
  exam_weight           numeric(6,2) not null default 100
                          check (exam_weight >= 0 and exam_weight <= 100),
  scope                 text not null default 'class'
                          check (scope in ('class', 'group', 'individual')),
  -- Selected attempts when scope <> 'class' (empty means every attempt).
  attempt_ids           jsonb not null default '[]'::jsonb,
  settings              jsonb not null default '{}'::jsonb,
  status                text not null default 'draft'
                          check (status in ('draft', 'applied', 'published', 'archived')),
  published_at          timestamptz,
  published_by          uuid references public.profiles(id) on delete set null,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.grade_consolidation_profiles is
  'Configurable grade consolidation rules (Method A-E). Nothing is hardcoded: the method, the included assessments, their weights and their scope are all data.';

create index if not exists idx_consolidation_profiles_exam
  on public.grade_consolidation_profiles (exam_id, status, created_at desc);
create index if not exists idx_consolidation_profiles_org
  on public.grade_consolidation_profiles (organization_id, created_at desc);

create table if not exists public.grade_consolidation_inclusions (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.grade_consolidation_profiles(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  contribution_id  uuid not null references public.assessment_contributions(id) on delete cascade,
  included         boolean not null default true,
  weight           numeric(6,2) not null default 0 check (weight >= 0 and weight <= 100),
  point_value      numeric(8,2) not null default 0 check (point_value >= 0 and point_value <= 1000),
  criterion_code   text check (criterion_code is null or char_length(btrim(criterion_code)) between 1 and 8),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A single assessment can never be counted twice inside one profile.
  constraint uq_consolidation_inclusion unique (profile_id, contribution_id)
);

create index if not exists idx_consolidation_inclusions_profile
  on public.grade_consolidation_inclusions (profile_id, included);

create table if not exists public.grade_consolidation_overrides (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null references public.grade_consolidation_profiles(id) on delete cascade,
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  attempt_id           uuid not null references public.exam_attempts(id) on delete cascade,
  -- NULL contribution_id = override for the student as a whole.
  contribution_id      uuid references public.assessment_contributions(id) on delete cascade,
  included             boolean not null default true,
  weight_override      numeric(6,2) check (weight_override is null or (weight_override >= 0 and weight_override <= 100)),
  point_value_override numeric(8,2) check (point_value_override is null or (point_value_override >= 0 and point_value_override <= 1000)),
  reason               text not null check (char_length(trim(reason)) >= 3 and char_length(reason) <= 1000),
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists uq_consolidation_override_target
  on public.grade_consolidation_overrides (
    profile_id, attempt_id,
    coalesce(contribution_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create table if not exists public.grade_consolidation_results (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null references public.grade_consolidation_profiles(id) on delete cascade,
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  exam_id              uuid not null references public.exams(id) on delete cascade,
  attempt_id           uuid not null references public.exam_attempts(id) on delete cascade,
  student_id           uuid references public.students(id) on delete set null,
  candidate_name       text not null check (char_length(btrim(candidate_name)) > 0),
  -- The original examination result, preserved separately and never modified.
  original_exam_score  numeric(8,2) not null check (original_exam_score >= 0),
  exam_max_score       numeric(8,2) not null check (exam_max_score >= 0),
  adjustment_total     numeric(8,2) not null default 0,
  contribution_total   numeric(10,4) not null default 0,
  consolidated_score   numeric(10,2) not null check (consolidated_score >= 0),
  consolidated_max     numeric(10,2) not null check (consolidated_max >= 0),
  breakdown            jsonb not null default '{}'::jsonb,
  status               text not null default 'draft'
                         check (status in ('draft', 'applied', 'published')),
  published_at         timestamptz,
  computed_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- One stored snapshot per attempt per profile; recomputation replaces the
  -- snapshot and appends an audit event rather than silently rewriting history.
  constraint uq_consolidation_result_attempt unique (profile_id, attempt_id),
  constraint ck_consolidated_within_max check (consolidated_score <= consolidated_max)
);

create index if not exists idx_consolidation_results_profile
  on public.grade_consolidation_results (profile_id, candidate_name);
create index if not exists idx_consolidation_results_attempt
  on public.grade_consolidation_results (attempt_id, computed_at desc);

create or replace function public.guard_consolidation_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  new.updated_at := now();
  select organization_id into v_org from public.exams where id = new.exam_id for share;
  if not found then raise exception 'exam_not_found' using errcode = '22023'; end if;
  if v_org is distinct from new.organization_id then
    raise exception 'tenant_violation: examination does not belong to this organization' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_consolidation_profile_tenant on public.grade_consolidation_profiles;
create trigger trg_consolidation_profile_tenant
  before insert or update on public.grade_consolidation_profiles
  for each row execute function public.guard_consolidation_tenant();

-- ─── 6b. Append-only audit trail ─────────────────────────────────────────────
create table if not exists public.assessment_contribution_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  contribution_id  uuid references public.assessment_contributions(id) on delete cascade,
  profile_id       uuid references public.grade_consolidation_profiles(id) on delete cascade,
  attempt_id       uuid references public.exam_attempts(id) on delete set null,
  student_id       uuid references public.students(id) on delete set null,
  event_type       text not null check (event_type in (
    'created', 'updated', 'score_recorded', 'score_modified', 'score_excluded',
    'score_included', 'published', 'unpublished', 'archived',
    'consolidation_created', 'consolidation_changed', 'consolidation_published',
    'consolidation_unpublished', 'adjustment_recorded'
  )),
  actor_id         uuid references public.profiles(id) on delete set null,
  actor_email      text,
  actor_role       text check (actor_role is null or char_length(btrim(actor_role)) <= 60),
  previous_state   jsonb,
  new_state        jsonb,
  reason           text check (reason is null or char_length(reason) <= 1000),
  created_at       timestamptz not null default now()
);

comment on table public.assessment_contribution_events is
  'Append-only audit trail for assessment contributions, score entry, adjustments, consolidation rule changes and publication. Never updated, never deleted while its parent exists.';

create index if not exists idx_assessment_events_contribution
  on public.assessment_contribution_events (contribution_id, created_at desc);
create index if not exists idx_assessment_events_org
  on public.assessment_contribution_events (organization_id, created_at desc);
create index if not exists idx_assessment_events_student
  on public.assessment_contribution_events (organization_id, student_id, created_at desc);

-- ─── 7. Append-only immutability for audit data ─────────────────────────────
create or replace function public.assessment_event_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and (
    (old.contribution_id is not null and not exists (select 1 from public.assessment_contributions where id = old.contribution_id))
    or (old.profile_id is not null and not exists (select 1 from public.grade_consolidation_profiles where id = old.profile_id))
  ) then
    return old;
  end if;
  raise exception 'Assessment audit records are immutable and append-only.';
end;
$$;

drop trigger if exists trg_assessment_events_immutable on public.assessment_contribution_events;
create trigger trg_assessment_events_immutable
  before update or delete on public.assessment_contribution_events
  for each row execute function public.assessment_event_immutable();

create or replace function public.grade_adjustment_entry_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and (
    not exists (select 1 from public.exam_attempts where id = old.attempt_id)
    or not exists (select 1 from public.exams where id = old.exam_id)
  ) then
    return old;
  end if;
  raise exception 'Grade adjustment entries are immutable and append-only.';
end;
$$;

drop trigger if exists trg_grade_adjustment_entries_immutable on public.exam_grade_adjustment_entries;
create trigger trg_grade_adjustment_entries_immutable
  before update or delete on public.exam_grade_adjustment_entries
  for each row execute function public.grade_adjustment_entry_immutable();

-- ─── 8. Row Level Security ──────────────────────────────────────────────────
alter table public.assessment_categories            enable row level security;
alter table public.assessment_contributions         enable row level security;
alter table public.assessment_contribution_scores   enable row level security;
alter table public.assessment_contribution_events   enable row level security;
alter table public.exam_grade_adjustment_entries    enable row level security;
alter table public.grade_consolidation_profiles     enable row level security;
alter table public.grade_consolidation_inclusions   enable row level security;
alter table public.grade_consolidation_overrides    enable row level security;
alter table public.grade_consolidation_results      enable row level security;

-- True iff the current session is Super Admin, or an active NON-learner member
-- of `p_org_id` holding `grading.view` or `results.view`. Learners, candidates,
-- parents and participants are excluded explicitly, even if misconfigured, so a
-- candidate can never read another student's supplementary assessment record.
create or replace function public.can_read_assessment_contributions(p_org_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_is_super boolean := false;
  v_is_staff boolean := false;
begin
  if v_uid is null or p_org_id is null then
    return false;
  end if;

  select (p.platform_role = 'super_admin' and p.status = 'active')
    into v_is_super
  from public.profiles p
  where p.id = v_uid;

  if coalesce(v_is_super, false) then
    return true;
  end if;

  select exists (
    select 1
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
    where m.user_id = v_uid
      and m.organization_id = p_org_id
      and m.status = 'active'
      and p.status = 'active'
      and lower(coalesce(m.role, '')) not in ('student', 'candidate', 'parent', 'participant')
  ) into v_is_staff;

  if not coalesce(v_is_staff, false) then
    return false;
  end if;

  return public.access_has_permission(v_uid, p_org_id, 'grading.view')
      or public.access_has_permission(v_uid, p_org_id, 'results.view');
end;
$$;

revoke all on function public.can_read_assessment_contributions(uuid) from public, anon;
grant execute on function public.can_read_assessment_contributions(uuid) to authenticated, service_role;

drop policy if exists acat_staff_select on public.assessment_categories;
create policy acat_staff_select on public.assessment_categories
  for select to authenticated using (public.can_read_assessment_contributions(organization_id));

drop policy if exists ac_staff_select on public.assessment_contributions;
create policy ac_staff_select on public.assessment_contributions
  for select to authenticated using (public.can_read_assessment_contributions(organization_id));

drop policy if exists acs_staff_select on public.assessment_contribution_scores;
create policy acs_staff_select on public.assessment_contribution_scores
  for select to authenticated using (public.can_read_assessment_contributions(organization_id));

drop policy if exists ace_staff_select on public.assessment_contribution_events;
create policy ace_staff_select on public.assessment_contribution_events
  for select to authenticated using (public.can_read_assessment_contributions(organization_id));

drop policy if exists gae_staff_select on public.exam_grade_adjustment_entries;
create policy gae_staff_select on public.exam_grade_adjustment_entries
  for select to authenticated using (public.can_read_assessment_contributions(organization_id));

drop policy if exists gcp_staff_select on public.grade_consolidation_profiles;
create policy gcp_staff_select on public.grade_consolidation_profiles
  for select to authenticated using (public.can_read_assessment_contributions(organization_id));

drop policy if exists gci_staff_select on public.grade_consolidation_inclusions;
create policy gci_staff_select on public.grade_consolidation_inclusions
  for select to authenticated using (public.can_read_assessment_contributions(organization_id));

drop policy if exists gco_staff_select on public.grade_consolidation_overrides;
create policy gco_staff_select on public.grade_consolidation_overrides
  for select to authenticated using (public.can_read_assessment_contributions(organization_id));

drop policy if exists gcr_staff_select on public.grade_consolidation_results;
create policy gcr_staff_select on public.grade_consolidation_results
  for select to authenticated using (public.can_read_assessment_contributions(organization_id));

-- Zero direct client writes: every mutation goes through the application's
-- authorization boundary (route → server layer → service-role client), so RLS
-- is defence in depth rather than the only gate.
revoke insert, update, delete on public.assessment_categories            from public, anon, authenticated;
revoke insert, update, delete on public.assessment_contributions         from public, anon, authenticated;
revoke insert, update, delete on public.assessment_contribution_scores   from public, anon, authenticated;
revoke insert, update, delete on public.assessment_contribution_events   from public, anon, authenticated;
revoke insert, update, delete on public.exam_grade_adjustment_entries    from public, anon, authenticated;
revoke insert, update, delete on public.grade_consolidation_profiles     from public, anon, authenticated;
revoke insert, update, delete on public.grade_consolidation_inclusions   from public, anon, authenticated;
revoke insert, update, delete on public.grade_consolidation_overrides    from public, anon, authenticated;
revoke insert, update, delete on public.grade_consolidation_results      from public, anon, authenticated;

grant select on public.assessment_categories            to authenticated, service_role;
grant select on public.assessment_contributions         to authenticated, service_role;
grant select on public.assessment_contribution_scores   to authenticated, service_role;
grant select on public.assessment_contribution_events   to authenticated, service_role;
grant select on public.exam_grade_adjustment_entries    to authenticated, service_role;
grant select on public.grade_consolidation_profiles     to authenticated, service_role;
grant select on public.grade_consolidation_inclusions   to authenticated, service_role;
grant select on public.grade_consolidation_overrides    to authenticated, service_role;
grant select on public.grade_consolidation_results      to authenticated, service_role;

grant insert, update on public.assessment_categories          to service_role;
grant insert, update on public.assessment_contributions       to service_role;
grant insert, update on public.assessment_contribution_scores to service_role;
grant insert         on public.assessment_contribution_events to service_role;
grant insert         on public.exam_grade_adjustment_entries  to service_role;
grant insert, update on public.grade_consolidation_profiles   to service_role;
grant insert, update, delete on public.grade_consolidation_inclusions to service_role;
grant insert, update, delete on public.grade_consolidation_overrides  to service_role;
grant insert, update on public.grade_consolidation_results    to service_role;

-- ─── 9. Read helpers (candidate-safe) ───────────────────────────────────────
-- Signed total of the unlimited individual adjustment ledger for one attempt.
create or replace function public.grade_adjustment_total(p_attempt_id uuid)
returns numeric
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(case when direction = 'decrease' then -points_delta else points_delta end), 0)
  from public.exam_grade_adjustment_entries
  where attempt_id = p_attempt_id and category_type = 'overall';
$$;

revoke all on function public.grade_adjustment_total(uuid) from public, anon;
grant execute on function public.grade_adjustment_total(uuid) to authenticated, service_role;
