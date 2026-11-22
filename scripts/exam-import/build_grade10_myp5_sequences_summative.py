#!/usr/bin/env python3
"""Build migration for Grade 10 · MYP 5 Mathematics Summative Assessment recreation.

Source: "Grade_10_MYP_5_Mathematics_Summative_Assessment 2.pdf"
OAK INTERNATIONAL SCHOOL, BENIN
End of First Term E-assessment 2026/27
Subject: Mathematics
Grade: MYP 5 (Grade 10)
Duration: 2 hours (120 minutes)
Total marks: 100 marks
Criteria: A 32, B 24, C 20, D 24 (total 100).
Part A: Q1–25 Objective multiple-choice (30 marks)
Part B: Q1–20 Theory & problem-solving (70 marks)
Total questions: 45
"""
import copy
import hashlib
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "supabase" / "migrations" / "20261122110000_grade10_myp5_summative_assessment_recreation.sql"

ORG_ID = "0a400000-0000-4000-8000-000000000001"
CLASS_ID = "0a400000-0000-4000-8000-000000000110"  # Grade 10 — MYP 5
SUBJECT_ID = "0a400000-0000-4000-8000-000000000030"
CREATED_BY = "3c3ed712-f409-4aa1-a645-816418e22ec4"

QUIZ_ID = "c5a00000-0000-4000-8000-000000000001"
EXAM_ID = "c5a00000-0000-4000-8000-000000000002"
INVITE_TOKEN = "c5a00000-0000-4000-8000-000000000003"
ID_PREFIX = "c5a00000-0000-4000-8000-"

EXAM_TITLE = "Grade 10 · MYP 5 Mathematics — Summative Assessment: Sequences and Series"
EXAM_DESC = (
    "End of First Term E-assessment 2026/27: Grade 10 / MYP 5 Mathematics. "
    "Summative Assessment · Sequences and Series. 45 questions (Part A: 25 Objective · 30 marks; "
    "Part B: 20 Theory · 70 marks). Total 100 marks. Criteria: A 32, B 24, C 20, D 24. Duration: 2 hours."
)
EXAM_INSTRUCTIONS = (
    "Answer all 45 questions (25 Objective + 20 Theory). Part A (Q1–25): circle the letter (A, B, C or D) "
    "of the single correct option on this paper. Part B (Q1–20): write full algebraic working, sequence/difference "
    "tables, formulae and contextual reasoning in your separate answer booklet. A scientific calculator is permitted. "
    "Give non-exact numerical answers to 3 s.f. (2 d.p. for currency)."
)
ACCESS_CODE = "G10-SEQ-SUM26"
ACCESS_CODE_HASH = hashlib.sha256(ACCESS_CODE.encode("utf-8")).hexdigest()
SOURCE = "grade10-myp5-sequences-series-summative-assessment-2026-27"

SECTIONS = [
    {
        "id": "A",
        "title": "Part A — Objective multiple-choice questions (Q1–Q25)",
        "questions": 25,
        "marks": 30,
        "instructions": (
            "25 questions · 30 marks. Level 1 · Basic (Q1–10, 1 mark each); "
            "Level 2 · Intermediate (Q11–20, 1 mark each); "
            "Level 3 · Advanced (Q21–25, 2 marks each)."
        ),
    },
    {
        "id": "B",
        "title": "Part B — Theory & problem-solving (Q1–Q20)",
        "questions": 20,
        "marks": 70,
        "instructions": (
            "20 questions · 70 marks. Task 1: Criterion A (22 marks, Q1–6); "
            "Task 2: Criterion B (16 marks, Q7–10); "
            "Task 3: Criterion C (15 marks, Q11–15); "
            "Task 4: Criterion D (17 marks, Q16–20)."
        ),
    },
]

CRITERION_TOTALS = {"A": 32, "B": 24, "C": 20, "D": 24}

FORMULA_SHEET = {
    "version": 1,
    "title": "Formulas for this paper",
    "groups": [
        {
            "title": "Arithmetic sequences and series",
            "items": [
                {"latex": r"u_n = u_1 + (n-1)d", "note": "nth term; d is the common difference."},
                {"latex": r"S_n = \dfrac{n}{2}(u_1 + u_n)", "note": "Sum of the first n terms."},
                {"latex": r"S_n = \dfrac{n}{2}\bigl(2u_1 + (n-1)d\bigr)", "note": "The same sum when the last term is not known."},
            ],
        },
        {
            "title": "Geometric sequences and series",
            "items": [
                {"latex": r"u_n = u_1 r^{\,n-1}", "note": "nth term; r is the common ratio."},
                {"latex": r"S_n = \dfrac{u_1(r^n - 1)}{r - 1} \quad (r \ne 1)", "note": "Sum of the first n terms."},
                {"latex": r"S_n = \dfrac{u_1(1 - r^n)}{1 - r} \quad (r \ne 1)", "note": "The same sum written with 1 − r."},
            ],
        },
        {
            "title": "Quadratic sequences",
            "items": [
                {"latex": r"u_n = an^2 + bn + c", "note": "General quadratic term."},
                {"latex": r"\text{second difference} = 2a", "note": "For a quadratic sequence the second differences are constant."},
            ],
        },
        {
            "title": "Recursive rules and partial sums",
            "items": [
                {"latex": r"u_{n+1} = f(u_n)", "note": "A recursive rule needs its initial term to define a unique sequence."},
                {"latex": r"u_n = S_n - S_{n-1} \quad (n \ge 2)", "note": "A term is the difference of consecutive partial sums."},
                {"latex": r"\sum_{k=1}^{n} u_k", "note": "Sigma notation for u₁ + u₂ + … + u_n."},
                {"latex": r"V_n = V_0(1 \pm r)^n", "note": "Repeated percentage growth (+) or decay (−)."},
            ],
        },
    ],
    "exam_id": EXAM_ID,
}


def _inline(text: str):
    import re
    parts = re.split(r"(\$[^$]+\$)", text)
    out = []
    for p in parts:
        if not p:
            continue
        if p.startswith("$") and p.endswith("$") and len(p) > 2:
            out.append({"type": "mathInline", "attrs": {"latex": p[1:-1]}})
        else:
            out.append({"type": "text", "text": p})
    return out or [{"type": "text", "text": ""}]


def para(text: str):
    return {"type": "paragraph", "content": _inline(text)}


def table_block(columns, rows):
    content = [
        {
            "type": "tableRow",
            "content": [
                {"type": "tableHeader", "content": [para(str(c))]} for c in columns
            ],
        }
    ]
    for row in rows:
        content.append(
            {
                "type": "tableRow",
                "content": [{"type": "tableCell", "content": [para(str(c))]} for c in row],
            }
        )
    return {"type": "table", "content": content}


def image_block(src: str, alt: str, title: str = "", width: int = 60):
    return {
        "type": "image",
        "attrs": {
            "src": src,
            "alt": alt,
            "title": title,
            "width": width,
        },
    }


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def json_sql(data) -> str:
    return sql_escape(json.dumps(data, ensure_ascii=False, separators=(",", ":")))


def build_all_questions():
    questions = []
    options = []

    # =========================================================================
    # PART A (Q1–25): Objective Multiple Choice
    # =========================================================================
    part_a_specs = [
        # Q1
        {
            "n": 1, "crit": "A", "diff_level": "basic", "diff": "easy", "pts": 1,
            "topic": "Arithmetic sequences & series", "subtopic": "finite arithmetic series definition",
            "prompt": "Which mathematical expression represents a finite arithmetic series?",
            "doc_content": [para("Which mathematical expression represents a finite arithmetic series?")],
            "explanation": "A series is the indicated sum of the terms of a sequence. 4 + 9 + 14 + 19 + 24 has a constant common difference of +5 between consecutive added terms, representing a finite arithmetic series. A is a sequence, C is a geometric series (ratio 2), and D is an explicit rule.",
            "opts": [
                ("A", "4, 9, 14, 19, 24", False),
                ("B", "4 + 9 + 14 + 19 + 24", True),
                ("C", "4 + 8 + 16 + 32 + 64", False),
                ("D", "$u_n = 5n - 1$", False),
            ],
        },
        # Q2
        {
            "n": 2, "crit": "A", "diff_level": "basic", "diff": "easy", "pts": 1,
            "topic": "Linear sequences", "subtopic": "common difference and 5th term",
            "prompt": "For the linear sequence 19, 13, 7, 1, …, state the common difference $d$ and the 5th term $u_5$.",
            "doc_content": [para("For the linear sequence 19, 13, 7, 1, …, state the common difference $d$ and the 5th term $u_5$.")],
            "explanation": "$d = 13 - 19 = -6$. The 5th term is $u_5 = 1 + (-6) = -5$. Thus $d = -6, u_5 = -5$.",
            "opts": [
                ("A", "$d = 6, u_5 = -5$", False),
                ("B", "$d = -6, u_5 = -5$", True),
                ("C", "$d = -6, u_5 = -6$", False),
                ("D", "$d = \\frac{13}{19}, u_5 = -5$", False),
            ],
        },
        # Q3
        {
            "n": 3, "crit": "A", "diff_level": "basic", "diff": "easy", "pts": 1,
            "topic": "Geometric sequences", "subtopic": "first term and common ratio",
            "prompt": "Identify the first term $u_1$ and common ratio $r$ of the geometric sequence 96, −48, 24, −12, …",
            "doc_content": [para("Identify the first term $u_1$ and common ratio $r$ of the geometric sequence 96, −48, 24, −12, …")],
            "explanation": "First term $u_1 = 96$. Common ratio $r = \\frac{-48}{96} = -\\frac{1}{2}$.",
            "opts": [
                ("A", "$u_1 = 96, r = -\\frac{1}{2}$", True),
                ("B", "$u_1 = 96, r = \\frac{1}{2}$", False),
                ("C", "$u_1 = 96, r = -2$", False),
                ("D", "$u_1 = -48, r = -\\frac{1}{2}$", False),
            ],
        },
        # Q4
        {
            "n": 4, "crit": "A", "diff_level": "basic", "diff": "easy", "pts": 1,
            "topic": "Quadratic sequences", "subtopic": "explicit term calculation",
            "prompt": "A sequence has explicit formula $u_n = 2n^2 - 5n + 1$. Calculate $u_6$.",
            "doc_content": [para("A sequence has explicit formula $u_n = 2n^2 - 5n + 1$. Calculate $u_6$.")],
            "explanation": "$u_6 = 2(6^2) - 5(6) + 1 = 2(36) - 30 + 1 = 72 - 30 + 1 = 43$.",
            "opts": [
                ("A", "13", False),
                ("B", "41", False),
                ("C", "43", True),
                ("D", "115", False),
            ],
        },
        # Q5
        {
            "n": 5, "crit": "A", "diff_level": "basic", "diff": "easy", "pts": 1,
            "topic": "Recursive rules", "subtopic": "recursive term generation",
            "prompt": "Given the recursive rule $u_1 = 3$ and $u_{n+1} = 2u_n - 1$ ($n \\ge 1$), find $u_4$.",
            "doc_content": [para("Given the recursive rule $u_1 = 3$ and $u_{n+1} = 2u_n - 1$ ($n \\ge 1$), find $u_4$.")],
            "explanation": "$u_1 = 3$; $u_2 = 2(3) - 1 = 5$; $u_3 = 2(5) - 1 = 9$; $u_4 = 2(9) - 1 = 17$.",
            "opts": [
                ("A", "9", False),
                ("B", "11", False),
                ("C", "15", False),
                ("D", "17", True),
            ],
        },
        # Q6
        {
            "n": 6, "crit": "B", "diff_level": "basic", "diff": "easy", "pts": 1,
            "topic": "Sequence classification", "subtopic": "identifying quadratic sequences",
            "prompt": "How is the sequence 3, 8, 15, 24, 35, … best classified?",
            "doc_content": [para("How is the sequence 3, 8, 15, 24, 35, … best classified?")],
            "explanation": "1st differences: 8−3 = 5, 15−8 = 7, 24−15 = 9, 35−24 = 11. 2nd differences: 7−5 = 2, 9−7 = 2, 11−9 = 2. A constant second difference classifies it as a quadratic sequence ($u_n = n^2 + 2n$).",
            "opts": [
                ("A", "Linear", False),
                ("B", "Geometric", False),
                ("C", "Quadratic", True),
                ("D", "Constant", False),
            ],
        },
        # Q7
        {
            "n": 7, "crit": "C", "diff_level": "basic", "diff": "easy", "pts": 1,
            "topic": "Mathematical vocabulary", "subtopic": "recursive vs explicit",
            "prompt": "Which statement correctly distinguishes a recursive formula from an explicit formula?",
            "doc_content": [para("Which statement correctly distinguishes a recursive formula from an explicit formula?")],
            "explanation": "A recursive formula defines each term $u_{n+1}$ by relating it to one or more preceding terms (along with an initial term $u_1$), whereas an explicit formula gives $u_n$ directly as a function of the term index $n$.",
            "opts": [
                ("A", "Gives $u_n$ directly in $n$", False),
                ("B", "Relates $u_{n+1}$ to prior term(s) + $u_1$", True),
                ("C", "Applies only to linear rules", False),
                ("D", "Computes the sum $S_n$", False),
            ],
        },
        # Q8
        {
            "n": 8, "crit": "A", "diff_level": "basic", "diff": "easy", "pts": 1,
            "topic": "Arithmetic sequences", "subtopic": "missing terms",
            "prompt": "Find the missing terms $x$ and $y$ in the arithmetic sequence 7, $x$, $y$, 28.",
            "doc_content": [para("Find the missing terms $x$ and $y$ in the arithmetic sequence 7, $x$, $y$, 28.")],
            "explanation": "$u_1 = 7, u_4 = 28$. In an arithmetic sequence $u_4 = u_1 + 3d \\implies 7 + 3d = 28 \\implies 3d = 21 \\implies d = 7$. Then $x = u_2 = 7 + 7 = 14$ and $y = u_3 = 14 + 7 = 21$.",
            "opts": [
                ("A", "12, 20", False),
                ("B", "13, 22", False),
                ("C", "14, 21", True),
                ("D", "10.5, 17.5", False),
            ],
        },
        # Q9
        {
            "n": 9, "crit": "B", "diff_level": "basic", "diff": "easy", "pts": 1,
            "topic": "Pattern investigation", "subtopic": "explicit formula for dot pattern",
            "prompt": "Which explicit formula gives the total number of dots $u_n$ in Figure $n$?\n\n[Figure: Figure n dot pattern]",
            "doc_content": [
                para("Which explicit formula gives the total number of dots $u_n$ in Figure $n$?"),
                image_block("/exam-figures/myp5-sequences-2026/q09-dots.png", "Dot pattern: Figure 1 (5 dots), Figure 2 (8 dots), Figure 3 (11 dots)", "Figure n dot pattern", 60),
            ],
            "explanation": "Figure 1 has 5 dots, Figure 2 has 8 dots, Figure 3 has 11 dots. The terms are 5, 8, 11, … with common difference $d = 3$. An arithmetic sequence with $u_1 = 5$ has $u_n = 5 + (n - 1)(3) = 3n + 2$.",
            "opts": [
                ("A", "$u_n = 5n$", False),
                ("B", "$u_n = 3n + 2$", True),
                ("C", "$u_n = 2n + 3$", False),
                ("D", "$u_n = n^2 + 4$", False),
            ],
        },
        # Q10
        {
            "n": 10, "crit": "A", "diff_level": "basic", "diff": "easy", "pts": 1,
            "topic": "Arithmetic series", "subtopic": "finite arithmetic series sum",
            "prompt": "An arithmetic series has $u_1 = 6$, $u_{20} = 63$ and $n = 20$ terms. Calculate $S_{20}$.",
            "doc_content": [para("An arithmetic series has $u_1 = 6$, $u_{20} = 63$ and $n = 20$ terms. Calculate $S_{20}$.")],
            "explanation": "$S_n = \\frac{n}{2}(u_1 + u_n)$. For $n = 20$: $S_{20} = \\frac{20}{2}(6 + 63) = 10(69) = 690$.",
            "opts": [
                ("A", "630", False),
                ("B", "1260", False),
                ("C", "1380", False),
                ("D", "690", True),
            ],
        },
        # Q11
        {
            "n": 11, "crit": "C", "diff_level": "intermediate", "diff": "medium", "pts": 1,
            "topic": "Formulas", "subtopic": "recursive to explicit conversion",
            "prompt": "Convert $u_1 = 12$, $u_{n+1} = u_n - 4$ ($n \\ge 1$) into an equivalent explicit formula.",
            "doc_content": [para("Convert $u_1 = 12$, $u_{n+1} = u_n - 4$ ($n \\ge 1$) into an equivalent explicit formula.")],
            "explanation": "The recurrence $u_{n+1} = u_n - 4$ with $u_1 = 12$ defines an arithmetic sequence with first term 12 and common difference $d = -4$. Explicit formula: $u_n = 12 + (n - 1)(-4) = 12 - 4n + 4 = 16 - 4n$.",
            "opts": [
                ("A", "$u_n = 16 - 4n$", True),
                ("B", "$u_n = 12 - 4n$", False),
                ("C", "$u_n = 12(-4)^{n-1}$", False),
                ("D", "$u_n = 4n + 8$", False),
            ],
        },
        # Q12
        {
            "n": 12, "crit": "C", "diff_level": "intermediate", "diff": "medium", "pts": 1,
            "topic": "Formulas", "subtopic": "complete recursive specification",
            "prompt": "Select the complete recursive specification for 5, 15, 45, 135, …",
            "doc_content": [para("Select the complete recursive specification for 5, 15, 45, 135, …")],
            "explanation": "A complete recursive specification must state both the initial term ($u_1 = 5$) and the relation to generate subsequent terms ($u_{n+1} = 3u_n$). Without $u_1$, the relation does not identify a unique sequence.",
            "opts": [
                ("A", "$u_n = 5(3)^{n-1}$", False),
                ("B", "$u_1 = 5, u_{n+1} = u_n + 10$", False),
                ("C", "$u_1 = 5, u_{n+1} = 3u_n$", True),
                ("D", "$u_{n+1} = 3u_n$ (no $u_1$)", False),
            ],
        },
        # Q13
        {
            "n": 13, "crit": "B", "diff_level": "intermediate", "diff": "medium", "pts": 1,
            "topic": "Quadratic sequences", "subtopic": "second difference and leading coefficient",
            "prompt": "The table shows a quadratic sequence $u_n = an^2 + bn + c$:\n\n[Figure: table]\nState the constant second difference and the value of $a$.",
            "doc_content": [
                para("The table shows a quadratic sequence $u_n = an^2 + bn + c$:"),
                table_block(["$n$", "1", "2", "3", "4"], [["$u_n$", "4", "13", "28", "49"]]),
                para("State the constant second difference and the value of $a$."),
            ],
            "explanation": "1st differences: 13−4 = 9, 28−13 = 15, 49−28 = 21. 2nd differences: 15−9 = 6, 21−15 = 6. The constant second difference is 6. In $u_n = an^2 + bn + c$, the second difference equals $2a$, so $2a = 6 \\implies a = 3$.",
            "opts": [
                ("A", "2nd diff = 6, $a = 6$", False),
                ("B", "2nd diff = 9, $a = 3$", False),
                ("C", "2nd diff = 3, $a = 6$", False),
                ("D", "2nd diff = 6, $a = 3$", True),
            ],
        },
        # Q14
        {
            "n": 14, "crit": "B", "diff_level": "intermediate", "diff": "medium", "pts": 1,
            "topic": "Quadratic sequences", "subtopic": "general term from terms",
            "prompt": "Find the general term $u_n$ of the quadratic sequence 2, 7, 14, 23, 34, …",
            "doc_content": [para("Find the general term $u_n$ of the quadratic sequence 2, 7, 14, 23, 34, …")],
            "explanation": "1st differences: 5, 7, 9, 11. 2nd difference: 2 $\\implies 2a = 2 \\implies a = 1$. Let $u_n = n^2 + bn + c$. For $n = 1$: $1 + b + c = 2 \\implies b + c = 1$. For $n = 2$: $4 + 2b + c = 7 \\implies 2b + c = 3$. Subtracting gives $b = 2$, which implies $c = -1$. Hence $u_n = n^2 + 2n - 1$.",
            "opts": [
                ("A", "$u_n = n^2 + 2n - 1$", True),
                ("B", "$u_n = 2n^2$", False),
                ("C", "$u_n = n^2 + 1$", False),
                ("D", "$u_n = n^2 + 5n - 4$", False),
            ],
        },
        # Q15
        {
            "n": 15, "crit": "A", "diff_level": "intermediate", "diff": "medium", "pts": 1,
            "topic": "Arithmetic sequences", "subtopic": "nth term from two given terms",
            "prompt": "In an arithmetic sequence, $u_4 = 17$ and $u_{10} = 41$. Calculate $u_{25}$.",
            "doc_content": [para("In an arithmetic sequence, $u_4 = 17$ and $u_{10} = 41$. Calculate $u_{25}$.")],
            "explanation": "$u_{10} - u_4 = 6d \\implies 41 - 17 = 24 \\implies d = 4$. $u_1 = u_4 - 3d = 17 - 12 = 5$. Then $u_{25} = u_1 + 24d = 5 + 24(4) = 5 + 96 = 101$.",
            "opts": [
                ("A", "97", False),
                ("B", "100", False),
                ("C", "101", True),
                ("D", "105", False),
            ],
        },
        # Q16
        {
            "n": 16, "crit": "A", "diff_level": "intermediate", "diff": "medium", "pts": 1,
            "topic": "Geometric sequences", "subtopic": "first term and ratio from two terms",
            "prompt": "A geometric sequence of positive terms has $u_2 = 12$ and $u_5 = 324$. Find $u_1$ and $r$.",
            "doc_content": [para("A geometric sequence of positive terms has $u_2 = 12$ and $u_5 = 324$. Find $u_1$ and $r$.")],
            "explanation": "$\\frac{u_5}{u_2} = r^3 = \\frac{324}{12} = 27 \\implies r = 3$ (since terms are positive). Then $u_1 = \\frac{u_2}{r} = \\frac{12}{3} = 4$.",
            "opts": [
                ("A", "$u_1 = 3, r = 4$", False),
                ("B", "$u_1 = 4, r = 3$", True),
                ("C", "$u_1 = 6, r = 2$", False),
                ("D", "$u_1 = 4, r = 9$", False),
            ],
        },
        # Q17
        {
            "n": 17, "crit": "D", "diff_level": "intermediate", "diff": "medium", "pts": 1,
            "topic": "Real-life arithmetic application", "subtopic": "brick wall series sum",
            "prompt": "A tapered wall has 35 bricks in Row 1, decreasing by 3 bricks per row up to 11 bricks in Row 9. Find the total bricks in all 9 rows.",
            "doc_content": [para("A tapered wall has 35 bricks in Row 1, decreasing by 3 bricks per row up to 11 bricks in Row 9. Find the total bricks in all 9 rows.")],
            "explanation": "Arithmetic series with $n = 9$ rows, $u_1 = 35$ and $u_9 = 11$. $S_9 = \\frac{9}{2}(u_1 + u_9) = \\frac{9}{2}(35 + 11) = \\frac{9}{2}(46) = 9 \\times 23 = 207$ bricks.",
            "opts": [
                ("A", "184", False),
                ("B", "198", False),
                ("C", "216", False),
                ("D", "207", True),
            ],
        },
        # Q18
        {
            "n": 18, "crit": "A", "diff_level": "intermediate", "diff": "medium", "pts": 1,
            "topic": "Geometric series", "subtopic": "finite geometric sum",
            "prompt": "Find the sum $S_7$ of the first 7 terms of the geometric series 3 + 6 + 12 + 24 + …",
            "doc_content": [para("Find the sum $S_7$ of the first 7 terms of the geometric series 3 + 6 + 12 + 24 + …")],
            "explanation": "$u_1 = 3, r = 2, n = 7$. $S_7 = \\frac{u_1(r^7 - 1)}{r - 1} = \\frac{3(2^7 - 1)}{2 - 1} = 3(128 - 1) = 3(127) = 381$.",
            "opts": [
                ("A", "192", False),
                ("B", "378", False),
                ("C", "381", True),
                ("D", "765", False),
            ],
        },
        # Q19
        {
            "n": 19, "crit": "D", "diff_level": "intermediate", "diff": "medium", "pts": 1,
            "topic": "Real-life arithmetic application", "subtopic": "solar array daily output",
            "prompt": "A solar array generates 18 kWh on Day 1 and increases by 2.5 kWh each day. On which day does daily output equal 53 kWh?",
            "doc_content": [para("A solar array generates 18 kWh on Day 1 and increases by 2.5 kWh each day. On which day does daily output equal 53 kWh?")],
            "explanation": "$u_1 = 18, d = 2.5$. $u_n = 18 + (n - 1)(2.5) = 53 \\implies (n - 1)(2.5) = 35 \\implies n - 1 = 14 \\implies n = 15$ (Day 15).",
            "opts": [
                ("A", "Day 14", False),
                ("B", "Day 15", True),
                ("C", "Day 16", False),
                ("D", "Day 21", False),
            ],
        },
        # Q20
        {
            "n": 20, "crit": "D", "diff_level": "intermediate", "diff": "medium", "pts": 1,
            "topic": "Real-life geometric application", "subtopic": "water filtration decay",
            "prompt": "Water enters a purifier at 500 mg/L. Each filter pass removes 20 % of remaining impurities ($u_1 = 400$ mg/L after 1 pass). Find $u_3$.",
            "doc_content": [para("Water enters a purifier at 500 mg/L. Each filter pass removes 20 % of remaining impurities ($u_1 = 400$ mg/L after 1 pass). Find $u_3$.")],
            "explanation": "Each pass retains 80% ($r = 0.8$). $u_1 = 400$ mg/L; $u_2 = 400 \\times 0.8 = 320$ mg/L; $u_3 = 320 \\times 0.8 = 256$ mg/L.",
            "opts": [
                ("A", "256 mg/L", True),
                ("B", "200 mg/L", False),
                ("C", "320 mg/L", False),
                ("D", "204.8 mg/L", False),
            ],
        },
        # Q21
        {
            "n": 21, "crit": "B", "diff_level": "advanced", "diff": "hard", "pts": 2,
            "topic": "Geometric sequences", "subtopic": "three consecutive terms with parameter",
            "prompt": "Consecutive terms $k - 1$, $k + 3$, $3k + 1$ form a geometric sequence with $r > 1$. Find $k$ and $r$.",
            "doc_content": [para("Consecutive terms $k - 1$, $k + 3$, $3k + 1$ form a geometric sequence with $r > 1$. Find $k$ and $r$.")],
            "explanation": "In a geometric sequence $(k + 3)^2 = (k - 1)(3k + 1) \\implies k^2 + 6k + 9 = 3k^2 - 2k - 1 \\implies 2k^2 - 8k - 10 = 0 \\implies k^2 - 4k - 5 = 0 \\implies (k - 5)(k + 1) = 0$. For $k = 5$, terms are 4, 8, 16 with $r = 2 > 1$. For $k = -1$, terms are −2, 2, −2 with $r = -1 \\ngtr 1$. Therefore $k = 5, r = 2$.",
            "opts": [
                ("A", "$k = -1, r = -1$", False),
                ("B", "$k = 3, r = 3$", False),
                ("C", "$k = 5, r = 2$", True),
                ("D", "$k = 5, r = 4$", False),
            ],
        },
        # Q22
        {
            "n": 22, "crit": "D", "diff_level": "advanced", "diff": "hard", "pts": 2,
            "topic": "Real-life arithmetic application", "subtopic": "amphitheatre seating capacity",
            "prompt": "An amphitheatre has 24 seats in Row 1, 28 in Row 2, 32 in Row 3, and so on. How many rows give a total capacity of 780 seats?",
            "doc_content": [para("An amphitheatre has 24 seats in Row 1, 28 in Row 2, 32 in Row 3, and so on. How many rows give a total capacity of 780 seats?")],
            "explanation": "$u_1 = 24, d = 4$. $S_n = \\frac{n}{2}[2(24) + (n - 1)(4)] = \\frac{n}{2}[4n + 44] = n(2n + 22) = 2n^2 + 22n = 780 \\implies n^2 + 11n - 390 = 0 \\implies (n - 15)(n + 26) = 0$. Since $n > 0$, $n = 15$ rows.",
            "opts": [
                ("A", "14", False),
                ("B", "15", True),
                ("C", "16", False),
                ("D", "18", False),
            ],
        },
        # Q23
        {
            "n": 23, "crit": "C", "diff_level": "advanced", "diff": "hard", "pts": 2,
            "topic": "Summation notation", "subtopic": "evaluating sigma geometric series",
            "prompt": "Evaluate the exact value of the finite geometric series $\\displaystyle\\sum_{k=1}^{6} 243\\left(\\frac{2}{3}\\right)^{k-1}$.",
            "doc_content": [para("Evaluate the exact value of the finite geometric series $\\displaystyle\\sum_{k=1}^{6} 243\\left(\\frac{2}{3}\\right)^{k-1}$.")],
            "explanation": "$u_1 = 243, r = \\frac{2}{3}, n = 6$. $S_6 = \\frac{243(1 - (2/3)^6)}{1 - 2/3} = \\frac{243(1 - 64/729)}{1/3} = 3 \\times 243 \\times \\frac{665}{729} = 729 \\times \\frac{665}{729} = 665$.",
            "opts": [
                ("A", "633", False),
                ("B", "729", False),
                ("C", "$\\frac{1330}{3}$", False),
                ("D", "665", True),
            ],
        },
        # Q24
        {
            "n": 24, "crit": "B", "diff_level": "advanced", "diff": "hard", "pts": 2,
            "topic": "Recursive rules & patterns", "subtopic": "affine recurrence to quadratic formula",
            "prompt": "A sequence satisfies $u_1 = 4$ and $u_{n+1} = u_n + 2n + 3$ for $n \\ge 1$. Which explicit quadratic formula defines $u_n$?",
            "doc_content": [para("A sequence satisfies $u_1 = 4$ and $u_{n+1} = u_n + 2n + 3$ for $n \\ge 1$. Which explicit quadratic formula defines $u_n$?")],
            "explanation": "$u_1 = 4$; $u_2 = 4 + 2(1) + 3 = 9$; $u_3 = 9 + 2(2) + 3 = 16$; $u_4 = 16 + 2(3) + 3 = 25$. These are the perfect squares $(n + 1)^2 = n^2 + 2n + 1$.",
            "opts": [
                ("A", "$u_n = n^2 + 2n + 1$", True),
                ("B", "$u_n = n^2 + 3$", False),
                ("C", "$u_n = 2n^2 + 2$", False),
                ("D", "$u_n = n^2 + 3n$", False),
            ],
        },
        # Q25
        {
            "n": 25, "crit": "D", "diff_level": "advanced", "diff": "hard", "pts": 2,
            "topic": "Financial mathematics", "subtopic": "comparing arithmetic and geometric savings",
            "prompt": "Plan A saves 10 000 FCFA in Month 1, adding 5 000 FCFA each month. Plan B saves 2 000 FCFA in Month 1, doubling each month. Compare 6-month totals ($S_6$).",
            "doc_content": [para("Plan A saves 10 000 FCFA in Month 1, adding 5 000 FCFA each month. Plan B saves 2 000 FCFA in Month 1, doubling each month. Compare 6-month totals ($S_6$).")],
            "explanation": "Plan A (arithmetic): $S_6 = \\frac{6}{2}[2(10\\,000) + 5(5\\,000)] = 3[20\\,000 + 25\\,000] = 3(45\\,000) = 135\\,000$ FCFA. Plan B (geometric): $S_6 = \\frac{2\\,000(2^6 - 1)}{2 - 1} = 2\\,000(63) = 126\\,000$ FCFA. $135\\,000 - 126\\,000 = 9\\,000$ FCFA. Plan A exceeds Plan B by 9 000 FCFA.",
            "opts": [
                ("A", "Plan B exceeds A by 9 000", False),
                ("B", "Equal at 135 000 FCFA", False),
                ("C", "Plan A exceeds B by 9 000", True),
                ("D", "Plan B exceeds A by 2 000", False),
            ],
        },
    ]

    for spec in part_a_specs:
        q_id = f"{ID_PREFIX}{1000 + spec['n']:012d}"
        cfg = {
            "question_number": spec["n"],
            "paper_section": "A",
            "myp_criterion": spec["crit"],
            "criterion_label": f"Criterion {spec['crit']} — " + {"A": "Knowing and understanding", "B": "Investigating patterns", "C": "Communicating", "D": "Applying mathematics in real-life contexts"}[spec["crit"]],
            "difficulty_level": spec["diff_level"],
            "marks": spec["pts"],
            "calculator": True,
            "source": SOURCE,
        }
        questions.append({
            "id": q_id,
            "n": spec["n"],
            "type": "single_choice",
            "prompt": spec["prompt"],
            "prompt_doc": {"type": "doc", "content": spec["doc_content"]},
            "explanation": spec["explanation"],
            "points": spec["pts"],
            "difficulty": spec["diff"],
            "topic": spec["topic"],
            "subtopic": spec["subtopic"],
            "config": cfg,
        })
        for pos, (lbl, text, is_corr) in enumerate(spec["opts"]):
            options.append({
                "question_id": q_id,
                "label": lbl,
                "is_correct": is_corr,
                "position": pos,
                "content_doc": {"type": "doc", "content": [para(text)]},
            })

    # =========================================================================
    # PART B (Q1–20, paper positions 26–45): Theory & Problem Solving
    # =========================================================================
    part_b_specs = [
        # Q26 (B1)
        {
            "pos": 26, "b_num": 1, "crit": "A", "diff_level": "basic", "diff": "easy",
            "title": "Explicit & recursive term generation",
            "topic": "Term generation", "subtopic": "evaluating explicit and recursive terms",
            "prompt": "Explicit & recursive term generation [3 marks]\n(a) Sequence A has explicit rule $u_n = 3n^2 - 2n + 4$. Calculate $u_1$, $u_3$ and $u_8$. [1]\n(b) Sequence B satisfies $v_1 = 6$ and $v_{n+1} = \\frac{1}{2}v_n + 5$ ($n \\ge 1$). Generate $v_2$, $v_3$ and $v_4$, showing each step. [2]",
            "doc_content": [
                para("**Explicit & recursive term generation** [3 marks]"),
                para("(a) Sequence A has explicit rule $u_n = 3n^2 - 2n + 4$. Calculate $u_1$, $u_3$ and $u_8$. [1]"),
                para("(b) Sequence B satisfies $v_1 = 6$ and $v_{n+1} = \\frac{1}{2}v_n + 5$ ($n \\ge 1$). Generate $v_2$, $v_3$ and $v_4$, showing each step. [2]"),
            ],
            "explanation": "(a) $u_1 = 3(1) - 2(1) + 4 = 5$; $u_3 = 3(9) - 2(3) + 4 = 25$; $u_8 = 3(64) - 2(8) + 4 = 180$.\n(b) $v_1 = 6$; $v_2 = \\frac{1}{2}(6) + 5 = 8$; $v_3 = \\frac{1}{2}(8) + 5 = 9$; $v_4 = \\frac{1}{2}(9) + 5 = 9.5$ (or $19/2$).",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Sequence A has explicit rule $u_n = 3n^2 - 2n + 4$. Calculate $u_1$, $u_3$ and $u_8$.",
                    "kind": "text", "points": 1, "strand": "A(iii)",
                    "placeholder": "u1 = 5, u3 = 25, u8 = 180",
                    "accepted": ["5, 25, 180", "u1 = 5, u3 = 25, u8 = 180", "u1=5, u3=25, u8=180", "5; 25; 180", "5,25,180"],
                    "hints": ["Substitute n = 1, n = 3 and n = 8 into 3n² − 2n + 4.", "For n = 1: 3(1) − 2(1) + 4 = 5. Do the same for n = 3 and n = 8."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Sequence B satisfies $v_1 = 6$ and $v_{n+1} = \\frac{1}{2}v_n + 5$ ($n \\ge 1$). Generate $v_2$, $v_3$ and $v_4$, showing each step.",
                    "kind": "text", "points": 2, "strand": "A(ii)",
                    "placeholder": "v2 = 8, v3 = 9, v4 = 9.5",
                    "accepted": ["8, 9, 9.5", "8, 9, 19/2", "v2 = 8, v3 = 9, v4 = 9.5", "v2=8, v3=9, v4=9.5", "v2 = 8, v3 = 9, v4 = 19/2", "8; 9; 9.5", "8; 9; 19/2"],
                    "hints": ["Substitute each term into the recursive rule to find the next.", "v2 = (1/2)(6) + 5 = 8; then use v2 to compute v3."],
                },
            ],
        },
        # Q27 (B2)
        {
            "pos": 27, "b_num": 2, "crit": "A", "diff_level": "basic", "diff": "easy",
            "title": "Linear sequence analysis",
            "topic": "Linear sequences", "subtopic": "deriving un and first negative term",
            "prompt": "Linear sequence analysis [3 marks]\nA linear sequence begins 46, 39, 32, 25, …\n(a) State $u_1$ and $d$, and derive the simplified explicit formula for $u_n$. [2]\n(b) Find which term equals −45, and state the value of the first negative term. [1]",
            "doc_content": [
                para("**Linear sequence analysis** [3 marks]"),
                para("A linear sequence begins 46, 39, 32, 25, …"),
                para("(a) State $u_1$ and $d$, and derive the simplified explicit formula for $u_n$. [2]"),
                para("(b) Find which term equals −45, and state the value of the first negative term. [1]"),
            ],
            "explanation": "(a) $u_1 = 46, d = 39 - 46 = -7$. Formula: $u_n = 46 + (n - 1)(-7) = 53 - 7n$.\n(b) $53 - 7n = -45 \\implies 7n = 98 \\implies n = 14$ ($14\\text{th}$ term). First negative term: $53 - 7n < 0 \\implies 7n > 53 \\implies n = 8$, so $u_8 = 53 - 56 = -3$.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "State $u_1$ and $d$, and derive the simplified explicit formula for $u_n$.",
                    "kind": "text", "points": 2, "strand": "A(i)",
                    "placeholder": "u1 = 46, d = -7, un = 53 - 7n",
                    "accepted": ["u1 = 46, d = -7, un = 53 - 7n", "u1 = 46, d = -7, un = -7n + 53", "46, -7, 53 - 7n", "46, -7, -7n + 53", "u1=46, d=-7, un=53-7n", "53 - 7n", "-7n + 53"],
                    "hints": ["Find the common difference by subtracting the first term from the second.", "u1 = 46 and d = 39 − 46 = −7. Then apply un = u1 + (n − 1)d."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Find which term equals −45, and state the value of the first negative term.",
                    "kind": "text", "points": 1, "strand": "A(iii)",
                    "placeholder": "n = 14, first negative term = -3",
                    "accepted": ["n = 14, -3", "n = 14, u8 = -3", "14th term, -3", "14, -3", "n=14, -3", "n = 14; -3", "14; -3"],
                    "hints": ["Set your un formula equal to −45 and solve for n.", "53 − 7n = −45 gives 7n = 98 so n = 14. For the first negative term, test n = 8."],
                },
            ],
        },
        # Q28 (B3)
        {
            "pos": 28, "b_num": 3, "crit": "A", "diff_level": "intermediate", "diff": "medium",
            "title": "Simultaneous arithmetic sequence & series",
            "topic": "Arithmetic sequences", "subtopic": "simultaneous equations and sum S20",
            "prompt": "Simultaneous arithmetic sequence & series [4 marks]\nAn arithmetic sequence has $u_5 = 23$ and $u_{12} = 58$.\n(a) Form and solve simultaneous equations to find $u_1$ and common difference $d$. [2]\n(b) Calculate the sum $S_{20}$ of the first 20 terms of the arithmetic series. [2]",
            "doc_content": [
                para("**Simultaneous arithmetic sequence & series** [4 marks]"),
                para("An arithmetic sequence has $u_5 = 23$ and $u_{12} = 58$."),
                para("(a) Form and solve simultaneous equations to find $u_1$ and common difference $d$. [2]"),
                para("(b) Calculate the sum $S_{20}$ of the first 20 terms of the arithmetic series. [2]"),
            ],
            "explanation": "(a) $u_5 = u_1 + 4d = 23$ and $u_{12} = u_1 + 11d = 58$. Subtracting gives $7d = 35 \\implies d = 5$. Then $u_1 + 4(5) = 23 \\implies u_1 = 3$.\n(b) $S_{20} = \\frac{20}{2}[2(3) + 19(5)] = 10[6 + 95] = 10(101) = 1010$.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Form and solve simultaneous equations to find $u_1$ and common difference $d$.",
                    "kind": "text", "points": 2, "strand": "A(ii)",
                    "placeholder": "u1 = 3, d = 5",
                    "accepted": ["u1 = 3, d = 5", "u1=3, d=5", "3, 5", "d = 5, u1 = 3", "3 and 5"],
                    "hints": ["Write u5 = u1 + 4d = 23 and u12 = u1 + 11d = 58.", "Subtract the two equations to eliminate u1: 7d = 35."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Calculate the sum $S_{20}$ of the first 20 terms of the arithmetic series.",
                    "kind": "numeric", "points": 2, "strand": "A(iii)",
                    "placeholder": "1010",
                    "answer": 1010, "tolerance": 0,
                    "hints": ["Use Sn = (n/2)(2u1 + (n − 1)d) with n = 20.", "S20 = (20/2)(2(3) + 19(5)) = 10(6 + 95)."],
                },
            ],
        },
        # Q29 (B4)
        {
            "pos": 29, "b_num": 4, "crit": "A", "diff_level": "intermediate", "diff": "medium",
            "title": "Alternating geometric sequence",
            "topic": "Geometric sequences", "subtopic": "alternating ratio and term testing",
            "prompt": "Alternating geometric sequence [4 marks]\nA geometric sequence has $u_2 = -24$ and $u_5 = 192$.\n(a) Determine the common ratio $r$, the first term $u_1$, and the explicit formula $u_n$. [2]\n(b) Calculate $u_8$ and justify algebraically whether −3072 is a term of this sequence. [2]",
            "doc_content": [
                para("**Alternating geometric sequence** [4 marks]"),
                para("A geometric sequence has $u_2 = -24$ and $u_5 = 192$."),
                para("(a) Determine the common ratio $r$, the first term $u_1$, and the explicit formula $u_n$. [2]"),
                para("(b) Calculate $u_8$ and justify algebraically whether −3072 is a term of this sequence. [2]"),
            ],
            "explanation": "(a) $r^3 = u_5 / u_2 = 192 / (-24) = -8 \\implies r = -2$. $u_1 = u_2 / r = -24 / (-2) = 12$. Formula: $u_n = 12(-2)^{n-1}$.\n(b) $u_8 = 12(-2)^7 = 12(-128) = -1536$. If $12(-2)^{n-1} = -3072 \\implies (-2)^{n-1} = -256$. But $(-2)^8 = +256$ and $(-2)^7 = -128$; no integer $n$ produces $-256$. Hence −3072 is NOT a term.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Determine the common ratio $r$, the first term $u_1$, and the explicit formula $u_n$.",
                    "kind": "text", "points": 2, "strand": "A(i)",
                    "placeholder": "r = -2, u1 = 12, un = 12(-2)^(n-1)",
                    "accepted": ["r = -2, u1 = 12, un = 12(-2)^(n-1)", "r = -2, u1 = 12, un = 12*(-2)^(n-1)", "-2, 12, 12(-2)^(n-1)", "r=-2, u1=12, un=12(-2)^(n-1)", "12(-2)^(n-1)"],
                    "hints": ["Divide u5 by u2 to find r³: 192 / (−24) = −8.", "r³ = −8 gives r = −2. Then u1 = u2 / r = −24 / (−2) = 12."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Calculate $u_8$ and justify algebraically whether −3072 is a term of this sequence.",
                    "kind": "text", "points": 2, "strand": "A(iii)",
                    "placeholder": "u8 = -1536, No",
                    "accepted": ["-1536, No", "u8 = -1536, No", "-1536; No", "-1536, not a term", "-1536, No (-2)^(n-1) = -256 has no integer solution"],
                    "keywords": [["-1536"], ["no", "not a term"], ["256", "power", "odd", "even"]],
                    "minKeywordGroups": 2,
                    "hints": ["Calculate u8 = 12(−2)⁷.", "12(−2)⁷ = −1536. Set 12(−2)^(n−1) = −3072, giving (−2)^(n−1) = −256, but (−2)⁸ = +256."],
                },
            ],
        },
        # Q30 (B5)
        {
            "pos": 30, "b_num": 5, "crit": "A", "diff_level": "intermediate", "diff": "medium",
            "title": "Quadratic sequence from differences",
            "topic": "Quadratic sequences", "subtopic": "constructing differences and solving for n",
            "prompt": "Quadratic sequence from differences [4 marks]\nThe first five terms of a quadratic sequence $u_n = an^2 + bn + c$ are tabulated below:\n\n[Figure: table]\n(a) Construct first and second differences to find $a$, $b$ and $c$, stating $u_n$. [2]\n(b) Calculate $u_{12}$ and solve for the term number $n$ where $u_n = 193$. [2]",
            "doc_content": [
                para("**Quadratic sequence from differences** [4 marks]"),
                para("The first five terms of a quadratic sequence $u_n = an^2 + bn + c$ are tabulated below:"),
                table_block(["Term $n$", "1", "2", "3", "4", "5"], [["Value $u_n$", "4", "9", "18", "31", "48"]]),
                para("(a) Construct first and second differences to find $a$, $b$ and $c$, stating $u_n$. [2]"),
                para("(b) Calculate $u_{12}$ and solve for the term number $n$ where $u_n = 193$. [2]"),
            ],
            "explanation": "(a) 1st diff: 5, 9, 13, 17. 2nd diff: 4 $\\implies 2a = 4 \\implies a = 2$. $u_1 = 2 + b + c = 4 \\implies b + c = 2$. $u_2 = 8 + 2b + c = 9 \\implies 2b + c = 1$. Subtracting gives $b = -1$, then $c = 3$. Hence $u_n = 2n^2 - n + 3$.\n(b) $u_{12} = 2(144) - 12 + 3 = 288 - 9 = 279$. $2n^2 - n + 3 = 193 \\implies 2n^2 - n - 190 = 0 \\implies (2n + 19)(n - 10) = 0 \\implies n = 10$.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Construct first and second differences to find $a$, $b$ and $c$, stating $u_n$.",
                    "kind": "text", "points": 2, "strand": "A(i)",
                    "placeholder": "a = 2, b = -1, c = 3, un = 2n^2 - n + 3",
                    "accepted": ["a = 2, b = -1, c = 3, un = 2n^2 - n + 3", "2n^2 - n + 3", "un = 2n^2 - n + 3", "a = 2, b = -1, c = 3", "2, -1, 3, 2n^2 - n + 3"],
                    "hints": ["Find the second difference to determine 2a.", "First differences are 5, 9, 13, 17; second difference is 4, so 2a = 4 and a = 2."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Calculate $u_{12}$ and solve for the term number $n$ where $u_n = 193$.",
                    "kind": "text", "points": 2, "strand": "A(iii)",
                    "placeholder": "u12 = 279, n = 10",
                    "accepted": ["u12 = 279, n = 10", "279, 10", "u12=279, n=10", "279 and 10", "279; 10", "u12 = 279; n = 10"],
                    "hints": ["Substitute n = 12 into 2n² − n + 3.", "Set 2n² − n + 3 = 193, rearrange to 2n² − n − 190 = 0 and factorise."],
                },
            ],
        },
        # Q31 (B6)
        {
            "pos": 31, "b_num": 6, "crit": "A", "diff_level": "intermediate", "diff": "medium",
            "title": "Evaluating finite series",
            "topic": "Series evaluation", "subtopic": "number of terms and exact sums",
            "prompt": "Evaluating finite series [4 marks]\nFind the number of terms $n$ and evaluate the exact sum $S_n$ of each finite series:\n(a) Arithmetic series: 5 + 11 + 17 + … + 119. [2]\n(b) Finite geometric series: 320 + 160 + 80 + … + 5. [2]",
            "doc_content": [
                para("**Evaluating finite series** [4 marks]"),
                para("Find the number of terms $n$ and evaluate the exact sum $S_n$ of each finite series:"),
                para("(a) Arithmetic series: 5 + 11 + 17 + … + 119. [2]"),
                para("(b) Finite geometric series: 320 + 160 + 80 + … + 5. [2]"),
            ],
            "explanation": "(a) $u_1 = 5, d = 6$. $5 + 6(n - 1) = 119 \\implies 6(n - 1) = 114 \\implies n = 20$. $S_{20} = \\frac{20}{2}(5 + 119) = 10(124) = 1240$.\n(b) $u_1 = 320, r = 0.5$. $320(0.5)^{n-1} = 5 \\implies (0.5)^{n-1} = 1/64 = (0.5)^6 \\implies n = 7$. $S_7 = \\frac{320(1 - (1/2)^7)}{1 - 1/2} = 640(127/128) = 5 \\times 127 = 635$.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Arithmetic series: 5 + 11 + 17 + … + 119.",
                    "kind": "text", "points": 2, "strand": "A(iii)",
                    "placeholder": "n = 20, S20 = 1240",
                    "accepted": ["n = 20, S20 = 1240", "n = 20, Sn = 1240", "20, 1240", "n=20, S=1240", "20; 1240"],
                    "hints": ["Find n using un = u1 + (n − 1)d with un = 119, u1 = 5, d = 6.", "5 + 6(n − 1) = 119 gives n = 20. Then Sn = (20/2)(5 + 119)."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Finite geometric series: 320 + 160 + 80 + … + 5.",
                    "kind": "text", "points": 2, "strand": "A(iii)",
                    "placeholder": "n = 7, S7 = 635",
                    "accepted": ["n = 7, S7 = 635", "n = 7, Sn = 635", "7, 635", "n=7, S=635", "7; 635"],
                    "hints": ["Find n using un = u1 r^(n−1) with u1 = 320 and r = 0.5.", "320(0.5)^(n−1) = 5 gives (0.5)^(n−1) = 1/64 = (0.5)⁶, so n = 7. Then sum = 635."],
                },
            ],
        },
        # Q32 (B7)
        {
            "pos": 32, "b_num": 7, "crit": "B", "diff_level": "intermediate", "diff": "medium",
            "title": "Courtyard tile pattern",
            "topic": "Pattern investigation", "subtopic": "grid tiles and algebraic verification",
            "prompt": "Courtyard tile pattern [4 marks]\nStage $n$ is an $(n + 1) \\times (n + 2)$ grid of green core tiles ($C_n$) and pale L-border tiles ($B_n$).\n\n[Figure: Courtyard tile pattern]\n\n[Figure: table]\n(a) Find $B_4$, $C_4$ and $T_4$ for Stage 4. [1]\n(b) Classify $B_n$ and $T_n$ using differences and derive explicit rules in $n$. [2]\n(c) Verify $C_n + B_n = T_n$ algebraically and find $n$ when $T_n = 210$. [1]",
            "doc_content": [
                para("**Courtyard tile pattern** [4 marks]"),
                para("Stage $n$ is an $(n + 1) \\times (n + 2)$ grid of green core tiles ($C_n$) and pale L-border tiles ($B_n$)."),
                image_block("/exam-figures/myp5-sequences-2026/q07-courtyard.png", "Courtyard tile pattern: Stage 1 (2x3), Stage 2 (3x4), Stage 3 (4x5)", "Courtyard tile pattern", 60),
                table_block(["Stage $n$", "1", "2", "3", "4"], [["Border $B_n$ / Core $C_n$ / Total $T_n$", "4 / 2 / 6", "6 / 6 / 12", "8 / 12 / 20", "? / ? / ?"]]),
                para("(a) Find $B_4$, $C_4$ and $T_4$ for Stage 4. [1]"),
                para("(b) Classify $B_n$ and $T_n$ using differences and derive explicit rules in $n$. [2]"),
                para("(c) Verify $C_n + B_n = T_n$ algebraically and find $n$ when $T_n = 210$. [1]"),
            ],
            "explanation": "(a) $B_n$ increases by 2: $B_4 = 10$. Total grid is $5 \\times 6 = 30$, so $T_4 = 30$, and $C_4 = T_4 - B_4 = 30 - 10 = 20$.\n(b) $B_n$ has constant 1st difference 2 $\\implies$ linear: $B_n = 2n + 2$. $T_n$ has constant 2nd difference 2 $\\implies$ quadratic: $T_n = (n + 1)(n + 2) = n^2 + 3n + 2$.\n(c) $C_n = n(n + 1) = n^2 + n$. $C_n + B_n = (n^2 + n) + (2n + 2) = n^2 + 3n + 2 = T_n$ (verified). $n^2 + 3n + 2 = 210 \\implies n^2 + 3n - 208 = 0 \\implies (n - 13)(n + 16) = 0 \\implies n = 13$.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Find $B_4$, $C_4$ and $T_4$ for Stage 4.",
                    "kind": "text", "points": 1, "strand": "B(i)",
                    "placeholder": "B4 = 10, C4 = 20, T4 = 30",
                    "accepted": ["B4 = 10, C4 = 20, T4 = 30", "10, 20, 30", "10 / 20 / 30", "B4=10, C4=20, T4=30", "10; 20; 30"],
                    "hints": ["Look at the progression of border, core and total tiles.", "Border adds 2 each stage: 4, 6, 8, 10. Total grid is 5 × 6 = 30, so core is 30 − 10 = 20."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Classify $B_n$ and $T_n$ using differences and derive explicit rules in $n$.",
                    "kind": "text", "points": 2, "strand": "B(ii)",
                    "placeholder": "Bn is linear: Bn = 2n + 2; Tn is quadratic: Tn = n^2 + 3n + 2",
                    "accepted": ["Bn = 2n + 2, Tn = n^2 + 3n + 2", "Bn = 2n + 2, Tn = (n+1)(n+2)", "Bn: linear, 2n + 2; Tn: quadratic, n^2 + 3n + 2", "2n + 2, n^2 + 3n + 2"],
                    "keywords": [["linear", "arithmetic"], ["quadratic"], ["2n + 2", "2(n + 1)", "2n+2"], ["n^2 + 3n + 2", "(n + 1)(n + 2)", "n²+3n+2"]],
                    "minKeywordGroups": 2,
                    "hints": ["Find the first and second differences for both sequences.", "Bn has constant 1st difference 2 (linear, Bn = 2n + 2); Tn has constant 2nd difference 2 (quadratic, Tn = (n+1)(n+2))."],
                },
                {
                    "id": "c", "label": "(c)", "prompt": "Verify $C_n + B_n = T_n$ algebraically and find $n$ when $T_n = 210$.",
                    "kind": "text", "points": 1, "strand": "B(iii)",
                    "placeholder": "Cn + Bn = n^2 + n + 2n + 2 = n^2 + 3n + 2; n = 13",
                    "accepted": ["n = 13", "13", "Cn + Bn = n^2 + n + 2n + 2 = n^2 + 3n + 2, n = 13", "n=13"],
                    "keywords": [["13"], ["verified", "algebraically", "n^2 + 3n + 2", "(n+1)(n+2)"]],
                    "minKeywordGroups": 1,
                    "hints": ["Substitute Cn = n(n+1) and Bn = 2n+2 into Cn + Bn.", "Solve n² + 3n + 2 = 210, so n² + 3n − 208 = 0 gives (n − 13)(n + 16) = 0."],
                },
            ],
        },
        # Q33 (B8)
        {
            "pos": 33, "b_num": 8, "crit": "B", "diff_level": "intermediate", "diff": "medium",
            "title": "Recovering a sequence from partial sums",
            "topic": "Partial sums", "subtopic": "recovering terms and proving arithmetic property",
            "prompt": "Recovering a sequence from partial sums [4 marks]\nA sequence has partial sums $S_n = 3n^2 + 4n$ for all $n \\ge 1$.\n(a) Compute $S_1, S_2, S_3, S_4$ and deduce individual terms $u_1, u_2, u_3, u_4$. [2]\n(b) Using $u_n = S_n - S_{n-1}$ ($n \\ge 2$), prove algebraically that $\\{u_n\\}$ is arithmetic and state $u_n$ and $d$. [2]",
            "doc_content": [
                para("**Recovering a sequence from partial sums** [4 marks]"),
                para("A sequence has partial sums $S_n = 3n^2 + 4n$ for all $n \\ge 1$."),
                para("(a) Compute $S_1, S_2, S_3, S_4$ and deduce individual terms $u_1, u_2, u_3, u_4$. [2]"),
                para("(b) Using $u_n = S_n - S_{n-1}$ ($n \\ge 2$), prove algebraically that $\\{u_n\\}$ is arithmetic and state $u_n$ and $d$. [2]"),
            ],
            "explanation": "(a) $S_1 = 7 \\implies u_1 = 7$; $S_2 = 20 \\implies u_2 = 20 - 7 = 13$; $S_3 = 39 \\implies u_3 = 39 - 20 = 19$; $S_4 = 64 \\implies u_4 = 64 - 39 = 25$.\n(b) $u_n = (3n^2 + 4n) - [3(n - 1)^2 + 4(n - 1)] = 3n^2 + 4n - [3n^2 - 2n - 1] = 6n + 1$. The difference $u_{n+1} - u_n = [6(n + 1) + 1] - [6n + 1] = 6$ is constant, proving $\\{u_n\\}$ is arithmetic with $d = 6$.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Compute $S_1, S_2, S_3, S_4$ and deduce individual terms $u_1, u_2, u_3, u_4$.",
                    "kind": "text", "points": 2, "strand": "B(i)",
                    "placeholder": "S: 7, 20, 39, 64; u: 7, 13, 19, 25",
                    "accepted": ["S: 7, 20, 39, 64; u: 7, 13, 19, 25", "S = 7, 20, 39, 64; u = 7, 13, 19, 25", "u1 = 7, u2 = 13, u3 = 19, u4 = 25", "7, 13, 19, 25", "7, 20, 39, 64 and 7, 13, 19, 25"],
                    "hints": ["Calculate Sn using 3n² + 4n for n = 1, 2, 3, 4.", "u1 = S1 = 7, u2 = S2 − S1 = 20 − 7 = 13, u3 = 39 − 20 = 19, u4 = 64 − 39 = 25."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Using $u_n = S_n - S_{n-1}$ ($n \\ge 2$), prove algebraically that $\\{u_n\\}$ is arithmetic and state $u_n$ and $d$.",
                    "kind": "text", "points": 2, "strand": "B(ii)",
                    "placeholder": "un = 6n + 1, d = 6",
                    "accepted": ["un = 6n + 1, d = 6", "un = 6n + 1 and d = 6", "6n + 1, 6", "un=6n+1, d=6"],
                    "keywords": [["6n + 1", "6n+1"], ["d = 6", "6", "difference = 6", "constant difference"]],
                    "minKeywordGroups": 2,
                    "hints": ["Expand Sn − Sn−1: (3n² + 4n) − [3(n−1)² + 4(n−1)].", "Simplifying yields un = 6n + 1. The difference un+1 − un = 6 is constant, proving it is arithmetic."],
                },
            ],
        },
        # Q34 (B9)
        {
            "pos": 34, "b_num": 9, "crit": "B", "diff_level": "advanced", "diff": "hard",
            "title": "Affine recursive investigation",
            "topic": "Recursive rules", "subtopic": "affine recurrence, geometric differences and substitution",
            "prompt": "Affine recursive investigation [4 marks]\nInvestigate the recursive relationship: $u_1 = 5 \\to u_{n+1} = 3u_n - 4$ (for $n \\ge 1$)\n(a) Find $u_2, u_3, u_4$ and show the first differences $\\Delta u_n = u_{n+1} - u_n$ form a geometric sequence. [2]\n(b) Let $v_n = u_n - 2$. Prove $v_{n+1} = 3v_n$ and deduce the explicit formula for $u_n$. [2]",
            "doc_content": [
                para("**Affine recursive investigation** [4 marks]"),
                para("Investigate the recursive relationship: $u_1 = 5 \\to u_{n+1} = 3u_n - 4$ (for $n \\ge 1$)"),
                para("(a) Find $u_2, u_3, u_4$ and show the first differences $\\Delta u_n = u_{n+1} - u_n$ form a geometric sequence. [2]"),
                para("(b) Let $v_n = u_n - 2$. Prove $v_{n+1} = 3v_n$ and deduce the explicit formula for $u_n$. [2]"),
            ],
            "explanation": "(a) $u_1 = 5$; $u_2 = 3(5) - 4 = 11$; $u_3 = 3(11) - 4 = 29$; $u_4 = 3(29) - 4 = 83$. Differences: $\\Delta u_1 = 6, \\Delta u_2 = 18, \\Delta u_3 = 54$. Constant ratio $18/6 = 54/18 = 3 \\implies$ geometric sequence with $r = 3$.\n(b) $v_{n+1} = u_{n+1} - 2 = (3u_n - 4) - 2 = 3u_n - 6 = 3(u_n - 2) = 3v_n$. Since $v_1 = 5 - 2 = 3$, $v_n = 3 \\times 3^{n-1} = 3^n$. Thus $u_n = v_n + 2 = 3^n + 2$.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Find $u_2, u_3, u_4$ and show the first differences $\\Delta u_n = u_{n+1} - u_n$ form a geometric sequence.",
                    "kind": "text", "points": 2, "strand": "B(i)",
                    "placeholder": "u2 = 11, u3 = 29, u4 = 83; differences: 6, 18, 54 (r = 3)",
                    "accepted": ["u2 = 11, u3 = 29, u4 = 83", "11, 29, 83; 6, 18, 54", "11, 29, 83", "u2=11, u3=29, u4=83", "6, 18, 54 with r = 3"],
                    "keywords": [["11"], ["29"], ["83"], ["6, 18, 54", "6", "18", "54", "r = 3", "ratio 3"]],
                    "minKeywordGroups": 3,
                    "hints": ["Use un+1 = 3un − 4 repeatedly starting from u1 = 5.", "u2 = 11, u3 = 29, u4 = 83. Differences are 11−5=6, 29−11=18, 83−29=54 (multiplied by 3)."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Let $v_n = u_n - 2$. Prove $v_{n+1} = 3v_n$ and deduce the explicit formula for $u_n$.",
                    "kind": "text", "points": 2, "strand": "B(ii)",
                    "placeholder": "vn+1 = 3vn, un = 3^n + 2",
                    "accepted": ["un = 3^n + 2", "3^n + 2", "un = 3^(n) + 2", "un=3^n+2"],
                    "keywords": [["3^n + 2", "3^n+2", "3^(n) + 2"], ["vn+1 = 3vn", "3(un - 2)", "3vn"]],
                    "minKeywordGroups": 1,
                    "hints": ["Substitute un+1 = 3un − 4 into vn+1 = un+1 − 2.", "vn+1 = 3un − 6 = 3(un − 2) = 3vn. Since v1 = 3, vn = 3^n, giving un = 3^n + 2."],
                },
            ],
        },
        # Q35 (B10)
        {
            "pos": 35, "b_num": 10, "crit": "B", "diff_level": "advanced", "diff": "hard",
            "title": "Arithmetic vs geometric growth",
            "topic": "Comparative growth", "subtopic": "comparing arithmetic and geometric growth rates",
            "prompt": "Arithmetic vs geometric growth [4 marks]\nArithmetic sequence $P_n$ and geometric sequence $Q_n$ share first two terms $P_1 = Q_1 = 8$ and $P_2 = Q_2 = 12$.\n(a) Write explicit and recursive formulae (with initial terms) for $P_n$ and $Q_n$. [2]\n(b) Tabulate $n = 1..5$, evaluate $(Q_5 - P_5) / P_5$, and explain why $Q_n > P_n$ for all $n \\ge 3$. [2]",
            "doc_content": [
                para("**Arithmetic vs geometric growth** [4 marks]"),
                para("Arithmetic sequence $P_n$ and geometric sequence $Q_n$ share first two terms $P_1 = Q_1 = 8$ and $P_2 = Q_2 = 12$."),
                para("(a) Write explicit and recursive formulae (with initial terms) for $P_n$ and $Q_n$. [2]"),
                para("(b) Tabulate $n = 1..5$, evaluate $(Q_5 - P_5) / P_5$, and explain why $Q_n > P_n$ for all $n \\ge 3$. [2]"),
            ],
            "explanation": "(a) $P_n$: $P_1 = 8, d = 4 \\implies P_n = 4n + 4$, recursive $P_1 = 8, P_{n+1} = P_n + 4$. $Q_n$: $Q_1 = 8, r = 1.5 \\implies Q_n = 8(1.5)^{n-1}$, recursive $Q_1 = 8, Q_{n+1} = 1.5Q_n$.\n(b) Table: $P = [8, 12, 16, 20, 24]$, $Q = [8, 12, 18, 27, 40.5]$. $(Q_5 - P_5)/P_5 = (40.5 - 24)/24 = 16.5/24 = 0.6875$ (68.75%). For $n \\ge 2$, $Q_{n+1} - Q_n = 0.5 Q_n \\ge 0.5(12) = 6 > 4 = P_{n+1} - P_n$, so the geometric step strictly exceeds the arithmetic step for all $n \\ge 2$, ensuring $Q_n > P_n$ for all $n \\ge 3$.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Write explicit and recursive formulae (with initial terms) for $P_n$ and $Q_n$.",
                    "kind": "text", "points": 2, "strand": "B(ii)",
                    "placeholder": "Pn = 4n + 4, Qn = 8(1.5)^(n-1)",
                    "accepted": ["Pn = 4n + 4, Qn = 8(1.5)^(n-1)", "Pn = 4n + 4, Qn = 8(3/2)^(n-1)", "Pn = 4n + 4, P1 = 8, Pn+1 = Pn + 4; Qn = 8(1.5)^(n-1), Q1 = 8, Qn+1 = 1.5Qn"],
                    "keywords": [["4n + 4", "4n+4"], ["8(1.5)", "8(3/2)", "1.5^(n-1)", "(3/2)^(n-1)"]],
                    "minKeywordGroups": 2,
                    "hints": ["P is arithmetic with d = 12 − 8 = 4; Q is geometric with r = 12/8 = 1.5.", "Explicit: Pn = 8 + 4(n−1) = 4n + 4; Qn = 8(1.5)^(n−1)."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Tabulate $n = 1..5$, evaluate $(Q_5 - P_5) / P_5$, and explain why $Q_n > P_n$ for all $n \\ge 3$.",
                    "kind": "text", "points": 2, "strand": "B(iii)",
                    "placeholder": "(Q5 - P5)/P5 = 0.6875 (11/16)",
                    "accepted": ["0.6875", "11/16", "68.75%", "0.688", "(40.5 - 24)/24 = 0.6875"],
                    "keywords": [["0.6875", "11/16", "68.75%", "0.688", "16.5/24"], ["geometric", "multiplies", "compounds", "growth rate", "exceeds"]],
                    "minKeywordGroups": 1,
                    "hints": ["Compute P5 = 24 and Q5 = 40.5.", "(40.5 − 24)/24 = 16.5/24 = 0.6875 (68.75%). Multiplicative growth outpaces constant additive growth (+4)."],
                },
            ],
        },
        # Q36 (B11)
        {
            "pos": 36, "b_num": 11, "crit": "C", "diff_level": "basic", "diff": "easy",
            "title": "Sequence vs series & summation notation",
            "topic": "Notation & definitions", "subtopic": "geometric sequence vs series and sigma notation",
            "prompt": "Sequence vs series & summation notation [3 marks]\n(a) Explain clearly, giving one symbolic example of each, the difference between a geometric sequence and a finite geometric series. [2]\n(b) Write $9 + 13 + 17 + \\dots + 45$ in sigma ($\\Sigma$) notation, showing how the upper limit is found. [1]",
            "doc_content": [
                para("**Sequence vs series & summation notation** [3 marks]"),
                para("(a) Explain clearly, giving one symbolic example of each, the difference between a geometric sequence and a finite geometric series. [2]"),
                para("(b) Write $9 + 13 + 17 + \\dots + 45$ in sigma ($\\Sigma$) notation, showing how the upper limit is found. [1]"),
            ],
            "explanation": "(a) A geometric sequence is an ordered list of terms with a constant ratio between consecutive terms, separated by commas (e.g. $3, 6, 12, 24$). A finite geometric series is the indicated sum of those terms, connected by addition (e.g. $3 + 6 + 12 + 24$).\n(b) Arithmetic series with $u_1 = 9, d = 4$. $u_k = 9 + 4(k - 1) = 4k + 5$. Solving $4n + 5 = 45 \\implies 4n = 40 \\implies n = 10$. In sigma notation: $\\sum_{k=1}^{10} (4k + 5)$.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Explain clearly, giving one symbolic example of each, the difference between a geometric sequence and a finite geometric series.",
                    "kind": "text", "points": 2, "strand": "C(i)",
                    "placeholder": "A sequence is an ordered list; a series is the sum of terms",
                    "accepted": ["Sequence is an ordered list separated by commas; series is the sum of the terms joined by addition", "A sequence is a list, a series is a sum"],
                    "keywords": [["sequence", "list", "ordered"], ["series", "sum", "addition"], ["example", "+", ",", "ar^n", "3, 6, 12"]],
                    "minKeywordGroups": 2,
                    "hints": ["A sequence is a list of terms; a series is the sum of those terms.", "Give an example with commas for sequence (e.g. 2, 4, 8) and with plus signs for series (e.g. 2 + 4 + 8)."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Write $9 + 13 + 17 + \\dots + 45$ in sigma ($\\Sigma$) notation, showing how the upper limit is found.",
                    "kind": "text", "points": 1, "strand": "C(ii)",
                    "placeholder": "sum_{k=1}^{10} (4k + 5)",
                    "accepted": ["sum_{k=1}^{10} (4k + 5)", "\\sum_{k=1}^{10} (4k + 5)", "sum_{k=1}^{10} (4k+5)", "sum_{i=1}^{10} (4i + 5)", "\\sum_{k=1}^{10} (9 + 4(k-1))", "sum from k=1 to 10 of (4k + 5)"],
                    "keywords": [["10", "k=10", "n=10", "upper limit"], ["4k + 5", "4k+5", "4n+5", "4i+5", "9 + 4(k-1)"]],
                    "minKeywordGroups": 2,
                    "hints": ["Identify uk = 4k + 5 (or 9 + 4(k−1)) and solve uk = 45 for the upper limit.", "4k + 5 = 45 gives 4k = 40 so k = 10. Write as Σ from k=1 to 10 of (4k + 5)."],
                },
            ],
        },
        # Q37 (B12)
        {
            "pos": 37, "b_num": 12, "crit": "C", "diff_level": "basic", "diff": "easy",
            "title": "Communicating explicit & recursive rules",
            "topic": "Notation & definitions", "subtopic": "recursive definition, explicit formula, and initial condition necessity",
            "prompt": "Communicating explicit & recursive rules [3 marks]\nConsider −5, −1, 3, 7, 11, …\n(a) Write both a complete recursive definition and a simplified explicit formula using proper subscript notation. [2]\n(b) Explain why writing $u_{n+1} = u_n + 4$ without $u_1$ fails to define a unique sequence. [1]",
            "doc_content": [
                para("**Communicating explicit & recursive rules** [3 marks]"),
                para("Consider −5, −1, 3, 7, 11, …"),
                para("(a) Write both a complete recursive definition and a simplified explicit formula using proper subscript notation. [2]"),
                para("(b) Explain why writing $u_{n+1} = u_n + 4$ without $u_1$ fails to define a unique sequence. [1]"),
            ],
            "explanation": "(a) Recursive: $u_1 = -5, u_{n+1} = u_n + 4$ for $n \\ge 1$. Explicit: $u_n = -5 + 4(n - 1) = 4n - 9$.\n(b) $u_{n+1} = u_n + 4$ defines only the step (+4) between consecutive terms. Without an initial term $u_1$, there is no anchor, so infinitely many different sequences satisfy this recurrence.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Write both a complete recursive definition and a simplified explicit formula using proper subscript notation.",
                    "kind": "text", "points": 2, "strand": "C(ii)",
                    "placeholder": "Recursive: u1 = -5, un+1 = un + 4; Explicit: un = 4n - 9",
                    "accepted": ["Recursive: u1 = -5, un+1 = un + 4; Explicit: un = 4n - 9", "u1 = -5, un+1 = un + 4 and un = 4n - 9", "u1 = -5, un+1 = un + 4; un = 4n - 9", "un = 4n - 9; u1 = -5, un+1 = un + 4"],
                    "keywords": [["u1 = -5", "u1=-5", "-5"], ["un+1 = un + 4", "un+1=un+4"], ["4n - 9", "4n-9"]],
                    "minKeywordGroups": 2,
                    "hints": ["Identify first term u1 = −5 and common difference d = 4.", "Recursive requires both u1 = −5 and un+1 = un + 4. Explicit is un = −5 + 4(n−1) = 4n − 9."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Explain why writing $u_{n+1} = u_n + 4$ without $u_1$ fails to define a unique sequence.",
                    "kind": "text", "points": 1, "strand": "C(i)",
                    "placeholder": "Without u1 there is no starting point; infinitely many sequences add 4",
                    "accepted": ["Without u1 there is no starting term, so infinitely many sequences satisfy the rule", "It lacks an initial condition to anchor the sequence"],
                    "keywords": [["starting", "initial", "u1", "anchor", "first term"], ["unique", "infinite", "many", "different", "not fix"]],
                    "minKeywordGroups": 2,
                    "hints": ["Consider what happens if you start at 0 versus starting at 10.", "A step rule (+4) alone does not fix where the sequence begins; infinitely many sequences share this recurrence."],
                },
            ],
        },
        # Q38 (B13)
        {
            "pos": 38, "b_num": 13, "crit": "C", "diff_level": "intermediate", "diff": "medium",
            "title": "Proving the constant second-difference property",
            "topic": "Algebraic proof", "subtopic": "first difference and second difference of quadratic sequence",
            "prompt": "Proving the constant second-difference property [3 marks]\nLet $u_n = an^2 + bn + c$ ($a \\ne 0$).\n(a) Expand and simplify the first difference $u_{n+1} - u_n$ in terms of $a$, $b$ and $n$. [2]\n(b) Hence prove $(u_{n+2} - u_{n+1}) - (u_{n+1} - u_n) = 2a$ and explain why it is constant. [1]",
            "doc_content": [
                para("**Proving the constant second-difference property** [3 marks]"),
                para("Let $u_n = an^2 + bn + c$ ($a \\ne 0$)."),
                para("(a) Expand and simplify the first difference $u_{n+1} - u_n$ in terms of $a$, $b$ and $n$. [2]"),
                para("(b) Hence prove $(u_{n+2} - u_{n+1}) - (u_{n+1} - u_n) = 2a$ and explain why it is constant. [1]"),
            ],
            "explanation": "(a) $u_{n+1} - u_n = [a(n + 1)^2 + b(n + 1) + c] - [an^2 + bn + c] = [an^2 + 2an + a + bn + b + c] - [an^2 + bn + c] = 2an + a + b$.\n(b) Let $D_n = 2an + a + b$. Then $D_{n+1} = 2a(n + 1) + a + b = 2an + 3a + b$. The second difference is $D_{n+1} - D_n = (2an + 3a + b) - (2an + a + b) = 2a$. This result contains no $n$, meaning it is independent of the term index $n$ and therefore strictly constant.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Expand and simplify the first difference $u_{n+1} - u_n$ in terms of $a$, $b$ and $n$.",
                    "kind": "text", "points": 2, "strand": "C(ii)",
                    "placeholder": "2an + a + b",
                    "accepted": ["2an + a + b", "2an + b + a", "2an+a+b", "un+1 - un = 2an + a + b"],
                    "hints": ["Expand a(n+1)² + b(n+1) + c and subtract an² + bn + c.", "a(n² + 2n + 1) + bn + b + c − (an² + bn + c) = 2an + a + b."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Hence prove $(u_{n+2} - u_{n+1}) - (u_{n+1} - u_n) = 2a$ and explain why it is constant.",
                    "kind": "text", "points": 1, "strand": "C(iii)",
                    "placeholder": "Second difference = 2a, which is independent of n",
                    "accepted": ["2a", "Second difference = 2a, which is constant because it does not depend on n", "2a is constant because it is independent of n"],
                    "keywords": [["2a"], ["constant", "independent", "no n", "free of n"]],
                    "minKeywordGroups": 2,
                    "hints": ["Replace n with n+1 in your expression for the first difference and subtract.", "[2a(n+1) + a + b] − [2an + a + b] = 2a. Since 2a contains no n, it is constant."],
                },
            ],
        },
        # Q39 (B14)
        {
            "pos": 39, "b_num": 14, "crit": "C", "diff_level": "intermediate", "diff": "medium",
            "title": "Critiquing a flawed series calculation",
            "topic": "Critique & reasoning", "subtopic": "alternating series ratio and exact sum",
            "prompt": "Critiquing a flawed series calculation [3 marks]\nTo sum 6 terms of 100 − 50 + 25 − 12.5 + …, Kofi writes: “$r = 0.5$, so $S_6 = \\frac{100(1 - 0.5^6)}{1 - 0.5} = 196.875$.”\n(a) Identify Kofi’s error in $r$ and explain from the alternating terms why $S_6 < 100$. [1]\n(b) Present a clearly structured calculation of the exact value of $S_6$ (fraction & decimal). [2]",
            "doc_content": [
                para("**Critiquing a flawed series calculation** [3 marks]"),
                para("To sum 6 terms of 100 − 50 + 25 − 12.5 + …, Kofi writes: “$r = 0.5$, so $S_6 = \\frac{100(1 - 0.5^6)}{1 - 0.5} = 196.875$.”"),
                para("(a) Identify Kofi’s error in $r$ and explain from the alternating terms why $S_6 < 100$. [1]"),
                para("(b) Present a clearly structured calculation of the exact value of $S_6$ (fraction & decimal). [2]"),
            ],
            "explanation": "(a) Kofi used $r = +0.5$ instead of $r = -0.5$. The terms alternate in sign, starting at 100 and subtracting 50, so the running sum is always pulled down and never exceeds 100.\n(b) $u_1 = 100, r = -0.5, n = 6$. $S_6 = \\frac{100[1 - (-0.5)^6]}{1 - (-0.5)} = \\frac{100(1 - 1/64)}{1.5} = \\frac{100(63/64)}{3/2} = 100 \\times \\frac{63}{64} \\times \\frac{2}{3} = \\frac{525}{8} = 65.625$.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Identify Kofi’s error in $r$ and explain from the alternating terms why $S_6 < 100$.",
                    "kind": "text", "points": 1, "strand": "C(i)",
                    "placeholder": "r = -0.5 not +0.5; terms alternate so partial sums stay below 100",
                    "accepted": ["r should be -0.5, not 0.5", "r = -0.5; alternating signs reduce the sum below 100", "r = -0.5"],
                    "keywords": [["-0.5", "-1/2", "negative"], ["alternate", "alternating", "subtract", "minus", "below 100"]],
                    "minKeywordGroups": 2,
                    "hints": ["Divide the second term (−50) by the first term (100).", "r = −50/100 = −0.5. Subtracting 50 immediately drops the sum to 50, and subsequent terms never bring it above 100."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Present a clearly structured calculation of the exact value of $S_6$ (fraction & decimal).",
                    "kind": "text", "points": 2, "strand": "C(ii)",
                    "placeholder": "525/8 = 65.625",
                    "accepted": ["525/8, 65.625", "525/8 = 65.625", "65.625, 525/8", "525/8", "65.625", "65 5/8"],
                    "hints": ["Use S6 = 100[1 − (−0.5)⁶] / [1 − (−0.5)].", "100(1 − 1/64) / 1.5 = 100(63/64) / (3/2) = 100 × 21/32 = 525/8 = 65.625."],
                },
            ],
        },
        # Q40 (B15)
        {
            "pos": 40, "b_num": 15, "crit": "C", "diff_level": "intermediate", "diff": "medium",
            "title": "Multi-sequence classification & justification",
            "topic": "Classification & communication", "subtopic": "classifying three sequences and fifth terms",
            "prompt": "Multi-sequence classification & justification [3 marks]\n\n[Figure: table]\n(a) Classify each sequence as linear/arithmetic, quadratic, or geometric, justifying with differences or ratios. [2]\n(b) State the exact fifth term $u_5$ of each sequence. [1]",
            "doc_content": [
                para("**Multi-sequence classification & justification** [3 marks]"),
                table_block(["ID", "First four terms ($u_1, u_2, u_3, u_4$)"], [
                    ["Seq I", "18, 12, 8, $\\frac{16}{3}$"],
                    ["Seq II", "5, 9, 15, 23"],
                    ["Seq III", "22, 15, 8, 1"],
                ]),
                para("(a) Classify each sequence as linear/arithmetic, quadratic, or geometric, justifying with differences or ratios. [2]"),
                para("(b) State the exact fifth term $u_5$ of each sequence. [1]"),
            ],
            "explanation": "(a) Seq I: ratio $12/18 = 8/12 = (16/3)/8 = 2/3$ is constant $\\implies$ geometric. Seq II: 1st diff 4, 6, 8; 2nd diff 2 is constant $\\implies$ quadratic. Seq III: 1st diff $-7$ is constant $\\implies$ linear (arithmetic).\n(b) Seq I: $u_5 = \\frac{16}{3} \\times \\frac{2}{3} = \\frac{32}{9}$. Seq II: next diff is 10 $\\implies u_5 = 23 + 10 = 33$. Seq III: $u_5 = 1 - 7 = -6$.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Classify each sequence as linear/arithmetic, quadratic, or geometric, justifying with differences or ratios.",
                    "kind": "text", "points": 2, "strand": "C(ii)",
                    "placeholder": "Seq I: geometric; Seq II: quadratic; Seq III: linear",
                    "accepted": ["Seq I: geometric, Seq II: quadratic, Seq III: linear", "I: geometric, II: quadratic, III: linear", "Geometric, quadratic, linear", "geometric, quadratic, arithmetic"],
                    "keywords": [["geometric"], ["quadratic"], ["linear", "arithmetic"]],
                    "minKeywordGroups": 3,
                    "hints": ["Check ratios for Seq I, second differences for Seq II, and first differences for Seq III.", "Seq I has constant ratio 2/3 (geometric); Seq II has constant 2nd difference 2 (quadratic); Seq III has constant 1st difference −7 (linear)."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "State the exact fifth term $u_5$ of each sequence.",
                    "kind": "text", "points": 1, "strand": "C(ii)",
                    "placeholder": "Seq I: 32/9, Seq II: 33, Seq III: -6",
                    "accepted": ["32/9, 33, -6", "Seq I: 32/9, Seq II: 33, Seq III: -6", "32/9; 33; -6", "32/9, 33, and -6"],
                    "hints": ["Multiply (16/3) by (2/3) for Seq I; add 10 to 23 for Seq II; add −7 to 1 for Seq III.", "Seq I: 16/3 × 2/3 = 32/9. Seq II: 23 + 10 = 33. Seq III: 1 − 7 = −6."],
                },
            ],
        },
        # Q41 (B16)
        {
            "pos": 41, "b_num": 16, "crit": "D", "diff_level": "intermediate", "diff": "medium",
            "title": "Deep-borehole drilling budget",
            "topic": "Real-life arithmetic application", "subtopic": "borehole depth cost and grant comparison",
            "prompt": "Deep-borehole drilling budget [3 marks]\nDrilling in northern Benin costs 35 000 FCFA for the 1st metre, increasing by 4 500 FCFA for each deeper metre.\n(a) Calculate the cost of drilling the 20th metre alone ($u_{20}$). [1]\n(b) Find the total cost of a 20 m borehole ($S_{20}$) and state whether a 1 600 000 FCFA grant suffices. [2]",
            "doc_content": [
                para("**Deep-borehole drilling budget** [3 marks]"),
                para("Drilling in northern Benin costs 35 000 FCFA for the 1st metre, increasing by 4 500 FCFA for each deeper metre."),
                para("(a) Calculate the cost of drilling the 20th metre alone ($u_{20}$). [1]"),
                para("(b) Find the total cost of a 20 m borehole ($S_{20}$) and state whether a 1 600 000 FCFA grant suffices. [2]"),
            ],
            "explanation": "(a) $u_1 = 35\\,000, d = 4\\,500$. $u_{20} = 35\\,000 + 19(4\\,500) = 35\\,000 + 85\\,500 = 120\\,500$ FCFA.\n(b) $S_{20} = \\frac{20}{2}(u_1 + u_{20}) = 10(35\\,000 + 120\\,500) = 10(155\\,500) = 1\\,555\\,000$ FCFA. Since $1\\,555\\,000 \\le 1\\,600\\,000$ FCFA, the grant suffices with a 45 000 FCFA surplus.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Calculate the cost of drilling the 20th metre alone ($u_{20}$).",
                    "kind": "numeric", "points": 1, "strand": "D(i)",
                    "placeholder": "120500", "unit": "FCFA",
                    "answer": 120500, "tolerance": 0,
                    "hints": ["Use u20 = u1 + 19d with u1 = 35 000 and d = 4 500.", "u20 = 35 000 + 19(4 500) = 35 000 + 85 500 = 120 500 FCFA."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Find the total cost of a 20 m borehole ($S_{20}$) and state whether a 1 600 000 FCFA grant suffices.",
                    "kind": "text", "points": 2, "strand": "D(ii)",
                    "placeholder": "S20 = 1 555 000 FCFA, Yes it suffices",
                    "accepted": ["1555000, Yes", "1 555 000 FCFA, Yes", "1555000 FCFA, Yes", "S20 = 1 555 000 FCFA, Yes, the grant suffices with 45 000 FCFA remaining"],
                    "keywords": [["1555000", "1 555 000"], ["yes", "suffices", "sufficient", "surplus", "45000", "45 000"]],
                    "minKeywordGroups": 2,
                    "hints": ["S20 = (20/2)(u1 + u20) = 10(35 000 + 120 500).", "Total cost is 1 555 000 FCFA. Since 1 555 000 ≤ 1 600 000, the grant is sufficient (45 000 FCFA remaining)."],
                },
            ],
        },
        # Q42 (B17)
        {
            "pos": 42, "b_num": 17, "crit": "D", "diff_level": "intermediate", "diff": "medium",
            "title": "Medical scanner depreciation",
            "topic": "Real-life geometric application", "subtopic": "annual depreciation decay and replacement threshold",
            "prompt": "Medical scanner depreciation [4 marks]\nA clinic buys an ultrasound scanner for $40 000. Its value drops by 15% per year ($V_1 = \\$34\\,000$ after 1 year).\n(a) State $r$, write an explicit formula for $V_n$ (after $n$ years), and find $V_5$ to 2 d.p. [2]\n(b) Clinic policy replaces the unit at the end of the first year its value falls below $12\\,000. Find that year, justifying clearly. [2]",
            "doc_content": [
                para("**Medical scanner depreciation** [4 marks]"),
                para("A clinic buys an ultrasound scanner for $40 000. Its value drops by 15% per year ($V_1 = \\$34\\,000$ after 1 year)."),
                para("(a) State $r$, write an explicit formula for $V_n$ (after $n$ years), and find $V_5$ to 2 d.p. [2]"),
                para("(b) Clinic policy replaces the unit at the end of the first year its value falls below $12\\,000. Find that year, justifying clearly. [2]"),
            ],
            "explanation": "(a) Value drops by 15%, so it retains 85% $\\implies r = 0.85$. Explicit formula: $V_n = 40\\,000(0.85)^n$. At $n = 5$: $V_5 = 40\\,000(0.85)^5 = \\$17\\,748.21$.\n(b) Solving $40\\,000(0.85)^n < 12\\,000 \\implies 0.85^n < 0.3 \\implies n > \\ln(0.3)/\\ln(0.85) \\approx 7.41$. At $n = 7$: $V_7 = \\$12\\,822.48 > \\$12\\,000$; at $n = 8$: $V_8 = \\$10\\,899.11 < \\$12\\,000$. Hence the scanner is replaced at the end of Year 8.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "State $r$, write an explicit formula for $V_n$ (after $n$ years), and find $V_5$ to 2 d.p.",
                    "kind": "text", "points": 2, "strand": "D(i)",
                    "placeholder": "r = 0.85, Vn = 40000(0.85)^n, V5 = 17748.21",
                    "accepted": ["r = 0.85, Vn = 40000(0.85)^n, V5 = 17748.21", "0.85, 40000(0.85)^n, 17748.21", "r = 0.85, Vn = 40 000(0.85)^n, $17 748.21", "17748.21"],
                    "keywords": [["0.85"], ["40000", "40 000"], ["17748.21", "17 748.21", "17748"]],
                    "minKeywordGroups": 2,
                    "hints": ["A 15% decrease leaves 85%, so r = 0.85.", "Vn = 40 000(0.85)^n. For n = 5: V5 = 40 000(0.85)⁵ = $17 748.21."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Clinic policy replaces the unit at the end of the first year its value falls below $12 000. Find that year, justifying clearly.",
                    "kind": "text", "points": 2, "strand": "D(ii)",
                    "placeholder": "Year 8 (n = 8)",
                    "accepted": ["Year 8", "Year 8 (n = 8)", "8", "n = 8", "At the end of Year 8"],
                    "keywords": [["8", "year 8", "n = 8", "eighth"], ["12822", "10899", "falls below", "12000"]],
                    "minKeywordGroups": 1,
                    "hints": ["Evaluate V7 and V8 to find when value drops under $12 000.", "V7 = $12 822.48 (> $12 000) and V8 = $10 899.11 (< $12 000), so replacement happens at Year 8."],
                },
            ],
        },
        # Q43 (B18)
        {
            "pos": 43, "b_num": 18, "crit": "D", "diff_level": "intermediate", "diff": "medium",
            "title": "Stacked pipe crates",
            "topic": "Real-life quadratic application", "subtopic": "pipe crate layers, difference and capacity testing",
            "prompt": "Stacked pipe crates [3 marks]\nPort Crate $n$ holds $u_n = n^2 + 4n + 3$ concrete pipes in $(n + 1) \\times (n + 3)$ layers.\n\n[Figure: Stacked pipe crates]\n(a) Verify $u_1, u_2, u_3$ and interpret $u_{n+1} - u_n$ in context. [1]\n(b) Find which crate holds 143 pipes and explain why no single crate holds 130 pipes. [2]",
            "doc_content": [
                para("**Stacked pipe crates** [3 marks]"),
                para("Port Crate $n$ holds $u_n = n^2 + 4n + 3$ concrete pipes in $(n + 1) \\times (n + 3)$ layers."),
                image_block("/exam-figures/myp5-sequences-2026/q18-crates.png", "Stacked pipe crates: Crate 1 holds 8 pipes (2x4), Crate 2 holds 15 pipes (3x5)", "Stacked pipe crates", 50),
                para("(a) Verify $u_1, u_2, u_3$ and interpret $u_{n+1} - u_n$ in context. [1]"),
                para("(b) Find which crate holds 143 pipes and explain why no single crate holds 130 pipes. [2]"),
            ],
            "explanation": "(a) $u_1 = 1 + 4 + 3 = 8$ (matches $2 \\times 4 = 8$); $u_2 = 4 + 8 + 3 = 15$ (matches $3 \\times 5 = 15$); $u_3 = 9 + 12 + 3 = 24$ (matches $4 \\times 6 = 24$). Difference $u_{n+1} - u_n = [(n + 1)^2 + 4(n + 1) + 3] - [n^2 + 4n + 3] = 2n + 5$, representing the additional pipe capacity of Crate $n+1$ compared to Crate $n$.\n(b) $n^2 + 4n + 3 = 143 \\implies n^2 + 4n - 140 = 0 \\implies (n + 14)(n - 10) = 0 \\implies n = 10$ (Crate 10). For 130 pipes: $n^2 + 4n + 3 = 130 \\implies n^2 + 4n - 127 = 0$; the discriminant $16 - 4(1)(-127) = 524$ is not a perfect square, so no integer $n$ exists (Crate 9 holds 120 and Crate 10 holds 143, skipping 130).",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Verify $u_1, u_2, u_3$ and interpret $u_{n+1} - u_n$ in context.",
                    "kind": "text", "points": 1, "strand": "D(i)",
                    "placeholder": "u1 = 8, u2 = 15, u3 = 24; un+1 - un = 2n + 5",
                    "accepted": ["u1 = 8, u2 = 15, u3 = 24; un+1 - un = 2n + 5", "8, 15, 24; 2n + 5", "8, 15, 24", "un+1 - un = 2n + 5", "2n + 5"],
                    "keywords": [["8", "15", "24"], ["2n + 5", "2n+5", "additional", "increase"]],
                    "minKeywordGroups": 1,
                    "hints": ["Substitute n = 1, 2, 3 into n² + 4n + 3.", "u1 = 8, u2 = 15, u3 = 24. Difference un+1 − un = 2n + 5 represents the extra pipes held by Crate n+1 over Crate n."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Find which crate holds 143 pipes and explain why no single crate holds 130 pipes.",
                    "kind": "text", "points": 2, "strand": "D(ii)",
                    "placeholder": "Crate 10 holds 143; 130 falls between Crate 9 (120) and Crate 10 (143)",
                    "accepted": ["Crate 10", "Crate 10 holds 143 pipes", "10", "n = 10", "Crate 10; 130 is not an integer solution (Crate 9 = 120, Crate 10 = 143)"],
                    "keywords": [["10", "crate 10", "n = 10"], ["120", "143", "discriminant", "not integer", "square", "between"]],
                    "minKeywordGroups": 2,
                    "hints": ["Solve n² + 4n + 3 = 143, so (n + 14)(n − 10) = 0.", "Crate 10 holds 143 pipes. For 130 pipes, Crate 9 holds 120 and Crate 10 holds 143; no integer n gives 130."],
                },
            ],
        },
        # Q44 (B19)
        {
            "pos": 44, "b_num": 19, "crit": "D", "diff_level": "advanced", "diff": "hard",
            "title": "Scholarship endowment annuity",
            "topic": "Financial mathematics", "subtopic": "compound interest annuity and total interest",
            "prompt": "Scholarship endowment annuity [4 marks]\nAn alumni body invests $5 000 at the start of each year for 8 years at 6% compound interest per annum.\n(a) Explain why the total at the end of Year 8 equals $5000(1.06) + 5000(1.06)^2 + \\dots + 5000(1.06)^8$, stating $u_1$, $r$ and $n$. [2]\n(b) Calculate the end-of-Year-8 balance (to 2 d.p.) and the total interest earned. [2]",
            "doc_content": [
                para("**Scholarship endowment annuity** [4 marks]"),
                para("An alumni body invests $5 000 at the start of each year for 8 years at 6% compound interest per annum."),
                para("(a) Explain why the total at the end of Year 8 equals $5000(1.06) + 5000(1.06)^2 + \\dots + 5000(1.06)^8$, stating $u_1$, $r$ and $n$. [2]"),
                para("(b) Calculate the end-of-Year-8 balance (to 2 d.p.) and the total interest earned. [2]"),
            ],
            "explanation": "(a) The deposit made at the start of Year 8 compounds for 1 year to $5000(1.06)^1$, up to the first deposit made at the start of Year 1 which compounds for 8 years to $5000(1.06)^8$. Summing from shortest to longest yields the geometric series with first term $u_1 = 5000(1.06) = 5300$, common ratio $r = 1.06$, and $n = 8$ terms.\n(b) $S_8 = \\frac{5300(1.06^8 - 1)}{1.06 - 1} = \\frac{5300(1.593848 - 1)}{0.06} = \\$52\\,456.58$. Total deposited = $8 \\times \\$5\\,000 = \\$40\\,000$. Interest earned = $\\$52\\,456.58 - \\$40\\,000 = \\$12\\,456.58$.",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Explain why the total at the end of Year 8 equals $5000(1.06) + 5000(1.06)^2 + \\dots + 5000(1.06)^8$, stating $u_1$, $r$ and $n$.",
                    "kind": "text", "points": 2, "strand": "D(i)",
                    "placeholder": "u1 = 5300, r = 1.06, n = 8",
                    "accepted": ["u1 = 5300, r = 1.06, n = 8", "u1 = 5000(1.06) = 5300, r = 1.06, n = 8", "5300, 1.06, 8", "u1=5300, r=1.06, n=8"],
                    "keywords": [["5300", "5000(1.06)", "5000 * 1.06"], ["1.06"], ["8"]],
                    "minKeywordGroups": 2,
                    "hints": ["Each annual deposit compounds for 1 to 8 years depending on when it was deposited.", "The 8th deposit compounds for 1 year (5000 × 1.06), up to the 1st deposit for 8 years. u1 = 5300, r = 1.06, n = 8."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Calculate the end-of-Year-8 balance (to 2 d.p.) and the total interest earned.",
                    "kind": "text", "points": 2, "strand": "D(ii)",
                    "placeholder": "Balance = $52 456.58, Interest = $12 456.58",
                    "accepted": ["52456.58, 12456.58", "Balance: $52 456.58, Interest: $12 456.58", "52456.58 and 12456.58", "$52 456.58, $12 456.58", "52456.58"],
                    "keywords": [["52456.58", "52 456.58", "52456.6", "52457"], ["12456.58", "12 456.58", "12456.6", "12457"]],
                    "minKeywordGroups": 1,
                    "hints": ["Apply geometric series sum S8 = 5300(1.06⁸ − 1) / (1.06 − 1).", "Balance is $52 456.58. Total deposits = 8 × $5 000 = $40 000, so interest = $52 456.58 − $40 000 = $12 456.58."],
                },
            ],
        },
        # Q45 (B20)
        {
            "pos": 45, "b_num": 20, "crit": "D", "diff_level": "intermediate", "diff": "medium",
            "title": "Comparing internship salary contracts",
            "topic": "Financial mathematics", "subtopic": "linear vs exponential salary contract comparison",
            "prompt": "Comparing internship salary contracts [3 marks]\nOver a 10-month placement, Contract X pays 150 000 FCFA in Month 1 (+20 000 FCFA/month); Contract Y pays 100 000 FCFA in Month 1 (+20% per month, $r = 1.20$).\n(a) Calculate total 10-month earnings ($S_{10}$) under Contract X and Contract Y (nearest FCFA). [2]\n(b) Advise a 10-month intern vs an intern leaving after 5 months, with figures. [1]",
            "doc_content": [
                para("**Comparing internship salary contracts** [3 marks]"),
                para("Over a 10-month placement, Contract X pays 150 000 FCFA in Month 1 (+20 000 FCFA/month); Contract Y pays 100 000 FCFA in Month 1 (+20% per month, $r = 1.20$)."),
                para("(a) Calculate total 10-month earnings ($S_{10}$) under Contract X and Contract Y (nearest FCFA). [2]"),
                para("(b) Advise a 10-month intern vs an intern leaving after 5 months, with figures. [1]"),
            ],
            "explanation": "(a) Contract X (arithmetic): $S_{10} = \\frac{10}{2}[2(150\\,000) + 9(20\\,000)] = 5(480\\,000) = 2\\,400\\,000$ FCFA. Contract Y (geometric): $S_{10} = \\frac{100\\,000(1.20^{10} - 1)}{0.20} = 500\\,000(5.191736) = 2\\,595\\,868$ FCFA.\n(b) At 5 months: Contract X pays $\\frac{5}{2}[300\\,000 + 80\\,000] = 950\\,000$ FCFA, while Contract Y pays $\\frac{100\\,000(1.20^5 - 1)}{0.20} = 744\\,160$ FCFA (X exceeds Y by 205 840 FCFA). Advice: A 10-month intern should choose Contract Y ($2\\,595\\,868$ FCFA), whereas an intern leaving after 5 months should choose Contract X ($950\\,000$ FCFA).",
            "parts": [
                {
                    "id": "a", "label": "(a)", "prompt": "Calculate total 10-month earnings ($S_{10}$) under Contract X and Contract Y (nearest FCFA).",
                    "kind": "text", "points": 2, "strand": "D(ii)",
                    "placeholder": "Contract X: 2 400 000 FCFA, Contract Y: 2 595 868 FCFA",
                    "accepted": ["2400000, 2595868", "Contract X = 2 400 000, Contract Y = 2 595 868", "2 400 000 FCFA and 2 595 868 FCFA", "2400000 FCFA, 2595868 FCFA", "2400000 and 2595868"],
                    "keywords": [["2400000", "2 400 000"], ["2595868", "2 595 868", "2595869", "2595870"]],
                    "minKeywordGroups": 2,
                    "hints": ["Contract X is arithmetic (a=150 000, d=20 000); Contract Y is geometric (a=100 000, r=1.20).", "X: (10/2)(300 000 + 9 × 20 000) = 2 400 000 FCFA. Y: 100 000(1.20¹⁰ − 1) / 0.20 = 2 595 868 FCFA."],
                },
                {
                    "id": "b", "label": "(b)", "prompt": "Advise a 10-month intern vs an intern leaving after 5 months, with figures.",
                    "kind": "text", "points": 1, "strand": "D(iii)",
                    "placeholder": "10-month: choose Y (2 595 868 vs 2 400 000); 5-month: choose X (950 000 vs 744 160)",
                    "accepted": ["10-month: Contract Y (2 595 868 vs 2 400 000); 5-month: Contract X (950 000 vs 744 160)", "Contract Y for 10 months, Contract X for 5 months"],
                    "keywords": [["contract y", "y", "10 month"], ["contract x", "x", "5 month"], ["950000", "744160", "950 000", "744 160"]],
                    "minKeywordGroups": 2,
                    "hints": ["Calculate 5-month totals: X gives 950 000 FCFA, Y gives 744 160 FCFA.", "At 10 months Contract Y earns more (2 595 868 vs 2 400 000 FCFA); at 5 months Contract X earns more (950 000 vs 744 160 FCFA)."],
                },
            ],
        },
    ]

    for spec in part_b_specs:
        q_id = f"{ID_PREFIX}{1000 + spec['pos']:012d}"
        pts = sum(p["points"] for p in spec["parts"])
        cfg = {
            "question_number": spec["b_num"],
            "paper_section": "B",
            "myp_criterion": spec["crit"],
            "criterion_label": f"Criterion {spec['crit']} — " + {"A": "Knowing and understanding", "B": "Investigating patterns", "C": "Communicating", "D": "Applying mathematics in real-life contexts"}[spec["crit"]],
            "difficulty_level": spec["diff_level"],
            "marks": pts,
            "calculator": True,
            "source": SOURCE,
            "parts": spec["parts"],
            "response_tools": ["math", "rich_text", "table"],
            "response_workspace": {
                "tools": ["rich_text", "math", "table"],
                "guidance": "show each step so your reasoning can be credited",
            },
        }
        questions.append({
            "id": q_id,
            "n": spec["pos"],
            "type": "assess_parts",
            "prompt": spec["prompt"],
            "prompt_doc": {"type": "doc", "content": spec["doc_content"]},
            "explanation": spec["explanation"],
            "points": pts,
            "difficulty": spec["diff"],
            "topic": spec["topic"],
            "subtopic": spec["subtopic"],
            "config": cfg,
        })

    return questions, options


def emit_sql():
    questions, options = build_all_questions()

    # Sanity checks
    assert len(questions) == 45, f"Expected 45 questions, got {len(questions)}"
    total_marks = sum(q["points"] for q in questions)
    assert total_marks == 100, f"Expected 100 marks, got {total_marks}"
    crit_marks = {"A": 0, "B": 0, "C": 0, "D": 0}
    for q in questions:
        crit_marks[q["config"]["myp_criterion"]] += q["points"]
    assert crit_marks == CRITERION_TOTALS, f"Criteria mismatch: {crit_marks} vs {CRITERION_TOTALS}"

    lines = [
        f"-- {EXAM_TITLE}",
        "-- Generated by scripts/exam-import/build_grade10_myp5_sequences_summative.py — do not edit by hand.",
        "--",
        f"-- Source: Grade_10_MYP_5_Mathematics_Summative_Assessment 2.pdf",
        f"-- Oak International School, Benin · End of First Term E-assessment 2026/27",
        f"-- MYP 5 / Grade 10 Mathematics · 2 hours · 100 marks",
        f"-- Criteria: A 32, B 24, C 20, D 24 (total 100 marks)",
        f"-- 45 questions: Part A (Q1–25, 30 marks) + Part B (Q1–20, 70 marks)",
        "begin;",
        "",
        "-- 1. Quiz record",
        "insert into quizzes (id, organization_id, title, description, status, settings, created_by, class_id)",
        f"values ('{QUIZ_ID}', '{ORG_ID}', '{sql_escape(EXAM_TITLE)}', '{sql_escape(EXAM_DESC)}', 'published',",
        f"        '{json_sql({'randomize_questions': False, 'randomize_options': False, 'assessment_kind': 'summative', 'grade_level': 'Grade 10', 'curriculum': 'MYP 5', 'subject': 'Mathematics', 'duration_minutes': 120, 'total_marks': 100, 'source': SOURCE, 'criterion_totals': CRITERION_TOTALS})}'::jsonb,",
        f"        '{CREATED_BY}', '{CLASS_ID}')",
        "on conflict (id) do update set",
        f"   title = '{sql_escape(EXAM_TITLE)}',",
        f"   description = '{sql_escape(EXAM_DESC)}',",
        "   status = 'published',",
        f"   class_id = '{CLASS_ID}',",
        "   updated_at = now();",
        "",
        "-- 2. Questions records",
    ]

    q_elements = []
    for q in questions:
        q_elements.append({
            "id": q["id"],
            "n": q["n"],
            "t": q["type"],
            "p": q["prompt"],
            "d": q["prompt_doc"],
            "e": q["explanation"],
            "m": q["points"],
            "df": q["difficulty"],
            "tp": q["topic"],
            "st": q["subtopic"],
            "cfg": q["config"],
        })

    lines.append("insert into questions (id, organization_id, type, prompt, prompt_doc, explanation,")
    lines.append("                       points, difficulty, topic, subtopic, tags, status, config,")
    lines.append("                       created_by, curriculum, curriculum_course, subject_id,")
    lines.append("                       review_status, creation_method, class_id, source_reference)")
    lines.append("select (x->>'id')::uuid,")
    lines.append(f"       '{ORG_ID}', x->>'t', x->>'p', x->'d', x->>'e',")
    lines.append("       (x->>'m')::numeric, x->>'df', x->>'tp', x->>'st',")
    lines.append("       array['MYP 5', 'Grade 10', 'Mathematics', 'summative', 'sequences-and-series', 'criteria-a-d']::text[],")
    lines.append("       'published', x->'cfg',")
    lines.append(f"       '{CREATED_BY}', 'MYP', 'MYP 5 Mathematics', '{SUBJECT_ID}',")
    lines.append(f"       'approved', 'manual', '{CLASS_ID}', '{SOURCE}'")
    lines.append(f"  from jsonb_array_elements('{json_sql(q_elements)}'::jsonb) as x")
    lines.append("on conflict (id) do update set")
    lines.append("   type = excluded.type,")
    lines.append("   prompt = excluded.prompt,")
    lines.append("   prompt_doc = excluded.prompt_doc,")
    lines.append("   explanation = excluded.explanation,")
    lines.append("   points = excluded.points,")
    lines.append("   difficulty = excluded.difficulty,")
    lines.append("   topic = excluded.topic,")
    lines.append("   subtopic = excluded.subtopic,")
    lines.append("   tags = excluded.tags,")
    lines.append("   status = 'published',")
    lines.append("   config = excluded.config,")
    lines.append("   review_status = 'approved',")
    lines.append("   updated_at = now();")
    lines.append("")

    lines.append("-- 3. Question options (Part A)")
    opt_elements = []
    for opt in options:
        opt_elements.append({
            "qid": opt["question_id"],
            "l": opt["label"],
            "c": opt["is_correct"],
            "p": opt["position"],
            "doc": opt["content_doc"],
        })

    lines.append("delete from question_options where question_id in (")
    lines.append(f"  select id from questions where id::text like '{ID_PREFIX}%'")
    lines.append(");")
    lines.append("insert into question_options (question_id, label, is_correct, position, content_doc)")
    lines.append("select (o->>'qid')::uuid, o->>'l', (o->>'c')::boolean, (o->>'p')::integer, o->'doc'")
    lines.append(f"  from jsonb_array_elements('{json_sql(opt_elements)}'::jsonb) as o;")
    lines.append("")

    lines.append("-- 4. Quiz questions link")
    qq_elements = [{"qid": q["id"], "pos": q["n"], "m": q["points"]} for q in questions]
    lines.append("insert into quiz_questions (quiz_id, question_id, position, points)")
    lines.append(f"select '{QUIZ_ID}', (x->>'qid')::uuid, (x->>'pos')::integer, (x->>'m')::numeric")
    lines.append(f"  from jsonb_array_elements('{json_sql(qq_elements)}'::jsonb) as x")
    lines.append("on conflict (quiz_id, question_id) do update set")
    lines.append("   position = excluded.position,")
    lines.append("   points = excluded.points;")
    lines.append("")

    lines.append("-- 5. Examination record (safe draft)")
    exam_settings = {
        "source": SOURCE,
        "calculator": True,
        "proctoring": False,
        "access_mode": "shared_link",
        "attempt_mode": "limited",
        "max_attempts": 1,
        "attempt_policy": "single_resume",
        "pass_mark_percent": 50,
        "randomize_options": False,
        "randomize_questions": False,
        "results_published": False,
        "criterion_reporting": True,
        "criterion_totals": CRITERION_TOTALS,
        "eligible_class_ids": [CLASS_ID],
        "sections": SECTIONS,
        "formula_sheet": FORMULA_SHEET,
        "lockdown": {"enabled": False, "require_app": False},
    }

    lines.append("insert into exams (id, organization_id, quiz_id, title, description, instructions,")
    lines.append("                   duration_minutes, status, access_code, access_code_hash, invite_token,")
    lines.append("                   shared_link_enabled, settings, created_by, class_id)")
    lines.append(f"values ('{EXAM_ID}', '{ORG_ID}', '{QUIZ_ID}', '{sql_escape(EXAM_TITLE)}',")
    lines.append(f"        '{sql_escape(EXAM_DESC)}', '{sql_escape(EXAM_INSTRUCTIONS)}',")
    lines.append(f"        120, 'draft', '{ACCESS_CODE}', '{ACCESS_CODE_HASH}', '{INVITE_TOKEN}',")
    lines.append(f"        true, '{json_sql(exam_settings)}'::jsonb, '{CREATED_BY}', '{CLASS_ID}')")
    lines.append("on conflict (id) do update set")
    lines.append(f"   quiz_id = '{QUIZ_ID}',")
    lines.append(f"   title = '{sql_escape(EXAM_TITLE)}',")
    lines.append(f"   description = '{sql_escape(EXAM_DESC)}',")
    lines.append(f"   instructions = '{sql_escape(EXAM_INSTRUCTIONS)}',")
    lines.append("   duration_minutes = 120,")
    lines.append("   status = 'draft',")
    lines.append(f"   access_code = '{ACCESS_CODE}',")
    lines.append(f"   access_code_hash = '{ACCESS_CODE_HASH}',")
    lines.append(f"   invite_token = '{INVITE_TOKEN}',")
    lines.append("   shared_link_enabled = true,")
    lines.append(f"   settings = '{json_sql(exam_settings)}'::jsonb,")
    lines.append(f"   class_id = '{CLASS_ID}';")
    lines.append("")
    lines.append("commit;")
    lines.append("")

    content = "\n".join(lines)
    OUT.write_text(content, encoding="utf-8")
    print(f"Wrote {len(content)} bytes to {OUT}")
    print(f"Verified: {len(questions)} questions, {len(options)} options, total {total_marks} marks.")
    print(f"Criteria: {crit_marks}")


if __name__ == "__main__":
    emit_sql()
