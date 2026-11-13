/**
 * Plain-text projection of the shared mathematical keyboard.
 *
 * The Formative Assessment short-answer, numeric and Assess Prep part fields
 * store plain text (and are marked by `canonicalExpression` /
 * `parseStudentNumber` / `normText` in src/lib/assessParts.ts + scoring.ts).
 * Those mark routines fold ×, ÷, −, ₙ and strip `$`/`\`, so this module maps
 * every `MATH_CATEGORIES` key onto the plain-text equivalent that the scoring
 * engine already understands. The student's stored answer therefore keeps its
 * existing shape — the keyboard adds composition power without introducing a
 * competing answer format or a second editor.
 *
 * Structured keys (fractions, roots, powers, brackets…) insert a readable
 * template and report where the caret should land and which slot, if any,
 * should be selected so typing immediately replaces it.
 */
import { MATH_CATEGORIES, type MathKey } from "./mathKeyboard.ts";

export interface PlainMathInsertion {
  /** Text inserted at the cursor. */
  text: string;
  /** Caret position, as an offset from the START of the inserted text. */
  caret: number;
  /** Optional slot to select (offsets within the inserted text) so typing replaces it. */
  slot?: { start: number; end: number };
  /**
   * Where the caret should jump once the selected slot has been filled — the
   * second slot of a two-slot template (e.g. a fraction's denominator).
   * Offsets are within the inserted text and assume each slot is filled with
   * exactly one character of placeholder replaced (students type over the
   * selected space); the host field re-clamps them defensively.
   */
  next?: { start: number; end: number };
}

/** Direct single-token equivalences (key `i` template → plain text). */
const DIRECT: Record<string, string> = {
  "+": "+",
  "-": "−", // Unicode minus: canonicalExpression folds − – — to "-"
  "\\times ": "×",
  "\\div ": "÷",
  "=": "=",
  "\\pm ": "±",
  "\\mp ": "∓",
  "\\cdot ": "·",
  "\\%": "%",
  "\\infty ": "∞",
  "\\ne ": "≠",
  "<": "<",
  ">": ">",
  "\\le ": "≤",
  "\\ge ": "≥",
  "\\approx ": "≈",
  "\\equiv ": "≡",
  "\\propto ": "∝",
  "\\sim ": "~",
  "\\Rightarrow ": "⇒",
  "\\Leftrightarrow ": "⇔",
  "\\rightarrow ": "→",
  "\\therefore ": "∴",
  "\\because ": "∵",
  "^2": "^2",
  "^3": "^3",
  "_1": "₁",
  "_2": "₂",
  "_n": "ₙ",
  "!": "!",
  "\\angle ": "∠",
  "^\\circ": "°",
  "\\parallel ": "∥",
  "\\perp ": "⊥",
  "\\triangle ": "△",
  "\\square ": "□",
  "\\cong ": "≅",
  "\\pi r^2": "πr^2",
  "2\\pi r": "2πr",
  "\\to ": "→",
  "\\mapsto ": "↦",
  "\\min ": "min ",
  "\\max ": "max ",
  "\\in ": "∈",
  "\\notin ": "∉",
  "\\subset ": "⊂",
  "\\subseteq ": "⊆",
  "\\supset ": "⊃",
  "\\cup ": "∪",
  "\\cap ": "∩",
  "\\setminus ": "∖",
  "\\emptyset ": "∅",
  "\\forall ": "∀",
  "\\exists ": "∃",
  "\\land ": "∧",
  "\\lor ": "∨",
  "\\neg ": "¬",
  "\\mathbb{R}": "ℝ",
  "\\mathbb{Z}": "ℤ",
  "\\mathbb{N}": "ℕ",
  "\\mathbb{Q}": "ℚ",
  "\\mathbb{C}": "ℂ",
  "\\Delta": "Δ",
  "\\nabla ": "∇",
  "\\hat{i}": "î",
  "\\hat{j}": "ĵ",
  "\\hat{k}": "k̂",
  "f:\\mathbb{R}\\to\\mathbb{R}": "f:ℝ→ℝ",
  "A^{-1}": "A⁻¹",
  "A^{T}": "Aᵀ",
  "d": "d",
  "r": "r",
  "S_{\\infty}": "S∞",
  "a_n = a_1 + (n-1)d": "aₙ = a₁ + (n−1)d",
  "a_n = a_1 r^{n-1}": "aₙ = a₁r^(n−1)",
  "S_n = \\frac{n}{2}\\left(2a_1+(n-1)d\\right)": "Sₙ = n/2(2a₁ + (n−1)d)",
  "S_n = \\frac{a_1\\left(1-r^n\\right)}{1-r}": "Sₙ = a₁(1 − rⁿ)/(1 − r)",
  "\\chi^2": "χ²",
  "\\sigma^2": "σ²",
  "\\text{m/s}": "m/s",
  "\\text{m/s}^2": "m/s²",
  "\\text{kg}": "kg",
  "\\text{N}": "N",
  "\\text{J}": "J",
  "\\text{W}": "W",
  "\\text{Pa}": "Pa",
  "\\text{V}": "V",
  "\\text{A}": "A",
  "\\text{Hz}": "Hz",
  "^{\\circ}\\text{C}": "°C",
  "\\text{mol}": "mol",
  "\\text{mol/L}": "mol/L",
  "\\text{cm}^3": "cm³",
  "\\text{g/cm}^3": "g/cm³",
  "\\text{ppm}": "ppm",
  "\\mu": "µ",
  "\\rightleftharpoons ": "⇌",
  "\\uparrow ": "↑",
  "\\downarrow ": "↓",
  "\\mathrm{H_2O}": "H₂O",
  "\\mathrm{CO_2}": "CO₂",
  "\\mathrm{Na^+}": "Na⁺",
  "\\mathrm{Cl^-}": "Cl⁻",
  "\\mathrm{SO_4^{2-}}": "SO₄²⁻",
  "\\mathrm{CH_4}": "CH₄",
  "\\mathrm{NH_3}": "NH₃",
  "\\mathrm{H_2SO_4}": "H₂SO₄",
  "\\mathrm{HCl}": "HCl",
  "\\mathrm{NaOH}": "NaOH",
  "\\mathrm{C_6H_{12}O_6}": "C₆H₁₂O₆",
  "E_k = \\tfrac{1}{2}mv^2": "Eₖ = ½mv²",
  "F = ma": "F = ma",
  "v = \\frac{d}{t}": "v = d/t",
  "\\rho = \\frac{m}{V}": "ρ = m/V",
};

/** Greek letters map one-to-one onto Unicode. */
const GREEK: Record<string, string> = {
  "\\alpha ": "α", "\\beta ": "β", "\\gamma ": "γ", "\\delta ": "δ",
  "\\epsilon ": "ε", "\\zeta ": "ζ", "\\eta ": "η", "\\theta ": "θ",
  "\\lambda ": "λ", "\\mu ": "µ", "\\nu ": "ν", "\\pi ": "π",
  "\\rho ": "ρ", "\\sigma ": "σ", "\\tau ": "τ", "\\phi ": "φ",
  "\\chi ": "χ", "\\psi ": "ψ", "\\omega ": "ω",
  "\\Gamma ": "Γ", "\\Delta ": "Δ", "\\Theta ": "Θ", "\\Lambda ": "Λ",
  "\\Pi ": "Π", "\\Sigma ": "Σ", "\\Phi ": "Φ", "\\Omega ": "Ω",
};

/** Single-character algebra variables. */
const VARS = new Set(["x", "y", "n", "a", "b"]);

/**
 * Plain-text insertion for one keyboard key. Never returns raw LaTeX or
 * MathLive placeholders — the result is what the student sees, saves and the
 * teacher reads in marking.
 */
export function plainInsertionForKey(key: MathKey): PlainMathInsertion {
  const i = key.i;

  if (DIRECT[i] !== undefined) return { text: DIRECT[i], caret: DIRECT[i].length };
  if (GREEK[i] !== undefined) return { text: GREEK[i], caret: GREEK[i].length };
  if (VARS.has(i)) return { text: i, caret: 1 };

  // Fences: caret lands inside.
  if (i === "\\left(#0\\right)") return { text: "()", caret: 1 };
  if (i === "\\left[#0\\right]") return { text: "[]", caret: 1 };
  if (i === "\\left\\{#0\\right\\}") return { text: "{}", caret: 1 };
  if (i === "\\left|#0\\right|") return { text: "|  |", caret: 1, slot: { start: 1, end: 2 } };
  if (i === "\\left|\\mathbf{#0}\\right|") return { text: "|  |", caret: 1, slot: { start: 1, end: 2 } };

  // Fractions. "(a)/(b)" survives canonicalExpression; bare "a/b" is what
  // parseStudentNumber understands for numeric parts.
  if (i === "\\frac{#0}{#1}" || i === "\\dfrac{#0}{#1}")
    return { text: "( )/( )", caret: 1, slot: { start: 1, end: 2 }, next: { start: 5, end: 6 } };
  if (i === "\\frac{1}{#0}") return { text: "1/( )", caret: 3, slot: { start: 3, end: 4 } };

  // Roots.
  if (i === "\\sqrt{#0}") return { text: "√( )", caret: 2, slot: { start: 2, end: 3 } };
  if (i === "\\sqrt[3]{#0}") return { text: "∛( )", caret: 2, slot: { start: 2, end: 3 } };
  if (i === "\\sqrt[#0]{#1}") return { text: "√[ ]( )", caret: 2, slot: { start: 2, end: 3 }, next: { start: 6, end: 7 } };

  // Powers, indices and general exponents.
  if (i === "^{#0}") return { text: "^( )", caret: 2, slot: { start: 2, end: 3 } };
  if (i === "_{#0}") return { text: "_( )", caret: 2, slot: { start: 2, end: 3 } };
  if (i === "_{#0}^{#1}") return { text: "_( )^( )", caret: 2, slot: { start: 2, end: 3 }, next: { start: 6, end: 7 } };
  if (i === "e^{#0}") return { text: "e^( )", caret: 3, slot: { start: 3, end: 4 } };
  if (i === "10^{#0}") return { text: "10^( )", caret: 4, slot: { start: 4, end: 5 } };
  if (i === "a_{#0}") return { text: "a_", caret: 2 };
  if (i === "a_{#0+1}") return { text: "aₙ₊₁", caret: 4 };
  if (i === "u_{#0}") return { text: "u_", caret: 2 };
  if (i === "T_{#0}") return { text: "T_", caret: 2 };
  if (i === "\\sum_{n=1}^{\\infty} a_{#0}") return { text: "Σ aₙ (n=1→∞)", caret: 12 };

  // Logs.
  if (i === "\\log_{#0}\\left(#1\\right)") return { text: "log_( ) ( )", caret: 5, slot: { start: 5, end: 6 }, next: { start: 9, end: 10 } };
  if (i === "\\ln\\left(#0\\right)") return { text: "ln( )", caret: 3, slot: { start: 3, end: 4 } };
  if (i === "\\log\\left(#0\\right)") return { text: "log( )", caret: 4, slot: { start: 4, end: 5 } };

  // Trigonometry: plain function names keep marking predictable.
  const TRIG: [RegExp, string][] = [
    [/^\\sin\^\{-1\}\\left\(#0\\right\)$/, "sin⁻¹( )"],
    [/^\\cos\^\{-1\}\\left\(#0\\right\)$/, "cos⁻¹( )"],
    [/^\\tan\^\{-1\}\\left\(#0\\right\)$/, "tan⁻¹( )"],
    [/^\\sin\\left\(#0\\right\)$/, "sin( )"],
    [/^\\cos\\left\(#0\\right\)$/, "cos( )"],
    [/^\\tan\\left\(#0\\right\)$/, "tan( )"],
    [/^\\csc\\left\(#0\\right\)$/, "csc( )"],
    [/^\\sec\\left\(#0\\right\)$/, "sec( )"],
    [/^\\cot\\left\(#0\\right\)$/, "cot( )"],
    [/^\\sinh\\left\(#0\\right\)$/, "sinh( )"],
    [/^\\cosh\\left\(#0\\right\)$/, "cosh( )"],
  ];
  for (const [pattern, text] of TRIG) {
    if (pattern.test(i)) {
      const caret = text.length - 2;
      return { text, caret, slot: { start: caret, end: caret + 1 } };
    }
  }

  // Functions.
  const FUNCS: [RegExp, string][] = [
    [/^f\^\{-1\}\\left\(#0\\right\)$/, "f⁻¹( )"],
    [/^f\\left\(#0\\right\)$/, "f( )"],
    [/^g\\left\(#0\\right\)$/, "g( )"],
    [/^\\left\(f\\circ g\\right\)\\left\(#0\\right\)$/, "(f∘g)( )"],
    [/^\\gcd\\left\(#0\\right\)$/, "gcd( )"],
    [/^\\operatorname\{lcm\}\\left\(#0\\right\)$/, "lcm( )"],
    [/^\\det\\left\(#0\\right\)$/, "det( )"],
    [/^P\\left\(#0\\right\)$/, "P( )"],
    [/^P\\left\(#0\\mid #1\\right\)$/, "P( | )"],
    [/^E\\left\(#0\\right\)$/, "E( )"],
    [/^\\operatorname\{Var\}\\left\(#0\\right\)$/, "Var( )"],
    [/^X\\sim N\\left\(#0,#1\\right\)$/, "X ~ N( , )"],
  ];
  const FUNCS_NEXT: Record<string, { start: number; end: number }> = {
    "P( | )": { start: 5, end: 6 },
    "X ~ N( , )": { start: 9, end: 10 },
  };
  for (const [pattern, text] of FUNCS) {
    if (pattern.test(i)) {
      const caret = text.indexOf("( ") >= 0 ? text.indexOf("( ") + 1 : text.length - 2;
      return { text, caret, slot: { start: caret, end: caret + 1 }, next: FUNCS_NEXT[text] };
    }
  }

  // Decorations / structures that make sense inline as plain text.
  if (i === "\\overline{#0}") return { text: "x̄", caret: 2 };
  if (i === "\\bar{#0}") return { text: "x̄", caret: 2 };
  if (i === "\\hat{#0}") return { text: "x̂", caret: 2 };
  if (i === "\\tilde{#0}") return { text: "x̃", caret: 2 };
  if (i === "\\vec{#0}") return { text: "a⃗", caret: 2 };
  if (i === "\\mathbf{#0}") return { text: "a", caret: 1 };
  if (i === "\\mathbf{#0}\\cdot\\mathbf{#1}") return { text: "a·b", caret: 3 };
  if (i === "\\mathbf{#0}\\times\\mathbf{#1}") return { text: "a×b", caret: 3 };
  if (i === "{}^{#0}C_{#1}") return { text: "ⁿCᵣ", caret: 3 };
  if (i === "{}^{#0}P_{#1}") return { text: "ⁿPᵣ", caret: 3 };
  if (i === "\\binom{#0}{#1}") return { text: "C( , )", caret: 2, slot: { start: 2, end: 3 }, next: { start: 5, end: 6 } };
  if (i === "\\lfloor #0\\rfloor ") return { text: "⌊ ⌋", caret: 1, slot: { start: 1, end: 2 } };
  if (i === "\\lceil #0\\rceil ") return { text: "⌈ ⌉", caret: 1, slot: { start: 1, end: 2 } };
  if (i === "\\overline{#0}" || i === "\\underline{#0}") return { text: "x", caret: 1 };
  if (i === "\\widehat{#0}") return { text: "AB⌢", caret: 3 };
  if (i === "\\overrightarrow{#0}") return { text: "AB→", caret: 3 };
  if (i === "\\text{#0}") return { text: " ", caret: 0, slot: { start: 0, end: 1 } };
  if (i === "\\boxed{#0}") return { text: "[ ]", caret: 1, slot: { start: 1, end: 2 } };
  if (i === "\\times 10^{#0}") return { text: "×10^( )", caret: 5, slot: { start: 5, end: 6 } };

  // Limits / calculus read naturally as words plus arrows.
  if (i === "\\lim_{x\\to #0}#1") return { text: "lim(x→ ) ", caret: 6, slot: { start: 6, end: 7 }, next: { start: 9, end: 9 } };
  if (i === "\\lim_{x\\to\\infty}#0") return { text: "lim(x→∞) ", caret: 9 };
  if (i === "\\lim_{x\\to 0}#0") return { text: "lim(x→0) ", caret: 9 };
  if (i === "\\lim_{h\\to 0}#0") return { text: "lim(h→0) ", caret: 9 };
  if (i === "\\lim_{n\\to\\infty}#0") return { text: "lim(n→∞) ", caret: 9 };
  if (i === "\\frac{d#0}{d#1}") return { text: "d( )/d( )", caret: 2, slot: { start: 2, end: 3 }, next: { start: 6, end: 7 } };
  if (i === "\\frac{d^2#0}{d#1^2}") return { text: "d²( )/d( )²", caret: 3, slot: { start: 3, end: 4 }, next: { start: 7, end: 8 } };
  if (i === "\\frac{\\partial #0}{\\partial #1}") return { text: "∂( )/∂( )", caret: 2, slot: { start: 2, end: 3 }, next: { start: 6, end: 7 } };
  if (i === "f'\\left(#0\\right)") return { text: "f′( )", caret: 3, slot: { start: 3, end: 4 } };
  if (i === "f''\\left(#0\\right)") return { text: "f″( )", caret: 3, slot: { start: 3, end: 4 } };
  if (i === "\\dot{#0}") return { text: "ẋ", caret: 2 };
  if (i === "\\ddot{#0}") return { text: "ẍ", caret: 2 };
  if (i === "\\int_{#0}^{#1}#2\\,dx") return { text: "∫[ , ] dx", caret: 2, slot: { start: 2, end: 3 }, next: { start: 5, end: 6 } };
  if (i === "\\int #0\\,dx") return { text: "∫ dx", caret: 2 };
  if (i === "\\iint #0\\,dA") return { text: "∬ dA", caret: 4 };
  if (i === "\\iiint #0\\,dV") return { text: "∭ dV", caret: 4 };
  if (i === "\\oint #0\\,ds") return { text: "∮ ds", caret: 4 };
  if (i === "\\left[#0\\right]_{#1}^{#2}") return { text: "[ ]|ₐᵇ", caret: 1, slot: { start: 1, end: 2 } };

  // Sums & products.
  if (i === "\\sum_{#0}^{#1}#2") return { text: "Σ( ) ", caret: 2, slot: { start: 2, end: 3 } };
  if (i === "\\prod_{#0}^{#1}#2") return { text: "∏( ) ", caret: 2, slot: { start: 2, end: 3 } };
  if (i === "\\sum_{#0}^{\\infty}#1") return { text: "Σ( →∞) ", caret: 2, slot: { start: 2, end: 3 } };
  if (i === "\\bigcup_{#0}^{#1}#2") return { text: "⋃( ) ", caret: 2, slot: { start: 2, end: 3 } };
  if (i === "\\bigcap_{#0}^{#1}#2") return { text: "⋂( ) ", caret: 2, slot: { start: 2, end: 3 } };

  // Quadratic-formula shape.
  if (i === "\\frac{-#0\\pm\\sqrt{#1}}{#2}") return { text: "(− ± √ )/( )", caret: 1, slot: { start: 1, end: 2 }, next: { start: 6, end: 7 } };

  // Matrices: a compact readable inline form.
  if (i.startsWith("\\begin{pmatrix}") && i.includes("#2")) return { text: "( , ; , )", caret: 1, slot: { start: 1, end: 2 } };
  if (i.startsWith("\\begin{bmatrix}") && i.includes("#2")) return { text: "[ , ; , ]", caret: 1, slot: { start: 1, end: 2 } };
  if (i.startsWith("\\begin{vmatrix}")) return { text: "| , ; , |", caret: 1, slot: { start: 1, end: 2 } };
  if (i.startsWith("\\begin{pmatrix}") && i.includes("#1")) return { text: "( ; ; )", caret: 1, slot: { start: 1, end: 2 } };
  if (i.startsWith("\\begin{cases}")) return { text: "{ ; }", caret: 1, slot: { start: 1, end: 2 } };
  if (i.startsWith("\\overbrace")) return { text: "( )⏞^( )", caret: 1, slot: { start: 1, end: 2 } };
  if (i.startsWith("\\underbrace")) return { text: "( )⏟_( )", caret: 1, slot: { start: 1, end: 2 } };
  if (i === "\\cancel{#0}") return { text: "x̶", caret: 2 };

  // Last resort: strip placeholders/backslashes so nothing raw-LaTeX ever
  // reaches a plain-text answer field.
  const fallback = i.replace(/#\d/g, "").replace(/\\left|\\right/g, "").replace(/\\/g, "");
  return { text: fallback || key.t, caret: (fallback || key.t).length };
}

/**
 * A small numeric-friendly keyboard built from the same category definitions.
 * A `numeric` answer must emit a real number, and `parseStudentNumber`
 * (src/lib/assessParts.ts) only understands digits, a leading minus, a
 * trailing `%`, a bare `a/b` fraction and trailing unit letters. So the
 * compact keyboard offers exactly the score-safe extras — anything else
 * (π, √, ^, =) would make the value unscorable.
 */
export const NUMERIC_MATH_CATEGORY = (() => {
  const wanted = ["Minus", "Percent", "Fraction"];
  const keys: MathKey[] = [];
  for (const title of wanted) {
    for (const cat of MATH_CATEGORIES) {
      const found = cat.keys.find((k) => k.t === title);
      if (found && !keys.includes(found)) { keys.push(found); break; }
    }
  }
  return { id: "numeric", label: "Numeric", keys };
})();
