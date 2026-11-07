# G10 Examination — MYP 5 Sequences & Series E-Assessment (50 printed questions, 100 marks, 90 min).
# Source: "MYP 5 Mathematics.pdf" (27 pages, no answer key). Every stem, table and option is transcribed
# from the PDF text layer. No answers are printed in the paper: every key below was derived by hand and
# checked in verify_g10_sequences.py.
#
# Engine constraint: the platform has no multi-part question type. Each scored part of a printed question
# therefore becomes its own item (numeric, ordering, matching, sort or open_ended). Printed question totals
# are kept exactly (chapters 16/11/16/19/20/18 marks); the split of marks between parts is ours, because the
# paper prints marks per question only.
#
# Kinds:
#   numeric  : value, tol           -> auto-marked (single number)
#   order    : steps (correct order) -> auto-marked, shown shuffled to the student
#   match    : pairs (row -> choice) -> auto-marked, match mode (each choice used once)
#   sort     : pairs (tile -> category) -> auto-marked, sort mode (categories may repeat)
#   open     : criteria              -> manual / AI-assisted marking against the criteria
from decimal import Decimal, ROUND_DOWN

ORG = "0a400000-0000-4000-8000-000000000001"
SRC = "myp5-sequences-series-e-assessment"
EXAM_TITLE = "MYP5 Examination"
ACCESS_CODE = "MYP5-SEQ100-2026"
TOTAL_MARKS = 100

CHAPTERS = [
    (1, 9, "Recursive and explicit formulas", 9, 16),
    (10, 16, "Linear sequences", 7, 11),
    (17, 25, "Arithmetic sequences", 9, 16),
    (26, 33, "Quadratic sequences", 8, 19),
    (34, 42, "Geometric sequences", 9, 20),
    (43, 50, "Arithmetic series", 8, 18),
]


def chapter(n):
    for lo, hi, name, _, _ in CHAPTERS:
        if lo <= n <= hi:
            return name
    raise ValueError(n)


def split(total, k):
    """Split a mark total into k two-decimal parts that sum exactly to total."""
    total = Decimal(str(total))
    base = (total / k).quantize(Decimal("0.01"), ROUND_DOWN)
    parts = [base] * (k - 1) + [total - base * (k - 1)]
    return [float(p) for p in parts]


ITEMS = []


def add(n, part, kind, prompt, pts, **kw):
    ITEMS.append(dict(n=n, part=part, kind=kind, prompt=prompt, pts=pts, **kw))


def num(n, part, prompt, value, pts, tol=0):
    add(n, part, "numeric", prompt, pts, value=value, tol=tol)


def opn(n, part, prompt, pts, criteria):
    add(n, part, "open", prompt, pts, criteria=criteria)


def match(n, part, prompt, pairs, pts):
    add(n, part, "match", prompt, pts, pairs=pairs)


def sort(n, part, prompt, pairs, pts):
    add(n, part, "sort", prompt, pts, pairs=pairs)


def order(n, part, prompt, steps, pts):
    add(n, part, "order", prompt, pts, steps=steps)


# ---------- Chapter 1: Recursive and explicit formulas (16 marks) ----------

p = split(1, 3)
num(1, "a", "Q01 (a). Savings tin: a_1 = 8 GHS, u_(n+1) = u_n + 5. Find the total at the start of week 2 (GHS).", 13, p[0])
num(1, "b", "Q01 (b). Savings tin: a_1 = 8 GHS, u_(n+1) = u_n + 5. Find the total at the start of week 3 (GHS).", 18, p[1])
num(1, "c", "Q01 (c). Savings tin: a_1 = 8 GHS, u_(n+1) = u_n + 5. Find the total at the start of week 4 (GHS).", 23, p[2])

match(2, "", "Q02. Match each rule to its description. Use each choice once.", [
    {"left": "$a_1 = 5,\\; u_{n+1} = u_n + 3$", "right": "Recursive arithmetic rule"},
    {"left": "$u_n = 5 + 3(n-1)$", "right": "Explicit arithmetic rule"},
    {"left": "$a_1 = 2,\\; u_{n+1} = 3u_n$", "right": "Recursive geometric rule"},
    {"left": "$u_n = 2 \\times 3^{n-1}$", "right": "Explicit geometric rule"},
], 1)

num(3, "", "Q03. A courier earns 40 bonus points on day 1. Each later day she earns 15 more points than the day before. Calculate the points earned on day 4.", 85, 1)

opn(4, "", "Q04. A student says that u_(n+1) = u_n + 6 and u_n = 6n always describe the same sequence. Explain why a first term is needed for the recursive rule. Use a_1 = 10 as a counterexample.", 2,
    "2 marks. 1: explains that a recursive rule needs a starting value, since u_(n+1) = u_n + 6 alone does not fix the sequence. 1: uses a_1 = 10 to show a different sequence (10, 16, 22, ...) from u_n = 6n (6, 12, 18, ...).")

opn(5, "a", "Q05 (a). The rule is a_1 = 4 and u_(n+1) = 2u_n - 1. A student writes u_2 = 2(4) - 1 = 7; u_3 = 2(4) - 1 = 7; u_4 = 2(4) - 1 = 7. Identify the one repeated mistake.", 1,
    "1 mark. The student keeps using the first term a_1 = 4 instead of the previous term (u_2 = 7 must be used for u_3, and so on).")
num(5, "b", "Q05 (b). Correct the working for the rule a_1 = 4, u_(n+1) = 2u_n - 1. Find u_3.", 13, 0.5)
num(5, "c", "Q05 (c). Correct the working for the rule a_1 = 4, u_(n+1) = 2u_n - 1. Find u_4.", 25, 0.5)

sort(6, "", "Q06. Sort the tiles into recursive definition, explicit formula, and list only. Use every tile once.", [
    {"left": "$a_1 = 7,\\; u_{n+1} = u_n + 2$", "right": "Recursive definition"},
    {"left": "$u_n = 4n + 1$", "right": "Explicit formula"},
    {"left": "$a_1 = 3,\\; u_{n+1} = 2u_n$", "right": "Recursive definition"},
    {"left": "$u_n = 5 \\times 2^{n-1}$", "right": "Explicit formula"},
    {"left": "$8, 11, 14, 17, \\ldots$", "right": "List only (no rule)"},
    {"left": "$2, 6, 18, 54, \\ldots$", "right": "List only (no rule)"},
], 2)

order(7, "a", "Q07 (a). Order the steps to find u_4 from a_1 = 3 and u_(n+1) = 2u_n + 1.", [
    "Write the given first term a_1 = 3.",
    "Substitute u_1 into the rule to find u_2 = 7.",
    "Substitute u_2 into the rule to find u_3 = 15.",
    "Substitute u_3 into the rule to find u_4 = 31.",
], 1)
num(7, "b", "Q07 (b). Find u_4 for a_1 = 3 and u_(n+1) = 2u_n + 1.", 31, 1)

num(8, "a", "Q08 (a). Joined-square matchsticks: pattern 1 has one square and each new pattern adds one square sharing one side. Pattern 1 uses 4 matchsticks and pattern 2 uses 7. Find u_3 (matchsticks in pattern 3).", 10, 0.5)
num(8, "b", "Q08 (b). Joined-square matchsticks (u_1 = 4, u_2 = 7). Find u_4 (matchsticks in pattern 4).", 13, 0.5)
opn(8, "c", "Q08 (c). Write a rule for u_n for the joined-square matchstick pattern (u_1 = 4, u_2 = 7, u_3 = 10, u_4 = 13).", 0.5,
    "0.5 mark. Accepts u_n = 3n + 1 or an equivalent form. Full mark only if the rule is correct for n = 1 to 4.")
opn(8, "d", "Q08 (d). Justify why the number of matchsticks increases by the same amount each time (joined-square pattern).", 0.5,
    "0.5 mark. Each new square shares one side and adds 3 new matchsticks, so the increase is constant: the difference is 3.")

num(9, "a", "Q09 (a). Plan R starts at 12,000 XOF in week 1 and follows u_(n+1) = u_n + 2,500. Find the week 3 profit under Plan R (XOF).", 17000, 1)
num(9, "b", "Q09 (b). Plan E is u_n = 14,500 + 2,500(n-1). Find the week 3 profit under Plan E (XOF).", 19500, 1)
opn(9, "c", "Q09 (c). Interpret which plan gives more profit in week 3 and by how much.", 1,
    "1 mark. Plan E gives more profit in week 3: 19,500 XOF against 17,000 XOF, a difference of 2,500 XOF.")

# ---------- Chapter 2: Linear sequences (11 marks) ----------

p = split(1, 2)
num(10, "a", "Q10 (a). A linear sequence has a_1 = 4 and d = 7. Find the missing term u_2.", 11, p[0])
num(10, "b", "Q10 (b). A linear sequence has a_1 = 4 and d = 7. Find the missing term u_3.", 18, p[1])

num(11, "", "Q11. A taxi in Cotonou uses a linear model for whole kilometres. A 2 km ride costs 900 XOF and a 5 km ride costs 1,800 XOF. Find the cost of a 10 km ride (XOF).", 3300, 1)

opn(12, "", "Q12. Consider the sequence 5, 9, 13, 17, ... . Is it linear? Justify your answer using differences, and explain what the common difference means.", 1,
    "1 mark. Yes, it is linear: the differences are constant (4). The common difference 4 means each term is 4 more than the previous term.")

sort(13, "", "Q13. Sort the sequences into increasing linear, decreasing linear, and not linear. Use every tile once.", [
    {"left": "$3, 8, 13, 18, \\ldots$", "right": "Increasing linear"},
    {"left": "$20, 14, 8, 2, \\ldots$", "right": "Decreasing linear"},
    {"left": "$1, 4, 9, 16, \\ldots$", "right": "Not linear"},
    {"left": "$5, 2, -1, -4, \\ldots$", "right": "Decreasing linear"},
    {"left": "$u_n = 6n - 1$", "right": "Increasing linear"},
    {"left": "$2, 6, 18, 54, \\ldots$", "right": "Not linear"},
], 2)

opn(14, "a", "Q14 (a). A student finds the rule for 18, 14, 10, 6, ... with d = 18 - 14 = 4 and u_n = 18 + 4(n-1). Identify the sign mistake.", 1,
    "1 mark. The common difference is 14 - 18 = -4 (the first term minus the second), not 18 - 14 = 4.")
opn(14, "b", "Q14 (b). Write the correct explicit rule for 18, 14, 10, 6, ... .", 1,
    "1 mark. u_n = 18 - 4(n-1), or an equivalent form such as u_n = -4n + 22.")

num(15, "a", "Q15 (a). Hexagonal tables: one table seats 6 people and each extra table shares one side and adds 4 seats (u_1 = 6, u_2 = 10). Find the seats around 3 joined tables.", 14, 0.5)
num(15, "b", "Q15 (b). Hexagonal tables (u_1 = 6, u_2 = 10). Find the seats around 4 joined tables.", 18, 0.5)
opn(15, "c", "Q15 (c). Write a rule for the number of seats u_n around n joined hexagonal tables.", 0.5,
    "0.5 mark. u_n = 4n + 2 or an equivalent form. Must give 6, 10, 14, 18 for n = 1 to 4.")
opn(15, "d", "Q15 (d). Explain why the number of seats increases by a constant amount each time a table is added.", 0.5,
    "0.5 mark. Each extra table shares one side and adds the same 4 seats, so the first difference is constant.")

match(16, "", "Q16. Each row gives two terms of a linear sequence. Match each row to its explicit rule. Use each choice once.", [
    {"left": "$a_2 = 5,\\; a_5 = 14$", "right": "$u_n = 3n - 1$"},
    {"left": "$a_3 = 17,\\; a_7 = 1$", "right": "$u_n = -4n + 29$"},
    {"left": "$a_4 = -2,\\; a_6 = 8$", "right": "$u_n = 5n - 22$"},
    {"left": "$a_2 = -7,\\; a_4 = -13$", "right": "$u_n = -3n - 1$"},
], 2)

# ---------- Chapter 3: Arithmetic sequences (16 marks) ----------

p = split(1, 4)
num(17, "a", "Q17 (a). For the arithmetic sequence 19, 15, 11, 7, ... , find a_1.", 19, p[0])
num(17, "b", "Q17 (b). For the arithmetic sequence 19, 15, 11, 7, ... , find d.", -4, p[1])
num(17, "c", "Q17 (c). For the arithmetic sequence 19, 15, 11, 7, ... , write u_n = a_1 + d(n-1) as u_n = [first blank] + [second blank](n-1). Enter the first blank.", 19, p[2])
num(17, "d", "Q17 (d). For the arithmetic sequence 19, 15, 11, 7, ... , write u_n = a_1 + d(n-1) as u_n = [first blank] + [second blank](n-1). Enter the second blank.", -4, p[3])

num(18, "", "Q18. A stadium has 24 seats in row 1. Each later row has 3 more seats than the row before. Calculate the number of seats in row 18.", 75, 1)

match(19, "", "Q19. Match each arithmetic sequence to its explicit rule. Use each choice once.", [
    {"left": "$a_1 = 9,\\; d = 4$", "right": "$u_n = 4n + 5$"},
    {"left": "$a_1 = 18,\\; d = -3$", "right": "$u_n = -3n + 21$"},
    {"left": "$a_1 = -5,\\; d = 6$", "right": "$u_n = 6n - 11$"},
    {"left": "$a_1 = 2,\\; d = \\tfrac{1}{2}$", "right": "$u_n = \\tfrac{1}{2}n + \\tfrac{3}{2}$"},
], 1)

opn(20, "", "Q20. Sequence A is u_n = 12 + 3(n-1). Sequence B is u_n = 30 - 2(n-1). Describe how each sequence changes. Then compare their values at n = 10 and explain which is greater.", 2,
    "2 marks. 1: A increases by 3 each term; B decreases by 2 each term. 1: at n = 10, A = 39 and B = 12, so A is greater.")

opn(21, "a", "Q21 (a). An arithmetic sequence has a_5 = 23 and a_9 = 39. A student writes d = (39 - 23)/(9 - 5) = 4 and a_1 = 23 - 5(4) = 3. Identify the mistake in the first term.", 1,
    "1 mark. The student used 5d instead of 4d: a_5 = a_1 + 4d, so a_1 = 23 - 4(4).")
num(21, "b", "Q21 (b). Correct a_1 for the arithmetic sequence with a_5 = 23 and a_9 = 39.", 7, 1)

num(22, "", "Q22. A water tank contains 680 L at the start of day 1. Each day 45 L are used and no water is added. On which day will the tank contain exactly 50 L at the start of the day?", 15, 2)

order(23, "", "Q23 (a). For an arithmetic sequence with a_3 = 11 and a_7 = 27, order the steps to find a_1 and d.", [
    "Subtract the two term equations to eliminate a_1.",
    "Divide the difference in term values by the difference in indices to find d.",
    "Substitute d into the equation for a_3 to find a_1.",
    "Write u_n = a_1 + d(n-1) using the values found.",
], 1)
num(23, "b", "Q23 (b). For an arithmetic sequence with a_3 = 11 and a_7 = 27, find a_1.", 3, 0.5)
num(23, "c", "Q23 (c). For an arithmetic sequence with a_3 = 11 and a_7 = 27, find d.", 4, 0.5)

opn(24, "a", "Q24 (a). A tontine member contributes 5,000 XOF in month 1 and the contribution increases by 500 XOF each month. Write an explicit formula for the contribution in month n.", 0.5,
    "0.5 mark. u_n = 5000 + 500(n-1), or an equivalent form such as u_n = 500n + 4500.")
num(24, "b", "Q24 (b). A tontine member contributes 5,000 XOF in month 1 and increases by 500 XOF each month. Find the month number when the contribution first reaches 9,000 XOF.", 9, 1)
opn(24, "c", "Q24 (c). Interpret what the common difference means in this tontine context.", 0.5,
    "0.5 mark. The common difference of 500 XOF is the amount by which the monthly contribution rises each month.")

opn(25, "a", "Q25 (a). Job A pays 2,400,000 NGN in year 1 and rises by 180,000 NGN each year. Job B pays 2,600,000 NGN in year 1 and rises by 120,000 NGN each year. Write an explicit formula for the annual salary in each job.", 1,
    "1 mark. Job A: u_n = 2,400,000 + 180,000(n-1). Job B: u_n = 2,600,000 + 120,000(n-1). Equivalent forms accepted.")
num(25, "b", "Q25 (b). Job A pays 2,400,000 NGN in year 1 and rises by 180,000 NGN each year. Job B pays 2,600,000 NGN in year 1 and rises by 120,000 NGN each year. Find the first year in which Job A pays more than Job B.", 5, 1)
opn(25, "c", "Q25 (c). Interpret the result for a worker choosing only by annual salary.", 1,
    "1 mark. Job A overtakes Job B in year 5 and pays more from then on (year 4: A 2,940,000 < B 2,960,000; year 5: A 3,120,000 > B 3,080,000). A worker choosing by salary alone should pick Job B for years 1 to 4 and Job A from year 5.")

# ---------- Chapter 4: Quadratic sequences (19 marks) ----------

num(26, "a", "Q26 (a). The sequence 3, 8, 15, 24, 35, ... has first differences 5, 7, 9, 11. Find the second difference (constant).", 2, 0.5)
num(26, "b", "Q26 (b). For the sequence 3, 8, 15, 24, 35, ... , with second difference 2A and u_n = An^2 + Bn + C, find the coefficient A.", 1, 0.5)

num(27, "", "Q27. A decorator uses u_n = n^2 + 4n + 1 tiles for pattern n. A display uses exactly 141 tiles. Find the pattern number n.", 10, 1)

num(28, "a", "Q28 (a). Square block plus an extra row (u_1 = 2, u_2 = 6). Find the number of panels u_3 in pattern 3.", 12, 0.5)
num(28, "b", "Q28 (b). Square block plus an extra row (u_1 = 2, u_2 = 6). Find the number of panels u_4 in pattern 4.", 20, 0.5)
opn(28, "c", "Q28 (c). Write a rule for u_n for the square block plus extra row pattern.", 0.5,
    "0.5 mark. u_n = n^2 + n, or an equivalent form. Must give 2, 6, 12, 20 for n = 1 to 4.")
opn(28, "d", "Q28 (d). Justify why the rule for u_n is quadratic.", 0.5,
    "0.5 mark. The second differences are constant (2), so the rule has an n^2 term.")

opn(29, "a", "Q29 (a). A student analyses 2, 7, 14, 23, 34, ... with first differences 5, 7, 9, 11 and second differences 2, 2, 2, and concludes that the coefficient of n^2 is 2. Identify the mistake.", 1,
    "1 mark. The coefficient of n^2 is half the second difference (second difference = 2A), so A = 2 ÷ 2 = 1; the student forgot to halve.")
num(29, "b", "Q29 (b). For the sequence 2, 7, 14, 23, 34, ... , find the correct coefficient of n^2.", 1, 1)

sort(30, "", "Q30. Sort the sequences into linear, quadratic and geometric. Use every tile once.", [
    {"left": "$4, 9, 14, 19, \\ldots$", "right": "Linear"},
    {"left": "$2, 5, 10, 17, \\ldots$", "right": "Quadratic"},
    {"left": "$3, 6, 12, 24, \\ldots$", "right": "Geometric"},
    {"left": "$1, 4, 9, 16, \\ldots$", "right": "Quadratic"},
    {"left": "$50, 40, 30, 20, \\ldots$", "right": "Linear"},
    {"left": "$81, 27, 9, 3, \\ldots$", "right": "Geometric"},
], 2)

opn(31, "a", "Q31 (a). A sequence has first differences 5, 11, 17, ... and every second difference is 6. Explain why the sequence is quadratic rather than linear.", 1,
    "1 mark. The first differences are not constant, but the second differences are constant (6), so the sequence is quadratic.")
num(31, "b", "Q31 (b). A sequence has first differences 5, 11, 17, ... and every second difference is 6. State the coefficient of n^2.", 3, 1)

p = split(1, 3)
num(32, "a1", "Q32 (a). Seedling grids: pattern n has n + 1 plants on each side. Find the number of plants in pattern 1.", 4, p[0])
num(32, "a2", "Q32 (a). Seedling grids: pattern n has n + 1 plants on each side. Find the number of plants in pattern 2.", 9, p[1])
num(32, "a3", "Q32 (a). Seedling grids: pattern n has n + 1 plants on each side. Find the number of plants in pattern 3.", 16, p[2])
num(32, "b", "Q32 (b). Seedling grids: pattern n has n + 1 plants on each side. Find the pattern number that uses exactly 121 plants.", 10, 2)
opn(32, "c", "Q32 (c). Explain why the negative algebraic solution is not valid in this context.", 1,
    "1 mark. The pattern number n counts patterns, so it must be a positive whole number; the negative solution (n = -12) has no meaning for a pattern.")

num(33, "a", "Q33 (a). Trial A gives u_n = n^2 + 5n + 20 kg and Trial B gives u_n = 17n + 20 kg for plot n. Find the first plot number where Trial A gives a greater yield than Trial B.", 13, 2)
num(33, "b1", "Q33 (b). Yield of Trial A at the plot found in part (a) (kg).", 254, 0.5)
num(33, "b2", "Q33 (b). Yield of Trial B at the plot found in part (a) (kg).", 241, 0.5)
opn(33, "c", "Q33 (c). Interpret the crossing point and explain why checking only the equality plot is not enough.", 2,
    "2 marks. 1: the two yields are equal at plot 12, and Trial A is greater from plot 13 onward. 1: checking only the equal point does not show which trial is greater after it; the inequality n^2 - 12n > 0 must be checked.")

# ---------- Chapter 5: Geometric sequences (20 marks) ----------

num(34, "a", "Q34 (a). A phone's value at the start of each year is 8,100, 5,400, 3,600, 2,400 XOF (a geometric sequence). Find the common ratio r.", 2 / 3, 0.5, tol=0.001)
num(34, "b", "Q34 (b). A phone's value at the start of each year is 8,100, 5,400, 3,600, 2,400 XOF (a geometric sequence). Find the next value (XOF).", 1600, 0.5)

opn(35, "a", "Q35 (a). A bacteria culture has 1,200 bacteria at hour 1 and the count increases by 8% each hour. Write a formula for u_n.", 0.5,
    "0.5 mark. u_n = 1200 × (1.08)^(n-1), or an equivalent form.")
num(35, "b", "Q35 (b). A bacteria culture has 1,200 bacteria at hour 1 and increases by 8% each hour. Find the count at hour 5, rounded to the nearest whole bacterium.", 1633, 0.5)

match(36, "", "Q36. Match each geometric sequence to its explicit rule. Use each choice once.", [
    {"left": "$a_1 = 5,\\; r = 2$", "right": "$u_n = 5 \\times 2^{n-1}$"},
    {"left": "$a_1 = 96,\\; r = \\tfrac{1}{2}$", "right": "$u_n = 96 \\times (\\tfrac{1}{2})^{n-1}$"},
    {"left": "$a_1 = 3,\\; r = -2$", "right": "$u_n = 3 \\times (-2)^{n-1}$"},
    {"left": "$a_1 = 7,\\; r = 3$", "right": "$u_n = 7 \\times 3^{n-1}$"},
], 2)

opn(37, "", "Q37. Salary Plan A starts at 30,000 XOF and rises by 2,500 XOF each year. Plan B starts at 28,000 XOF and rises by 10% each year. Compare the year 6 values. Explain which plan grows by a constant amount and which grows by a constant factor.", 2,
    "2 marks. 1: year 6 values: Plan A = 42,500 XOF, Plan B = 28,000 × 1.1^5 ≈ 45,094 XOF, so Plan B is greater. 1: Plan A grows by a constant amount (arithmetic), Plan B by a constant factor (geometric).")

opn(38, "a", "Q38 (a). A student writes r = 6 - 3 = 3 and u_n = 3 × 3^(n-1) for 3, 6, 12, 24, ... . Identify the confusion.", 1,
    "1 mark. The student subtracted terms (6 - 3) to find a ratio. The ratio is found by dividing: r = 6 ÷ 3 = 2.")
num(38, "b", "Q38 (b). For 3, 6, 12, 24, ... , find the correct common ratio r.", 2, 0.5)
opn(38, "c", "Q38 (c). For 3, 6, 12, 24, ... , write the correct explicit rule.", 0.5,
    "0.5 mark. u_n = 3 × 2^(n-1), or an equivalent form.")

sort(39, "", "Q39. Sort the real-life descriptions into arithmetic, geometric and neither. Use every tile once.", [
    {"left": "A fare rises by 50 XOF each kilometre.", "right": "Arithmetic"},
    {"left": "A tree's height multiplies by 1.1 each year.", "right": "Geometric"},
    {"left": "A battery keeps 92% of its charge each hour.", "right": "Geometric"},
    {"left": "A stall sells 4 more bags each day.", "right": "Arithmetic"},
    {"left": "Daily sales are 20, 21, 23, 26 bags.", "right": "Neither"},
    {"left": "Crop yields are 10, 12, 15, 19 tonnes.", "right": "Neither"},
], 2)

num(40, "a", "Q40 (a). A solar pump is worth 480,000 XOF at the start of year 1, and 82% of the previous year's value at the start of each later year. Find the first year in which the value is below 200,000 XOF.", 6, 1)
num(40, "b", "Q40 (b). A solar pump is worth 480,000 XOF at the start of year 1, and 82% of the previous year's value at the start of each later year. Find the value in that year, to the nearest 100 XOF.", 178000, 1)

opn(41, "", "Q41. A student says 2, -6, 18, -54, ... is not geometric because the differences change. Justify whether the sequence is geometric. Explain the role of the negative common ratio.", 2,
    "2 marks. 1: the sequence is geometric because the ratio u_(n+1)/u_n = -3 is constant, even though the differences change. 1: the negative ratio makes the terms alternate in sign.")

opn(42, "a", "Q42 (a). A clinic records 6,400 mosquitoes in a treated area at week 1. Each later week the count is 75% of the previous week's count. Write a formula for u_n.", 1,
    "1 mark. u_n = 6400 × (0.75)^(n-1), or an equivalent form.")
num(42, "b", "Q42 (b). Mosquito counts: u_1 = 6,400 and each later week is 75% of the previous week. Find the first week in which the count is below 1,000.", 8, 2)
num(42, "c", "Q42 (c). Mosquito counts: u_1 = 6,400 and each later week is 75% of the previous week. Give the count in the week found in part (b), rounded to the nearest whole mosquito.", 854, 1)
opn(42, "d", "Q42 (d). Interpret whether this model predicts exactly zero mosquitoes in any finite week.", 2,
    "2 marks. The model is geometric with ratio 0.75, so every term is positive and the count only approaches zero; it never reaches exactly zero in any finite week.")

# ---------- Chapter 6: Arithmetic series (18 marks) ----------

p = split(1, 3)
num(43, "a", "Q43 (a). An arithmetic sequence has a_1 = 12, d = 5 and n = 10. For S_n = n/2 [2a_1 + (n-1)d], find 2a_1.", 24, p[0])
num(43, "b", "Q43 (b). An arithmetic sequence has a_1 = 12, d = 5 and n = 10. For S_n = n/2 [2a_1 + (n-1)d], find (n-1)d.", 45, p[1])
num(43, "c", "Q43 (c). An arithmetic sequence has a_1 = 12, d = 5 and n = 10. Find S_10.", 345, p[2])

num(44, "", "Q44. A theatre has 18 rows. Row 1 has 26 seats and each later row has 2 more seats than the row before it. Calculate the total number of seats in the theatre.", 774, 1)

order(45, "a", "Q45 (a). Order the steps to find the sum of the first 20 terms of an arithmetic sequence with a_1 = 6 and d = 3.", [
    "Identify a_1 = 6, d = 3, n = 20.",
    "Find the last term: u_20 = 6 + 3(20-1) = 63.",
    "Substitute into S_20 = 20/2 (a_1 + u_20) = 10(6 + 63).",
    "Evaluate S_20 = 690.",
], 1)
num(45, "b", "Q45 (b). The sum of the first 20 terms of an arithmetic sequence with a_1 = 6 and d = 3. Find S_20.", 690, 1)

opn(46, "a", "Q46 (a). A student finds the sum of the first 12 terms of an arithmetic sequence with a_1 = 5 and d = 3 as S_12 = 12/2 [2(5) + 12(3)] = 276. Identify the error.", 1,
    "1 mark. The student used 12d instead of 11d: (n-1)d = (12-1)(3) = 33.")
num(46, "b", "Q46 (b). For the arithmetic sequence with a_1 = 5 and d = 3, find the correct sum of the first 12 terms.", 258, 1)

opn(47, "", "Q47. Explain why S_n = n/2 (a_1 + u_n) and S_n = n/2 [2a_1 + (n-1)d] give the same sum for an arithmetic series. Use the meaning of the average of the first and last terms.", 2,
    "2 marks. 1: the average of the first and last terms times n gives the sum. 1: substituting u_n = a_1 + (n-1)d into n/2 (a_1 + u_n) gives n/2 [2a_1 + (n-1)d].")

num(48, "a", "Q48 (a). A 10-member tontine: member 1 pays 2,000 XOF, member 2 pays 2,500 XOF, and each later member pays 500 XOF more. Find member 10's contribution (XOF).", 6500, 0.5)
num(48, "b", "Q48 (b). A 10-member tontine: member 1 pays 2,000 XOF and each later member pays 500 XOF more than the one before. Find the total collected (XOF).", 42500, 1)
opn(48, "c", "Q48 (c). Explain why using 10d instead of 9d in part (a) would be wrong.", 0.5,
    "0.5 mark. Member 10 is 9 steps after member 1, so the common difference is added 9 times (a_10 = a_1 + 9d), not 10 times.")

match(49, "", "Q49. Match each arithmetic-series description to the correct sum expression. Do not evaluate the sums. Use each choice once.", [
    {"left": "12 terms with a_1 = 4 and u_12 = 37", "right": "$S_{12} = \\tfrac{12}{2}(4 + 37)$"},
    {"left": "The first 20 positive odd numbers", "right": "$S_{20} = \\tfrac{20}{2}[2(1) + 19(2)]$"},
    {"left": "15 terms with a_1 = 100 and d = -4", "right": "$S_{15} = \\tfrac{15}{2}[200 + 14(-4)]$"},
    {"left": "The sum of u_3 to u_10 for u_n = 5n + 2", "right": "$S = \\tfrac{8}{2}(17 + 52)$"},
], 2)

num(50, "a", "Q50 (a). A farming cooperative delivers 35 seed bags on day 1 and 4 more bags each later day. Find the number of bags delivered on day 14.", 87, 1)
num(50, "b", "Q50 (b). A farming cooperative delivers 35 seed bags on day 1 and 4 more bags each later day. Find the total number of bags delivered over the first 14 days.", 854, 2)
num(50, "c", "Q50 (c). A farming cooperative delivers 35 seed bags on day 1 and 4 more bags each later day. Find the minimum number of days needed to deliver at least 1,200 bags in total.", 18, 2)
opn(50, "d", "Q50 (d). Interpret the result from part (c) for planning.", 1,
    "1 mark. The cooperative needs 18 days to deliver at least 1,200 bags (17 days gives 1,139 and 18 days gives 1,242). Planning should allow 18 days.")

# Printed metadata per question (from the paper's question headers): criterion letter, level, marks.
META = {1: ('D', 1, 1), 2: ('A', 1, 1), 3: ('D', 2, 1), 4: ('C', 3, 2), 5: ('C', 3, 2), 6: ('B', 4, 2), 7: ('C', 4, 2), 8: ('B', 5, 2), 9: ('D', 6, 3),
        10: ('A', 1, 1), 11: ('D', 2, 1), 12: ('C', 2, 1), 13: ('B', 3, 2), 14: ('C', 4, 2), 15: ('B', 4, 2), 16: ('A', 5, 2),
        17: ('A', 2, 1), 18: ('D', 2, 1), 19: ('A', 2, 1), 20: ('C', 4, 2), 21: ('C', 4, 2), 22: ('D', 4, 2), 23: ('C', 4, 2), 24: ('D', 5, 2), 25: ('D', 6, 3),
        26: ('A', 1, 1), 27: ('D', 2, 1), 28: ('B', 4, 2), 29: ('C', 4, 2), 30: ('B', 4, 2), 31: ('C', 5, 2), 32: ('D', 6, 4), 33: ('D', 6, 5),
        34: ('A', 1, 1), 35: ('D', 2, 1), 36: ('A', 3, 2), 37: ('C', 4, 2), 38: ('C', 4, 2), 39: ('B', 4, 2), 40: ('D', 5, 2), 41: ('C', 5, 2), 42: ('D', 6, 6),
        43: ('A', 2, 1), 44: ('D', 2, 1), 45: ('C', 3, 2), 46: ('C', 4, 2), 47: ('C', 5, 2), 48: ('D', 5, 2), 49: ('A', 6, 2), 50: ('D', 6, 6)}
