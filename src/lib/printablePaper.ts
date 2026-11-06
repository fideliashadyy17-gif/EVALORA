import { publicQuestion, type SessionQuestionRow } from "./live";
import type { PublicQuestion } from "@/components/QuestionRunner";

export class PrintablePaperError extends Error {}

/** Strictly supported paper types. Do not silently omit an interactive item. */
const PAPER_TYPES = new Set(["single_choice", "multiple_select", "true_false", "short_answer", "numeric", "open_ended"]);

export function preparePrintableQuestions(rows: SessionQuestionRow[], organizationId: string) {
  if (!rows.length) throw new PrintablePaperError("This examination has no questions.");
  return rows.map((row, index) => {
    // Query is additionally protected by RLS. Even the Super Admin must not
    // produce a paper from a cross-organization association by accident.
    const q = row.questions as SessionQuestionRow["questions"] & { organization_id?: string };
    if (!q || q.organization_id !== organizationId || q.id !== row.question_id)
      throw new PrintablePaperError(`Question ${index + 1} cannot be verified for this organization.`);
    if (!PAPER_TYPES.has(q.type)) throw new PrintablePaperError(`Question ${index + 1} (${q.type}) is not yet supported on paper.`);
    const item = publicQuestion(row, { seed: "paper" }) as unknown as PublicQuestion;
    if (!Number.isFinite(item.points) || item.points < 0) throw new PrintablePaperError(`Question ${index + 1} has invalid marks.`);
    if (item.media_url && item.media_type !== "image")
      throw new PrintablePaperError(`Question ${index + 1} contains media that cannot be printed.`);
    if (["single_choice", "multiple_select", "true_false"].includes(item.type) && !item.options.length)
      throw new PrintablePaperError(`Question ${index + 1} has no printable options.`);
    return item;
  });
}
