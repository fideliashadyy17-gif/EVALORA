"""Build the MYP Mathematics mock examination migrations (0097–0099).

Regenerate with:  python3 scripts/exam-import/build_mock_migrations.py

Each paper is 45 questions in two contiguous sections — Section A objective
(single_choice / numeric / short_answer) and Section B structured
(``assess_parts`` with typed parts) — with the cover page in
``exams.instructions`` (G8). Options, paper assembly, question-level hints and
the pass threshold come from the stored config inside the migration itself, so
a re-run is idempotent and can never half-write a paper: the final block
refuses to commit unless every paper has its full complement of questions.

Each paper is written as several consecutive migrations (parts a, b, c, …)
because a single file is too large for the Supabase SQL editor / migration API.
Part a creates the paper row and the first block of questions, the middle parts
add the rest, and the final part writes the options, assembly, examination row,
hints and the self-check. Part boundaries are computed from the payload size,
and the build fails if any file would exceed the request budget.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import mock_common
import mock_myp2
import mock_myp4
import mock_myp5
from build_assess_prep_migrations import AUTHOR, ORG, SUBJECT, ROOT, doc_for, txt

PAPERS = [
    (mock_myp2, "d2000000-0000-4000-8000", "myp2"),
    (mock_myp4, "d4000000-0000-4000-8000", "myp4"),
    (mock_myp5, "d5000000-0000-4000-8000", "myp5"),
]
MOCK_FIRST_NUMBER = 97
CLASS_ID = "0a400000-0000-4000-8000-000000000107"
PASS_DEFAULT = 50


def build_payload(mod, source):
    """One compact JSON object per question, carrying everything the SQL needs."""
    exam, questions = mod.EXAM, mod.QUESTIONS
    # Multi-mark justifications get a vocabulary rubric instead of a literal
    # match (exact matching would fail every correct rephrasing); single-mark
    # recall parts keep exact matching.
    mock_common.apply_keywords(questions)
    payload = []
    for q in questions:
        cfg = {
            "source": source,
            "question_number": q["n"],
            "paper_section": "A" if q["type"] != "assess_parts" else "B",
            "myp_criterion": q["criterion"],
            "strand": q.get("parts", [{}])[0].get("strand", "") if q["type"] == "assess_parts" else "",
            "next_time_hint": q["next"],
            "assessment_style": "myp_mock",
            "mock_exam_key": exam["key"],
        }
        if q["type"] == "assess_parts":
            cfg["parts"] = q["parts"]
            cfg["marking"] = q["marking"]
            cfg["marking_criteria"] = q["marking"]
        elif q["type"] in ("single_choice", "multiple_select"):
            # Option labels carry the misconception they diagnose; the key is
            # the option flagged True in the spec and is created by the SQL
            # from this ordered list.
            cfg["option_labels"] = [label for label, _ in q["options"]]
            cfg["option_key"] = [i + 1 for i, (_, ok) in enumerate(q["options"]) if ok]
            cfg["hints"] = [q["hints"][0], q["hints"][1]] if "hints" in q else []
        elif q["type"] == "numeric":
            cfg["numeric_answer"] = q["numeric"]
            cfg["tolerance"] = q["tol"]
            cfg["hints"] = [q["hints"][0], q["hints"][1]] if "hints" in q else []
        else:
            cfg["accepted"] = q["accepted"]
            if q.get("expression"):
                cfg["normalize_expression"] = True
            cfg["hints"] = [q["hints"][0], q["hints"][1]] if "hints" in q else []
        if q.get("tools"):
            cfg["response_tools"] = q["tools"]
            cfg["response_requirement"] = q["requirement"]
            cfg["response_guidance"] = q["guidance"]
        if q.get("chart"):
            cfg["statistics_chart"] = q["chart"]
        payload.append({
            "n": q["n"], "t": q["type"], "p": q["prompt"],
            "d": doc_for(q["prompt"], q.get("diagram")),
            "e": q["explanation"], "m": q["points"], "df": q["difficulty"],
            "tp": q["topic"], "st": q["subtopic"], "cfg": cfg,
            "marking": q.get("marking", ""),
        })
    return payload


# The Supabase SQL editor and the migration API reject a single statement much
# above ~40 KB, and non-ASCII prose (×, ÷, ξ, em dashes) inflates a request once
# it is URL-encoded. Parts are therefore kept small enough that every generated
# file, URL-encoded, still fits comfortably: see MAX_REQUEST_BYTES.
CHUNK_LIMIT = 21000
MAX_REQUEST_BYTES = 44000


def split_payload(payload):
    """Split a paper's questions into 2–3 payload chunks that each fit the limit."""
    chunks, current, size = [], [], 0
    for row in payload:
        row_size = len(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
        if current and size + row_size > CHUNK_LIMIT:
            chunks.append(current)
            current, size = [], 0
        current.append(row)
        size += row_size
    if current:
        chunks.append(current)
    assert len(chunks) <= 6, (len(chunks), "paper needs more than six parts")
    return chunks


def write_parts(mod, chunks, first_number, name):
    """Write one paper as consecutive migrations NNNNa, NNNNb, … plus assembly."""
    exam, questions = mod.EXAM, mod.QUESTIONS
    marks = mock_common.check_exam(exam["title"], questions, 45)
    mock_common.section_split(questions)
    objective = mock_common.objective_count(questions)
    assert objective == 22, (name, objective)
    source = f"myp-mock-{exam['key']}"
    prefix = next(p for m, p, _ in PAPERS if m is mod)
    quiz_id, exam_id = f"{prefix}-000000000001", f"{prefix}-000000000002"
    paths = []

    for index, chunk in enumerate(chunks):
        letters = "abcdef"[index]
        numbers = [row["n"] for row in chunk]
        part = index + 1
        body = txt(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")))

        if part == 1:
            settings = {
                "randomize_questions": False, "randomize_options": False,
                "assessment_kind": "mock", "grade_level": exam["grade"],
                "curriculum": exam["curriculum"], "subject": "Mathematics",
                "duration_minutes": exam["duration"], "total_marks": marks,
                "source": source, "mock_exam_key": exam["key"], "mock_code": exam["code"],
                "sections": [
                    {"id": "A", "title": "Section A — Objective", "questions": 22,
                     "marks": mock_common.objective_marks(questions),
                     "instructions": "One correct answer per question. The options are written so a "
                                     "wrong choice identifies a specific misconception."},
                    {"id": "B", "title": "Section B — Structured", "questions": 23,
                     "marks": mock_common.structured_marks(questions),
                     "instructions": "Show your working. Every part carries its own marks, its own "
                                     "answer box and its own two hints."},
                ],
            }
            sql = f"""-- {exam['code']} — mock examination, part 1 of {len(chunks) + 1} (paper + questions {numbers[0]}–{numbers[-1]}).
-- Generated by scripts/exam-import/build_mock_migrations.py, do not edit.
-- The paper row is created first so the remaining parts can attach to it;
-- every statement is idempotent, so replaying a part changes nothing.
begin;

insert into platform_settings (key, value)
values ('exam_pass_threshold',
        {txt(json.dumps({"default_percent": PASS_DEFAULT, "organization_overrides": {}}, separators=(",", ":")))}::jsonb)
on conflict (key) do nothing;

insert into quizzes (id, organization_id, title, description, status, settings, created_by)
values ({txt(quiz_id)}, {txt(ORG)}, {txt(exam['title'])}, {txt(exam['description'])}, 'published',
        {txt(json.dumps(settings, ensure_ascii=False, separators=(",", ":")))}::jsonb, {txt(AUTHOR)})
on conflict (id) do nothing;
"""
        else:
            sql = f"""-- {exam['code']} — mock examination, part {part} of {len(chunks) + 1} (questions {numbers[0]}–{numbers[-1]}).
-- Generated by scripts/exam-import/build_mock_migrations.py, do not edit.
begin;
"""

        sql += f"""
insert into questions (id, organization_id, type, prompt, prompt_doc, explanation, explanation_doc,
                       points, difficulty, topic, subtopic, tags, status, config, created_by,
                       curriculum, curriculum_course, subject_id, review_status, creation_method, class_id)
select ({txt(prefix)} || lpad((100 + (x->>'n')::int)::text, 12, '0'))::uuid,
       {txt(ORG)}, x->>'t', x->>'p', x->'d', x->>'e', null,
       (x->>'m')::numeric, x->>'df', x->>'tp', x->>'st',
       array[{txt(exam['curriculum'])}, 'Mathematics', 'mock', 'mock-examination', {txt(exam['code'])}],
       'published', x->'cfg', {txt(AUTHOR)},
       'MYP', {txt(exam['curriculum'] + ' Mathematics')}, {txt(SUBJECT)}, 'approved', 'manual', {txt(CLASS_ID)}
  from jsonb_array_elements({body}::jsonb) as x
on conflict (id) do nothing;

commit;
"""
        out = ROOT / "supabase" / "migrations" / f"{first_number + index:04d}_{name}_mock_{letters}.sql"
        out.write_text(sql)
        paths.append((out.name, len(sql), numbers[0], numbers[-1]))

    # Final part: options, assembly, examination, hints, self-check.
    exam_settings = {
        "proctoring": False, "require_screen_share": False,
        "randomize_questions": False, "randomize_options": False,
        "pass_mark_percent": PASS_DEFAULT, "results_published": False,
        "access_mode": "shared_link", "identity_fields": [],
        "eligible_class_ids": [CLASS_ID], "attempt_policy": "single_resume",
        "assessment_kind": "mock", "grade_level": exam["grade"], "curriculum": exam["curriculum"],
        "subject": "Mathematics", "total_marks": marks, "source": source,
        "mock_exam_key": exam["key"], "mock_code": exam["code"], "show_sections": True,
        "feedback": {"marking_criteria": True, "next_time_hint": True,
                     "objective_structured_split": True, "topic_breakdown": True,
                     "criterion_level_band": True},
    }
    final = f"""-- {exam['code']} — mock examination, part {len(chunks) + 1} of {len(chunks) + 1}:
-- options, accepted variants, paper assembly, the examination row (cover page),
-- question-level hints and the self-check. Generated, do not edit.
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING; the self-check aborts the
-- transaction if the paper is incomplete, so it can never half-exist.
begin;

insert into question_options (id, question_id, label, is_correct, position)
select ({txt(prefix)} || lpad((300000 + (q.config->>'question_number')::int * 100 + v.idx)::text, 12, '0'))::uuid,
       q.id, v.label, (q.config->'option_key') @> to_jsonb(v.idx::int), v.idx::int
  from questions q
  cross join lateral jsonb_array_elements_text(q.config->'option_labels') with ordinality as v(label, idx)
 where q.organization_id = {txt(ORG)} and q.config->>'source' = {txt(source)}
on conflict (id) do nothing;

insert into question_options (id, question_id, label, is_correct, position)
select ({txt(prefix)} || lpad((310000 + (q.config->>'question_number')::int * 100 + v.idx)::text, 12, '0'))::uuid,
       q.id, v.variant, true, v.idx::int
  from questions q
  cross join lateral jsonb_array_elements_text(q.config->'accepted') with ordinality as v(variant, idx)
 where q.organization_id = {txt(ORG)} and q.config->>'source' = {txt(source)}
on conflict (id) do nothing;

insert into quiz_questions (quiz_id, question_id, position, points)
select {txt(quiz_id)}, q.id, (q.config->>'question_number')::int, q.points
  from questions q
 where q.organization_id = {txt(ORG)} and q.config->>'source' = {txt(source)}
on conflict (quiz_id, question_id) do nothing;

insert into exams (id, organization_id, quiz_id, class_id, title, description, instructions,
                   duration_minutes, status, access_code, shared_link_enabled, settings, created_by)
values ({txt(exam_id)}, {txt(ORG)}, {txt(quiz_id)}, {txt(CLASS_ID)}, {txt(exam['title'])},
        {txt(exam['description'])}, {txt(exam['instructions'])},
        {exam['duration']}, 'open', {txt(exam['code'])}, true,
        {txt(json.dumps(exam_settings, ensure_ascii=False, separators=(",", ":")))}::jsonb, {txt(AUTHOR)})
on conflict (id) do nothing;

insert into question_hints (id, organization_id, exam_id, question_id, level, body, status, source,
                            created_by, approved_by, approved_at, published_at)
select ({txt(prefix)} || lpad((500000 + (q.config->>'question_number')::int * 10 + h.level)::text, 12, '0'))::uuid,
       {txt(ORG)}, {txt(exam_id)}, q.id, h.level, h.body, 'published', 'manual',
       {txt(AUTHOR)}, {txt(AUTHOR)}, now(), now()
  from questions q
  cross join lateral (values
    (1, case when jsonb_array_length(coalesce(q.config->'hints', '[]'::jsonb)) >= 1
             then q.config->'hints'->>0
             else q.config->>'next_time_hint' end),
    (2, case when jsonb_array_length(coalesce(q.config->'hints', '[]'::jsonb)) >= 2
             then q.config->'hints'->>1
             else q.config->'parts'->0->'hints'->>0 end)
  ) as h(level, body)
 where q.organization_id = {txt(ORG)} and q.config->>'source' = {txt(source)}
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
   where qq.quiz_id = {txt(quiz_id)};
  select count(*), count(*) filter (where q.type <> 'assess_parts')
    into v_keys, v_objective
    from questions q
   where q.organization_id = {txt(ORG)} and q.config->>'source' = {txt(source)};
  select count(distinct h.question_id) into v_hints
    from question_hints h join questions q on q.id = h.question_id
   where q.config->>'source' = {txt(source)};
  if v_questions <> 45 then
    raise exception '{exam['code']}: % questions on the paper, expected 45', v_questions;
  end if;
  if v_keys <> 45 or v_objective <> 22 then
    raise exception '{exam['code']}: % questions (% objective), expected 45 (22)', v_keys, v_objective;
  end if;
  if v_marks <> {marks} then
    raise exception '{exam['code']}: % marks, expected {marks}', v_marks;
  end if;
  if v_hints <> 45 then
    raise exception '{exam['code']}: % of 45 questions have a published hint', v_hints;
  end if;
  if not exists (select 1 from exams where id = {txt(exam_id)} and settings->>'results_published' = 'false') then
    raise exception '{exam['code']}: examination row missing or results already published';
  end if;
end $$;

commit;
"""
    out = ROOT / "supabase" / "migrations" / f"{first_number + len(chunks):04d}_{name}_mock_{'abcdefg'[len(chunks)]}.sql"
    out.write_text(final)
    paths.append((out.name, len(final), None, None))
    return marks, exam["duration"], paths


def main():
    from urllib.parse import quote

    # Number the parts as they are written: the length of each paper depends on
    # its content, so a fixed per-paper start number would collide after an edit.
    next_number = MOCK_FIRST_NUMBER
    for mod, _prefix, name in PAPERS:
        chunks = split_payload(build_payload(mod, f"myp-mock-{mod.EXAM['key']}"))
        marks, duration, paths = write_parts(mod, chunks, next_number, name)
        next_number += len(paths)
        print(f"{mod.EXAM['code']}: 45 questions, {marks} marks, {duration} min")
        for file, size, low, high in paths:
            span = f"Q{low}–{high}" if low else "assembly"
            encoded = len(quote((ROOT / "supabase" / "migrations" / file).read_text(), safe=""))
            assert encoded <= MAX_REQUEST_BYTES, (
                f"{file}: {encoded} bytes URL-encoded, over the {MAX_REQUEST_BYTES} budget"
            )
            print(f"   {file}  {size // 1024} KB  {encoded // 1024} KB sent  {span}")


if __name__ == "__main__":
    main()
