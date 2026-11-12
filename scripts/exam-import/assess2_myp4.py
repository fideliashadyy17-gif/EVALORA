# MYP4 (Grade 9) Formative Assessment 2 — Criteria A–D. STATISTICS ONLY.
# Answers are computed from the raw data below with the statistics module,
# so every mean / quartile / SD / frequency density is derived, not typed in.
import statistics as st
from assess2_common import P, Q

EXAM = {
    "key": "myp4b", "title": "MYP4 (Grade 9) Formative Assessment 2 - Criteria A-D",
    "grade": "9", "curriculum": "MYP 4", "class_id": "0a400000-0000-4000-8000-000000000109",
    "access_code": "MYP4-FORM2-2026", "duration": 45,
    "description": "Grade 9 · MYP 4 · Mathematics · Formative Assessment 2 (Criteria A–D). Statistics only: classification, stem-and-leaf, averages, grouped data, quartiles and box plots, cumulative frequency, histograms and standard deviation. Every answer is typed; hints are free.",
}
CRIT_SPLIT = {"A": 9, "B": 5, "C": 5, "D": 6}
H = lambda a, b: [a, b]

def q4(sorted_data, p):
    # inclusive-median (Tukey-style halves) quartiles used throughout the paper
    n = len(sorted_data); med = st.median(sorted_data)
    lower = sorted_data[:n // 2]; upper = sorted_data[(n + 1) // 2:]
    return {"min": sorted_data[0], "q1": st.median(lower), "median": med, "q3": st.median(upper), "max": sorted_data[-1]}

# ── raw data sets (answers below are computed from these) ───────────────────
A2 = sorted([21, 24, 25, 28, 31, 34, 35, 38, 42, 47])          # stem-and-leaf ages
A3 = [4, 7, 7, 9, 12, 7, 15, 9]                                  # raw mean/mode/median
A4 = [(0, 3), (1, 5), (2, 8), (3, 4)]                            # freq table (value, freq)
A5 = [(0, 10, 4), (10, 20, 7), (20, 30, 9), (30, 40, 5)]         # grouped (lo, hi, freq)
A6 = sorted([12, 15, 18, 20, 22, 25, 29, 31, 34, 38, 41, 45])    # quartiles / IQR
A7 = sorted([3, 5, 6, 8, 9, 11, 13, 14, 16, 20, 24, 30])         # five-number / box
A8 = [(0, 20, 5), (20, 40, 13), (40, 60, 22), (60, 80, 30), (80, 100, 34)]  # cumulative pts
A9 = [6, 8, 9, 10, 11, 12, 14, 15, 15, 20]                       # population SD
B1 = [10, 14, 18, 22, 26]                                        # +6 investigation
B2 = [5, 8, 11, 14]                                              # ×3 investigation
B3 = [22, 25, 27, 29, 31, 34]                                    # outlier added: 96
B4 = [(0, 5), (1, 9), (2, 6), (3, 2)]                            # freq; every value +2
B5 = [(0, 10, 3), (10, 20, 8), (20, 30, 6), (30, 40, 3)]         # grouped estimate vs midpoint check
C3A = dict(min=42, q1=51, median=58, q3=66, max=78)              # class X box
C3B = dict(min=48, q1=55, median=57, q3=60, max=70)              # class Y box
D1 = sorted([58, 61, 63, 66, 68, 70, 72, 75, 79, 88])            # sprint times (s, lower=faster→ use as marks-like)
D3A = dict(min=12, q1=18, median=24, q3=31, max=44)              # delivery company A (min)
D3B = dict(min=15, q1=21, median=25, q3=29, max=38)              # delivery company B
D5 = [52, 55, 58, 61, 63, 66, 69, 97]                            # test marks with outlier

fA5 = sum(f for _, _, f in A5); estA5 = sum(((a + b) / 2) * f for a, b, f in A5) / fA5
cfA8 = []; run = 0
for lo, hi, f in [(0, 20, 3), (20, 40, 5), (40, 60, 8), (60, 80, 6), (80, 100, 4)]:
    run += f; cfA8.append((hi, run))
sdA9 = round(st.pstdev(A9), 2)
qA6 = q4(A6, 0); qA7 = q4(A7, 0); qD1 = q4(D1, 0)

QUESTIONS = [
# ── Criterion A (9) ─────────────────────────────────────────────────────────
Q(1, "classification of data", "easy", "A", "A(i)",
  "A school records the following variables for its students. Classify one of them: the number of siblings a student has. Type: quantitative discrete, quantitative continuous, or qualitative.",
  "Number of siblings is counted (0, 1, 2, …), so it is quantitative discrete.",
  diagram={"kind": "table", "title": "Variables recorded", "columns": ["Variable", "Type"], "rows": [["Height of student (cm)", "quantitative continuous"], ["Favourite subject", "qualitative"], ["Number of siblings", "?"], ["Time to run 100 m (s)", "quantitative continuous"]]},
  single=("text", ["quantitative discrete", "discrete", "quantitative (discrete)"], 1), hints=H("Can the variable be counted in whole numbers, measured, or is it a category?", "Siblings are counted, not measured — and the data are numbers."), subtopic="classifying data"),
Q(2, "stem-and-leaf diagrams", "easy", "A", "A(i)",
  "The stem-and-leaf diagram shows the ages of members of a chess club. Key: 2 | 4 means 24 years.",
  f"Reading the rows in order gives {', '.join(map(str, A2))}. The median is the mean of the 5th and 6th values = {st.median(A2)}. The range = {A2[-1]} − {A2[0]} = {A2[-1]-A2[0]}.",
  diagram={"kind": "stem_leaf", "title": "Ages of chess club members", "stemKey": "2 | 4 = 24 years", "stemRows": [
      {"stem": "2", "leaves": ["1", "4", "5", "8"]}, {"stem": "3", "leaves": ["1", "4", "5", "8"]}, {"stem": "4", "leaves": ["2", "7"]}]},
  parts=[
    P("a", "(a)", "Write down the median age.", "numeric", 1, H("There are 10 values — the median sits between two of them.", "Order the values from the diagram and average the middle pair."), "A(i)", answer=float(st.median(A2)), unit="years"),
    P("b", "(b)", "Write down the range of the ages.", "numeric", 1, H("Range compares the two extreme values.", "Subtract the smallest leaf value from the largest."), "A(iii)", answer=A2[-1] - A2[0], unit="years"),
  ], subtopic="reading a stem-and-leaf"),
Q(3, "mean, mode and median", "easy", "A", "A(iii)",
  "The numbers of pages read each day by a student in one week and a day are: 4, 7, 7, 9, 12, 7, 15, 9. Calculate the mean, and write down the mode.",
  f"Mean = (4+7+7+9+12+7+15+9) ÷ 8 = {sum(A3)}/{len(A3)} = {st.mean(A3)}. The mode is 7 (it occurs three times).",
  diagram={"kind": "table", "title": "Pages read per day", "columns": ["Day", "1", "2", "3", "4", "5", "6", "7", "8"], "rows": [["Pages", "4", "7", "7", "9", "12", "7", "15", "9"]]},
  parts=[
    P("a", "(a)", "Calculate the mean number of pages.", "numeric", 1, H("Mean = total ÷ how many values there are.", "Add all the pages, then divide by the number of days."), "A(iii)", answer=float(st.mean(A3)), tol=0.01),
    P("b", "(b)", "Write down the mode.", "numeric", 1, H("The mode is the most frequent value.", "Count how often each number appears."), "A(i)", answer=7),
  ], subtopic="mean and mode of raw data"),
Q(4, "mean, mode and median", "medium", "A", "A(iii)",
  "The frequency table shows how many goals a football team scored in each of 20 matches. Calculate the mean number of goals per match.",
  f"Mean = (0×3 + 1×5 + 2×8 + 3×4) ÷ 20 = {sum(v*f for v, f in A4)}/20 = {sum(v*f for v, f in A4)/20}.",
  diagram={"kind": "table", "title": "Goals per match", "columns": ["Goals", "0", "1", "2", "3"], "rows": [["Matches", "3", "5", "8", "4"]]},
  single=("numeric", (sum(v * f for v, f in A4) / sum(f for _, f in A4), 0.01), 1), hints=H("Each value must be weighted by how often it occurred.", "Multiply goals by matches for each column, add, then divide by total matches."), subtopic="mean from a frequency table"),
Q(5, "grouped data", "medium", "A", "A(ii)",
  "The grouped frequency table shows the times (minutes) students spent on homework. Write down the modal class, and estimate the mean time.",
  f"The modal class is 20–30 (highest frequency, 9). Estimated mean = Σ(midpoint × f) ÷ Σf = {sum(((a+b)/2)*f for a, b, f in A5)}/{fA5} ≈ {round(estA5, 2)} minutes.",
  diagram={"kind": "table", "title": "Homework times", "columns": ["Time (min)", "0–10", "10–20", "20–30", "30–40"], "rows": [["Students", "4", "7", "9", "5"]]},
  parts=[
    P("a", "(a)", "Write down the modal class. Type like 20-30.", "text", 1, H("The modal class has the greatest frequency.", "Find the largest frequency in the table and read its class."), "A(i)", accepted=["20-30", "20–30", "20 to 30"]),
    P("b", "(b)", "Estimate the mean time, to 2 decimal places.", "numeric", 1, H("Use the midpoint of each class as its representative value.", "Multiply each midpoint by its frequency, add, and divide by total students."), "A(ii)", answer=round(estA5, 2), tol=0.02, unit="min"),
  ], subtopic="modal class and estimated mean"),
Q(6, "quartiles and IQR", "medium", "A", "A(iii)",
  "For the data set 12, 15, 18, 20, 22, 25, 29, 31, 34, 38, 41, 45, determine the lower quartile, upper quartile and interquartile range.",
  f"Median = {qA6['median']}; lower half median Q1 = {qA6['q1']}; upper half median Q3 = {qA6['q3']}; IQR = {qA6['q3']} − {qA6['q1']} = {qA6['q3']-qA6['q1']}.",
  diagram={"kind": "table", "title": "Data set (ordered)", "columns": ["Position", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"], "rows": [["Value", *map(str, A6)]]},
  parts=[
    P("a", "(a)", "Write down Q1, the lower quartile.", "numeric", 1, H("Q1 is the median of the lower half of the data.", "Split the ordered data at the median and find the middle of the lower half."), "A(iii)", answer=float(qA6["q1"])),
    P("b", "(b)", "Calculate the IQR.", "numeric", 1, H("IQR measures the spread of the middle half of the data.", "Find Q3 as the median of the upper half, then subtract Q1."), "A(iii)", answer=float(qA6["q3"] - qA6["q1"])),
  ], subtopic="quartiles and IQR"),
Q(7, "five-number summary and box plots", "medium", "A", "A(ii)",
  "A box-and-whisker diagram is drawn for the data 3, 5, 6, 8, 9, 11, 13, 14, 16, 20, 24, 30. Write down the five-number summary value that the right-hand end of the box represents, and the median shown by the line inside the box.",
  f"Five-number summary: min {qA7['min']}, Q1 {qA7['q1']}, median {qA7['median']}, Q3 {qA7['q3']}, max {qA7['max']}. The right end of the box is Q3 = {qA7['q3']}; the line inside is the median = {qA7['median']}.",
  diagram={"kind": "box_plot", "title": "Box plot of the data", "xLabel": "Value", "yLabel": "", "fiveNumber": {"min": qA7["min"], "q1": float(qA7["q1"]), "median": float(qA7["median"]), "q3": float(qA7["q3"]), "max": qA7["max"]}},
  parts=[
    P("a", "(a)", "Write down Q3, shown by the right-hand end of the box.", "numeric", 1, H("The box spans the quartiles.", "Read the value where the box ends on the right."), "A(ii)", answer=float(qA7["q3"])),
    P("b", "(b)", "Write down the median shown by the line inside the box.", "numeric", 1, H("One line is drawn inside the box.", "Read the value of the line inside the box."), "A(ii)", answer=float(qA7["median"])),
  ], subtopic="reading a box plot"),
Q(8, "cumulative frequency", "hard", "A", "A(ii)",
  "The cumulative frequency curve shows the marks of 34 students in a test. Use the curve to estimate the median mark and the interquartile range.",
  "Median ≈ value at cumulative frequency 17 ≈ 60. Q1 ≈ value at cf 8.5 ≈ 42; Q3 ≈ value at cf 25.5 ≈ 74; IQR ≈ 32. (Readings within tolerance.)",
  diagram={"kind": "cumulative_curve", "title": "Cumulative frequency curve — test marks", "xLabel": "Mark", "yLabel": "Cumulative frequency", "xMin": 0, "xMax": 100, "yMin": 0, "yMax": 35, "points": [[0, 0], [20, 2], [30, 4], [40, 7], [50, 12], [60, 17], [70, 23], [80, 29], [90, 32], [100, 34]], "joinPoints": True},
  parts=[
    P("a", "(a)", "Estimate the median mark (at cumulative frequency 17, which is half of 34).", "numeric", 1, H("The median is the mark at half of the total frequency.", "Go from 17 on the cumulative axis to the curve, then down."), "A(ii)", answer=60, tol=3),
    P("b", "(b)", "Estimate the IQR (read Q1 at cumulative frequency ≈ 8.5 and Q3 at ≈ 25.5).", "numeric", 1, H("Read two marks from the curve, at the quartile frequencies.", "Find Q1 and Q3 from the curve, then subtract."), "A(ii)", answer=32, tol=6),
  ], subtopic="reading a cumulative curve"),
Q(9, "standard deviation", "hard", "A", "A(iii)",
  "Calculate the population standard deviation of the data set 6, 8, 9, 10, 11, 12, 14, 15, 15, 20. Give your answer to 2 decimal places.",
  f"Mean = {st.mean(A9)}. Population SD = √[Σ(x − mean)² ÷ n] ≈ {sdA9}.",
  diagram={"kind": "table", "title": "Data set", "columns": ["x", "6", "8", "9", "10", "11", "12", "14", "15", "15", "20"], "rows": [["frequency", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1"]]},
  single=("numeric", (sdA9, 0.02), 1), hints=H("Standard deviation measures spread around the mean.", "Find the mean, then the mean of the squared differences, then the square root."), subtopic="population standard deviation", nxt="Square the differences BEFORE averaging them."),

# ── Criterion B (5): mini-investigations ────────────────────────────────────
Q(10, "investigating change in data", "medium", "B", "B(i)",
  "Investigation: a teacher adds 6 bonus marks to every score in the set 10, 14, 18, 22, 26. Investigate what happens to the mean and median.",
  "Original mean = median = 18. After adding 6: 16, 20, 24, 28, 32 → mean = median = 24. Rule: adding a constant k increases the mean and median by exactly k (24 = 18 + 6 ✓).",
  diagram={"kind": "table", "title": "Adding 6 to every value", "columns": ["Original", "10", "14", "18", "22", "26"], "rows": [["New score", "16", "20", "?", "?", "?"]]},
  parts=[
    P("a", "(a)", "Find the mean of the new scores.", "numeric", 0.5, H("Complete the new row first, then average it.", "Add 6 to each value, then find the mean of the new set."), "B(i)", answer=24.0),
    P("b", "(b)", "Find the median of the new scores.", "numeric", 0.5, H("Order is unchanged — locate the middle new value.", "Add 6 to the original middle value, or read the middle of the new row."), "B(i)", answer=24.0),
    P("c", "(c)", "Describe the general rule: when every value in a data set increases by k, what happens to the mean and the median?", "text", 1, H("Compare the new mean/median with the originals (both 18).", "State how the centre changes in terms of k, for any set."), "B(ii)", accepted=["increase by k", "they increase by k", "increase by the same amount"], keywords=[["increase", "go up", "rise"], ["k", "same amount", "by 6"]], min_kw=1),
    P("d", "(d)", "Verify: the original mean was 18. Use your rule to predict the new mean, and type it.", "numeric", 1, H("Apply your rule to the number 18.", "Add k = 6 to the original mean."), "B(iii)", answer=24.0),
  ], subtopic="effect of adding a constant"),
Q(11, "investigating change in data", "hard", "B", "B(i)",
  "Investigation: every value in the set 5, 8, 11, 14 is multiplied by 3 (for example, converting a price to a currency worth three times as much). Investigate the mean and the range.",
  "Original mean = 9.5, range = 9. New set 15, 24, 33, 42: mean = 28.5 = 3 × 9.5; range = 27 = 3 × 9. Rule: multiplying by k multiplies mean AND spread by k. Check mean: 3 × 9.5 = 28.5 ✓.",
  diagram={"kind": "table", "title": "Multiplying every value by 3", "columns": ["Original", "5", "8", "11", "14"], "rows": [["× 3", "15", "24", "?", "?"]]},
  parts=[
    P("a", "(a)", "Find the mean of the new set.", "numeric", 0.5, H("Complete the ×3 row, then average.", "Multiply each value by 3 and find the mean."), "B(i)", answer=28.5, tol=0.01),
    P("b", "(b)", "Find the range of the new set.", "numeric", 0.5, H("Range = largest − smallest of the new values.", "Subtract the smallest new value from the largest."), "B(i)", answer=27),
    P("c", "(c)", "Describe the general rule for the mean and the range when every value is multiplied by k.", "text", 1, H("Compare 28.5 with 9.5, and 27 with 9.", "State the factor linking old and new centre and spread."), "B(ii)", accepted=["both are multiplied by k", "mean and range are multiplied by k", "both multiplied by 3"], keywords=[["multiplied by", "times"], ["mean"], ["range", "spread"]], min_kw=2),
    P("d", "(d)", "Verify: multiply the original mean 9.5 by 3 and type the result.", "numeric", 1, H("Your rule should reproduce the answer to (a).", "Multiply 9.5 by the same factor."), "B(iii)", answer=28.5, tol=0.01),
  ], subtopic="effect of multiplying by a constant"),
Q(12, "investigating change in data", "hard", "B", "B(i)",
  "Investigation: the set 22, 25, 27, 29, 31, 34 (mean 28, median 28) gains one extra value, 96, when a faulty sensor reading is included. Investigate the effect of the outlier.",
  "New mean = (168 + 96) ÷ 7 = 264 ÷ 7 ≈ 37.71. New median (7 values, 4th) = 29. The mean rises by about 9.7 but the median moves by only 1 — the median is resistant to outliers, the mean is not.",
  diagram={"kind": "table", "title": "Adding an outlier", "columns": ["Set", "Values"], "rows": [["Original", "22, 25, 27, 29, 31, 34"], ["With outlier", "22, 25, 27, 29, 31, 34, 96"]]},
  parts=[
    P("a", "(a)", "Calculate the new mean, to 2 decimal places.", "numeric", 0.5, H("The total changes and so does the count.", "Add all seven values and divide by 7."), "B(i)", answer=round((sum(B3) + 96) / 7, 2), tol=0.02),
    P("b", "(b)", "Write down the new median.", "numeric", 0.5, H("With 7 values the median is a single middle value.", "Order the seven values and take the 4th."), "B(i)", answer=29),
    P("c", "(c)", "Describe the pattern: which measure of centre is affected more by an outlier — the mean or the median?", "text", 1, H("Compare how far each measure moved from 28.", "Decide which measure changed most when 96 was added."), "B(ii)", accepted=["the mean", "mean"], keywords=[["mean"]], min_kw=1),
    P("d", "(d)", "Justify your answer to (a): calculate how much the mean increased by, to 1 decimal place.", "numeric", 1, H("Compare the new mean with the original mean of 28.", "Subtract the original mean from your answer to (a)."), "B(iii)", answer=9.7, tol=0.15),
  ], subtopic="effect of an outlier"),
Q(13, "investigating change in data", "medium", "B", "B(i)",
  "Investigation: in the frequency table, every value is increased by 2 (each student reads 2 more books). Investigate the mean.",
  "Original mean = (0×5 + 1×9 + 2×6 + 3×2) ÷ 22 = 27/22 ≈ 1.23. New values 2, 3, 4, 5 with same frequencies: mean = (2×5 + 3×9 + 4×6 + 5×2) ÷ 22 = 71/22 ≈ 3.23 — exactly 2 more. Rule verified: 1.23 + 2 = 3.23 ✓.",
  diagram={"kind": "table", "title": "Books read (original values)", "columns": ["Books", "0", "1", "2", "3"], "rows": [["Students", "5", "9", "6", "2"]]},
  parts=[
    P("a", "(a)", "Calculate the original mean, to 2 decimal places.", "numeric", 0.5, H("Weight each value by its frequency.", "Multiply values by frequencies, add, divide by total students."), "B(i)", answer=round(sum(v * f for v, f in B4) / sum(f for _, f in B4), 2), tol=0.02),
    P("b", "(b)", "Calculate the new mean, to 2 decimal places, when every value increases by 2.", "numeric", 0.5, H("Shift each value up by 2; frequencies stay the same.", "Use values 2, 3, 4, 5 with the same frequencies."), "B(i)", answer=round(sum((v + 2) * f for v, f in B4) / sum(f for _, f in B4), 2), tol=0.02),
    P("c", "(c)", "State the general rule connecting the two means.", "text", 1, H("Compare your two means — what is the difference?", "Describe the change when every value increases by 2."), "B(ii)", accepted=["the mean increases by 2", "mean increases by the same amount", "new mean = old mean + 2"], keywords=[["mean"], ["increase", "adds", "+ 2", "by 2", "same amount"]], min_kw=2),
    P("d", "(d)", "Verify: add 2 to your original mean and type the result (2 d.p.). It should match (b).", "numeric", 1, H("Apply your rule to the answer from (a).", "Add 2 to the original mean."), "B(iii)", answer=round(sum(v * f for v, f in B4) / sum(f for _, f in B4) + 2, 2), tol=0.02),
  ], subtopic="shifting a frequency distribution"),
Q(14, "grouped data", "hard", "B", "B(i)",
  "Investigation: for the grouped table, estimate the mean using midpoints. Then investigate: what happens to the estimate if every midpoint were 5 higher?",
  f"Estimated mean = {round(sum(((a+b)/2)*f for a, b, f in B5)/sum(f for _, _, f in B5), 2)}. If every midpoint rises by 5, every representative value rises by 5, so the estimated mean also rises by exactly 5, to {round(sum(((a+b)/2)*f for a, b, f in B5)/sum(f for _, _, f in B5) + 5, 2)}.",
  diagram={"kind": "table", "title": "Grouped data under investigation", "columns": ["Class", "0–10", "10–20", "20–30", "30–40"], "rows": [["Frequency", "3", "8", "6", "3"]]},
  parts=[
    P("a", "(a)", "Estimate the mean using midpoints, to 2 decimal places.", "numeric", 0.5, H("The midpoints are 5, 15, 25 and 35.", "Multiply each midpoint by its frequency, add, divide by total frequency."), "B(i)", answer=round(sum(((a + b) / 2) * f for a, b, f in B5) / sum(f for _, _, f in B5), 2), tol=0.02),
    P("b", "(b)", "State the midpoint of the class 20–30.", "numeric", 0.5, H("A midpoint is halfway between the class limits.", "Average the two class boundaries."), "B(i)", answer=25),
    P("c", "(c)", "Describe the pattern: if every midpoint increases by 5, the estimated mean …", "text", 1, H("Every value feeding the estimate has grown by the same amount.", "Recall what adding a constant does to a mean."), "B(ii)", accepted=["increases by 5", "also increases by 5", "rises by 5"], keywords=[["increase", "rises", "goes up"], ["5"]], min_kw=1),
    P("d", "(d)", "Verify: type the new estimated mean if every midpoint is 5 higher (2 d.p.).", "numeric", 1, H("Apply your rule to your answer from (a).", "Add 5 to your estimated mean."), "B(iii)", answer=round(sum(((a + b) / 2) * f for a, b, f in B5) / sum(f for _, _, f in B5) + 5, 2), tol=0.02),
  ], subtopic="estimated mean under a shift"),

# ── Criterion C (5) ─────────────────────────────────────────────────────────
Q(15, "cumulative frequency", "medium", "C", "C(iii)",
  "Move between representations: the frequency table shows test marks. Complete the cumulative frequency values.",
  "Cumulative frequencies: by 20: 3; by 40: 3 + 5 = 8; by 60: 16; by 80: 22; by 100: 26.",
  diagram={"kind": "table", "title": "Marks frequency table", "columns": ["Mark ≤", "20", "40", "60", "80", "100"], "rows": [["Frequency", "3", "5", "8", "6", "4"], ["Cumulative freq.", "3", "?", "?", "?", "?"]]},
  parts=[
    P("a", "(a)", "Write down the cumulative frequency up to 60.", "numeric", 1, H("Keep a running total across the classes.", "Add the frequencies for ≤20, ≤40 and ≤60."), "C(iii)", answer=16),
    P("b", "(b)", "Write down the cumulative frequency up to 100.", "numeric", 1, H("The final cumulative value equals the total frequency.", "Add all five frequencies."), "C(iii)", answer=26),
  ], subtopic="table to cumulative"),
Q(16, "histograms", "hard", "C", "C(i)",
  "A histogram uses frequency density because the class widths are unequal. For the class 20–30 with frequency 12, and the class 30–50 with frequency 10, calculate each frequency density.",
  "Frequency density = frequency ÷ class width. 20–30: 12 ÷ 10 = 1.2. 30–50: 10 ÷ 20 = 0.5.",
  diagram={"kind": "histogram", "title": "Histogram (frequency density)", "xLabel": "Value", "yLabel": "Frequency density", "xMin": 0, "xMax": 50, "yMin": 0, "yMax": 2, "bars": [{"from": 0, "to": 10, "height": 0.8}, {"from": 10, "to": 20, "height": 1.6}, {"from": 20, "to": 30, "height": 1.2}, {"from": 30, "to": 50, "height": 0.5}]},
  parts=[
    P("a", "(a)", "Calculate the frequency density for the class 20–30 (frequency 12).", "numeric", 1, H("Density involves the width of the class, not just frequency.", "Divide the frequency by the class width."), "C(i)", answer=1.2, tol=0.01),
    P("b", "(b)", "Calculate the frequency density for the class 30–50 (frequency 10).", "numeric", 1, H("This class is wider — check its width carefully.", "Divide the frequency by this class's width."), "C(i)", answer=0.5, tol=0.01),
  ], subtopic="frequency density"),
Q(17, "five-number summary and box plots", "hard", "C", "C(iv)",
  "Two classes took the same test. Their box plots are shown side by side. Write a comparison of the two classes.",
  "Class X: median 58, IQR = 66 − 51 = 15. Class Y: median 57, IQR = 60 − 55 = 5. The medians are almost equal, but Y is far more consistent (smaller IQR). X has the higher maximum (78 vs 70).",
  diagram={"kind": "box_plot", "title": "Test marks: Class X and Class Y", "xLabel": "Mark", "yLabel": "", "boxPlots": [
      {"label": "Class X", **C3A}, {"label": "Class Y", **C3B}]},
  parts=[
    P("a", "(a)", "Write down the median of Class Y.", "numeric", 1, H("Find the line inside the Class Y box.", "Read the line inside the second (lower) box."), "C(ii)", answer=57),
    P("b", "(b)", "Calculate the IQR of Class X.", "numeric", 1, H("The box of Class X spans its two quartiles.", "Subtract the left edge of the X box from its right edge."), "C(ii)", answer=15),
    P("c", "(c)", "Compare the classes in one sentence: which class is more consistent, and why?", "text", 1, H("Consistency is about spread, not the median.", "Name the class with the smaller IQR and mention IQR or spread."), "C(iv)", accepted=["Class Y is more consistent because its IQR is smaller", "Y, smaller IQR"], keywords=[["class y", "y is", "y,", " y "], ["consistent", "less spread", "smaller iqr", "narrower"]], min_kw=2),
  ], subtopic="comparing two box plots"),
Q(18, "stem-and-leaf diagrams", "medium", "C", "C(ii)",
  "The back-to-back stem-and-leaf shows sprint times (seconds) for two groups. On the left of the stem read Group A, on the right read Group B. Use the diagram to find each group's fastest (smallest) time.",
  "Group A values (left, read outward): 32, 35, 35, 38, 41, 43 → fastest 32 s. Group B: 31, 34, 36, 39, 40 → fastest 31 s.",
  diagram={"kind": "stem_leaf", "title": "Sprint times (s)", "stemKey": "left | stem | right", "leftTitle": "Group A", "rightTitle": "Group B", "stemRows": [
      {"stem": "3", "left": ["8", "5", "5", "2"], "leaves": ["1", "4", "6", "9"]},
      {"stem": "4", "left": ["3", "1"], "leaves": ["0"]}]},
  parts=[
    P("a", "(a)", "Write down the fastest time in Group A.", "numeric", 1, H("On the left, leaves are read from the stem outwards.", "Combine the stem with the leaf nearest the stem on the left row 3."), "C(ii)", answer=32, unit="s"),
    P("b", "(b)", "Write down the fastest time in Group B.", "numeric", 1, H("The smallest value has the smallest stem and leaf.", "Read the first leaf on the right of the stem-3 row."), "C(ii)", answer=31, unit="s"),
  ], subtopic="back-to-back stem-and-leaf"),
Q(19, "mean, mode and median", "medium", "C", "C(iv)",
  "Find the error. A student writes: \"For the data 3, 5, 9, 12, 20 the median is 9 and the mean is (3 + 5 + 9 + 12 + 20) ÷ 4 = 12.25.\" Type the correct mean.",
  "There are 5 values, not 4: mean = 49 ÷ 5 = 9.8. The median (9) was correct; the error was dividing by the wrong count.",
  diagram={"kind": "table", "title": "Student's data", "columns": ["Values", "3", "5", "9", "12", "20"], "rows": [["Count", "5 values in total"]]},
  parts=[
    P("a", "(a)", "Type the correct mean.", "numeric", 1, H("How many values are actually in the list?", "Add the five values and divide by the correct count."), "C(iv)", answer=9.8, tol=0.01),
    P("b", "(b)", "Explain the student's error in a few words.", "text", 1, H("Compare the divisor the student used with the number of values.", "State what number they divided by and what they should have used."), "C(iv)", accepted=["they divided by 4 instead of 5", "divided by 4 not 5", "wrong number of values"], keywords=[["divid", "divisor"], ["4"], ["5", "five", "count"]], min_kw=2),
  ], subtopic="find the error: mean"),

# ── Criterion D (6) ─────────────────────────────────────────────────────────
Q(20, "comparing data sets", "hard", "D", "D(i)",
  "An athlete records her 400 m times (seconds, lower is better) over 10 races: the data set below. Her coach wants to judge how consistent her performances are.",
  f"Median time = {qD1['median']} s; IQR = {qD1['q3']} − {qD1['q1']} = {qD1['q3']-qD1['q1']} s; range = {D1[-1]} − {D1[0]} = {D1[-1]-D1[0]} s. Consistency is judged by the IQR/range, not the median.",
  diagram={"kind": "table", "title": "Athlete's 400 m times (s)", "columns": ["Race", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], "rows": [["Time", *map(str, D1)]]},
  parts=[
    P("a", "(a)", "Identify a suitable measure of spread for consistency: type range or IQR.", "text", 0.5, H("Consistency means times close together — centre or spread?", "Choose the measure that describes how spread out the times are."), "D(i)", accepted=["IQR", "range", "interquartile range"], keywords=[["iqr", "range", "interquartile"]], min_kw=1),
    P("b", "(b)", "Calculate the IQR of the times.", "numeric", 1, H("Split the ordered times into halves at the median.", "Find Q1 and Q3 from the halves and subtract."), "D(iii)", answer=float(qD1["q3"] - qD1["q1"]), unit="s"),
    P("c", "(c)", "Calculate the median time.", "numeric", 1, H("With 10 values the median is between the 5th and 6th.", "Average the two middle ordered times."), "D(iii)", answer=float(qD1["median"]), unit="s"),
    P("d", "(d)", "State whether a median time of this size is realistic for a school athlete's 400 m race. Type yes or no, and give a reason.", "text", 0.5, H("School athletes run 400 m in roughly 55–95 s — compare.", "Decide if the median is in a realistic range for the context."), "D(v)", accepted=["yes, realistic", "yes"], keywords=[["yes"], ["realistic", "reasonable", "sensible"]], min_kw=2),
  ], subtopic="sports times: choosing measures"),
Q(21, "grouped data", "medium", "D", "D(ii)",
  "A weather station records daily rainfall (mm) over 30 days in the grouped table. The station needs an estimate of the mean daily rainfall for a water report.",
  "Midpoints 2.5, 7.5, 12.5, 17.5 with frequencies 12, 9, 6, 3: estimated mean = (30 + 67.5 + 75 + 52.5) ÷ 30 = 225 ÷ 30 = 7.5 mm. It is an estimate because exact values within each class are unknown.",
  diagram={"kind": "table", "title": "Daily rainfall (30 days)", "columns": ["Rainfall (mm)", "0–5", "5–10", "10–15", "15–20"], "rows": [["Days", "12", "9", "6", "3"]]},
  parts=[
    P("a", "(a)", "Identify the midpoint of the class 10–15.", "numeric", 0.5, H("Halfway between the class limits.", "Average 10 and 15."), "D(i)", answer=12.5, unit="mm"),
    P("b", "(b)", "Estimate the mean daily rainfall.", "numeric", 1, H("Use midpoints weighted by frequencies.", "Multiply each midpoint by its days, add, divide by 30."), "D(iii)", answer=7.5, tol=0.05, unit="mm"),
    P("c", "(c)", "State the modal class. Type like 0-5.", "text", 0.5, H("The class with the most days.", "Read the class with the highest frequency."), "D(ii)", accepted=["0-5", "0–5"]),
    P("d", "(d)", "Justify the accuracy: explain in a few words why this mean is only an estimate.", "text", 0.5, H("What information did grouping throw away?", "Think about what midpoints assume about values inside a class."), "D(iv)", accepted=["exact values are unknown, midpoints are used", "we used midpoints instead of exact values"], keywords=[["midpoint"], ["exact", "unknown", "grouped", "assume"]], min_kw=2),
  ], subtopic="rainfall estimate"),
Q(22, "comparing data sets", "hard", "D", "D(ii)",
  "A school compares two delivery companies using box plots of delivery times (minutes). The school wants reliably fast deliveries.",
  "Company A: median 24, IQR = 31 − 18 = 13. Company B: median 25, IQR = 29 − 21 = 8. B is slightly slower at the median but much more consistent (IQR 8 < 13), so B is the reliable choice.",
  diagram={"kind": "box_plot", "title": "Delivery times (minutes)", "xLabel": "Time (min)", "yLabel": "", "boxPlots": [
      {"label": "Company A", **D3A}, {"label": "Company B", **D3B}]},
  parts=[
    P("a", "(a)", "Write down the median delivery time for Company B.", "numeric", 0.5, H("Read the line inside the Company B box.", "Locate the line within the lower box."), "D(ii)", answer=25, unit="min"),
    P("b", "(b)", "Calculate the IQR for Company A.", "numeric", 1, H("The box of Company A spans Q1 to Q3.", "Subtract the left edge of A's box from the right edge."), "D(iii)", answer=13, unit="min"),
    P("c", "(c)", "Calculate the IQR for Company B.", "numeric", 1, H("Do the same for the Company B box.", "Subtract B's Q1 from its Q3."), "D(iii)", answer=8, unit="min"),
    P("d", "(d)", "State which company you recommend for reliable deliveries. Type the company letter (A or B), then give your reason, using the words 'smaller IQR' or 'larger IQR'.", "text", 0.5, H("Reliable means consistent — compare the IQRs.", "Choose the company whose IQR is smaller and say so."), "D(v)", accepted=["B, smaller IQR", "Company B, smaller IQR", "B"], keywords=[["company b", "b,", " b "], ["iqr", "consistent", "spread"]], min_kw=2),
  ], subtopic="delivery times comparison"),
Q(23, "standard deviation", "hard", "D", "D(ii)",
  "A factory checks two machines filling 500 g bags. Machine P has population standard deviation 4.2 g and Machine Q has 1.3 g, with the same mean of 500 g. The factory needs bags close to 500 g for legal labelling.",
  "Both machines average 500 g, but Q's SD (1.3 g) is much smaller, so Q's bags cluster tighter around 500 g. P's typical deviation is 4.2 g, over three times Q's.",
  diagram={"kind": "table", "title": "Bag-filling machines", "columns": ["Machine", "Mean (g)", "SD (g)"], "rows": [["P", "500", "4.2"], ["Q", "500", "1.3"]]},
  parts=[
    P("a", "(a)", "Identify which machine is more consistent: type P or Q.", "text", 0.5, H("Consistency is about spread around the mean.", "Choose the machine with the smaller standard deviation."), "D(i)", accepted=["Q", "Machine Q"]),
    P("b", "(b)", "State the typical deviation from 500 g for Machine P.", "numeric", 1, H("The table gives each machine's SD directly.", "Read Machine P's standard deviation."), "D(ii)", answer=4.2, unit="g"),
    P("c", "(c)", "Calculate how many times larger P's SD is than Q's. Give your answer to 1 decimal place.", "numeric", 1, H("Compare the two SD values with division.", "Divide P's SD by Q's SD."), "D(iii)", answer=round(4.2 / 1.3, 1), tol=0.1),
    P("d", "(d)", "Justify the choice for legal labelling in a few words: why does the smaller SD matter?", "text", 0.5, H("Legal labelling needs bags close to the stated mass.", "Link the smaller SD to bags clustering near 500 g."), "D(v)", accepted=["bags stay closer to 500 g", "less variation around 500 g"], keywords=[["closer", "cluster", "less variation", "near 500", "consistent"]], min_kw=1),
  ], subtopic="wages/machines: SD in context"),
Q(24, "mean, mode and median", "medium", "D", "D(ii)",
  "A class's test marks (out of 100) are: 52, 55, 58, 61, 63, 66, 69, 97. The teacher must report a typical mark to parents and is worried one mark is distorting the picture.",
  "Mean = 521 ÷ 8 = 65.125 ≈ 65.1. Median = (61 + 63) ÷ 2 = 62. The mark 97 pulls the mean up; the median (62) better represents the typical student.",
  diagram={"kind": "table", "title": "Class test marks", "columns": ["Student", "1", "2", "3", "4", "5", "6", "7", "8"], "rows": [["Mark", *map(str, D5)]]},
  parts=[
    P("a", "(a)", "Calculate the mean mark, to 1 decimal place.", "numeric", 0.5, H("Add all eight marks and divide by 8.", "Total the marks, then divide by the number of students."), "D(iii)", answer=round(st.mean(D5), 1), tol=0.05),
    P("b", "(b)", "Calculate the median mark.", "numeric", 1, H("The median is between the 4th and 5th ordered marks.", "Average the two middle marks."), "D(iii)", answer=float(st.median(D5))),
    P("c", "(c)", "Identify the mark that is an outlier.", "numeric", 1, H("One mark sits far above the rest.", "Find the value separated from the main cluster."), "D(i)", answer=97),
    P("d", "(d)", "State which average better represents a typical student here: type mean or median.", "text", 0.5, H("Which measure is pulled by the outlier?", "Choose the measure resistant to the extreme mark."), "D(v)", accepted=["median"], keywords=[["median"]], min_kw=1),
  ], subtopic="test results: mean vs median"),
Q(25, "histograms", "hard", "D", "D(ii)",
  "A gym records members' exercise times (minutes) in a histogram with unequal class widths. The class 0–20 has frequency 14 and the class 20–30 has frequency 12. The manager uses the histogram to plan class schedules.",
  "Frequency densities: 0–20: 14 ÷ 20 = 0.7; 20–30: 12 ÷ 10 = 1.2. Although fewer members are in 20–30, its density is higher — area, not height alone, represents frequency.",
  diagram={"kind": "histogram", "title": "Exercise times at the gym", "xLabel": "Time (min)", "yLabel": "Frequency density", "xMin": 0, "xMax": 60, "yMin": 0, "yMax": 1.4, "bars": [{"from": 0, "to": 20, "height": 0.7}, {"from": 20, "to": 30, "height": 1.2}, {"from": 30, "to": 60, "height": 0.6}]},
  parts=[
    P("a", "(a)", "Calculate the frequency density of the class 0–20.", "numeric", 0.5, H("Density = frequency ÷ width.", "Divide 14 by the width of the 0–20 class."), "D(iii)", answer=0.7, tol=0.01),
    P("b", "(b)", "Calculate the frequency of the class 30–60 if its frequency density is 0.6.", "numeric", 0.5, H("Rearrange: frequency = density × width.", "Multiply the density by the width of the 30–60 class."), "D(iii)", answer=18),
    P("c", "(c)", "Calculate how many members exercised for less than 30 minutes.", "numeric", 1, H("Add the frequencies of the classes below 30.", "Combine the 0–20 and 20–30 frequencies."), "D(iii)", answer=26),
    P("d", "(d)", "State whether it is sensible for the manager to schedule the most classes around 20–30 minutes. Type yes or no, and justify your answer using frequency density.", "text", 0.5, H("Which class has the highest frequency density?", "Base your answer on the density comparison, not raw frequency."), "D(iv)", accepted=["yes, highest density", "yes"], keywords=[["yes"], ["density", "most members", "busiest"]], min_kw=2),
  ], subtopic="gym times histogram"),
]
