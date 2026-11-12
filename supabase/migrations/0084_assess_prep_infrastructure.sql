-- ═══════════════════════════════════════════════════════════════════════
-- EVALORA — migration 0084
-- Assess Prep infrastructure:
--   1. a new typed question type `assess_parts` (multi-part, every part is
--      typed by the student — no options, ever);
--   2. `exam_hint_usage`: per-student, per-question (and per-part) record of
--      hint use, so teachers and students can see it in the results views.
-- Additive only: no existing row, column or behaviour is changed.
-- ═══════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions add constraint questions_type_check
  check (type in ('single_choice','multiple_select','true_false','short_answer',
                  'numeric','ordering','matching','poll','open_ended','slide',
                  'assess_parts'));

create table if not exists public.exam_hint_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  candidate_id uuid references public.exam_candidates(id) on delete set null,
  question_id uuid not null references public.questions(id) on delete cascade,
  -- '' = the question-level hint; otherwise the Assess Prep part id ("a"…).
  -- (Empty string rather than NULL so the unique key below dedupes.)
  part_id text not null default '' check (char_length(part_id) <= 12),
  level smallint not null check (level between 1 and 3),
  first_used_at timestamptz not null default now(),
  times_opened int not null default 1 check (times_opened >= 1),
  unique (attempt_id, question_id, part_id, level)
);

comment on table public.exam_hint_usage is
  'Which hints a candidate opened, per question/part and level. Formative signal only: it never changes a mark. Written only by the hint-usage route (service role) after validating the attempt token; read by teachers of the organisation and by the candidate''s own feedback summary.';

create index if not exists idx_exam_hint_usage_attempt on public.exam_hint_usage(attempt_id);
create index if not exists idx_exam_hint_usage_exam on public.exam_hint_usage(exam_id, question_id);
create index if not exists idx_exam_hint_usage_org on public.exam_hint_usage(organization_id);

create or replace function public.record_exam_hint_use(
  p_attempt uuid, p_question uuid, p_part text, p_level smallint
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_exam uuid; v_org uuid; v_candidate uuid;
begin
  select a.exam_id, a.candidate_id, e.organization_id
    into v_exam, v_candidate, v_org
    from public.exam_attempts a join public.exams e on e.id = a.exam_id
   where a.id = p_attempt and a.status = 'in_progress';
  if v_exam is null then raise exception 'Attempt is not in progress.'; end if;
  insert into public.exam_hint_usage (organization_id, exam_id, attempt_id, candidate_id, question_id, part_id, level)
  values (v_org, v_exam, p_attempt, v_candidate, p_question, coalesce(p_part, ''), p_level)
  on conflict (attempt_id, question_id, part_id, level)
  do update set times_opened = public.exam_hint_usage.times_opened + 1;
end $$;

alter table public.exam_hint_usage enable row level security;

drop policy if exists ehu_select on public.exam_hint_usage;
create policy ehu_select on public.exam_hint_usage for select to authenticated
  using (
    public.is_super_admin()
    or public.is_org_member(organization_id)
    or exists (
      select 1 from public.exam_attempts a
      join public.exam_candidates c on c.id = a.candidate_id
      join public.students s on s.id = c.student_id
      where a.id = exam_hint_usage.attempt_id and s.user_id = auth.uid()
    )
  );
-- No insert/update/delete policy: writes go through record_exam_hint_use()
-- via the service-role hint-usage route only.
