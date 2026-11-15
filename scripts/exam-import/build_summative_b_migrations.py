#!/usr/bin/env python3
"""Emit the four MYP Mathematics summative-assessment migrations.

Run from the repository root:

    python3 scripts/exam-import/build_summative_b_migrations.py

It writes four idempotent SQL files into supabase/migrations/:

    0102_myp2_grade7_term1_summative_b.sql
    0103_myp3_grade8_term1_summative_b.sql
    0104_myp4_grade9_term1_summative_b.sql
    0105_myp5_grade10_sequences_summative.sql

Each file creates one quiz (published), its 45 questions with their printed
criterion, level, marks, calculator policy and response tools, the printed
answer choices, and the exam itself (draft, so an administrator can verify
the paper before opening it).

Re-running rewrites the files byte-for-byte; applying them twice changes
nothing (every statement is guarded by on conflict / where not exists).
"""
from __future__ import annotations

import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import summative_b_myp2 as p2  # noqa: E402
import summative_b_myp3 as p3  # noqa: E402
import summative_b_myp4 as p4  # noqa: E402
import summative_b_myp5 as p5  # noqa: E402
from summative_b_common import build_migration  # noqa: E402

ROOT = HERE.parent.parent
OUT = ROOT / "supabase" / "migrations"

PAPERS = [
    {
        "file": "0102_myp2_grade7_term1_summative_b.sql",
        "module": p2,
        "grade": 7,
        "myp": "2",
        "class_id": "0a400000-0000-4000-8000-000000000107",
        "title": "MYP 2 (Grade 7) Mathematics — Term 1 Summative Assessment (Version B)",
        "description": (
            "Term 1 summative assessment, Version B: rate, ratio and proportion, sets and probability. "
            "45 questions (Part A 40 objective · 50 marks, Part B 5 theory · 50 marks), 100 marks. "
            "Criteria: A 32, B 18, C 26, D 24."
        ),
        "sources": ['"MYP2 1st Term examination B.pdf" (2 pages, 45 questions, 100 marks)'],
        "duration": 120,
    },
    {
        "file": "0103_myp3_grade8_term1_summative_b.sql",
        "module": p3,
        "grade": 8,
        "myp": "3",
        "class_id": "0a400000-0000-4000-8000-000000000108",
        "title": "MYP 3 (Grade 8) Mathematics — Term 1 Summative Assessment (Version B)",
        "description": (
            "Term 1 summative assessment, Version B: rational and irrational numbers, standard form, indices, "
            "Pythagoras' theorem, congruence and similarity, trigonometric ratios. 45 questions "
            "(Part A 25 objective · 30 marks, Part B 20 theory · 70 marks), 100 marks. "
            "Criteria: A 32, B 20, C 24, D 24."
        ),
        "sources": [
            '"Grade_8_MYP_3_Mathematics_Marking_Scheme_Version_B.pdf" (5 pages: blueprint, Part A answer key '
            "with rationales, Part B worked solutions and marking guidance)",
            "NOTE: the supplied MYP 3 document is the OFFICIAL TEACHER MARKING SCHEME, not the printed "
            "student paper. Part B is authored from the scheme's printed data, subparts, mark codes and "
            "criteria. Part A items are RECONSTRUCTED from the scheme's answer key: the correct answer, "
            "mark, criterion, level and topic are exactly as printed, but the scheme does not print the "
            "student stem or the wrong options. Every Part A item carries "
            "config.source_fidelity = \"reconstructed_from_marking_scheme\" and must be re-authored against "
            "the printed student paper before the paper is opened.",
        ],
        "duration": 120,
    },
    {
        "file": "0104_myp4_grade9_term1_summative_b.sql",
        "module": p4,
        "grade": 9,
        "myp": "4",
        "class_id": "0a400000-0000-4000-8000-000000000109",
        "title": "MYP 4 (Grade 9) Mathematics — Term 1 Summative Assessment (Version B)",
        "description": (
            "Term 1 summative assessment, Version B: statistics — data classification, grouped data, "
            "cumulative frequency, histograms and dispersion. 45 questions (Part A 25 objective · 30 marks, "
            "Part B 20 theory · 70 marks), 100 marks. Criteria: A 32, B 20, C 24, D 24."
        ),
        "sources": [
            '"Grade_9_MYP_4_Mathematics_Summative_Assessment_Version_B.pdf" (2 pages, 45 questions, '
            "100 marks)"
        ],
        "duration": 120,
    },
    {
        "file": "0105_myp5_grade10_sequences_summative.sql",
        "module": p5,
        "grade": 10,
        "myp": "5",
        "class_id": "0a400000-0000-4000-8000-000000000110",
        "title": "MYP 5 (Grade 10) Mathematics — Summative Assessment: Sequences and Series",
        "description": (
            "Summative assessment on sequences and series: arithmetic and geometric sequences and series, "
            "quadratic sequences, recursive and explicit rules, sigma notation and applications. "
            "45 questions (Part A 25 objective · 30 marks, Part B 20 theory · 70 marks), 100 marks. "
            "Criteria: A 32, B 24, C 20, D 24."
        ),
        "sources": [
            '"Grade_10_MYP_5_Mathematics_Summative_Assessment.pdf" (2 pages, 45 questions, 100 marks)'
        ],
        "duration": 120,
    },
]


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for paper in PAPERS:
        mod = paper["module"]
        questions = mod.build()
        grade = paper["grade"]
        hexgrade = f"{grade:02x}"
        base = f"c{hexgrade}00000-0000-4000-8000-"
        quiz_id = f"c{hexgrade}00000-0000-4000-8000-000000000001"
        exam_id = f"c{hexgrade}00000-0000-4000-8000-000000000002"
        totals = mod.CRITERION_TOTALS
        notes = [
            f"Source documents: {'; '.join(paper['sources'])}",
            "",
            f"Grade {grade} · MYP {paper['myp']} · Mathematics · {paper['duration']} minutes · 100 marks.",
            "Criteria printed by the paper: "
            + ", ".join(f"{k} {v}" for k, v in sorted(totals.items()))
            + f" (total {sum(totals.values())}).",
            "",
            "Every question carries config.myp_criterion (A–D) exactly as the paper prints it, together with "
            "criterion_label, criterion_title, paper_section, question_number, difficulty_level, marks, "
            "calculator = true and, for constructed-response items, the response tools the question needs.",
            "",
            "No question is rewritten, merged, renumbered, re-levelled or re-criterioned, and no criterion "
            "is invented: every criterion here is printed in the source document.",
            "",
            "Figures are native SVG (assessDiagramBlock / statsBlock / graphBlock) built from the vector "
            "geometry of the source PDF — the papers' text layer carries no figure data at all.",
        ]
        sql = build_migration(
            file_name=paper["file"],
            title=paper["title"],
            description=paper["description"],
            quiz_id=quiz_id,
            exam_id=exam_id,
            id_prefix=base,
            source=mod.SOURCE,
            grade=f"Grade {grade}",
            myp=paper["myp"],
            myp_class_id=paper["class_id"],
            duration_minutes=paper["duration"],
            total_marks=100,
            instructions=mod.INSTRUCTIONS,
            sections=mod.SECTIONS,
            criterion_totals=totals,
            questions=questions,
            notes=notes,
        )
        path = OUT / paper["file"]
        path.write_text(sql, encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT)}  ({len(sql):,} bytes, {len(questions)} questions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
