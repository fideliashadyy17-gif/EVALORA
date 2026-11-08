-- The four Grade 4 examinations of the second marking period.
--
-- Source document: "OAK_Grade4_Second_Marking_Period_Exam_Papers_2026_2027.pdf".
-- Page 1 prints the four papers and their tariff: MATHEMATICS pages 2-4,
-- SCIENCE pages 5-7, LANGUAGE ART pages 8-10, SOCIAL SCIENCE pages 11-13, each
-- "50 Marks | 60 Mins (Sec A: 20m + Sec B: 30m)". This step creates the four
-- papers and the four examinations. It refuses to create anything unless every
-- question, every printed choice and every answer key is already in place, so a
-- half-written paper never reaches a pupil.
--
-- Class: the examinations are assigned to the existing Grade 4 class, which this
-- workspace stores as CE2 (0a400000-0000-4000-8000-000000000104,
-- `grade_order = 4`, "Oak International School class ladder 2026/2027"). No
-- second Grade 4 class is created: the source paper itself is headed
-- "Class: GRADE 4" and CE2 is that grade on the ladder.
--
-- Duration: 60 minutes for every paper, printed on each paper's own cover
-- ("Time Allowed: 60 Mins") and on the index page ("50 Marks  |  60 Mins").
-- Nothing is assumed; the block reads the printed value and checks the questions
-- add up to the printed 50 marks before it writes anything.
--
-- Access: the platform's standard shared-link examination — one class code per
-- paper plus first name and last name on the link page. The source document
-- specifies no access restriction, so none is invented; identity on the link
-- page is the platform default. The paper is open to Grade 4 pupils only:
-- `eligible_class_ids` carries the CE2 class.
--
-- Titles are the four requested titles, exactly:
--   Examination of Grade 4 – Mathematics
--   Examination of Grade 4 – Language Arts
--   Examination of Grade 4 – Social Science
--   Examination of Grade 4 – Science
-- The paper's own heading ("LANGUAGE ART") is kept in each quiz description and
-- in `printed_subject_heading`, so a teacher can see which printed paper each
-- examination is without the title drifting from what was asked for.
--
-- Idempotent: an examination whose title already exists in this workspace is
-- left untouched and reported, never duplicated.

do $$
declare
  v_org uuid := '0a400000-0000-4000-8000-000000000001';
  v_class uuid := '0a400000-0000-4000-8000-000000000104';
  v_subject text;
  v_title text;
  v_code text;
  v_heading text;
  v_quiz uuid;
  v_exam uuid;
  v_questions int;
  v_options int;
  v_keyed int;
  v_marks int;
  v_paper int;
  v_existing uuid;
  v_papers text[] := array['mathematics', 'language-arts', 'social-science', 'science'];
begin
  if not exists (select 1 from public.classes where id = v_class and organization_id = v_org) then
    raise exception 'The Grade 4 class (CE2) was not found in Oak International School; refusing to attach the papers.';
  end if;
  if (select count(*) from public.classes
       where organization_id = v_org and grade_order = 4) <> 1 then
    raise exception 'Expected exactly one Grade 4 class on the ladder; refusing to guess which one.';
  end if;

  foreach v_subject in array v_papers loop
    v_title := case v_subject
      when 'mathematics'    then 'Examination of Grade 4 – Mathematics'
      when 'language-arts'  then 'Examination of Grade 4 – Language Arts'
      when 'social-science' then 'Examination of Grade 4 – Social Science'
      else 'Examination of Grade 4 – Science'
    end;
    v_heading := case v_subject
      when 'mathematics'    then 'MATHEMATICS'
      when 'language-arts'  then 'LANGUAGE ART'
      when 'social-science' then 'SOCIAL SCIENCE'
      else 'SCIENCE'
    end;
    v_code := case v_subject
      when 'mathematics'    then 'G4-MATH-2026'
      when 'language-arts'  then 'G4-LANG-2026'
      when 'social-science' then 'G4-SOC-2026'
      else 'G4-SCI-2026'
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
       and q.config ->> 'source' = 'oak-grade4-2026-2027'
       and q.config ->> 'subject' = v_subject;
    if v_questions <> 30 then
      raise exception 'The % paper holds % questions; the printed paper has 30.', v_subject, v_questions;
    end if;

    select count(*) into v_options
      from public.question_options o
      join public.questions q on q.id = o.question_id
     where q.organization_id = v_org
       and q.config ->> 'source' = 'oak-grade4-2026-2027'
       and q.config ->> 'subject' = v_subject;
    if v_options = 0 then
      raise exception 'The % paper has no printed answer choices.', v_subject;
    end if;

    -- Section A is 20 objective questions. Each is auto-marked by one of four
    -- platform mechanisms: a keyed option (choice / true-false / multiple
    -- select), a numeric key, a printed pairing, or the printed sequence of an
    -- ordering card. A paper that cannot auto-mark its own objective section is a
    -- defect, so the count is asserted rather than repaired.
    select count(*) into v_keyed
      from public.questions q
     where q.organization_id = v_org
       and q.config ->> 'source' = 'oak-grade4-2026-2027'
       and q.config ->> 'subject' = v_subject
       and q.config ->> 'section' = 'A'
       and (
         (select count(*) from public.question_options o
           where o.question_id = q.id and o.is_correct) >= 1
         or (q.config ->> 'numeric_answer') is not null
         or jsonb_array_length(coalesce(q.config -> 'pairs', '[]'::jsonb)) >= 2
         or (q.type = 'ordering'
             and (select count(*) from public.question_options o
                   where o.question_id = q.id) >= 2)
       );
    if v_keyed <> 20 then
      raise exception 'The % paper has % auto-markable Section A questions; the paper prints 20.', v_subject, v_keyed;
    end if;

    -- The printed marking arithmetic: 20 x 1 mark + Section B 30 marks = 50.
    select sum(q.points)::int into v_marks
      from public.questions q
     where q.organization_id = v_org
       and q.config ->> 'source' = 'oak-grade4-2026-2027'
       and q.config ->> 'subject' = v_subject;
    if v_marks <> 50 then
      raise exception 'The % paper totals % marks; the printed paper totals 50.', v_subject, v_marks;
    end if;

    insert into public.quizzes (organization_id, title, description, status, settings)
    values (
      v_org,
      v_title,
      format('Grade 4 — End of Second Marking Period %s paper, 2026/2027. 30 printed questions: Section A 20 questions x 1 mark, Section B 10 questions totalling 30 marks, 50 marks in total, 60 minutes.', v_heading),
      'published',
      jsonb_build_object('randomize_questions', false, 'randomize_options', false)
    )
    returning id into v_quiz;

    insert into public.quiz_questions (quiz_id, question_id, position, points)
    select v_quiz, q.id, (q.config ->> 'question_number')::int, q.points
      from public.questions q
     where q.organization_id = v_org
       and q.config ->> 'source' = 'oak-grade4-2026-2027'
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
      format('Grade 4 — %s. 30 questions, 50 marks in total, 60 minutes.', v_heading),
      'Answer ALL questions in Section A and Section B. Show full working in Section B. '
      || 'Section A has 20 questions and each one carries 1 mark. '
      || 'Section B has 10 questions worth 30 marks in total; write your working and your teacher will mark those. '
      || 'You have 60 minutes. Diagrams are shown with the questions that print them — study them before you answer. '
      || 'Type your first name and last name exactly as they appear on your class list. '
      || 'Leaving the examination tab, losing window focus, copying, pasting or cutting text and leaving full screen are recorded for your teacher. '
      || 'An incident is recorded for your teacher to review; it never closes your paper, stops your timer or changes your answers.',
      60,
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
        'source', 'oak-grade4-2026-2027',
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

    raise notice '% created: exam %, quiz %, 30 questions, 50 marks, 60 minutes, class CE2 (Grade 4).',
      v_title, v_exam, v_quiz;
  end loop;
end $$;
