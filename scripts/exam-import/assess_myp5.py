# MYP5 (Grade 10) — Sequences and series. 25 questions. Answers computed below.
from assess_prep_common import P, Q

EXAM = {
    "key": "myp5", "title": "MYP 5 Mathematics — Formative Assessment: Sequences and Series",
    "grade": "10", "curriculum": "MYP 5", "class_id": "0a400000-0000-4000-8000-000000000110",
    "access_code": "MYP5-SEQUENCES-2026", "duration": 45,
    "description": "Grade 10 · MYP 5 · Mathematics · Formative (Assess Prep). Explicit and recursive formulae, arithmetic, quadratic and geometric sequences, arithmetic and geometric series. Type every answer — there are no options to choose from.",
}
H = lambda a, b: [a, b]

def arith(a, d, n): return a + (n - 1) * d
def geo(a, r, n): return a * r ** (n - 1)
def arith_sum(a, d, n): return n / 2 * (2 * a + (n - 1) * d)
def geo_sum(a, r, n): return a * (r ** n - 1) / (r - 1)
quad11 = lambda n: 2 * n * n + n + 2

QUESTIONS = [
Q(1, "explicit and recursive formulas", "easy", "B", "A sequence is defined recursively by $a_1 = 5$ and $a_n = a_{n-1} + 4$.",
  "Start at 5 and add 4 each time: 5, 9, 13, 17, 21. So the 3rd term is 13 and the 5th term is 21.",
  parts=[
    P("a", "(a)", "Find the 3rd term.", "numeric", 1, H("A recursive rule builds each term from the one before it.", "Start with a₁ = 5 and apply the rule step by step."), answer=13),
    P("b", "(b)", "Find the 5th term.", "numeric", 1, H("Keep applying the same rule — do not restart from a₁ each time.", "Continue the chain from your 3rd term."), answer=21),
  ], subtopic="generating terms from a recursive rule"),
Q(2, "explicit and recursive formulas", "easy", "B", "A sequence begins 7, 11, 15, 19, …",
  "The terms increase by 4 each time. The explicit formula is aₙ = 7 + (n − 1) × 4 = 4n + 3. Check: n = 1 gives 7.",
  parts=[
    P("a", "(a)", "Find the common difference.", "numeric", 1, H("Compare neighbouring terms.", "Subtract each term from the next one."), answer=4),
    P("b", "(b)", "Write the explicit formula for the nth term. Type it like 4n+3.", "expression", 1, H("An explicit formula uses n directly — it does not need the previous term.", "Use the pattern 'first term + (n − 1) × difference' and simplify."), accepted=["4n+3", "a_n=4n+3", "an=4n+3", "3+4n", "7+4(n-1)", "4n + 3"]),
  ], subtopic="from a list to an explicit formula"),
Q(3, "explicit and recursive formulas", "medium", "B", "The diagrams show matchstick squares in a row: Pattern 1 uses 4 matches, Pattern 2 uses 7 and Pattern 3 uses 10.",
  "Each new square shares a side, adding 3 matches: 4, 7, 10, 13, … Pattern 4 uses 13. The explicit formula is aₙ = 4 + (n − 1) × 3 = 3n + 1.",
  diagram={"kind": "shape_pattern", "title": "Matchstick squares", "patterns": [{"label": "Pattern 1", "squares": 1}, {"label": "Pattern 2", "squares": 2}, {"label": "Pattern 3", "squares": 3}]},
  parts=[
    P("a", "(a)", "Calculate how many matches Pattern 4 uses.", "numeric", 1, H("Look at how the count grows from one pattern to the next.", "Find the increase between patterns, then continue the sequence."), answer=13),
    P("b", "(b)", "Write an explicit formula for the number of matches in Pattern n. Type it like 3n+1.", "expression", 1, H("Connect the pattern number n to the count, not the previous pattern.", "Use 'starting value + (n − 1) × increase' and simplify, then check n = 1."), accepted=["3n+1", "a_n=3n+1", "an=3n+1", "1+3n", "4+3(n-1)"]),
  ], subtopic="shape patterns and explicit formulas"),
Q(4, "explicit and recursive formulas", "medium", "C", "Spot the mistake. For $a_1 = 4$ and $a_n = 2a_{n-1} - 1$, a student writes: $a_2 = 2(4) - 1 = 7$, then $a_3 = 2(4) - 1 = 7$, then $a_4 = 2(4) - 1 = 7$.",
  "The student keeps substituting the FIRST term (4) instead of the PREVIOUS term. Correctly: a₂ = 7, a₃ = 2(7) − 1 = 13, a₄ = 2(13) − 1 = 25.",
  parts=[
    P("a", "(a)", "Find the correct value of $a_3$.", "numeric", 1, H("In a recursive rule, 'previous term' changes at every step.", "Apply the rule to a₂, not to a₁."), answer=13),
    P("b", "(b)", "Find the correct value of $a_4$.", "numeric", 1, H("Feed your corrected a₃ back into the same rule.", "Double your answer to (a), then subtract 1."), answer=25),
  ], subtopic="spot the mistake: recursive rules"),
Q(5, "arithmetic sequences", "easy", "A", "An arithmetic sequence has first term 3 and common difference 6.",
  "a₁₀ = 3 + (10 − 1) × 6 = 3 + 54 = 57. The explicit formula is aₙ = 3 + (n − 1) × 6 = 6n − 3.",
  parts=[
    P("a", "(a)", "Find the 10th term.", "numeric", 1, H("In an arithmetic sequence you add the same amount at each step.", "Use first term + (n − 1) × common difference."), answer=arith(3, 6, 10)),
    P("b", "(b)", "Write the explicit formula. Type it like 6n-3.", "expression", 1, H("Replace the numbers in 'a + (n − 1)d' with this sequence's values.", "Simplify the formula and check it gives 3 when n = 1."), accepted=["6n-3", "a_n=6n-3", "an=6n-3", "3+6(n-1)", "-3+6n"]),
  ], subtopic="nth term of an arithmetic sequence"),
Q(6, "arithmetic sequences", "medium", "B", "In an arithmetic sequence, the 4th term is 17 and the 9th term is 37.",
  "From term 4 to term 9 is 5 steps adding 20, so d = 20 ÷ 5 = 4. Then a = 17 − 3 × 4 = 5. Check: a₉ = 5 + 8 × 4 = 37.",
  parts=[
    P("a", "(a)", "Find the common difference.", "numeric", 1, H("Count how many steps of the difference separate the two given terms.", "Subtract the terms, then divide by the number of steps between them."), answer=4),
    P("b", "(b)", "Find the first term.", "numeric", 1, H("Work backwards from a known term using the difference.", "From the 4th term, undo three steps of the difference."), answer=5),
    P("c", "(c)", "Write the explicit formula. Type it like 4n+1.", "expression", 1, H("You now have both ingredients of an arithmetic sequence.", "Use 'first term + (n − 1) × difference' and simplify."), accepted=["4n+1", "a_n=4n+1", "an=4n+1", "5+4(n-1)", "1+4n"]),
  ], subtopic="finding a and d from two terms"),
Q(7, "arithmetic sequences", "medium", "B", "The arithmetic sequence 5, 9, 13, 17, … continues in the same way. Determine which term is equal to 101. Type the term number.",
  "aₙ = 4n + 1. Setting 4n + 1 = 101 gives 4n = 100, so n = 25.",
  single=("numeric", (25, 0), 1), hints=H("Turn the question around: build the nth-term formula first.", "Set the explicit formula equal to 101 and solve for n."), nxt="Set the nth-term formula equal to the target and solve.", subtopic="finding the term number"),
Q(8, "arithmetic sequences", "medium", "D", "A taxi charges a fixed fee of $4 plus $1.50 for each kilometre travelled.",
  "The cost after n km is C = 4 + 1.5n dollars (each kilometre adds the same amount, like a common difference). For 12 km: 4 + 1.5 × 12 = 4 + 18 = $22.",
  parts=[
    P("a", "(a)", "Write a formula for the cost C after n kilometres. Type it like 4+1.5n.", "expression", 1, H("One part of the cost never changes; the other grows by the same amount per kilometre.", "Fixed fee first, then 'per-km rate × n'."), accepted=["4+1.5n", "C=4+1.5n", "1.5n+4", "4+3n/2"]),
    P("b", "(b)", "Calculate the cost of a 12 km journey.", "numeric", 1, H("Substitute the distance into your formula.", "Replace n with 12 and calculate."), answer=22, unit="$"),
  ], subtopic="arithmetic sequences in real life"),
Q(9, "quadratic sequences", "easy", "B", "A quadratic sequence begins 3, 8, 15, 24, …",
  "First differences: 5, 7, 9 — they increase by 2 (the second difference), so the next first difference is 11 and the next term is 24 + 11 = 35.",
  parts=[
    P("a", "(a)", "Find the second difference.", "numeric", 1, H("Work out the gaps between terms first, then the gaps between the gaps.", "List the first differences, then subtract neighbouring ones."), answer=2),
    P("b", "(b)", "Find the next term.", "numeric", 1, H("Extend the pattern of first differences by one more step.", "Add the second difference to the last first difference, then add on."), answer=35),
  ], subtopic="second differences"),
Q(10, "quadratic sequences", "medium", "B", "Find the nth term of the quadratic sequence 2, 6, 12, 20, … Type it like n^2+n.",
  "First differences 4, 6, 8; second difference 2, so the n² coefficient is 1. Subtracting n² (1, 4, 9, 16) from the terms leaves 1, 2, 3, 4, which is n. So aₙ = n² + n.",
  single=("expr", ["n^2+n", "n²+n", "a_n=n^2+n", "n(n+1)", "n+n^2"], 1), hints=H("A constant second difference tells you the power of n and its coefficient.", "Subtract n² from each term and see what pattern is left."), nxt="Halve the second difference for the n² coefficient, then subtract and look again.", subtopic="nth term of a quadratic sequence"),
Q(11, "quadratic sequences", "hard", "B", "A quadratic sequence begins 5, 12, 23, 38, …",
  "First differences 7, 11, 15; second difference 4, so the next first difference is 19 and the next term is 57. The n² coefficient is 4 ÷ 2 = 2; subtracting 2n² (2, 8, 18, 32) leaves 3, 4, 5, 6 = n + 2, so aₙ = 2n² + n + 2.",
  parts=[
    P("a", "(a)", "Find the next term.", "numeric", 1, H("Extend the first differences using the second difference.", "Add the second difference to the last first difference, then add on to the last term."), answer=57),
    P("b", "(b)", "Write the nth-term formula. Type it like 2n^2+n+2.", "expression", 1, H("The second difference, halved, gives the n² coefficient.", "Subtract 2n² from each term and find the pattern that remains."), accepted=["2n^2+n+2", "2n²+n+2", "a_n=2n^2+n+2"]),
  ], subtopic="quadratic nth term from differences"),
Q(12, "quadratic sequences", "hard", "B", "A quadratic sequence has nth term $a_n = 3n^2 - 2n + 1$.",
  "a₅ = 3(25) − 2(5) + 1 = 75 − 10 + 1 = 66. For the term 281: 3n² − 2n + 1 = 281 → 3n² − 2n − 280 = 0 → (3n + 28)(n − 10) = 0, so n = 10 (term numbers are positive).",
  parts=[
    P("a", "(a)", "Find the 5th term.", "numeric", 1, H("An explicit formula works directly from n.", "Substitute n = 5 into the formula, squaring before multiplying."), answer=66),
    P("b", "(b)", "Determine which term of the sequence is 281. Type the term number.", "numeric", 1, H("Set the formula equal to 281 and solve — expect a quadratic equation.", "Rearrange to '= 0', factorise, and keep the positive solution."), answer=10),
  ], subtopic="using a quadratic formula backwards"),
Q(13, "quadratic sequences", "easy", "B", "Dot patterns grow as shown: Pattern 1 has 1 dot, Pattern 2 has 4 dots, Pattern 3 has 9 dots and Pattern 4 has 16 dots.",
  "The counts are square numbers: 1, 4, 9, 16, so Pattern 5 has 25 dots and the nth pattern has n² dots. Pattern 20 has 20² = 400 dots.",
  diagram={"kind": "shape_pattern", "title": "Dot patterns", "patterns": [{"label": "Pattern 1", "squares": 0, "dots": 1}, {"label": "Pattern 2", "squares": 0, "dots": 4}, {"label": "Pattern 3", "squares": 0, "dots": 9}, {"label": "Pattern 4", "squares": 0, "dots": 16}]},
  parts=[
    P("a", "(a)", "Calculate how many dots Pattern 5 has.", "numeric", 1, H("Look at the counts 1, 4, 9, 16 and name the family they belong to.", "These are the squares of the pattern numbers."), answer=25),
    P("b", "(b)", "Calculate how many dots Pattern 20 has.", "numeric", 1, H("An explicit rule beats drawing twenty patterns.", "Square the pattern number."), answer=400),
  ], subtopic="square-number patterns"),
Q(14, "geometric sequences", "easy", "A", "A geometric sequence begins 3, 6, 12, 24, …",
  "Each term is double the previous one, so r = 2. a₈ = 3 × 2⁷ = 3 × 128 = 384.",
  parts=[
    P("a", "(a)", "Find the common ratio.", "numeric", 1, H("In a geometric sequence, neighbouring terms are linked by multiplication.", "Divide any term by the term before it."), answer=2),
    P("b", "(b)", "Find the 8th term.", "numeric", 1, H("Count how many multiplications take you from the 1st term to the 8th.", "Use first term × ratio^(n − 1)."), answer=geo(3, 2, 8)),
  ], subtopic="common ratio and nth term"),
Q(15, "geometric sequences", "medium", "B", "A geometric sequence has first term 5 and common ratio 3.",
  "aₙ = 5 × 3ⁿ⁻¹. a₆ = 5 × 3⁵ = 5 × 243 = 1215.",
  parts=[
    P("a", "(a)", "Write the explicit formula. Type it like 5*3^(n-1).", "expression", 1, H("A geometric explicit formula is 'first term × ratio^(n − 1)'.", "Substitute a = 5 and r = 3 into that structure."), accepted=["5*3^(n-1)", "5×3^(n-1)", "a_n=5*3^(n-1)", "5(3)^(n-1)", "5*3^(n−1)"]),
    P("b", "(b)", "Find the 6th term.", "numeric", 1, H("The exponent is one less than the term number.", "Multiply 5 by 3 raised to the power 5."), answer=geo(5, 3, 6)),
  ], subtopic="explicit formula for a geometric sequence"),
Q(16, "geometric sequences", "medium", "A", "A ball's bounce heights form the geometric sequence 80, 40, 20, 10, … centimetres.",
  "r = 40 ÷ 80 = 1/2. a₇ = 80 × (1/2)⁶ = 80 ÷ 64 = 1.25 cm.",
  parts=[
    P("a", "(a)", "Find the common ratio. Type it as a fraction or a decimal.", "text", 1, H("Divide a term by the one before it.", "Compare 40 with 80."), accepted=["1/2", "0.5", "½"]),
    P("b", "(b)", "Find the height of the 7th bounce.", "numeric", 1, H("Six multiplications by the ratio take you from the 1st to the 7th term.", "Multiply 80 by the ratio raised to the power 6."), answer=1.25, tol=0.01, unit="cm"),
  ], subtopic="decreasing geometric sequences"),
Q(17, "geometric sequences", "hard", "B", "In a geometric sequence, the 3rd term is 24 and the 6th term is 192.",
  "From term 3 to term 6 is 3 multiplications by r, and 192 ÷ 24 = 8 = r³, so r = 2. Then a = 24 ÷ r² = 24 ÷ 4 = 6. Check: 6, 12, 24, 48, 96, 192.",
  parts=[
    P("a", "(a)", "Find the common ratio.", "numeric", 1, H("Count the multiplications between the two given terms.", "Divide the later term by the earlier one, then take the cube root."), answer=2),
    P("b", "(b)", "Find the first term.", "numeric", 1, H("Work backwards from a known term, undoing the ratio.", "From the 3rd term, divide by the ratio twice."), answer=6),
  ], subtopic="finding r and a from two terms"),
Q(18, "arithmetic series", "easy", "A", "Consider the arithmetic series 2 + 5 + 8 + … with 20 terms.",
  "Last term = 2 + 19 × 3 = 59. Sum = 20/2 × (2 + 59) = 10 × 61 = 610.",
  parts=[
    P("a", "(a)", "Find the 20th term.", "numeric", 1, H("A series question often needs the last term before it can be summed.", "Use first term + (n − 1) × difference."), answer=arith(2, 3, 20)),
    P("b", "(b)", "Find the sum of the first 20 terms.", "numeric", 1, H("Pair the first and last terms — every pair has the same total.", "Use S = n/2 × (first + last)."), answer=int(arith_sum(2, 3, 20))),
  ], subtopic="sum of an arithmetic series"),
Q(19, "arithmetic series", "medium", "D", "A theatre has 15 rows of seats. The first row has 20 seats and each row behind it has 4 more seats than the row in front.",
  "Last row = 20 + 14 × 4 = 76 seats. Total = 15/2 × (20 + 76) = 7.5 × 96 = 720 seats.",
  parts=[
    P("a", "(a)", "Calculate how many seats are in the last (15th) row.", "numeric", 1, H("The rows form an arithmetic sequence.", "Use first row + (15 − 1) × the row-to-row increase."), answer=arith(20, 4, 15)),
    P("b", "(b)", "Calculate how many seats the theatre has in total.", "numeric", 1, H("Add the sequence up with the pairing idea, not row by row.", "Use S = n/2 × (first row + last row)."), answer=int(arith_sum(20, 4, 15))),
  ], subtopic="arithmetic series in real life"),
Q(20, "geometric series", "easy", "A", "Find the sum of the first 8 terms of the geometric series 3 + 6 + 12 + …",
  "a = 3, r = 2. S₈ = 3 × (2⁸ − 1)/(2 − 1) = 3 × 255 = 765.",
  single=("numeric", (int(geo_sum(3, 2, 8)), 0), 2), hints=H("Identify the first term and the ratio before summing anything.", "Use S = a(rⁿ − 1)/(r − 1) with n = 8."), nxt="Name a and r first, then choose the sum formula.", subtopic="sum of a geometric series"),
Q(21, "geometric series", "medium", "A", "Find the sum of the first 6 terms of the geometric series 16 + 8 + 4 + … Give your answer as a decimal.",
  "a = 16, r = 1/2. S₆ = 16 × (1 − (1/2)⁶)/(1 − 1/2) = 16 + 8 + 4 + 2 + 1 + 0.5 = 31.5.",
  single=("numeric", (geo_sum(16, 0.5, 6), 0.01), 2), hints=H("The ratio is less than 1 here — check whether the formula form you use matches that.", "Either add the six terms directly or use S = a(1 − rⁿ)/(1 − r)."), subtopic="geometric series with ratio below 1"),
Q(22, "geometric series", "medium", "D", "A savings plan pays in $10 in week 1 and doubles the payment every week: $10, $20, $40, …",
  "This is geometric with a = 10, r = 2. Week 6 payment = 10 × 2⁵ = $320. Total over 6 weeks = 10 × (2⁶ − 1)/(2 − 1) = 10 × 63 = $630.",
  parts=[
    P("a", "(a)", "Calculate the payment in week 6.", "numeric", 1, H("Each week multiplies the payment — count the doublings since week 1.", "Use first payment × ratio^(n − 1)."), answer=int(geo(10, 2, 6)), unit="$"),
    P("b", "(b)", "Calculate the total paid over the first 6 weeks.", "numeric", 1, H("A total of payments is a series, not a single term.", "Sum the geometric series with a = 10, r = 2, n = 6."), answer=int(geo_sum(10, 2, 6)), unit="$"),
  ], subtopic="geometric series in real life"),
Q(23, "geometric series", "hard", "B", "For the series 1 + 2 + 4 + 8 + …, the sum of the first n terms is 1023. Find n.",
  "Sₙ = (2ⁿ − 1)/(2 − 1) = 2ⁿ − 1. Setting 2ⁿ − 1 = 1023 gives 2ⁿ = 1024 = 2¹⁰, so n = 10.",
  single=("numeric", (10, 0), 2), hints=H("Write the sum formula with n still unknown, then solve.", "Set a(rⁿ − 1)/(r − 1) equal to 1023 and recognise the power of 2."), nxt="Let the sum formula equal the target and solve for n.", subtopic="finding the number of terms"),
Q(24, "mixed challenge", "hard", "D", "Sequence A is arithmetic: 4, 7, 10, 13, … Sequence B is geometric: 2, 6, 18, 54, …",
  "A: aₙ = 3n + 1, so a₁₀ = 31. B: bₙ = 2 × 3ⁿ⁻¹, so b₅ = 162. B grows by multiplying, so it passes 100 first, at its 5th term (162), while A only reaches 103 at term 34.",
  parts=[
    P("a", "(a)", "Find the 10th term of Sequence A.", "numeric", 1, H("Treat A on its own first: what is added each time?", "Use first term + (n − 1) × difference."), answer=arith(4, 3, 10)),
    P("b", "(b)", "Find the 5th term of Sequence B.", "numeric", 1, H("Treat B on its own: what is multiplied each time?", "Use first term × ratio^(n − 1)."), answer=int(geo(2, 3, 5))),
    P("c", "(c)", "State which sequence's terms first exceed 100. Type: A or B.", "text", 1, H("Compare how the two growth patterns behave over many terms.", "Multiplying by 3 grows far faster than adding 3 — check B's early terms."), accepted=["B", "Sequence B"]),
  ], subtopic="comparing growth of two sequences (integrated challenge)"),
Q(25, "mixed challenge", "hard", "B", "A pattern of triangle numbers begins 1, 3, 6, 10, 15, … (each term adds one more than the previous increase).",
  "First differences 2, 3, 4, 5 increase by 1, so the next difference is 6 and the next term is 21. The second difference is 1, giving an n² coefficient of 1/2; subtracting n²/2 leaves the pattern (n² + n)/2, so aₙ = (n² + n)/2. Check: n = 4 gives 10.",
  parts=[
    P("a", "(a)", "Find the next term.", "numeric", 1, H("Look at how the gaps themselves are growing.", "Extend the first differences by their own pattern, then add on."), answer=21),
    P("b", "(b)", "Write the nth-term formula. Type it like (n^2+n)/2.", "expression", 1, H("The second difference tells you the n² coefficient — it is not a whole number here.", "Halve the second difference for the n² coefficient, subtract that part, and find what remains."), accepted=["(n^2+n)/2", "(n²+n)/2", "a_n=(n^2+n)/2", "n(n+1)/2", "(n(n+1))/2", "0.5n^2+0.5n"]),
  ], subtopic="investigating a non-standard pattern (integrated challenge)"),
]

BLUEPRINT = {"explicit and recursive formulas": 4, "arithmetic sequences": 4, "quadratic sequences": 5,
             "geometric sequences": 4, "arithmetic series": 2, "geometric series": 4, "mixed challenge": 2}
