"""MYP 5 (Grade 10) Mathematics — Mock Examination.

Scope: sequences and series (arithmetic, geometric, recurrence, sigma notation,
limits), financial mathematics (compound interest, depreciation, loans),
exponential and logarithmic models, quadratic functions, and mathematical
modelling. Every numerical answer in this file has been recomputed by hand and
is re-checked by ``scripts/exam-import/verify_mock_exams.py``.
"""
from mock_common import P, Q

EXAM = {
    "key": "myp5-mock",
    "title": "MYP5 Mathematics — Mock Examination",
    "curriculum": "MYP 5",
    "grade": "10",
    "subject": "Mathematics",
    "duration": 150,
    "kind": "mock",
    "code": "MYP5-MOCK-2026",
    "description": (
        "Grade 10 · MYP 5 · Mathematics · Mock Examination. Arithmetic and geometric sequences, recurrence "
        "relations, sigma notation, sums and limits, compound interest and depreciation, exponential and "
        "logarithmic models, quadratic functions and modelling. 45 questions, 259 marks: Section A (objective) and "
        "Section B (structured investigations)."
    ),
    "instructions": (
        "MYP5 MATHEMATICS — MOCK EXAMINATION (Grade 10)\n\n"
        "Time allowed: 2 hours 30 minutes.\n\n"
        "SECTION A — Objective questions (questions 1–22).\n"
        "Each question has one correct answer. Several items ask you to judge a claim rather than compute: read the "
        "whole statement before choosing.\n\n"
        "SECTION B — Structured questions (questions 23–45).\n"
        "Show your working. Marks are printed beside every part. Where a question asks you to CONSTRUCT a table or "
        "a graph, build it in the workspace: the representation itself is being assessed, and the typed answer "
        "records the value you read from it.\n\n"
        "EXAMINATION OBJECTIVES. By the end of this paper you should be able to: recognise, generate and classify "
        "arithmetic and geometric sequences; use recurrence relations and sigma notation; derive and apply the nth "
        "term and sum formulas; determine whether an infinite geometric series converges and find its sum; solve "
        "problems involving compound interest, depreciation and loans; solve exponential equations using "
        "logarithms; analyse quadratic functions from their completed-square, factorised and graphical forms; and "
        "build and criticise mathematical models of real situations.\n\n"
        "GENERAL INSTRUCTIONS.\n"
        "1. A calculator is permitted throughout. Write the formula or the method you use, not just the answer.\n"
        "2. Money is given to the nearest cent and other quantities to 3 significant figures unless a part states "
        "otherwise.\n"
        "3. A hint is available on every part. Hints guide the method and never give the answer; using one costs "
        "no marks and is recorded only to support your revision.\n"
        "4. Your answers save automatically; after a disconnection, reopen the paper and your work is restored.\n"
        "5. Notation: u_n is the nth term, d the common difference, r the common ratio, and S_n the sum of the "
        "first n terms.\n\n"
        "MARKS. Every part shows its marks. Section A is worth 60 marks and Section B 199 marks, out of a "
        "total of 259. Pass mark: your institution's configured threshold (default 50%)."
    ),
}

QUESTIONS = [
    # ─── Section A — objective (1–22) ───────────────────────────────────────────
    Q(1, "arithmetic sequences", "medium", "A",
      "An arithmetic sequence begins 7, 12, 17, 22, … What is the 20th term?",
      "The common difference is 5 and u_n = 7 + 5(n − 1), so u_20 = 7 + 5(19) = 102. Adding 5 twenty times (107) "
      "counts one step too many.",
      options=[("102", True), ("107", False), ("100", False), ("97", False)],
      points=2, subtopic="nth term of an arithmetic sequence",
      next_time="u_n = u_1 + (n − 1)d: the first term is already there, so there are only n − 1 steps."),
    Q(2, "arithmetic series", "hard", "A",
      "For the sequence 4, 9, 14, 19, … what is the sum of the first 15 terms?",
      "d = 5, so the 15th term is 4 + 14(5) = 74. Then S_15 = 15/2 × (4 + 74) = 7.5 × 78 = 585.",
      options=[("585", True), ("555", False), ("600", False), ("1 170", False)],
      points=3, subtopic="sum of an arithmetic series",
      next_time="S_n = n/2 (u_1 + u_n). Find the last term first; forgetting the final term is the usual error."),
    Q(3, "geometric sequences", "hard", "A",
      "A geometric sequence is 3, 6, 12, 24, … What is its 8th term?",
      "r = 2, so u_8 = 3 × 2^7 = 3 × 128 = 384. Using 2^8 would add one extra doubling.",
      options=[("384", True), ("768", False), ("192", False), ("48", False)],
      points=3, subtopic="nth term of a geometric sequence",
      next_time="u_n = u_1 r^(n−1). Check the index by counting: the 2nd term uses r^1."),
    Q(4, "geometric sequences", "medium", "A",
      "What is the common ratio of the geometric sequence 80, 40, 20, 10, …?",
      "Each term is half the previous one: 40 ÷ 80 = 0.5, and 20 ÷ 40 = 0.5 confirms it. Subtracting (40) would "
      "be the arithmetic difference, not the ratio.",
      options=[("0.5", True), ("40, because the terms decrease by 40", False), ("2", False), ("−0.5", False)],
      points=2, subtopic="identifying the common ratio",
      next_time="A common ratio is found by dividing a term by the one before it, not by subtracting."),
    Q(5, "recurrence relations", "hard", "B",
      "A sequence is defined by u_1 = 4 and u_{n+1} = 3u_n − 2. What is u_3?",
      "u_2 = 3(4) − 2 = 10, then u_3 = 3(10) − 2 = 28. Applying the rule twice to u_1 (giving u_2 twice) is the most "
      "common slip.",
      options=[("28", True), ("10", False), ("82", False), ("34", False)],
      points=3, subtopic="iterating a recurrence relation",
      next_time="Work term by term: each application of the rule produces exactly one new term."),
    Q(6, "sigma notation", "hard", "B",
      "What is the value of Σ (from k = 1 to 5) of (2k + 1)?",
      "The terms are 3, 5, 7, 9, 11, which total 35. Substituting only the upper limit (2(5) + 1 = 11) gives a "
      "single term, not the sum.",
      options=[("35", True), ("11", False), ("30", False), ("36", False)],
      points=3, subtopic="evaluating sigma notation",
      next_time="Sigma means 'add the terms': list them or use the arithmetic-sum formula."),
    Q(7, "limits of series", "hard", "B",
      "What is the sum to infinity of 12 + 6 + 3 + 1.5 + …?",
      "r = 0.5 and |r| < 1, so S∞ = a/(1 − r) = 12/0.5 = 24. The sum is finite even though infinitely many terms "
      "are added.",
      options=[("24", True), ("22.5", False), ("It does not exist because the series is infinite", False), ("48", False)],
      points=3, subtopic="sum to infinity",
      next_time="S∞ = a/(1 − r) only when |r| < 1; check that condition before using the formula."),
    Q(8, "limits of series", "hard", "B",
      "Which infinite geometric series converges to a finite sum?",
      "A geometric series converges exactly when |r| < 1. Of the four options only the one with r = 1/3 satisfies "
      "that; r = 2, r = 1.5 and r = 1 all diverge.",
      options=[("5 + 5/3 + 5/9 + 5/27 + …", True), ("1 + 2 + 4 + 8 + …", False),
               ("4 + 6 + 9 + 13.5 + …", False), ("7 + 7 + 7 + 7 + …", False)],
      points=3, subtopic="convergence condition",
      next_time="Convergence needs |r| < 1. Test the ratio of consecutive terms before summing infinitely."),
    Q(9, "compound interest", "hard", "C",
      "$2 000 is invested at 5% per year compound interest. What is its value after 3 years?",
      "2000 × 1.05³ = 2000 × 1.157625 = $2 315.25. Adding 3 × 5% = 15% of $2 000 gives $2 300, which ignores that "
      "interest is earned on previous interest.",
      options=[("$2 315.25", True), ("$2 300.00", False), ("$2 315.00", False), ("$3 000.00", False)],
      points=3, subtopic="compound interest",
      next_time="Compound growth multiplies repeatedly: A = P(1 + r)^n. Simple interest adds only P × r × n."),
    Q(10, "depreciation", "hard", "C",
      "A machine costing $8 000 depreciates by 12% of its value each year. What is its value after 2 years?",
      "8000 × 0.88² = 8000 × 0.7744 = $6 195.20. Subtracting 24% of $8 000 ($6 080) is wrong because the second "
      "year's 12% is taken from a smaller value.",
      options=[("$6 195.20", True), ("$6 080.00", False), ("$7 040.00", False), ("$6 272.00", False)],
      points=3, subtopic="depreciation",
      next_time="Depreciation is repeated multiplication by (1 − rate), never repeated subtraction of the same amount."),
    Q(11, "exponential equations", "medium", "A",
      "Solve the exponential equation 3^x = 81 and state the value of x.",
      "81 = 3^4, so x = 4. Dividing 81 by 3 gives 27, which is the value of 3^x for x = 3, not the exponent itself.",
      options=[("x = 4", True), ("x = 27", False), ("x = 3", False), ("x = 40.5", False)],
      points=2, subtopic="solving by matching bases",
      next_time="Write both sides as powers of the same base, then equate the exponents."),
    Q(12, "logarithms", "medium", "A",
      "Without a calculator, state the value of log base 2 of 32.",
      "log₂ 32 asks '2 raised to what power gives 32?' Since 32 = 2^5, the answer is 5.",
      options=[("5", True), ("16", False), ("2.5", False), ("6", False)],
      points=2, subtopic="evaluating a logarithm",
      next_time="A logarithm is an exponent: log_b x = y means b^y = x."),
    Q(13, "exponential equations", "hard", "B",
      "By writing both sides as powers of 2, solve 4^x = 64 and state the value of x.",
      "4 = 2² and 64 = 2^6, so 2^(2x) = 2^6, giving 2x = 6 and x = 3. Dividing 64 by 4 (giving 16) is the value "
      "of 4², not the solution.",
      options=[("x = 3", True), ("x = 16", False), ("x = 1.5", False), ("x = 2", False)],
      points=3, subtopic="solving by matching bases",
      next_time="Convert both sides to the same base: 4^x = (2²)^x = 2^(2x)."),
    Q(14, "quadratic functions", "medium", "A",
      "By factorising, state the solutions of the quadratic equation x² − 5x + 6 = 0.",
      "Factorising gives (x − 2)(x − 3) = 0, so x = 2 or x = 3. The pair −2 and −3 multiplies to +6 but sums to "
      "−5 only if both signs are negative — which they are not here.",
      options=[("x = 2 and x = 3", True), ("x = −2 and x = −3", False),
               ("x = 1 and x = 6", False), ("x = 5 and x = 6", False)],
      points=2, subtopic="solving a quadratic by factorising",
      next_time="For x² + bx + c find two numbers that multiply to c and add to b."),
    Q(15, "quadratic functions", "hard", "B",
      "The curve y = 2(x + 1)² + 7 is a parabola. What are the coordinates of its turning point?",
      "In completed-square form y = a(x − h)² + k the turning point is (h, k). Here h = −1 (because x + 1 = x − (−1)) "
      "and k = 7, so the minimum is at (−1, 7).",
      options=[("(−1, 7)", True), ("(1, 7)", False), ("(−1, −7)", False), ("(2, 7)", False)],
      points=3, subtopic="turning point from completed square",
      next_time="y = a(x − h)² + k has its turning point at (h, k); watch the sign inside the bracket."),
    Q(16, "quadratic functions", "hard", "B",
      "By evaluating the discriminant of the equation x² + 4x + 9 = 0, what can you conclude about its roots?",
      "b² − 4ac = 16 − 36 = −20. A negative discriminant means the equation has no real roots, so the curve does "
      "not meet the x-axis.",
      options=[("It is negative, so there are no real roots", True),
               ("It is negative, so there are two equal real roots", False),
               ("It is positive, so there are two distinct real roots", False),
               ("It is zero, so the curve touches the x-axis", False)],
      points=3, subtopic="the discriminant",
      next_time="Δ = b² − 4ac: negative means no real roots, zero means a repeated root, positive means two roots."),
    Q(17, "indices", "hard", "B",
      "Simplify (2^5 × 2^−3) ÷ 2^4 and state the value of the result.",
      "2^5 × 2^−3 = 2^2, and 2^2 ÷ 2^4 = 2^−2 = 1/4. Adding all three exponents (giving 2^6) treats a division as "
      "a multiplication.",
      options=[("1/4", True), ("4", False), ("64", False), ("1/2", False)],
      points=3, subtopic="laws of indices",
      next_time="Multiplying adds exponents, dividing subtracts them, and a negative exponent means a reciprocal."),
    Q(18, "exponential equations", "hard", "B",
      "Solve 5^(2x − 1) = 125 and state the value of x.",
      "125 = 5³, so 2x − 1 = 3 and x = 2. Setting 2x − 1 = 125 divides instead of matching exponents.",
      options=[("x = 2", True), ("x = 63", False), ("x = 1", False), ("x = 2.5", False)],
      points=3, subtopic="solving by matching bases",
      next_time="Rewrite 125 as a power of 5 first, then equate the exponents and solve the linear equation."),
    Q(19, "geometric sequences", "hard", "B",
      "A geometric sequence has u_1 = 5 and r = −2. What is u_6?",
      "u_6 = 5 × (−2)^5 = 5 × (−32) = −160. The sign alternates, so an even-indexed term is now negative: "
      "u_6 uses an odd power of −2.",
      options=[("−160", True), ("160", False), ("−320", False), ("−62", False)],
      points=3, subtopic="negative common ratio",
      next_time="A negative ratio alternates signs; (−2)^5 is negative because the power is odd."),
    Q(20, "limits of series", "medium", "A",
      "An infinite geometric series has first term a and common ratio r. Which condition guarantees a finite sum?",
      "The formula S∞ = a/(1 − r) requires |r| < 1, which is what makes the terms shrink towards zero fast enough "
      "for the total to settle.",
      options=[("|r| < 1", True), ("r > 0", False), ("a < r", False), ("|r| > 1", False)],
      points=2, subtopic="convergence condition",
      next_time="Only a ratio smaller than 1 in size makes the successive terms shrink."),
    Q(21, "arithmetic sequences", "hard", "B",
      "Three numbers form an arithmetic sequence. The first term is 5 and the third term is 21. What is the middle number?",
      "In an arithmetic sequence the middle term is the mean of its neighbours: (5 + 21)/2 = 13, giving d = 8. "
      "Halving the difference (8) alone gives the step, not the middle term.",
      options=[("13", True), ("8", False), ("16", False), ("26", False)],
      points=3, subtopic="arithmetic mean",
      next_time="With equal steps, the middle term is exactly halfway between the outer two."),
    Q(22, "modelling", "hard", "D",
      "Two membership models both start at $100. Model L adds $3 for every visit. Model E multiplies the total by "
      "1.5 for every block of visits completed, so it grows by a constant factor. Which statement is justified?",
      "A linear model (100 + 3n) grows by a constant amount each visit, while a doubling model grows by a constant "
      "factor. The exponential model starts lower but inevitably overtakes the linear one and then grows far "
      "faster, so 'linear is always cheaper' is false.",
      options=[("The doubling model eventually overtakes the linear one and then grows far faster", True),
               ("The linear model is always cheaper because it starts lower", False),
               ("Both models grow at the same rate because both start at 100", False),
               ("The doubling model exceeds the linear one after every single visit", False)],
      points=3, subtopic="comparing linear and exponential growth",
      next_time="Linear growth adds a constant; exponential growth multiplies by a constant, so it eventually dominates."),
]

# ─── Section B — structured investigations (23–45) ─────────────────────────────
SECTION_B = [
    Q(23, "arithmetic sequences", "hard", "C",
      "A theatre has 24 rows of seats. The first row has 18 seats and each row has 2 more seats than the row in "
      "front of it.\n\n(a) State the number of seats in the 10th row.\n(b) Calculate the total number of seats in "
      "the theatre.\n(c) A renovation adds one extra seat to every row. Explain how the total changes.",
      "u_n = 18 + 2(n − 1), so u_10 = 18 + 18 = 36 seats. The last row has 18 + 2(23) = 64 seats, so the total is "
      "24/2 × (18 + 64) = 12 × 82 = 984 seats. Adding one seat to every row adds 24 seats, giving 1 008 — the extra "
      "seats are not multiplied by the row number.",
      parts=[
          P("a", "(a)", "State the number of seats in the 10th row.", "numeric", 1,
            ["The first row has 18 seats and each row adds 2.",
             "u_n = 18 + 2(n − 1), so use n = 10."], strand="C(i)", answer=36, tol=0),
          P("b", "(b)", "State the number of seats in the last (24th) row.", "numeric", 2,
            ["Use n = 24 in the nth-term formula.",
             "18 + 2(23)."], strand="C(ii)", answer=64, tol=0),
          P("c", "(c)", "Calculate the total number of seats in the theatre.", "numeric", 3,
            ["S_n = n/2 × (first + last).",
             "24/2 × (18 + 64)."], strand="C(iii)", answer=984, tol=0, unit="seats"),
          P("d", "(d)", "Explain how the total changes when one seat is added to every row.", "text", 2,
            ["How many rows are there?",
             "Each row gains exactly one seat."], strand="C(iv)",
            accepted=["the total rises by 24 seats, one for each of the 24 rows, giving 1008",
                      "24 extra seats because every row gains one"]),
      ],
      tools=["rich_text", "math", "table"], requirement="text",
      guidance="Write the nth-term formula explicitly in (a); the same formula drives (b) and (c).",
      explanation="u_10 = 36, u_24 = 64, so S_24 = 12 × 82 = 984 seats. Adding one seat per row adds 24 seats.",
      next_time="For an arithmetic series find the first and last terms, then apply S_n = n/2 (u_1 + u_n).",
      marking="(a) 1 mark. (b) 2 marks: 1 for substituting n = 24, 1 for 64. (c) 3 marks: 1 for the formula, "
              "1 for 82, 1 for 984. (d) 2 marks: 1 for 24 seats, 1 for 1 008."),
    Q(24, "geometric sequences", "hard", "C",
      "A culture of bacteria doubles every 3 hours. It starts with 500 bacteria.\n\n(a) State the number of "
      "bacteria after 12 hours.\n(b) Explain why the number after t hours is not a linear function of t.\n"
      "(c) Calculate the number of complete 3-hour periods needed for the population to exceed 50 000.",
      "In 12 hours there are 4 doubling periods, so 500 × 2^4 = 8 000 bacteria. Each period multiplies the "
      "population by 2 rather than adding a fixed amount, so the growth is geometric: 500 × 2^(t/3). To exceed "
      "50 000 requires 2^(k) > 100, and 2^7 = 128 > 100 while 2^6 = 64, so 7 periods (21 hours).",
      parts=[
          P("a", "(a)", "State the number of doubling periods in 12 hours.", "numeric", 1,
            ["The population doubles every 3 hours.",
             "Divide 12 by 3."], strand="C(i)", answer=4, tol=0),
          P("b", "(b)", "Calculate the number of bacteria after 12 hours.", "numeric", 2,
            ["Multiply the starting 500 by 2 once for each period.",
             "500 × 2^4."], strand="C(ii)", answer=8000, tol=0, unit="bacteria"),
          P("c", "(c)", "Explain why the population is not a linear function of time.", "text", 2,
            ["Compare what happens in successive 3-hour periods.",
             "Is a constant amount added each period, or a constant factor?"], strand="C(iii)",
            accepted=["each period multiplies the population by 2 rather than adding a fixed number, so the growth is geometric (exponential), not linear",
                      "because the increase per period grows with the population: it doubles instead of rising by a constant"]),
          P("d", "(d)", "Calculate the number of complete periods needed to exceed 50 000 bacteria.", "numeric", 3,
            ["You need 500 × 2^k > 50 000, so 2^k > 100.",
             "2^6 = 64 and 2^7 = 128, so take the first k that works."], strand="C(iv)", answer=7, tol=0, unit="periods"),
      ],
      tools=["graph", "rich_text", "math"], requirement="graph",
      guidance="Plot the population against the period number in the workspace: the curve (not a straight line) is the evidence for (c).",
      explanation="Four periods give 500 × 16 = 8 000 bacteria. The growth is 500 × 2^(t/3), a geometric model. "
                  "2^k > 100 first holds at k = 7 (128), so 7 periods are needed.",
      next_time="Doubling is multiplication: count periods, then use a power. Compare with linear growth explicitly.",
      marking="(a) 1 mark. (b) 2 marks: 1 for 2^4, 1 for 8 000. (c) 2 marks: 1 for 'multiply by 2', 1 for the "
              "linear contrast. (d) 3 marks: 1 for the inequality 2^k > 100, 1 for testing powers, 1 for 7."),
    Q(25, "compound interest", "hard", "C",
      "Amara invests $5 000 at 4% per year compound interest. Her friend Ben invests $5 000 at 4% per year simple "
      "interest.\n\n(a) Calculate the value of Amara's investment after 5 years.\n(b) Calculate the value of Ben's "
      "investment after 5 years.\n(c) Explain why the difference grows each year.",
      "Amara: 5000 × 1.04^5 = 5000 × 1.2166529 = $6 083.26. Ben: 5000 + 5 × 200 = $6 000. The difference is "
      "$83.26 after 5 years and widens every year, because Amara earns interest on her accumulated interest while "
      "Ben always earns 4% of the original $5 000.",
      parts=[
          P("a", "(a)", "Calculate the value of Amara's investment after 5 years, to the nearest cent.", "numeric", 3,
            ["Use A = P(1 + r)^n with r = 0.04 and n = 5.",
             "5000 × 1.04^5."], strand="C(i)", answer=6083.26, tol=0.05, unit="$"),
          P("b", "(b)", "Calculate the value of Ben's investment after 5 years.", "numeric", 2,
            ["Simple interest adds 4% of $5 000 each year.",
             "5000 + 5 × 200."], strand="C(ii)", answer=6000, tol=0.01, unit="$"),
          P("c", "(c)", "Explain why the gap between the two investments widens each year.", "text", 3,
            ["What is each person's interest calculated on?",
             "Does Ben's interest ever earn interest?"], strand="C(iii)",
            accepted=["amara earns interest on the interest she has already received, so her balance grows by an increasing amount, while ben always earns 4% of the original $5000",
                      "compound interest is calculated on a growing balance; simple interest is always calculated on $5000"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Show P(1 + r)^n with the numbers substituted; the exponent is the point being assessed.",
      explanation="Amara: 5000(1.04)^5 = $6 083.26. Ben: 5000 + 5(200) = $6 000. The $83.26 gap exists because "
                  "Amara's interest compounds, so each year's interest is calculated on a larger balance.",
      next_time="Compound interest is geometric; simple interest is arithmetic. State the base each year's interest is calculated on.",
      marking="(a) 3 marks: 1 for the formula, 1 for 1.04^5, 1 for $6 083.26. (b) 2 marks: 1 for 5 × 200, 1 for "
              "$6 000. (c) 3 marks: 1 for 'interest on interest', 1 for the constant simple base, 1 for the widening gap."),
    Q(26, "limits of series", "hard", "D",
      "A ball is dropped from 2 m. After each bounce it rises to 60% of its previous height.\n\n(a) State the "
      "height after the first bounce.\n(b) Calculate the height after the third bounce.\n(c) Calculate the total "
      "vertical distance travelled before the ball comes to rest.",
      "The bounce heights form a geometric sequence 1.2, 0.72, 0.432, … with r = 0.6. The third bounce height is "
      "2 × 0.6³ = 0.432 m. The total distance is the 2 m fall plus twice the sum of all bounce heights: "
      "2 + 2(1.2/(1 − 0.6)) = 2 + 2(3) = 8 m.",
      parts=[
          P("a", "(a)", "State the height after the first bounce, in metres.", "numeric", 1,
            ["60% of the 2 m drop.", "2 × 0.6."], strand="D(i)", answer=1.2, tol=0.01, unit="m"),
          P("b", "(b)", "Calculate the height after the third bounce, in metres.", "numeric", 2,
            ["The heights form a geometric sequence with r = 0.6.",
             "2 × 0.6^3."], strand="D(ii)", answer=0.432, tol=0.002, unit="m"),
          P("c", "(c)", "Explain why the bounce distances are multiplied by 2 in the total distance.", "text", 3,
            ["Does the ball only go up, or up and then down?",
             "Each bounce contributes a rise and an equal fall."], strand="D(iii)",
            accepted=["each bounce is travelled going up and again coming down, so the bounce sum is counted twice, plus the original 2 m drop",
                      "the ball rises and falls through the same distance on every bounce"]),
          P("d", "(d)", "Calculate the total vertical distance before the ball comes to rest, in metres.", "numeric", 4,
            ["Sum the bounce heights with S∞ = a/(1 − r).",
             "Add the original 2 m fall and double the bounce sum."], strand="D(iv)", answer=8, tol=0.05, unit="m"),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Write the bounce heights as a sequence before summing; the doubling in (c) is where most marks are lost.",
      explanation="Bounce heights 1.2, 0.72, 0.432, … have sum 1.2/0.4 = 3 m. The ball travels that sum up and "
                  "down, so 2 × 3 = 6 m of bounces, plus the initial 2 m fall: 8 m in total.",
      next_time="In a bouncing-ball problem, list the bounce heights as a geometric sequence and remember each bounce is travelled twice.",
      marking="(a) 1 mark. (b) 2 marks: 1 for the ratio, 1 for 0.432. (c) 3 marks: 1 for 'up and down', 1 for the "
              "doubling, 1 for including the first drop. (d) 4 marks: 1 for S∞, 1 for 3 m, 1 for 6 m, 1 for 8 m."),
    Q(27, "geometric sequences", "hard", "C",
      "The 2nd term of a geometric sequence is 12 and the 5th term is 96.\n\n(a) Explain how to find the common "
      "ratio from these two terms.\n(b) Calculate the common ratio.\n(c) Calculate the first term.\n(d) State the "
      "7th term.",
      "u_5/u_2 = r³, so r³ = 96/12 = 8 and r = 2. Then u_2 = u_1 r gives 12 = 2u_1, so u_1 = 6, and "
      "u_7 = 6 × 2^6 = 384. Dividing the terms without taking the cube root (r = 8) is the common error.",
      parts=[
          P("a", "(a)", "Explain how the two terms give the common ratio.", "text", 2,
            ["Write u_2 and u_5 in terms of u_1 and r.",
             "How many factors of r separate the 2nd and 5th terms?"], strand="C(i)",
            accepted=["dividing u_5 by u_2 removes the first term and leaves r^3, because the terms are three positions apart",
                      "u_5/u_2 = r^3, so the ratio is the cube root of the quotient"]),
          P("b", "(b)", "Calculate the common ratio.", "numeric", 2,
            ["96 ÷ 12 = 8, and that equals r³.",
             "Take the cube root of 8."], strand="C(ii)", answer=2, tol=0),
          P("c", "(c)", "Calculate the first term.", "numeric", 2,
            ["u_2 = u_1 × r.",
             "12 = 2 × u_1."], strand="C(iii)", answer=6, tol=0),
          P("d", "(d)", "State the 7th term.", "numeric", 2,
            ["The 7th term is six multiplications of r after the first term.",
             "u_7 = 6 × 2^6."], strand="C(iv)", answer=384, tol=0),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="In (a) use the word 'divide' and the difference in position (3 steps); that is the reasoning being marked.",
      explanation="u_5/u_2 = r³ = 8 gives r = 2, so u_1 = 12/2 = 6 and u_7 = 6 × 2^6 = 384.",
      next_time="Dividing two terms of a geometric sequence gives r raised to the difference in their positions.",
      marking="(a) 2 marks: 1 for the division, 1 for 'three positions, so r cubed'. (b) 2 marks: 1 for 8, 1 for "
              "r = 2. (c) 2 marks: 1 for substituting, 1 for 6. (d) 2 marks: 1 for r^6, 1 for 384."),
    Q(28, "sigma notation", "hard", "D",
      "A savings plan pays $200 in month 1, $220 in month 2, $240 in month 3, and so on, increasing by $20 each "
      "month.\n\n(a) State the amount paid in month 12.\n(b) Calculate the total saved after 12 months.\n(c) Explain "
      "how many months are needed for the total to exceed $5 000, setting up the inequality you would solve.",
      "The amount in month n is 180 + 20n, so month 12 is $420. Total after 12 months = 12/2 × (200 + 420) = "
      "6 × 620 = $3 720. The total after n months is n/2 × (2(200) + (n − 1)20) = n(200 + 10(n − 1)) = 10n² + 190n. "
      "Solving 10n² + 190n > 5000 by testing whole months: n = 14 gives 1 960 + 2 660 = $4 620, still short, while "
      "n = 15 gives 2 250 + 2 850 = $5 100, so 15 months are needed.",
      parts=[
          P("a", "(a)", "State the amount paid in month 12, in dollars.", "numeric", 1,
            ["The amounts form an arithmetic sequence with d = 20.",
             "200 + 11 × 20."], strand="D(i)", answer=420, tol=0),
          P("b", "(b)", "Calculate the total saved after 12 months, in dollars.", "numeric", 3,
            ["S_n = n/2 × (first + last).",
             "12/2 × (200 + 420)."], strand="D(ii)", answer=3720, tol=0.01, unit="$"),
          P("c", "(c)", "State the total saved after 14 months, in dollars.", "numeric", 3,
            ["Use the formula with n = 14 and last term 200 + 13(20).",
             "14/2 × (200 + 460)."], strand="D(iii)", answer=4620, tol=0.01, unit="$"),
          P("d", "(d)", "State the first month for which the total exceeds $5 000.", "numeric", 2,
            ["Compare your 14-month total with 5000; it is still short.",
             "Add one more month's payment to your 14-month total and compare again."], strand="D(iv)", answer=15, tol=0, unit="months"),
      ],
      tools=["rich_text", "math", "table"], requirement="text",
      guidance="Build the monthly totals in the workspace table; the sequence of running totals answers (d) directly.",
      explanation="Month 12 is 200 + 11(20) = $420 and S_12 = 6(620) = $3 720. S_14 = 7(200 + 460) = $4 620, which "
                  "is still below 5000, while S_15 = 7.5(200 + 480) = $5 100 exceeds it, so 15 months are needed.",
      next_time="For 'when does the total exceed X', compute running sums and bracket the answer between two months rather than guessing.",
      marking="(a) 1 mark. (b) 3 marks: 1 for the formula, 1 for the last term, 1 for $3 720. (c) 3 marks: 1 for "
              "n = 14, 1 for the last term 460, 1 for $4 620. (d) 2 marks: 1 for comparing, 1 for 15 months."),
    Q(29, "exponential equations", "hard", "C",
      "The number of bacteria in a dish is modelled by N = 300 × 2^t, where t is in hours.\n\n(a) State the "
      "initial number of bacteria.\n(b) Calculate the number of bacteria after 5 hours.\n(c) Using logarithms, "
      "calculate the time for the population to reach 20 000, to 2 decimal places.",
      "At t = 0, N = 300. After 5 hours, N = 300 × 32 = 9 600. For 20 000 the equation is 300 × 2^t = 20 000, so "
      "2^t = 66.67 and t = log 66.67 ÷ log 2 ≈ 6.06 hours, which is consistent with 2^6 = 64 being just below 66.67.",
      parts=[
          P("a", "(a)", "State the initial number of bacteria.", "numeric", 1,
            ["Substitute t = 0.",
             "2^0 = 1."], strand="C(i)", answer=300, tol=0),
          P("b", "(b)", "Calculate the number of bacteria after 5 hours.", "numeric", 2,
            ["Substitute t = 5.",
             "300 × 32."], strand="C(ii)", answer=9600, tol=0, unit="bacteria"),
          P("c", "(c)", "State the value of 20 000 ÷ 300, to 3 significant figures.", "numeric", 2,
            ["Divide the target by the initial population.",
             "This equals 2^t."], strand="C(iii)", answer=66.7, tol=0.1),
          P("d", "(d)", "Calculate the time to reach 20 000 bacteria, to 2 decimal places.", "numeric", 3,
            ["Take logarithms of both sides: t = log(66.67) ÷ log(2).",
             "Your answer should be a little more than 6 hours."], strand="C(iv)", answer=6.06, tol=0.03, unit="hours"),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Show the logarithm step in (d); the division only sets up the equation.",
      explanation="N(0) = 300 and N(5) = 9 600. For 20 000, 2^t = 66.67 so t = log 66.67 / log 2 ≈ 6.06 hours.",
      next_time="To solve for an exponent, isolate the power and take logarithms of both sides.",
      marking="(a) 1 mark. (b) 2 marks: 1 for 2^5, 1 for 9 600. (c) 2 marks: 1 for the division, 1 for 66.7. "
              "(d) 3 marks: 1 for the log equation, 1 for the evaluated logarithms, 1 for 6.06."),
    Q(30, "quadratic functions", "hard", "D",
      "A ball is thrown upwards. Its height in metres after t seconds is h = 20t − 5t².\n\n(a) Calculate the "
      "height after 1 second.\n(b) Show that the ball returns to the ground at t = 4.\n(c) State the time at which "
      "the ball reaches its maximum height.\n(d) Calculate the maximum height.",
      "h(1) = 20 − 5 = 15 m. Setting h = 0 gives 5t(4 − t) = 0, so t = 0 or t = 4: the ball lands after 4 seconds. "
      "The curve is a downward parabola with its vertex halfway between the roots, at t = 2, where "
      "h = 40 − 20 = 20 m.",
      parts=[
          P("a", "(a)", "Calculate the height after 1 second, in metres.", "numeric", 1,
            ["Put t = 1 into the height equation, taking care with the squared term.",
             "20(1) − 5(1)²."], strand="D(i)", answer=15, tol=0, unit="m"),
          P("b", "(b)", "State the non-zero time at which the ball returns to the ground.", "numeric", 2,
            ["Set h = 0 and factorise.",
             "5t(4 − t) = 0."], strand="D(ii)", answer=4, tol=0, unit="s"),
          P("c", "(c)", "State the time of maximum height, in seconds.", "numeric", 2,
            ["The maximum is halfway between the two roots.",
             "Half of 4."], strand="D(iii)", answer=2, tol=0, unit="s"),
          P("d", "(d)", "Calculate the maximum height, in metres.", "numeric", 2,
            ["Substitute t = 2 into the height equation.",
             "40 − 20."], strand="D(iv)", answer=20, tol=0, unit="m"),
          P("e", "(e)", "Explain why the model cannot be used for t = 5.", "text", 2,
            ["What does the equation give at t = 5?",
             "Can a ball be below the ground?"], strand="D(iv)",
            accepted=["at t = 5 the equation gives −25 m, a negative height, and the ball has already landed, so the model only applies until t = 4",
                      "the ball has already hit the ground, so a negative height is not physically meaningful"]),
      ],
      tools=["graph", "rich_text", "math"], requirement="graph",
      guidance="Plot h = 20t − 5t² in the workspace and read the vertex from the graph to check (c) and (d).",
      explanation="h(1) = 15 m; the roots are t = 0 and t = 4; the vertex is at t = 2 giving h = 20 m. Beyond t = 4 "
                  "the formula produces negative heights, so the physical model stops at the landing time.",
      next_time="For a quadratic model, roots give the start and end, and the vertex lies halfway between them.",
      marking="(a) 1 mark. (b) 2 marks: 1 for factorising, 1 for t = 4. (c) 2 marks: 1 for the midpoint, 1 for 2 s. "
              "(d) 2 marks: 1 for substituting, 1 for 20 m. (e) 2 marks: 1 for the negative height, 1 for the "
              "valid range."),
    Q(31, "logarithms", "hard", "C",
      "The loudness of a sound in decibels is L = 10 log₁₀(I / I₀), where I₀ is the threshold of hearing.\n\n"
      "(a) State the loudness when I = 1 000 I₀.\n(b) State the loudness when I = 10 000 I₀.\n(c) Explain why "
      "multiplying the intensity by 10 adds exactly 10 decibels.",
      "L = 10 log 1000 = 10 × 3 = 30 dB, and L = 10 log 10000 = 40 dB. Multiplying I by 10 multiplies the ratio by "
      "10, and log(10x) = log x + 1, so L increases by 10 × 1 = 10 dB every time the intensity is ten times "
      "greater.",
      parts=[
          P("a", "(a)", "State the loudness when I = 1 000 I₀, in decibels.", "numeric", 1,
            ["The ratio I/I₀ is 1000.",
             "10 × log(1000) and log(1000) = 3."], strand="C(i)", answer=30, tol=0, unit="dB"),
          P("b", "(b)", "State the loudness when I = 10 000 I₀, in decibels.", "numeric", 1,
            ["The intensity ratio is now 10 000.",
             "log(10 000) = 4, so evaluate 10 × 4."], strand="C(i)", answer=40, tol=0, unit="dB"),
          P("c", "(c)", "Explain why a tenfold increase in intensity adds 10 dB.", "text", 3,
            ["Use log(10x) = log x + 1.",
             "The formula multiplies the logarithm by 10."], strand="C(ii)",
            accepted=["multiplying the intensity by ten adds 1 to the logarithm, and the formula multiplies the logarithm by 10, so the loudness rises by exactly 10 dB",
                      "because log(10x) = log x + 1, and 10 × 1 = 10 dB"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Quote the logarithm law you use in (c); the mark is for the law, not the arithmetic.",
      explanation="1000 I₀ gives 30 dB and 10 000 I₀ gives 40 dB. Since log(10x) = log x + 1, each tenfold increase "
                  "in intensity adds 10 dB, which is why decibels are a logarithmic scale.",
      next_time="A logarithmic scale turns multiplication into addition: a constant factor becomes a constant difference.",
      marking="(a) 1 mark. (b) 1 mark. (c) 3 marks: 1 for the log law, 1 for the ×10 in the formula, 1 for the "
              "10 dB conclusion."),
    Q(32, "geometric sequences", "hard", "D",
      "A car loses 15% of its value each year. It cost $24 000 when new.\n\n(a) State the multiplier for one year "
      "of depreciation.\n(b) Calculate the value after 3 years, to the nearest dollar.\n(c) Calculate the number of "
      "complete years after which the value first falls below $8 000, testing successive years.",
      "The multiplier is 0.85. After 3 years the value is 24000 × 0.85³ = 24000 × 0.614125 = $14 739. Successive "
      "values: 20 400, 17 340, 14 739, 12 528, 10 649, 9 052, 7 694 — so the value first falls below $8 000 after "
      "7 complete years.",
      parts=[
          P("a", "(a)", "State the depreciation multiplier for one year.", "numeric", 1,
            ["A 15% loss leaves 85% of the value.",
             "Write 85% as a decimal."], strand="D(i)", answer=0.85, tol=0.001),
          P("b", "(b)", "Calculate the value after 3 years, to the nearest dollar.", "numeric", 3,
            ["Use 24000 × 0.85^3.",
             "0.85³ = 0.614125."], strand="D(ii)", answer=14739, tol=1, unit="$"),
          P("c", "(c)", "Calculate the value after 6 years, to the nearest dollar.", "numeric", 3,
            ["0.85^6 ≈ 0.37715.",
             "24000 × 0.37715."], strand="D(iii)", answer=9052, tol=3, unit="$"),
          P("d", "(d)", "State the number of complete years before the value first falls below $8 000.", "numeric", 2,
            ["Your 6-year value is still above 8000.",
             "Multiply by 0.85 once more and compare."], strand="D(iv)", answer=7, tol=0, unit="years"),
      ],
      tools=["rich_text", "math", "table"], requirement="text",
      guidance="Tabulate the year-by-year values in the workspace; (d) needs the bracketing years, not a guess.",
      explanation="Multiplier 0.85. Value after 3 years $14 739 and after 6 years $9 052. After 7 years "
                  "9 052 × 0.85 ≈ $7 694, the first value below $8 000.",
      next_time="For 'when does the value fall below X', compute successive values and bracket the threshold.",
      marking="(a) 1 mark. (b) 3 marks: 1 for the power, 1 for 0.614125, 1 for $14 739. (c) 3 marks: 1 for the "
              "sixth power, 1 for the product, 1 for $9 052. (d) 2 marks: 1 for the 7th year value, 1 for 7."),
    Q(33, "geometric sequences", "hard", "D",
      "In a geometric sequence the first term is 8 and the common ratio is 1/2.\n\n(a) Write the first four "
      "terms.\n(b) Calculate the sum of the first 6 terms.\n(c) Calculate the sum to infinity.\n(d) Explain why the "
      "sum of the first 6 terms is already close to the sum to infinity.",
      "The terms are 8, 4, 2, 1, 0.5, 0.25. S_6 = 8(1 − (1/2)^6)/(1 − 1/2) = 8(63/64)/(0.5) = 15.75. "
      "S∞ = 8/(1 − 0.5) = 16. The difference is only 0.25, because the terms halve so quickly that the remaining "
      "tail is tiny.",
      parts=[
          P("a", "(a)", "State the 4th term.", "numeric", 1,
            ["Multiply by 1/2 for each successive term.",
             "8, 4, 2, then one more halving."], strand="D(i)", answer=1, tol=0),
          P("b", "(b)", "Calculate the sum of the first 6 terms.", "numeric", 3,
            ["Use S_n = a(1 − r^n)/(1 − r).",
             "8(1 − 1/64)/(0.5)."], strand="D(ii)", answer=15.75, tol=0.02),
          P("c", "(c)", "Calculate the sum to infinity.", "numeric", 2,
            ["S∞ = a/(1 − r) because |r| < 1.",
             "8 ÷ 0.5."], strand="D(iii)", answer=16, tol=0),
          P("d", "(d)", "Explain why six terms already give almost the whole sum.", "text", 3,
            ["Compare your two sums.",
             "What size is the remaining tail after six terms?"], strand="D(iv)",
            accepted=["the sixth term is only 0.25 and every later term is smaller still, so the tail beyond six terms adds just 0.25 to reach 16",
                      "the terms halve so the remaining sum is tiny: 16 − 15.75 = 0.25"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Keep the fraction 63/64 in (b) until the last step; the exact form makes (d) easy.",
      explanation="Terms 8, 4, 2, 1, 0.5, 0.25 give S_6 = 15.75 and S∞ = 16; the missing tail is exactly 0.25, the "
                  "seventh term onwards, which halves away rapidly.",
      next_time="For |r| < 1 the tail after n terms is r^n/(1 − r) times the first term: it shrinks geometrically.",
      marking="(a) 1 mark. (b) 3 marks: 1 for the formula, 1 for 63/64, 1 for 15.75. (c) 2 marks: 1 for the "
              "formula, 1 for 16. (d) 3 marks: 1 for the comparison, 1 for the 0.25 tail, 1 for the halving argument."),
    Q(34, "arithmetic sequences", "hard", "C",
      "A ladder has rungs whose lengths form an arithmetic sequence. The bottom rung is 60 cm and each rung above "
      "it is 2 cm shorter. There are 14 rungs.\n\n(a) State the length of the top rung.\n(b) Calculate the total "
      "length of timber needed for all 14 rungs.\n(c) Explain why the average rung length is the mean of the top "
      "and bottom rungs.",
      "u_14 = 60 − 2(13) = 34 cm. Total = 14/2 × (60 + 34) = 7 × 94 = 658 cm. In an arithmetic sequence the terms "
      "are evenly spaced, so the middle value — and hence the mean — is the average of the two end terms, whether "
      "the number of terms is odd or even.",
      parts=[
          P("a", "(a)", "State the length of the top rung, in centimetres.", "numeric", 1,
            ["13 steps of 2 cm separate the 1st and 14th rungs.",
             "60 − 2(13)."], strand="C(i)", answer=34, tol=0, unit="cm"),
          P("b", "(b)", "Calculate the total length of timber, in centimetres.", "numeric", 3,
            ["The rung lengths form an arithmetic series: S_n = n/2 × (first + last).",
             "There are 14 rungs, so evaluate 7 × 94."], strand="C(ii)", answer=658, tol=0, unit="cm"),
          P("c", "(c)", "State the mean rung length, in centimetres.", "numeric", 1,
            ["The mean is the total divided by 14.",
             "Or use (60 + 34)/2."], strand="C(iii)", answer=47, tol=0, unit="cm"),
          P("d", "(d)", "Explain why the mean equals the average of the end rungs.", "text", 3,
            ["Write the terms and pair the first with the last.",
             "Do the pairs have equal sums?"], strand="C(iv)",
            accepted=["in an arithmetic sequence the terms are evenly spaced, so first plus last equals second plus second-last and so on; every pair has the same sum, making the mean the average of the two end terms",
                      "the terms are symmetric about the middle value, so the mean is halfway between the first and last terms"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="The pairing argument in (d) is what earns the marks — not a numerical example.",
      explanation="Top rung 34 cm gives S_14 = 7(94) = 658 cm and a mean of 47 cm. In an arithmetic sequence the "
                  "symmetric pairs all have the same total, so the mean is the average of the end terms.",
      next_time="An arithmetic mean of the end terms works because of the symmetry of equal steps; say so explicitly.",
      marking="(a) 1 mark. (b) 3 marks: 1 for the formula, 1 for 94, 1 for 658. (c) 1 mark. (d) 3 marks: 1 for "
              "even spacing, 1 for the pairing, 1 for the conclusion."),
    Q(35, "modelling", "hard", "D",
      "A town's population P after t years is modelled as P = 12 000 × 1.03^t.\n\n(a) State the population "
      "growth rate per year.\n(b) Calculate the population after 10 years, to the nearest whole person.\n(c) "
      "Calculate the time for the population to double, to 2 decimal places.\n(d) State one limitation of this "
      "model.",
      "The multiplier 1.03 means a 3% increase each year. P(10) = 12000 × 1.03^10 = 12000 × 1.3439 = 16 127. "
      "Doubling needs 1.03^t = 2, so t = log 2 / log 1.03 ≈ 23.45 years. The model assumes a constant rate: "
      "resources, migration and policy changes are ignored.",
      parts=[
          P("a", "(a)", "State the annual growth rate, as a percentage.", "numeric", 1,
            ["Subtract 1 from the multiplier 1.03.",
             "0.03 as a percentage."], strand="D(i)", answer=3, tol=0, unit="%"),
          P("b", "(b)", "Calculate the population after 10 years.", "numeric", 3,
            ["Substitute t = 10.",
             "1.03^10 ≈ 1.3439."], strand="D(ii)", answer=16127, tol=2, unit="people"),
          P("c", "(c)", "Calculate the doubling time, in years, to 2 decimal places.", "numeric", 3,
            ["Solve 1.03^t = 2 using logarithms.",
             "t = log 2 ÷ log 1.03."], strand="D(iii)", answer=23.45, tol=0.05, unit="years"),
          P("d", "(d)", "State and justify one limitation of the model.", "text", 2,
            ["Does a real population grow at a constant rate forever?",
             "What about migration, housing or resources?"], strand="D(iv)",
            accepted=["it assumes a constant 3% growth forever, but real populations are limited by housing, resources and migration, so the rate will not stay constant",
                      "the constant rate ignores constraints such as food, space and policy that slow real growth"]),
      ],
      tools=["graph", "rich_text", "math"], requirement="graph",
      guidance="Plot the model in the workspace to check the doubling time visually before computing it.",
      explanation="The multiplier 1.03 is a 3% annual increase. P(10) ≈ 16 127. Doubling: t = log 2 / log 1.03 ≈ "
                  "23.45 years. The model assumes unlimited growth at a constant rate, which no real town sustains.",
      next_time="For an exponential model, the base gives the rate and logarithms give the time to reach a target.",
      marking="(a) 1 mark. (b) 3 marks: 1 for substitution, 1 for 1.03^10, 1 for 16 127. (c) 3 marks: 1 for the "
              "log equation, 1 for the evaluated logs, 1 for 23.45. (d) 2 marks: 1 for a valid limitation, 1 for "
              "justification."),
    Q(36, "quadratic functions", "hard", "D",
      "A rectangle has a perimeter of 40 cm. Its length is x cm.\n\n(a) Write the width in terms of x.\n"
      "(b) Show that the area is A = 20x − x².\n(c) State the value of x that maximises the area.\n(d) Calculate "
      "the maximum area.",
      "The width is 20 − x. Area = x(20 − x) = 20x − x². Completing the square gives A = 100 − (x − 10)², so the "
      "maximum is at x = 10, where A = 100 cm²: the rectangle is a 10 cm square.",
      parts=[
          P("a", "(a)", "State the width when the length is x, in centimetres.", "expression", 1,
            ["The two lengths and two widths total 40.",
             "So one length plus one width is 20."], strand="D(i)", accepted=["20 - x", "20 − x", "(40 − 2x)/2"]),
          P("b", "(b)", "State the coefficient of x in the area expression 20x − x².", "numeric", 1,
            ["The area is length × width.",
             "Multiply out x(20 − x)."], strand="D(ii)", answer=20, tol=0),
          P("c", "(c)", "State the length that maximises the area, in centimetres.", "numeric", 2,
            ["Complete the square: A = 100 − (x − 10)².",
             "The squared term is smallest when it is zero."], strand="D(iii)", answer=10, tol=0, unit="cm"),
          P("d", "(d)", "Calculate the maximum area, in square centimetres.", "numeric", 2,
            ["Substitute x = 10 into 20x − x².",
             "200 − 100."], strand="D(iv)", answer=100, tol=0, unit="cm²"),
          P("e", "(e)", "Describe the shape of the rectangle with the maximum area.", "text", 1,
            ["What are its length and width at the maximum?",
             "A rectangle with equal sides has a special name."], strand="D(iv)",
            accepted=["a square with sides of 10 cm", "it is a 10 cm square"]),
      ],
      tools=["rich_text", "math", "graph"], requirement="text",
      guidance="Complete the square in (c); it proves the maximum rather than assuming the midpoint.",
      explanation="Width 20 − x gives A = 20x − x², and completing the square gives 100 − (x − 10)², so the maximum "
                  "area is 100 cm² at x = 10: a square.",
      next_time="A downward parabola y = −(x − h)² + k peaks at x = h; completing the square locates it exactly.",
      marking="(a) 1 mark. (b) 1 mark. (c) 2 marks: 1 for completing the square, 1 for x = 10. (d) 2 marks: "
              "1 for substituting, 1 for 100. (e) 1 mark."),
    Q(37, "compound interest", "hard", "D",
      "A loan of $6 000 charges 1.5% interest per month on the outstanding balance. No repayments are made for 8 "
      "months.\n\n(a) State the monthly multiplier.\n(b) Calculate the amount owed after 8 months, to the nearest "
      "cent.\n(c) Calculate the total interest charged. Explain why this exceeds 8 × 1.5% of $6 000.",
      "The multiplier is 1.015. After 8 months the debt is 6000 × 1.015^8 = 6000 × 1.12649 = $6 758.94. The "
      "interest is $758.94, more than the $720 that 8 simple monthly charges would give, because each month's "
      "interest is charged on the balance that already includes earlier interest.",
      parts=[
          P("a", "(a)", "State the monthly multiplier.", "numeric", 1,
            ["A 1.5% charge adds 1.5% of the balance.",
             "Write 101.5% as a decimal."], strand="D(i)", answer=1.015, tol=0.0005),
          P("b", "(b)", "Calculate the amount owed after 8 months, to the nearest cent.", "numeric", 3,
            ["Use 6000 × 1.015^8.",
             "1.015^8 ≈ 1.12649."], strand="D(ii)", answer=6758.94, tol=0.05, unit="$"),
          P("c", "(c)", "Calculate the total interest charged.", "numeric", 1,
            ["Interest paid is the amount owed minus the money borrowed.",
             "Subtract $6 000 from your 8-month balance."], strand="D(iii)", answer=758.94, tol=0.05, unit="$"),
          P("d", "(d)", "Explain why the interest exceeds 8 × 1.5% of $6 000.", "text", 3,
            ["What balance is each month's 1.5% charged on?",
             "Does the balance stay at $6 000?"], strand="D(iv)",
            accepted=["each month's interest is charged on a balance that already includes earlier interest, so the interest itself earns interest and the total exceeds the $720 a constant charge would give",
                      "because the balance grows: the later 1.5% charges are applied to larger amounts"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Give the exact formula in (b) and compare with $720 explicitly in (d).",
      explanation="6000 × 1.015^8 = $6 758.94, so the interest is $758.94 against $720 for constant simple "
                  "charges, because the balance compounds monthly.",
      next_time="Monthly compounding multiplies the balance repeatedly, so the total interest exceeds the sum of the simple monthly rates.",
      marking="(a) 1 mark. (b) 3 marks: 1 for the power, 1 for 1.12649, 1 for $6 758.94. (c) 1 mark. (d) 3 marks: "
              "1 for the growing balance, 1 for the $720 comparison, 1 for the consequence."),
    Q(38, "limits of series", "hard", "C",
      "A fractal design is built from squares. The first square has area 64 cm². Each new square has 1/4 of the "
      "area of the previous one, and the design contains infinitely many squares.\n\n(a) State the area of the "
      "second square.\n(b) Calculate the total area of the first 3 squares.\n(c) Calculate the total area of the "
      "infinite design.\n(d) Explain why infinitely many squares occupy a finite area.",
      "The second square has area 16 cm². The first three total 64 + 16 + 4 = 84 cm². The infinite sum is "
      "64/(1 − 0.25) = 64/0.75 = 85.33 cm². Each additional square adds a quarter of the previous one, so the "
      "additions shrink faster than they accumulate and the total converges.",
      parts=[
          P("a", "(a)", "State the area of the second square, in square centimetres.", "numeric", 1,
            ["Each square has a quarter of the area of the one before.",
             "Divide 64 by 4."], strand="C(i)", answer=16, tol=0, unit="cm²"),
          P("b", "(b)", "Calculate the total area of the first three squares.", "numeric", 2,
            ["The third square has area 4.",
             "64 + 16 + 4."], strand="C(ii)", answer=84, tol=0, unit="cm²"),
          P("c", "(c)", "Calculate the total area of the infinite design, to 2 decimal places.", "numeric", 3,
            ["Use S∞ = a/(1 − r) with a = 64 and r = 0.25.",
             "64 ÷ 0.75."], strand="C(iii)", answer=85.33, tol=0.02, unit="cm²"),
          P("d", "(d)", "Explain why infinitely many squares can occupy a finite area.", "text", 3,
            ["How much does each new square add compared with the last?",
             "Does the running total keep growing without limit?"], strand="C(iv)",
            accepted=["each new square adds only a quarter of the previous one, so the increments shrink geometrically and the running total converges to 85.33 cm² rather than growing without bound",
                      "the areas form a convergent geometric series because the ratio 0.25 is less than 1"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Quote your running totals in (d) — the convergence is shown by the numbers, not by the word 'infinite'.",
      explanation="Areas 64, 16, 4, … sum to 64/(1 − 0.25) = 85.33 cm². Because each increment is a quarter of the "
                  "last, the total converges: an infinite number of squares with a finite combined area.",
      next_time="An infinite geometric series with |r| < 1 converges; the sum is a/(1 − r).",
      marking="(a) 1 mark. (b) 2 marks: 1 for the third term, 1 for 84. (c) 3 marks: 1 for the formula, 1 for "
              "0.75, 1 for 85.33. (d) 3 marks: 1 for the shrinking increment, 1 for convergence, 1 for the finite "
              "limit."),
    Q(39, "indices", "hard", "C",
      "Simplify and evaluate each expression, showing the index law used.\n\n(a) 3^4 × 3^2 ÷ 3^3\n(b) (5^3)^2 ÷ "
      "5^4\n(c) 2^−3 × 2^5",
      "3^4 × 3^2 ÷ 3^3 = 3^(4 + 2 − 3) = 3^3 = 27. (5^3)^2 ÷ 5^4 = 5^6 ÷ 5^4 = 5^2 = 25. 2^−3 × 2^5 = 2^2 = 4.",
      parts=[
          P("a", "(a)", "Evaluate 3^4 × 3^2 ÷ 3^3.", "numeric", 2,
            ["Multiply by adding the indices, divide by subtracting.",
             "4 + 2 − 3 = 3, so the answer is 3^3."], strand="C(i)", answer=27, tol=0),
          P("b", "(b)", "Evaluate (5^3)^2 ÷ 5^4.", "numeric", 2,
            ["A power of a power multiplies the indices: (5^3)^2 = 5^6.",
             "Then subtract the index 4."], strand="C(ii)", answer=25, tol=0),
          P("c", "(c)", "Evaluate 2^−3 × 2^5.", "numeric", 2,
            ["Add the indices: −3 + 5 = 2.",
             "Then evaluate 2^2."], strand="C(iii)", answer=4, tol=0),
          P("d", "(d)", "State the index law used to simplify 2^−3 × 2^5, in the form a^m × a^n = …", "expression", 1,
            ["What happens to the indices when powers of the same base are multiplied?",
             "State the law in the form a^m × a^n = …"],
            strand="C(iii)",
            accepted=["add the indices when multiplying powers of the same base",
                      "a^m × a^n = a^(m+n)"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Write each law before applying it; the final values alone will not earn full marks.",
      explanation="(a) 3^(4+2−3) = 3^3 = 27. (b) 5^(6−4) = 5^2 = 25. (c) 2^(−3+5) = 2^2 = 4. The laws are: add "
                  "indices when multiplying, subtract when dividing, multiply when raising a power to a power.",
      next_time="Handle the indices first, then evaluate the single remaining power.",
      marking="(a) 2 marks: 1 for the combined index, 1 for 27. (b) 2 marks: 1 for 5^6, 1 for 25. (c) 2 marks: "
              "1 for 2^2, 1 for 4. (d) 1 mark."),
    Q(40, "modelling", "hard", "D",
      "A runner's weekly distance increases by 10% each week. She runs 12 km in week 1.\n\n(a) Calculate the "
      "distance in week 4, to 2 decimal places.\n(b) Calculate the total distance run in the first 6 weeks.\n(c) "
      "Explain why this plan cannot continue indefinitely, using a calculation for week 30.",
      "Distances are 12 × 1.1^(n−1): week 4 = 12 × 1.331 = 15.97 km. The six-week total is 12(1.1^6 − 1)/0.1 = "
      "12(0.771561)/0.1 = 92.59 km. By week 30 the weekly run would be 12 × 1.1^29 ≈ 12 × 15.863 = 190 km in a "
      "week, which no runner could sustain — the model ignores human limits.",
      parts=[
          P("a", "(a)", "Calculate the distance in week 4, to 2 decimal places.", "numeric", 2,
            ["The multiplier is 1.1 and week 1 is the starting point.",
             "12 × 1.1^3."], strand="D(i)", answer=15.97, tol=0.02, unit="km"),
          P("b", "(b)", "Calculate the total distance for the first 6 weeks, to 2 decimal places.", "numeric", 3,
            ["Use S_n = a(r^n − 1)/(r − 1) with r = 1.1.",
             "12(1.1^6 − 1)/0.1."], strand="D(ii)", answer=92.59, tol=0.05, unit="km"),
          P("c", "(c)", "Calculate the weekly distance predicted for week 30, to the nearest kilometre.", "numeric", 3,
            ["Use 12 × 1.1^29.",
             "1.1^29 ≈ 15.86."], strand="D(iii)", answer=190, tol=2, unit="km"),
          P("d", "(d)", "Explain why the plan cannot continue indefinitely.", "text", 2,
            ["Compare 190 km per week with what a person can run.",
             "Can growth at 10% per week be sustained?"], strand="D(iv)",
            accepted=["week 30 would demand about 190 km in a week, far beyond sustainable human training, so the exponential model must fail: real training plateaus",
                      "the model predicts an impossible weekly distance by week 30, so growth must eventually slow"]),
      ],
      tools=["graph", "rich_text", "math"], requirement="graph",
      guidance="Plot the weekly distances in the workspace; the shape is the argument for (d).",
      explanation="Week 4 is 12 × 1.1³ = 15.97 km; the six-week total is 92.59 km. Week 30 would be 12 × 1.1^29 ≈ "
                  "190 km, which is not physically sustainable, so the model breaks down.",
      next_time="An exponential model may fit the early data yet fail eventually; always test it at a distant value.",
      marking="(a) 2 marks: 1 for 1.1^3, 1 for 15.97. (b) 3 marks: 1 for the sum formula, 1 for 0.771561, 1 for "
              "92.59. (c) 3 marks: 1 for the power, 1 for 15.86, 1 for 190. (d) 2 marks: 1 for the impossible "
              "distance, 1 for the conclusion."),
    Q(41, "exponential equations", "hard", "D",
      "An investment of $3 000 grows at 6% per year compound interest.\n\n(a) Write the value after n years as an "
      "expression.\n(b) Calculate the value after 12 years, to the nearest cent.\n(c) Using logarithms, calculate "
      "the number of years for the investment to reach $6 000, to 2 decimal places.\n(d) Explain why the doubling "
      "time is the same whatever the initial amount.",
      "Value = 3000(1.06)^n. After 12 years: 3000 × 1.06^12 = 3000 × 2.012196 = $6 036.59. Doubling needs "
      "1.06^n = 2, so n = log 2 / log 1.06 ≈ 11.90 years. The starting amount cancels in the equation "
      "P(1.06)^n = 2P, so the doubling time depends only on the rate.",
      parts=[
          P("a", "(a)", "Calculate the value after 12 years, to the nearest cent.", "numeric", 3,
            ["Use 3000 × 1.06^12.",
             "1.06^12 ≈ 2.0122."], strand="D(i)", answer=6036.59, tol=0.05, unit="$"),
          P("b", "(b)", "State the value of 6000 ÷ 3000, the factor by which the money must grow.", "numeric", 1,
            ["Divide the target by the starting amount.",
             "This equals 1.06^n."], strand="D(ii)", answer=2, tol=0),
          P("c", "(c)", "Calculate the number of years to double, to 2 decimal places.", "numeric", 3,
            ["Solve 1.06^n = 2 with logarithms.",
             "n = log 2 ÷ log 1.06."], strand="D(iii)", answer=11.9, tol=0.05, unit="years"),
          P("d", "(d)", "Explain why the doubling time does not depend on the initial amount.", "text", 3,
            ["Write the doubling equation with P as the starting amount.",
             "Does P cancel?"], strand="D(iv)",
            accepted=["doubling requires P(1.06)^n = 2P, and dividing both sides by P leaves 1.06^n = 2, so the starting amount cancels and only the rate matters",
                      "the initial amount appears on both sides of the doubling equation and cancels"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Write the doubling equation with a symbol P in (d); the cancellation is the whole argument.",
      explanation="3000(1.06)^12 = $6 036.59. Doubling solves 1.06^n = 2, giving n ≈ 11.90 years; the factor 2 is "
                  "independent of the amount invested, so the doubling time depends only on the rate.",
      next_time="Growth factors are ratios, so doubling times depend on the rate alone — divide out the initial amount.",
      marking="(a) 3 marks: 1 for the power, 1 for 2.0122, 1 for $6 036.59. (b) 1 mark. (c) 3 marks: 1 for the log "
              "equation, 1 for the evaluated logs, 1 for 11.90. (d) 3 marks: 1 for the equation with P, 1 for the "
              "cancellation, 1 for the conclusion."),
    Q(42, "arithmetic series", "hard", "D",
      "A pile of logs has 1 log in the top row, 2 in the next, 3 in the next, and so on down to 20 rows.\n\n"
      "(a) Calculate the total number of logs.\n(b) Explain why the total is the 20th triangular number.\n(c) A "
      "second pile has 25 rows. Calculate how many more logs it contains than the first pile.",
      "The total is 1 + 2 + … + 20 = 20 × 21/2 = 210 logs. Each row number equals the row's content, so the sum is "
      "the 20th triangular number n(n + 1)/2. The 25-row pile holds 25 × 26/2 = 325, which is 115 more.",
      parts=[
          P("a", "(a)", "Calculate the total number of logs in the 20-row pile.", "numeric", 3,
            ["Use S_n = n(n + 1)/2.",
             "20 × 21 ÷ 2."], strand="D(i)", answer=210, tol=0, unit="logs"),
          P("b", "(b)", "Explain why the total is a triangular number.", "text", 2,
            ["What is the number of logs in row r?",
             "What does 'triangular number' describe?"], strand="D(ii)",
            accepted=["row r contains r logs, so the total is 1 + 2 + … + 20, which is exactly the definition of the 20th triangular number T_20 = n(n + 1)/2",
                      "the row number equals the number of logs in it, so the total of the first n rows is the nth triangular number"]),
          P("c", "(c)", "Calculate the total number of logs in a 25-row pile.", "numeric", 3,
            ["Use n = 25 in n(n + 1)/2.",
             "25 × 26 ÷ 2."], strand="D(iii)", answer=325, tol=0, unit="logs"),
          P("d", "(d)", "Calculate how many more logs the 25-row pile contains.", "numeric", 2,
            ["Both piles start with 1 log in the top row, so compare the totals.",
             "Subtract 210 from 325."], strand="D(iv)", answer=115, tol=0, unit="logs"),
      ],
      tools=["rich_text", "math", "table"], requirement="text",
      guidance="Show the triangular-number formula in (a); the structure is the point, not the addition.",
      explanation="1 + 2 + … + 20 = 210, the 20th triangular number. The 25-row pile holds 325 logs, so the "
                  "difference is 115 — rows 21 to 25 alone contribute 21 + 22 + 23 + 24 + 25 = 115.",
      next_time="Triangular numbers sum consecutive integers: T_n = n(n + 1)/2, and differences of totals are sums of the extra rows.",
      marking="(a) 3 marks: 1 for the formula, 1 for 20 × 21, 1 for 210. (b) 2 marks: 1 for 'row r has r logs', "
              "1 for the triangular-number link. (c) 3 marks: 1 for n = 25, 1 for 650/2, 1 for 325. (d) 2 marks: "
              "1 for the subtraction, 1 for 115."),
    Q(43, "quadratic functions", "hard", "D",
      "The profit P (in dollars) of a stall selling n items is modelled by P = −2n² + 80n − 350.\n\n(a) Calculate "
      "the profit when 10 items are sold.\n(b) Calculate the two break-even values of n by solving "
      "−2n² + 80n − 350 = 0.\n(c) State the number of items that maximises profit.\n(d) Calculate the maximum "
      "profit.",
      "P(10) = −200 + 800 − 350 = $250. Dividing by −2 gives n² − 40n + 175 = 0, whose factors are (n − 5)(n − 35), "
      "so the stall breaks even at n = 5 and n = 35. The maximum lies halfway at n = 20, giving P = −800 + 1600 − "
      "350 = $450.",
      parts=[
          P("a", "(a)", "Calculate the profit when 10 items are sold, in dollars.", "numeric", 2,
            ["Substitute n = 10 carefully, keeping the minus sign on the squared term.",
             "−200 + 800 − 350."], strand="D(i)", answer=250, tol=0, unit="$"),
          P("b", "(b)", "State the smaller break-even value of n.", "numeric", 2,
            ["Divide the equation by −2 to simplify.",
             "(n − 5)(n − 35) = 0."], strand="D(ii)", answer=5, tol=0, unit="items"),
          P("c", "(c)", "State the larger break-even value of n.", "numeric", 2,
            ["You already have one root, n = 5; the other factor supplies the second.",
             "Set n − 35 = 0."], strand="D(ii)", answer=35, tol=0, unit="items"),
          P("d", "(d)", "State the number of items that maximises profit.", "numeric", 2,
            ["The vertex lies halfway between the two roots.",
             "(5 + 35) ÷ 2."], strand="D(iii)", answer=20, tol=0, unit="items"),
          P("e", "(e)", "Calculate the maximum profit, in dollars.", "numeric", 2,
            ["Substitute n = 20 into the profit model.",
             "−800 + 1600 − 350."], strand="D(iv)", answer=450, tol=0, unit="$"),
      ],
      tools=["graph", "rich_text", "math"], requirement="graph",
      guidance="Plot the profit curve in the workspace: the roots and the vertex are visible on the graph and confirm your algebra.",
      explanation="P(10) = $250. Solving n² − 40n + 175 = 0 gives n = 5 and n = 35; the profit is positive between "
                  "them. The vertex at n = 20 gives the maximum profit of $450.",
      next_time="For a quadratic model, break-even points are the roots and the optimum is at the vertex, halfway between them.",
      marking="(a) 2 marks: 1 for substitution, 1 for $250. (b) 2 marks: 1 for factorising, 1 for 5. (c) 2 marks. "
              "(d) 2 marks: 1 for the midpoint, 1 for 20. (e) 2 marks: 1 for substitution, 1 for $450."),
    Q(44, "limits of series", "hard", "C",
      "A geometric series has first term 18 and common ratio −1/3.\n\n(a) Write the first four terms.\n(b) "
      "Calculate the sum of the first 4 terms.\n(c) Explain why the series converges even though the ratio is "
      "negative.\n(d) Calculate the sum to infinity.",
      "The terms are 18, −6, 2, −2/3. S_4 = 18 − 6 + 2 − 0.6667 = 13.3333 = 40/3. The series converges because "
      "|−1/3| = 1/3 < 1: convergence depends on the SIZE of the ratio, not its sign. S∞ = 18/(1 + 1/3) = 18 ÷ 4/3 = "
      "13.5.",
      parts=[
          P("a", "(a)", "State the fourth term.", "numeric", 1,
            ["Multiply by −1/3 each time: 18, −6, 2, …",
             "2 × (−1/3)."], strand="C(i)", answer=-0.667, tol=0.002),
          P("b", "(b)", "Calculate the sum of the first 4 terms, to 3 decimal places.", "numeric", 3,
            ["Keep the signs: the odd-powered terms are negative.",
             "Add 18 − 6 + 2 − 2/3."], strand="C(ii)", answer=13.333, tol=0.02),
          P("c", "(c)", "Explain why the series converges despite the negative ratio.", "text", 3,
            ["What is |−1/3|?",
             "Does convergence depend on the sign of r?"], strand="C(iii)",
            accepted=["the series converges because the size of the ratio, 1/3, is less than 1; the negative sign only makes the terms alternate in sign",
                      "convergence requires |r| < 1, and |−1/3| = 1/3, so it converges even though the terms alternate"]),
          P("d", "(d)", "Calculate the sum to infinity.", "numeric", 3,
            ["Use S∞ = a/(1 − r) with r = −1/3.",
             "The denominator becomes 1 + 1/3 = 4/3."], strand="C(iv)", answer=13.5, tol=0.02),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Keep the signs in (b); the alternating terms are what make the estimate in (c) sensible.",
      explanation="Terms 18, −6, 2, −2/3 give S_4 = 40/3 ≈ 13.333, already close to S∞ = 18/(4/3) = 13.5, because "
                  "|r| = 1/3 < 1 despite the alternating signs.",
      next_time="Convergence depends on |r|, not the sign: a negative ratio alternates but still shrinks.",
      marking="(a) 1 mark. (b) 3 marks: 1 for listing the terms, 1 for the signed sum, 1 for 13.333. (c) 3 marks: "
              "1 for |r|, 1 for the sign's effect, 1 for the conclusion. (d) 3 marks: 1 for the formula, 1 for 4/3, "
              "1 for 13.5."),
    Q(45, "modelling", "hard", "D",
      "A phone battery loses charge according to B = 100 × 0.92^t, where B is the percentage remaining after t "
      "hours of standby.\n\n(a) State the percentage lost each hour.\n(b) Calculate the percentage remaining after "
      "6 hours, to 1 decimal place.\n(c) Using logarithms, calculate the time for the battery to fall to 50%, to 2 "
      "decimal places.\n(d) A user claims 'the battery loses 8% of 100 each hour, so it runs out after 12.5 hours'. "
      "Evaluate this claim.",
      "Each hour the battery keeps 92%, so it loses 8% of the CURRENT charge. B(6) = 100 × 0.92^6 = 100 × 0.606355 "
      "= 60.6%. For 50%: 0.92^t = 0.5, so t = log 0.5 / log 0.92 ≈ 8.31 hours. The claim is wrong twice over: it "
      "treats the loss as a constant 8 percentage points (linear) and so predicts 12.5 hours, whereas the real "
      "answer is about 8.3 hours.",
      parts=[
          P("a", "(a)", "State the percentage of charge lost each hour.", "numeric", 1,
            ["The multiplier 0.92 keeps 92%.",
             "100 − 92."], strand="D(i)", answer=8, tol=0, unit="%"),
          P("b", "(b)", "Calculate the percentage remaining after 6 hours, to 1 decimal place.", "numeric", 3,
            ["Use 100 × 0.92^6.",
             "0.92^6 ≈ 0.60636."], strand="D(ii)", answer=60.6, tol=0.1, unit="%"),
          P("c", "(c)", "Calculate the time to reach 50%, to 2 decimal places.", "numeric", 3,
            ["Solve 0.92^t = 0.5 with logarithms.",
             "t = log 0.5 ÷ log 0.92."], strand="D(iii)", answer=8.31, tol=0.05, unit="hours"),
          P("d", "(d)", "Evaluate the claim that the battery runs out after 12.5 hours.", "text", 3,
            ["Is 8% of the current charge a constant 8 percentage points?",
             "Compare 12.5 hours with your answer to (c)."], strand="D(iv)",
            accepted=["the claim is wrong: it treats the 8% as a constant 8 percentage points, but the model takes 8% of the current charge, so the battery reaches 50% after about 8.31 hours, not 12.5",
                      "incorrect: the loss is proportional to the charge remaining, so the battery discharges geometrically and reaches 50% much sooner than 12.5 hours"]),
      ],
      tools=["graph", "rich_text", "math"], requirement="graph",
      guidance="Plot B against t in the workspace and mark the 50% level: the curve, not a straight line, is the counter-argument in (d).",
      explanation="0.92 keeps 92%, so 8% of the current charge is lost each hour. B(6) ≈ 60.6% and the 50% level "
                  "is reached at t = log 0.5 / log 0.92 ≈ 8.31 hours. The 12.5-hour claim wrongly assumes a "
                  "constant 8 percentage-point loss.",
      next_time="An exponential decay loses a constant PERCENTAGE of the current amount, not a constant amount: linear reasoning overestimates the lifetime.",
      marking="(a) 1 mark. (b) 3 marks: 1 for the power, 1 for 0.60636, 1 for 60.6%. (c) 3 marks: 1 for the log "
              "equation, 1 for the evaluated logs, 1 for 8.31. (d) 3 marks: 1 for identifying the linear error, "
              "1 for the 8.31-hour comparison, 1 for a clear conclusion."),
]

QUESTIONS = QUESTIONS + SECTION_B
