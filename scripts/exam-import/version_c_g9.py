"""Grade 9 (MYP 4) Mathematics — Version C: Statistics & Data Analysis."""
from __future__ import annotations

from version_c_common import (
    assess_question,
    bar_figure,
    box_figure,
    choice_question,
    cumulative_figure,
    doc_of,
    graph_points,
    grouped_histogram,
    letter_question,
    numbered_table,
    para,
    part,
    starter_axes,
    structured,
    table_block,
    true_false_question,
    heading,
)

SOURCE = "myp4-grade9-statistics-version-c-2025-26"
TITLE = "MYP 4 (Grade 9) Mathematics — End of Third Trimester Summative Assessment (Version C)"
DESCRIPTION = (
    "End of Third Trimester Summative Assessment 2025/2026, Version C. Unit: Statistics & Data Analysis — "
    "measures, displays and variation. 34 questions (Part A Q1–30, 60 marks; Part B Q1–4, 40 marks), "
    "100 marks. Criteria: A 22+10, B 10+10, C 14+10, D 14+10."
)
INSTRUCTIONS = (
    "Answer all 34 questions. Part A (Q1–30, 60 marks): answer directly in the spaces and boxes provided — "
    "circle A, B, C or D, circle T or F, write one letter P–T for each matching item, or type the value in "
    "each box. Part B (Q1–4, 40 marks): complete all four synthesis tasks, showing full statistical working, "
    "tables, formulae and labelled diagrams. A scientific calculator is permitted. Give non-exact numerical "
    "answers correct to 2 decimal places unless stated otherwise. Population variance is the average of the "
    "squared deviations from the mean μ; population standard deviation σ = √(variance)."
)
SECTIONS = [
    {
        "id": "A",
        "title": "Part A — Short-response questions (Q1–Q30)",
        "questions": 30,
        "marks": 60,
        "instructions": (
            "30 questions · 60 marks · recommended 55 min. Q1–9 multiple choice; Q10–14 true/false; "
            "Q15–18 matching; Q19–30 short calculations and tables."
        ),
    },
    {
        "id": "B",
        "title": "Part B — Extended synthesis tasks (Q1–Q4)",
        "questions": 4,
        "marks": 40,
        "instructions": (
            "4 tasks · 40 marks · recommended 65 min. One task per MYP criterion A, B, C, D (10 marks each). "
            "Show complete tables, formulae, labelled statistical diagrams and contextual conclusions."
        ),
    },
]
CRITERION_TOTALS = {"A": 32, "B": 20, "C": 24, "D": 24}

STEM_LEAF_KEY = "2 | 4 = 24"
STEM_ROWS = [
    {"stem": "1", "leaves": ["5", "8", "8"]},
    {"stem": "2", "leaves": ["1", "4", "6", "9"]},
    {"stem": "3", "leaves": ["0", "2", "5", "8"]},
]
MATCH_OPTIONS = (
    "P: $Q_3-Q_1$  |  Q: $\\dfrac{\\text{Frequency}}{\\text{Class width}}$  |  "
    "R: Population variance $\\sigma^2$  |  S: Cumulative frequency curve (ogive)  |  "
    "T: Stem-and-leaf diagram"
)


def matching_prompt(description: str):
    return doc_of(para(MATCH_OPTIONS), para(description))


def build():
    qs = []

    # ── Part A · multiple choice ───────────────────────────────────────────
    qs.append(choice_question(
        1, sec="A", crit="A", marks=1, lvl="basic", topic="Types of data",
        subtopic="quantitative continuous data",
        blocks=["Which variable measured at a health clinic is **quantitative continuous**?",
                "A. Blood group (A, B, AB, O)\nB. Number of siblings\nC. Body mass (in kg)\nD. Clinic ward code"],
        options=["Blood group (A, B, AB, O)", "Number of siblings", "Body mass (in kg)", "Clinic ward code"],
        answer="C",
        explanation=(
            "Body mass is measured on a continuous numerical scale, so it is quantitative continuous. "
            "Blood group and ward code are qualitative; number of siblings is quantitative discrete. "
            "Note: the printed key grid on the marking scheme appears misaligned for this row; A is blood "
            "group, so C is the only mathematically valid answer. The discrepancy is recorded for the school."
        ),
    ))
    qs.append(choice_question(
        2, sec="A", crit="C", marks=1, lvl="basic", topic="Stem-and-leaf diagrams",
        subtopic="mode and median",
        blocks=["The stem-and-leaf plot records 11 quiz scores (key: 2 | 4 = 24):",
                {"type": "assessDiagramBlock", "attrs": {"spec": {
                    "kind": "stem_leaf", "title": "Quiz scores", "stemKey": STEM_LEAF_KEY,
                    "stemRows": STEM_ROWS, "version": 1,
                }}},
                "What are the **mode** and **median** of these scores?"],
        options=["Mode 18, Med 24", "Mode 18, Med 26", "Mode 26, Med 18", "Mode 8, Med 26"],
        answer="B",
        explanation=(
            "Ordered scores: 15, 18, 18, 21, 24, 26, 29, 30, 32, 35, 38. The mode is 18 (it occurs twice); "
            "the median is the 6th value, 26. The printed key grid lists C, but its own verification states "
            "mode 18 and 6th value 26, which is B; B is used and the grid error is flagged."
        ),
    ))
    qs.append(choice_question(
        3, sec="A", crit="A", marks=1, lvl="basic", topic="Measures of central tendency",
        subtopic="mean and range",
        blocks=["Daily rainfall (mm) over 7 days in Porto-Novo: 12, 18, 15, 22, 15, 10, 20. The **mean** and **range** are:"],
        options=["Mean 16 mm, Range 12 mm", "Mean 15 mm, Range 12 mm", "Mean 16 mm, Range 10 mm", "Mean 15.5 mm, Range 8 mm"],
        answer="A",
        explanation="Sum = 112, so mean = 112 ÷ 7 = 16 mm; range = 22 − 10 = 12 mm.",
    ))
    qs.append(choice_question(
        4, sec="A", crit="A", marks=1, lvl="basic", topic="Grouped data", subtopic="class width and midpoint",
        blocks=["Bolt lengths measured to the nearest millimetre are grouped in the class 50–59 mm. Its actual **class width** and **midpoint** are:"],
        options=["Width 9 mm, Mid 54.5 mm", "Width 10 mm, Mid 55 mm", "Width 10 mm, Mid 54.5 mm", "Width 9 mm, Mid 54 mm"],
        answer="C",
        explanation="Boundaries are 49.5–59.5 mm, so width = 10 mm and midpoint = (49.5 + 59.5)/2 = 54.5 mm. Option C. The printed key grid lists A, but its own verification gives width 10 and midpoint 54.5, which is C; the grid error is flagged.",
    ))
    qs.append(choice_question(
        5, sec="A", crit="C", marks=1, lvl="basic", topic="Histograms", subtopic="reading a histogram",
        blocks=["The histogram shows waiting times $t$ (min) of customers at a pharmacy (intervals $a \\le t < b$). "
                "**How many waited at least 10 minutes?**",
                grouped_histogram([(0, 5, 6), (5, 10, 14), (10, 15, 12), (15, 20, 8)],
                                  title="Waiting times at a pharmacy", x_label="Wait time t (min)")],
        options=["12", "14", "20", "34"],
        answer="C",
        explanation="The bars for 10–15 and 15–20 contain 12 + 8 = 20 customers.",
    ))
    qs.append(choice_question(
        6, sec="A", crit="A", marks=1, lvl="basic", topic="Grouped data", subtopic="modal and median class",
        blocks=["Heights $h$ (cm) of 40 seedlings: $0 \\le h < 10$ $(f=5)$, $10 \\le h < 20$ $(f=12)$, "
                "$20 \\le h < 30$ $(f=16)$, $30 \\le h < 40$ $(f=7)$. Which statement is true?"],
        options=["Modal 10–20; Med 20–30", "Both are 20 ≤ h < 30", "Modal 20–30; Med 10–20", "Both are 10 ≤ h < 20"],
        answer="B",
        explanation="The modal class is 20–30 (f = 16). The 20th and 21st values lie in cumulative frequency 17–33, so the median class is also 20–30. Option B. The printed key grid lists A, but the scheme's own verification places both in 20≤h<30; the grid error is flagged.",
    ))
    qs.append(choice_question(
        7, sec="A", crit="C", marks=1, lvl="basic", topic="Box-and-whisker plots", subtopic="IQR and percentage",
        blocks=["The box-and-whisker plot summarises battery lifetimes (hours):",
                box_figure((12, 24, 34, 50, 68), title="Battery lifetimes", x_label="Lifetime (hours)"),
                "What is the **IQR**, and what percentage of batteries lasted **less than 50 hours**?"],
        options=["IQR = 56, 75%", "IQR = 26, 75%", "IQR = 26, 50%", "IQR = 16, 75%"],
        answer="C",
        explanation="IQR = Q3 − Q1 = 50 − 24 = 26 hours. Q3 = 50 hours, so 75% of batteries lasted less than 50 hours.",
    ))
    qs.append(choice_question(
        8, sec="A", crit="D", marks=1, lvl="basic", topic="Effect of an outlier", subtopic="mean and median",
        blocks=["Five parcels weigh 3, 4, 4, 5, 6 kg. A sixth parcel of 26 kg is added. How do the **mean** and **median** change?"],
        options=["Mean 4.4→8; Med 4→4.5", "Mean 4.4→6; Med stays 4", "Mean stays 4.4; Med 4→8", "Both increase by 3.6 kg"],
        answer="A",
        explanation="Original mean = 22/5 = 4.4 kg, median = 4 kg. New mean = 48/6 = 8 kg (increase 3.6); new median = (4 + 5)/2 = 4.5 kg (increase 0.5). Option A. The printed key grid lists D, but D says both increased by 3.6, which is false for the median; A is the only correct statement. The grid error is flagged.",
    ))
    qs.append(choice_question(
        9, sec="A", crit="A", marks=1, lvl="basic", topic="Population standard deviation", subtopic="exact standard deviation",
        blocks=["The population $\\{3, 6, 9, 12, 15\\}$ has mean $\\mu = 9$. Its exact population standard deviation $\\sigma$ is:"],
        options=["18", "3", "$3\\sqrt{2}$", "$\\sqrt{15}$"],
        answer="C",
        explanation="Squared deviations: 36 + 9 + 0 + 9 + 36 = 90; variance = 90/5 = 18, so σ = √18 = 3√2. The printed option A reads 18, which is the variance, not the standard deviation; the correct value 3√2 is option C. The key is flagged.",
    ))

    # ── True / false ───────────────────────────────────────────────────────
    qs.append(true_false_question(10, crit="A", number=10,
        statement="For the continuous class $15 \\le x < 25$, the class width is 10 and the midpoint is 20.",
        answer="T", explanation="25 − 15 = 10 and (15 + 25)/2 = 20, so the statement is true."))
    qs.append(true_false_question(11, crit="C", number=11,
        statement="In an unequal-width histogram, vertical bar height represents frequency density so bar area is proportional to frequency.",
        answer="T", explanation="Height = frequency density = frequency ÷ class width, so area = height × width is proportional to frequency."))
    qs.append(true_false_question(12, crit="B", number=12,
        statement="Adding 5 marks to every score in a class increases both the mean $\\mu$ and standard deviation $\\sigma$ by 5.",
        answer="F", explanation="The mean increases by 5, but the deviations from the mean — and therefore σ — are unchanged."))
    qs.append(true_false_question(13, crit="A", number=13,
        statement="The interquartile range (IQR) is directly affected if the maximum value is replaced by an extreme outlier.",
        answer="F", explanation="The IQR depends only on Q1 and Q3, so changing the maximum does not change it."))
    qs.append(true_false_question(14, crit="C", number=14,
        statement="A bar graph with gaps between bars is suitable for qualitative or ungrouped discrete data.",
        answer="T", explanation="Gaps show that the categories or discrete values are separate; continuous grouped data uses a histogram with adjacent bars."))

    # ── Matching Q15–18 ────────────────────────────────────────────────────
    qs.append(letter_question(15, crit="C", topic="Statistical displays", subtopic="stem-and-leaf",
        blocks=[matching_prompt("**Q15.** Ordered display retaining every exact raw value:")],
        answer="T", explanation="A stem-and-leaf diagram keeps every raw value and displays them in order."))
    qs.append(letter_question(16, crit="A", topic="Histograms", subtopic="frequency density",
        blocks=[matching_prompt("**Q16.** Quantity plotted vertically on an unequal-width histogram:")],
        answer="Q", explanation="The vertical quantity is frequency density = frequency ÷ class width."))
    qs.append(letter_question(17, crit="C", topic="Cumulative frequency", subtopic="ogive",
        blocks=[matching_prompt("**Q17.** Smooth curve plotted at upper class boundaries to estimate quartiles:")],
        answer="S", explanation="That is the cumulative frequency curve, or ogive."))
    qs.append(letter_question(18, crit="A", topic="Variation", subtopic="population variance",
        blocks=[matching_prompt("**Q18.** Average of the squared deviations of all data values from $\\mu$:")],
        answer="R", explanation="The average of the squared deviations from μ is the population variance σ²."))

    # ── Short calculations Q19–30 ──────────────────────────────────────────
    qs.append(assess_question(
        19, sec="A", crit="D", marks=3, lvl="basic", topic="Mean", subtopic="missing value from a mean",
        blocks=["Six mangoes have a mean mass of 240 g. A seventh mango is added, raising the mean of all seven to 250 g. [3]",
                "**(a)** Total mass of the six  **(b)** Mass of the seventh mango"],
        explanation="(a) 6 × 240 = 1 440 g. (b) 7 × 250 = 1 750 g, so the seventh mango is 1 750 − 1 440 = 310 g.",
        marking_breakdown=[("(a)", 1, "total of six"), ("(b)", 2, "new total and seventh mass")],
        parts=[
            part("a", "(a)", "Total mass of the six mangoes", 1, answer=1440, unit="g"),
            part("b", "(b)", "Mass of the seventh mango", 2, answer=310, unit="g"),
        ],
    ))
    qs.append(assess_question(
        20, sec="A", crit="A", marks=4, lvl="basic", topic="Grouped data", subtopic="estimated mean",
        blocks=["Masses $m$ (g) of 20 tilapia fillets: 8 fillets in $120 \\le m < 160$ and 12 fillets in $160 \\le m < 200$. [4]",
                "**(a)** Midpoints of the two classes  **(b)** Estimated mean mass"],
        explanation="(a) (120 + 160)/2 = 140 g and (160 + 200)/2 = 180 g. (b) (8 × 140 + 12 × 180) ÷ 20 = 3 280 ÷ 20 = 164 g.",
        marking_breakdown=[("(a)", 2, "two midpoints"), ("(b)", 2, "weighted total and mean")],
        parts=[
            part("a1", "Midpoint 1", "Midpoint of $120 \\le m < 160$", 1, answer=140, unit="g"),
            part("a2", "Midpoint 2", "Midpoint of $160 \\le m < 200$", 1, answer=180, unit="g"),
            part("b1", "Weighted total", "Calculate $\\Sigma fm$", 1, answer=3280),
            part("b2", "Estimated mean", "Estimated mean mass", 1, answer=164, unit="g"),
        ],
    ))
    qs.append(assess_question(
        21, sec="A", crit="D", marks=3, lvl="intermediate", topic="Cumulative frequency", subtopic="quartiles from an ogive",
        blocks=["The ogive shows test scores (out of 80) of 120 students, passing through (40, 30), (50, 60) and (60, 90). "
                "Distinction requires **more than 60 marks**. [3]",
                graph_points([(0, 0), (40, 30), (50, 60), (60, 90), (80, 120)], connect=True,
                             title="Test scores of 120 students", x_label="Score (out of 80)",
                             y_label="Cumulative frequency", x_min=0, x_max=80, y_min=0, y_max=120),
                "**Median:**   **$Q_1$:**   **Distinction students:**"],
        explanation=("The median is at cumulative frequency 60, giving 50 marks; Q1 is at cumulative frequency 30, giving 40 marks. "
                     "At 60 marks the cumulative frequency is 90, so 120 − 90 = 30 students scored more than 60."),
        marking_breakdown=[("Median", 1, ""), ("Q1", 1, ""), ("Distinction students", 1, "")],
        parts=[
            part("med", "Median", "Median score", 1, answer=50, unit="marks"),
            part("q1", "Q1", "Lower quartile", 1, answer=40, unit="marks"),
            part("dist", "Distinction students", "Number of students with more than 60 marks", 1, answer=30, unit="students"),
        ],
    ))
    qs.append(assess_question(
        22, sec="A", crit="D", marks=3, lvl="intermediate", topic="Histograms", subtopic="frequency from frequency density",
        blocks=["The unequal-width histogram shows trunk diameters $d$ (cm) in a teak plot across 0–10, 10–25 and 25–45 cm. [3]",
                grouped_histogram([(0, 10, 14), (10, 25, 30), (25, 45, 18)],
                                  title="Trunk diameters in a teak plot", x_label="Diameter d (cm)"),
                "**(a)** Trees in 10–25 cm  **(b)** Total trees in the plot"],
        explanation="Frequency = frequency density × class width. (a) 2.0 × 15 = 30 trees. (b) 1.4 × 10 + 30 + 0.9 × 20 = 14 + 30 + 18 = 62 trees.",
        marking_breakdown=[("(a)", 1, ""), ("(b)", 2, "two outer classes and total")],
        parts=[
            part("a", "(a)", "Number of trees in 10–25 cm", 1, answer=30, unit="trees"),
            part("b1", "Outer classes", "Total trees in 0–10 cm and 25–45 cm", 1, answer=32, unit="trees"),
            part("b2", "(b)", "Total trees in the plot", 1, answer=62, unit="trees"),
        ],
    ))
    qs.append(assess_question(
        23, sec="A", crit="A", marks=5, lvl="intermediate", topic="Population variation", subtopic="variance and standard deviation",
        blocks=["Five maize plants have heights (cm): 11, 14, 15, 17, 18 (treat as a complete population). Find: [5]",
                "**Range:**   **Median:**   **Mean $\\mu$:**   **Variance $\\sigma^2$:**   **SD $\\sigma$ (2 d.p.):**"],
        explanation="Range 18 − 11 = 7 cm; median 15 cm; μ = 75/5 = 15 cm; squared deviations 16+1+0+4+9 = 30, variance 6 cm²; σ = √6 = 2.45 cm.",
        marking_breakdown=[("Range", 1, ""), ("Median", 1, ""), ("Mean", 1, ""), ("Variance", 1, ""), ("SD", 1, "")],
        parts=[
            part("range", "Range", "Range", 1, answer=7, unit="cm"),
            part("median", "Median", "Median", 1, answer=15, unit="cm"),
            part("mean", "Mean", "Population mean μ", 1, answer=15, unit="cm"),
            part("var", "Variance", "Population variance σ²", 1, answer=6, unit="cm²"),
            part("sd", "SD", "Population standard deviation σ (2 d.p.)", 1, answer=2.45, tolerance=0.01, unit="cm"),
        ],
    ))
    qs.append(assess_question(
        24, sec="A", crit="D", marks=4, lvl="intermediate", topic="Outliers", subtopic="1.5 × IQR fences",
        blocks=["Daily solar output (kWh) summary: Min = 140, $Q_1$ = 200, Median = 225, $Q_3$ = 240, Max = 315. "
                "Using the $1.5 \\times IQR$ criterion: [4]",
                "**IQR:**   **Lower fence:**   **Upper fence:**   **Are any values outliers? (Yes/No + value):**"],
        explanation="IQR = 240 − 200 = 40. Lower fence = 200 − 1.5(40) = 140; upper fence = 240 + 60 = 300. The minimum 140 lies on the lower fence; the maximum 315 > 300 is an outlier.",
        marking_breakdown=[("IQR", 1, ""), ("Lower fence", 1, ""), ("Upper fence", 1, ""), ("Outlier decision", 1, "")],
        parts=[
            part("iqr", "IQR", "Interquartile range", 1, answer=40, unit="kWh"),
            part("low", "Lower fence", "Lower fence", 1, answer=140, unit="kWh"),
            part("high", "Upper fence", "Upper fence", 1, answer=300, unit="kWh"),
            part("out", "Outliers", "Are there outliers? Write Yes or No and the value.", 1, kind="text",
                 accepted=["Yes, 315", "Yes 315 kWh", "Yes — 315", "Yes (315)"],
                 keywords=[["yes"], ["315"]], min_groups=2),
        ],
    ))
    qs.append(assess_question(
        25, sec="A", crit="A", marks=4, lvl="intermediate", topic="Grouped tables", subtopic="frequency density",
        blocks=["**Complete** the missing entries in this continuous grouped table: [4]",
                numbered_table(
                    ["Time t (min)", "Class width", "Frequency", "Freq. density"],
                    [["0 ≤ t < 10", "10", "15", "(a) ________"],
                     ["10 ≤ t < 25", "(b) ________", "36", "(c) ________"],
                     ["25 ≤ t < 45", "20", "(d) ________", "0.6"]]),
                "**(a)** Frequency density   **(b)** Class width   **(c)** Frequency density   **(d)** Frequency"],
        explanation="(a) 15 ÷ 10 = 1.5. (b) 25 − 10 = 15. (c) 36 ÷ 15 = 2.4. (d) 0.6 × 20 = 12.",
        marking_breakdown=[("(a)", 1, ""), ("(b)", 1, ""), ("(c)", 1, ""), ("(d)", 1, "")],
        parts=[
            part("a", "(a)", "Frequency density for 0 ≤ t < 10", 1, answer=1.5),
            part("b", "(b)", "Class width for 10 ≤ t < 25", 1, answer=15, unit="min"),
            part("c", "(c)", "Frequency density for 10 ≤ t < 25", 1, answer=2.4),
            part("d", "(d)", "Frequency for 25 ≤ t < 45", 1, answer=12),
        ],
    ))
    qs.append(assess_question(
        26, sec="A", crit="B", marks=3, lvl="intermediate", topic="Grouped mean", subtopic="unknown frequency",
        blocks=["Commute times: $0 \\le t < 10$ $(f=6)$, $10 \\le t < 20$ $(f=k)$, $20 \\le t < 30$ $(f=9)$. "
                "Given the estimated mean is 16 min: [3]",
                "$6(5) + 9(25) =$ ______  $\\Rightarrow$  $k =$ ______"],
        explanation="6(5) + 9(25) = 30 + 225 = 255. Then (255 + 15k)/(15 + k) = 16, so 255 + 15k = 240 + 16k and k = 15.",
        marking_breakdown=[("Weighted total", 1, ""), ("k", 2, "equation and solution")],
        parts=[
            part("sum", "Weighted total", "Calculate $6(5) + 9(25)$", 1, answer=255),
            part("k", "k", "Find k", 2, answer=15, kind="numeric"),
        ],
    ))
    qs.append(assess_question(
        27, sec="A", crit="B", marks=3, lvl="intermediate", topic="Linear transformation", subtopic="effect on mean and spread",
        blocks=["Sensor readings $x$ have mean $\\mu_x = 30$ and SD $\\sigma_x = 2.5$. Each value is rescaled by "
                "$y = 2x - 10$. **Find:** [3]",
                "**$\\mu_y$:**   **$\\sigma_y$:**   **Variance $\\sigma_y^2$:**"],
        explanation="μy = 2(30) − 10 = 50; σy = |2|(2.5) = 5; variance = 5² = 25.",
        marking_breakdown=[("Mean", 1, ""), ("SD", 1, ""), ("Variance", 1, "")],
        parts=[
            part("mean", "Mean", "Mean μy", 1, answer=50),
            part("sd", "SD", "Standard deviation σy", 1, answer=5),
            part("var", "Variance", "Variance σy²", 1, answer=25),
        ],
    ))
    qs.append(assess_question(
        28, sec="A", crit="B", marks=3, lvl="intermediate", topic="Equally spaced data", subtopic="standard deviation pattern",
        blocks=["Five equally spaced integers $\\{12, 16, 20, 24, 28\\}$ (step $d = 4$): [3]",
                "**μ:**   **Exact σ:**   **Step $d>0$ for $\\sigma = 5\\sqrt{2}$:**"],
        explanation="μ = 20; σ = √((64+16+0+16+64)/5) = √32 = 4√2. For five equally spaced values σ = d√2, so d = 5 gives σ = 5√2.",
        marking_breakdown=[("Mean", 1, ""), ("Exact SD", 1, ""), ("Step", 1, "")],
        parts=[
            part("mean", "Mean", "Mean μ", 1, answer=20),
            part("sd", "Exact σ", "Exact population standard deviation", 1, kind="text",
                 accepted=["4√2", "4 sqrt 2", "4root2", "√32", "5.66"]),
            part("d", "Step", "Step d for σ = 5√2", 1, answer=5),
        ],
    ))
    qs.append(assess_question(
        29, sec="A", crit="C", marks=4, lvl="intermediate", topic="Box-plot comparison", subtopic="median and IQR",
        blocks=["Parallel box plots compare delivery times (min) of Fast and Express couriers: [4]",
                box_figure((10, 18, 22, 28, 38), title="Fast courier delivery times", x_label="Delivery time (min)"),
                box_figure((5, 14, 24, 34, 42), title="Express courier delivery times", x_label="Delivery time (min)"),
                "**Fast Med:**   **Fast IQR:**   **Express IQR:**   **More consistent:**"],
        explanation="Fast: median 22 min, IQR = 28 − 18 = 10 min. Express: IQR = 34 − 14 = 20 min. The smaller IQR means Fast is more consistent.",
        marking_breakdown=[("Fast median", 1, ""), ("Fast IQR", 1, ""), ("Express IQR", 1, ""), ("Consistency", 1, "")],
        parts=[
            part("med", "Fast Med", "Fast median delivery time", 1, answer=22, unit="min"),
            part("fast", "Fast IQR", "Fast interquartile range", 1, answer=10, unit="min"),
            part("express", "Express IQR", "Express interquartile range", 1, answer=20, unit="min"),
            part("more", "More consistent", "Which courier is more consistent?", 1, kind="text",
                 accepted=["Fast", "Fast courier", "Fast is more consistent"],
                 keywords=[["fast"]], min_groups=1),
        ],
    ))
    qs.append(assess_question(
        30, sec="A", crit="C", marks=3, lvl="basic", topic="Data classification", subtopic="variable type and display",
        blocks=["**Classify** each variable (Qualitative / Discrete / Continuous) and **state** an appropriate display "
                "(Bar graph or Histogram): [3]",
                numbered_table(["Variable", "Data Type", "Suitable Display"],
                               [["Favourite sport", "________", "________"],
                                ["Goals per match", "________", "________"],
                                ["100 m time (s)", "________", "________"]])],
        explanation="Favourite sport: qualitative, bar graph. Goals per match: discrete, bar graph. 100 m time: continuous, histogram.",
        marking_breakdown=[("Sport", 1, ""), ("Goals", 1, ""), ("100 m time", 1, "")],
        parts=[
            part("sport", "Favourite sport", "Data type and suitable display for favourite sport", 1, kind="text",
                 accepted=["Qualitative, Bar graph", "Qualitative bar graph", "Qualitative; bar chart"],
                 keywords=[["qualitative", "categorical"], ["bar"]], min_groups=2),
            part("goals", "Goals per match", "Data type and suitable display for goals per match", 1, kind="text",
                 accepted=["Discrete, Bar graph", "Discrete bar graph", "Discrete; bar chart"],
                 keywords=[["discrete"], ["bar"]], min_groups=2),
            part("time", "100 m time (s)", "Data type and suitable display for 100 m time", 1, kind="text",
                 accepted=["Continuous, Histogram", "Continuous histogram", "Continuous; histogram"],
                 keywords=[["continuous"], ["histogram"]], min_groups=2),
        ],
    ))

    # ── Part B · Task 1 · Criterion A ──────────────────────────────────────
    qs.append(assess_question(
        31, sec="B", crit="A", marks=10, lvl="challenge", topic="Grouped data and cumulative frequency",
        subtopic="boundaries, modal class, mean, quartiles, frequency density",
        number=1, question_label="B Q1",
        blocks=["**QUESTION 1 · CRITERION A: KNOWING & UNDERSTANDING [10 marks]**",
                "**(a)** Lengths of 50 cocoa pods (measured to the nearest mm):",
                numbered_table(["Length (mm)", "20–29", "30–39", "40–49", "50–59"],
                               [["Frequency f", "8", "20", "14", "8"]]),
                "**(i)** State the lower and upper class boundaries of 30–39 mm. [1]\n"
                "**(ii)** State the modal class and the class containing the median. [1]\n"
                "**(iii)** Using class midpoints, **calculate** an estimate of the mean pod length. [2]",
                "**(b)** The cumulative frequency curve shows weekly revision hours $h$ of 80 MYP 4 students, "
                "passing through (8, 20), (12, 40), (16, 60) and (20, 72).",
                graph_points([(0, 0), (8, 20), (12, 40), (16, 60), (20, 72), (24, 80)], connect=True,
                             title="Weekly revision hours of 80 students", x_label="Revision h (hours)",
                             y_label="Cumulative frequency", x_min=0, x_max=24, y_min=0, y_max=80),
                "**(i)** Find the median, $Q_1$, $Q_3$ and IQR. [2]\n"
                "**(ii)** Find the number and percentage of students revising more than 20 hours. [1]",
                "**(c)** Waiting times $t$ (min) of 51 patients: $0 \\le t < 5$ $(f=10)$, $5 \\le t < 15$ $(f=25)$, "
                "$15 \\le t < 35$ $(f=16)$.",
                "**(i)** **Calculate** the frequency density of each class. [2]\n"
                "**(ii)** On a histogram where 1 unit of frequency density = 2 cm vertically, find the bar height (in cm) "
                "for each class. [1]"],
        explanation=(
            "(a)(i) 29.5 mm and 39.5 mm. (ii) Modal class 30–39 mm (f = 20); the 25th and 26th pods lie in the same class, "
            "so the median class is 30–39 mm. (iii) Weighted total = 8(24.5)+20(34.5)+14(44.5)+8(54.5)=1 945; mean = 38.9 mm.\n"
            "(b)(i) At cumulative frequency 40, median = 12 h; at 20, Q1 = 8 h; at 60, Q3 = 16 h; IQR = 8 h. "
            "(ii) 8 students (10%).\n"
            "(c)(i) 10÷5=2.0; 25÷10=2.5; 16÷20=0.8. (ii) Heights 4.0 cm, 5.0 cm and 1.6 cm."
        ),
        marking_breakdown=[
            ("(a)(i)", 1, "class boundaries"), ("(a)(ii)", 1, "modal and median class"),
            ("(a)(iii)", 2, "weighted total and mean"), ("(b)(i)", 2, "quartiles and IQR"),
            ("(b)(ii)", 1, "number and percentage"), ("(c)(i)", 2, "three frequency densities"),
            ("(c)(ii)", 1, "three bar heights"),
        ],
        parts=[
            part("a1", "(a)(i)", "Lower and upper boundaries of 30–39 mm", 1, kind="text",
                 accepted=["29.5 and 39.5", "29.5 mm and 39.5 mm", "29.5, 39.5", "29.5 to 39.5"]),
            part("a2", "(a)(ii)", "Modal class and class containing the median", 1, kind="text",
                 accepted=["30–39 and 30–39", "30-39 mm; 30-39 mm", "Both 30–39 mm", "30–39 mm, 30–39 mm"],
                 keywords=[["30", "39"]], min_groups=1),
            part("a3", "(a)(iii) total", "Weighted total using midpoints", 1, answer=1945),
            part("a4", "(a)(iii) mean", "Estimated mean pod length (1 d.p.)", 1, answer=38.9, tolerance=0.05, unit="mm"),
            part("b1", "(b)(i) quartiles", "Median, Q1, Q3 and IQR of revision times", 2, kind="text",
                 accepted=["median 12 h, Q1 8 h, Q3 16 h, IQR 8 h",
                           "12, 8, 16, 8", "Med 12, Q1 8, Q3 16, IQR 8"],
                 keywords=[["12"], ["8"], ["16"], ["iqr", "interquartile"]], min_groups=4),
            part("b3", "(b)(ii)", "Number and percentage revising more than 20 hours", 1, kind="text",
                 accepted=["8 students, 10%", "8 and 10%", "8, 10%", "8 students (10%)"]),
            part("c1", "(c)(i) first two", "Frequency densities for the first two classes", 1, kind="text",
                 accepted=["2.0 and 2.5", "2, 2.5", "2.0, 2.5"]),
            part("c2", "(c)(i) third", "Frequency density for 15 ≤ t < 35", 1, answer=0.8),
            part("c3", "(c)(ii)", "Bar heights in cm for the three classes", 1, kind="text",
                 accepted=["4, 5, 1.6", "4.0, 5.0, 1.6", "4 cm, 5 cm, 1.6 cm"]),
        ],
    ))

    # ── Task 2 · Criterion B ──────────────────────────────────────────────
    qs.append(assess_question(
        32, sec="B", crit="B", marks=10, lvl="challenge", topic="Investigating patterns",
        subtopic="outliers, invariance and grouped means",
        number=2, question_label="B Q2",
        blocks=["**QUESTION 2 · CRITERION B: INVESTIGATING PATTERNS [10 marks]**",
                "**(a)** Six ordered test scores are $\\{40, 42, 44, 46, 48, 50\\}$.",
                "**(i)** **Calculate** the mean, median and IQR of these 6 scores. [2]\n"
                "**(ii)** A seventh student scores $y = 10$. **Find** the new mean, median and IQR of all 7 scores. [2]",
                "**(b)** Suppose the seventh score is any value $y$ satisfying $0 \\le y \\le 40$.",
                "**(i)** **Write** a formula in terms of $y$ for the mean of the 7 scores. [1]\n"
                "**(ii)** **Investigate** the median and IQR for different values of $y$ in $0 \\le y \\le 40$, "
                "**state** a general rule, and **explain** mathematically why both remain invariant across this interval. [2]",
                "**(c)** **Compare** two 8-value datasets (in kg):\n"
                "• Set A: $\\{1, 2, 2, 3, 4, 11, 12, 13\\}$   • Set B: $\\{3, 4, 5, 6, 7, 13, 15, 17\\}$",
                "**(i)** **Compute** the exact mean of Set A and of Set B. [1]\n"
                "**(ii)** Group both sets into $0 \\le x < 10$ and $10 \\le x < 20$, **show** they produce the same grouped "
                "estimated mean, and **explain** why the midpoint estimate is exact for Set B but overestimates Set A. [2]"],
        explanation=(
            "(a)(i) Sum 270, mean 45; median 45; Q1=42, Q3=48, IQR 6. (ii) With 10: sum 280, mean 40; median 44; Q1=40, Q3=48, IQR 8.\n"
            "(b)(i) Mean = (270+y)/7. (ii) For 0 ≤ y ≤ 40 the ordered list is y,40,42,44,46,48,50, so the median (4th) is 44, "
            "Q1 (2nd) is 40, Q3 (6th) is 48, and IQR = 8 for every such y.\n"
            "(c)(i) Means 6.0 kg and 8.75 kg. (ii) Both group to f=5 in 0–10 and f=3 in 10–20, so grouped mean = (5×5+3×15)/8 = 8.75 kg. "
            "In Set B each class mean equals its midpoint (25/5=5, 45/3=15); Set A clusters low (12/5=2.4, 36/3=12), so the midpoint estimate is too high."
        ),
        marking_breakdown=[
            ("(a)(i)", 2, "mean and median, IQR"), ("(a)(ii)", 2, "new mean, median and IQR"),
            ("(b)(i)", 1, "formula"), ("(b)(ii)", 2, "rule and explanation"),
            ("(c)(i)", 1, "two means"), ("(c)(ii)", 2, "grouped mean and explanation"),
        ],
        parts=[
            part("a1", "(a)(i) mean", "Mean of the six scores", 1, answer=45),
            part("a2", "(a)(i) median & IQR", "Median and IQR of the six scores", 1, kind="text",
                 accepted=["45 and 6", "median 45, IQR 6", "45, 6"]),
            part("a3", "(a)(ii) mean", "New mean of all seven scores", 1, answer=40),
            part("a4", "(a)(ii) median & IQR", "New median and IQR of all seven scores", 1, kind="text",
                 accepted=["44 and 8", "median 44, IQR 8", "44, 8"]),
            part("b1", "(b)(i)", "Formula for the mean of the seven scores", 1, kind="expression",
                 accepted=["(270+y)/7", "(y+270)/7", "270/7 + y/7"]),
            part("b2", "(b)(ii) rule", "State the rule for the median and IQR", 1, kind="text",
                 accepted=["Median 44 and IQR 8 for every y", "Median stays 44, IQR stays 8",
                           "Both remain constant: median 44, IQR 8"],
                 keywords=[["median", "44"], ["iqr", "8", "constant", "unchanged"]], min_groups=2),
            part("b3", "(b)(ii) explanation", "Explain why the median and IQR stay invariant", 1, kind="text",
                 accepted=["y is always first, so the 2nd, 4th and 6th values do not change",
                           "y occupies the first position so Q1, median and Q3 are unchanged"],
                 keywords=[["first", "lowest", "position"], ["q1", "median", "q3", "quartile"], ["unchanged", "same", "constant"]],
                 min_groups=2),
            part("c1", "(c)(i)", "Exact means of Set A and Set B", 1, kind="text",
                 accepted=["6.0 and 8.75", "6 and 8.75", "Set A 6, Set B 8.75"]),
            part("c2", "(c)(ii) grouped mean", "Common grouped estimated mean", 1, answer=8.75, unit="kg"),
            part("c3", "(c)(ii) explanation", "Explain why the midpoint estimate is exact for B but overestimates A", 1, kind="text",
                 accepted=["Set B class means equal the midpoints, but Set A values cluster near the lower boundaries",
                           "B's values average to the midpoints; A's are lower within each class"],
                 keywords=[["set b", "b"], ["midpoint", "class mean"], ["set a", "a"], ["lower", "overestimate", "cluster"]],
                 min_groups=3),
        ],
    ))

    # ── Task 3 · Criterion C ──────────────────────────────────────────────
    qs.append(assess_question(
        33, sec="B", crit="C", marks=10, lvl="challenge", topic="Communicating statistics",
        subtopic="back-to-back stem-and-leaf, flawed histogram",
        number=3, question_label="B Q3",
        blocks=["**QUESTION 3 · CRITERION C: COMMUNICATING [10 marks]**",
                "**(a)** Standing broad-jump distances (cm) of 9 athletes before and after an 8-week plyometric programme:\n"
                "• **Before:** 115, 128, 122, 131, 119, 125, 135, 124, 118\n"
                "• **After:** 129, 142, 136, 148, 133, 139, 151, 144, 128",
                "**(i)** **Construct** an ordered back-to-back stem-and-leaf diagram (stems 11 to 15 in the centre) with a clear dual key. [3]\n"
                "**(ii)** **State** the median and range of each group and **write** two concise statistical sentences comparing performance. [2]",
                "**(b)** Kofi surveyed delivery distances $d$ (km) for 50 orders: $0 \\le d < 10$ $(f=12)$, $10 \\le d < 20$ $(f=18)$, "
                "$20 \\le d < 40$ $(f=20)$, and drew the chart shown.",
                bar_figure([("0–10", 12), ("10–20", 18), ("20–40", 20)],
                           title="Kofi's delivery-distance chart", x_label="Distance d (km)"),
                "**(i)** **Identify** two statistical errors in Kofi's chart. [2]\n"
                "**(ii)** **Calculate** the frequency densities and **draw** a correctly scaled histogram on your paper. [3]"],
        explanation=(
            "(a)(i) Before leaves on the left, after leaves on the right:\n"
            "9 8 5 | 11 | 8\n"
            "8 4 2 | 12 | 8 9\n"
            "5 1 | 13 | 3 6 9\n"
            "4 2 | 14 | 2 4 8\n"
            "| 15 | 1\n"
            "Key: 5 | 11 | 8 means 115 cm before and 118 cm after.\n"
            "(ii) Before median 124 cm, range 20 cm; after median 139 cm, range 23 cm. The median improved by 15 cm, "
            "indicating higher typical performance, while the range increased by 3 cm, indicating slightly greater spread.\n"
            "(b)(i) The bars have gaps and equal visual widths for continuous classes of unequal width (0–10, 10–20, 20–40); "
            "and the vertical axis plots raw frequency rather than frequency density, exaggerating the 20–40 class. "
            "(ii) Frequency densities: 12/10 = 1.2, 18/10 = 1.8, 20/20 = 1.0."
        ),
        marking_breakdown=[
            ("(a)(i)", 3, "back-to-back diagram"), ("(a)(ii)", 2, "medians, ranges and comparison"),
            ("(b)(i)", 2, "two errors"), ("(b)(ii)", 3, "frequency densities and histogram"),
        ],
        tools=["rich_text", "math", "stem_leaf", "statistics"],
        guidance=("Use the stem-and-leaf workspace for the back-to-back diagram. Put the Before class on the left and the "
                  "After class on the right of the shared stems, and include the dual key."),
        default_tool="stem_leaf",
        parts=[
            part("a2", "(a)(ii) medians and ranges", "Median and range for each group", 1, kind="text",
                 accepted=["Before 124 cm range 20 cm; after 139 cm range 23 cm",
                           "Before median 124, range 20; After median 139, range 23"],
                 keywords=[["before", "124"], ["after", "139"], ["20"], ["23"]], min_groups=4),
            part("a3", "(a)(ii) comparison", "Two concise statistical sentences comparing performance", 1, kind="text",
                 accepted=["The median increased by 15 cm, so typical performance improved; the range increased by 3 cm, so spread increased slightly",
                           "Median improved by 15 cm but range is 3 cm larger"],
                 keywords=[["median", "improved", "increased"], ["15"], ["range", "spread"], ["3"]], min_groups=3),
            part("b1", "(b)(i) error 1", "First statistical error in Kofi's chart", 1, kind="text",
                 accepted=["Gaps between bars / equal bar widths for continuous unequal classes",
                           "The bars have gaps and equal widths although the classes are continuous and unequal"],
                 keywords=[["gap", "equal width", "width"], ["continuous", "class", "unequal"]], min_groups=2),
            part("b2", "(b)(i) error 2", "Second statistical error in Kofi's chart", 1, kind="text",
                 accepted=["Raw frequency plotted instead of frequency density",
                           "The vertical axis should be frequency density"],
                 keywords=[["frequency density", "density"], ["not frequency", "raw frequency", "should be"]], min_groups=1),
            part("b3", "(b)(ii) frequency densities", "Frequency densities for the three classes", 2, kind="text",
                 accepted=["1.2, 1.8, 1.0", "1.2 1.8 1.0", "1.2, 1.8 and 1.0"],
                 keywords=[["1.2"], ["1.8"], ["1.0"]], min_groups=3),
        ],
        structured_marks=[
            structured("stem", "(a)(i) Back-to-back stem-and-leaf diagram", "stem_leaf", 3, {
                "rows": [
                    {"stem": "11", "left": ["9", "8", "5"], "right": []},
                    {"stem": "12", "left": ["8", "4", "2"], "right": ["8", "9"]},
                    {"stem": "13", "left": ["5", "1"], "right": ["3", "6", "9"]},
                    {"stem": "14", "left": [], "right": ["2", "4", "8"]},
                    {"stem": "15", "left": [], "right": ["1"]},
                ],
            }, tolerance=0, part_id="a3"),
            structured("hist", "(b)(ii) Correctly scaled histogram", "statistics", 1, {
                "chart": "histogram",
                "groups": [
                    {"from": 0, "to": 10, "frequency": 12},
                    {"from": 10, "to": 20, "frequency": 18},
                    {"from": 20, "to": 40, "frequency": 20},
                ],
            }, part_id="b3"),
        ],
    ))

    # ── Task 4 · Criterion D ──────────────────────────────────────────────
    qs.append(assess_question(
        34, sec="B", crit="D", marks=10, lvl="challenge", topic="Real-life contexts",
        subtopic="quality control, grouped energy and spread",
        number=4, question_label="B Q4",
        blocks=["**QUESTION 4 · CRITERION D: REAL-LIFE CONTEXTS [10 marks]**",
                "**(a)** An Allada pineapple cannery checks a population batch of 8 cans:",
                numbered_table(["Net mass x (g)", "398", "399", "400", "401", "402"],
                               [["Number of cans f", "1", "2", "2", "2", "1"]]),
                "Quality control requires $399.5 \\le \\mu \\le 400.5$ g and $\\sigma \\le 1.20$ g. "
                "**Calculate** $\\mu$ and $\\sigma$ (to 2 d.p.) and **determine** whether the batch passes both rules. [4]",
                "**(b)** Daily solar energy generated over 30 days at a Cotonou clinic:",
                numbered_table(["Output E (kWh)", "8 ≤ E < 12", "12 ≤ E < 16", "16 ≤ E < 20", "20 ≤ E < 24"],
                               [["Number of days", "5", "13", "9", "3"]]),
                "The clinic requires at least 450 kWh over the 30 days to run its vaccine refrigerators without grid backup. "
                "**Estimate** the total energy generated and daily mean, and **advise** the clinic director. [3]",
                "**(c)** A coastal weather station must choose between two sensor-battery brands (lifetimes in months) and "
                "requires at least 34 months of uninterrupted operation before scheduled maintenance:\n"
                "• Brand Alpha: $\\mu = 36.4$, $\\sigma = 0.9$, IQR = 1.4\n"
                "• Brand Beta: $\\mu = 38.0$, $\\sigma = 3.4$, IQR = 5.2",
                "**Recommend** one brand using both centre and spread, and **state** one real-world limitation of relying only "
                "on summary statistics. [3]"],
        explanation=(
            "(a) Weighted sum = 398(1)+399(2)+400(2)+401(2)+402(1) = 3 200 g, so μ = 400.00 g. Squared deviations give "
            "1(4)+2(1)+2(0)+2(1)+1(4)=12, variance 1.5 g², σ = √1.5 = 1.22 g. The mean passes, but 1.22 > 1.20, so the batch fails.\n"
            "(b) Midpoints 10, 14, 18, 22 kWh: total = 5(10)+13(14)+9(18)+3(22) = 460 kWh; daily mean = 15.33 kWh. "
            "460 ≥ 450, so the target is met, but the margin is only 10 kWh and actual values near lower boundaries could reduce output.\n"
            "(c) Recommend Alpha: Beta has the higher mean, but its much larger spread means a substantial fraction falls below 34 months. "
            "Alpha's small σ (μ − 2σ = 34.6 > 34) makes it more reliable. Limitation: summary statistics hide the distribution, sample size, "
            "test conditions, unit cost or the effect of coastal heat, humidity and salinity."
        ),
        marking_breakdown=[
            ("(a) mean", 1, ""), ("(a) variance", 1, ""), ("(a) standard deviation", 1, ""), ("(a) decision", 1, ""),
            ("(b) total", 1, ""), ("(b) daily mean", 1, ""), ("(b) advice", 1, ""),
            ("(c) recommendation", 1, ""), ("(c) reason", 1, ""), ("(c) limitation", 1, ""),
        ],
        parts=[
            part("a1", "(a) mean", "Population mean μ (2 d.p.)", 1, answer=400, tolerance=0.005, unit="g"),
            part("a2", "(a) variance", "Population variance σ²", 1, answer=1.5, tolerance=0.005, unit="g²"),
            part("a3", "(a) standard deviation", "Population standard deviation σ (2 d.p.)", 1, answer=1.22, tolerance=0.01, unit="g"),
            part("a4", "(a) decision", "Does the batch pass both rules?", 1, kind="text",
                 accepted=["No, σ = 1.22 g > 1.20 g", "No — standard deviation exceeds 1.20 g",
                           "Fails because σ exceeds 1.20 g"],
                 keywords=[["no", "fail"], ["1.22", "1.2"], ["sigma", "standard deviation", "σ"]], min_groups=2),
            part("b1", "(b) total", "Estimated 30-day total energy", 1, answer=460, unit="kWh"),
            part("b2", "(b) daily mean", "Estimated daily mean energy (2 d.p.)", 1, answer=15.33, tolerance=0.01, unit="kWh/day"),
            part("b3", "(b) advice", "Advice to the clinic director", 1, kind="text",
                 accepted=["The target is met (460 kWh ≥ 450 kWh), but the margin is small",
                           "Yes, 460 kWh exceeds 450 kWh; only a 10 kWh margin"],
                 keywords=[["meets", "exceeds", "target", "yes"], ["450"], ["margin", "small", "close"]], min_groups=2),
            part("c1", "(c) recommendation", "Recommended brand", 1, kind="text",
                 accepted=["Brand Alpha", "Alpha"], keywords=[["alpha"]], min_groups=1),
            part("c2", "(c) reason", "Reason using both centre and spread", 1, kind="text",
                 accepted=["Beta has a higher mean but much larger spread, so Alpha is more reliable above 34 months",
                           "Alpha has a slightly lower mean but much smaller σ and IQR, so fewer batteries fall below 34 months"],
                 keywords=[["beta", "higher mean"], ["alpha", "smaller", "lower spread", "sigma", "iqr"], ["34", "reliable"]],
                 min_groups=2),
            part("c3", "(c) limitation", "One real-world limitation of relying only on summary statistics", 1, kind="text",
                 accepted=["Summary statistics hide the shape of the distribution and the test conditions",
                           "They do not show sample size, distribution shape, cost or coastal conditions"],
                 keywords=[["shape", "distribution", "sample", "conditions", "cost"], ["hide", "do not show", "cannot", "ignores"]],
                 min_groups=2),
        ],
    ))

    # Back-to-back starter with stems 11–15, leaving the leaves blank.
    for record in qs:
        if record["n"] == 33:
            record["cfg"]["response_stem_leaf"] = {"starter": {
                "version": 1, "title": "Before and after broad-jump distances (cm)", "layout": "back_to_back",
                "stemLabel": "Stem", "leafLabel": "Leaf", "leftLeafLabel": "Before", "rightLeafLabel": "After",
                "key": "Dual key: 5 | 11 | 8 means 115 cm before and 118 cm after",
                "rows": [
                    {"id": "r11", "stem": "11", "leaves": "", "leftLeaves": "", "rightLeaves": ""},
                    {"id": "r12", "stem": "12", "leaves": "", "leftLeaves": "", "rightLeaves": ""},
                    {"id": "r13", "stem": "13", "leaves": "", "leftLeaves": "", "rightLeaves": ""},
                    {"id": "r14", "stem": "14", "leaves": "", "leftLeaves": "", "rightLeaves": ""},
                    {"id": "r15", "stem": "15", "leaves": "", "leftLeaves": "", "rightLeaves": ""},
                ],
            }}

    return qs
