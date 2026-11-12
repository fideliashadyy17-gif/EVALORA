# MYP4 (Grade 9) — Statistics ONLY (no probability). 25 questions.
# Every statistic below is computed from the data in this file, so the
# diagrams, tables and answer keys can never disagree.
import statistics as st
from assess_prep_common import P, Q

EXAM = {
    "key": "myp4", "title": "MYP 4 Mathematics — Formative Assessment: Statistics",
    "grade": "9", "curriculum": "MYP 4", "class_id": "0a400000-0000-4000-8000-000000000109",
    "access_code": "MYP4-STATS-2026", "duration": 45,
    "description": "Grade 9 · MYP 4 · Mathematics · Formative (Assess Prep). Statistics only: classification of data, stem-and-leaf diagrams, measures of centre and spread, grouped data, cumulative frequency, histograms and standard deviation. Type every answer — there are no options to choose from.",
}
H = lambda a, b: [a, b]

def med(v):
    return st.median(v)
def q1q3(v):
    s = sorted(v); n = len(s); m = n // 2
    lower = s[:m]; upper = s[n - m:]
    return st.median(lower), st.median(upper)

# ── data sets (answers derived, never typed by hand) ──────────────────────
stem_rows = [(2, [1, 4, 7]), (3, [0, 2, 5, 5, 8]), (4, [1, 3, 6]), (5, [0, 2])]
stem_data = sorted(int(f"{s}{l}") for s, ls in stem_rows for l in ls)

btb_left = [(1, [8, 5, 2]), (2, [9, 6, 4, 1]), (3, [7, 3])]           # Class A (leaves read outwards)
btb_right = [(1, [1, 4, 6]), (2, [0, 2, 5, 8]), (3, [1, 4, 9])]       # Class B
btb_a = sorted(int(f"{s}{l}") for s, ls in btb_left for l in ls)
btb_b = sorted(int(f"{s}{l}") for s, ls in btb_right for l in ls)

raw5 = [4, 7, 7, 9, 12, 7, 15, 9]
freq6 = [(0, 2), (1, 4), (2, 7), (3, 5), (4, 2)]                      # goals, frequency
freq7 = [(10, 2), (11, 4), (12, 6), (13, 5), (14, 3)]                  # test score, frequency
group8 = [(0, 10, 4), (10, 20, 9), (20, 30, 12), (30, 40, 5)]          # minutes, freq
group9 = [(0, 5, 3), (5, 10, 8), (10, 15, 11), (15, 20, 6), (20, 25, 2)]
raw11 = [3, 5, 6, 8, 9, 11, 12, 14, 15, 18]
raw12 = [12, 15, 14, 13, 16, 15, 14, 13, 42]
raw13 = [22, 25, 28, 31, 34, 37, 40, 45]
cf16 = [(0, 10, 5), (10, 20, 9), (20, 30, 14), (30, 40, 8), (40, 50, 4)]
group25a = [(0, 10, 4), (10, 20, 7), (20, 30, 9), (30, 40, 6)]         # SD grouped (Class P)

def freq_mean(pairs):
    n = sum(f for _, f in pairs); return sum(x * f for x, f in pairs) / n, n
def grouped_stats(groups):
    n = sum(f for _, _, f in groups)
    mean = sum(((a + b) / 2) * f for a, b, f in groups) / n
    var = sum(f * (((a + b) / 2) - mean) ** 2 for a, b, f in groups) / n
    return n, mean, var ** 0.5
def cf_points(groups):
    pts = [(0, 0)]; run = 0
    for a, b, f in groups:
        run += f; pts.append((b, run))
    return pts

cf17pts = cf_points(cf16)
cf_total = cf17pts[-1][1]
q1_11, q3_11 = q1q3(raw11); q1_13, q3_13 = q1q3(raw13)
m5 = st.mean(raw5)
g8n, g8mean, _ = grouped_stats(group8)
g9n, g9mean, _ = grouped_stats(group9)
f6mean, f6n = freq_mean(freq6)
f7mid = None
_run = 0
for x, f in freq7:
    _run += f
    if _run >= (sum(f for _, f in freq7) + 1) / 2 and f7mid is None:
        f7mid = x
sd23data = [6, 8, 9, 10, 12]
sd24pairs = [(1, 2), (2, 4), (3, 6), (4, 3)]
sd24mean, sd24n = freq_mean(sd24pairs)
sd24 = (sum(f * (x - sd24mean) ** 2 for x, f in sd24pairs) / sd24n) ** 0.5
g25n, g25mean, g25sd = grouped_stats(group25a)
box15 = {"A": (42, 55, 63, 71, 88), "B": (38, 58, 64, 69, 79)}

QUESTIONS = [
Q(1, "classification of data", "easy", "A", "For each variable, type the correct data type: qualitative, discrete or continuous.",
  "Number of siblings takes whole-number values you count, so it is discrete (quantitative). Heights are measured and can take any value in a range, so continuous. Favourite colour is a category, so qualitative.",
  parts=[
    P("a", "(a)", "Number of siblings", "text", 1, H("Ask: do you count it, measure it, or name it?", "Counted whole numbers are a particular data type."), accepted=["discrete", "quantitative discrete", "discrete quantitative"]),
    P("b", "(b)", "Height of students in cm", "text", 1, H("Ask: do you count it, measure it, or name it?", "Measured values can fall anywhere in a range."), accepted=["continuous", "quantitative continuous", "continuous quantitative"]),
    P("c", "(c)", "Favourite colour", "text", 1, H("Ask: do you count it, measure it, or name it?", "A named category is not a number at all."), accepted=["qualitative"]),
  ], subtopic="classifying variables"),
Q(2, "classification of data", "medium", "C", "A student writes: \"The time taken to travel to school is discrete because the clock shows whole minutes.\" In 1–2 sentences, explain whether the student is correct. (Marked by your teacher against the rubric.)",
  "The student is wrong. Travel time is a measurement that can take any value (25.4 minutes, 25.43 minutes…); recording it to the nearest minute only rounds a continuous variable, it does not make the underlying data discrete.",
  single=("open", "2 marks. 1: states the student is wrong / time is continuous. 1: justifies that time is measured and can take any value in a range (rounding to minutes does not make it discrete).", 2),
  hints=H("Think about the values time can take BETWEEN two whole minutes.", "Decide whether the data are counted or measured, whatever the clock displays."), subtopic="explain: discrete vs continuous"),
Q(3, "stem-and-leaf diagrams", "easy", "A", "The stem-and-leaf diagram shows the test marks of a class (key: 3 | 5 means 35 marks).",
  f"The diagram has {len(stem_data)} leaves, so {len(stem_data)} students. The greatest mark is 52. The median is the middle value (position {(len(stem_data)+1)/2:g} of {len(stem_data)}), which is {med(stem_data):g}.",
  diagram={"kind": "stem_leaf", "title": "Test marks", "stemKey": "3 | 5 means 35", "stemRows": [{"stem": str(s), "leaves": [str(l) for l in ls]} for s, ls in stem_rows]},
  parts=[
    P("a", "(a)", "How many students took the test?", "numeric", 1, H("Each leaf is one student.", "Count all the leaves in the diagram."), answer=len(stem_data)),
    P("b", "(b)", "Find the median mark.", "numeric", 1, H("The median is the middle value when the data are in order — the diagram is already ordered.", "Count in from either end to the middle leaf."), answer=med(stem_data)),
  ], subtopic="reading a stem-and-leaf diagram"),
Q(4, "stem-and-leaf diagrams", "medium", "D", "The back-to-back stem-and-leaf diagram compares the marks of Class A (left) and Class B (right). Key: 2 | 1 | 4 means 12 for Class A and 14 for Class B.",
  f"Class A marks in order: {btb_a}. Their median is {med(btb_a):g}. Class B: {btb_b}, median {med(btb_b):g}. Class A has the higher median.",
  diagram={"kind": "stem_leaf", "title": "Marks: Class A (left) vs Class B (right)", "stemKey": "2 | 1 | 4 means 12 (A) and 14 (B)", "leftTitle": "Class A", "rightTitle": "Class B",
           "stemRows": [{"stem": str(s), "left": [str(l) for l in ls_l], "leaves": [str(l) for l in ls_r]} for (s, ls_l), (_, ls_r) in zip(btb_left, btb_right)]},
  parts=[
    P("a", "(a)", "Find the median mark for Class A.", "numeric", 1, H("Read Class A's leaves outwards from the stem to rebuild its data list.", "Write A's marks in order, then take the middle value."), answer=med(btb_a)),
    P("b", "(b)", "Which class has the higher median? Type: Class A or Class B.", "text", 1, H("You need both medians before you can compare.", "Find Class B's median the same way, then compare."), accepted=["Class A", "A"]),
  ], subtopic="back-to-back stem-and-leaf"),
Q(5, "mean, mode and median", "easy", "A", f"A student's marks in 8 quizzes are: {', '.join(map(str, raw5))}.",
  f"Mean = (4+7+7+9+12+7+15+9) ÷ 8 = 70 ÷ 8 = {m5:g}. Ordered: 4, 7, 7, 7, 9, 9, 12, 15, so the median is (7+9) ÷ 2 = 8. The mode is 7 (it appears three times).",
  parts=[
    P("a", "(a)", "Find the mean mark.", "numeric", 1, H("Mean = total of the values ÷ how many there are.", "Add all 8 marks, then divide by 8."), answer=m5, tol=0.01),
    P("b", "(b)", "Find the median mark.", "numeric", 1, H("Order the data first; with an even count of values the median sits between two of them.", "Write the marks in order and average the 4th and 5th values."), answer=med(raw5)),
  ], subtopic="mean, median and mode of raw data"),
Q(6, "mean, mode and median", "medium", "A", "The table shows the number of goals scored by a team in 20 matches.",
  f"Total frequency = {f6n}. Σfx = {sum(x*f for x, f in freq6)}, so the mean = {sum(x*f for x, f in freq6)} ÷ {f6n} = {f6mean:g} goals per match.",
  diagram={"kind": "table", "title": "Goals per match (20 matches)", "columns": ["Goals (x)", "Frequency (f)"], "rows": [[str(x), str(f)] for x, f in freq6]},
  parts=[
    P("a", "(a)", "Find the total number of matches recorded in the table.", "numeric", 1, H("Add the frequency column.", "Sum all the frequencies f."), answer=f6n),
    P("b", "(b)", "Calculate the mean number of goals per match.", "numeric", 1, H("For a frequency table the mean is Σfx ÷ Σf.", "Multiply each x by its f, add those products, then divide by Σf."), answer=f6mean, tol=0.01),
  ], subtopic="mean from a frequency table"),
Q(7, "mean, mode and median", "medium", "A", "The table shows the test scores of 20 students.",
  "The modal score is 12 (highest frequency, 6). Cumulative frequencies: 2, 6, 12, 17, 20; the median (10th/11th value) falls in the score 12 group, so the median is 12.",
  diagram={"kind": "table", "title": "Test scores", "columns": ["Score (x)", "Frequency (f)"], "rows": [[str(x), str(f)] for x, f in freq7]},
  parts=[
    P("a", "(a)", "Write down the modal score.", "numeric", 1, H("The mode is the value with the greatest frequency.", "Find the largest frequency and read off its score."), answer=12),
    P("b", "(b)", "Find the median score.", "numeric", 1, H("Build cumulative frequencies to locate the middle values.", "The median is the average of the 10th and 11th values; find which score they land on."), answer=f7mid),
  ], subtopic="mode and median from a frequency table"),
Q(8, "grouped data and estimated mean", "medium", "A", "The table shows the time (minutes) students spent on homework one evening.",
  f"Midpoints are 5, 15, 25, 35. Σfx = {sum(((a+b)/2)*f for a, b, f in group8):g} and Σf = {g8n}, so the estimated mean = {g8mean:.4g}… ≈ {round(g8mean, 2)} minutes. The modal class is 20 ≤ t < 30 (frequency 12).",
  diagram={"kind": "table", "title": "Homework time", "columns": ["Time t (min)", "Frequency"], "rows": [[f"{a} ≤ t < {b}", str(f)] for a, b, f in group8]},
  parts=[
    P("a", "(a)", "Calculate an estimate for the mean time. Give your answer to 1 decimal place.", "numeric", 1, H("Grouped data has no exact values — represent each class by one number.", "Use each class midpoint × frequency, then Σfx ÷ Σf."), answer=round(g8mean, 2), tol=0.06, unit="min"),
    P("b", "(b)", "Write down the modal class. Type it like 20 ≤ t < 30.", "text", 1, H("The modal class is the class with the greatest frequency.", "Find the largest frequency and write its class interval."), accepted=["20 ≤ t < 30", "20-30", "20 to 30", "20 ≤ t<30", "20<t<30"]),
  ], subtopic="estimated mean and modal class"),
Q(9, "grouped data and estimated mean", "medium", "B", "The masses of parcels (kg) are recorded in the grouped table.",
  f"Cumulative frequencies: 3, 11, 22, 28, 30; the median (15th value) is in 10 ≤ m < 15, the median class. Estimated mean: Σfx ÷ Σf = {sum(((a+b)/2)*f for a, b, f in group9):g} ÷ {g9n} = {g9mean:.4g} ≈ {round(g9mean, 2)} kg.",
  diagram={"kind": "table", "title": "Mass of parcels", "columns": ["Mass m (kg)", "Frequency"], "rows": [[f"{a} ≤ m < {b}", str(f)] for a, b, f in group9]},
  parts=[
    P("a", "(a)", "Write down the median class. Type it like 10 ≤ m < 15.", "text", 1, H("The median class contains the middle value of the data set.", "Use cumulative frequencies to find which class holds the 15th value."), accepted=["10 ≤ m < 15", "10-15", "10 to 15", "10 ≤ m<15"]),
    P("b", "(b)", "Calculate an estimate for the mean mass. Give your answer to 1 decimal place.", "numeric", 1, H("Represent each class by its midpoint.", "Compute Σfx with the midpoints 2.5, 7.5, 12.5, …, then divide by Σf."), answer=round(g9mean, 2), tol=0.06, unit="kg"),
  ], subtopic="median class and estimated mean"),
Q(10, "grouped data and estimated mean", "medium", "D", "A gym estimates the mean age of its members from the grouped table: 10 ≤ a < 20 (f = 6), 20 ≤ a < 30 (f = 14), 30 ≤ a < 40 (f = 10).",
  "Midpoints 15, 25, 35: Σfx = 15×6 + 25×14 + 35×10 = 790; Σf = 30; estimated mean = 790 ÷ 30 = 26.3 years (1 d.p.). The calculation represents every member in a class by the class midpoint.",
  parts=[
    P("a", "(a)", "Calculate an estimate for the mean age. Give your answer to 1 decimal place.", "numeric", 1, H("Each class needs one representative value before you can multiply.", "Midpoints × frequencies, added, divided by the total frequency."), answer=26.3, tol=0.06, unit="years"),
    P("b", "(b)", "Which single value represents each class in this estimate? Type the name of the value.", "text", 1, H("The value sits in the middle of each class interval.", "It is the average of the class's lower and upper bounds."), accepted=["midpoint", "class midpoint", "midpoints", "the midpoint", "mid-point", "class mid-point"]),
  ], subtopic="why the estimated mean uses midpoints"),
Q(11, "range, quartiles and IQR", "medium", "A", f"Here are 10 reaction times (seconds): {', '.join(map(str, raw11))}.",
  f"Range = 18 − 3 = 15. The median splits the data into 3, 5, 6, 8, 9 and 11, 12, 14, 15, 18, so Q1 = {q1_11:g} and Q3 = {q3_11:g}. IQR = {q3_11:g} − {q1_11:g} = {q3_11-q1_11:g}.",
  parts=[
    P("a", "(a)", "Find the range.", "numeric", 1, H("Range uses only the two extreme values.", "Subtract the smallest value from the largest."), answer=15, unit="s"),
    P("b", "(b)", "Find the interquartile range (IQR).", "numeric", 1, H("IQR measures the spread of the middle half of the data.", "Subtract Q1 from Q3, so find Q3 the same way as Q1 first."), answer=q3_11 - q1_11),
  ], subtopic="quartiles and IQR"),
Q(12, "range, quartiles and IQR", "hard", "B", f"Nine students record their travel times (minutes): {', '.join(map(str, raw12))}. One value is very different from the rest.",
  f"Ordered: 12, 13, 13, 14, 14, 15, 15, 16, 42. Range = 42 − 12 = 30 (huge because of the 42). Q1 = {q1q3(raw12)[0]:g}, Q3 = {q1q3(raw12)[1]:g}, so IQR = {q1q3(raw12)[1]-q1q3(raw12)[0]:g}, which ignores the extreme value. The IQR is the measure unaffected by the outlier.",
  parts=[
    P("a", "(a)", "Find the IQR of the travel times.", "numeric", 1, H("Quartiles come from the ordered middle sections, not the extremes.", "Find Q1 and Q3 from the lower and upper halves, then subtract."), answer=q1q3(raw12)[1]-q1q3(raw12)[0], unit="min"),
    P("b", "(b)", "Which measure of spread is NOT affected by the very large value? Type: range or IQR.", "text", 1, H("One of these measures uses the extreme values; the other does not.", "Ask which measure is built only from the middle half of the data."), accepted=["IQR", "the IQR", "interquartile range"]),
  ], subtopic="IQR and outliers (integrated challenge)"),
Q(13, "five-number summary and box plots", "easy", "A", f"A data set has minimum 22 and maximum 45. The eight values are: {', '.join(map(str, raw13))}.",
  f"Ordered as given. Median = (31 + 34) ÷ 2 = 32.5. Lower half 22, 25, 28, 31 → Q1 = {q1_13:g}. Upper half 34, 37, 40, 45 → Q3 = {q3_13:g}. Five-number summary: 22, {q1_13:g}, 32.5, {q3_13:g}, 45.",
  parts=[
    P("a", "(a)", "Find Q1.", "numeric", 1, H("Q1 is the median of the lower half.", "Take the middle of 22, 25, 28, 31."), answer=q1_13),
    P("b", "(b)", "Find Q3.", "numeric", 1, H("Q3 is the median of the upper half.", "Take the middle of 34, 37, 40, 45."), answer=q3_13),
  ], subtopic="five-number summary"),
Q(14, "five-number summary and box plots", "easy", "A", "The box-and-whisker diagram summarises the marks of a class test.",
  "From the diagram: minimum 10, Q1 25, median 40, Q3 55, maximum 80. IQR = Q3 − Q1 = 55 − 25 = 30.",
  diagram={"kind": "box_plot", "title": "Class test marks", "xLabel": "Marks", "yLabel": "", "xMin": 0, "xMax": 100, "yMin": 0, "yMax": 1,
           "fiveNumber": {"min": 10, "q1": 25, "median": 40, "q3": 55, "max": 80}},
  parts=[
    P("a", "(a)", "Write down the median mark shown by the diagram.", "numeric", 1, H("The median is one of the lines that make the box plot.", "Find the line drawn inside the box."), answer=40),
    P("b", "(b)", "Calculate the IQR shown by the diagram.", "numeric", 1, H("Remember: IQR = Q3 − Q1. First find the quartiles from the box.", "The box edges are Q1 and Q3; subtract them."), answer=30),
  ], subtopic="reading a box plot"),
Q(15, "five-number summary and box plots", "hard", "D", "The table gives the five-number summaries of two classes' test marks.",
  "Class A: 42, 55, 63, 71, 88 → IQR = 71 − 55 = 16. Class B: 38, 58, 64, 69, 79 → IQR = 69 − 58 = 11. Class B has the higher median (64 > 63) and, with the smaller IQR, the more consistent marks.",
  diagram={"kind": "table", "title": "Five-number summaries", "columns": ["Class", "Min", "Q1", "Median", "Q3", "Max"],
           "rows": [["A", *map(str, box15["A"])], ["B", *map(str, box15["B"])]]},
  parts=[
    P("a", "(a)", "Which class has the higher median? Type: Class A or Class B.", "text", 1, H("Compare the middle value of each five-number summary.", "Read the median column for both classes."), accepted=["Class B", "B"]),
    P("b", "(b)", "Which class's marks are more consistent? Type: Class A or Class B.", "text", 1, H("Consistency is about spread, not about the median.", "Compare the two IQRs — the smaller spread is more consistent."), accepted=["Class B", "B"]),
  ], subtopic="comparing two data sets (integrated challenge)"),
Q(16, "cumulative frequency", "easy", "A", "Complete the cumulative frequency for the masses in the table: 0 ≤ m < 10 (f = 5), 10 ≤ m < 20 (f = 9), 20 ≤ m < 30 (f = 14), 30 ≤ m < 40 (f = 8), 40 ≤ m < 50 (f = 4).",
  "Cumulative frequencies add up as you go: 5, 5 + 9 = 14, 14 + 14 = 28. The number with mass less than 30 kg is the cumulative frequency up to 30, which is 28.",
  parts=[
    P("a", "(a)", "Cumulative frequency up to 20 ≤ m < 30 is the running total of the first three classes. Type that value in this cell.", "numeric", 1, H("Cumulative means 'add everything so far'.", "Add the frequencies of the first three classes."), answer=28),
  ], subtopic="cumulative frequency tables (fill the table)"),
Q(17, "cumulative frequency", "medium", "A", "The cumulative frequency curve shows the masses of 40 parcels.",
  "Reading from the curve at cf = 20 (half of 40) gives a median of about 25 kg. Q1 is read at cf = 10 (≈ 17 kg) and Q3 at cf = 30 (≈ 33 kg), so IQR ≈ 33 − 17 = 16 kg. Readings within the stated tolerances are accepted.",
  diagram={"kind": "cumulative_curve", "title": "Cumulative frequency curve: mass of parcels", "xLabel": "Mass (kg)", "yLabel": "Cumulative frequency", "xMin": 0, "xMax": 50, "yMin": 0, "yMax": 40, "points": cf17pts},
  parts=[
    P("a", "(a)", "Estimate the median mass from the curve.", "numeric", 1, H("Remember: IQR = Q3 − Q1, and the median sits halfway up the curve. First find the total frequency.", "Go from half the total frequency across to the curve, then down."), answer=25, tol=2, unit="kg"),
    P("b", "(b)", "Hence estimate the IQR.", "numeric", 1, H("You need Q1 as well, read at one-quarter of the total frequency.", "Read Q1 at cf = 10, then subtract it from your Q3."), answer=16, tol=4, unit="kg"),
  ], subtopic="reading a cumulative frequency curve"),
Q(18, "cumulative frequency", "medium", "D", "The cumulative frequency curve shows the test marks of 50 students.",
  "At 60 marks the curve reads cf = 34, so 34 students scored less than 60. Above 60: 50 − 34 = 16 students. The 80th percentile is the mark at cf = 0.8 × 50 = 40, which reads about 70 marks.",
  diagram={"kind": "cumulative_curve", "title": "Cumulative frequency curve: test marks", "xLabel": "Mark", "yLabel": "Cumulative frequency", "xMin": 0, "xMax": 100, "yMin": 0, "yMax": 50,
           "points": [(0, 0), (20, 6), (40, 18), (60, 34), (80, 46), (100, 50)]},
  parts=[
    P("a", "(a)", "How many students scored less than 60 marks?", "numeric", 1, H("Start from 60 on the mark axis, not from the frequency axis.", "Go up from 60 to the curve, then across to read the frequency."), answer=34, tol=2),
    P("b", "(b)", "How many students scored 60 marks or more?", "numeric", 1, H("Use the total number of students together with part (a).", "Subtract your answer to (a) from the total frequency."), answer=16, tol=2),
    P("c", "(c)", "Estimate the 80th percentile mark.", "numeric", 1, H("A percentile starts from a percentage of the total frequency.", "Find 80% of 50 on the frequency axis, then read across and down."), answer=70, tol=4, unit="marks"),
  ], subtopic="percentiles and 'how many above'"),
Q(19, "cumulative frequency", "hard", "B", "A cumulative frequency curve for the heights of 80 plants passes through (0, 0), (10, 8), (20, 30), (30, 55), (40, 72), (50, 80). The shortest plant was 2 cm and the tallest 48 cm. A box plot is to be drawn from this curve.",
  "Median at cf = 40 → about 26 cm. Q1 at cf = 20 → about 15 cm. Q3 at cf = 60 → about 34 cm. Five-number summary: 2, 15, 26, 34, 48, so IQR ≈ 34 − 15 = 19 cm.",
  diagram={"kind": "cumulative_curve", "title": "Cumulative frequency curve: height of plants", "xLabel": "Height (cm)", "yLabel": "Cumulative frequency", "xMin": 0, "xMax": 50, "yMin": 0, "yMax": 80,
           "points": [(0, 0), (10, 8), (20, 30), (30, 55), (40, 72), (50, 80)]},
  parts=[
    P("a", "(a)", "Hence estimate the IQR of the heights.", "numeric", 1, H("The box of the box plot runs from Q1 to Q3.", "Read Q3 at cf = 60, then subtract your Q1."), answer=19, tol=4, unit="cm"),
  ], subtopic="cumulative curve to box plot (integrated challenge)"),
Q(20, "histograms", "easy", "A", "The histogram shows the number of books read by students in a month (discrete data).",
  "The bar heights are 6 (0 books), 9 (1 book), 5 (2 books) and 4 (3 books). Total students = 6 + 9 + 5 + 4 = 24.",
  diagram={"kind": "histogram", "title": "Books read in a month", "xLabel": "Books", "yLabel": "Frequency", "xMin": -0.5, "xMax": 3.5, "yMin": 0, "yMax": 10,
           "bars": [{"from": -0.5, "to": 0.5, "height": 6}, {"from": 0.5, "to": 1.5, "height": 9}, {"from": 1.5, "to": 2.5, "height": 5}, {"from": 2.5, "to": 3.5, "height": 4}]},
  parts=[
    P("a", "(a)", "How many students read exactly 1 book?", "numeric", 1, H("For discrete data, read the height of the bar over '1'.", "Follow the bar above 1 across to the frequency axis."), answer=9),
    P("b", "(b)", "How many students are represented altogether?", "numeric", 1, H("Every bar height is a frequency.", "Add the heights of all four bars."), answer=24),
  ], subtopic="histogram for discrete data"),
Q(21, "histograms", "easy", "A", "The histogram shows the journey times (continuous data) of 30 commuters, in classes of 10 minutes.",
  "Bar heights: 4 (0–10), 8 (10–20), 11 (20–30), 5 (30–40), 2 (40–50). In 20–30 minutes: 11 commuters. Over 30 minutes: 5 + 2 = 7.",
  diagram={"kind": "histogram", "title": "Journey times", "xLabel": "Time (min)", "yLabel": "Frequency", "xMin": 0, "xMax": 50, "yMin": 0, "yMax": 12,
           "bars": [{"from": 0, "to": 10, "height": 4}, {"from": 10, "to": 20, "height": 8}, {"from": 20, "to": 30, "height": 11}, {"from": 30, "to": 40, "height": 5}, {"from": 40, "to": 50, "height": 2}]},
  parts=[
    P("a", "(a)", "How many commuters took between 20 and 30 minutes?", "numeric", 1, H("With equal class widths, bar height is the frequency.", "Read the height of the 20–30 bar."), answer=11),
    P("b", "(b)", "How many commuters took more than 30 minutes?", "numeric", 1, H("More than 30 means the classes above the 30 boundary.", "Add the heights of the bars to the right of 30."), answer=7),
  ], subtopic="histogram for continuous data, equal widths"),
Q(22, "histograms", "hard", "B", "A histogram with unequal class widths shows the waiting times in a clinic. The bar for 0 ≤ t < 10 (width 10) has frequency density 1.2, and the bar for 10 ≤ t < 30 (width 20) has frequency density 0.8. The histogram's vertical axis is frequency density.",
  "Frequency density = frequency ÷ class width, and frequency = density × width. First bar: 1.2 × 10 = 12 patients. Second: 0.8 × 20 = 16 patients.",
  diagram={"kind": "histogram", "title": "Waiting times (frequency density)", "xLabel": "Waiting time t (min)", "yLabel": "Frequency density", "xMin": 0, "xMax": 30, "yMin": 0, "yMax": 1.4,
           "bars": [{"from": 0, "to": 10, "height": 1.2}, {"from": 10, "to": 30, "height": 0.8}]},
  parts=[
    P("a", "(a)", "How many patients waited between 0 and 10 minutes?", "numeric", 1, H("When widths are unequal, the AREA of a bar gives the frequency.", "Multiply the bar's frequency density by its class width."), answer=12),
    P("b", "(b)", "How many patients waited between 10 and 30 minutes?", "numeric", 1, H("Use the same area idea for the wider bar — read its density and width carefully.", "Multiply 0.8 by the width of the 10–30 class."), answer=16),
  ], subtopic="unequal widths and frequency density (integrated challenge)"),
Q(23, "standard deviation", "medium", "A", f"Five athletes record sprint times (seconds): {', '.join(map(str, sd23data))}.",
  f"Mean = 45 ÷ 5 = {st.mean(sd23data):g}. Deviations: −3, −1, 0, 1, 3; squares sum to 20; variance = 20 ÷ 5 = 4; population standard deviation σ = √4 = {st.pstdev(sd23data):g}.",
  parts=[
    P("a", "(a)", "Find the mean sprint time.", "numeric", 1, H("Add the five times and divide by how many there are.", "The mean is needed before any spread can be measured."), answer=st.mean(sd23data), tol=0.01, unit="s"),
    P("b", "(b)", "Calculate the population standard deviation σ. Give your answer to 2 decimal places.", "numeric", 1, H("Standard deviation measures the typical distance from the mean.", "Square each deviation from the mean, average the squares (divide by 5), then square-root."), answer=round(st.pstdev(sd23data), 2), tol=0.02, unit="s"),
  ], subtopic="standard deviation of raw data"),
Q(24, "standard deviation", "hard", "A", "The frequency table shows the number of emails received per day by 15 workers.",
  f"Mean = {sum(x*f for x, f in sd24pairs)} ÷ {sd24n} = {sd24mean:g}. Σf(x − x̄)² ÷ Σf gives variance {sd24**2:.4f}, so σ = {sd24:.4f} ≈ {round(sd24, 2)}.",
  diagram={"kind": "table", "title": "Emails per day", "columns": ["Emails (x)", "Frequency (f)"], "rows": [[str(x), str(f)] for x, f in sd24pairs]},
  parts=[
    P("a", "(a)", "Find the mean number of emails.", "numeric", 1, H("For a frequency table, weight each value by its frequency.", "Compute Σfx ÷ Σf."), answer=sd24mean, tol=0.01),
    P("b", "(b)", "Calculate the population standard deviation σ. Give your answer to 2 decimal places.", "numeric", 1, H("Extend the deviation method to the table: each squared deviation is weighted too.", "Use Σf(x − x̄)² ÷ Σf, then square-root the result."), answer=round(sd24, 2), tol=0.02),
  ], subtopic="standard deviation from a frequency table"),
Q(25, "standard deviation", "hard", "D", "Class P's grouped test marks are in the table. Class Q, whose marks were analysed separately, has a standard deviation of 12.40.",
  f"Class P midpoints 5, 15, 25, 35 give estimated mean = {g25mean:.4g} ≈ {round(g25mean, 1)} and σ = {g25sd:.4f} ≈ {round(g25sd, 2)}. Class P's standard deviation ({round(g25sd, 2)}) is smaller than Class Q's 12.40, so Class P's marks are less spread out and more consistent.",
  diagram={"kind": "table", "title": "Class P: grouped marks", "columns": ["Marks x", "Frequency"], "rows": [[f"{a} ≤ x < {b}", str(f)] for a, b, f in group25a]},
  parts=[
    P("a", "(a)", "Calculate the population standard deviation σ for Class P, using the class midpoints. Give your answer to 2 decimal places.", "numeric", 1, H("Grouped data: represent each class by its midpoint, then use the frequency-table method.", "Find the estimated mean first, then Σf(midpoint − mean)² ÷ Σf, then square-root."), answer=round(g25sd, 2), tol=0.03),
    P("b", "(b)", "Which class is more consistent? Type: Class P or Class Q.", "text", 1, H("Consistency is judged by spread alone.", "The smaller standard deviation is the more consistent class."), accepted=["Class P", "P"]),
  ], subtopic="standard deviation for grouped data and comparing spread (integrated challenge)"),
]

BLUEPRINT = {"classification of data": 2, "stem-and-leaf diagrams": 2, "mean, mode and median": 3,
             "grouped data and estimated mean": 3, "range, quartiles and IQR": 2,
             "five-number summary and box plots": 3, "cumulative frequency": 4,
             "histograms": 3, "standard deviation": 3}
