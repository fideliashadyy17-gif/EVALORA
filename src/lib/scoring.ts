/** Server-side objective scoring for examinations and live quizzes. */
export type AnswerPayload = Record<string, unknown>;

export interface ScorableOption {
  id: string;
  label: string;
  is_correct: boolean;
}

export interface ScorableQuestion {
  type: string;
  points: number;
  config: Record<string, unknown> | null;
}

export interface ScoreResult {
  isCorrect: boolean | null; // null → manual / not scorable
  points: number;
}

/** Invalid keys or stale/invalid answers must never silently become marks. */
export class ScoringError extends Error {
  constructor() { super("The answer or marking key cannot be verified."); this.name = "ScoringError"; }
}

import { assessPartsFromConfig, canonicalExpression, parseStudentNumber, scoreAssessParts, textAnswersMatch } from "./assessParts";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const validNumber = (v: unknown): number | null => {
  if (typeof v !== "number" && (typeof v !== "string" || !v.trim())) return null;
  const number = Number(v);
  return Number.isFinite(number) ? number : null;
};
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((item) => typeof item === "string");
const isPair = (v: unknown): v is {left: string; right: string} =>
  !!v && typeof v === "object" && typeof (v as Record<string, unknown>).left === "string" && typeof (v as Record<string, unknown>).right === "string";

export function scoreAnswer(
  question: ScorableQuestion,
  options: ScorableOption[],
  answer: AnswerPayload,
  pointsOverride?: number | null,
): ScoreResult {
  const max = validNumber(pointsOverride ?? question.points);
  if (max === null || max < 0) throw new ScoringError();
  const cfg = question.config ?? {};
  switch (question.type) {
    case "single_choice":
    case "true_false": {
      if (options.filter((o) => o.is_correct).length !== 1 || typeof answer.option_id !== "string") throw new ScoringError();
      const chosen = options.find((o) => o.id === answer.option_id);
      // This includes a saved option whose ID disappeared after a paper edit.
      if (!chosen) throw new ScoringError();
      return { isCorrect: chosen.is_correct, points: chosen.is_correct ? max : 0 };
    }
    case "multiple_select": {
      if (!isStringArray(answer.option_ids)) throw new ScoringError();
      const picked = new Set(answer.option_ids);
      const all = new Set(options.map((o) => o.id));
      const correct = new Set(options.filter((o) => o.is_correct).map((o) => o.id));
      if (!correct.size || [...picked].some((id) => !all.has(id))) throw new ScoringError();
      let hits = 0, wrong = 0;
      picked.forEach((id) => (correct.has(id) ? hits++ : wrong++));
      const ratio = Math.max(0, (hits - wrong) / correct.size);
      return { isCorrect: ratio === 1, points: Math.round(ratio * max * 100) / 100 };
    }
    case "short_answer": {
      const accepted = options.filter((o) => o.is_correct && typeof o.label === "string" && norm(o.label)).map((o) => norm(o.label));
      if (!accepted.length || typeof answer.text !== "string") throw new ScoringError();
      // Expression questions accept equivalent algebraic forms (4n-1, 4n - 1,
      // a_n = 4n - 1). Every written answer also tolerates numeric equivalence
      // (1/2 = 0.5 = 50%), a leading label, a listed equivalent, and one typo
      // in a single-word answer ("solvant" for "solvent").
      const expression = cfg.normalize_expression === true;
      const ok = accepted.some((a) => expression
        ? canonicalExpression(a) === canonicalExpression(answer.text as string)
        : textAnswersMatch(answer.text as string, a, { expression }));
      return { isCorrect: ok, points: ok ? max : 0 };
    }
    case "assess_parts": {
      const parts = assessPartsFromConfig(cfg);
      if (!parts.length) throw new ScoringError();
      const scored = scoreAssessParts(parts, answer, max);
      return { isCorrect: scored.isCorrect, points: scored.points };
    }
    case "numeric": {
      // Numeric entry accepts currency/unit text, comma decimals, fractions,
      // percentages and a final line of worked arithmetic ("18+6=24").
      const expected = parseStudentNumber(cfg.numeric_answer);
      const tolerance = cfg.tolerance == null || cfg.tolerance === "" ? 0 : validNumber(cfg.tolerance);
      const got = parseStudentNumber(answer.value);
      if (expected === null || tolerance === null || tolerance < 0 || got === null) throw new ScoringError();
      const ok = Math.abs(got - expected) <= tolerance;
      return { isCorrect: ok, points: ok ? max : 0 };
    }
    case "ordering": {
      if (!options.length || options.some((o) => typeof o.label !== "string" || !norm(o.label)) || !isStringArray(answer.order)) throw new ScoringError();
      const authored = options.map((o) => norm(o.label));
      const given = answer.order.map(norm);
      const ok = authored.length === given.length && authored.every((v, i) => v === given[i]);
      return { isCorrect: ok, points: ok ? max : 0 };
    }
    case "matching": {
      if (!Array.isArray(cfg.pairs) || !cfg.pairs.length || !cfg.pairs.every(isPair) ||
          cfg.pairs.some((p) => !norm(p.left) || !norm(p.right)) ||
          new Set(cfg.pairs.map((p) => norm(p.left))).size !== cfg.pairs.length ||
          !Array.isArray(answer.pairs) || !answer.pairs.every(isPair)) throw new ScoringError();
      const given = answer.pairs;
      if (new Set(given.map((p) => norm(p.left))).size !== given.length) throw new ScoringError();
      const map = new Map(given.map((p) => [norm(p.left), norm(p.right)]));
      let hits = 0;
      cfg.pairs.forEach((p) => { if (map.get(norm(p.left)) === norm(p.right)) hits++; });
      const ratio = hits / cfg.pairs.length;
      return { isCorrect: ratio === 1, points: Math.round(ratio * max * 100) / 100 };
    }
    case "poll":
    case "slide":
    case "open_ended":
      return { isCorrect: null, points: 0 };
    default:
      // Unknown types are not safe to mark as a zero or manual by default.
      throw new ScoringError();
  }
}
