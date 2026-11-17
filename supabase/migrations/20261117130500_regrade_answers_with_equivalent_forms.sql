-- Re-grade the written and multi-part answers whose correct equivalence was
-- previously rejected: a label in front of the value, a currency prefix, a
-- comma decimal, a final line of worked arithmetic, a superscript power, or a
-- listed equivalent. Only answers whose stored mark was lower than the new
-- engine's result are corrected; nothing is reduced.
--
-- `grade_change_recorder` appends the previous and new marks to
-- `grade_change_log`, so each original mark remains available.

with corrections(id, new_points) as (
  values
    ('43b1f446-e54a-40a5-ac5d-fe28b8f0965f'::uuid, 3.0::numeric),
    ('65a782f0-80b1-4233-af0b-f5b8cb9581d2'::uuid, 2.5::numeric),
    ('885ade32-7e37-41f8-a83f-586f3f9351a1'::uuid, 2.0::numeric),
    ('7d9c9d4c-8f4e-4916-a303-968b8cc48a24'::uuid, 1.0::numeric),
    ('8745cea7-56e0-436a-ac9f-fb5886698023'::uuid, 2.0::numeric),
    ('0b337b7f-dc59-4999-816f-00b3761d10e0'::uuid, 1.0::numeric),
    ('275019b4-482f-472f-a47a-722bc33eb1a4'::uuid, 1.0::numeric),
    ('1abecfc8-6fbd-4625-b59d-f91ccb0a6305'::uuid, 2.0::numeric),
    ('019eddba-9b5e-4642-ae71-a1f8cac94b94'::uuid, 3.0::numeric),
    ('e67e0f61-a311-4ac8-8fba-5ff07c21fd50'::uuid, 2.5::numeric),
    ('76aaefe1-f36d-4936-b944-3163dbb45bd9'::uuid, 2.0::numeric),
    ('06af03d9-5dc1-4614-a384-56c072811263'::uuid, 3.0::numeric),
    ('78772306-a555-4357-94cc-daac0d36602e'::uuid, 3.0::numeric),
    ('a1cab4ef-a843-4183-9090-2fb076682086'::uuid, 2.0::numeric),
    ('2d885cc0-38c1-4e1f-9c51-ccdd8a9a678a'::uuid, 2.0::numeric)
)
update exam_answers ea
set points_awarded = c.new_points,
    is_correct = c.new_points >= coalesce((
      select qq.points
      from exam_attempts a
      join exams e on e.id = a.exam_id
      join quiz_questions qq on qq.quiz_id = e.quiz_id and qq.question_id = ea.question_id
      where a.id = ea.attempt_id
    ), 0),
    updated_at = now()
from corrections c
where ea.id = c.id;

update exam_attempts a
set score = coalesce((
  select round(sum(ea.points_awarded), 2)
  from exam_answers ea
  where ea.attempt_id = a.id
), 0)
where a.id in (
  select distinct ea.attempt_id
  from exam_answers ea
  where ea.id in (
    '43b1f446-e54a-40a5-ac5d-fe28b8f0965f', '65a782f0-80b1-4233-af0b-f5b8cb9581d2',
    '885ade32-7e37-41f8-a83f-586f3f9351a1', '7d9c9d4c-8f4e-4916-a303-968b8cc48a24',
    '8745cea7-56e0-436a-ac9f-fb5886698023', '0b337b7f-dc59-4999-816f-00b3761d10e0',
    '275019b4-482f-472f-a47a-722bc33eb1a4', '1abecfc8-6fbd-4625-b59d-f91ccb0a6305',
    '019eddba-9b5e-4642-ae71-a1f8cac94b94', 'e67e0f61-a311-4ac8-8fba-5ff07c21fd50',
    '76aaefe1-f36d-4936-b944-3163dbb45bd9', '06af03d9-5dc1-4614-a384-56c072811263',
    '78772306-a555-4357-94cc-daac0d36602e', 'a1cab4ef-a843-4183-9090-2fb076682086',
    '2d885cc0-38c1-4e1f-9c51-ccdd8a9a678a'
  )
);
