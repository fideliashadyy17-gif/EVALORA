-- Response workspaces for papers whose stems ask for a construction, a
-- structured table or a histogram, and the formula sheets that the live
-- MYP4/MYP5 summative papers are entitled to.
--
-- Only question configuration and exam presentation settings change here.
-- No prompt, mark, answer key or grading rule is touched.

-- Grade 1: "Draw a CIRCLE / PLANT / FLOWER" needs the geometry workspace,
-- not a plain paragraph box. The matching item (Social Science Q25) is left
-- as prose because `open_ended` has no matching input.
with draw_items as (
  select q.id
  from quiz_questions qq
  join exams e on e.quiz_id = qq.quiz_id
  join questions q on q.id = qq.question_id
  where q.type = 'open_ended'
    and (
      (e.title = 'Examination of Grade 1 – Mathematics' and qq.position = 27)
      or (e.title = 'Examination of Grade 1 – Science' and qq.position = 23)
      or (e.title = 'Examination of Grade 1 – Social Science' and qq.position = 22)
    )
)
update questions q
set config = jsonb_set(
  jsonb_set(coalesce(q.config, '{}'::jsonb), '{response_tools}', '["geometry","rich_text"]'::jsonb, true),
  '{response_requirement}', '"geometry"'::jsonb, true
)
where q.id in (select id from draw_items);

-- MYP4 live paper Q37: "Construct a grouped table with classes …". A rich-text
-- table is not a structured answer a marker can read back cell by cell.
update questions q
set config = jsonb_set(
  jsonb_set(coalesce(q.config, '{}'::jsonb), '{response_tools}', '["data_table","rich_text","math"]'::jsonb, true),
  '{response_requirement}', '"data_table"'::jsonb, true
)
from quiz_questions qq
join exams e on e.quiz_id = qq.quiz_id
where qq.question_id = q.id
  and e.id = 'cb000000-0000-4000-8000-000000000002'
  and qq.position = 37;

-- MYP4 live paper Q38: "Draw a correct, fully labelled frequency-density
-- histogram". The graph workspace cannot draw unequal-width bars; the
-- statistics workspace can, and it is fixed to a histogram so every candidate
-- answers the same representation.
update questions q
set config = jsonb_set(
  jsonb_set(
    jsonb_set(coalesce(q.config, '{}'::jsonb), '{response_tools}', '["statistics","graph","rich_text","math"]'::jsonb, true),
    '{response_requirement}', '"statistics"'::jsonb, true
  ),
  '{response_stats}', coalesce(q.config->'response_stats', '{}'::jsonb) || '{"chart":"histogram"}'::jsonb, true
)
from quiz_questions qq
join exams e on e.quiz_id = qq.quiz_id
where qq.question_id = q.id
  and e.id = 'cb000000-0000-4000-8000-000000000002'
  and qq.position = 38;

-- Copy the Version B formula sheets onto the live papers, retargeting the
-- embedded exam_id so `parseFormulaSheet` accepts them.
update exams live
set settings = jsonb_set(
  coalesce(live.settings, '{}'::jsonb),
  '{formula_sheet}',
  (source.settings->'formula_sheet') || jsonb_build_object('exam_id', live.id::text),
  true
)
from exams source
where live.id = 'cb000000-0000-4000-8000-000000000002'
  and source.id = 'c0900000-0000-4000-8000-000000000002'
  and source.settings ? 'formula_sheet';

update exams live
set settings = jsonb_set(
  coalesce(live.settings, '{}'::jsonb),
  '{formula_sheet}',
  (source.settings->'formula_sheet') || jsonb_build_object('exam_id', live.id::text),
  true
)
from exams source
where live.id = 'cc000000-0000-4000-8000-000000000002'
  and source.id = 'c0a00000-0000-4000-8000-000000000002'
  and source.settings ? 'formula_sheet';
