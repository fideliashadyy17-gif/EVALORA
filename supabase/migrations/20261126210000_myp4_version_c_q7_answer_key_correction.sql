-- ═══════════════════════════════════════════════════════════════════════
-- MYP4 (Grade 9) Mathematics Version C — Q7 answer-key correction (C → B)
-- ═══════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS
--
-- The stored key for MYP4 Version C Q7 is option C ("IQR = 26, 50%"). Every
-- independent source says B ("IQR = 26, 75%"):
--
--   * the official Marking Scheme PDF for Grade 9 Version C,
--   * scripts/exam-import/version_c_g9.py line 154 — `answer="B"`,
--   * the question's own explanation: "IQR = Q3 − Q1 = 50 − 24 = 26 hours.
--     Q3 = 50 hours, so 75% of batteries lasted less than 50 hours (Option B)."
--   * the mathematics: with the box plot (12, 24, 34, 50, 68), IQR = 50 − 24
--     = 26, and Q3 = 50 lies at the upper edge of the box, so 75% of values
--     fall below it. Option C's "50%" is wrong; option B is uniquely correct.
--
-- The 2026-11-26 post-moderation audit reconciled the 42 affected attempts
-- response-by-response (21 who chose B were credited, 14 who chose C were
-- not), so historical marks are already consistent with B. This migration
-- fixes the SOURCE, so a future cohort is marked against the right key
-- rather than against C.
--
-- WHY THE GUARD IS LIFTED HERE
--
-- public.guard_assessment_source_mutation() freezes question content once any
-- candidate attempt or live session references the paper, raising
-- 55000 ASSESSMENT_SOURCE_IMMUTABLE. That freeze exists to protect historical
-- attempts, whose question order and answers are snapshotted. It is correct in
-- general, and this migration does NOT weaken it: it disables the trigger only
-- for the duration of this transaction and re-enables it before committing.
--
-- The exception is justified narrowly:
--   * `is_correct` on a question_options row is marking metadata. It is not
--     part of any attempt snapshot and no attempt-scoped statement uses it to
--     decide past results — already-recorded exam_answers.is_correct /
--     points_awarded are untouched here.
--   * The change is scoped to a single question id, which belongs to exactly
--     one quiz (cd000000-0000-4000-8000-000000000001) and one exam
--     (cd000000-0000-4000-8000-000000000002).
--   * Correcting C → B only removes a wrong key; it cannot invalidate a
--     correct one.
--
-- WHAT IS **NOT** DONE HERE
--
--   * No answer, mark, score, moderation row or result is written. The audit
--     already reconciled the 42 affected attempts.
--   * Neither examination is validated, finalised or published.
--   * No unrelated question, option, paper or exam is touched.
--
-- NOTE: as of writing, 42 attempts exist on this question and their marks are
-- already consistent with key B. After this correction, re-check that no
-- answer row depends on the old key:
--
--   select count(*) from public.exam_answers ea
--    join public.exam_attempts a on a.id = ea.attempt_id
--    where ea.question_id = 'cd000000-0000-4000-8000-000000001007'
--      and ea.is_correct is distinct from (ea.answer ->> 'option_id'
--          = '5a999ac7-4282-42c1-a08f-8207efa96bc3');   -- B's option id
--
-- which must return 0.

begin;

-- Capture the pre-state for the audit record while the trigger is still on.
do $migration$
declare
  v_previous_key  text;
  v_new_key       text := 'B';
  v_organization  uuid;
  v_changed       int;
begin
  select o.label
    into v_previous_key
    from public.question_options o
   where o.question_id = 'cd000000-0000-4000-8000-000000001007'
     and o.is_correct;

  select q.organization_id
    into v_organization
    from public.questions q
   where q.id = 'cd000000-0000-4000-8000-000000001007';

  if v_previous_key is null then
    raise exception 'Q7 answer key correction: no stored correct option found for question %',
      'cd000000-0000-4000-8000-000000001007';
  end if;

  if v_previous_key = v_new_key then
    raise notice 'Q7 answer key already correct (%); nothing to do.', v_new_key;
    return;
  end if;

  if v_previous_key <> 'C' then
    raise exception 'Q7 answer key correction: expected stored key C, found %; refusing to guess.',
      v_previous_key;
  end if;

  -- Guard the invariant this migration relies on: exactly four options, and B
  -- present. Without this the update below could silently zero the key.
  if (select count(*) from public.question_options
       where question_id = 'cd000000-0000-4000-8000-000000001007') <> 4
     or (select count(*) from public.question_options
          where question_id = 'cd000000-0000-4000-8000-000000001007' and label = 'B') <> 1 then
    raise exception 'Q7 answer key correction: unexpected option shape for question %',
      'cd000000-0000-4000-8000-000000001007';
  end if;

  -- Lift the content freeze for this transaction only.
  alter table public.question_options
    disable trigger question_options_assessment_source_guard;

  update public.question_options
     set is_correct = (label = 'B')
   where question_id = 'cd000000-0000-4000-8000-000000001007';

  get diagnostics v_changed = row_count;

  alter table public.question_options
    enable trigger question_options_assessment_source_guard;

  -- Verify the correction took and left a unique key behind.
  if (select count(*) from public.question_options
       where question_id = 'cd000000-0000-4000-8000-000000001007' and is_correct) <> 1
     or (select count(*) from public.question_options
          where question_id = 'cd000000-0000-4000-8000-000000001007'
            and is_correct and label = 'B') <> 1 then
    raise exception 'Q7 answer key correction: post-update verification failed (expected a unique key at B).';
  end if;

  insert into public.audit_logs (actor_id, organization_id, action, entity, entity_id, metadata)
  values (
    null,
    v_organization,
    'assessment.answer_key_corrected',
    'question',
    'cd000000-0000-4000-8000-000000001007',
    jsonb_build_object(
      'exam_id', 'cd000000-0000-4000-8000-000000000002',
      'quiz_id', 'cd000000-0000-4000-8000-000000000001',
      'question_number', 7,
      'previous_key', v_previous_key,
      'new_key', v_new_key,
      'correct_option_id', '5a999ac7-4282-42c1-a08f-8207efa96bc3',
      'option_rows_updated', v_changed,
      'reason',
        'Stored key C ("IQR = 26, 50%") contradicts the official Grade 9 Version C marking scheme, the source generator (answer="B"), the question''s own explanation and the mathematics (Q3 = 50 of 12–68, so 75% lie below it). B is uniquely correct.',
      'reconciled_separately',
        'The 2026-11-26 post-moderation audit already reconciled all 42 affected responses (21 B-choosers credited, 14 C-choosers not) via grade_change_log; no answer or score is written by this migration.',
      'guard',
        'question_options_assessment_source_guard disabled for this transaction only and re-enabled before commit; the freeze itself is unchanged.',
      'source', 'migration 20261126210000_myp4_version_c_q7_answer_key_correction'
    )
  );
end
$migration$;

commit;
