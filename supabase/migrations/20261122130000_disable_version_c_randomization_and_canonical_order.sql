-- Migration: Disable question & option randomization for Version C summative assessments
-- and restore canonical paper question order for existing student attempts.
--
-- Background:
-- Version C papers have authored question numbering (Part A Q1-30, Part B Q1-4)
-- and grouped exercise numbering (Questions 15-18). Randomization caused question
-- numbering discrepancies between authored paper numbers and student display order,
-- leading to confusion on result reviews.

BEGIN;

-- 1. Disable randomization on Grade 9 and Grade 10 Version C summative examinations
UPDATE exams
SET settings = settings || jsonb_build_object(
  'randomize_questions', false,
  'randomize_options', false
)
WHERE id IN (
  'cd000000-0000-4000-8000-000000000002',
  'ce000000-0000-4000-8000-000000000002'
);

-- 2. Restore canonical question order for Grade 9 Version C attempt f660a596-d526-4e03-97df-20110a9a8eff
UPDATE exam_attempts
SET question_order = (
  SELECT jsonb_agg(id ORDER BY position)
  FROM quiz_questions
  WHERE quiz_id = 'cd000000-0000-4000-8000-000000000001'
)
WHERE id = 'f660a596-d526-4e03-97df-20110a9a8eff';

-- 3. Restore canonical question order for Grade 10 Version C attempt f7699c80-e523-4b9f-81ac-d58987948ff2
UPDATE exam_attempts
SET question_order = (
  SELECT jsonb_agg(id ORDER BY position)
  FROM quiz_questions
  WHERE quiz_id = 'ce000000-0000-4000-8000-000000000001'
)
WHERE id = 'f7699c80-e523-4b9f-81ac-d58987948ff2';

COMMIT;
