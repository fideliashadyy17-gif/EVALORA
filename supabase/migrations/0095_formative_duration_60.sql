-- 0095: All six formative assessments move from 45 to 60 minutes.
-- Updates the exam time limit, the student instructions text, and the
-- duration stored in each linked quiz's settings. Questions, marks,
-- hints and all other settings are unchanged. The student countdown,
-- the 5-minute warning state and the auto-submit all derive from
-- exams.duration_minutes (see src/lib/examDeadline.ts), so no code
-- change is needed for the timer itself.
begin;

update exams
set duration_minutes = 60,
    instructions = replace(instructions, 'You have 45 minutes.', 'You have 1 hour (60 minutes).')
where id in (
  'b2000000-0000-4000-8000-000000000002',  -- MYP 2 Formative Assessment (Rate, Ratio, Proportion, Sets and Probability)
  'b4000000-0000-4000-8000-000000000002',  -- MYP 4 Formative Assessment: Statistics
  'b5000000-0000-4000-8000-000000000002',  -- MYP 5 Formative Assessment: Sequences and Series
  'c2000000-0000-4000-8000-000000000002',  -- MYP2 (Grade 7) Formative Assessment 2 - Criteria A-D
  'c4000000-0000-4000-8000-000000000002',  -- MYP4 (Grade 9) Formative Assessment 2 - Criteria A-D
  'c5000000-0000-4000-8000-000000000002'   -- MYP5 (Grade 10) Formative Assessment 2 - Criteria A-D
)
and duration_minutes = 45;

update quizzes
set settings = jsonb_set(settings, '{duration_minutes}', '60'::jsonb, true)
where id in (
  'b2000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  'b5000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000001'
);

commit;
