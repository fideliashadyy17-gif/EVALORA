/**
 * Server-side scoring engine. All objective scoring happens here —
 * the browser never decides points. Answer payloads are small JSON
 * objects whose shape depends on the question type:
 *   single_choice/true_false : { option_id }
 *   multiple_select           : { option_ids: string[] }
 *   short_answer              : { text }
 *   numeric                   : { value: number }
 *   ordering                  : { order: string[] }        (item labels)
 *   matching                  : { pairs: {left,right}[] }
 *   poll                      : { option_id }              (no score)
 *   open_ended / slide        : { text }                   (manual / n/a)
 */

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
  isCorrect: boolean | null; // null → needs human marking / not scorable
  points: number;
}

const norm = (s: unknown) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export function scoreAnswer(
  question: ScorableQuestion,
  options: ScorableOption[],
  answer: AnswerPayload,
  pointsOverride?: number | null,
): ScoreResult {
  const max = Number(pointsOverride ?? question.points ?? 1);
  const cfg = question.config ?? {};

  switch (question.type) {
    case "single_choice":
    case "true_false": {
      const chosen = options.find((o) => o.id === answer.option_id);
      if (!chosen) return { isCorrect: false, points: 0 };
      return { isCorrect: chosen.is_correct, points: chosen.is_correct ? max : 0 };
    }
    case "multiple_select": {
      const picked = new Set((answer.option_ids as string[]) ?? []);
      const correct = new Set(options.filter((o) => o.is_correct).map((o) => o.id));
      if (correct.size === 0) return { isCorrect: null, points: 0 };
      let hits = 0;
      let wrong = 0;
      picked.forEach((id) => (correct.has(id) ? hits++ : wrong++));
      const ratio = Math.max(0, (hits - wrong) / correct.size);
      return { isCorrect: ratio === 1, points: Math.round(ratio * max * 100) / 100 };
    }
    case "short_answer": {
      const accepted = options.filter((o) => o.is_correct).map((o) => norm(o.label));
      const ok = accepted.includes(norm(answer.text));
      return { isCorrect: ok, points: ok ? max : 0 };
    }
    case "numeric": {
      const expected = Number(cfg.numeric_answer);
      const tolerance = Number(cfg.tolerance ?? 0);
      const got = Number(answer.value);
      if (Number.isNaN(expected) || Number.isNaN(got))
        return { isCorrect: false, points: 0 };
      const ok = Math.abs(got - expected) <= tolerance;
      return { isCorrect: ok, points: ok ? max : 0 };
    }
    case "ordering": {
      const correctOrder = [...options]
        .sort((a, b) => a.id.localeCompare(b.id)) // placeholder, replaced below
        .map((o) => o.label);
      void correctOrder;
      // Correct order = options ordered by position as authored (passed in order).
      const authored = options.map((o) => norm(o.label));
      const given = ((answer.order as string[]) ?? []).map(norm);
      const ok =
        authored.length === given.length &&
        authored.every((v, i) => v === given[i]);
      return { isCorrect: ok, points: ok ? max : 0 };
    }
    case "matching": {
      const pairs = (cfg.pairs as { left: string; right: string }[]) ?? [];
      const given = (answer.pairs as { left: string; right: string }[]) ?? [];
      if (pairs.length === 0) return { isCorrect: null, points: 0 };
      const map = new Map(given.map((p) => [norm(p.left), norm(p.right)]));
      let hits = 0;
      pairs.forEach((p) => {
        if (map.get(norm(p.left)) === norm(p.right)) hits++;
      });
      const ratio = hits / pairs.length;
      return { isCorrect: ratio === 1, points: Math.round(ratio * max * 100) / 100 };
    }
    case "poll":
    case "slide":
      return { isCorrect: null, points: 0 };
    case "open_ended":
    default:
      return { isCorrect: null, points: 0 };
  }
}
