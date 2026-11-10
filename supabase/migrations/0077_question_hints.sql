-- ═══════════════════════════════════════════════════════════════════════
-- EVALORA — migration 0077
-- Universal, question-specific examination hints ("Need a Hint?").
--
-- This migration is purely ADDITIVE. It creates one new table and its
-- policies/triggers. It does NOT touch `exams`, `questions`, `quizzes`,
-- `exam_questions`, `exam_attempts`, `exam_answers` or any existing row, so:
--   · examinations with no hints keep behaving exactly as before;
--   · attempts in progress are unaffected (no column added to them, no
--     trigger on them, no lock beyond the short catalog update below);
--   · no question is copied or duplicated to attach a hint.
--
-- Scope model
--   exam_id IS NULL  → a bank-wide hint for the question (usable by every
--                      examination that uses this question).
--   exam_id NOT NULL → an examination-specific hint that SHADOWS the bank
--                      hint for that examination only. Editing it never
--                      changes another examination's hints.
-- ═══════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

create table if not exists public.question_hints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- NULL = applies to the question across the whole organization's bank.
  exam_id uuid references public.exams(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  -- Progressive guidance: 1 = gentle clue, 2 = more specific method,
  -- 3 = a guided next step. Never the answer.
  level smallint not null default 1 check (level between 1 and 3),
  body text not null check (char_length(btrim(body)) between 8 and 800),
  body_doc jsonb,
  status text not null default 'draft' check (status in ('draft','approved','published','archived')),
  source text not null default 'manual' check (source in ('manual','ai')),
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A hint may only be approved/published by a recorded reviewer.
  constraint question_hints_review_shape check (
    (status in ('draft','archived'))
    or (status = 'approved' and approved_at is not null and approved_by is not null)
    or (status = 'published' and approved_at is not null and approved_by is not null and published_at is not null)
  )
);

comment on table public.question_hints is
  'Pedagogical hints shown inside the examination interface. Only status = published rows are ever sent to a candidate, and only as plain guidance text — never the answer, key or marking scheme.';
comment on column public.question_hints.exam_id is
  'NULL = organisation-wide hint for the question; set = an examination-specific override that shadows the bank hint for that examination only.';

-- One hint per level per scope. Two partial uniques because `exam_id` is nullable.
create unique index if not exists uq_question_hints_bank
  on public.question_hints(organization_id, question_id, level) where exam_id is null;
create unique index if not exists uq_question_hints_exam
  on public.question_hints(exam_id, question_id, level) where exam_id is not null;
create index if not exists idx_question_hints_lookup
  on public.question_hints(question_id, status) where status = 'published';
create index if not exists idx_question_hints_exam_lookup
  on public.question_hints(exam_id, status) where exam_id is not null;
create index if not exists idx_question_hints_org on public.question_hints(organization_id, status);

-- ── Tenant + ownership guard ────────────────────────────────────────────
create or replace function public.guard_question_hint()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_question_org uuid;
  v_exam_org uuid;
begin
  select organization_id into v_question_org from public.questions where id = new.question_id;
  if not found then raise exception 'Question not found.'; end if;
  if new.organization_id is distinct from v_question_org then
    raise exception 'A hint must belong to the question''s organisation.';
  end if;
  if new.exam_id is not null then
    select organization_id into v_exam_org from public.exams where id = new.exam_id;
    if not found then raise exception 'Examination not found.'; end if;
    if v_exam_org is distinct from new.organization_id then
      raise exception 'A hint must belong to the examination''s organisation.';
    end if;
  end if;
  -- Publication is a review decision, so the reviewer stamp is server-side.
  if new.status in ('approved','published') and new.approved_at is null then
    new.approved_at := now();
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  if new.status <> 'published' then
    new.published_at := null;
  end if;
  new.body := btrim(new.body);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_guard_question_hint on public.question_hints;
create trigger trg_guard_question_hint
  before insert or update on public.question_hints
  for each row execute function public.guard_question_hint();

-- ── Row Level Security ──────────────────────────────────────────────────
alter table public.question_hints enable row level security;

-- Authors and reviewers: organisation content authors, or the Super Admin.
drop policy if exists qh_select on public.question_hints;
create policy qh_select on public.question_hints for select to authenticated
  using (
    public.is_super_admin()
    or public.is_org_member(organization_id)
    or exists (
      -- a candidate may read only their own attempt's published hint rows
      select 1
      from public.exam_attempts a
      join public.exam_candidates c on c.id = a.candidate_id
      join public.students s on s.id = c.student_id
      where s.user_id = auth.uid()
        and c.exam_id = question_hints.exam_id
        and question_hints.status = 'published'
    )
  );

drop policy if exists qh_insert on public.question_hints;
create policy qh_insert on public.question_hints for insert to authenticated
  with check (public.is_super_admin() or public.can_create_content(organization_id));

drop policy if exists qh_update on public.question_hints;
create policy qh_update on public.question_hints for update to authenticated
  using (public.is_super_admin() or public.can_create_content(organization_id))
  with check (public.is_super_admin() or public.can_create_content(organization_id));

drop policy if exists qh_delete on public.question_hints;
create policy qh_delete on public.question_hints for delete to authenticated
  using (public.is_super_admin() or public.can_create_content(organization_id));

-- ── Platform switch (default on; no examination is disabled by this row) ──
insert into public.platform_settings (key, value)
values ('exam_hints_policy', '{"enabled": true, "max_levels": 3, "require_review": true}'::jsonb)
on conflict (key) do nothing;
