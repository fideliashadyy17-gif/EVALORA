import { publicQuestion, type SessionQuestionRow } from "./live";
import type { PublicQuestion } from "@/components/QuestionRunner";

export class PrintablePaperError extends Error {}

/**
 * Strictly supported paper types. Do not silently omit an interactive item.
 *
 * `matching`, `ordering` and `assess_parts` are ordinary authored paper
 * content: their stem lives in prompt_doc, their structure travels on the
 * candidate-safe public question (matching_lefts/rights, assess_parts) and
 * their tiles are printed options. Only genuinely screen-only types (poll,
 * slide) stay excluded.
 */
const PAPER_TYPES = new Set([
  "single_choice",
  "multiple_select",
  "true_false",
  "short_answer",
  "numeric",
  "open_ended",
  "matching",
  "ordering",
  "assess_parts",
]);

/** The question as it prints: the candidate-safe payload plus paper extras. */
export type PrintableQuestion = PublicQuestion & {
  /** Writing space the answer sheet should give this question, when known. */
  answerLines?: number;
};

export function preparePrintableQuestions(rows: SessionQuestionRow[], organizationId: string): PrintableQuestion[] {
  if (!rows.length) throw new PrintablePaperError("This examination has no questions.");
  return rows.map((row, index) => {
    // Query is additionally protected by RLS. Even the Super Admin must not
    // produce a paper from a cross-organization association by accident.
    const q = row.questions as SessionQuestionRow["questions"] & { organization_id?: string };
    if (!q || q.organization_id !== organizationId || q.id !== row.question_id)
      throw new PrintablePaperError(`Question ${index + 1} cannot be verified for this organization.`);
    if (!PAPER_TYPES.has(q.type)) throw new PrintablePaperError(`Question ${index + 1} (${q.type}) is not yet supported on paper.`);
    const item = publicQuestion(row, { seed: "paper" }) as unknown as PrintableQuestion;
    if (!Number.isFinite(item.points) || item.points < 0) throw new PrintablePaperError(`Question ${index + 1} has invalid marks.`);
    if (["single_choice", "multiple_select", "true_false"].includes(item.type) && !item.options.length)
      throw new PrintablePaperError(`Question ${index + 1} has no printable options.`);
    if (item.media_url && item.media_type !== "image")
      throw new PrintablePaperError(`Question ${index + 1} uses media that cannot be printed.`);
    // Paper extras: how much writing space the answer sheet needs. Derived
    // only from candidate-safe structure — never from answers or keys.
    if (item.type === "assess_parts" && item.assess_parts?.length) {
      item.answerLines = Math.min(24, Math.max(4, item.assess_parts.length * 3));
    } else if (item.type === "matching" && item.match_mode !== "letters" && item.matching_lefts?.length) {
      item.answerLines = Math.max(3, item.matching_lefts.length);
      // Guarantee the printed choice bank is never index-aligned with the
      // statements (a shuffle that lands on the identity permutation would
      // print every correct pair adjacent). Deterministic — same paper, same
      // rotation, every render.
      const cfg = ((row.questions as { config?: Record<string, unknown> | null }).config ?? {}) as Record<string, unknown>;
      const pairs = Array.isArray(cfg.pairs) ? (cfg.pairs as { left: string; right: string }[]) : [];
      const authoredRights = pairs.map((p) => p?.right);
      if (
        item.matching_rights &&
        item.matching_rights.length > 1 &&
        authoredRights.length === item.matching_rights.length &&
        item.matching_rights.every((right, i) => right === authoredRights[i])
      ) {
        item.matching_rights = [...item.matching_rights.slice(1), item.matching_rights[0]];
      }
    } else if (item.type === "ordering" && item.options.length) {
      item.answerLines = item.options.length;
      // The authored option order IS the correct sequence: if the seeded
      // shuffle landed on the identity permutation, rotate so the printed
      // tile bank never hands out the answer in order.
      const authoredIds = row.questions.question_options.map((o) => o.id);
      if (item.options.length > 1 && item.options.every((o, i) => o.id === authoredIds[i])) {
        item.options = [...item.options.slice(1), item.options[0]];
      }
    }
    return item;
  });
}
