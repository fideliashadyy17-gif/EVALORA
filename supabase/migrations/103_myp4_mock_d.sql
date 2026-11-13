-- MYP4-MOCK-2026 — mock examination, part 4 of 4:
-- options, accepted variants, paper assembly, the examination row (cover page),
-- question-level hints and the self-check. Generated, do not edit.
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING; the self-check aborts the
-- transaction if the paper is incomplete, so it can never half-exist.
begin;

insert into question_options (id, question_id, label, is_correct, position)
select ('d4000000-0000-4000-8000' || lpad((300000 + (q.config->>'question_number')::int * 100 + v.idx)::text, 12, '0'))::uuid,
       q.id, v.label, (q.config->'option_key') @> to_jsonb(v.idx::int), v.idx::int
  from questions q
  cross join lateral jsonb_array_elements_text(q.config->'option_labels') with ordinality as v(label, idx)
 where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp4-mock'
on conflict (id) do nothing;

insert into question_options (id, question_id, label, is_correct, position)
select ('d4000000-0000-4000-8000' || lpad((310000 + (q.config->>'question_number')::int * 100 + v.idx)::text, 12, '0'))::uuid,
       q.id, v.variant, true, v.idx::int
  from questions q
  cross join lateral jsonb_array_elements_text(q.config->'accepted') with ordinality as v(variant, idx)
 where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp4-mock'
on conflict (id) do nothing;

insert into quiz_questions (quiz_id, question_id, position, points)
select 'd4000000-0000-4000-8000-000000000001', q.id, (q.config->>'question_number')::int, q.points
  from questions q
 where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp4-mock'
on conflict (quiz_id, question_id) do nothing;

insert into exams (id, organization_id, quiz_id, class_id, title, description, instructions,
                   duration_minutes, status, access_code, shared_link_enabled, settings, created_by)
values ('d4000000-0000-4000-8000-000000000002', '0a400000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', '0a400000-0000-4000-8000-000000000107', 'MYP4 Mathematics — Mock Examination',
        'Grade 9 · MYP 4 · Mathematics · Mock Examination. Classification of data, measures of central tendency, stem-and-leaf diagrams, five-number summaries and box plots, grouped frequency tables, estimated mean, histograms with frequency density, cumulative frequency curves, line graphs and standard deviation. 45 questions: Section A (objective) and Section B (structured statistical investigations).', 'MYP4 MATHEMATICS — MOCK EXAMINATION (Grade 9)

Time allowed: 2 hours 30 minutes.

SECTION A — Objective questions (questions 1–22).
Each question has one correct answer (or, where stated, more than one). Several questions give you a data set you must interrogate before you can choose: read the question twice.

SECTION B — Structured questions (questions 23–45).
Show your working. Marks are printed beside every part. Where a question asks you to CONSTRUCT a table, histogram, cumulative frequency curve or box plot, build it in the workspace — you are not given a completed one, because constructing the representation is what is being assessed.

EXAMINATION OBJECTIVES. By the end of this paper you should be able to: classify data as qualitative or quantitative, discrete or continuous, and justify the classification; choose and justify an appropriate measure of central tendency, including in the presence of outliers; construct and interpret stem-and-leaf diagrams, grouped frequency tables, histograms with unequal class widths, cumulative frequency curves and box plots; estimate a mean from grouped data using midpoints; calculate and interpret standard deviation; and compare distributions with evidence rather than impression.

GENERAL INSTRUCTIONS.
1. A calculator is permitted in Section B and for the standard deviation questions, but write down the formula or method you use. Standard deviation is the population standard deviation σ = √(Σ(x − x̄)² / n) unless a question says otherwise.
2. Give units, and round to the accuracy stated in each part. If no accuracy is stated, give 3 significant figures.
3. A hint is available on every part. Hints guide the method and never give the answer; using one costs no marks and is recorded only to support your revision.
4. Your answers save automatically; after a disconnection, reopen the paper and your work is restored.
5. Quartiles use the median-excluded method: for an odd number of values the median is not used in either half.

MARKS. Every part shows its marks; section totals are printed on the cover. Pass mark: your institution''s configured threshold (default 50%).',
        150, 'open', 'MYP4-MOCK-2026', true,
        '{"proctoring":false,"require_screen_share":false,"randomize_questions":false,"randomize_options":false,"pass_mark_percent":50,"results_published":false,"access_mode":"shared_link","identity_fields":[],"eligible_class_ids":["0a400000-0000-4000-8000-000000000107"],"attempt_policy":"single_resume","assessment_kind":"mock","grade_level":"9","curriculum":"MYP 4","subject":"Mathematics","total_marks":221,"source":"myp-mock-myp4-mock","mock_exam_key":"myp4-mock","mock_code":"MYP4-MOCK-2026","show_sections":true,"feedback":{"marking_criteria":true,"next_time_hint":true,"objective_structured_split":true,"topic_breakdown":true,"criterion_level_band":true}}'::jsonb, '3c3ed712-f409-4aa1-a645-816418e22ec4')
on conflict (id) do nothing;

insert into question_hints (id, organization_id, exam_id, question_id, level, body, status, source,
                            created_by, approved_by)
select ('d4000000-0000-4000-8000' || lpad((500000 + (q.config->>'question_number')::int * 10 + h.level)::text, 12, '0'))::uuid,
       '0a400000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', q.id, h.level, h.body, 'published', 'manual', '3c3ed712-f409-4aa1-a645-816418e22ec4', '3c3ed712-f409-4aa1-a645-816418e22ec4'
  from questions q
  cross join lateral (values
    (1, case when q.type = 'assess_parts'
             then 'Work through the parts in order — later parts often use an earlier answer. Each part also has its own Hint button beside its answer box.'
             else q.config->'hints'->>0 end),
    (2, case when q.type = 'assess_parts'
             then 'For part (a), start here: ' || (q.config->'parts'->0->'hints'->>0)
             else q.config->'hints'->>1 end)
  ) as h(level, body)
 where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp4-mock'
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
   where qq.quiz_id = 'd4000000-0000-4000-8000-000000000001';
  select count(*), count(*) filter (where q.type <> 'assess_parts')
    into v_keys, v_objective
    from questions q
   where q.organization_id = '0a400000-0000-4000-8000-000000000001' and q.config->>'source' = 'myp-mock-myp4-mock';
  select count(*) into v_hints
    from question_hints h join questions q on q.id = h.question_id
   where q.config->>'source' = 'myp-mock-myp4-mock';
  if v_questions <> 45 then
    raise exception 'MYP4-MOCK-2026: % questions on the paper, expected 45', v_questions;
  end if;
  if v_keys <> 45 or v_objective <> 22 then
    raise exception 'MYP4-MOCK-2026: % questions (% objective), expected 45 (22)', v_keys, v_objective;
  end if;
  if v_marks <> 221 then
    raise exception 'MYP4-MOCK-2026: % marks, expected 221', v_marks;
  end if;
  if v_hints <> 45 then
    raise exception 'MYP4-MOCK-2026: % question hints, expected 45', v_hints;
  end if;
  if not exists (select 1 from exams where id = 'd4000000-0000-4000-8000-000000000002' and settings->>'results_published' = 'false') then
    raise exception 'MYP4-MOCK-2026: examination row missing or results already published';
  end if;
end $$;

commit;
