/**
 * Printable paper beyond the question sheet: a candidate answer sheet, a marker's
 * rubric grid, and per-candidate packets. Everything here is a pure builder over
 * data the page has already loaded and authorised; nothing queries the database
 * and nothing writes.
 *
 * The rubric that applies to a question is resolved with `rubricForQuestion`, the
 * same helper the marking queue uses, so paper and screen cannot disagree about
 * which criteria apply.
 */
import { rubricForQuestion, type ExamRubricLink } from "./grading";

export class PrintablePacketError extends Error {}

export type PaperItem = {
  quiz_question_id: string;
  question_id: string;
  type: string;
  points: number;
  options: readonly unknown[];
};

export type PaperCandidate = {
  id: string;
  full_name: string;
  access_code?: string | null;
};

export type RubricCriterionRow = {
  id: string;
  code?: string | null;
  label: string;
  maxMarks: number;
};

/** The rubric criteria a criterion belongs to, keyed by rubric id. */
export type CriteriaByRubric = ReadonlyMap<string, readonly RubricCriterionRow[]>;

const CHOICE_TYPES = new Set(["single_choice", "multiple_select", "true_false"]);

/**
 * How much writing space a question needs on an answer sheet. Printed-option
 * questions get none — the candidate writes a letter in a box instead.
 */
export function answerLinesFor(type: string): number {
  if (CHOICE_TYPES.has(type)) return 0;
  switch (type) {
    case "open_ended":
      return 7;
    case "short_answer":
      return 4;
    default:
      return 2;
  }
}

export type AnswerSheetRow = {
  number: number;
  kind: "choices" | "lines";
  type: string;
  points: number;
  lines: number;
  choiceLabels: string[];
};

export function buildAnswerSheet(items: readonly PaperItem[]): AnswerSheetRow[] {
  return items.map((item, index): AnswerSheetRow => {
    const lines = answerLinesFor(item.type);
    const choices = CHOICE_TYPES.has(item.type) ? item.options.length : 0;
    const choiceLabels = Array.from({ length: choices }, (_, i) => String.fromCharCode(65 + i));
    // A question with printed options but an unrecognised option count would
    // otherwise produce an empty answer row; fall back to writing space.
    if (lines === 0 && choiceLabels.length > 0) {
      return { number: index + 1, kind: "choices", type: item.type, points: Number(item.points), lines: 0, choiceLabels };
    }
    return {
      number: index + 1,
      kind: "lines",
      type: item.type,
      points: Number(item.points),
      lines: lines > 0 ? lines : 2,
      choiceLabels: [],
    };
  });
}

export type MarkerRow = {
  number: number;
  questionId: string;
  points: number;
  rubricId: string | null;
  rubricTitle: string | null;
  level: "question" | "exam" | null;
  criteria: RubricCriterionRow[];
  criteriaTotal: number;
};

/**
 * The grid a marker fills in on paper. A question with no attached rubric still
 * gets a row — the marker records a single mark — so no question silently drops
 * off the sheet.
 */
export function buildMarkerGrid(
  items: readonly PaperItem[],
  links: readonly ExamRubricLink[],
  criteriaByRubric: CriteriaByRubric,
): MarkerRow[] {
  return items.map((item, index) => {
    const match = rubricForQuestion([...links], item.question_id);
    const criteria = match ? [...(criteriaByRubric.get(match.link.rubric_id) ?? [])] : [];
    for (const criterion of criteria) {
      if (!Number.isFinite(criterion.maxMarks) || criterion.maxMarks <= 0) {
        throw new PrintablePacketError(`Question ${index + 1} has a rubric criterion without a valid maximum.`);
      }
    }
    return {
      number: index + 1,
      questionId: item.question_id,
      points: Number(item.points),
      rubricId: match?.link.rubric_id ?? null,
      rubricTitle: match?.link.grading_rubrics?.title ?? null,
      level: match?.level ?? null,
      criteria,
      criteriaTotal: Math.round(criteria.reduce((sum, c) => sum + c.maxMarks, 0) * 100) / 100,
    };
  });
}

export type CandidatePacket = {
  index: number;
  candidate: PaperCandidate;
  answerSheet: AnswerSheetRow[];
  markerGrid: MarkerRow[];
  totalMarks: number;
};

/**
 * One packet per candidate, in a stable order. Duplicate rows for the same
 * candidate are collapsed so a messy import cannot produce two packets for one
 * person, and the packet count is returned with the data so the page can warn
 * before rendering hundreds of pages.
 */
export function buildCandidatePackets(
  candidates: readonly PaperCandidate[],
  items: readonly PaperItem[],
  links: readonly ExamRubricLink[],
  criteriaByRubric: CriteriaByRubric,
): CandidatePacket[] {
  const seen = new Set<string>();
  const ordered = [...candidates]
    .filter((candidate) => {
      if (!candidate.id || seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" }));

  if (ordered.length === 0) {
    throw new PrintablePacketError("This examination has no candidates, so there are no packets to print.");
  }

  const answerSheet = buildAnswerSheet(items);
  const markerGrid = buildMarkerGrid(items, links, criteriaByRubric);
  const totalMarks = Math.round(items.reduce((sum, item) => sum + Number(item.points), 0) * 100) / 100;

  return ordered.map((candidate, index) => ({ index, candidate, answerSheet, markerGrid, totalMarks }));
}
