/**
 * Question Studio — the plain, serializable half of the configuration.
 *
 * This module is deliberately free of `server-only` and of any database
 * access. It holds the *shapes* that cross the server/client boundary plus the
 * shipped fallbacks, so:
 *
 *   • `src/lib/questionStudio.ts` (server-only) resolves real configuration
 *     from the Control Center and returns one of these objects;
 *   • `src/components/QuestionForm.tsx` (client) can import the type and the
 *     fallback without pulling the config service — which uses the
 *     service-role client — into the browser bundle.
 *
 * The two rules that shape every value here:
 *
 *   1. Withdrawing a question type narrows the picker for NEW questions only.
 *      `allQuestionTypes()` is always the full registry, because every stored
 *      question of a withdrawn type must still open, render and save.
 *   2. Design defaults apply to newly authored questions. A question that
 *      already carries its own design snapshot keeps it, so changing a default
 *      here can never restyle a published examination.
 */
import { QUESTION_TYPES } from "@/lib/brand";
import {
  DEFAULT_QUESTION_DESIGN,
  isNumberingStyle,
  type NumberingStyle,
  type QuestionDesign,
} from "@/lib/questionDesign";

/** One entry of the question-type registry. */
export interface QuestionTypeOption {
  value: string;
  label: string;
  /** Whether the examination engine can mark this type automatically. */
  auto: boolean;
}

/** Every question type EVALORA can render, regardless of configuration. */
export function allQuestionTypes(): QuestionTypeOption[] {
  return QUESTION_TYPES.map((t) => ({ value: t.value, label: t.label, auto: t.auto }));
}

/** Plain-data view of Question Studio configuration handed to the editor. */
export interface QuestionStudioClientConfig {
  /** Types offered in the picker for NEW questions. Never empty. */
  questionTypes: QuestionTypeOption[];
  /** Types withdrawn from the picker; still fully functional in stored content. */
  withdrawnTypes: QuestionTypeOption[];
  /** Difficulty labels offered when categorizing a question. Never empty. */
  difficultyLevels: string[];
  /** Design defaults applied to newly authored questions. */
  design: QuestionDesign;
  numberingStyle: NumberingStyle;
}

export const DEFAULT_DIFFICULTY_LEVELS = ["easy", "medium", "hard"] as const;

/**
 * Every label `public.questions.difficulty` can hold (CHECK constraint
 * `questions_difficulty_check`). Configuration selects a subset of this list; it
 * cannot extend it, because the database would reject the write.
 */
export const SUPPORTED_DIFFICULTY_LEVELS = ["easy", "medium", "hard", "competition"] as const;

/** What the editor uses when no configuration has been supplied. */
export const DEFAULT_STUDIO_CONFIG: QuestionStudioClientConfig = {
  questionTypes: allQuestionTypes(),
  withdrawnTypes: [],
  difficultyLevels: [...DEFAULT_DIFFICULTY_LEVELS],
  design: DEFAULT_QUESTION_DESIGN,
  numberingStyle: DEFAULT_QUESTION_DESIGN.numberingStyle,
};

/**
 * Normalise a configured difficulty vocabulary.
 *
 * Only labels the question store accepts survive, in the order the administrator
 * chose, de-duplicated case-insensitively. An invented label is dropped rather
 * than passed through: offering a label the database would reject turns the next
 * save into an unexplained error. The result is never empty — an empty picker
 * would make authoring impossible, so the shipped default is restored.
 */
export function normalizeDifficulty(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_DIFFICULTY_LEVELS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const key = entry.trim().toLowerCase();
    if (!(SUPPORTED_DIFFICULTY_LEVELS as readonly string[]).includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= SUPPORTED_DIFFICULTY_LEVELS.length) break;
  }
  return out.length ? out : [...DEFAULT_DIFFICULTY_LEVELS];
}

/**
 * Whether a stored question's type is still offered to authors. The editor uses
 * this to show an explanatory badge on a withdrawn type instead of hiding it or
 * resetting it, either of which would destroy the author's content.
 */
export function isTypeStillEnabled(config: QuestionStudioClientConfig, type: string): boolean {
  return config.questionTypes.some((t) => t.value === type);
}

/** True when the type exists in the engine's registry at all. */
export function isKnownQuestionType(type: string): boolean {
  return QUESTION_TYPES.some((t) => t.value === type);
}

/** Coerce untrusted input (e.g. a query-string type hint) to a known type. */
export function knownQuestionTypeOr(value: unknown, fallback = "single_choice"): string {
  if (typeof value === "string" && isKnownQuestionType(value)) return value;
  return isKnownQuestionType(fallback) ? fallback : allQuestionTypes()[0]!.value;
}

/** Narrow an untrusted numbering style to a member of the closed vocabulary. */
export function safeNumberingStyle(value: unknown): NumberingStyle {
  return isNumberingStyle(value) ? value : DEFAULT_QUESTION_DESIGN.numberingStyle;
}
