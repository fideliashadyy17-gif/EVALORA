-- Summative Assessment — Grade 9 (Oak International School)
--
-- Source document: "MYP 4 Statistics & Distributions E-Assessment" (45 pages).
-- The paper is MYP 4 / Grade 9 even though the file prints "MYP 5".
--
-- This step builds the quiz, the 50-item paper and the examination, and refuses
-- to run unless all 50 questions, all 200 options and all 50 keyed answers are
-- present. Idempotent: if the examination already exists, nothing happens.

do $$
declare
  v_org uuid := '0a400000-0000-4000-8000-000000000001';
  v_class uuid := '0a400000-0000-4000-8000-000000000109';
  v_existing uuid;
  v_quiz uuid;
  v_exam uuid;
  v_questions int;
  v_options int;
  v_correct int;
  v_paper int;
begin
  select id into v_existing
    from public.exams
   where organization_id = v_org and title = 'Summative Assessment — Grade 9'
   limit 1;
  if v_existing is not null then
    raise notice 'Summative Assessment — Grade 9 already exists (%), nothing to do.', v_existing;
    return;
  end if;

  if not exists (select 1 from public.classes where id = v_class and organization_id = v_org) then
    raise exception 'Grade 9 — MYP 4 class not found in Oak International School; the assessment cannot be attached.';
  end if;

  select count(*) into v_questions
    from public.questions
   where organization_id = v_org and config ->> 'source' = 'myp4-statistics-and-distributions-e-assessment';

  select count(*) into v_options
    from public.question_options o
    join public.questions q on q.id = o.question_id
   where q.organization_id = v_org and q.config ->> 'source' = 'myp4-statistics-and-distributions-e-assessment';

  select count(*) into v_correct
    from public.question_options o
    join public.questions q on q.id = o.question_id
   where q.organization_id = v_org and q.config ->> 'source' = 'myp4-statistics-and-distributions-e-assessment' and o.is_correct;

  if v_questions <> 50 or v_options <> 200 or v_correct <> 50 then
    raise exception 'The paper is incomplete (% questions, % options, % keyed); expected 50, 200 and 50.',
      v_questions, v_options, v_correct;
  end if;

  insert into public.quizzes (organization_id, title, description, status, settings)
  values (
    v_org,
    'Summative Assessment — Grade 9',
    'Fifty single-choice questions on categorising data and stem-and-leaf plots, quartiles and the interquartile range, box-and-whisker plots and outliers, grouped frequency tables, cumulative frequency curves, histograms and distribution shape, mean and standard deviation, and the normal distribution. 1 mark each, 60 minutes, calculator allowed.',
    'published',
    jsonb_build_object('randomize_questions', false, 'randomize_options', false)
  )
  returning id into v_quiz;

  insert into public.quiz_questions (quiz_id, question_id, position, points)
  select v_quiz, q.id, (q.config ->> 'question_number')::int, 1
    from public.questions q
   where q.organization_id = v_org
     and q.config ->> 'source' = 'myp4-statistics-and-distributions-e-assessment'
   order by (q.config ->> 'question_number')::int;

  select count(*) into v_paper from public.quiz_questions where quiz_id = v_quiz;
  if v_paper <> 50 then
    raise exception 'The paper holds % questions; expected 50.', v_paper;
  end if;

  insert into public.exams
    (organization_id, quiz_id, class_id, title, description, instructions, duration_minutes,
     status, access_code, shared_link_enabled, settings)
  values (
    v_org,
    v_quiz,
    v_class,
    'Summative Assessment — Grade 9',
    'MYP 4 Mathematics — Statistics & Distributions. 50 questions, 1 mark each, 50 marks in total.',
    'Answer all 50 questions. Each question has one correct answer out of four. You have 60 minutes and may use a calculator. Every figure, table and graph belongs to the question above it — read the axes and their units. Enter your first name and last name exactly as they appear on your class list. Your score and the worked answer for every question are shown as soon as you submit.',
    60,
    'open',
    'MYP4-STAT-2026',
    true,
    jsonb_build_object(
      'proctoring', false,
      'require_screen_share', false,
      'randomize_questions', false,
      'randomize_options', false,
      'pass_mark_percent', 50,
      'results_published', true,
      'access_mode', 'shared_link',
      'attempt_policy', 'single_resume',
      'identity_fields', '[]'::jsonb
    )
  )
  returning id into v_exam;

  raise notice 'Summative Assessment — Grade 9 created: exam %, quiz %, 50 questions, access code %.', v_exam, v_quiz, 'MYP4-STAT-2026';
end $$;
