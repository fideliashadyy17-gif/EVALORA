#!/usr/bin/env python3
"""Emit the Version D mathematics summative assessment migration.

Paper: MYP 4 (Grade 9) Mathematics — Term 1 Summative Assessment (Version D)
Examination title: "MYP Mathematics — Version D"

Source: "Grade_9_MYP_4_Mathematics_Summative_Assessment.pdf" and its official
"Grade_9_MYP_4_Mathematics_Marking_Scheme.pdf" (OAK INTERNATIONAL SCHOOL,
BENIN, End of First Term E-assessment 2026/27, MYP 4 · Grade 9, 2 hours,
100 marks). 45 questions: Part A objective (Q1–25, 30 marks) and Part B theory
(Q26–45, 70 marks). Grouped matching items Q15–18 are preserved as a single 4-mark
question record with 4 pairs (P–U keys: T, P, Q, R). Total question records: 42.

Run from repository root:
    python3 scripts/exam-import/build_version_d_migrations.py
"""
from __future__ import annotations

import copy
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import summative_a_myp4 as p4  # noqa: E402
from summative_b_common import (  # noqa: E402
    CREATED_BY,
    DIFFICULTY_FOR_LEVEL,
    ORG_ID,
    SUBJECT_ID,
    json_sql,
    para,
    plain,
    sql_escape,
)

ROOT = HERE.parent.parent
OUT = ROOT / "supabase" / "migrations"
FILE_NAME = "20261119100000_myp4_grade9_first_term_summative_version_d.sql"
GENERATOR = "scripts/exam-import/build_version_d_migrations.py"

QUIZ_ID = "cf000000-0000-4000-8000-000000000001"
EXAM_ID = "cf000000-0000-4000-8000-000000000002"
ID_PREFIX = "cf000000-0000-4000-8000-"
CLASS_ID = "0a400000-0000-4000-8000-000000000109"

TITLE = "MYP Mathematics — Version D"
DESCRIPTION = (
    "First Term 2026/27 summative assessment, Version D: Grade 9 / MYP 4 Mathematics. "
    "Statistics — data classification, grouped data, cumulative frequency, histograms, "
    "dispersion and real-life decisions. 45 questions (Part A 25 objective · 30 marks, "
    "Part B 20 theory · 70 marks), 100 marks. Criteria: A 32, B 20, C 24, D 24."
)
SOURCE = "myp4-term1-summative-first-term-2026-version-d"

FORMULA_SHEET = {
    "version": 1,
    "title": "Formulas for this paper",
    "groups": [
        {
            "title": "Averages",
            "items": [
                {"latex": r"\bar{x} = \dfrac{\Sigma x}{n}", "note": "Mean of n individual values."},
                {"latex": r"\bar{x} = \dfrac{\Sigma fx}{\Sigma f}", "note": "Estimated mean of a frequency table; x is a value or class midpoint."},
                {"latex": r"\text{range} = \text{largest} - \text{smallest}", "note": "A simple measure of spread."},
            ],
        },
        {
            "title": "Grouped data",
            "items": [
                {"latex": r"\text{midpoint} = \dfrac{L+U}{2}", "note": "L and U are the class boundaries (not the printed limits when the data are continuous)."},
                {"latex": r"\text{class width} = U - L", "note": "The width between the lower and upper class boundaries."},
                {"latex": r"\text{frequency density} = \dfrac{\text{frequency}}{\text{class width}}", "note": "Used for a histogram with unequal class widths."},
            ],
        },
        {
            "title": "Median, quartiles and spread",
            "items": [
                {"latex": r"\text{median position} = \dfrac{n+1}{2}", "note": "Position in the ordered list."},
                {"latex": r"IQR = Q_3 - Q_1", "note": "The interquartile range covers the middle 50 %."},
                {"latex": r"\text{lower fence} = Q_1 - 1.5\,IQR", "note": "A value below this fence is an outlier."},
                {"latex": r"\text{upper fence} = Q_3 + 1.5\,IQR", "note": "A value above this fence is an outlier."},
                {"latex": r"\sigma^2 = \dfrac{\Sigma (x-\mu)^2}{N}", "note": "Population variance."},
                {"latex": r"\sigma = \sqrt{\dfrac{\Sigma (x-\mu)^2}{N}}", "note": "Population standard deviation; μ is the population mean."},
            ],
        },
        {
            "title": "Cumulative frequency and coding",
            "items": [
                {"latex": r"\text{median} = \text{value at cumulative frequency } \dfrac{N}{2}", "note": "Read from a cumulative frequency curve or table."},
                {"latex": r"Q_1 \text{ at } \dfrac{N}{4}, \quad Q_3 \text{ at } \dfrac{3N}{4}", "note": "Quartile positions on the cumulative axis."},
                {"latex": r"y = ax + b", "note": "A linear coding of every data value."},
                {"latex": r"\bar{y} = a\bar{x} + b", "note": "The mean follows the same coding."},
                {"latex": r"\sigma_y = |a|\,\sigma_x", "note": "Adding b does not change the spread; multiplying by a scales it by |a|."},
            ],
        },
    ],
    "exam_id": EXAM_ID,
}


def build_questions():
    base_questions = p4.build()
    questions = []
    for raw in base_questions:
        q = copy.deepcopy(raw)
        q["cfg"]["source"] = SOURCE
        # Configure response tools for constructed responses
        if q["n"] == 37:
            q["cfg"]["response_tools"] = ["data_table", "rich_text", "math"]
            q["cfg"]["response_requirement"] = "data_table"
        elif q["n"] == 38:
            q["cfg"]["response_tools"] = ["statistics", "graph", "rich_text", "math"]
            q["cfg"]["response_requirement"] = "statistics"
            q["cfg"]["response_stats"] = {"chart": "histogram"}
        questions.append(q)
    return questions


def generate_migration_sql():
    questions = build_questions()
    assert len(questions) == 42, f"Expected 42 questions, got {len(questions)}"
    total_marks = sum(q["marks"] for q in questions)
    assert total_marks == 100, f"Expected 100 total marks, got {total_marks}"
    matching = next(q for q in questions if q["n"] == 15)
    assert matching["type"] == "matching" and len(matching["cfg"]["pairs"]) == 4 and matching["marks"] == 4

    lines = []
    add = lines.append

    add(f"-- {TITLE}")
    add(f"-- Generated by {GENERATOR} — do not edit by hand.")
    add("--")
    add('-- Source documents: "Grade_9_MYP_4_Mathematics_Summative_Assessment.pdf" (2 pages: 45 questions, 100 marks);')
    add('--                   "Grade_9_MYP_4_Mathematics_Marking_Scheme.pdf" (6 pages: official marking scheme).')
    add("--")
    add("-- Grade 9 · MYP 4 · Mathematics · 120 minutes · 100 marks.")
    add("-- Criteria printed by the paper: A 32, B 20, C 24, D 24 (total 100).")
    add("-- Q15–18 are grouped into a single matching exercise (4 marks, 4 pairs: T, P, Q, R).")
    add("-- Total question records: 42 (Q1–14, Q15 [15–18], Q19–45).")
    add("-- Every statement is idempotent: replaying the migration changes nothing.")
    add("begin;")
    add("")

    # 1. Quizzes
    quiz_settings = {
        "randomize_questions": False,
        "randomize_options": False,
        "assessment_kind": "summative",
        "grade_level": "Grade 9",
        "curriculum": "MYP 4",
        "subject": "Mathematics",
        "duration_minutes": 120,
        "total_marks": 100,
        "source": SOURCE,
        "summative_key": SOURCE,
        "criterion_totals": p4.CRITERION_TOTALS,
    }
    add("insert into quizzes (id, organization_id, title, description, status, settings, created_by)")
    add(f"values ('{QUIZ_ID}', '{ORG_ID}',")
    add(f"        '{sql_escape(TITLE)}',")
    add(f"        '{sql_escape(DESCRIPTION)}',")
    add(f"        'published', '{json_sql(quiz_settings)}'::jsonb, '{CREATED_BY}')")
    add("on conflict (id) do update")
    add(f"   set title = '{sql_escape(TITLE)}',")
    add(f"       description = '{sql_escape(DESCRIPTION)}',")
    add("       status = 'published',")
    add(f"       settings = '{json_sql(quiz_settings)}'::jsonb,")
    add("       updated_at = now();")
    add("")

    # 2. Questions
    add("insert into questions (id, organization_id, type, prompt, prompt_doc, explanation,")
    add("                       points, difficulty, topic, subtopic, tags, status, config,")
    add("                       created_by, curriculum, curriculum_course, subject_id,")
    add("                       review_status, creation_method, class_id, source_reference)")
    add("select ('" + ID_PREFIX + "' || lpad((1000 + (x->>'n')::int)::text, 12, '0'))::uuid,")
    add(f"       '{ORG_ID}', x->>'t', x->>'p', x->'d', x->>'e',")
    add("       (x->>'m')::numeric, x->>'df', x->>'tp', x->>'st',")
    tags = ["MYP 4", "Mathematics", "summative", SOURCE, "criteria-a-d", "version-d"]
    add("       array[" + ", ".join(f"'{sql_escape(tag)}'" for tag in tags) + "]::text[],")
    add("       'published', x->'cfg',")
    add(f"       '{CREATED_BY}', 'MYP', 'MYP 4 Mathematics', '{SUBJECT_ID}',")
    add(f"       'approved', 'manual', '{CLASS_ID}',")
    add(f"       '{sql_escape(SOURCE)}'")
    add("  from jsonb_array_elements('" + json_sql([
        {
            "n": r["n"],
            "t": r["type"],
            "p": plain(r["doc"]),
            "d": r["doc"],
            "e": r["expl"],
            "m": r["marks"],
            "df": DIFFICULTY_FOR_LEVEL[r["lvl"]],
            "tp": r["topic"],
            "st": r["subtopic"],
            "cfg": r["cfg"],
        }
        for r in questions
    ]) + "'::jsonb) as x")
    add("on conflict (id) do update")
    add("   set type = excluded.type,")
    add("       prompt = excluded.prompt,")
    add("       prompt_doc = excluded.prompt_doc,")
    add("       explanation = excluded.explanation,")
    add("       points = excluded.points,")
    add("       difficulty = excluded.difficulty,")
    add("       topic = excluded.topic,")
    add("       subtopic = excluded.subtopic,")
    add("       tags = excluded.tags,")
    add("       status = 'published',")
    add("       config = excluded.config,")
    add("       review_status = 'approved',")
    add("       updated_at = now();")
    add("")

    # 3. Question Options (for multiple choice and true/false)
    add("insert into question_options (question_id, label, is_correct, position, content_doc)")
    add("select ('" + ID_PREFIX + "' || lpad((1000 + (o->>'n')::int)::text, 12, '0'))::uuid,")
    add("       o->>'l', (o->>'c')::boolean, (o->>'p')::integer, o->'doc'")
    add("  from jsonb_array_elements('" + json_sql([
        {
            "n": r["n"],
            "l": o["label"],
            "c": o["correct"],
            "p": i,
            "doc": {"type": "doc", "content": [para(o["body"])]},
        }
        for r in questions
        if r.get("options")
        for i, o in enumerate(r["options"])
    ]) + "'::jsonb) as o")
    add("where not exists (")
    add("  select 1 from question_options x")
    add("  where x.question_id = ('" + ID_PREFIX + "' || lpad((1000 + (o->>'n')::int)::text, 12, '0'))::uuid")
    add(");")
    add("")

    # 4. Quiz Questions
    add("insert into quiz_questions (quiz_id, question_id, position, points)")
    add("select '" + QUIZ_ID + "',")
    add("       ('" + ID_PREFIX + "' || lpad((1000 + (x->>'n')::int)::text, 12, '0'))::uuid,")
    add("       (x->>'n')::integer, (x->>'m')::numeric")
    add("  from jsonb_array_elements('" + json_sql([
        {"n": r["n"], "m": r["marks"]} for r in questions
    ]) + "'::jsonb) as x")
    add("on conflict (quiz_id, question_id) do update")
    add("   set position = excluded.position,")
    add("       points = excluded.points;")
    add("")

    # 5. Exams
    exam_settings = {
        "proctoring": False,
        "require_screen_share": False,
        "randomize_questions": False,
        "randomize_options": False,
        "pass_mark_percent": 50,
        "results_published": False,
        "access_mode": "shared_link",
        "identity_fields": [],
        "eligible_class_ids": [CLASS_ID],
        "attempt_policy": "single_resume",
        "attempt_mode": "limited",
        "max_attempts": 1,
        "calculator": True,
        "criterion_reporting": True,
        "sections": p4.SECTIONS,
        "criterion_totals": p4.CRITERION_TOTALS,
        "source": SOURCE,
        "formula_sheet": FORMULA_SHEET,
    }
    add("insert into exams (id, organization_id, quiz_id, title, description, instructions,")
    add("                   duration_minutes, status, settings, created_by, class_id)")
    add(f"values ('{EXAM_ID}', '{ORG_ID}', '{QUIZ_ID}',")
    add(f"        '{sql_escape(TITLE)}',")
    add(f"        '{sql_escape(DESCRIPTION)}',")
    add(f"        '{sql_escape(p4.INSTRUCTIONS)}',")
    add(f"        120, 'open',")
    add(f"        '{json_sql(exam_settings)}'::jsonb, '{CREATED_BY}', '{CLASS_ID}')")
    add("on conflict (id) do update")
    add(f"   set title = '{sql_escape(TITLE)}',")
    add(f"       description = '{sql_escape(DESCRIPTION)}',")
    add(f"       instructions = '{sql_escape(p4.INSTRUCTIONS)}',")
    add("       duration_minutes = 120,")
    add("       status = 'open',")
    add(f"       settings = '{json_sql(exam_settings)}'::jsonb;")
    add("")

    add("commit;")
    add("")
    return "\n".join(lines)


def main():
    sql = generate_migration_sql()
    target = OUT / FILE_NAME
    target.write_text(sql, encoding="utf-8")
    print(f"Wrote {target} ({len(sql):,} bytes)")


if __name__ == "__main__":
    main()
