/**
 * The built-in marking rubrics for the four MYP Mathematics Summative B papers.
 *
 * These are the same rubrics that `supabase/migrations/0122_summative_b_auto_marking.sql`
 * writes into `questions.config.auto_marking`, generated from this single source
 * by `scripts/build-summative-b-rubric-migration.mjs`. Keeping the definitions
 * in one place means the engine, the tests and the database can never disagree
 * about what a question is worth.
 */

import raw from "./summativeBRubrics.json";
import { normaliseRubric, type AutoMarkRubric } from "../autoMark";

const source = raw as unknown as Record<string, unknown>;

function build(): Record<string, AutoMarkRubric> {
  const out: Record<string, AutoMarkRubric> = {};
  for (const [questionId, value] of Object.entries(source)) {
    if (questionId.startsWith("_")) continue;
    const rubric = normaliseRubric(value);
    if (rubric) out[questionId] = rubric;
  }
  return out;
}

/** Rubric by question id. Empty until first access — cheap to import. */
export const SUMMATIVE_B_RUBRICS: Record<string, AutoMarkRubric> = build();

/**
 * Resolve the rubric for a question: a teacher-authored rubric stored on the
 * question wins, then the built-in paper rubric, then nothing.
 */
export function rubricForQuestion(question: {
  id?: string;
  config?: Record<string, unknown> | null;
}): AutoMarkRubric | null {
  const fromConfig = normaliseRubric(question.config?.auto_marking);
  if (fromConfig) return fromConfig;
  if (question.id && SUMMATIVE_B_RUBRICS[question.id]) return SUMMATIVE_B_RUBRICS[question.id];
  return null;
}
