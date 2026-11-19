import katex from "katex";
import type { RichDoc, RichNode } from "./content";

/**
 * Detects whether a mathInline or mathBlock node was corrupted by an
 * unescaped currency dollar sign or accidental markdown inclusion.
 */
export function isCorruptedProseMath(latex: string): boolean {
  if (!latex) return false;
  // Contains markdown formatting artifacts
  if (latex.includes("**")) return true;
  // Contains unescaped LaTeX comment followed by english text
  if (/%\s*[a-zA-Z]/.test(latex)) return true;
  // Contains common English prose words (3 or more words with spaces, not in \text{})
  const withoutTextCmds = latex.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\{[^}]*\}/g, "");
  if (/\b[a-zA-Z]{3,}\s+[a-zA-Z]{2,}\s+[a-zA-Z]{3,}\b/.test(withoutTextCmds)) return true;
  // Contains prose phrases with unmatched parenthesis e.g. "retains 80% ... ("
  if (/^[^(]*\)\s*[a-zA-Z]/.test(latex) || /[a-zA-Z]\s*\([^)]*$/.test(latex)) return true;
  return false;
}

/**
 * Checks if a rich document contains any corrupted math nodes.
 */
export function docHasCorruptedMath(doc: RichDoc | null | undefined): boolean {
  if (!doc?.content) return false;
  let corrupted = false;
  const walk = (node: RichNode) => {
    if (node.type === "mathInline" || node.type === "mathBlock") {
      if (isCorruptedProseMath(String(node.attrs?.latex ?? ""))) {
        corrupted = true;
      }
    }
    if (node.content) node.content.forEach(walk);
  };
  walk(doc);
  return corrupted;
}

/**
 * Safe KaTeX string renderer that will not throw.
 */
function safeKatex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: false,
    });
  } catch {
    return tex;
  }
}

/**
 * Renders mathematical expressions, converts markdown artifacts cleanly,
 * and formats question marks discreetly in the presentation layer.
 */
export function renderMathAndFormatting(text: string): string {
  if (!text) return "";

  // 1. Protect currency amounts e.g. $25 000 in Year 1 or standalone $10 240
  const currencyMap = new Map<string, string>();
  let currencyCount = 0;
  const saveCurrency = (_match: string, amt: string) => {
    const key = `@@CURR_${currencyCount++}@@`;
    currencyMap.set(key, `$${amt}`);
    return key;
  };

  let s = text.replace(/(?<=\bworth\s+)\$([0-9\s,]+)/gi, saveCurrency);
  s = s.replace(/\$([0-9\s,]+)(?=\s+(?:in|of|year|month|day|per|each|worth|costs?|paying|total)\b)/gi, saveCurrency);
  s = s.replace(/(?<=^|[\s(])\$([0-9]{1,3}(?:[\s,][0-9]{3})*(?:\.[0-9]+)?)(?=$|[),.;]\s*$)/g, saveCurrency);

  // 2. Extract and protect display math: $$...$$ and \[...\]
  const mathMap = new Map<string, string>();
  let mathCount = 0;

  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => {
    const key = `@@MATH_DISP_${mathCount++}@@`;
    mathMap.set(key, safeKatex(tex, true));
    return key;
  });

  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) => {
    const key = `@@MATH_DISP_${mathCount++}@@`;
    mathMap.set(key, safeKatex(tex, true));
    return key;
  });

  // 3. Extract and protect inline math: $...$ and \(...\)
  s = s.replace(/\$([^$\n]+?)\$/g, (_, tex: string) => {
    const key = `@@MATH_INL_${mathCount++}@@`;
    mathMap.set(key, safeKatex(tex, false));
    return key;
  });

  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) => {
    const key = `@@MATH_INL_${mathCount++}@@`;
    mathMap.set(key, safeKatex(tex, false));
    return key;
  });

  // 4. Extract raw LaTeX commands outside delimiters:
  // e.g. \frac{1}{2}, \sqrt{15}, \mu, \sigma, \le, \ge, \times, \sum_{i=1}^n, \Delta_n, u_{10}
  s = s.replace(/(\\([a-zA-Z]+)(?:\{[^}]*\}|\[[^\]]*\])*(?:[_^](?:\{[^}]*\}|[0-9a-zA-Z]))*)/g, (match) => {
    try {
      const rendered = safeKatex(match, false);
      const key = `@@MATH_INL_${mathCount++}@@`;
      mathMap.set(key, rendered);
      return key;
    } catch {
      return match;
    }
  });

  // 5. Present question marks cleanly and discreetly:
  // e.g. **[2 marks]**, [2 marks], [10 marks], [10 mks], [3], [4] -> (2 marks)
  s = s.replace(/(?<!\\)\*{0,2}\[(\d+)\s*(?:marks?|mks?)?\]\*{0,2}/gi, (_, pts: string) => {
    const n = parseInt(pts, 10);
    return `<span class="exam-mark-discreet text-xs font-normal text-ink-soft opacity-85 ml-1 inline-block">(${n} mark${n === 1 ? "" : "s"})</span>`;
  });

  // 6. Clean triple or more asterisks formatting artifacts (e.g. *** dividers)
  s = s.replace(/\*{3,}/g, "");

  // 7. Handle Markdown bold: **text**
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");

  // 8. Clean any stray leftover double asterisks
  s = s.replace(/\*\*/g, "");

  // 9. Escape raw < when not part of generated HTML tags
  s = s.replace(/<(?![a-zA-Z/])/g, "&lt;");

  // 10. Handle line breaks
  s = s.replace(/\n/g, "<br/>");

  // 11. Restore math blocks
  for (const [key, rendered] of mathMap.entries()) {
    s = s.replace(key, () => rendered);
  }

  // 12. Restore protected currency
  for (const [key, curr] of currencyMap.entries()) {
    s = s.replace(key, () => curr);
  }

  return s;
}
