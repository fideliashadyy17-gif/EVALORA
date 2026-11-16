"""MYP 2 (Grade 7) Mathematics — Term 1 Summative Assessment (Version B).

Source: "MYP2 1st Term examination B.pdf" (OAK INTERNATIONAL SCHOOL, BENIN,
End of First Term E-assessment 2026/27, Mathematics, MYP 2, 2 hours,
100 marks). 45 questions: Part A objective (Q1–40, 50 marks) and Part B
theory (Q41–45, 50 marks). Criterion totals printed on the paper:
A 32, B 18, C 26, D 24.
"""
from summative_b_common import (
    data_table, diagram, display, double_number_line, doc, line_graph, para, q,
    shape_patterns, stats_figure, stats_spec, venn,
)

SOURCE = "myp2-term1-summative-b-2026"

INSTRUCTIONS = (
    "Answer all questions. Part A: mark your answers on this paper. Part B: write your solutions, "
    "with all working, on your answer sheets. A calculator may be used. Each question shows its "
    "criterion (key at the foot of the page) and difficulty: basic, intermediate, challenge."
)

SECTIONS = [
    {"id": "A", "title": "Part A — Objective questions", "questions": 40, "marks": 50,
     "instructions": "40 questions · 50 marks. Levels 1–3: circle the correct letter, circle T (true) "
                     "or F (false), or write one letter, P to U, in each box."},
    {"id": "B", "title": "Part B — Theory questions", "questions": 5, "marks": 50,
     "instructions": "5 questions · 50 marks. Write your solutions, with all working, on your answer "
                     "sheets. Each task states the criterion it assesses."},
]

CRITERION_TOTALS = {"A": 32, "B": 18, "C": 26, "D": 24}


def build():
    Q = []

    # ── LEVEL 1 · BASIC · Q1–10 · 1 mark each ────────────────────────────────
    Q.append(q(1, sec="A", crit="A", marks=1, lvl="basic", topic="Ratio and proportion",
               subtopic="simplest form of a ratio",
               blocks=[para("The row has black and white counters. What is the ratio black : white in its simplest form?"),
                       para("● ○ ○ ● ○ ● ○ ○ ● ○ ○ ● ○ ● ○ ○")],
               opts=["5 : 3", "3 : 8", "3 : 5", "6 : 16"], ans="C",
               expl="The row holds 6 black and 10 white counters, so the ratio is 6 : 10. Dividing both "
                    "parts by 2 gives 3 : 5. Option D is the unsimplified ratio of black to the total."))

    Q.append(q(2, sec="A", crit="A", marks=1, lvl="basic", topic="Ratio and proportion",
               subtopic="equivalent ratios with units",
               blocks=[para("Which ratio is equivalent to $45\\ \\text{cm} : 3\\ \\text{m}$?")],
               opts=["15 : 1", "3 : 2", "20 : 3", "3 : 20"], ans="D",
               expl="Convert to the same unit first: 3 m = 300 cm, so the ratio is 45 : 300. Dividing "
                    "both parts by 15 gives 3 : 20."))

    Q.append(q(3, sec="A", crit="A", marks=1, lvl="basic", topic="Rate",
               subtopic="rate as a unit quantity",
               blocks=[para("A printer prints 96 pages in 4 minutes. What is its rate in pages per minute?")],
               opts=["24", "92", "100", "384"], ans="A",
               expl="Rate = 96 ÷ 4 = 24 pages per minute. Option D multiplies instead of dividing."))

    Q.append(q(4, sec="A", crit="A", marks=1, lvl="basic", topic="Direct proportion",
               subtopic="scaling in direct proportion",
               blocks=[para("$y$ is directly proportional to $x$. When $x = 4$, $y = 14$. What is $y$ when $x = 12$?")],
               opts=["22", "42", "56", "168"], ans="B",
               expl="$x$ is multiplied by 3 (4 → 12), so $y$ is also multiplied by 3: 14 × 3 = 42."))

    Q.append(q(5, sec="A", crit="C", marks=1, lvl="basic", topic="Set theory",
               subtopic="set notation",
               blocks=[para("Which statement means “P is a subset of Q”?")],
               opts=["$P \\in Q$", "$P \\subset Q$", "$P = Q'$", "$P \\cap Q = \\varnothing$"], ans="B",
               expl="$P \\subset Q$ means every element of P is also an element of Q. $P \\in Q$ means P is "
                    "an element of Q, $P = Q'$ means P is the complement of Q, and $P \\cap Q = \\varnothing$ "
                    "means P and Q are disjoint."))

    Q.append(q(6, sec="A", crit="A", marks=1, lvl="basic", topic="Set theory",
               subtopic="intersection of two sets",
               blocks=[para("$A = \\{2, 4, 6, 8, 10\\}$ and $B = \\{1, 2, 3, 4, 5\\}$. What is $A \\cap B$?")],
               opts=["$\\{2, 4\\}$", "$\\{6, 8, 10\\}$", "$\\{1, 3, 5\\}$", "$\\varnothing$"], ans="A",
               expl="The elements 2 and 4 appear in both sets, so $A \\cap B = \\{2, 4\\}$."))

    Q.append(q(7, sec="A", crit="A", marks=1, lvl="basic", topic="Set theory",
               subtopic="reading a two-set Venn diagram",
               blocks=[para("The Venn diagram shows how many members of a youth club play basketball (B) and "
                            "volleyball (V). How many members does the club have?"),
                       venn("B", "V", "11", "4", "7", "3")],
               opts=["4", "18", "22", "25"], ans="D",
               expl="Add every region: 11 + 4 + 7 + 3 = 25 members."))

    Q.append(q(8, sec="A", crit="A", marks=1, lvl="basic", topic="Probability",
               subtopic="theoretical probability from a list",
               blocks=[para("Each letter of the word PROBABILITY is written on a card. One of the 11 cards is "
                            "picked at random. What is $P(B)$?")],
               opts=[r"$\dfrac{1}{11}$", r"$\dfrac{2}{11}$", r"$\dfrac{2}{9}$", r"$\dfrac{1}{2}$"], ans="B",
               expl="PROBABILITY has 11 letters and the letter B appears twice, so $P(B) = \\frac{2}{11}$."))

    Q.append(q(9, sec="A", crit="C", marks=1, lvl="basic", topic="Probability",
               subtopic="per cent to fraction",
               blocks=[para("A weather report gives the probability of rain tomorrow as 15 %. Which fraction "
                            "shows this probability?")],
               opts=[r"$\dfrac{3}{20}$", r"$\dfrac{1}{15}$", r"$\dfrac{3}{17}$", r"$\dfrac{17}{20}$"], ans="A",
               expl=r"15 % = $\frac{15}{100} = \frac{3}{20}$ in its simplest form."))

    Q.append(q(10, sec="A", crit="A", marks=1, lvl="basic", topic="Probability",
               subtopic="relative frequency from a table",
               blocks=[para("The table shows the results of 40 spins of a spinner. What is the relative "
                            "frequency of blue?"),
                       data_table(["Colour", "Red", "Blue", "Green"], [["Frequency", "12", "18", "10"]])],
               opts=["0.18", "0.40", "0.45", "0.82"], ans="C",
               expl="Relative frequency of blue = 18 ÷ 40 = 0.45."))

    # ── TRUE OR FALSE · Q11–16 · 1 mark each ─────────────────────────────────
    Q.append(q(11, sec="A", crit="A", marks=1, lvl="basic", topic="Ratio and proportion",
               subtopic="simplifying a ratio", qtype="true_false",
               blocks=[para("The ratio $18 : 24$ simplifies to $2 : 3$.")], ans="F",
               expl="False: dividing both parts by the highest common factor 6 gives 3 : 4, not 2 : 3."))

    Q.append(q(12, sec="A", crit="D", marks=1, lvl="basic", topic="Direct proportion",
               subtopic="proportion in a real-life context", qtype="true_false",
               blocks=[para("A tailor uses 6 m of cloth to make 4 shirts, so 15 of the same shirts need "
                            "22.5 m of cloth.")], ans="T",
               expl="True: one shirt needs 6 ÷ 4 = 1.5 m, so 15 shirts need 15 × 1.5 = 22.5 m."))

    Q.append(q(13, sec="A", crit="C", marks=1, lvl="basic", topic="Set theory",
               subtopic="the empty set", qtype="true_false",
               blocks=[para("The set of even prime numbers is the empty set, $\\varnothing$.")], ans="F",
               expl="False: 2 is both even and prime, so the set is {2}, not the empty set."))

    Q.append(q(14, sec="A", crit="A", marks=1, lvl="basic", topic="Probability",
               subtopic="range of a probability", qtype="true_false",
               blocks=[para("The probability of an event can be 1.2 if the event is very likely.")], ans="F",
               expl="False: a probability can never exceed 1. The value 1.2 is impossible."))

    Q.append(q(15, sec="A", crit="A", marks=1, lvl="basic", topic="Probability",
               subtopic="expected frequency", qtype="true_false",
               blocks=[para("When a fair coin is tossed 200 times, the expected number of heads is 100.")], ans="T",
               expl="True: expected number = 200 × ½ = 100."))

    Q.append(q(16, sec="A", crit="B", marks=1, lvl="basic", topic="Direct proportion",
               subtopic="pattern of direct proportion", qtype="true_false",
               blocks=[para("If $y$ is directly proportional to $x$, then doubling $x$ always doubles $y$.")], ans="T",
               expl="True: in direct proportion $y = kx$, so replacing $x$ by $2x$ gives $y = 2kx$. The "
                    "constant of proportionality $k$ keeps the ratio fixed."))

    # ── LEVEL 2 · INTERMEDIATE · Q17–26 · 1 mark each ────────────────────────
    Q.append(q(17, sec="A", crit="A", marks=1, lvl="intermediate", topic="Ratio and proportion",
               subtopic="sharing a quantity in a ratio",
               blocks=[para("A 60 cm ribbon is cut into two pieces in the ratio $7 : 5$. How long is the "
                            "shorter piece?")],
               opts=["5 cm", "12 cm", "25 cm", "35 cm"], ans="C",
               expl="There are 7 + 5 = 12 parts, so one part is 60 ÷ 12 = 5 cm. The shorter piece is "
                    "5 × 5 = 25 cm."))

    Q.append(q(18, sec="A", crit="D", marks=1, lvl="intermediate", topic="Scale drawing",
               subtopic="map scale",
               blocks=[para("On a map drawn to a scale of $1 : 50\\,000$, two villages are 7 cm apart. What is "
                            "the real distance between them?")],
               opts=["3.5 m", "35 m", "350 m", "3.5 km"], ans="D",
               expl="7 cm × 50 000 = 350 000 cm = 3 500 m = 3.5 km."))

    Q.append(q(19, sec="A", crit="D", marks=1, lvl="intermediate", topic="Rate",
               subtopic="comparing rates from a table",
               blocks=[para("Three pupils take a typing test. Who types at the fastest rate?"),
                       data_table(["Pupil", "Words", "Minutes"],
                                  [["Dossou", "258", "6"], ["Imelda", "336", "8"], ["Rachidi", "205", "5"]])],
               opts=["Dossou", "Imelda", "Rachidi", "all equal"], ans="A",
               expl="Dossou: 258 ÷ 6 = 43 words per minute. Imelda: 336 ÷ 8 = 42. Rachidi: 205 ÷ 5 = 41. "
                    "Dossou is fastest."))

    Q.append(q(20, sec="A", crit="A", marks=1, lvl="intermediate", topic="Rate",
               subtopic="converting a speed unit",
               blocks=[para("A cyclist rides at 18 km/h. What is this speed in metres per second?")],
               opts=["0.3", "5", "64.8", "300"], ans="B",
               expl="18 km/h = 18 000 m in 3 600 s = 18 000 ÷ 3 600 = 5 m/s."))

    # The source paper prints four small graphs, one per option. Each option
    # carries its own figure, all drawn on the same 0–6 × 0–12 window so the
    # shape is the only thing that differs.
    Q.append(q(21, sec="A", crit="B", marks=1, lvl="intermediate", topic="Direct proportion",
               subtopic="graph of direct proportion",
               blocks=[para("Which graph shows that $y$ is directly proportional to $x$?")],
               opts=["A straight line through the origin",
                     "A straight line that does not pass through the origin",
                     "A curve through the origin",
                     "A horizontal straight line"],
               opt_blocks=[line_graph("2x", title="Option A"),
                           line_graph("2x + 3", title="Option B"),
                           line_graph("x^2/3", title="Option C"),
                           line_graph("4", title="Option D")],
               ans="A",
               expl="Direct proportion always gives a straight-line graph passing through the origin (0, 0). "
                    "Option B is a straight line that misses the origin, C is a curve and D is constant."))

    Q.append(q(22, sec="A", crit="A", marks=1, lvl="intermediate", topic="Direct proportion",
               subtopic="double number line",
               blocks=[para("The double number line shows the cost of petrol. Which number of litres replaces "
                            "the question mark?"),
                       double_number_line("Litres", "Cost (FCFA)",
                                          [(0, "0"), (4, "4"), (10, "10"), (15, "?")],
                                          [(0, "0"), (4, "2 600"), (10, "6 500"), (15, "9 750")], 16)],
               opts=["13", "14", "15", "16"], ans="C",
               expl="One litre costs 2 600 ÷ 4 = 650 FCFA, so 9 750 FCFA buys 9 750 ÷ 650 = 15 litres."))

    Q.append(q(23, sec="A", crit="C", marks=1, lvl="intermediate", topic="Set theory",
               subtopic="shaded region of a Venn diagram",
               blocks=[para("Which set is shaded in the Venn diagram?"),
                       diagram({"kind": "venn2", "title": "Shaded region",
                                "venn": {"leftLabel": "A", "rightLabel": "B", "leftOnly": "",
                                         "both": "", "rightOnly": "shaded", "outside": ""}})],
               opts=["$A \\cap B$", "$A \\cup B$", "$A \\cap B'$", "$A' \\cap B$"], ans="D",
               expl="Only the part of B that lies outside A is shaded, which is $A' \\cap B$ (B only)."))

    Q.append(q(24, sec="A", crit="A", marks=1, lvl="intermediate", topic="Set theory",
               subtopic="inclusion–exclusion with an outside region",
               blocks=[para("In a group of 40 tourists, 26 speak French, 19 speak English and 9 speak both. "
                            "How many speak neither language?")],
               opts=["4", "5", "14", "21"], ans="A",
               expl="At least one language: 26 + 19 − 9 = 36. Neither: 40 − 36 = 4."))

    Q.append(q(25, sec="A", crit="A", marks=1, lvl="intermediate", topic="Probability",
               subtopic="probability from a fair spinner",
               blocks=[para("The fair spinner has 8 equal sectors. It is spun once. What is the probability "
                            "of an odd number?"),
                       diagram({"kind": "table", "title": "Spinner sectors, clockwise from the top",
                                "columns": ["Sector", "1", "2", "3", "4", "5", "6", "7", "8"],
                                "rows": [["Number", "5", "1", "3", "4", "3", "2", "1", "3"]]})],
               opts=[r"$\dfrac{3}{8}$", r"$\dfrac{3}{5}$", r"$\dfrac{5}{8}$", r"$\dfrac{3}{4}$"], ans="D",
               expl="Six of the eight sectors hold an odd number, so $P(\\text{odd}) = \\frac{6}{8} = \\frac{3}{4}$."))

    Q.append(q(26, sec="A", crit="D", marks=1, lvl="intermediate", topic="Probability",
               subtopic="expected frequency in a real-life context",
               blocks=[para("A factory knows that 4 % of its phone chargers are faulty. In a delivery of "
                            "1 500 chargers, how many are expected to work?")],
               opts=["60", "600", "1 440", "1 496"], ans="C",
               expl="96 % work, so the expected number is 0.96 × 1 500 = 1 440. Option A is the number "
                    "expected to be faulty."))

    # ── MATCHING · Q27–30 · 1 mark each ──────────────────────────────────────
    _MATCH_BARS = stats_figure(stats_spec(
        "bar_chart", title="Marbles in the bag",
        x_label="Colour", y_label="Number of marbles",
        categories=[("Red", 8), ("Yellow", 5), ("Green", 4), ("Blue", 3)]))
    _MATCH_OPTS = ["0", "0.2", "40 %", "0.75", "0.25", "1"]

    for n, (label, answer, reason) in enumerate([
        ("P(red)", "R", "8 of the 20 marbles are red: $\\frac{8}{20} = 0.4 = 40\\ \\%$."),
        ("P(not yellow)", "S", "15 of the 20 marbles are not yellow: $\\frac{15}{20} = 0.75$."),
        ("P(green)", "Q", "4 of the 20 marbles are green: $\\frac{4}{20} = 0.2$."),
        ("P(purple)", "P", "There is no purple marble in the bag, so the probability is 0."),
    ], start=27):
        Q.append(q(n, sec="A", crit="C", marks=1, lvl="intermediate", topic="Probability",
                   subtopic="matching a probability to its value",
                   blocks=[para("A bag holds 20 marbles, as the bar chart shows. One marble is picked at random."),
                           _MATCH_BARS,
                           para(f"{label} — write the letter of the correct value."),
                           data_table(["P", "Q", "R", "S", "T", "U"], [_MATCH_OPTS])],
                   opts=_MATCH_OPTS, labels=["P", "Q", "R", "S", "T", "U"], ans=answer,
                   expl=reason))

    # ── LEVEL 3 · CHALLENGE · Q31–40 · 2 marks each ──────────────────────────
    Q.append(q(31, sec="A", crit="A", marks=2, lvl="challenge", topic="Ratio and proportion",
               subtopic="ratio with a difference",
               blocks=[para("The ratio of boys to girls in a choir is $4 : 5$. There are 12 more girls than "
                            "boys. How many singers are in the choir?")],
               opts=["48", "60", "96", "108"], ans="D",
               expl="One ratio part is 12 (the difference 5 − 4 = 1 part). Total parts = 9, so the choir has "
                    "9 × 12 = 108 singers."))

    Q.append(q(32, sec="A", crit="D", marks=2, lvl="challenge", topic="Ratio and proportion",
               subtopic="ratio and cost in a real-life context",
               blocks=[para("A shop mixes peanuts and cashew nuts in the ratio $5 : 3$ by mass. Peanuts cost "
                            "1 200 FCFA per kg and cashew nuts 4 000 FCFA per kg. What do the nuts in 4 kg of "
                            "the mixture cost?")],
               opts=["9 000 FCFA", "10 400 FCFA", "18 000 FCFA", "20 800 FCFA"], ans="A",
               expl="8 parts → 4 kg, so one part is 0.5 kg: 2.5 kg peanuts and 1.5 kg cashews. "
                    "Cost = 2.5 × 1 200 + 1.5 × 4 000 = 3 000 + 6 000 = 9 000 FCFA for the 4 kg mixture."))

    Q.append(q(33, sec="A", crit="D", marks=2, lvl="challenge", topic="Rate",
               subtopic="comparing two rates over an hour",
               blocks=[para("One machine fills 180 bottles in 4 minutes. A newer machine fills 250 bottles in "
                            "5 minutes. How many more bottles does the newer machine fill in 1 hour?")],
               opts=["5", "70", "300", "4 200"], ans="C",
               expl="Older: 180 ÷ 4 × 60 = 2 700 per hour. Newer: 250 ÷ 5 × 60 = 3 000 per hour. "
                    "Difference = 300 bottles."))

    Q.append(q(34, sec="A", crit="B", marks=2, lvl="challenge", topic="Direct proportion",
               subtopic="proportionality table",
               blocks=[para("In the table, $y$ is directly proportional to $x$. What is the value of $a + b$?"),
                       data_table(["$x$", "$x$", "6", "15", "$b$"], [["$y$", "$y$", "$a$", "20", "36"]])],
               opts=["27", "35", "38", "42"], ans="B",
               expl="From 15 → 20 the multiplier is 4/3, so $a = 6 \\times \\frac{4}{3} = 8$ and "
                    "$b = 36 \\div \\frac{4}{3} = 27$. Hence $a + b = 35$."))

    Q.append(q(35, sec="A", crit="D", marks=2, lvl="challenge", topic="Scale drawing",
               subtopic="finding a map scale",
               blocks=[para("On a map, 4 cm represents a real distance of 10 km. What is the scale of the map?")],
               opts=["1 : 2.5", "1 : 2 500", "1 : 25 000", "1 : 250 000"], ans="D",
               expl="10 km = 1 000 000 cm, so 4 cm represents 1 000 000 cm and 1 cm represents 250 000 cm. "
                    "The scale is 1 : 250 000."))

    Q.append(q(36, sec="A", crit="A", marks=2, lvl="challenge", topic="Set theory",
               subtopic="complement of a union",
               blocks=[para("$\\xi = \\{1, 2, 3, \\ldots, 20\\}$, $M = \\{\\text{multiples of 4}\\}$ and "
                            "$F = \\{\\text{factors of 20}\\}$. What is $n((M \\cup F)')$?")],
               opts=["2", "9", "11", "18"], ans="C",
               expl="$M = \\{4, 8, 12, 16, 20\\}$ and $F = \\{1, 2, 4, 5, 10, 20\\}$, so "
                    "$M \\cup F = \\{1, 2, 4, 5, 8, 10, 12, 16, 20\\}$, which has 9 elements. "
                    "$n((M \\cup F)') = 20 - 9 = 11$."))

    Q.append(q(37, sec="A", crit="A", marks=2, lvl="challenge", topic="Set theory",
               subtopic="Venn diagram with algebra",
               blocks=[para("A workshop has 38 workers. The Venn diagram shows how many own a bicycle (B) and a "
                            "motorbike (M). How many own exactly one of the two?"),
                       venn("B", "M", "$x + 5$", "$x$", "$2x - 1$", "6")],
               opts=["7", "13", "25", "32"], ans="C",
               expl="$(x + 5) + x + (2x - 1) + 6 = 38$, so $4x + 10 = 38$ and $x = 7$. Exactly one vehicle: "
                    "$(x + 5) + (2x - 1) = 12 + 13 = 25$."))

    Q.append(q(38, sec="A", crit="B", marks=2, lvl="challenge", topic="Probability",
               subtopic="experimental probability from a table",
               blocks=[para("A bottle cap is tossed many times. The table shows how often it has landed top-up. "
                            "Which is the best estimate of the probability that it lands top-up?"),
                       data_table(["Number of tosses", "20", "100", "500", "2 000"],
                                  [["Top-up", "9", "38", "205", "796"]])],
               opts=["0.38", "0.40", "0.41", "0.45"], ans="B",
               expl="The largest sample gives the best estimate: 796 ÷ 2 000 = 0.398, which is 0.40 to 2 d.p."))

    Q.append(q(39, sec="A", crit="A", marks=2, lvl="challenge", topic="Probability",
               subtopic="finding a total from a probability",
               blocks=[para("A jar holds red and green sweets only. There are 26 green sweets, and for a sweet "
                            "picked at random $P(\\text{red}) = 0.35$. How many sweets are in the jar?")],
               opts=["40", "61", "74", "91"], ans="A",
               expl="$P(\\text{green}) = 1 - 0.35 = 0.65$, so 0.65 × total = 26 and the total is 40 sweets."))

    Q.append(q(40, sec="A", crit="D", marks=2, lvl="challenge", topic="Probability",
               subtopic="estimating from a sample",
               blocks=[para("In a random sample of 80 pupils, 28 walk to school. The school has 1 240 pupils. "
                            "Estimate how many pupils do not walk to school.")],
               opts=["434", "806", "1 188", "1 212"], ans="B",
               expl="The sample gives 80 − 28 = 52 pupils who do not walk, so the estimate is "
                    "$\\frac{52}{80} \\times 1\\,240 = 806$."))

    # ── PART B · THEORY ──────────────────────────────────────────────────────
    Q.append(q(41, sec="B", crit="A", marks=8, lvl="intermediate", topic="Set theory",
               subtopic="primes and multiples", qtype="open_ended",
               tools=["rich_text", "math", "venn"],
               guidance="Show every set listing and every step of the probability calculation.",
               blocks=[para("Primes and multiples [8 marks]  $\\xi = \\{1, 2, 3, \\ldots, 15\\}$, "
                            "$P = \\{\\text{prime numbers}\\}$ and $T = \\{\\text{multiples of 3}\\}$."),
                       para("(a) List the elements of P and the elements of T. [2]"),
                       para("(b) Find $P \\cap T$ and $n(P \\cup T)$. [3]"),
                       para("(c) A number is chosen at random from $\\xi$. Find, in its simplest form, the "
                            "probability that it is in neither P nor T. [3]")],
               parts=[("(a)", 2, "Lists of P and T"), ("(b)", 3, "Intersection and union"),
                      ("(c)", 3, "Probability of neither")],
               expl="$P = \\{2, 3, 5, 7, 11, 13\\}$ and $T = \\{3, 6, 9, 12, 15\\}$. $P \\cap T = \\{3\\}$ and "
                    "$n(P \\cup T) = 6 + 5 - 1 = 10$. Neither: $15 - 10 = 5$ numbers, so the probability is "
                    "$\\frac{5}{15} = \\frac{1}{3}$."))

    Q.append(q(42, sec="B", crit="B", marks=12, lvl="challenge", topic="Set theory",
               subtopic="counting a union", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Use the three rows of the table as your evidence, then state and verify a general rule.",
               blocks=[para("Counting a union [12 marks] The table gives the numbers of elements for three "
                            "pairs of sets A and B."),
                       data_table(["Pair of sets", "n(A)", "n(B)", "n(A ∩ B)", "n(A ∪ B)"],
                                  [["Pair 1", "4", "3", "2", "5"],
                                   ["Pair 2", "7", "4", "4", "7"],
                                   ["Pair 3", "5", "8", "0", "13"]]),
                       para("(a) $A = \\{2, 4, 6, 8, 10, 12\\}$ and $B = \\{3, 6, 9, 12\\}$. Find $n(A)$, $n(B)$, "
                            "$n(A \\cap B)$ and $n(A \\cup B)$. [3]"),
                       para("(b) Describe how $n(A \\cup B)$ can be found from the other three numbers. Predict "
                            "$n(A \\cup B)$ when $n(A) = 20$, $n(B) = 15$ and $n(A \\cap B) = 8$. [2]"),
                       para("(c) Write a general rule for $n(A \\cup B)$. Verify it using your answers to (a). [3]"),
                       para("(d) Use your rule to find $n(A \\cap B)$ when $n(A) = 18$, $n(B) = 11$ and "
                            "$n(A \\cup B) = 23$, and to decide whether $n(A) = 9$, $n(B) = 5$ and "
                            "$n(A \\cup B) = 15$ is possible. [4]")],
               parts=[("(a)", 3, "Counts for the given sets"), ("(b)", 2, "Description and prediction"),
                      ("(c)", 3, "General rule and verification"), ("(d)", 4, "Applying the rule in reverse")],
               expl="(a) $n(A) = 6$, $n(B) = 4$, $n(A \\cap B) = \\{6, 12\\} = 2$, $n(A \\cup B) = 8$. "
                    "(b) Add $n(A)$ and $n(B)$ then subtract the overlap: $20 + 15 - 8 = 27$. "
                    "(c) $n(A \\cup B) = n(A) + n(B) - n(A \\cap B)$; check: $6 + 4 - 2 = 8$. "
                    "(d) $n(A \\cap B) = 18 + 11 - 23 = 6$. For the second case $9 + 5 = 14 < 15$, so it is "
                    "impossible — the union cannot exceed the sum of the two sets."))

    Q.append(q(43, sec="B", crit="C", marks=10, lvl="intermediate", topic="Direct proportion",
               subtopic="photo prints", qtype="open_ended",
               tools=["rich_text", "math", "graph", "table"],
               guidance="Read values from the graph, then justify the features you identify.",
               blocks=[para("Photo prints [10 marks] The graph shows the cost of printing photos at two shops, "
                            "A and B."),
                       {"type": "graphBlock", "attrs": {"spec": {
                           "version": 1,
                           "domain": {"xMin": 0, "xMax": 20, "yMin": 0, "yMax": 3000, "gridStep": None,
                                      "showGrid": True, "showAxes": True, "showCoordinates": False,
                                      "showLegend": True, "showIntersections": False, "equalScale": False},
                           "functions": [
                               {"id": "a", "expression": "150x", "color": "#0a5c36", "style": "solid",
                                "width": 2, "label": "Shop A", "from": 0, "to": 20, "visible": True},
                               {"id": "b", "expression": "100x", "color": "#b45309", "style": "solid",
                                "width": 2, "label": "Shop B", "from": 0, "to": 20, "visible": True},
                           ],
                           "points": [], "segments": [], "annotations": [], "strokes": [], "regions": [],
                           "xLabel": "Number of photos", "yLabel": "Cost (FCFA)", "title": "Cost of photo prints",
                       }}},
                       para("(a) Use the graph to find the cost of 12 photos at each shop. [2]"),
                       para("(b) For each shop, state the price of one photo and write a formula for the cost $C$ "
                            "(in FCFA) of $n$ photos. [3]"),
                       para("(c) Give two features of the graph which show that the cost is directly proportional "
                            "to the number of photos. [2]"),
                       para("(d) Kévin has 2 400 FCFA. How many more photos can he print at shop B than at shop A? "
                            "Show your reasoning clearly. [3]")],
               parts=[("(a)", 2, "Reading the graph"), ("(b)", 3, "Unit price and formula"),
                      ("(c)", 2, "Features of proportionality"), ("(d)", 3, "Comparison with reasoning")],
               expl="(a) Shop A: 1 800 FCFA; shop B: 1 200 FCFA. (b) Shop A: 150 FCFA per photo, $C = 150n$; "
                    "shop B: 100 FCFA per photo, $C = 100n$. (c) Both graphs are straight lines and both pass "
                    "through the origin. (d) At shop A, 2 400 ÷ 150 = 16 photos; at shop B, 2 400 ÷ 100 = 24 "
                    "photos, so 8 more photos at shop B."))

    Q.append(q(44, sec="B", crit="C", marks=8, lvl="intermediate", topic="Probability",
               subtopic="the prize wheel", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Give the fraction, the decimal and the percentage, then write your report in sentences.",
               blocks=[para("The prize wheel [8 marks] At a school fair a wheel has 12 equal sectors: 1 star "
                            "prize (★), 3 small prizes (P) and 8 with no prize. Each player spins once."),
                       shape_patterns([("★ star prize", 1, 0), ("P small prize", 3, 0), ("no prize", 8, 0)]),
                       para("(a) Write the probability of winning a small prize as a fraction in its simplest "
                            "form, a decimal and a percentage. [2]"),
                       para("(b) Find the probability that a player wins a prize. Explain how this gives the "
                            "probability of winning no prize. [2]"),
                       para("(c) 300 people play. The organisers have 20 star prizes and 80 small prizes. Write "
                            "a short report: are these enough? Use the term expected number and explain why the "
                            "organisers cannot be certain. [4]")],
               parts=[("(a)", 2, "Three representations"), ("(b)", 2, "Winning a prize and its complement"),
                      ("(c)", 4, "Report using expected number")],
               expl=r"(a) $\frac{3}{12} = \frac{1}{4} = 0.25 = 25\ \%$. (b) $P(\text{prize}) = \frac{4}{12} = "
                    r"\frac{1}{3}$, so $P(\text{no prize}) = 1 - \frac{1}{3} = \frac{2}{3}$. (c) Expected star "
                    "prizes = $300 \\times \\frac{1}{12} = 25$ and expected small prizes = "
                    "$300 \\times \\frac{1}{4} = 75$, so 20 star prizes are below the expected number while 80 "
                    "small prizes are enough. The organisers cannot be certain because expectation is an average "
                    "over many fairs — chance variation means any single fair can need more (or fewer)."))

    Q.append(q(45, sec="B", crit="D", marks=12, lvl="challenge", topic="Ratio and proportion",
               subtopic="bissap for a party", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Show the total volume, the ratio split, the value comparison and a budget check with "
                        "your assumption stated.",
               blocks=[para("Bissap for a party [12 marks] Mrs Adjovi makes bissap for 54 guests by mixing syrup "
                            "and water in the ratio $2 : 7$. Each guest receives one 250 mL glass. The shop "
                            "prices are shown."),
                       data_table(["Syrup 750 mL", "Syrup 1.5 L", "Water 1.5 L"],
                                  [["1 800 FCFA", "3 300 FCFA", "300 FCFA"]]),
                       para("(a) How many litres of bissap does she need? [2]"),
                       para("(b) Find the volume of syrup and the volume of water she needs. [3]"),
                       para("(c) Which bottle of syrup is the better value? Find the lowest cost of the syrup she "
                            "needs. [3]"),
                       para("(d) Her budget is 9 000 FCFA. Is it enough for the syrup and the water? Justify your "
                            "answer and state one assumption you have made. [4]")],
               parts=[("(a)", 2, "Total volume"), ("(b)", 3, "Ratio split"),
                      ("(c)", 3, "Best value and lowest cost"), ("(d)", 4, "Budget check with an assumption")],
               expl="(a) 54 × 250 mL = 13 500 mL = 13.5 L. (b) 9 parts → 13.5 L, so one part is 1.5 L: syrup "
                    "= 3 L and water = 10.5 L. (c) The 750 mL bottle costs 1 800 ÷ 0.75 = 2 400 FCFA per litre "
                    "and the 1.5 L bottle costs 3 300 ÷ 1.5 = 2 200 FCFA per litre, so the 1.5 L bottle is "
                    "better value; 3 L costs 2 × 3 300 = 6 600 FCFA. (d) Water: 10.5 L ÷ 1.5 L = 7 bottles = "
                    "2 100 FCFA, giving 8 700 FCFA in total, which is within the 9 000 FCFA budget. Assumption: "
                    "bottles must be bought whole, so 7 water bottles and 2 syrup bottles are purchased."))

    return Q
