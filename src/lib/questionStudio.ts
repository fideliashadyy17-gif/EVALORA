import "server-only";

/**
 * Question Studio configuration — the bridge between the Platform Control
 * Center's `question_studio` namespace and the authoring UI.
 *
 * The plain shapes and shipped fallbacks live in `./questionStudioClient` so a
 * client component can import the type without dragging the config service
 * (which uses the service-role client) into the browser bundle. This module is
 * the server half: it reads real configuration and returns one of those shapes.
 *
 * Two rules govern everything here, both hard requirements:
 *
 *   1. **Disabling a question type never orphans content.** The configured list
 *      can only ever *narrow* what the type picker offers for NEW questions. A
 *      question already stored with a withdrawn type still opens, renders, marks
 *      and prints — `allQuestionTypes()` always returns the full registry.
 *   2. **A design change never restyles a published examination.** Design
 *      defaults apply to newly authored questions. Once a question carries its
 *      own `config.design` snapshot, that snapshot wins (see `effectiveDesign()`
 *      in ./questionDesign).
 *
 * Resolution fails soft: an unreachable configuration store returns the shipped
 * defaults rather than making authoring impossible.
 */
import { getQuestionStudioConfig } from "@/lib/config/service";
import {
  DEFAULT_STUDIO_CONFIG,
  allQuestionTypes,
  normalizeDifficulty,
  safeNumberingStyle,
  type QuestionStudioClientConfig,
} from "@/lib/questionStudioClient";
import { designFromConfig } from "@/lib/questionDesign";

export type {
  QuestionStudioClientConfig,
  QuestionTypeOption,
} from "@/lib/questionStudioClient";

export {
  allQuestionTypes,
  isKnownQuestionType,
  isTypeStillEnabled,
  knownQuestionTypeOr,
  normalizeDifficulty,
} from "@/lib/questionStudioClient";

/**
 * Resolve Question Studio configuration for one scope (platform when
 * `organizationId` is null, otherwise the organization's overrides on top of
 * the platform layer).
 */
export async function resolveQuestionStudioConfig(
  organizationId?: string | null,
): Promise<QuestionStudioClientConfig> {
  let config: Awaited<ReturnType<typeof getQuestionStudioConfig>> | null = null;
  try {
    config = await getQuestionStudioConfig(organizationId ?? null);
  } catch {
    config = null;
  }
  if (!config) return DEFAULT_STUDIO_CONFIG;

  const all = allQuestionTypes();
  const enabledRaw = Array.isArray(config.enabled_question_types) ? config.enabled_question_types : [];
  const enabledValues = new Set(enabledRaw.filter((v): v is string => typeof v === "string"));

  // Narrow the registry, never extend it: a value that is not a real renderer
  // would offer a type the engine cannot mark, so it is dropped here rather
  // than presented as functional.
  const questionTypes = enabledValues.size ? all.filter((t) => enabledValues.has(t.value)) : all;
  const withdrawnTypes = all.filter((t) => !questionTypes.some((q) => q.value === t.value));

  return {
    // A configuration that would leave authors unable to create any question is
    // refused outright: fall back to the full registry.
    questionTypes: questionTypes.length ? questionTypes : all,
    withdrawnTypes,
    difficultyLevels: normalizeDifficulty(config.difficulty_levels),
    design: designFromConfig(config),
    numberingStyle: safeNumberingStyle(config.numbering_style),
  };
}
