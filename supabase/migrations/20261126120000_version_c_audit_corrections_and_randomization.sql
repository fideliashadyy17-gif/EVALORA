-- Migration: Version C Audit Corrections & Examination Settings
-- Non-destructive update for MYP4 Version C Q15-18 matching marks & question configuration,
-- Q1 prompt cleanup, and activation of randomization settings.
--
-- RENAMED from 20261119100000 to 20261126120000.
--
-- The original file shared version 20261119100000 with
-- 20261119100000_myp4_grade9_first_term_summative_version_d.sql. Supabase records
-- one history row per version, so only one of the two could ever be applied: the
-- Version D paper insert won the slot and this file never ran. That is why the
-- live database still carried the erroneous MYP4 Version C Q7 key even though
-- step 5 below corrects it.
--
-- Consequences of the collision, verified in production on 2026-11-26:
--   * step 1 (Q15 = 4 points) landed via 20261118120000_myp4_q15_18_matching_exercise
--   * step 2 (Q15 config/marks/rows) landed via the same migration
--   * step 3 (Q1 prompt cleanup) landed via 20261118054730_myp4_grade9_statistics_version_c
--   * step 4 (randomisation on both exams) landed via 20261118062311
--   * step 5 (Q7 key C -> B) DID NOT LAND, and is now shipped separately as
--     20261126210000_myp4_version_c_q7_answer_key_correction.sql because it needs
--     the assessment-source guard lifted for a single scoped update.
--
-- Steps 1-4 are therefore idempotent re-assertions of values already live. Step 5
-- is left in place as a no-op for the same reason: after the dedicated correction
-- the key is already B, so this update simply rewrites the same value.
--
-- Ordering note: this file must sort AFTER 20261118062311 and BEFORE
-- 20261126210000, which it now does.
begin;

-- 1. Update quiz_questions for MYP4 Version C Q15 (cd000000-0000-4000-8000-000000001015) to 4 points
update quiz_questions
   set points = 4
 where quiz_id = 'cd000000-0000-4000-8000-000000000001'
   and question_id = 'cd000000-0000-4000-8000-000000001015';

-- 2. Update question configuration for Q15 (cd000000-0000-4000-8000-000000001015)
update questions
   set points = 4,
       prompt = 'MATCHING Q15–18 · write one letter, P to T, in each box · 1 mark each\n\n[Figure: table]\n\n15. Ordered display retaining every exact raw value\n16. Quantity plotted vertically on an unequal-width histogram\n17. Smooth curve plotted at upper class boundaries to estimate quartiles\n18. Average of the squared deviations of all data values from μ',
       prompt_doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"MATCHING Q15–18 · write one letter, P to T, in each box · 1 mark each"}]},{"type":"assessDiagramBlock","attrs":{"spec":{"kind":"table","title":"","columns":["P","Q","R","S","T"],"rows":[["Q3 - Q1","Frequency ÷ Class width","Population variance σ²","Cumulative frequency curve (ogive)","Stem-and-leaf diagram"]],"version":1}}}]}'::jsonb,
       explanation = '15 → T. A stem-and-leaf diagram keeps every individual digit, so all raw values can be recovered. 16 → Q. Frequency density = Frequency ÷ Class width. 17 → S. A cumulative frequency curve (ogive) is read at upper class boundaries. 18 → R. Population variance σ² is the average of squared deviations from μ.',
       config = config || jsonb_build_object(
         'marks', 4,
         'question_label', '15–18',
         'question_span', 4,
         'criterion_shares', jsonb_build_array(
           jsonb_build_object('criterion', 'C', 'points', 2),
           jsonb_build_object('criterion', 'A', 'points', 2)
         ),
         'criterion_label', 'Criteria A and C',
         'criterion_title', 'Knowing and understanding; Communicating',
         'rows', jsonb_build_array(
           jsonb_build_object('number', 15, 'criterion', 'C', 'left', 'Ordered display retaining every exact raw value'),
           jsonb_build_object('number', 16, 'criterion', 'A', 'left', 'Quantity plotted vertically on an unequal-width histogram'),
           jsonb_build_object('number', 17, 'criterion', 'C', 'left', 'Smooth curve plotted at upper class boundaries to estimate quartiles'),
           jsonb_build_object('number', 18, 'criterion', 'A', 'left', 'Average of the squared deviations of all data values from μ')
         ),
         'marking_breakdown', jsonb_build_array(
           jsonb_build_object('label', '15', 'marks', 1, 'focus', 'Criterion C'),
           jsonb_build_object('label', '16', 'marks', 1, 'focus', 'Criterion A'),
           jsonb_build_object('label', '17', 'marks', 1, 'focus', 'Criterion C'),
           jsonb_build_object('label', '18', 'marks', 1, 'focus', 'Criterion A')
         )
       ),
       updated_at = now()
 where id = 'cd000000-0000-4000-8000-000000001015';

-- 3. Clean up MYP4 Version C Q1 prompt so options are not duplicated inside the stem text
update questions
   set prompt = 'Which variable measured at a health clinic is **quantitative continuous**?',
       prompt_doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Which variable measured at a health clinic is "},{"type":"text","marks":[{"type":"bold"}],"text":"quantitative continuous"},{"type":"text","text":"?"}]}]}'::jsonb,
       updated_at = now()
 where id = 'cd000000-0000-4000-8000-000000001001';

-- 4. Enable question and option randomization on both Version C exams
update exams
   set settings = settings || jsonb_build_object(
     'randomize_questions', true,
     'randomize_options', true
   )
 where id in (
   'cd000000-0000-4000-8000-000000000002',
   'ce000000-0000-4000-8000-000000000002'
 );

-- 5. MYP4 Version C Q7 answer key (C -> B) is deliberately NOT handled here.
--
-- On a database that already has candidate attempts, question_options is frozen by
-- question_options_assessment_source_guard, so an unconditional update here would
-- raise 55000 ASSESSMENT_SOURCE_IMMUTABLE and abort the whole migration -- exactly
-- the kind of failure that let this correction go missing in the first place.
-- The correction needs that guard lifted for one scoped statement, so it ships as
-- its own migration: 20261126210000_myp4_version_c_q7_answer_key_correction.sql.
-- Run that instead; do not re-add the update here.

commit;
