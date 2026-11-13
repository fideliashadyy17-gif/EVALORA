"""MYP 4 (Grade 9) Mathematics — Mock Examination (Statistics).

Every data set in this paper is internally consistent: the quartiles, the mean,
the standard deviation and the histogram densities are computed from the same
numbers the candidate is given, and the build script re-checks them.
"""
from mock_common import P, Q

EXAM = {
    "key": "myp4-mock",
    "title": "MYP4 Mathematics — Mock Examination",
    "curriculum": "MYP 4",
    "grade": "9",
    "subject": "Mathematics",
    "duration": 150,
    "kind": "mock",
    "code": "MYP4-MOCK-2026",
    "description": (
        "Grade 9 · MYP 4 · Mathematics · Mock Examination. Classification of data, measures of "
        "central tendency, stem-and-leaf diagrams, five-number summaries and box plots, grouped "
        "frequency tables, estimated mean, histograms with frequency density, cumulative frequency "
        "curves, line graphs and standard deviation. 45 questions, 221 marks: Section A (objective) and "
        "Section B (structured statistical investigations)."
    ),
    "instructions": (
        "MYP4 MATHEMATICS — MOCK EXAMINATION (Grade 9)\n\n"
        "Time allowed: 2 hours 30 minutes.\n\n"
        "SECTION A — Objective questions (questions 1–22).\n"
        "Each question has one correct answer (or, where stated, more than one). Several questions give "
        "you a data set you must interrogate before you can choose: read the question twice.\n\n"
        "SECTION B — Structured questions (questions 23–45).\n"
        "Show your working. Marks are printed beside every part. Where a question asks you to CONSTRUCT "
        "a table, histogram, cumulative frequency curve or box plot, build it in the workspace — you are "
        "not given a completed one, because constructing the representation is what is being assessed.\n\n"
        "EXAMINATION OBJECTIVES. By the end of this paper you should be able to: classify data as "
        "qualitative or quantitative, discrete or continuous, and justify the classification; choose and "
        "justify an appropriate measure of central tendency, including in the presence of outliers; "
        "construct and interpret stem-and-leaf diagrams, grouped frequency tables, histograms with "
        "unequal class widths, cumulative frequency curves and box plots; estimate a mean from grouped "
        "data using midpoints; calculate and interpret standard deviation; and compare distributions "
        "with evidence rather than impression.\n\n"
        "GENERAL INSTRUCTIONS.\n"
        "1. A calculator is permitted in Section B and for the standard deviation questions, but write "
        "down the formula or method you use. Standard deviation is the population standard deviation "
        "σ = √(Σ(x − x̄)² / n) unless a question says otherwise.\n"
        "2. Give units, and round to the accuracy stated in each part. If no accuracy is stated, give "
        "3 significant figures.\n"
        "3. A hint is available on every part. Hints guide the method and never give the answer; using "
        "one costs no marks and is recorded only to support your revision.\n"
        "4. Your answers save automatically; after a disconnection, reopen the paper and your work is "
        "restored.\n"
        "5. Quartiles use the median-excluded method: for an odd number of values the median is not "
        "used in either half.\n\n"
        "MARKS. Every part shows its marks. Section A is worth 62 marks and Section B 159 marks, out of "
        "a total of 221. Pass mark: your institution's configured threshold (default 50%)."
    ),
}

QUESTIONS = [
    # ─── Section A — objective (1–22) ───────────────────────────────────────────
    Q(1, "classification of data", "medium", "A",
      "A hospital records each patient's blood group. Which classification is correct?",
      "Blood group is a label, not a number: it is qualitative (categorical) data. It cannot be "
      "ordered or averaged, which is why a bar chart is appropriate and a mean is not.",
      options=[("Qualitative (categorical), and a bar chart is appropriate", True),
               ("Quantitative continuous, because blood is measured", False),
               ("Quantitative discrete, because there are four groups", False),
               ("Qualitative, and the mean blood group should be calculated", False)],
      points=2, subtopic="qualitative versus quantitative",
      next_time="Ask whether the values are labels or amounts. If you cannot sensibly average them, they are qualitative."),
    Q(2, "mean, mode and median", "medium", "A",
      "The salaries in a small company are $22 000, $24 000, $25 000, $26 000 and $180 000. Which statement "
      "best describes the effect of the $180 000 salary?",
      "The mean is 277 000 ÷ 5 = $55 400 while four of the five salaries are below $26 000, so the mean is "
      "pulled up by the outlier. The median ($25 000) is unaffected and describes a typical salary better.",
      options=[("It inflates the mean, so the median describes a typical salary better", True),
               ("It inflates the median more than the mean", False),
               ("It has no effect because it is a single value", False),
               ("It makes the mode the best measure of centre", False)],
      points=3, subtopic="outliers and choice of measure",
      next_time="An outlier moves the mean because the mean uses every value's size; the median only uses position."),
    Q(3, "grouped data", "hard", "A",
      "A grouped frequency table has classes 0 ≤ x < 10, 10 ≤ x < 20, 20 ≤ x < 30 with frequencies 5, 9 and 6. "
      "Which midpoint must be used for the class 10 ≤ x < 20 when estimating the mean?",
      "The midpoint of a class is the average of its boundaries: (10 + 20)/2 = 15. Using 10 or 20 would place "
      "every value in that class at a boundary, which systematically skews the estimate.",
      options=[("15", True), ("10, the lower boundary", False), ("20, the upper boundary", False), ("9, the frequency", False)],
      points=2, subtopic="class midpoints",
      next_time="Midpoint = (lower boundary + upper boundary) ÷ 2, not one of the boundaries."),
    Q(4, "histograms", "hard", "A",
      "A histogram has one class of width 5 with frequency 20 and an adjacent class of width 10 with frequency 20. "
      "The bar for the narrower class is drawn taller. By what factor?",
      "Frequency density is frequency ÷ width: 20/5 = 4 for the narrow class and 20/10 = 2 for the wide one, so "
      "the narrow bar is twice as tall. Equal frequencies do NOT give equal bar heights when widths differ.",
      options=[("2", True), ("1 — equal frequencies must give equal bars", False), ("0.5", False), ("4", False)],
      points=3, subtopic="frequency density with unequal widths",
      next_time="In a histogram, area — not height — represents frequency. Height = frequency ÷ class width."),
    Q(5, "cumulative frequency", "hard", "A",
      "A cumulative frequency curve shows 40 students in total. Reading across at cumulative frequency 10 gives "
      "the value 23. What have you found?",
      "The lower quartile is the value below which a quarter of the data lies: 40 ÷ 4 = 10, so the x-value at "
      "cumulative frequency 10 is Q1 = 23. The median would be read at 20 and Q3 at 30.",
      options=[("The lower quartile, Q1 = 23", True), ("The median, 23", False),
               ("The upper quartile, Q3 = 23", False), ("The interquartile range, 23", False)],
      points=3, subtopic="reading quartiles from a curve",
      next_time="On a cumulative frequency curve, read n/4, n/2 and 3n/4 on the vertical axis to find Q1, the median and Q3."),
    Q(6, "standard deviation", "hard", "A",
      "Two classes sit the same test. Class A has mean 62 and standard deviation 4; Class B has mean 62 and "
      "standard deviation 11. Which statement is correct?",
      "A larger standard deviation means the values are more spread out around the same mean. Both classes "
      "average 62, but Class B's marks are far more variable, so individual performances are less predictable.",
      options=[("Class B has more variable marks, so its results are less consistent", True),
               ("Class B has a higher average mark", False),
               ("The standard deviations show Class A has more outliers", False),
               ("The two classes performed identically because the means are equal", False)],
      points=3, subtopic="interpreting standard deviation",
      next_time="Standard deviation measures spread, not level. Equal means say nothing about consistency."),
    Q(7, "stem-and-leaf diagrams", "hard", "A",
      "A stem-and-leaf diagram has rows 3 | 2 4 6 and 4 | 1 1 1 5 with the key '4 | 1 means 41'. What is the mode?",
      "The leaf 1 appears three times on stem 4, giving the value 41 three times — more often than any other "
      "value. Reading the key correctly is essential: on stem 4 the leaf 1 is 41, not 1.",
      options=[("41", True), ("1", False), ("46 (the highest value on the first row)", False), ("There is no mode", False)],
      points=3, subtopic="reading a stem-and-leaf key",
      next_time="Always read the key first. The stem supplies the tens and the leaf the units in this example."),
    Q(8, "five-number summary and box plots", "hard", "A",
      "A box plot has minimum 12, Q1 18, median 25, Q3 31 and maximum 60. Which statement best explains the "
      "shape of the distribution?",
      "The upper whisker runs from 31 to 60, which is much longer than the lower whisker (12 to 18), and the "
      "median is closer to Q1. That indicates positive skew: a tail of high values.",
      options=[("It is positively skewed — the upper whisker is much longer", True),
               ("It is symmetrical because the median lies inside the box", False),
               ("It is negatively skewed because the minimum is small", False),
               ("The shape cannot be judged from a box plot", False)],
      points=3, subtopic="shape from a box plot",
      next_time="Compare whisker lengths and the position of the median inside the box; that is the evidence for skew."),
    Q(9, "mean, mode and median", "medium", "A",
      "Eight students scored 3, 5, 5, 6, 7, 8, 9, 9 on a quiz. A ninth student scores 10. How does the median change?",
      "With eight values the median is (6 + 7)/2 = 6.5. Adding a ninth value gives 3, 5, 5, 6, 7, 8, 9, 9, 10, "
      "whose median is the 5th value = 7. The mean rises by less than a mark, but the median moves to an actual data value.",
      options=[("It rises from 6.5 to 7", True), ("It stays at 6.5", False),
               ("It rises from 6.5 to 7.5", False), ("It falls because more values are added", False)],
      points=3, subtopic="effect of n on the median",
      next_time="For an even number of values the median is the mean of the two middle values; with an odd number it is a single value."),
    Q(10, "cumulative frequency", "hard", "A",
      "A cumulative frequency table ends with a total frequency of 50. A candidate reads the median at cumulative "
      "frequency 50. What error have they made?",
      "The median is read at n/2 = 25, not at the total. Cumulating to 50 locates the maximum, so the candidate "
      "has found the largest value rather than the middle one.",
      options=[("They read the maximum instead of the median; the median is at 25", True),
               ("They should have read at 50 ÷ 4", False),
               ("Nothing — the median is always at the total", False),
               ("They should have subtracted 50 from the total", False)],
      points=3, subtopic="misreading a cumulative axis",
      next_time="The vertical axis of a cumulative frequency diagram runs to n, so quartiles are read at n/4, n/2 and 3n/4."),
    Q(11, "grouped data", "hard", "B",
      "For the grouped table 0 ≤ x < 10, 10 ≤ x < 20, 20 ≤ x < 30 with frequencies 4, 7, 5, what is the estimated mean?",
      "Σf x = 4(5) + 7(15) + 5(25) = 20 + 105 + 125 = 250 and Σf = 16, so the estimated mean is 250 ÷ 16 = 15.625.",
      options=[("15.625", True), ("15 (the middle class midpoint)", False),
               ("16 (Σf ÷ 1, a misread)", False), ("20 (the highest midpoint)", False)],
      points=3, subtopic="estimated mean from midpoints",
      next_time="Estimated mean = Σ(f × midpoint) ÷ Σf. Write both sums before dividing."),
    Q(12, "histograms", "hard", "B",
      "A histogram bar covers 20 ≤ x < 30 with height (frequency density) 1.4. What is the frequency of that class?",
      "Frequency = density × class width = 1.4 × 10 = 14. The area of the bar is the frequency, which is why "
      "density must be multiplied by the width.",
      options=[("14", True), ("1.4", False), ("28", False), ("140", False)],
      points=3, subtopic="frequency from density",
      next_time="frequency = frequency density × class width; equivalently, the area of each bar."),
    Q(13, "standard deviation", "hard", "B",
      "A data set is 4, 4, 4, 4, 4. What is its standard deviation, and what does that tell you?",
      "Every value equals the mean 4, so each deviation is 0, Σ(x − x̄)² = 0 and σ = 0. A standard deviation of "
      "zero means there is no spread at all.",
      options=[("0 — there is no spread", True), ("4 — the mean is 4", False),
               ("2 — half the mean", False), ("It cannot be calculated from five values", False)],
      points=2, subtopic="standard deviation of a constant set",
      next_time="Standard deviation is the root mean square deviation; if there are no deviations, it is zero."),
    Q(14, "comparing data sets", "hard", "B",
      "Two runners' times (minutes) over 6 races: A: 30, 32, 33, 34, 36, 37. B: 28, 31, 33, 33, 35, 44. "
      "Which comparison is supported by the data?",
      "Both have the same mean (202 ÷ 6 ≈ 33.67) and the same median (33), but B has a much larger spread (range "
      "16 against 7, and larger deviations), so B is less consistent even though the averages match.",
      options=[("The medians are equal but B is less consistent", True),
               ("B has the higher median", False),
               ("A has the larger range", False),
               ("A is less consistent because its values are closer together", False)],
      points=3, subtopic="comparing centre and spread",
      next_time="Compare a measure of centre AND a measure of spread; two distributions can share a centre and differ in consistency."),
    Q(15, "line graphs", "hard", "B",
      "A line graph of a shop's monthly sales rises steeply from January to March, then is flat from March to "
      "August. Which conclusion is justified?",
      "The graph supports a statement about the trend in the recorded months only: sales grew early in the year "
      "and then held steady. It does not explain why, and it says nothing about September onwards.",
      options=[("Sales increased early in the year and then stayed roughly constant", True),
               ("The shop will close because sales stopped growing", False),
               ("The shop's advertising caused the March increase", False),
               ("Sales were highest in August", False)],
      points=3, subtopic="trend versus cause",
      next_time="A graph shows what happened in the data, not why. Keep causal claims out of a data interpretation."),
    Q(16, "classification of data", "hard", "B",
      "A market researcher records four variables. Which one of them is continuous data?",
      "The mass of a parcel can take any value in an interval, so it is continuous. Shoe size, the number of "
      "siblings and a house number are counts or labels.",
      options=[("The mass of a parcel, measured to the nearest gram", True), ("A shoe size", False),
               ("The number of siblings a student has", False), ("A house number", False)],
      points=3, subtopic="discrete versus continuous",
      next_time="If the value can, in principle, be measured more and more precisely, it is continuous; if you count it, it is discrete."),
    Q(17, "five-number summary and box plots", "hard", "B",
      "For the data 3, 5, 7, 8, 10, 12, 14, 15, 18 (using the median-excluded quartile method), what is the "
      "interquartile range?",
      "There are 9 values, so the median is the 5th value = 10. The lower half is 3, 5, 7, 8 with Q1 = 6, and the "
      "upper half is 12, 14, 15, 18 with Q3 = 14.5. IQR = 14.5 − 6 = 8.5.",
      options=[("8.5", True), ("10", False), ("15 (maximum − minimum)", False), ("5 (Q3 − median)", False)],
      points=3, subtopic="quartiles with an odd n",
      next_time="Split the ordered data at the median and exclude the median itself when n is odd, then average the middle two of each half."),
    Q(18, "grouped data", "hard", "B",
      "A grouped table has classes with widths 10, 10, 20 and 20 and frequencies 6, 9, 10 and 6. Which statement "
      "about drawing a histogram is correct?",
      "Because the widths differ, the bar heights must be frequency densities: 0.6, 0.9, 0.5 and 0.3. Using the "
      "raw frequencies would make the 20-wide classes look twice as important as they are.",
      options=[("The four densities are 0.6, 0.9, 0.5 and 0.3", True),
               ("The bars should be 6, 9, 10 and 6 high", False),
               ("All four bars are the same height because the total is 31", False),
               ("The widths cannot be compared on a histogram", False)],
      points=3, subtopic="density for mixed widths",
      next_time="Divide each frequency by its own class width before drawing, so that all areas remain comparable."),
    Q(19, "mean, mode and median", "hard", "B",
      "A data set has mean 20, median 22 and mode 30. Which statement is most consistent with these values?",
      "Mean < median < mode is the classic signature of a negatively (left) skewed distribution, where a few "
      "small values pull the mean down while the mode sits at the most frequent higher value.",
      options=[("The data are negatively skewed, with a tail of small values", True),
               ("The data are perfectly symmetrical", False),
               ("The data are positively skewed, with a tail of large values", False),
               ("The three measures cannot disagree", False)],
      points=3, subtopic="mean, median and mode together",
      next_time="Compare the order of mean, median and mode: a mean below the median suggests a low-value tail."),
    Q(20, "classification of data", "medium", "A",
      "A survey asks students to choose one of five favourite sports. Which is the most suitable representation?",
      "The data are categorical with five named groups, so a bar chart (or a pie chart) compares the counts. A "
      "histogram and a cumulative frequency curve require numerical classes.",
      options=[("A bar chart, because the data are categorical", True),
               ("A histogram, because there are five groups", False),
               ("A cumulative frequency curve, because the counts add to the total", False),
               ("A box plot, because it shows the spread of sports", False)],
      points=2, subtopic="choosing a representation",
      next_time="Histograms, cumulative curves and box plots need numerical data. Named categories use bar or pie charts."),
    Q(21, "line graphs", "hard", "B",
      "A line graph of a child's height is plotted monthly for two years and shows a steep rise. Why is a line "
      "graph appropriate here but misleading if the axes do not start at zero?",
      "A line graph shows a continuous change over time, which suits monthly height. If the vertical axis starts "
      "at, say, 140 cm instead of 0, small changes look dramatic, which exaggerates the trend.",
      options=[("It suits change over time, but a truncated vertical axis exaggerates small changes", True),
               ("It is inappropriate because height is continuous data", False),
               ("It is appropriate because height is a category", False),
               ("A pie chart would show the change better", False)],
      points=3, subtopic="misleading axes",
      next_time="Check both axes before interpreting a line graph; a truncated vertical scale magnifies every fluctuation."),
    Q(22, "standard deviation", "hard", "B",
      "A data set of 5 values has Σ(x − x̄)² = 80. What is the population standard deviation?",
      "Variance = 80 ÷ 5 = 16, so σ = √16 = 4. Dividing by 5 (the number of values) is what distinguishes the "
      "population standard deviation from the sample version.",
      options=[("4", True), ("16", False), ("8", False), ("80", False)],
      points=3, subtopic="computing sigma from the sum of squares",
      next_time="σ = √(Σ(x − x̄)² / n). Divide by n first, then take the square root — not the other way round."),

    # ─── Section B — structured investigations (23–45) ─────────────────────────
    Q(23, "classification of data", "hard", "B",
      "A hospital records, for each patient admitted in a week: age (years), blood group, number of previous "
      "admissions, and body temperature (°C).\n\n(a) Classify each of the four variables as qualitative or "
      "quantitative.\n(b) For the quantitative variables, state whether each is discrete or continuous.\n"
      "(c) Justify your classification of 'number of previous admissions'.",
      "Blood group is qualitative (a label). Age is quantitative continuous in principle (measured to the "
      "nearest unit); number of admissions is quantitative discrete (counted in whole admissions); temperature is "
      "quantitative continuous. Admissions must be discrete because you cannot have 2.4 admissions.",
      parts=[
          P("a", "(a)", "Name the qualitative variable.", "text", 1,
            ["A qualitative variable is a label or category, not an amount.",
             "Which of the four cannot sensibly be averaged?"], strand="B(i)",
            accepted=["blood group", "blood group (qualitative)"]),
          P("b", "(b)", "State which quantitative variable is discrete.", "text", 2,
            ["A discrete variable is counted in whole steps.",
             "Age and temperature can be measured more precisely; admissions cannot."], strand="B(ii)",
            accepted=["number of previous admissions", "the number of previous admissions is discrete"]),
          P("c", "(c)", "Justify why 'number of previous admissions' must be discrete.", "text", 2,
            ["Can a patient have 2.4 previous admissions?",
             "The values jump from one whole number to the next."], strand="B(iii)",
            accepted=["you can only count whole admissions, so its values are separate whole numbers",
                      "admissions are counted, not measured, so there are no in-between values"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="In (c) explain the counting argument, not only the definition of discrete.",
      explanation="Blood group is qualitative; age and temperature are quantitative continuous; the number of "
                  "previous admissions is quantitative discrete because it is a count with gaps between permitted values.",
      next_time="Classify in two steps: is it a label or an amount, and if an amount, is it counted or measured?",
      marking="(a) 1 mark for blood group. (b) 2 marks: 1 for admissions discrete, 1 for age/temperature continuous. "
              "(c) 2 marks: 1 for 'counted', 1 for the consequence (no fractional values)."),
    Q(24, "grouped data", "hard", "C",
      "The masses of 40 parcels, in kilograms, are summarised below.\n\n10 ≤ m < 15: 6 parcels\n"
      "15 ≤ m < 20: 14 parcels\n20 ≤ m < 30: 12 parcels\n30 ≤ m < 40: 8 parcels\n\n(a) State the class width "
      "of the third class.\n(b) Calculate the estimated mean mass, using midpoints.\n(c) Explain why the class "
      "20 ≤ m < 30 has a lower frequency density than 15 ≤ m < 20 even though it has almost the same frequency.",
      "Widths are 5, 5, 10 and 10. Σf = 40. Midpoints 12.5, 17.5, 25, 35 give Σf x = 75 + 245 + 300 + 280 = 900, "
      "so the estimated mean is 900 ÷ 40 = 22.5 kg. The third class has the same frequency over double the width, "
      "so its density is 12/10 = 1.2 against 14/5 = 2.8.",
      parts=[
          P("a", "(a)", "State the class width of 20 ≤ m < 30.", "numeric", 1,
            ["Width = upper boundary − lower boundary.",
             "30 − 20."], strand="C(i)", answer=10, tol=0, unit="kg"),
          P("b", "(b)", "Calculate Σ(f × midpoint).", "numeric", 2,
            ["Use the midpoint of each class: 12.5, 17.5, 25, 35.",
             "Multiply each midpoint by its frequency and add the four products."], strand="C(ii)", answer=900, tol=0, unit="kg"),
          P("c", "(c)", "Calculate the estimated mean mass, in kilograms.", "numeric", 2,
            ["Divide your Σ(f × midpoint) by the total frequency.",
             "The frequencies add to 40."], strand="C(iii)", answer=22.5, tol=0.01, unit="kg"),
          P("d", "(d)", "Explain the lower frequency density of the third class.", "text", 2,
            ["Frequency density = frequency ÷ class width.",
             "Compare 12/10 with 14/5."], strand="C(iv)",
            accepted=["its class width is twice as large, so the same frequency is spread over a wider interval, giving a lower density: 1.2 against 2.8",
                      "because the class width is 10 rather than 5, so frequency divided by width is smaller"]),
      ],
      tools=["rich_text", "math", "statistics"], requirement="text",
      chart="histogram",
      guidance="Build the grouped table in the statistics workspace as a check, but record your answers in the boxes.",
      explanation="Σf x = 6(12.5) + 14(17.5) + 12(25) + 8(35) = 75 + 245 + 300 + 280 = 900, so the estimated mean is "
                  "900/40 = 22.5 kg. Densities are 1.2, 2.8, 1.2 and 0.8; the third class is less dense than the "
                  "second because its frequency is spread over twice the width.",
      next_time="Estimated mean = Σ(f × midpoint) ÷ Σf. Frequency density = frequency ÷ class width.",
      marking="(a) 1 mark for 10. (b) 2 marks: 1 for the four products, 1 for 900. (c) 2 marks: 1 for dividing by 40, "
              "1 for 22.5. (d) 2 marks: 1 for the density formula, 1 for the comparison 1.2 vs 2.8."),
    Q(25, "five-number summary and box plots", "hard", "C",
      "The waiting times, in minutes, of 15 patients are:\n\n4, 6, 7, 8, 9, 11, 12, 13, 15, 16, 18, 20, 23, 25, 28\n\n"
      "(a) State the median.\n(b) Calculate the lower and upper quartiles.\n(c) Calculate the interquartile range.\n"
      "(d) A waiting time of 45 minutes is recorded the next day. Explain, using the 1.5 × IQR rule, whether it is "
      "an outlier.",
      "With 15 values the median is the 8th = 13. Excluding it, the lower half is 4, 6, 7, 8, 9, 11, 12 (Q1 = 8) and "
      "the upper half is 15, 16, 18, 20, 23, 25, 28 (Q3 = 20). IQR = 12. The upper fence is 20 + 1.5(12) = 38, and "
      "45 > 38, so 45 is an outlier.",
      parts=[
          P("a", "(a)", "State the median waiting time, in minutes.", "numeric", 1,
            ["With 15 values, which position is the middle?",
             "(15 + 1) ÷ 2 = 8th value."], strand="C(i)", answer=13, tol=0, unit="minutes"),
          P("b", "(b)", "State the lower quartile Q1, in minutes.", "numeric", 2,
            ["Exclude the median and take the lower seven values.",
             "The middle of 4, 6, 7, 8, 9, 11, 12 is the 4th value."], strand="C(ii)", answer=8, tol=0, unit="minutes"),
          P("c", "(c)", "State the upper quartile Q3, in minutes.", "numeric", 2,
            ["The upper half is 15, 16, 18, 20, 23, 25, 28.",
             "Its middle value is the 4th."], strand="C(ii)", answer=20, tol=0, unit="minutes"),
          P("d", "(d)", "Calculate the IQR, in minutes.", "numeric", 1,
            ["The interquartile range is the upper quartile minus the lower quartile.",
             "Subtract your Q1 from your Q3."], strand="C(iii)", answer=12, tol=0, unit="minutes"),
          P("e", "(e)", "Decide whether 45 minutes is an outlier and justify with the fence value.", "text", 2,
            ["Upper fence = Q3 + 1.5 × IQR.",
             "Compare 45 with 20 + 18."], strand="C(iv)",
            accepted=["yes, it is an outlier: the upper fence is 38 minutes and 45 exceeds it",
                      "45 > 38 so it is an outlier"]),
      ],
      tools=["statistics", "rich_text", "math"], requirement="statistics",
      chart="box_plot",
      guidance="Enter the 15 waiting times in the statistics workspace and draw the box plot to check your quartiles.",
      explanation="Median 13; Q1 = 8; Q3 = 20; IQR = 12. The upper fence is 20 + 1.5(12) = 38, so 45 minutes lies "
                  "beyond it and is an outlier. The box plot's long upper whisker anticipates this.",
      next_time="Q1 and Q3 are the medians of the lower and upper halves. The 1.5 × IQR fences identify outliers.",
      marking="(a) 1 mark. (b) 2 marks: 1 for splitting at the median, 1 for 8. (c) 2 marks: 1 for the upper half, "
              "1 for 20. (d) 1 mark for 12. (e) 2 marks: 1 for the fence 38, 1 for the correct conclusion."),
    Q(26, "histograms", "hard", "C",
      "A grouped frequency table for 50 journey times (minutes) is:\n\n0 ≤ t < 5: 4\n5 ≤ t < 10: 12\n"
      "10 ≤ t < 20: 18\n20 ≤ t < 30: 10\n30 ≤ t < 40: 6\n\n(a) Calculate the class width of each class.\n"
      "(b) Calculate the frequency density of the class 10 ≤ t < 20.\n(c) Explain why plain frequencies cannot "
      "be used as bar heights for this table.\n(d) Calculate the total area of the correct histogram and state "
      "what it represents.",
      "Widths are 5, 5, 10, 10, 10. Densities are 0.8, 2.4, 1.8, 1.0, 0.6. Frequencies cannot be heights because "
      "the widths differ: a 10-wide class with 18 would look smaller than a 5-wide class with 12 even though it "
      "contains more data. The total area is Σ(density × width) = 50, the total frequency.",
      parts=[
          P("a", "(a)", "State the class width of 20 ≤ t < 30.", "numeric", 1,
            ["A class width is the upper boundary minus the lower boundary.",
             "For 20 ≤ t < 30 use 30 − 20."], strand="C(i)", answer=10, tol=0, unit="minutes"),
          P("b", "(b)", "Calculate the frequency density of 10 ≤ t < 20.", "numeric", 2,
            ["Frequency density = frequency ÷ class width.",
             "18 ÷ 10."], strand="C(ii)", answer=1.8, tol=0.01),
          P("c", "(c)", "Explain why frequencies cannot be used as bar heights here.", "text", 2,
            ["Compare the widths: 5 and 10 minutes.",
             "A bar's area must be proportional to the frequency."], strand="C(iii)",
            accepted=["the class widths are not equal, so equal frequencies would give different areas; heights must be density so that area represents frequency",
                      "because area, not height, must be proportional to frequency when widths differ"]),
          P("d", "(d)", "Calculate the total area of the histogram.", "numeric", 2,
            ["Add density × width for all five classes.",
             "It must equal the total frequency."], strand="C(iv)", answer=50, tol=0),
      ],
      tools=["statistics", "rich_text", "math"], requirement="statistics",
      chart="histogram",
      guidance="Enter the grouped table in the statistics workspace: the chart will plot densities automatically when widths differ.",
      explanation="The densities 0.8, 2.4, 1.8, 1.0, 0.6 give areas 4, 12, 18, 10, 6 which total 50 — exactly the "
                  "number of journeys. Area is frequency; height alone is not.",
      next_time="Draw a histogram only from frequency densities when class widths differ: area must equal frequency.",
      marking="(a) 1 mark. (b) 2 marks: 1 for the division, 1 for 1.8. (c) 2 marks: 1 for unequal widths, 1 for "
              "the area argument. (d) 2 marks: 1 for the summation, 1 for 50 = total frequency."),
    Q(27, "cumulative frequency", "hard", "C",
      "The table gives the marks of 60 students.\n\n0 ≤ m < 10: 5\n10 ≤ m < 20: 12\n20 ≤ m < 30: 15\n"
      "30 ≤ m < 40: 16\n40 ≤ m < 50: 12\n\n(a) Construct the cumulative frequency column.\n(b) State the "
      "cumulative frequency after the class 30 ≤ m < 40.\n(c) Explain how the median is estimated from a "
      "cumulative frequency curve of this table.\n(d) One class is missing its frequency and the total is 60: "
      "the first four classes hold 48. Calculate the frequency of the last class.",
      "Cumulative totals are 5, 17, 32, 48, 60. After the fourth class the cumulative frequency is 48. The median "
      "is estimated by reading the value at cumulative frequency n/2 = 30 and interpolating along the curve. The "
      "last class holds 60 − 48 = 12.",
      parts=[
          P("a", "(a)", "State the cumulative frequency after the class 20 ≤ m < 30.", "numeric", 1,
            ["Add the first three frequencies.",
             "5 + 12 + 15."], strand="C(i)", answer=32, tol=0),
          P("b", "(b)", "State the cumulative frequency after 30 ≤ m < 40.", "numeric", 1,
            ["Add the frequency 16 to your previous total.",
             "This must be below 60 because one class remains."], strand="C(ii)", answer=48, tol=0),
          P("c", "(c)", "State which cumulative frequency you read to estimate the median.", "numeric", 1,
            ["The median is the middle value, so read half of the total on the vertical axis.",
             "Divide the 60 students by 2."], strand="C(iii)", answer=30, tol=0),
          P("d", "(d)", "Calculate the frequency of the last class.", "numeric", 1,
            ["The total is 60 and the first four classes hold 48.",
             "60 − 48."], strand="C(iii)", answer=12, tol=0),
          P("e", "(e)", "Explain how the median is obtained from the curve once you reach cumulative frequency 30.", "text", 2,
            ["Read across from 30 to the curve, then down to the horizontal axis.",
             "The value read is the estimated median."], strand="C(iv)",
            accepted=["read across from cumulative frequency 30 to the curve, then down to the mark axis; the value found is the estimated median",
                      "find 30 on the vertical axis, move to the curve, drop to the horizontal axis"]),
      ],
      tools=["statistics", "rich_text", "math"], requirement="statistics",
      chart="cumulative_frequency",
      guidance="Build the grouped table in the workspace to draw the cumulative curve, then answer the boxes.",
      explanation="Cumulative totals 5, 17, 32, 48, 60. The median is read at 30, which falls in the class "
                  "20 ≤ m < 30; the curve interpolates within that class. The final class frequency is 12.",
      next_time="Cumulative frequency is a running total; read n/2 on the vertical axis to estimate the median.",
      marking="(a) 1 mark. (b) 1 mark. (c) 1 mark for 30. (d) 1 mark for 12. (e) 2 marks: 1 for reading across then "
              "down, 1 for stating that the value is the median."),
    Q(28, "standard deviation", "hard", "C",
      "Two bowlers' scores over 5 games are:\n\nAli: 40, 44, 46, 50, 60\nBen: 30, 42, 48, 52, 68\n\n"
      "(a) Calculate the mean score for each bowler.\n(b) Calculate the deviation of each of Ben's scores from his "
      "mean.\n(c) Calculate the population standard deviation of Ben's scores.\n(d) State which bowler is more "
      "consistent and justify your answer.",
      "Both means are 240 ÷ 5 = 48. Ben's deviations are −18, −6, 0, 4, 20; squares 324, 36, 0, 16, 400 total "
      "776; variance 776/5 = 155.2 and σ = √155.2 ≈ 12.46. Ali's deviations are −8, −4, −2, 2, 12 with squares "
      "64, 16, 4, 4, 144 = 232, variance 46.4, σ ≈ 6.81. Ali is more consistent because 6.81 < 12.46.",
      parts=[
          P("a", "(a)", "Calculate Ali's mean score.", "numeric", 1,
            ["Add the five scores and divide by 5.",
             "40 + 44 + 46 + 50 + 60."], strand="C(i)", answer=48, tol=0),
          P("b", "(b)", "Calculate Ben's mean score.", "numeric", 1,
            ["The mean is the total of the scores divided by how many there are.",
             "Ben's scores total 240 over five games."], strand="C(i)", answer=48, tol=0),
          P("c", "(c)", "Calculate the sum of the squared deviations for Ben, Σ(x − x̄)².", "numeric", 2,
            ["Subtract 48 from each score, square it, then add.",
             "(−18)² + (−6)² + 0² + 4² + 20²."], strand="C(ii)", answer=776, tol=0),
          P("d", "(d)", "Calculate Ben's population standard deviation, to 3 significant figures.", "numeric", 3,
            ["Variance = Σ(x − x̄)² ÷ n.",
             "Divide 776 by 5, then take the square root."], strand="C(iii)", answer=12.5, tol=0.05),
          P("e", "(e)", "State which bowler is more consistent and justify your answer.", "text", 2,
            ["Compare the standard deviations of Ali and Ben.",
             "A larger standard deviation means more spread."], strand="C(iv)",
            accepted=["ali, because his standard deviation is about 6.8 against ben's 12.5, so his scores are closer to the mean",
                      "ali is more consistent: 6.81 < 12.46"]),
      ],
      tools=["rich_text", "math", "statistics"], requirement="text",
      guidance="Show the deviations in (c) — the squares are where method marks lie. In (e) compare the two σ values.",
      explanation="Both means are 48. Ben: deviations −18, −6, 0, 4, 20 give 324 + 36 + 0 + 16 + 400 = 776; "
                  "variance 155.2; σ ≈ 12.5. Ali: 64 + 16 + 4 + 4 + 144 = 232; variance 46.4; σ ≈ 6.8. Ali is more "
                  "consistent despite the same mean.",
      next_time="Populations σ = √(Σ(x − x̄)² / n). A larger σ means more variability about the mean.",
      marking="(a) 1 mark for 48. (b) 1 mark for 48. (c) 2 marks: 1 for the deviations, 1 for 776. (d) 3 marks: "
              "1 for dividing by n, 1 for the variance 155.2, 1 for 12.5 (accept 12.4–12.6). (e) 2 marks: 1 for "
              "naming Ali, 1 for comparing the two standard deviations."),
    Q(29, "comparing data sets", "hard", "D",
      "A school compares the journey times (minutes) of students and teachers.\n\nStudents (30 students): "
      "range 42, IQR 14, median 22\nTeachers (24 teachers): range 55, IQR 9, median 31\n\n(a) State which group "
      "has the more variable middle 50% and justify it.\n(b) A governor claims the students have more variable "
      "journeys because their range is smaller. Evaluate this claim.\n(c) Using the medians, describe the difference "
      "between the two groups.",
      "The IQR measures the middle 50% of the data: 14 > 9, so students are more variable in the middle, even though "
      "their range is SMALLER (42 < 55) — so the governor has the comparison backwards. The teachers' median of 31 "
      "is 9 minutes higher, so a typical teacher travels further.",
      parts=[
          P("a", "(a)", "State which group is more variable in the middle 50%, and justify it.", "text", 2,
            ["The IQR measures the middle half of the data.",
             "14 against 9."], strand="D(i)",
            accepted=["students, because their IQR of 14 is larger than the teachers' 9, so their middle 50% covers a wider range",
                      "students: IQR 14 > 9"]),
          P("b", "(b)", "Evaluate the governor's claim about the ranges.", "text", 2,
            ["Compare 42 with 55: which range is larger?",
             "The range is sensitive to just two values, the extremes."], strand="D(ii)",
            accepted=["the claim is wrong: the teachers' range is 55 against the students' 42, so the teachers' journeys are more spread at the extremes; the students are only more variable in the middle",
                      "incorrect — the teachers have the larger range, and the range is decided by the two extreme journeys"]),
          P("c", "(c)", "Describe the difference between the groups using the medians.", "text", 2,
            ["Compare 31 with 22.",
             "State the difference in minutes and what it means."], strand="D(iii)",
            accepted=["a typical teacher travels about 9 minutes longer than a typical student",
                      "teachers' median is 9 minutes higher"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Use the specific numbers in each answer; a comparison without figures earns no marks.",
      explanation="IQR is the spread of the middle half: students 14 > teachers 9. But the teachers' range of 55 "
                  "exceeds the students' 42, so the extremes belong to the teachers. Teachers' median journey is 9 "
                  "minutes longer.",
      next_time="Compare centre and spread separately, and remember the range uses only the two extremes while the IQR uses the middle half.",
      marking="(a) 2 marks: 1 for naming students, 1 for citing the IQRs. (b) 2 marks: 1 for correcting the range "
              "comparison, 1 for explaining the range's sensitivity. (c) 2 marks: 1 for the 9-minute difference, "
              "1 for saying what it means."),
    Q(30, "histograms", "hard", "D",
      "A company advertises 'average salaries of $48 000' for 100 employees. The grouped salary data are:\n\n"
      "$10 000–20 000: 42 employees\n$20 000–30 000: 26\n$30 000–40 000: 14\n$40 000–60 000: 12\n"
      "$60 000–100 000: 6\n\n(a) Calculate the estimated mean using midpoints.\n(b) Explain why the advertised "
      "figure may be misleading and suggest a better measure.\n(c) Describe the distribution's shape from the table.",
      "Σf x = 42(15 000) + 26(25 000) + 14(35 000) + 12(50 000) + 6(80 000) = 630 000 + 650 000 + 490 000 + "
      "600 000 + 480 000 = 2 850 000; ÷100 = $28 500. The advertised $48 000 is far above the estimated mean and "
      "does not describe a typical employee: 82 of the 100 earn under $30 000, so the median is a fairer measure. "
      "The distribution is positively skewed by the small group of very high earners.",
      parts=[
          P("a", "(a)", "Calculate the sum of f × midpoint, in dollars.", "numeric", 2,
            ["Use midpoints 15 000, 25 000, 35 000, 50 000 and 80 000.",
             "Multiply each by its frequency and add the five products."], strand="D(i)", answer=2850000, tol=0),
          P("b", "(b)", "Calculate the estimated mean salary, in dollars.", "numeric", 2,
            ["The estimated mean is Σ(f × midpoint) divided by the total frequency.",
             "Divide your total by the 100 employees."], strand="D(ii)", answer=28500, tol=0, unit="$"),
          P("c", "(c)", "Explain why the advertised figure is misleading and state a better measure.", "text", 3,
            ["How many employees earn less than $30 000?",
             "Which measure is resistant to a few very high salaries?"], strand="D(iii)",
            accepted=["82 of the 100 employees earn less than $30 000, so $48 000 is not typical; the median is a fairer measure because it is not raised by the few high earners",
                      "the mean is pulled up by the top earners, so the median should be quoted"]),
          P("d", "(d)", "Describe the shape of the distribution, using the table as evidence.", "text", 2,
            ["Where is the bulk of the employees?",
             "Is there a long tail at the low or the high end?"], strand="D(iv)",
            accepted=["positively skewed: most employees are in the lower classes with a small tail of very high salaries",
                      "skewed to the right because of the few high earners"]),
      ],
      tools=["statistics", "rich_text", "math"], requirement="statistics",
      chart="histogram",
      guidance="Draw the histogram in the workspace (widths differ, so densities matter) and use it as evidence in (d).",
      explanation="Σf x = $2 850 000 over 100 employees gives an estimated mean of $28 500. Since 82% earn under "
                  "$30 000, the advertised $48 000 misrepresents a typical salary; the median is more representative. "
                  "The long right tail makes the distribution positively skewed.",
      next_time="Compare the estimated mean with the advertised claim and ask what a 'typical' value means when the data are skewed.",
      marking="(a) 2 marks: 1 for the midpoints, 1 for $2 850 000. (b) 2 marks: 1 for dividing by 100, 1 for $28 500. "
              "(c) 3 marks: 1 for the comparison, 1 for citing the 82 employees, 1 for recommending the median. "
              "(d) 2 marks: 1 for 'positively skewed', 1 for the evidence."),
    Q(31, "line graphs", "hard", "D",
      "A water tank is filled and then used. Its volume (litres) is recorded hourly for 8 hours:\n\n"
      "0 h: 0, 1 h: 120, 2 h: 240, 3 h: 300, 4 h: 300, 5 h: 240, 6 h: 160, 7 h: 80, 8 h: 20\n\n"
      "(a) State the interval during which the tank is being filled.\n(b) Calculate the average rate of filling, in "
      "litres per hour, during that interval.\n(c) Calculate the average rate of use over the last 5 hours.\n"
      "(d) Explain what the horizontal section of the graph represents.",
      "The volume rises from 0 to 300 litres between 0 h and 3 h, so filling takes 3 hours at 300 ÷ 3 = 100 litres "
      "per hour. The horizontal section (3 h to 4 h) means the volume is not changing: no water is being added or "
      "used. Over the last 5 hours the volume falls from 300 to 20, a change of 280 litres in 5 hours, that is 56 "
      "litres per hour.",
      parts=[
          P("a", "(a)", "State the number of hours the tank is being filled.", "numeric", 1,
            ["Find where the volume stops increasing.",
             "It reaches 300 litres and stays there."], strand="D(i)", answer=3, tol=0, unit="hours"),
          P("b", "(b)", "Calculate the average rate of filling, in litres per hour.", "numeric", 2,
            ["Use the change in volume divided by the time taken.",
             "300 litres in 3 hours."], strand="D(ii)", answer=100, tol=0, unit="litres/hour"),
          P("c", "(c)", "Calculate the average rate of use over the last 5 hours, in litres per hour.", "numeric", 2,
            ["The volume falls from 300 to 20 litres between 3 h and 8 h.",
             "Divide the 280-litre decrease by 5 hours."], strand="D(iii)", answer=56, tol=0, unit="litres/hour"),
          P("d", "(d)", "Explain what the horizontal section represents.", "text", 2,
            ["A horizontal line means the volume is not changing.",
             "What would cause no change in volume?"], strand="D(iv)",
            accepted=["the volume is constant between 3 and 4 hours, so no water is added or used during that hour",
                      "no water is flowing in or out, so the tank is unchanged"]),
      ],
      tools=["graph", "rich_text", "math"], requirement="graph",
      guidance="Plot the points in the graph workspace and join them, then read the gradients for (b) and (c).",
      explanation="Filling runs 0→3 h reaching 300 litres: 100 litres/hour. The plateau 3→4 h shows no change. From "
                  "4 h to 8 h the volume falls from 300 to 20 litres, so the average use is 280 ÷ 5 = 56 litres/hour.",
      next_time="On a line graph, the gradient is a rate. A horizontal section means the quantity is constant.",
      marking="(a) 1 mark. (b) 2 marks: 1 for the change and time, 1 for 100. (c) 2 marks: 1 for 280 litres, 1 for 56. "
              "(d) 2 marks: 1 for 'constant volume', 1 for the reason."),
    Q(32, "stem-and-leaf diagrams", "hard", "C",
      "Two classes' test scores (out of 50) are:\n\nClass 7A: 12, 18, 21, 23, 25, 28, 31, 34, 38, 42, 47\n"
      "Class 7B: 15, 17, 19, 20, 22, 26, 29, 33, 35, 39, 44\n\n(a) State the median of Class 7A.\n(b) State the "
      "median of Class 7B.\n(c) Explain how a back-to-back stem-and-leaf diagram helps compare the two classes "
      "more fairly than the two lists.",
      "7A has 11 values so its median is the 6th = 28. 7B's median is also the 6th = 26. A back-to-back diagram "
      "aligns both classes on the same stems, so the shape, spread and centre can be compared line by line without "
      "re-sorting either list.",
      parts=[
          P("a", "(a)", "State the median of Class 7A.", "numeric", 1,
            ["There are 11 scores, so the median is the 6th.",
             "Count in from the lowest."], strand="C(i)", answer=28, tol=0),
          P("b", "(b)", "State the median of Class 7B.", "numeric", 1,
            ["Order the 11 scores and take the 6th.",
             "15, 17, 19, 20, 22, 26, ..."], strand="C(i)", answer=26, tol=0),
          P("c", "(c)", "Explain the advantage of a back-to-back stem-and-leaf diagram.", "text", 2,
            ["What do both sides share in such a diagram?",
             "Think about comparing spread and shape, not just the median."], strand="C(ii)",
            accepted=["both classes share the same stems, so their spread, shape and centre can be compared directly row by row",
                      "it aligns the same tens values on one stem so differences are visible at a glance"]),
      ],
      tools=["stem_leaf", "rich_text", "math"], requirement="stem_leaf",
      stem_leaf={
          "title": "Class 7A and Class 7B", "instructions": "Construct a back-to-back stem-and-leaf diagram. Keep each class on its own side of the shared stems.",
          "starter": {"layout": "back_to_back", "stemLabel": "Tens", "leftLeafLabel": "Class 7A leaves", "rightLeafLabel": "Class 7B leaves", "key": "Key: 2 | 8 means 28"},
      }, default_tool="stem_leaf",
      guidance="Build the back-to-back stem-and-leaf diagram in the workspace (one stem column, a leaf column for each class).",
      explanation="Both classes have 11 scores. 7A's median is 28 and 7B's is 26. The back-to-back diagram shares "
                  "stems, so a reader can see that 7A has more high scores in the 30s and 40s while 7B is "
                  "concentrated in the high teens and twenties.",
      next_time="A stem-and-leaf diagram keeps every value while sorting it; back-to-back versions share stems so comparisons are visual.",
      marking="(a) 1 mark for 28. (b) 1 mark for 26. (c) 2 marks: 1 for shared stems, 1 for the comparison benefit."),
    Q(33, "mean, mode and median", "hard", "C",
      "The number of books read by 9 students in a month is:\n\n1, 2, 2, 3, 4, 4, 4, 6, 18\n\n(a) State the mode.\n"
      "(b) Calculate the mean.\n(c) State the median.\n(d) Explain which measure best represents a typical student "
      "here, and why the mean is misleading.",
      "The mode is 4 (three students). Σx = 44 so the mean is 44 ÷ 9 ≈ 4.89. The median is the 5th value = 4. The "
      "median (or mode) at 4 represents a typical student; the mean is inflated by the single student who read 18 "
      "books, which is far from the rest of the data.",
      parts=[
          P("a", "(a)", "State the mode.", "numeric", 1,
            ["Which value appears most often?",
             "Count the 4s."], strand="C(i)", answer=4, tol=0),
          P("b", "(b)", "Calculate the mean, to 2 decimal places.", "numeric", 2,
            ["Add all nine values.",
             "Divide the total by 9."], strand="C(ii)", answer=4.89, tol=0.01),
          P("c", "(c)", "State the median.", "numeric", 1,
            ["With nine values the median is the 5th.",
             "One, two, two, three, four, ..."], strand="C(iii)", answer=4, tol=0),
          P("d", "(d)", "State which measure is most representative and explain why the mean misleads.", "text", 2,
            ["Which value is far from the others?",
             "How does one extreme value affect a mean?"], strand="C(iv)",
            accepted=["the median (or mode) of 4, because the mean of 4.89 is raised by the single value of 18",
                      "the median, since the mean is dragged up by the outlier 18"]),
      ],
      tools=["statistics", "rich_text", "math"], requirement="statistics",
      chart="dot_plot",
      guidance="Enter the values in the statistics workspace and look at the dot plot: the outlier is visible there.",
      explanation="Mode 4, median 4, mean 44/9 ≈ 4.89. The single 18 is an outlier that lifts the mean above every "
                  "value except 18 itself, so the median or mode describes a typical student better.",
      next_time="When one value is far from the rest, quote the median, and say why the mean is distorted.",
      marking="(a) 1 mark. (b) 2 marks: 1 for the total 44, 1 for 4.89. (c) 1 mark. (d) 2 marks: 1 for the choice, "
              "1 for the outlier argument."),
    Q(34, "cumulative frequency", "hard", "D",
      "A courier company measures delivery times (minutes) for 40 parcels:\n\n0 ≤ t < 10: 3\n10 ≤ t < 20: 9\n"
      "20 ≤ t < 30: 15\n30 ≤ t < 40: 8\n40 ≤ t < 60: 5\n\nAn advertisement promises delivery 'within 25 minutes'. "
      "(a) State how many parcels took less than 20 minutes.\n(b) Explain why you cannot read the number under 25 "
      "minutes directly from the table.\n(c) Estimate that number using the assumption of even spread within the "
      "20 ≤ t < 30 class.\n(d) Evaluate the advertisement's claim using your estimate.",
      "Cumulative frequencies are 3, 12, 27, 35, 40. Fewer than 20 minutes means 12 parcels. 25 minutes falls "
      "inside the 20 ≤ t < 30 class, so the table does not give it directly. Assuming the 15 parcels in that class "
      "are spread evenly, half of them (7.5) took under 25 minutes, giving 12 + 7.5 = 19.5 ≈ 20 parcels — about "
      "half the parcels, so the claim 'within 25 minutes' describes only about 50% of deliveries.",
      parts=[
          P("a", "(a)", "State the cumulative frequency at 20 minutes.", "numeric", 1,
            ["Cumulative frequency at 20 minutes is the total of the classes below 20.",
             "Add the frequencies 3 and 9."], strand="D(i)", answer=12, tol=0),
          P("b", "(b)", "Explain why the count for 25 minutes cannot be read directly.", "text", 1,
            ["Which class contains 25 minutes?",
             "The table only gives whole-class totals."], strand="D(ii)",
            accepted=["25 lies inside the class 20 ≤ t < 30, and the table only gives the total for the whole class"]),
          P("c", "(c)", "Estimate how many parcels took less than 25 minutes, assuming an even spread in that class.", "numeric", 3,
            ["Half of the 20 ≤ t < 30 class lies below 25 minutes.",
             "Add half of 15 to the 12 you already have."], strand="D(iii)", answer=19.5, tol=0.6),
          P("d", "(d)", "Evaluate the advertisement's claim.", "text", 2,
            ["What percentage of 40 is your estimate?",
             "Does 'within 25 minutes' describe most deliveries?"], strand="D(iv)",
            accepted=["the claim only holds for about half the deliveries, so it is misleading as a general promise",
                      "about 20 of 40 parcels arrived within 25 minutes, so it is true for roughly half"]),
      ],
      tools=["statistics", "rich_text", "math"], requirement="statistics",
      chart="cumulative_frequency",
      guidance="Draw the cumulative curve in the workspace and read across at 25 minutes to check your estimate.",
      explanation="Cumulative totals 3, 12, 27, 35, 40. At 20 minutes, 12 parcels. Assuming even spread, "
                  "12 + (5/10)(15) = 19.5 ≈ 20 parcels took under 25 minutes — half the total — so the advert "
                  "overstates the service.",
      next_time="Cumulative frequency interpolates inside a class: multiply the class frequency by the fraction of the class you have passed.",
      marking="(a) 1 mark. (b) 1 mark. (c) 3 marks: 1 for identifying the class, 1 for the half-class fraction, "
              "1 for 19.5–20. (d) 2 marks: 1 for the percentage, 1 for a fair evaluation."),
    Q(35, "classification of data", "hard", "D",
      "A supermarket records, for 200 customers: the amount spent (£), whether they used a loyalty card, the number "
      "of items bought, and the time spent in the store (minutes).\n\n(a) State which variable is qualitative.\n"
      "(b) State which variable is discrete.\n(c) Explain why a histogram is suitable for 'amount spent' but not "
      "for 'loyalty card'.\n(d) Explain one reason the recorded time spent in the store might be unreliable.",
      "Loyalty card is qualitative (yes/no). Items bought is discrete. Amount spent is continuous, so it can be "
      "grouped into classes and shown as a histogram; loyalty card has only two categories, so a bar chart is the "
      "correct representation. Time in store may be unreliable because customers may not scan at entry, may leave "
      "and return, or may be recorded by a rough estimate rather than a measurement.",
      parts=[
          P("a", "(a)", "Name the qualitative variable.", "text", 1,
            ["Which variable is a label rather than an amount?",
             "One of the four has only two possible responses."], strand="D(i)",
            accepted=["loyalty card", "whether they used a loyalty card"]),
          P("b", "(b)", "Name the discrete variable.", "text", 1,
            ["Which variable is counted in whole numbers?",
             "You cannot buy half an item in this record."], strand="D(i)",
            accepted=["number of items bought", "items bought", "the number of items"]),
          P("c", "(c)", "Explain why a histogram suits 'amount spent' but not 'loyalty card'.", "text", 2,
            ["A histogram needs numerical classes.",
             "How many categories does the loyalty card variable have?"], strand="D(ii)",
            accepted=["amount spent is continuous so it can be grouped into numerical classes, while the loyalty card has only two categories, which a bar chart shows"]),
          P("d", "(d)", "Give one reason the recorded time in the store may be unreliable.", "text", 2,
            ["How exactly is a customer's time measured?",
             "Could a customer enter, leave and return?"], strand="D(iii)",
            accepted=["the entry and exit times may not be recorded accurately, or a customer may leave and return so the time is not a single continuous visit",
                      "measurement error in when entry and exit were recorded"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Give a concrete reason in (d) — 'human error' alone is too vague to earn the mark.",
      explanation="Loyalty card is qualitative, items is discrete, amount spent and time are continuous. A histogram "
                  "requires numerical classes, which a yes/no variable does not have. Time in store is a measured "
                  "quantity and is therefore subject to recording error and to customers re-entering.",
      next_time="Match the representation to the data type, and treat measured variables as estimates with error.",
      marking="(a) 1 mark. (b) 1 mark. (c) 2 marks: 1 for 'needs numerical classes', 1 for the two-category point. "
              "(d) 2 marks: 1 for a concrete cause, 1 for the consequence."),
    Q(36, "five-number summary and box plots", "hard", "C",
      "Two groups of runners record their 5 km times (minutes).\n\nGroup A: 18, 20, 21, 22, 24, 25, 30\n"
      "Group B: 19, 23, 23, 24, 25, 26, 27\n\n(a) State the median of each group.\n(b) State Q1 and Q3 for "
      "Group A.\n(c) Calculate the IQR of Group B.\n(d) Explain which group is more consistent and justify it with "
      "your values.",
      "Both groups have 7 values so both medians are the 4th: 22 and 24. For Group A, excluding the median, Q1 = 20 "
      "and Q3 = 25, so IQR = 5. For Group B, Q1 = 23 and Q3 = 26, giving IQR = 3. Group B is more consistent "
      "because 3 < 5 and its range (27 − 19 = 8) is smaller than Group A's (30 − 18 = 12).",
      parts=[
          P("a", "(a)", "State the median of Group A.", "numeric", 1,
            ["With seven values the median is the 4th value in order.",
             "Count in from the lowest: 18, 20, 21, 22."], strand="C(i)", answer=22, tol=0),
          P("b", "(b)", "State the median of Group B.", "numeric", 1,
            ["With seven values the median is the 4th value in order.",
             "Count in from the lowest: 19, 23, 23, 24."], strand="C(i)", answer=24, tol=0),
          P("c", "(c)", "State Q1 of Group A.", "numeric", 1,
            ["Exclude the median 22 and take the lower three values.",
             "The middle of 18, 20, 21."], strand="C(ii)", answer=20, tol=0),
          P("d", "(d)", "State Q3 of Group A.", "numeric", 1,
            ["The upper quartile is the median of the upper half.",
             "The upper three values are 24, 25 and 30."], strand="C(ii)", answer=25, tol=0),
          P("e", "(e)", "Calculate the IQR of Group B.", "numeric", 2,
            ["Q1 of B is 23 and Q3 is 26.",
             "IQR = Q3 − Q1."], strand="C(iii)", answer=3, tol=0),
          P("f", "(f)", "State which group is more consistent and justify it.", "text", 2,
            ["Compare the two IQRs.",
             "Also compare the two ranges."], strand="C(iv)",
            accepted=["group b, because its IQR of 3 is smaller than group a's 5 and its range of 8 is smaller than 12",
                      "group b is more consistent: IQR 3 against 5"]),
      ],
      tools=["statistics", "rich_text", "math"], requirement="statistics",
      chart="box_plot",
      guidance="Enter both data sets in the statistics workspace to draw comparable box plots, then answer the boxes.",
      explanation="Medians 22 and 24. Group A: Q1 = 20, Q3 = 25, IQR = 5. Group B: Q1 = 23, Q3 = 26, IQR = 3. Group B "
                  "is more consistent by both IQR and range.",
      next_time="Consistency is a statement about spread: compare IQR and range, not the medians.",
      marking="(a) 1 mark. (b) 1 mark. (c) 1 mark. (d) 1 mark. (e) 2 marks: 1 for Q1 and Q3, 1 for 3. (f) 2 marks: "
              "1 for naming Group B, 1 for citing both spreads."),
    Q(37, "mean, mode and median", "hard", "D",
      "A shoe shop records the sizes sold in a day:\n\n3, 4, 4, 5, 5, 5, 5, 6, 6, 7, 8, 8, 9\n\n(a) State the mode "
      "and the median.\n(b) Calculate the mean.\n(c) Explain which measure should guide the shop's ordering "
      "decision, and why.",
      "The mode is 5 (four pairs) and the median is the 7th value = 5. Σx = 75 over 13 sales, so the mean is "
      "75 ÷ 13 ≈ 5.77. The shop should order mostly size 5: the mode identifies the size most often demanded and "
      "the median shows 5 is also the middle size, so the mean alone would over-order larger sizes.",
      parts=[
          P("a", "(a)", "State the mode.", "numeric", 1,
            ["The mode is the value that appears most often.",
             "Count how many times each size occurs."], strand="D(i)", answer=5, tol=0),
          P("b", "(b)", "State the median.", "numeric", 1,
            ["With thirteen values the median is the 7th in order.",
             "Count in from the lowest size."], strand="D(i)", answer=5, tol=0),
          P("c", "(c)", "Calculate the mean, to 2 decimal places.", "numeric", 2,
            ["Add all thirteen sizes.",
             "Divide by 13."], strand="D(ii)", answer=5.77, tol=0.02),
          P("d", "(d)", "State which measure should guide ordering and explain why.", "text", 3,
            ["The shop needs the size most often requested.",
             "Does the mean overstate demand for any size?"], strand="D(iii)",
            accepted=["the mode of 5, because it is the size most often sold and the shop should stock what customers actually ask for; the mean of 5.77 would over-order larger sizes",
                      "mode and median both indicate size 5; the mean is pulled up by the few large sizes"]),
      ],
      tools=["statistics", "rich_text", "math"], requirement="statistics",
      chart="bar_chart",
      guidance="Draw the bar chart in the workspace to see the demand by size, then answer (d) with the figures.",
      explanation="Mode 5, median 5, mean 75/13 ≈ 5.77. The mean is pulled up by the sizes 7, 8, 8 and 9, so for "
                  "stocking decisions the mode is the right measure: it identifies the size with the highest demand.",
      next_time="Choose the measure that fits the decision: the mode for the most common category, the median when there are outliers.",
      marking="(a) 1 mark. (b) 1 mark. (c) 2 marks: 1 for the total 75, 1 for 5.77. (d) 3 marks: 1 for the choice, "
              "1 for citing demand, 1 for explaining why the mean misleads."),
    Q(38, "histograms", "hard", "D",
      "A histogram of waiting times is described as: 'The bar for 0 ≤ t < 10 has height 3 and the bar for "
      "10 ≤ t < 30 has height 1.' (a) Calculate the frequency of each class.\n(b) Explain why a reader might "
      "wrongly think there are three times as many people in the first class.\n(c) Calculate the area of each bar "
      "and state what the areas show.",
      "Frequencies are 3 × 10 = 30 and 1 × 20 = 20, so the first class has 30 and the second 20 — one and a half "
      "times as many, not three times. The heights are 3 and 1 because the second class is twice as wide, so a "
      "reader who reads heights rather than areas is misled. The areas are 30 and 20, and they are the actual "
      "frequencies.",
      parts=[
          P("a", "(a)", "Calculate the frequency of 0 ≤ t < 10.", "numeric", 1,
            ["Frequency is the area of the bar: density multiplied by class width.",
             "The class is 10 wide and 3 high."], strand="D(i)", answer=30, tol=0),
          P("b", "(b)", "Calculate the frequency of 10 ≤ t < 30.", "numeric", 2,
            ["The class 10 ≤ t < 30 is 20 units wide.",
             "Multiply that width by the height 1."], strand="D(ii)", answer=20, tol=0),
          P("c", "(c)", "Explain why reading heights alone is misleading here.", "text", 2,
            ["Compare the two class widths.",
             "What does the height represent in a histogram?"], strand="D(iii)",
            accepted=["the bars have different widths, so height is density not frequency; reading the heights suggests three times as many when it is only one and a half times",
                      "because the second class is twice as wide, its area — not its height — is the frequency"]),
          P("d", "(d)", "State what the areas of the two bars represent and give their values.", "text", 2,
            ["Area = width × height.",
             "Compare the areas with your frequencies."], strand="D(iv)",
            accepted=["the area of each bar is its frequency, so the areas are 30 and 20"]),
      ],
      tools=["statistics", "rich_text", "math"], requirement="statistics",
      chart="histogram",
      guidance="Enter the grouped table in the workspace; the chart will plot the densities for you to check.",
      explanation="Heights 3 and 1 over widths 10 and 20 give frequencies 30 and 20, a ratio of 3 : 2, not 3 : 1. "
                  "The areas of the bars are the frequencies.",
      next_time="In a histogram, compare areas, not heights. Frequency = density × class width.",
      marking="(a) 1 mark for 30. (b) 2 marks: 1 for the width 20, 1 for 20. (c) 2 marks: 1 for the widths, 1 for "
              "the 3 : 2 explanation. (d) 2 marks: 1 for 'areas = frequencies', 1 for both values."),
    Q(39, "standard deviation", "hard", "D",
      "A machine fills bags labelled '500 g'. A sample of five bags weighs 496, 498, 500, 502 and 504 g.\n\n"
      "(a) Calculate the mean mass.\n(b) Calculate the deviations from the mean.\n(c) Calculate the population "
      "standard deviation.\n(d) A second sample gives a standard deviation of 6.1 g. Explain what this tells the "
      "quality manager, and which sample is closer to the label.",
      "The mean is 2500 ÷ 5 = 500 g. Deviations are −4, −2, 0, 2, 4 with squares 16, 4, 0, 4, 16 = 40, so the "
      "variance is 8 and σ = √8 ≈ 2.83 g. A standard deviation of 6.1 g means the second sample's masses are more "
      "variable, so the filling process is less consistent; both samples can still centre on 500 g, so accuracy "
      "(mean) and precision (spread) must be reported separately.",
      parts=[
          P("a", "(a)", "Calculate the mean mass, in grams.", "numeric", 1,
            ["Add the five masses and divide by 5.",
             "The total is 2500 g."], strand="D(i)", answer=500, tol=0, unit="g"),
          P("b", "(b)", "Calculate Σ(x − x̄)² for the sample.", "numeric", 2,
            ["Subtract 500 from each mass, then square.",
             "16 + 4 + 0 + 4 + 16."], strand="D(ii)", answer=40, tol=0),
          P("c", "(c)", "Calculate the population standard deviation, to 3 significant figures.", "numeric", 3,
            ["Variance = 40 ÷ 5.",
             "Take the square root of 8."], strand="D(iii)", answer=2.83, tol=0.02, unit="g"),
          P("d", "(d)", "Explain the meaning of σ = 6.1 g for the second sample.", "text", 3,
            ["What does a larger standard deviation measure?",
             "Does the mean have to change as well?"], strand="D(iv)",
            accepted=["the second sample's masses vary more about their mean, so the process is less precise; a standard deviation of 6.1 g is much larger than 2.83 g so that filling is less consistent",
                      "it shows greater variability in filling, so the second process is less precise even if its mean is on target"]),
      ],
      tools=["statistics", "rich_text", "math"], requirement="statistics",
      chart="dot_plot",
      guidance="Enter the five masses in the workspace as a dot plot to see the symmetry before computing.",
      explanation="Mean 500 g; Σ(x − x̄)² = 40; variance 8; σ ≈ 2.83 g. The second sample's σ of 6.1 g shows far more "
                  "variability in filling, so it is less precise, although its mean could still be 500 g.",
      next_time="σ measures precision (spread), while the mean measures accuracy (level). Report both when judging a process.",
      marking="(a) 1 mark for 500 g. (b) 2 marks: 1 for the deviations, 1 for 40. (c) 3 marks: 1 for dividing by 5, "
              "1 for the variance 8, 1 for 2.83. (d) 3 marks: 1 for 'more variable', 1 for 'less precise', 1 for "
              "separating accuracy from precision."),
    Q(40, "grouped data", "hard", "D",
      "A cinema surveys 80 customers about travel time (minutes) to the cinema:\n\n0 ≤ t < 10: 20\n10 ≤ t < 20: 28\n"
      "20 ≤ t < 40: 24\n40 ≤ t < 60: 8\n\n(a) Calculate the estimated mean travel time.\n(b) Explain one limitation "
      "of the estimated mean compared with the true mean.\n(c) The cinema proposes a free bus for customers who "
      "travel more than 20 minutes. Using your table, state how many would qualify, and explain one assumption your "
      "answer relies on.",
      "Σf x = 20(5) + 28(15) + 24(30) + 8(50) = 100 + 420 + 720 + 400 = 1640, so the mean is 1640 ÷ 80 = 20.5 "
      "minutes. The estimate assumes every value in a class sits at its midpoint, which flattens the real spread. "
      "Customers travelling more than 20 minutes are 24 + 8 = 32, assuming the class boundary is consistent with "
      "'more than 20' and that each customer answered once.",
      parts=[
          P("a", "(a)", "Calculate Σ(f × midpoint).", "numeric", 2,
            ["Midpoints are 5, 15, 30 and 50.",
             "Multiply each by its frequency and add."], strand="D(i)", answer=1640, tol=0),
          P("b", "(b)", "Calculate the estimated mean travel time, in minutes.", "numeric", 2,
            ["The estimated mean is Σ(f × midpoint) divided by the total frequency.",
             "Divide your 1640 by the 80 customers."], strand="D(ii)", answer=20.5, tol=0.01, unit="minutes"),
          P("c", "(c)", "Explain one limitation of this estimated mean.", "text", 2,
            ["Where does the estimate place every value in a class?",
             "Is that realistic?"], strand="D(iii)",
            accepted=["it assumes every value in a class is at the midpoint, so it ignores the real spread within each class and is only an estimate",
                      "the midpoints may not represent the class, especially where the wider classes 20–40 and 40–60 hide variation"]),
          P("d", "(d)", "State how many customers travel more than 20 minutes, and one assumption behind it.", "text", 2,
            ["Add the two classes above 20 minutes.",
             "Does the table show anyone exactly at 20 minutes?"], strand="D(iv)",
            accepted=["32 customers, assuming the 20 ≤ t < 40 class is correctly classified as more than 20 minutes and that each customer answered once",
                      "32, assuming no one is recorded as exactly 20 minutes"]),
      ],
      tools=["statistics", "rich_text", "math"], requirement="statistics",
      chart="histogram",
      guidance="Draw the histogram in the workspace (the 20-minute and 20-wide classes need densities) and use it in (c).",
      explanation="Σf x = 1640 over 80 customers gives 20.5 minutes. The midpoint assumption flattens variation inside "
                  "the wide classes. Customers over 20 minutes are 24 + 8 = 32, assuming the class boundary matches "
                  "'more than 20'.",
      next_time="An estimated mean from grouped data is always an approximation; state the midpoint assumption when you interpret it.",
      marking="(a) 2 marks: 1 for the midpoints, 1 for 1640. (b) 2 marks: 1 for dividing by 80, 1 for 20.5. "
              "(c) 2 marks: 1 for the midpoint assumption, 1 for its effect. (d) 2 marks: 1 for 32, 1 for a valid assumption."),
    Q(41, "cumulative frequency", "hard", "D",
      "A school records the number of minutes 50 students spend on homework. The cumulative frequency curve shows "
      "the median at 42 minutes, Q1 at 28 minutes and Q3 at 58 minutes.\n\n(a) State the interquartile range.\n"
      "(b) Explain what the IQR tells the school that the median alone does not.\n(c) A teacher claims 'most "
      "students work about 42 minutes'. Evaluate the claim using the quartiles.",
      "IQR = 58 − 28 = 30 minutes. The median gives the middle student's time but not the spread; the IQR shows the "
      "middle half of students work between 28 and 58 minutes — a 30-minute range, which is wide. So 'about 42 "
      "minutes' describes a typical student, but the data are spread over a wide band, which is what the school "
      "needs to know.",
      parts=[
          P("a", "(a)", "State the interquartile range, in minutes.", "numeric", 1,
            ["IQR = Q3 − Q1.",
             "58 − 28."], strand="D(i)", answer=30, tol=0, unit="minutes"),
          P("b", "(b)", "Explain what the IQR adds to the median.", "text", 2,
            ["What does the IQR measure?",
             "Which half of the students does it describe?"], strand="D(ii)",
            accepted=["the IQR describes the spread of the middle half of the students, whereas the median gives only one central value",
                      "it shows that the middle 50% of students range over 30 minutes, which the median alone cannot show"]),
          P("c", "(c)", "Evaluate the teacher's claim using the quartiles.", "text", 3,
            ["Half the students work more than 42 minutes and half less.",
             "How wide is the range of the middle half?"], strand="D(iii)",
            accepted=["the median does show a typical student at 42 minutes, but the middle half spread over 28 to 58 minutes, so 'about 42 minutes' hides a wide variation",
                      "partly valid: 42 is the median, but the IQR of 30 minutes shows the times are spread widely"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Quote the quartiles in (c) — an evaluation without figures is just an opinion.",
      explanation="IQR = 30 minutes. The median locates the middle student; the IQR shows the middle half span 28–58 "
                  "minutes, so the teacher's 'about 42 minutes' is a central value that conceals wide variation.",
      next_time="Pairs of measures tell the whole story: a measure of centre plus a measure of spread.",
      marking="(a) 1 mark for 30. (b) 2 marks: 1 for 'spread of the middle half', 1 for the contrast with the median. "
              "(c) 3 marks: 1 for accepting the median value, 1 for citing 28–58, 1 for judging the claim's limitation."),
    Q(42, "comparing data sets", "hard", "D",
      "Two classes sit the same test out of 40.\n\nClass X: mean 26, median 27, range 22, standard deviation 5.2\n"
      "Class Y: mean 26, median 25, range 24, standard deviation 9.4\n\n(a) State which class has the more "
      "consistent results and justify it.\n(b) Explain what the medians suggest about the shape of each "
      "distribution.\n(c) A parent concludes 'the classes performed equally because both means are 26'. Evaluate "
      "this conclusion.",
      "Class X is more consistent: σ = 5.2 against 9.4, so its marks are closer to the mean. In Class X the median "
      "exceeds the mean slightly (27 > 26), hinting at a small low tail; in Class Y the median is below the mean "
      "(25 < 26), hinting at a high tail and a few very high marks pulling the mean up. Both means being equal says "
      "nothing about spread: the classes differ substantially in consistency, which matters for teaching.",
      parts=[
          P("a", "(a)", "State which class is more consistent and justify it.", "text", 2,
            ["Compare the two standard deviations.",
             "Which one is smaller?"], strand="D(i)",
            accepted=["class x, because its standard deviation of 5.2 is smaller than class y's 9.4, so its marks are closer together",
                      "class x: σ 5.2 < 9.4"]),
          P("b", "(b)", "Explain what the medians suggest about each distribution's shape.", "text", 3,
            ["Compare the median with the mean in each class.",
             "If the median is below the mean, where is the tail?"], strand="D(ii)",
            accepted=["class x has median above mean, suggesting a low tail; class y has median below mean, suggesting a high tail pulling the mean up"],),
          P("c", "(c)", "Evaluate the parent's conclusion.", "text", 3,
            ["Do equal means imply equal performance?",
             "Use the spreads and medians in your answer."], strand="D(iii)",
            accepted=["the means are equal but the distributions differ: class y is far more variable and its median is lower, so equal means do not mean equal performance",
                      "the conclusion ignores spread; class x is more consistent and class y has a wider range"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Compare centre, spread and skew separately in your answers; each is a distinct piece of evidence.",
      explanation="σ tells us Class X is far more consistent. Median > mean suggests a low tail (X); median < mean "
                  "suggests a high tail (Y). Equal means therefore mask very different distributions.",
      next_time="Never judge two distributions on one measure. Centre, spread and shape each answer a different question.",
      marking="(a) 2 marks: 1 for naming X, 1 for citing σ. (b) 3 marks: 1 for the comparison method, 1 for X's low "
              "tail, 1 for Y's high tail. (c) 3 marks: 1 for rejecting the conclusion, 1 for the spread evidence, "
              "1 for a classroom consequence."),
    Q(43, "stem-and-leaf diagrams", "hard", "C",
      "A stem-and-leaf diagram of 20 masses, in grams, begins:\n\n2 | 1 4\n3 | 0 2 2 5 8\n4 | 1 4 6 9\n"
      "5 | 0 3\nKey: 3 | 2 means 32 g\n\n(a) State the smallest mass.\n(b) State how many masses are in the 40s.\n"
      "(c) State the mode.\n(d) A student says the median is 45. Without recalculating, explain why this cannot be "
      "correct.",
      "The smallest value is 21. The 40s row has four leaves, so four masses are in the forties. The leaf 2 appears "
      "twice on stem 3, so the mode is 32. With 20 values the median is the mean of the 10th and 11th; the first "
      "two rows hold 2 + 5 = 7 values, so the 10th value lies in the 40s row, but the median must be the average of "
      "two adjacent ordered values, and 45 is not one of the listed values — a median of 45 would require a leaf 5 "
      "on stem 4, which is absent.",
      parts=[
          P("a", "(a)", "State the smallest mass, in grams.", "numeric", 1,
            ["Read the key: the stem gives the tens.",
             "The first leaf in the diagram is on stem 2."], strand="C(i)", answer=21, tol=0, unit="g"),
          P("b", "(b)", "State how many masses are in the 40s.", "numeric", 1,
            ["Every leaf on stem 4 is a mass in the forties.",
             "Count the leaves 1, 4, 6 and 9."], strand="C(i)", answer=4, tol=0),
          P("c", "(c)", "State the mode, in grams.", "numeric", 1,
            ["Which leaf value is repeated?", "Look at stem 3."], strand="C(ii)", answer=32, tol=0, unit="g"),
          P("d", "(d)", "Explain why a median of 45 g cannot be correct.", "text", 3,
            ["With 20 values, the median is the average of the 10th and 11th.",
             "Which values actually occupy those positions?"], strand="C(iii)",
            accepted=["with 20 values the median is the mean of the 10th and 11th values, which lie in the 40s row, but 45 is not a value in the diagram and a median need not be a data value, so 45 cannot be checked off the leaves",
                      "the tenth and eleventh values are not both 45, so the median cannot be 45"]),
      ],
      tools=["stem_leaf", "rich_text", "math"], requirement="stem_leaf",
      stem_leaf={
          "title": "Masses stem-and-leaf diagram", "instructions": "Rebuild the stem-and-leaf diagram with its key and ordered leaves. Use the completed diagram to identify the median positions.",
          "starter": {"layout": "standard", "stemLabel": "Tens", "leafLabel": "Units", "key": "Key: 3 | 2 means 32 g"},
      }, default_tool="stem_leaf",
      guidance="Rebuild the stem-and-leaf diagram in the workspace and count positions — the position of the median is the argument.",
      explanation="Smallest 21; four values in the 40s; mode 32. For n = 20 the median is the average of the 10th and "
                  "11th values, so it is not simply read off one leaf, and 45 does not correspond to the leaves at "
                  "those positions.",
      next_time="Locate the median by position (n/2), not by eye. For an even n the median need not be a data value.",
      marking="(a) 1 mark. (b) 1 mark. (c) 1 mark. (d) 3 marks: 1 for the position rule, 1 for locating the 10th and "
              "11th, 1 for concluding why 45 fails."),
    Q(44, "line graphs", "hard", "D",
      "A line graph shows a town's recycling rate (%) each year: 2018: 12, 2019: 18, 2020: 24, 2021: 23, "
      "2022: 29, 2023: 35.\n\n(a) Calculate the change in the recycling rate from 2018 to 2023.\n(b) State the year "
      "in which the rate fell, and by how many percentage points.\n(c) Calculate the mean yearly increase from 2018 "
      "to 2023, and explain why it may not predict 2024 accurately.",
      "The rate rose from 12% to 35%, a change of 23 percentage points. The only fall was from 2020 to 2021, "
      "24 → 23, a drop of 1 point. The mean yearly increase over 5 intervals is (35 − 12)/5 = 4.6 points per year, "
      "but extrapolating is unsafe: one year already fell, and the growth may slow as the rate approaches a "
      "practical maximum.",
      parts=[
          P("a", "(a)", "Calculate the increase from 2018 to 2023, in percentage points.", "numeric", 1,
            ["Subtract the 2018 value from the 2023 value.",
             "35 − 12."], strand="D(i)", answer=23, tol=0),
          P("b", "(b)", "State the size of the fall in the year it decreased, in percentage points.", "numeric", 1,
            ["Compare consecutive years.",
             "2020 was 24 and 2021 was 23."], strand="D(i)", answer=1, tol=0),
          P("c", "(c)", "Calculate the mean yearly increase from 2018 to 2023.", "numeric", 2,
            ["There are five yearly intervals between 2018 and 2023.",
             "Divide 23 by 5."], strand="D(ii)", answer=4.6, tol=0.05),
          P("d", "(d)", "Explain why this mean increase may not predict 2024 accurately.", "text", 3,
            ["Is the trend perfectly steady?",
             "What happens to a percentage rate as it approaches its maximum?"], strand="D(iii)",
            accepted=["the trend is not perfectly steady because one year fell, and growth is likely to slow as the rate approaches a practical maximum, so a simple average overstates future rises",
                      "growth may slow near a ceiling and one year already decreased, so the mean is not a reliable forecast"]),
      ],
      tools=["graph", "rich_text", "math"], requirement="graph",
      guidance="Plot the six points in the workspace and join them, then read the trend before answering (d).",
      explanation="12 → 35 is +23 points. The 2020→2021 change was a 1-point fall. The mean yearly increase over five "
                  "intervals is 4.6 points, but extrapolating is unsound: growth is uneven and may saturate.",
      next_time="An average rate of change smooths over the actual path; before extrapolating, check for reversals and ceilings.",
      marking="(a) 1 mark. (b) 1 mark. (c) 2 marks: 1 for the number of intervals, 1 for 4.6. (d) 3 marks: 1 for "
              "noting the fall, 1 for a ceiling argument, 1 for the conclusion about prediction."),
    Q(45, "classification of data", "hard", "B",
      "A researcher collects two data sets about the same 50 students.\n\nSet P: the score on a 100-mark test.\n"
      "Set Q: the time taken to complete the test, in minutes.\n\nThe researcher writes: 'Both data sets are "
      "quantitative, so both should be shown in a histogram with the same class widths.'\n\n(a) Explain what is "
      "correct in the statement.\n(b) Explain what is incorrect in the statement.\n(c) State the class width "
      "measured in marks that would be unsuitable for the time data, and explain why.",
      "Both sets are quantitative (numerical), so a histogram can represent either — that part is correct. The "
      "error is requiring the SAME class widths: classes must suit the range and the units of each variable. A "
      "class width of 10 marks is sensible for 0–100 marks but crude for times of, say, 20–70 minutes, where a "
      "5-minute or 2-minute width gives far more information.",
      parts=[
          P("a", "(a)", "Explain what is correct in the researcher's statement.", "text", 1,
            ["Are both variables numerical?",
             "Can numerical data be grouped into classes?"], strand="B(i)",
            accepted=["both variables are quantitative, so a histogram is a suitable representation for each"]),
          P("b", "(b)", "Explain what is incorrect in the statement.", "text", 2,
            ["Do marks and minutes have the same range?",
             "Should the class width depend on the variable?"], strand="B(ii)",
            accepted=["the class widths must suit each variable's range and units; using the same widths for both misrepresents the time data",
                      "each data set needs its own class width chosen from its own spread"]),
          P("c", "(c)", "State a class width in marks that would be unsuitable for the time data, and explain why.", "text", 3,
            ["A width of 10 is reasonable for marks out of 100.",
             "How many classes would that leave for a time range of about 50 minutes?"], strand="B(iii)",
            accepted=["10 marks: for a time range of about 50 minutes it would create only about five classes, losing detail that a 5-minute width would show",
                      "a width of 10 is too coarse for times, since it would hide variation within each ten-minute band"]),
      ],
      tools=["statistics", "rich_text", "math"], requirement="statistics",
      chart="histogram",
      guidance="You may build both histograms in the workspace to see the effect of the class width.",
      explanation="Both variables are quantitative, so histograms are appropriate. But class widths must be chosen "
                  "per variable: 10 marks suits a 0–100 range, while 10 minutes is too coarse for a typically "
                  "20–70 minute range, where 5-minute classes reveal the shape.",
      next_time="Choose class widths from the range and the unit of the variable, not from a template.",
      marking="(a) 1 mark. (b) 2 marks: 1 for 'widths must suit the data', 1 for the consequence. (c) 3 marks: 1 for "
              "naming a width, 1 for the range argument, 1 for the information lost."),
]
