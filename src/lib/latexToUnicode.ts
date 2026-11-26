/**
 * LaTeX → Unicode mathematics for print.
 *
 * The candidate paper is a PDF, so a typeset fraction has to become characters
 * a font can actually draw. This module turns LaTeX into *real mathematical
 * notation* — `\dfrac{x+1}{2}` becomes "(x+1)/2", `x^2` becomes x², `\sqrt{5}`
 * becomes √5, `\leq` becomes ≤ — using the Unicode mathematical operators that
 * the embedded DejaVu fonts carry.
 *
 * Two rules govern the output:
 *
 *  1. No raw LaTeX survives. Anything this module does not recognise is
 *     unwrapped to its visible argument rather than printed as a command, and a
 *     final sweep removes stray braces, `\` and `$`.
 *  2. Powers and subscripts use genuine Unicode super/subscripts where the font
 *     has them (x², uₙ, 10⁻³) and caret/underscore notation otherwise, so a
 *     complex power reads `^(n-1)` — never `\^{n-1}`.
 */

/* ── Unicode super/subscript alphabets ─────────────────────────────────── */

const SUPERSCRIPTS: Record<string, string> = {
  "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3", "4": "\u2074",
  "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079",
  "+": "\u207a", "-": "\u207b", "=": "\u207c", "(": "\u207d", ")": "\u207e",
  n: "\u207f", i: "\u2071", a: "\u1d43", b: "\u1d47", c: "\u1d9c", d: "\u1d48",
  e: "\u1d49", f: "\u1da0", g: "\u1d4d", h: "\u02b0", j: "\u02b2", k: "\u1d4f",
  l: "\u02e1", m: "\u1d50", o: "\u1d52", p: "\u1d56", r: "\u02b3", s: "\u02e2",
  t: "\u1d57", u: "\u1d58", v: "\u1d5b", w: "\u02b7", x: "\u02e3", y: "\u02b8",
  z: "\u1dbb", " ": "", "\u2212": "\u207b",
};

const SUBSCRIPTS: Record<string, string> = {
  "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083", "4": "\u2084",
  "5": "\u2085", "6": "\u2086", "7": "\u2087", "8": "\u2088", "9": "\u2089",
  "+": "\u208a", "-": "\u208b", "=": "\u208c", "(": "\u208d", ")": "\u208e",
  a: "\u2090", e: "\u2091", h: "\u2095", i: "\u1d62", j: "\u2c7c", k: "\u2096",
  l: "\u2097", m: "\u2098", n: "\u2099", o: "\u2092", p: "\u209a", r: "\u1d63",
  s: "\u209b", t: "\u209c", u: "\u1d64", v: "\u1d65", x: "\u2093", " ": "",
  "\u2212": "\u208b",
};

/** True when every character has a genuine Unicode super/subscript form. */
function allMappable(text: string, table: Record<string, string>): boolean {
  return [...text].every((ch) => Object.prototype.hasOwnProperty.call(table, ch));
}

function toScript(text: string, table: Record<string, string>): string {
  return [...text].map((ch) => table[ch] ?? ch).join("");
}

/**
 * A power that the font can draw as true superscripts stays superscript; one it
 * cannot (a whole expression like n-1, or an unknown symbol) falls back to
 * parenthesised caret notation, which is unambiguous and never raw LaTeX.
 */
function renderScript(inner: string, table: Record<string, string>): string {
  const clean = inner.trim();
  if (!clean) return "";
  if (allMappable(clean, table)) return toScript(clean, table);
  if (/^[A-Za-z0-9.\u2212-]+$/.test(clean)) return `^${clean}`;
  return `^(${clean})`;
}

function renderSubscript(inner: string): string {
  const clean = inner.trim();
  if (!clean) return "";
  if (allMappable(clean, SUBSCRIPTS)) return toScript(clean, SUBSCRIPTS);
  if (/^[A-Za-z0-9.]+$/.test(clean)) return `_${clean}`;
  return `_(${clean})`;
}

/**
 * Limits on ∑ and ∫ are conventionally set above and below the sign. In a
 * single text run they read best inline against the sign, so `\sum_{n=1}^{4}`
 * becomes `∑(n=1…4)` rather than a subscript with a subscripted superscript.
 */
function readLimits(src: string, index: number): {
  lower: string | null;
  upper: string | null;
  end: number;
} {
  let i = index;
  let lower: string | null = null;
  let upper: string | null = null;
  for (let guard = 0; guard < 3; guard += 1) {
    let k = i;
    while (k < src.length && src[k] === " ") k += 1;
    if (src[k] === "_" && lower === null) {
      const a = readArg(src, k + 1);
      lower = a.arg;
      i = a.end;
      continue;
    }
    if (src[k] === "^" && upper === null) {
      const a = readArg(src, k + 1);
      upper = a.arg;
      i = a.end;
      continue;
    }
    break;
  }
  return { lower, upper, end: i };
}

function renderLimits(lower: string | null, upper: string | null): string {
  const lo = lower ? latexToUnicode(lower).trim() : "";
  const hi = upper ? latexToUnicode(upper).trim() : "";
  if (lo && hi) return `(${lo}\u2026${hi})`;
  if (lo) return `(${lo})`;
  if (hi) return `(${hi})`;
  return "";
}

/* ── Symbol table ──────────────────────────────────────────────────────── */

const SYMBOLS: Record<string, string> = {
  times: "\u00d7", div: "\u00f7", pm: "\u00b1", mp: "\u2213", cdot: "\u22c5",
  ast: "*", star: "\u22c6", circ: "\u2218", bullet: "\u2022", oplus: "\u2295",
  ominus: "\u2296", otimes: "\u2297",

  leq: "\u2264", le: "\u2264", geq: "\u2265", ge: "\u2265", neq: "\u2260",
  ne: "\u2260", equiv: "\u2261", approx: "\u2248", sim: "\u223c", simeq: "\u2243",
  cong: "\u2245", propto: "\u221d", ll: "\u226a", gg: "\u226b",

  infty: "\u221e", partial: "\u2202", nabla: "\u2207", ell: "\u2113",
  forall: "\u2200", exists: "\u2203", neg: "\u00ac", emptyset: "\u2205",
  varnothing: "\u2205", therefore: "\u2234", because: "\u2235",

  in: "\u2208", notin: "\u2209", ni: "\u220b", subset: "\u2282",
  subseteq: "\u2286", supset: "\u2283", supseteq: "\u2287", cup: "\u222a",
  cap: "\u2229", setminus: "\u2216", union: "\u222a", inter: "\u2229",

  angle: "\u2220", triangle: "\u25b3", perp: "\u22a5", parallel: "\u2225",
  degree: "\u00b0", prime: "\u2032", dprime: "\u2033", checkmark: "\u2713",

  to: "\u2192", rightarrow: "\u2192", leftarrow: "\u2190", gets: "\u2190",
  leftrightarrow: "\u2194", Rightarrow: "\u21d2", Leftarrow: "\u21d0",
  Leftrightarrow: "\u21d4", implies: "\u21d2", iff: "\u21d4",
  mapsto: "\u21a6", uparrow: "\u2191", downarrow: "\u2193",

  ldots: "\u2026", cdots: "\u22ef", dots: "\u2026", vdots: "\u22ee",
  ddots: "\u22f1", mathbf: "", colon: ":", thinspace: " ",

  sum: "\u2211", prod: "\u220f", coprod: "\u2210", int: "\u222b",
  iint: "\u222c", iiint: "\u222d", oint: "\u222e", sqrt: "\u221a",

  quad: " ", qquad: " ", ",": " ", ";": " ", ":": " ", "!": "", " ": " ",
};

/** Greek letters, upper and lower. */
const GREEK: Record<string, string> = {
  alpha: "\u03b1", beta: "\u03b2", gamma: "\u03b3", delta: "\u03b4",
  epsilon: "\u03b5", varepsilon: "\u03b5", zeta: "\u03b6", eta: "\u03b7",
  theta: "\u03b8", vartheta: "\u03d1", iota: "\u03b9", kappa: "\u03ba",
  lambda: "\u03bb", mu: "\u03bc", nu: "\u03bd", xi: "\u03be", pi: "\u03c0",
  varpi: "\u03d6", rho: "\u03c1", varrho: "\u03f1", sigma: "\u03c3",
  varsigma: "\u03c2", tau: "\u03c4", upsilon: "\u03c5", phi: "\u03c6",
  varphi: "\u03d5", chi: "\u03c7", psi: "\u03c8", omega: "\u03c9",
  Gamma: "\u0393", Delta: "\u0394", Theta: "\u0398", Lambda: "\u039b",
  Xi: "\u039e", Pi: "\u03a0", Sigma: "\u03a3", Upsilon: "\u03a5",
  Phi: "\u03a6", Psi: "\u03a8", Omega: "\u03a9",
};

/** Operators typeset upright with their spacing preserved. */
const OPERATORS = [
  "arcsin", "arccos", "arctan", "sin", "cos", "tan", "csc", "sec", "cot",
  "sinh", "cosh", "tanh", "log", "ln", "lg", "exp", "lim", "max", "min",
  "sup", "inf", "det", "dim", "ker", "deg", "gcd", "arg", "mod",
];

/* ── Brace-aware helpers ──────────────────────────────────────────────── */

/**
 * Read the argument that follows `index`, which may be a `{...}` group or a
 * single token (so `\frac12` and `x^2` work, as TeX allows).
 */
function readArg(src: string, index: number): { arg: string; end: number } {
  let i = index;
  while (i < src.length && src[i] === " ") i += 1;
  if (i >= src.length) return { arg: "", end: i };
  if (src[i] === "{") {
    let depth = 0;
    for (let j = i; j < src.length; j += 1) {
      if (src[j] === "{") depth += 1;
      else if (src[j] === "}") {
        depth -= 1;
        if (depth === 0) return { arg: src.slice(i + 1, j), end: j + 1 };
      }
    }
    return { arg: src.slice(i + 1), end: src.length };
  }
  if (src[i] === "\\") {
    // A command used as an argument, e.g. \frac\pi2
    let j = i + 1;
    while (j < src.length && /[a-zA-Z]/.test(src[j])) j += 1;
    return { arg: src.slice(i, j), end: j };
  }
  return { arg: src[i], end: i + 1 };
}

/** Wrap a numerator or denominator so the fraction stays unambiguous in print. */
function wrapAtom(part: string): string {
  const t = part.trim();
  if (!t) return "";
  // A single letter, number or already-grouped expression needs no extra parens.
  if (/^[A-Za-z0-9.]$/.test(t)) return t;
  // A short run of letters and digits is already a recognised value, so
  // `\frac{81}{4}` reads "81/4" and not "(81)/4".
  if (/^[A-Za-z0-9.]{2,}$/.test(t)) return t;
  if (/^\u221a[^\s/*+-]+$/.test(t)) return t;
  if (/^\(.*\)$/.test(t) && balanced(t.slice(1, -1))) return t;
  return `(${t})`;
}

function balanced(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/* ── The converter ────────────────────────────────────────────────────── */

/** Environments whose rows should be joined with a separator when flattened. */
const MATRIX_LIKE = new Set(["matrix", "pmatrix", "bmatrix", "vmatrix", "Vmatrix", "array", "cases"]);

/**
 * Convert a LaTeX expression to Unicode mathematics.
 *
 * The conversion walks the source once, so arguments are handled with their real
 * extent (`\frac{x+1}{2}` cannot confuse the second group) rather than by
 * successive regular-expression substitutions that break on nesting.
 */
export function latexToUnicode(input: string): string {
  if (!input) return "";
  const s = stripDelimiters(input);

  const out: string[] = [];
  let i = 0;

  const readCommand = (): { name: string; end: number } => {
    let j = i + 1;
    if (j < s.length && !/[a-zA-Z]/.test(s[j])) {
      // Escaped single character: \, \; \$ \% \{ \} \\ etc.
      return { name: s[j], end: j + 1 };
    }
    while (j < s.length && /[a-zA-Z]/.test(s[j])) j += 1;
    return { name: s.slice(i + 1, j), end: j };
  };

  while (i < s.length) {
    const ch = s[i];

    /* ── Escape sequences and commands ── */
    if (ch === "\\") {
      const { name, end } = readCommand();
      i = end;

      // Escaped literals
      if (name === "$" || name === "%" || name === "&" || name === "#" || name === "_") {
        out.push(name);
        continue;
      }
      if (name === "{" || name === "}") {
        out.push(name);
        continue;
      }
      if (name === "\\") {
        // Row break inside an environment; rows read as separate lines.
        out.push("\n");
        continue;
      }
      if (name === "|") {
        out.push("\u2016");
        continue;
      }

      // Sizing / layout directives that carry no printed meaning.
      if (
        /^(left|right|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr|big|Big|bigg|Bigg|displaystyle|textstyle|scriptstyle|scriptscriptstyle|limits|nolimits|middle|mathstrut|strut)$/.test(
          name,
        )
      ) {
        // \left. / \right. are invisible delimiters.
        continue;
      }

      // Fractions. \frac12 is legal TeX, so read args one at a time.
      if (name === "frac" || name === "dfrac" || name === "tfrac" || name === "cfrac") {
        const a = readArg(s, i);
        const b = readArg(s, a.end);
        i = b.end;
        const num = latexToUnicode(a.arg);
        const den = latexToUnicode(b.arg);
        out.push(`${wrapAtom(num)}/${wrapAtom(den)}`);
        continue;
      }

      if (name === "binom" || name === "dbinom" || name === "tbinom") {
        const a = readArg(s, i);
        const b = readArg(s, a.end);
        i = b.end;
        out.push(`C(${latexToUnicode(a.arg).trim()}, ${latexToUnicode(b.arg).trim()})`);
        continue;
      }

      // Roots: \sqrt{x} and \sqrt[n]{x}
      if (name === "sqrt") {
        let degree: string | null = null;
        if (s[i] === "[") {
          const close = s.indexOf("]", i);
          if (close > i) {
            degree = s.slice(i + 1, close);
            i = close + 1;
          }
        }
        const a = readArg(s, i);
        i = a.end;
        const body = latexToUnicode(a.arg).trim();
        // \sqrt{5} -> √5, \sqrt{x+1} -> √(x+1), \sqrt[3]{8} -> ∛8
        const radicand = /^[A-Za-z0-9.]$/.test(body) ? body : body ? `(${body})` : "";
        if (degree === "3") {
          out.push(`\u221b${radicand}`);
        } else if (degree === "4") {
          out.push(`\u221c${radicand}`);
        } else if (degree) {
          const d = latexToUnicode(degree).trim();
          out.push(`${superscriptSuffix(d)}\u221a${radicand}`);
        } else {
          out.push(`\u221a${radicand}`);
        }
        continue;
      }

      // Text wrappers: keep the words, drop the wrapper.
      if (/^(text|textrm|textnormal|textup|textit|textbf|textsf|texttt|mbox|hbox|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|mathbb|mathfrak|operatorname|boldsymbol|bm)$/.test(name)) {
        const a = readArg(s, i);
        i = a.end;
        out.push(name === "mathbb" ? toBlackboard(latexToUnicode(a.arg)) : latexToUnicode(a.arg));
        continue;
      }

      // Accents and decorations that print as a trailing mark in plain text.
      if (/^(bar|overline|underline|hat|widehat|tilde|widetilde|vec|dot|ddot|check|breve|acute|grave)$/.test(name)) {
        const a = readArg(s, i);
        i = a.end;
        const body = latexToUnicode(a.arg);
        const mark =
          name === "bar" || name === "overline" ? "\u0304"
          : name === "underline" ? "\u0332"
          : name === "hat" || name === "widehat" ? "\u0302"
          : name === "tilde" || name === "widetilde" ? "\u0303"
          : name === "vec" ? "\u20d7"
          : name === "dot" ? "\u0307"
          : name === "ddot" ? "\u0308"
          : name === "check" ? "\u030c"
          : name === "breve" ? "\u0306"
          : name === "acute" ? "\u0301"
          : "\u0300";
        out.push(`${body}${mark}`);
        continue;
      }

      // Environments: flatten to readable rows.
      if (name === "begin") {
        const a = readArg(s, i);
        i = a.end;
        const env = a.arg.trim();
        if (MATRIX_LIKE.has(env)) {
          // Drop the column specification of an array.
          if (env === "array") {
            if (s[i] === "{") {
              const spec = readArg(s, i);
              i = spec.end;
            }
          }
          out.push("\n");
        }
        continue;
      }
      if (name === "end") {
        const a = readArg(s, i);
        i = a.end;
        if (MATRIX_LIKE.has(a.arg.trim())) out.push("\n");
        continue;
      }

      // Summation / integration signs carry limits set beside the sign.
      if (name === "sum" || name === "prod" || name === "int" || name === "iint" || name === "oint" || name === "coprod") {
        const limits = readLimits(s, i);
        i = limits.end;
        out.push(`${SYMBOLS[name]}${renderLimits(limits.lower, limits.upper)}`);
        continue;
      }

      // Spacing
      if (SYMBOLS[name] !== undefined) {
        out.push(SYMBOLS[name]);
        continue;
      }

      // Greek
      if (GREEK[name] !== undefined) {
        out.push(GREEK[name]);
        continue;
      }

      // Operator names get upright text with spacing before them.
      if (OPERATORS.includes(name)) {
        const prev = out.join("");
        if (prev && !/[\s(]$/.test(prev)) out.push(" ");
        out.push(name);
        continue;
      }

      // Unknown command: print its name rather than the backslash, and never
      // leave the raw `\command` in the document.
      out.push(name);
      continue;
    }

    /* ── Superscripts ── */
    if (ch === "^") {
      const a = readArg(s, i + 1);
      i = a.end;
      const inner = latexToUnicode(a.arg).trim();
      if (inner === "\u00b0" || a.arg.trim() === "\\circ") {
        out.push("\u00b0");
      } else {
        out.push(renderScript(inner, SUPERSCRIPTS));
      }
      continue;
    }

    /* ── Subscripts ── */
    if (ch === "_") {
      const a = readArg(s, i + 1);
      i = a.end;
      out.push(renderSubscript(latexToUnicode(a.arg).trim()));
      continue;
    }

    /* ── Grouping braces disappear; their contents remain ── */
    if (ch === "{" || ch === "}") {
      i += 1;
      continue;
    }

    /* ── Literal TeX spacing and alignment characters ── */
    if (ch === "&") {
      out.push(" ");
      i += 1;
      continue;
    }
    if (ch === "~") {
      out.push("\u00a0");
      i += 1;
      continue;
    }

    out.push(ch);
    i += 1;
  }

  return tidy(realMinus(out.join("")));
}

/**
 * In mathematics a hyphen between operands is a minus sign (U+2212), which sits
 * optically centred and is wider than the hyphen of prose. Hyphens inside words
 * ("twenty-fifth") are left alone.
 */
function realMinus(text: string): string {
  return (
    text
      // Binary subtraction: `k - 2`, `3x - 1`.
      .replace(
        /(\d|[A-Za-z\u0370-\u03ff\u2080-\u2089\u2070-\u207f\u221a)])\s*-\s*(?=[\d(A-Za-z\u0370-\u03ff\u2080-\u2089\u2070-\u207f\u221a])/g,
        "$1 \u2212 ",
      )
      // Unary minus at the start of a value: `= -1/2`, `(-8)`, `, -4`.
      .replace(/(^|[=(\[,:]\s*)-\s*(?=[\d(.])/g, "$1\u2212")
      // A minus as the very first character of the expression.
      .replace(/^\s*-\s*(?=[\d(])/g, "\u2212")
      .replace(/\u2212 {2,}/g, "\u2212 ")
      .replace(/ {2,}\u2212/g, " \u2212")
  );
}

/** `\sqrt[3]{8}` style degree marker that the font can still draw. */
function superscriptSuffix(degree: string): string {
  return allMappable(degree, SUPERSCRIPTS) ? toScript(degree, SUPERSCRIPTS) : `[${degree}]`;
}

/** Double-struck letters for number sets (ℝ, ℕ, ℤ, ℚ, ℂ). */
function toBlackboard(text: string): string {
  const map: Record<string, string> = {
    R: "\u211d", N: "\u2115", Z: "\u2124", Q: "\u211a", C: "\u2102", P: "\u2119",
  };
  return [...text].map((ch) => map[ch] ?? ch).join("");
}

/** Remove `$...$`, `$$...$$`, `\(...\)`, `\[...\]` wrappers. */
function stripDelimiters(s: string): string {
  const t = s.trim();
  if (t.startsWith("$$") && t.endsWith("$$") && t.length > 4) return t.slice(2, -2).trim();
  if (t.startsWith("$") && t.endsWith("$") && t.length > 2) return t.slice(1, -1).trim();
  if (t.startsWith("\\(") && t.endsWith("\\)")) return t.slice(2, -2).trim();
  if (t.startsWith("\\[") && t.endsWith("\\]")) return t.slice(2, -2).trim();
  return superscriptSubscripts(t);
}

/**
 * Typeset the plain-text sub/superscript shorthand that authors type in prose.
 *
 * Prompts are written by hand, so `B_n and T_n` reaches the renderer with no
 * delimiters at all. Printing that verbatim shows the underscore to a student,
 * and stripping it (`Bn`) loses the meaning, so the single-character suffix is
 * converted to a real subscript. Multi-letter groups (`x_{max}`) and anything
 * inside a `\command` are left alone.
 */
function superscriptSubscripts(text: string): string {
  const sub: Record<string, string> = {
    "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083", "4": "\u2084",
    "5": "\u2085", "6": "\u2086", "7": "\u2087", "8": "\u2088", "9": "\u2089",
    a: "\u2090", e: "\u2091", h: "\u2095", i: "\u1d62", j: "\u2c7c", k: "\u2096",
    l: "\u2097", m: "\u2098", n: "\u2099", o: "\u2092", p: "\u209a", r: "\u1d63",
    s: "\u209b", t: "\u209c", u: "\u1d64", v: "\u1d65", x: "\u2093",
  };
  const sup: Record<string, string> = {
    "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3", "4": "\u2074",
    "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079",
    "+": "\u207a", "\u2212": "\u207b", "-": "\u207b", "=": "\u207c", "(": "\u207d",
    ")": "\u207e", n: "\u207f", i: "\u2071",
  };
  return text
    .replace(/\b([A-Za-z])_([0-9A-Za-z])(?![\w{])/g, (m, base: string, s1: string) =>
      sub[s1] ? base + sub[s1] : m,
    )
    // A sign belongs to the exponent: "u^(-1)" is u raised to minus one, and
    // printing "u⁻(1)" or leaving the brackets reads as a different expression.
    .replace(/\b([A-Za-z])\^\(([+-]?)([0-9A-Za-z]+)\)/g, (m, base: string, sign: string, digits: string) => {
      const all = [...(sign ? [sign] : []), ...digits].map((ch) => sup[ch]);
      return all.every(Boolean) ? base + all.join("") : m;
    })
    .replace(/\b([A-Za-z])\^([0-9A-Za-z])(?![\w{])/g, (m, base: string, s1: string) =>
      sup[s1] ? base + sup[s1] : m,
    );
}

/**
 * Final sweep: normalise spacing, drop anything that is still LaTeX syntax, and
 * guarantee no command name is preceded by a stray backslash.
 */
function tidy(s: string): string {
  const t = s
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    // Any backslash that survived belongs to a syntax we do not print.
    .replace(/\\/g, "")
    // Collapse the spacing our brace removal can leave around operators.
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s{2,}/g, " ")
    .trim();
  return t;
}
