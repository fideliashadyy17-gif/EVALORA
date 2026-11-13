"""MYP 2 (Grade 7) Mathematics — Mock Examination.

Reasoning-load design: every item requires at least two mathematical steps, one
method decision or one justification. Objective distractors are the *actual*
misconceptions a Grade 7 candidate produces (adding ratios, sharing the
remainder wrongly in a Venn diagram, confusing "at least one" with "both"), so
a wrong option diagnoses the error.
"""
from mock_common import P, Q

EXAM = {
    "key": "myp2-mock",
    "title": "MYP2 Mathematics — Mock Examination",
    "curriculum": "MYP 2",
    "grade": "7",
    "subject": "Mathematics",
    "duration": 150,
    "kind": "mock",
    "code": "MYP2-MOCK-2026",
    "description": (
        "Grade 7 · MYP 2 · Mathematics · Mock Examination. Ratio, rate and proportion, "
        "set theory and Venn diagrams, probability. 45 questions, 189 marks: Section A "
        "(objective) and Section B (structured, constructed responses). Full marking "
        "schemes, three-level hints and question-level feedback."
    ),
    "instructions": (
        "MYP2 MATHEMATICS — MOCK EXAMINATION (Grade 7)\n\n"
        "Time allowed: 2 hours 30 minutes.\n\n"
        "SECTION A — Objective questions (questions 1–22).\n"
        "Each question has one correct answer (or, where stated, more than one). "
        "For numeric questions type the value only, without units. Read every stem: "
        "several questions give you data you must interpret before you calculate.\n\n"
        "SECTION B — Structured questions (questions 23–45).\n"
        "Write your working and type each part's answer in its own box. Marks are shown "
        "beside every part, so you can see how much detail a part needs. Where a question "
        "shows a table, graph or Venn diagram workspace, build the representation there — "
        "that is what is being assessed. A fully correct answer with no supportable method "
        "may lose method marks.\n\n"
        "EXAMINATION OBJECTIVES. By the end of this paper you should be able to: use ratio "
        "and rate to compare and scale quantities, including best-buy and speed problems; "
        "share quantities in a given ratio and decide when a proportional relationship is "
        "direct, inverse or neither; use set notation and construct two- and three-set Venn "
        "diagrams; calculate and compare theoretical and experimental probabilities; and "
        "explain your reasoning in clear mathematical language.\n\n"
        "GENERAL INSTRUCTIONS.\n"
        "1. Calculators are not permitted. Show all necessary working; no marks are given "
        "for an answer alone in Section B unless a part says so.\n"
        "2. Give units with every answer that has one, and simplify all fractions and ratios.\n"
        "3. A hint is available on every part. Hints guide your thinking and never reveal "
        "the answer; using one costs no marks and is recorded only to help you revise.\n"
        "4. Your answers save automatically. If your connection drops, reopen the paper and "
        "your work is restored exactly as you left it.\n"
        "5. Do not write only a final answer for a part that asks you to explain, justify or "
        "describe: those parts are marked on the reasoning.\n\n"
        "MARKS. Every part shows its own marks, and the totals for each section are printed on the "
        "cover: Section A is worth 55 marks and Section B is worth 134 marks, out of a total of 189. "
        "Pass mark: your institution's configured threshold (default 50%)."
    ),
}

QUESTIONS = [
    # ─── Section A — objective (1–22) ───────────────────────────────────────────
    Q(1, "ratio", "medium", "A",
      "A smoothie recipe mixes mango and pineapple in the ratio 3 : 5. A cook uses 27 cups of mango. "
      "How many cups of pineapple are needed?",
      "One part is 27 ÷ 3 = 9 cups, so pineapple = 5 × 9 = 45 cups. The scale factor between the "
      "mango amounts is 27 ÷ 3 = 9, and the same factor must be applied to the pineapple.",
      options=[("45 cups", True), ("29 cups (adds the difference 2 to 27)", False),
               ("15 cups (uses 5/9 of 27)", False), ("135 cups (multiplies 27 by 5 and ignores the 3)", False)],
      points=2, subtopic="equivalent ratios and scale factor",
      next_time="A ratio is scaled by one factor applied to BOTH quantities. Compare the quantity you know with its ratio number to find the factor."),
    Q(2, "probability", "medium", "A",
      "Two fair coins are tossed and the faces are recorded. What is the probability that exactly one coin shows heads?",
      "The sample space is HH, HT, TH, TT. Exactly one head occurs in HT and TH, so P = 2/4 = 1/2. "
      "Listing the outcomes in order is what stops HH and TT from being counted as the only options.",
      options=[("1/2", True), ("1/4", False), ("3/4", False), ("1/3", False)],
      points=2, subtopic="sample space of two events",
      next_time="Write the sample space as an ordered list. 'Exactly one' excludes both HT-style outcomes being counted as the same event."),
    Q(3, "sets and Venn diagrams", "medium", "A",
      "In a class of 32 students, 19 play football, 14 play basketball and 6 play both. "
      "How many play neither sport?",
      "At least one sport = 19 + 14 − 6 = 27 (the 6 who play both were counted twice). "
      "Neither = 32 − 27 = 5.",
      options=[("5", True), ("13 (adds 19 + 14 and subtracts from 32)", False),
               ("7 (subtracts the overlap instead of adding it)", False),
               ("1 (multiplies the overlap by 2)", False)],
      points=2, subtopic="two-set inclusion–exclusion",
      next_time="n(A∪B) = n(A) + n(B) − n(A∩B). The overlap is subtracted once because it was added twice."),
    Q(4, "proportion", "medium", "A",
      "4 identical machines take 6 hours to complete a job. Working at the same rate, how long would "
      "3 such machines take?",
      "The job needs 4 × 6 = 24 machine-hours. With 3 machines the time is 24 ÷ 3 = 8 hours. This is "
      "inverse proportion: fewer machines means more time, so the answer must be larger than 6.",
      options=[("8 hours", True), ("4.5 hours (multiplies by 3/4)", False),
               ("18 hours (multiplies 6 by 3)", False), ("7 hours (adds the one missing machine)", False)],
      points=2, subtopic="inverse proportion",
      next_time="Inverse proportion: the product (number × time) stays constant. Check that your answer moves in the sensible direction."),
    Q(5, "ratio", "medium", "A",
      "Which ratio is equivalent to 12 : 18 expressed in its simplest form?",
      "12 : 18 divides by the highest common factor 6, giving 2 : 3. Dividing by 2 only gives 6 : 9, "
      "which is equivalent but not simplest; 3 : 4 does not preserve the ratio.",
      options=[("2 : 3", True), ("6 : 9 (divided by 2 only, so not simplest)", False),
               ("3 : 4 (subtracts 9 from each part)", False), ("4 : 6 (divided by 3 in the wrong order)", False)],
      points=1, subtopic="simplifying a ratio",
      next_time="Divide both parts by their highest common factor, not by any common factor."),
    Q(6, "rate", "hard", "A",
      "A car travels 150 km in 2 hours 30 minutes at a steady speed. What is its average speed in km/h?",
      "2 hours 30 minutes is 2.5 hours. Speed = 150 ÷ 2.5 = 60 km/h. Treating 2 h 30 min as 2.3 h "
      "gives 65.2 km/h — a common error because 30 minutes is half an hour, not 0.3 of an hour.",
      options=[("60 km/h", True), ("65 km/h (treats 30 minutes as 0.3 h)", False),
               ("75 km/h (halves the distance instead of dividing by time)", False),
               ("100 km/h (divides by 1.5 h)", False)],
      points=3, subtopic="speed with a mixed time unit",
      next_time="Convert every time to hours using 1 minute = 1/60 hour before dividing. 30 minutes is 0.5 hour."),
    Q(7, "probability", "hard", "A",
      "A bag holds 5 red and 3 blue counters. One counter is taken out and not replaced. A second counter "
      "is then taken. What is the probability that both counters are red?",
      "P(first red) = 5/8. After a red is removed, 4 of the remaining 7 are red, so P(second red) = 4/7. "
      "P(both red) = 5/8 × 4/7 = 20/56 = 5/14. Using 5/8 twice is the classic 'with replacement' error.",
      options=[("5/14", True), ("25/64 (replaces the first counter)", False),
               ("5/8 (uses only the first draw)", False), ("10/16 (adds the two probabilities)", False)],
      points=3, subtopic="probability without replacement",
      next_time="Without replacement, both the numerator and the denominator fall by one after the first draw."),
    Q(8, "sets and Venn diagrams", "hard", "A",
      "For the universal set ξ = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10}, A = {multiples of 2} and B = {multiples of 3}. "
      "Which set is A ∩ B?",
      "A = {2, 4, 6, 8, 10} and B = {3, 6, 9}. The only element in both is 6, so A ∩ B = {6}. "
      "The union would be {2, 3, 4, 6, 8, 9, 10}, which is the common confusion between ∩ and ∪.",
      options=[("{6}", True), ("{2, 3, 4, 6, 8, 9, 10} (that is A ∪ B)", False),
               ("{2, 4, 8, 10} (elements of A only)", False), ("{3, 9} (elements of B only)", False)],
      points=3, subtopic="intersection of two sets",
      next_time="∩ means 'in both sets'. List each set first, then compare element by element."),
    Q(9, "probability", "medium", "A",
      "The probability that a biased spinner lands on blue is 0.35. The spinner has only red, blue and green "
      "sectors, and red and green are equally likely. What is the probability of green?",
      "The three probabilities sum to 1, so red + green = 1 − 0.35 = 0.65. Since red and green are equally "
      "likely, P(green) = 0.65 ÷ 2 = 0.325.",
      options=[("0.325", True), ("0.65 (forgets to halve)", False),
               ("0.35 (assumes green equals blue)", False), ("0.175 (halves the blue probability)", False)],
      points=2, subtopic="complementary and equally likely outcomes",
      next_time="All outcomes on one spinner must add to 1. Find the remaining total first, then share it."),
    Q(10, "proportion", "hard", "B",
      "A recipe for 8 people needs 600 g of rice. Written for 20 people, how much rice is needed?",
      "Rice per person is 600 ÷ 8 = 75 g, so for 20 people 20 × 75 = 1500 g = 1.5 kg. Direct proportion: "
      "both quantities scale by the same factor (20 ÷ 8 = 2.5 and 600 × 2.5 = 1500).",
      options=[("1.5 kg", True), ("1.2 kg (adds 12 people × 100 g)", False),
               ("0.24 kg (multiplies by 8/20 instead of 20/8)", False), ("1.8 kg (uses 90 g per person)", False)],
      points=3, subtopic="direct proportion with unit conversion",
      next_time="Find the value for ONE person first, then multiply. Convert grams to kilograms at the end to match the options."),
    Q(11, "ratio", "hard", "B",
      "Amara and Ben share $84 in the ratio 5 : 2. Amara then gives $6 of her share to Ben. "
      "What is the new ratio Amara : Ben, in simplest form?",
      "One part is 84 ÷ 7 = $12, so Amara has 5 × 12 = $60 and Ben has 2 × 12 = $24. After the transfer "
      "Amara has $54 and Ben has $30, so the ratio is 54 : 30 = 9 : 5.",
      options=[("9 : 5", True), ("5 : 2 (ignores the transfer)", False),
               ("3 : 2 (simplifies 54 : 36)", False), ("27 : 15 (not simplified)", False)],
      points=3, subtopic="multi-step ratio sharing",
      next_time="Share the total first, then apply the change, then simplify. Do not simplify before the change."),
    Q(12, "sets and Venn diagrams", "hard", "B",
      "In a survey of 40 people, 24 read newspaper P, 18 read newspaper Q and 7 read neither. "
      "How many read both newspapers?",
      "At least one = 40 − 7 = 33. Then n(P∩Q) = 24 + 18 − 33 = 9. A candidate who forgets the 7 who read "
      "neither gets 24 + 18 − 40 = 2, which is the classic error.",
      options=[("9", True), ("2 (forgets the 7 who read neither)", False),
               ("7 (assumes the 'neither' count is the overlap)", False), ("33 (reports the union)", False)],
      points=3, subtopic="inclusion–exclusion with an outside region",
      next_time="Subtract the 'neither' group from the total FIRST; that remainder is n(P∪Q)."),
    Q(13, "probability", "hard", "B",
      "A fair six-sided die is rolled 300 times. A student predicts that a 4 will appear exactly 50 times and "
      "is surprised to see 61. Which statement is mathematically correct?",
      "The expected count is 300 × 1/6 = 50, but individual runs vary by chance. 61 is a normal amount of "
      "variation; the theoretical probability is not contradicted by one experimental result.",
      options=[("The die may still be fair: 61 is ordinary variation around an expected 50",
                True),
               ("The die must be biased, because 61 ≠ 50", False),
               ("The theoretical probability has changed to 61/300", False),
               ("The student counted wrongly, since 50 is guaranteed", False)],
      points=3, subtopic="experimental versus theoretical probability",
      next_time="Expected frequency = probability × number of trials. It is an average over many runs, not a promise for one run."),
    Q(14, "rate", "hard", "B",
      "Shop A sells 1.5 kg of flour for $2.70. Shop B sells 2.5 kg for $4.25. Which is the better buy, and by "
      "how much per kilogram?",
      "Shop A: 2.70 ÷ 1.5 = $1.80 per kg. Shop B: 4.25 ÷ 2.5 = $1.70 per kg. Shop B is cheaper by $0.10 per kg. "
      "Comparing the total prices (2.70 < 4.25) is the error: the packets are different sizes.",
      options=[("Shop B, by $0.10 per kg", True), ("Shop A, because $2.70 < $4.25", False),
               ("Shop B, by $1.55 per kg (subtracts the totals)", False),
               ("They cost the same per kg", False)],
      points=3, subtopic="best buy using unit rates",
      next_time="A best-buy comparison is only valid per unit. Divide price by mass for each shop before comparing."),
    Q(15, "sets and Venn diagrams", "hard", "B",
      "In a group of 30 students, 18 study History, 15 study Geography and 4 study both. "
      "How many study exactly one of the two subjects?",
      "History only = 18 − 4 = 14 and Geography only = 15 − 4 = 11, so exactly one = 14 + 11 = 25. "
      "The trap is answering 33 (the union), which counts the 4 who study both.",
      options=[("25", True), ("33 (the union, including the 4 who study both)", False),
               ("29 (subtracts only 1 for the overlap)", False), ("4 (reports the overlap)", False)],
      points=3, subtopic="exactly one of two sets",
      next_time="'Exactly one' means the two 'only' regions. Remove the overlap from each set before adding."),
    Q(16, "proportion", "hard", "B",
      "A map uses the scale 1 : 25 000. Two towns are 8 cm apart on the map. What is the real distance in kilometres?",
      "8 cm × 25 000 = 200 000 cm = 2 000 m = 2 km. The conversion is 100 cm = 1 m and 1 000 m = 1 km, so "
      "200 000 cm ÷ 100 000 = 2 km.",
      options=[("2 km", True), ("20 km (divides by 10 000)", False),
               ("0.2 km (divides by an extra 10)", False), ("200 km (forgets both conversions)", False)],
      points=3, subtopic="scale drawing",
      next_time="Multiply by the scale factor first, then convert centimetres to kilometres in two steps."),
    Q(17, "probability", "hard", "B",
      "A box contains 4 white and 6 black balls. Two balls are taken at random without replacement. "
      "What is the probability that they are the same colour?",
      "P(both white) = 4/10 × 3/9 = 12/90. P(both black) = 6/10 × 5/9 = 30/90. "
      "Total = 42/90 = 7/15. Adding 4/10 + 6/10 instead of multiplying is the usual error.",
      options=[("7/15", True), ("1 (adds the two colours' totals)", False),
               ("12/90 (counts only the white pair)", False), ("24/100 (replaces the balls)", False)],
      points=3, subtopic="compound probability of a compound event",
      next_time="Split 'same colour' into its two cases, multiply along each branch, then add the branches."),
    Q(18, "sets and Venn diagrams", "hard", "B",
      "ξ = {whole numbers from 1 to 20}. Set A = {factors of 18} and set B = {prime numbers}. "
      "How many elements are in A ∩ B?",
      "A = {1, 2, 3, 6, 9, 18} and B = {2, 3, 5, 7, 11, 13, 17, 19}. The common elements are 2 and 3, "
      "so n(A∩B) = 2. Counting 1 as prime, or including 9, are the common slips.",
      options=[("2", True), ("3 (counts 1 as a prime factor)", False),
               ("1 (misses that 3 is also prime)", False), ("6 (counts all the factors)", False)],
      points=3, subtopic="set notation with number properties",
      next_time="List both sets completely before intersecting. 1 is not prime; check each element of A against B."),
    Q(19, "ratio", "medium", "A",
      "The ratio of boys to girls in a year group is 7 : 8. There are 45 students in total. "
      "How many girls are there?",
      "There are 15 equal parts, so one part is 45 ÷ 15 = 3 students. Girls = 8 × 3 = 24.",
      options=[("24", True), ("21 (gives the number of boys)", False),
               ("8 (reports the ratio number)", False), ("22.5 (takes half of 45)", False)],
      points=2, subtopic="sharing a total in a ratio",
      next_time="Add the ratio numbers to find the number of parts, then divide the total by that number."),
    Q(20, "sets and Venn diagrams", "medium", "A",
      "Which of these describes the shaded region 'elements that are in A but not in B'?",
      "In set notation this is A ∩ B′, read 'A intersect not-B'. Writing A′ ∩ B gives the opposite region, and "
      "A − B is only equivalent when the sets are disjoint.",
      options=[("A ∩ B′", True), ("A′ ∩ B", False), ("A ∪ B", False), ("A ∩ B", False)],
      points=2, subtopic="set notation for a region",
      next_time="Translate the words into symbols one at a time: 'in A' → A, 'not in B' → B′, and 'and' → ∩."),
    Q(21, "rate", "medium", "A",
      "A tap fills a tank at 12 litres per minute. How many minutes does it take to fill a 9 000-litre tank?",
      "9 000 ÷ 12 = 750 minutes. Dividing the other way (12 ÷ 9 000) gives a meaningless 0.0013, which is the "
      "unit-rate error of dividing the rate by the total.",
      options=[("750 minutes", True), ("0.0013 minutes (divides the rate by the total)", False),
               ("108 000 minutes (multiplies instead of dividing)", False), ("75 minutes (loses a factor of 10)", False)],
      points=2, subtopic="rate and time",
      next_time="When the rate is 'per minute', the time is total ÷ rate. Check the size of your answer against the setting."),
    Q(22, "probability", "medium", "A",
      "A bag contains 7 counters: 3 red, 2 green and 2 yellow. One counter is taken at random. "
      "Which event has probability 4/7?",
      "'Not red' removes only the 3 red counters, leaving 4, so P(not red) = 4/7. P(red) = 3/7 and "
      "P(green) = P(yellow) = 2/7, so the other options are the complementary and per-colour values.",
      options=[("Taking a counter that is not red", True), ("Taking a red counter", False),
               ("Taking a green counter", False), ("Taking a green or yellow counter", False)],
      points=2, subtopic="complementary events",
      next_time="P(not A) = 1 − P(A). Count the outcomes that are NOT in the event before dividing."),
    Q(23, "ratio", "hard", "C",
      "A student writes: 'The ratio 6 : 9 simplifies to 2 : 3, so to make 12 litres of paint I add 2 litres of "
      "blue to 3 litres of yellow.'\n\n(a) Identify the error in the student's reasoning.\n(b) Calculate the "
      "correct amounts of blue and yellow for 12 litres.",
      "Simplifying gives the ratio 2 : 3, not the amounts. The parts 2 and 3 together make 5 parts, and 12 litres "
      "must be shared into 5 parts: one part is 12 ÷ 5 = 2.4 litres, so blue = 4.8 litres and yellow = 7.2 litres. "
      "The student used the ratio numbers as if they were litres.",
      parts=[
          P("a", "(a)", "Identify the error in one sentence.", "text", 1,
            ["Compare 2 + 3 with the 12 litres required.",
             "A simplified ratio gives proportional parts, not quantities."], strand="C(i)",
            accepted=["the student treated the ratio numbers as litres instead of scaling them to a total of 12 litres",
                      "the ratio 2 : 3 is not a total of 5 litres",
                      "the ratio numbers are parts, not amounts"]),
          P("b", "(b)", "Calculate the litres of blue needed for 12 litres.", "numeric", 2,
            ["How many equal parts are in the ratio 2 : 3?",
             "Divide 12 litres by the number of parts, then multiply by 2."], strand="C(iii)", answer=4.8, tol=0.01, unit="litres"),
          P("c", "(c)", "Calculate the litres of yellow needed for 12 litres.", "numeric", 2,
            ["Yellow takes 3 parts.",
             "Multiply one part by 3, and check that blue + yellow = 12 litres."], strand="C(iii)", answer=7.2, tol=0.01, unit="litres"),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="In (a) say what the student did wrong, not only that the answer is wrong. Check in (c) that the two amounts add to 12 litres.",
      explanation="2 : 3 has 5 parts in total. 12 ÷ 5 = 2.4 litres per part, so blue = 2 × 2.4 = 4.8 litres and "
                  "yellow = 3 × 2.4 = 7.2 litres. They add to 12 litres, and 4.8 : 7.2 simplifies to 2 : 3.",
      next_time="A ratio gives parts, not amounts. Scale the parts so that their SUM is the total required, then check by simplifying.",
      marking="(a) 1 mark for identifying that ratio numbers were used as amounts. (b) 2 marks: 1 for finding one "
              "part (2.4), 1 for 4.8 litres. (c) 2 marks: 1 for 7.2 litres, 1 for the check that the total is 12 litres."),
    Q(24, "probability", "hard", "C",
      "A spinner has 8 equal sectors numbered 1 to 8. A student claims: 'P(even) = 4/8 and P(prime) = 4/8, so "
      "P(even or prime) = 1.'\n\n(a) List the outcomes that are both even and prime.\n(b) Explain why the "
      "student's addition double-counts.\n(c) Calculate the correct probability of even or prime.",
      "Only 2 is both even and prime. Adding 4/8 + 4/8 counts 2 twice, so the student gets 1 instead of the true "
      "value. Even = {2, 4, 6, 8} and prime = {2, 3, 5, 7}; their union is {2, 3, 4, 5, 6, 7, 8}, seven outcomes, "
      "so P = 7/8.",
      parts=[
          P("a", "(a)", "State how many outcomes are both even and prime.", "numeric", 1,
            ["Test each number 1 to 8 against both conditions.",
             "2 is even and prime; 4, 6 and 8 are even but not prime."], strand="C(i)", answer=1, tol=0),
          P("b", "(b)", "Explain why adding the two probabilities double-counts.", "text", 2,
            ["Which outcome appears in both lists?",
             "The addition rule must subtract the overlap, as in a two-set Venn diagram."], strand="C(ii)",
            accepted=["2 is counted in both events, so it is added twice",
                      "the overlap 2 is double-counted",
                      "because 2 is both even and prime it is included in both probabilities"]),
          P("c", "(c)", "Calculate the correct probability of even or prime, as a fraction in simplest form.", "expression", 2,
            ["Add the two probabilities and subtract the probability of the overlap.",
             "Count the outcomes in the union: 2, 3, 4, 5, 6, 7, 8."], strand="C(iii)", accepted=["7/8"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="List the outcomes explicitly in (a); that list is the evidence for your explanation in (b).",
      explanation="Even = {2, 4, 6, 8}, prime = {2, 3, 5, 7}. The only overlap is 2, so adding 4/8 + 4/8 counts it "
                  "twice. P(even or prime) = 4/8 + 4/8 − 1/8 = 7/8, matching the seven distinct outcomes.",
      next_time="P(A or B) = P(A) + P(B) − P(A and B). Whenever two events can happen together, subtract the overlap.",
      marking="(a) 1 mark for 2. (b) 2 marks: 1 for naming the overlapping outcome, 1 for explaining the double count. "
              "(c) 2 marks: 1 for the method, 1 for 7/8."),
    Q(25, "proportion", "hard", "C",
      "A shop increases every price by 20%. One month later it reduces every price by 20% of the new price. "
      "A shirt originally costing $250 is discussed.\n\n(a) Calculate the price after the increase.\n"
      "(b) Calculate the price after the reduction.\n(c) Explain why the final price is not $250.",
      "250 × 1.20 = $300 after the increase. The reduction is 20% of $300, so 300 × 0.80 = $240. The two "
      "percentages act on different bases, so they do not cancel; the multiplier is 1.2 × 0.8 = 0.96, a 4% loss.",
      parts=[
          P("a", "(a)", "Calculate the price after the 20% increase, in dollars.", "numeric", 1,
            ["A 20% increase multiplies the price by 1.20.",
             "20% of 250 is 50."], strand="C(i)", answer=300, tol=0, unit="$"),
          P("b", "(b)", "Calculate the price after the 20% reduction, in dollars.", "numeric", 2,
            ["The reduction is 20% of the NEW price, not of $250.",
             "Multiply 300 by 0.80."], strand="C(ii)", answer=240, tol=0, unit="$"),
          P("c", "(c)", "Explain why the final price is not $250.", "text", 2,
            ["What amount is the 20% reduction calculated from?",
             "Compare 20% of 250 with 20% of 300."], strand="C(iv)",
            accepted=["the 20% reduction is taken from the higher price of $300, so it removes $60 instead of the $50 that was added",
                      "20% of 300 is more than 20% of 250",
                      "the percentages act on different amounts so they do not cancel"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Show the multiplier you use in (a) and (b). In (c) refer to the base each percentage is taken from.",
      explanation="$250 × 1.2 = $300; then $300 × 0.8 = $240. The reduction is $60 while the increase was $50, "
                  "because each percentage is calculated on a different base. The combined multiplier 0.96 shows an "
                  "overall 4% decrease.",
      next_time="Percentages apply to the amount that exists at that moment. Chain the multipliers (1.2 × 0.8 = 0.96) rather than adding percentages.",
      marking="(a) 1 mark for $300. (b) 2 marks: 1 for using $300 as the base, 1 for $240. (c) 2 marks: 1 for "
              "identifying the different bases, 1 for a clear consequence ($60 removed vs $50 added)."),
    Q(26, "sets and Venn diagrams", "hard", "C",
      "In a two-set Venn diagram, n(A only) = 7, n(B only) = 9 and n(A ∪ B) = 21.\n\n(a) Explain how the three "
      "regions of the union are related.\n(b) Calculate n(A ∩ B).\n(c) A student says 'A ∩ B must be the bigger "
      "region because it is in both circles'. Correct the statement using your value.",
      "The union is made of exactly three non-overlapping regions: A only, B only and A ∩ B. Therefore "
      "21 = 7 + 9 + n(A∩B), giving n(A∩B) = 5. Being 'in both sets' does not make a region larger — it is a "
      "separate region whose size depends on the data.",
      parts=[
          P("a", "(a)", "Explain how the three regions of A ∪ B are related.", "text", 1,
            ["Which regions lie inside the two circles?",
             "They do not overlap each other, so their numbers add to the union."], strand="C(i)",
            accepted=["the union is the sum of A only, B only and the intersection",
                      "the three regions partition the union so they add to it"]),
          P("b", "(b)", "Calculate n(A ∩ B).", "numeric", 2,
            ["Write 21 = 7 + 9 + x.",
             "Subtract the two 'only' values from 21."], strand="C(ii)", answer=5, tol=0),
          P("c", "(c)", "Correct the student's statement using your value.", "text", 2,
            ["Compare 5 with 7 and 9.",
             "Explain what 'in both circles' actually describes."], strand="C(iv)",
            accepted=["the intersection holds only 5 students, fewer than either 'only' region, because being in both sets is a separate region",
                      "5 is smaller than 7 and 9, so the intersection is not the biggest region"]),
      ],
      tools=["venn", "rich_text", "math"], requirement="venn",
      guidance="Sketch the diagram in the workspace to support your explanation, then answer the parts in the boxes.",
      explanation="The three regions inside the circles are disjoint and together make up A ∪ B. So "
                  "n(A∩B) = 21 − 7 − 9 = 5. The intersection is a region in its own right and its size comes from "
                  "the data, not from belonging to two sets.",
      next_time="In a Venn diagram, every region is counted once. Write the addition for the whole union and solve for the unknown region.",
      marking="(a) 1 mark for the partition idea. (b) 2 marks: 1 for the equation, 1 for 5. (c) 2 marks: 1 for "
              "comparing 5 with 7 and 9, 1 for explaining why the overlap is a separate region."),
    Q(27, "rate", "hard", "C",
      "Two cars set off together on the same 240 km route. Car A travels at 80 km/h and Car B at 60 km/h, both "
      "at a steady speed.\n\n(a) Calculate the journey time of Car A, in hours.\n(b) Calculate the journey time "
      "of Car B, in hours.\n(c) Calculate how many minutes later Car B arrives.",
      "Car A: 240 ÷ 80 = 3 h. Car B: 240 ÷ 60 = 4 h. The difference is 1 hour = 60 minutes. Subtracting the "
      "speeds (20) rather than comparing the times is the common error.",
      parts=[
          P("a", "(a)", "Calculate the journey time of Car A, in hours.", "numeric", 1,
            ["time = distance ÷ speed.",
             "240 ÷ 80."], strand="C(i)", answer=3, tol=0, unit="hours"),
          P("b", "(b)", "Calculate the journey time of Car B, in hours.", "numeric", 1,
            ["Use Car B's speed of 60 km/h.",
             "240 ÷ 60."], strand="C(i)", answer=4, tol=0, unit="hours"),
          P("c", "(c)", "Calculate how many minutes later Car B arrives.", "numeric", 2,
            ["Subtract the two times, not the two speeds.",
             "Convert the difference in hours to minutes."], strand="C(iii)", answer=60, tol=0, unit="minutes"),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Write the formula you use in (a) and (b), with the numbers substituted.",
      explanation="Car A takes 240 ÷ 80 = 3 hours and Car B takes 240 ÷ 60 = 4 hours, so B arrives 1 hour, that is "
                  "60 minutes, later. Comparing speeds would not give a time.",
      next_time="Time is distance ÷ speed. When comparing two journeys, compare the times you compute, not the speeds.",
      marking="(a) 1 mark for 3 hours. (b) 1 mark for 4 hours. (c) 2 marks: 1 for subtracting the times, 1 for 60 minutes."),
    Q(28, "probability", "hard", "C",
      "A fair coin is tossed three times and the sequence of faces is recorded.\n\n(a) Calculate the number of "
      "outcomes in the sample space.\n(b) List the outcomes that contain exactly two heads.\n(c) Calculate the "
      "probability of exactly two heads.",
      "Each toss doubles the number of sequences: 2 × 2 × 2 = 8. Exactly two heads occurs in HHT, HTH, THH — "
      "three outcomes — so P = 3/8. Counting only '0, 1, 2 or 3 heads' gives 4 outcomes and is wrong because the "
      "sequences are not equally likely in that description.",
      parts=[
          P("a", "(a)", "Calculate the number of outcomes in the sample space.", "numeric", 1,
            ["Each toss has 2 possible faces.",
             "Multiply the possibilities for the three tosses."], strand="C(i)", answer=8, tol=0),
          P("b", "(b)", "State how many sequences have exactly two heads.", "numeric", 2,
            ["Work systematically: start with the tail in each position.",
             "There are three arrangements of two H and one T."], strand="C(ii)", answer=3, tol=0),
          P("c", "(c)", "Calculate the probability of exactly two heads.", "expression", 2,
            ["Count your outcomes from (b) and divide by the sample space size.",
             "3 favourable outcomes out of 8."], strand="C(iii)", accepted=["3/8"]),
      ],
      tools=["rich_text", "math", "table"], requirement="text",
      guidance="A table of the eight sequences is a good way to be sure you have listed them all in (b).",
      explanation="2³ = 8 equally likely sequences. Exactly two heads: HHT, HTH, THH, so P = 3/8. Grouping by "
                  "'number of heads' would not be equally likely and must not be used as the sample space.",
      next_time="For repeated independent trials the sample space size multiplies; list the outcomes systematically so none are missed.",
      marking="(a) 1 mark for 8. (b) 2 marks: 2 for all three sequences, 1 for two of them. (c) 2 marks: 1 for "
              "3 favourable outcomes, 1 for 3/8."),
    Q(29, "ratio", "hard", "D",
      "A school canteen uses 15 kg of rice for 120 meals. A second canteen uses 26 kg for 200 meals.\n\n"
      "(a) Calculate the rice used per meal at the first canteen, in grams.\n(b) Calculate the rice used per "
      "meal at the second canteen, in grams.\n(c) State which canteen uses less rice per meal and by how many "
      "grams, and explain why comparing the totals 15 kg and 26 kg would be misleading.",
      "15 kg = 15 000 g, so 15 000 ÷ 120 = 125 g per meal. 26 kg = 26 000 g, so 26 000 ÷ 200 = 130 g per meal. "
      "The first canteen uses 5 g less per meal. Comparing totals is misleading because the number of meals "
      "differs.",
      parts=[
          P("a", "(a)", "Calculate the grams of rice per meal at the first canteen.", "numeric", 1,
            ["Convert 15 kg to grams first.",
             "Divide the grams by 120 meals."], strand="D(i)", answer=125, tol=0, unit="g"),
          P("b", "(b)", "Calculate the grams of rice per meal at the second canteen.", "numeric", 1,
            ["Convert 26 kg to grams.",
             "Divide by 200 meals."], strand="D(i)", answer=130, tol=0, unit="g"),
          P("c", "(c)", "State which canteen uses less per meal, by how many grams, and why totals mislead.", "text", 2,
            ["Compare the two per-meal values, not the two totals.",
             "The canteens serve different numbers of meals."], strand="D(ii)",
            accepted=["the first canteen, by 5 g per meal, because the canteens serve different numbers of meals so the totals are not comparable",
                      "first canteen by 5g; totals cannot be compared because the meal counts differ"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Show the unit conversion in (a) and (b). In (c) give the difference AND the reason.",
      explanation="15 000 g ÷ 120 = 125 g and 26 000 g ÷ 200 = 130 g, so the first canteen uses 5 g less per meal. "
                  "A total is not a rate: the second canteen serves 80 more meals, so its bigger total does not mean "
                  "it wastes more per meal.",
      next_time="To compare two groups of different size, compare a per-item rate. Convert units before dividing.",
      marking="(a) 1 mark for 125 g. (b) 1 mark for 130 g. (c) 2 marks: 1 for 'first canteen, 5 g less', 1 for "
              "explaining that the meal counts differ."),
    Q(30, "proportion", "hard", "D",
      "A photograph is 15 cm wide and 10 cm high. It is enlarged so that the width becomes 39 cm.\n\n"
      "(a) Calculate the scale factor of the enlargement.\n(b) Calculate the new height.\n(c) Explain what "
      "assumption your answer depends on, and what would happen to the picture if that assumption were false.",
      "The scale factor is 39 ÷ 15 = 2.6, so the height is 10 × 2.6 = 26 cm. The answer assumes the shape is "
      "preserved (the aspect ratio is unchanged); if the height were scaled differently the picture would be "
      "stretched or squashed and would no longer look like the original.",
      parts=[
          P("a", "(a)", "Calculate the scale factor.", "numeric", 1,
            ["Divide the new width by the original width.",
             "39 ÷ 15."], strand="D(i)", answer=2.6, tol=0.001),
          P("b", "(b)", "Calculate the new height, in centimetres.", "numeric", 2,
            ["Multiply the original height by the scale factor.",
             "Use the same factor as the width."], strand="D(ii)", answer=26, tol=0, unit="cm"),
          P("c", "(c)", "State the assumption and what would go wrong without it.", "text", 2,
            ["A photograph that is enlarged without distortion keeps its proportions.",
             "If width and height used different factors, the shape would change."], strand="D(iv)",
            accepted=["the shape is preserved, so both dimensions use the same scale factor; otherwise the picture would be stretched",
                      "the aspect ratio stays the same; otherwise the image is distorted"]),
      ],
      tools=["rich_text", "math", "geometry"], requirement="text",
      guidance="One scale factor is used for both dimensions in (b) — say why that is legitimate in (c).",
      explanation="39 ÷ 15 = 2.6, so the height becomes 10 × 2.6 = 26 cm. This requires similar (proportional) "
                  "enlargement. Without that assumption a designer could set any height, and the photograph would "
                  "be distorted.",
      next_time="An enlargement uses one scale factor for every dimension. State the similarity assumption when a real object is modelled.",
      marking="(a) 1 mark for 2.6. (b) 2 marks: 1 for multiplying by the factor, 1 for 26 cm. (c) 2 marks: 1 for "
              "'proportions preserved', 1 for the consequence of distortion."),
    Q(31, "probability", "hard", "D",
      "A game at a school fair costs $3 per play. It uses a bag of 12 balls: 1 gold ball wins $15, 3 silver balls "
      "win $3 each and the remaining 8 win nothing.\n\n(a) Write P(gold) as a fraction and as a decimal.\n"
      "(b) Calculate the expected winnings per play.\n(c) Calculate the expected gain or loss per play and decide "
      "whether the organiser should expect to make a profit.",
      "P(gold) = 1/12 ≈ 0.083 and P(silver) = 3/12 = 0.25. Expected winnings = (1/12)(15) + 0.25(3) = 1.25 + 0.75 "
      "= $2.00. Against a $3 charge the player expects to lose $1.00 per play, so the organiser expects a profit of "
      "$1.00 per play.",
      parts=[
          P("a", "(a)", "Write P(gold) as a decimal, to 3 decimal places.", "numeric", 1,
            ["Probability = favourable outcomes ÷ total outcomes.",
             "One gold ball out of 12 balls, so evaluate 1 ÷ 12."], strand="D(i)", answer=0.083, tol=0.001),
          P("b", "(b)", "Calculate the expected winnings per play, in dollars.", "numeric", 2,
            ["Multiply each prize by its probability and add the products.",
             "(1/12) × 15 plus (3/12) × 3."], strand="D(ii)", answer=2.0, tol=0.02, unit="$"),
          P("c", "(c)", "Calculate the expected profit per play for the organiser, and justify it.", "text", 2,
            ["Compare the expected winnings with the $3 price.",
             "The organiser keeps the price and pays out the winnings."], strand="D(iv)",
            accepted=["the player expects to lose $1.00 per play, so the organiser expects to make about $1.00 profit per play",
                      "expected profit of $1.00 per play, since $3.00 − $2.00 = $1.00"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Keep the fractions exact in (b) before converting, and state in (c) whose expected value you are describing.",
      explanation="E(winnings) = (1/12)(15) + (3/12)(3) = 1.25 + 0.75 = $2.00 against a $3 charge, so the player's "
                  "expected loss — and the organiser's expected profit — is $1.00 per play.",
      next_time="Expected value = Σ(prize × probability). A loss for the player is a profit for the organiser: state which one you are computing.",
      marking="(a) 1 mark for 0.083. (b) 2 marks: 1 for both products, 1 for $2.00. (c) 2 marks: 1 for the "
              "comparison with $3, 1 for identifying it as the organiser's profit."),
    Q(32, "sets and Venn diagrams", "hard", "D",
      "In a class of 30 students, 17 study French (F), 15 study Spanish (S) and 6 study neither language.\n\n"
      "(a) Calculate how many students study at least one language.\n(b) Calculate how many study both languages.\n"
      "(c) A student claims that 11 students study French but not Spanish. Evaluate this claim.",
      "At least one = 30 − 6 = 24. Using the union formula, n(F ∩ S) = 17 + 15 − 24 = 8, so French only is "
      "17 − 8 = 9 and Spanish only is 15 − 8 = 7. The claim of 11 is wrong: it uses 17 − 6, subtracting the wrong "
      "group instead of the overlap.",
      parts=[
          P("a", "(a)", "Calculate how many students study at least one language.", "numeric", 1,
            ["Everyone in the class either studies a language or studies neither.",
             "So subtract the 6 who study neither from the 30 in the class."], strand="D(i)", answer=24, tol=0),
          P("b", "(b)", "Calculate how many students study both languages.", "numeric", 2,
            ["n(F ∪ S) = n(F) + n(S) − n(F ∩ S).",
             "17 + 15 − 24."], strand="D(ii)", answer=8, tol=0),
          P("c", "(c)", "Evaluate the claim that 11 students study French but not Spanish.", "text", 3,
            ["French only = n(F) − n(F ∩ S).",
             "Compare 17 − 8 with 17 − 6."], strand="D(iii)",
            accepted=["the claim is wrong: french only is 17 − 8 = 9, not 11; subtracting 6 subtracts the wrong group",
                      "incorrect, because 11 comes from subtracting the 6 who study neither instead of the 8 who study both"]),
      ],
      tools=["venn", "rich_text", "math"], requirement="venn",
      guidance="Fill the overlap first in the workspace, then the two 'only' regions, then place the 6 outside.",
      explanation="At least one = 24. The overlap is 17 + 15 − 24 = 8, so French only = 9 and Spanish only = 7 "
                  "(9 + 8 + 7 = 24). The suggested 11 confuses the 'neither' group with the overlap.",
      next_time="Use n(F ∪ S) = n(F) + n(S) − n(F ∩ S), and remember the 'neither' group is outside both circles.",
      marking="(a) 1 mark for 24. (b) 2 marks: 1 for the union formula, 1 for 8. (c) 3 marks: 1 for French only = 9, "
              "1 for identifying the misused group, 1 for a full evaluation."),
    Q(33, "rate", "hard", "D",
      "Three brands of washing powder are sold in different pack sizes.\n\nPack A: 1.2 kg for $6.60\n"
      "Pack B: 2 kg for $10.50\nPack C: 3 kg for $16.20\n\n(a) Calculate the cost per kilogram of Pack A.\n"
      "(b) Calculate the cost per kilogram of Pack C.\n(c) State which pack is the best buy, and explain why a "
      "household that does one wash a week might not choose it.",
      "Pack A: 6.60 ÷ 1.2 = $5.50 per kg. Pack B: 10.50 ÷ 2 = $5.25 per kg. Pack C: 16.20 ÷ 3 = $5.40 per kg. The "
      "best unit price is Pack B at $5.25 per kg, not the largest pack; a household doing one wash a week may take "
      "months to use 3 kg, so powder that spoils or goes damp can outweigh a unit-price saving.",
      parts=[
          P("a", "(a)", "Calculate the cost per kilogram of Pack A.", "numeric", 1,
            ["Divide the price by the mass in kilograms.",
             "6.60 ÷ 1.2."], strand="D(i)", answer=5.5, tol=0.01, unit="$/kg"),
          P("b", "(b)", "Calculate the cost per kilogram of Pack C.", "numeric", 1,
            ["Divide the price of the pack by its mass in kilograms.",
             "Pack C costs $16.20 for 3 kg, so evaluate 16.20 ÷ 3."], strand="D(i)", answer=5.4, tol=0.01, unit="$/kg"),
          P("c", "(c)", "State the best buy and why a small household might choose differently.", "text", 4,
            ["Compare all three unit prices before deciding.",
             "Does 'biggest' always mean 'best value'?"], strand="D(iv)",
            accepted=["pack b at $5.25 per kg is the best unit price, but a household using 3 kg slowly may waste or spoil powder, so the cheapest per kilogram is not automatically the best purchase",
                      "pack b; the largest pack c is dearer per kg and may not be used before it spoils"]),
      ],
      tools=["rich_text", "math", "table"], requirement="text",
      guidance="Give all three unit prices in your working, even though only two are boxed — the comparison in (c) needs them.",
      explanation="Unit prices: A $5.50, B $5.25, C $5.40. Pack B is the best buy even though it is neither the "
                  "largest nor the smallest; the largest pack (C) is dearer per kilogram. Usage matters because "
                  "powder can spoil before a small household finishes 3 kg.",
      next_time="Best buy means the lowest unit price — compute every option before choosing, and check that the quantity will be used.",
      marking="(a) 1 mark. (b) 1 mark. (c) 4 marks: 1 for Pack B, 1 for the $5.25 comparison, 1 for noting that "
              "C is dearer per kg despite being largest, 1 for the waste argument."),
    Q(34, "ratio", "hard", "D",
      "A recipe for 12 flapjacks uses oats, butter and honey in the ratio 6 : 3 : 1 by mass, and produces 12 "
      "flapjacks each of mass 80 g.\n\n(a) Calculate the total mass of one batch.\n(b) Calculate the mass of "
      "oats in one batch.\n(c) A cook has 900 g of oats and wants to make as many flapjacks as possible, with "
      "the other ingredients unlimited. Calculate the number of complete batches possible.",
      "One batch weighs 12 × 80 = 960 g. Oats are 6 of the 10 parts: 960 ÷ 10 = 96 g per part, so oats are "
      "576 g. With 900 g of oats, 900 ÷ 576 = 1.5625, so only 1 complete batch is possible — the cook cannot "
      "scale to two batches (1152 g of oats) and should not simply multiply by 1.5.",
      parts=[
          P("a", "(a)", "Calculate the total mass of one batch, in grams.", "numeric", 1,
            ["Multiply the mass of one flapjack by 12.", "12 × 80."], strand="D(i)", answer=960, tol=0, unit="g"),
          P("b", "(b)", "Calculate the mass of oats in one batch, in grams.", "numeric", 2,
            ["The ratio parts total 6 + 3 + 1 = 10.",
             "Divide 960 by 10, then multiply by 6."], strand="D(ii)", answer=576, tol=0, unit="g"),
          P("c", "(c)", "Calculate the number of complete batches possible with 900 g of oats.", "numeric", 2,
            ["Divide the available oats by the oats per batch.",
             "900 ÷ 576 = 1.56, so how many complete batches?"], strand="D(iii)", answer=1, tol=0, unit="batches"),
          P("d", "(d)", "Explain why the cook cannot make 1.56 batches.", "text", 2,
            ["Can you bake a fraction of a batch and still have complete trays?",
             "What would two full batches require?"], strand="D(iv)",
            accepted=["a batch is a whole number of flapjacks: only 1 complete batch fits, because 2 batches would need 1152 g of oats and the cook has 900 g",
                      "you cannot make a fraction of a complete batch; two batches need more oats than are available"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Do not round 1.56 up — explain in (d) why the answer must be a whole number of batches.",
      explanation="A batch is 960 g with 576 g of oats (6/10 of the mass). 900 ÷ 576 ≈ 1.56, so 1 complete batch "
                  "is possible; 2 batches need 1152 g. Rounding up would promise flapjacks the oats cannot supply.",
      next_time="In a ratio, divide by the TOTAL number of parts. When scaling a recipe, round down to whole batches.",
      marking="(a) 1 mark. (b) 2 marks: 1 for the 10 parts, 1 for 576 g. (c) 2 marks: 1 for the division, 1 for 1. "
              "(d) 2 marks: 1 for the whole-batch argument, 1 for citing 1152 g."),
    Q(35, "probability", "hard", "D",
      "A seed packet claims that 85% of its seeds germinate. A gardener plants 20 seeds and 14 germinate.\n\n"
      "(a) Calculate the relative frequency of germination in the gardener's trial.\n(b) The gardener concludes "
      "the packet's claim is false. Explain why this conclusion is unsafe for a sample of 20.\n(c) Calculate how "
      "many of the 20 seeds you would expect to germinate if the claim were true, and use it to judge the "
      "gardener's result.",
      "Relative frequency = 14/20 = 0.70. The expected number is 0.85 × 20 = 17, so the gardener saw 3 fewer than "
      "predicted. With only 20 seeds, a random shortfall of 3 is unremarkable — the standard deviation of the "
      "count is about √(20 × 0.85 × 0.15) ≈ 1.6, so 14 is roughly two standard deviations below 17, which can "
      "happen by chance; a larger trial is needed before rejecting the claim.",
      parts=[
          P("a", "(a)", "Calculate the relative frequency of germination, as a decimal.", "numeric", 1,
            ["Divide the germinated seeds by the number planted.",
             "14 ÷ 20."], strand="D(i)", answer=0.7, tol=0.001),
          P("b", "(b)", "Calculate the number of seeds expected to germinate if the claim is true.", "numeric", 1,
            ["Multiply the claimed probability by the 20 seeds.",
             "0.85 × 20."], strand="D(ii)", answer=17, tol=0),
          P("c", "(c)", "Explain why a result of 14 does not disprove the claim.", "text", 3,
            ["Compare the observed 14 with the expected 17.",
             "Would a different handful of 20 seeds give a different count?"], strand="D(iii)",
            accepted=["14 is only 3 below the expected 17, and with a sample of only 20 that shortfall is ordinary random variation, so a larger trial is needed before rejecting the claim",
                      "the sample is too small: random variation in 20 seeds easily produces a difference of 3"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Quote the expected count in (c) — the judgement is a comparison with it, not an opinion.",
      explanation="The observed relative frequency is 0.70 against a claim of 0.85, an expected 17 of 20. A "
                  "shortfall of 3 is within ordinary sampling variation for such a small sample, so the claim is "
                  "not disproved; a trial of several hundred seeds would be needed.",
      next_time="Judge a probability claim against the expected count AND the size of the sample; small samples vary widely.",
      marking="(a) 1 mark. (b) 1 mark for 17. (c) 3 marks: 1 for the comparison, 1 for sampling variation, 1 for the "
              "recommendation of a larger sample."),
    Q(36, "sets and Venn diagrams", "hard", "D",
      "In a survey of 50 students about three sports, 24 play football (F), 20 play hockey (H) and 9 play both.\n\n"
      "(a) Calculate how many play football only.\n(b) Calculate how many play exactly one of the two sports.\n"
      "(c) State how many play neither, and describe the region (F ∪ H)′ in words.",
      "Football only = 24 − 9 = 15 and hockey only = 20 − 9 = 11. Exactly one = 15 + 11 = 26. At least one = "
      "15 + 9 + 11 = 35, so neither = 50 − 35 = 15. The region (F ∪ H)′ is the set of students outside both "
      "circles: those who play neither sport.",
      parts=[
          P("a", "(a)", "Calculate how many students play football only.", "numeric", 1,
            ["The 24 footballers include everyone who plays both sports.",
             "Subtract the 9 who play both from the 24."], strand="D(i)", answer=15, tol=0),
          P("b", "(b)", "Calculate how many students play exactly one of the two sports.", "numeric", 2,
            ["Add the football-only and hockey-only regions.",
             "(24 − 9) + (20 − 9)."], strand="D(ii)", answer=26, tol=0),
          P("c", "(c)", "Calculate how many students play neither sport.", "numeric", 2,
            ["First add all three regions inside the circles.",
             "Subtract that union from 50."], strand="D(iii)", answer=15, tol=0),
          P("d", "(d)", "Describe (F ∪ H)′ in words.", "text", 2,
            ["The dash means 'the complement': everything outside.",
             "Outside both circles means neither sport."], strand="D(iv)",
            accepted=["students who play neither football nor hockey", "those outside both circles: neither sport"]),
      ],
      tools=["venn", "rich_text", "math"], requirement="venn",
      guidance="Place the 9 in the overlap first, then the two 'only' regions, then the 15 outside the circles.",
      explanation="Overlap 9, football only 15, hockey only 11, so exactly one sport = 26 and the union is 35. "
                  "Neither = 50 − 35 = 15. The complement of the union is exactly that 'neither' region.",
      next_time="Fill the overlap first; 'exactly one' means the two 'only' regions and excludes the overlap.",
      marking="(a) 1 mark. (b) 2 marks: 1 for both only-regions, 1 for 26. (c) 2 marks: 1 for the union 35, 1 for "
              "15. (d) 2 marks: 1 for 'neither', 1 for describing it as outside both sets."),
    Q(37, "proportion", "hard", "D",
      "Six identical machines take 10 days to complete an order.\n\n(a) Calculate the total number of "
      "machine-days needed for the order.\n(b) Calculate how many days four machines would take at the same rate.\n"
      "(c) After 4 days, two more machines are added to the original six. Calculate how many further days are "
      "needed.",
      "The order needs 6 × 10 = 60 machine-days. Four machines need 60 ÷ 4 = 15 days. Six machines work for 4 days "
      "completing 24 machine-days, leaving 36 machine-days; with 8 machines that is 36 ÷ 8 = 4.5 further days.",
      parts=[
          P("a", "(a)", "Calculate the total number of machine-days needed.", "numeric", 1,
            ["One machine working for one day completes one machine-day of work.",
             "Six machines working for ten days: multiply the two numbers."], strand="D(i)", answer=60, tol=0, unit="machine-days"),
          P("b", "(b)", "Calculate how many days four machines would take.", "numeric", 2,
            ["The order still needs the same total machine-days of work.",
             "With four machines, divide the machine-days by four."], strand="D(ii)", answer=15, tol=0, unit="days"),
          P("c", "(c)", "Calculate the work completed in the first 4 days, in machine-days.", "numeric", 2,
            ["Count the machine-days completed before the extra machines arrive.",
             "Six machines each work for four days."], strand="D(iii)", answer=24, tol=0, unit="machine-days"),
          P("d", "(d)", "Calculate how many further days the eight machines need.", "numeric", 3,
            ["Subtract 24 from 60 to find the work left.",
             "With two extra machines there are 8 working at once: divide by 8."], strand="D(iv)", answer=4.5, tol=0.05, unit="days"),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Work in machine-days throughout; never add the days of different machines as if they were separate.",
      explanation="The order is 60 machine-days. Four machines take 15 days. In 4 days the six machines finish 24 "
                  "machine-days, leaving 36; eight machines then need 36 ÷ 8 = 4.5 further days.",
      next_time="In inverse-proportion work problems, convert to machine-days (or person-days) first, then divide by the new rate.",
      marking="(a) 1 mark. (b) 2 marks: 1 for the division, 1 for 15. (c) 2 marks: 1 for 6 × 4, 1 for 24. "
              "(d) 3 marks: 1 for the remaining 36, 1 for using 8 machines, 1 for 4.5."),
    Q(38, "probability", "hard", "D",
      "A charity lottery sells 800 tickets. One ticket wins $200 and five tickets win $20 each. A ticket costs "
      "$2.\n\n(a) Write the probability of winning the $200 prize as a decimal.\n(b) Calculate the expected "
      "winnings from one ticket.\n(c) A supporter argues that buying 10 tickets makes the game fair. Evaluate "
      "this argument using expected values.",
      "P($200) = 1/800 = 0.00125 and P($20) = 5/800 = 0.00625. Expected winnings per ticket = 0.00125(200) + "
      "0.00625(20) = 0.25 + 0.125 = $0.375. Buying 10 tickets costs $20 and returns 10 × 0.375 = $3.75 in "
      "expectation, still a loss of $16.25: the number of tickets scales both the cost and the expectation "
      "proportionally, so the game never becomes fair.",
      parts=[
          P("a", "(a)", "Write the probability of winning the $200 prize as a decimal.", "numeric", 1,
            ["One ticket out of 800.",
             "1 ÷ 800."], strand="D(i)", answer=0.00125, tol=1e-05),
          P("b", "(b)", "Calculate the expected winnings from one ticket, in dollars.", "numeric", 2,
            ["Multiply each prize by its probability and add.",
             "0.00125 × 200 + 0.00625 × 20."], strand="D(ii)", answer=0.375, tol=0.005, unit="$"),
          P("c", "(c)", "Evaluate the argument that 10 tickets make the game fair.", "text", 3,
            ["What do 10 tickets cost?",
             "How does multiplying the tickets affect the expected winnings?"], strand="D(iii)",
            accepted=["the argument fails: 10 tickets cost $20 and return only $3.75 in expectation, a loss of $16.25, and buying more tickets scales the cost and the expected winnings equally so the game stays unfair",
                      "not fair: the expected return is $0.375 per ticket against a $2 cost, so 10 tickets still lose $16.25 on average"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="In (c) compute the cost AND the expected return for 10 tickets; the comparison is the argument.",
      explanation="Expected winnings per ticket = 0.00125(200) + 0.00625(20) = $0.375 against a $2 cost, an expected "
                  "loss of $1.625 per ticket. Ten tickets cost $20 and return $3.75 in expectation, so the game "
                  "remains firmly unfair.",
      next_time="Expected value is linear: multiplying the number of tickets multiplies both the cost and the expectation, leaving the expected loss per ticket unchanged.",
      marking="(a) 1 mark. (b) 2 marks: 1 for the products, 1 for $0.375. (c) 3 marks: 1 for the cost of 10 "
              "tickets, 1 for the expected return, 1 for the conclusion that scaling does not make it fair."),
    Q(39, "ratio", "hard", "C",
      "Two students simplify the ratio 45 : 60 : 75.\n\nAisha writes 3 : 4 : 5. Ben writes 9 : 12 : 15.\n\n"
      "(a) State the highest common factor of 45, 60 and 75.\n(b) Explain which of the two answers is fully "
      "simplified and why the other is not wrong but incomplete.\n(c) The ratio represents the prize money of "
      "three winners sharing $540. Calculate each winner's share using the simplified ratio.",
      "The HCF of 45, 60 and 75 is 15, giving 3 : 4 : 5. Ben divided by 5 only, so his 9 : 12 : 15 is an "
      "equivalent ratio but has a common factor of 3 left. For $540 the parts total 12, so one part is $45 and the "
      "shares are $135, $180 and $225.",
      parts=[
          P("a", "(a)", "State the highest common factor of 45, 60 and 75.", "numeric", 1,
            ["List the factors of 45 and look for the largest one shared by all three.",
             "15 divides all three; is any larger number a factor of all three?"], strand="C(i)", answer=15, tol=0),
          P("b", "(b)", "Explain which answer is fully simplified, and why the other is not wrong.", "text", 2,
            ["Which ratio cannot be divided by a common factor any more?",
             "Equivalent ratios can be correct without being simplest form."], strand="C(ii)",
            accepted=["aisha's 3 : 4 : 5 is fully simplified; ben's 9 : 12 : 15 is an equivalent ratio but still divisible by 3, so it is not in simplest form",
                      "aisha's is simplest; ben's is equivalent but incomplete because 3 still divides all three parts"]),
          P("c", "(c)", "Calculate the value of one part, in dollars.", "numeric", 1,
            ["The simplified parts total 3 + 4 + 5 = 12.",
             "Divide $540 by 12."], strand="C(iii)", answer=45, tol=0, unit="$"),
          P("d", "(d)", "State the largest share, in dollars.", "numeric", 2,
            ["The largest share is 5 parts.",
             "Multiply your part value by 5."], strand="C(iii)", answer=225, tol=0, unit="$"),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Show the part value in (c); both shares follow from it, and it earns its own mark.",
      explanation="Dividing 45 : 60 : 75 by 15 gives 3 : 4 : 5, so Aisha is fully simplified while Ben stopped at "
                  "9 : 12 : 15. The parts total 12, one part is $45, so the shares are $135, $180 and $225.",
      next_time="Divide by the HCF, not just any common factor, and check that no common factor remains.",
      marking="(a) 1 mark. (b) 2 marks: 1 for naming Aisha's ratio, 1 for explaining equivalence. (c) 1 mark for "
              "$45. (d) 2 marks: 1 for 5 parts, 1 for $225."),
    Q(40, "probability", "hard", "C",
      "A bag contains 4 red and 6 green counters. A counter is drawn and NOT replaced, then a second counter is "
      "drawn.\n\n(a) State the probability that the first counter is red.\n(b) Given the first counter was red, "
      "state the probability that the second is also red.\n(c) Calculate the probability that both counters are "
      "red.\n(d) Explain why your answer in (c) is not simply (4/10) × (4/10).",
      "P(first red) = 4/10 = 2/5. After removing a red there are 3 red and 6 green left of 9, so the second is red "
      "with probability 3/9 = 1/3. Both red = (4/10)(3/9) = 12/90 = 2/15. Squaring 4/10 would describe drawing "
      "WITH replacement, where the bag returns to 10 counters; without replacement the second draw depends on "
      "the first.",
      parts=[
          P("a", "(a)", "State the probability that the first counter is red, as a decimal.", "numeric", 1,
            ["Probability = red counters ÷ total counters.",
             "There are 4 red counters and 10 in the bag altogether."], strand="C(i)", answer=0.4, tol=0.001),
          P("b", "(b)", "State the probability that the second is red given the first was red, as a decimal.", "numeric", 2,
            ["One red has been removed, so how many red and how many total remain?",
             "3 red out of 9."], strand="C(ii)", answer=0.333, tol=0.002),
          P("c", "(c)", "Calculate the probability that both counters are red, as a fraction in simplest form.", "expression", 2,
            ["Multiply the two probabilities.",
             "(4/10) × (3/9) simplifies to what?"], strand="C(iii)", accepted=["2/15", "12/90", "0.1333"]),
          P("d", "(d)", "Explain why the answer is not (4/10) × (4/10).", "text", 2,
            ["Is the first counter put back?",
             "What happens to the total number of counters?"], strand="C(iv)",
            accepted=["the first counter is not replaced, so the second draw is from 9 counters and the probability changes; (4/10)² would be correct only with replacement",
                      "without replacement the two draws are not independent, so the probabilities are not the same"]),
      ],
      tools=["rich_text", "math", "table"], requirement="text",
      guidance="A tree diagram in the workspace makes the changing denominators visible — build it before (c).",
      explanation="P(R) = 4/10; given a red is removed, P(R) = 3/9. Both red = 12/90 = 2/15. Squaring 4/10 assumes "
                  "replacement, which would keep all 10 counters in the bag.",
      next_time="Without replacement, the denominator falls by one and the numerator falls for the colour drawn: multiply along the branches.",
      marking="(a) 1 mark. (b) 2 marks: 1 for 3/9, 1 for 0.333. (c) 2 marks: 1 for multiplying, 1 for 2/15. "
              "(d) 2 marks: 1 for 'no replacement', 1 for the independence consequence."),
    Q(41, "sets and Venn diagrams", "hard", "B",
      "A library surveys 90 members about borrowing fiction (F) and non-fiction (N). 52 borrowed fiction, 38 "
      "borrowed non-fiction and 14 borrowed both.\n\n(a) Draw a two-set Venn diagram and state the value in the "
      "fiction-only region.\n(b) State the value of n(F ∪ N).\n(c) Describe the region F′ ∩ N in words and give "
      "its value.",
      "Fiction only = 52 − 14 = 38 and non-fiction only = 38 − 14 = 24. The union is 38 + 14 + 24 = 76, so 14 "
      "members borrowed neither. F′ ∩ N means 'non-fiction but not fiction', which is the non-fiction-only "
      "region: 24 members.",
      parts=[
          P("a", "(a)", "State the value of the fiction-only region.", "numeric", 1,
            ["Subtract the 14 who borrowed both from the 52 fiction borrowers.",
             "52 − 14."], strand="B(i)", answer=38, tol=0),
          P("b", "(b)", "State the value of n(F ∪ N).", "numeric", 2,
            ["Add the three regions inside the circles.",
             "52 + 38 − 14 also works."], strand="B(ii)", answer=76, tol=0),
          P("c", "(c)", "Give the value of the region F′ ∩ N.", "numeric", 1,
            ["F′ ∩ N is non-fiction only.",
             "38 − 14."], strand="B(iii)", answer=24, tol=0),
          P("d", "(d)", "Describe F′ ∩ N in words.", "text", 2,
            ["Read left to right: not in F, and in N.",
             "Which part of the non-fiction circle is outside the overlap?"], strand="B(iii)",
            accepted=["members who borrowed non-fiction but not fiction",
                      "non-fiction borrowers who did not borrow fiction"]),
      ],
      tools=["venn", "rich_text", "math"], requirement="venn",
      guidance="Build the diagram in the workspace; the four numbers then justify each box.",
      explanation="Overlap 14, fiction only 38, non-fiction only 24; the union is 76 and 14 members borrowed "
                  "neither. F′ ∩ N is the non-fiction-only region, 24.",
      next_time="F′ ∩ N is not the same as 'neither': it means in N, outside F. Sketch the region before computing.",
      marking="(a) 1 mark for 38. (b) 2 marks: 1 for the addition, 1 for 76. (c) 1 mark for 24. (d) 2 marks: "
              "1 for the wording, 1 for excluding the overlap."),
    Q(42, "probability", "hard", "D",
      "A spinner has 5 equal sectors: 2 are red, 2 are blue, 1 is gold. A game costs $4 per spin. Red pays $3, "
      "blue pays $3 and gold pays $12.\n\n(a) Write the probability of gold as a decimal.\n(b) Calculate the "
      "expected payout per spin.\n(c) Calculate the expected loss per spin.\n(d) The organiser wants a game "
      "that is fair but keeps the $4 price. Suggest how to change the gold prize and verify your answer.",
      "P(gold) = 1/5 = 0.2 and P(red) = P(blue) = 0.4. Expected payout = 0.4(3) + 0.4(3) + 0.2(12) = 1.2 + 1.2 + "
      "2.4 = $4.80, so the player expects to gain $0.80 per spin — the organiser is losing money. For fairness the "
      "payout must equal $4: keeping the red and blue prizes, 2.4 + 0.2g = 4 gives g = $8.",
      parts=[
          P("a", "(a)", "Write the probability of gold as a decimal.", "numeric", 1,
            ["Every sector is equally likely, so divide the gold sectors by the total.",
             "One gold sector out of five."], strand="D(i)", answer=0.2, tol=0.001),
          P("b", "(b)", "Calculate the expected payout per spin, in dollars.", "numeric", 2,
            ["Multiply each prize by its probability and add all three products.",
             "0.4 × 3 + 0.4 × 3 + 0.2 × 12."], strand="D(ii)", answer=4.8, tol=0.02, unit="$"),
          P("c", "(c)", "Calculate the organiser's expected loss per spin, in dollars.", "numeric", 2,
            ["Compare the expected payout with the $4 price.",
             "4.80 − 4.00, and say whose loss it is."], strand="D(iii)", answer=0.8, tol=0.02, unit="$"),
          P("d", "(d)", "Suggest a gold prize that makes the game fair, and verify it.", "text", 3,
            ["For fairness the expected payout must equal $4.",
             "Solve 2.4 + 0.2g = 4."], strand="D(iv)",
            accepted=["reduce the gold prize to $8, because 0.4(3) + 0.4(3) + 0.2(8) = $4 exactly, so the expected payout equals the price",
                      "a gold prize of $8 gives expected payout $4 and a fair game"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Show all three products in (b), then state in (c) whose loss you are describing.",
      explanation="E(payout) = 0.4(3) + 0.4(3) + 0.2(12) = $4.80 against a $4 price, so the player expects to gain "
                  "$0.80 per spin and the organiser to lose it. Fairness needs E(payout) = $4, so 2.4 + 0.2g = 4 "
                  "gives g = $8 — the gold prize must come DOWN.",
      next_time="Fairness means expected payout = price of playing. Solve for the unknown prize rather than guessing.",
      marking="(a) 1 mark. (b) 2 marks: 1 for the three products, 1 for $4.80. (c) 2 marks: 1 for the difference, "
              "1 for 'organiser's loss'. (d) 3 marks: 1 for the fairness condition, 1 for $8, 1 for verification."),
    Q(43, "rate", "hard", "D",
      "A courier charges $18 for the first 5 kg and $2.40 for each additional kilogram.\n\n(a) Calculate the cost "
      "of sending a 12 kg parcel.\n(b) Calculate the average cost per kilogram for a 12 kg parcel.\n(c) A "
      "customer claims that sending two 6 kg parcels must be cheaper than one 12 kg parcel because the weight is "
      "the same. Calculate the cost of two 6 kg parcels and evaluate the claim.",
      "A 12 kg parcel has 7 kg beyond the first 5, so 18 + 7 × 2.40 = 18 + 16.80 = $34.80, an average of "
      "34.80 ÷ 12 = $2.90 per kg. A 6 kg parcel costs 18 + 2.40 = $20.40, so two would cost $40.80 — $6.00 more "
      "than one 12 kg parcel, because the fixed first-5-kg charge is paid twice.",
      parts=[
          P("a", "(a)", "Calculate the number of kilograms charged at the additional rate for a 12 kg parcel.", "numeric", 1,
            ["Only the mass above the first 5 kg is charged at the extra rate.",
             "Subtract the 5 kg already paid for from the 12 kg."], strand="D(i)", answer=7, tol=0, unit="kg"),
          P("b", "(b)", "Calculate the cost of sending a 12 kg parcel, in dollars.", "numeric", 2,
            ["Multiply the 7 additional kilograms by $2.40.",
             "Add that to the $18 base charge."], strand="D(ii)", answer=34.8, tol=0.02, unit="$"),
          P("c", "(c)", "Calculate the average cost per kilogram for a 12 kg parcel, in dollars.", "numeric", 2,
            ["Divide the total cost by the 12 kilograms.",
             "34.80 ÷ 12."], strand="D(iii)", answer=2.9, tol=0.02, unit="$/kg"),
          P("d", "(d)", "Calculate the cost of two 6 kg parcels and evaluate the customer's claim.", "text", 3,
            ["A 6 kg parcel pays the $18 charge plus 1 extra kilogram.",
             "Compare $40.80 with $34.80."], strand="D(iv)",
            accepted=["two 6 kg parcels cost 2 × $20.40 = $40.80, $6.00 more than the single parcel, so the claim is false because the fixed $18 charge is paid twice",
                      "the claim fails: $40.80 against $34.80, as the base charge is charged per parcel"]),
      ],
      tools=["rich_text", "math"], requirement="text",
      guidance="Separate the fixed charge from the per-kilogram charge in every part; the fixed charge is what breaks the claim.",
      explanation="A 12 kg parcel is 18 + 7(2.40) = $34.80, an average of $2.90 per kg. A 6 kg parcel is $20.40, so "
                  "two cost $40.80 — more, because the $18 base charge applies to each parcel.",
      next_time="With a fixed charge plus a rate, the fixed charge is paid per parcel; splitting a consignment costs more, not less.",
      marking="(a) 1 mark. (b) 2 marks: 1 for $16.80 of extra charges, 1 for $34.80. (c) 2 marks: 1 for dividing, "
              "1 for $2.90. (d) 3 marks: 1 for $20.40, 1 for $40.80, 1 for the fixed-charge explanation."),
    Q(44, "ratio", "hard", "C",
      "A paint is mixed from blue and yellow in the ratio 3 : 5. A decorator needs 24 litres in total.\n\n"
      "(a) Calculate the litres of blue needed.\n(b) Calculate the litres of yellow needed.\n(c) The decorator "
      "has already mixed 9 litres of blue and 12 litres of yellow. Explain, with a calculation, what must be "
      "added to reach 24 litres in the correct ratio.",
      "24 ÷ 8 = 3 litres per part, so blue is 9 and yellow is 15. The decorator already has the full 9 litres of "
      "blue but only 12 of the 15 litres of yellow required, so 3 more litres of yellow must be added and no blue.",
      parts=[
          P("a", "(a)", "Calculate the litres of blue needed.", "numeric", 2,
            ["How many parts are there altogether?",
             "Divide 24 by 8, then multiply by 3."], strand="C(i)", answer=9, tol=0, unit="litres"),
          P("b", "(b)", "Calculate the litres of yellow needed.", "numeric", 1,
            ["Yellow is 5 parts.",
             "5 × 3 litres."], strand="C(i)", answer=15, tol=0, unit="litres"),
          P("c", "(c)", "Explain what must be added, with a calculation.", "text", 2,
            ["Compare what is already mixed with the targets 9 and 15.",
             "Only one colour is short — which?"], strand="C(iii)",
            accepted=["add 3 litres of yellow only: the blue is already at 9 litres but the yellow is 3 litres short of 15",
                      "3 litres of yellow, because blue is already correct"]),
      ],
      tools=["rich_text", "math", "table"], requirement="text",
      guidance="Show the number of parts in (a); the same part value is used in (b).",
      explanation="3 + 5 = 8 parts, so one part is 24 ÷ 8 = 3 litres: blue 9, yellow 15. With 9 litres of blue and "
                  "12 litres of yellow already mixed, only 3 more litres of yellow are needed. Checking: 9 : 15 = 3 : 5.",
      next_time="Share a total by dividing it by the SUM of the ratio parts, then verify by simplifying the result.",
      marking="(a) 2 marks: 1 for 8 parts, 1 for 9 litres. (b) 1 mark for 15 litres. (c) 2 marks: 1 for identifying "
              "yellow as short, 1 for the 3 litres with a check."),
    Q(45, "probability", "hard", "B",
      "A spinner has 10 equal sectors numbered 1 to 10. In 200 spins a student records 94 odd and 106 even "
      "results.\n\n(a) Write the theoretical probability of an odd number.\n(b) Calculate the experimental "
      "probability of an odd number in simplest form.\n(c) Compare the two and decide, with justification, "
      "whether the data suggest the spinner is biased.",
      "Theoretical P(odd) = 5/10 = 1/2. Experimental = 94/200 = 47/100 = 0.47. The difference of 0.03 is well "
      "within ordinary sampling variation for 200 spins, so the data do not suggest bias; a much larger number of "
      "spins would be needed to detect a small bias.",
      parts=[
          P("a", "(a)", "Write the theoretical probability of an odd number, in simplest form.", "expression", 1,
            ["How many of 1 to 10 are odd?",
             "Write that over 10 and simplify."], strand="B(i)", accepted=["1/2", "0.5"]),
          P("b", "(b)", "Calculate the experimental probability in simplest form.", "expression", 2,
            ["Relative frequency = odd results ÷ spins.",
             "94/200, then divide by 2."], strand="B(ii)", accepted=["47/100", "0.47"]),
          P("c", "(c)", "Decide whether the spinner is biased, justifying your decision.", "text", 3,
            ["How big is the difference between 47/100 and 1/2?",
             "What variation would you expect by chance in 200 spins?"], strand="B(iii)",
            accepted=["no evidence of bias: 0.47 differs from 0.5 by only 0.03, which is expected sampling variation in 200 spins",
                      "not biased, the difference is small and due to chance"]),
      ],
      tools=["rich_text", "math", "table"], requirement="text",
      guidance="Give both probabilities in simplest form so they can be compared directly in (c).",
      explanation="Theoretical = 1/2; experimental = 47/100 = 0.47. The 0.03 difference is ordinary variation, so "
                  "the data neither prove nor suggest bias; more spins would be needed.",
      next_time="Experimental probability approaches the theoretical value as trials increase but rarely equals it; judge bias against plausible variation.",
      marking="(a) 1 mark for 1/2. (b) 2 marks: 1 for 94/200, 1 for 47/100. (c) 3 marks: 1 for the comparison, "
              "1 for sampling variation, 1 for a justified conclusion."),
]
