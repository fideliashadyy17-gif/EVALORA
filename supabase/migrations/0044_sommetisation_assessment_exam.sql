-- Sommetisation Assessment — Grade 10 (Oak International School)
--
-- Source document: "MYP 5 Mathematics — Sequences & Series E-Assessment"
-- (34 pages, supplied PDF). The assessment title follows the owner's naming,
-- not the document's own cover title; that difference is recorded, not hidden.
--
-- Fidelity rules applied:
--   * answers are the document's own key (50/50 cross-checked against the
--     marking scheme: no mismatch, no missing key);
--   * every item is 1 mark because the document states "1 mark each" — no mark
--     values are invented, and no question is reworded;
--   * the paper's superscripts that the PDF text layer flattened are restored
--     from the marking scheme itself (Q37 "a_n = 2 x 3^n", Q39 "L_n = 2^n"
--     against the distractor "L_n = 2n"); the ambiguous Q39 duplicate is
--     resolved by the document's own explanation, not by guesswork;
--   * question order and option order stay fixed, so the printed A–D key
--     remains valid (randomize_questions and randomize_options are false).
--
-- The assessment is written in four steps so that no single migration carries
-- the whole paper: questions 1–25, questions 26–50, the 200 options, then the
-- paper and the examination. The last step refuses to create the examination
-- unless all 50 questions and 200 options are present.
--
-- This step creates the paper and the examination, and refuses to do so unless
-- the whole assessment is already in place. Idempotent: an existing
-- examination of this title in this workspace stops the block immediately.

do $$
declare
  v_org   uuid := '0a400000-0000-4000-8000-000000000001';
  v_class_uuid uuid := '0a400000-0000-4000-8000-000000000110';
  v_existing uuid;
  v_quiz  uuid;
  v_exam  uuid;
  v_questions int;
  v_options int;
  v_correct int;
  v_paper int;
begin
  select id into v_existing
    from public.exams
   where organization_id = v_org and title = 'Sommetisation Assessment — Grade 10'
   limit 1;
  if v_existing is not null then
    raise notice 'Sommetisation Assessment already exists (%), nothing to do.', v_existing;
    return;
  end if;

  select count(*) into v_questions
    from public.questions
   where organization_id = v_org and config ->> 'source' = 'myp5-sequences-and-series-e-assessment';

  select count(*) into v_options
    from public.question_options o
    join public.questions q on q.id = o.question_id
   where q.organization_id = v_org and q.config ->> 'source' = 'myp5-sequences-and-series-e-assessment';

  select count(*) into v_correct
    from public.question_options o
    join public.questions q on q.id = o.question_id
   where q.organization_id = v_org and q.config ->> 'source' = 'myp5-sequences-and-series-e-assessment' and o.is_correct;

  if v_questions <> 50 or v_options <> 200 or v_correct <> 50 then
    raise exception 'The paper is incomplete (% questions, % options, % correct); expected 50, 200 and 50.',
      v_questions, v_options, v_correct;
  end if;

  insert into public.quizzes (organization_id, title, description, status, settings)
  values (
    v_org,
    'Sommetisation Assessment — Grade 10',
    'Fifty single-choice questions on recursive and explicit formulas, linear, arithmetic, quadratic and geometric sequences, and arithmetic series. 1 mark each, 60 minutes, calculator allowed.',
    'published',
    jsonb_build_object('randomize_questions', false, 'randomize_options', false)
  )
  returning id into v_quiz;

  insert into public.quiz_questions (quiz_id, question_id, position, points)
  select v_quiz, q.id, (q.config ->> 'question_number')::int, 1
    from public.questions q
   where q.organization_id = v_org
     and q.config ->> 'source' = 'myp5-sequences-and-series-e-assessment'
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
    v_class_uuid,
    'Sommetisation Assessment — Grade 10',
    'MYP 5 Mathematics — Sequences & Series. 50 questions, 1 mark each, 50 marks in total.',
    'Answer all 50 questions. Each question has one correct answer out of four. You have 60 minutes and may use a calculator. Enter your first name and last name exactly as they appear on your class list. Your score and the worked answer for every question are shown as soon as you submit.',
    60,
    'open',
    'MYP5-SEQ-2026',
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

  raise notice 'Sommetisation Assessment created: exam %, quiz %, 50 questions, access code %.', v_exam, v_quiz, 'MYP5-SEQ-2026';
end $$;
