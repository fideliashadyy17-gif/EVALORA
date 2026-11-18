/**
 * Structured construction marking — public entry point.
 *
 * The implementation lives in `scoring.ts` so the central scorer stays a
 * self-contained module (it is executed directly by the test harnesses and by
 * routes that only import the scorer). This file keeps a stable import surface
 * for the complete-script review.
 */
export {
  normaliseStructuredRules,
  scoreStructuredMarks,
  structuredExpectedSummary,
} from "./scoring";
export type { StructuredMarkRule, StructuredMarkResult, StructuredTool } from "./scoring";
