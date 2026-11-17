"""Grade 9 / MYP 4 Mathematics — Term 1 Summative Assessment (First Term 2026/27).

Source: "Grade_9_MYP_4_Mathematics_Summative_Assessment.pdf" and its official
"Grade_9_MYP_4_Mathematics_Marking_Scheme.pdf" (OAK INTERNATIONAL SCHOOL,
BENIN, End of First Term E-assessment 2026/27, MYP 4 · Grade 9, 2 hours,
100 marks). 45 questions: Part A objective (Q1–25, 30 marks) and Part B theory
(Q26–45, 70 marks). Criterion totals printed on the paper: A 32, B 20, C 24,
D 24.

This is the paper WITHOUT a "Version B" label; it is a distinct examination
from the existing Version B statistics paper already in EVALORA. The wording,
values, marks, criteria, options and figure data are taken from the two source
documents; every key is verified against the official marking scheme.
"""
from summative_b_common import (
    data_table, diagram, doc, graph_figure, para, q, stats_figure, stats_spec,
)

SOURCE = "myp4-term1-summative-first-term-2026"

INSTRUCTIONS = (
    "Answer all 45 questions. Part A (Q1–25): mark or write your answers directly on this paper. "
    "Part B (Q26–45): write complete solutions, statistical tables, diagrams and reasoning in your "
    "separate exam script. A scientific calculator may be used. Where standard deviation is required, "
    "use the population standard deviation (σ). Give non-exact answers to 3 s.f. (2 d.p. where stated). "
    "Criteria (key at foot) & level: basic, intermediate, challenge."
)

SECTIONS = [
    {"id": "A", "title": "Part A — Objective questions", "questions": 25, "marks": 30,
     "instructions": "25 questions · 30 marks. Level 1 (Q1–9) circle the correct letter; True or False "
                     "(Q10–14) circle T or F; Matching (Q15–18) write one letter, P to U, in each box; "
                     "Level 2 short response (Q19–20) write the answer in the box; Level 3 challenge "
                     "(Q21–25) circle the correct letter."},
    {"id": "B", "title": "Part B — Theory questions", "questions": 20, "marks": 70,
     "instructions": "20 questions · 70 marks. Write all working, tables, diagrams and reasoning in your "
                     "separate exam script. Task 1 = Criterion A (22), Task 2 = Criterion B (15), "
                     "Task 3 = Criterion C (18), Task 4 = Criterion D (15)."},
]

CRITERION_TOTALS = {"A": 32, "B": 20, "C": 24, "D": 24}

_BANK_OPTS = [
    r"$\dfrac{\text{Frequency}}{\text{Class width}}$",
    r"$\sqrt{\dfrac{\Sigma (x-\mu)^2}{N}}$",
    "Cum. freq. curve",
    r"$\dfrac{\Sigma fx}{\Sigma f}$",
    "Stem-and-leaf",
    r"$Q_3-Q_1$",
]


def _figure(spec):
    return diagram(spec)


def _graph(title, points, *, x_min=0, x_max=6, y_min=0, y_max=20,
           x_label="n", y_label="Term", show_coordinates=True):
    return graph_figure({
        "version": 1,
        "title": title,
        "domain": {
            "xMin": x_min, "xMax": x_max, "yMin": y_min, "yMax": y_max,
            "gridStep": None, "showGrid": True, "showAxes": True,
            "showCoordinates": show_coordinates, "showLegend": len(points) > 1,
            "showIntersections": False, "equalScale": False,
        },
        "points": [
            {"id": f"p{i}", "x": x, "y": y, "label": label, "color": color,
             "showCoordinates": show_coordinates, "open": False, "visible": True}
            for i, (x, y, label, color) in enumerate(points)
        ],
        "functions": [],
        "segments": [],
        "annotations": [],
        "strokes": [],
        "regions": [],
    })


def _q2_stem():
    return _figure({
        "kind": "stem_leaf",
        "title": "Mental-maths quiz scores",
        "stemKey": "2 | 4 = 24 marks",
        "stemRows": [
            {"stem": "1", "leaves": ["8", "9"]},
            {"stem": "2", "leaves": ["1", "4", "4", "7"]},
            {"stem": "3", "leaves": ["0", "2", "5", "8"]},
            {"stem": "4", "leaves": ["1"]},
        ],
    })


def _q5_chart():
    return {
        "type": "image",
        "attrs": {
            "src": "/exam-figures/myp4-a/q05.png",
            "alt": "Bar chart of club enrolments for Robotics, Debate, Drama and Coding",
            "title": "Club enrolments",
            "width": 46,
        },
    }


def _q7_box():
    return _figure({
        "kind": "box_plot",
        "title": "Box-and-whisker diagram",
        "xLabel": "", "xMin": 10, "xMax": 50,
        "fiveNumber": {"min": 15, "q1": 22, "median": 30, "q3": 40, "max": 48},
    })


def _q21_ogive():
    return _figure({
        "kind": "cumulative_curve",
        "title": "Lifetimes of 80 cells",
        "xLabel": "Lifetime (h)", "yLabel": "Cum. freq.",
        "xMin": 0, "xMax": 50, "yMin": 0, "yMax": 80,
        "points": [[0, 0], [10, 3], [15, 8], [20, 20], [25, 30], [30, 40],
                   [35, 60], [40, 70], [45, 76], [50, 80]],
        "joinPoints": True,
    })


def _q22_histogram():
    return _figure({
        "kind": "histogram",
        "title": "Pebble masses",
        "xLabel": "Mass, m (g)", "yLabel": "Freq. density",
        "xMin": 0, "xMax": 40, "yMin": 0, "yMax": 4,
        "bars": [
            {"from": 0, "to": 10, "height": 1.5},
            {"from": 10, "to": 20, "height": 3.5},
            {"from": 20, "to": 40, "height": 2.0},
        ],
    })


def _q30_ogive():
    return _figure({
        "kind": "cumulative_curve",
        "title": "Masses of 60 mangoes",
        "xLabel": "Mass (g)", "yLabel": "Cum. freq.",
        "xMin": 150, "xMax": 400, "yMin": 0, "yMax": 60,
        "points": [[150, 0], [200, 6], [225, 15], [250, 21], [275, 30],
                   [300, 39], [325, 45], [350, 54], [400, 60]],
        "joinPoints": True,
    })


def _q38_chart():
    return stats_figure(stats_spec(
        "bar_chart", title="Tobi's broadband-speed chart",
        x_label="Speed (Mbps)", y_label="Freq.",
        categories=[("0–10", 6), ("10–20", 14), ("20–40", 12)],
    ))


def _q39_boxes():
    return _figure({
        "kind": "box_plot",
        "title": "Science scores (%) for Classes 9A and 9B",
        "xLabel": "Score (%)", "xMin": 20, "xMax": 90,
        "boxPlots": [
            {"label": "9A", "min": 35, "q1": 52, "median": 64, "q3": 74, "max": 88},
            {"label": "9B", "min": 22, "q1": 44, "median": 64, "q3": 80, "max": 88},
        ],
    })


def _open(n, *, crit, marks, lvl, topic, subtopic, blocks, expl, parts=None,
          tools=None, guidance=None, number=None):
    return q(n, sec="B", crit=crit, marks=marks, lvl=lvl, topic=topic,
             subtopic=subtopic, blocks=blocks, qtype="open_ended", expl=expl,
             parts=parts, tools=tools or ["rich_text", "math"], guidance=guidance,
             number=number)

PAPER_TITLES = {
    26: 'Data classification & graph selection',
    27: 'Central tendency & dispersion',
    28: 'Grouped discrete-limit distribution',
    29: 'Population standard deviation',
    30: 'Cumulative frequency curve',
    31: 'Unequal widths & frequency density',
    32: 'Outlier sensitivity pattern',
    33: 'Scaling & shifting populations',
    34: 'Class-width granularity & estimated mean',
    35: 'Quartile spacing & skewness',
    36: 'Back-to-back stem-and-leaf diagram',
    37: 'Constructing a continuous grouped table',
    38: 'Critiquing & constructing a histogram',
    39: 'Comparing box-and-whisker diagrams',
    40: 'Precision in statistical language',
    41: 'Solar mini-grid demand',
    42: 'Water-sachet quality control',
    43: 'Athletics trial selection',
    44: 'Courier delivery times & outliers',
    45: 'Maize hybrid selection',
}


def _with_paper_titles(questions):
    """Print each Part B question's source title, exactly as the paper does."""
    for record in questions:
        title = PAPER_TITLES.get(record["n"])
        if not title:
            continue
        record["cfg"]["paper_title"] = title
        record["doc"]["content"].insert(0, {
            "type": "paragraph",
            "content": [{"type": "text", "text": title, "marks": [{"type": "bold"}]}],
        })
    return questions


def build():
    Q = []

    # ── Part A · Level 1 · Q1–9 · 1 mark ────────────────────────────────────
    Q.append(q(1, sec="A", crit="A", marks=1, lvl="basic", topic="Types of data",
               subtopic="quantitative continuous data",
               blocks=[para("Which variable recorded in a Grade 9 health survey is quantitative continuous data?")],
               opts=["Blood group (A, B, AB, O)", "Number of siblings", "Body mass (in kg)",
                     "Mode of school transport"], ans="C",
               expl="Body mass is measured on a continuous numerical scale. Blood group and transport mode "
                    "are qualitative; number of siblings is quantitative discrete."))

    Q.append(q(2, sec="A", crit="C", marks=1, lvl="basic", topic="Stem-and-leaf diagrams",
               subtopic="median and range",
               blocks=[para("The ordered stem-and-leaf diagram shows 11 mental-maths quiz scores:"),
                       _q2_stem(),
                       para("What are the median and range of these 11 scores?")],
               opts=["Median 27, range 23", "Median 24, range 23", "Median 27, range 30",
                     "Median 24, range 30"], ans="A",
               expl="Ordered scores: 18, 19, 21, 24, 24, 27, 30, 32, 35, 38, 41. The 6th value is 27; "
                    "range = 41 − 18 = 23."))

    Q.append(q(3, sec="A", crit="A", marks=1, lvl="basic", topic="Measures of central tendency",
               subtopic="mean",
               blocks=[para("Seven seedlings have heights (cm): 12, 15, 11, 18, 15, 14, 20. What is their mean height?")],
               opts=["14.5 cm", "15 cm", "15.5 cm", "9 cm"], ans="B",
               expl=r"$\frac{12+15+11+18+15+14+20}{7}=\frac{105}{7}=15$ cm."))

    Q.append(q(4, sec="A", crit="A", marks=1, lvl="basic", topic="Grouped data",
               subtopic="class boundaries",
               blocks=[para("Parcel masses, measured to the nearest kilogram, are grouped into 10–14 kg, "
                            "15–19 kg, 20–24 kg. What are the lower and upper class boundaries of 15–19 kg?")],
               opts=["15 kg and 19 kg", "14.5 kg and 19.5 kg", "14.9 kg and 19.1 kg",
                     "14.5 kg and 18.5 kg"], ans="B",
               expl="Nearest-kilogram measurements have ±0.5 kg precision, so the boundaries are 14.5 kg "
                    "and 19.5 kg."))

    Q.append(q(5, sec="A", crit="C", marks=1, lvl="basic", topic="Statistical graphs",
               subtopic="bar chart vs histogram",
               blocks=[para("The chart shows club enrolments (Robotics, Debate, Drama, Coding). Why are the "
                            "bars drawn with gaps?"),
                       _q5_chart()],
               opts=["Even frequencies", "Categorical data", "Unequal widths", "Ogive scale"], ans="B",
               expl="Club enrolment is categorical, so a bar graph with separated bars is used. A histogram "
                    "has adjacent bars because its horizontal axis is continuous."))

    Q.append(q(6, sec="A", crit="A", marks=1, lvl="basic", topic="Grouped data",
               subtopic="median class",
               blocks=[para("Travel times $t$ (min) of 40 commuters: $0 \\le t < 10$ $(f = 6)$, "
                            "$10 \\le t < 20$ $(f = 11)$, $20 \\le t < 30$ $(f = 15)$, $30 \\le t < 40$ "
                            "$(f = 8)$. Which interval contains the median?")],
               opts=[r"$0 \le t < 10$", r"$10 \le t < 20$", r"$20 \le t < 30$", r"$30 \le t < 40$"],
               ans="C",
               expl="Cumulative frequencies are 6, 17, 32, 40. For N = 40 the median is at position 20.5, "
                    "which falls in the class with cumulative frequency 17 to 32: 20 ≤ t < 30."))

    Q.append(q(7, sec="A", crit="C", marks=1, lvl="basic", topic="Box-and-whisker diagrams",
               subtopic="interquartile range",
               blocks=[para("From the box-and-whisker diagram below, what is the interquartile range (IQR)?"),
                       _q7_box()],
               opts=["33", "18", "26", "30"], ans="B",
               expl="The box runs from Q1 = 22 to Q3 = 40, so IQR = 40 − 22 = 18."))

    Q.append(q(8, sec="A", crit="D", marks=1, lvl="basic", topic="Effect of outliers",
               subtopic="mean and median under an outlier",
               blocks=[para("Five test scores are 68, 70, 72, 74, 76. Including a late sitting outlier of 8 "
                            "gives six scores. How do the mean and median change?")],
               opts=["Mean drops sharply; median slightly", "Both stay unchanged",
                     "Median drops more than mean", "Mean rises; median drops"], ans="A",
               expl="Original mean and median are both 72. With 8, the mean is 368/6 ≈ 61.33 (a large fall), "
                    "while the median is (70 + 72)/2 = 71 (a small fall)."))

    Q.append(q(9, sec="A", crit="A", marks=1, lvl="basic", topic="Population standard deviation",
               subtopic="population standard deviation",
               blocks=[para("A population of $N = 4$ values $\\{3, 5, 7, 9\\}$ has mean $\\mu = 6$. What is its "
                            "population standard deviation $\\sigma$?")],
               opts=["5", r"$\sqrt{5}$", r"$\sqrt{20/3}$", "2"], ans="B",
               expl=r"$\sigma^2=\frac{9+1+1+9}{4}=5$, so $\sigma=\sqrt{5}$."))

    # ── True or false · Q10–14 ───────────────────────────────────────────────
    Q.append(q(10, sec="A", crit="A", marks=1, lvl="intermediate", topic="Estimated mean",
               subtopic="grouped mean as an estimate", qtype="true_false",
               blocks=[para("A mean found from a grouped table is an estimate because exact individual values "
                            "in each class are unknown.")], ans="T",
               expl="True. Grouping replaces unknown individual values by class midpoints, so the mean is an "
                    "estimate."))

    Q.append(q(11, sec="A", crit="C", marks=1, lvl="intermediate", topic="Histograms",
               subtopic="frequency density", qtype="true_false",
               blocks=[para("In a histogram with unequal class widths, bar height must represent frequency "
                            "rather than frequency density.")], ans="F",
               expl="False. With unequal widths, bar area must represent frequency, so height is frequency "
                    "density = frequency ÷ class width."))

    Q.append(q(12, sec="A", crit="B", marks=1, lvl="intermediate", topic="Standard deviation",
               subtopic="shift invariance", qtype="true_false",
               blocks=[para("Adding 10 to every value in a population increases μ by 10 and leaves σ unchanged.")],
               ans="T",
               expl="True. Every deviation (x + 10) − (μ + 10) equals x − μ, so the spread does not change."))

    Q.append(q(13, sec="A", crit="A", marks=1, lvl="intermediate", topic="Cumulative frequency",
               subtopic="quartile position", qtype="true_false",
               blocks=[para("On a cumulative frequency curve for 120 items, $Q_3$ is read at cumulative "
                            "frequency 90.")], ans="T",
               expl=r"True, because $Q_3$ lies at $\frac{3}{4}N=\frac{3}{4}(120)=90$."))

    Q.append(q(14, sec="A", crit="A", marks=1, lvl="intermediate", topic="Outliers",
               subtopic="effect of increasing the maximum", qtype="true_false",
               blocks=[para("Increasing only the largest value in an ordered set ($N \\ge 5$) always increases "
                            "both range and IQR.")], ans="F",
               expl="False. The range increases, but for N ≥ 5 the quartiles do not use the maximum, so the "
                    "IQR is unchanged."))

    # ── Matching · Q15–18 ────────────────────────────────────────────────────
    _bank = data_table(["P", "Q", "R", "S", "T", "U"], [_BANK_OPTS])
    for n, stem, answer, reason, crit in [
        (15, "Diagram showing distribution shape while retaining every exact raw data value", "T",
         "A stem-and-leaf diagram keeps every individual digit, so all raw values can be recovered.", "C"),
        (16, "Formula for frequency density when constructing an unequal-width histogram", "P",
         r"Frequency density is $\frac{\text{frequency}}{\text{class width}}$.", "A"),
        (17, "Exact formula for the population standard deviation σ of N values", "Q",
         r"Population $\sigma=\sqrt{\frac{\Sigma(x-\mu)^2}{N}}$.", "A"),
        (18, "Graph used to estimate median, quartiles and percentiles of grouped continuous data", "R",
         "A cumulative frequency curve (ogive) is read at ¼N, ½N and ¾N.", "C"),
    ]:
        Q.append(q(n, sec="A", crit=crit, marks=1, lvl="intermediate",
                   topic="Statistical vocabulary", subtopic="matching a definition to its term",
                   blocks=[para(stem), _bank], opts=list(_BANK_OPTS),
                   labels=["P", "Q", "R", "S", "T", "U"], ans=answer, expl=reason))

    # ── Short response · Q19–20 ──────────────────────────────────────────────
    Q.append(q(19, sec="A", crit="D", marks=1, lvl="intermediate", topic="Estimated mean",
               subtopic="estimated mean from a grouped table", qtype="numeric", numeric=16.5, tol=0,
               blocks=[para("Solar output over 20 days: $12 \\le E < 18$ kWh $(f = 15)$ and $18 \\le E < 24$ "
                            "kWh $(f = 5)$. Find the estimated mean output.  [kWh]")],
               expl=r"Midpoints are 15 and 21, so the estimate is $\frac{15(15)+5(21)}{20}=\frac{330}{20}=16.5$ kWh."))

    Q.append(q(20, sec="A", crit="D", marks=1, lvl="intermediate", topic="Combined mean",
               subtopic="finding a seventh value", qtype="numeric", numeric=188, tol=0,
               blocks=[para("Six basketball players have mean height 174 cm. A seventh player joins and the new "
                            "mean is 176 cm. Find the seventh player's height.  [cm]")],
               expl="Total of six is 6 × 174 = 1044 cm; total of seven is 7 × 176 = 1232 cm; the seventh player "
                    "is 1232 − 1044 = 188 cm."))

    # ── Level 3 · Q21–25 ─────────────────────────────────────────────────────
    Q.append(q(21, sec="A", crit="D", marks=2, lvl="challenge", topic="Cumulative frequency",
               subtopic="reading median and quartiles",
               blocks=[para("The cumulative frequency curve shows lifetimes (h) of 80 cells. Estimate the median "
                            "and IQR."), _q21_ogive()],
               opts=["Med 30, IQR 15", "Med 40, IQR 40", "Med 30, IQR 20", "Med 25, IQR 15"], ans="A",
               expl="At CF 40 the median is 30 h; at CF 20, Q1 = 20 h and at CF 60, Q3 = 35 h. IQR = 35 − 20 = 15 h."))

    Q.append(q(22, sec="A", crit="D", marks=2, lvl="challenge", topic="Histograms",
               subtopic="total frequency from frequency density",
               blocks=[para("The unequal-width histogram shows pebble masses using frequency density. How many "
                            "pebbles were measured in total?"), _q22_histogram()],
               opts=["7", "70", "90", "140"], ans="C",
               expl="Frequency = width × frequency density: 10(1.5) + 10(3.5) + 20(2.0) = 15 + 35 + 40 = 90."))

    Q.append(q(23, sec="A", crit="B", marks=2, lvl="challenge", topic="Estimated mean",
               subtopic="finding a missing frequency",
               blocks=[para("Grouped classes $0 \\le x < 4$ $(f = 5)$, $4 \\le x < 8$ $(f = k)$ and "
                            "$8 \\le x < 12$ $(f = 7)$ yield an estimated mean of 6.4. Find $k$.")],
               opts=["6", "8", "10", "12"], ans="B",
               expl=r"$\frac{5(2)+6k+7(10)}{12+k}=6.4$ gives $80+6k=76.8+6.4k$, so $0.4k=3.2$ and $k=8$."))

    Q.append(q(24, sec="A", crit="D", marks=2, lvl="challenge", topic="Outlier fences",
               subtopic="upper fence", blocks=[para("Sixty commute times (min) have Min = 8, Q1 = 22, Med = 29, "
                                                    "Q3 = 34, Max = 56. Using upper outlier fence $Q_3 + 1.5 \\times IQR$, "
                                                    "which statement is true?")],
               opts=["Fence 52; high outlier present", "Fence 58; no high outlier",
                     "Fence 47; no high outlier", "Fence 74; high outlier present"], ans="A",
               expl="IQR = 34 − 22 = 12, so the upper fence is 34 + 1.5(12) = 52. Since 56 > 52, a high outlier "
                    "is present."))

    Q.append(q(25, sec="A", crit="B", marks=2, lvl="challenge", topic="Linear transformation",
               subtopic="mean and standard deviation under coding",
               blocks=[para("A population of 25 readings has $\\mu = 12.0$ and $\\sigma = 2.5$. Every value $x$ is "
                            "transformed to $y = 2x - 5$. What are the new $\\mu_y$ and $\\sigma_y$?")],
               opts=["19.0; 0.0", "19.0; 2.5", "19.0; 5.0", "24.0; 5.0"], ans="C",
               expl=r"$\mu_y=2(12.0)-5=19.0$ and $\sigma_y=|2|(2.5)=5.0$; the −5 shift does not affect spread."))

    # ── Part B · Criterion A ────────────────────────────────────────────────
    Q.append(_open(26, crit="A", marks=3, lvl="basic", topic="Types of data & graph selection",
                   subtopic="classifying variables and choosing a chart",
                   blocks=[para("Classify each variable as qualitative, quantitative discrete, or quantitative "
                                "continuous, and name a suitable chart (bar graph or histogram) for (b) and (c):"),
                           para("(a) Primary language spoken at home (Fon, French, English, Yoruba). [1]\n"
                                "(b) Number of library books borrowed per student in October. [1]\n"
                                "(c) Time (in seconds) taken by Grade 9 sprinters to run 400 m. [1]")],
                   parts=[("(a)", 1, "Qualitative language data"), ("(b)", 1, "Discrete count and bar graph"),
                          ("(c)", 1, "Continuous time and histogram")],
                   expl="(a) Qualitative (categorical). (b) Quantitative discrete; a bar graph with separated bars "
                        "for the whole-number counts (a discrete frequency histogram is also acceptable if stated). "
                        "(c) Quantitative continuous; a histogram with adjacent bars over continuous time intervals.",
                   guidance="Both the classification and an appropriate chart are required in (b) and (c).",
                   tools=["rich_text", "math"]))

    Q.append(_open(27, crit="A", marks=3, lvl="basic", topic="Central tendency & dispersion",
                   subtopic="mode, median, range and mean",
                   blocks=[para("Goals scored per match by a school team in 12 matches: 2, 0, 3, 1, 2, 4, 2, 1, 0, "
                                "3, 2, 4."),
                           para("(a) Find the mode, median, and range of goals scored. [2]\n"
                                "(b) Calculate the exact mean number of goals per match. [1]")],
                   parts=[("(a)", 2, "Mode, median and range"), ("(b)", 1, "Exact mean")],
                   expl="Ordered: 0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4. Mode = 2; median = (2 + 2)/2 = 2; range = "
                        "4 − 0 = 4. (b) Σx = 24, so mean = 24/12 = 2 goals.",
                   tools=["rich_text", "math"]))

    Q.append(_open(28, crit="A", marks=4, lvl="intermediate", topic="Grouped discrete-limit distribution",
                   subtopic="boundaries, modal/median class and estimated mean",
                   blocks=[para("Masses (to the nearest gram) of 50 harvested cocoa pods are given in the table."),
                           data_table(["Mass (g)", "300–319", "320–339", "340–359", "360–379", "380–399"],
                                      [["Freq. (f)", "6", "14", "18", "8", "4"]]),
                           para("(a) State the lower & upper class boundaries of 320–339, the modal class, and the "
                                "class containing the median. [2]\n"
                                "(b) Using exact mid-interval values, calculate an estimate of the mean mass. [2]")],
                   parts=[("(a)", 2, "Boundaries and classes"), ("(b)", 2, "Estimated mean")],
                   expl="(a) 319.5 g and 339.5 g; modal and median class are both 340–359 g (cumulative frequencies "
                        "6, 20, 38, 46, 50). (b) Midpoints 309.5, 329.5, 349.5, 369.5, 389.5 give Σfx = 17 275, so "
                        "the estimated mean is 345.5 g.",
                   guidance="Use exact mid-interval values; a single midpoint instead of the class interval loses the "
                            "second mark in (a).",
                   tools=["rich_text", "math", "table"]))

    Q.append(_open(29, crit="A", marks=4, lvl="intermediate", topic="Population standard deviation",
                   subtopic="squared deviations and exact surd",
                   blocks=[para("A robotics sensor logs a complete population of $N = 6$ voltages (V): 9, 11, 12, 12, "
                                "14, 14."),
                           para("(a) Calculate the population mean μ and each squared deviation $(x - \\mu)^2$. [2]\n"
                                "(b) Find the population standard deviation σ in exact surd form and to 2 d.p. [2]")],
                   parts=[("(a)", 2, "Mean and squared deviations"), ("(b)", 2, "Exact and decimal σ")],
                   expl=r"(a) $\mu=72/6=12$ V; squared deviations are 9, 1, 0, 0, 4, 4 (sum 18). "
                        r"(b) $\sigma=\sqrt{18/6}=\sqrt{3}\approx1.73$ V.",
                   tools=["rich_text", "math"]))

    Q.append(_open(30, crit="A", marks=4, lvl="intermediate", topic="Cumulative frequency curve",
                   subtopic="quartiles and a contextual count",
                   blocks=[para("The ogive shows the masses (g) of 60 harvested mangoes."), _q30_ogive(),
                           para("(a) Estimate Q2, Q1, Q3 and the IQR. [2]\n"
                                "(b) Mangoes above 350 g are Premium. Estimate how many qualify and their percentage. [2]")],
                   parts=[("(a)", 2, "Q2, Q1, Q3 and IQR"), ("(b)", 2, "Premium count and percentage")],
                   expl="(a) At CF 30, Q2 = 275 g; at CF 15, Q1 = 225 g; at CF 45, Q3 = 325 g; IQR = 100 g. "
                        "(b) At 350 g, CF = 54, so 60 − 54 = 6 mangoes are Premium, which is 10%.",
                   guidance="Allow ±3 g reading tolerance on each quartile and follow through the IQR.",
                   tools=["rich_text", "math", "graph"]))

    Q.append(_open(31, crit="A", marks=4, lvl="challenge", topic="Unequal widths & frequency density",
                   subtopic="frequency density and histogram scaling",
                   blocks=[para("Clinic waiting times $t$ (min) for 64 patients:"),
                           data_table(["Time t (min)", "0 ≤ t < 5", "5 ≤ t < 15", "15 ≤ t < 30", "30 ≤ t < 50"],
                                      [["Freq. (f)", "10", "28", "18", "8"]]),
                           para("(a) Calculate the class width and frequency density for all four classes. [2]\n"
                                "(b) If 1 cm on the vertical axis represents 0.5 units of frequency density, state "
                                "the four bar heights (cm) and estimate how many patients waited 10 ≤ t < 25 min. [2]")],
                   parts=[("(a)", 2, "Widths and frequency densities"), ("(b)", 2, "Bar heights and a class count")],
                   expl="(a) Widths 5, 10, 15, 20; frequency densities 2.0, 2.8, 1.2, 0.4. (b) Heights are 4.0, 5.6, "
                        "2.4, 0.8 cm. Patients in 10 ≤ t < 25: 5(2.8) + 10(1.2) = 14 + 12 = 26.",
                   tools=["rich_text", "math", "table", "graph"]))

    # ── Criterion B ─────────────────────────────────────────────────────────
    Q.append(_open(32, crit="B", marks=4, lvl="challenge", topic="Outlier sensitivity pattern",
                   subtopic="mean, median and IQR under an extreme value",
                   blocks=[para("Seven daily rainfalls (mm) are 12, 14, 15, 15, 16, 18, 22. On Day 8, a storm records "
                                "$x$ mm $(x \\ge 22)$."),
                           para("(a) Find the 7-day mean, median & IQR; then recalculate all three for 8 days when "
                                "$x = 64$ mm. [2]\n"
                                "(b) Express the 8-day mean in terms of $x$, and explain why the 8-day median and IQR "
                                "stay constant for all $x \\ge 22$. [2]")],
                   parts=[("(a)", 2, "Statistics with and without x"), ("(b)", 2, "Formula and invariance proof")],
                   expl="(a) 7-day mean 16 mm, median 15 mm, Q1 14, Q3 18, IQR 4 mm. With x = 64: mean 22 mm, "
                        "median 15.5 mm, Q1 14.5, Q3 20, IQR 5.5 mm. (b) Mean = (112 + x)/8 = 14 + x/8. For every "
                        "x ≥ 22 the ordered list keeps x last, so positions 4/5 remain 15 and 16 and positions 2/3 "
                        "and 6/7 remain 14/15 and 18/22; median and IQR are therefore fixed.",
                   guidance="The invariance mark requires an order-position argument, not just “outliers do not "
                            "affect the median”.",
                   tools=["rich_text", "math", "table"]))

    Q.append(_open(33, crit="B", marks=4, lvl="challenge", topic="Scaling & shifting populations",
                   subtopic="effect of affine transformations on mean and σ",
                   blocks=[para("Three populations of size $N = 4$ are $P_1 = \\{2, 4, 6, 8\\}$, "
                                "$P_2 = \\{12, 14, 16, 18\\}$ $(y = x + 10)$ and $P_3 = \\{6, 12, 18, 24\\}$ $(z = 3x)$."),
                           para("(a) Given $\\mu_1 = 5$ and $\\sigma_1 = \\sqrt{5}$, find $(\\mu_2, \\sigma_2)$ and "
                                "$(\\mu_3, \\sigma_3)$ in exact surd form. [2]\n"
                                "(b) State general rules for $\\mu_w$ and $\\sigma_w$ when $w = ax + b$ $(a > 0)$, and "
                                "algebraically prove $\\sigma_w = a\\sigma_x$. [2]")],
                   parts=[("(a)", 2, "Mean and σ for both transformed populations"),
                          ("(b)", 2, "General rules and proof")],
                   expl=r"(a) $\mu_2=15$, $\sigma_2=\sqrt{5}$; $\mu_3=15$, $\sigma_3=\sqrt{45}=3\sqrt{5}$. "
                        r"(b) $\mu_w=a\mu_x+b$ and $\sigma_w=a\sigma_x$; since $w-\mu_w=a(x-\mu_x)$, "
                        r"$\sigma_w=\sqrt{a^2\Sigma(x-\mu_x)^2/N}=a\sigma_x$.",
                   tools=["rich_text", "math"]))

    Q.append(_open(34, crit="B", marks=4, lvl="challenge", topic="Class-width granularity",
                   subtopic="estimated mean and grouping bias",
                   blocks=[para("Ten raw marks (exact mean 20.5) are: 11, 12, 13, 14, 15, 16, 26, 28, 34, 36."),
                           para("(a) Group into two wide classes $(10 \\le x < 25, 25 \\le x < 40)$ to find estimated "
                                "mean $m_A$, then into three narrower classes $(10 \\le x < 20, 20 \\le x < 30, "
                                "30 \\le x < 40)$ to find $m_B$. [2]\n"
                                "(b) Explain why $m_A$ overestimates 20.5 sharply and generalise how class width "
                                "affects midpoint-estimate accuracy. [2]")],
                   parts=[("(a)", 2, "Both estimated means"), ("(b)", 2, "Reason and generalisation")],
                   expl="(a) Wide: 6 at mid 17.5 and 4 at mid 32.5, so mA = 23.5. Narrow: 6 at 15, 2 at 25, 2 at 35, "
                        "so mB = 21.0. (b) The six low values average 13.5 but are represented by 17.5, adding 4 to "
                        "each; narrower classes reduce the maximum distance from raw values to midpoints and therefore "
                        "reduce grouping bias.",
                   tools=["rich_text", "math", "table"]))

    Q.append(_open(35, crit="B", marks=3, lvl="challenge", topic="Quartile spacing & skewness",
                   subtopic="classifying skew from quartiles",
                   blocks=[para("Three score sets share $Q_2 = 60$: Set X $(Q_1 = 42, Q_3 = 78)$; Set Y "
                                "$(Q_1 = 54, Q_3 = 82)$; Set Z $(Q_1 = 30, Q_3 = 66)$."),
                           para("(a) Compare $Q_2 - Q_1$ with $Q_3 - Q_2$ to classify X, Y and Z as symmetric, "
                                "positively skewed or negatively skewed. [2]\n"
                                "(b) Write an inequality in $Q_1, Q_2, Q_3$ for positive skew and describe how its "
                                "ogive slope changes from $Q_1$ to $Q_3$. [1]")],
                   parts=[("(a)", 2, "Compare quartile spacings"), ("(b)", 1, "Inequality and ogive shape")],
                   expl="(a) X: 18 and 18 → symmetric. Y: 6 < 22 → positively skewed. Z: 30 > 6 → negatively skewed. "
                        "(b) Positive skew: Q3 − Q2 > Q2 − Q1 (equivalently Q1 + Q3 > 2Q2); the ogive is steep from "
                        "Q1 to Q2 and flatter from Q2 to Q3.",
                   tools=["rich_text", "math"]))

    # ── Criterion C ─────────────────────────────────────────────────────────
    Q.append(_open(36, crit="C", marks=4, lvl="intermediate", topic="Back-to-back stem-and-leaf",
                   subtopic="constructing and comparing distributions",
                   blocks=[para("Pulse rates (bpm) of 10 swimmers:"),
                           para("Rest: 68, 72, 64, 75, 81, 68, 70, 77, 63, 72  |  Post-warm-up: 84, 92, 78, 88, 95, "
                                "84, 90, 102, 86, 91."),
                           para("(a) Construct an ordered back-to-back stem-and-leaf diagram (stems 6 to 10) with a "
                                "dual key. [3]\n"
                                "(b) Compare the two distributions in context using their medians and ranges. [1]")],
                   parts=[("(a)", 3, "Complete ordered diagram and dual key"),
                          ("(b)", 1, "Comparison using median and range")],
                   expl="(a) Rest leaves (outward, right-to-left): stem 6: 8, 8, 4, 3; stem 7: 5, 2, 2, 0; stem 8: 1. "
                        "Post leaves: stem 6: 7; stem 7: 8; stem 8: 4, 4, 6, 8; stem 9: 0, 1, 2, 5; stem 10: 2. "
                        "Dual key, e.g. 4 | 6 | 8 means 64 bpm (rest) and 68 bpm (post). (b) Rest median 71 bpm and "
                        "range 18 bpm; post median 89 bpm and range 24 bpm: post rates are substantially higher and "
                        "slightly more spread out.",
                   guidance="Left-side leaves must increase outward from the stem; all 20 leaves and the units of the "
                            "dual key are required.",
                   tools=["stem_leaf", "rich_text"]))

    Q.append(_open(37, crit="C", marks=3, lvl="intermediate", topic="Constructing a grouped table",
                   subtopic="continuous classes and ambiguity",
                   blocks=[para("Heights $h$ (cm) of 20 seedlings: 6.4, 11.2, 8.5, 14.0, 17.8, 9.1, 12.6, 7.3, 15.5, "
                                "10.0, 13.4, 18.2, 11.9, 5.8, 14.7, 9.9, 16.1, 12.0, 8.0, 13.8."),
                           para("(a) Construct a grouped table with classes $5 \\le h < 10$, $10 \\le h < 15$, "
                                "$15 \\le h < 20$, midpoints and frequencies. [2]\n"
                                "(b) Explain why writing class labels “5–10, 10–15, 15–20” is ambiguous for "
                                "$h = 10.0$ cm. [1]")],
                   parts=[("(a)", 2, "Grouped table and frequencies"), ("(b)", 1, "Boundary ambiguity")],
                   expl="(a) 5 ≤ h < 10: midpoint 7.5, f = 7; 10 ≤ h < 15: midpoint 12.5, f = 9; 15 ≤ h < 20: "
                        "midpoint 17.5, f = 4; total 20. (b) The labels share the endpoint 10, so it is unclear whether "
                        "10.0 belongs to the first or second class; the strict inequalities place it uniquely in the "
                        "second class.",
                   tools=["rich_text", "math", "table"]))

    Q.append(_open(38, crit="C", marks=4, lvl="intermediate", topic="Critiquing a histogram",
                   subtopic="frequency density and equal bar widths",
                   blocks=[para("Tobi plots continuous broadband speeds $0 \\le s < 10$ $(f = 6)$, $10 \\le s < 20$ "
                                "$(f = 14)$, $20 \\le s < 40$ $(f = 12)$ as shown."), _q38_chart(),
                           para("(a) Identify two statistical/graphical errors in Tobi's chart. [2]\n"
                                "(b) Draw a correct, fully labelled frequency-density histogram in your script. [2]")],
                   parts=[("(a)", 2, "Two distinct errors"), ("(b)", 2, "Correct histogram")],
                   expl="(a) Any two of: continuous data should have adjacent bars (no gaps); the vertical axis plots "
                        "frequency instead of frequency density; the 20–40 bar is drawn the same width as the 10-wide "
                        "bars although its class is twice as wide. (b) Frequency densities are 0.6, 1.4 and 0.6; draw "
                        "adjacent bars, the third twice as wide, with both axes labelled.",
                   tools=["graph", "rich_text", "math"]))

    Q.append(_open(39, crit="C", marks=4, lvl="intermediate", topic="Comparing box-and-whisker diagrams",
                   subtopic="five-number summary and contextual comparison",
                   blocks=[para("Science scores (%) for Class 9A (32 students) and Class 9B (32 students) are shown."),
                           _q39_boxes(),
                           para("(a) State the five-number summary of 9A and calculate the IQR of both classes. [2]\n"
                                "(b) Write two structured comparisons (average & consistency) citing numerical values. [2]")],
                   parts=[("(a)", 2, "Summary and both IQRs"), ("(b)", 2, "Average and consistency comparison")],
                   expl="(a) 9A: Min 35, Q1 52, median 64, Q3 74, Max 88, IQR 22. 9B: Q1 44, Q3 80, IQR 36. "
                        "(b) Both classes have the same median (64%), so typical performance is identical, but 9A is "
                        "much more consistent: IQR 22% versus 36% and range 53% versus 66%.",
                   guidance="Bare numerical listings without contextual interpretation earn at most 1 of 2 in (b).",
                   tools=["graph", "rich_text", "math"]))

    Q.append(_open(40, crit="C", marks=3, lvl="challenge", topic="Precision in statistical language",
                   subtopic="modal class vs mode and population σ",
                   blocks=[para("(a) From modal class $20 \\le t < 30$ $(f = 18)$, Adama claims: “The mode is 25.” "
                                "Explain why this is invalid. [1]\n"
                                "(b) State the formula for population σ, distinguish σ from sample s, and state when σ "
                                "applies. [2]")],
                   parts=[("(a)", 1, "Modal class vs mode"), ("(b)", 2, "σ formula and distinction")],
                   expl=r"(a) 25 is only the class midpoint; the individual raw values are unknown, so no observation "
                        r"need equal 25. (b) $\sigma=\sqrt{\Sigma(x-\mu)^2/N}$ (or the frequency form). σ divides by N "
                        r"and describes a complete population; sample s divides by n − 1 (Bessel's correction) when the "
                        r"data are a subset used to estimate population spread.",
                   tools=["rich_text", "math"]))

    # ── Criterion D ─────────────────────────────────────────────────────────
    Q.append(_open(41, crit="D", marks=3, lvl="intermediate", topic="Solar mini-grid demand",
                   subtopic="estimated mean and capacity judgement",
                   blocks=[para("Daily electricity use $E$ (kWh) across 40 Abomey-Calavi homes:"),
                           data_table(["Usage E (kWh)", "0 ≤ E < 4", "4 ≤ E < 8", "8 ≤ E < 12", "12 ≤ E < 16"],
                                      [["Homes (f)", "8", "15", "11", "6"]]),
                           para("(a) Calculate the estimated mean daily usage per home. [2]\n"
                                "(b) The mini-grid supplies 315 kWh/day. Check if estimated total demand is met and "
                                "explain why actual demand could still exceed 315 kWh. [1]")],
                   parts=[("(a)", 2, "Estimated mean"), ("(b)", 1, "Capacity check and uncertainty")],
                   expl="(a) Midpoints 2, 6, 10, 14 give ΣfE = 300 and mean 7.5 kWh. (b) Estimated demand is "
                        "40 × 7.5 = 300 kWh ≤ 315, but midpoint grouping can understate demand: if many homes use near "
                        "the upper end of each class, actual demand can exceed 315 kWh.",
                   tools=["rich_text", "math", "table"]))

    Q.append(_open(42, crit="D", marks=3, lvl="challenge", topic="Water-sachet quality control",
                   subtopic="population mean and σ against limits",
                   blocks=[para("An entire batch population of $N = 10$ sachets has volumes:"),
                           data_table(["Volume x (mL)", "496", "498", "500", "502", "504"],
                                      [["Freq. (f)", "1", "2", "4", "2", "1"]]),
                           para("(a) Calculate the population mean μ and population standard deviation σ (to 2 d.p.). [2]\n"
                                "(b) Batch approval requires $499.0 \\le \\mu \\le 501.0$ mL and $\\sigma \\le 2.00$ mL. "
                                "Justify whether the batch passes. [1]")],
                   parts=[("(a)", 2, "Mean and σ"), ("(b)", 1, "Approval decision")],
                   expl=r"(a) $\mu=5000/10=500.0$ mL; $\Sigma f(x-500)^2=48$, so $\sigma=\sqrt{4.8}\approx2.19$ mL. "
                        r"(b) The mean is within limits, but σ = 2.19 mL > 2.00 mL, so the batch fails inspection.",
                   tools=["rich_text", "math", "table"]))

    Q.append(_open(43, crit="D", marks=3, lvl="intermediate", topic="Athletics trial selection",
                   subtopic="quartiles and percentiles in context",
                   blocks=[para("Cumulative frequencies for 80 sprinters' 100 m times $t$ (s):"),
                           data_table(["t ≤ (s)", "11.5", "12.0", "12.5", "13.0", "13.5", "14.0", "14.5"],
                                      [["Cum. freq.", "0", "8", "20", "44", "60", "74", "80"]]),
                           para("(a) State Q1 and Q3 and calculate the IQR of sprint times. [2]\n"
                                "(b) Runners with $t \\le 12.0$ s make the squad; the fastest 15% overall earn grants. "
                                "State squad size and justify whether $t = 12.0$ s guarantees a grant. [1]")],
                   parts=[("(a)", 2, "Quartiles and IQR"), ("(b)", 1, "Squad size and grant decision")],
                   expl="(a) N = 80: Q1 is at CF 20 → 12.5 s; Q3 at CF 60 → 13.5 s; IQR = 1.0 s. (b) CF 8 are at "
                        "or below 12.0 s, so the squad has 8 runners. The fastest 15% is 0.15 × 80 = 12 runners, and "
                        "all 8 squad members rank inside the fastest 12, so 12.0 s guarantees a grant.",
                   guidance="In sprinting smaller times are faster; the top 15% is the lowest 12 times.",
                   tools=["rich_text", "math", "graph"]))

    Q.append(_open(44, crit="D", marks=3, lvl="intermediate", topic="Courier delivery times & outliers",
                   subtopic="mean vs median and audit retention",
                   blocks=[para("Nine Porto-Novo courier trips take (min): 18, 19, 21, 22, 22, 23, 25, 26, 76 (the "
                                "76 min trip had a flat tyre)."),
                           para("(a) Calculate the mean and median for all 9 trips, and again for the 8 normal trips. [2]\n"
                                "(b) Advise which average best represents typical delivery time and why 76 min should "
                                "stay in audit logs. [1]")],
                   parts=[("(a)", 2, "Both sets of averages"), ("(b)", 1, "Advice and audit rationale")],
                   expl="(a) All 9: Σx = 252, mean 28 min, median 22 min. Normal 8: Σx = 176, mean 22 min, median "
                        "22 min. (b) Advertise the median 22 min: the 9-trip mean 28 min is pulled up by the flat-tyre "
                        "outlier, but 76 min is a genuine operational event and belongs in audit logs for reliability "
                        "analysis.",
                   tools=["rich_text", "math"]))

    Q.append(_open(45, crit="D", marks=3, lvl="challenge", topic="Maize hybrid selection",
                   subtopic="comparing centres and spreads for a risk decision",
                   blocks=[para("Two maize hybrids tested across 16 plots each (yield in t/ha):"),
                           para("Alpha: μ = 6.4, Med = 6.5, IQR = 0.7, σ = 0.45  |  Beta: μ = 6.9, Med = 6.8, "
                                "IQR = 2.1, σ = 1.40."),
                           para("(a) Compare average yield and yield consistency using both central and dispersion "
                                "measures. [2]\n"
                                "(b) Recommend one hybrid for a cooperative that must avoid yields below 5.5 t/ha, "
                                "justifying statistically. [1]")],
                   parts=[("(a)", 2, "Average and consistency comparison"), ("(b)", 1, "Risk-aware recommendation")],
                   expl="(a) Beta has the higher mean (6.9 vs 6.4) and median (6.8 vs 6.5); Alpha is much more "
                        "consistent (IQR 0.7 vs 2.1, σ 0.45 vs 1.40). (b) Choose Alpha: 5.5 t/ha is 2σ below its mean "
                        "(6.4 − 2 × 0.45 = 5.50), whereas for Beta it is only 1σ below (6.9 − 1.40 = 5.50), so Beta "
                        "carries a much higher risk of low yields.",
                   tools=["rich_text", "math"]))

    return _with_paper_titles(Q)
