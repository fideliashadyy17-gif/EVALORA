-- 0061: class-based AB/BC eligibility for the existing AP Examination.
--
-- The AP Examination (access code AP-LIM-2026, created by 0058) must recognise the four
-- academic classes and give each candidate the paper for their own course:
--   AP1 (AB), AP2 (AB)  -> every common item (BC-only items excluded)
--   AP1 (BC), AP2 (BC)  -> every item
--
-- This migration is additive and guarded:
--   * one nullable column on classes (curriculum_track, AB or BC);
--   * the course is written only to the four AP class rows, matched by id AND name;
--   * the existing examination is found by title, organization and access code. Its
--     linked classes, track policy and two descriptions are updated. Nothing else;
--   * question 48 is reclassified from BC-only to common (see the review note in its config).
-- No exam_attempts, exam_answers, exam_candidates or result row is read or written.
-- Re-running the migration is safe.

alter table public.classes
  add column if not exists curriculum_track text
  check (curriculum_track in ('AB', 'BC'));

comment on column public.classes.curriculum_track is
  'AP Calculus course of the class (AB or BC). Read on the server to decide which items an examination gives a candidate of this class. Null for classes without an AP course.';

do $$
declare
  v_org uuid := '0a400000-0000-4000-8000-000000000001';
  v_exam uuid;
  v_quiz uuid;
  v_updated int;
begin
  -- 1. Course of the four AP classes. Both the id and the name must match the stored record.
  update public.classes c
  set curriculum_track = v.track
  from (values
    ('884b9ddb-8af1-4488-b697-f5dbb2a23085'::uuid, 'AP1 (AB)', 'AB'),
    ('9de6834d-0d90-4bfe-8b85-58af9ee110fe'::uuid, 'AP2 (AB)', 'AB'),
    ('67ed3b13-a531-4a72-8023-41bdebc32659'::uuid, 'AP1 (BC)', 'BC'),
    ('01edebc6-dca8-4376-9e5c-4462a8f95391'::uuid, 'AP2 (BC)', 'BC')
  ) as v(id, name, track)
  where c.id = v.id
    and c.name = v.name
    and c.organization_id = v_org;
  get diagnostics v_updated = row_count;
  if v_updated <> 4 then
    raise exception 'AP classes: expected 4 matching class records, found %', v_updated;
  end if;

  -- 2. The existing AP Examination (not a copy). Exactly one row must match.
  select e.id, e.quiz_id into v_exam, v_quiz
  from public.exams e
  where e.organization_id = v_org
    and e.title = 'AP Examination'
    and e.access_code = 'AP-LIM-2026';
  if v_exam is null then
    raise exception 'AP Examination (AP-LIM-2026) not found';
  end if;

  -- 3. Eligible classes: all four. exam.class_id stays as it is (null).
  update public.exams e
  set settings = e.settings || jsonb_build_object('linked_class_ids', jsonb_build_array(
    '884b9ddb-8af1-4488-b697-f5dbb2a23085',  -- AP1 (AB)
    '67ed3b13-a531-4a72-8023-41bdebc32659',  -- AP1 (BC)
    '9de6834d-0d90-4bfe-8b85-58af9ee110fe',  -- AP2 (AB)
    '01edebc6-dca8-4376-9e5c-4462a8f95391'   -- AP2 (BC)
  )) || jsonb_build_object('track_policy', jsonb_build_object(
    'AB', 'all questions except BC-only items 45, 46, 47, 49 and 50',
    'BC', 'questions 1-50'
  ))
  where e.id = v_exam;

  -- 4. Question 48 (L'Hopital's rule, topic 4.7) is common to AB and BC, not BC-only.
  update public.questions q
  set config = q.config || jsonb_build_object(
    'bc_only', false,
    'curriculum_review', 'Reviewed 2026-11-07: L''Hopital''s rule (topic 4.7) is in both AB and BC. Common item. Academic review recommended because a Maclaurin approach is also possible (BC).'
  )
  where q.organization_id = v_org
    and q.config->>'source' = 'ap-calculus-abbc-limits-practice-exam'
    and q.config->>'question_number' = '48'
    and q.config->>'bc_only' = 'true';
  get diagnostics v_updated = row_count;
  -- Re-run: already reclassified is fine, but the item must exist exactly once.
  if v_updated = 0 and (
    select count(*) from public.questions q
    where q.organization_id = v_org
      and q.config->>'source' = 'ap-calculus-abbc-limits-practice-exam'
      and q.config->>'question_number' = '48'
      and q.config->>'bc_only' = 'false'
  ) <> 1 then
    raise exception 'AP question 48: expected exactly one matching record';
  end if;

  -- 5. Descriptions that state the BC-only range.
  update public.exams
  set description = replace(description, 'Questions 45–50 are for BC students only.',
                            'Questions 45–47, 49 and 50 are for BC students only.')
  where id = v_exam;

  update public.quizzes
  set description = replace(description, 'questions 45–50 are BC only',
                            'questions 45–47, 49 and 50 are BC only')
  where id = v_quiz;
end
$$;
