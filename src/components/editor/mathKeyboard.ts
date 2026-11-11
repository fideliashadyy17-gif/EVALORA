/**
 * Mathematical keyboard definitions.
 * `d` = LaTeX rendered on the button face (so users see real mathematics,
 * never words like "fraction"). `i` = template inserted at the cursor;
 * #0, #1… are MathLive placeholders the cursor visits in order.
 */
export interface MathKey {
  d: string;
  i: string;
  t: string;
}

export interface MathCategory {
  id: string;
  label: string;
  keys: MathKey[];
}

const k = (d: string, i: string, t: string): MathKey => ({ d, i, t });

export const MATH_CATEGORIES: MathCategory[] = [
  {
    id: "basic",
    label: "Basic",
    keys: [
      k("+", "+", "Plus"), k("-", "-", "Minus"), k("\\times", "\\times ", "Multiply"),
      k("\\div", "\\div ", "Divide"), k("=", "=", "Equals"), k("\\pm", "\\pm ", "Plus–minus"),
      k("\\mp", "\\mp ", "Minus–plus"), k("\\cdot", "\\cdot ", "Dot product"),
      k("\\%", "\\%", "Percent"), k("\\infty", "\\infty ", "Infinity"),
      k("(\\;)", "\\left(#0\\right)", "Parentheses"), k("[\\;]", "\\left[#0\\right]", "Brackets"),
      k("\\{\\;\\}", "\\left\\{#0\\right\\}", "Braces"), k("|\\;|", "\\left|#0\\right|", "Absolute value"),
    ],
  },
  {
    id: "fractions-roots",
    label: "Fractions & Roots",
    keys: [
      k("\\frac{\\square}{\\square}", "\\frac{#0}{#1}", "Fraction"),
      k("\\dfrac{\\square}{\\square}", "\\dfrac{#0}{#1}", "Large fraction"),
      k("\\sqrt{\\square}", "\\sqrt{#0}", "Square root"),
      k("\\sqrt[3]{\\square}", "\\sqrt[3]{#0}", "Cube root"),
      k("\\sqrt[n]{\\square}", "\\sqrt[#0]{#1}", "n-th root"),
      k("\\frac{1}{\\square}", "\\frac{1}{#0}", "Reciprocal"),
    ],
  },
  {
    id: "powers",
    label: "Powers & Indices",
    keys: [
      k("x^{\\square}", "^{#0}", "Superscript / power"),
      k("x^2", "^2", "Squared"), k("x^3", "^3", "Cubed"),
      k("x_{\\square}", "_{#0}", "Subscript"),
      k("x_{1}", "_1", "Subscript 1"), k("x_{2}", "_2", "Subscript 2"),
      k("x_{n}", "_n", "Subscript n"), k("x_{n}^{\\square}", "_{#0}^{#1}", "Sub- and superscript"),
      k("e^{\\square}", "e^{#0}", "Exponential"), k("10^{\\square}", "10^{#0}", "Power of ten"),
    ],
  },
  {
    id: "relations",
    label: "Equations & Inequalities",
    keys: [
      k("\\ne", "\\ne ", "Not equal"), k("<", "<", "Less than"), k(">", ">", "Greater than"),
      k("\\le", "\\le ", "Less than or equal"), k("\\ge", "\\ge ", "Greater than or equal"),
      k("\\approx", "\\approx ", "Approximately"), k("\\equiv", "\\equiv ", "Identical to"),
      k("\\propto", "\\propto ", "Proportional to"), k("\\sim", "\\sim ", "Similar to"),
      k("\\Rightarrow", "\\Rightarrow ", "Implies"), k("\\Leftrightarrow", "\\Leftrightarrow ", "If and only if"),
      k("\\rightarrow", "\\rightarrow ", "Arrow"), k("\\therefore", "\\therefore ", "Therefore"),
      k("\\because", "\\because ", "Because"),
    ],
  },
  {
    id: "algebra",
    label: "Algebra",
    keys: [
      k("x", "x", "x"), k("y", "y", "y"), k("n", "n", "n"), k("a", "a", "a"), k("b", "b", "b"),
      k("\\pm\\sqrt{\\square}", "\\frac{-#0\\pm\\sqrt{#1}}{#2}", "Quadratic-formula shape"),
      k("\\binom{n}{k}", "\\binom{#0}{#1}", "Binomial coefficient"),
      k("n!", "!", "Factorial"),
      k("\\lfloor x\\rfloor", "\\lfloor #0\\rfloor ", "Floor"),
      k("\\lceil x\\rceil", "\\lceil #0\\rceil ", "Ceiling"),
      k("\\log_{\\square}\\square", "\\log_{#0}\\left(#1\\right)", "Logarithm"),
      k("\\ln\\square", "\\ln\\left(#0\\right)", "Natural logarithm"),
      k("\\log\\square", "\\log\\left(#0\\right)", "Log base 10"),
    ],
  },
  {
    id: "geometry",
    label: "Geometry",
    keys: [
      k("\\angle", "\\angle ", "Angle"), k("^\\circ", "^\\circ", "Degrees"),
      k("\\parallel", "\\parallel ", "Parallel"), k("\\perp", "\\perp ", "Perpendicular"),
      k("\\triangle", "\\triangle ", "Triangle"), k("\\square", "\\square ", "Square"),
      k("\\cong", "\\cong ", "Congruent"), k("\\sim", "\\sim ", "Similar"),
      k("\\overline{AB}", "\\overline{#0}", "Segment (overline)"),
      k("\\widehat{AB}", "\\widehat{#0}", "Arc"),
      k("\\overrightarrow{AB}", "\\overrightarrow{#0}", "Directed segment"),
      k("\\pi r^2", "\\pi r^2", "Circle area"), k("2\\pi r", "2\\pi r", "Circumference"),
    ],
  },
  {
    id: "trigonometry",
    label: "Trigonometry",
    keys: [
      k("\\sin\\square", "\\sin\\left(#0\\right)", "Sine"),
      k("\\cos\\square", "\\cos\\left(#0\\right)", "Cosine"),
      k("\\tan\\square", "\\tan\\left(#0\\right)", "Tangent"),
      k("\\sin^{-1}\\square", "\\sin^{-1}\\left(#0\\right)", "Inverse sine"),
      k("\\cos^{-1}\\square", "\\cos^{-1}\\left(#0\\right)", "Inverse cosine"),
      k("\\tan^{-1}\\square", "\\tan^{-1}\\left(#0\\right)", "Inverse tangent"),
      k("\\csc\\square", "\\csc\\left(#0\\right)", "Cosecant"),
      k("\\sec\\square", "\\sec\\left(#0\\right)", "Secant"),
      k("\\cot\\square", "\\cot\\left(#0\\right)", "Cotangent"),
      k("\\sinh\\square", "\\sinh\\left(#0\\right)", "Hyperbolic sine"),
      k("\\cosh\\square", "\\cosh\\left(#0\\right)", "Hyperbolic cosine"),
    ],
  },
  {
    id: "functions",
    label: "Functions",
    keys: [
      k("f(x)", "f\\left(#0\\right)", "Function f"),
      k("g(x)", "g\\left(#0\\right)", "Function g"),
      k("f^{-1}(x)", "f^{-1}\\left(#0\\right)", "Inverse function"),
      k("(f\\circ g)(x)", "\\left(f\\circ g\\right)\\left(#0\\right)", "Composition"),
      k("f:\\mathbb{R}\\to\\mathbb{R}", "f:\\mathbb{R}\\to\\mathbb{R}", "Function mapping"),
      k("\\mapsto", "\\mapsto ", "Maps to"),
      k("\\min", "\\min ", "Minimum"), k("\\max", "\\max ", "Maximum"),
      k("\\gcd", "\\gcd\\left(#0\\right)", "Greatest common divisor"),
      k("\\operatorname{lcm}", "\\operatorname{lcm}\\left(#0\\right)", "Least common multiple"),
    ],
  },
  {
    id: "limits",
    label: "Limits",
    keys: [
      k("\\lim_{x\\to a}", "\\lim_{x\\to #0}#1", "Limit"),
      k("\\lim_{x\\to\\infty}", "\\lim_{x\\to\\infty}#0", "Limit at infinity"),
      k("\\lim_{x\\to 0}", "\\lim_{x\\to 0}#0", "Limit at zero"),
      k("\\lim_{h\\to 0}", "\\lim_{h\\to 0}#0", "Limit h → 0"),
      k("\\lim_{n\\to\\infty}", "\\lim_{n\\to\\infty}#0", "Sequence limit"),
      k("\\to", "\\to ", "Tends to"),
    ],
  },
  {
    id: "derivatives",
    label: "Derivatives",
    keys: [
      k("\\frac{dy}{dx}", "\\frac{d#0}{d#1}", "Derivative"),
      k("\\frac{d^2y}{dx^2}", "\\frac{d^2#0}{d#1^2}", "Second derivative"),
      k("\\frac{\\partial f}{\\partial x}", "\\frac{\\partial #0}{\\partial #1}", "Partial derivative"),
      k("f'(x)", "f'\\left(#0\\right)", "f prime"),
      k("f''(x)", "f''\\left(#0\\right)", "f double prime"),
      k("\\dot{x}", "\\dot{#0}", "Dot (time derivative)"),
      k("\\ddot{x}", "\\ddot{#0}", "Double dot"),
    ],
  },
  {
    id: "integrals",
    label: "Integrals",
    keys: [
      k("\\int_{a}^{b}", "\\int_{#0}^{#1}#2\\,dx", "Definite integral"),
      k("\\int", "\\int #0\\,dx", "Indefinite integral"),
      k("\\iint", "\\iint #0\\,dA", "Double integral"),
      k("\\iiint", "\\iiint #0\\,dV", "Triple integral"),
      k("\\oint", "\\oint #0\\,ds", "Contour integral"),
      k("\\left[#1\\right]_{a}^{b}", "\\left[#0\\right]_{#1}^{#2}", "Evaluation bar"),
    ],
  },
  {
    id: "sums-products",
    label: "Sums & Products",
    keys: [
      k("\\sum_{i=1}^{n}", "\\sum_{#0}^{#1}#2", "Summation"),
      k("\\prod_{i=1}^{n}", "\\prod_{#0}^{#1}#2", "Product"),
      k("\\sum_{i=1}^{\\infty}", "\\sum_{#0}^{\\infty}#1", "Infinite series"),
      k("\\bigcup_{i=1}^{n}", "\\bigcup_{#0}^{#1}#2", "Big union"),
      k("\\bigcap_{i=1}^{n}", "\\bigcap_{#0}^{#1}#2", "Big intersection"),
    ],
  },
  {
    id: "matrices",
    label: "Matrices",
    keys: [
      k("\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}", "\\begin{pmatrix}#0&#1\\\\\\\\#2&#3\\end{pmatrix}", "2×2 matrix (parentheses)"),
      k("\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}", "\\begin{bmatrix}#0&#1\\\\\\\\#2&#3\\end{bmatrix}", "2×2 matrix (brackets)"),
      k("\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}", "\\begin{vmatrix}#0&#1\\\\\\\\#2&#3\\end{vmatrix}", "2×2 determinant"),
      k("\\begin{pmatrix}a\\\\b\\\\c\\end{pmatrix}", "\\begin{pmatrix}#0\\\\\\\\#1\\\\\\\\#2\\end{pmatrix}", "3×1 column vector"),
      k("\\det(A)", "\\det\\left(#0\\right)", "Determinant"),
      k("A^{-1}", "A^{-1}", "Inverse matrix"),
      k("A^{T}", "A^{T}", "Transpose"),
    ],
  },
  {
    id: "greek",
    label: "Greek Letters",
    keys: [
      k("\\alpha", "\\alpha ", "alpha"), k("\\beta", "\\beta ", "beta"),
      k("\\gamma", "\\gamma ", "gamma"), k("\\delta", "\\delta ", "delta"),
      k("\\epsilon", "\\epsilon ", "epsilon"), k("\\zeta", "\\zeta ", "zeta"),
      k("\\eta", "\\eta ", "eta"), k("\\theta", "\\theta ", "theta"),
      k("\\lambda", "\\lambda ", "lambda"), k("\\mu", "\\mu ", "mu"),
      k("\\nu", "\\nu ", "nu"), k("\\pi", "\\pi ", "pi"), k("\\rho", "\\rho ", "rho"),
      k("\\sigma", "\\sigma ", "sigma"), k("\\tau", "\\tau ", "tau"),
      k("\\phi", "\\phi ", "phi"), k("\\chi", "\\chi ", "chi"),
      k("\\psi", "\\psi ", "psi"), k("\\omega", "\\omega ", "omega"),
      k("\\Gamma", "\\Gamma ", "Gamma"), k("\\Delta", "\\Delta ", "Delta"),
      k("\\Theta", "\\Theta ", "Theta"), k("\\Lambda", "\\Lambda ", "Lambda"),
      k("\\Pi", "\\Pi ", "Pi"), k("\\Sigma", "\\Sigma ", "Sigma"),
      k("\\Phi", "\\Phi ", "Phi"), k("\\Omega", "\\Omega ", "Omega"),
    ],
  },
  {
    id: "sets-logic",
    label: "Sets & Logic",
    keys: [
      k("\\in", "\\in ", "Belongs to"), k("\\notin", "\\notin ", "Does not belong"),
      k("\\subset", "\\subset ", "Subset"), k("\\subseteq", "\\subseteq ", "Subset or equal"),
      k("\\supset", "\\supset ", "Superset"), k("\\cup", "\\cup ", "Union"),
      k("\\cap", "\\cap ", "Intersection"), k("\\setminus", "\\setminus ", "Set difference"),
      k("\\emptyset", "\\emptyset ", "Empty set"), k("\\forall", "\\forall ", "For all"),
      k("\\exists", "\\exists ", "There exists"), k("\\land", "\\land ", "And"),
      k("\\lor", "\\lor ", "Or"), k("\\neg", "\\neg ", "Not"),
      k("\\mathbb{R}", "\\mathbb{R}", "Real numbers"),
      k("\\mathbb{Z}", "\\mathbb{Z}", "Integers"),
      k("\\mathbb{N}", "\\mathbb{N}", "Natural numbers"),
      k("\\mathbb{Q}", "\\mathbb{Q}", "Rational numbers"),
      k("\\mathbb{C}", "\\mathbb{C}", "Complex numbers"),
    ],
  },
  {
    id: "statistics",
    label: "Statistics & Probability",
    keys: [
      k("\\bar{x}", "\\bar{#0}", "Mean (x-bar)"),
      k("\\hat{x}", "\\hat{#0}", "Estimate (hat)"),
      k("\\tilde{x}", "\\tilde{#0}", "Tilde"),
      k("\\sigma^2", "\\sigma^2", "Variance"),
      k("P(A)", "P\\left(#0\\right)", "Probability"),
      k("P(A\\mid B)", "P\\left(#0\\mid #1\\right)", "Conditional probability"),
      k("{}^{n}C_{r}", "{}^{#0}C_{#1}", "Combination nCr"),
      k("{}^{n}P_{r}", "{}^{#0}P_{#1}", "Permutation nPr"),
      k("E(X)", "E\\left(#0\\right)", "Expected value"),
      k("\\operatorname{Var}(X)", "\\operatorname{Var}\\left(#0\\right)", "Variance"),
      k("X\\sim N(\\mu,\\sigma^2)", "X\\sim N\\left(#0,#1\\right)", "Normal distribution"),
      k("\\chi^2", "\\chi^2", "Chi-squared"),
    ],
  },
  {
    id: "vectors",
    label: "Vectors",
    keys: [
      k("\\vec{a}", "\\vec{#0}", "Vector arrow"),
      k("\\mathbf{a}", "\\mathbf{#0}", "Bold vector"),
      k("\\hat{i}", "\\hat{i}", "Unit vector i"), k("\\hat{j}", "\\hat{j}", "Unit vector j"),
      k("\\hat{k}", "\\hat{k}", "Unit vector k"),
      k("\\mathbf{a}\\cdot\\mathbf{b}", "\\mathbf{#0}\\cdot\\mathbf{#1}", "Dot product"),
      k("\\mathbf{a}\\times\\mathbf{b}", "\\mathbf{#0}\\times\\mathbf{#1}", "Cross product"),
      k("|\\mathbf{a}|", "\\left|\\mathbf{#0}\\right|", "Magnitude"),
      k("\\nabla", "\\nabla ", "Nabla (gradient)"),
    ],
  },
  {
    id: "sequences",
    label: "Sequences & Series",
    keys: [
      k("a_n", "a_{#0}", "Term aₙ"),
      k("a_{n+1}", "a_{#0+1}", "Next term aₙ₊₁"),
      k("u_n", "u_{#0}", "Term uₙ"),
      k("a_1", "a_{#0}", "First term"),
      k("d", "d", "Common difference"),
      k("r", "r", "Common ratio"),
      k("S_n", "S_{#0}", "Sum of n terms"),
      k("S_\\infty", "S_{\\infty}", "Sum to infinity"),
      k("a_n = a_1 + (n-1)d", "a_n = a_1 + (n-1)d", "Arithmetic nth term"),
      k("a_n = a_1 r^{n-1}", "a_n = a_1 r^{n-1}", "Geometric nth term"),
      k("S_n = \\frac{n}{2}(2a_1+(n-1)d)", "S_n = \\frac{n}{2}\\left(2a_1+(n-1)d\\right)", "Arithmetic series"),
      k("S_n = \\frac{a_1(1-r^n)}{1-r}", "S_n = \\frac{a_1\\left(1-r^n\\right)}{1-r}", "Geometric series"),
      k("T_n", "T_{#0}", "Term Tₙ"),
      k("\\Delta", "\\Delta", "Difference operator"),
      k("\\sum_{n=1}^{\\infty} a_n", "\\sum_{n=1}^{\\infty} a_{#0}", "Infinite series"),
    ],
  },
  {
    id: "science-units",
    label: "Science & Units",
    keys: [
      k("\\times 10^{\\square}", "\\times 10^{#0}", "Scientific notation"),
      k("\\text{m/s}", "\\text{m/s}", "Metres per second"),
      k("\\text{m/s}^2", "\\text{m/s}^2", "Metres per second squared"),
      k("\\text{kg}", "\\text{kg}", "Kilogram"),
      k("\\text{N}", "\\text{N}", "Newton"),
      k("\\text{J}", "\\text{J}", "Joule"),
      k("\\text{W}", "\\text{W}", "Watt"),
      k("\\text{Pa}", "\\text{Pa}", "Pascal"),
      k("\\text{V}", "\\text{V}", "Volt"),
      k("\\text{A}", "\\text{A}", "Ampere"),
      k("\\text{Hz}", "\\text{Hz}", "Hertz"),
      k("^{\\circ}\\text{C}", "^{\\circ}\\text{C}", "Degrees Celsius"),
      k("\\text{mol}", "\\text{mol}", "Mole"),
      k("\\text{mol/L}", "\\text{mol/L}", "Concentration"),
      k("\\text{cm}^3", "\\text{cm}^3", "Cubic centimetre"),
      k("\\text{g/cm}^3", "\\text{g/cm}^3", "Density"),
      k("\\text{ppm}", "\\text{ppm}", "Parts per million"),
      k("\\mu", "\\mu", "Micro"),
      k("\\rightarrow", "\\rightarrow ", "Reaction arrow"),
      k("\\rightleftharpoons", "\\rightleftharpoons ", "Equilibrium arrow"),
      k("\\uparrow", "\\uparrow ", "Gas evolved"),
      k("\\downarrow", "\\downarrow ", "Precipitate"),
      k("\\mathrm{H_2O}", "\\mathrm{H_2O}", "Water"),
      k("\\mathrm{CO_2}", "\\mathrm{CO_2}", "Carbon dioxide"),
      k("\\mathrm{Na^+}", "\\mathrm{Na^+}", "Sodium ion"),
      k("\\mathrm{Cl^-}", "\\mathrm{Cl^-}", "Chloride ion"),
      k("\\mathrm{SO_4^{2-}}", "\\mathrm{SO_4^{2-}}", "Sulfate ion"),
      k("\\mathrm{CH_4}", "\\mathrm{CH_4}", "Methane"),
      k("\\mathrm{NH_3}", "\\mathrm{NH_3}", "Ammonia"),
      k("\\mathrm{H_2SO_4}", "\\mathrm{H_2SO_4}", "Sulfuric acid"),
      k("\\mathrm{HCl}", "\\mathrm{HCl}", "Hydrochloric acid"),
      k("\\mathrm{NaOH}", "\\mathrm{NaOH}", "Sodium hydroxide"),
      k("\\mathrm{C_6H_{12}O_6}", "\\mathrm{C_6H_{12}O_6}", "Glucose"),
      k("E_k = \\tfrac12 mv^2", "E_k = \\tfrac{1}{2}mv^2", "Kinetic energy"),
      k("F = ma", "F = ma", "Newton's second law"),
      k("v = \\frac{d}{t}", "v = \\frac{d}{t}", "Speed"),
      k("\\rho = \\frac{m}{V}", "\\rho = \\frac{m}{V}", "Density"),
    ],
  },
  {
    id: "structures",
    label: "Structures",
    keys: [
      k("\\begin{cases}a\\\\b\\end{cases}", "\\begin{cases}#0\\\\\\\\#1\\end{cases}", "Piecewise function"),
      k("\\overbrace{a+b}^{n}", "\\overbrace{#0}^{#1}", "Overbrace"),
      k("\\underbrace{a+b}_{n}", "\\underbrace{#0}_{#1}", "Underbrace"),
      k("\\boxed{x}", "\\boxed{#0}", "Boxed answer"),
      k("\\cancel{x}", "\\cancel{#0}", "Cancel"),
      k("\\text{…}", "\\text{#0}", "Text inside mathematics"),
      k("\\overline{x}", "\\overline{#0}", "Overline"),
      k("\\underline{x}", "\\underline{#0}", "Underline"),
    ],
  },
];

/** Strip MathLive placeholders for plain LaTeX contexts (keeps brace groups). */
export function stripPlaceholders(template: string): string {
  return template.replace(/#\d/g, "").replace(/#@/g, "");
}

/**
 * Convert insertion-template markers (`#0`, `#1`, …) to MathLive
 * `\placeholder{}` commands. This is used when a structure chosen from Text
 * mode is opened in the visual editor: MathLive can then select/tab through
 * the real editable slots instead of placing the caret after the structure.
 */
export function templateToPlaceholderLatex(template: string): string {
  return template.replace(/#(?:\d|@)/g, "\\placeholder{}");
}
