import { latexToUnicode } from "./latexToUnicode";

/**
 * Render prose that mixes English with LaTeX into printable Unicode text.
 *
 * Question prompts are authored as markdown-ish prose with `$...$` maths inside.
 * This function finds the maths, converts it, and leaves the prose alone — while
 * making sure a currency amount (`$25 000`) is never mistaken for the start of an
 * inline formula, and that no LaTeX command survives into the PDF.
 *
 * Used by both the candidate paper and the results view so a student reads the
 * same expression in both places.
 */

/** Commands that mark the start of real maths rather than a currency amount. */
const MATH_COMMAND =
  /\\(?:frac|dfrac|tfrac|cfrac|sqrt|times|div|pm|mp|cdot|circ|leq|geq|neq|le|ge|ne|approx|equiv|sim|propto|infty|sum|prod|int|oint|lim|log|ln|exp|sin|cos|tan|theta|alpha|beta|gamma|delta|Delta|lambda|mu|pi|sigma|omega|phi|rho|tau|nu|xi|zeta|eta|iota|kappa|psi|chi|upsilon|bar|overline|hat|vec|tilde|dot|left|right|binom|begin|end|quad|qquad|text|mathrm|mathbf|mathbb|operatorname|angle|triangle|perp|parallel|in|notin|subset|subseteq|cup|cap|emptyset|emptyset|rightarrow|leftarrow|to|Rightarrow|Leftrightarrow|ldots|cdots|dots|prime|partial|nabla|forall|exists|varphi|varepsilon)\b/;

/**
 * A `$` opens an inline formula only when a matching `$` closes it and the
 * content reads like maths. Amounts such as "$25 000 in Year 1" and "$50 and
 * $60" therefore stay as money.
 */
function findInlineMath(text: string): { start: number; end: number; body: string } | null {
  let from = 0;
  while (from < text.length) {
    const open = text.indexOf("$", from);
    if (open < 0) return null;
    const after = text.slice(open + 1);

    // A price is "$" followed immediately by an amount that ends at a word
    // boundary — "$25 000 in Year 1", "$50 and". TeX maths never starts a
    // command or a letter directly against the delimiter in this way, so the
    // amount is consumed whole and never becomes a delimiter pair.
    const money = /^\s?\d[\d\s,.]*?(?=\s|$)/.exec(after);
    if (money && !MATH_COMMAND.test(after.slice(0, 1))) {
      const afterAmount = after.slice(money[0].length);
      // Only treat it as money when the next `$` is not the very next character
      // (which would be an empty formula) and no maths keyword follows inline.
      if (!afterAmount.startsWith("$")) {
        from = open + 1 + money[0].length;
        continue;
      }
    }

    const close = after.indexOf("$");
    if (close < 0) return null;
    const body = after.slice(0, close);
    if (!body.trim()) {
      from = open + 1;
      continue;
    }
    return { start: open, end: open + 1 + close + 1, body };
  }
  return null;
}


/** A run of prose, or a maths span, as produced by {@link splitProseMath}. */
export interface ProseMathSegment {
  kind: "text" | "math" | "displayMath";
  value: string;
}

/**
 * Split prose into text and maths spans, applying the currency guard.
 *
 * The rich-text importer needs this rather than a plain `$…$` regex: a prompt
 * like "worth $25 000 in Year 1 … ($V_n = 25 000(0.8)^{n-1}$)" contains three
 * dollar signs on one line, and a naive splitter pairs the *money* with the
 * maths opener. The formula then ends up as plain text and is printed as source.
 */
export function splitProseMath(text: string): ProseMathSegment[] {
  const out: ProseMathSegment[] = [];
  if (!text) return out;
  let buf = "";
  const flush = () => {
    if (buf) out.push({ kind: "text", value: buf });
    buf = "";
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== "$") {
      buf += ch;
      i += 1;
      continue;
    }

    // Display maths: `$$ … $$` on the same block.
    if (text[i + 1] === "$") {
      const close = text.indexOf("$$", i + 2);
      if (close > i + 2) {
        flush();
        out.push({ kind: "displayMath", value: text.slice(i + 2, close).trim() });
        i = close + 2;
        continue;
      }
    }

    // Decide whether this `$` opens a formula or is a currency sign.
    //
    // A price is not identified by the digit alone: "$8 + 13 + 18 + \ldots + 93"
    // is arithmetic, while "$25 000 in Year 1" is money. The pair is examined as
    // a whole — a span containing an operator or a TeX command is maths, and
    // anything else that merely starts with a number is a currency amount.
    const close = text.indexOf("$", i + 1);
    const crossesLine = close > i + 1 && text.slice(i + 1, close).includes("\n");
    if (close > i + 1 && !crossesLine) {
      const body = text.slice(i + 1, close);
      const looksLikeMath = /[+\-*/=<>^_{}\\]/.test(body);
      const startsWithDigit = /^\s?\d/.test(body);
      if (body.trim() && (looksLikeMath || !startsWithDigit)) {
        flush();
        out.push({ kind: "math", value: body.trim() });
        i = close + 1;
        continue;
      }
    }

    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

/** Convert every maths span in a block of prose. */
export function renderMathProse(input: string): string {
  if (!input) return "";
  // Some prompts were pasted in with escaped newlines, so the stored text holds
  // a literal backslash-n instead of a break. Printing that shows "\n" to the
  // student, so the escapes become real line breaks first.
  let s = input.replace(/\\r\\n|\\n/g, "\n");

  // Display maths first, so its `$$` cannot be read as two inline delimiters.
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, body: string) => ` ${latexToUnicode(body)} `);
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, body: string) => ` ${latexToUnicode(body)} `);
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, body: string) => latexToUnicode(body));

  // Inline maths, matched with the currency guard.
  for (let guard = 0; guard < 200; guard += 1) {
    const span = findInlineMath(s);
    if (!span) break;
    s = `${s.slice(0, span.start)}${latexToUnicode(span.body)}${s.slice(span.end)}`;
  }

  // Markdown emphasis is formatting, never content, so its delimiters are
  // always removed. This matters more than it looks: the rich-text splitter cuts
  // a prompt at every `$…$`, which separates "**(i) " from "**   **(ii) " into
  // different text nodes, so only stripping *pairs* left stray "**" in print.
  //
  // This has to happen *before* the bare-LaTeX fallback below. Emphasis marks
  // sitting next to a stray `$` ("**Find** its Year 4 value $V_4$") otherwise
  // make the block look like undelimited LaTeX, and the converter then eats the
  // delimiters instead of the renderer seeing them as maths.
  s = s.replace(/\*\*+/g, "");
  s = s.replace(/(^|\s)\*([^*\n]+?)\*(?=\s|$)/g, "$1$2");
  s = s.replace(/(^|\s)_([^_\n]+?)_(?=\s|$)/g, "$1$2");

  // A prompt may carry bare LaTeX with no delimiters at all (content authored in
  // the rich editor, or a student's own typed maths). Convert the whole block
  // when it clearly contains commands, so nothing is printed as source.
  if (MATH_COMMAND.test(s)) s = latexToUnicode(s);

  // Whatever the source, a surviving `$` or `\command` is a typesetting bug the
  // student would see. Strip the delimiters and any stray emphasis marks.
  s = s.replace(/\$/g, "");
  s = s.replace(/\*{2,}/g, "");

  // A bulleted list inside a prompt is one item per line. Keeping the existing
  // breaks (and adding one before a bullet that follows prose) turns a run-on
  // sentence back into the list its author wrote.
  s = s.replace(/([^\n\s])\s*\u2022\s*/g, "$1\n\u2022 ");
  s = s.replace(/^[ \t]*\u2022[ \t]*/gm, "\u2022 ");

  return tidyProse(s);
}

/**
 * Typeset the bare sub/superscript shorthand authors type in prose.
 *
 * A prompt is often written without delimiters at all ("n^2", "u_{25} = 149",
 * "V_n = 25 000(0.8)^{n-1}"). Printing that shows the source to a student, and
 * simply deleting the markers changes the meaning, so the runs are converted to
 * real Unicode subscripts and superscripts. Anything that cannot be expressed
 * that way is left exactly as written rather than approximated.
 */
function typesetBareShorthand(s: string): string {
  const SUB: Record<string, string> = {
    "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083", "4": "\u2084",
    "5": "\u2085", "6": "\u2086", "7": "\u2087", "8": "\u2088", "9": "\u2089",
    n: "\u2099", a: "\u2090", e: "\u2091", i: "\u1d62", o: "\u2092", r: "\u1d63",
    s: "\u209b", t: "\u209c", u: "\u1d64", v: "\u1d65", x: "\u2093", h: "\u2095",
    k: "\u2096", l: "\u2097", m: "\u2098", p: "\u209a", j: "\u2c7c",
    "+": "\u208a", "-": "\u208b", "\u2212": "\u208b",
  };
  const SUP: Record<string, string> = {
    "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3", "4": "\u2074",
    "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079",
    n: "\u207f", i: "\u2071", "+": "\u207a", "-": "\u207b", "\u2212": "\u207b",
  };
  const convert = (body: string, table: Record<string, string>) => {
    const chars = [...body].map((ch) => table[ch]);
    return chars.every(Boolean) ? chars.join("") : null;
  };
  return s
    // Braced groups first: "u_{n+1}", "(0.8)^{n-1}".
    .replace(/([A-Za-z0-9)\]])\^\{([^{}]{1,10})\}/g, (m, base: string, body: string) => {
      const sup = convert(body, SUP);
      return sup ? base + sup : m;
    })
    .replace(/([A-Za-z0-9)\]])_\{([^{}]{1,10})\}/g, (m, base: string, body: string) => {
      const sub = convert(body, SUB);
      return sub ? base + sub : m;
    })
    // Then the single-character shorthand: "n^2", "V_n", "u^2".
    .replace(/([A-Za-z0-9)])\^(-?[0-9A-Za-z])(?![\w{^])/g, (m, base: string, body: string) => {
      const sup = convert(body, SUP);
      return sup ? base + sup : m;
    })
    .replace(/([A-Za-z0-9)])_([0-9A-Za-z])(?![\w{_])/g, (m, base: string, body: string) => {
      const sub = convert(body, SUB);
      return sub ? base + sub : m;
    });
}

function tidyProse(s: string): string {
  return typesetBareShorthand(s)
    .replace(/[ \t]{2,}/g, " ")
    // A formula that replaced `$…$` keeps the delimiters' neighbours tight:
    // "($V_n$)" must read "(Vₙ)", not "( Vₙ)".
    .replace(/([([{])[ \t]+(?=\S)/g, "$1")
    .replace(/[ \t]+([)\]}])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
