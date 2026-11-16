-- ═══════════════════════════════════════════════════════════════════════
-- EVALORA — MYP criterion results, overall 1–7 grade configuration and an
-- archival trail for moderated/regraded MYP results.
--
-- The gap this closes: papers were already criterion-mapped
-- (`questions.config->>'myp_criterion'`) and the candidate screen could show
-- per-criterion percentages, but there was no configured criterion set per
-- subject, no achievement level 0–8, no configured 1–7 boundaries, and no way
-- to preserve a computed MYP result when it was later moderated.
--
-- Design notes:
--  * Nothing here hardcodes Mathematics. Criteria are configured per SUBJECT,
--    so any MYP subject group (or a school's own criterion model) is valid. The
--    seed below only fills in the openly published IB MYP criteria for subjects
--    it can identify by name/code; every other subject is left for the school
--    to configure in the MYP grading settings screen.
--  * Boundaries are data, not code. The seeded overall boundaries are the
--    published IB MYP totals (0–32 → grade 1–7); the percentage→level
--    conversion is explicitly an EVALORA school policy default and is marked as
--    such in `source` so every report can state where a level came from.
--  * `myp_result_history` is APPEND-ONLY: the engine computes results live from
--    the authoritative answer rows, and a snapshot can be archived at
--    publication or after moderation. A trigger rejects UPDATE and DELETE, so a
--    prior grade can never be silently rewritten.
--  * All changes are additive. No existing table, row, policy or mark is
--    modified or removed.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Criteria configured per subject ───────────────────────────────
create table if not exists public.myp_criteria (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 4),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  position integer not null default 0 check (position >= 0 and position <= 100),
  max_level integer not null default 8 check (max_level between 1 and 8),
  source text check (source is null or char_length(source) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- The trigger below stores `code` canonically (trimmed, upper-cased), so a
-- plain unique constraint is enough and stays usable by ON CONFLICT upserts.
alter table public.myp_criteria drop constraint if exists uq_myp_criteria_subject_code;
create unique index if not exists uq_myp_criteria_subject_code
  on public.myp_criteria(subject_id, code);
create index if not exists idx_myp_criteria_org_subject
  on public.myp_criteria(organization_id, subject_id, position);

-- A criterion must belong to the organization that owns the subject, and its
-- code is stored canonically so "a" and " A " can never become two criteria.
create or replace function public.guard_myp_criterion()
returns trigger language plpgsql security definer set search_path = public as $$
declare subject_org uuid; subject_name text;
begin
  select organization_id, name into subject_org, subject_name
    from public.subjects where id = new.subject_id for share;
  if not found then raise exception 'Subject not found.'; end if;
  if new.organization_id is not null and new.organization_id is distinct from subject_org then
    raise exception 'A criterion must belong to the organization that owns its subject.';
  end if;
  new.organization_id := subject_org;
  new.code := upper(btrim(new.code));
  new.title := btrim(new.title);
  if new.description is not null then new.description := btrim(new.description); end if;
  if tg_op = 'UPDATE' and new.subject_id is distinct from old.subject_id then
    raise exception 'A criterion cannot be moved to another subject.';
  end if;
  return new;
end $$;

drop trigger if exists myp_criterion_guard on public.myp_criteria;
create trigger myp_criterion_guard
  before insert or update on public.myp_criteria
  for each row execute function public.guard_myp_criterion();

-- ─── 2. Percentage → achievement level (0–8) per subject ──────────────
create table if not exists public.myp_level_boundaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  level integer not null check (level between 0 and 8),
  min_percent numeric(5,2) not null check (min_percent >= 0 and min_percent <= 100),
  source text check (source is null or char_length(source) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_myp_level_boundary_subject_level
  on public.myp_level_boundaries(subject_id, level);
create index if not exists idx_myp_level_boundaries_org
  on public.myp_level_boundaries(organization_id, subject_id, level);

-- ─── 3. Criterion totals → overall grade 1–7 ──────────────────────────
-- `subject_id` is NULL for an organization-wide default set, and non-NULL to
-- override it for one subject (e.g. a subject with three criteria).
create table if not exists public.myp_grade_boundaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  min_total integer not null check (min_total >= 0 and min_total <= 64),
  max_total integer not null check (max_total >= 0 and max_total <= 64),
  grade integer not null check (grade between 1 and 7),
  source text check (source is null or char_length(source) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_total >= min_total)
);
create unique index if not exists uq_myp_grade_boundary_scope
  on public.myp_grade_boundaries(organization_id, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid), min_total);
create index if not exists idx_myp_grade_boundaries_org
  on public.myp_grade_boundaries(organization_id, subject_id, min_total);

-- A subject-level boundary set must belong to the same organization.
create or replace function public.guard_myp_boundary_org()
returns trigger language plpgsql security definer set search_path = public as $$
declare subject_org uuid;
begin
  if new.subject_id is not null then
    select organization_id into subject_org from public.subjects where id = new.subject_id;
    if not found then raise exception 'Subject not found.'; end if;
    if subject_org is distinct from new.organization_id then
      raise exception 'Boundaries must belong to the organization that owns the subject.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists myp_level_boundary_org_guard on public.myp_level_boundaries;
create trigger myp_level_boundary_org_guard
  before insert or update on public.myp_level_boundaries
  for each row execute function public.guard_myp_boundary_org();

drop trigger if exists myp_grade_boundary_org_guard on public.myp_grade_boundaries;
create trigger myp_grade_boundary_org_guard
  before insert or update on public.myp_grade_boundaries
  for each row execute function public.guard_myp_boundary_org();

-- ─── 4. Organization-wide aggregation rules ───────────────────────────
create table if not exists public.myp_framework_config (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  framework text not null default 'IB MYP',
  criteria_max_level integer not null default 8 check (criteria_max_level between 1 and 8),
  require_all_criteria boolean not null default true,
  note text check (note is null or char_length(note) <= 1000),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── 5. Append-only archive of computed MYP results ───────────────────
create table if not exists public.myp_result_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  myp_year integer check (myp_year is null or myp_year between 1 and 5),
  reason text not null default 'publication'
    check (reason in ('publication','moderation','regrade','snapshot','configuration_change')),
  marks_awarded numeric(10,2),
  marks_max numeric(10,2),
  percent numeric(6,2),
  total_levels integer,
  total_levels_max integer,
  overall_grade integer check (overall_grade is null or overall_grade between 1 and 7),
  grade_status text not null default 'incomplete'
    check (grade_status in ('final','provisional','incomplete','not_applicable')),
  criterion_snapshot jsonb not null default '[]'::jsonb,
  level_source text,
  grade_source text,
  note text check (note is null or char_length(note) <= 2000),
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_by_email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_myp_result_history_attempt
  on public.myp_result_history(attempt_id, created_at desc);
create index if not exists idx_myp_result_history_org
  on public.myp_result_history(organization_id, created_at desc);
create index if not exists idx_myp_result_history_exam
  on public.myp_result_history(exam_id, created_at desc);

-- History is evidence: no UPDATE and no DELETE, ever.
create or replace function public.guard_myp_result_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'MYP result history is append-only; a snapshot cannot be changed or deleted.';
end $$;

drop trigger if exists myp_result_history_append_only on public.myp_result_history;
create trigger myp_result_history_append_only
  before update or delete on public.myp_result_history
  for each row execute function public.guard_myp_result_history();

-- The attempt, the exam and the organization must agree, so a snapshot can
-- never be filed under another school's attempt.
create or replace function public.guard_myp_result_history_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare attempt_org uuid; attempt_exam uuid;
begin
  select e.organization_id, a.exam_id into attempt_org, attempt_exam
    from public.exam_attempts a
    join public.exams e on e.id = a.exam_id
   where a.id = new.attempt_id;
  if not found then raise exception 'Attempt not found.'; end if;
  if attempt_org is distinct from new.organization_id then
    raise exception 'A result snapshot must belong to the attempt organization.';
  end if;
  if attempt_exam is distinct from new.exam_id then
    raise exception 'A result snapshot must reference the attempt examination.';
  end if;
  return new;
end $$;

drop trigger if exists myp_result_history_scope_guard on public.myp_result_history;
create trigger myp_result_history_scope_guard
  before insert on public.myp_result_history
  for each row execute function public.guard_myp_result_history_scope();

create or replace function public.touch_myp_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists myp_criteria_touch on public.myp_criteria;
create trigger myp_criteria_touch
  before update on public.myp_criteria
  for each row execute function public.touch_myp_updated_at();

drop trigger if exists myp_level_boundaries_touch on public.myp_level_boundaries;
create trigger myp_level_boundaries_touch
  before update on public.myp_level_boundaries
  for each row execute function public.touch_myp_updated_at();

drop trigger if exists myp_grade_boundaries_touch on public.myp_grade_boundaries;
create trigger myp_grade_boundaries_touch
  before update on public.myp_grade_boundaries
  for each row execute function public.touch_myp_updated_at();

drop trigger if exists myp_framework_config_touch on public.myp_framework_config;
create trigger myp_framework_config_touch
  before update on public.myp_framework_config
  for each row execute function public.touch_myp_updated_at();

-- ─── 6. Row Level Security ────────────────────────────────────────────
-- Read: verified members of the organization and the Super Admin (whose global
-- access already works across organizations through is_super_admin()).
-- Write: organization managers (owner/admin) and the Super Admin. History:
-- insert only; the append-only trigger blocks mutation for every role.
alter table public.myp_criteria enable row level security;
alter table public.myp_level_boundaries enable row level security;
alter table public.myp_grade_boundaries enable row level security;
alter table public.myp_framework_config enable row level security;
alter table public.myp_result_history enable row level security;

drop policy if exists myp_criteria_select on public.myp_criteria;
create policy myp_criteria_select on public.myp_criteria
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

drop policy if exists myp_criteria_write on public.myp_criteria;
create policy myp_criteria_write on public.myp_criteria
  for all to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin())
  with check (public.can_manage_org(organization_id) or public.is_super_admin());

drop policy if exists myp_level_boundaries_select on public.myp_level_boundaries;
create policy myp_level_boundaries_select on public.myp_level_boundaries
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

drop policy if exists myp_level_boundaries_write on public.myp_level_boundaries;
create policy myp_level_boundaries_write on public.myp_level_boundaries
  for all to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin())
  with check (public.can_manage_org(organization_id) or public.is_super_admin());

drop policy if exists myp_grade_boundaries_select on public.myp_grade_boundaries;
create policy myp_grade_boundaries_select on public.myp_grade_boundaries
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

drop policy if exists myp_grade_boundaries_write on public.myp_grade_boundaries;
create policy myp_grade_boundaries_write on public.myp_grade_boundaries
  for all to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin())
  with check (public.can_manage_org(organization_id) or public.is_super_admin());

drop policy if exists myp_framework_config_select on public.myp_framework_config;
create policy myp_framework_config_select on public.myp_framework_config
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

drop policy if exists myp_framework_config_write on public.myp_framework_config;
create policy myp_framework_config_write on public.myp_framework_config
  for all to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin())
  with check (public.can_manage_org(organization_id) or public.is_super_admin());

drop policy if exists myp_result_history_select on public.myp_result_history;
create policy myp_result_history_select on public.myp_result_history
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

-- Marking staff archive the snapshot after moderation or a regrade, so the
-- insert policy follows the same content-authoring roles the rest of the
-- assessment workflow uses. The rows remain append-only for everyone.
drop policy if exists myp_result_history_insert on public.myp_result_history;
create policy myp_result_history_insert on public.myp_result_history
  for insert to authenticated
  with check (public.can_create_content(organization_id) or public.is_super_admin());

revoke update, delete on public.myp_result_history from authenticated, anon;

-- ─── 7. Idempotent seeding ────────────────────────────────────────────
-- (a) One framework-configuration row per organization.
insert into public.myp_framework_config (organization_id, framework, criteria_max_level, require_all_criteria, note)
select o.id, 'IB MYP', 8, true,
       'Default: all criteria on the paper must be marked before an overall MYP grade is calculated.'
  from public.organizations o
on conflict (organization_id) do nothing;

-- (b) Organization-default overall grade boundaries (subject_id NULL).
-- Published IB MYP boundaries: total criterion levels 0–32 → overall grade 1–7.
insert into public.myp_grade_boundaries (organization_id, subject_id, min_total, max_total, grade, source)
select o.id, null, b.min_total, b.max_total, b.grade,
       'IB MYP published grade boundaries (total of four criteria, each 0–8, mapped to grades 1–7)'
  from public.organizations o
  cross join (values (0,5,1),(6,9,2),(10,14,3),(15,18,4),(19,23,5),(24,27,6),(28,32,7)) as b(min_total, max_total, grade)
on conflict (organization_id, (coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid)), min_total) do nothing;

-- (c) Standard MYP criteria for subjects that can be identified by name/code.
-- Anything not matched here stays unconfigured on purpose: a report then shows
-- the criterion letters found on the paper, and the school can add the correct
-- criteria from the MYP grading settings screen. Mathematics is NOT assumed.
with preset as (
  select regexp_replace(lower(coalesce(s.code, '') || ' ' || coalesce(s.name, '')), '\s+', ' ', 'g') as haystack, s.id, s.organization_id
    from public.subjects s
), matched as (
  select p.id as subject_id,
         p.organization_id,
         case
           when p.haystack ~ '(math|math[ée]matiques|mth)' then 'mathematics'
           when p.haystack ~ '(science|sciences|sc i|physics|chemistry|biology)' then 'sciences'
           when p.haystack ~ '(english|literature|langue|language and literature)' then 'language_literature'
           when p.haystack ~ '(fran[cç]ais|french|spanish|language acquisition|anglais)' then 'language_acquisition'
           when p.haystack ~ '(social|history|geography|economics|humanities)' then 'individuals_societies'
           when p.haystack ~ '(physical|health|sport)' then 'physical_health'
           when p.haystack ~ '(design|technology|computer|informatique)' then 'design'
           else null
         end as preset
    from preset p
), definitions as (
  select * from (values
    ('mathematics', 'A', 'Knowing and understanding', 0, 'Select appropriate mathematics when solving problems in familiar and unfamiliar situations, and apply it successfully.'),
    ('mathematics', 'B', 'Investigating patterns', 1, 'Apply problem-solving techniques to recognise patterns, describe relationships and generalise rules.'),
    ('mathematics', 'C', 'Communicating', 2, 'Use mathematical language and forms of representation to communicate coherent, complete and concise solutions.'),
    ('mathematics', 'D', 'Applying mathematics in real-life contexts', 3, 'Identify relevant elements of authentic situations, select strategies and justify the degree of accuracy of a solution.'),
    ('sciences', 'A', 'Knowing and understanding', 0, 'Describe scientific ideas and use knowledge to solve problems in familiar and unfamiliar situations.'),
    ('sciences', 'B', 'Inquiring and designing', 1, 'Formulate a testable hypothesis and design a scientific investigation.'),
    ('sciences', 'C', 'Processing and evaluating', 2, 'Present and interpret data, evaluate the hypothesis and explain improvements to the method.'),
    ('sciences', 'D', 'Reflecting on the impacts of science', 3, 'Describe how science is applied and its implications in local and global contexts.'),
    ('language_literature', 'A', 'Analysing', 0, 'Analyse the content, context, language, structure, technique and style of texts.'),
    ('language_literature', 'B', 'Organising', 1, 'Organise opinions and ideas coherently and logically for the task.'),
    ('language_literature', 'C', 'Producing text', 2, 'Produce clear, well-structured texts appropriate to audience and purpose.'),
    ('language_literature', 'D', 'Using language', 3, 'Use appropriate and varied vocabulary, sentence structures and forms of expression correctly.'),
    ('language_acquisition', 'A', 'Comprehending spoken and visual text', 0, 'Comprehend and interpret conventions, messages and meaning in spoken and visual text.'),
    ('language_acquisition', 'B', 'Comprehending written and visual text', 1, 'Comprehend and interpret conventions, messages and meaning in written and visual text.'),
    ('language_acquisition', 'C', 'Communicating in response to spoken and/or written and/or visual text', 2, 'Respond appropriately to spoken, written and visual text in a range of formats.'),
    ('language_acquisition', 'D', 'Using language in spoken and/or written form', 3, 'Use appropriate vocabulary, grammar and register to communicate accurately.'),
    ('individuals_societies', 'A', 'Knowing and understanding', 0, 'Use terminology and concepts in context and demonstrate knowledge of subject content.'),
    ('individuals_societies', 'B', 'Investigating', 1, 'Formulate a clear, focused research question and follow an action plan to investigate it.'),
    ('individuals_societies', 'C', 'Communicating', 2, 'Communicate information and ideas using appropriate structure and communication forms.'),
    ('individuals_societies', 'D', 'Thinking critically', 3, 'Analyse and evaluate sources and interpretations and synthesise information into reasoned judgements.'),
    ('physical_health', 'A', 'Knowing and understanding', 0, 'Use terminology and knowledge of physical and health education in context.'),
    ('physical_health', 'B', 'Planning for performance', 1, 'Design and explain a plan for improving physical performance and health.'),
    ('physical_health', 'C', 'Applying and performing', 2, 'Apply and perform skills, techniques and strategies in physical activity.'),
    ('physical_health', 'D', 'Reflecting and improving performance', 3, 'Explain and evaluate the effectiveness of a plan and its implementation.'),
    ('design', 'A', 'Inquiring and analysing', 0, 'Explain and justify the need for a solution and analyse a range of existing products.'),
    ('design', 'B', 'Developing ideas', 1, 'Develop design specifications and present a range of feasible design ideas.'),
    ('design', 'C', 'Creating the solution', 2, 'Construct a logical plan and demonstrate technical skills to create a solution.'),
    ('design', 'D', 'Evaluating', 3, 'Evaluate the success of the solution against the design specification and its impact.')
  ) as d(preset, code, title, position, description)
)
insert into public.myp_criteria (organization_id, subject_id, code, title, description, position, max_level, source)
select m.organization_id, m.subject_id, d.code, d.title, d.description, d.position, 8,
       'IB MYP published subject-group criteria (subject brief, criteria A–D)'
  from matched m
  join definitions d on d.preset = m.preset
 where m.preset is not null
on conflict (subject_id, code) do nothing;

-- (d) Criterion percentage → level boundaries for every subject with criteria.
-- This is an EVALORA default (school policy), not an IB-published table, and
-- the source text says so on every export.
insert into public.myp_level_boundaries (organization_id, subject_id, level, min_percent, source)
select distinct c.organization_id, c.subject_id, b.level, b.min_percent,
       'EVALORA default criterion-level conversion — percentage of criterion marks to MYP achievement level (school-configurable; not an IB-published boundary)'
  from public.myp_criteria c
  cross join (values (0,0),(1,1),(2,20),(3,35),(4,50),(5,65),(6,75),(7,85),(8,95)) as b(level, min_percent)
on conflict (subject_id, level) do nothing;

-- (e) Per-subject overall boundaries mirroring the organization default, so a
-- school can override one subject without losing the org-wide set.
insert into public.myp_grade_boundaries (organization_id, subject_id, min_total, max_total, grade, source)
select distinct c.organization_id, c.subject_id, b.min_total, b.max_total, b.grade,
       'IB MYP published grade boundaries (total of four criteria, each 0–8, mapped to grades 1–7)'
  from public.myp_criteria c
  cross join (values (0,5,1),(6,9,2),(10,14,3),(15,18,4),(19,23,5),(24,27,6),(28,32,7)) as b(min_total, max_total, grade)
on conflict (organization_id, (coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid)), min_total) do nothing;
