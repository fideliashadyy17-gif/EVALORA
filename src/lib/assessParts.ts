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
    .replace(/ₙ/g, "n").replace(/ₓ/g, "x")
    .replace(/₀/g, "0").replace(/₁/g, "1").replace(/₂/g, "2").replace(/₃/g, "3")
    .replace(/₄/g, "4").replace(/₅/g, "5").replace(/₆/g, "6")
    .replace(/\s+/g, "")
    .replace(/\$/g, "")
    .replace(/\\/g, "");
  // Drop a leading "an=", "un=", "tn=", "a(n)=" style left-hand side.
  s = s.replace(/^[a-z](?:_?\{?n\}?|\(n\))=/, "");
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

/** Numeric text a student typed, tolerating units, commas, fractions, %. */
export function parseStudentNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let s = raw.trim().toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  if (!s) return null;
  s = s.replace(/%$/, "");
  const frac = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(s);
  if (frac) {
    const den = Number(frac[2]);
    return den === 0 ? null : Number(frac[1]) / den;
  }
  // Strip a trailing unit made of letters (km/h, cm, students…) — keep digits.
  s = s.replace(/[a-z/]+$/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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
      const got = parseStudentNumber(given);
      correct = got !== null && part.answer !== undefined && Math.abs(got - part.answer) <= (part.tolerance ?? 0);
    } else if (part.kind === "expression") {
      const got = typeof given === "string" ? canonicalExpression(given) : "";
      correct = got.length > 0 && (part.accepted ?? []).some((a) => canonicalExpression(a) === got);
    } else if (part.keywords?.length) {
      // Keyword rubric: credit an exact accepted variant, or when enough
      // concept groups are present, so a correct justification in the
      // student's own words still scores.
      const got = typeof given === "string" ? normText(given) : "";
      const exact = got.length > 0 && (part.accepted ?? []).some((a) => normText(a) === got);
      const matched = part.keywords.filter((group) => group.some((w) => got.includes(normText(w)))).length;
      correct = exact || (got.length > 0 && matched >= (part.minKeywordGroups ?? part.keywords.length));
    } else {
      const got = typeof given === "string" ? normText(given) : "";
      correct = got.length > 0 && (part.accepted ?? []).some((a) => normText(a) === got);
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
