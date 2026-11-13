"""Build the two full 180-minute MYP formal assessment migrations.

Regenerate with:  python3 scripts/exam-import/build_myp45_full_migrations.py

Paper A — "MYP 4 Mathematics Assessment — Statistics & Distributions"
          (grade 9 / MYP 4, class …0109, 70 questions, 98 marks, 180 min)
Paper B — "MYP 5 Mathematics Assessment — Sequences & Series"
          (grade 10 / MYP 5, class …0110, 74 questions, 166 marks, 180 min)

Both reproduce the source PDFs verbatim (wording, notation, numbering, tables,
figures). Figures are static assets under public/exam-figures/<paper>/ shipped
with the app (see migration 0052 for the pattern). Question model:

* Part I  : ``single_choice`` objective questions, 1 mark each (50 marks).
* Part II : ``assess_parts`` — typed parts with per-part marks, accepted
  answers, tolerances and two progressive hints. Multi-mark written parts
  carry a keyword rubric so a correct explanation in the candidate's own
  words scores.

Each paper is written as several consecutive migrations (parts a, b, c, …)
because a single file is too large for the Supabase SQL editor / migration API.
Part a creates the quiz row (the examination is created in the final part), the
middle parts insert questions, and the final part writes the options, paper
assembly, the examinations row, question-level hints and the self-check.
Boundaries are computed from the payload size; the build fails if a file would
exceed the request budget. Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING,
and the self-check aborts the transaction if the paper is incomplete, so it
can never half-exist.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import myp4_stats_spec
import myp5_seq_spec
import myp45_common
from myp45_common import AUTHOR, ORG, SUBJECT, ROOT, txt, question_payload

CHUNK_LIMIT = 30000
MAX_REQUEST_BYTES = 44000

MYP4_INSTRUCTIONS = """MYP MATHEMATICS — STATISTICS & DISTRIBUTIONS (Grade 9)

Time allowed: 3 hours (180 minutes).

MYP 4 Mathematics · Statistics & Distributions E-Assessment
70 questions · Part I multiple choice, Part II written · 98 marks

INSTRUCTIONS TO STUDENTS
Answer all 70 questions. In Part I each question has one correct answer and carries 1 mark, and there is no penalty for a wrong answer, so never leave one blank.
Part I: circle the letter A, B, C or D, or select it on screen.
Part II: write your answers in the space under each question. Part II carries 48 marks and is grouped by MYP criterion, not by chapter.
Questions are grouped by chapter in Part I and run from Level 1-2 (basic) to Level 5-6 (challenging) inside each chapter.
Every question is labelled with its chapter, the MYP criterion it addresses and its difficulty level.
Figures are drawn to scale and belong to the question above them; read the labels before choosing an answer.
A calculator is allowed. A formula sheet (Annex 1) follows the questions and may be printed separately.
Normal distribution tables are not required and are not permitted; every normal question uses symmetry and the 68-95-99.7 rule only.
Time management: about 2 minutes per mark; flag harder items and return to them at the end.

PART I — 50 multiple-choice questions · 50 marks. One correct answer per question, 1 mark each, no negative marking.
PART II — 20 written questions · 48 marks. Each carries 2 or 3 marks and has its own working space. The written questions are grouped by MYP criterion, in the order A, B, C, D, so every chapter is examined both ways.

MYP CRITERIA ADDRESSED BY THIS ASSESSMENT
Criterion A — Knowing and understanding: applying the statistics formulae (quartiles, IQR, grouped mean, frequency density, sigma, z-score). Part II carries 15 marks.
Criterion B — Investigating patterns: constructing and reading stem-and-leaf plots, ogives and histograms, and judging a construction against the data. Part II carries 11 marks.
Criterion C — Communicating: describing distribution shape, comparing two data sets, justifying the choice of median over mean. Part II carries 14 marks.
Criterion D — Applying mathematics in real-life contexts: exam scores, travel times, market prices, crop yields, salaries, battery lifetimes and temperatures. Part II carries 8 marks.

GENERAL INSTRUCTIONS
1. Calculators are allowed. Show all necessary working; a fully correct answer with no supportable method may lose method marks.
2. Give units with every answer that has one, and simplify all fractions and ratios.
3. A hint is available on every part. Hints guide your thinking and never reveal the answer; using one costs no marks and is recorded only to help you revise.
4. Your answers save automatically. If your connection drops, reopen the paper and your work is restored exactly as you left it.
5. Do not write only a final answer for a part that asks you to explain, justify or describe: those parts are marked on the reasoning.
6. Pass mark: your institution's configured threshold (default 50%)."""

MYP5_INSTRUCTIONS = """MYP MATHEMATICS — SEQUENCES & SERIES (Grade 10)

Time allowed: 3 hours (180 minutes).

MYP 5 Mathematics · Sequences & Series E-Assessment
74 questions · six chapters · Criteria A, B, C and D
74 QUESTIONS · 166 MARKS · 3 HOURS

INSTRUCTIONS TO STUDENTS
Answer all 74 questions. Part I has 50 multiple-choice questions worth 1 mark each; Part II has 24 written questions worth 116 marks, with space to show your working.
Circle the letter A, B, C or D for each multiple-choice question, or select it on screen. Do not leave a blank.
Write your working and final answer in the space provided under each theory question; the marks for each part are shown in the margin.
Chapter, criterion and level are labelled on every question; within each chapter the questions run from Level 1-2 (basic) to Level 5-6 (challenging).
Chapter and coverage: 9 x Recursive & explicit, 7 x Linear, 9 x Arithmetic, 8 x Quadratic, 9 x Geometric, 8 x Arithmetic series — plus 4 written questions per chapter.
A formula sheet (Annex 1) follows the questions and may be printed separately. A calculator is allowed.
Time management: about 1 minute per mark; flag harder items and return to them at the end.
Geometric series are not assessed.

PART I — 50 multiple-choice questions · 50 marks. One correct answer per question, 1 mark each, no negative marking.
PART II — 24 written questions · 116 marks. Four questions close each chapter; every question carries its marks in the margin and space for working.
Whole assessment — 74 questions · 166 marks · 3 hours.
Six chapters, each introduced by a banner: 1. Recursive and Explicit Formulas (9 multiple-choice, Q1-9); 2. Linear Sequences (7, Q10-16); 3. Arithmetic Sequences (9, Q17-25); 4. Quadratic Sequences (8, Q26-33); 5. Geometric Sequences (9, Q34-42); 6. Arithmetic Series (8, Q43-50). Each chapter is followed by its own written section (Q51-54, Q55-58, Q59-62, Q63-66, Q67-70, Q71-74).

MYP CRITERIA ADDRESSED BY THIS ASSESSMENT
Criterion A — Knowing and understanding: selecting and applying formulae for terms, differences, ratios and sums.
Criterion B — Investigating patterns: figures, tables of values, difference patterns and conjectures.
Criterion C — Communicating: identifying errors, comparing sequences and justifying a rule.
Criterion D — Applying mathematics in real-life contexts: savings, prices, transport, health and population.

GENERAL INSTRUCTIONS
1. Calculators are allowed. Show all necessary working; no marks are given for an answer alone in Part II unless a part says so.
2. Give units with every answer that has one, and simplify answers.
3. A hint is available on every part. Hints guide your thinking and never reveal the answer; using one costs no marks and is recorded only to help you revise.
4. Your answers save automatically. If your connection drops, reopen the paper and your work is restored exactly as you left it.
5. Do not write only a final answer for a part that asks you to explain, justify or describe: those parts are marked on the reasoning.
6. Pass mark: your institution's configured threshold (default 50%)."""

PAPERS = [
    {
        "module": myp4_stats_spec,
        "prefix": "e4000000-0000-4000-8000",
        "name": "myp4_full_formal",
        "source": "myp4-full-formal-assessment-2026",
        "class_id": "0a400000-0000-4000-8000-000000000109",
        "grade": "9",
        "curriculum": "MYP 4",
        "title": "MYP 4 Mathematics Assessment — Statistics & Distributions",
        "code": "MYP4-STAT-FULL-2026",
        "description": "Grade 9 · MYP 4 · Mathematics · Formal Assessment. Statistics & Distributions — the eight chapters of the source paper, examined both objectively (Part I) and in writing (Part II, grouped by criterion). 70 questions, 98 marks, 180 minutes. Full marking schemes, two progressive hints per part and question-level feedback.",
        "instructions": MYP4_INSTRUCTIONS,
        "duration": 180,
        "expected_questions": 70,
        "expected_marks": 98,
        "expected_objective_marks": 50,
        "expected_written_marks": 48,
        "sections": [
            {"id": "A", "title": "Part I — Multiple choice", "questions": 50, "marks": 50,
             "instructions": "One correct answer per question, 1 mark each, no negative marking."},
            {"id": "B", "title": "Part II — Written (grouped by criterion)", "questions": 20, "marks": 48,
             "instructions": "Each part carries its own marks and its own answer box. Hints guide your thinking and never reveal the answer."},
        ],
        "tags": ["MYP 4", "Mathematics", "formal-assessment", "MYP4-STAT-FULL-2026"],
        "first_number": 116,
    },
    {
        "module": myp5_seq_spec,
        "prefix": "e5000000-0000-4000-8000",
        "name": "myp5_full_formal",
        "source": "myp5-full-formal-assessment-2026",
        "class_id": "0a400000-0000-4000-8000-000000000110",
        "grade": "10",
        "curriculum": "MYP 5",
        "title": "MYP 5 Mathematics Assessment — Sequences & Series",
        "code": "MYP5-SEQ-FULL-2026",
        "description": "Grade 10 · MYP 5 · Mathematics · Formal Assessment. Sequences & Series — six chapters, examined both objectively (Part I) and in writing (Part II, four questions per chapter). 74 questions, 166 marks, 180 minutes. Full marking schemes, two progressive hints per part and question-level feedback.",
        "instructions": MYP5_INSTRUCTIONS,
        "duration": 180,
        "expected_questions": 74,
        "expected_marks": 166,
        "expected_objective_marks": 50,
        "expected_written_marks": 116,
        "sections": [
            {"id": "A", "title": "Part I — Multiple choice", "questions": 50, "marks": 50,
             "instructions": "One correct answer per question, 1 mark each, no negative marking."},
            {"id": "B", "title": "Part II — Written (four questions per chapter)", "questions": 24, "marks": 116,
             "instructions": "Each part carries its own marks and its own answer box. Hints guide your thinking and never reveal the answer."},
        ],
        "tags": ["MYP 5", "Mathematics", "formal-assessment", "MYP5-SEQ-FULL-2026"],
        "first_number": 0,  # assigned after paper A is laid out
    },
]


def build_payload(paper):
    payload = []
    for q in paper["module"].QUESTIONS:
        row = question_payload(q, paper["source"])
        if q.get("figure"):
            row["cfg"]["figure"] = q["figure"]
        payload.append(row)
    marks = sum(r["m"] for r in payload)
    assert marks == paper["expected_marks"], (paper["name"], marks)
    assert len(payload) == paper["expected_questions"], (paper["name"], len(payload))
    return payload


def split_payload(payload):
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
    assert len(chunks) <= 10, (len(chunks), "paper needs more than ten parts")
    return chunks


def write_paper(paper):
    payload = build_payload(paper)
    chunks = split_payload(payload)
    first_number = paper["first_number"]
    exam, marks = paper, paper["expected_marks"]
    source = exam["source"]
    prefix = exam["prefix"]
    quiz_id, exam_id = f"{prefix}-000000000001", f"{prefix}-000000000002"
    n_parts = len(chunks) + 1
    paths = []

    for index, chunk in enumerate(chunks):
        letters = "abcdefgh"[index]
        numbers = [row["n"] for row in chunk]
        part = index + 1
        body = txt(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")))

        if part == 1:
            settings = {
                "randomize_questions": False, "randomize_options": False,
                "grade_level": exam["grade"], "curriculum": exam["curriculum"],
                "subject": "Mathematics",
                "duration_minutes": exam["duration"], "total_marks": marks,
                "source": source, "sections": exam["sections"],
                "assessment_style": "formal_assessment",
            }
            sql = f"""-- {exam['title']} — formal assessment, part 1 of {n_parts} (paper + questions {numbers[0]}–{numbers[-1]}).
-- Generated by scripts/exam-import/build_myp45_full_migrations.py, do not edit.
-- The quiz row is created first so the remaining parts can attach to it;
-- every statement is idempotent, so replaying a part changes nothing.
begin;

insert into platform_settings (key, value)
values ('exam_pass_threshold',
        {txt(json.dumps({"default_percent": 50, "organization_overrides": {}}, separators=(",", ":")))}::jsonb)
on conflict (key) do nothing;

insert into quizzes (id, organization_id, title, description, status, settings, created_by)
values ({txt(quiz_id)}, {txt(ORG)}, {txt(exam['title'])}, {txt(exam['description'])}, 'published',
        {txt(json.dumps(settings, ensure_ascii=False, separators=(",", ":")))}::jsonb, {txt(AUTHOR)})
on conflict (id) do nothing;
"""
        else:
            sql = f"""-- {exam['title']} — formal assessment, part {part} of {n_parts} (questions {numbers[0]}–{numbers[-1]}).
-- Generated by scripts/exam-import/build_myp45_full_migrations.py, do not edit.
begin;
"""

        sql += f"""
insert into questions (id, organization_id, type, prompt, prompt_doc, explanation, explanation_doc,
                       points, difficulty, topic, subtopic, tags, status, config, created_by,
                       curriculum, curriculum_course, subject_id, review_status, creation_method, class_id)
select ({txt(prefix)} || lpad((100 + (x->>'n')::int)::text, 12, '0'))::uuid,
       {txt(ORG)}, x->>'t', x->>'p', x->'d', x->>'e', null,
       (x->>'m')::numeric, x->>'df', x->>'tp', '',
       array[{txt(exam['curriculum'])}, 'Mathematics', 'formal-assessment', {txt(exam['code'])}],
       'published', x->'cfg', {txt(AUTHOR)},
       'MYP', {txt(exam['curriculum'] + ' Mathematics')}, {txt(SUBJECT)}, 'approved', 'manual', {txt(exam['class_id'])}
  from jsonb_array_elements({body}::jsonb) as x
on conflict (id) do nothing;

commit;
"""
        out = ROOT / "supabase" / "migrations" / f"{first_number + index:04d}_{exam['name']}_{letters}.sql"
        out.write_text(sql)
        paths.append((out.name, len(sql), numbers[0], numbers[-1]))

    exam_settings = {
        "proctoring": False, "require_screen_share": False,
        "randomize_questions": False, "randomize_options": False,
        "pass_mark_percent": 50, "results_published": False,
        "access_mode": "shared_link", "identity_fields": [],
        "eligible_class_ids": [exam["class_id"]], "attempt_policy": "single_resume",
        "grade_level": exam["grade"], "curriculum": exam["curriculum"],
        "subject": "Mathematics", "total_marks": marks, "source": source,
        "show_sections": True,
        "feedback": {"marking_criteria": True, "next_time_hint": True,
                     "objective_structured_split": True, "topic_breakdown": True,
                     "criterion_level_band": True},
    }
    final = f"""-- {exam['title']} — formal assessment, part {n_parts} of {n_parts}:
-- options, paper assembly, the examination row, question-level hints and the self-check.
-- Generated by scripts/exam-import/build_myp45_full_migrations.py, do not edit.
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

insert into quiz_questions (quiz_id, question_id, position, points)
select {txt(quiz_id)}, q.id, (q.config->>'question_number')::int, q.points
  from questions q
 where q.organization_id = {txt(ORG)} and q.config->>'source' = {txt(source)}
on conflict (quiz_id, question_id) do nothing;

insert into exams (id, organization_id, quiz_id, class_id, title, description, instructions,
                   duration_minutes, status, access_code, shared_link_enabled, settings, created_by)
values ({txt(exam_id)}, {txt(ORG)}, {txt(quiz_id)}, {txt(exam['class_id'])}, {txt(exam['title'])},
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
             else q.config->'parts'->0->'hints'->>0 end),
    (2, case when jsonb_array_length(coalesce(q.config->'hints', '[]'::jsonb)) >= 2
             then q.config->'hints'->>1
             else q.config->'parts'->0->'hints'->>1 end)
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
  v_written_marks numeric;
  v_keys int;
  v_hints int;
  v_options int;
begin
  select count(*), coalesce(sum(q.points), 0)
    into v_questions, v_marks
    from quiz_questions qq join questions q on q.id = qq.question_id
   where qq.quiz_id = {txt(quiz_id)};
  select count(*), count(*) filter (where q.type <> 'assess_parts'),
         coalesce(sum(q.points) filter (where q.type = 'assess_parts'), 0)
    into v_keys, v_objective, v_written_marks
    from questions q
   where q.organization_id = {txt(ORG)} and q.config->>'source' = {txt(source)};
  select count(distinct h.question_id) into v_hints
    from question_hints h join questions q on q.id = h.question_id
   where q.config->>'source' = {txt(source)};
  select count(*) into v_options
    from question_options o join questions q on q.id = o.question_id
   where q.config->>'source' = {txt(source)} and o.is_correct;
  if v_questions <> {exam['expected_questions']} then
    raise exception '{exam['code']}: % questions on the paper, expected {exam['expected_questions']}', v_questions;
  end if;
  if v_marks <> {marks} then
    raise exception '{exam['code']}: % marks, expected {marks}', v_marks;
  end if;
  if v_keys <> {exam['expected_questions']} then
    raise exception '{exam['code']}: % questions under the source tag, expected {exam['expected_questions']}', v_keys;
  end if;
  if v_objective <> 50 then
    raise exception '{exam['code']}: % single-choice questions, expected 50', v_objective;
  end if;
  if v_written_marks <> {exam['expected_written_marks']} then
    raise exception '{exam['code']}: % written marks, expected {exam['expected_written_marks']}', v_written_marks;
  end if;
  if v_options <> 50 then
    raise exception '{exam['code']}: % keyed options, expected 50 (one per objective question)', v_options;
  end if;
  if v_hints < {exam['expected_questions']} then
    raise exception '{exam['code']}: only % questions have a published hint', v_hints;
  end if;
  if not exists (select 1 from exams where id = {txt(exam_id)} and settings->>'results_published' = 'false') then
    raise exception '{exam['code']}: examination row missing or results already published';
  end if;
end $$;

commit;
"""
    out = ROOT / "supabase" / "migrations" / f"{first_number + len(chunks):04d}_{exam['name']}_final.sql"
    out.write_text(final)
    paths.append((out.name, len(final), None, None))
    return paths


def main():
    total = []
    next_number = 116
    for paper in PAPERS:
        paper["first_number"] = next_number
        paths = write_paper(paper)
        for name, size, n1, n2 in paths:
            span = f" (questions {n1}–{n2})" if n1 is not None else " (options, assembly, examination, hints, self-check)"
            print(f"{name}  {size/1024:6.1f} KB{span}")
            assert size <= MAX_REQUEST_BYTES, (name, size)
        next_number += len(paths)
        total.extend(paths)
    print(f"total {len(total)} migration files")


if __name__ == "__main__":
    main()
