/**
 * Automatic marking for constructed-response (`open_ended`) examination
 * questions.
 *
 * `src/lib/scoring.ts` deliberately refuses to score an `open_ended` answer:
 * there is no option key to compare against, so the mark has historically been
 * left to a human. That is fine for a two-question homework but not for a
 * summative paper where constructed response carries 260 of the 400 marks —
 * the candidate submits and sees nothing.
 *
 * This module closes that gap without inventing a second, incompatible marking
 * system. It reuses the repository's existing pieces:
 *
 *   · `src/lib/assessParts.ts`  `canonicalExpression` for algebraic form
 *   · `src/lib/mathExpr.ts`     the safe (non-`eval`) expression compiler for
 *                               numeric and symbolic equivalence
 *   · `src/lib/responseTools.ts` `StructuredAnswer`, the shape a candidate's
 *                               constructed response is actually stored in
 *
 * Everything is driven by a **machine-readable rubric** attached to the
 * question (`questions.config.auto_marking`). The rubric is transcribed from
 * the mark scheme the source paper prints; it never guesses. Where a part
 * genuinely cannot be decided by deterministic mathematics (a "write a short
 * report" part, for instance) the part is marked by the AI marker when a
 * provider is configured and otherwise falls back to its keyword rules, so the
 * candidate is still shown a result. An uninterpretable or empty response is
 * surfaced as `needs_review` — an explicit exception state — and is never
 * silently recorded as zero.
 */

import { canonicalExpression } from "./assessParts";
import { compileExpression, type CompiledExpression } from "./mathExpr";

// ---------------------------------------------------------------------------
// Rubric schema
// ---------------------------------------------------------------------------

/**
 * `number`          the answer must contain this value (within `tol`).
 * `numbers`         the answer must contain the listed values; `grouped`
 *                   requires them to appear together (a real list, not digits
 *                   scattered across the script), `scale: false` requires all.
 * `anyNumber`       the answer must contain one of the listed values.
 * `expr`            an algebraic form, compared canonically and by sampling.
 * `anyExpr`         one of several equivalent algebraic forms.
 * `words`           concept groups: each group is a list of synonyms; credit is
 *                   proportional to the number of distinct groups evidenced.
 * `allWords`        every phrase must appear — used for method marks.
 * `followThrough`   accept a value derived from a value the candidate wrote
 *                   earlier, so a wrong-but-consistent start is not punished
 *                   twice.
 * `ai`              refine with the AI marker when one is configured.
 */
export type MarkRule =
  | { kind: "number"; value: number; tol?: number; marks: number; note?: string }
  | {
      kind: "numbers";
      values: number[];
      tol?: number;
      marks: number;
      note?: string;
      /** Credit proportionally (default) or require the complete set. */
      scale?: boolean;
      /** Require the values to appear together, as a real listing. */
      grouped?: boolean;
    }
  | { kind: "anyNumber"; values: number[]; tol?: number; marks: number; note?: string }
  | { kind: "expr"; expr: string; vars?: string[]; marks: number; note?: string }
  | { kind: "anyExpr"; exprs: string[]; vars?: string[]; marks: number; note?: string }
  | { kind: "words"; groups: string[][]; marks: number; note?: string }
  | { kind: "allWords"; words: string[]; marks: number; note?: string }
  | {
      kind: "followThrough";
      /** Expression in `prev`, e.g. "7 + 24 + 15 + sqrt(prev^2 - 15^2)". */
      derive: string;
      marks: number;
      note?: string;
      /** Only try earlier values inside this range. */
      min?: number;
      max?: number;
    }
  | { kind: "ai"; marks: number; focus: string; note?: string };

export interface RubricPart {
  label: string;
  marks: number;
  focus?: string;
  rules: MarkRule[];
}

export interface AutoMarkRubric {
  version: 1;
  criterion?: string;
  /** Maximum mark for the whole question. Defaults to the sum of the parts. */
  total?: number;
  parts: RubricPart[];
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export type PartStatus = "marked" | "needs_review";
export type MarkStatus = "marked" | "partial" | "needs_review";

export interface PartMark {
  label: string;
  max: number;
  marks: number;
  status: PartStatus;
  /** Short human explanation of how the mark was reached. */
  note: string;
  focus?: string;
}

export interface AutoMarkResult {
  marks: number;
  max: number;
  /** null → the answer could not be decided and must not be shown as wrong. */
  isCorrect: boolean | null;
  status: MarkStatus;
  parts: PartMark[];
  /** Marks that still require a human decision. */
  pending: number;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Reading what the candidate wrote
// ---------------------------------------------------------------------------

/**
 * Mathematical Unicode a candidate pastes or the maths keyboard inserts, in
 * the words a marker would use. Doing this before the LaTeX passes means a
 * "P ∩ T" typed on the keyboard and a "$P \cap T$" written in LaTeX are read
 * identically.
 */
const UNICODE_MATH: [RegExp, string][] = [
  [/∩/g, " intersection "],
  [/∪/g, " union "],
  [/∈/g, " in "],
  [/∅/g, " empty set "],
  [/⊂|⊆/g, " subset of "],
  [/≤/g, " <= "],
  [/≥/g, " >= "],
  [/≠/g, " != "],
  [/≈/g, " ~ "],
  [/⊥/g, " perpendicular "],
  [/∥/g, " parallel "],
  [/∠/g, " angle "],
  [/△/g, " triangle "],
  [/(\d)\s*√\s*(\d+)/g, "$1*sqrt($2)"],
  [/√\s*(\d+)/g, "sqrt($1)"],
  [/√/g, " sqrt "],
  [/π/g, " pi "],
  [/θ/g, " theta "],
  [/Σ/g, " Sigma "],
  [/σ/g, " sigma "],
  [/µ|μ/g, " mean "],
  [/°/g, " degrees "],
  [/×/g, " * "],
  [/÷/g, " / "],
  [/·/g, " * "],
  [/−/g, "-"],
  [/…/g, " "],
  [/’|‘/g, "'"],
  [/“|”/g, '"'],
];

const LATEX_PASSES: [RegExp, string][] = [
  // Fractions first: \frac{a}{b} → (a)/(b). Repeated so nesting collapses.
  [/\\(?:d|t|c)?frac\s*\{(-?[\d.]+)\}\s*\{(-?[\d.]+)\}/g, "$1/$2"],
  [/\\(?:d|t|c)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)"],
  [/\\(?:d|t|c)?frac\s*(\d)\s*(\d)/g, "($1)/($2)"],
  [/\\sqrt\s*\[[^\]]*\]\s*\{([^{}]*)\}/g, "sqrt($1)"],
  [/\\sqrt\s*\{([^{}]*)\}/g, "sqrt($1)"],
  [/\\sqrt\s*(\d)/g, "sqrt($1)"],
  [/\\times/g, "*"],
  [/\\cdot/g, "*"],
  [/\\div/g, "/"],
  [/\\pm/g, "+-"],
  [/\\left|\\right|\\!|\\,|\\;|\\:/g, " "],
  [/\\%/g, "%"],
  [/\\text\s*\{([^{}]*)\}/g, "$1"],
  [/\\mathrm\s*\{([^{}]*)\}/g, "$1"],
  [/\\mbox\s*\{([^{}]*)\}/g, "$1"],
  [/\\dot\s*\{?(\d)\}?/g, "$1"],
  [/\\bar\s*\{?(\d)\}?/g, "$1"],
  [/\\hat\s*\{?(\w)\}?/g, "$1"],
  [/\\overline\s*\{([^{}]*)\}/g, "$1"],
  [/\\angle/g, " angle "],
  [/\\triangle/g, " triangle "],
  [/\\circ/g, " degrees "],
  [/\\Sigma/g, " Sigma "],
  [/\\sum/g, " Sigma "],
  [/\\sigma/g, " sigma "],
  [/\\mu\b/g, " mean "],
  [/\\pi\b/g, " pi "],
  [/\\theta/g, " theta "],
  [/\\infty/g, " infinity "],
  [/\\le\b|\\leq\b/g, " <= "],
  [/\\ge\b|\\geq\b/g, " >= "],
  [/\\ne\b|\\neq\b/g, " != "],
  [/\\approx/g, " ~ "],
  [/\\Rightarrow|\\implies/g, " => "],
  [/\\therefore/g, " therefore "],
  [/\\in\b/g, " in "],
  [/\\cup\b/g, " union "],
  [/\\cap\b/g, " intersection "],
  [/\\emptyset/g, " empty set "],
  [/\\xi\b/g, " xi "],
  [/\\mathbb\{Q\}/g, " rational numbers "],
  [/\\mathbb\{R\}/g, " real numbers "],
  [/\\quad|\\qquad/g, "  "],
  [/\\/g, " "],
];

/** Reduce LaTeX to something a plain-text scanner can read. */
export function latexToPlain(raw: string): string {
  let out = String(raw ?? "");
  for (const [pattern, replacement] of UNICODE_MATH) out = out.replace(pattern, replacement);
  for (let pass = 0; pass < 3; pass += 1) {
    for (const [pattern, replacement] of LATEX_PASSES) out = out.replace(pattern, replacement);
  }
  return out
    .replace(/[{}]/g, " ")
    .replace(/(\d)\s*sqrt\s*\(/g, "$1*sqrt(")
    .replace(/\)\s*\(/g, ")*(")
    .replace(/\s+/g, " ")
    .trim();
}

function compileOrNull(source: string): CompiledExpression | null {
  const compiled = compileExpression(source);
  return compiled.ok ? compiled : null;
}

function evaluateConstant(source: string): number | null {
  const compiled = compileOrNull(source);
  if (!compiled) return null;
  try {
    const value = compiled.evaluate(0);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * One ordered pass over the response: every value a candidate wrote, in the
 * order they wrote it, so a later part can tell "a list of six elements" from
 * six digits that merely happen to appear somewhere in the script.
 */
const NUMBER_ATOM = "(?:sqrt\\s*\\(\\s*)?-?\\d+(?:\\.\\d+)?\\s*\\)?";
const VALUE_RE = new RegExp(
  [
    // 1.18 * 10^{9}  /  1.18 * 10^9
    "(-?\\d+(?:\\.\\d+)?)\\s*\\*\\s*10\\s*(?:\\*\\*|\\^)\\s*\\{?\\s*(-?\\d+)\\s*\\}?",
    // 13 500 (thin / non-breaking / ordinary space as the thousands separator)
    "\\d{1,3}(?:[     ]\\d{3})+",
    // 1,800
    "\\d{1,3}(?:,\\d{3})+",
    // 25 %
    "(-?\\d+(?:\\.\\d+)?)\\s*%",
    // 7/8  |  6 + 5 - 1  |  2*sqrt(2)
    `${NUMBER_ATOM}(?:\\s*[+\\-*/^]\\s*${NUMBER_ATOM})+`,
    // 1800
    "-?\\d+(?:\\.\\d+)?",
  ].join("|"),
  "g",
);

export interface NumberHit {
  value: number;
  /** Character offset in the normalised text — ordering evidence. */
  start: number;
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * Every number the candidate wrote, however they wrote it — 1 800 / 1,800 /
 * 1800, 7/8, \frac{7}{8}, 2\sqrt2, 1.18\times10^{9}, 25 % (recorded both as 25
 * and as 0.25) — in the order they appear.
 */
export function extractNumberHits(raw: string): NumberHit[] {
  const text = latexToPlain(raw);
  const hits: NumberHit[] = [];
  const push = (value: number, start: number) => {
    if (Number.isFinite(value)) hits.push({ value: round6(value), start });
  };

  for (const match of text.matchAll(VALUE_RE)) {
    const start = match.index ?? 0;
    const written = match[0];

    if (match[1] !== undefined && match[2] !== undefined) {
      push(Number(match[1]) * 10 ** Number(match[2]), start);
      continue;
    }
    if (written.includes("%")) {
      const plain = /(-?\d+(?:\.\d+)?)/.exec(written);
      if (plain) {
        push(Number(plain[1]), start);
        push(Number(plain[1]) / 100, start);
      }
      continue;
    }
    if (/^[\d\u00a0\u202f\u2008 ,]+$/.test(written) && /[     ,]/.test(written)) {
      // A thousands separator: keep the whole number AND its parts, so a
      // table row of "12" then "192" is not misread as a single 12 192.
      push(Number(written.replace(/[\u00a0\u202f ,]/g, "")), start);
      for (const part of written.match(/\d+/g) ?? []) push(Number(part), start);
      continue;
    }
    if (/[+\-*/^]|sqrt/.test(written)) {
      const evaluated = evaluateConstant(written);
      if (evaluated !== null) push(evaluated, start);
      // Keep the parts as well: "15 - 10 = 5" evidences 15, 10 and 5 alike.
      for (const part of written.match(/\d+(?:\.\d+)?/g) ?? []) push(Number(part), start);
      continue;
    }
    push(Number(written), start);
  }

  return hits;
}

/** Convenience wrapper: just the values, in order. */
export function extractNumbers(raw: string): number[] {
  return extractNumberHits(raw).map((hit) => hit.value);
}

/**
 * Whether every value in `values` appears close together in the response.
 *
 * "P = {2, 3, 5, 7, 11, 13}" is evidence that the candidate listed P. Six
 * digits scattered across a page are not — a candidate who writes the right
 * digit for the wrong reason should not be credited for it.
 */
function numbersFoundTogether(hits: NumberHit[], values: number[], tol: number, maxGap: number): boolean {
  if (!values.length) return false;
  const positions: number[][] = values.map((value) =>
    hits.map((hit, i) => (Math.abs(hit.value - value) <= tol ? i : -1)).filter((i) => i >= 0),
  );
  if (positions.some((list) => !list.length)) return false;

  for (const first of positions[0]) {
    const used = new Set<number>([first]);
    let windowEnd = hits[first].start;
    let matched = 1;
    for (let v = 1; v < values.length; v += 1) {
      const next = positions[v]
        .filter((i) => !used.has(i) && hits[i].start >= hits[first].start && hits[i].start - windowEnd <= maxGap)
        .sort((a, b) => hits[a].start - hits[b].start)[0];
      if (next === undefined) break;
      used.add(next);
      windowEnd = Math.max(windowEnd, hits[next].start);
      matched += 1;
    }
    if (matched === values.length) return true;
  }
  return false;
}

interface Surface {
  /** Normalised prose, lower-cased, LaTeX reduced to plain mathematics. */
  text: string;
  /** Every numeric value the candidate wrote, in order with its position. */
  hits: NumberHit[];
  numbers: number[];
}

/**
 * Keys that carry a candidate's meaning. Everything else in a persisted answer
 * is presentation (colours, toggles, layout) and is skipped, so a line width of
 * 2 or a payload version of 1 can never be mistaken for an answer.
 */
const MEANINGFUL_KEYS = new Set([
  "text", "label", "value", "latex", "expression", "note", "title", "content",
  "cells", "rows", "columns", "categories", "points", "stems", "leaves",
  "data_table", "statistics", "graph", "geometry", "venn", "probability_tree",
  "stem_leaf", "doc", "answer", "working", "regions", "items", "functions", "bars", "strokes",
]);

/**
 * Flatten a persisted constructed response into prose plus numbers, including
 * text held inside the maths editor, tables and diagram/graph payloads.
 */
export function answerSurface(answer: unknown): Surface {
  const payload = (answer && typeof answer === "object" ? answer : {}) as Record<string, unknown>;
  const chunks: string[] = [];
  let budget = 4000;

  const collect = (value: unknown, depth = 0): void => {
    if (depth > 6 || budget <= 0 || value === null || value === undefined) return;
    if (typeof value === "string") {
      budget -= 1;
      chunks.push(value);
      return;
    }
    if (typeof value === "number") {
      budget -= 1;
      chunks.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 400).forEach((item) => collect(item, depth + 1));
      return;
    }
    if (typeof value === "object") {
      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
        if (MEANINGFUL_KEYS.has(key)) collect(inner, depth + 1);
      }
    }
  };

  collect(payload);
  const raw = chunks.join(" ");
  const hits = extractNumberHits(raw);

  return {
    text: latexToPlain(raw).toLowerCase(),
    hits,
    numbers: hits.map((hit) => hit.value),
  };
}

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

const numberFound = (haystack: number[], needle: number, tol: number): boolean =>
  haystack.some((candidate) => Math.abs(candidate - needle) <= tol);

const defaultTolerance = (value: number, tol?: number): number => {
  if (typeof tol === "number" && Number.isFinite(tol)) return Math.abs(tol);
  return Math.max(Math.abs(value) * 0.005, 0.005);
};

/** Punctuation and LaTeX noise removed for word matching. */
function normaliseWords(raw: string): string {
  return latexToPlain(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Algebraic equivalence: canonical form first, then numeric sampling.
 *
 * Sampling binds every variable except one to a fixed constant and compares the
 * two remaining one-variable expressions at several points. That accepts
 * 4n − 1, −1 + 4n and 4*n-1 alike, accepts 46 − 7(n − 1) for 53 − 7n, and
 * still rejects a genuinely different rule.
 */
const VARIABLE_NAMES = ["n", "k", "t", "m", "a", "b", "c", "u", "v", "p", "q", "r", "d", "i", "x", "y", "z"];
const FREE_CONSTANTS = [2, 3, 5, 7, 11, 13, 17, 19];

function variablesIn(expression: string): string[] {
  return VARIABLE_NAMES.filter((name) =>
    new RegExp(`(^|[^a-z])${name}([^a-z]|$)`).test(expression),
  );
}

/** Bind every variable but `free` to a constant; rename `free` to x. */
function bindOthers(expression: string, free: string, others: string[]): string {
  let out = expression;
  others.forEach((name, index) => {
    const value = FREE_CONSTANTS[index % FREE_CONSTANTS.length];
    out = out.replace(new RegExp(`(^|[^a-z])${name}([^a-z]|$)`, "g"), `$1${value}$2`);
  });
  return free ? out.replace(new RegExp(`(^|[^a-z])${free}([^a-z]|$)`, "g"), "$1x$2") : out;
}

export function expressionEquivalent(expected: string, surface: Surface, vars?: string[]): boolean {
  const wanted = canonicalExpression(expected);
  if (!wanted) return false;

  // Candidate expressions: split on clause boundaries and take the right-hand
  // side of any "… = …", so "C = 150n" and a bare "150n" both match. A bare
  // token such as "k" or "4n-9" is tried on its own too.
  const candidates = new Set<string>();
  for (const piece of surface.text.split(/[,.;:\n]|=>/)) {
    for (const side of piece.split("=")) {
      const value = side.trim();
      if (value) candidates.add(value);
    }
  }
  for (const token of surface.text.split(/\s+/)) {
    const value = token.replace(/^[=(]+|[=),.;:]+$/g, "").trim();
    if (value) candidates.add(value);
  }

  const preferred = vars ?? [];
  const hasVariable = (text: string) =>
    (preferred.length ? preferred : VARIABLE_NAMES).some((name) =>
      new RegExp(`(^|[^a-z])${name}([^a-z]|$)`).test(text));

  for (const candidate of candidates) {
    if (!/[a-z]/.test(candidate) || !hasVariable(candidate)) continue;

    const got = canonicalExpression(candidate);
    if (got === wanted) return true;

    const all = [...new Set([...variablesIn(wanted), ...variablesIn(got)])];
    const free = preferred.find((name) => all.includes(name)) ?? all[0] ?? "";
    const rest = all.filter((name) => name !== free);
    const compiledExpected = compileOrNull(bindOthers(wanted, free, rest));
    const compiledCandidate = compileOrNull(bindOthers(got, free, rest));
    if (!compiledExpected || !compiledCandidate) continue;

    let agreed = 0;
    for (const sample of [1, 2, 3, 5, 7, 11]) {
      try {
        const a = compiledExpected.evaluate(sample);
        const b = compiledCandidate.evaluate(sample);
        if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(Math.abs(a) * 1e-6, 1e-6)) {
          agreed += 1;
        }
      } catch {
        /* a sample that throws simply does not count as agreement */
      }
    }
    if (agreed >= 4) return true;
  }
  return false;
}

/** Evaluate a derivation, e.g. "7 + 24 + 15 + sqrt(prev^2 - 15^2)". */
function deriveFollowThrough(derive: string, previous: number, fallback: number[]): number | null {
  const expression = derive.replace(/\bprev\b/g, `(${previous})`);
  const value = evaluateConstant(expression);
  return value !== null && numberFound(fallback, value, Math.max(Math.abs(value) * 0.01, 0.05)) ? value : null;
}

interface RuleOutcome {
  marks: number;
  /** Whether the rule could be decided at all (an `ai` rule with no provider cannot). */
  decided: boolean;
  note?: string;
  /** Value the candidate matched, used by a later part for follow-through. */
  matched?: number | null;
}

function evaluateRule(
  rule: MarkRule,
  surface: Surface,
  previousValues: Map<string, number | null>,
  aiAvailable: boolean,
): RuleOutcome {
  switch (rule.kind) {
    case "number": {
      const tol = defaultTolerance(rule.value, rule.tol);
      if (numberFound(surface.numbers, rule.value, tol)) {
        return { marks: rule.marks, decided: true, matched: rule.value };
      }
      return { marks: 0, decided: true, matched: null };
    }
    case "numbers": {
      const scale = Math.max(...rule.values.map(Math.abs), 1);
      const tol = defaultTolerance(scale, rule.tol);
      const hits = rule.values.filter((value) => numberFound(surface.numbers, value, tol));
      if (!hits.length) return { marks: 0, decided: true };
      if (rule.grouped && !numbersFoundTogether(surface.hits, rule.values, tol, 400)) {
        return { marks: 0, decided: true };
      }
      if (rule.scale === false) {
        return { marks: hits.length === rule.values.length ? rule.marks : 0, decided: true };
      }
      return { marks: (rule.marks * hits.length) / rule.values.length, decided: true };
    }
    case "anyNumber": {
      const hit = rule.values.some((value) => numberFound(surface.numbers, value, defaultTolerance(value, rule.tol)));
      return { marks: hit ? rule.marks : 0, decided: true };
    }
    case "expr":
      return { marks: expressionEquivalent(rule.expr, surface, rule.vars) ? rule.marks : 0, decided: true };
    case "anyExpr":
      return {
        marks: rule.exprs.some((expr) => expressionEquivalent(expr, surface, rule.vars)) ? rule.marks : 0,
        decided: true,
      };
    case "words": {
      if (!rule.groups.length) return { marks: 0, decided: true };
      const haystack = normaliseWords(surface.text);
      const hits = rule.groups.filter((group) => group.some((phrase) => haystack.includes(normaliseWords(phrase)))).length;
      return { marks: (rule.marks * hits) / rule.groups.length, decided: true };
    }
    case "allWords": {
      const haystack = normaliseWords(surface.text);
      const hit = rule.words.every((word) => haystack.includes(normaliseWords(word)));
      return { marks: hit ? rule.marks : 0, decided: true };
    }
    case "followThrough": {
      const min = rule.min ?? -Infinity;
      const max = rule.max ?? Infinity;
      const seen = new Set<number>();
      for (const hit of surface.hits) {
        if (hit.value < min || hit.value > max) continue;
        const key = round6(hit.value);
        if (seen.has(key)) continue;
        seen.add(key);
        if (deriveFollowThrough(rule.derive, hit.value, surface.numbers) !== null) {
          return { marks: rule.marks, decided: true, note: "follow-through" };
        }
      }
      return { marks: 0, decided: true };
    }
    case "ai":
      // Prose parts carry a deterministic keyword rule alongside the AI rule.
      // With no provider configured the keyword rule still decides the part so
      // the candidate is never shown a pending result, and the note records
      // that the finer-grained AI judgement was unavailable.
      if (!aiAvailable) return { marks: 0, decided: true, note: "keyword fallback (no AI marker configured)" };
      return { marks: 0, decided: false };
    default:
      return { marks: 0, decided: false };
  }
}

// ---------------------------------------------------------------------------
// Question-level marking
// ---------------------------------------------------------------------------

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Coerce anything stored in `config.auto_marking` into a usable rubric. */
export function normaliseRubric(raw: unknown): AutoMarkRubric | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  if (!Array.isArray(source.parts)) return null;
  const parts: RubricPart[] = [];
  for (const entry of source.parts) {
    if (!entry || typeof entry !== "object") continue;
    const part = entry as Record<string, unknown>;
    const marks = Number(part.marks);
    if (!Number.isFinite(marks) || marks <= 0) continue;
    if (!Array.isArray(part.rules)) continue;
    parts.push({
      label: String(part.label ?? ""),
      marks,
      focus: typeof part.focus === "string" ? part.focus : undefined,
      rules: part.rules as MarkRule[],
    });
  }
  if (!parts.length) return null;
  const total = Number(source.total);
  return {
    version: 1,
    criterion: typeof source.criterion === "string" ? source.criterion : undefined,
    total: Number.isFinite(total) && total > 0 ? total : undefined,
    parts,
  };
}

export interface MarkOptions {
  /** Marks available for the question as a whole. */
  max: number;
  /** Whether an AI marking provider is configured for this deployment. */
  aiAvailable?: boolean;
}

const EMPTY_RESULT = (max: number, reason: string): AutoMarkResult => ({
  marks: 0,
  max,
  isCorrect: null,
  status: "needs_review",
  parts: [],
  pending: max,
  reason,
});

/**
 * Mark one constructed response.
 *
 * The result is always safe to persist: `isCorrect === null` means "not
 * decided", which the results layer reports as pending rather than as a zero.
 */
export function markConstructedResponse(
  rubric: AutoMarkRubric | null,
  answer: unknown,
  options: MarkOptions,
): AutoMarkResult {
  const max = Math.max(0, options.max);
  if (!rubric) return EMPTY_RESULT(max, "No automatic marking rubric is attached to this question.");

  const surface = answerSurface(answer);
  const hasResponse = surface.text.length > 0 || surface.numbers.length > 0;
  if (!hasResponse) return EMPTY_RESULT(max, "The candidate did not submit a response for this question.");

  const aiAvailable = options.aiAvailable === true;
  const previousValues = new Map<string, number | null>();
  const parts: PartMark[] = [];
  let total = 0;
  let pending = 0;
  let undecidedParts = 0;

  for (const part of rubric.parts) {
    let earned = 0;
    let decided = true;
    let lastMatched: number | null = null;
    const notes: string[] = [];

    for (const rule of part.rules) {
      const outcome = evaluateRule(rule, surface, previousValues, aiAvailable);
      earned += outcome.marks;
      if (!outcome.decided) decided = false;
      if (outcome.note) notes.push(outcome.note);
      if (outcome.matched !== null && outcome.matched !== undefined) lastMatched = outcome.matched;
    }

    // A part is capped at its own mark; a part with no decidable rule at all
    // (only AI rules, and no provider) is reported rather than zeroed.
    const onlyAi = part.rules.length > 0 && part.rules.every((rule) => rule.kind === "ai");
    if (onlyAi && !aiAvailable) {
      decided = false;
      notes.push("requires a human or AI marker");
    }

    const capped = round2(Math.min(earned, part.marks));
    const status: PartStatus = decided ? "marked" : "needs_review";

    // Record the value the candidate gave for this part so a later part can
    // follow their (possibly different) figure through to the final answer.
    previousValues.set(part.label, lastMatched);

    if (!decided) {
      undecidedParts += 1;
      pending += part.marks;
    } else {
      total += capped;
    }

    parts.push({
      label: part.label,
      max: part.marks,
      marks: capped,
      status,
      note: notes.join("; ") || (capped >= part.marks ? "full marks" : capped > 0 ? "partial credit" : "not evidenced"),
      focus: part.focus,
    });
  }

  const rubricTotal = rubric.total ?? rubric.parts.reduce((sum, part) => sum + part.marks, 0);
  const ceiling = Math.min(max > 0 ? max : rubricTotal, rubricTotal);
  const marks = round2(Math.min(total, ceiling));

  if (undecidedParts === parts.length) {
    return {
      marks: 0,
      max: ceiling,
      isCorrect: null,
      status: "needs_review",
      parts,
      pending: ceiling,
      reason: "No part of this response could be decided automatically.",
    };
  }

  return {
    marks,
    max: ceiling,
    isCorrect: ceiling > 0 ? marks / ceiling >= 0.5 : false,
    status: undecidedParts > 0 ? "partial" : "marked",
    parts,
    pending: round2(pending),
  };
}
