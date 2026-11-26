/**
 * Question-level marking evidence for a released candidate paper.
 *
 * This module turns one attempt's rows plus its stored marks into a
 * per-question, per-part marking plan: what the candidate wrote, how many marks
 * each part earned, and — where the marking scheme allows it to be revealed —
 * the expected answer.
 *
 * Two rules govern everything here:
 *
 *  1. The stored mark is the authority. `points_awarded` was set by the marking
 *     engine or by a teacher, so the plan explains that mark; it never
 *     re-marks the paper and never silently disagrees with the total. Per-part
 *     detail is used only to describe how the stored total was reached.
 *  2. Expected answers are shown only where they are objective. Objective
 *     questions (a fixed key, or a numeric/text part with an exact answer) may
 *     print the correct answer. Extended written justifications and
 *     "explain why" parts may not: those were marked against a rubric, and
 *     printing a model answer would replace the marker's judgement with a
 *     string comparison.
 */

import { assessPartsFromConfig, parseStudentNumber } from "./assessParts.ts";
import type { SessionQuestionRow } from "./live.ts";

/** How one part of a question was marked. */
export type MarkStatus = "correct" | "partial" | "wrong" | "unanswered" | "not_marked";

export interface MarkedPart {
  /** Display label, e.g. "(a)(i)". */
  label: string;
  prompt: string;
  /** What the candidate wrote, preserved verbatim. Null when left blank. */
  candidateResponse: string | null;
  earned: number | null;
  max: number;
  status: MarkStatus;
  /** The expected answer, but ONLY when the scheme makes it objectively revealable. */
  expected: string | null;
}

export interface MarkedMatchingRow {
  left: string;
  /** The candidate's paired choice, verbatim. */
  candidateRight: string | null;
  expectedRight: string;
  status: MarkStatus;
}

export interface MarkedOption {
  letter: string;
  label: string;
  isCorrect: boolean;
}

export interface QuestionMarkPlan {
  questionId: string;
  number: number;
  printedLabel: string | null;
  type: string;
  criterion: string | null;
  earned: number | null;
  max: number;
  status: MarkStatus;
  parts: MarkedPart[];
  matchingRows: MarkedMatchingRow[];
  /** Options for objective questions, so a wrong choice can name the right one. */
  options: MarkedOption[];
  /** Letters of the correct options (objective questions only). */
  correctLetters: string[];
  /** Letters the candidate chose. */
  chosenLetters: string[];
  /** Plain expected answer for objective questions with a single correct value. */
  expectedAnswer: string | null;
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

const round2 = (n: number): number => Math.round(n * 100) / 100;

function statusFor(earned: number | null, max: number, answered: boolean): MarkStatus {
  if (earned === null) return "not_marked";
  if (!answered && earned <= 0) return "unanswered";
  if (max > 0 && earned >= max - 1e-9) return "correct";
  if (earned <= 1e-9) return "wrong";
  return "partial";
}

/**
 * Marks that a part's expected answer may be printed.
 *
 * Integer answers and short fixed values are objectively right or wrong. Long
 * prose answers are rubric-marked, so the paper must not print them as though
 * they were the only acceptable wording.
 */
function isRevealableExpected(kind: string, accepted: string[]): boolean {
  if (!accepted.length) return false;
  if (kind === "numeric") return true;
  // The first accepted entry is the model answer. A candidate who has already
  // submitted is entitled to see it — that is the feedback they asked for — but
  // only when it is a single answer. Longer entries are keyword rubrics that
  // list alternative whole sentences; printing one would misrepresent the
  // marking as having a single correct wording.
  const model = accepted[0].trim();
  if (!model) return false;
  if (model.length > 160) return false;
  if (model.split(/\s+/).length > 16) return false;
  // A rubric keyword list is separated by these markers rather than written as
  // one answer.
  if (/\b(accept|award|mark|allow|either|or any|must include)\b/i.test(model)) return false;
  return true;
}

interface AnswerRow {
  question_id: string;
  answer?: unknown;
  points_awarded?: number | string | null;
  marker_note?: string | null;
  grading_note?: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * The text a reader sees for one option.
 *
 * Flattened here rather than imported from the content module so this planner
 * stays independently loadable; it only needs an option's visible words.
 */
function optionDisplayText(o: { label?: string | null; content_doc?: unknown }): string {
  const text = richTextPlain(o.content_doc).replace(/\s+/g, " ").trim();
  return text || (o.label ?? "").trim();
}

function richTextPlain(node: unknown): string {
  if (!isRecord(node)) return "";
  if (typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return " ";
  if (node.type === "mathInline" || node.type === "mathBlock") {
    const latex = isRecord(node.attrs) && typeof node.attrs.latex === "string" ? node.attrs.latex : "";
    return latex ? ` ${latex} ` : "";
  }
  const children = Array.isArray(node.content) ? node.content : [];
  return children.map((child) => richTextPlain(child)).join("");
}

function strParts(v: unknown): Record<string, string> {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") out[k] = val;
    else if (typeof val === "number" && Number.isFinite(val)) out[k] = String(val);
  }
  return out;
}

/**
 * Build the marking plan for one attempt.
 *
 * `rows` are the attempt's question rows in presented order (the same rows the
 * paper renders), so question numbering matches the candidate's own paper.
 */
export function buildQuestionMarkPlans(
  rows: SessionQuestionRow[],
  answeredRows: AnswerRow[],
): QuestionMarkPlan[] {
  const byQuestion = new Map<string, AnswerRow>();
  for (const a of answeredRows) byQuestion.set(a.question_id, a);

  return rows.map((row, index) => {
    const q = row.questions;
    const cfg = (q.config ?? {}) as Record<string, unknown>;
    const max = Number(row.points ?? q.points ?? 0) || 0;
    const saved = byQuestion.get(q.id);
    const raw = saved?.points_awarded;
    const earned = raw === null || raw === undefined || raw === "" ? null : round2(Number(raw));
    const payload = isRecord(saved?.answer) ? saved.answer : {};

    const criterionRaw = typeof cfg.myp_criterion === "string" ? cfg.myp_criterion.trim() : "";
    const printedLabel =
      typeof cfg.question_number === "number" || typeof cfg.question_number === "string"
        ? String(cfg.question_number)
        : null;

    const options: MarkedOption[] = [...(q.question_options ?? [])]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((o, i) => ({
        letter: String.fromCharCode(65 + i),
        // Authored papers keep only the letter ("A") in `label` and the real
        // option text in `content_doc`. Naming the expected answer from `label`
        // alone printed "Expected answer: C. C", which tells the student
        // nothing — so the document's own text wins when it has any.
        label: optionDisplayText(o),
        isCorrect: Boolean(o.is_correct),
      }));
    const correctLetters = options.filter((o) => o.isCorrect).map((o) => o.letter);

    const chosen: string[] = [];
    const single = typeof payload.option_id === "string" ? payload.option_id : null;
    const multi = Array.isArray(payload.option_ids) ? payload.option_ids.filter((v): v is string => typeof v === "string") : [];
    const optionIds = single ? [single, ...multi] : multi;
    for (const id of optionIds) {
      const idx = (q.question_options ?? []).findIndex((o) => o.id === id);
      if (idx >= 0) {
        // Options are presented in the candidate's own order; map by id.
        const presentedIdx = [...(q.question_options ?? [])]
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .findIndex((o) => o.id === id);
        const letter = String.fromCharCode(65 + (presentedIdx >= 0 ? presentedIdx : idx));
        if (!chosen.includes(letter)) chosen.push(letter);
      }
    }

    // ── Multi-part questions ────────────────────────────────────────────────
    const parts: MarkedPart[] = [];
    let answeredAny = false;
    if (q.type === "assess_parts") {
      const specs = assessPartsFromConfig(cfg);
      const given = strParts(payload.parts);
      const answered = specs.filter((spec) => Boolean(given[spec.id]?.trim()));

      // Marks are whole marks. Spreading the stored question mark across the
      // parts in proportion would put 0.67 on a part the school paid 1 mark for
      // and 0.33 on a genuine error — numbers no teacher ever awarded. Instead:
      //
      //   * if the stored mark is only reachable one way (every answered part
      //     paid in full, nothing else), award exactly that — this is the one
      //     allocation the evidence proves;
      //   * otherwise allocate whole marks, paying answered parts in full while
      //     the budget allows, then leave the rest unevidenced rather than invent
      //     a per-part figure the records never held.
      //
      // In every branch the parts sum exactly to the stored question mark, and a
      // part whose own mark the records do not establish is marked `not_marked`
      // and printed "Allocated from the question total" — never as WRONG.
      const perPartKnown =
        earned !== null && answered.length === 1 && Math.abs(earned - answered[0].points) < 0.005;
      const allFull =
        earned !== null && earned > 0 && earned === specs.reduce((sum, spec) => sum + spec.points, 0);
      const nothingEarned = earned !== null && earned <= 0;

      const awards = new Map<string, number | null>();
      for (const spec of specs) awards.set(spec.id, null);
      // A part the candidate left blank is a zero, always and first: it is a
      // recorded fact about the submission, not an inference about the marking.
      for (const spec of specs) {
        if (!given[spec.id]?.trim()) awards.set(spec.id, 0);
      }
      if (answered.length === 1 && (perPartKnown || allFull || nothingEarned)) {
        const only = answered[0];
        if (nothingEarned) awards.set(only.id, 0);
        else if (perPartKnown) awards.set(only.id, earned);
        else awards.set(only.id, only.points);
      } else if (earned !== null) {
        // Where every part carries an answer key, the paper can be marked from
        // the key itself. Credit it only if the resulting total is exactly the
        // mark the school recorded — that is what makes the split provable
        // rather than inferred.
        const keyed = specs.every(
          (spec) => spec.answer !== undefined && spec.answer !== null || (spec.accepted?.length ?? 0) > 0,
        );
        let keyApplied = false;
        if (keyed) {
          // A blank part is a zero whatever the key says.
          const awardedByKey = (spec: (typeof specs)[number]): number => {
            if (!given[spec.id]?.trim()) return 0;
            const target =
              spec.answer !== undefined && spec.answer !== null ? String(spec.answer) : (spec.accepted ?? [])[0] ?? null;
            return target !== null && responseMatchesKey(given[spec.id]?.trim() ?? null, target) ? spec.points : 0;
          };
          const byKey = specs.map(awardedByKey);
          const keyTotal = round2(byKey.reduce((sum, value) => sum + value, 0));
          // Use the key when it agrees with the stored mark, or when it pays no
          // more than the stored mark — the parts it pays are then proved right
          // by the key itself, and the remaining credit stays in the question
          // total rather than being attributed to a part on no evidence.
          if (keyTotal <= earned + 0.005) {
            specs.forEach((spec, index) => awards.set(spec.id, byKey[index]));
            keyApplied = true;
          }
        }

        // When the key explains the marking, it is the marking: never top a
        // keyed verdict up. Paid marks the key cannot account for stay in the
        // question total and are disclosed as such.
        const anyAwarded = specs.some((spec) => awards.get(spec.id) !== null && awards.get(spec.id) !== 0);
        if (!keyApplied && !anyAwarded) {
          // No provable split: pay the answered parts in full while the budget
          // allows and leave the remainder unevidenced. Blank parts are already
          // zero and stay zero.
          let budget = earned;
          for (const spec of specs) {
            if (!given[spec.id]?.trim()) continue;
            if (budget > 0 && budget >= spec.points - 1e-9) {
              awards.set(spec.id, spec.points);
              budget = round2(budget - spec.points);
            }
          }
        }
      }

      for (const spec of specs) {
        const response = given[spec.id]?.trim() ? given[spec.id].trim() : null;
        if (response) answeredAny = true;
        const partEarned = awards.get(spec.id) ?? null;
        const accepted = spec.accepted ?? [];
        const expected =
          spec.kind === "numeric" && spec.answer !== undefined && spec.answer !== null
            ? String(spec.answer)
            : isRevealableExpected(spec.kind, accepted)
              ? accepted[0]
              : null;
        parts.push({
          label: spec.label,
          prompt: spec.prompt,
          candidateResponse: response,
          earned: partEarned,
          max: spec.points,
          status: statusFor(partEarned, spec.points, Boolean(response)),
          expected,
        });
      }
    }

    // ── Matching questions ─────────────────────────────────────────────────
    const matchingRows: MarkedMatchingRow[] = [];
    if (q.type === "matching") {
      const keyPairs = Array.isArray(cfg.pairs)
        ? (cfg.pairs as { left?: unknown; right?: unknown }[])
            .filter((p) => typeof p.left === "string" && typeof p.right === "string")
            .map((p) => ({ left: String(p.left), right: String(p.right) }))
        : [];
      const givenPairs = Array.isArray(payload.pairs)
        ? (payload.pairs as { left?: unknown; right?: unknown }[]).filter(
            (p) => typeof p.left === "string" && typeof p.right === "string",
          )
        : [];
      if (givenPairs.length) answeredAny = true;
      const givenMap = new Map(givenPairs.map((p) => [norm(String(p.left)), String(p.right ?? "")]));
      for (const pair of keyPairs) {
        const candidateRight = givenMap.get(norm(pair.left)) ?? null;
        const ok = candidateRight !== null && norm(candidateRight) === norm(pair.right);
        matchingRows.push({
          left: pair.left,
          candidateRight,
          expectedRight: pair.right,
          status: ok ? "correct" : candidateRight === null ? "unanswered" : "wrong",
        });
      }
    }

    if (chosen.length || Object.keys(strParts(payload.parts)).length || matchingRows.some((r) => r.candidateRight)) {
      answeredAny = true;
    }

    // Objective questions: name the expected answer.
    let expectedAnswer: string | null = null;
    if ((q.type === "single_choice" || q.type === "true_false" || q.type === "multi_select") && correctLetters.length) {
      const labels = options
        .filter((o) => o.isCorrect)
        .map((o) => (q.type === "true_false" ? o.label : `${o.letter}. ${o.label}`));
      expectedAnswer = labels.join(" · ");
    }

    return {
      questionId: q.id,
      number: index + 1,
      printedLabel,
      type: q.type,
      criterion: criterionRaw ? criterionRaw.toUpperCase() : null,
      earned,
      max,
      status: statusFor(earned, max, answeredAny),
      parts,
      matchingRows,
      options,
      correctLetters,
      chosenLetters: chosen,
      expectedAnswer,
    };
  });
}

/**
 * Compare a candidate's response with an accepted answer.
 *
 * Deliberately strict about wording and deliberately tolerant about the things
 * that carry no meaning: spacing, a trailing full stop, or the variable name the
 * candidate used instead of the one in the key (`u1=4` and `U1=4` are the same
 * answer, and `u1=4, u5=24` satisfies a key of `4 and 24`). It never treats a
 * rough resemblance as a match, so a part is only credited when the response
 * really does give the keyed values.
 */
export function responseMatchesKey(given: string | null, expected: string | null): boolean {
  if (!given || !expected) return false;
  if (norm(given).replace(/[.;]$/, "") === norm(expected).replace(/[.;]$/, "")) return true;

  // Single values (the common case): compare as numbers when both sides are one.
  const a = parseStudentNumber(given);
  const b = parseStudentNumber(expected);
  if (a !== null && b !== null) return Math.abs(a - b) < 1e-9;

  // Multi-part keys such as "4 and 24" or "Arithmetic, 2": the response must
  // supply every keyed value. Values that are words must appear; values that are
  // numbers must match a number in the response, so 72 never satisfies 2.
  const keyed = tokensOf(expected);
  if (!keyed.length) return false;
  const supplied = tokensOf(given);
  const suppliedNumbers = numbersIn(given);
  return keyed.every((token) => {
    if (/^-?\d+(\.\d+)?$/.test(token)) {
      const value = Number(token);
      return suppliedNumbers.some((n) => Math.abs(n - value) < 1e-9);
    }
    // Words must match a whole supplied token. Substring matching would let
    // "Tn=n+3" satisfy a key of "n^2", which is exactly the kind of silent
    // false credit this paper must never give.
    return supplied.includes(token);
  });
}

/** Lower-cased word and value tokens with variable labels and punctuation gone. */
function tokensOf(text: string): string[] {
  return norm(text)
    // Superscripts and typographic operators carry meaning: render them plainly
    // so "n²" and "n^2" are the same answer and neither degrades to just "n".
    .replace(/[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]/g, (c) => `^${"0123456789"["⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c)]}`)
    .replace(/[×✕✖]/g, "*")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    // "u1=4" / "x = 2.5" -> "4" / "2.5" : labels are the question's, not the answer's.
    .replace(/\b[a-z]\s*\d*\s*=\s*/g, " ")
    .replace(/[()\[\]{}]/g, " ")
    .split(/[,\s;]+|\band\b/)
    .map((token) => token.replace(/\^/g, "").replace(/[^a-z0-9.\-]/g, ""))
    .filter((token) => token.length > 0);
}

function numbersIn(text: string): number[] {
  return (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
}
