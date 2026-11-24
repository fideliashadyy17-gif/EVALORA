-- Narrow the assessment-source guard so paper SETTINGS stay writable and
-- content freezes only once a candidate attempt (or live session) exists.
--
-- Why (Paper Builder / workspace error, issues 2 and 4):
--   * quizzes.settings holds the paper's template, section titles and
--     instructions, marks breakdown, calculator and official header — but
--     guard_assessment_source_mutation blocked EVERY update of an
--     exam-attached quiz (51 papers), so Paper Builder save failed with a
--     raw 55000 ASSESSMENT_SOURCE_IMMUTABLE error and teachers lost edits.
--   * Content (questions, options, question membership) must stay immutable
--     once a candidate attempt exists or a live session is running: attempts
--     snapshot question_order and answers. An exams row ALONE no longer
--     freezes a paper, so a paper can be corrected until candidates sit it.
--
-- Nothing here deletes or rewrites attempts, answers, scores or results.
-- The quizzes DELETE rule keeps the original exams/sessions/attempt check;
-- tenant-move and plan-quota triggers are untouched.

CREATE OR REPLACE FUNCTION public.guard_assessment_source_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_paper_ids uuid[] := array[]::uuid[];
  v_question_ids uuid[] := array[]::uuid[];
  v_id uuid;
  v_lock_key text;
  v_locked boolean;
begin
  -- The quizzes row itself is metadata: settings, template, instructions and
  -- marks breakdown live here and cannot rewrite a historical attempt's
  -- answers, question order or scores.
  if tg_table_name = 'quizzes' and tg_op = 'UPDATE' then
    return new;
  end if;

  if tg_table_name = 'quizzes' then
    if tg_op <> 'INSERT' then v_paper_ids := array_append(v_paper_ids, old.id); end if;
    if tg_op <> 'DELETE' then v_paper_ids := array_append(v_paper_ids, new.id); end if;
  elsif tg_table_name = 'quiz_questions' then
    if tg_op <> 'INSERT' then
      v_paper_ids := array_append(v_paper_ids, old.quiz_id);
      v_question_ids := array_append(v_question_ids, old.question_id);
    end if;
    if tg_op <> 'DELETE' then
      v_paper_ids := array_append(v_paper_ids, new.quiz_id);
      v_question_ids := array_append(v_question_ids, new.question_id);
    end if;
  elsif tg_table_name = 'questions' then
    if tg_op <> 'INSERT' then v_question_ids := array_append(v_question_ids, old.id); end if;
    if tg_op <> 'DELETE' then v_question_ids := array_append(v_question_ids, new.id); end if;
  elsif tg_table_name = 'question_options' then
    if tg_op <> 'INSERT' then v_question_ids := array_append(v_question_ids, old.question_id); end if;
    if tg_op <> 'DELETE' then v_question_ids := array_append(v_question_ids, new.question_id); end if;
  else
    raise exception 'unsupported assessment source table: %', tg_table_name;
  end if;

  if tg_table_name = 'quizzes' and tg_op <> 'INSERT' then
    select coalesce(array_agg(distinct qq.question_id), array[]::uuid[])
      into v_question_ids
      from public.quiz_questions qq where qq.quiz_id = old.id;
  end if;

  if cardinality(v_question_ids) > 0 then
    for v_id in select distinct x from unnest(v_question_ids) as ids(x) where x is not null order by x loop
      perform pg_advisory_xact_lock(hashtextextended('question:' || v_id::text, 0));
    end loop;

    select coalesce(array_agg(distinct qq.quiz_id), array[]::uuid[])
      into v_paper_ids
      from public.quiz_questions qq
     where qq.question_id = any(v_question_ids);
  end if;

  if tg_table_name = 'quiz_questions' and tg_op <> 'INSERT' then v_paper_ids := array_append(v_paper_ids, old.quiz_id); end if;
  if tg_table_name = 'quiz_questions' and tg_op <> 'DELETE' then v_paper_ids := array_append(v_paper_ids, new.quiz_id); end if;
  if tg_table_name = 'quizzes' and tg_op <> 'INSERT' then v_paper_ids := array_append(v_paper_ids, old.id); end if;
  if tg_table_name = 'quizzes' and tg_op <> 'DELETE' then v_paper_ids := array_append(v_paper_ids, new.id); end if;

  foreach v_id in array v_paper_ids loop
    if v_id is null then continue; end if;
    if tg_table_name = 'quizzes' and tg_op = 'DELETE' then
      -- Deleting a paper is blocked while any exam, attempt or live session
      -- still points at it (original rule plus attempts).
      select exists (select 1 from public.exams e where e.quiz_id = v_id)
          or exists (select 1 from public.exam_attempts a join public.exams e2 on e2.id = a.exam_id where e2.quiz_id = v_id)
          or exists (select 1 from public.quiz_sessions s where s.quiz_id = v_id)
        into v_locked;
    else
      -- Content and membership freeze only once a candidate attempt exists or
      -- a live session is running — that is where question order and answers
      -- are snapshot. An exams row alone no longer freezes the paper.
      select exists (select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id where e.quiz_id = v_id)
          or exists (select 1 from public.quiz_sessions s where s.quiz_id = v_id)
        into v_locked;
    end if;
    if v_locked then
      raise exception 'assessment content is immutable after an attempt or live session uses this paper; duplicate it to create a new version'
        using errcode = '55000', detail = 'ASSESSMENT_SOURCE_IMMUTABLE';
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
