"""Grade 10 (MYP 5) Mathematics — Version C: Sequences & Series."""
from __future__ import annotations

from version_c_common import (
    assess_question,
    choice_question,
    doc_of,
    graph_functions,
    graph_points,
    grid_patterns,
    heading,
    numbered_table,
    para,
    part,
    starter_axes,
    structured,
    table_block,
)

SOURCE = "myp5-grade10-sequences-version-c-2026-27"
TITLE = "MYP 5 (Grade 10) Mathematics — End of First Term E-assessment (Version C)"
DESCRIPTION = (
    "End of First Term E-assessment 2026/27, Version C. Sequences & Series: arithmetic and geometric sequences, "
    "quadratic sequences, recursive and explicit rules, series, financial and real-life applications. 34 questions "
    "(Part A Q1–30, 60 marks; Part B Q1–4, 40 marks), 100 marks. Criteria: A 32, B 24, C 20, D 24."
)
INSTRUCTIONS = (
    "Answer all 34 questions. Part A (Q1–30, 60 marks): circle A, B, C or D, or write/plot directly in the boxes, "
    "tables and coordinate grids provided. Part B (Q1–4, 40 marks): complete the four structured synthesis tasks "
    "(one per MYP criterion) showing clear working. A scientific calculator is permitted. Give non-exact answers to "
    "3 s.f. (nearest FCFA or 2 d.p. for currency)."
)
SECTIONS = [
    {
        "id": "A",
        "title": "Part A — Objective, tabular & graphical questions (Q1–Q30)",
        "questions": 30,
        "marks": 60,
        "instructions": (
            "30 questions · 60 marks. Level 1 basic (Q1–8) 1 mark each; Level 2 intermediate (Q9–18) 24 marks; "
            "Level 3 advanced & applied (Q19–30) 28 marks."
        ),
    },
    {
        "id": "B",
        "title": "Part B — Structured synthesis tasks by criterion (Q1–Q4)",
        "questions": 4,
        "marks": 40,
        "instructions": (
            "4 tasks · 40 marks. Task 1 Criterion A (10); Task 2 Criterion B (10); Task 3 Criterion C (10); "
            "Task 4 Criterion D (10). Write concise working in the answer booklet."
        ),
    },
]
CRITERION_TOTALS = {"A": 32, "B": 24, "C": 20, "D": 24}


def build():
    qs = []

    # ── Level 1 ────────────────────────────────────────────────────────────
    qs.append(choice_question(
        1, sec="A", crit="C", marks=1, lvl="basic", topic="Sequence notation", subtopic="recursive definition",
        blocks=["Which mathematical expression defines a sequence **recursively**?"],
        options=["$u_n = 5n - 2$", "$4 + 12 + 36 + 108$", "$u_1 = 6,\\ u_{n+1} = 2u_n + 1$", "$S_n = 2n^2 + 3n$"],
        answer="C",
        explanation="C gives an initial term and defines each later term from the preceding one. A is explicit, B is a finite series and D is a partial-sum formula.",
    ))
    qs.append(choice_question(
        2, sec="A", crit="A", marks=1, lvl="basic", topic="Explicit rules", subtopic="quadratic term",
        blocks=["A sequence has explicit formula $u_n = 2n^2 + 3n - 5$. **Calculate** $u_6$."],
        options=["67", "85", "95", "157"], answer="B",
        explanation="$u_6 = 2(36) + 3(6) - 5 = 72 + 18 - 5 = 85$.",
    ))
    qs.append(choice_question(
        3, sec="A", crit="A", marks=1, lvl="basic", topic="Arithmetic sequences", subtopic="common difference and term",
        blocks=["For the arithmetic sequence 42, 35, 28, 21, …, **state** $d$ and $u_{10}$."],
        options=["$d = -7,\\ u_{10} = -21$", "$d = -7,\\ u_{10} = -28$", "$d = 7,\\ u_{10} = 105$", "$d = -7,\\ u_{10} = -14$"],
        answer="A", explanation="$d = 35 - 42 = -7$; $u_{10} = 42 + 9(-7) = -21$.",
    ))
    qs.append(choice_question(
        4, sec="A", crit="A", marks=1, lvl="basic", topic="Linear sequences", subtopic="explicit formula from a graph",
        blocks=["The coordinate graph shows the first five terms of a linear sequence $u_n$. **Identify** its explicit formula.",
                graph_points([(1, 3), (2, 7), (3, 11), (4, 15), (5, 19)],
                             title="First five terms of a linear sequence", x_label="n", x_min=0, x_max=6,
                             y_min=0, y_max=20)],
        options=["$u_n = 3n + 4$", "$u_n = 4n + 3$", "$u_n = 4n - 1$", "$u_n = 3n + 1$"],
        answer="C", explanation="The points have common difference 4 and first term 3, so $u_n = 3 + 4(n-1) = 4n - 1$.",
    ))
    qs.append(choice_question(
        5, sec="A", crit="A", marks=1, lvl="basic", topic="Geometric sequences", subtopic="ratio and term",
        blocks=["For the geometric sequence 128, −64, 32, −16, …, **find** $r$ and $u_6$."],
        options=["$r = -\\frac{1}{2},\\ u_6 = 4$", "$r = -\\frac{1}{2},\\ u_6 = -4$",
                 "$r = \\frac{1}{2},\\ u_6 = 4$", "$r = -2,\\ u_6 = -8$"],
        answer="B", explanation="$r = -64/128 = -\\frac12$; $u_6 = 128(-\\frac12)^5 = -4$.",
    ))
    qs.append(choice_question(
        6, sec="A", crit="B", marks=1, lvl="basic", topic="Classifying sequences", subtopic="quadratic sequence",
        blocks=["How is the sequence 5, 9, 17, 29, 45, … best **classified**?"],
        options=["Arithmetic", "Geometric", "Quadratic", "Constant"], answer="C",
        explanation="First differences are 4, 8, 12, 16; the second difference is constant (4), so the sequence is quadratic.",
    ))
    qs.append(choice_question(
        7, sec="A", crit="B", marks=1, lvl="basic", topic="Patterns", subtopic="explicit formula for a fraction sequence",
        blocks=["Which explicit formula **generates** the sequence $\\frac13, \\frac25, \\frac37, \\frac49, \\ldots$?"],
        options=["$\\frac{n}{2n-1}$", "$\\frac{n}{2n+1}$", "$\\frac{1}{2n+1}$", "$\\frac{n+1}{2n+3}$"],
        answer="B", explanation="Numerators are 1, 2, 3, 4 (= n); denominators are 3, 5, 7, 9 (= 2n + 1).",
    ))
    qs.append(choice_question(
        8, sec="A", crit="D", marks=1, lvl="basic", topic="Arithmetic series", subtopic="sum of an arithmetic sequence",
        blocks=["An auditorium has 18 seats in Row 1 and 26 seats in Row 9, increasing arithmetically by row. **Find** the total seats $S_9$."],
        options=["176", "180", "198", "396"], answer="C",
        explanation="$S_9 = \\frac92(18 + 26) = 9 \\times 22 = 198$ seats.",
    ))

    # ── Level 2 ────────────────────────────────────────────────────────────
    qs.append(choice_question(
        9, sec="A", crit="B", marks=2, lvl="intermediate", topic="Difference tables", subtopic="quadratic coefficients",
        blocks=["The difference table below represents a quadratic sequence $u_n = an^2 + bn + c$: [2]",
                numbered_table(["Term n", "1", "2", "3", "4", "5"],
                               [["Value $u_n$", "4", "11", "24", "43", "$k$"],
                                ["1st diff. $\\Delta^1$", "+7", "+13", "+19", "$p$", "—"],
                                ["2nd diff. $\\Delta^2$", "", "+6", "+6", "(constant)", ""]]),
                "**Find** the leading coefficient $a$ and fifth term $k$."],
        options=["$a = 3,\\ k = 68$", "$a = 6,\\ k = 68$", "$a = 3,\\ k = 62$", "$a = 6,\\ k = 62$"],
        answer="A", explanation="Constant second difference 6 gives $2a = 6$, so $a = 3$. The next first difference is 25, so $k = 43 + 25 = 68$.",
    ))
    qs.append(choice_question(
        10, sec="A", crit="C", marks=2, lvl="intermediate", topic="Geometric sequences", subtopic="explicit rule and fifth term",
        blocks=["The graph displays the first four terms of a geometric sequence. **Choose** its explicit rule and exact fifth term $u_5$. [2]",
                graph_functions([{"expression": "64*(3/4)^(x-1)", "label": "u_n", "from": 1, "to": 4}],
                                title="First four terms of a geometric sequence", x_min=0, x_max=5, y_min=0, y_max=72,
                                points=[(1, 64), (2, 48), (3, 36), (4, 27)])],
        options=["$64\\left(\\frac34\\right)^n;\\ u_5 = \\frac{81}{4}$",
                 "$64\\left(\\frac34\\right)^{n-1};\\ u_5 = \\frac{81}{4}$",
                 "$64 - 16(n-1);\\ u_5 = 0$",
                 "$64\\left(\\frac43\\right)^{n-1};\\ u_5 = \\frac{81}{4}$"],
        answer="B", explanation="The graph gives $u_1 = 64$ and $r = 48/64 = \\frac34$, so $u_5 = 27 \\times \\frac34 = \\frac{81}{4}$.",
    ))
    qs.append(choice_question(
        11, sec="A", crit="A", marks=2, lvl="intermediate", topic="Recursive sequences", subtopic="iteration",
        blocks=["Given $u_1 = 5$ and $u_{n+1} = 2u_n - 3$ $(n \\ge 1)$, **calculate** $u_5$. [2]"],
        options=["19", "29", "35", "67"], answer="C",
        explanation="$u_2 = 7$, $u_3 = 11$, $u_4 = 19$, $u_5 = 35$.",
    ))
    qs.append(assess_question(
        12, sec="A", crit="A", marks=2, lvl="intermediate", topic="Arithmetic sequences", subtopic="d and nth term",
        blocks=["Arithmetic sequence with $u_4 = 23$ and $u_{11} = 65$: [2]",
               "**(i) $d =$**   **(ii) $u_{25} =$**"],
        explanation="$7d = 65 - 23 = 42$, so $d = 6$. $u_1 = 23 - 3(6) = 5$, so $u_{25} = 5 + 24(6) = 149$.",
        marking_breakdown=[("(i)", 1, ""), ("(ii)", 1, "")],
        parts=[
            part("d", "(i)", "Common difference d", 1, answer=6),
            part("u25", "(ii)", "Twenty-fifth term", 1, answer=149),
        ],
    ))
    qs.append(choice_question(
        13, sec="A", crit="A", marks=2, lvl="intermediate", topic="Arithmetic series", subtopic="sum of 15 terms",
        blocks=["**Calculate** the sum $S_{15}$ of the first 15 terms of the arithmetic series 9 + 13 + 17 + 21 + … [2]"],
        options=["495", "555", "585", "1 110"], answer="B",
        explanation="$S_{15} = \\frac{15}{2}[2(9) + 14(4)] = \\frac{15}{2}(74) = 555$.",
    ))
    qs.append(choice_question(
        14, sec="A", crit="D", marks=2, lvl="intermediate", topic="Geometric decay", subtopic="depreciation",
        blocks=["Lab equipment worth $25 000 in Year 1 retains 80% of its value each year "
                "($V_n = 25 000(0.8)^{n-1}$). **Find** its Year 4 value $V_4$. [2]"],
        options=["$10 240", "$12 800", "$16 000", "$10 000"], answer="B",
        explanation="$V_4 = 25 000(0.8)^3 = 25 000 \\times 0.512 = \\$12 800$.",
    ))
    qs.append(assess_question(
        15, sec="A", crit="B", marks=3, lvl="intermediate", topic="Recursive sequences", subtopic="plotting terms and explicit rule",
        blocks=["A sequence satisfies $u_1 = 1$ and $u_{n+1} = u_n + 2n + 1$ $(n \\ge 1)$. [3]",
                "**(i)** **Plot** $(3, u_3)$ and $(4, u_4)$ on the grid.",
                starter_axes(title="Plot the sequence terms", x_min=0, x_max=5, y_min=0, y_max=20, step=1),
                "**(ii) Explicit rule:** $u_n =$ ______"],
        explanation="$u_2 = 4$, $u_3 = 9$, $u_4 = 16$. The points (3, 9) and (4, 16) lie on $u_n = n^2$.",
        marking_breakdown=[("(i)", 2, "two points"), ("(ii)", 1, "explicit rule")],
        tools=["rich_text", "math", "graph"],
        guidance="Open the graph workspace and plot both points on the axes. Then type the explicit rule.",
        default_tool="graph",
        requirement="any",
        structured_marks=[
            structured("plot", "Two plotted sequence terms", "graph", 2,
                       {"points": [{"x": 3, "y": 9}, {"x": 4, "y": 16}]}, tolerance=0.01, part_id="rule"),
        ],
        parts=[
            part("rule", "(ii)", "Explicit rule for the sequence, and plot the two required points in the working space",
                 1, kind="expression", accepted=["n^2", "n²"]),
        ],
    ))
    qs.append(assess_question(
        16, sec="A", crit="C", marks=3, lvl="intermediate", topic="Intersecting sequences", subtopic="linear and quadratic",
        blocks=["Linear $L_n = 3n + 3$ and quadratic $Q_n = n^2 - n + 6$ are plotted together. [3]",
                graph_functions([
                    {"expression": "3x + 3", "label": "L_n", "color": "#0a5c36"},
                    {"expression": "x^2 - x + 6", "label": "Q_n", "color": "#b45309", "style": "dashed"},
                ], title="Linear and quadratic sequences", x_min=0, x_max=6, y_min=0, y_max=32,
                   points=[(1, 6), (3, 12)]),
                "**(i) Both intersection points:** ______\n**(ii) $Q_5 - L_5 =$** ______"],
        explanation="Solving $3n+3 = n^2-n+6$ gives $n^2-4n+3=0$, so $n=1,3$; the points are (1, 6) and (3, 12). At $n=5$, $Q_5=26$ and $L_5=18$, so the difference is 8.",
        marking_breakdown=[("(i)", 2, "two intersection points"), ("(ii)", 1, "difference")],
        parts=[
            part("i1", "(i) first", "First intersection point", 1, kind="text",
                 accepted=["(1, 6)", "1, 6", "n=1, y=6"]),
            part("i2", "(i) second", "Second intersection point", 1, kind="text",
                 accepted=["(3, 12)", "3, 12", "n=3, y=12"]),
            part("diff", "(ii)", "Value of Q5 − L5", 1, answer=8),
        ],
    ))
    qs.append(assess_question(
        17, sec="A", crit="A", marks=3, lvl="intermediate", topic="Geometric sequences", subtopic="ratio, first term and sum",
        blocks=["Positive geometric sequence with $u_2 = 12$ and $u_5 = 324$: [3]",
                "**(i) $r =$** ______   **$u_1 =$** ______   **(ii) Sum $S_5 =$** ______"],
        explanation="$r^3 = 324/12 = 27$, so $r = 3$; $u_1 = 12/3 = 4$. $S_5 = 4(3^5-1)/(3-1) = 484$.",
        marking_breakdown=[("(i)", 2, "ratio and first term"), ("(ii)", 1, "sum")],
        parts=[
            part("r", "(i) r", "Common ratio r", 1, answer=3),
            part("u1", "(i) u1", "First term u1", 1, answer=4),
            part("s5", "(ii)", "Sum of the first five terms", 1, answer=484),
        ],
    ))
    qs.append(assess_question(
        18, sec="A", crit="D", marks=3, lvl="intermediate", topic="Cumulative series", subtopic="weekly usage",
        blocks=["Cumulative flour bags $S_n$ used by a Cotonou bakery over Weeks 1–4 (weekly usage is arithmetic). [3]",
                graph_points([(1, 18), (2, 40), (3, 66), (4, 96)],
                             title="Cumulative flour bags used", x_label="Week n", y_label="Cumulative bags S_n",
                             x_min=0, x_max=5, y_min=0, y_max=105),
                "**(i) Week 4 usage $u_4 =$** ______   **(ii) $d =$** ______ **;** **$S_8 =$** ______"],
        explanation="$u_4 = S_4 - S_3 = 96 - 66 = 30$ bags. Weekly terms are 18, 22, 26, 30, so $d=4$. $S_8 = \\frac82[2(18)+7(4)] = 256$ bags.",
        marking_breakdown=[("(i)", 1, ""), ("(ii)", 2, "d and S8")],
        parts=[
            part("u4", "(i)", "Week 4 usage", 1, answer=30, unit="bags"),
            part("d", "(ii) d", "Common difference", 1, answer=4, unit="bags"),
            part("s8", "(ii) S8", "Total usage over 8 weeks", 1, answer=256, unit="bags"),
        ],
    ))

    # ── Level 3 ────────────────────────────────────────────────────────────
    qs.append(assess_question(
        19, sec="A", crit="A", marks=3, lvl="advanced", topic="Quadratic sequences", subtopic="terms and solving",
        blocks=["Quadratic rule $u_n = 2n^2 - 7n + 9$: [3]",
                "**(i)** $u_1 =$ ______ **, $u_5 =$** ______   **(ii) Solve $u_n = 81$: $n =$** ______"],
        explanation="$u_1 = 4$, $u_5 = 24$. $2n^2-7n+9=81$ gives $(n-8)(2n+9)=0$, so the positive integer is $n=8$.",
        marking_breakdown=[("(i)", 1, "two terms"), ("(ii)", 2, "equation and positive root")],
        parts=[
            part("terms", "(i)", "Values of u1 and u5", 1, kind="text", accepted=["4 and 24", "4, 24", "u1=4, u5=24"]),
            part("solve", "(ii)", "Positive integer n for which u_n = 81", 2, answer=8),
        ],
    ))
    qs.append(choice_question(
        20, sec="A", crit="A", marks=2, lvl="advanced", topic="Geometric series", subtopic="exact finite sum",
        blocks=["**Find** the exact sum $S_6$ of the first 6 terms of the geometric series 32 + 48 + 72 + 108 + … [2]"],
        options=["421", "633", "665", "729"], answer="C",
        explanation="$u_1=32$, $r=\\frac32$; $S_6 = 32\\frac{(3/2)^6-1}{3/2-1}=64(\\frac{729}{64}-1)=665$.",
    ))
    qs.append(choice_question(
        21, sec="A", crit="A", marks=2, lvl="advanced", topic="Geometric sequences", subtopic="unknown terms",
        blocks=["Consecutive positive terms $k-2$, $k+4$, $3k$ form a geometric sequence. **Find** $k$ and common ratio $r$. [2]"],
        options=["$k = 4,\\ r = 2$", "$k = 8,\\ r = 2$", "$k = 8,\\ r = 3$", "$k = 6,\\ r = 5$"],
        answer="B", explanation="$(k+4)^2 = 3k(k-2)$ gives $2k^2-14k-16=2(k-8)(k+1)=0$; positive terms require $k=8$, giving 6, 12, 24 and $r=2$.",
    ))
    qs.append(choice_question(
        22, sec="A", crit="A", marks=2, lvl="advanced", topic="Alternating geometric series", subtopic="number of terms",
        blocks=["**How many terms** are in the alternating geometric series $243 - 162 + 108 - \\ldots - 32$? [2]"],
        options=["5", "6", "7", "8"], answer="B",
        explanation="$r=-\\frac23$. Solving $243(-\\frac23)^{n-1}=-32$ gives $(-\\frac23)^{n-1}=(-\\frac23)^5$, so $n=6$.",
    ))
    qs.append(assess_question(
        23, sec="A", crit="B", marks=3, lvl="intermediate", topic="Sequence classification", subtopic="type and fifth term",
        blocks=["**Complete** the sequence classification & fifth-term table: [3]",
                numbered_table(["First four terms", "Type (Arith. / Geom. / Quad.)", "Exact $u_5$"],
                               [["30, 23, 16, 9, …", "________", "________"],
                                ["5, 10, 20, 40, …", "________", "________"],
                                ["2, 7, 16, 29, …", "________", "________"]])],
        explanation="Row 1: arithmetic with $d=-7$, $u_5=2$. Row 2: geometric with $r=2$, $u_5=80$. Row 3: quadratic with second difference 4, $u_5=46$.",
        marking_breakdown=[("Row 1", 1, ""), ("Row 2", 1, ""), ("Row 3", 1, "")],
        parts=[
            part("r1", "Row 1", "Type and fifth term for 30, 23, 16, 9, …", 1, kind="text",
                 accepted=["Arithmetic, 2", "Arithmetic; 2", "Arithmetic u5=2"]),
            part("r2", "Row 2", "Type and fifth term for 5, 10, 20, 40, …", 1, kind="text",
                 accepted=["Geometric, 80", "Geometric; 80", "Geometric u5=80"]),
            part("r3", "Row 3", "Type and fifth term for 2, 7, 16, 29, …", 1, kind="text",
                 accepted=["Quadratic, 46", "Quadratic; 46", "Quadratic u5=46"]),
        ],
    ))
    qs.append(choice_question(
        24, sec="A", crit="B", marks=2, lvl="advanced", topic="First differences", subtopic="classify and find term",
        blocks=["The graph plots the first differences $\\Delta_n = u_{n+1} - u_n$ of a sequence with $u_1 = 3$. [2]",
                graph_points([(1, 5), (2, 9), (3, 13), (4, 17)],
                             title="First differences of a sequence", x_label="n", y_label="Δ_n",
                             x_min=0, x_max=5, y_min=0, y_max=20),
                "**Classify** $u_n$ and **find** $u_4$."],
        options=["Quadratic (a = 2); u4 = 30", "Quadratic (a = 4); u4 = 30", "Quadratic (a = 2); u4 = 47", "Arithmetic (d = 4); u4 = 15"],
        answer="A", explanation="The first differences 5, 9, 13, 17 are linear, so $u_n$ is quadratic with constant second difference 4 and $a=2$. $u_4 = 3+5+9+13 = 30$.",
    ))
    qs.append(choice_question(
        25, sec="A", crit="B", marks=2, lvl="advanced", topic="Recursive sequences", subtopic="explicit formula",
        blocks=["Given $u_1 = 4$ and $u_{n+1} = 3u_n - 2$ $(n \\ge 1)$, where $w_n = u_n - 1$ is geometric, "
                "**identify** the explicit formula for $u_n$. [2]"],
        options=["$3^{n-1} + 3$", "$3^n + 1$", "$4(3)^{n-1} - 2$", "$2(3)^n - 2$"], answer="B",
        explanation="$w_1 = 3$ and $w_{n+1} = 3w_n$, so $w_n = 3^n$ and $u_n = 3^n + 1$.",
    ))
    qs.append(choice_question(
        26, sec="A", crit="C", marks=2, lvl="intermediate", topic="Recursive definitions", subtopic="explicit to recursive",
        blocks=["Which recursive definition **generates** the sequence with explicit rule $u_n = 7n - 4$ $(n \\ge 1)$? [2]"],
        options=["$u_1 = 7,\\ u_{n+1} = u_n - 4$", "$u_1 = 3,\\ u_{n+1} = u_n + 7$",
                 "$u_1 = 3,\\ u_{n+1} = 7u_n - 4$", "$u_1 = -4,\\ u_{n+1} = u_n + 7$"],
        answer="B", explanation="$u_1 = 7(1)-4 = 3$ and the constant difference is 7.",
    ))
    qs.append(assess_question(
        27, sec="A", crit="C", marks=2, lvl="intermediate", topic="Recursive definitions", subtopic="explicit to recursive",
        blocks=["**Rewrite** $u_n = 12\\left(\\frac12\\right)^{n-1}$ $(n \\ge 1)$ as a recursive rule: [2]",
                "$u_1 =$ ______ , $u_{n+1} =$ ______ $(n \\ge 1)$"],
        explanation="$u_1 = 12$ and each term is half the previous term, so $u_{n+1} = \\frac12 u_n$.",
        marking_breakdown=[("Initial term", 1, ""), ("Recursive rule", 1, "")],
        parts=[
            part("u1", "u1", "Initial term", 1, answer=12),
            part("rule", "un+1", "Recursive rule in terms of u_n", 1, kind="expression",
                 accepted=["(1/2)u_n", "1/2*u_n", "0.5u_n", "u_n/2", "1/2 u_n", "0.5*u_n"]),
        ],
    ))
    qs.append(assess_question(
        28, sec="A", crit="D", marks=3, lvl="advanced", topic="Arithmetic applications", subtopic="basket production",
        blocks=["A Porto-Novo cooperative weaves 56 baskets in Month 1 (+8 baskets/month). [3]",
                "**(i) Month 10: $u_{10} =$** ______   **(ii) Months for $S_n = 792$: $n =$** ______"],
        explanation="$u_{10} = 56 + 9(8) = 128$. $S_n = \\frac n2[112+8(n-1)] = 4n^2+52n = 792$, so $n^2+13n-198=(n-9)(n+22)=0$ and $n=9$ months.",
        marking_breakdown=[("(i)", 1, ""), ("(ii)", 2, "equation and solution")],
        parts=[
            part("u10", "(i)", "Month 10 production", 1, answer=128, unit="baskets"),
            part("n", "(ii)", "Number of months for a total of 792 baskets", 2, answer=9, unit="months"),
        ],
    ))
    qs.append(choice_question(
        29, sec="A", crit="D", marks=2, lvl="advanced", topic="Compound interest", subtopic="annuity",
        blocks=["Kofi invests 100 000 FCFA at the **start** of each year for 5 years at 6% compound interest p.a. "
                "**Find** the end-of-Year-5 balance. [2]"],
        options=["563 709 FCFA", "597 532 FCFA", "530 000 FCFA", "633 384 FCFA"], answer="B",
        explanation="Deposits at the start of each year compound for 1 to 5 years: $100000(1.06)(1.06^5-1)/0.06 = 597 531.85 \\approx 597 532$ FCFA.",
    ))
    qs.append(assess_question(
        30, sec="A", crit="D", marks=3, lvl="advanced", topic="Geometric decay", subtopic="water filtration",
        blocks=["A Bohicon plant filters $V_n$ m³ in month $n$ (geometric decay). [3]",
                graph_points([(1, 400), (2, 360), (3, 324), (4, 291.6)],
                             title="Monthly filtration volume", x_label="Month n", y_label="V_n (m³)",
                             x_min=0, x_max=6, y_min=250, y_max=420),
                "**(i) $r =$** ______ **; $V_6 =$** ______   **(ii) $S_6$ (nearest m³) =** ______"],
        explanation="$r = 360/400 = 0.9$; $V_6 = 400(0.9)^5 = 236.196 \\approx 236.2$ m³. $S_6 = 400(1-0.9^6)/(1-0.9) = 1 874.24 \\approx 1 874$ m³.",
        marking_breakdown=[("(i)", 2, "ratio and V6"), ("(ii)", 1, "sum")],
        parts=[
            part("r", "(i) r", "Common ratio", 1, answer=0.9),
            part("v6", "(i) V6", "Volume in month 6 (1 d.p.)", 1, answer=236.2, tolerance=0.05, unit="m³"),
            part("s6", "(ii)", "Total volume over 6 months (nearest m³)", 1, answer=1874, tolerance=0.5, unit="m³"),
        ],
    ))

    # ── Part B · Task 1 ────────────────────────────────────────────────────
    qs.append(assess_question(
        31, sec="B", crit="A", marks=10, lvl="advanced", topic="Intersecting sequences & series",
        subtopic="arithmetic and geometric models",
        number=1, question_label="B Q1",
        blocks=["**TASK 1 · CRITERION A — Knowing and understanding [10 marks]**",
                "**1. Intersecting sequences & series [10 mks]**",
                "Arithmetic sequence $A_n$ and geometric sequence $G_n$ are plotted for $n = 1..5$, meeting at (4, 24).",
                graph_functions([
                    {"expression": "40 - 4x", "label": "A_n", "color": "#0a5c36"},
                    {"expression": "3*2^(x-1)", "label": "G_n", "color": "#b45309", "style": "dashed"},
                ], title="Arithmetic A_n and geometric G_n", x_min=0, x_max=6, y_min=0, y_max=52,
                   points=[(1, 36), (1, 3), (4, 24), (5, 48)]),
                "**(a)** **Derive** simplified explicit formulas for $A_n$ and $G_n$ from the graph, and **verify** algebraically that $A_4 = G_4 = 24$. [4]\n"
                "**(b)** **Find** the term number $n$ and value of the first negative term of $A_n$, and **evaluate** the arithmetic sum $S_{20}$ of $A_n$. [3]\n"
                "**(c)** **Evaluate** the exact geometric sum $S_{10}$ of $G_n$, and **find** the smallest integer $n$ for which $G_n > 1 500$. [3]"],
        explanation=(
            "(a) From (1,36) and (4,24), $d=(24-36)/3=-4$, so $A_n=36-4(n-1)=40-4n$. From (1,3) and (4,24), $r=2$, so $G_n=3\\cdot2^{n-1}$. "
            "At $n=4$, $A_4=24$ and $G_4=3(8)=24$.\n"
            "(b) $40-4n<0$ gives $n>10$, so the first negative term is $A_{11}=-4$. $S_{20}=\\frac{20}{2}(36-40)=-40$.\n"
            "(c) $S_{10}=3(2^{10}-1)=3 069$. $3\\cdot2^{n-1}>1500$ requires $2^{n-1}>500$; since $2^8=256$ and $2^9=512$, $n-1=9$, so $n=10$."
        ),
        marking_breakdown=[
            ("(a)", 4, "two formulas and verification"), ("(b)", 3, "first negative term and S20"),
            ("(c)", 3, "S10 and threshold"),
        ],
        parts=[
            part("a1", "(a) A_n", "Simplified explicit formula for A_n", 1, kind="expression", accepted=["40-4n", "36-4(n-1)"]),
            part("a2", "(a) G_n", "Simplified explicit formula for G_n", 1, kind="expression", accepted=["3*2^(n-1)", "3(2)^(n-1)", "3×2^(n-1)"]),
            part("a3", "(a) verification", "Verification that A4 = G4 = 24", 1, kind="text",
                 accepted=["A4 = 40 - 16 = 24 and G4 = 3 × 2^3 = 24", "A4=24, G4=3(8)=24"],
                 keywords=[["a4", "40", "24"], ["g4", "3", "8", "24"]], min_groups=2),
            part("a4", "(a) derivation", "Working that derives the common difference and ratio from the graph", 1, kind="text",
                 accepted=["d = -4 from (1,36) and (4,24); r = 2 from (1,3) and (4,24)",
                           "A_n has d=-4 and G_n has r=2"],
                 keywords=[["d", "-4"], ["r", "2"]], min_groups=2),
            part("b1", "(b) first negative", "Term number and value of the first negative term of A_n", 1, kind="text",
                 accepted=["n=11, A11=-4", "11 and -4", "A11 = -4"]),
            part("b2", "(b) S20", "Arithmetic sum S20", 1, answer=-40),
            part("b3", "(b) method", "Method: solve 40 - 4n < 0 and substitute into the sum formula", 1, kind="text",
                 accepted=["40 - 4n < 0 gives n > 10; S20 = 20/2(36 + (-40)) = -40",
                           "n>10 and S20=10(-4)"],
                 keywords=[["n", "10", "11"], ["s20", "-40", "sum"]], min_groups=2),
            part("c1", "(c) S10", "Exact geometric sum S10", 1, answer=3069),
            part("c2", "(c) threshold", "Smallest integer n for which G_n > 1500", 1, answer=10),
            part("c3", "(c) method", "Method: solve 3 × 2^(n-1) > 1500 using powers of 2", 1, kind="text",
                 accepted=["2^(n-1) > 500, and 2^9 = 512, so n = 10", "n-1=9 therefore n=10"],
                 keywords=[["500"], ["2^9", "512"], ["10"]], min_groups=2),
        ],
    ))

    # ── Task 2 ─────────────────────────────────────────────────────────────
    qs.append(assess_question(
        32, sec="B", crit="B", marks=10, lvl="advanced", topic="Courtyard tile pattern & quadratic growth",
        subtopic="linear and quadratic models",
        number=2, question_label="B Q2",
        blocks=["**TASK 2 · CRITERION B — Investigating patterns [10 marks]**",
                "**2. Courtyard tile pattern & quadratic growth [10 mks]** Stage $n$ has an $n \\times (n+1)$ green core ($C_n$) "
                "bordered top and bottom by rows of $(n+1)$ pale tiles ($B_n$), giving total tiles $T_n = C_n + B_n$.",
                grid_patterns([("Stage 1 · 6 tiles", 2, 3), ("Stage 2 · 12 tiles", 3, 4), ("Stage 3 · 20 tiles", 4, 5)],
                              title="Courtyard tile patterns: pale rows above and below the green core"),
                "**(a)** **Tabulate** $B_n$, $C_n$ and $T_n$ for $1 \\le n \\le 5$, and use first and second differences to **classify** $B_n$ and $T_n$. [4]\n"
                "**(b)** **Write** expanded explicit formulas for $B_n$, $C_n$ and $T_n$ in terms of $n$, and **state** the stage where $C_n = B_n$. [3]\n"
                "**(c)** **Form and solve** a quadratic equation to find which stage requires exactly $T_n = 210$ tiles. [3]"],
        explanation=(
            "(a) Stage 1–5: B = 4, 6, 8, 10, 12; C = 2, 6, 12, 20, 30; T = 6, 12, 20, 30, 42. "
            "B has constant first difference 2 (linear/arithmetic); T has first differences 6, 8, 10, 12 and constant second difference 2 (quadratic).\n"
            "(b) $B_n = 2n+2$, $C_n = n^2+n$, $T_n = n^2+3n+2$. $C_n=B_n$ gives $n^2-n-2=0$, so $n=2$ (both 6).\n"
            "(c) $n^2+3n+2=210$ gives $n^2+3n-208=(n-13)(n+16)=0$, so stage 13."
        ),
        marking_breakdown=[
            ("(a) table", 2, "three sequences for n=1..5"), ("(a) classification", 2, "first/second differences"),
            ("(b) formulas", 2, "three explicit formulas"), ("(b) equality", 1, "stage"),
            ("(c) equation", 2, "form and solve"), ("(c) stage", 1, "positive root"),
        ],
        parts=[
            part("a1", "(a) B_n", "Values of B_n for n = 1 to 5", 1, kind="text", accepted=["4, 6, 8, 10, 12"]),
            part("a2", "(a) C_n and T_n", "Values of C_n and T_n for n = 1 to 5", 1, kind="text",
                 accepted=["C: 2, 6, 12, 20, 30; T: 6, 12, 20, 30, 42", "2,6,12,20,30 and 6,12,20,30,42"]),
            part("a3", "(a) B_n classification", "Classify B_n using differences", 1, kind="text",
                 accepted=["Linear/arithmetic, constant first difference 2"],
                 keywords=[["linear", "arithmetic"], ["first difference", "2", "constant"]], min_groups=2),
            part("a4", "(a) T_n classification", "Classify T_n using differences", 1, kind="text",
                 accepted=["Quadratic, first differences 6,8,10,12 and constant second difference 2"],
                 keywords=[["quadratic"], ["second difference", "2", "constant"]], min_groups=2),
            part("b1", "(b) formulas", "Expanded explicit formulas for B_n, C_n and T_n", 1, kind="expression",
                 accepted=["B_n=2n+2, C_n=n^2+n, T_n=n^2+3n+2", "(2n+2, n^2+n, n^2+3n+2)"]),
            part("b2", "(b) C_n formula", "Expanded formula for C_n", 1, kind="expression", accepted=["n^2+n", "n(n+1)"]),
            part("b3", "(b) equality", "Stage where C_n = B_n", 1, answer=2),
            part("c1", "(c) equation", "Quadratic equation formed from T_n = 210", 1, kind="expression",
                 accepted=["n^2+3n-208=0", "n^2+3n+2=210"]),
            part("c2", "(c) stage", "Stage requiring exactly 210 tiles", 2, answer=13),
        ],
    ))

    # ── Task 3 ─────────────────────────────────────────────────────────────
    qs.append(assess_question(
        33, sec="B", crit="C", marks=10, lvl="advanced", topic="Graphical & symbolic sequence communication",
        subtopic="classification, explicit and recursive rules, error analysis",
        number=3, question_label="B Q3",
        blocks=["**TASK 3 · CRITERION C — Communicating [10 marks]**",
                "**3. Graphical & symbolic sequence communication [10 mks]** Discrete sequences "
                "$P_n$ (−24, 12, −6, 3, −1.5) and $R_n$ (9, 4, 1, 0, 1) are plotted below:",
                graph_points([(1, -24), (2, 12), (3, -6), (4, 3), (5, -1.5)],
                             title="Panel I (P_n)", x_label="n", y_label="P_n", x_min=0, x_max=6,
                             y_min=-27, y_max=15),
                graph_points([(1, 9), (2, 4), (3, 1), (4, 0), (5, 1)],
                             title="Panel II (R_n)", x_label="n", y_label="R_n", x_min=0, x_max=6,
                             y_min=-1, y_max=10),
                "**(a)** **Classify** Panel I ($P_n$) and Panel II ($R_n$), citing one distinct visual feature from each coordinate graph. [3]\n"
                "**(b)** Using proper subscript notation, **state** both an explicit formula and a complete recursive definition "
                "(with initial term) for $P_n$ and $R_n$. [4]\n"
                "**(c)** To sum $8 + 13 + 18 + \\ldots + 93$, Malik writes $n = \\frac{93-8}{5} = 17$ and $S_{17} = 858.5$; "
                "to sum 6 terms of $5 + 10 + 20 + \\ldots$, Amina writes $S_6 = \\frac{5(1-2^5)}{1-2} = 155$. "
                "**Explain** each student's error and **compute** both correct sums. [3]"],
        explanation=(
            "(a) P_n is an alternating geometric sequence: points alternate in sign across the horizontal axis and halve in distance from zero (r = −1/2). "
            "R_n is quadratic: the points lie on a U-shaped parabola with minimum vertex at (4, 0) and symmetry R3 = R5 = 1.\n"
            "(b) P_n = −24(−1/2)^(n−1); P1 = −24, Pn+1 = −1/2 Pn. R_n = (n−4)^2 = n^2−8n+16; R1 = 9, Rn+1 = Rn + 2n − 7.\n"
            "(c) Malik omitted +1 when counting terms: from 8 + 5(n−1) = 93, n−1 = 17, so n = 18 and S18 = 9(8+93) = 909. "
            "Amina used n−1 = 5 as the exponent instead of the 6 terms: S6 = 5(2^6−1)/(2−1) = 315."
        ),
        marking_breakdown=[
            ("(a)", 3, "two classifications and visual features"), ("(b)", 4, "four rules"),
            ("(c)", 3, "two errors and two sums"),
        ],
        parts=[
            part("a1", "(a) P_n", "Classification of P_n and one distinct visual feature", 1, kind="text",
                 accepted=["Alternating geometric; points alternate above and below the n-axis while halving",
                           "Geometric with r=-1/2; the points alternate signs and halve"],
                 keywords=[["geometric", "alternating"], ["alternate", "sign", "halve", "axis"]], min_groups=2),
            part("a2", "(a) R_n", "Classification of R_n and one distinct visual feature", 1, kind="text",
                 accepted=["Quadratic; U-shaped parabola with minimum vertex (4,0) and symmetry R3=R5",
                           "Quadratic; points form a parabola with vertex at (4,0)"],
                 keywords=[["quadratic", "parabola"], ["vertex", "4", "0", "symmetry", "u-shaped"]], min_groups=2),
            part("a3", "(a) feature", "A second distinct visual feature supporting the classifications", 1, kind="text",
                 accepted=["P_n alternates in sign and halves; R_n has a minimum at (4,0)",
                           "The geometric terms approach zero and alternate; the quadratic is symmetric about n=4"],
                 keywords=[["halve", "zero", "alternate", "sign"], ["minimum", "symmetry", "vertex", "4"]], min_groups=2),
            part("b1", "(b) P explicit", "Explicit formula for P_n", 1, kind="expression", accepted=["-24(-1/2)^(n-1)", "-24*(-0.5)^(n-1)"]),
            part("b2", "(b) P recursive", "Recursive definition for P_n with initial term", 1, kind="text",
                 accepted=["P1=-24, Pn+1=(-1/2)Pn", "P_1 = -24, P_{n+1} = -0.5 P_n"]),
            part("b3", "(b) R explicit", "Explicit formula for R_n", 1, kind="expression", accepted=["(n-4)^2", "n^2-8n+16"]),
            part("b4", "(b) R recursive", "Recursive definition for R_n with initial term", 1, kind="text",
                 accepted=["R1=9, Rn+1=Rn+2n-7", "R_1 = 9, R_{n+1} = R_n + 2n - 7"]),
            part("c1", "(c) Malik error", "Malik's error", 1, kind="text",
                 accepted=["He omitted +1 when counting terms; there are 18 terms, not 17",
                           "n-1=17 so n=18 terms"],
                 keywords=[["18", "term"], ["+1", "count", "omitted"]], min_groups=2),
            part("c2", "(c) Malik sum", "Correct arithmetic sum", 1, answer=909),
            part("c3", "(c) Amina", "Amina's error and the correct geometric sum", 1, kind="text",
                 accepted=["She used exponent 5 instead of 6; S6 = 5(2^6-1) = 315",
                           "The exponent must be n=6; correct sum 315"],
                 keywords=[["exponent", "6", "n-1", "five"], ["315"]], min_groups=2),
        ],
    ))

    # ── Task 4 ─────────────────────────────────────────────────────────────
    qs.append(assess_question(
        34, sec="B", crit="D", marks=10, lvl="advanced", topic="Cotonou port cold-storage solar array & service plans",
        subtopic="geometric models and financial comparison",
        number=4, question_label="B Q4",
        blocks=["**TASK 4 · CRITERION D — Applying in real-life contexts [10 marks]**",
                "**4. Cotonou port cold-storage solar array & service plans [10 mks]** A Port of Cotonou cold-storage facility "
                "generates 600 MWh of solar electricity in Year 1, declining by 4% per year.",
                "**(a)** **State** the geometric ratio $r$, **calculate** Year 6 output $E_6$ (1 d.p.), and **compute** 10-year cumulative "
                "output $S_{10}$ (1 d.p.) against a 5 000 MWh target. [4]\n"
                "**(b)** Two 6-year maintenance contracts are offered: **Option X** costs 300 000 FCFA in Year 1 (+40 000 FCFA/yr); "
                "**Option Y** costs 220 000 FCFA in Year 1 (+25%/yr, r = 1.25). **Calculate** $S_6$ for both options (nearest FCFA). [4]\n"
                "**(c)** **Compare** 3-year totals ($S_3$) versus 6-year totals ($S_6$) and **recommend** the lower-cost option for each horizon. [2]"],
        explanation=(
            "(a) r = 0.96. E6 = 600(0.96)^5 = 489.2 MWh. S10 = 600(1−0.96^10)/0.04 = 5 027.5 MWh, which exceeds 5 000 MWh by 27.5 MWh.\n"
            "(b) X: S6 = 6/2[2(300000)+5(40000)] = 2 400 000 FCFA. Y: S6 = 220000(1.25^6−1)/0.25 = 2 476 934 FCFA.\n"
            "(c) S3,X = 3/2[600000+80000] = 1 020 000 FCFA; S3,Y = 880000(1.25^3−1) = 838 750 FCFA. Choose Y for 3 years (saves 181 250 FCFA); "
            "choose X for 6 years (saves 76 934 FCFA)."
        ),
        marking_breakdown=[
            ("(a) r", 1, ""), ("(a) E6", 1, ""), ("(a) S10", 1, "sum"), ("(a) target decision", 1, ""),
            ("(b) X", 2, "sum"), ("(b) Y", 2, "sum"),
            ("(c) S3", 1, "both options"), ("(c) recommendation", 1, "both horizons"),
        ],
        parts=[
            part("r", "(a) ratio", "Geometric ratio r", 1, answer=0.96),
            part("e6", "(a) E6", "Year 6 output (1 d.p.)", 1, answer=489.2, tolerance=0.05, unit="MWh"),
            part("s10", "(a) S10", "10-year cumulative output (1 d.p.)", 1, answer=5027.5, tolerance=0.05, unit="MWh"),
            part("target", "(a) target", "Does the 10-year output meet the 5 000 MWh target?", 1, kind="text",
                 accepted=["Yes, 5 027.5 MWh exceeds 5 000 MWh by 27.5 MWh", "Yes — target met with a 27.5 MWh surplus"],
                 keywords=[["yes", "meets", "exceeds"], ["5000", "5 000"], ["27.5", "surplus"]], min_groups=2),
            part("x", "(b) X", "Six-year total for Option X (nearest FCFA)", 2, answer=2400000, tolerance=0.5, unit="FCFA"),
            part("y", "(b) Y", "Six-year total for Option Y (nearest FCFA)", 2, answer=2476934, tolerance=1, unit="FCFA"),
            part("s3", "(c) S3", "Three-year totals for both options (nearest FCFA)", 1, kind="text",
                 accepted=["X = 1 020 000 FCFA; Y = 838 750 FCFA", "X 1 020 000, Y 838 750"]),
            part("rec", "(c) recommendation", "Recommendation for each horizon", 1, kind="text",
                 accepted=["Option Y for 3 years and Option X for 6 years",
                           "Choose Y for 3 years (saves 181 250) and X for 6 years (saves 76 934)"],
                 keywords=[["y", "3 year"], ["x", "6 year"]], min_groups=2),
        ],
    ))

    return qs
