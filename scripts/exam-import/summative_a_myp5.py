"""Grade 10 / MYP 5 Mathematics — Summative Assessment: Sequences and Series (Version B).

Sources: "GRADE 10 exam 1st term.pdf" (student paper, 2 pages, 35 questions,
100 marks) and "GRADE 10 exam 1st term answer version B.pdf" (official teacher
marking scheme, 4 pages). OAK INTERNATIONAL SCHOOL, BENIN, End of First Term
E-assessment 2026/27, MYP 5 · Grade 10, 2 hours.

Structure is the source's own: Part A Q1–19 (30 marks) and Part B printed
Q1–16 (70 marks). Part B restarts its numbering, so each Part B question
stores both its printed number (1–16) and its position in the paper (20–35).
Criterion totals printed by the paper: A 32, B 24, C 20, D 24.

Every key, criterion, level and mark is the one printed in the marking
scheme. All questions and options are the student paper's own wording.
"""
from summative_b_common import data_table, doc, graph_figure, para, q

SOURCE = "myp5-term1-sequences-series-version-b-2026"

INSTRUCTIONS = (
    "Answer all 35 questions (19 Part A + 16 Part B). Part A (Q1–19): circle the correct letter "
    "(A, B, C or D) or plot/write directly in the spaces provided on this paper. Part B (Q1–16): write "
    "complete algebraic working, difference tables, coordinate graphs and contextual justifications in your "
    "separate answer booklet. A scientific calculator is permitted. Give non-exact answers to 3 s.f. "
    "(2 d.p. for currency). Criteria (key at foot) & difficulty: basic, intermediate, advanced."
)

SECTIONS = [
    {"id": "A", "title": "Part A — Objective & graphical questions (Q1–Q19)", "questions": 19, "marks": 30,
     "instructions": "19 questions · 30 marks. Level 1 basic (Q1–8) 1 mark; Level 2 intermediate (Q9–14) "
                     "2 marks; Level 3 advanced (Q15–19) 2 marks."},
    {"id": "B", "title": "Part B — Theory, graphical analysis & problem-solving (Q1–Q16)", "questions": 16,
     "marks": 70,
     "instructions": "16 questions · 70 marks. Task 1 = Criterion A (22), Task 2 = Criterion B (16), "
                     "Task 3 = Criterion C (15), Task 4 = Criterion D (17)."},
]

CRITERION_TOTALS = {"A": 32, "B": 24, "C": 20, "D": 24}


def _graph(title, points, *, x_min=0, x_max=7, y_min=-10, y_max=30,
           x_label="n", y_label="uₙ", show_coordinates=True, show_legend=False):
    return graph_figure({
        "version": 1,
        "title": title,
        "domain": {
            "xMin": x_min, "xMax": x_max, "yMin": y_min, "yMax": y_max,
            "gridStep": None, "showGrid": True, "showAxes": True,
            "showCoordinates": show_coordinates, "showLegend": show_legend,
            "showIntersections": False, "equalScale": False,
        },
        "points": [
            {"id": f"p{i}", "x": x, "y": y, "label": label, "color": color,
             "showCoordinates": show_coordinates, "open": False, "visible": True}
            for i, (x, y, label, color) in enumerate(points)
        ],
        "functions": [], "segments": [], "annotations": [], "strokes": [], "regions": [],
    })


_GREEN = "#0a5c36"
_BLUE = "#1d4ed8"
_AMBER = "#b45309"
_RED = "#b91c1c"


def _q4_graph():
    return _graph("First five terms of a linear sequence",
                  [(n, 17 - 3 * n, "", _GREEN) for n in range(1, 6)],
                  x_min=0, x_max=6, y_min=-4, y_max=18)


def _q10_graph():
    return _graph("First four terms of a geometric sequence",
                  [(1, 27, "", _GREEN), (2, 18, "", _GREEN), (3, 12, "", _GREEN), (4, 8, "", _GREEN)],
                  x_min=0, x_max=5, y_min=0, y_max=30)


def _q13_grid():
    return _graph("Grid for plotting (n, uₙ)", [], x_min=0, x_max=6, y_min=0, y_max=20,
                  show_coordinates=False)


def _q14_graph():
    pts = [(1, 14, "A", _GREEN), (2, 12, "A", _GREEN), (3, 10, "A", _GREEN), (4, 8, "A", _GREEN),
           (5, 6, "A", _GREEN), (1, 1, "G", _BLUE), (2, 2, "G", _BLUE), (3, 4, "G", _BLUE),
           (4, 8, "G", _BLUE), (5, 16, "G", _BLUE)]
    return _graph("Arithmetic Aₙ = 16 − 2n and geometric Gₙ = 2ⁿ⁻¹", pts,
                  x_min=0, x_max=6, y_min=0, y_max=18, show_legend=True)


def _q17_graph():
    return _graph("Partial sums Sₙ of an arithmetic series",
                  [(1, 5, "", _GREEN), (2, 14, "", _GREEN), (3, 27, "", _GREEN), (4, 44, "", _GREEN),
                   (5, 65, "", _GREEN)], x_min=0, x_max=6, y_min=0, y_max=70, y_label="Sₙ")


def _b2_graph():
    pts = []
    for n in range(1, 7):
        pts.append((n, 33 - 4 * n, "L", _GREEN))
        pts.append((n, 3 * n + 5, "M", _BLUE))
    return _graph("Sequences Lₙ = 33 − 4n and Mₙ = 3n + 5", pts,
                  x_min=0, x_max=7, y_min=0, y_max=35, show_legend=True)


def _b9_graph():
    pts = []
    for n, value in enumerate([16, -8, 4, -2, 1], start=1):
        pts.append((n, value, "I", _GREEN))
    for n, value in enumerate([5, 2, 1, 2, 5], start=1):
        pts.append((n, value, "II", _BLUE))
    for n, value in enumerate([3, 5.5, 8, 10.5, 13], start=1):
        pts.append((n, value, "III", _AMBER))
    return _graph("Three sequences plotted for n = 1 to 5", pts,
                  x_min=0, x_max=6, y_min=-10, y_max=18, show_legend=True)


def _b14_graph():
    return _graph("Annual generation of the Parakou solar plant",
                  [(1, 500, "", _GREEN), (2, 475, "", _GREEN), (3, 451.25, "", _GREEN),
                   (4, 428.6875, "", _GREEN)],
                  x_min=0, x_max=5, y_min=400, y_max=520, x_label="Year", y_label="Eₙ (MWh)")


def _open(n, *, number, crit, marks, lvl, topic, subtopic, blocks, expl, parts=None,
          tools=None, guidance=None):
    return q(n, sec="B", crit=crit, marks=marks, lvl=lvl, topic=topic, subtopic=subtopic,
             blocks=blocks, qtype="open_ended", expl=expl, parts=parts, number=number,
             tools=tools or ["rich_text", "math"], guidance=guidance)

PAPER_TITLES = {
    1: 'Explicit & recursive sequences',
    2: 'Intersecting linear sequences',
    3: 'Alternating geometric sequence',
    4: 'Quadratic sequence from differences',
    5: 'Evaluating finite series',
    6: 'Solar terrace pattern & quadratic graph',
    7: 'Affine recursive investigation',
    8: 'Arithmetic vs geometric growth',
    9: 'Connecting graphical & algebraic forms',
    10: 'Sigma notation & critiquing a series solution',
    11: 'First-difference linearity proof',
    12: 'Multi-sequence classification & justification',
    13: 'Zou irrigation canal construction',
    14: 'Parakou solar plant output',
    15: 'Research endowment annuity',
    16: 'Comparing fleet logistics contracts',
}


def _with_paper_titles(questions):
    """Print each Part B question's source title, exactly as the paper does."""
    for record in questions:
        title = PAPER_TITLES.get(record["cfg"].get("question_number"))
        if not title or record["sec"] != "B":
            continue
        record["cfg"]["paper_title"] = title
        record["doc"]["content"].insert(0, {
            "type": "paragraph",
            "content": [{"type": "text", "text": title, "marks": [{"type": "bold"}]}],
        })
    return questions


def build():
    Q = []

    # ── PART A · LEVEL 1 · Q1–8 · 1 mark ────────────────────────────────────
    Q.append(q(1, sec="A", crit="C", marks=1, lvl="basic", topic="Series notation",
               subtopic="finite geometric series",
               blocks=[para("Which mathematical expression represents a finite geometric series?")],
               opts=["6, 18, 54, 162", "6 + 12 + 18 + 24", "80 + 40 + 20 + 10",
                     r"$u_n=5(2)^{n-1}$"], ans="C",
               expl="80 + 40 + 20 + 10 is a sum of terms with constant ratio 1/2. A is a sequence, B is an "
                    "arithmetic series, and D is an explicit formula."))

    Q.append(q(2, sec="A", crit="A", marks=1, lvl="basic", topic="Geometric sequences",
               subtopic="common ratio and fifth term",
               blocks=[para("For the geometric sequence −162, 54, −18, 6, …, state the common ratio $r$ and fifth "
                            "term $u_5$.")],
               opts=[r"$r=-3,\ u_5=-2$", r"$r=-\frac{1}{3},\ u_5=-2$",
                     r"$r=\frac{1}{3},\ u_5=2$", r"$r=-\frac{1}{3},\ u_5=-\frac{2}{3}$"], ans="B",
               expl=r"$r=54/(-162)=-\frac{1}{3}$, so $u_5=6(-\frac{1}{3})=-2$."))

    Q.append(q(3, sec="A", crit="A", marks=1, lvl="basic", topic="Explicit rules",
               subtopic="evaluating a quadratic term",
               blocks=[para("A sequence has explicit formula $u_n=3n^2-4n+2$. Calculate $u_5$.")],
               opts=["37", "53", "207", "57"], ans="D",
               expl=r"$u_5=3(25)-4(5)+2=75-20+2=57$."))

    Q.append(q(4, sec="A", crit="A", marks=1, lvl="basic", topic="Linear sequences",
               subtopic="explicit rule from a graph",
               blocks=[para("The coordinate graph shows the first five terms of a linear sequence $u_n$. Find its "
                            "explicit formula and $u_{10}$."), _q4_graph()],
               opts=[r"$u_n=17-3n;\ u_{10}=-13$", r"$u_n=14-3n;\ u_{10}=-16$",
                     r"$u_n=3n+11;\ u_{10}=41$", r"$u_n=17-3n;\ u_{10}=-10$"], ans="A",
               expl="From the graph $u_1=14$ and the constant difference is −3, so $u_n=14-3(n-1)=17-3n$ and "
                    "$u_{10}=17-30=-13$."))

    Q.append(q(5, sec="A", crit="A", marks=1, lvl="basic", topic="Recursive rules",
               subtopic="iterating a recurrence",
               blocks=[para("Given the recursive rule $u_1=2$ and $u_{n+1}=3u_n-2$ $(n \\ge 1)$, find $u_4$.")],
               opts=["10", "26", "28", "82"], ans="C",
               expl="$u_2=4$, $u_3=10$, $u_4=28$."))

    Q.append(q(6, sec="A", crit="B", marks=1, lvl="basic", topic="Classifying sequences",
               subtopic="differences",
               blocks=[para("How is the sequence 2, 6, 12, 20, 30, … best classified?")],
               opts=["Arithmetic", "Geometric", "Quadratic", "Constant"], ans="C",
               expl="First differences are 4, 6, 8, 10; the second difference is constant (+2), so the sequence is "
                    "quadratic."))

    Q.append(q(7, sec="A", crit="B", marks=1, lvl="basic", topic="Explicit rules",
               subtopic="matching a rule to terms",
               blocks=[para("Which explicit formula generates the sequence 2, 5, 10, 17, 26, …?")],
               opts=[r"$3n-1$", r"$2n^2$", r"$2n+1$", r"$n^2+1$"], ans="D",
               expl="$n^2+1$ gives 2, 5, 10, 17, 26 for n = 1, 2, 3, 4, 5."))

    Q.append(q(8, sec="A", crit="D", marks=1, lvl="basic", topic="Arithmetic series",
               subtopic="sum of an arithmetic series",
               blocks=[para("A street-lighting scheme installs 15 poles on Avenue 1, increasing arithmetically to 60 "
                            "poles on Avenue 16. Find the total poles $S_{16}$.")],
               opts=["560", "600", "630", "1200"], ans="B",
               expl=r"$S_{16}=\frac{16}{2}(15+60)=8(75)=600$."))

    # ── LEVEL 2 · Q9–14 · 2 marks ───────────────────────────────────────────
    Q.append(q(9, sec="A", crit="B", marks=2, lvl="intermediate", topic="Quadratic sequences",
               subtopic="difference table",
               blocks=[para("The difference table below represents a quadratic sequence $u_n=an^2+bn+c$:"),
                       data_table(["Term n", "1", "2", "3", "4", "5"],
                                  [["Value uₙ", "3", "8", "17", "30", "q"],
                                   ["1st diff. Δ₁", "+5", "+9", "+13", "p", ""],
                                   ["2nd diff. Δ₂", "+4", "+4 (constant)", "", "", ""]]),
                       para("Determine the value of $a$ and the fifth term $q$.")],
               opts=[r"$a=4,\ q=47$", r"$a=2,\ q=47$", r"$a=2,\ q=43$", r"$a=4,\ q=45$"], ans="B",
               expl="$2a=4$ gives $a=2$; the next first difference is $p=13+4=17$, so $q=30+17=47$."))

    Q.append(q(10, sec="A", crit="C", marks=2, lvl="intermediate", topic="Geometric graphs",
               subtopic="rule and fifth term from a graph",
               blocks=[para("The graph displays the first four terms of a geometric sequence. Select its explicit "
                            "rule and exact fifth term $u_5$."), _q10_graph()],
               opts=[r"$27\left(\frac{2}{3}\right)^{n-1};\ u_5=\frac{16}{3}$",
                     r"$27\left(\frac{2}{3}\right)^{n};\ u_5=\frac{16}{3}$",
                     r"$27-9(n-1);\ u_5=4$",
                     r"$27\left(\frac{3}{2}\right)^{n-1};\ u_5=\frac{16}{3}$"], ans="A",
               expl="The points are (1, 27), (2, 18), (3, 12), (4, 8), so $u_1=27$ and $r=2/3$; "
                    "$u_5=8(2/3)=16/3$."))

    Q.append(q(11, sec="A", crit="A", marks=2, lvl="intermediate", topic="Arithmetic sequences",
               subtopic="finding a later term",
               blocks=[para("In an arithmetic sequence, $u_3=19$ and $u_9=49$. Calculate $u_{20}$.")],
               opts=["99", "109", "104", "114"], ans="C",
               expl="$6d=49-19=30$, so $d=5$ and $u_1=19-2(5)=9$; $u_{20}=9+19(5)=104$."))

    Q.append(q(12, sec="A", crit="D", marks=2, lvl="intermediate", topic="Geometric decay",
               subtopic="geometric model in context",
               blocks=[para("An irrigation pond holds 850 m³ at the end of Week 1 and loses 15% of its remaining volume "
                            "each week. Find $u_4$ (to 3 s.f.).")],
               opts=["444 m³", "522 m³", "614 m³", "468 m³"], ans="B",
               expl=r"Retention ratio $r=0.85$, so $u_4=850(0.85)^3=522.006\ldots\approx522$ m³."))

    Q.append(q(13, sec="A", crit="B", marks=2, lvl="intermediate", topic="Recursive sequences",
               subtopic="plotting and finding an explicit rule", qtype="open_ended",
               blocks=[para("A sequence satisfies $u_1=2$ and $u_{n+1}=u_n+2n-1$ $(n \\ge 1)$."),
                       para("(i) Plot $(3,u_3)$, $(4,u_4)$ and $(5,u_5)$ directly on the grid."), _q13_grid(),
                       para("(ii) Write the explicit rule: $u_n=$")],
               expl="$u_3=6$, $u_4=11$, $u_5=18$; first differences 1, 3, 5, 7 have second difference 2, so a = 1. "
                    "Testing n = 1, 2 gives $u_n=n^2-2n+3$ (or $(n-1)^2+2$).",
               parts=[("(i)", 1, "Plot the three points"), ("(ii)", 1, "Explicit rule")],
               tools=["graph", "math", "rich_text"],
               guidance="Both the plotted points and a valid explicit rule are required."))

    Q.append(q(14, sec="A", crit="C", marks=2, lvl="intermediate", topic="Comparing sequences",
               subtopic="intersection and geometric sum", qtype="open_ended",
               blocks=[para("Arithmetic $A_n=16-2n$ and geometric $G_n=2^{n-1}$ are plotted together."),
                       _q14_graph(),
                       para("(i) Point where $A_n=G_n$:  (ii) Sum $S_5$ of $G_n$:")],
               expl="(i) At n = 4, A₄ = 16 − 8 = 8 and G₄ = 2³ = 8, so the shared point is (4, 8). "
                    "(ii) S₅ = 1 + 2 + 4 + 8 + 16 = 31.",
               parts=[("(i)", 1, "Intersection point"), ("(ii)", 1, "Geometric sum")],
               tools=["math", "rich_text"]))

    # ── LEVEL 3 · Q15–19 · 2 marks ──────────────────────────────────────────
    Q.append(q(15, sec="A", crit="A", marks=2, lvl="advanced", topic="Finite geometric series",
               subtopic="evaluate a sigma sum",
               blocks=[para("Evaluate the exact sum of the finite geometric series "
                            "$\\sum_{k=1}^{5}81\\left(\\frac{4}{3}\\right)^{k-1}$.")],
               opts=["525", "729", "1024", "781"], ans="D",
               expl=r"$S_5=81\left[\left(\frac{4}{3}\right)^5-1\right]\div\left(\frac{4}{3}-1\right)"
                    r"=243\left(\frac{1024}{243}-1\right)=1024-243=781$."))

    Q.append(q(16, sec="A", crit="A", marks=2, lvl="advanced", topic="Geometric sequences",
               subtopic="solving for an unknown and ratio",
               blocks=[para("Consecutive positive terms $m-1$, $2m+1$, $7m-1$ form a geometric sequence. Find $m$ "
                            "and common ratio $r$.")],
               opts=[r"$m=3,\ r=\frac{7}{2}$", r"$m=4,\ r=2$", r"$m=4,\ r=3$", r"$m=5,\ r=\frac{11}{4}$"],
               ans="C",
               expl="$(2m+1)^2=(m-1)(7m-1)$ gives $3m(m-4)=0$; positive terms require m = 4, so the terms are "
                    "3, 9, 27 and r = 3."))

    Q.append(q(17, sec="A", crit="B", marks=2, lvl="advanced", topic="Partial sums",
               subtopic="recovering a term and difference",
               blocks=[para("The coordinate graph shows the partial sums $S_n$ of an arithmetic series for "
                            "$n=1$ to $5$. Find term $u_4$ and common difference $d$."), _q17_graph()],
               opts=[r"$u_4=17,\ d=4$", r"$u_4=44,\ d=4$", r"$u_4=17,\ d=2$", r"$u_4=13,\ d=4$"],
               ans="A",
               expl="$u_4=S_4-S_3=44-27=17$ and $u_3=S_3-S_2=27-14=13$, so $d=17-13=4$."))

    Q.append(q(18, sec="A", crit="D", marks=2, lvl="advanced", topic="Arithmetic series",
               subtopic="number of terms for a target total",
               blocks=[para("An Allada cooperative harvests 30 crates of pineapples in Week 1, increasing by 6 crates "
                            "per week. How many weeks give 756 crates in total?")],
               opts=["11", "12", "14", "16"], ans="B",
               expl=r"$S_n=\frac{n}{2}[60+6(n-1)]=3n^2+27n=756$, so $n^2+9n-252=(n-12)(n+21)=0$ and n = 12."))

    Q.append(q(19, sec="A", crit="D", marks=2, lvl="advanced", topic="Comparing financial plans",
               subtopic="arithmetic and geometric series",
               blocks=[para("Over 5 years, Plan P pays 120 000 FCFA in Year 1 (+40 000 FCFA/yr); Plan Q pays 30 000 "
                            "FCFA in Year 1, doubling each year. Compare 5-year totals ($S_5$).")],
               opts=["Equal at 960 000 FCFA", "Plan Q exceeds P by 70 000",
                     "Plan Q is 70 000 FCFA cheaper", "Plan P is 40 000 FCFA cheaper"], ans="C",
               expl="S₅,P = (5/2)[240 000 + 4(40 000)] = 1 000 000 FCFA; S₅,Q = 30 000(2⁵ − 1) = 930 000 FCFA. "
                    "Plan Q is 70 000 FCFA cheaper."))

    # ── PART B · CRITERION A · 22 marks ─────────────────────────────────────
    Q.append(_open(20, number=1, crit="A", marks=4, lvl="advanced", topic="Explicit & recursive sequences",
                   subtopic="evaluating and solving a quadratic sequence; exact fractions",
                   blocks=[para("(a) Sequence A has explicit rule $u_n=2n^2-5n+7$. Calculate $u_1$ and $u_4$, and "
                                "find algebraically which term equals 49. [2]\n"
                                "(b) Sequence B satisfies $v_1=12$ and $v_{n+1}=\\frac{1}{2}v_n+3$ $(n \\ge 1)$. "
                                "Compute $v_2$, $v_3$ and $v_4$ as exact fractions, showing each step. [2]")],
                   parts=[("(a)", 2, "Terms and the equation"), ("(b)", 2, "Exact recursive fractions")],
                   expl="(a) u₁ = 4, u₄ = 19; 2n² − 5n + 7 = 49 gives (n − 6)(2n + 7) = 0, so n = 6. "
                        "(b) v₂ = 9, v₃ = 15/2, v₄ = 27/4.",
                   tools=["rich_text", "math"]))

    Q.append(_open(21, number=2, crit="A", marks=5, lvl="advanced", topic="Intersecting linear sequences",
                   subtopic="graphical analysis and series",
                   blocks=[para("Two arithmetic sequences $L_n$ and $M_n$ are plotted for $n=1$ to $6$ on the "
                                "coordinate grid shown."), _b2_graph(),
                           para("(a) Derive simplified explicit formulas for $L_n$ and $M_n$, and interpret their "
                                "intersection point $(4, 17)$. [2]\n"
                                "(b) Find the term number $n$ and value of the first negative term of $L_n$. [1]\n"
                                "(c) Calculate the sum $S_{15}$ of the first 15 terms of sequence $M_n$. [2]")],
                   parts=[("(a)", 2, "Rules and intersection"), ("(b)", 1, "First negative term"),
                          ("(c)", 2, "Sum of 15 terms")],
                   expl="(a) Lₙ = 33 − 4n and Mₙ = 3n + 5; at n = 4 both equal 17. (b) 33 − 4n < 0 gives n > 8.25, "
                        "so the first negative term is L₉ = −3. (c) M₁ = 8, M₁₅ = 50, so S₁₅ = 15/2(58) = 435.",
                   tools=["rich_text", "math", "graph"]))

    Q.append(_open(22, number=3, crit="A", marks=4, lvl="advanced", topic="Alternating geometric sequence",
                   subtopic="ratio, rule and term test",
                   blocks=[para("A geometric sequence satisfies $u_2=-18$ and $u_5=486$."),
                           para("(a) Find the common ratio $r$, first term $u_1$, and explicit formula $u_n$. [2]\n"
                                "(b) Calculate $u_7$ and justify algebraically whether −13 122 is a term of this "
                                "sequence. [2]")],
                   parts=[("(a)", 2, "Ratio and formula"), ("(b)", 2, "Seventh term and term test")],
                   expl="(a) r³ = 486/(−18) = −27, so r = −3; u₁ = 6 and uₙ = 6(−3)ⁿ⁻¹. (b) u₇ = 6(−3)⁶ = 4 374. "
                        "6(−3)ⁿ⁻¹ = −13 122 gives (−3)ⁿ⁻¹ = (−3)⁷, so n = 8; yes, it is the 8th term.",
                   tools=["rich_text", "math"]))

    Q.append(_open(23, number=4, crit="A", marks=4, lvl="advanced", topic="Quadratic sequence from differences",
                   subtopic="difference table and solving",
                   blocks=[para("Five terms of a quadratic sequence $u_n=an^2+bn+c$ are given below:"),
                           data_table(["Term n", "1", "2", "3", "4", "5"],
                                      [["Value uₙ", "−1", "4", "13", "26", "43"]]),
                           para("(a) Construct a complete first- and second-difference table to find $a$, $b$ and $c$, "
                                "and state $u_n$. [2]\n"
                                "(b) Calculate $u_{10}$ and solve algebraically for $n$ when $u_n=151$. [2]")],
                   parts=[("(a)", 2, "Differences and formula"), ("(b)", 2, "Tenth term and equation")],
                   expl="(a) First differences 5, 9, 13, 17; second differences 4. 2a = 4 → a = 2; 3a + b = 5 → b = −1; "
                        "a + b + c = −1 → c = −2, so uₙ = 2n² − n − 2. (b) u₁₀ = 188; 2n² − n − 2 = 151 gives "
                        "(n − 9)(2n + 17) = 0, so n = 9.",
                   tools=["rich_text", "math", "table"]))

    Q.append(_open(24, number=5, crit="A", marks=5, lvl="advanced", topic="Evaluating finite series",
                   subtopic="number of terms and exact sums",
                   blocks=[para("For each finite series below, find the number of terms $n$ and evaluate the exact sum "
                                "$S_n$:"),
                           para("(a) Arithmetic series: 7 + 13 + 19 + … + 139. [3]\n"
                                "(b) Alternating geometric series: 486 − 324 + 216 − … − 64. [2]")],
                   parts=[("(a)", 3, "Arithmetic count and sum"), ("(b)", 2, "Geometric count and sum")],
                   expl="(a) 7 + 6(n − 1) = 139 gives n = 23; S₂₃ = 23/2(7 + 139) = 1 679. (b) r = −2/3; "
                        "486(−2/3)ⁿ⁻¹ = −64 gives n = 6; S₆ = 486(1 − (−2/3)⁶)/(1 + 2/3) = 266.",
                   tools=["rich_text", "math"]))

    # ── CRITERION B · 16 marks ──────────────────────────────────────────────
    Q.append(_open(25, number=6, crit="B", marks=6, lvl="advanced", topic="Pattern investigation",
                   subtopic="solar terrace pattern and quadratic graph",
                   blocks=[para("Stage $n$ has an $n \\times n$ green core ($C_n$) flanked by two border columns of "
                                "$n$ pale panels each ($B_n$), giving total panels $T_n=C_n+B_n$."),
                           para("(a) Tabulate $B_n$, $C_n$ and $T_n$ for $1 \\le n \\le 5$, and classify $B_n$ and "
                                "$T_n$ using differences. [2]\n"
                                "(b) Write explicit rules for $B_n$ and $T_n$. On a coordinate grid in your booklet "
                                "($1 \\le n \\le 5$), plot both $(n,B_n)$ and $(n,C_n)$ and identify the stage where "
                                "$C_n$ first exceeds $B_n$. [2]\n"
                                "(c) Find which stage uses $T_n=168$ panels, and link the upward curvature of the $T_n$ "
                                "graph to its first differences $T_{n+1}-T_n$. [2]")],
                   parts=[("(a)", 2, "Table and classification"), ("(b)", 2, "Rules and graph"),
                          ("(c)", 2, "Stage and curvature")],
                   expl="(a) B: 2, 4, 6, 8, 10 (constant first difference); C: 1, 4, 9, 16, 25; T: 3, 8, 15, 24, 35 "
                        "(constant second difference 2). (b) Bₙ = 2n, Tₙ = n² + 2n; Cₙ first exceeds Bₙ at Stage 3 "
                        "(9 > 6). (c) n² + 2n = 168 gives Stage 12. Tₙ₊₁ − Tₙ = 2n + 3 increases by 2 each step, so "
                        "consecutive secant slopes steepen and the graph curves upward.",
                   tools=["rich_text", "math", "graph", "table"]))

    Q.append(_open(26, number=7, crit="B", marks=5, lvl="advanced", topic="Affine recursive investigation",
                   subtopic="geometric first differences and closed form",
                   blocks=[para("Investigate: $u_1=7$ → $u_{n+1}=2u_n-3$ (for $n \\ge 1$)."),
                           para("(a) Compute $u_2$, $u_3$, $u_4$, $u_5$ and show that $\\Delta u_n=u_{n+1}-u_n$ forms "
                                "a geometric sequence, stating its first term and ratio. [2]\n"
                                "(b) Let $w_n=u_n-3$. Prove algebraically that $w_{n+1}=2w_n$, deduce the explicit "
                                "formula for $u_n$, and verify it for $n=5$. [3]")],
                   parts=[("(a)", 2, "Terms and difference sequence"), ("(b)", 3, "Proof, formula and check")],
                   expl="(a) 11, 19, 35, 67; first differences 4, 8, 16, 32 have ratio 2. (b) wₙ₊₁ = uₙ₊₁ − 3 = 2uₙ − 6 = "
                        "2wₙ, with w₁ = 4, so wₙ = 4(2)ⁿ⁻¹ = 2ⁿ⁺¹ and uₙ = 2ⁿ⁺¹ + 3; at n = 5, 64 + 3 = 67.",
                   tools=["rich_text", "math"]))

    Q.append(_open(27, number=8, crit="B", marks=5, lvl="advanced", topic="Arithmetic vs geometric growth",
                   subtopic="definitions, table and comparison",
                   blocks=[para("Arithmetic sequence $A_n$ and geometric sequence $G_n$ share $A_1=G_1=6$ and "
                                "$A_2=G_2=9$."),
                           para("(a) Write explicit and recursive definitions (with initial terms) for both $A_n$ and "
                                "$G_n$. [2]\n"
                                "(b) Tabulate $n=1..5$, find the percentage by which $G_5$ exceeds $A_5$, and explain why "
                                "$G_n>A_n$ for all $n \\ge 3$. [3]")],
                   parts=[("(a)", 2, "Both definitions"), ("(b)", 3, "Table, percentage and reasoning")],
                   expl="(a) A: d = 3, Aₙ = 3n + 3, A₁ = 6, Aₙ₊₁ = Aₙ + 3. G: r = 1.5, Gₙ = 6(1.5)ⁿ⁻¹, G₁ = 6, "
                        "Gₙ₊₁ = 1.5Gₙ. (b) A: 6, 9, 12, 15, 18; G: 6, 9, 13.5, 20.25, 30.375. G₅ exceeds A₅ by "
                        "(30.375 − 18)/18 × 100% = 68.75%. From n = 2, A grows by 3 while G grows by 0.5Gₙ ≥ 4.5, and "
                        "that increment increases, so G remains larger for n ≥ 3.",
                   tools=["rich_text", "math", "table"]))

    # ── CRITERION C · 15 marks ──────────────────────────────────────────────
    Q.append(_open(28, number=9, crit="C", marks=4, lvl="advanced", topic="Connecting graphical & algebraic forms",
                   subtopic="classification, explicit and recursive rules",
                   blocks=[para("Three sequences are plotted below for $n=1,2,3,4,5$:"), _b9_graph(),
                           para("(a) Classify Graph I (16, −8, 4, −2, 1), Graph II (5, 2, 1, 2, 5) and Graph III "
                                "(3, 5.5, 8, 10.5, 13), citing a distinct visual feature of each graph. [2]\n"
                                "(b) Using proper subscript notation, write both an explicit formula and a complete "
                                "recursive definition for Graph I and Graph II. [2]")],
                   parts=[("(a)", 2, "Classification with visual features"), ("(b)", 2, "Rules for I and II")],
                   expl="(a) I is geometric (alternating signs, halving amplitude); II is quadratic (symmetric "
                        "U-shape with vertex (3, 1)); III is arithmetic (collinear, gradient 2.5). (b) I: "
                        "uₙ = 16(−1/2)ⁿ⁻¹, u₁ = 16, uₙ₊₁ = −uₙ/2. II: uₙ = (n − 3)² + 1 = n² − 6n + 10, u₁ = 5, "
                        "uₙ₊₁ = uₙ + 2n − 5.",
                   tools=["rich_text", "math", "graph"]))

    Q.append(_open(29, number=10, crit="C", marks=4, lvl="advanced", topic="Sigma notation & critique",
                   subtopic="upper limit and correcting a series error",
                   blocks=[para("(a) Express 14 + 10 + 6 + 2 + … + (−38) in sigma (∑) notation, showing how the upper "
                                "limit is obtained, and evaluate the sum. [2]\n"
                                "(b) To sum 7 terms of 4 + 12 + 36 + …, Amina writes: “$S_7=\\frac{4(1-3^6)}{1-3}=1456$.” "
                                "Identify her error using precise mathematical language and write a clear, corrected "
                                "calculation of $S_7$. [2]")],
                   parts=[("(a)", 2, "Sigma form and sum"), ("(b)", 2, "Error and correction")],
                   expl="(a) uₖ = 14 − 4(k − 1) = 18 − 4k; 18 − 4k = −38 gives k = 14, so the sum is "
                        "∑ₖ₌₁¹⁴(18 − 4k) = 14/2(14 − 38) = −168. (b) The exponent on r must be the number of terms, "
                        "7, not 6; she computed S₆. Correctly, S₇ = 4(3⁷ − 1)/(3 − 1) = 2(2186) = 4 372.",
                   tools=["rich_text", "math"]))

    Q.append(_open(30, number=11, crit="C", marks=4, lvl="advanced", topic="First-difference linearity proof",
                   subtopic="proving arithmetic differences",
                   blocks=[para("Let $Q_n=an^2+bn+c$ $(a \\ne 0)$."),
                           para("(a) Expand and simplify $D_n=Q_{n+1}-Q_n$ to prove that ${D_n}$ is arithmetic, stating "
                                "$D_1$ and its common difference in terms of $a$ and $b$. [2]\n"
                                "(b) Explain why plotting $(n,D_n)$ yields collinear points of gradient $2a$. Hence find "
                                "$Q_n$ if the graph of $(n,D_n)$ passes through $(1,7)$ with gradient 6 and $Q_1=4$. [2]")],
                   parts=[("(a)", 2, "Expansion and proof"), ("(b)", 2, "Gradient and reconstruction")],
                   expl="(a) Dₙ = a(n + 1)² + b(n + 1) + c − (an² + bn + c) = 2an + (a + b). The difference "
                        "Dₙ₊₁ − Dₙ = 2a is constant, so {Dₙ} is arithmetic with D₁ = 3a + b. (b) Dₙ = (2a)n + (a + b) is "
                        "linear in n, so the points are collinear with gradient 2a. 2a = 6 → a = 3; 9 + b = 7 → b = −2; "
                        "3 − 2 + c = 4 → c = 3, so Qₙ = 3n² − 2n + 3.",
                   tools=["rich_text", "math"]))

    Q.append(_open(31, number=12, crit="C", marks=3, lvl="advanced", topic="Multi-sequence classification",
                   subtopic="difference/ratio justification and fifth terms",
                   blocks=[para("Classify each sequence as arithmetic, quadratic or geometric, justifying with "
                                "differences or ratios, and state exact $u_5$ for each."),
                           data_table(["ID", "First four terms (u₁, u₂, u₃, u₄)"],
                                      [["Seq X", "25, 19, 13, 7"],
                                       ["Seq Y", "24, 18, 27/2, 81/8"],
                                       ["Seq Z", "1, 6, 15, 28"]]),
                           para("(a) Classification and justification. [2]\n(b) Exact fifth terms. [1]")],
                   parts=[("(a)", 2, "Three classifications and justifications"),
                          ("(b)", 1, "All three fifth terms")],
                   expl="X: constant difference −6 (arithmetic), u₅ = 1. Y: constant ratio 3/4 (geometric), "
                        "u₅ = 243/32. Z: first differences 5, 9, 13 and constant second difference 4 (quadratic), "
                        "u₅ = 28 + 17 = 45.",
                   tools=["rich_text", "math", "table"]))

    # ── CRITERION D · 17 marks ──────────────────────────────────────────────
    Q.append(_open(32, number=13, crit="D", marks=4, lvl="advanced", topic="Irrigation canal construction",
                   subtopic="arithmetic model and quadratic equation",
                   blocks=[para("Engineers line 45 m of canal in Week 1, increasing weekly progress by 8 m each week."),
                           para("(a) Find the length lined in Week 12 alone ($u_{12}$) and cumulative length after "
                                "12 weeks ($S_{12}$). [2]\n"
                                "(b) The full canal measures 1 680 m. Form and solve a quadratic equation to find how "
                                "many weeks are required to finish the project. [2]")],
                   parts=[("(a)", 2, "Week-12 and cumulative lengths"), ("(b)", 2, "Quadratic model and solution")],
                   expl="(a) u₁₂ = 45 + 11(8) = 133 m; S₁₂ = 12/2(45 + 133) = 1 068 m. (b) Sₙ = n/2[90 + 8(n − 1)] = "
                        "4n² + 41n = 1 680, so 4n² + 41n − 1 680 = 0 = (n − 16)(4n + 105); n = 16 weeks.",
                   tools=["rich_text", "math"]))

    Q.append(_open(33, number=14, crit="D", marks=5, lvl="advanced", topic="Solar plant output",
                   subtopic="geometric decay, cumulative output and threshold",
                   blocks=[para("The coordinate graph shows annual generation $E_n$ (MWh) in Years 1–4 as panels degrade "
                                "by 5% per year."), _b14_graph(),
                           para("(a) Verify from the plotted data that $E_n$ is geometric with $r=0.95$, state an explicit "
                                "rule for $E_n$, and compute $E_6$ and $E_8$ (to 1 d.p.) to extend the graph. [2]\n"
                                "(b) Calculate cumulative 8-year output $S_8$ (to 1 d.p.) to test whether a 3 300 MWh "
                                "supply target is met, and find the first year when $E_n$ drops below the 340 MWh "
                                "threshold. [3]")],
                   parts=[("(a)", 2, "Rule and two future terms"), ("(b)", 3, "Cumulative total and threshold")],
                   expl="(a) 475/500 = 451.25/475 = 0.95, so Eₙ = 500(0.95)ⁿ⁻¹; E₆ ≈ 386.9 and E₈ ≈ 349.2 MWh. "
                        "(b) S₈ = 500(1 − 0.95⁸)/0.05 ≈ 3 365.8 MWh > 3 300, so the target is met by about 65.8 MWh. "
                        "E₈ ≈ 349.2 ≥ 340 but E₉ ≈ 331.7 < 340, so the first year below threshold is Year 9.",
                   tools=["rich_text", "math", "graph"]))

    Q.append(_open(34, number=15, crit="D", marks=4, lvl="advanced", topic="Compound-interest annuity",
                   subtopic="geometric series in finance",
                   blocks=[para("A foundation invests $4 000 at the start of each year for 10 years at 5% compound "
                                "interest per annum."),
                           para("(a) Explain why the end-of-Year-10 balance equals "
                                "$4000(1.05)+4000(1.05)^2+\\cdots+4000(1.05)^{10}$, stating $u_1$, $r$ and $n$. [2]\n"
                                "(b) Calculate the end-of-Year-10 balance (to 2 d.p.) and the total compound interest "
                                "earned. [2]")],
                   parts=[("(a)", 2, "Explanation and parameters"), ("(b)", 2, "Balance and interest")],
                   expl="(a) The 10th deposit earns one year of interest and the 1st earns ten years; the balance is a "
                        "geometric series with u₁ = 4 000(1.05) = 4 200, r = 1.05, n = 10. (b) "
                        "S₁₀ = 4 200(1.05¹⁰ − 1)/0.05 = $52 827.15; principal is $40 000, so interest is $12 827.15.",
                   tools=["rich_text", "math"]))

    Q.append(_open(35, number=16, crit="D", marks=4, lvl="advanced", topic="Fleet logistics contracts",
                   subtopic="comparing arithmetic and geometric totals",
                   blocks=[para("Over 8 months, Contract A pays 240 000 FCFA in Month 1 (+35 000 FCFA/month); Contract B "
                                "pays 150 000 FCFA in Month 1 (+25% per month, $r=1.25$)."),
                           para("(a) Calculate total 8-month revenue ($S_8$) under Contract A and Contract B (nearest "
                                "FCFA). [2]\n"
                                "(b) Compare both options for a 4-month trial ($S_4$) versus the full 8-month term, "
                                "advising the firm with figures. [2]")],
                   parts=[("(a)", 2, "Both eight-month totals"), ("(b)", 2, "Four-month comparison and advice")],
                   expl="(a) S₈,A = 8/2[2(240 000) + 7(35 000)] = 2 900 000 FCFA; S₈,B = 150 000(1.25⁸ − 1)/0.25 ≈ "
                        "2 976 279 FCFA. (b) S₄,A = 1 170 000 and S₄,B ≈ 864 844: choose A for a 4-month trial "
                        "(+305 156 FCFA), but B for the full 8 months (+76 279 FCFA) once compounding overtakes "
                        "linear growth.",
                   tools=["rich_text", "math"]))

    return _with_paper_titles(Q)
