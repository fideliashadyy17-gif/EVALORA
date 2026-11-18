-- Per-answer grading state, used by the complete script review.
--
-- The attempt already records grading_status/auto_score/pending_manual_count.
-- This migration gives every ANSWER its own state, so the review can say
-- "automatically graded", "not graded", "grading failed" or "unanswered" for
-- each question rather than inferring it from a null mark.
--
-- Additive and backward-compatible: existing answers keep their marks. The
-- backfill classifies only rows whose stored evidence is unambiguous.

alter table public.exam_answers
  add column if not exists grading_status text not null default 'not_graded',
  add column if not exists grading_note text,
  add column if not exists part_scores jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exam_answers_grading_status_check'
  ) then
    alter table public.exam_answers
      add constraint exam_answers_grading_status_check
      check (grading_status in ('not_graded','auto_graded','grading_failed','unanswered','human_graded'));
  end if;
end $$;

update public.exam_answers
   set grading_status = case
       when marked_by is not null then 'human_graded'
       when is_correct is not null then 'auto_graded'
       else 'not_graded'
     end
 where grading_status = 'not_graded'
   and (marked_by is not null or is_correct is not null);

create index if not exists exam_answers_attempt_grading_status_idx
  on public.exam_answers (attempt_id, grading_status);

comment on column public.exam_answers.grading_status is 'Per-answer marking state: auto_graded, not_graded, grading_failed, unanswered or human_graded.';
comment on column public.exam_answers.grading_note is 'Candidate-safe explanation when an answer could not be auto-graded.';
comment on column public.exam_answers.part_scores is 'Part-level and structured-construction marks recorded by the grading run.';
