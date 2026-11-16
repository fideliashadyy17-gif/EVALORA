"""Grade 9 / MYP 4 Mathematics — Term 1 Summative Assessment (Version B).

Source: "Grade_9_MYP_4_Mathematics_Summative_Assessment_Version_B.pdf"
(OAK INTERNATIONAL SCHOOL, BENIN, End of First Term E-assessment 2026/27,
MYP 4 · Grade 9, 2 hours, 100 marks). 45 questions: Part A objective
(Q1–25, 30 marks) and Part B theory (Q26–45, 70 marks). Criterion totals
printed on the paper: A 32, B 20, C 24, D 24.

Figures (histograms, stem-and-leaf, box plots, ogives) are reproduced from
the vector geometry of the source PDF, not from its text layer: the text
layer of the paper carries no figure data at all.
"""
from summative_b_common import (
    data_table, diagram, doc, para, q, stats_figure, stats_spec,
)

SOURCE = "myp4-term1-summative-b-2026"

INSTRUCTIONS = (
    "Answer all 45 questions. Part A (Q1–25): mark or write your answers directly on this paper. "
    "Part B (Q26–45): write complete solutions, statistical tables, diagrams and reasoning in your separate "
    "exam script. A scientific calculator may be used. Where standard deviation is required, use the "
    "population standard deviation (σ). Give non-exact answers to 3 s.f. (2 d.p. where stated). Criteria "
    "(key at foot) & level: basic, intermediate, challenge."
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

# Q15–18 share one answer bank printed on the paper.
_BANK_OPTS = [
    "$Q_3 - Q_1$", "Bar graph", r"$\dfrac{\Sigma fx}{\Sigma f}$", "Box-and-whisker",
    r"$\dfrac{l_L + l_U}{2}$", r"$\dfrac{\Sigma (x - \mu)^2}{N - 1}$",
]
_BANK_ROW = data_table(["P", "Q", "R", "S", "T", "U"], [list(_BANK_OPTS)])


def _stem_leaf():
    return diagram({
        "kind": "stem_leaf",
        "title": "Ages (years) of 13 chess-club members",
        "stemKey": "1 | 4 = 14 years",
        "stemRows": [
            {"stem": "1", "leaves": ["2", "3", "4", "4", "4", "6"]},
            {"stem": "2", "leaves": ["0", "1", "5", "8"]},
            {"stem": "3", "leaves": ["1", "4", "7"]},
        ],
    })


def _q5_histogram():
    return diagram({
        "kind": "histogram",
        "title": "Travel times to school",
        "xLabel": "Time (min)", "yLabel": "Freq.",
        "xMin": 0, "xMax": 40, "yMin": 0, "yMax": 15,
        "bars": [
            {"from": 0, "to": 10, "height": 5},
            {"from": 10, "to": 20, "height": 14},
            {"from": 20, "to": 30, "height": 11},
            {"from": 30, "to": 40, "height": 6},
        ],
    })


def _q7_box():
    return diagram({
        "kind": "box_plot",
        "title": "Driver reaction data",
        "xLabel": "", "xMin": 0, "xMax": 80,
        "fiveNumber": {"min": 10, "q1": 25, "median": 38, "q3": 55, "max": 75},
    })


def _q21_ogive():
    return diagram({
        "kind": "cumulative_curve",
        "title": "Marks (out of 80) of 100 students",
        "xLabel": "Mark (out of 80)", "yLabel": "Cum. freq.",
        "xMin": 0, "xMax": 80, "yMin": 0, "yMax": 100,
        "points": [[0, 0], [20, 10], [30, 25], [45, 50], [60, 80], [80, 100]],
        "joinPoints": True,
    })


def _q22_histogram():
    return diagram({
        "kind": "histogram",
        "title": "Trunk diameters of trees",
        "xLabel": "Diameter, d (cm)", "yLabel": "Freq. density",
        "xMin": 0, "xMax": 50, "yMin": 0, "yMax": 3,
        "bars": [
            {"from": 0, "to": 10, "height": 1.2},
            {"from": 10, "to": 25, "height": 2.4},
            {"from": 25, "to": 50, "height": 0.8},
        ],
    })


def _q30_ogive():
    return diagram({
        "kind": "cumulative_curve",
        "title": "Journey times (min) of 80 commuters",
        "xLabel": "Time (min)", "yLabel": "Cum. freq.",
        "xMin": 0, "xMax": 60, "yMin": 0, "yMax": 80,
        "points": [[10, 0], [20, 12], [25, 20], [35, 40], [45, 60], [50, 72], [60, 80]],
        "joinPoints": True,
    })


def _q38_chart():
    return diagram({
        "kind": "histogram",
        "title": "Amina's chart of commute distances",
        "xLabel": "Distance (km)", "yLabel": "Freq.",
        "xMin": 0, "xMax": 25, "yMin": 0, "yMax": 15,
        "bars": [
            {"from": 0, "to": 5, "height": 8},
            {"from": 5, "to": 10, "height": 12},
            {"from": 10, "to": 25, "height": 15},
        ],
    })


def _q39_boxes():
    return diagram({
        "kind": "box_plot",
        "title": "Customer wait times (min)",
        "xLabel": "Wait time (min)", "xMin": 0, "xMax": 35,
        "boxPlots": [
            {"label": "North", "min": 4, "q1": 8, "median": 14, "q3": 22, "max": 32},
            {"label": "South", "min": 6, "q1": 11, "median": 14, "q3": 17, "max": 24},
        ],
    })


def build():
    Q = []

    # ── LEVEL 1 · BASIC · Q1–9 · 1 mark each ─────────────────────────────────
    Q.append(q(1, sec="A", crit="A", marks=1, lvl="basic", topic="Data classification",
               subtopic="qualitative vs quantitative data",
               blocks=[para("In a school cafeteria audit, which recorded variable is quantitative discrete data?")],
               opts=["Favourite fruit choice", "Soup temperature (°C)", "Number of meals sold daily",
                     "Rating (Poor, Fair, Good)"], ans="C",
               expl="A count of meals is quantitative and discrete (it takes whole-number values). Favourite "
                    "fruit and the rating are qualitative; temperature is quantitative continuous."))

    Q.append(q(2, sec="A", crit="C", marks=1, lvl="basic", topic="Stem-and-leaf diagrams",
               subtopic="mode and median from a stem-and-leaf diagram",
               blocks=[para("The ordered stem-and-leaf diagram shows the ages (years) of 13 chess-club members:"),
                       _stem_leaf(),
                       para("What are the mode and median ages?")],
               opts=["Mode 14, median 20", "Mode 4, median 20", "Mode 14, median 16", "Mode 14, median 21"],
               ans="A",
               expl="The data are 12, 13, 14, 14, 14, 16, 20, 21, 25, 28, 31, 34, 37. The value 14 appears "
                    "three times, so the mode is 14. With 13 values the median is the 7th value, which is 20."))

    Q.append(q(3, sec="A", crit="A", marks=1, lvl="basic", topic="Measures of central tendency",
               subtopic="mean and range",
               blocks=[para("Eight daily maximum temperatures (°C) are: 29, 31, 28, 33, 30, 31, 27, 31. Find the "
                            "mean and range.")],
               opts=["Mean 30 °C, range 6 °C", "Mean 31 °C, range 6 °C", "Mean 30 °C, range 2 °C",
                     "Mean 30.5 °C, range 5 °C"], ans="A",
               expl=r"Mean = $\frac{29+31+28+33+30+31+27+31}{8} = \frac{240}{8} = 30\ °\mathrm{C}$. "
                    r"Range = $33 - 27 = 6\ °\mathrm{C}$."))

    Q.append(q(4, sec="A", crit="A", marks=1, lvl="basic", topic="Grouped data",
               subtopic="class width and midpoint",
               blocks=[para("Wooden rod lengths, measured to the nearest centimetre, are grouped into 20–29 cm, "
                            "30–39 cm, 40–49 cm. What are the class width and midpoint of 30–39 cm?")],
               opts=["Width 9 cm, mid 34.5 cm", "Width 10 cm, mid 35 cm", "Width 10 cm, mid 34.5 cm",
                     "Width 9 cm, mid 35 cm"], ans="C",
               expl="Measured to the nearest cm, the class 30–39 has real limits 29.5 and 39.5, so the width is "
                    "10 cm and the midpoint is 34.5 cm."))

    Q.append(q(5, sec="A", crit="C", marks=1, lvl="basic", topic="Statistical graphs",
               subtopic="histogram vs bar graph",
               blocks=[para("Which visual feature confirms this graph of travel times is a histogram rather than "
                            "a bar graph?"),
                       _q5_histogram()],
               opts=["Four bars shown", "Adjacent bars on continuous axis", "Falling heights", "Zero baseline"],
               ans="B",
               expl="In a histogram the bars touch because the horizontal axis is a continuous scale; a bar "
                    "graph has separated bars for distinct categories. Four bars, falling heights and a zero "
                    "baseline can all occur in a bar graph too."))

    Q.append(q(6, sec="A", crit="A", marks=1, lvl="basic", topic="Grouped data",
               subtopic="modal and median classes",
               blocks=[para("Fifty ping times $p$ (ms): $0 \\le p < 20$ $(f = 9)$, $20 \\le p < 40$ $(f = 19)$, "
                            "$40 \\le p < 60$ $(f = 14)$, $60 \\le p < 80$ $(f = 8)$. State the modal & median "
                            "classes.")],
               opts=[r"Both $20 \le p < 40$", r"Modal 20–40; med $40 \le p < 60$",
                     r"Both $40 \le p < 60$", r"Modal $0 \le p < 20$; med $20 \le p < 40$"], ans="A",
               expl="The modal class has the highest frequency, 19: $20 \\le p < 40$. With 50 values the median "
                    "lies between the 25th and 26th values; cumulative frequencies are 9 then 28, so both fall "
                    "in $20 \\le p < 40$."))

    Q.append(q(7, sec="A", crit="C", marks=1, lvl="basic", topic="Box-and-whisker diagrams",
               subtopic="reading quartiles",
               blocks=[para("In the box-and-whisker diagram below, what percentage of data values lie between "
                            "25 and 75?"),
                       _q7_box()],
               opts=["25 %", "50 %", "75 %", "65 %"], ans="C",
               expl="25 is $Q_1$ and 75 is the maximum. A quarter of the data lies below $Q_1$, so the "
                    "proportion from $Q_1$ up to the maximum is $100\\ \\% - 25\\ \\% = 75\\ \\%$."))

    Q.append(q(8, sec="A", crit="D", marks=1, lvl="basic", topic="Effect of outliers",
               subtopic="outlier effect on mean and median",
               blocks=[para("Six sales bonuses (in 1000 FCFA) are 4, 5, 5, 6, 6, 7. When a seventh bonus of 37 is "
                            "included, what happens?")],
               opts=["Mean 5.5 → 10; med 5.5 → 6", "Mean stays 5.5; med → 10", "Both rise to 10",
                     "Mean → 10; range stays 3"], ans="A",
               expl=r"Six values: mean = $\frac{33}{6} = 5.5$, median = $\frac{5+6}{2} = 5.5$. With 37 added the "
                    r"mean is $\frac{70}{7} = 10$ and the median becomes the 4th value, 6. The outlier drags the "
                    r"mean but barely moves the median."))

    Q.append(q(9, sec="A", crit="A", marks=1, lvl="basic", topic="Standard deviation",
               subtopic="population standard deviation",
               blocks=[para("A population of $N = 5$ values $\\{4, 6, 8, 10, 12\\}$ has mean $\\mu = 8$. What is "
                            "its population standard deviation $\\sigma$?")],
               opts=["8", r"$\sqrt{10}$", r"$2\sqrt{2}$", "4"], ans="C",
               expl=r"$\sigma^2 = \frac{16 + 4 + 0 + 4 + 16}{5} = \frac{40}{5} = 8$, so "
                    r"$\sigma = \sqrt{8} = 2\sqrt{2}$."))

    # ── TRUE OR FALSE · Q10–14 ───────────────────────────────────────────────
    Q.append(q(10, sec="A", crit="A", marks=1, lvl="basic", topic="Grouped data",
               subtopic="modal class of grouped data", qtype="true_false",
               blocks=[para("From a grouped continuous table alone, the modal class is exact but the exact "
                            "single mode is unknown.")], ans="T",
               expl="True: grouping keeps only class frequencies, so the modal class is known but the "
                    "individual mode is not recoverable."))

    Q.append(q(11, sec="A", crit="C", marks=1, lvl="basic", topic="Stem-and-leaf diagrams",
               subtopic="the key", qtype="true_false",
               blocks=[para("A stem-and-leaf diagram needs no key because stems always represent tens and leaves "
                            "represent units.")], ans="F",
               expl="False: stems and leaves can represent any place value (for example 2 | 5 could mean 2.5 or "
                    "250), so a key is always required."))

    Q.append(q(12, sec="A", crit="B", marks=1, lvl="basic", topic="Standard deviation",
               subtopic="zero dispersion", qtype="true_false",
               blocks=[para("If every item in a population of 15 observations equals 9, then $\\mu = 9$ and "
                            "$\\sigma = 0$.")], ans="T",
               expl="True: every deviation from the mean is zero, so the variance and standard deviation are "
                    "both 0."))

    Q.append(q(13, sec="A", crit="A", marks=1, lvl="basic", topic="Cumulative frequency",
               subtopic="shape of a cumulative frequency curve", qtype="true_false",
               blocks=[para("A cumulative frequency curve slopes downward whenever a class has fewer items than "
                            "the class before it.")], ans="F",
               expl="False: cumulative frequency never decreases. A smaller class frequency only makes the "
                    "curve rise more shallowly; it still rises."))

    Q.append(q(14, sec="A", crit="A", marks=1, lvl="basic", topic="Grouped data",
               subtopic="class width and midpoint of a continuous interval", qtype="true_false",
               blocks=[para("For continuous interval $20 \\le x < 35$, the class width is 15 and the midpoint is "
                            "27.5.")], ans="T",
               expl=r"True: width $= 35 - 20 = 15$ and midpoint $= \frac{20 + 35}{2} = 27.5$."))

    # ── MATCHING · Q15–18 ────────────────────────────────────────────────────
    for n, (stem, answer, reason) in enumerate([
        ("Chart with separated bars best suited for unordered qualitative categories", "Q",
         "A bar graph has separated bars and suits unordered qualitative categories."),
        ("Formula using class midpoints $x$ and frequencies $f$ to estimate the mean", "R",
         r"$\frac{\Sigma fx}{\Sigma f}$ is the estimated mean from a grouped table."),
        ("Dispersion measure of the middle 50 % of data that resists extreme outliers", "P",
         r"The interquartile range $Q_3 - Q_1$ covers the middle 50 % and ignores extreme values."),
        ("Diagram constructed directly from the five-number summary", "S",
         "A box-and-whisker diagram is drawn from the minimum, $Q_1$, median, $Q_3$ and maximum."),
    ], start=15):
        Q.append(q(n, sec="A", crit=("C" if n in (15, 18) else "A"), marks=1, lvl="basic",
                   topic="Statistical vocabulary", subtopic="matching a definition to its term",
                   blocks=[para(stem), _BANK_ROW],
                   opts=list(_BANK_OPTS), labels=["P", "Q", "R", "S", "T", "U"], ans=answer,
                   expl=reason))

    # ── LEVEL 2 · SHORT RESPONSE · Q19–20 ────────────────────────────────────
    Q.append(q(19, sec="A", crit="D", marks=1, lvl="intermediate", topic="Estimated mean",
               subtopic="estimated mean from a grouped table", qtype="numeric",
               numeric=194, tol=0,
               blocks=[para("Masses of 25 avocados: $150 \\le m < 190$ g $(f = 10)$ and $190 \\le m < 230$ g "
                            "$(f = 15)$. Calculate the estimated mean mass.")],
               expl=r"Midpoints are 170 g and 210 g, so the estimated mean is "
                    r"$\frac{10 \times 170 + 15 \times 210}{25} = \frac{4\,850}{25} = 194$ g."))

    Q.append(q(20, sec="A", crit="D", marks=1, lvl="intermediate", topic="Mean",
               subtopic="finding one value from a mean", qtype="numeric",
               numeric=17, tol=0,
               blocks=[para("Five parcels have mean mass 14.2 kg. After one parcel is delivered, the remaining "
                            "four have mean 13.5 kg. Find the delivered parcel's mass.")],
               expl=r"Total of 5 parcels $= 5 \times 14.2 = 71$ kg; total of 4 parcels $= 4 \times 13.5 = 54$ kg. "
                    r"The delivered parcel weighs $71 - 54 = 17$ kg."))

    # ── LEVEL 3 · CHALLENGE · Q21–25 · 2 marks each ──────────────────────────
    Q.append(q(21, sec="A", crit="D", marks=2, lvl="challenge", topic="Cumulative frequency",
               subtopic="reading a cumulative frequency curve",
               blocks=[para("Marks (out of 80) of 100 students are shown. Marks above 60 earn Distinction. Find "
                            "Distinction count and $Q_1$."),
                       _q21_ogive()],
               opts=[r"$80$; $Q_1 = 30$", r"$20$; $Q_1 = 30$", r"$20$; $Q_1 = 25$", r"$80$; $Q_1 = 25$"], ans="B",
               expl="The curve reaches cumulative frequency 80 at a mark of 60, so 100 − 80 = 20 students score "
                    "above 60. $Q_1$ is at cumulative frequency 25, which the curve reaches at a mark of 30."))

    Q.append(q(22, sec="A", crit="D", marks=2, lvl="challenge", topic="Histograms",
               subtopic="frequency density with unequal class widths",
               blocks=[para("The unequal-width histogram shows trunk diameters $d$ (cm). How many trees have "
                            "$10 \\le d < 50$ cm?"),
                       _q22_histogram()],
               opts=["3.2", "44", "56", "68"], ans="C",
               expl="Frequency = frequency density × class width. The classes are $0 \\le d < 10$ "
                    "($1.2 \\times 10 = 12$), $10 \\le d < 25$ ($2.4 \\times 15 = 36$) and $25 \\le d < 50$ "
                    "($0.8 \\times 25 = 20$). Trees with $10 \\le d < 50$: $36 + 20 = 56$. (68 is the total of "
                    "all three classes.)"))

    Q.append(q(23, sec="A", crit="B", marks=2, lvl="challenge", topic="Estimated mean",
               subtopic="finding a missing frequency from the estimated mean",
               blocks=[para("Classes $0 \\le x < 10$ $(f = 4)$, $10 \\le x < 20$ $(f = m)$ and $20 \\le x < 30$ "
                            "$(f = 6)$ give an estimated mean of 16. Find $m$.")],
               opts=["5", "8", "10", "15"], ans="C",
               expl=r"$\frac{4 \times 5 + 15m + 6 \times 25}{m + 10} = 16 \Rightarrow 170 + 15m = 160 + 16m "
                    r"\Rightarrow m = 10$. Check: $\frac{20 + 150 + 150}{20} = 16$."))

    Q.append(q(24, sec="A", crit="D", marks=2, lvl="challenge", topic="Box-and-whisker diagrams",
               subtopic="outlier fences",
               blocks=[para("Driver reaction times (ms) have Min = 155, $Q_1 = 210$, Med = 235, $Q_3 = 250$, "
                            "Max = 305. Using fences $Q_1 - 1.5 \\times IQR$ and $Q_3 + 1.5 \\times IQR$, which "
                            "is true?")],
               opts=["150 & 310; no outliers", "170 & 290; two outliers", "150 & 310; two outliers",
                     "190 & 270; high outlier"], ans="A",
               expl=r"$IQR = 250 - 210 = 40$, so $1.5 \times IQR = 60$ and the fences are $210 - 60 = 150$ and "
                    r"$250 + 60 = 310$. The minimum 155 and maximum 305 both lie inside the fences, so there "
                    r"are no outliers."))

    Q.append(q(25, sec="A", crit="B", marks=2, lvl="challenge", topic="Linear coding",
               subtopic="effect of a linear transform on mean and standard deviation",
               blocks=[para("A population of 18 masses has $\\mu = 48$ g and $\\sigma = 6$ g. Each mass $x$ is "
                            r"transformed via $y = \frac{1}{3}x + 8$. Find $\mu_y$ and $\sigma_y$.")],
               opts=["16 g; 2 g", "24 g; 10 g", "24 g; 2 g", "24 g; 6 g"], ans="C",
               expl=r"Under $y = ax + b$, $\mu_y = a\mu + b = \frac{1}{3}(48) + 8 = 24$ g and "
                    r"$\sigma_y = |a|\sigma = \frac{1}{3}(6) = 2$ g. Adding 8 shifts the mean but does not "
                    r"change the spread."))

    # ── PART B · TASK 1 · CRITERION A ────────────────────────────────────────
    Q.append(q(26, sec="B", crit="A", marks=3, lvl="basic", topic="Data classification",
               subtopic="choosing a suitable chart", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Classify each variable and name a suitable chart for (b) and (c).",
               blocks=[para("Data classification & graph selection [3 marks] Classify each variable as "
                            "qualitative, quantitative discrete, or quantitative continuous, and name a suitable "
                            "chart (bar graph or histogram) for (b) and (c):"),
                       para("(a) Blood group (A, B, AB, O) of hospital blood donors. [1]"),
                       para("(b) Number of solar panels installed per school roof in a district. [1]"),
                       para("(c) Exact mass (in grams) of 120 laboratory soil samples. [1]")],
               parts=[("(a)", 1, "Blood group"), ("(b)", 1, "Solar panels"),
                      ("(c)", 1, "Soil-sample mass")]))

    Q.append(q(27, sec="B", crit="A", marks=3, lvl="basic", topic="Measures of central tendency",
               subtopic="mode, median, range and mean", qtype="open_ended",
               tools=["rich_text", "math", "table", "statistics"],
               guidance="Show your ordering and every calculation.",
               blocks=[para("Central tendency & dispersion [3 marks] Student absences recorded per day over 11 "
                            "school days: 3, 1, 4, 0, 2, 1, 5, 1, 3, 2, 0."),
                       para("(a) Find the mode, median, and range of daily absences. [2]"),
                       para("(b) Calculate the exact mean number of absences per day. [1]")],
               parts=[("(a)", 2, "Mode, median, range"), ("(b)", 1, "Exact mean")]))

    Q.append(q(28, sec="B", crit="A", marks=4, lvl="intermediate", topic="Grouped data",
               subtopic="discrete limits and estimated mean", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table", "statistics"],
               guidance="State class boundaries, then use exact mid-interval values for the mean.",
               blocks=[para("Grouped discrete-limit distribution [4 marks] Lengths (to the nearest mm) of 40 "
                            "beetle specimens:"),
                       data_table(["Length (mm)", "10–14", "15–19", "20–24", "25–29", "30–34"],
                                  [["Freq. (f)", "5", "13", "12", "7", "3"]]),
                       para("(a) State the lower & upper class boundaries of 20–24, the modal class, and the "
                            "class containing the median. [2]"),
                       para("(b) Using exact mid-interval values, calculate an estimate of the mean length. [2]")],
               parts=[("(a)", 2, "Boundaries, modal and median class"), ("(b)", 2, "Estimated mean")]))

    Q.append(q(29, sec="B", crit="A", marks=4, lvl="intermediate", topic="Standard deviation",
               subtopic="population standard deviation in surd form", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Show the mean, each squared deviation, and the surd before the decimal value.",
               blocks=[para("Population standard deviation [4 marks] A lab balance calibrates a complete "
                            "population of $N = 5$ masses (g): 16, 19, 20, 22, 23."),
                       para("(a) Calculate the population mean $\\mu$ and each squared deviation $(x - \\mu)^2$. "
                            "[2]"),
                       para("(b) Find the population standard deviation $\\sigma$ in exact surd form and to "
                            "2 d.p. [2]")],
               parts=[("(a)", 2, "Mean and squared deviations"), ("(b)", 2, "Exact surd and 2 d.p.")]))

    Q.append(q(30, sec="B", crit="A", marks=4, lvl="intermediate", topic="Cumulative frequency",
               subtopic="quartiles and counts from an ogive", qtype="open_ended",
               tools=["rich_text", "math", "graph", "table"],
               guidance="Read the quartiles from the curve and show how you count the qualifying journeys.",
               blocks=[para("Cumulative frequency curve [4 marks] The ogive shows journey times (min) of 80 "
                            "commuters."),
                       _q30_ogive(),
                       para("(a) Estimate $Q_2$, $Q_1$, $Q_3$ and the IQR. [2]"),
                       para("(b) Journeys over 50 min qualify for flexi-hours. Estimate how many qualify and "
                            "their %. [2]")],
               parts=[("(a)", 2, "Quartiles and IQR"), ("(b)", 2, "Count and percentage")]))

    Q.append(q(31, sec="B", crit="A", marks=4, lvl="challenge", topic="Histograms",
               subtopic="frequency density and derived bar heights", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table", "graph"],
               guidance="Tabulate width and frequency density, then scale the bar heights and estimate the "
                        "required count.",
               blocks=[para("Unequal widths & frequency density [4 marks] Airline baggage masses $m$ (kg) for 72 "
                            "bags:"),
                       data_table(["Mass m (kg)", r"$0 \le m < 8$", r"$8 \le m < 16$", r"$16 \le m < 28$",
                                   r"$28 \le m < 44$"],
                                  [["Freq. (f)", "12", "28", "24", "8"]]),
                       para("(a) Calculate the class width and frequency density for all four classes. [2]"),
                       para("(b) On a histogram, the bar for $0 \\le m < 8$ has height 3.0 cm. Find the other "
                            "three bar heights (cm) and estimate how many bags satisfy $12 \\le m < 22$ kg. [2]")],
               parts=[("(a)", 2, "Width and frequency density"), ("(b)", 2, "Bar heights and count")]))

    # ── PART B · TASK 2 · CRITERION B ────────────────────────────────────────
    Q.append(q(32, sec="B", crit="B", marks=4, lvl="challenge", topic="Investigating patterns",
               subtopic="invariance under a low outlier", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Give both sets of statistics, then justify the invariance algebraically.",
               blocks=[para("Low-outlier invariance pattern [4 marks] Six quiz scores (out of 50) are 34, 36, 38, "
                            "40, 42, 44. A seventh student scores $y$ $(0 \\le y \\le 34)$."),
                       para("(a) Find the 6-student mean, median & IQR; then recalculate all three for 7 students "
                            "when $y = 11$. [2]"),
                       para("(b) Express the 7-student mean in terms of $y$, and explain why the 7-student median "
                            "and upper quartile remain constant for every $y$ in $0 \\le y \\le 34$. [2]")],
               parts=[("(a)", 2, "Statistics with and without y"), ("(b)", 2, "Explanation of invariance")],
               expl="Six scores: mean 39, median 39, $Q_1 = 36$, $Q_3 = 42$, IQR 6. With $y = 11$: mean "
                    "$\\frac{245}{7} = 35$, median 38, $Q_1 = 34$, $Q_3 = 42$, IQR 8. For any $y \\le 34$ the "
                    "ordered list starts $y, 34, 36$, so the 4th value (median) stays 38 and the upper half "
                    "is still 40, 42, 44, so $Q_3$ stays 42; the lower quartile, and therefore the IQR, "
                    "does change."))

    Q.append(q(33, sec="B", crit="B", marks=4, lvl="challenge", topic="Investigating patterns",
               subtopic="standard deviation of evenly spaced populations", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Give each standard deviation in the form k√2, then prove the general result.",
               blocks=[para("Evenly spaced populations [4 marks] Consider populations of size $N = 5$ with step "
                            "$d > 0$: $A_1 = \\{8, 9, 10, 11, 12\\}$ $(d = 1)$, $A_2 = \\{6, 8, 10, 12, 14\\}$ "
                            "$(d = 2)$ and $A_3 = \\{4, 7, 10, 13, 16\\}$ $(d = 3)$."),
                       para("(a) Verify $\\mu = 10$ for each set and find $\\sigma_1$, $\\sigma_2$, $\\sigma_3$ in "
                            "exact surd form $k\\sqrt{2}$. [2]"),
                       para("(b) Prove from the population formula that $\\{c - 2d,\\ c - d,\\ c,\\ c + d,\\ "
                            "c + 2d\\}$ has $\\sigma = d\\sqrt{2}$, and state $d$ when $\\sigma = 6\\sqrt{2}$. "
                            "[2]")],
               parts=[("(a)", 2, "Three standard deviations"), ("(b)", 2, "General proof")]))

    Q.append(q(34, sec="B", crit="B", marks=4, lvl="challenge", topic="Investigating patterns",
               subtopic="error of the midpoint estimate", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Show the shared grouped table, then explain the two errors with the raw values.",
               blocks=[para("Within-class clustering & estimated mean [4 marks] Two batches of 10 parcels (kg) "
                            "are grouped into $0 \\le m < 10$ and $10 \\le m < 20$:"),
                       para("Batch P: 1, 2, 2, 3, 4, 6, 11, 12, 14, 15 (exact mean 7.0)  |  Batch Q: 2, 3, 5, 5, "
                            "7, 8, 12, 14, 16, 18 (exact mean 9.0)."),
                       para("(a) Show both batches share the same grouped table and calculate their shared "
                            "estimated mean. [2]"),
                       para("(b) Explain mathematically why the midpoint estimate has zero error for Q yet "
                            "overestimates P by +2.0. [2]")],
               parts=[("(a)", 2, "Shared table and estimate"), ("(b)", 2, "Explanation of the error")]))

    Q.append(q(35, sec="B", crit="B", marks=3, lvl="challenge", topic="Investigating patterns",
               subtopic="transforming the upper tail", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="State the new five-number summary, name the skew, then generalise the ratio.",
               blocks=[para("Upper-tail stretching & quartiles [3 marks] Symmetric set D (80 items) has "
                            "Min = 20, $Q_1 = 35$, $Q_2 = 50$, $Q_3 = 65$, Max = 80. Values above 50 map to "
                            "$x' = 50 + 2(x - 50)$ (values $\\le 50$ unchanged) to form $D'$."),
                       para("(a) State the five-number summary and IQR of $D'$, and identify its skewness. [2]"),
                       para("(b) Generalise the ratio $(Q_3' - Q_2') / (Q_2' - Q_1')$ if factor 2 is replaced by "
                            "$k > 1$. [1]")],
               parts=[("(a)", 2, "Five-number summary, IQR and skew"), ("(b)", 1, "Generalised ratio")]))

    # ── PART B · TASK 3 · CRITERION C ────────────────────────────────────────
    Q.append(q(36, sec="B", crit="C", marks=4, lvl="intermediate", topic="Communicating data",
               subtopic="back-to-back stem-and-leaf diagram", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Use stems 2 to 6 with a dual key, ordered leaves, then compare in context.",
               blocks=[para("Back-to-back stem-and-leaf diagram [4 marks] Typing speeds (wpm) of 10 students:"),
                       para("Term Start: 28, 34, 25, 41, 32, 29, 36, 34, 43, 30  |  Term End: 42, 51, 39, 46, 54, "
                            "45, 48, 61, 45, 53."),
                       para("(a) Construct an ordered back-to-back stem-and-leaf diagram (stems 2 to 6) with a "
                            "dual key. [3]"),
                       para("(b) Compare the two distributions in context using their medians and ranges. [1]")],
               parts=[("(a)", 3, "Diagram with dual key"), ("(b)", 1, "Comparison in context")]))

    Q.append(q(37, sec="B", crit="C", marks=3, lvl="intermediate", topic="Communicating data",
               subtopic="constructing a continuous grouped table", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Tabulate midpoints and frequencies, then explain the role of ≤ and <.",
               blocks=[para("Constructing a continuous grouped table [3 marks] Masses $m$ (g) of 20 tomatoes:"),
                       para("82.4, 96.1, 104.5, 91.0, 112.8, 88.3, 100.0, 95.6, 118.2, 85.0, 107.4, 93.2, 110.0, "
                            "89.7, 102.3, 98.5, 115.6, 90.0, 106.1, 94.8."),
                       para("(a) Tabulate into $80 \\le m < 90$, $90 \\le m < 100$, $100 \\le m < 110$, "
                            "$110 \\le m < 120$ with midpoints & frequencies. [2]"),
                       para("(b) State which classes contain 90.0 g and 110.0 g and explain why $\\le$ and $<$ "
                            "prevent double-counting. [1]")],
               parts=[("(a)", 2, "Grouped table"), ("(b)", 1, "Boundary convention")]))

    Q.append(q(38, sec="B", crit="C", marks=4, lvl="intermediate", topic="Communicating data",
               subtopic="critiquing and constructing a histogram", qtype="open_ended",
               tools=["rich_text", "math", "graph", "table"],
               guidance="Name two distinct errors in formal vocabulary, then draw the corrected chart in your "
                        "script with a labelled frequency-density axis.",
               blocks=[para("Critiquing & constructing a histogram [4 marks] Amina plots continuous commute "
                            "distances $0 \\le d < 5$ $(f = 8)$, $5 \\le d < 10$ $(f = 12)$, $10 \\le d < 25$ "
                            "$(f = 15)$ as shown."),
                       _q38_chart(),
                       para("(a) Explain two statistical/graphical errors in Amina's chart. [2]"),
                       para("(b) Draw a labelled frequency-density histogram in your script. [2]")],
               parts=[("(a)", 2, "Two errors"), ("(b)", 2, "Corrected histogram")]))

    Q.append(q(39, sec="B", crit="C", marks=4, lvl="intermediate", topic="Communicating data",
               subtopic="comparing box-and-whisker diagrams", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Give the five-number summary of North and both IQRs, then two evidenced comparisons.",
               blocks=[para("Comparing box-and-whisker diagrams [4 marks] Customer wait times (min) at Branch "
                            "North (40) and Branch South (40) are shown."),
                       _q39_boxes(),
                       para("(a) State the five-number summary of North and calculate the IQR of both branches. "
                            "[2]"),
                       para("(b) Write two contextual comparisons (average & service consistency) with evidence. "
                            "[2]")],
               parts=[("(a)", 2, "Five-number summary and IQRs"), ("(b)", 2, "Two comparisons")]))

    Q.append(q(40, sec="B", crit="C", marks=3, lvl="intermediate", topic="Communicating data",
               subtopic="definitions and units", qtype="open_ended",
               tools=["rich_text", "math"],
               guidance="Write in sentences, and state the units of both σ² and σ.",
               blocks=[para("Communicating statistical definitions [3 marks]"),
                       para("(a) Explain why $\\Sigma fx / \\Sigma f$ is exact for ungrouped discrete values "
                            "$(x = 0, 1, 2, 3)$ yet only an estimate for grouped intervals. [1]"),
                       para("(b) Write formulas for population variance $\\sigma^2$ and population SD $\\sigma$, "
                            "stating the units of each when $x$ is in cm. [2]")],
               parts=[("(a)", 1, "Exact vs estimated mean"), ("(b)", 2, "Formulas and units")]))

    # ── PART B · TASK 4 · CRITERION D ────────────────────────────────────────
    Q.append(q(41, sec="B", crit="D", marks=3, lvl="intermediate", topic="Applying mathematics",
               subtopic="grouped data in a sustainability context", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Estimate the mean, then check the cap and give the theoretical minimum from the table.",
               blocks=[para("Borehole extraction audit [3 marks] Daily volume $V$ (m³) pumped across 30 days in "
                            "Parakou:"),
                       data_table([r"Volume $V$ (m³)", r"$10 \le V < 14$", r"$14 \le V < 18$",
                                   r"$18 \le V < 22$", r"$22 \le V < 26$"],
                                  [["Days (f)", "6", "12", "9", "3"]]),
                       para("(a) Calculate the estimated mean daily volume pumped. [2]"),
                       para("(b) Sustainability rules cap 30-day extraction at 500 m³. Check whether estimated "
                            "total exceeds 500 m³, and find the theoretical minimum 30-day volume from the "
                            "table. [1]")],
               parts=[("(a)", 2, "Estimated mean"), ("(b)", 1, "Cap check and minimum")]))

    Q.append(q(42, sec="B", crit="D", marks=3, lvl="intermediate", topic="Applying mathematics",
               subtopic="population statistics against a standard", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Calculate μ and σ to 2 d.p., then justify the pass/fail decision against both rules.",
               blocks=[para("Cement-bag pallet compliance [3 marks] An entire pallet population of $N = 8$ bags "
                            "has masses:"),
                       data_table(["Mass x (kg)", "48", "49", "50", "51", "52"],
                                  [["Bags (f)", "1", "2", "2", "2", "1"]]),
                       para("(a) Calculate the population mean $\\mu$ and population standard deviation "
                            "$\\sigma$ (to 2 d.p.). [2]"),
                       para("(b) Dispatch standards require $49.5 \\le \\mu \\le 50.5$ kg and $\\sigma \\le 1.30$ "
                            "kg. Justify whether the pallet passes. [1]")],
               parts=[("(a)", 2, "Mean and standard deviation"), ("(b)", 1, "Compliance decision")]))

    Q.append(q(43, sec="B", crit="D", marks=3, lvl="intermediate", topic="Applying mathematics",
               subtopic="cumulative frequency for a cut-off", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="State the quartiles from the cumulative table, then find the top 10 % cut-off and the "
                        "required count.",
               blocks=[para("Scholarship exam cut-off [3 marks] Cumulative frequencies for 120 entrance "
                            "candidates' scores $s$:"),
                       data_table(["$s \\le$", "30", "40", "50", "60", "70", "80", "90"],
                                  [["Cum. freq.", "0", "15", "30", "60", "90", "108", "120"]]),
                       para("(a) State $Q_1$, $Q_2$, $Q_3$ and calculate the IQR of scores. [2]"),
                       para("(b) The top 10 % win scholarships. Find the minimum qualifying score and how many "
                            "scored $70 < s \\le 80$. [1]")],
               parts=[("(a)", 2, "Quartiles and IQR"), ("(b)", 1, "Cut-off and count")]))

    Q.append(q(44, sec="B", crit="D", marks=3, lvl="intermediate", topic="Applying mathematics",
               subtopic="outlier effect on an average", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Calculate both averages for both sets, then advise with reasons for each audience.",
               blocks=[para("Apartment rents & luxury outlier [3 marks] Seven monthly rents (in 1000 FCFA) on a "
                            "Cotonou street are: 85, 90, 92, 98, 100, 105, 270 (270 is a penthouse)."),
                       para("(a) Calculate the mean and median for all 7 units, and again for the 6 standard "
                            "flats. [2]"),
                       para("(b) Advise tenants which average best reflects typical rent and why a tax office "
                            "still requires all 7 values. [1]")],
               parts=[("(a)", 2, "Means and medians"), ("(b)", 1, "Advice with reasons")]))

    Q.append(q(45, sec="B", crit="D", marks=3, lvl="intermediate", topic="Applying mathematics",
               subtopic="choosing between two data sets", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Compare centre and spread with figures, then recommend with a statistical reason tied "
                        "to the 13.0 h requirement.",
               blocks=[para("Clinic solar-lantern selection [3 marks] Two lantern battery brands tested across 20 "
                            "units each (run-time in hours):"),
                       para("Solis: $\\mu = 14.2$, Med = 14.3, IQR = 0.8, $\\sigma = 0.50$  |  VoltX: "
                            "$\\mu = 15.0$, Med = 14.9, IQR = 2.6, $\\sigma = 1.65$."),
                       para("(a) Compare average run-time and consistency using both central and dispersion "
                            "measures. [2]"),
                       para("(b) Recommend one brand for a maternity ward requiring at least 13.0 h nightly, "
                            "justifying statistically. [1]")],
               parts=[("(a)", 2, "Comparison"), ("(b)", 1, "Recommendation")]))

    return Q
