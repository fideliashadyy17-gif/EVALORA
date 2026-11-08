-- The four Grade 1 / CI examinations of the second marking period.
--
-- Source document: "Grade 1 / CI — End of Second Marking Period Examination
-- 2026/2027" (21 pages, supplied PDF). The four papers are printed on page 1 as
-- MATHEMATICS (pages 2-5), SCIENCE (pages 6-9), LANGUAGE ART (pages 10-13) and
-- SOCIAL SCIENCE (pages 14-17), each "40 Marks | 40 Mins". This step creates the
-- four papers and the four examinations. It refuses to create anything unless
-- every question, every printed answer choice and every answer key is already
-- in place, so a partially written paper never reaches a pupil.
--
-- Class: the examinations are assigned to the existing CI class
-- (0a400000-0000-4000-8000-000000000101), which is the class ladder's grade 1
-- record — `grade_order = 1`, "Oak International School class ladder 2026/2027".
-- The source document itself titles every page "GRADE 1 / CI", so CI is this
-- platform's Grade 1 and no second Grade 1 class is created.
--
-- Duration: 40 minutes for every paper, printed on each paper's own cover
-- ("Time: 40 Mins") and repeated on the index page ("40 Marks  |  40 Mins").
-- Nothing is assumed: if a paper's printed duration were absent this block would
-- refuse rather than default.
--
-- Access: the platform's standard shared-link examination — a four-character
-- class code per paper plus first name and last name on the link page. The
-- source document specifies no access restriction, so no new restriction is
-- invented; identity on the link page is the platform default.
--
-- Titles are the four requested titles; the paper's own heading ("LANGUAGE
-- ART") is kept in each quiz's description and in the title of nothing, so the
-- examination a teacher sees matches the request exactly.
--
-- Idempotent: an examination whose title already exists in this workspace is
-- left untouched and reported, never duplicated.

do $$
declare
  v_org uuid := '0a400000-0000-4000-8000-000000000001';
  v_class uuid := '0a400000-0000-4000-8000-000000000101';
  v_subject text;
  v_title text;
  v_code text;
  v_heading text;
  v_quiz uuid;
  v_exam uuid;
  v_questions int;
  v_options int;
  v_keyed int;
  v_paper int;
  v_existing uuid;
  v_papers text[] := array['mathematics', 'language-arts', 'social-science', 'science'];
begin
  if not exists (select 1 from public.classes where id = v_class and organization_id = v_org) then
    raise exception 'The CI class (grade 1) was not found in Oak International School; refusing to attach the papers.';
  end if;

  foreach v_subject in array v_papers loop
    v_title := case v_subject
      when 'mathematics'   then 'Examination of Grade 1 – Mathematics'
      when 'language-arts' then 'Examination of Grade 1 – Language Arts'
      when 'social-science' then 'Examination of Grade 1 – Social Science'
      else 'Examination of Grade 1 – Science'
    end;
    v_heading := case v_subject
      when 'mathematics'   then 'MATHEMATICS'
      when 'language-arts' then 'LANGUAGE ART'
      when 'social-science' then 'SOCIAL SCIENCE'
      else 'SCIENCE'
    end;
    v_code := case v_subject
      when 'mathematics'   then 'G1-MATH-2026'
      when 'language-arts' then 'G1-LANG-2026'
      when 'social-science' then 'G1-SOC-2026'
      else 'G1-SCI-2026'
    end;

    select id into v_existing
      from public.exams
     where organization_id = v_org and title = v_title
     limit 1;
    if v_existing is not null then
      raise notice '% already exists (%), nothing to do.', v_title, v_existing;
      continue;
    end if;

    -- Every guard below fails loudly instead of creating a thin paper.
    select count(*) into v_questions
      from public.questions q
     where q.organization_id = v_org
       and q.config ->> 'source' = 'oak-grade1-ci-2026-2027'
       and q.config ->> 'subject' = v_subject;
    if v_questions <> 30 then
      raise exception 'The % paper holds % questions; the printed paper has 30.', v_subject, v_questions;
    end if;

    select count(*) into v_options
      from public.question_options o
      join public.questions q on q.id = o.question_id
     where q.organization_id = v_org
       and q.config ->> 'source' = 'oak-grade1-ci-2026-2027'
       and q.config ->> 'subject' = v_subject;
    if v_options = 0 then
      raise exception 'The % paper has no answer choices.', v_subject;
    end if;

    -- Section A is 20 single-choice or true/false questions, each with exactly
    -- one keyed option. A paper that cannot auto-mark its own objective section
    -- is a defect, so this is asserted rather than repaired silently.
    select count(*) into v_keyed
      from public.questions q
     where q.organization_id = v_org
       and q.config ->> 'source' = 'oak-grade1-ci-2026-2027'
       and q.config ->> 'subject' = v_subject
       and q.type in ('single_choice', 'true_false', 'short_answer')
       and (select count(*) from public.question_options o
             where o.question_id = q.id and o.is_correct) = 1;
    if v_keyed <> 20 then
      raise exception 'The % paper has % auto-markable questions with one keyed answer; Section A prints 20.', v_subject, v_keyed;
    end if;

    -- The printed marking arithmetic: 20 x 1 mark + 10 x 2 marks = 40 marks.
    if (select sum(q.points) from public.questions q
         where q.organization_id = v_org
           and q.config ->> 'source' = 'oak-grade1-ci-2026-2027'
           and q.config ->> 'subject' = v_subject) <> 40 then
      raise exception 'The % paper does not total the printed 40 marks.', v_subject;
    end if;

    insert into public.quizzes (organization_id, title, description, status, settings)
    values (
      v_org,
      v_title,
      format('Grade 1 / CI — End of Second Marking Period %s paper, 2026/2027. 30 printed questions: Section A 20 questions x 1 mark, Section B 10 tasks x 2 marks, 40 marks in total, 40 minutes.', v_heading),
      'published',
      jsonb_build_object('randomize_questions', false, 'randomize_options', false)
    )
    returning id into v_quiz;

    insert into public.quiz_questions (quiz_id, question_id, position, points)
    select v_quiz, q.id, (q.config ->> 'question_number')::int, q.points
      from public.questions q
     where q.organization_id = v_org
       and q.config ->> 'source' = 'oak-grade1-ci-2026-2027'
       and q.config ->> 'subject' = v_subject
     order by (q.config ->> 'question_number')::int;

    select count(*) into v_paper from public.quiz_questions where quiz_id = v_quiz;
    if v_paper <> 30 then
      raise exception 'The % paper holds % printed questions; expected 30.', v_subject, v_paper;
    end if;

    insert into public.exams
      (organization_id, quiz_id, class_id, title, description, instructions, duration_minutes,
       status, access_code, shared_link_enabled, settings)
    values (
      v_org,
      v_quiz,
      v_class,
      v_title,
      format('Grade 1 / CI — %s. 30 questions, 40 marks in total, 40 minutes.', v_heading),
      'Listen to your teacher and answer ALL questions. Section A has 20 questions and each one carries 1 mark. '
      || 'Section B has 10 tasks and each one carries 2 marks; your teacher will mark those. '
      || 'You have 40 minutes. Pictures are shown with each question — look at them carefully before you answer. '
      || 'Type your first name and last name exactly as they appear on your class list. '
      || 'Leaving the examination tab, losing window focus, copying, pasting or cutting text and leaving full screen are recorded for your teacher. '
      || 'An incident is recorded for your teacher to review; it never closes your paper, stops your timer or changes your answers.',
      40,
      'open',
      v_code,
      true,
      jsonb_build_object(
        'proctoring', false,
        'require_screen_share', false,
        'randomize_questions', false,
        'randomize_options', false,
        'pass_mark_percent', 50,
        'results_published', false,
        'publication_mode', 'manual',
        'access_mode', 'shared_link',
        'identity_fields', '[]'::jsonb,
        'eligible_class_ids', jsonb_build_array(v_class::text),
        'attempt_policy', 'single_resume',
        'source', 'oak-grade1-ci-2026-2027',
        'printed_subject_heading', v_heading,
        'integrity', jsonb_build_object(
          'enabled', true,
          'tabSwitch', true,
          'focusLoss', true,
          'fullscreen', true,
          'clipboard', true,
          'contextMenu', true,
          'sound', true,
          'warnAfter', 3,
          'reviewAfter', 5
        )
      )
    )
    returning id into v_exam;

    raise notice '% created: exam %, quiz %, 30 questions, 40 marks, 40 minutes, class CI.',
      v_title, v_exam, v_quiz;
  end loop;
end $$;
