-- MYP2-MOCK-2026 — mock examination, part 4 of 4:
-- options, accepted variants, paper assembly, the examination row (cover page),
-- question-level hints and the self-check. Generated, do not edit.
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING; the self-check aborts the
-- transaction if the paper is incomplete, so it can never half-exist.
begin;

insert into question_options (id, question_id, label, is_correct, position)
select ('d2000000-0000-4000-8000' || lpad((300000 + (q.config->>'question_number')::int * 100 + v.idx)::text, 12, '0'))::uuid,
       q.id, v.label, (q.config->'option_key') @> to_jsonb(v.idx::int), v.idx::int
  from questions q
  cross join lateral jsonb_array_elements_text(q.config->'option_labels') with ordinality as v(label, idx)
 where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp2-mock'
on conflict (id) do nothing;

insert into question_options (id, question_id, label, is_correct, position)
select ('d2000000-0000-4000-8000' || lpad((310000 + (q.config->>'question_number')::int * 100 + v.idx)::text, 12, '0'))::uuid,
       q.id, v.variant, true, v.idx::int
  from questions q
  cross join lateral jsonb_array_elements_text(q.config->'accepted') with ordinality as v(variant, idx)
 where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp2-mock'
on conflict (id) do nothing;

insert into quiz_questions (quiz_id, question_id, position, points)
select 'd2000000-0000-4000-8000-000000000001', q.id, (q.config->>'question_number')::int, q.points
  from questions q
 where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp2-mock'
on conflict (quiz_id, question_id) do nothing;

insert into exams (id, organization_id, quiz_id, class_id, title, description, instructions,
                   duration_minutes, status, access_code, shared_link_enabled, settings, created_by)
values ('d2000000-0000-4000-8000-000000000002', '0a400000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '0a400000-0000-4000-8000-000000000107', 'MYP2 Mathematics — Mock Examination',
        'Grade 7 · MYP 2 · Mathematics · Mock Examination. Ratio, rate and proportion, set theory and Venn diagrams, probability. 45 questions, 100 marks: Section A (objective) and Section B (structured, constructed responses). Full marking schemes, three-level hints and question-level feedback.', 'MYP2 MATHEMATICS — MOCK EXAMINATION (Grade 7)

Time allowed: 2 hours 30 minutes.

SECTION A — Objective questions (questions 1–22).
Each question has one correct answer (or, where stated, more than one). For numeric questions type the value only, without units. Read every stem: several questions give you data you must interpret before you calculate.

SECTION B — Structured questions (questions 23–45).
Write your working and type each part''s answer in its own box. Marks are shown beside every part, so you can see how much detail a part needs. Where a question shows a table, graph or Venn diagram workspace, build the representation there — that is what is being assessed. A fully correct answer with no supportable method may lose method marks.

EXAMINATION OBJECTIVES. By the end of this paper you should be able to: use ratio and rate to compare and scale quantities, including best-buy and speed problems; share quantities in a given ratio and decide when a proportional relationship is direct, inverse or neither; use set notation and construct two- and three-set Venn diagrams; calculate and compare theoretical and experimental probabilities; and explain your reasoning in clear mathematical language.

GENERAL INSTRUCTIONS.
1. Calculators are not permitted. Show all necessary working; no marks are given for an answer alone in Section B unless a part says so.
2. Give units with every answer that has one, and simplify all fractions and ratios.
3. A hint is available on every part. Hints guide your thinking and never reveal the answer; using one costs no marks and is recorded only to help you revise.
4. Your answers save automatically. If your connection drops, reopen the paper and your work is restored exactly as you left it.
5. Do not write only a final answer for a part that asks you to explain, justify or describe: those parts are marked on the reasoning.

MARKS. Every part shows its own marks, and the totals for each section are printed on the cover. Pass mark: your institution''s configured threshold (default 50%).',
        150, 'open', 'MYP2-MOCK-2026', true,
        '{"proctoring":false,"require_screen_share":false,"randomize_questions":false,"randomize_options":false,"pass_mark_percent":50,"results_published":false,"access_mode":"shared_link","identity_fields":[],"eligible_class_ids":["0a400000-0000-4000-8000-000000000107"],"attempt_policy":"single_resume","assessment_kind":"mock","grade_level":"7","curriculum":"MYP 2","subject":"Mathematics","total_marks":189,"source":"myp-mock-myp2-mock","mock_exam_key":"myp2-mock","mock_code":"MYP2-MOCK-2026","show_sections":true,"feedback":{"marking_criteria":true,"next_time_hint":true,"objective_structured_split":true,"topic_breakdown":true,"criterion_level_band":true}}'::jsonb, '3c3ed712-f409-4aa1-a645-816418e22ec4')
on conflict (id) do nothing;

insert into question_hints (id, organization_id, exam_id, question_id, level, body, status, source,
                            created_by, approved_by)
select ('d2000000-0000-4000-8000' || lpad((500000 + (q.config->>'question_number')::int * 10 + h.level)::text, 12, '0'))::uuid,
       '0a400000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', q.id, h.level, h.body, 'published', 'manual', '3c3ed712-f409-4aa1-a645-816418e22ec4', '3c3ed712-f409-4aa1-a645-816418e22ec4'
  from questions q
  cross join lateral (values
    (1, case when q.type = 'assess_parts'
             then 'Work through the parts in order — later parts often use an earlier answer. Each part also has its own Hint button beside its answer box.'
             else q.config->'hints'->>0 end),
    (2, case when q.type = 'assess_parts'
             then 'For part (a), start here: ' || (q.config->'parts'->0->'hints'->>0)
             else q.config->'hints'->>1 end)
  ) as h(level, body)
 where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp2-mock'
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
   where qq.quiz_id = 'd2000000-0000-4000-8000-000000000001';
  select count(*), count(*) filter (where q.type <> 'assess_parts')
    into v_keys, v_objective
    from questions q
   where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp2-mock';
  select count(*) into v_hints
    from question_hints h join questions q on q.id = h.question_id
   where q.config->>'source' = 'myp-mock-myp2-mock';
  if v_questions <> 45 then
    raise exception 'MYP2-MOCK-2026: % questions on the paper, expected 45', v_questions;
  end if;
  if v_keys <> 45 or v_objective <> 22 then
    raise exception 'MYP2-MOCK-2026: % questions (% objective), expected 45 (22)', v_keys, v_objective;
  end if;
  if v_marks <> 189 then
    raise exception 'MYP2-MOCK-2026: % marks, expected 189', v_marks;
  end if;
  if v_hints <> 45 then
    raise exception 'MYP2-MOCK-2026: % question hints, expected 45', v_hints;
  end if;
  if not exists (select 1 from exams where id = 'd2000000-0000-4000-8000-000000000002' and settings->>'results_published' = 'false') then
    raise exception 'MYP2-MOCK-2026: examination row missing or results already published';
  end if;
end $$;

commit;
