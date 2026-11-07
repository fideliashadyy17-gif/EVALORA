-- Summative Assessment — Grade 7 (Oak International School)
--
-- Source document: "MYP 2 Mathematics — Ratio, Rate, Proportion & Sets
-- E-Assessment" (36 pages, supplied PDF): fifty multiple-choice questions in six
-- chapters (ratio 9, rate 8, proportion 8, proportional reasoning 8, word
-- problems 8, sets and Venn diagrams 9), 45 minutes, calculator not required.
--
-- Fidelity rules applied:
--   * every prompt, every option and every explanation is the document's own
--     text; nothing is reworded and no distractor is invented;
--   * the printed answer key (page 22) and the detailed solutions (pages 23–36)
--     were parsed separately and cross-checked: 50/50 keys agree and, for all
--     fifty questions, the lettered solution text is the lettered option text;
--   * every item is 1 mark because the document prints "1 mark each"; the mark
--     total (50) is the document's own;
--   * the twenty-three figure questions (bar charts, tables, double number
--     lines, a map, a shop sign and the Venn diagrams) are rendered from their
--     own band of the page at 220 dpi into public/exam-figures/grade7/, because
--     the data lives in the drawing and the text layer does not carry it;
--   * question order and option order stay fixed, so the printed A–D key
--     remains valid (randomize_questions and randomize_options are false).
--
-- Difficulty is a reading of the printed level band: level 1–2 easy, 3–4
-- medium, 5–6 hard. The printed criterion and level are kept in `config`, never
-- replaced by that reading.
--
-- The paper is written in four steps so that no single migration carries the
-- whole assessment: questions 1–25, questions 26–50, the 200 options, then the
-- paper and the examination. The last step refuses to create the examination
-- unless all 50 questions and 200 options are present.

-- This step creates the paper and the examination, and refuses to do so unless
-- the whole assessment is already in place. Idempotent: an existing examination
-- with this title in this workspace stops the block immediately.

do $$
declare
  v_org uuid := '0a400000-0000-4000-8000-000000000001';
  v_class uuid := '0a400000-0000-4000-8000-000000000107';
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
   where organization_id = v_org and title = 'Summative Assessment — Grade 7'
   limit 1;
  if v_existing is not null then
    raise notice 'Summative Assessment — Grade 7 already exists (%), nothing to do.', v_existing;
    return;
  end if;

  if not exists (select 1 from public.classes where id = v_class and organization_id = v_org) then
    raise exception 'Grade 7 — MYP 2 class not found in Oak International School; the assessment cannot be attached.';
  end if;

  select count(*) into v_questions
    from public.questions
   where organization_id = v_org and config ->> 'source' = 'myp2-ratio-rate-proportion-and-sets-e-assessment';

  select count(*) into v_options
    from public.question_options o
    join public.questions q on q.id = o.question_id
   where q.organization_id = v_org and q.config ->> 'source' = 'myp2-ratio-rate-proportion-and-sets-e-assessment';

  select count(*) into v_correct
    from public.question_options o
    join public.questions q on q.id = o.question_id
   where q.organization_id = v_org and q.config ->> 'source' = 'myp2-ratio-rate-proportion-and-sets-e-assessment' and o.is_correct;

  if v_questions <> 50 or v_options <> 200 or v_correct <> 50 then
    raise exception 'The paper is incomplete (% questions, % options, % keyed); expected 50, 200 and 50.',
      v_questions, v_options, v_correct;
  end if;

  insert into public.quizzes (organization_id, title, description, status, settings)
  values (
    v_org,
    'Summative Assessment — Grade 7',
    'Fifty single-choice questions on ratio, rate, proportion, proportional reasoning, word problems and sets with Venn diagrams. 1 mark each, 45 minutes, calculator not required.',
    'published',
    jsonb_build_object('randomize_questions', false, 'randomize_options', false)
  )
  returning id into v_quiz;

  insert into public.quiz_questions (quiz_id, question_id, position, points)
  select v_quiz, q.id, (q.config ->> 'question_number')::int, 1
    from public.questions q
   where q.organization_id = v_org
     and q.config ->> 'source' = 'myp2-ratio-rate-proportion-and-sets-e-assessment'
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
    'Summative Assessment — Grade 7',
    'MYP 2 Mathematics — Ratio, Rate, Proportion & Sets. 50 questions, 1 mark each, 50 marks in total.',
    'Answer all 50 questions. Each question has one correct answer out of four. You have 45 minutes and should not use a calculator. Type your first name and last name exactly as they appear on your class list. Your score and the worked answer for every question are shown as soon as you submit. Integrity monitoring is on: leaving the assessment tab, losing window focus, copying, pasting or cutting text and leaving full screen are recorded for your teacher.',
    45,
    'open',
    'MYP2-RATIO-2026',
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
      'identity_fields', '[]'::jsonb,
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

  raise notice 'Summative Assessment — Grade 7 created: exam %, quiz %, 50 questions, access code %.',
    v_exam, v_quiz, 'MYP2-RATIO-2026';
end $$;
