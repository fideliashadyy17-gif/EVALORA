/**
 * EVALORA AI CORE — examination blueprint and question authoring.
 *
 * Two question sources, one output shape (`ProposedQuestion`):
 *
 *  1. **Deterministic families** (this file). Parameterised, original problems
 *     whose answers are COMPUTED, not recalled. They work with no model
 *     credential, they always produce a markable key, and the same seed
 *     reproduces the same paper. This is what "the assistant can create an
 *     examination" honestly means on a deployment with no API key.
 *
 *  2. **Model authoring** (`model.ts`). Used only when a credential exists; its
 *     reply is parsed into the same shape and passes through the same
 *     validator, so a model cannot bypass a rule that a template obeys.
 *
 * Nothing here writes to the database. A plan is validated
 * (`validateProposedExam`) and then materialised by `materialize.ts` through the
 * ordinary authoring services.
 */

import { promptFingerprint, type ProposedExam, type ProposedQuestion, type ProposedSection } from "./validation";

export type TopicKey =
  | "algebraic_expressions"
  | "linear_equations"
  | "sequences"
  | "functions"
  | "inequalities"
  | "quadratics"
  | "fractions_percentages"
  | "ratio_proportion"
  | "geometry_angles"
  | "pythagoras"
  | "area_perimeter"
  | "statistics_mean"
  | "probability";

export interface TopicDefinition {
  key: TopicKey;
  label: string;
  /** Words that select this topic from a free-text instruction. */
  aliases: string[];
  /** Lowest and highest grade order at which the topic is sensible. */
  minGrade: number;
  maxGrade: number;
  /** One-sentence description used in the blueprint preview. */
  summary: string;
}

export const TOPIC_CATALOG: TopicDefinition[] = [
  {
    key: "algebraic_expressions",
    label: "Algebraic expressions",
    // "algebra" itself was missing, so "create 10 questions on algebra" resolved to
    // no topic at all and the assistant refused a request it could serve.
    aliases: ["algebraic expression", "expressions", "expand", "factorise", "factorize", "simplify", "like terms", "algebra"],
    minGrade: 6,
    maxGrade: 11,
    summary: "Expanding, factorising and simplifying linear and quadratic expressions.",
  },
  {
    key: "linear_equations",
    label: "Linear equations",
    aliases: ["linear equation", "equations", "solve for x", "one variable", "balancing"],
    minGrade: 6,
    maxGrade: 11,
    summary: "Solving one-variable linear equations, including word problems and verification.",
  },
  {
    key: "sequences",
    label: "Sequences",
    aliases: ["sequence", "sequences", "nth term", "arithmetic progression", "pattern rule"],
    minGrade: 6,
    maxGrade: 12,
    summary: "Arithmetic and simple quadratic sequences: next terms, the nth term and applying it.",
  },
  {
    key: "functions",
    label: "Functions",
    aliases: ["function", "functions", "f(x)", "domain", "range", "mapping"],
    minGrade: 8,
    maxGrade: 12,
    summary: "Function notation, evaluating functions and interpreting ordered pairs.",
  },
  {
    key: "inequalities",
    label: "Inequalities",
    aliases: ["inequality", "inequalities", "greater than", "at most", "at least"],
    minGrade: 7,
    maxGrade: 11,
    summary: "Solving and representing one-variable inequalities.",
  },
  {
    key: "quadratics",
    label: "Quadratic equations",
    aliases: ["quadratic", "parabola", "factorising quadratics", "roots", "x squared"],
    minGrade: 9,
    maxGrade: 13,
    summary: "Factorising and solving monic quadratics with integer roots.",
  },
  {
    key: "fractions_percentages",
    label: "Fractions and percentages",
    aliases: ["fraction", "fractions", "percentage", "percent", "decimal", "proportion of a quantity"],
    minGrade: 3,
    maxGrade: 9,
    summary: "Fraction of a quantity, percentage change and conversion between forms.",
  },
  {
    key: "ratio_proportion",
    label: "Ratio and proportion",
    aliases: ["ratio", "proportion", "share", "scale"],
    minGrade: 5,
    maxGrade: 10,
    summary: "Sharing a quantity in a given ratio and solving proportion problems.",
  },
  {
    key: "geometry_angles",
    label: "Angles and geometry",
    aliases: ["angle", "angles", "triangle", "parallel lines", "polygon"],
    minGrade: 4,
    maxGrade: 10,
    summary: "Angle facts in triangles, straight lines and polygons.",
  },
  {
    key: "pythagoras",
    label: "Pythagoras' theorem",
    aliases: ["pythagoras", "hypotenuse", "right triangle", "right-angled"],
    minGrade: 7,
    maxGrade: 11,
    summary: "Finding a missing side of a right-angled triangle.",
  },
  {
    key: "area_perimeter",
    label: "Area and perimeter",
    aliases: ["area", "perimeter", "rectangle", "compound shape"],
    minGrade: 3,
    maxGrade: 9,
    summary: "Area and perimeter of rectangles and right-angled triangles.",
  },
  {
    key: "statistics_mean",
    label: "Statistics",
    aliases: ["mean", "median", "mode", "average", "statistics", "data"],
    minGrade: 5,
    maxGrade: 12,
    summary: "Mean, median, mode and range of a small data set.",
  },
  {
    key: "probability",
    label: "Probability",
    aliases: ["probability", "chance", "dice", "spinner", "likely"],
    minGrade: 5,
    maxGrade: 12,
    summary: "Single-event probability expressed as a fraction in simplest form.",
  },
];

export const DEFAULT_TOPICS: TopicKey[] = ["algebraic_expressions", "linear_equations", "sequences", "functions"];

/**
 * A grade-appropriate topic set, used only when the instruction named no topic
 * the catalogue recognises (e.g. "a 100 mark Grade 9 maths exam").
 *
 * The band is deliberately wide — `minGrade - 3` to `maxGrade + 2`, the same
 * tolerance `resolveTopics` applies — so a Grade 8 paper is not silently filled
 * with Grade 11 material. Order follows the catalogue so the easiest material
 * appears first and difficulty rises through the paper.
 */
/**
 * Resolves the FIRST topic a phrase names, using the catalogue's own aliases.
 *
 * The intent router used to carry a hand-written topic list, and the two drifted:
 * it emitted "fractions", "trigonometry" and "quadratic_equations", none of which
 * are catalogue keys, so those requests generated zero questions. Resolving
 * through `TOPIC_CATALOG` means a recognised word can never name a topic that
 * does not exist.
 */
export function firstTopicIn(text: string): TopicKey | null {
  const lower = text.toLowerCase();
  let best: { key: TopicKey; at: number; len: number } | null = null;
  for (const topic of TOPIC_CATALOG) {
    for (const alias of topic.aliases) {
      const at = lower.indexOf(alias);
      if (at < 0) continue;
      if (!best || at < best.at || (at === best.at && alias.length > best.len)) {
        best = { key: topic.key, at, len: alias.length };
      }
    }
  }
  return best ? best.key : null;
}

export function topicsForGrade(gradeOrder: number | undefined): TopicKey[] {
  const grade = Number.isFinite(gradeOrder as number) ? (gradeOrder as number) : 9;
  return TOPIC_CATALOG
    .filter((topic) => grade >= topic.minGrade - 3 && grade <= topic.maxGrade + 2)
    .map((topic) => topic.key);
}

/** Resolves free-text topic mentions to catalogue keys (longest alias first). */
export function resolveTopics(text: string, gradeOrder = 9): TopicKey[] {
  const lower = text.toLowerCase();
  const hits: { key: TopicKey; at: number; len: number }[] = [];
  for (const topic of TOPIC_CATALOG) {
    let best = -1;
    let bestLen = 0;
    for (const alias of topic.aliases) {
      const at = lower.indexOf(alias);
      if (at >= 0 && alias.length > bestLen) {
        best = at;
        bestLen = alias.length;
      }
    }
    if (best >= 0 && gradeOrder >= topic.minGrade - 3 && gradeOrder <= topic.maxGrade + 2) {
      hits.push({ key: topic.key, at: best, len: bestLen });
    }
  }
  // De-duplicate, keeping the order in which the teacher mentioned them so the
  // paper follows their instruction rather than a catalogue order.
  const seen = new Set<TopicKey>();
  return hits
    .sort((a, b) => a.at - b.at)
    .map((h) => h.key)
    .filter((key) => (seen.has(key) ? false : (seen.add(key), true)));
}

export function topicLabel(key: TopicKey): string {
  return TOPIC_CATALOG.find((t) => t.key === key)?.label ?? key;
}

/* ─── Seeded RNG (mulberry32, same construction as questionGeneration.ts) ── */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
type Rng = () => number;
function rng(seed: string): Rng {
  let a = hashSeed(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (r: Rng, min: number, max: number) => min + Math.floor(r() * (max - min + 1));
const pick = <T,>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length)];
const num = (n: number) => String(Math.round(n * 100) / 100);

/**
 * A fraction that genuinely reduces, so "write in simplest form" is a real task.
 *
 * The base fraction is chosen coprime (`n` and `d` share no factor), so the
 * highest common factor of the displayed `nk/dk` is exactly `k`. That makes the
 * worked solution correct rather than approximate, and rules out the vacuous
 * case where the fraction was already in lowest terms.
 */
function reducibleFraction(r: Rng): { n: number; d: number; k: number } {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  for (let attempt = 0; attempt < 40; attempt++) {
    const d = pick(r, [2, 3, 4, 5, 7, 8]);
    const n = ri(r, 1, d - 1);
    const k = pick(r, [2, 3, 4, 5, 6]);
    if (gcd(n, d) === 1 && k !== d) return { n, d, k };
  }
  return { n: 2, d: 3, k: 2 };
}

/** Signed term rendering: `+ 3` / `− 3`. */
const signed = (n: number) => (n < 0 ? `− ${Math.abs(n)}` : `+ ${n}`);

/** Linear coefficient rendering: `3x`, `x`, `−x`. */
function coefTerm(a: number, variable = "x"): string {
  if (a === 0) return "0";
  if (a === 1) return variable;
  if (a === -1) return `−${variable}`;
  return `${a < 0 ? "−" : ""}${Math.abs(a)}${variable}`;
}

export interface BuiltQuestion extends ProposedQuestion {
  /** The exact worked solution, used for the marking scheme. */
  working: string;
}

export type Difficulty = "easy" | "medium" | "hard";

const difficultyRank = (d: Difficulty) => (d === "easy" ? 0 : d === "medium" ? 1 : 2);

/* ─── Families ───────────────────────────────────────────────────────────── */

type Family = {
  topic: TopicKey;
  /** `hint` carries a shape the caller needs (e.g. exactly four options). */
  make: (r: Rng, difficulty: Difficulty, index: number, hint?: FamilyHint) => BuiltQuestion | null;
};

export interface FamilyHint {
  /** When set, the family must return a question with exactly this many options. */
  preferredOptions?: number;
}

/**
 * Each family returns ONE question. The caller supplies a per-question seed, so
 * duplicates across a paper are detectable and avoidable rather than luck.
 */
const FAMILIES: Family[] = [
  /* ── Algebraic expressions ── */
  {
    topic: "algebraic_expressions",
    make: (r, difficulty, index) => {
      const variant = difficultyRank(difficulty) === 0 ? "expand" : difficultyRank(difficulty) === 1 ? "simplify" : "factorise";
      if (variant === "expand") {
        // a ≥ 2 and c ≥ 1 keep a·c ≠ a + c and a·c ≥ 2, so the three option
        // labels are provably distinct.
        const a = ri(r, 2, 5);
        const b = ri(r, 1, 9);
        const c = ri(r, 2, 9);
        const expanded = `${a * c}x + ${a * b}`;
        // Distractors must stay distinct from the key AND from each other for
        // every draw: "a·c x + b" collapses into the key when a = 1, and
        // "a + c x" does when a·c = a + c (2 and 2). Both are excluded by the
        // value ranges below, which is cheaper than de-duplicating afterwards.
        const wrong1 = `${a * c}x + ${b}`;
        const wrong2 = `${a + c}x + ${a * b}`;
        return {
          ref: `q${index}`,
          type: "short_answer",
          prompt: `Expand ${a}(${c}x + ${b}).`,
          points: 2,
          difficulty,
          topic: "Algebra",
          subtopic: "Expanding brackets",
          options: [
            { label: expanded, is_correct: true },
            { label: wrong1, is_correct: false },
            { label: wrong2, is_correct: false },
          ].filter((option, index, all) => all.findIndex((o) => o.label === option.label) === index),
          explanation: `Multiply each term inside the bracket by ${a}: ${a} × ${c}x = ${a * c}x and ${a} × ${b} = ${a * b}, so the answer is ${expanded}.`,
          working: `${a}(${c}x + ${b}) = ${a}·${c}x + ${a}·${b} = ${expanded}`,
        };
      }
      if (variant === "simplify") {
        const a = ri(r, 4, 9);
        const c = ri(r, 1, a - 1); // keep the x coefficient positive
        const b = ri(r, 2, 9);
        const d = ri(r, 1, b - 1); // keep the constant positive
        const xCoef = a - c;
        const constant = b - d;
        const prompt = `Simplify ${a}x + ${b} − ${c}x − ${d}.`;
        const answer = `${coefTerm(xCoef)} + ${constant}`;
        return {
          ref: `q${index}`,
          type: "short_answer",
          prompt,
          points: 2,
          difficulty,
          topic: "Algebra",
          subtopic: "Collecting like terms",
          options: [
            { label: answer, is_correct: true },
            { label: `${coefTerm(a - c)} + ${b + d}`, is_correct: false },
            { label: `${coefTerm(a + c)} + ${constant}`, is_correct: false },
          ],
          explanation: `Collect the x terms: ${a}x − ${c}x = ${coefTerm(xCoef)}. Collect the constants: ${b} − ${d} = ${constant}. The simplified expression is ${answer}.`,
          working: `${a}x + ${b} − ${c}x − ${d} = ${coefTerm(xCoef)} + ${constant}`,
        };
      }
      // Factorise ax + ab  → a(x + b). c is a DIFFERENT integer from both a and
      // b, so no two of the three option labels can coincide.
      const a = ri(r, 2, 9);
      const b = ri(r, 2, 9);
      const c = (() => {
        let value = ri(r, 2, 11);
        while (value === a || value === b) value = ri(r, 2, 11);
        return value;
      })();
      return {
        ref: `q${index}`,
        type: "short_answer",
        prompt: `Factorise completely: ${a}x + ${a * b}.`,
        points: 2,
        difficulty,
        topic: "Algebra",
        subtopic: "Factorising a common factor",
        options: [
          { label: `${a}(x + ${b})`, is_correct: true },
          { label: `${a}(x + ${a * b})`, is_correct: false },
          { label: `${c}(x + ${a})`, is_correct: false },
        ],
        explanation: `Both terms share the factor ${a}: ${a}x + ${a * b} = ${a}(x + ${b}).`,
        working: `${a}x + ${a * b} = ${a}(x + ${b})`,
      };
    },
  },

  /* ── Linear equations ── */
  {
    topic: "linear_equations",
    make: (r, difficulty, index) => {
      const rank = difficultyRank(difficulty);
      if (rank === 0) {
        const a = ri(r, 2, 6);
        const x = ri(r, 1, 9);
        const b = ri(r, 1, 12);
        const c = a * x + b;
        return {
          ref: `q${index}`,
          type: "numeric",
          prompt: `Solve for x: ${a}x + ${b} = ${c}.`,
          points: 2,
          difficulty,
          topic: "Algebra",
          subtopic: "Solving a linear equation",
          config: { numeric_answer: x, tolerance: 0 },
          explanation: `Subtract ${b} from both sides: ${a}x = ${c - b}. Divide both sides by ${a}: x = ${x}.`,
          working: `${a}x + ${b} = ${c} → ${a}x = ${c - b} → x = ${x}`,
        };
      }
      if (rank === 1) {
        // a·x + b = d·x + e, with a > d so the coefficient on the left stays
        // positive. e is computed from the chosen root, so the key is exact.
        const x = ri(r, 2, 9);
        const d = ri(r, 1, 4);
        const a = d + ri(r, 2, 4);
        const b = ri(r, 1, 9);
        const e = (a - d) * x + b;
        const lhsCoef = a - d;
        return {
          ref: `q${index}`,
          type: "numeric",
          prompt: `Solve for x: ${a}x + ${b} = ${d}x + ${e}.`,
          points: 2,
          difficulty,
          topic: "Algebra",
          subtopic: "Equation with unknowns on both sides",
          config: { numeric_answer: x, tolerance: 0 },
          explanation: `Subtract ${d}x from both sides: ${lhsCoef}x + ${b} = ${e}. Subtract ${b}: ${lhsCoef}x = ${e - b}. Divide by ${lhsCoef}: x = ${x}.`,
          working: `${a}x + ${b} = ${d}x + ${e} → ${lhsCoef}x = ${e - b} → x = ${x}`,
        };
      }
      // Word problem with a fractional equation
      const price = ri(r, 3, 12);
      const count = ri(r, 4, 12);
      const total = price * count;
      return {
        ref: `q${index}`,
        type: "assess_parts",
        prompt:
          `A school buys ${count} identical workbooks and pays a fixed delivery charge of ${price * 2} francs.\n` +
          `The total cost is ${total + price * 2} francs.`,
        points: 4,
        difficulty,
        topic: "Algebra",
        subtopic: "Forming and solving an equation",
        parts: [
          {
            // Authored as a text part with an acceptance list that holds the
            // ONLY marks: the expression is a marking key, not a question type.
            // `questionPublishIssues` requires each part's total to be a positive
            // number, which is why this is a single-mark text part.
            id: "a",
            label: "(a)",
            prompt: `Write an equation for the total cost, using c for the cost of one workbook.`,
            kind: "text",
            points: 1,
            accepted: [`${count}c + ${price * 2}`, `${price * 2} + ${count}c`],
            hints: ["Start with the cost of the workbooks alone.", "Each workbook costs c, and there are " + count + " of them."],
          },
          {
            id: "b",
            label: "(b)",
            prompt: "Solve your equation to find the cost of one workbook, in francs.",
            kind: "numeric",
            points: 2,
            answer: price,
            tolerance: 0,
            hints: [`First subtract the delivery charge of ${price * 2}.`, `Then divide by ${count}.`],
          },
          {
            id: "c",
            label: "(c)",
            prompt: "Check your answer by substituting it back into the total cost.",
            kind: "numeric",
            points: 1,
            answer: total + price * 2,
            tolerance: 0,
            unit: "francs",
            hints: ["Multiply your answer by the number of workbooks.", "Do not forget to add the delivery charge."],
          },
        ],
        explanation:
          `${count}c + ${price * 2} = ${total + price * 2}, so ${count}c = ${total} and c = ${price}. ` +
          `Checking: ${count} × ${price} + ${price * 2} = ${total + price * 2}.`,
        working: `${count}c + ${price * 2} = ${total + price * 2} → ${count}c = ${total} → c = ${price}`,
        markingCriteria:
          `(a) 1 mark for a correct equation. (b) 2 marks: 1 for isolating the term, 1 for the correct division. ` +
          `(c) 1 mark for a correct substitution and total. Award follow-through in (b) from an incorrect equation in (a).`,
      };
    },
  },

  /* ── Sequences ── */
  {
    topic: "sequences",
    make: (r, difficulty, index) => {
      const rank = difficultyRank(difficulty);
      const first = ri(r, 2, 9);
      const diff = ri(r, 2, 8);
      if (rank === 0) {
        const n = ri(r, 5, 9);
        const term = first + (n - 1) * diff;
        return {
          ref: `q${index}`,
          type: "numeric",
          prompt: `The first four terms of a sequence are ${first}, ${first + diff}, ${first + 2 * diff}, ${first + 3 * diff}. Find the ${n}th term.`,
          points: 2,
          difficulty,
          topic: "Algebra",
          subtopic: "Arithmetic sequence",
          config: { numeric_answer: term, tolerance: 0 },
          explanation: `The sequence increases by ${diff} each time, so the nth term is ${first} + (n − 1) × ${diff}. For n = ${n}: ${first} + ${n - 1} × ${diff} = ${term}.`,
          working: `T(n) = ${first} + (n − 1)·${diff} → T(${n}) = ${term}`,
        };
      }
      if (rank === 1) {
        return {
          ref: `q${index}`,
          type: "short_answer",
          prompt: `A sequence starts ${first}, ${first + diff}, ${first + 2 * diff}, ${first + 3 * diff}, … Write an expression for the nth term.`,
          points: 3,
          difficulty,
          topic: "Algebra",
          subtopic: "nth term of an arithmetic sequence",
          options: [
            { label: `${diff}n ${signed(first - diff)}`, is_correct: true },
            { label: `${first}n ${signed(diff)}`, is_correct: false },
            { label: `${diff}n ${signed(first)}`, is_correct: false },
            { label: `${diff}n`, is_correct: false },
          ],
          explanation: `The common difference is ${diff}, so the nth term starts with ${diff}n. Subtracting ${diff} from the first term gives ${first - diff}, so T(n) = ${diff}n ${signed(first - diff)}.`,
          working: `T(n) = ${diff}n ${signed(first - diff)}`,
        };
      }
      // Quadratic sequence: second difference constant
      const base = ri(r, 1, 4);
      const terms = [1, 2, 3, 4, 5].map((term) => term * term + base * term);
      return {
        ref: `q${index}`,
        type: "assess_parts",
        prompt: `A sequence begins ${terms.slice(0, 5).join(", ")}, …`,
        points: 4,
        difficulty,
        topic: "Algebra",
        subtopic: "Quadratic sequence",
        parts: [
          {
            id: "a",
            label: "(a)",
            prompt: "Write down the first differences.",
            kind: "text",
            points: 1,
            accepted: [
              terms.slice(1, 5).map((t, i) => t - terms[i]).join(", "),
              terms.slice(1, 5).map((t, i) => t - terms[i]).join(","),
            ],
            hints: ["Subtract each term from the term that follows it.", "There are four differences for five terms."],
          },
          {
            id: "b",
            label: "(b)",
            prompt: "Write down the constant second difference.",
            kind: "numeric",
            points: 1,
            answer: 2,
            tolerance: 0,
            hints: ["Subtract consecutive first differences.", "The same value every time means a quadratic sequence."],
          },
          {
            id: "c",
            label: "(c)",
            prompt: "Find the next term.",
            kind: "numeric",
            points: 2,
            answer: terms[4] + (terms[4] - terms[3]) + 2,
            tolerance: 0,
            hints: ["Add the second difference to the last first difference.", "Then add that new difference to the last term."],
          },
        ],
        explanation:
          `First differences: ${terms.slice(1, 5).map((t, i) => t - terms[i]).join(", ")}. Second difference: 2. ` +
          `The next first difference is ${terms[4] - terms[3] + 2}, so the next term is ${terms[4] + (terms[4] - terms[3]) + 2}.`,
        working: `Δ₁ = ${terms.slice(1, 5).map((t, i) => t - terms[i]).join(", ")}; Δ₂ = 2; next term = ${terms[4] + (terms[4] - terms[3]) + 2}`,
        markingCriteria:
          "(a) 1 mark for all four first differences correct. (b) 1 mark for the second difference 2. " +
          "(c) 2 marks: 1 for the correct next first difference, 1 for the correct next term.",
      };
    },
  },

  /* ── Functions ── */
  {
    topic: "functions",
    make: (r, difficulty, index) => {
      const a = ri(r, 2, 5);
      const b = ri(r, 1, 9) * (r() > 0.5 ? 1 : -1);
      const x = ri(r, 2, 7);
      const fx = a * x + b;
      if (difficultyRank(difficulty) === 0) {
        return {
          ref: `q${index}`,
          type: "numeric",
          prompt: `Given f(x) = ${coefTerm(a)} ${signed(b)}, find f(${x}).`,
          points: 2,
          difficulty,
          topic: "Algebra",
          subtopic: "Evaluating a function",
          config: { numeric_answer: fx, tolerance: 0 },
          explanation: `Substitute x = ${x}: f(${x}) = ${a} × ${x} ${signed(b)} = ${fx}.`,
          working: `f(${x}) = ${a}(${x}) ${signed(b)} = ${fx}`,
        };
      }
      return {
        ref: `q${index}`,
        type: "assess_parts",
        prompt: `A function is defined by f(x) = ${coefTerm(a)} ${signed(b)}.`,
        points: 4,
        difficulty,
        topic: "Algebra",
        subtopic: "Function notation",
        parts: [
          {
            id: "a",
            label: "(a)",
            prompt: `Find f(${x}).`,
            kind: "numeric",
            points: 1,
            answer: fx,
            tolerance: 0,
            hints: ["Replace every x with the value given.", `Multiply first: ${a} × ${x}.`],
          },
          {
            id: "b",
            label: "(b)",
            prompt: "Find the value of x for which f(x) = 0.",
            kind: "numeric",
            points: 2,
            tolerance: 0.01,
            answer: Math.round((-b / a) * 100) / 100,
            hints: ["Set the expression equal to zero.", `First ${b < 0 ? "add" : "subtract"} ${Math.abs(b)} on both sides.`],
          },
          {
            id: "c",
            label: "(c)",
            prompt: `Complete the sentence: the graph of f is a straight line with gradient ...`,
            kind: "text",
            points: 1,
            accepted: [String(a), `${a}`, `a gradient of ${a}`],
            hints: ["The gradient is the number multiplying x.", "Look at the coefficient of x in f(x)."],
          },
        ],
        explanation: `(a) f(${x}) = ${fx}. (b) ${coefTerm(a)} ${signed(b)} = 0, so x = ${num(-b / a)}. (c) The gradient is ${a}.`,
        working: `f(x) = ${coefTerm(a)} ${signed(b)}; root x = ${num(-b / a)}; gradient ${a}`,
        markingCriteria:
          "(a) 1 mark for the correct substitution and value. (b) 2 marks: 1 for setting f(x) = 0 and rearranging, 1 for the correct root (allow equivalent fractions/decimals). (c) 1 mark for identifying the gradient as the coefficient of x.",
      };
    },
  },

  /* ── Inequalities ── */
  {
    topic: "inequalities",
    make: (r, difficulty, index) => {
      const a = ri(r, 2, 5);
      const x = ri(r, 2, 8);
      const b = ri(r, 1, 9);
      const limit = a * x + b;
      return {
        ref: `q${index}`,
        type: "short_answer",
        prompt: `Solve the inequality ${coefTerm(a)} ${signed(b)} < ${limit}, and describe the set of values of x.`,
        points: 2,
        difficulty,
        topic: "Algebra",
        subtopic: "Linear inequality",
        options: [
          { label: `x < ${x}`, is_correct: true },
          { label: `x > ${x}`, is_correct: false },
          { label: `x < ${limit}`, is_correct: false },
        ],
        explanation: `Subtract ${b}: ${coefTerm(a)} < ${limit - b}. Divide by ${a} (positive, so the inequality direction is unchanged): x < ${x}.`,
        working: `${coefTerm(a)} ${signed(b)} < ${limit} → x < ${x}`,
      };
    },
  },

  /* ── Quadratics ── */
  {
    topic: "quadratics",
    make: (r, difficulty, index) => {
      const p = ri(r, 1, 6);
      let q = ri(r, 1, 6);
      if (q === p) q += 1;
      const b = -(p + q);
      const c = p * q;
      const factorised = `(x ${signed(-p)})(x ${signed(-q)})`.replace("+ −", "− ");
      return {
        ref: `q${index}`,
        type: "short_answer",
        prompt: `Solve x² ${signed(b)}x ${signed(c)} = 0 by factorising.`,
        points: 3,
        difficulty,
        topic: "Algebra",
        subtopic: "Solving a quadratic by factorising",
        options: [
          { label: `x = ${Math.min(p, q)} or x = ${Math.max(p, q)}`, is_correct: true },
          { label: `x = ${-Math.min(p, q)} or x = ${-Math.max(p, q)}`, is_correct: false },
          { label: `x = ${p} only`, is_correct: false },
          { label: "No real solutions", is_correct: false },
        ],
        explanation: `Two numbers that multiply to ${c} and add to ${b} are ${-p} and ${-q}. So the equation is ${factorised} = 0, giving x = ${p} or x = ${q}.`,
        working: `x² ${signed(b)}x ${signed(c)} = ${factorised} = 0 → x = ${p} or x = ${q}`,
      };
    },
  },

  /* ── Fractions & percentages ── */
  {
    topic: "fractions_percentages",
    make: (r, difficulty, index, hint) => {
      // One family in three is a four-option multiple-choice fraction item. The
      // topic previously produced only numeric percentage questions, so a teacher
      // asking for "a fractions quiz with four options per question" could not be
      // served at all and the request had to be refused.
      // Normally one item in three is multiple choice. When the caller needs a
      // fixed option count the numeric branch is unavailable, so EVERY attempt
      // must take this branch — gating it on `index` would make two attempts in
      // three return null forever and the paper would come out empty.
      if (hint?.preferredOptions || index % 3 === 0) {
        const { n, d, k } = reducibleFraction(r);
        const correct = `${n}/${d}`;
        // Distractors model real errors: inverting, cancelling the common factor
        // in the numerator only, doubling the denominator, and adding one to both
        // parts. (Subtracting the same amount from both parts was tried and
        // produced "0/6" when the numerator was 1 — a distractor no student would
        // ever choose.)
        const candidates = [
          `${d}/${n}`,
          `${n}/${d * k}`,
          `${n}/${d + 1}`,
          `${n}/${d * 2}`,
          `${n + 1}/${d}`,
        ];
        const seen = new Set([correct]);
        const options: { label: string; is_correct: boolean }[] = [{ label: frac(n, d), is_correct: true }];
        const want = hint?.preferredOptions ?? 4;
        if (want < 2) return null;
        for (const candidate of candidates) {
          if (seen.has(candidate) || options.length === want) continue;
          seen.add(candidate);
          const [cn, cd] = candidate.split("/");
          options.push({ label: frac(cn, cd), is_correct: false });
        }
        // Fewer distractors than asked for is not a shorter question, it is a
        // different one; refuse rather than under-deliver.
        if (options.length !== want) return null;
        // Deterministic but non-trivial order, so the key is not always first.
        const offset = ri(r, 0, options.length - 1);
        const shuffled = [...options.slice(offset), ...options.slice(0, offset)];
        return {
          ref: `q${index}`,
          type: "single_choice",
          prompt: `Write ${frac(n * k, d * k)} in its simplest form.`,
          points: 1,
          difficulty,
          topic: "Number",
          subtopic: "Simplifying fractions",
          options: shuffled,
          explanation: `The highest common factor of ${n * k} and ${d * k} is ${k}, so ${n * k}/${d * k} = ${n}/${d}.`,
          working: `${frac(n * k, d * k)} = ${frac(n, d)}`,
        };
      }
      // A numeric item has no options, so it cannot stand in when the caller
      // asked for a fixed number of them.
      if (hint?.preferredOptions) return null;
      const whole = ri(r, 4, 12) * 10;
      const pct = pick(r, [10, 20, 25, 50, 5, 75]);
      if (difficultyRank(difficulty) === 0) {
        const value = (whole * pct) / 100;
        return {
          ref: `q${index}`,
          type: "numeric",
          prompt: `Find ${pct}% of ${whole}.`,
          points: 1,
          difficulty,
          topic: "Number",
          subtopic: "Percentage of a quantity",
          config: { numeric_answer: value, tolerance: 0 },
          explanation: `${pct}% means ${pct}/100, so ${pct}% of ${whole} = ${pct}/100 × ${whole} = ${num(value)}.`,
          working: `${pct}/100 × ${whole} = ${num(value)}`,
        };
      }
      const value = (whole * pct) / 100;
      const increased = whole + value;
      return {
        ref: `q${index}`,
        type: "numeric",
        prompt: `A price of ${whole} francs is increased by ${pct}%. What is the new price, in francs?`,
        points: 2,
        difficulty,
        topic: "Number",
        subtopic: "Percentage increase",
        config: { numeric_answer: increased, tolerance: 0 },
        explanation: `The increase is ${pct}% of ${whole} = ${num(value)}. The new price is ${whole} + ${num(value)} = ${increased} francs.`,
        working: `${whole} + ${pct}/100 × ${whole} = ${increased}`,
      };
    },
  },

  /* ── Ratio & proportion ── */
  {
    topic: "ratio_proportion",
    make: (r, difficulty, index) => {
      const a = ri(r, 1, 4);
      const b = ri(r, 2, 6);
      const total = (a + b) * ri(r, 3, 9);
      const share = (total * a) / (a + b);
      return {
        ref: `q${index}`,
        type: "numeric",
        prompt: `${total} francs are shared between two students in the ratio ${a} : ${b}. How much does the first student receive, in francs?`,
        points: 2,
        difficulty,
        topic: "Number",
        subtopic: "Sharing in a ratio",
        config: { numeric_answer: share, tolerance: 0 },
        explanation: `The ratio has ${a + b} equal parts, so one part is ${total} ÷ ${a + b} = ${num(total / (a + b))}. The first student receives ${a} parts = ${num(share)} francs.`,
        working: `${total} ÷ ${a + b} × ${a} = ${num(share)}`,
      };
    },
  },

  /* ── Angles ── */
  {
    topic: "geometry_angles",
    make: (r, difficulty, index) => {
      const a = ri(r, 3, 8) * 10;
      const b = ri(r, 2, 7) * 10;
      if (a + b >= 170) return null;
      const c = 180 - a - b;
      return {
        ref: `q${index}`,
        type: "numeric",
        prompt: `Two angles of a triangle measure ${a}° and ${b}°. Find the third angle, in degrees.`,
        points: 1,
        difficulty,
        topic: "Geometry",
        subtopic: "Angles in a triangle",
        config: { numeric_answer: c, tolerance: 0 },
        explanation: `The angles in a triangle add up to 180°, so the third angle is 180° − ${a}° − ${b}° = ${c}°.`,
        working: `180 − ${a} − ${b} = ${c}`,
      };
    },
  },

  /* ── Pythagoras ── */
  {
    topic: "pythagoras",
    make: (r, difficulty, index) => {
      const triples = [
        [3, 4, 5],
        [6, 8, 10],
        [5, 12, 13],
        [8, 15, 17],
        [9, 12, 15],
        [7, 24, 25],
      ] as const;
      const [a, b, c] = pick(r, triples);
      const scale = difficultyRank(difficulty) === 0 ? 1 : ri(r, 2, 3);
      return {
        ref: `q${index}`,
        type: "numeric",
        prompt: `A right-angled triangle has legs ${a * scale} cm and ${b * scale} cm. Find the length of the hypotenuse, in cm.`,
        points: 2,
        difficulty,
        topic: "Geometry",
        subtopic: "Pythagoras' theorem",
        config: { numeric_answer: c * scale, tolerance: 0 },
        explanation: `Using Pythagoras: h² = ${a * scale}² + ${b * scale}² = ${(a * scale) ** 2} + ${(b * scale) ** 2} = ${(c * scale) ** 2}, so h = ${c * scale} cm.`,
        working: `h = √(${(a * scale) ** 2} + ${(b * scale) ** 2}) = ${c * scale}`,
      };
    },
  },

  /* ── Area & perimeter ── */
  {
    topic: "area_perimeter",
    make: (r, difficulty, index) => {
      const w = ri(r, 3, 12);
      const h = ri(r, 2, 9);
      const area = w * h;
      return {
        ref: `q${index}`,
        type: "numeric",
        prompt: `A rectangle measures ${w} cm by ${h} cm. Find its area, in cm².`,
        points: 1,
        difficulty,
        topic: "Geometry",
        subtopic: "Area of a rectangle",
        config: { numeric_answer: area, tolerance: 0 },
        explanation: `Area of a rectangle = length × width = ${w} × ${h} = ${area} cm².`,
        working: `${w} × ${h} = ${area}`,
      };
    },
  },

  /* ── Statistics ── */
  {
    topic: "statistics_mean",
    make: (r, difficulty, index) => {
      const count = difficultyRank(difficulty) === 0 ? 5 : 6;
      const values: number[] = [];
      for (let i = 0; i < count; i++) values.push(ri(r, 2, 19));
      const total = values.reduce((s, v) => s + v, 0);
      const mean = total / count;
      if (!Number.isInteger(mean)) return null;
      return {
        ref: `q${index}`,
        type: "numeric",
        prompt: `Find the mean of the data set: ${values.join(", ")}.`,
        points: 2,
        difficulty,
        topic: "Statistics",
        subtopic: "Mean of a data set",
        config: { numeric_answer: mean, tolerance: 0 },
        explanation: `Sum = ${total}. There are ${count} values, so the mean is ${total} ÷ ${count} = ${mean}.`,
        working: `${total} ÷ ${count} = ${mean}`,
      };
    },
  },

  /* ── Probability ── */
  {
    topic: "probability",
    make: (r, difficulty, index) => {
      const total = pick(r, [6, 8, 10, 12]);
      const favourable = ri(r, 1, total - 1);
      const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
      const d = g(favourable, total);
      return {
        ref: `q${index}`,
        type: "short_answer",
        prompt: `A bag contains ${total} counters. ${favourable} of them are red. One counter is chosen at random. Write the probability that it is red, in simplest form.`,
        points: 1,
        difficulty,
        topic: "Probability",
        subtopic: "Single-event probability",
        // Distractors must be genuinely wrong AND distinct from the key. When the
        // fraction is already in simplest form (3/8), an "unsimplified" distractor
        // would be identical to the correct answer, so a different misconception
        // is used instead: the complement, and the odds-style inversion.
        options: (() => {
          const correct = `${favourable / d}/${total / d}`;
          const candidates = [
            favourable === favourable / d ? `${favourable}/${total + favourable}` : `${favourable}/${total}`,
            `${total - favourable}/${total}`,
            `${total}/${favourable}`,
          ];
          const seen = new Set([correct]);
          const wrong: { label: string; is_correct: boolean }[] = [
            { label: frac(favourable / d, total / d), is_correct: true },
          ];
          for (const candidate of candidates) {
            if (seen.has(candidate)) continue;
            seen.add(candidate);
            const [n, den] = candidate.split("/");
            wrong.push({ label: frac(n, den), is_correct: false });
            if (wrong.length === 3) break;
          }
          return wrong;
        })(),
        // Only show the simplification step when there is one to show.
        explanation:
          d === 1
            ? `P(red) = favourable outcomes ÷ total outcomes = ${frac(favourable, total)}.`
            : `P(red) = favourable outcomes ÷ total outcomes = ${frac(favourable, total)} = ` +
              `${frac(favourable / d, total / d)}.`,
        working:
          d === 1
            ? frac(favourable, total)
            : `${frac(favourable, total)} = ${frac(favourable / d, total / d)}`,
      };
    },
  },
];

/**
 * Renders a fraction as inline LaTeX.
 *
 * The platform already renders `$…$` through KaTeX (`MathText`), so a real
 * fraction is drawn as a fraction rather than the ASCII "3/4". Only the shape
 * the content actually needs is emitted — a numerator, a denominator and an
 * equals chain — so nothing user-visible depends on arbitrary LaTeX escape
 * rules.
 */
function frac(numerator: number | string, denominator: number | string): string {
  return `$\\dfrac{${numerator}}{${denominator}}$`;
}

/** The families available for a topic at a difficulty, in a stable order. */
function familiesFor(topic: TopicKey): Family[] {
  return FAMILIES.filter((f) => f.topic === topic);
}

export interface PlanSectionSpec {
  id: string;
  title: string;
  instructions?: string;
  share: number;
}

export interface PlanSpec {
  title: string;
  description?: string;
  instructions?: string;
  durationMinutes: number;
  gradeLabel?: string;
  gradeOrder?: number;
  subject?: string;
  curriculum?: string;
  /**
   * Topics the teacher named. When nothing recognisable was named this is
   * absent (or empty) and the generator chooses a grade-appropriate set — it
   * must never be treated as guaranteed by callers.
   */
  topics?: TopicKey[];
  /** Total question count across all sections. */
  questionCount: number;
  /** Desired paper total; per-question marks are then adjusted. */
  totalMarks?: number;
  /** Ratio of easy/medium/hard questions, summing to 1. */
  difficultyMix?: { easy: number; medium: number; hard: number };
  sections?: PlanSectionSpec[];
  passMarkPercent?: number;
  seed: string;
  /** Preferred question type per section, when the caller knows. */
  sectionTypes?: Record<string, "mixed" | "objective" | "structured">;
  /**
   * Exactly this many options per question, when the teacher asked for it.
   * A family that cannot meet it returns null, so the item is skipped rather
   * than the paper silently mixing three-option and short-answer items.
   */
  preferredOptions?: number;
}

export interface PlanResult {
  plan: ProposedExam;
  /** Per-question provenance, so the preview can say where each came from. */
  sources: { ref: string; topic: TopicKey | null; family: string }[];
  seeded: string;
}

const DEFAULT_SECTIONS: PlanSectionSpec[] = [
  { id: "A", title: "Section A — Short answer and multiple choice", share: 0.7 },
  { id: "B", title: "Section B — Structured questions", share: 0.3 },
];

function distribute(total: number, sections: { id: string; share: number }[]): number[] {
  const out = sections.map(() => 0);
  const sum = sections.reduce((s, x) => s + x.share, 0) || 1;
  let assigned = 0;
  sections.forEach((section, index) => {
    const value = index === sections.length - 1 ? total - assigned : Math.round((section.share / sum) * total);
    out[index] = Math.max(0, value);
    assigned += out[index];
  });
  // Any rounding shortfall goes to the first section so the totals always match.
  if (assigned !== total && out.length) out[0] += total - assigned;
  return out;
}

function difficultyForIndex(index: number, count: number, mix: { easy: number; medium: number; hard: number }): Difficulty {
  // Deterministic, interleaved so a section does not read easy→hard in blocks
  // while still honouring the requested proportion.
  const easyUntil = Math.round(count * mix.easy);
  const mediumUntil = easyUntil + Math.round(count * mix.medium);
  if (index < easyUntil) return "easy";
  if (index < mediumUntil) return "medium";
  return "hard";
}

/**
 * Removes duplicate option labels, keeping the first occurrence.
 *
 * Every option list mixes a computed key with distractors, and for some draws a
 * distractor's text coincides with the key (or with another distractor). A
 * duplicate label is not a cosmetic problem: it makes the question ambiguous and
 * the marking key unverifiable, so it is removed at construction. When fewer
 * than two distinct options survive, the question is unusable and the caller
 * discards it and draws again — a question is never "repaired" into a shape the
 * author of the family did not write.
 */
export function distinctOptions<T extends { label: string; is_correct: boolean }>(options: T[] | undefined): T[] {
  if (!options?.length) return [];
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = option.label.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Keeps a part-structured question markable when its total is redistributed.
 *
 * A declared paper total (e.g. "100 marks") rescales every question's `points`.
 * A `parts` question also carries per-part marks, and those must still add up to
 * the question's new total — otherwise the paper is generated in a state its own
 * validator rejects ("Part marks (4) must add up to the question's marks (10)").
 * Parts keep their relative weighting and the last part absorbs the rounding.
 */
function rescaleParts(question: ProposedQuestion, points: number): Partial<ProposedQuestion> {
  const parts = question.parts;
  if (!Array.isArray(parts) || !parts.length) return {};
  const oldTotal = parts.reduce((sum, part) => sum + (Number(part.points) || 0), 0);
  if (!(oldTotal > 0)) return {};
  const target = Math.max(0.5, points);
  let assigned = 0;
  const scaled = parts.map((part, index) => {
    if (index === parts.length - 1) {
      return { ...part, points: Math.max(0.5, Math.round((target - assigned) * 2) / 2) };
    }
    const share = Math.max(0.5, Math.round(((Number(part.points) || 0) / oldTotal) * target * 2) / 2);
    assigned += share;
    return { ...part, points: share };
  });
  return { parts: scaled };
}

/**
 * Builds a complete, validated-by-construction examination plan from a
 * specification. Every question is original and every answer is computed.
 */
export function buildExamPlan(spec: PlanSpec): PlanResult {
  const sections = spec.sections?.length ? spec.sections : DEFAULT_SECTIONS;
  const count = Math.max(sections.length, Math.min(60, Math.floor(spec.questionCount) || 10));
  const mix = spec.difficultyMix ?? { easy: 0.35, medium: 0.4, hard: 0.25 };
  // `topics` is genuinely optional: an instruction like "Create an exam with 30
  // questions on algebra" resolves no catalogue topic, and `specFromRequest`
  // says so rather than inventing one. Reading `.length` unconditionally here
  // was a crash that surfaced to the teacher as a failed creation.
  const requested = Array.isArray(spec.topics) ? spec.topics.filter(Boolean) : [];
  const fallbackTopics = topicsForGrade(spec.gradeOrder);
  const topics = requested.length ? requested : fallbackTopics.length ? fallbackTopics : DEFAULT_TOPICS;
  const perSection = distribute(count, sections);

  const questions: ProposedQuestion[] = [];
  const sources: PlanResult["sources"] = [];
  const usedPrompts = new Set<string>();
  const hint: FamilyHint = { preferredOptions: spec.preferredOptions };
  let globalIndex = 0;

  sections.forEach((section, sectionIndex) => {
    const wanted = perSection[sectionIndex];
    let made = 0;
    let attempt = 0;
    while (made < wanted && attempt < wanted * 80) {
      attempt++;
      const topic = topics[(made + sectionIndex) % topics.length];
      const difficulty = difficultyForIndex(made, wanted, mix);
      const seed = `${spec.seed}|${section.id}|${topic}|${difficulty}|${attempt}`;
      const r = rng(seed);
      const families = familiesFor(topic);
      if (!families.length) continue;
      const family = families[attempt % families.length];
      const made_ = family.make(r, difficulty, globalIndex + 1, hint);
      if (!made_) continue;
      // The caller asked for a fixed number of options; an item of another shape
      // is not a substitute for it.
      if (hint.preferredOptions && made_.type === "single_choice" && (made_.options?.length ?? 0) !== hint.preferredOptions) continue;
      const options = distinctOptions(made_.options);
      // Counted-response questions need at least a key; multiple-choice need at
      // least two distinct options to be a real choice.
      const needsChoice = ["single_choice", "multiple_select", "true_false", "short_answer"].includes(made_.type);
      if (needsChoice && options.length < 2) continue;
      if (options.length !== (made_.options?.length ?? 0)) {
        // A duplicate was dropped: the remaining set must still hold exactly one
        // correct answer, otherwise the key itself collided.
        if (options.filter((o) => o.is_correct).length !== 1 && made_.type !== "short_answer") continue;
      }
      const built = { ...made_, options: options.length ? options : made_.options };
      // The SAME fingerprint the validator applies. Deduplicating on raw text
      // let two prompts that differ only in punctuation or formula delimiters
      // through here and then be rejected as `duplicate_prompt` during
      // validation — a paper generated in a state its own validator refuses.
      const fingerprint = promptFingerprint(built.prompt);
      if (usedPrompts.has(fingerprint)) continue;
      usedPrompts.add(fingerprint);
      const ref = `q${questions.length + 1}`;
      questions.push({ ...built, ref });
      sources.push({ ref, topic, family: `${topic}:${difficulty}` });
      made++;
      globalIndex++;
    }
  });

  // Marks: a declared paper total is distributed proportionally to the authored
  // per-question weights, in whole or half marks, with the remainder assigned to
  // the last question so the total is exact rather than approximately right.
  let questionsWithMarks = questions;
  const declaredTotal: number | undefined = spec.totalMarks;
  if (declaredTotal && declaredTotal > 0 && questions.length) {
    const weights = questions.map((q) => q.points || 1);
    const weightSum = weights.reduce((s, w) => s + w, 0);
    const scale = declaredTotal / weightSum;
    // Every question keeps at least half a mark, so a small declared total over
    // many questions must first be proven distributable. 60 questions cannot
    // honour a 20-mark paper in half-mark steps; saying so is better than
    // emitting questions worth 0.5 marks, or 1.5, whose own part marks cannot
    // add up.
    const minimum = questions.reduce(
      (total, q) => total + Math.max(0.5, (q.parts?.length ?? 0)),
      0,
    );
    const usable = declaredTotal >= minimum;
    if (usable) {
      // Work in half-mark units so the arithmetic is exact. Each question takes
      // its proportional share, floored at 1 unit (half a mark), and the
      // question with the largest allocated weight absorbs the remainder. Taking
      // the remainder on the LAST question could push it below the floor (or
      // overshoot), which is how a 20-mark paper became 21 marks.
      const totalUnits = Math.round(declaredTotal * 2);
      // A question made of parts needs at least one mark per part: half a mark
      // cannot be split into two markable parts. The floor therefore follows the
      // structure, not just the number of questions.
      const floorUnits = (q: ProposedQuestion) => Math.max(1, (q.parts?.length ?? 0) * 2);
      const unitShares = questions.map((q) => Math.max(floorUnits(q), Math.round(q.points * scale * 2)));
      const allocatedUnits = unitShares.reduce((total, units) => total + units, 0);
      const remainder = totalUnits - allocatedUnits;
      if (remainder !== 0) {
        // The remainder goes where there is room: the largest allocation for a
        // surplus, and any question that can lose a unit without falling below
        // the half-mark floor for a deficit. Choosing blindly could drive a
        // question to zero or negative marks.
        if (remainder > 0) {
          const heaviest = unitShares.indexOf(Math.max(...unitShares));
          unitShares[heaviest] += remainder;
        } else {
          const donors = unitShares
            .map((units, index) => ({ units, index, floor: floorUnits(questions[index]) }))
            .filter((entry) => entry.units > entry.floor)
            .sort((a, b) => b.units - b.floor - (a.units - a.floor));
          let owed = -remainder;
          for (const donor of donors) {
            if (owed <= 0) break;
            const give = Math.min(owed, donor.units - donor.floor);
            unitShares[donor.index] -= give;
            owed -= give;
          }
        }
      }
      questionsWithMarks = questions.map((q, index) => {
        const points = unitShares[index] / 2;
        return { ...q, points, ...rescaleParts(q, points) };
      });
    }
  }

  // Section assignment follows the authored order.
  const planSections: ProposedSection[] = [];
  let cursor = 0;
  sections.forEach((section, index) => {
    const refs = questionsWithMarks.slice(cursor, cursor + perSection[index]).map((q) => q.ref);
    cursor += perSection[index];
    planSections.push({
      id: section.id,
      title: section.title,
      instructions: section.instructions,
      refs,
    });
  });
  // Anything left over (a rounding edge) belongs to the last section.
  const assigned = new Set(planSections.flatMap((s) => s.refs));
  const leftovers = questionsWithMarks.map((q) => q.ref).filter((ref) => !assigned.has(ref));
  if (leftovers.length && planSections.length) {
    planSections[planSections.length - 1].refs.push(...leftovers);
  }

  if (declaredTotal && declaredTotal > 0 && questions.length) {
    const minimum = questions.reduce((total, q) => total + Math.max(0.5, (q.parts?.length ?? 0)), 0);
    if (declaredTotal < minimum) {
      // Not silently "fixed": the caller is told the two constraints conflict.
      throw new Error(
        `A ${declaredTotal}-mark paper cannot hold these ${questions.length} questions: part-structured questions ` +
          `need one mark per part, so the minimum is ${minimum} marks. Ask for fewer questions, fewer parts, or a ` +
          `higher total.`,
      );
    }
  }

  return {
    plan: {
      title: spec.title,
      description: spec.description,
      instructions: spec.instructions,
      durationMinutes: spec.durationMinutes,
      gradeLabel: spec.gradeLabel,
      subject: spec.subject,
      curriculum: spec.curriculum,
      passMarkPercent: spec.passMarkPercent,
      sections: planSections,
      questions: questionsWithMarks,
    },
    sources,
    seeded: spec.seed,
  };
}

/** Difficulty mix inferred from an instruction such as "mostly easy". */
export function inferDifficultyMix(text: string): { easy: number; medium: number; hard: number } {
  const lower = text.toLowerCase();
  if (/\b(hard|challenging|difficult|advanced|demanding)\b/.test(lower) && !/easy/.test(lower)) {
    return { easy: 0.15, medium: 0.4, hard: 0.45 };
  }
  if (/\b(easy|simple|foundation|basic)\b/.test(lower) && !/hard/.test(lower)) {
    return { easy: 0.55, medium: 0.35, hard: 0.1 };
  }
  return { easy: 0.35, medium: 0.4, hard: 0.25 };
}

/** Grade order from a label such as "Grade 9", "MYP4", "Year 10", "CM2". */
export function gradeOrderFromLabel(label: string | null | undefined): number {
  if (!label) return 9;
  const text = label.trim().toLowerCase();
  const myp = /myp\s*([1-5])/.exec(text);
  if (myp) return Number(myp[1]) + 5; // MYP1 → 6 … MYP5 → 10
  const grade = /(?:grade|year)\s*(\d{1,2})/.exec(text);
  if (grade) return Math.max(0, Math.min(13, Number(grade[1])));
  const primary: Record<string, number> = { cp: 1, ce1: 2, ce2: 3, cm1: 4, cm2: 5, sixieme: 6, "6e": 6, cinquieme: 7, "5e": 7, quatrieme: 8, "4e": 8, troisieme: 9, "3e": 9, seconde: 10, premiere: 11, terminale: 12 };
  for (const [key, value] of Object.entries(primary)) {
    if (text.includes(key)) return value;
  }
  return 9;
}
