/**
 * Assess Prep multi-part questions (`assess_parts`).
 *
 * One numbered question, several typed parts — (a), (b), a table cell, a gap in
 * a worked solution. Every part is PRODUCED by the student in an input field:
 * there is deliberately no option list anywhere in this module, so a part can
 * never degenerate into a quiz-style selection. Each part carries its own
 * marks, its own accepted answers and its own two progressive hints.
 *
 * The specification lives in `questions.config`:
 *   { parts: AssessPart[], myp_criterion: "A"|"B"|"C"|"D", question_number: n }
 *
 * Server code keeps the full spec (with keys). Candidates only ever receive
 * `publicAssessParts()` — labels, prompts, units and hints, never a key.
 */

export type AssessPartKind = "numeric" | "text" | "expression";

export interface AssessPart {
  /** Stable part id within the question: "a", "b", "c1", … */
  id: string;
  /** Display label, e.g. "(a)". */
  label: string;
  /** What the student is asked for in this part (may be empty when the stem covers it). */
  prompt: string;
  kind: AssessPartKind;
  points: number;
  /** Unit shown after the input, e.g. "km/h". Never part of the key. */
  unit?: string;
  placeholder?: string;
  /** numeric parts */
  answer?: number;
  tolerance?: number;
  /** text / expression parts: accepted variants (first is the model answer). */
  accepted?: string[];
  /** Two progressive hints: nudge, then first-step set-up. Never the answer. */
  hints: [string, string];
  /** MYP strand tag for this part, e.g. "B(ii)" — visible to candidates. */
  strand?: string;
  /**
   * Keyword rubric for short written justifications (text parts): groups of
   * synonymous phrases; the part earns its marks when at least
   * `minKeywordGroups` groups are matched. Never sent to candidates.
   */
  keywords?: string[][];
  minKeywordGroups?: number;
}

export interface PublicAssessPart {
  id: string;
  label: string;
  prompt: string;
  kind: AssessPartKind;
  points: number;
  unit?: string;
  placeholder?: string;
  hints: [string, string];
  strand?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Repair a stored parts list; unusable parts are dropped, never invented. */
export function normaliseAssessParts(raw: unknown): AssessPart[] {
  if (!Array.isArray(raw)) return [];
  const out: AssessPart[] = [];
  for (const entry of raw.slice(0, 12)) {
    if (!isRecord(entry)) continue;
    const id = str(entry.id).trim();
    if (!id || out.some((p) => p.id === id)) continue;
    const kind = (["numeric", "text", "expression"].includes(str(entry.kind))
      ? str(entry.kind)
      : "text") as AssessPartKind;
    const points = num(entry.points);
    if (points === null || points <= 0) continue;
    const hintsRaw = Array.isArray(entry.hints) ? entry.hints : [];
    const hint1 = str(hintsRaw[0]).trim();
    const hint2 = str(hintsRaw[1]).trim();
    if (hint1.length < 8 || hint2.length < 8) continue;
    const part: AssessPart = {
      id,
      label: str(entry.label, `(${id})`).trim() || `(${id})`,
      prompt: str(entry.prompt),
      kind,
      points,
      hints: [hint1, hint2],
    };
    if (str(entry.strand).trim()) part.strand = str(entry.strand).trim().slice(0, 16);
    if (Array.isArray(entry.keywords)) {
      const groups = entry.keywords
        .filter((g): g is unknown[] => Array.isArray(g))
        .map((g) => g.filter((w): w is string => typeof w === "string" && w.trim().length > 0).map((w) => w.trim().toLowerCase()).slice(0, 8))
        .filter((g) => g.length).slice(0, 6);
      if (groups.length) {
        part.keywords = groups;
        const mk = num(entry.minKeywordGroups);
        part.minKeywordGroups = mk !== null && mk >= 1 ? Math.min(groups.length, Math.floor(mk)) : groups.length;
      }
    }
    if (str(entry.unit).trim()) part.unit = str(entry.unit).trim().slice(0, 24);
    if (str(entry.placeholder).trim()) part.placeholder = str(entry.placeholder).trim().slice(0, 60);
    if (kind === "numeric") {
      const answer = num(entry.answer);
      if (answer === null) continue;
      part.answer = answer;
      const tol = num(entry.tolerance);
      part.tolerance = tol !== null && tol >= 0 ? tol : 0;
    } else {
      const accepted = Array.isArray(entry.accepted)
        ? entry.accepted.filter((a): a is string => typeof a === "string" && a.trim().length > 0).map((a) => a.trim()).slice(0, 24)
        : [];
      if (!accepted.length) continue;
      part.accepted = accepted;
    }
    out.push(part);
  }
  return out;
}

export function assessPartsFromConfig(config: Record<string, unknown> | null | undefined): AssessPart[] {
  return normaliseAssessParts(config?.parts);
}

/** Candidate-safe projection: everything except the keys. */
export function publicAssessParts(parts: AssessPart[]): PublicAssessPart[] {
  return parts.map((p) => ({
    id: p.id,
    label: p.label,
    prompt: p.prompt,
    kind: p.kind,
    points: p.points,
    ...(p.unit ? { unit: p.unit } : {}),
    ...(p.placeholder ? { placeholder: p.placeholder } : {}),
    ...(p.strand ? { strand: p.strand } : {}),
    hints: [p.hints[0], p.hints[1]] as [string, string],
  }));
}

/** Model-answer lines for the authorised post-submission reveal. */
export function assessPartSummary(parts: AssessPart[]): string[] {
  return parts.map((p) => {
    if (p.kind === "numeric") {
      const tol = p.tolerance ? ` (± ${p.tolerance})` : "";
      return `${p.label} ${p.answer}${p.unit ? ` ${p.unit}` : ""}${tol}`;
    }
    return `${p.label} ${p.accepted?.[0] ?? ""}`;
  });
}

/* ─── Answer normalisation ─────────────────────────────────────────────── */

const normText = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Canonical form for algebraic answers, so equivalent forms mark equal:
 * case/spacing ignored, × ÷ − normalised, unicode subscripts folded,
 * a leading "a_n =" / "uₙ =" dropped, implicit multiplication made explicit
 * only where unambiguous (4n → 4*n). Fractions stay symbolic ("3/4"), so a
 * student may answer with a fraction or an accepted decimal variant.
 */
export function canonicalExpression(raw: string): string {
  let s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/⁻/g, "-")
    .replace(/⁰/g, "^0").replace(/¹/g, "^1").replace(/²/g, "^2").replace(/³/g, "^3")
    .replace(/⁴/g, "^4").replace(/⁵/g, "^5").replace(/⁶/g, "^6").replace(/⁷/g, "^7")
    .replace(/⁸/g, "^8").replace(/⁹/g, "^9")
    .replace(/ₙ/g, "n").replace(/ₓ/g, "x")
    .replace(/₀/g, "0").replace(/₁/g, "1").replace(/₂/g, "2").replace(/₃/g, "3")
    .replace(/₄/g, "4").replace(/₅/g, "5").replace(/₆/g, "6")
    .replace(/\s+/g, "")
    .replace(/\$/g, "")
    .replace(/\\/g, "");
  // Drop a leading "an=", "un=", "tn=", "a(n)=" or "Mn=" style left-hand side.
  // A multi-letter label is as harmless as a single-letter one: the value to
  // the right of "=" is the candidate's answer.
  s = s.replace(/^[a-z][a-z0-9_]*=/, "");
  s = s.replace(/^\((\d+)\)/, "$1"); // "(3)" → "3"
  // Implicit multiplication: number followed by a letter or "(".
  s = s.replace(/(\d)([a-z(])/g, "$1*$2");
  s = s.replace(/\)([a-z(]|\d)/g, ")*$1");
  s = s.replace(/([a-z])(\d)/g, "$1*$2");
  s = s.replace(/\*\*/g, "^");
  // Commutative sums mark equal ("3+4n" ≡ "4n+3"): sort the top-level
  // additive terms. Division is left untouched — a/b is not b/a.
  if (!s.includes("/")) {
    const terms: string[] = [];
    let depth = 0; let cur = "";
    for (const ch of s) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if ((ch === "+" || ch === "-") && depth === 0 && cur) { terms.push(cur); cur = ch; continue; }
      cur += ch;
    }
    if (cur) terms.push(cur);
    if (terms.length > 1) {
      const parsed = terms.map((term) => term.startsWith("-")
        ? { sign: "-", body: term.slice(1) } : { sign: "+", body: term.replace(/^\+/, "") });
      parsed.sort((a, b) => (a.body < b.body ? -1 : a.body > b.body ? 1 : 0));
      s = parsed.map((term, i) => (i === 0 && term.sign === "+" ? term.body : term.sign + term.body)).join("");
    }
  }
  return s;
}

/**
 * A candidate's arithmetic working, evaluated without `eval`: numbers,
 * brackets and the four operations (plus integer powers). Returns null when
 * the text is not a self-contained expression.
 */
function evaluateArithmetic(expression: string): number | null {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/^]/g);
  if (!tokens || tokens.join("") !== expression.replace(/\s+/g, "")) return null;
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const primary = (): number | null => {
    const token = take();
    if (token === undefined) return null;
    if (token === "(") {
      const value = sum();
      return take() === ")" ? value : null;
    }
    if (token === "+") return primary();
    if (token === "-") { const value = primary(); return value === null ? null : -value; }
    const value = Number(token);
    return Number.isFinite(value) ? value : null;
  };
  const power = (): number | null => {
    const base = primary();
    if (base === null) return null;
    if (peek() !== "^") return base;
    take();
    const exponent = power();
    return exponent === null ? null : Math.pow(base, exponent);
  };
  const product = (): number | null => {
    let value = power();
    while (value !== null && (peek() === "*" || peek() === "/")) {
      const op = take();
      const right = power();
      if (right === null) return null;
      if (op === "/" && right === 0) return null;
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number | null => {
    let value = product();
    while (value !== null && (peek() === "+" || peek() === "-")) {
      const op = take();
      const right = product();
      if (right === null) return null;
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const result = sum();
  return index === tokens.length && result !== null && Number.isFinite(result) ? result : null;
}

export interface NumericParseContext {
  label?: string;
  prompt?: string;
  expected?: number;
  tolerance?: number;
}

function parseSingleNumericToken(token: string): number | null {
  if (!token) return null;
  let s = token.trim();
  // Strip currency
  s = s.replace(/[$£€¥]/g, "").trim();

  // Scientific notation: 2.5 x 10^4, 2.5 * 10^4, 1.5e3, 2.5 x 10^{-3}
  const sciMatch = /^([+-]?\d+(?:\.\d+)?)\s*(?:[x*]|\s*\*\s*)\s*10\s*\^\s*\{?([+-]?\d+)\}?\s*([a-z°]+)?$/i.exec(s);
  if (sciMatch) {
    const base = Number(sciMatch[1]);
    const exp = Number(sciMatch[2]);
    if (Number.isFinite(base) && Number.isFinite(exp)) return base * Math.pow(10, exp);
  }

  // Fraction: 3/4, -1/2
  const frac = /^([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)\s*([a-z°]+)?$/i.exec(s);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (den !== 0 && Number.isFinite(num) && Number.isFinite(den)) return num / den;
  }

  // Mixed fraction: 1 1/2
  const mixed = /^([+-]?\d+)\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*([a-z°]+)?$/i.exec(s);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den !== 0 && Number.isFinite(whole) && Number.isFinite(num) && Number.isFinite(den)) {
      const sign = whole < 0 || Object.is(whole, -0) ? -1 : 1;
      return whole + sign * (num / den);
    }
  }

  // Strip trailing percent
  s = s.replace(/%$/, "").trim();

  // Decimal comma vs thousands comma
  // If "8,75" (1 or 2 digits after single comma):
  if (/^[+-]?\d+,\d{1,2}(?:\s*[a-z°]+)?$/i.test(s)) {
    s = s.replace(",", ".");
  } else {
    // Thousands comma: "1,200", "10,000", "1,000,000"
    s = s.replace(/,(?=\d{3})/g, "");
  }

  // Strip trailing unit letters: cm, kg, mm, hours, etc.
  s = s.replace(/[a-zA-Z°]+$/g, "").trim();

  // Try direct number (also covers 1.5e3)
  const direct = Number(s);
  if (Number.isFinite(direct) && s !== "") return direct;

  // Worked arithmetic working
  if (/[+*/^]/.test(s)) return evaluateArithmetic(s);

  return null;
}

/**
 * Numeric text a student typed, tolerating currency, units, comma decimals,
 * thousands separators, fractions, percentages, a leading label ("mean=21", "The minimum is 5")
 * and worked arithmetic ("18+6=24" → 24).
 * Supports context-aware multi-part extraction and strict anti-conflicting guards.
 */
export function parseStudentNumber(raw: unknown, context: NumericParseContext = {}): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;

  // Replace Unicode minus/dash characters
  s = s.replace(/[\u2212\u2013\u2014]/g, "-");
  // Normalize non-breaking spaces
  s = s.replace(/[\u00a0\u202f]/g, " ");
  // Normalize math multiplication signs
  s = s.replace(/\\times/g, "x").replace(/[\u00d7\u22c5]/g, "*");

  // Check for conflicting values with "or": e.g. "5 or 6"
  if (/\b(?:or|ou)\b/i.test(s)) {
    return null;
  }

  // Try direct single numeric token first
  const direct = parseSingleNumericToken(s);
  if (direct !== null) return direct;

  // Check for labeled clauses or multiple expressions
  const clauses = s.split(/(?:[;,]|\band\b|\bet\b|\n)+/).map((c) => c.trim()).filter(Boolean);
  const parsedClauses: { label: string; valStr: string; value: number }[] = [];

  for (const clause of clauses) {
    const match = /^(.*?)(?:=|:|\bis\b|\bare\b|\bequals\b|\bvaut\b|\best\b)\s*([^=:].*)$/i.exec(clause);
    if (match) {
      const label = match[1].trim().toLowerCase();
      const valStr = match[2].trim();
      const equalsIdx = valStr.lastIndexOf("=");
      const finalValStr = equalsIdx >= 0 ? valStr.slice(equalsIdx + 1).trim() : valStr;
      const num = parseSingleNumericToken(finalValStr);
      if (num !== null) {
        parsedClauses.push({ label, valStr: finalValStr, value: num });
      }
    } else {
      const num = parseSingleNumericToken(clause);
      if (num !== null) {
        parsedClauses.push({ label: "", valStr: clause, value: num });
      } else {
        const leadMatch = /^(?:the\s+)?([a-z_0-9]+)\s+([+-]?\d+(?:\.\d+)?.*)$/i.exec(clause);
        if (leadMatch) {
          const num2 = parseSingleNumericToken(leadMatch[2]);
          if (num2 !== null) {
            parsedClauses.push({ label: leadMatch[1].toLowerCase(), valStr: leadMatch[2], value: num2 });
          }
        }
      }
    }
  }

  if (parsedClauses.length === 1) {
    return parsedClauses[0].value;
  }

  if (parsedClauses.length > 1) {
    const ctxLabel = (context.label || "").toLowerCase().trim();
    const ctxPrompt = (context.prompt || "").toLowerCase().trim();
    const targetKey = ctxLabel || ctxPrompt;

    if (targetKey) {
      const best = parsedClauses.find((c) =>
        (c.label && (targetKey.includes(c.label) || c.label.includes(targetKey))) ||
        (c.label && (
          (c.label.includes("med") && targetKey.includes("med")) ||
          (c.label.includes("mode") && targetKey.includes("mode")) ||
          (c.label.includes("mean") && targetKey.includes("mean")) ||
          (c.label.includes("min") && targetKey.includes("min")) ||
          (c.label.includes("max") && targetKey.includes("max")) ||
          (c.label.includes("range") && targetKey.includes("range")) ||
          (c.label.includes("iqr") && targetKey.includes("iqr")) ||
          (c.label.includes("var") && targetKey.includes("var")) ||
          (c.label.includes("std") && targetKey.includes("std")) ||
          (c.label === "d" && targetKey.includes("d")) ||
          (c.label.includes("u_10") && targetKey.includes("u_10")) ||
          (c.label.includes("u10") && targetKey.includes("u10")) ||
          (c.label.includes("u_6") && targetKey.includes("u_6")) ||
          (c.label.includes("u6") && targetKey.includes("u6")) ||
          (c.label.includes("u_1") && targetKey.includes("u_1")) ||
          (c.label.includes("u1") && targetKey.includes("u1"))
        )),
      );
      if (best) return best.value;
    }

    if (context.expected !== undefined && context.expected !== null) {
      const tol = context.tolerance ?? 0;
      const matchingExpected = parsedClauses.filter((c) => Math.abs(c.value - context.expected!) <= tol);
      if (matchingExpected.length === 1) {
        return matchingExpected[0].value;
      }
    }

    // Conflicting multiple values without context match
    return null;
  }

  // Fallback: if there is exactly one isolated number in the string
  const numberTokens = s.match(/[+-]?\d+(?:\.\d+)?/g);
  if (numberTokens && numberTokens.length === 1) {
    const val = Number(numberTokens[0]);
    if (Number.isFinite(val)) return val;
  }

  return null;
}

const normAnswerText = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Drop a leading "modal class =", "mean =", "answer:" or "[label] =" from an answer. */
const stripAnswerLabel = (s: string): string => {
  const trimmed = s.trim();
  const eqMatch = /^[^=]{1,40}=\s*(.+)$/.exec(trimmed);
  if (eqMatch) return eqMatch[1].trim();
  const colonMatch = /^[a-zA-Z0-9_\s]{1,40}:\s*(.+)$/.exec(trimmed);
  if (colonMatch) return colonMatch[1].trim();
  const isMatch = /^(?:the\s+)?[a-zA-Z0-9_\s]{1,30}\s+(?:is|are|equals)\s+(.+)$/i.exec(trimmed);
  if (isMatch) return isMatch[1].trim();
  return trimmed;
};

const editDistanceAtMostOne = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 6) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

/** True when a written answer is the same word up to one typo. */
export function spellingMatches(given: string, accepted: string): boolean {
  const a = normAnswerText(given).replace(/[.!]$/, "");
  const b = normAnswerText(accepted).replace(/[.!]$/, "");
  if (!a || !b) return false;
  if (a === b) return true;
  const aw = a.split(/[^a-z0-9%./:-]+/).filter(Boolean);
  const bw = b.split(/[^a-z0-9%./:-]+/).filter(Boolean);
  if (aw.length !== bw.length || aw.length === 0) return false;
  let differences = 0;
  for (let i = 0; i < aw.length; i++) {
    if (aw[i] === bw[i]) continue;
    if (!editDistanceAtMostOne(aw[i], bw[i])) return false;
    differences++;
  }
  // "quantitative discrite" still names both required words.
  return differences === 1;
}

/**
 * Written-answer equivalence used by every text-bearing question type:
 * case/spacing-insensitive exact match, a label-stripped variant
 * ("modal class = 20-30"), numeric equivalence (1/2 = 0.5 = 50%), algebraic
 * equivalence where enabled, a single typo in a word answer, and a
 * comma-separated list that contains an accepted value.
 */
export function textAnswersMatch(given: string, accepted: string, options: { expression?: boolean } = {}): boolean {
  if (typeof given !== "string" || typeof accepted !== "string") return false;
  const g = normAnswerText(given);
  const a = normAnswerText(accepted);
  if (!g || !a) return false;
  if (g === a) return true;
  // Conflicting choices with "or" should not match a single expected value
  if (/\b(?:or|ou)\b/i.test(g) && !/\b(?:or|ou)\b/i.test(a)) return false;
  const gStripped = normAnswerText(stripAnswerLabel(g));
  const aStripped = normAnswerText(stripAnswerLabel(a));
  if (gStripped === aStripped) return true;
  const gNumber = parseStudentNumber(gStripped);
  const aNumber = parseStudentNumber(aStripped);
  if (gNumber !== null && aNumber !== null && Math.abs(gNumber - aNumber) < 1e-9) return true;
  // A percentage is the same quantity as its decimal (50% = 0.5), but only
  // when the *other* side is written as a decimal, not as the number 50.
  if (gNumber !== null && aNumber !== null) {
    if (/%$/.test(gStripped) && !/%$/.test(aStripped) && Math.abs(gNumber / 100 - aNumber) < 1e-9) return true;
    if (/%$/.test(aStripped) && !/%$/.test(gStripped) && Math.abs(aNumber / 100 - gNumber) < 1e-9) return true;
  }
  if (options.expression && canonicalExpression(g) === canonicalExpression(a)) return true;
  if (spellingMatches(gStripped, aStripped)) return true;
  // "1/2, 0.5, 4/8, 50%" is a list of equivalent values, not one value.
  if (/[,;]/.test(g)) {
    const parts = g.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1 && parts.some((part) => textAnswersMatch(part, accepted, options))) return true;
  }
  return false;
}

export interface AssessPartScore {
  isCorrect: boolean | null;
  points: number;
  perPart: { id: string; earned: number; max: number; correct: boolean }[];
}

/**
 * Score an `assess_parts` answer payload `{ parts: { [id]: string } }`.
 * Partial credit per part; a question is "correct" only when every part
 * earns full marks. Parts never penalise beyond zero.
 */
export function scoreAssessParts(parts: AssessPart[], answer: unknown, maxOverride?: number | null): AssessPartScore {
  const payload = isRecord(answer) && isRecord(answer.parts) ? answer.parts : {};
  const perPart = parts.map((part) => {
    const given = payload[part.id];
    let correct = false;
    if (part.kind === "numeric") {
      const got = parseStudentNumber(given, {
        label: part.label,
        prompt: part.prompt,
        expected: part.answer,
        tolerance: part.tolerance,
      });
      const tol = part.tolerance ?? 0;
      correct = got !== null && part.answer !== undefined && (
        Math.abs(got - part.answer) <= tol ||
        (/%/.test(String(given ?? "")) && Math.abs(got / 100 - part.answer) <= tol) ||
        (part.unit === "%" && Math.abs(got * 100 - part.answer) <= tol)
      );
    } else if (part.kind === "expression") {
      const got = typeof given === "string" ? canonicalExpression(given) : "";
      correct = got.length > 0 && (part.accepted ?? []).some((a) => canonicalExpression(a) === got);
    } else if (part.keywords?.length) {
      // Keyword rubric: credit an accepted variant (or a single typo), or when
      // enough concept groups are present, so a correct justification in the
      // student's own words still scores. The raw text is used for keywords:
      // stripping "yes … =" would throw away a legitimate reason.
      const got = typeof given === "string" ? normText(given) : "";
      const exact = got.length > 0 && (part.accepted ?? []).some((a) => textAnswersMatch(got, a));
      const matched = part.keywords.filter((group) => group.some((w) => got.includes(normText(w)))).length;
      correct = exact || (got.length > 0 && matched >= (part.minKeywordGroups ?? part.keywords.length));
    } else {
      const got = typeof given === "string" ? normText(given) : "";
      correct = got.length > 0 && (part.accepted ?? []).some((a) => textAnswersMatch(got, a));
    }
    return { id: part.id, earned: correct ? part.points : 0, max: part.points, correct };
  });
  const earned = perPart.reduce((s, p) => s + p.earned, 0);
  const total = perPart.reduce((s, p) => s + p.max, 0);
  const scale = maxOverride !== null && maxOverride !== undefined && total > 0 ? Number(maxOverride) / total : 1;
  return {
    isCorrect: perPart.length > 0 && perPart.every((p) => p.correct),
    points: Math.round(earned * scale * 100) / 100,
    perPart,
  };
}
