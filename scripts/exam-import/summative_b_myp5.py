"""Grade 10 / MYP 5 Mathematics — Summative Assessment: Sequences and Series.

Source: "Grade_10_MYP_5_Mathematics_Summative_Assessment.pdf" (OAK
INTERNATIONAL SCHOOL, BENIN, End of First Term E-assessment 2026/27,
MYP 5 · Grade 10, 2 hours, 100 marks). 45 questions: Part A objective
(Q1–25, 30 marks) and Part B theory (printed Q1–20, 70 marks). Criterion
totals printed on the paper: A 32, B 24, C 20, D 24.

Part B of this paper restarts its numbering at 1; each Part B question
carries both its printed number (1–20) and its position in the paper
(26–45) so results line up with the printed script.
"""
from summative_b_common import data_table, diagram, doc, para, q

SOURCE = "myp5-sequences-and-series-summative-2026"

INSTRUCTIONS = (
    "Answer all 45 questions (25 Objective + 20 Theory). Part A (Q1–25): circle the letter (A, B, C or D) of "
    "the single correct option on this paper. Part B (Q1–20): write full algebraic working, sequence/difference "
    "tables, formulae and contextual reasoning in your separate answer booklet. A scientific calculator is "
    "permitted. Give non-exact numerical answers to 3 s.f. (2 d.p. for currency). Criteria (key at foot) & "
    "difficulty: basic, intermediate, advanced."
)

SECTIONS = [
    {"id": "A", "title": "Part A — Objective multiple-choice questions (Q1–25)", "questions": 25, "marks": 30,
     "instructions": "25 questions · 30 marks. Level 1 basic (Q1–10) 1 mark; Level 2 intermediate (Q11–20) "
                     "1 mark; Level 3 advanced (Q21–25) 2 marks. Circle A, B, C or D."},
    {"id": "B", "title": "Part B — Theory & problem-solving (Q1–20)", "questions": 20, "marks": 70,
     "instructions": "20 questions · 70 marks. Write full working, tables and reasoning in your answer booklet. "
                     "Task 1 = Criterion A (22), Task 2 = Criterion B (16), Task 3 = Criterion C (15), "
                     "Task 4 = Criterion D (17)."},
]

CRITERION_TOTALS = {"A": 32, "B": 24, "C": 20, "D": 24}


def _q9_figures():
    """Fig. n: one column of 2 dark dots plus n columns of 3 pale dots."""
    return diagram({
        "kind": "shape_pattern",
        "title": "Figure n",
        "patterns": [
            {"label": "Fig. 1 (5)",
             "columns": [{"count": 2, "shade": True}, {"count": 3, "shade": False}]},
            {"label": "Fig. 2 (8)",
             "columns": [{"count": 2, "shade": True}, {"count": 3, "shade": False}, {"count": 3, "shade": False}]},
            {"label": "Fig. 3 (11)",
             "columns": [{"count": 2, "shade": True}, {"count": 3, "shade": False},
                         {"count": 3, "shade": False}, {"count": 3, "shade": False}]},
        ],
    })


def _q7_courtyard():
    """Stage n is an (n + 1) × (n + 2) grid: pale L-border tiles around a green core."""
    return diagram({
        "kind": "grid_pattern",
        "title": "Courtyard tile pattern",
        "gridPatterns": [
            {"label": "Stage 1", "cols": 3, "rows": 2, "style": "core_border"},
            {"label": "Stage 2", "cols": 4, "rows": 3, "style": "core_border"},
            {"label": "Stage 3", "cols": 5, "rows": 4, "style": "core_border"},
        ],
    })


def _q18_crates():
    """Crate n holds un = n² + 4n + 3 pipes in (n + 1) × (n + 3) layers."""
    return diagram({
        "kind": "grid_pattern",
        "title": "Stacked pipe crates",
        "gridPatterns": [
            {"label": "Crate 1 (8)", "cols": 4, "rows": 2, "style": "solid"},
            {"label": "Crate 2 (15)", "cols": 5, "rows": 3, "style": "solid"},
        ],
    })


def build():
    Q = []

    # ── LEVEL 1 · BASIC · Q1–10 · 1 mark each ────────────────────────────────
    Q.append(q(1, sec="A", crit="A", marks=1, lvl="basic", topic="Sequences and series",
               subtopic="sequence vs series",
               blocks=[para("Which mathematical expression represents a finite arithmetic series?")],
               opts=["4, 9, 14, 19, 24", "4 + 9 + 14 + 19 + 24", "4 + 8 + 16 + 32 + 64", "$u_n = 5n - 1$"],
               ans="B",
               expl="A series is the sum of the terms of a sequence, so it is written with plus signs. "
                    "Option A is a sequence, C is a geometric series and D is an explicit formula."))

    Q.append(q(2, sec="A", crit="A", marks=1, lvl="basic", topic="Arithmetic sequences",
               subtopic="common difference and a later term",
               blocks=[para("For the linear sequence 19, 13, 7, 1, …, state the common difference $d$ and the "
                            "5th term $u_5$.")],
               opts=[r"$d = 6$, $u_5 = -5$", r"$d = -6$, $u_5 = -5$", r"$d = -6$, $u_5 = -6$",
                     r"$d = \dfrac{13}{19}$, $u_5 = -5$"], ans="B",
               expl=r"$d = 13 - 19 = -6$, so $u_5 = 1 + (-6) = -5$."))

    Q.append(q(3, sec="A", crit="A", marks=1, lvl="basic", topic="Geometric sequences",
               subtopic="first term and common ratio",
               blocks=[para("Identify the first term $u_1$ and common ratio $r$ of the geometric sequence 96, "
                            "$−48$, 24, $−12$, …")],
               opts=[r"$u_1 = 96$, $r = -\dfrac{1}{2}$", r"$u_1 = 96$, $r = \dfrac{1}{2}$",
                     r"$u_1 = 96$, $r = -2$", r"$u_1 = -48$, $r = -\dfrac{1}{2}$"], ans="A",
               expl=r"$u_1 = 96$ and $r = \frac{-48}{96} = -\frac{1}{2}$. The alternating signs come from the "
                    r"negative ratio."))

    Q.append(q(4, sec="A", crit="A", marks=1, lvl="basic", topic="Quadratic sequences",
               subtopic="evaluating an explicit formula",
               blocks=[para("A sequence has explicit formula $u_n = 2n^2 - 5n + 1$. Calculate $u_6$.")],
               opts=["13", "41", "43", "115"], ans="C",
               expl="$u_6 = 2(36) - 5(6) + 1 = 72 - 30 + 1 = 43$."))

    Q.append(q(5, sec="A", crit="A", marks=1, lvl="basic", topic="Recursive rules",
               subtopic="generating terms recursively",
               blocks=[para("Given the recursive rule $u_1 = 3$ and $u_{n+1} = 2u_n - 1$ $(n \\ge 1)$, find $u_4$.")],
               opts=["9", "11", "15", "17"], ans="D",
               expl="$u_2 = 2(3) - 1 = 5$, $u_3 = 2(5) - 1 = 9$, $u_4 = 2(9) - 1 = 17$."))

    Q.append(q(6, sec="A", crit="B", marks=1, lvl="basic", topic="Classifying sequences",
               subtopic="second differences",
               blocks=[para("How is the sequence 3, 8, 15, 24, 35, … best classified?")],
               opts=["Linear", "Geometric", "Quadratic", "Constant"], ans="C",
               expl="First differences are 5, 7, 9, 11 and the second differences are constant at 2, which is "
                    "the signature of a quadratic sequence."))

    Q.append(q(7, sec="A", crit="C", marks=1, lvl="basic", topic="Communicating formulae",
               subtopic="recursive vs explicit",
               blocks=[para("Which statement correctly distinguishes a recursive formula from an explicit "
                            "formula?")],
               opts=["Gives $u_n$ directly in $n$",
                     "Relates $u_{n+1}$ to prior term(s) plus $u_1$",
                     "Applies only to linear rules",
                     "Computes the sum $S_n$"], ans="B",
               expl="A recursive formula defines each new term from the term(s) before it and must state the "
                    "initial term $u_1$; giving $u_n$ directly in $n$ is what an explicit formula does."))

    Q.append(q(8, sec="A", crit="A", marks=1, lvl="basic", topic="Arithmetic sequences",
               subtopic="missing terms",
               blocks=[para("Find the missing terms $x$ and $y$ in the arithmetic sequence 7, $x$, $y$, 28.")],
               opts=["12, 20", "13, 22", "14, 21", "10.5, 17.5"], ans="C",
               expl=r"$d = \frac{28 - 7}{3} = 7$, so the sequence is 7, 14, 21, 28 and $x = 14$, $y = 21$."))

    Q.append(q(9, sec="A", crit="B", marks=1, lvl="basic", topic="Patterns to formulae",
               subtopic="dot pattern to explicit formula",
               blocks=[para("Which explicit formula gives the total number of dots $u_n$ in Figure $n$?"),
                       _q9_figures()],
               opts=["$u_n = 5n$", "$u_n = 3n + 2$", "$u_n = 2n + 3$", "$u_n = n^2 + 4$"], ans="B",
               expl="Each figure keeps the same column of 2 dark dots and adds one more column of 3 pale dots, "
                    "so $u_n = 2 + 3n$. Check: $u_1 = 5$, $u_2 = 8$, $u_3 = 11$."))

    Q.append(q(10, sec="A", crit="A", marks=1, lvl="basic", topic="Arithmetic series",
               subtopic="sum from first and last term",
               blocks=[para("An arithmetic series has $u_1 = 6$, $u_{20} = 63$ and $n = 20$ terms. Calculate "
                            "$S_{20}$.")],
               opts=["630", "1260", "1380", "690"], ans="D",
               expl=r"$S_n = \frac{n}{2}(u_1 + u_n) = \frac{20}{2}(6 + 63) = 10 \times 69 = 690$."))

    # ── LEVEL 2 · INTERMEDIATE · Q11–20 · 1 mark each ────────────────────────
    Q.append(q(11, sec="A", crit="C", marks=1, lvl="intermediate", topic="Communicating formulae",
               subtopic="recursive to explicit",
               blocks=[para("Convert $u_1 = 12$, $u_{n+1} = u_n - 4$ $(n \\ge 1)$ into an equivalent explicit "
                            "formula.")],
               opts=["$u_n = 16 - 4n$", "$u_n = 12 - 4n$", r"$u_n = 12(-4)^{n-1}$", "$u_n = 4n + 8$"], ans="A",
               expl=r"This is arithmetic with $u_1 = 12$ and $d = -4$, so $u_n = 12 + (n - 1)(-4) = 16 - 4n$."))

    Q.append(q(12, sec="A", crit="C", marks=1, lvl="intermediate", topic="Communicating formulae",
               subtopic="complete recursive specification",
               blocks=[para("Select the complete recursive specification for 5, 15, 45, 135, …")],
               opts=["$u_n = 5(3)^{n-1}$", "$u_1 = 5$, $u_{n+1} = u_n + 10$", "$u_1 = 5$, $u_{n+1} = 3u_n$",
                     "$u_{n+1} = 3u_n$ (no $u_1$)"], ans="C",
               expl="A complete recursive rule needs both the initial term and the recurrence. Here $u_1 = 5$ "
                    "and each term is multiplied by 3. Option A is explicit and D is incomplete."))

    Q.append(q(13, sec="A", crit="B", marks=1, lvl="intermediate", topic="Quadratic sequences",
               subtopic="second difference and the coefficient a",
               blocks=[para("The table shows a quadratic sequence $u_n = an^2 + bn + c$:"),
                       data_table(["$n$", "1", "2", "3", "4"], [["$u_n$", "4", "13", "28", "49"]]),
                       para("State the constant second difference and the value of $a$.")],
               opts=["2nd diff = 6, $a = 6$", "2nd diff = 9, $a = 3$", "2nd diff = 3, $a = 6$",
                     "2nd diff = 6, $a = 3$"], ans="D",
               expl="First differences are 9, 15, 21 and the constant second difference is 6. Since the second "
                    "difference equals $2a$, we get $a = 3$."))

    Q.append(q(14, sec="A", crit="B", marks=1, lvl="intermediate", topic="Quadratic sequences",
               subtopic="general term from differences",
               blocks=[para("Find the general term $u_n$ of the quadratic sequence 2, 7, 14, 23, 34, …")],
               opts=["$u_n = n^2 + 2n - 1$", "$u_n = 2n^2$", "$u_n = n^2 + 1$", "$u_n = n^2 + 5n - 4$"], ans="A",
               expl="First differences 5, 7, 9, 11 give a constant second difference of 2, so $a = 1$. Solving "
                    "$1 + b + c = 2$ and $4 + 2b + c = 7$ gives $b = 2$, $c = -1$, so $u_n = n^2 + 2n - 1$."))

    Q.append(q(15, sec="A", crit="A", marks=1, lvl="intermediate", topic="Arithmetic sequences",
               subtopic="finding a distant term from two terms",
               blocks=[para("In an arithmetic sequence, $u_4 = 17$ and $u_{10} = 41$. Calculate $u_{25}$.")],
               opts=["97", "100", "101", "105"], ans="C",
               expl=r"$d = \frac{41 - 17}{10 - 4} = 4$ and $u_1 = 17 - 3 \times 4 = 5$, so "
                    r"$u_{25} = 5 + 24 \times 4 = 101$."))

    Q.append(q(16, sec="A", crit="A", marks=1, lvl="intermediate", topic="Geometric sequences",
               subtopic="first term and ratio from two terms",
               blocks=[para("A geometric sequence of positive terms has $u_2 = 12$ and $u_5 = 324$. Find $u_1$ "
                            "and $r$.")],
               opts=["$u_1 = 3$, $r = 4$", "$u_1 = 4$, $r = 3$", "$u_1 = 6$, $r = 2$", "$u_1 = 4$, $r = 9$"],
               ans="B",
               expl=r"$r^3 = \frac{324}{12} = 27$, so $r = 3$ and $u_1 = \frac{12}{3} = 4$."))

    Q.append(q(17, sec="A", crit="D", marks=1, lvl="intermediate", topic="Arithmetic series in context",
               subtopic="sum of a decreasing arithmetic series",
               blocks=[para("A tapered wall has 35 bricks in Row 1, decreasing by 3 bricks per row up to 11 "
                            "bricks in Row 9. Find the total bricks in all 9 rows.")],
               opts=["184", "198", "216", "207"], ans="D",
               expl=r"$S_9 = \frac{9}{2}(35 + 11) = \frac{9}{2} \times 46 = 207$ bricks."))

    Q.append(q(18, sec="A", crit="A", marks=1, lvl="intermediate", topic="Geometric series",
               subtopic="sum of the first n terms",
               blocks=[para("Find the sum $S_7$ of the first 7 terms of the geometric series 3 + 6 + 12 + 24 + …")],
               opts=["192", "378", "381", "765"], ans="C",
               expl=r"With $a = 3$ and $r = 2$: $S_7 = \frac{3(2^7 - 1)}{2 - 1} = 3 \times 127 = 381$."))

    Q.append(q(19, sec="A", crit="D", marks=1, lvl="intermediate", topic="Arithmetic sequences in context",
               subtopic="solving for the term number",
               blocks=[para("A solar array generates 18 kWh on Day 1 and increases by 2.5 kWh each day. On which "
                            "day does daily output equal 53 kWh?")],
               opts=["Day 14", "Day 15", "Day 16", "Day 21"], ans="B",
               expl=r"$18 + 2.5(n - 1) = 53 \Rightarrow 2.5(n - 1) = 35 \Rightarrow n - 1 = 14 \Rightarrow "
                    r"n = 15$."))

    Q.append(q(20, sec="A", crit="D", marks=1, lvl="intermediate", topic="Geometric sequences in context",
               subtopic="repeated percentage decay",
               blocks=[para("Water enters a purifier at 500 mg/L. Each filter pass removes 20 % of remaining "
                            "impurities ($u_1 = 400$ mg/L after 1 pass). Find $u_3$.")],
               opts=["256 mg/L", "200 mg/L", "320 mg/L", "204.8 mg/L"], ans="A",
               expl=r"Each pass keeps 80 %, so $r = 0.8$ and $u_n = 400(0.8)^{n-1}$. Hence "
                    r"$u_3 = 400(0.8)^2 = 256$ mg/L."))

    # ── LEVEL 3 · ADVANCED · Q21–25 · 2 marks each ───────────────────────────
    Q.append(q(21, sec="A", crit="B", marks=2, lvl="advanced", topic="Geometric sequences",
               subtopic="solving for an unknown term in a geometric sequence",
               blocks=[para("Consecutive terms $k - 1$, $k + 3$, $3k + 1$ form a geometric sequence with $r > 1$. "
                            "Find $k$ and $r$.")],
               opts=["$k = -1$, $r = -1$", "$k = 3$, $r = 3$", "$k = 5$, $r = 2$", "$k = 5$, $r = 4$"], ans="C",
               expl=r"$\frac{k+3}{k-1} = \frac{3k+1}{k+3} \Rightarrow (k+3)^2 = (k-1)(3k+1) \Rightarrow "
                    r"k^2 - 4k - 5 = 0$, so $k = 5$ or $k = -1$. With $r > 1$, $k = 5$ gives the terms 4, 8, 16 "
                    r"and $r = 2$."))

    Q.append(q(22, sec="A", crit="D", marks=2, lvl="advanced", topic="Arithmetic series in context",
               subtopic="solving for the number of terms",
               blocks=[para("An amphitheatre has 24 seats in Row 1, 28 in Row 2, 32 in Row 3, and so on. How many "
                            "rows give a total capacity of 780 seats?")],
               opts=["14", "15", "16", "18"], ans="B",
               expl=r"With $a = 24$ and $d = 4$: $S_n = \frac{n}{2}(48 + 4(n-1)) = 2n^2 + 22n = 780$, so "
                    r"$n^2 + 11n - 390 = 0$ and $(n + 26)(n - 15) = 0$, giving $n = 15$ rows."))

    Q.append(q(23, sec="A", crit="C", marks=2, lvl="advanced", topic="Geometric series",
               subtopic="sigma notation and exact sums",
               blocks=[para("Evaluate the exact value of the finite geometric series "
                            r"$\displaystyle\sum_{k=1}^{6} 243\left(\frac{2}{3}\right)^{k-1}$.")],
               opts=["633", "729", r"$\dfrac{1330}{3}$", "665"], ans="D",
               expl=r"With $a = 243$, $r = \frac{2}{3}$ and $n = 6$: "
                    r"$S_6 = \frac{243\left(1 - (\frac{2}{3})^6\right)}{1 - \frac{2}{3}} = 729\left(1 - "
                    r"\frac{64}{729}\right) = 729 - 64 = 665$."))

    Q.append(q(24, sec="A", crit="B", marks=2, lvl="advanced", topic="Recursive rules",
               subtopic="recursive rule to explicit quadratic formula",
               blocks=[para("A sequence satisfies $u_1 = 4$ and $u_{n+1} = u_n + 2n + 3$ for $n \\ge 1$. Which "
                            "explicit quadratic formula defines $u_n$?")],
               opts=["$u_n = n^2 + 2n + 1$", "$u_n = n^2 + 3$", "$u_n = 2n^2 + 2$", "$u_n = n^2 + 3n$"], ans="A",
               expl="$u_2 = 4 + 5 = 9$, $u_3 = 9 + 7 = 16$, $u_4 = 16 + 9 = 25$, giving 4, 9, 16, 25 = "
                    "$(n + 1)^2 = n^2 + 2n + 1$."))

    Q.append(q(25, sec="A", crit="D", marks=2, lvl="advanced", topic="Comparing series in context",
               subtopic="arithmetic vs geometric savings",
               blocks=[para("Plan A saves 10 000 FCFA in Month 1, adding 5 000 FCFA each month. Plan B saves "
                            "2 000 FCFA in Month 1, doubling each month. Compare 6-month totals ($S_6$).")],
               opts=["Plan B exceeds A by 9 000", "Equal at 135 000 FCFA", "Plan A exceeds B by 9 000",
                     "Plan B exceeds A by 2 000"], ans="C",
               expl=r"Plan A: $S_6 = \frac{6}{2}(10\,000 + 35\,000) = 135\,000$ FCFA. Plan B: "
                    r"$S_6 = \frac{2\,000(2^6 - 1)}{2 - 1} = 126\,000$ FCFA. Plan A exceeds Plan B by "
                    r"9 000 FCFA."))

    # ── PART B · TASK 1 · CRITERION A ────────────────────────────────────────
    Q.append(q(26, number=1, sec="B", crit="A", marks=3, lvl="basic", topic="Sequences",
               subtopic="explicit and recursive generation", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Show each substitution for (a) and each recursive step for (b).",
               blocks=[para("Explicit & recursive term generation [3 marks]"),
                       para("(a) Sequence A has explicit rule $u_n = 3n^2 - 2n + 4$. Calculate $u_1$, $u_3$ and "
                            "$u_8$. [1]"),
                       para("(b) Sequence B satisfies $v_1 = 6$ and $v_{n+1} = \\frac{1}{2}v_n + 5$ $(n \\ge 1)$. "
                            "Generate $v_2$, $v_3$ and $v_4$, showing each step. [2]")],
               parts=[("(a)", 1, "Three terms from an explicit rule"), ("(b)", 2, "Three recursive steps")]))

    Q.append(q(27, number=2, sec="B", crit="A", marks=3, lvl="basic", topic="Arithmetic sequences",
               subtopic="formula and a negative term", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Derive the explicit formula, then solve for the term number.",
               blocks=[para("Linear sequence analysis [3 marks] A linear sequence begins 46, 39, 32, 25, …"),
                       para("(a) State $u_1$ and $d$, and derive the simplified explicit formula for $u_n$. [2]"),
                       para("(b) Find which term equals $−45$, and state the value of the first negative term. "
                            "[1]")],
               parts=[("(a)", 2, "Explicit formula"), ("(b)", 1, "Term number and first negative term")]))

    Q.append(q(28, number=3, sec="B", crit="A", marks=4, lvl="intermediate", topic="Arithmetic sequences",
               subtopic="simultaneous equations and a sum", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Form two equations, solve them, then sum the series.",
               blocks=[para("Simultaneous arithmetic sequence & series [4 marks] An arithmetic sequence has "
                            "$u_5 = 23$ and $u_{12} = 58$."),
                       para("(a) Form and solve simultaneous equations to find $u_1$ and common difference $d$. "
                            "[2]"),
                       para("(b) Calculate the sum $S_{20}$ of the first 20 terms of the arithmetic series. [2]")],
               parts=[("(a)", 2, "Simultaneous equations"), ("(b)", 2, "Sum of 20 terms")]))

    Q.append(q(29, number=4, sec="B", crit="A", marks=4, lvl="intermediate", topic="Geometric sequences",
               subtopic="alternating geometric sequence", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Find r and u1, state the explicit formula, then justify the membership test "
                        "algebraically.",
               blocks=[para("Alternating geometric sequence [4 marks] A geometric sequence has $u_2 = -24$ and "
                            "$u_5 = 192$."),
                       para("(a) Determine the common ratio $r$, the first term $u_1$, and the explicit formula "
                            "$u_n$. [2]"),
                       para("(b) Calculate $u_8$ and justify algebraically whether $−3072$ is a term of this "
                            "sequence. [2]")],
               parts=[("(a)", 2, "Ratio, first term and formula"), ("(b)", 2, "u8 and membership test")]))

    Q.append(q(30, number=5, sec="B", crit="A", marks=4, lvl="intermediate", topic="Quadratic sequences",
               subtopic="differences and solving for n", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Build first and second differences, state un, then evaluate and solve.",
               blocks=[para("Quadratic sequence from differences [4 marks] The first five terms of a quadratic "
                            "sequence $u_n = an^2 + bn + c$ are tabulated below:"),
                       data_table(["Term $n$", "1", "2", "3", "4", "5"],
                                  [["Value $u_n$", "4", "9", "18", "31", "48"]]),
                       para("(a) Construct first and second differences to find $a$, $b$ and $c$, stating $u_n$. "
                            "[2]"),
                       para("(b) Calculate $u_{12}$ and solve for the term number $n$ where $u_n = 193$. [2]")],
               parts=[("(a)", 2, "Coefficients and formula"), ("(b)", 2, "u12 and solving for n")]))

    Q.append(q(31, number=6, sec="B", crit="A", marks=4, lvl="intermediate", topic="Finite series",
               subtopic="arithmetic and geometric sums", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Find n first for each series, then evaluate the exact sum.",
               blocks=[para("Evaluating finite series [4 marks] Find the number of terms $n$ and evaluate the "
                            "exact sum $S_n$ of each finite series:"),
                       para("(a) Arithmetic series: 5 + 11 + 17 + … + 119. [2]"),
                       para("(b) Finite geometric series: 320 + 160 + 80 + … + 5. [2]")],
               parts=[("(a)", 2, "Arithmetic series"), ("(b)", 2, "Geometric series")]))

    # ── PART B · TASK 2 · CRITERION B ────────────────────────────────────────
    Q.append(q(32, number=7, sec="B", crit="B", marks=4, lvl="intermediate", topic="Patterns",
               subtopic="courtyard tile pattern", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Extend the table to Stage 4, classify Bn and Tn by differences, then verify the "
                        "identity algebraically.",
               blocks=[para("Courtyard tile pattern [4 marks] Stage $n$ is an $(n + 1) \\times (n + 2)$ grid of "
                            "green core tiles ($C_n$) and pale L-border tiles ($B_n$)."),
                       _q7_courtyard(),
                       data_table(["Stage $n$", "1", "2", "3", "4"],
                                  [["Border $B_n$ / Core $C_n$ / Total $T_n$", "4 / 2 / 6", "6 / 6 / 12",
                                    "8 / 12 / 20", "? / ? / ?"]]),
                       para("(a) Find $B_4$, $C_4$ and $T_4$ for Stage 4. [1]"),
                       para("(b) Classify $B_n$ and $T_n$ using differences and derive explicit rules in $n$. [2]"),
                       para("(c) Verify $C_n + B_n = T_n$ algebraically and find $n$ when $T_n = 210$. [1]")],
               parts=[("(a)", 1, "Stage 4 values"), ("(b)", 2, "Classification and rules"),
                      ("(c)", 1, "Identity and solving for n")]))

    Q.append(q(33, number=8, sec="B", crit="B", marks=4, lvl="intermediate", topic="Patterns",
               subtopic="recovering a sequence from partial sums", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Tabulate the partial sums, deduce the terms, then prove the result algebraically.",
               blocks=[para("Recovering a sequence from partial sums [4 marks] A sequence has partial sums "
                            "$S_n = 3n^2 + 4n$ for all $n \\ge 1$."),
                       para("(a) Compute $S_1$, $S_2$, $S_3$, $S_4$ and deduce individual terms $u_1$, $u_2$, "
                            "$u_3$, $u_4$. [2]"),
                       para("(b) Using $u_n = S_n - S_{n-1}$ $(n \\ge 2)$, prove algebraically that $\\{u_n\\}$ is "
                            "arithmetic and state $u_n$ and $d$. [2]")],
               parts=[("(a)", 2, "Partial sums and terms"), ("(b)", 2, "Algebraic proof")]))

    Q.append(q(34, number=9, sec="B", crit="B", marks=4, lvl="advanced", topic="Patterns",
               subtopic="affine recurrence investigation", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Generate the terms and first differences, then use the substitution to prove the closed "
                        "form.",
               blocks=[para("Affine recursive investigation [4 marks] Investigate the recursive relationship: "
                            "$u_1 = 5 \\ \\rightarrow\\ u_{n+1} = 3u_n - 4$ (for $n \\ge 1$)"),
                       para("(a) Find $u_2$, $u_3$, $u_4$ and show the first differences $\\Delta u_n = u_{n+1} - "
                            "u_n$ form a geometric sequence. [2]"),
                       para("(b) Let $v_n = u_n - 2$. Prove $v_{n+1} = 3v_n$ and deduce the explicit formula for "
                            "$u_n$. [2]")],
               parts=[("(a)", 2, "Terms and geometric differences"), ("(b)", 2, "Proof and closed form")]))

    Q.append(q(35, number=10, sec="B", crit="B", marks=4, lvl="advanced", topic="Patterns",
               subtopic="arithmetic vs geometric growth", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Give both formulae with initial terms, tabulate n = 1..5, then explain the comparison.",
               blocks=[para("Arithmetic vs geometric growth [4 marks] Arithmetic sequence $P_n$ and geometric "
                            "sequence $Q_n$ share first two terms $P_1 = Q_1 = 8$ and $P_2 = Q_2 = 12$."),
                       para("(a) Write explicit and recursive formulae (with initial terms) for $P_n$ and $Q_n$. "
                            "[2]"),
                       para("(b) Tabulate $n = 1..5$, evaluate $(Q_5 - P_5) / P_5$, and explain why $Q_n > P_n$ "
                            "for all $n \\ge 3$. [2]")],
               parts=[("(a)", 2, "Four formulae"), ("(b)", 2, "Table and explanation")]))

    # ── PART B · TASK 3 · CRITERION C ────────────────────────────────────────
    Q.append(q(36, number=11, sec="B", crit="C", marks=3, lvl="basic", topic="Communicating mathematics",
               subtopic="sequence vs series and sigma notation", qtype="open_ended",
               tools=["rich_text", "math"],
               guidance="Give one symbolic example of each, then show how the upper limit is found.",
               blocks=[para("Sequence vs series & summation notation [3 marks]"),
                       para("(a) Explain clearly, giving one symbolic example of each, the difference between a "
                            "geometric sequence and a finite geometric series. [2]"),
                       para("(b) Write 9 + 13 + 17 + … + 45 in sigma ($\\Sigma$) notation, showing how the upper "
                            "limit is found. [1]")],
               parts=[("(a)", 2, "Explanation with examples"), ("(b)", 1, "Sigma notation")]))

    Q.append(q(37, number=12, sec="B", crit="C", marks=3, lvl="basic", topic="Communicating mathematics",
               subtopic="recursive and explicit rules", qtype="open_ended",
               tools=["rich_text", "math"],
               guidance="Use proper subscript notation for both forms, then explain the missing initial term.",
               blocks=[para("Communicating explicit & recursive rules [3 marks] Consider $−5$, $−1$, 3, 7, 11, …"),
                       para("(a) Write both a complete recursive definition and a simplified explicit formula "
                            "using proper subscript notation. [2]"),
                       para("(b) Explain why writing $u_{n+1} = u_n + 4$ without $u_1$ fails to define a unique "
                            "sequence. [1]")],
               parts=[("(a)", 2, "Two forms"), ("(b)", 1, "Why u1 is needed")]))

    Q.append(q(38, number=13, sec="B", crit="C", marks=3, lvl="intermediate", topic="Communicating mathematics",
               subtopic="constant second-difference proof", qtype="open_ended",
               tools=["rich_text", "math"],
               guidance="Expand and simplify the first difference, then use it to prove the constant second "
                        "difference.",
               blocks=[para("Proving the constant second-difference property [3 marks] Let $u_n = an^2 + bn + c$ "
                            "($a \\ne 0$)."),
                       para("(a) Expand and simplify the first difference $u_{n+1} - u_n$ in terms of $a$, $b$ "
                            "and $n$. [2]"),
                       para("(b) Hence prove $(u_{n+2} - u_{n+1}) - (u_{n+1} - u_n) = 2a$ and explain why it is "
                            "constant. [1]")],
               parts=[("(a)", 2, "First difference"), ("(b)", 1, "Second difference proof")]))

    Q.append(q(39, number=14, sec="B", crit="C", marks=3, lvl="intermediate", topic="Communicating mathematics",
               subtopic="critiquing a flawed calculation", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Name the error in r, explain the bound from the alternating terms, then present a "
                        "structured exact calculation.",
               blocks=[para("Critiquing a flawed series calculation [3 marks] To sum 6 terms of 100 − 50 + 25 − "
                            r"12.5 + …, Kofi writes: “$r = 0.5$, so $S_6 = \frac{100(1 - 0.5^6)}{1 - 0.5} = "
                            r"196.875$.”"),
                       para("(a) Identify Kofi's error in $r$ and explain from the alternating terms why "
                            "$S_6 < 100$. [1]"),
                       para("(b) Present a clearly structured calculation of the exact value of $S_6$ (fraction "
                            "& decimal). [2]")],
               parts=[("(a)", 1, "The error and the bound"), ("(b)", 2, "Exact value of S6")]))

    Q.append(q(40, number=15, sec="B", crit="C", marks=3, lvl="intermediate", topic="Communicating mathematics",
               subtopic="classification with justification", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Justify each classification with differences or ratios, then give the exact fifth term.",
               blocks=[para("Multi-sequence classification & justification [3 marks]"),
                       data_table(["ID", "First four terms ($u_1$, $u_2$, $u_3$, $u_4$)"],
                                  [["Seq I", r"18,  12,  8,  $\dfrac{16}{3}$"],
                                   ["Seq II", "5,  9,  15,  23"],
                                   ["Seq III", "22,  15,  8,  1"]]),
                       para("(a) Classify each sequence as linear/arithmetic, quadratic, or geometric, justifying "
                            "with differences or ratios. [2]"),
                       para("(b) State the exact fifth term $u_5$ of each sequence. [1]")],
               parts=[("(a)", 2, "Classification with justification"), ("(b)", 1, "Fifth terms")]))

    # ── PART B · TASK 4 · CRITERION D ────────────────────────────────────────
    Q.append(q(41, number=16, sec="B", crit="D", marks=3, lvl="intermediate", topic="Applying mathematics",
               subtopic="arithmetic series in a budget", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Find the cost of the 20th metre, then the total, and compare with the grant.",
               blocks=[para("Deep-borehole drilling budget [3 marks] Drilling in northern Benin costs 35 000 FCFA "
                            "for the 1st metre, increasing by 4 500 FCFA for each deeper metre."),
                       para("(a) Calculate the cost of drilling the 20th metre alone ($u_{20}$). [1]"),
                       para("(b) Find the total cost of a 20 m borehole ($S_{20}$) and state whether a "
                            "1 600 000 FCFA grant suffices. [2]")],
               parts=[("(a)", 1, "Cost of the 20th metre"), ("(b)", 2, "Total cost and grant check")]))

    Q.append(q(42, number=17, sec="B", crit="D", marks=4, lvl="intermediate", topic="Applying mathematics",
               subtopic="geometric depreciation", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="State r and the formula, evaluate V5 to 2 d.p., then find the replacement year with "
                        "justification.",
               # A stray $ before "40 000" swallowed a whole clause into a maths
               # node: the candidate saw prose set as an equation. Only the
               # value 34 000 is mathematics.
               blocks=[para("Medical scanner depreciation [4 marks] A clinic buys an ultrasound scanner for "
                            "40 000. Its value drops by 15 % per year ($V_1 = 34\\,000$ after 1 year)."),
                       para("(a) State $r$, write an explicit formula for $V_n$ (after $n$ years), and find $V_5$ "
                            "to 2 d.p. [2]"),
                       para("(b) Clinic policy replaces the unit at the end of the first year its value falls "
                            "below 12 000. Find that year, justifying clearly. [2]")],
               parts=[("(a)", 2, "Ratio, formula and V5"), ("(b)", 2, "Replacement year")]))

    Q.append(q(43, number=18, sec="B", crit="D", marks=3, lvl="intermediate", topic="Applying mathematics",
               subtopic="quadratic model in context", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Verify u1, u2, u3, interpret the first difference in context, then solve and explain.",
               blocks=[para("Stacked pipe crates [3 marks] Port Crate $n$ holds $u_n = n^2 + 4n + 3$ concrete "
                            "pipes in $(n + 1) \\times (n + 3)$ layers."),
                       _q18_crates(),
                       para("(a) Verify $u_1$, $u_2$, $u_3$ and interpret $u_{n+1} - u_n$ in context. [1]"),
                       para("(b) Find which crate holds 143 pipes and explain why no single crate holds 130 "
                            "pipes. [2]")],
               parts=[("(a)", 1, "Verification and interpretation"), ("(b)", 2, "Solving and explaining")]))

    Q.append(q(44, number=19, sec="B", crit="D", marks=4, lvl="advanced", topic="Applying mathematics",
               subtopic="annuity as a geometric series", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Explain the series and state u1, r and n, then calculate the balance and the interest.",
               blocks=[para("Scholarship endowment annuity [4 marks] An alumni body invests 5 000 at the start "
                            "of each year for 8 years at 6 % compound interest per annum."),
                       para("(a) Explain why the total at the end of Year 8 equals $5000(1.06) + 5000(1.06)^2 + "
                            "… + 5000(1.06)^8$, stating $u_1$, $r$ and $n$. [2]"),
                       para("(b) Calculate the end-of-Year-8 balance (to 2 d.p.) and the total interest earned. "
                            "[2]")],
               parts=[("(a)", 2, "Structure of the series"), ("(b)", 2, "Balance and interest")]))

    Q.append(q(45, number=20, sec="B", crit="D", marks=3, lvl="intermediate", topic="Applying mathematics",
               subtopic="comparing two salary contracts", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Compute both 10-month totals to the nearest FCFA, then advise each intern with figures.",
               blocks=[para("Comparing internship salary contracts [3 marks] Over a 10-month placement, Contract "
                            "X pays 150 000 FCFA in Month 1 (+20 000 FCFA/month); Contract Y pays 100 000 FCFA in "
                            "Month 1 (+20 % per month, $r = 1.20$)."),
                       para("(a) Calculate total 10-month earnings ($S_{10}$) under Contract X and Contract Y "
                            "(nearest FCFA). [2]"),
                       para("(b) Advise a 10-month intern vs an intern leaving after 5 months, with figures. [1]")],
               parts=[("(a)", 2, "Two 10-month totals"), ("(b)", 1, "Advice with figures")]))

    return Q
