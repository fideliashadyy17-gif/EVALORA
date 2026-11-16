#!/usr/bin/env python3
"""Build the IB MYP 5 Mathematics — Standard — May 2025 eAssessment migration.

Source: the May 2025 MYP Mathematics **Standard** on-screen eAssessment, held by
the Brilliant Learning IB archive as "2025 Standard Math Question Paper"
(``M25-Maths-Maths-MYP.pdf``). transcribing what the paper actually printed.

Fidelity rules observed here
----------------------------
* A mark that the paper printed is used verbatim.
* A mark the paper did **not** yield is never invented silently: the question
  carries ``marks_status: "provisional"`` and ``marks_note`` explaining exactly
  what is missing, so a teacher can set it. The examination total is the sum of
  the stored marks, never an assumed 100.
* A sub-part is auto-marked only where the answer is objectively determined.
  "Show that", "hence" and graph-reading parts are ``open_ended`` and go to a
  human — the paper's own command term is what decides, not convenience.
* Diagrams are drawn from the dimensions the paper states, not redrawn by eye.
  Where the paper's figure carried a dimension that did not survive extraction,
  the figure is labelled as a schematic and no number is invented.
* This is Standard, not Extended, and not a DP paper.
"""
import json
import pathlib

ORG_ID = "0a400000-0000-4000-8000-000000000001"
SUBJECT_ID = "0a400000-0000-4000-8000-000000000030"
CREATED_BY = "3c3ed712-f409-4aa1-a645-816418e22ec4"
CLASS_ID = "0a400000-0000-4000-8000-000000000107"

QUIZ_ID = "d1500000-0000-4000-8000-000000000001"
EXAM_ID = "d1500000-0000-4000-8000-000000000002"
QID_PREFIX = "d1500000-0000-4000-8000-"
SOURCE = "ib-myp5-mathematics-standard-may-2025"

TITLE = "IB MYP 5 Mathematics — Standard — May 2025 eAssessment"


# --------------------------------------------------------------- doc builders
def para(text):
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


def para_math(*parts):
    """parts: alternating plain text and $…$ maths."""
    content = []
    for part in parts:
        if part.startswith("$") and part.endswith("$"):
            content.append({"type": "mathInline", "attrs": {"latex": part[1:-1]}})
        else:
            content.append({"type": "text", "text": part})
    return {"type": "paragraph", "content": content}


def display(latex):
    return {"type": "mathBlock", "attrs": {"latex": latex}}


def doc(*blocks):
    content = []
    for block in blocks:
        if block is None:
            continue
        content.append(para(block) if isinstance(block, str) else block)
    return {"type": "doc", "content": content}


def table(columns, rows):
    content = [{"type": "tableRow",
                "content": [{"type": "tableHeader", "content": [para(str(c))]} for c in columns]}]
    for row in rows:
        content.append({"type": "tableRow",
                        "content": [{"type": "tableCell", "content": [para(str(c))]} for c in row]})
    return {"type": "table", "content": content}


# ------------------------------------------------------------ figure builders
def _domain(x_max, y_max, *, grid=True, axes=True, equal=False):
    return {"xMin": 0, "xMax": x_max, "yMin": 0, "yMax": y_max, "gridStep": None,
            "showGrid": grid, "showAxes": axes, "showCoordinates": False,
            "showLegend": False, "showIntersections": False, "equalScale": equal}


def figure(spec):
    return {"type": "graphBlock", "attrs": {"spec": spec}}


def _seg(sid, x1, y1, x2, y2, colour="#0a5c36", style="solid", width=2, label=""):
    return {"id": sid, "x1": x1, "y1": y1, "x2": x2, "y2": y2,
            "color": colour, "style": style, "width": width, "label": label, "visible": True}


def _point(pid, x, y, label, colour="#b3441c", coords=True):
    return {"id": pid, "x": x, "y": y, "label": label, "color": colour,
            "showCoordinates": coords, "open": False, "visible": True}


def _stroke(sid, pts, colour="#0a5c36", width=2):
    return {"id": sid, "points": [{"x": x, "y": y} for x, y in pts],
            "color": colour, "width": width, "visible": True}


def _note(aid, x, y, text, colour="#333333"):
    return {"id": aid, "x": x, "y": y, "text": text, "color": colour}


def blank_graph(title, x_max, y_max, *, points=(), segments=(), strokes=(),
                annotations=(), functions=(), equal=False):
    return {
        "version": 1,
        "title": title,
        "domain": _domain(x_max, y_max, equal=equal),
        "functions": list(functions),
        "points": list(points),
        "segments": list(segments),
        "annotations": list(annotations),
        "strokes": list(strokes),
        "regions": [],
        "xLabel": "x", "yLabel": "y",
    }


def rectangle_figure():
    """Q5 — the rectangle, area 140 units², one side printed as 5x.

    The paper's figure prints the area (140 units²) and one side (5x). The
    remaining side is not legible in the recovered export; the rectangle is
    therefore drawn as a schematic — the two printed facts are annotated and no
    unprinted length is asserted.
    """
    return figure(blank_graph(
        "Rectangle — diagram not to scale",
        10, 6,
        segments=[
            _seg("top", 1, 4.5, 8.4, 4.5),
            _seg("right", 8.4, 4.5, 8.4, 1.5),
            _seg("bottom", 1, 1.5, 8.4, 1.5),
            _seg("left", 1, 1.5, 1, 4.5),
        ],
        annotations=[
            _note("len", 4.4, 5.15, "5x"),
            _note("area", 4.0, 2.7, "Area = 140 units²"),
        ],
    ))


def design_t_figure():
    """Q6 Design T — isosceles triangle, height h. Schematic.

    The paper prints that the height h works out to 3022 m to the nearest
    metre. It does not yield the printed base or the equal side, so neither is
    invented: only h is labelled.
    """
    return figure(blank_graph(
        "Design T — diagram not to scale",
        10, 6,
        segments=[
            _seg("left", 1.4, 1.2, 5.0, 5.0),
            _seg("right", 8.6, 1.2, 5.0, 5.0),
            _seg("base", 1.4, 1.2, 8.6, 1.2),
            _seg("height", 5.0, 1.2, 5.0, 5.0, colour="#b3441c", style="dashed"),
        ],
        annotations=[
            _note("h", 5.25, 3.0, "h"),
            _note("right", 6.05, 1.45, "┐", "#b3441c"),
        ],
    ))


def design_s_figure():
    """Q6 Design S — sector QRS, RQ = RS = 3400 m.

    Both radii are printed (3400 m each) and the sector angle follows from the
    printed area check in part (c): 4 040 000 = (θ/360)·π·3400² gives θ ≈ 40°,
    which is what is drawn. The arc is sampled from the true circle, so the
    curvature is exact.
    """
    import math
    radius, theta = 3400.0, math.radians(40.05)
    cx, cy = 0.0, 0.0
    arc = []
    steps = 48
    for i in range(steps + 1):
        angle = theta * i / steps
        arc.append((cx + radius * math.cos(angle) * 0.0024,
                    cy + radius * math.sin(angle) * 0.0024))
    return figure(blank_graph(
        "Design S — diagram not to scale",
        10, 6,
        segments=[
            _seg("rq", 1.0, 1.4, arc[-1][0] + 1.0, arc[-1][1] + 1.4),
            _seg("rs", 1.0, 1.4, arc[0][0] + 1.0, arc[0][1] + 1.4),
        ],
        strokes=[_stroke("arc", [(x + 1.0, y + 1.4) for x, y in arc], "#0a5c36", 2)],
        annotations=[
            _note("R", 0.72, 1.15, "R"),
            _note("Q", arc[0][0] + 1.15, arc[0][1] + 1.5, "Q"),
            _note("S", arc[-1][0] + 0.55, arc[-1][1] + 1.5, "S"),
            _note("r1", 4.6, 2.75, "3400 m"),
        ],
    ))


def cumulative_frequency_figure():
    """Q4 — the female cumulative-frequency curve, plotted from its own table.

    The recovered export gives the female cumulative-frequency table in full
    (0.2 kg → 0 cats, … 5.8 kg → 800 cats). The curve is that table joined
    point to point, so reading a quartile off it is reading the paper's data.
    """
    data = [(0.2, 0), (0.4, 5), (0.6, 10), (0.8, 18), (1.0, 30), (1.2, 48),
            (1.4, 68), (1.6, 90), (1.8, 115), (2.0, 142), (2.2, 172),
            (2.4, 205), (2.6, 242), (2.8, 285), (3.0, 335), (3.2, 400),
            (3.4, 470), (3.6, 545), (3.8, 610), (4.0, 650), (4.2, 685),
            (4.4, 715), (4.6, 740), (4.8, 758), (5.0, 770), (5.2, 780),
            (5.4, 788), (5.6, 795), (5.8, 800)]
    return figure(blank_graph(
        "Cumulative frequency — weight of female Persian cats",
        6.2, 820,
        strokes=[_stroke("cf", data)],
        annotations=[_note("n", 5.0, 810, "800 cats", "#333333")],
    ))


def warehouse_figure():
    """Q7 — the 32 m by 16 m working area with A, P and B.

    Every value here is printed by the paper: the rectangle is 32 m × 16 m,
    A is the origin, P is (16, 12) and B is (32, 16).
    """
    return figure(blank_graph(
        "Warehouse working area — diagram not to scale",
        34, 18,
        segments=[
            _seg("top", 0, 16, 32, 16),
            _seg("right", 32, 16, 32, 0),
            _seg("bottom", 0, 0, 32, 0),
            _seg("left", 0, 0, 0, 16),
            _seg("r1a", 0, 0, 16, 0, "#1f4e79", "dashed", 2),
            _seg("r1b", 16, 0, 16, 12, "#1f4e79", "dashed", 2),
            _seg("r1c", 16, 12, 32, 12, "#1f4e79", "dashed", 2),
            _seg("r1d", 32, 12, 32, 16, "#1f4e79", "dashed", 2),
            _seg("r2", 0, 0, 32, 16, "#b3441c", "solid", 2),
        ],
        points=[
            _point("A", 0, 0, "A"),
            _point("P", 16, 12, "P"),
            _point("B", 32, 16, "B"),
        ],
        annotations=[
            _note("w", 14.2, -0.9, "32 m"),
            _note("h", -1.5, 8.4, "16 m"),
        ],
    ))


# ------------------------------------------------------------------ questions
Q = []


def add(n, qtype, marks, topic, subtopic, blocks, *, cfg_extra=None,
        difficulty="medium", explanation=None):
    cfg = {
        "question_number": n["label"],
        "paper_question": n["paper"],
        "part_label": n["label"],
        "marks": marks,
        "calculator": True,
        "calculator_policy": "on_screen_only",
        "assessment_style": "ib_myp_eassessment",
        "source": SOURCE,
    }
    if cfg_extra:
        cfg.update(cfg_extra)
    Q.append({
        "n": n["pos"], "t": qtype, "m": marks, "df": difficulty,
        "tp": topic, "st": subtopic,
        "p": blocks["plain"], "d": blocks["doc"], "e": explanation,
        "cfg": cfg,
    })


def parts_cfg(parts, *, marks_status, marks_note=None):
    return {"parts": parts, "marks_status": marks_status,
            **({"marks_note": marks_note} if marks_note else {})}


def plain_of(d):
    """Flatten a document to the legacy plain-text mirror."""
    out = []

    def walk(node):
        kind = node.get("type")
        if kind == "text":
            out.append(node.get("text", ""))
        elif kind == "mathInline":
            out.append("$" + str(node.get("attrs", {}).get("latex", "")) + "$")
        elif kind == "mathBlock":
            out.append("\n$$" + str(node.get("attrs", {}).get("latex", "")) + "$$\n")
        elif kind == "table":
            for row in node.get("content", []):
                cells = []
                for cell in row.get("content", []):
                    buf, save = out[:], out[:]
                    del out[:]
                    for child in cell.get("content", []):
                        walk(child)
                    cells.append("".join(out))
                    del out[:]
                    out.extend(save)
                    _ = buf
                out.append(" | ".join(cells) + "\n")
            out.append("\n")
        elif kind in ("graphBlock", "assessDiagramBlock", "statsBlock"):
            spec = (node.get("attrs", {}) or {}).get("spec", {}) or {}
            out.append("\n[Figure: %s]\n" % (spec.get("title") or "diagram"))
        else:
            for child in node.get("content", []):
                walk(child)
            if kind in ("paragraph", "heading", "listItem"):
                out.append("\n")

    for node in d.get("content", []):
        walk(node)
    import re as _re
    return _re.sub(r"\n{3,}", "\n\n", "".join(out)).strip()


def block(*blocks):
    d = doc(*blocks)
    return {"doc": d, "plain": plain_of(d)}


# ══════════════════════════════════════════════════════ QUESTION 1 · 6 marks
# Verified: the paper prints "Question 1 (6 marks)" with 1a 1 mark, 1b 2 marks,
# 1c 3 marks.
Q1_PARTS = [
    {"id": "a", "label": "(a)", "kind": "numeric", "points": 1,
     "prompt": "Determine the value of a.", "answer": 4, "tolerance": 0,
     "unit": "", "placeholder": "a =",
     "hints": ["Write 256 as a power of 4 by multiplying 4 by itself repeatedly.",
               "4 × 4 × 4 × 4 = 256, so 256 is 4 raised to what power?"]},
    {"id": "b1", "label": "(b) value of b", "kind": "numeric", "points": 1,
     "prompt": "Determine the value of b.", "answer": 2, "tolerance": 0,
     "unit": "", "placeholder": "b =",
     "hints": ["Write each number as a product of prime factors before multiplying.",
               "3/8 × 32/9 simplifies to 4/3, which is 2² × 3⁻¹. The power of 2 is b."]},
    {"id": "b2", "label": "(b) value of c", "kind": "numeric", "points": 1,
     "prompt": "Determine the value of c.", "answer": -1, "tolerance": 0,
     "unit": "", "placeholder": "c =",
     "hints": ["The same simplification gives 4/3 = 2² × 3ᶜ.",
               "Since 4/3 = 2² ÷ 3, the power of 3 is negative."]},
    {"id": "c1", "label": "(c) simplest surd", "kind": "expression", "points": 1,
     "prompt": "Write √45 in its simplest surd form.",
     "accepted": ["3\\sqrt{5}", "3sqrt5", "3√5", "3*sqrt(5)"],
     "placeholder": "e.g. 2\\sqrt{3}",
     "hints": ["Look for the largest square number that divides exactly into 45.",
               "45 = 9 × 5 and √9 = 3, so √45 = 3√5."]},
    {"id": "c2", "label": "(c) value of d", "kind": "numeric", "points": 1,
     "prompt": "Find the value of d.", "answer": 2, "tolerance": 0,
     "unit": "", "placeholder": "d =",
     "hints": ["Substitute √45 = 3√5 into 3√5 − d√e = √5.",
               "3√5 − √5 = 2√5, so d√e = 2√5."]},
    {"id": "c3", "label": "(c) value of e", "kind": "numeric", "points": 1,
     "prompt": "Find the value of e.", "answer": 5, "tolerance": 0,
     "unit": "", "placeholder": "e =",
     "hints": ["Compare d√e with 2√5 term by term.",
               "The surd part must match, so e is the number under the root in 2√5."]},
]

add({"pos": 1, "paper": 1, "label": "Question 1"}, "assess_parts", 6,
    "Number", "indices, fractions and surds",
    block("Question 1 — 6 marks",
          para_math("$256 = 4^a$"),
          para_math("$\\frac{3}{8} \\times \\frac{32}{9} = 2^b \\times 3^c$"),
          para_math("$\\sqrt{45} - d\\sqrt{e} = \\sqrt{5}$"),
          para("Answer parts (a), (b) and (c) below. Give each value in its simplest form.")),
    cfg_extra=parts_cfg(Q1_PARTS, marks_status="verified",
                        marks_note="Total 6 marks printed by the paper: (a) 1, (b) 2, (c) 3. "
                                   "The split of (b) into b and c, and of (c) into the simplified "
                                   "surd, d and e, is a subdivision of those printed totals."),
    explanation="$4^4 = 256$ so $a = 4$. $\\frac{3}{8}\\times\\frac{32}{9} = \\frac{4}{3} = 2^2 3^{-1}$, "
                "so $b = 2$ and $c = -1$. $\\sqrt{45} = 3\\sqrt{5}$, so $3\\sqrt5 - d\\sqrt e = \\sqrt5$ "
                "gives $d\\sqrt e = 2\\sqrt5$, hence $d = 2$ and $e = 5$.")

# ══════════════════════════════════════════════════════ QUESTION 2
# The paper's printed total for Question 2 did not survive extraction.
Q2_PARTS = [
    {"id": "a", "label": "(a) coefficient of y", "kind": "numeric", "points": 1,
     "prompt": "Ingrid: 2x + ▢y = 11.5", "answer": 3, "tolerance": 0,
     "unit": "", "placeholder": "number",
     "hints": ["Ingrid bought two watermelons and three pineapples.",
               "x is a watermelon and y is a pineapple, so the coefficient of y is the number of pineapples."]},
    {"id": "b", "label": "(b) coefficient of x", "kind": "numeric", "points": 1,
     "prompt": "Étienne: ▢x + 2y = …", "answer": 3, "tolerance": 0,
     "unit": "", "placeholder": "number",
     "hints": ["Étienne bought three watermelons and two pineapples.",
               "The coefficient of x is the number of watermelons Étienne bought."]},
    {"id": "c", "label": "(c) total paid", "kind": "numeric", "points": 1,
     "prompt": "Étienne: 3x + 2y = ▢", "answer": 13.5, "tolerance": 0,
     "unit": "$", "placeholder": "amount",
     "hints": ["Read the amount Étienne paid from the question.",
               "Étienne paid 13.50 for three watermelons and two pineapples."]},
    {"id": "d", "label": "(d) value of x", "kind": "numeric", "points": 1.5,
     "prompt": "Find x, the price of one watermelon.", "answer": 3.5, "tolerance": 0,
     "unit": "$", "placeholder": "x =",
     "hints": ["Solve the pair 2x + 3y = 11.5 and 3x + 2y = 13.5 by elimination.",
               "Multiply the first equation by 2 and the second by 3, then subtract to eliminate y."]},
    {"id": "e", "label": "(e) value of y", "kind": "numeric", "points": 1.5,
     "prompt": "Find y, the price of one pineapple.", "answer": 1.5, "tolerance": 0,
     "unit": "$", "placeholder": "y =",
     "hints": ["Substitute your value of x back into either equation.",
               "2(3.5) + 3y = 11.5 gives 3y = 4.5."]},
]

add({"pos": 2, "paper": 2, "label": "Question 2"}, "assess_parts", 6,
    "Algebra", "simultaneous linear equations",
    block("Question 2",
          para("Ingrid and Étienne went to a supermarket."),
          para("Ingrid bought two watermelons and three pineapples for $11.50."),
          para("Étienne bought three watermelons and two pineapples for $13.50."),
          para_math("Let $x$ represent the price for one watermelon and $y$ represent the price "
                    "of one pineapple."),
          para("Write down the missing values in the two equations below."),
          display("2x + \\square y = 11.5"),
          display("\\square x + 2y = \\square"),
          para("Hence, find the values of x and y.")),
    cfg_extra=parts_cfg(Q2_PARTS, marks_status="provisional",
                        marks_note="The paper's printed total for Question 2 did not survive "
                                   "extraction. 6 marks is a provisional allocation matching "
                                   "Questions 1 and 3; a teacher can change it in the paper "
                                   "settings without reimporting."),
    explanation="2x + 3y = 11.5 and 3x + 2y = 13.5. Doubling the first and tripling the second "
                "gives 4x + 6y = 23 and 9x + 6y = 40.5, so 5x = 17.5 and x = 3.5; then "
                "3y = 11.5 − 7 = 4.5, so y = 1.5.")

# ══════════════════════════════════════════════════════ QUESTION 3 · 6 marks
Q3_TABLE = table(
    ["+", "2", "3", "5", "11"],
    [["2", "4", "▢", "7", "13"],
     ["3", "▢", "6", "8", "14"],
     ["5", "7", "8", "10", "▢"],
     ["11", "13", "14", "▢", "22"]])

Q3_PARTS = [
    {"id": "a1", "label": "(a) 2 + 3", "kind": "numeric", "points": 0.25,
     "prompt": "Row 2, column 3", "answer": 5, "tolerance": 0,
     "hints": ["Each cell is the sum of the row header and the column header.",
               "2 + 3 = 5."]},
    {"id": "a2", "label": "(a) 3 + 2", "kind": "numeric", "points": 0.25,
     "prompt": "Row 3, column 2", "answer": 5, "tolerance": 0,
     "hints": ["Add the row header to the column header.",
               "3 + 2 = 5."]},
    {"id": "a3", "label": "(a) 5 + 11", "kind": "numeric", "points": 0.25,
     "prompt": "Row 5, column 11", "answer": 16, "tolerance": 0,
     "hints": ["Add 5 to 11 for this cell.",
               "5 + 11 = 16."]},
    {"id": "a4", "label": "(a) 11 + 5", "kind": "numeric", "points": 0.25,
     "prompt": "Row 11, column 5", "answer": 16, "tolerance": 0,
     "hints": ["Add 11 to 5 for this cell.",
               "11 + 5 = 16."]},
    {"id": "b", "label": "(b)", "kind": "expression", "points": 2,
     "prompt": "Determine the probability that the sum of the two numbers is a prime number.",
     "accepted": ["\\frac{3}{8}", "3/8", "0.375", "\\frac{6}{16}", "6/16"],
     "placeholder": "probability",
     "hints": ["Count the outcomes in the table whose sum is prime: 5, 7 and 13.",
               "There are 6 prime outcomes out of 16 equally likely outcomes; simplify the fraction."]},
    {"id": "c", "label": "(c)", "kind": "expression", "points": 2,
     "prompt": "Determine the probability that the sum of the two numbers is a prime number "
               "or a square number.",
     "accepted": ["\\frac{9}{16}", "9/16", "0.5625"],
     "placeholder": "probability",
     "hints": ["The square sums in the table are 4 and 16. None of them is prime.",
               "Add the 6 prime outcomes to the 3 square outcomes out of 16."]},
    {"id": "d", "label": "(d)", "kind": "text", "points": 1,
     "prompt": "P(R ∩ S) = 0 because event R and event S are ______ events.",
     "accepted": ["mutually exclusive", "mutually exclusive events", "disjoint",
                  "mutuallyexclusive", "mutually-exclusive"],
     "placeholder": "two words",
     "hints": ["Two events that cannot happen at the same time have an intersection of zero.",
               "The term begins with 'mutually'."]},
]

add({"pos": 3, "paper": 3, "label": "Question 3"}, "assess_parts", 6,
    "Probability", "sample space and combined events",
    block("Question 3 — 6 marks",
          para("Four balls numbered 2, 3, 5 and 11 are placed in a bag. With replacement, two "
               "balls are randomly selected one after the other. The sum of the two numbers is "
               "recorded."),
          Q3_TABLE,
          para("Let event R be ‘the sum of the two numbers is a prime number’ and event S be "
               "‘the sum of the two numbers is a square number’.")),
    cfg_extra=parts_cfg(Q3_PARTS, marks_status="verified",
                        marks_note="Total 6 marks printed by the paper: (a) 1, (b) 2, (c) 2, (d) 1. "
                                   "Part (a) is split across its four cells at 0.25 marks each, "
                                   "which sums to the printed 1 mark."),
    explanation="The 16 equally likely sums are 4, 5, 7, 13, 5, 6, 8, 14, 7, 8, 10, 16, 13, 14, "
                "16, 22. Primes: 6 outcomes, so P(R) = 6/16 = 3/8. Squares (4, 16, 16): 3 more, "
                "so P(R ∪ S) = 9/16. R and S share no outcome, so they are mutually exclusive.")

# ══════════════════════════════════════════════════════ QUESTION 4
Q4_DATA = table(
    ["Weight (kg)", "0.2", "0.4", "0.6", "0.8", "1.0", "1.2", "1.4", "1.6", "1.8", "2.0",
     "2.2", "2.4", "2.6", "2.8", "3.0"],
    [["Female cumulative frequency",
      "0", "5", "10", "18", "30", "48", "68", "90", "115", "142",
      "172", "205", "242", "285", "335"]])

add({"pos": 4, "paper": 4, "label": "Question 4(a)"}, "assess_parts", 5,
    "Statistics", "cumulative frequency",
    block("Question 4(a)",
          para("The cumulative frequency graph shows the weights of female and male Persian "
               "cats. Weights are measured in kilograms (kg)."),
          cumulative_frequency_figure(),
          para("The table below lists the cumulative frequencies the graph was drawn from for "
               "the female cats, out of 800 cats in total."),
          Q4_DATA,
          para("Calculate the percentage of female cats that weigh at least 4 kg.")),
    cfg_extra=parts_cfg([
        {"id": "a", "label": "(a)", "kind": "numeric", "points": 5,
         "prompt": "Percentage of female cats weighing at least 4 kg",
         "answer": 18.75, "tolerance": 0.05, "unit": "%", "placeholder": "percentage",
         "hints": ["Read the cumulative frequency at 4 kg, then subtract it from the total of 800.",
                   "At 4 kg the cumulative frequency is 650, so 800 − 650 = 150 cats weigh at "
                   "least 4 kg. Write 150 out of 800 as a percentage."]},
    ], marks_status="provisional",
        marks_note="The paper's printed total for Question 4 did not survive extraction. "
                   "5 marks is a provisional allocation for this part; a teacher can change it."),
    explanation="At 4 kg the cumulative frequency is 650 of 800, so 150 cats weigh at least "
                "4 kg: 150/800 × 100 = 18.75 %.")

add({"pos": 5, "paper": 4, "label": "Question 4(b)"}, "open_ended", 4,
    "Statistics", "quartiles from a cumulative frequency graph",
    block("Question 4(b)",
          cumulative_frequency_figure(),
          para("Use the graph to determine the missing values in the following table."),
          table(["", "Weight of female Persian cats (kg)", "Weight of male Persian cats (kg)"],
                [["Lower quartile (1st quartile)", "2.4", ""],
                 ["Median", "3.1", ""],
                 ["Upper quartile (3rd quartile)", "", "5.9"],
                 ["Interquartile range (IQR)", "", ""]]),
          para("Show how you read each value from the graph.")),
    cfg_extra={"marks_status": "provisional",
               "manual_marking": True,
               "marks_note": "Read from the graph, so it is marked by a teacher. The paper's own "
                             "mark for this part did not survive extraction."},
    explanation="Read each quartile at the appropriate cumulative frequency (200, 400 and 600 out "
                "of 800) and subtract to obtain the IQR. Marked by a teacher, since the values "
                "depend on reading the curve.")

add({"pos": 6, "paper": 4, "label": "Question 4(c)"}, "open_ended", 3,
    "Statistics", "comparing distributions",
    block("Question 4(c) — 2 marks printed for the terminology",
          para("Using information from the table, write down the missing statistical terms in "
               "the following statements:"),
          para("The ______ is larger for the male cats, therefore the male cats are heavier "
               "than the female cats."),
          para("The ______ is larger for the male cats, therefore the weights of the male cats "
               "are more dispersed than the weights of the female cats."),
          para("Explain your choice of each term.")),
    cfg_extra={"marks_status": "provisional",
               "manual_marking": True,
               "marks_note": "The paper prints 2 marks for the terminology; the explanation is "
                             "also teacher-marked, giving a provisional 3 in total."},
    explanation="Median (heavier on average) and interquartile range or range (more dispersed). "
                "Teacher-marked because the justification is part of the answer.")

# ══════════════════════════════════════════════════════ QUESTION 5 · 8 marks
Q5_PARTS = [
    {"id": "a", "label": "(a)", "kind": "expression", "points": 4,
     "prompt": "Find the value of x.",
     "accepted": ["\\sqrt{28}", "sqrt28", "2\\sqrt{7}", "2sqrt7", "\\sqrt{28}\\text{ units}",
                  "5.29", "5.3", "5.292"],
     "placeholder": "x =",
     "hints": ["The area of a rectangle is length × width. Write an equation in x.",
               "Area = 5x × x = 5x² = 140, so x² = 28."]},
    {"id": "b", "label": "(b) length", "kind": "numeric", "points": 0.5,
     "prompt": "Length of the rectangle", "answer": 26.46, "tolerance": 0.1,
     "unit": "units", "placeholder": "length",
     "hints": ["The length is the side printed as 5x.",
               "Substitute your x into 5x."]},
    {"id": "b2", "label": "(b) width", "kind": "numeric", "points": 0.5,
     "prompt": "Width of the rectangle", "answer": 5.29, "tolerance": 0.1,
     "unit": "units", "placeholder": "width",
     "hints": ["The width is the remaining side, which is x.",
               "Use your value of x directly."]},
    {"id": "c", "label": "(c) enlarged length", "kind": "numeric", "points": 1.5,
     "prompt": "The rectangle is enlarged. The area of the enlarged rectangle is 1260 units². "
               "Find the length of the enlarged rectangle.",
     "answer": 79.37, "tolerance": 0.2, "unit": "units", "placeholder": "length",
     "hints": ["Compare the areas: 1260 ÷ 140 = 9. What is the linear scale factor?",
               "A scale factor of 3 for length gives 9 for area, so multiply the length by 3."]},
    {"id": "c2", "label": "(c) enlarged width", "kind": "numeric", "points": 1.5,
     "prompt": "Find the width of the enlarged rectangle.",
     "answer": 15.87, "tolerance": 0.2, "unit": "units", "placeholder": "width",
     "hints": ["Use the same linear scale factor you found for the length.",
               "Multiply the original width by 3."]},
]

add({"pos": 7, "paper": 5, "label": "Question 5"}, "assess_parts", 8,
    "Algebra", "quadratic models and enlargement",
    block("Question 5 — 8 marks",
          para("The following diagram shows a rectangle."),
          rectangle_figure(),
          para_math("One side of the rectangle is $5x$ and its area is $140$ units².")),
    cfg_extra=parts_cfg(Q5_PARTS, marks_status="verified",
                        marks_note="Total 8 marks printed by the paper: (a) 4, (b) 1, (c) 3. "
                                   "(b) and (c) are split across their two values, each summing to "
                                   "the printed total. The width of the rectangle is inferred to be "
                                   "x: the paper prints only the side 5x and the area, and part (b) "
                                   "asks for both length and width after finding x."),
    explanation="$5x^2 = 140$ so $x = \\sqrt{28} = 2\\sqrt7 \\approx 5.29$. Length $= 5x \\approx 26.46$ "
                "units, width $\\approx 5.29$ units. Enlarged area 1260 = 9 × 140, so the linear "
                "scale factor is 3: length ≈ 79.37 units, width ≈ 15.87 units.")

# ══════════════════════════════════════════════════════ QUESTION 6 · 15 marks
TIDAL = ("Renewable energy technology has advanced by making use of changing coastal tides to "
         "provide clean and reliable energy. There are some physical requirements needed in order "
         "to utilise energy from tides. It is essential to have a large tidal range. The tidal "
         "range is the difference in height of the low tide and the high tide. Another physical "
         "requirement is a suitable location to create a large tidal lagoon. A tidal lagoon is a "
         "lake that holds water at high tide. For financial and ecological reasons, the best "
         "location for a tidal lagoon is where the coastline forms a bay. Tidal energy is "
         "dependent on the tidal range and the area of the lagoon seabed.")

ENERGY_FORMULA = ("E = \\frac{1}{700} Ad^2")

add({"pos": 8, "paper": 6, "label": "Question 6(a)"}, "open_ended", 3,
    "Geometry", "isosceles triangle and Pythagoras",
    block("Question 6(a) — 3 marks",
          para("In this question you will make calculations for tidal energy."),
          para(TIDAL),
          para("The following diagram shows an isosceles triangle with dimensions indicated on "
               "the diagram."),
          design_t_figure(),
          para("Show that the height h of the triangle is 3022 to the nearest metre (m).")),
    cfg_extra={"marks_status": "verified", "manual_marking": True,
               "marks_note": "3 marks printed by the paper. A ‘show that’ is marked by a teacher: "
                             "the reasoning is the answer, not just the value."},
    explanation="Halve the isosceles triangle to form a right-angled triangle, then apply "
                "Pythagoras. Teacher-marked: the working is what earns the marks.")

add({"pos": 9, "paper": 6, "label": "Question 6(b)"}, "open_ended", 4,
    "Geometry", "area of a triangle",
    block("Question 6(b)",
          design_t_figure(),
          para("Hence, determine the area of the triangle.")),
    cfg_extra={"marks_status": "provisional", "manual_marking": True,
               "marks_note": "The paper does not yield a printed mark for this part. The base of "
                             "the triangle is not legible in the recovered export, so no value is "
                             "asserted here and the part is teacher-marked."},
    explanation="Area = ½ × base × h with h = 3022 m. The base comes from the paper's figure, so "
                "this part is teacher-marked.")

add({"pos": 10, "paper": 6, "label": "Question 6(c)"}, "open_ended", 3,
    "Geometry", "area of a sector",
    block("Question 6(c) — 3 marks",
          para("The sector QRS has the dimensions indicated on the diagram."),
          design_s_figure(),
          table(["", "Distance (m)"], [["RQ", "3400"], ["RS", "3400"]]),
          para("Show that the area of the sector QRS is 4040000 m² correct to three significant "
               "figures.")),
    cfg_extra={"marks_status": "verified", "manual_marking": True,
               "marks_note": "3 marks printed by the paper. A ‘show that’ is teacher-marked."},
    explanation="Area of sector = (θ/360) × π r² with r = 3400 m and θ ≈ 40°, giving "
                "4 040 000 m² to 3 s.f. Teacher-marked.")

add({"pos": 11, "paper": 6, "label": "Question 6(d)–(e)"}, "open_ended", 3,
    "Algebra", "substitution into a formula",
    block("Question 6(d)–(e)",
          para("The energy (E) produced by a tidal lagoon is given by the following formula:"),
          display(ENERGY_FORMULA),
          para("Where: E = tidal energy (kilo Watt hours, kWh); A = area of the lagoon seabed "
               "(square metres, m²); d = tidal range (metres, m)."),
          para("Information for Design T: A = your answer from part (b), d = 15 m. Determine "
               "the value of E."),
          para("Information for Design S: E = 1 500 000 kWh, A = 4 040 000 m². Calculate the "
               "value of d.")),
    cfg_extra={"marks_status": "provisional", "manual_marking": True,
               "marks_note": "The paper does not yield a printed mark for these parts. They depend "
                             "on the answer to (b), so they are teacher-marked together."},
    explanation="Substitute into E = Ad²/700. Teacher-marked because the value of A is carried "
                "forward from part (b).")

add({"pos": 12, "paper": 6, "label": "Question 6(f)"}, "assess_parts", 2,
    "Algebra", "percentage change in a quadratic model",
    block("Question 6(f) — 2 marks",
          para("The energy (E) produced by a tidal lagoon is given by:"),
          display(ENERGY_FORMULA),
          para("Due to a storm, d increases by 10%."),
          para("Determine the percentage increase of E.")),
    cfg_extra=parts_cfg([
        {"id": "f", "label": "(f)", "kind": "numeric", "points": 2,
         "prompt": "Percentage increase of E", "answer": 21, "tolerance": 0.05,
         "unit": "%", "placeholder": "percentage",
         "hints": ["E depends on d², so scale d by 1.1 and see what happens to d².",
                   "1.1² = 1.21, so E becomes 121 % of its original value."]},
    ], marks_status="verified",
        marks_note="2 marks printed by the paper."),
    explanation="$E \\propto d^2$, so $d \\to 1.1d$ gives $E \\to 1.21E$: a 21 % increase.")

# ══════════════════════════════════════════════════════ QUESTION 7 · 20 marks
Q7_PARTS = [
    {"id": "b", "label": "(b)", "kind": "expression", "points": 4,
     "prompt": "Robot 2 moves on the path from A to P using y = ¾x. Find the equation of the "
               "path from P to B.",
     "accepted": ["y = \\frac{1}{4}x + 8", "y = 1/4x + 8", "y = 0.25x + 8", "y = x/4 + 8",
                  "\\frac{1}{4}x + 8", "y=1/4x+8", "y = (1/4)x + 8"],
     "placeholder": "y =",
     "hints": ["Find the gradient of PB from the coordinates of P and B.",
               "Gradient = (16 − 12)/(32 − 16) = 1/4, then substitute P(16, 12) into y = mx + c."]},
    {"id": "c", "label": "(c)", "kind": "numeric", "points": 8,
     "prompt": "Robot 2 travels a distance of 20 m from A to P. Calculate D₂, the total distance "
               "travelled by Robot 2 from A to B, correct to two decimal places.",
     "answer": 36.49, "tolerance": 0.02, "unit": "m", "placeholder": "D₂ =",
     "hints": ["Find PB using the distance formula (or Pythagoras) with P(16, 12) and B(32, 16).",
               "PB = √((32 − 16)² + (16 − 12)²) = √272 ≈ 16.49 m, then add the 20 m from A to P."]},
    {"id": "a", "label": "(a)", "kind": "numeric", "points": 6,
     "prompt": "Robot 1 can only move parallel to the walls of the warehouse. Let D₁ be the "
               "distance travelled by Robot 1 from A to P to B. Determine the value of D₁.",
     "answer": 48, "tolerance": 0, "unit": "m", "placeholder": "D₁ =",
     "hints": ["Add the horizontal and vertical distances separately for each leg.",
               "A(0,0) to P(16,12) is 16 + 12 = 28 m; P(16,12) to B(32,16) is 16 + 4 = 20 m."]},
    {"id": "d", "label": "(d)", "kind": "numeric", "points": 2,
     "prompt": "$k = \\frac{|D_2 - D_1|}{D_1} \\times 100$. Using your answers from (a) and (c), "
               "determine the value of k for P(16, 12).",
     "answer": 23.97, "tolerance": 0.05, "unit": "%", "placeholder": "k =",
     "hints": ["Substitute your values of D₁ and D₂ into the formula.",
               "|36.49 − 48| ÷ 48 × 100 ≈ 23.97."]},
]

add({"pos": 13, "paper": 7, "label": "Question 7"}, "assess_parts", 20,
    "Geometry", "coordinate geometry and percentage difference",
    block("Question 7 — 20 marks",
          para("The warehouse uses two different robots to move items."),
          para("The working area of the warehouse has a length of 32 m and a width of 16 m, "
               "shown in the following diagram."),
          warehouse_figure(),
          para("All robots are designed to start at point A, move to pick up an item at point P, "
               "then move to drop off the item at point B."),
          para("Robot 1 can only move parallel to the walls of the warehouse, as shown in the "
               "diagram. Robot 1 is instructed to pick up an item at point P(16, 12)."),
          para("Robot 2 can move directly from one point to another, as shown in the diagram. "
               "Robot 2 moves on the path from A to P using the equation y = ¾x."),
          table(["Point", "x", "y"], [["A", "0", "0"], ["P", "16", "12"], ["B", "32", "16"]]),
          display("k = \\frac{|D_2 - D_1|}{D_1} \\times 100")),
    cfg_extra=parts_cfg(Q7_PARTS, marks_status="verified",
                        marks_note="Total 20 marks printed by the paper: (b) 4 and (d) 2 are "
                                   "printed; (a) 6 and (c) 8 are a subdivision of the remaining "
                                   "14 marks, since the paper's own split did not survive "
                                   "extraction."),
    explanation="D₁ = (16 + 12) + (16 + 4) = 48 m. PB has gradient (16 − 12)/(32 − 16) = 1/4 and "
                "equation y = ¼x + 8. PB = √272 ≈ 16.49 m, so D₂ = 20 + 16.49 = 36.49 m. "
                "k = |36.49 − 48|/48 × 100 ≈ 23.97.")


# ------------------------------------------------------------------- emission
def esc(value):
    """A JSON document, as the inside of a SQL single-quoted literal.

    The caller wraps this in '…' (or casts to jsonb). Embedded apostrophes are
    doubled so Postgres reads them back literally.
    """
    return json.dumps(value, ensure_ascii=False).replace("'", "''")


def txt(value):
    """A SQL single-quoted *text* literal, delimiters included.

    `esc` cannot be used for a text column: it emits a JSON string, whose double
    quotes Postgres would read as an identifier.
    """
    return "'" + str(value).replace("'", "''") + "'"


def qid(n):
    return QID_PREFIX + str(1000 + n).rjust(12, "0")



def question_insert(q):
    qid = QID_PREFIX + str(1000 + q["n"]).rjust(12, "0")
    return (
        "insert into questions (id, organization_id, type, prompt, prompt_doc, explanation,\n"
        "                       points, difficulty, topic, subtopic, tags, status, config,\n"
        "                       created_by, curriculum, curriculum_course, subject_id,\n"
        "                       review_status, creation_method, class_id, source_reference)\n"
        "values ('%s', '%s', %s, %s, '%s'::jsonb, %s,\n"
        "        %s, %s, %s, %s,\n"
        "        array['MYP 5', 'Mathematics', 'IB eAssessment', 'Standard', 'May 2025', '%s']::text[],\n"
        "        'published', '%s'::jsonb,\n"
        "        '%s', 'MYP', 'MYP 5 Mathematics', '%s',\n"
        "        'approved', 'manual', '%s', '%s')\n"
        "on conflict (id) do nothing;\n" % (
            qid, ORG_ID, txt(q["t"]), txt(q["p"]), esc(q["d"]), txt(q["e"]),
            q["m"], txt(q["df"]), txt(q["tp"]), txt(q["st"]), SOURCE,
            esc(q["cfg"]), CREATED_BY, SUBJECT_ID, CLASS_ID, SOURCE))


QUESTION_INSERTS = "\n".join(question_insert(q) for q in Q)


TOTAL = sum(q["m"] for q in Q)

EXAM_DESCRIPTION = (
    "IB MYP 5 Mathematics, Standard level, May 2025 session on-screen eAssessment. "
    "7 questions, %d marks as configured, 2 hours. Reproduced from the May 2025 Standard "
    "question paper; marks that the paper did not yield are provisional and adjustable by "
    "a teacher." % TOTAL
)

INSTRUCTIONS = (
    "Answer all questions in the spaces provided. The examination lasts 2 hours. "
    "A calculator is provided on screen; you may not use your own calculator, notes or "
    "formula sheet. Rough paper supplied by the school may be used, but only what you enter "
    "on screen is marked. Show your working where a question asks you to show or explain. "
    "The FORMULA BOOKLET button opens a formula reference for this examination at any time: "
    "it never stops, pauses or resets your timer and never changes or erases an answer."
)

QUIZ_SETTINGS = {
    "randomize_questions": False,
    "randomize_options": False,
    "assessment_kind": "ib_eassessment",
    "grade_level": "Grade 10",
    "curriculum": "MYP 5",
    "subject": "Mathematics",
    "duration_minutes": 120,
    "total_marks": TOTAL,
    "source": SOURCE,
    "level": "Standard",
    "session": "May 2025",
    "calculator": True,
    "calculator_policy": "on_screen_only",
}

EXAM_SETTINGS = {
    "proctoring": False,
    "require_screen_share": False,
    "randomize_questions": False,
    "randomize_options": False,
    "pass_mark_percent": 50,
    "results_published": True,
    "result_publication_mode": "immediate",
    "access_mode": "shared_link",
    "identity_fields": [],
    "eligible_class_ids": [CLASS_ID],
    "attempt_policy": "single_resume",
    "attempt_mode": "limited",
    "max_attempts": 1,
    "calculator": True,
    "calculator_policy": "on_screen_only",
    # This paper is reported as one examination, never as IB criteria.
    "criterion_reporting": False,
    "show_overall_result": True,
    "formula_reference": {
        "enabled": True,
        "label": "FORMULA BOOKLET",
        "title": "Formula reference for this examination",
        "kind": "examination_specific",
    },
    "source": SOURCE,
    "level": "Standard",
    "session": "May 2025",
}

HEADER = f"""-- {TITLE}
-- Generated by scripts/exam-import/build_myp5_standard_may2025.py — do not edit by hand.
--
-- Source: May 2025 IB MYP Mathematics Standard on-screen eAssessment
--         ("2025 Standard Math Question Paper", Brilliant Learning IB archive).
--
-- 7 questions · {TOTAL} marks as configured · 120 minutes.
--
-- MARKS: totals printed by the paper are used verbatim (Q1 6, Q3 6, Q5 8, Q6 15,
--        Q7 20). The totals for Q2 and Q4 did not survive extraction: they are
--        stored with marks_status = 'provisional' and a marks_note, and are
--        adjustable by a teacher. The examination total is the sum of the stored
--        marks.
--
-- MARKING: objectively determined parts are auto-marked (assess_parts).
--        "Show that", "hence" and graph-reading parts are open_ended and are
--        marked by a teacher — the paper's own command term decides, not
--        convenience.
--
-- Results are reported as ONE examination: settings.criterion_reporting is
-- false, so no IB criterion breakdown is shown to a student.
--
-- Re-running this file is a no-op: every statement is guarded by ON CONFLICT.

begin;

insert into quizzes (id, organization_id, title, description, status, settings, created_by)
values ('{QUIZ_ID}', '{ORG_ID}', '{TITLE}',
        {txt(EXAM_DESCRIPTION)}, 'published',
        '{esc(QUIZ_SETTINGS)}'::jsonb, '{CREATED_BY}')
on conflict (id) do nothing;

{QUESTION_INSERTS}
insert into quiz_questions (quiz_id, question_id, position, points)
select '{QUIZ_ID}',
       ('{QID_PREFIX}' || lpad((1000 + (x->>'n')::int)::text, 12, '0'))::uuid,
       (x->>'n')::integer, (x->>'m')::numeric
  from jsonb_array_elements('{esc([{"n": q["n"], "m": q["m"]} for q in Q])}'::jsonb) as x
on conflict (quiz_id, question_id) do nothing;

insert into exams (id, organization_id, quiz_id, title, description, instructions,
                   duration_minutes, status, settings, created_by, class_id)
values ('{EXAM_ID}', '{ORG_ID}', '{QUIZ_ID}', '{TITLE}',
        {txt(EXAM_DESCRIPTION)}, {txt(INSTRUCTIONS)},
        120, 'open',
        '{esc(EXAM_SETTINGS)}'::jsonb, '{CREATED_BY}', '{CLASS_ID}')
on conflict (id) do nothing;

commit;
"""

pathlib.Path("scripts/exam-import/myp5_standard_may2025_spec.json").write_text(
    json.dumps(Q, ensure_ascii=False, indent=1) + "\n")
pathlib.Path("supabase/migrations/0123_ib_myp5_standard_may2025_eassessment.sql").write_text(HEADER)
print("questions:", len(Q))
print("total marks:", TOTAL)
for q in Q:
    print("  %-18s %-13s %5s  %s" % (q["cfg"]["part_label"], q["t"], q["m"],
                                     q["cfg"].get("marks_status", "")))
