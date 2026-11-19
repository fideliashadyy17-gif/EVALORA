-- Migration: Version C Audit Corrections & Examination Settings
-- Non-destructive update for MYP4 Version C Q15-18 matching marks & question configuration,
-- Q1 prompt cleanup, and activation of randomization settings.
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

commit;
