"""Grade 8 / MYP 3 Mathematics — Term 1 Summative Assessment (Version B).

SOURCE CAVEAT — read before editing.

The document supplied for MYP 3 is
"Grade_8_MYP_3_Mathematics_Marking_Scheme_Version_B.pdf": the OFFICIAL
TEACHER MARKING SCHEME & BLUEPRINT, not the printed student paper. It
contains, for Part A (Q1–25), an answer key with a worked rationale for
every item, and, for Part B (Q26–45), the full worked solution, the
subpart structure and the mark codes.

Consequently:

  · Part B (Q26–45) is authored from the scheme's own printed data,
    subparts, mark codes, criteria and levels. These are faithful.

  · Part A (Q1–25) items are RECONSTRUCTED: the correct answer, the mark,
    the criterion, the level, the curriculum topic and the mathematical
    content come verbatim from the scheme, but the scheme does not print
    the question stem or the wrong options. Every Part A item therefore
    carries config.source_fidelity = "reconstructed_from_marking_scheme"
    and, where the scheme itself names a distractor, that distractor is
    used; where it does not, the remaining options are the near-miss
    values the scheme's own rationale discusses.

Nothing here should be treated as the printed student wording. Supply
the student paper for MYP 3 and these Part A items must be re-authored
against it.

Blueprint (printed in the source): A 32, B 20, C 24, D 24; Part A 30 marks
(25 questions), Part B 70 marks (20 questions).
"""
from summative_b_common import data_table, diagram, doc, para, q

SOURCE = "myp3-term1-summative-b-2026"

INSTRUCTIONS = (
    "Answer all 45 questions. Part A (Q1–25): mark your answers on the paper (30 marks). Part B (Q26–45): write "
    "full solutions, with all working, in your separate exam script (70 marks). A scientific calculator may be "
    "used. Give non-exact answers to 3 s.f. (2 d.p. where stated). Criteria (key at foot) & level: "
    "basic, intermediate, challenge."
)

SECTIONS = [
    {"id": "A", "title": "Part A — Objective questions", "questions": 25, "marks": 30,
     "instructions": "25 questions · 30 marks (marked on exam paper). Level 1 (Q1–9) and Level 3 (Q21–25) "
                     "multiple choice; True or False (Q10–14); Matching (Q15–18) write one letter, P to U, in "
                     "each box; Q19–20 short response."},
    {"id": "B", "title": "Part B — Theory questions", "questions": 20, "marks": 70,
     "instructions": "20 questions · 70 marks (written in the student exam script). Task 1 = Criterion A (22), "
                     "Task 2 = Criterion B (15), Task 3 = Criterion C (18), Task 4 = Criterion D (15)."},
]

CRITERION_TOTALS = {"A": 32, "B": 20, "C": 24, "D": 24}

# Q15–18 matching bank. P, Q, R, S and U are named by the marking scheme
# itself in its rationales; T is the remaining member of the printed bank.
_BANK_OPTS = [
    r"$\dfrac{7}{9}$", r"$\sqrt{1.44}$", r"$4^{-1} + 2^{-2}$", r"$\dfrac{7}{10}$",
    r"$\dfrac{l_L + l_U}{2}$", "$1 - 3$",
]
_BANK_ROW = data_table(["P", "Q", "R", "S", "T", "U"], [list(_BANK_OPTS)])
_BANK_LABELS = ["P", "Q", "R", "S", "T", "U"]


def build():
    Q = []

    # ── PART A · Q1–9 · LEVEL 1 · 1 mark each ────────────────────────────────
    Q.append(q(1, sec="A", crit="A", marks=1, lvl="basic", topic="Rational & irrational numbers",
               subtopic="recognising a rational number",
               blocks=[para("Which of the following numbers is rational?")],
               opts=[r"$\sqrt{27}$", r"$\dfrac{\pi}{4}$", r"$-\sqrt{64}$", r"$0.101001\ldots$ (non-repeating)"],
               ans="C",
               expl=r"$-\sqrt{64} = -8 = \frac{-8}{1}$, a ratio of integers, so it is rational. "
                    r"$\sqrt{27} = 3\sqrt{3}$, $\frac{\pi}{4}$ and the non-repeating decimal $0.101001\ldots$ "
                    r"are all irrational."))

    Q.append(q(2, sec="A", crit="A", marks=1, lvl="basic", topic="Decimals to fractions",
               subtopic="terminating decimal to simplest fraction",
               blocks=[para("Which fraction is equal to 1.125 in its simplest form?")],
               opts=[r"$\dfrac{9}{8}$", r"$\dfrac{9}{80}$", r"$\dfrac{45}{40}$", r"$\dfrac{225}{200}$"], ans="A",
               expl=r"$1.125 = \frac{1125}{1000}$; dividing numerator and denominator by the HCF 125 gives "
                    r"$\frac{9}{8}$. Note that $\frac{45}{40}$ is not in its simplest form."))

    Q.append(q(3, sec="A", crit="C", marks=1, lvl="basic", topic="Real number line",
               subtopic="locating an irrational number",
               blocks=[para("The number line is marked with four arrows, W, X, Y and Z. Which arrow shows the "
                            "position of $−\\sqrt{3}$?"),
                       diagram({"kind": "table", "title": "Approximate positions on the number line",
                                "columns": ["Arrow", "W", "X", "Y", "Z"],
                                "rows": [["Position", "−2.65", "−1.73", "−0.71", "+1.73"]]})],
               opts=["W", "X", "Y", "Z"], ans="B",
               expl=r"$\sqrt{3} \approx 1.732$, so $-\sqrt{3} \approx -1.732$, which lies between $−2$ and "
                    r"$−1.5$ — arrow X."))

    Q.append(q(4, sec="A", crit="A", marks=1, lvl="basic", topic="Simplifying powers",
               subtopic="power of a power and the quotient law",
               blocks=[para("Simplify $(k^4)^3 \\div k^2$.")],
               opts=["$k^5$", "$k^9$", "$k^{12}$", "$k^{10}$"], ans="D",
               expl=r"Power-of-a-power then the quotient law: $(k^4)^3 \div k^2 = k^{12} \div k^2 = "
                    r"k^{12-2} = k^{10}$."))

    Q.append(q(5, sec="A", crit="C", marks=1, lvl="basic", topic="Scientific notation",
               subtopic="writing a large number in standard form",
               blocks=[para("The distance from Venus to the Sun is 54 600 000 km. Write this in standard form.")],
               opts=[r"$54.6 \times 10^{6}$ km", r"$5.46 \times 10^{7}$ km", r"$0.546 \times 10^{8}$ km",
                     r"$5.46 \times 10^{-7}$ km"], ans="B",
               expl="Moving the decimal point 7 places left gives coefficient $a = 5.46$ (with $1 \\le a < 10$) "
                    "and exponent +7: $5.46 \\times 10^7$ km."))

    Q.append(q(6, sec="A", crit="A", marks=1, lvl="basic", topic="Pythagoras' theorem",
               subtopic="finding the hypotenuse",
               blocks=[para("In triangle JKL, $\\angle JKL = 90°$, JK = 9 cm and KL = 12 cm. Find the length of "
                            "JL.")],
               opts=["15 cm", "13 cm", "21 cm", "225 cm"], ans="A",
               expl=r"$JL = \sqrt{JK^2 + KL^2} = \sqrt{9^2 + 12^2} = \sqrt{81 + 144} = \sqrt{225} = 15$ cm."))

    Q.append(q(7, sec="A", crit="A", marks=1, lvl="basic", topic="Congruent triangles",
               subtopic="corresponding angles",
               blocks=[para("In $\\triangle ABC$, $\\angle A = 72°$ and $\\angle B = 43°$. Given "
                            "$\\triangle ABC \\cong \\triangle XYZ$, find $\\angle Z$.")],
               opts=["72°", "65°", "43°", "115°"], ans="B",
               expl=r"In $\triangle ABC$, $\angle C = 180° - (72° + 43°) = 65°$. Since the triangles are "
                    r"congruent, the corresponding angle $\angle Z = \angle C = 65°$."))

    Q.append(q(8, sec="A", crit="C", marks=1, lvl="basic", topic="Trigonometric ratios",
               subtopic="tangent of an angle",
               blocks=[para("A right-angled triangle has a side of 9 cm opposite the top acute angle $\\varphi$ "
                            "and a side of 40 cm adjacent to it. What is $\\tan\\varphi$?")],
               opts=[r"$\dfrac{40}{9}$", r"$\dfrac{9}{41}$", r"$\dfrac{9}{40}$", r"$\dfrac{41}{40}$"], ans="C",
               expl=r"$\tan\varphi = \frac{\text{opposite}}{\text{adjacent}} = \frac{9}{40}$."))

    Q.append(q(9, sec="A", crit="D", marks=1, lvl="basic", topic="Scientific notation",
               subtopic="subtraction in scientific notation",
               blocks=[para("Evaluate $(6.3 \\times 10^{-3}) - (4.5 \\times 10^{-4})$, giving your answer in "
                            "standard form.")],
               opts=[r"$5.85 \times 10^{-3}$ g", r"$5.85 \times 10^{-4}$ g", r"$1.8 \times 10^{-3}$ g",
                     r"$6.3 \times 10^{-4}$ g"], ans="A",
               expl=r"Align powers to $10^{-3}$: $6.3 \times 10^{-3} - 0.45 \times 10^{-3} = "
                    r"5.85 \times 10^{-3}$."))

    # ── PART A · Q10–14 · TRUE OR FALSE ──────────────────────────────────────
    Q.append(q(10, sec="A", crit="A", marks=1, lvl="basic", topic="Irrational operations",
               subtopic="product of two irrational numbers", qtype="true_false",
               blocks=[para("The product of two irrational numbers is always irrational.")], ans="F",
               expl=r"False: $\sqrt{2} \times \sqrt{8} = \sqrt{16} = 4$ — or $\sqrt{3} \times \sqrt{3} = 3$ — "
                    r"which is rational."))

    Q.append(q(11, sec="A", crit="A", marks=1, lvl="intermediate", topic="Negative indices",
               subtopic="meaning of a negative exponent", qtype="true_false",
               blocks=[para("$2^{-3} = -8$")], ans="F",
               expl=r"False: a negative exponent denotes a reciprocal, not a negative sign — "
                    r"$2^{-3} = \frac{1}{2^3} = \frac{1}{8} \ne -8$."))

    Q.append(q(12, sec="A", crit="C", marks=1, lvl="intermediate", topic="Similarity & congruence",
               subtopic="AAA proves similarity, not congruence", qtype="true_false",
               blocks=[para("If the three angles of one triangle equal the three angles of another, the two "
                            "triangles are congruent.")], ans="F",
               expl="False: three equal angles (AAA) prove the triangles are similar, not necessarily congruent "
                    "— their side lengths can differ by any scale factor $k \\ne 1$."))

    Q.append(q(13, sec="A", crit="B", marks=1, lvl="intermediate", topic="Terminating decimals",
               subtopic="which fractions terminate", qtype="true_false",
               blocks=[para("A fraction $\\dfrac{p}{q}$ in its lowest terms gives a terminating decimal exactly "
                            "when $q$ has no prime factors other than 2 and/or 5.")], ans="T",
               expl="True: the fraction can then be scaled to a denominator $10^k = 2^k \\cdot 5^k$, and only "
                    "then."))

    Q.append(q(14, sec="A", crit="A", marks=1, lvl="intermediate", topic="Sine ratio bounds",
               subtopic="range of sin θ", qtype="true_false",
               blocks=[para("For any acute angle $\\theta$, $0 < \\sin\\theta < 1$.")], ans="T",
               expl=r"True: in a right triangle with $0° < \theta < 90°$, the opposite side is shorter than the "
                    r"hypotenuse, so $0 < \sin\theta = \frac{\text{opposite}}{\text{hypotenuse}} < 1$."))

    # ── PART A · Q15 · SHORT RESPONSE (scheme prints the answer 2√5) ─────────
    Q.append(q(15, sec="A", crit="A", marks=1, lvl="intermediate", topic="Irrational bounds",
               subtopic="simplifying a surd", qtype="short_answer",
               expl=r"$2\sqrt{5} = \sqrt{20}$. Since $16 < 20 < 25$ and 20 is not a perfect square, "
                    r"$\sqrt{20} \approx 4.472$ is irrational and lies between 4 and 5.",
               blocks=[para("The marking scheme records the answer to this item as $2\\sqrt{5}$. Simplify "
                            "$\\sqrt{20}$ and state, with a reason, whether the value is rational."),
                       para("(Scheme answer: $2\\sqrt{5}$.)")]))

    # ── PART A · Q16–18 · MATCHING ───────────────────────────────────────────
    for n, (stem, answer, reason) in enumerate([
        ("Write the recurring decimal $0.\\dot{7}$ as a fraction in its simplest form.", "P",
         r"Let $x = 0.\dot{7}$; then $10x - x = 7 \Rightarrow 9x = 7 \Rightarrow x = \frac{7}{9}$. "
         r"Note that $\frac{7}{10} = 0.7$ terminates."),
        ("Evaluate $4^{-1} + 2^{-2}$.", "R",
         r"$4^{-1} + 2^{-2} = \frac{1}{4} + \frac{1}{4} = \frac{2}{4} = \frac{1}{2}$. (Note $1 - 3 = -2$.)"),
        ("Which of the following is a rational number equal to 1.2?", "Q",
         r"$\sqrt{1.44} = \sqrt{\frac{144}{100}} = \frac{12}{10} = \frac{6}{5} = 1.2$."),
    ], start=16):
        Q.append(q(n, sec="A", crit=("C" if n in (16, 18) else "A"), marks=1, lvl="intermediate",
                   topic="Number representations", subtopic="matching a value to its expression",
                   blocks=[para(stem), _BANK_ROW],
                   opts=list(_BANK_OPTS), labels=_BANK_LABELS, ans=answer, expl=reason))

    # ── PART A · Q19–20 · SHORT RESPONSE (answers printed in the scheme) ─────
    Q.append(q(19, sec="A", crit="D", marks=1, lvl="intermediate", topic="Scientific notation",
               subtopic="addition in scientific notation", qtype="short_answer",
               numeric=1.2e12, tol=0,
               expl=r"$(7.4 + 4.6) \times 10^{11} = 12.0 \times 10^{11} = 1.2 \times 10^{12}$ bytes "
                    r"(also accept $1.20 \times 10^{12}$; do not credit $12 \times 10^{11}$).",
               blocks=[para("A data centre stores $7.4 \\times 10^{11}$ bytes on one server and $4.6 \\times "
                            "10^{11}$ bytes on another. Find the total, in standard form (bytes).")]))

    Q.append(q(20, sec="A", crit="D", marks=1, lvl="intermediate", topic="Pythagoras in context",
               subtopic="finding a height", qtype="short_answer",
               numeric=6, tol=0,
               expl=r"$h = \sqrt{6.5^2 - 2.5^2} = \sqrt{42.25 - 6.25} = \sqrt{36} = 6$ m.",
               blocks=[para("A 6.5 m ladder leans against a wall with its foot 2.5 m from the base of the wall. "
                            "Find the height, in metres, that the ladder reaches.")]))

    # ── PART A · Q21–25 · LEVEL 3 · 2 marks each ─────────────────────────────
    Q.append(q(21, sec="A", crit="B", marks=2, lvl="challenge", topic="Exponential equations",
               subtopic="solving with a common base",
               blocks=[para("Solve for $n$: $\\dfrac{9^{n+1}}{3^{n-2}} = 3^{11}$.")],
               opts=["7", "9", "5", "11"], ans="A",
               expl=r"Write $9^{n+1} = (3^2)^{n+1} = 3^{2n+2}$; dividing by $3^{n-2}$ gives "
                    r"$3^{(2n+2)-(n-2)} = 3^{n+4} = 3^{11}$, so $n + 4 = 11$ and $n = 7$."))

    Q.append(q(22, sec="A", crit="B", marks=2, lvl="challenge", topic="Mixed repeating decimals",
               subtopic="converting to a fraction and summing a + b",
               blocks=[para("The recurring decimal $0.3\\dot{6}$ is written as $\\dfrac{a}{b}$ in its lowest "
                            "terms. Find $a + b$.")],
               opts=["41", "36", "30", "123"], ans="A",
               expl=r"Let $x = 0.3\dot{6}$: $100x - 10x = 36.\dot{6} - 3.\dot{6} \Rightarrow 90x = 33 "
                    r"\Rightarrow x = \frac{33}{90} = \frac{11}{30}$. In lowest terms $a + b = 11 + 30 = 41$."))

    Q.append(q(23, sec="A", crit="D", marks=2, lvl="challenge", topic="Similar triangles",
               subtopic="hourglass configuration",
               blocks=[para("Two vertical posts PQ and SR stand on a line with PQ ∥ SR. The line PS = 10 cm, "
                            "SR = 17.5 cm and the segments from the crossing point O satisfy PO : OS = 4 : 10. "
                            "Find PQ.")],
               opts=["7 cm", "17.5 cm", "4 cm", "10 cm"], ans="A",
               expl=r"Since $PQ \parallel SR$, $\triangle POQ \sim \triangle ROS$ (AA: alternate and vertically "
                    r"opposite angles). Hence $\frac{PQ}{17.5} = \frac{4}{10} \Rightarrow PQ = 0.4 \times 17.5 "
                    r"= 7$ cm."))

    Q.append(q(24, sec="A", crit="D", marks=2, lvl="challenge", topic="Angle of depression",
               subtopic="choosing the correct trigonometric expression",
               blocks=[para("From the top of a cliff 48 m high, the angle of depression of a boat is 28°. Which "
                            "expression gives the horizontal distance $x$ of the boat from the foot of the "
                            "cliff?")],
               opts=[r"$x = 48\,\tan 28°$", r"$x = \dfrac{48}{\tan 28°}$", r"$x = 48\,\sin 28°$",
                     r"$x = \dfrac{48}{\cos 28°}$"], ans="B",
               expl=r"By alternate interior angles, the angle of elevation from the boat is 28°. Thus "
                    r"$\tan 28° = \frac{48}{x} \Rightarrow x = \frac{48}{\tan 28°}$."))

    Q.append(q(25, sec="A", crit="D", marks=2, lvl="challenge", topic="Isosceles triangle & area",
               subtopic="altitude, Pythagoras and area",
               blocks=[para("An isosceles triangle has equal sides of 17 cm and a base FG of 16 cm. Find its "
                            "area.")],
               opts=["120 cm²", "136 cm²", "60 cm²", "240 cm²"], ans="A",
               expl=r"The altitude from E bisects the base into two 8 cm halves, so "
                    r"$h = \sqrt{17^2 - 8^2} = \sqrt{289 - 64} = \sqrt{225} = 15$ cm, and the area is "
                    r"$\frac{1}{2} \times 16 \times 15 = 120$ cm²."))

    # ── PART B · TASK 1 · CRITERION A ────────────────────────────────────────
    Q.append(q(26, sec="B", crit="A", marks=3, lvl="basic", topic="Decimals into fractions",
               subtopic="terminating and recurring decimals", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="In (a) the fraction must be fully simplified. In (b) the answer must be obtained by "
                        "algebraic subtraction, not read from a calculator.",
               blocks=[para("Decimal-to-fraction conversion [3 marks]"),
                       para("(a) Convert 0.875 to a fraction in its simplest form. [1]"),
                       para("(b) Convert $0.\\dot{6}\\dot{3}$ to a fraction in its simplest form, showing the "
                            "algebraic subtraction. [2]")],
               parts=[("(a)", 1, "Terminating decimal"), ("(b)", 2, "Recurring decimal")],
               expl=r"(a) $\frac{875}{1000} = \frac{7}{8}$. (b) Let $x = 0.\dot{6}\dot{3}$; then $100x - x = 63 "
                    r"\Rightarrow 99x = 63 \Rightarrow x = \frac{63}{99} = \frac{7}{11}$. Unsimplified "
                    r"$\frac{875}{1000}$ or $\frac{35}{40}$ scores 0/1 in (a); writing $\frac{7}{11}$ straight "
                    r"from a calculator scores 0/2 in (b)."))

    Q.append(q(27, sec="B", crit="A", marks=4, lvl="intermediate", topic="Decimals into fractions",
               subtopic="mixed repeating decimals and a difference", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Show the subtraction explicitly and simplify from the resulting fraction.",
               blocks=[para("Mixed repeating decimals [4 marks]"),
                       para("(a) Prove that $1.1\\dot{6} = \\dfrac{7}{6}$. [2]"),
                       para("(b) Hence evaluate $1.1\\dot{6} - 0.28$ exactly, giving your answer as a fraction "
                            "in its simplest form. [2]")],
               parts=[("(a)", 2, "Proof that 1.16 recurring = 7/6"), ("(b)", 2, "Exact difference")],
               expl=r"(a) Let $x = 1.1\dot{6}$: $10x = 11.\dot{6}$ and $100x = 116.\dot{6}$, so "
                    r"$100x - 10x = 105 \Rightarrow 90x = 105 \Rightarrow x = \frac{105}{90} = \frac{7}{6}$. "
                    r"(b) $0.28 = \frac{7}{25}$; with common denominator 150: $\frac{175 - 42}{150} = "
                    r"\frac{133}{150}$."))

    Q.append(q(28, sec="B", crit="A", marks=4, lvl="intermediate", topic="Simplifying powers",
               subtopic="laws of indices with positive indices", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Give every final answer with positive indices.",
               blocks=[para("Laws of indices [4 marks]"),
                       para("(a) Simplify $15p^{-3} \\cdot q^{6} \\div (5p^{2}q^{-1})$, writing the answer with "
                            "positive indices. [2]"),
                       para("(b) Simplify $(3u^{-2}v^{4})^{-2} \\times 9u^{0}$, writing the answer with positive "
                            "indices. [2]")],
               parts=[("(a)", 2, "Quotient and product laws"), ("(b)", 2, "Power of a product and zero index")],
               expl=r"(a) $15 \div 5 \cdot p^{-3-2} \cdot q^{6-(-1)} = 3p^{-5}q^{7} = \frac{3q^{7}}{p^{5}}$. "
                    r"(b) $(3^{-2}u^{4}v^{-8}) \times 9 = \frac{1}{9}u^{4}v^{-8} \times 9 = \frac{u^{4}}{v^{8}}$. "
                    r"Leaving $3p^{-5}q^{7}$ or $u^{4}v^{-8}$ scores M1 A0."))

    Q.append(q(29, sec="B", crit="A", marks=3, lvl="intermediate", topic="Scientific notation",
               subtopic="addition and subtraction with aligned powers", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Align the powers of ten first, then normalise the result to standard form.",
               blocks=[para("Operations in scientific notation [3 marks]"),
                       para("(a) Evaluate $(5.3 \\times 10^{8}) - (6.5 \\times 10^{7})$. [1]"),
                       para("(b) Evaluate $(7.4 \\times 10^{-5}) + (4.6 \\times 10^{-4})$. [2]")],
               parts=[("(a)", 1, "Subtraction"), ("(b)", 2, "Addition")],
               expl=r"(a) Align to $10^{8}$: $(5.3 - 0.65) \times 10^{8} = 4.65 \times 10^{8}$. (b) Align to "
                    r"$10^{-4}$: $(0.74 + 4.6) \times 10^{-4} = 5.34 \times 10^{-4}$. In (b) $53.4 \times "
                    r"10^{-5}$ or $0.000534$ earns M1; A1 requires the normalised $5.34 \times 10^{-4}$."))

    Q.append(q(30, sec="B", crit="A", marks=4, lvl="intermediate", topic="Pythagoras' theorem",
               subtopic="right-angled quadrilateral", qtype="open_ended",
               tools=["rich_text", "math", "geometry", "table"],
               guidance="Work in triangle PQR first, then use PR in triangle PSR. The exterior perimeter excludes "
                        "the diagonal.",
               blocks=[para("Right-angled quadrilateral [4 marks] In quadrilateral PQRS, $\\angle PQR = 90°$, "
                            "$\\angle PSR = 90°$, PQ = 7 cm, QR = 24 cm and PS = 15 cm."),
                       para("(a) Calculate the length of the diagonal PR. [2]"),
                       para("(b) Calculate the perimeter of PQRS. [2]")],
               parts=[("(a)", 2, "Length of PR"), ("(b)", 2, "Perimeter")],
               expl=r"(a) $PR^2 = 7^2 + 24^2 = 49 + 576 = 625$, so $PR = 25$ cm. (b) $SR = \sqrt{25^2 - 15^2} = "
                    r"\sqrt{625 - 225} = \sqrt{400} = 20$ cm, so the perimeter is $7 + 24 + 20 + 15 = 66$ cm. "
                    r"Adding the diagonal (giving 91 cm) loses A1 in (b); follow-through credit is allowed from "
                    r"a positive PR > 15."))

    Q.append(q(31, sec="B", crit="A", marks=4, lvl="challenge", topic="Trigonometric ratios",
               subtopic="divided triangle", qtype="open_ended",
               tools=["rich_text", "math", "geometry", "table"],
               guidance="Use the tangent ratio in each right-angled triangle and give lengths to 2 d.p. and "
                        "angles to 1 d.p.",
               blocks=[para("Divided triangle [4 marks] In triangle ABC, D lies on AC with BD ⊥ AC, "
                            "$\\angle BAD = 42°$, BD = 10 cm and DC = 14 cm."),
                       para("(a) Calculate the length AD. [2]"),
                       para("(b) Calculate the size of angle ABC. [2]")],
               parts=[("(a)", 2, "Length AD"), ("(b)", 2, "Angle ABC")],
               expl=r"(a) $\tan 42° = \frac{10}{AD} \Rightarrow AD = \frac{10}{\tan 42°} = \frac{10}{0.9004\ldots} "
                    r"= 11.11$ cm. (b) $\tan(\angle DBC) = \frac{14}{10} = 1.4 \Rightarrow \angle DBC = "
                    r"54.5°$; in triangle ABD, $\angle ABD = 90° - 42° = 48°$, so $\angle ABC = 48° + 54.5° = "
                    r"102.5°$."))

    # ── PART B · TASK 2 · CRITERION B ────────────────────────────────────────
    Q.append(q(32, sec="B", crit="B", marks=4, lvl="challenge", topic="Decimal patterns",
               subtopic="multiples of one-eleventh", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="State the repeating block, then justify the rule by linking the denominator 99 to "
                        "two-digit repeating decimals.",
               blocks=[para("Multiples of one-eleventh [4 marks]"),
                       para("(a) Write $\\dfrac{8}{11}$ as a recurring decimal and state what the sum of the two "
                            "repeating digits always is. [2]"),
                       para("(b) Explain, with a justification, why $\\dfrac{n}{11}$ always gives a two-digit "
                            "repeating block equal to $9n$, and hence write $3.\\dot{8}\\dot{1}$ as an improper "
                            "fraction. [2]")],
               parts=[("(a)", 2, "Decimal and digit sum"), ("(b)", 2, "Rule and application")],
               expl=r"(a) $\frac{8}{11} = 0.\dot{7}\dot{2}$; the two repeating digits always sum to 9. (b) "
                    r"Scaling by 9 gives $\frac{n}{11} = \frac{9n}{99}$, and any two-digit integer AB divided "
                    r"by 99 equals $0.\dot{A}\dot{B}$. Since $81 = 9 \times 9$, $0.\dot{8}\dot{1} = \frac{9}{11}$ "
                    r"and $3.\dot{8}\dot{1} = 3 + \frac{9}{11} = \frac{42}{11}$. A mixed-number answer scores "
                    r"R1 A0."))

    Q.append(q(33, sec="B", crit="B", marks=4, lvl="challenge", topic="Power patterns",
               subtopic="decreasing power sequence", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="State the unsimplified fraction for the general term and reduce it algebraically to the "
                        "final form.",
               blocks=[para("Decreasing power sequence [4 marks] A sequence has "
                            "$U_1 = \\dfrac{3^4}{3^5}$, $U_2 = \\dfrac{3^6}{3^8}$, $U_3 = \\dfrac{3^8}{3^{11}}$, "
                            "…"),
                       para("(a) Write $U_1$, $U_2$ and $U_3$ as single powers of 3 and describe the pattern. [2]"),
                       para("(b) Find and prove the general term $U_n$, and hence find $n$ when "
                            "$U_n = \\dfrac{1}{2187}$. [2]")],
               parts=[("(a)", 2, "First three terms and pattern"), ("(b)", 2, "General term and solving")],
               expl=r"(a) $U_1 = 3^{-1}$, $U_2 = 3^{-2}$, $U_3 = 3^{-3}$: each exponent decreases by 1 (each term "
                    r"is divided by 3). (b) Numerator exponents are $n + 1$ and denominator exponents are "
                    r"$3n + 2$, so $U_n = \frac{9^{n+1}}{3^{3n+2}} = \frac{(3^2)^{n+1}}{3^{3n+2}} = "
                    r"\frac{3^{2n+2}}{3^{3n+2}} = 3^{-n}$. Then $\frac{1}{2187} = \frac{1}{3^7} = 3^{-7}$, so "
                    r"$n = 7$."))

    Q.append(q(34, sec="B", crit="B", marks=4, lvl="challenge", topic="Pythagoras & irrationality",
               subtopic="expanding rectangle diagonals", qtype="open_ended",
               tools=["rich_text", "math", "geometry", "table"],
               guidance="Give the general formula for dn, then prove the irrationality for every n ≥ 1.",
               blocks=[para("Expanding rectangle diagonals [4 marks] Rectangle $n$ has width $2n$ cm and height "
                            "2 cm, and $d_n$ is the length of its diagonal."),
                       para("(a) Find $d_1$, $d_2$, $d_3$ in surd form and the general formula for $d_n$. [2]"),
                       para("(b) Prove that $d_n$ is irrational for every integer $n \\ge 1$. [2]")],
               parts=[("(a)", 2, "Three diagonals and the formula"), ("(b)", 2, "Irrationality proof")],
               expl=r"(a) $d_1 = \sqrt{2^2 + 2^2} = 2\sqrt{2}$ cm, $d_2 = \sqrt{4^2 + 2^2} = 2\sqrt{5}$ cm, "
                    r"$d_3 = \sqrt{6^2 + 2^2} = 2\sqrt{10}$ cm, and $d_n = \sqrt{(2n)^2 + 2^2} = "
                    r"\sqrt{4n^2 + 4} = 2\sqrt{n^2 + 1}$ cm. (b) For $d_n$ to be rational, $n^2 + 1$ must be a "
                    r"perfect square, but $n^2 < n^2 + 1 < (n+1)^2$ for every $n \ge 1$, so $n^2 + 1$ lies "
                    r"strictly between consecutive squares and is never one."))

    Q.append(q(35, sec="B", crit="B", marks=3, lvl="challenge", topic="Trigonometric identities",
               subtopic="the identity sin²θ + cos²θ = 1", qtype="open_ended",
               tools=["rich_text", "math", "geometry"],
               guidance="Show both required results in (a), then prove the identity from Pythagoras and apply it.",
               blocks=[para("Fundamental trigonometric relationship [3 marks]"),
                       para("(a) Given $\\sin\\theta = \\dfrac{8}{17}$ and $\\cos\\theta = \\dfrac{15}{17}$, "
                            r"evaluate $\dfrac{\sin\theta}{\cos\theta}$ and $\sin^2\theta + \cos^2\theta$. [1]"),
                       para("(b) Prove that $\\sin^2\\theta + \\cos^2\\theta = 1$ for any right-angled triangle, "
                            "and hence find $\\cos\\theta$ when $\\sin\\theta = \\dfrac{3}{5}$ and $\\theta$ is "
                            "acute. [2]")],
               parts=[("(a)", 1, "Ratio and the identity"), ("(b)", 2, "Proof and application")],
               expl=r"(a) $\frac{8/17}{15/17} = \frac{8}{15}$ and $\frac{64 + 225}{289} = \frac{289}{289} = 1$. "
                    r"(b) $\sin^2\theta + \cos^2\theta = (\frac{a}{c})^2 + (\frac{b}{c})^2 = \frac{a^2 + b^2}{c^2} "
                    r"= \frac{c^2}{c^2} = 1$. With $\sin\theta = \frac{3}{5}$: $\cos^2\theta = 1 - \frac{9}{25} "
                    r"= \frac{16}{25}$, and since $\theta$ is acute $\cos\theta = \frac{4}{5}$. Writing "
                    r"$\pm\frac{4}{5}$ loses A1."))

    # ── PART B · TASK 3 · CRITERION C ────────────────────────────────────────
    Q.append(q(36, sec="B", crit="C", marks=3, lvl="basic", topic="Rational & irrational numbers",
               subtopic="classifying numbers and a counterexample", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Present the classification as a clear two-column table, then answer (b) in sentences "
                        "citing the integer-ratio definition.",
               blocks=[para("Real number subsets & counterexamples [3 marks] "
                            "$T = \\{\\sqrt{81},\\ -\\sqrt{20},\\ \\dfrac{7}{12},\\ -1.\\dot{2}\\dot{3},\\ "
                            "\\pi + 2,\\ 0.10110111\\ldots\\}$"),
                       para("(a) Sort the six elements of $T$ into rational numbers ($\\mathbb{Q}$) and "
                            "irrational numbers ($\\mathbb{R} \\setminus \\mathbb{Q}$). [2]"),
                       para("(b) Chantal claims that any number written with a radical sign is irrational. Show, "
                            "using an element of $T$, that her claim is false. [1]")],
               parts=[("(a)", 2, "Classification table"), ("(b)", 1, "Counterexample")],
               expl=r"(a) Rational: $\sqrt{81} = 9$, $\frac{7}{12}$, $-1.\dot{2}\dot{3} = -\frac{122}{99}$. "
                    r"Irrational: $-\sqrt{20} = -2\sqrt{5}$, $\pi + 2$, $0.10110111\ldots$ "
                    r"(b) $\sqrt{81} = 9 = \frac{9}{1}$ is a ratio of integers, so it is rational even though it "
                    r"uses a radical sign."))

    Q.append(q(37, sec="B", crit="C", marks=3, lvl="intermediate", topic="Scientific notation",
               subtopic="critiquing working", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Name each error using formal vocabulary (power of ten / exponent, coefficient / "
                        "mantissa), then give the correct evaluation.",
               blocks=[para("Critiquing scientific notation working [3 marks] Sènan evaluates $(4.2 \\times "
                            "10^{-3}) - (7.0 \\times 10^{-4})$. He rewrites $7.0 \\times 10^{-4}$ as $0.07 "
                            "\\times 10^{-3}$, obtains $4.13 \\times 10^{-3}$ and writes the answer as $41.3 "
                            "\\times 10^{-4}$."),
                       para("(a) Identify and explain two errors in Sènan's working. [2]"),
                       para("(b) Evaluate the expression correctly. [1]")],
               parts=[("(a)", 2, "Two errors"), ("(b)", 1, "Correct value")],
               expl=r"(a) Error 1 — power-of-ten alignment: $7.0 \times 10^{-4} = 0.7 \times 10^{-3}$, not "
                    r"$0.07 \times 10^{-3}$ (he shifted two decimal places instead of one). Error 2 — invalid "
                    r"coefficient: $41.3 \times 10^{-4}$ has coefficient 41.3, which violates the bound "
                    r"$1 \le a < 10$. (b) $(4.2 - 0.7) \times 10^{-3} = 3.5 \times 10^{-3}$."))

    Q.append(q(38, sec="B", crit="C", marks=4, lvl="intermediate", topic="Congruent triangles",
               subtopic="shared hypotenuse and RHS", qtype="open_ended",
               tools=["rich_text", "math", "geometry", "table"],
               guidance="Set out the three facts in order, name the congruence test, then draw the conclusion "
                        "about the angle bisector.",
               blocks=[para("Shared-hypotenuse congruence [4 marks] In quadrilateral EFGH, $\\angle EFG = "
                            "\\angle EHG = 90°$ and EF = EH = 7.5 cm. The diagonal EG is drawn."),
                       para("(a) Prove that triangle EFG is congruent to triangle EHG. [3]"),
                       para("(b) Hence explain why diagonal EG bisects angle FEH. [1]")],
               parts=[("(a)", 3, "Congruence proof"), ("(b)", 1, "Bisector conclusion")],
               expl=r"(a) In $\triangle EFG$ and $\triangle EHG$: $\angle EFG = \angle EHG = 90°$ (given); "
                    r"$EG = EG$ (common hypotenuse); $EF = EH = 7.5$ cm (given). Hence the triangles are "
                    r"congruent by RHS. (b) Corresponding angles of congruent triangles are equal, so "
                    r"$\angle FEG = \angle HEG$ and EG bisects $\angle FEH$. Writing “SSA” or “ASS” instead "
                    r"of RHS loses the final accuracy mark; a Pythagoras + SSS or SAS route earns full marks."))

    Q.append(q(39, sec="B", crit="C", marks=4, lvl="intermediate", topic="Similar triangles",
               subtopic="intersecting right triangles", qtype="open_ended",
               tools=["rich_text", "math", "geometry", "table"],
               guidance="Justify the similarity with two angle facts, then use the scale factor for both "
                        "lengths.",
               blocks=[para("Intersecting right triangles [4 marks] AB and ED are both perpendicular to BD, and "
                            "lines AE and BD intersect at C. AB = 6 cm, BC = 8 cm and CD = 12 cm."),
                       para("(a) Prove that triangle ABC is similar to triangle EDC. [2]"),
                       para("(b) Calculate the length ED and the length CE. [2]")],
               parts=[("(a)", 2, "Similarity proof"), ("(b)", 2, "Two lengths")],
               expl=r"(a) $\angle ABC = \angle EDC = 90°$ (both perpendicular to BD) and $\angle ACB = "
                    r"\angle ECD$ (vertically opposite), so the triangles are similar by AA. (b) Scale factor "
                    r"$k = \frac{CD}{BC} = \frac{12}{8} = 1.5$, so $ED = 1.5 \times 6 = 9$ cm. In right triangle "
                    r"ABC, $AC = \sqrt{6^2 + 8^2} = 10$ cm, hence $CE = 1.5 \times 10 = 15$ cm."))

    Q.append(q(40, sec="B", crit="C", marks=4, lvl="challenge", topic="Surds & converse of Pythagoras",
               subtopic="classifying a surd triangle", qtype="open_ended",
               tools=["rich_text", "math", "geometry", "table"],
               guidance="Square the sides and name the theorem you use; give the perimeter as an exact surd, "
                        "not a decimal.",
               blocks=[para("Surd triangle classification [4 marks] Triangle LMN has "
                            "LM = $\\sqrt{18}$ m, MN = $\\sqrt{32}$ m and LN = $\\sqrt{50}$ m."),
                       para("(a) Determine whether triangle LMN is right-angled, justifying your answer and "
                            "naming the right angle. [2]"),
                       para("(b) Find the exact perimeter of LMN and explain why it is irrational. [2]")],
               parts=[("(a)", 2, "Right-angle test"), ("(b)", 2, "Exact perimeter and irrationality")],
               expl=r"(a) $LM^2 + MN^2 = 18 + 32 = 50 = LN^2$, so by the Converse of Pythagoras' Theorem the "
                    r"triangle is right-angled with $\angle LMN = 90°$ (opposite the longest side LN). "
                    r"(b) $LM = 3\sqrt{2}$, $MN = 4\sqrt{2}$, $LN = 5\sqrt{2}$, so the perimeter is "
                    r"$12\sqrt{2}$ m; since $\sqrt{2}$ is irrational and 12 is a non-zero rational, the product "
                    r"is irrational. A decimal perimeter of 16.97 m without the exact value scores 0/1."))

    # ── PART B · TASK 4 · CRITERION D ────────────────────────────────────────
    Q.append(q(41, sec="B", crit="D", marks=3, lvl="intermediate", topic="Scientific notation in context",
               subtopic="port of Cotonou cargo", qtype="open_ended",
               tools=["rich_text", "math", "table", "data_table"],
               guidance="Align all masses to one power of ten, then justify the comparison with figures.",
               blocks=[para("Port of Cotonou cargo [3 marks] Over 30 days the port receives $1.18 \\times 10^9$ "
                            "kg of cargo and ships out $2.9 \\times 10^8$ kg, while $6.7 \\times 10^8$ kg arrives "
                            "by a second terminal."),
                       para("(a) Calculate the net mass of cargo handled, in standard form. [2]"),
                       para("(b) A fleet can move $4.0 \\times 10^4$ kg per trip. Determine whether 38 000 trips "
                            "are enough, justifying your answer with figures. [1]")],
               parts=[("(a)", 2, "Net mass"), ("(b)", 1, "Trip comparison")],
               expl=r"(a) Align to $10^9$: $(1.18 + 0.67 - 0.29) \times 10^9 = 1.56 \times 10^9$ kg. "
                    r"(b) $38\,000$ trips move $(3.8 \times 10^4)(4.0 \times 10^4) = 1.52 \times 10^9$ kg, which "
                    r"is less than $1.56 \times 10^9$ kg (39 000 trips are needed), so 38 000 trips do not "
                    r"suffice — short by $4.0 \times 10^7$ kg. Saying “No” without the comparison scores 0/1."))

    Q.append(q(42, sec="B", crit="D", marks=3, lvl="intermediate", topic="Index laws & scientific notation",
               subtopic="school media archive", qtype="open_ended",
               tools=["rich_text", "math", "table"],
               guidance="Give both the exact integer and the standard-form answer in (a).",
               blocks=[para("School media archive [3 marks] The archive holds 5 folders, each containing $2^4$ "
                            "sub-folders, and each sub-folder holds $26 \\times 10^3$ KB of video."),
                       para("(a) Find the total size of the archive as an exact integer and in scientific "
                            "notation (KB). [2]"),
                       para("(b) The archive is then compressed to $2^{-2}$ of its size. Find the compressed "
                            "size in KB. [1]")],
               parts=[("(a)", 2, "Total size"), ("(b)", 1, "Compressed size")],
               expl=r"(a) $(5 \times 2^4)(26 \times 10^3) = 5 \times 2^{10} \times 10^3 = 5 \times 1\,024 \times "
                    r"1\,000 = 5\,120\,000$ KB $= 5.12 \times 10^6$ KB. (b) $5 \times 2^{10} \times 10^3 \times "
                    r"2^{-2} = 5 \times 2^8 \times 10^3 = 1\,280\,000$ KB $= 1.28 \times 10^6$ KB."))

    Q.append(q(43, sec="B", crit="D", marks=3, lvl="intermediate", topic="Similar triangles in context",
               subtopic="baobab shadow survey", qtype="open_ended",
               tools=["rich_text", "math", "geometry", "table"],
               guidance="Justify the similarity before using the ratio, then give one sensible physical "
                        "limitation.",
               blocks=[para("Baobab shadow survey [3 marks] A 1.75 m pole casts a shadow of 2.4 m. At the same "
                            "time a baobab casts a shadow of 16.8 m."),
                       para("(a) Calculate the height of the baobab. [2]"),
                       para("(b) State one physical reason why the answer is only an estimate. [1]")],
               parts=[("(a)", 2, "Height of the baobab"), ("(b)", 1, "Physical limitation")],
               expl=r"(a) The tree and the pole are both vertical and share the angle at the shadow tip, so the "
                    r"triangles are similar by AA: $\frac{h}{1.75} = \frac{16.8}{2.4} = 7 \Rightarrow h = 7 "
                    r"\times 1.75 = 12.25$ m. (b) Any one sensible limitation, for example: a baobab's wide "
                    r"canopy means the highest shadow-casting branch is offset horizontally from the trunk "
                    r"centre; the ground may not be level; the shadow tip has a blurred penumbra; or the trunk "
                    r"may lean. Without the similarity justification, (a) scores M1 A0."))

    Q.append(q(44, sec="B", crit="D", marks=3, lvl="intermediate", topic="Pythagoras in context",
               subtopic="cross-river medical drone", qtype="open_ended",
               tools=["rich_text", "math", "geometry", "table"],
               guidance="Find the vertical drop and the horizontal span first, then the distance and the time.",
               blocks=[para("Cross-river medical drone [3 marks] A drone takes off from a platform 32 m above "
                            "the river and lands on a pad 8 m above it, on the opposite bank 70 m away."),
                       para("(a) Calculate the straight-line flight distance. [2]"),
                       para("(b) The drone flies at 12.5 m/s. Calculate the flight time. [1]")],
               parts=[("(a)", 2, "Flight distance"), ("(b)", 1, "Flight time")],
               expl=r"(a) Vertical drop $= 32 - 8 = 24$ m and horizontal span $= 70$ m, so the distance is "
                    r"$\sqrt{24^2 + 70^2} = \sqrt{576 + 4\,900} = \sqrt{5\,476} = 74$ m. (b) "
                    r"$\frac{74}{12.5} = 5.92$ s."))

    Q.append(q(45, sec="B", crit="D", marks=3, lvl="challenge",
               topic="Trigonometry & Pythagoras in engineering",
               subtopic="rooftop solar panel tilt", qtype="open_ended",
               tools=["rich_text", "math", "geometry", "table"],
               guidance="The tilted panel is the hypotenuse, not the horizontal base. Give the angle to 1 d.p. "
                        "together with the compliance statement, and the width to 2 d.p.",
               blocks=[para("Rooftop solar panel tilt [3 marks] A solar panel of length 1.80 m is tilted so that "
                            "its raised end is 0.42 m above its lower end, and it covers a horizontal width "
                            "$w$."),
                       para("(a) Calculate the angle of tilt $\\theta$ and state whether the installation meets "
                            "the target range $12.0° \\le \\theta \\le 15.0°$. [2]"),
                       para("(b) Calculate the horizontal width $w$ covered by the panel. [1]")],
               parts=[("(a)", 2, "Angle of tilt and compliance"), ("(b)", 1, "Horizontal width")],
               expl=r"(a) The 1.80 m panel is the hypotenuse and 0.42 m is opposite $\theta$, so "
                    r"$\sin\theta = \frac{0.42}{1.80} = \frac{7}{30} = 0.2333\ldots$ and $\theta = "
                    r"\sin^{-1}(0.42 \div 1.80) = 13.493° = 13.5°$ (1 d.p.). Since $12.0° \le 13.5° \le "
                    r"15.0°$, the installation meets the target. (b) By Pythagoras, $w = \sqrt{1.80^2 - 0.42^2} "
                    r"= \sqrt{3.24 - 0.1764} = \sqrt{3.0636} = 1.75$ m (2 d.p.). Using "
                    r"$\tan\theta = \frac{0.42}{1.80}$ misidentifies the tilted panel as the horizontal base "
                    r"and scores 0/2 in (a); both 13.5° and the affirmative compliance statement are needed for "
                    r"the accuracy mark."))

    # Every MYP 3 Part A item is reconstructed from the marking scheme's answer
    # key; Part B items are authored from the scheme's printed data, subparts,
    # mark codes and criteria.
    for record in Q[:25]:
        record["cfg"]["source_fidelity"] = "reconstructed_from_marking_scheme"
        record["cfg"]["source_fidelity_note"] = (
            "The MYP 3 source document is a teacher marking scheme: it prints the correct answer, mark, "
            "criterion, level and rationale but not the student question stem or the wrong options. This item "
            "is reconstructed from that key and must be re-authored against the printed student paper."
        )
    for record in Q[25:]:
        record["cfg"]["source_fidelity"] = "authored_from_marking_scheme"
        record["cfg"]["source_fidelity_note"] = (
            "Authored from the official marking scheme's printed data, subparts, mark codes, criterion and "
            "level. The scheme's worked solution is stored as the marking guidance for this item."
        )
        if record["expl"]:
            record["cfg"]["marking_guidance"] = record["expl"]
    return Q
