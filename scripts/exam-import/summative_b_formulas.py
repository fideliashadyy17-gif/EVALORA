"""Exam-specific formula sheets for the four Summative B Mathematics papers.

The sheet is stored on the examination itself (``exams.settings.formula_sheet``)
so the candidate page never chooses a formula list by grade or title.  Every
entry is a general statement used by the paper it belongs to; no entry contains
an answer, a worked solution or a hint that points at one particular question.

Run ``python3 scripts/exam-import/build_summative_b_corrections.py`` to embed
these sheets in the forward migration.
"""

MYP2 = {
    "version": 1,
    "title": "Formulas for this paper",
    "groups": [
        {
            "title": "Ratio and proportion",
            "items": [
                {"latex": r"a:b = ka:kb", "note": "Equivalent ratios: multiply or divide both parts by the same number."},
                {"latex": r"\text{simplest form}", "note": "Divide both parts by their highest common factor."},
                {"latex": r"y = kx", "note": "Direct proportion; k is the constant of proportionality."},
                {"latex": r"k = \dfrac{y}{x}", "note": "The constant is the value of y divided by the value of x."},
                {"latex": r"\text{scale } 1:n", "note": "1 unit on the drawing represents n of the same units in real life."},
            ],
        },
        {
            "title": "Sets",
            "items": [
                {"latex": r"A \subset B", "note": "Every element of A is also an element of B."},
                {"latex": r"A \cap B", "note": "Elements in both A and B."},
                {"latex": r"A \cup B", "note": "Elements in A or B (or both)."},
                {"latex": r"n(A \cup B) = n(A) + n(B) - n(A \cap B)", "note": "Inclusion-exclusion for two sets."},
                {"latex": r"n(A') = n(\xi) - n(A)", "note": "The complement contains everything outside A."},
            ],
        },
        {
            "title": "Probability",
            "items": [
                {"latex": r"P(E) = \dfrac{n(E)}{n(S)}", "note": "Equally likely outcomes: favourable outcomes over all outcomes."},
                {"latex": r"0 \le P(E) \le 1", "note": "A probability cannot be negative or greater than 1."},
                {"latex": r"P(\text{not } E) = 1 - P(E)", "note": "An event and its complement add to 1."},
                {"latex": r"\text{relative frequency} = \dfrac{\text{observed successes}}{\text{trials}}", "note": "An estimate of probability from data."},
                {"latex": r"\text{expected number} = n \times P(E)", "note": "Number of trials multiplied by the probability."},
            ],
        },
    ],
}

MYP3 = {
    "version": 1,
    "title": "Formulas for this paper",
    "groups": [
        {
            "title": "Indices and standard form",
            "items": [
                {"latex": r"a^m \times a^n = a^{m+n}", "note": "Add the indices when multiplying powers of the same base."},
                {"latex": r"a^m \div a^n = a^{m-n}", "note": "Subtract the indices when dividing."},
                {"latex": r"(a^m)^n = a^{mn}", "note": "Multiply the indices for a power of a power."},
                {"latex": r"a^0 = 1 \quad (a \ne 0)", "note": "Any non-zero number to the power zero is 1."},
                {"latex": r"a^{-n} = \dfrac{1}{a^n}", "note": "A negative index means a reciprocal."},
                {"latex": r"a \times 10^n, \quad 1 \le a < 10", "note": "Standard form, with n an integer."},
            ],
        },
        {
            "title": "Surds and rational numbers",
            "items": [
                {"latex": r"\sqrt{ab} = \sqrt{a}\,\sqrt{b}", "note": "A product inside a root can be split."},
                {"latex": r"\sqrt{\dfrac{a}{b}} = \dfrac{\sqrt{a}}{\sqrt{b}}", "note": "A quotient inside a root can be split."},
                {"latex": r"(\sqrt{a})^2 = a", "note": "Squaring a square root returns the number."},
                {"latex": r"\text{rational} = \dfrac{p}{q}", "note": "p and q are integers and q is not zero."},
            ],
        },
        {
            "title": "Pythagoras and trigonometry",
            "items": [
                {"latex": r"a^2 + b^2 = c^2", "note": "Right-angled triangle; c is the hypotenuse."},
                {"latex": r"\sin\theta = \dfrac{\text{opposite}}{\text{hypotenuse}}", "note": "Sine ratio."},
                {"latex": r"\cos\theta = \dfrac{\text{adjacent}}{\text{hypotenuse}}", "note": "Cosine ratio."},
                {"latex": r"\tan\theta = \dfrac{\text{opposite}}{\text{adjacent}}", "note": "Tangent ratio."},
                {"latex": r"A = \dfrac{1}{2}bh", "note": "Area of a triangle: base times perpendicular height."},
            ],
        },
        {
            "title": "Similarity and congruence",
            "items": [
                {"latex": r"\dfrac{\text{image length}}{\text{original length}} = k", "note": "The scale factor of similar figures."},
                {"latex": r"\text{area factor} = k^2", "note": "Areas of similar figures scale by the square of k."},
                {"latex": r"\text{SSS, SAS, ASA, AAS, RHS}", "note": "Standard congruence tests for triangles."},
            ],
        },
    ],
}

MYP4 = {
    "version": 1,
    "title": "Formulas for this paper",
    "groups": [
        {
            "title": "Averages",
            "items": [
                {"latex": r"\bar{x} = \dfrac{\Sigma x}{n}", "note": "Mean of n individual values."},
                {"latex": r"\bar{x} = \dfrac{\Sigma fx}{\Sigma f}", "note": "Estimated mean of a frequency table; x is a value or class midpoint."},
                {"latex": r"\text{range} = \text{largest} - \text{smallest}", "note": "A simple measure of spread."},
            ],
        },
        {
            "title": "Grouped data",
            "items": [
                {"latex": r"\text{midpoint} = \dfrac{L+U}{2}", "note": "L and U are the class boundaries (not the printed limits when the data are continuous)."},
                {"latex": r"\text{class width} = U - L", "note": "The width between the lower and upper class boundaries."},
                {"latex": r"\text{frequency density} = \dfrac{\text{frequency}}{\text{class width}}", "note": "Used for a histogram with unequal class widths."},
            ],
        },
        {
            "title": "Median, quartiles and spread",
            "items": [
                {"latex": r"\text{median position} = \dfrac{n+1}{2}", "note": "Position in the ordered list."},
                {"latex": r"IQR = Q_3 - Q_1", "note": "The interquartile range covers the middle 50 %."},
                {"latex": r"\text{lower fence} = Q_1 - 1.5\,IQR", "note": "A value below this fence is an outlier."},
                {"latex": r"\text{upper fence} = Q_3 + 1.5\,IQR", "note": "A value above this fence is an outlier."},
                {"latex": r"\sigma^2 = \dfrac{\Sigma (x-\mu)^2}{N}", "note": "Population variance."},
                {"latex": r"\sigma = \sqrt{\dfrac{\Sigma (x-\mu)^2}{N}}", "note": "Population standard deviation; μ is the population mean."},
            ],
        },
        {
            "title": "Cumulative frequency and coding",
            "items": [
                {"latex": r"\text{median} = \text{value at cumulative frequency } \dfrac{N}{2}", "note": "Read from a cumulative frequency curve or table."},
                {"latex": r"Q_1 \text{ at } \dfrac{N}{4}, \quad Q_3 \text{ at } \dfrac{3N}{4}", "note": "Quartile positions on the cumulative axis."},
                {"latex": r"y = ax + b", "note": "A linear coding of every data value."},
                {"latex": r"\bar{y} = a\bar{x} + b", "note": "The mean follows the same coding."},
                {"latex": r"\sigma_y = |a|\,\sigma_x", "note": "Adding b does not change the spread; multiplying by a scales it by |a|."},
            ],
        },
    ],
}

MYP5 = {
    "version": 1,
    "title": "Formulas for this paper",
    "groups": [
        {
            "title": "Arithmetic sequences and series",
            "items": [
                {"latex": r"u_n = u_1 + (n-1)d", "note": "nth term; d is the common difference."},
                {"latex": r"S_n = \dfrac{n}{2}(u_1 + u_n)", "note": "Sum of the first n terms."},
                {"latex": r"S_n = \dfrac{n}{2}\bigl(2u_1 + (n-1)d\bigr)", "note": "The same sum when the last term is not known."},
            ],
        },
        {
            "title": "Geometric sequences and series",
            "items": [
                {"latex": r"u_n = u_1 r^{\,n-1}", "note": "nth term; r is the common ratio."},
                {"latex": r"S_n = \dfrac{u_1(r^n - 1)}{r - 1} \quad (r \ne 1)", "note": "Sum of the first n terms."},
                {"latex": r"S_n = \dfrac{u_1(1 - r^n)}{1 - r} \quad (r \ne 1)", "note": "The same sum written with 1 − r."},
            ],
        },
        {
            "title": "Quadratic sequences",
            "items": [
                {"latex": r"u_n = an^2 + bn + c", "note": "General quadratic term."},
                {"latex": r"\text{second difference} = 2a", "note": "For a quadratic sequence the second differences are constant."},
            ],
        },
        {
            "title": "Recursive rules and partial sums",
            "items": [
                {"latex": r"u_{n+1} = f(u_n)", "note": "A recursive rule needs its initial term to define a unique sequence."},
                {"latex": r"u_n = S_n - S_{n-1} \quad (n \ge 2)", "note": "A term is the difference of consecutive partial sums."},
                {"latex": r"\sum_{k=1}^{n} u_k", "note": "Sigma notation for u₁ + u₂ + … + u_n."},
                {"latex": r"V_n = V_0(1 \pm r)^n", "note": "Repeated percentage growth (+) or decay (−)."},
            ],
        },
    ],
}

SHEETS = {
    "c0700000-0000-4000-8000-000000000002": MYP2,
    "c0800000-0000-4000-8000-000000000002": MYP3,
    "c0900000-0000-4000-8000-000000000002": MYP4,
    "c0a00000-0000-4000-8000-000000000002": MYP5,
}
