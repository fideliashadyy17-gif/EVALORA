#!/usr/bin/env python3
"""Emit the two Version C mathematics migrations.

Run from the repository root:

    python3 scripts/exam-import/build_version_c_migrations.py

The SQL is generated from the transcribed source modules; production data is
never read. Replaying either migration changes nothing because every insert is
guarded by its identifier.
"""
from __future__ import annotations

import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import version_c_g9 as g9  # noqa: E402
import version_c_g10 as g10  # noqa: E402
from summative_b_common import build_migration  # noqa: E402

ROOT = HERE.parent.parent
OUT = ROOT / "supabase" / "migrations"
GENERATOR = "scripts/exam-import/build_version_c_migrations.py"

PAPERS = [
    {
        "file": "20261118090001_myp4_grade9_statistics_version_c.sql",
        "module": g9,
        "quiz_id": "cd000000-0000-4000-8000-000000000001",
        "exam_id": "cd000000-0000-4000-8000-000000000002",
        "prefix": "cd000000-0000-4000-8000-",
        "grade": 9,
        "myp": "4",
        "class_id": "0a400000-0000-4000-8000-000000000109",
        "title": g9.TITLE,
        "description": g9.DESCRIPTION,
        "sources": [
            '"GRADE 9 version C.pdf" (2 pages: printed student paper, 30 Part A + 4 Part B, 100 marks)',
            '"Marking scheme of grade 9 version C.pdf" (2 pages: official answer sheet and worked marking scheme)',
        ],
    },
    {
        "file": "20261118090002_myp5_grade10_sequences_version_c.sql",
        "module": g10,
        "quiz_id": "ce000000-0000-4000-8000-000000000001",
        "exam_id": "ce000000-0000-4000-8000-000000000002",
        "prefix": "ce000000-0000-4000-8000-",
        "grade": 10,
        "myp": "5",
        "class_id": "0a400000-0000-4000-8000-000000000110",
        "title": g10.TITLE,
        "description": g10.DESCRIPTION,
        "sources": [
            '"GRade 10 version C.pdf" (2 pages: printed student paper, 30 Part A + 4 Part B, 100 marks)',
            '"Marking scheme of grade 10 version C.pdf" (2 pages: official answer sheet and criterion rubric)',
        ],
    },
]


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for paper in PAPERS:
        mod = paper["module"]
        questions = mod.build()
        notes = [
            f"Source documents: {'; '.join(paper['sources'])}",
            "",
            f"Grade {paper['grade']} · MYP {paper['myp']} · Mathematics · 120 minutes · 100 marks.",
            "Criteria printed by the paper: " + ", ".join(f"{k} {v}" for k, v in sorted(mod.CRITERION_TOTALS.items()))
            + f" (total {sum(mod.CRITERION_TOTALS.values())}).",
            "",
            "Every question carries config.myp_criterion exactly as the paper prints it, with the printed level,",
            "marks, paper section, question number and calculator policy. Answer keys and model answers come from the",
            "official marking scheme; clear contradictions in the printed Grade 9 key grid are documented in the",
            "question explanation and resolved mathematically, never silently.",
            "",
            "Constructed responses use typed parts plus structured workspaces (graph, histogram, back-to-back",
            "stem-and-leaf). Their marking rules are stored in config.structured_marks and never sent to candidates.",
            "",
            "These are NEW papers. No existing quiz, examination, question, attempt or mark is updated or deleted.",
        ]
        sql = build_migration(
            file_name=paper["file"],
            title=paper["title"],
            description=paper["description"],
            quiz_id=paper["quiz_id"],
            exam_id=paper["exam_id"],
            id_prefix=paper["prefix"],
            source=mod.SOURCE,
            grade=f"Grade {paper['grade']}",
            myp=paper["myp"],
            myp_class_id=paper["class_id"],
            duration_minutes=120,
            total_marks=100,
            instructions=mod.INSTRUCTIONS,
            sections=mod.SECTIONS,
            criterion_totals=mod.CRITERION_TOTALS,
            questions=questions,
            notes=notes,
            generator=GENERATOR,
        )
        path = OUT / paper["file"]
        path.write_text(sql, encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT)} ({len(sql):,} bytes, {len(questions)} questions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
