"""Generate safe forward updates for the three existing MYP mock examinations.

Unlike ``build_mock_migrations.py``, this writer is deliberately *not* an import
path. The historical 0097–0115 files use ``ON CONFLICT DO NOTHING`` and cannot
repair rows that are already present in production. These migrations update the
fixed question/quiz/exam rows in place, preserving their UUIDs and every option
UUID where one already exists.

Safety contract
---------------
* Each paper locks its fixed examination row and refuses to run if *any* attempt
  exists. That prevents a refresh from changing an active candidate's paper and
  prevents historical answers from being reinterpreted against rewritten text.
* No question, option, quiz item, hint, attempt, answer, result, user, class or
  tenant row is deleted. Existing option and hint IDs are updated in place.
* The migrations fail before writing if the expected fixed 45-question paper is
  absent, or if an unexpected option shape would require destructive cleanup.
* Re-running a migration is idempotent: values are changed only when authored
  content differs, and all missing support rows use conflict-safe inserts.

Run after changing a mock source:
    python3 scripts/exam-import/build_myp_mock_forward_updates.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import build_mock_migrations as historical
import mock_common
from build_assess_prep_migrations import AUTHOR, ORG, SUBJECT, ROOT, txt

CLASS_ID = "0a400000-0000-4000-8000-000000000107"
VERSIONS = {
    "myp2": "20261113120000",
    "myp4": "20261113120001",
    "myp5": "20261113120002",
}


def source_settings(mod, source: str, marks: int) -> tuple[dict, dict]:
    """Static paper metadata only; operational settings remain untouched."""
    exam = mod.EXAM
    sections = [
        {
            "id": "A",
            "title": "Section A — Objective",
            "questions": 22,
            "marks": mock_common.objective_marks(mod.QUESTIONS),
            "instructions": "One correct answer per question. The options are written so a wrong choice identifies a specific misconception.",
        },
        {
            "id": "B",
            "title": "Section B — Structured",
            "questions": 23,
            "marks": mock_common.structured_marks(mod.QUESTIONS),
            "instructions": "Show your working. Every part carries its own marks, its own answer box and its own two hints.",
        },
    ]
    common = {
        "randomize_questions": False,
        "randomize_options": False,
        "assessment_kind": "mock",
        "grade_level": exam["grade"],
        "curriculum": exam["curriculum"],
        "subject": "Mathematics",
        "total_marks": marks,
        "source": source,
        "mock_exam_key": exam["key"],
        "mock_code": exam["code"],
    }
    quiz = {**common, "duration_minutes": exam["duration"], "sections": sections}
    # Do not include results_published, proctoring, access mode, eligibility,
    # attempt policy, shared-link configuration or a pass-mark override: those
    # are live operational decisions, not authored mock-paper content.
    exam_settings = {
        **common,
        "show_sections": True,
        "feedback": {
            "marking_criteria": True,
            "next_time_hint": True,
            "objective_structured_split": True,
            "topic_breakdown": True,
            "criterion_level_band": True,
        },
    }
    return quiz, exam_settings


def forward_rows(mod, source: str) -> list[dict]:
    rows = historical.build_payload(mod, source)
    out: list[dict] = []
    for row in rows:
        copied = {**row}
        cfg = copied["cfg"]
        hints = cfg.get("hints") if isinstance(cfg.get("hints"), list) else []
        if hints:
            hint_one = str(hints[0])
            hint_two = str(hints[1]) if len(hints) > 1 else str(cfg.get("next_time_hint", ""))
        else:
            parts = cfg.get("parts") if isinstance(cfg.get("parts"), list) else []
            hint_one = str(cfg.get("next_time_hint", ""))
            hint_two = str(parts[0].get("hints", [""])[0]) if parts and isinstance(parts[0], dict) else ""
        assert 8 <= len(hint_one.strip()) <= 800, (mod.EXAM["code"], copied["n"], "hint one")
        # Objective questions historically have one question-level hint; every
        # assess-parts question still carries two progressive *part* hints in
        # its config. Do not invent a second global hint just to fill a row.
        if not (8 <= len(hint_two.strip()) <= 800):
            hint_two = None
        copied["h1"] = hint_one
        copied["h2"] = hint_two
        out.append(copied)
    return out


def sql_for(mod, prefix: str, name: str) -> str:
    exam = mod.EXAM
    source = f"myp-mock-{exam['key']}"
    rows = forward_rows(mod, source)
    marks = mock_common.check_exam(exam["title"], mod.QUESTIONS, 45)
    mock_common.section_split(mod.QUESTIONS)
    assert mock_common.objective_count(mod.QUESTIONS) == 22
    quiz_settings, exam_settings = source_settings(mod, source, marks)
    quiz_id = f"{prefix}-000000000001"
    exam_id = f"{prefix}-000000000002"
    tags = [exam["curriculum"], "Mathematics", "mock", "mock-examination", exam["code"]]
    payload = txt(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
    quiz_settings_sql = txt(json.dumps(quiz_settings, ensure_ascii=False, separators=(",", ":")))
    exam_settings_sql = txt(json.dumps(exam_settings, ensure_ascii=False, separators=(",", ":")))
    tags_sql = ", ".join(txt(tag) for tag in tags)

    return f"""-- {exam['code']} — safe forward update of the existing mock paper.
-- Generated by scripts/exam-import/build_myp_mock_forward_updates.py; do not edit.
--
-- This is intentionally not an ON CONFLICT import. It rewrites only the fixed
-- existing rows in place, preserves UUIDs, and fails closed if an attempt or an
-- unexpected option shape would make a content replacement unsafe.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

create temporary table _myp_mock_forward_stage (
  question_id uuid primary key,
  question_number integer not null,
  question_type text not null,
  prompt text not null,
  prompt_doc jsonb not null,
  explanation text not null,
  points numeric not null,
  difficulty text not null,
  topic text not null,
  subtopic text not null,
  config jsonb not null,
  hint_one text not null,
  hint_two text
) on commit drop;

insert into _myp_mock_forward_stage
  (question_id, question_number, question_type, prompt, prompt_doc, explanation,
   points, difficulty, topic, subtopic, config, hint_one, hint_two)
select ({txt(prefix)} || lpad((100 + (x->>'n')::integer)::text, 12, '0'))::uuid,
       (x->>'n')::integer, x->>'t', x->>'p', x->'d', x->>'e',
       (x->>'m')::numeric, x->>'df', x->>'tp', x->>'st', x->'cfg', x->>'h1', x->>'h2'
  from jsonb_array_elements({payload}::jsonb) as x;

create temporary table _myp_mock_forward_options (
  option_id uuid primary key,
  question_id uuid not null,
  position integer not null,
  label text not null,
  is_correct boolean not null,
  unique (question_id, position)
) on commit drop;

insert into _myp_mock_forward_options (option_id, question_id, position, label, is_correct)
select ({txt(prefix)} || lpad((300000 + s.question_number * 100 + v.position::integer)::text, 12, '0'))::uuid,
       s.question_id, v.position::integer, v.label,
       (s.config->'option_key') @> to_jsonb(v.position::integer)
  from _myp_mock_forward_stage s
 cross join lateral jsonb_array_elements_text(coalesce(s.config->'option_labels', '[]'::jsonb)) with ordinality as v(label, position);

insert into _myp_mock_forward_options (option_id, question_id, position, label, is_correct)
select ({txt(prefix)} || lpad((310000 + s.question_number * 100 + v.position::integer)::text, 12, '0'))::uuid,
       s.question_id, v.position::integer, v.label, true
  from _myp_mock_forward_stage s
 cross join lateral jsonb_array_elements_text(coalesce(s.config->'accepted', '[]'::jsonb)) with ordinality as v(label, position);

create temporary table _myp_mock_forward_hints (
  hint_id uuid primary key,
  question_id uuid not null,
  level smallint not null,
  body text not null,
  unique (question_id, level)
) on commit drop;

insert into _myp_mock_forward_hints (hint_id, question_id, level, body)
select ({txt(prefix)} || lpad((500000 + s.question_number * 10 + v.level)::text, 12, '0'))::uuid,
       s.question_id, v.level::smallint, v.body
  from _myp_mock_forward_stage s
 cross join lateral (values (1, s.hint_one), (2, s.hint_two)) as v(level, body)
 where v.body is not null and char_length(btrim(v.body)) between 8 and 800;

do $$
declare
  v_questions integer;
  v_paper_rows integer;
  v_attempts integer;
  v_extra_options integer;
  v_duplicate_positions integer;
  v_id_collisions integer;
  v_other_paper_links integer;
begin
  -- A row lock prevents a new attempt from being created between this check and
  -- the content update below. If a paper has ever been attempted, stop rather
  -- than reinterpret a candidate's saved response against new question text.
  perform 1 from public.exams
   where id = {txt(exam_id)}::uuid and organization_id = {txt(ORG)}::uuid
   for update;
  if not found then
    raise exception '{exam['code']}: fixed examination row is missing or belongs to another tenant';
  end if;
  perform 1 from public.quizzes
   where id = {txt(quiz_id)}::uuid and organization_id = {txt(ORG)}::uuid
   for update;
  if not found then
    raise exception '{exam['code']}: fixed quiz row is missing or belongs to another tenant';
  end if;
  if not exists (
    select 1 from public.exams
     where id = {txt(exam_id)}::uuid
       and organization_id = {txt(ORG)}::uuid
       and quiz_id = {txt(quiz_id)}::uuid
  ) then
    raise exception '{exam['code']}: the fixed examination is no longer linked to its fixed quiz row';
  end if;

  select count(*) into v_attempts from public.exam_attempts where exam_id = {txt(exam_id)}::uuid;
  if v_attempts <> 0 then
    raise exception '{exam['code']}: refusing to rewrite a paper with % attempt(s); preserve active and historical sessions, then retry with an approved snapshot plan', v_attempts;
  end if;

  select count(*) into v_questions
    from _myp_mock_forward_stage s
    join public.questions q on q.id = s.question_id and q.organization_id = {txt(ORG)}::uuid;
  if v_questions <> 45 then
    raise exception '{exam['code']}: found % of the expected 45 fixed question rows', v_questions;
  end if;

  select count(*) into v_paper_rows
    from _myp_mock_forward_stage s
    join public.quiz_questions qq on qq.question_id = s.question_id and qq.quiz_id = {txt(quiz_id)}::uuid;
  if v_paper_rows <> 45 then
    raise exception '{exam['code']}: found % of the expected 45 fixed quiz-question rows', v_paper_rows;
  end if;
  select count(*) into v_other_paper_links
    from public.quiz_questions qq
    join _myp_mock_forward_stage s on s.question_id = qq.question_id
   where qq.quiz_id <> {txt(quiz_id)}::uuid;
  if v_other_paper_links <> 0 then
    raise exception '{exam['code']}: % target question link(s) belong to another quiz; refusing to rewrite shared content', v_other_paper_links;
  end if;

  -- Existing options must be representable by the authored positions. We may
  -- update those rows in place or add a missing row, but never delete or remap
  -- an unexpected option because an historical answer may reference its UUID.
  select count(*) into v_extra_options
    from public.question_options o
    join _myp_mock_forward_stage s on s.question_id = o.question_id
   where not exists (
     select 1 from _myp_mock_forward_options d
      where d.question_id = o.question_id and d.position = o.position
   );
  if v_extra_options <> 0 then
    raise exception '{exam['code']}: % unexpected option row(s) would require destructive cleanup', v_extra_options;
  end if;

  select count(*) into v_duplicate_positions
    from (
      select o.question_id, o.position
        from public.question_options o
        join _myp_mock_forward_stage s on s.question_id = o.question_id
       group by o.question_id, o.position
      having count(*) > 1
    ) duplicates;
  if v_duplicate_positions <> 0 then
    raise exception '{exam['code']}: duplicate option positions require manual reconciliation';
  end if;

  select count(*) into v_id_collisions
    from _myp_mock_forward_options d
    join public.question_options o on o.id = d.option_id
   where o.question_id <> d.question_id or o.position <> d.position;
  if v_id_collisions <> 0 then
    raise exception '{exam['code']}: deterministic option IDs collide with unrelated rows';
  end if;
end $$;

update public.questions q
   set type = s.question_type,
       prompt = s.prompt,
       prompt_doc = s.prompt_doc,
       explanation = s.explanation,
       explanation_doc = null,
       points = s.points,
       difficulty = s.difficulty,
       topic = s.topic,
       subtopic = s.subtopic,
       tags = array[{tags_sql}],
       config = s.config,
       curriculum = 'MYP',
       curriculum_course = {txt(exam['curriculum'] + ' Mathematics')},
       subject_id = {txt(SUBJECT)}::uuid
  from _myp_mock_forward_stage s
 where q.id = s.question_id
   and q.organization_id = {txt(ORG)}::uuid
   and (
     q.type is distinct from s.question_type
     or q.prompt is distinct from s.prompt
     or q.prompt_doc is distinct from s.prompt_doc
     or q.explanation is distinct from s.explanation
     or q.explanation_doc is not null
     or q.points is distinct from s.points
     or q.difficulty is distinct from s.difficulty
     or q.topic is distinct from s.topic
     or q.subtopic is distinct from s.subtopic
     or q.tags is distinct from array[{tags_sql}]
     or q.config is distinct from s.config
     or q.curriculum is distinct from 'MYP'
     or q.curriculum_course is distinct from {txt(exam['curriculum'] + ' Mathematics')}
     or q.subject_id is distinct from {txt(SUBJECT)}::uuid
   );

update public.question_options o
   set label = d.label,
       is_correct = d.is_correct,
       content_doc = null
  from _myp_mock_forward_options d
 where o.question_id = d.question_id
   and o.position = d.position
   and (o.label is distinct from d.label or o.is_correct is distinct from d.is_correct or o.content_doc is not null);

insert into public.question_options (id, question_id, label, is_correct, position, content_doc)
select d.option_id, d.question_id, d.label, d.is_correct, d.position, null
  from _myp_mock_forward_options d
  left join public.question_options o on o.question_id = d.question_id and o.position = d.position
 where o.id is null
on conflict (id) do nothing;

update public.quiz_questions qq
   set position = s.question_number,
       points = s.points
  from _myp_mock_forward_stage s
 where qq.quiz_id = {txt(quiz_id)}::uuid
   and qq.question_id = s.question_id
   and (qq.position is distinct from s.question_number or qq.points is distinct from s.points);

update public.question_hints h
   set body = d.body,
       body_doc = null,
       status = 'published',
       source = 'manual',
       approved_by = coalesce(h.approved_by, {txt(AUTHOR)}::uuid),
       approved_at = coalesce(h.approved_at, now()),
       published_at = coalesce(h.published_at, now())
  from _myp_mock_forward_hints d
 where h.exam_id = {txt(exam_id)}::uuid
   and h.question_id = d.question_id
   and h.level = d.level
   and (
     h.body is distinct from d.body
     or h.body_doc is not null
     or h.status is distinct from 'published'
     or h.source is distinct from 'manual'
     or h.approved_by is null
     or h.approved_at is null
     or h.published_at is null
   );

insert into public.question_hints
  (id, organization_id, exam_id, question_id, level, body, body_doc, status, source,
   created_by, approved_by, approved_at, published_at)
select d.hint_id, {txt(ORG)}::uuid, {txt(exam_id)}::uuid, d.question_id, d.level, d.body, null,
       'published', 'manual', {txt(AUTHOR)}::uuid, {txt(AUTHOR)}::uuid, now(), now()
  from _myp_mock_forward_hints d
  left join public.question_hints h
    on h.exam_id = {txt(exam_id)}::uuid and h.question_id = d.question_id and h.level = d.level
 where h.id is null
on conflict do nothing;

update public.quizzes q
   set title = {txt(exam['title'])},
       description = {txt(exam['description'])},
       settings = coalesce(q.settings, '{{}}'::jsonb) || {quiz_settings_sql}::jsonb
 where q.id = {txt(quiz_id)}::uuid
   and q.organization_id = {txt(ORG)}::uuid
   and (
     q.title is distinct from {txt(exam['title'])}
     or q.description is distinct from {txt(exam['description'])}
     or q.settings is distinct from (coalesce(q.settings, '{{}}'::jsonb) || {quiz_settings_sql}::jsonb)
   );

update public.exams e
   set title = {txt(exam['title'])},
       description = {txt(exam['description'])},
       instructions = {txt(exam['instructions'])},
       duration_minutes = {exam['duration']},
       settings = coalesce(e.settings, '{{}}'::jsonb) || {exam_settings_sql}::jsonb
 where e.id = {txt(exam_id)}::uuid
   and e.organization_id = {txt(ORG)}::uuid
   and (
     e.title is distinct from {txt(exam['title'])}
     or e.description is distinct from {txt(exam['description'])}
     or e.instructions is distinct from {txt(exam['instructions'])}
     or e.duration_minutes is distinct from {exam['duration']}
     or e.settings is distinct from (coalesce(e.settings, '{{}}'::jsonb) || {exam_settings_sql}::jsonb)
   );

do $$
declare
  v_questions integer;
  v_options integer;
  v_paper_rows integer;
  v_hints integer;
begin
  select count(*) into v_questions
    from _myp_mock_forward_stage s
    join public.questions q on q.id = s.question_id
   where q.organization_id = {txt(ORG)}::uuid
     and q.type = s.question_type
     and q.prompt = s.prompt
     and q.prompt_doc = s.prompt_doc
     and q.explanation = s.explanation
     and q.explanation_doc is null
     and q.points = s.points
     and q.difficulty = s.difficulty
     and q.topic = s.topic
     and q.subtopic = s.subtopic
     and q.config = s.config;
  if v_questions <> 45 then
    raise exception '{exam['code']}: only % question rows match the authored forward payload after update', v_questions;
  end if;

  select count(*) into v_options
    from _myp_mock_forward_options d
    join public.question_options o
      on o.question_id = d.question_id and o.position = d.position
   where o.label = d.label and o.is_correct = d.is_correct and o.content_doc is null;
  if v_options <> (select count(*) from _myp_mock_forward_options) then
    raise exception '{exam['code']}: option rows did not reconcile to the authored payload';
  end if;

  select count(*) into v_paper_rows
    from _myp_mock_forward_stage s
    join public.quiz_questions qq
      on qq.quiz_id = {txt(quiz_id)}::uuid and qq.question_id = s.question_id
   where qq.position = s.question_number and qq.points = s.points;
  if v_paper_rows <> 45 then
    raise exception '{exam['code']}: only % quiz-question rows match the authored order and marks', v_paper_rows;
  end if;

  select count(*) into v_hints
    from _myp_mock_forward_hints d
    join public.question_hints h
      on h.exam_id = {txt(exam_id)}::uuid and h.question_id = d.question_id and h.level = d.level
   where h.body = d.body and h.status = 'published';
  if v_hints <> (select count(*) from _myp_mock_forward_hints) then
    raise exception '{exam['code']}: only % authored hint rows were reconciled', v_hints;
  end if;

  if not exists (
    select 1 from public.quizzes q
     where q.id = {txt(quiz_id)}::uuid and q.organization_id = {txt(ORG)}::uuid
       and q.settings @> {quiz_settings_sql}::jsonb
  ) then
    raise exception '{exam['code']}: quiz metadata did not reconcile';
  end if;
  if not exists (
    select 1 from public.exams e
     where e.id = {txt(exam_id)}::uuid and e.organization_id = {txt(ORG)}::uuid
       and e.duration_minutes = {exam['duration']}
       and e.settings @> {exam_settings_sql}::jsonb
  ) then
    raise exception '{exam['code']}: examination metadata did not reconcile';
  end if;
end $$;

commit;
"""


def main() -> None:
    for mod, prefix, name in historical.PAPERS:
        version = VERSIONS[name]
        path = ROOT / "supabase" / "migrations" / f"{version}_{name}_mock_forward_update.sql"
        sql = sql_for(mod, prefix, name)
        path.write_text(sql)
        print(f"{path.relative_to(ROOT)} — {len(sql) // 1024} KB")


if __name__ == "__main__":
    main()
