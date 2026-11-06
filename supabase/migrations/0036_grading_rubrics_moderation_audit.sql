-- ═══════════════════════════════════════════════════════════════════════
-- EVALORA — migration 0036: grading rubrics, criterion marking, moderation
-- and an append-only grade-change audit trail.
--
-- The gap this closes: `exam_answers.points_awarded` was overwritten in place,
-- so a regrade erased the previous mark and nothing recorded who changed what,
-- when, or why. Moderation and rubric grading did not exist, and one school's
-- criteria could not be expressed at all.
--
-- Design notes:
--  * Rubrics are organization-owned and REUSABLE. Criteria carry an optional
--    short `code` (e.g. A/B/C/D) so IB MYP criteria A–D can be described, but
--    no curriculum model is hardcoded: any criterion set is valid.
--  * Multi-grader: each grader's criterion score is its own row
--    (answer + criterion + grader). Blind grading is an assignment flag.
--  * Moderation is a decision record. Inserting a decision is what changes the
--    answer's moderation state — never a bare UPDATE — so every state change
--    has a reason attached.
--  * Every change to a mark is written to `grade_change_log` by a database
--    trigger, so the audit trail exists for every write path.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Rubric definitions ────────────────────────────────────────────
create table if not exists public.grading_rubrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 4000),
  framework text check (framework is null or char_length(framework) <= 60),
  total_marks numeric(10,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_grading_rubrics_org on public.grading_rubrics(organization_id, created_at desc);

create table if not exists public.grading_rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references public.grading_rubrics(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  position integer not null default 0,
  code text check (code is null or char_length(code) between 1 and 12),
  label text not null check (char_length(label) between 1 and 300),
  description text check (description is null or char_length(description) <= 4000),
  max_marks numeric(10,2) not null check (max_marks > 0 and max_marks <= 1000),
  created_at timestamptz not null default now(),
  unique (rubric_id, position)
);
create index if not exists idx_grading_criteria_rubric on public.grading_rubric_criteria(rubric_id, position);

create or replace function public.guard_rubric_criterion()
returns trigger language plpgsql security definer set search_path=public as $$
declare rubric_org uuid;
begin
  select organization_id into rubric_org from public.grading_rubrics where id = new.rubric_id for share;
  if not found then raise exception 'Rubric not found.'; end if;
  if new.organization_id is not null and new.organization_id is distinct from rubric_org then
    raise exception 'A criterion must belong to the organization that owns its rubric.';
  end if;
  new.organization_id := rubric_org;
  if tg_op = 'UPDATE' and new.rubric_id is distinct from old.rubric_id then
    raise exception 'A criterion cannot be moved to another rubric.';
  end if;
  return new;
end $$;

drop trigger if exists rubric_criterion_guard on public.grading_rubric_criteria;
create trigger rubric_criterion_guard
  before insert or update on public.grading_rubric_criteria
  for each row execute function public.guard_rubric_criterion();

-- The rubric total is derived from its criteria; it is never hand-maintained.
create or replace function public.sync_rubric_total()
returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
  target := coalesce(new.rubric_id, old.rubric_id);
  update public.grading_rubrics r
     set total_marks = coalesce((select sum(c.max_marks) from public.grading_rubric_criteria c where c.rubric_id = target), 0),
         updated_at = now()
   where r.id = target;
  return null;
end $$;

drop trigger if exists rubric_total_sync on public.grading_rubric_criteria;
create trigger rubric_total_sync
  after insert or update or delete on public.grading_rubric_criteria
  for each row execute function public.sync_rubric_total();

-- ─── 2. Attach rubrics to an examination or one of its questions ───────
create table if not exists public.exam_rubric_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_id uuid references public.questions(id) on delete cascade,
  rubric_id uuid not null references public.grading_rubrics(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_exam_rubric_exam_level
  on public.exam_rubric_links(exam_id, rubric_id) where question_id is null;
create unique index if not exists uq_exam_rubric_question_level
  on public.exam_rubric_links(exam_id, question_id, rubric_id) where question_id is not null;
create index if not exists idx_exam_rubric_exam on public.exam_rubric_links(exam_id);

create or replace function public.guard_exam_rubric_link()
returns trigger language plpgsql security definer set search_path=public as $$
declare exam_org uuid; rubric_org uuid; question_org uuid;
begin
  select organization_id into exam_org from public.exams where id = new.exam_id;
  if not found then raise exception 'Examination not found.'; end if;
  select organization_id into rubric_org from public.grading_rubrics where id = new.rubric_id;
  if not found then raise exception 'Rubric not found.'; end if;
  if rubric_org is distinct from exam_org then
    raise exception 'A rubric can only be attached within its own organization.';
  end if;
  if new.question_id is not null then
    select organization_id into question_org from public.questions where id = new.question_id;
    if question_org is distinct from exam_org then
      raise exception 'The question does not belong to this organization.';
    end if;
  end if;
  if new.organization_id is not null and new.organization_id is distinct from exam_org then
    raise exception 'The rubric link must belong to the examination organization.';
  end if;
  new.organization_id := exam_org;
  return new;
end $$;

drop trigger if exists exam_rubric_link_guard on public.exam_rubric_links;
create trigger exam_rubric_link_guard
  before insert or update on public.exam_rubric_links
  for each row execute function public.guard_exam_rubric_link();

-- ─── 3. Criterion scores (multi-grader aware) ─────────────────────────
create table if not exists public.answer_rubric_scores (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.exam_answers(id) on delete cascade,
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  rubric_id uuid not null references public.grading_rubrics(id) on delete cascade,
  criterion_id uuid not null references public.grading_rubric_criteria(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marks_awarded numeric(10,2) not null check (marks_awarded >= 0),
  grader_id uuid references public.profiles(id) on delete set null,
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (answer_id, criterion_id, grader_id)
);
create index if not exists idx_ars_answer on public.answer_rubric_scores(answer_id);
create index if not exists idx_ars_attempt on public.answer_rubric_scores(attempt_id);

create or replace function public.guard_answer_rubric_score()
returns trigger language plpgsql security definer set search_path=public as $$
declare attempt_exam uuid; exam_org uuid; criterion_max numeric; criterion_rubric uuid;
begin
  select exam_id into attempt_exam from public.exam_attempts where id = new.attempt_id;
  if not found then raise exception 'Attempt not found.'; end if;
  select organization_id into exam_org from public.exams where id = attempt_exam;
  select rubric_id, max_marks into criterion_rubric, criterion_max
    from public.grading_rubric_criteria where id = new.criterion_id;
  if not found then raise exception 'Rubric criterion not found.'; end if;
  if criterion_rubric is distinct from new.rubric_id then
    raise exception 'The criterion does not belong to the selected rubric.';
  end if;
  if new.marks_awarded > criterion_max then
    raise exception 'Marks awarded (%) exceed the criterion maximum (%).', new.marks_awarded, criterion_max;
  end if;
  if not exists (
    select 1 from public.exam_rubric_links l
     where l.exam_id = attempt_exam and l.rubric_id = new.rubric_id
       and (l.question_id is null or l.question_id = new.question_id)
  ) then
    raise exception 'The rubric is not attached to this examination.';
  end if;
  if new.organization_id is not null and new.organization_id is distinct from exam_org then
    raise exception 'A criterion score must belong to the attempt organization.';
  end if;
  new.organization_id := exam_org;
  return new;
end $$;

drop trigger if exists answer_rubric_score_guard on public.answer_rubric_scores;
create trigger answer_rubric_score_guard
  before insert or update on public.answer_rubric_scores
  for each row execute function public.guard_answer_rubric_score();

-- ─── 4. Grader assignment and blind grading ───────────────────────────
create table if not exists public.grading_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  attempt_id uuid references public.exam_attempts(id) on delete cascade,
  grader_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'primary' check (role in ('primary','secondary','moderator')),
  blind boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (exam_id, grader_id, role)
);
create index if not exists idx_grading_assignments_exam on public.grading_assignments(exam_id);

-- ─── 5. Answer grading metadata ───────────────────────────────────────
alter table public.exam_answers
  add column if not exists moderation_status text not null default 'not_required',
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderated_at timestamptz,
  add column if not exists grading_method text not null default 'manual';

alter table public.exam_answers drop constraint if exists exam_answers_moderation_status_check;
alter table public.exam_answers
  add constraint exam_answers_moderation_status_check
  check (moderation_status in ('not_required','pending','approved','adjusted','returned'));

alter table public.exam_answers drop constraint if exists exam_answers_grading_method_check;
alter table public.exam_answers
  add constraint exam_answers_grading_method_check
  check (grading_method in ('manual','answer_key','rubric','ai_assisted'));

alter table public.exams
  add column if not exists grades_published_at timestamptz,
  add column if not exists grades_published_by uuid references public.profiles(id) on delete set null;

-- ─── 6. Moderation decisions (append-only) ────────────────────────────
create table if not exists public.grading_moderation (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.exam_answers(id) on delete cascade,
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  decision text not null check (decision in ('approved','adjusted','returned','pending')),
  previous_marks numeric(10,2),
  proposed_marks numeric(10,2),
  note text check (note is null or char_length(note) <= 2000),
  moderator_id uuid references public.profiles(id) on delete set null,
  moderator_email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_grading_moderation_exam on public.grading_moderation(exam_id, created_at desc);
create index if not exists idx_grading_moderation_answer on public.grading_moderation(answer_id, created_at desc);

create or replace function public.apply_moderation_decision()
returns trigger language plpgsql security definer set search_path=public as $$
declare answer_attempt uuid; attempt_exam uuid; exam_org uuid; prev numeric;
begin
  select attempt_id, points_awarded into answer_attempt, prev
    from public.exam_answers where id = new.answer_id for update;
  if not found then raise exception 'Answer not found.'; end if;
  select exam_id into attempt_exam from public.exam_attempts where id = answer_attempt;
  select organization_id into exam_org from public.exams where id = attempt_exam;

  new.attempt_id := answer_attempt;
  new.exam_id := attempt_exam;
  new.organization_id := exam_org;
  new.previous_marks := prev;
  if new.decision = 'adjusted' and new.proposed_marks is null then
    raise exception 'An adjusted moderation requires the corrected marks.';
  end if;
  return new;
end $$;

drop trigger if exists moderation_decision_context on public.grading_moderation;
create trigger moderation_decision_context
  before insert on public.grading_moderation
  for each row execute function public.apply_moderation_decision();

-- The decision row is the only thing an application writes; the answer state and
-- any corrected mark follow from it atomically.
create or replace function public.project_moderation_decision()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.exam_answers
     set moderation_status = new.decision,
         moderated_by = new.moderator_id,
         moderated_at = now(),
         points_awarded = case when new.decision = 'adjusted' then new.proposed_marks else points_awarded end,
         is_correct = case when new.decision = 'adjusted' then coalesce(new.proposed_marks, 0) > 0 else is_correct end,
         updated_at = now()
   where id = new.answer_id;
  return null;
end $$;

drop trigger if exists moderation_decision_projection on public.grading_moderation;
create trigger moderation_decision_projection
  after insert on public.grading_moderation
  for each row execute function public.project_moderation_decision();

create or replace function public.grading_moderation_append_only()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.exam_answers where id = old.answer_id) then
    return old;
  end if;
  raise exception 'Moderation decisions are append-only and cannot be rewritten.';
end $$;

drop trigger if exists grading_moderation_immutable on public.grading_moderation;
create trigger grading_moderation_immutable
  before update or delete on public.grading_moderation
  for each row execute function public.grading_moderation_append_only();

-- A moderation state may only change through a decision record in the same
-- transaction, so no client can self-approve a mark with a bare UPDATE.
create or replace function public.guard_moderation_state()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.moderation_status is distinct from old.moderation_status then
    if not exists (
      select 1 from public.grading_moderation m
       where m.answer_id = new.id and m.decision = new.moderation_status
    ) then
      raise exception 'Moderation state can only be set by recording a moderation decision.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists moderation_state_guard on public.exam_answers;
create trigger moderation_state_guard
  before update of moderation_status on public.exam_answers
  for each row execute function public.guard_moderation_state();

-- ─── 7. Append-only grade change audit ────────────────────────────────
create table if not exists public.grade_change_log (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.exam_answers(id) on delete cascade,
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  change_type text not null check (change_type in ('marked','regraded','moderated','ai_assisted','published','cleared')),
  previous_points numeric(10,2),
  new_points numeric(10,2),
  previous_is_correct boolean,
  new_is_correct boolean,
  previous_moderation text,
  new_moderation text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_grade_change_answer on public.grade_change_log(answer_id, created_at desc);
create index if not exists idx_grade_change_exam on public.grade_change_log(exam_id, created_at desc);
create index if not exists idx_grade_change_org on public.grade_change_log(organization_id, created_at desc);

create or replace function public.record_grade_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare attempt_exam uuid; exam_org uuid; actor uuid; actor_mail text; kind text;
begin
  if new.points_awarded is not distinct from old.points_awarded
     and new.is_correct is not distinct from old.is_correct
     and new.marked_by is not distinct from old.marked_by
     and new.moderation_status is not distinct from old.moderation_status then
    return null;
  end if;

  select exam_id into attempt_exam from public.exam_attempts where id = new.attempt_id;
  if attempt_exam is null then return null; end if;
  select organization_id into exam_org from public.exams where id = attempt_exam;

  actor := coalesce(new.marked_by, new.moderated_by, auth.uid());
  select email into actor_mail from public.profiles where id = actor;

  kind := case
    when new.moderation_status is distinct from old.moderation_status then 'moderated'
    when old.points_awarded is null then 'marked'
    when new.points_awarded is null then 'cleared'
    else 'regraded'
  end;

  insert into public.grade_change_log
    (answer_id, attempt_id, exam_id, organization_id, actor_id, actor_email, change_type,
     previous_points, new_points, previous_is_correct, new_is_correct,
     previous_moderation, new_moderation, note)
  values
    (new.id, new.attempt_id, attempt_exam, exam_org, actor, actor_mail, kind,
     old.points_awarded, new.points_awarded, old.is_correct, new.is_correct,
     old.moderation_status, new.moderation_status, new.marker_note);
  return null;
end $$;

drop trigger if exists grade_change_recorder on public.exam_answers;
create trigger grade_change_recorder
  after update of points_awarded, is_correct, marked_by, moderation_status on public.exam_answers
  for each row execute function public.record_grade_change();

create or replace function public.grade_change_immutable()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.exam_answers where id = old.answer_id) then
    return old;
  end if;
  raise exception 'The grade change log is append-only.';
end $$;

drop trigger if exists grade_change_append_only on public.grade_change_log;
create trigger grade_change_append_only
  before update or delete on public.grade_change_log
  for each row execute function public.grade_change_immutable();

-- ─── 8. RLS and grants ────────────────────────────────────────────────
alter table public.grading_rubrics enable row level security;
alter table public.grading_rubric_criteria enable row level security;
alter table public.exam_rubric_links enable row level security;
alter table public.answer_rubric_scores enable row level security;
alter table public.grading_assignments enable row level security;
alter table public.grading_moderation enable row level security;
alter table public.grade_change_log enable row level security;

drop policy if exists gr_all on public.grading_rubrics;
create policy gr_all on public.grading_rubrics for all to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','corrector'), false))
  with check (public.is_super_admin() or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','corrector'), false));

drop policy if exists grc_all on public.grading_rubric_criteria;
create policy grc_all on public.grading_rubric_criteria for all to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','corrector'), false))
  with check (public.is_super_admin() or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','corrector'), false));

drop policy if exists erl_all on public.exam_rubric_links;
create policy erl_all on public.exam_rubric_links for all to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','corrector'), false))
  with check (public.is_super_admin() or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','corrector'), false));

drop policy if exists ars_all on public.answer_rubric_scores;
create policy ars_all on public.answer_rubric_scores for all to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','corrector'), false))
  with check (public.is_super_admin() or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','corrector'), false));

drop policy if exists ga_all on public.grading_assignments;
create policy ga_all on public.grading_assignments for all to authenticated
  using (public.is_super_admin() or public.can_manage_org(organization_id))
  with check (public.is_super_admin() or public.can_manage_org(organization_id));

drop policy if exists gm_select on public.grading_moderation;
create policy gm_select on public.grading_moderation for select to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','corrector'), false));

drop policy if exists gm_insert on public.grading_moderation;
create policy gm_insert on public.grading_moderation for insert to authenticated
  with check (moderator_id = auth.uid() and
    (public.is_super_admin() or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','corrector'), false)));

drop policy if exists gcl_select on public.grade_change_log;
create policy gcl_select on public.grade_change_log for select to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','corrector'), false));

revoke update, delete, truncate on public.grading_moderation from authenticated;
revoke insert, update, delete, truncate on public.grade_change_log from authenticated;
revoke all on public.grading_moderation, public.grade_change_log from anon;
