-- MYP5-MOCK-2026 — mock examination, part 6 of 6:
-- options, accepted variants, paper assembly, the examination row (cover page),
-- question-level hints and the self-check. Generated, do not edit.
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING; the self-check aborts the
-- transaction if the paper is incomplete, so it can never half-exist.
begin;

insert into question_options (id, question_id, label, is_correct, position)
select ('d5000000-0000-4000-8000' || lpad((300000 + (q.config->>'question_number')::int * 100 + v.idx)::text, 12, '0'))::uuid,
       q.id, v.label, (q.config->'option_key') @> to_jsonb(v.idx::int), v.idx::int
  from questions q
  cross join lateral jsonb_array_elements_text(q.config->'option_labels') with ordinality as v(label, idx)
 where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp5-mock'
on conflict (id) do nothing;

insert into question_options (id, question_id, label, is_correct, position)
select ('d5000000-0000-4000-8000' || lpad((310000 + (q.config->>'question_number')::int * 100 + v.idx)::text, 12, '0'))::uuid,
       q.id, v.variant, true, v.idx::int
  from questions q
  cross join lateral jsonb_array_elements_text(q.config->'accepted') with ordinality as v(variant, idx)
 where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp5-mock'
on conflict (id) do nothing;

insert into quiz_questions (quiz_id, question_id, position, points)
select 'd5000000-0000-4000-8000-000000000001', q.id, (q.config->>'question_number')::int, q.points
  from questions q
 where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp5-mock'
on conflict (quiz_id, question_id) do nothing;

insert into exams (id, organization_id, quiz_id, class_id, title, description, instructions,
                   duration_minutes, status, access_code, shared_link_enabled, settings, created_by)
values ('d5000000-0000-4000-8000-000000000002', '0a400000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', '0a400000-0000-4000-8000-000000000107', 'MYP5 Mathematics — Mock Examination',
        'Grade 10 · MYP 5 · Mathematics · Mock Examination. Arithmetic and geometric sequences, recurrence relations, sigma notation, sums and limits, compound interest and depreciation, exponential and logarithmic models, quadratic functions and modelling. 45 questions, 259 marks: Section A (objective) and Section B (structured investigations).', 'MYP5 MATHEMATICS — MOCK EXAMINATION (Grade 10)

Time allowed: 2 hours 30 minutes.

SECTION A — Objective questions (questions 1–22).
Each question has one correct answer. Several items ask you to judge a claim rather than compute: read the whole statement before choosing.

SECTION B — Structured questions (questions 23–45).
Show your working. Marks are printed beside every part. Where a question asks you to CONSTRUCT a table or a graph, build it in the workspace: the representation itself is being assessed, and the typed answer records the value you read from it.

EXAMINATION OBJECTIVES. By the end of this paper you should be able to: recognise, generate and classify arithmetic and geometric sequences; use recurrence relations and sigma notation; derive and apply the nth term and sum formulas; determine whether an infinite geometric series converges and find its sum; solve problems involving compound interest, depreciation and loans; solve exponential equations using logarithms; analyse quadratic functions from their completed-square, factorised and graphical forms; and build and criticise mathematical models of real situations.

GENERAL INSTRUCTIONS.
1. A calculator is permitted throughout. Write the formula or the method you use, not just the answer.
2. Money is given to the nearest cent and other quantities to 3 significant figures unless a part states otherwise.
3. A hint is available on every part. Hints guide the method and never give the answer; using one costs no marks and is recorded only to support your revision.
4. Your answers save automatically; after a disconnection, reopen the paper and your work is restored.
5. Notation: u_n is the nth term, d the common difference, r the common ratio, and S_n the sum of the first n terms.

MARKS. Every part shows its marks. Section A is worth 60 marks and Section B 199 marks, out of a total of 259. Pass mark: your institution''s configured threshold (default 50%).',
        150, 'open', 'MYP5-MOCK-2026', true,
        '{"proctoring":false,"require_screen_share":false,"randomize_questions":false,"randomize_options":false,"pass_mark_percent":50,"results_published":false,"access_mode":"shared_link","identity_fields":[],"eligible_class_ids":["0a400000-0000-4000-8000-000000000107"],"attempt_policy":"single_resume","assessment_kind":"mock","grade_level":"10","curriculum":"MYP 5","subject":"Mathematics","total_marks":259,"source":"myp-mock-myp5-mock","mock_exam_key":"myp5-mock","mock_code":"MYP5-MOCK-2026","show_sections":true,"feedback":{"marking_criteria":true,"next_time_hint":true,"objective_structured_split":true,"topic_breakdown":true,"criterion_level_band":true}}'::jsonb, '3c3ed712-f409-4aa1-a645-816418e22ec4')
on conflict (id) do nothing;

insert into question_hints (id, organization_id, exam_id, question_id, level, body, status, source,
                            created_by, approved_by, approved_at, published_at)
select ('d5000000-0000-4000-8000' || lpad((500000 + (q.config->>'question_number')::int * 10 + h.level)::text, 12, '0'))::uuid,
       '0a400000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002', q.id, h.level, h.body, 'published', 'manual',
       '3c3ed712-f409-4aa1-a645-816418e22ec4', '3c3ed712-f409-4aa1-a645-816418e22ec4', now(), now()
  from questions q
  cross join lateral (values
    (1, case when jsonb_array_length(coalesce(q.config->'hints', '[]'::jsonb)) >= 1
             then q.config->'hints'->>0
             else q.config->>'next_time_hint' end),
    (2, case when jsonb_array_length(coalesce(q.config->'hints', '[]'::jsonb)) >= 2
             then q.config->'hints'->>1
             else q.config->'parts'->0->'hints'->>0 end)
  ) as h(level, body)
 where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp5-mock'
   and h.body is not null
   and length(btrim(h.body)) >= 8
   and length(btrim(h.body)) <= 800
on conflict (id) do nothing;

do $$
declare
  v_questions int;
  v_marks numeric;
  v_objective int;
  v_keys int;
  v_hints int;
begin
  select count(*), coalesce(sum(q.points), 0)
    into v_questions, v_marks
    from quiz_questions qq join questions q on q.id = qq.question_id
   where qq.quiz_id = 'd5000000-0000-4000-8000-000000000001';
  select count(*), count(*) filter (where q.type <> 'assess_parts')
    into v_keys, v_objective
    from questions q
   where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp5-mock';
  select count(distinct h.question_id) into v_hints
    from question_hints h join questions q on q.id = h.question_id
   where q.config->>'source' = 'myp-mock-myp5-mock';
  if v_questions <> 45 then
    raise exception 'MYP5-MOCK-2026: % questions on the paper, expected 45', v_questions;
  end if;
  if v_keys <> 45 or v_objective <> 22 then
    raise exception 'MYP5-MOCK-2026: % questions (% objective), expected 45 (22)', v_keys, v_objective;
  end if;
  if v_marks <> 259 then
    raise exception 'MYP5-MOCK-2026: % marks, expected 259', v_marks;
  end if;
  if v_hints <> 45 then
    raise exception 'MYP5-MOCK-2026: % of 45 questions have a published hint', v_hints;
  end if;
  if not exists (select 1 from exams where id = 'd5000000-0000-4000-8000-000000000002' and settings->>'results_published' = 'false') then
    raise exception 'MYP5-MOCK-2026: examination row missing or results already published';
  end if;
end $$;

commit;
