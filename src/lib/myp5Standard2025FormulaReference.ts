/**
 * Formula reference for the May 2025 IB MYP 5 Mathematics Standard eAssessment.
 *
 * WHAT THIS IS — and what it is not
 * ---------------------------------
 * This is an **examination-specific** formula reference. It was built by taking
 * the seven questions of this paper one at a time, listing the mathematics each
 * one actually requires, and writing the standard formulae, rules and identities
 * for that mathematics. Every formula here is a standard result; none was
 * invented, and each one is used by at least one question on the paper
 * (the `usedBy` field names those questions).
 *
 * It is **not** the official IB MYP Mathematics formula booklet. That
 * publication — "MYP Mathematics formula booklet", © International
 * Baccalaureate Organisation 2022, "For use during the course and in the
 * examinations", first examinations 2022, 8 pages — could not be obtained: every
 * copy reachable during development was a page image with no text layer. Nothing
 * here is a transcription of it, and nothing here should be presented as one.
 *
 * The UI labels it "Formula reference for this examination" for exactly that
 * reason.
 */

export interface FormulaEntry {
  id: string;
  /** The result, as LaTeX. */
  latex: string;
  /** What the symbols mean. */
  where?: string;
  /** A caution that stops the formula being misapplied. */
  note?: string;
  /** Which questions on this paper need it. */
  usedBy?: string[];
}

export interface FormulaSection {
  id: string;
  title: string;
  /** Why this section is here, in terms of the paper. */
  purpose: string;
  entries: FormulaEntry[];
}

export const FORMULA_REFERENCE: FormulaSection[] = [
  {
    id: "number",
    title: "Number — indices, surds and fractions",
    purpose: "Question 1 asks for the value of an index, for two indices after a fraction is " +
      "simplified, and for a surd written in its simplest form.",
    entries: [
      {
        id: "index-multiply",
        latex: "a^{m} \\times a^{n} = a^{m+n}",
        where: "same base a, any indices m and n",
        usedBy: ["Q1(b)"],
      },
      {
        id: "index-divide",
        latex: "\\frac{a^{m}}{a^{n}} = a^{m-n}",
        where: "same base a",
        usedBy: ["Q1(b)"],
      },
      {
        id: "index-power",
        latex: "(a^{m})^{n} = a^{mn}",
        usedBy: ["Q1(a)"],
      },
      {
        id: "index-zero-negative",
        latex: "a^{0} = 1 \\qquad a^{-n} = \\frac{1}{a^{n}}",
        where: "a \\neq 0",
        note: "A negative index means a reciprocal, not a negative number. This is how the " +
          "power of 3 in Question 1(b) comes out as −1.",
        usedBy: ["Q1(b)"],
      },
      {
        id: "index-fractional",
        latex: "a^{1/2} = \\sqrt{a} \\qquad a^{m/n} = \\left(\\sqrt[n]{a}\\right)^{m}",
        where: "a \\ge 0 for even roots",
        usedBy: ["Q1"],
      },
      {
        id: "fraction-multiply",
        latex: "\\frac{a}{b} \\times \\frac{c}{d} = \\frac{ac}{bd}",
        note: "Cancel before multiplying wherever possible.",
        usedBy: ["Q1(b)"],
      },
      {
        id: "surd-multiply",
        latex: "\\sqrt{ab} = \\sqrt{a}\\,\\sqrt{b} \\qquad \\sqrt{\\frac{a}{b}} = \\frac{\\sqrt{a}}{\\sqrt{b}}",
        where: "a \\ge 0, b > 0",
        usedBy: ["Q1(c)"],
      },
      {
        id: "surd-simplest",
        latex: "\\sqrt{n} = \\sqrt{s^{2}k} = s\\sqrt{k}",
        where: "s² is the largest square factor of n",
        note: "A surd is in its simplest form when the number under the root has no square " +
          "factor left. √45 = √(9 × 5) = 3√5.",
        usedBy: ["Q1(c)"],
      },
      {
        id: "surd-collect",
        latex: "a\\sqrt{k} \\pm b\\sqrt{k} = (a \\pm b)\\sqrt{k}",
        note: "Only like surds can be added or subtracted. 3√5 − 2√5 = √5.",
        usedBy: ["Q1(c)"],
      },
    ],
  },

  {
    id: "algebra",
    title: "Algebra — equations, formulae and change",
    purpose: "Question 2 is a pair of simultaneous equations. Question 5 sets up a quadratic " +
      "from an area and then enlarges the shape. Question 6 substitutes into a formula and " +
      "asks how a percentage change in one variable changes the result.",
    entries: [
      {
        id: "linear-solve",
        latex: "ax + b = c \\;\\Rightarrow\\; x = \\frac{c-b}{a}",
        usedBy: ["Q2", "Q5"],
      },
      {
        id: "simultaneous-elimination",
        latex: "\\begin{aligned} a_1x + b_1y &= c_1 \\\\ a_2x + b_2y &= c_2 \\end{aligned}",
        where: "multiply each equation so that one variable has matching coefficients, then " +
          "add or subtract to eliminate it",
        note: "Then substitute the value found back into either original equation to get the " +
          "other variable.",
        usedBy: ["Q2"],
      },
      {
        id: "quadratic-root",
        latex: "x^{2} = k \\;\\Rightarrow\\; x = \\pm\\sqrt{k}",
        note: "A length rejects the negative root. In Question 5, 5x² = 140 gives x² = 28, so " +
          "x = √28 = 2√7.",
        usedBy: ["Q5(a)"],
      },
      {
        id: "quadratic-formula",
        latex: "x = \\frac{-b \\pm \\sqrt{b^{2}-4ac}}{2a}",
        where: "for ax² + bx + c = 0, a \\neq 0",
        note: "The discriminant b² − 4ac tells you how many real roots there are: positive " +
          "(two), zero (one repeated), negative (none).",
        usedBy: ["Q5(a)"],
      },
      {
        id: "change-subject",
        latex: "y = mx + c \\;\\Rightarrow\\; x = \\frac{y-c}{m}",
        where: "m \\neq 0",
        usedBy: ["Q6"],
      },
      {
        id: "percentage-of",
        latex: "\\text{part} = \\frac{\\text{percent}}{100} \\times \\text{whole}",
        usedBy: ["Q4(a)", "Q5"],
      },
      {
        id: "percentage-change",
        latex: "\\%\\text{ change} = \\frac{\\text{new} - \\text{original}}{\\text{original}} \\times 100",
        note: "A decrease gives a negative result.",
        usedBy: ["Q6(f)", "Q7(d)"],
      },
      {
        id: "multiplier",
        latex: "\\text{new} = \\text{original} \\times (1 + r)",
        where: "r is the change written as a decimal (0.10 for 10 %)",
        note: "Applying it twice compounds: two successive increases of 10 % give 1.1 × 1.1 = " +
          "1.21, not 1.20.",
        usedBy: ["Q6(f)"],
      },
      {
        id: "proportional-squares",
        latex: "E \\propto d^{2} \\;\\Rightarrow\\; \\frac{E_2}{E_1} = \\left(\\frac{d_2}{d_1}\\right)^{2}",
        note: "This is Question 6(f): d is multiplied by 1.1, so E is multiplied by 1.1² = " +
          "1.21, a 21 % increase.",
        usedBy: ["Q6(f)"],
      },
    ],
  },

  {
    id: "geometry",
    title: "Geometry and mensuration",
    purpose: "Question 5 is a rectangle and its enlargement. Question 6 uses the height of an " +
      "isosceles triangle and the area of a sector.",
    entries: [
      {
        id: "pythagoras",
        latex: "a^{2} + b^{2} = c^{2}",
        where: "c is the hypotenuse of a right-angled triangle",
        note: "Halving an isosceles triangle along its height gives two right-angled " +
          "triangles — that is how the height in Question 6(a) is found.",
        usedBy: ["Q6(a)"],
      },
      {
        id: "area-rectangle",
        latex: "A = lw",
        where: "l is length, w is width",
        usedBy: ["Q5"],
      },
      {
        id: "area-triangle",
        latex: "A = \\frac{1}{2}bh",
        where: "b is the base, h is the perpendicular height",
        note: "The height must be perpendicular to the base, not a sloping side.",
        usedBy: ["Q6(b)"],
      },
      {
        id: "area-circle",
        latex: "A = \\pi r^{2} \\qquad C = 2\\pi r",
        where: "r is the radius, C the circumference",
        usedBy: ["Q6(c)"],
      },
      {
        id: "area-sector",
        latex: "A = \\frac{\\theta}{360^{ \\circ}} \\times \\pi r^{2}",
        where: "θ is the angle at the centre, in degrees",
        note: "Equivalently A = ½r²θ with θ in radians. This is Question 6(c): with r = " +
          "3400 m and θ ≈ 40°, A = (40/360) × π × 3400² ≈ 4 040 000 m².",
        usedBy: ["Q6(c)"],
      },
      {
        id: "enlargement",
        latex: "A_2 = k^{2} A_1 \\qquad L_2 = k L_1",
        where: "k is the linear scale factor",
        note: "Lengths scale by k but areas scale by k². In Question 5(c) the area is " +
          "multiplied by 1260/140 = 9, so k = √9 = 3.",
        usedBy: ["Q5(c)"],
      },
    ],
  },

  {
    id: "coordinate",
    title: "Coordinate geometry",
    purpose: "Question 7 places a warehouse on a grid and asks for two route lengths, the " +
      "equation of a straight-line path, and a percentage difference.",
    entries: [
      {
        id: "distance",
        latex: "d = \\sqrt{(x_2-x_1)^{2} + (y_2-y_1)^{2}}",
        where: "between (x₁, y₁) and (x₂, y₂)",
        note: "This is Pythagoras on the horizontal and vertical differences. It is how PB is " +
          "found in Question 7(c).",
        usedBy: ["Q7(c)"],
      },
      {
        id: "gradient",
        latex: "m = \\frac{y_2-y_1}{x_2-x_1}",
        where: "the vertical change divided by the horizontal change",
        note: "Positive slopes upwards left to right; negative slopes downwards. A vertical " +
          "line has undefined gradient.",
        usedBy: ["Q7(b)"],
      },
      {
        id: "line-equation",
        latex: "y = mx + c",
        where: "m is the gradient, c the y-intercept",
        usedBy: ["Q7(b)"],
      },
      {
        id: "line-point",
        latex: "y - y_1 = m(x - x_1)",
        where: "through (x₁, y₁) with gradient m",
        note: "Use this when you know a point and the gradient, as in Question 7(b).",
        usedBy: ["Q7(b)"],
      },
      {
        id: "percentage-difference",
        latex: "k = \\frac{|D_2 - D_1|}{D_1} \\times 100",
        where: "the absolute difference as a percentage of the reference value D₁",
        note: "The modulus means the sign of the difference is ignored, so k is never negative.",
        usedBy: ["Q7(d)"],
      },
    ],
  },

  {
    id: "statistics",
    title: "Statistics and probability",
    purpose: "Question 3 builds a sample space and asks for two probabilities and a piece of " +
      "terminology. Question 4 reads quartiles from a cumulative frequency graph and compares " +
      "two distributions.",
    entries: [
      {
        id: "probability-basic",
        latex: "P(A) = \\frac{\\text{number of favourable outcomes}}{\\text{number of possible outcomes}}",
        note: "This assumes every outcome is equally likely, which holds for the 4 × 4 " +
          "sample space in Question 3.",
        usedBy: ["Q3(b)", "Q3(c)"],
      },
      {
        id: "probability-complement",
        latex: "P(A') = 1 - P(A)",
        usedBy: ["Q4(a)"],
      },
      {
        id: "probability-union",
        latex: "P(A \\cup B) = P(A) + P(B) - P(A \\cap B)",
        note: "For mutually exclusive events the last term is 0, so the probabilities simply " +
          "add.",
        usedBy: ["Q3(c)"],
      },
      {
        id: "mutually-exclusive",
        latex: "P(A \\cap B) = 0",
        where: "A and B are mutually exclusive (disjoint)",
        note: "They cannot happen together. This is the term Question 3(d) asks for.",
        usedBy: ["Q3(d)"],
      },
      {
        id: "probability-intersection",
        latex: "P(A \\cap B) = P(A) \\times P(B)",
        where: "only when A and B are independent",
        note: "With replacement, as in Question 3, the two selections are independent.",
        usedBy: ["Q3"],
      },
      {
        id: "quartiles",
        latex: "Q_1 : \\frac{n}{4} \\qquad \\text{median} : \\frac{n}{2} \\qquad Q_3 : \\frac{3n}{4}",
        where: "the cumulative frequency to read across at, for n data values",
        note: "Question 4 has 800 cats, so read across at 200, 400 and 600.",
        usedBy: ["Q4(b)"],
      },
      {
        id: "iqr",
        latex: "\\text{IQR} = Q_3 - Q_1",
        note: "The range of the middle half of the data. It measures spread, not average.",
        usedBy: ["Q4(b)", "Q4(c)"],
      },
      {
        id: "median-mean-mode",
        latex: "\\bar{x} = \\frac{\\sum x}{n}",
        where: "the mean of n values; the median is the middle value once the data are ordered",
        note: "A larger median means larger values overall; a larger IQR or range means more " +
          "spread out. That contrast is what Question 4(c) asks about.",
        usedBy: ["Q4(c)"],
      },
    ],
  },
];

/** Every question of the paper, in order, for the "used by" index. */
export const REFERENCE_QUESTIONS = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"] as const;

export const REFERENCE_DISCLAIMER =
  "A formula reference written for this examination, covering the mathematics its questions " +
  "actually require. It is not the official IB MYP Mathematics formula booklet.";
