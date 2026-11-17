#!/usr/bin/env python3
"""Emit the First Term 2026/27 MYP 4 and MYP 5 summative migrations.

Run from the repository root:

    python3 scripts/exam-import/build_summative_a_migrations.py

It writes two idempotent SQL files into supabase/migrations/:

    20261117110000_myp4_grade9_first_term_summative.sql
    20261117110100_myp5_grade10_sequences_version_b.sql

These are NEW examinations. The four papers already applied as 0116–0119
(including the older MYP 4 and MYP 5 Version B papers) are never rewritten.

Each file creates one published quiz, its questions with the printed criterion,
level, marks, calculator policy and response tools, the printed answer choices,
and one draft examination so an administrator can review it before opening it.
The SQL is generated from the source modules; it does not read production data.
"""
from __future__ import annotations

import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import summative_a_myp4 as p4  # noqa: E402
import summative_a_myp5 as p5  # noqa: E402
from summative_b_common import build_migration  # noqa: E402

ROOT = HERE.parent.parent
OUT = ROOT / "supabase" / "migrations"
GENERATOR = "scripts/exam-import/build_summative_a_migrations.py"

PAPERS = [
    {
        "file": "20261117110000_myp4_grade9_first_term_summative.sql",
        "module": p4,
        "quiz_id": "cb000000-0000-4000-8000-000000000001",
        "exam_id": "cb000000-0000-4000-8000-000000000002",
        "prefix": "cb000000-0000-4000-8000-",
        "grade": 9,
        "myp": "4",
        "class_id": "0a400000-0000-4000-8000-000000000109",
        "title": "MYP 4 (Grade 9) Mathematics — Term 1 Summative Assessment",
        "description": (
            "First Term 2026/27 summative assessment: statistics — data classification, grouped data, "
            "cumulative frequency, histograms, dispersion and real-life decisions. 45 questions "
            "(Part A 25 objective · 30 marks, Part B 20 theory · 70 marks), 100 marks. "
            "Criteria: A 32, B 20, C 24, D 24."
        ),
        "sources": [
            '"Grade_9_MYP_4_Mathematics_Summative_Assessment.pdf" (2 pages: printed student paper, 45 '
            "questions, 100 marks)",
            '"Grade_9_MYP_4_Mathematics_Marking_Scheme.pdf" (6 pages: official teacher marking scheme, '
            "Part A key and Part B worked solutions)",
        ],
    },
    {
        "file": "20261117110100_myp5_grade10_sequences_version_b.sql",
        "module": p5,
        "quiz_id": "cc000000-0000-4000-8000-000000000001",
        "exam_id": "cc000000-0000-4000-8000-000000000002",
        "prefix": "cc000000-0000-4000-8000-",
        "grade": 10,
        "myp": "5",
        "class_id": "0a400000-0000-4000-8000-000000000110",
        "title": "MYP 5 (Grade 10) Mathematics — Summative Assessment: Sequences and Series (Version B)",
        "description": (
            "First Term 2026/27 summative assessment, Version B: arithmetic and geometric sequences and "
            "series, quadratic sequences, recursive and explicit rules, sigma notation and real-life "
            "applications. 35 questions (Part A 19 · 30 marks, Part B 16 · 70 marks), 100 marks. "
            "Criteria: A 32, B 24, C 20, D 24."
        ),
        "sources": [
            '"GRADE 10 exam 1st term.pdf" (2 pages: printed student paper, 35 questions, 100 marks)',
            '"GRADE 10 exam 1st term answer version B.pdf" (4 pages: official teacher marking scheme)',
        ],
    },
]


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for paper in PAPERS:
        mod = paper["module"]
        questions = mod.build()
        totals = mod.CRITERION_TOTALS
        grade = paper["grade"]
        notes = [
            f"Source documents: {'; '.join(paper['sources'])}",
            "",
            f"Grade {grade} · MYP {paper['myp']} · Mathematics · 120 minutes · 100 marks.",
            "Criteria printed by the paper: " + ", ".join(f"{k} {v}" for k, v in sorted(totals.items()))
            + f" (total {sum(totals.values())}).",
            "",
            "Every question carries config.myp_criterion (A–D) exactly as the paper prints it, together with "
            "criterion_label, criterion_title, paper_section, question_number, difficulty_level, marks, "
            "calculator = true and, for constructed-response items, the response tools the question needs.",
            "",
            "No question is reworded, merged, renumbered, re-levelled or re-criterioned. Every objective key "
            "and every constructed-response model answer is checked against the official marking scheme.",
            "",
            "Figures are native SVG graphs/diagrams rebuilt from the source data. Question 5 of the MYP 4 "
            "paper uses a high-resolution crop of the printed bar chart because its bar values are not used "
            "by the question; every other figure is drawn from its underlying values.",
        ]
        sql = build_migration(
            file_name=paper["file"],
            title=paper["title"],
            description=paper["description"],
            quiz_id=paper["quiz_id"],
            exam_id=paper["exam_id"],
            id_prefix=paper["prefix"],
            source=mod.SOURCE,
            grade=f"Grade {grade}",
            myp=paper["myp"],
            myp_class_id=paper["class_id"],
            duration_minutes=120,
            total_marks=100,
            instructions=mod.INSTRUCTIONS,
            sections=mod.SECTIONS,
            criterion_totals=totals,
            questions=questions,
            notes=notes,
            generator=GENERATOR,
        )
        path = OUT / paper["file"]
        path.write_text(sql, encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT)}  ({len(sql):,} bytes, {len(questions)} questions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
