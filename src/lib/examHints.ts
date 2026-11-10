/**
 * Examination hints — shared rules for the "Need a Hint?" feature.
 *
 * A hint is PEDAGOGICAL GUIDANCE, never an answer. This module owns the parts
 * that must be identical on the server, in the admin console and in tests:
 *
 *  · the progressive level model (1 gentle clue → 2 method → 3 guided step);
 *  · which database rows may be shown to a candidate (published only);
 *  · how an examination-specific hint shadows a bank-wide hint so that editing
 *    one examination never changes another;
 *  · the answer-leak guard an administrator sees before publishing.
 *
 * Nothing here reads the database or the network, so it can be unit-tested and
 * reused by the route handler, the admin actions and the browser component.
 */

export const HINT_LEVELS = [1, 2, 3] as const;
export type HintLevel = (typeof HINT_LEVELS)[number];
export const MAX_HINT_LEVELS = 3;
export const MAX_HINT_LENGTH = 800;
export const MIN_HINT_LENGTH = 8;

export const HINT_LEVEL_LABELS: Record<HintLevel, string> = {
  1: "Gentle clue",
  2: "Method reminder",
  3: "Guided next step",
};

export const HINT_STATUSES = ["draft", "approved", "published", "archived"] as const;
export type HintStatus = (typeof HINT_STATUSES)[number];

export function hintStatusLabel(status: string): string {
  switch (status) {
    case "published": return "Published";
    case "approved": return "Approved (not visible)";
    case "archived": return "Archived";
    default: return "Draft";
  }
}

/** The only shape a candidate ever receives. No ids, authors, keys or status. */
export type PublicHint = { level: number; text: string; doc: unknown | null };

export type HintRowLike = {
  question_id: string;
  exam_id: string | null;
  level: number;
  body: string;
  body_doc?: unknown;
  status?: string;
};

/** Guard against a stored blank/whitespace hint being displayed as guidance. */
export function isUsableHintText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= MIN_HINT_LENGTH;
}

/**
 * Projects a stored row onto the candidate shape. Everything else — author,
 * reviewer, status, tenant, exam id — is deliberately dropped so it can never
 * reach a browser payload or the developer tools.
 */
export function publicHint(row: HintRowLike): PublicHint | null {
  if (!isUsableHintText(row.body)) return null;
  if (!(HINT_LEVELS as readonly number[]).includes(row.level)) return null;
  return { level: row.level, text: row.body.trim(), doc: row.body_doc ?? null };
}

/**
 * Groups rows per question with the shadowing rule:
 *   · for each level, an examination-specific hint wins over the bank hint;
 *   · duplicates within the same scope are impossible (partial unique index),
 *     but are de-duplicated defensively anyway;
 *   · at most `maxLevels` hints, ordered 1 → 3.
 *
 * `examId` is the examination being displayed. Rows for a DIFFERENT examination
 * must already have been filtered by the caller; they are also rejected here so
 * a wrong hint can never be shown for a question.
 */
export function groupPublishedHints(
  rows: HintRowLike[],
  examId: string,
  options: { maxLevels?: number } = {},
): Map<string, PublicHint[]> {
  const maxLevels = Math.min(options.maxLevels ?? MAX_HINT_LEVELS, MAX_HINT_LEVELS);
  const byQuestion = new Map<string, Map<number, { hint: PublicHint; specific: boolean }>>();
  for (const row of rows) {
    if (row.status && row.status !== "published") continue;
    if (row.exam_id !== null && row.exam_id !== examId) continue;
    const hint = publicHint(row);
    if (!hint || hint.level > maxLevels) continue;
    const levels = byQuestion.get(row.question_id) ?? new Map();
    const existing = levels.get(hint.level);
    const specific = row.exam_id === examId;
    if (!existing || (specific && !existing.specific)) levels.set(hint.level, { hint, specific });
    byQuestion.set(row.question_id, levels);
  }
  const out = new Map<string, PublicHint[]>();
  for (const [questionId, levels] of byQuestion) {
    const ordered = [...levels.values()].map((entry) => entry.hint).sort((a, b) => a.level - b.level);
    if (ordered.length) out.set(questionId, ordered);
  }
  return out;
}

/** The candidate-facing payload for one question, or an empty list. */
export function hintsForQuestion(
  map: Map<string, PublicHint[]>,
  questionId: string | null | undefined,
): PublicHint[] {
  if (!questionId) return [];
  return map.get(questionId) ?? [];
}

export type HintsPolicy = { enabled: boolean; maxLevels: number; requireReview: boolean };

export const DEFAULT_HINTS_POLICY: HintsPolicy = { enabled: true, maxLevels: MAX_HINT_LEVELS, requireReview: true };

/** Reads `platform_settings.exam_hints_policy` defensively; bad data means default. */
export function parseHintsPolicy(value: unknown): HintsPolicy {
  if (!value || typeof value !== "object") return { ...DEFAULT_HINTS_POLICY };
  const raw = value as Record<string, unknown>;
  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_HINTS_POLICY.enabled;
  const maxLevelsRaw = Number(raw.max_levels);
  const maxLevels = Number.isFinite(maxLevelsRaw)
    ? Math.min(Math.max(Math.trunc(maxLevelsRaw), 1), MAX_HINT_LEVELS)
    : DEFAULT_HINTS_POLICY.maxLevels;
  const requireReview = typeof raw.require_review === "boolean" ? raw.require_review : DEFAULT_HINTS_POLICY.requireReview;
  return { enabled, maxLevels, requireReview };
}

export type HintLeakInput = {
  /** Text of the competition/examination options that are correct. */
  correctOptionLabels?: string[];
  /** Accepted answers for numeric/short-answer questions. */
  acceptedAnswers?: string[];
};

export type HintLeakFinding = { level: "block" | "warn"; reason: string };

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Heuristic answer-leak guard used before a hint is published and shown to an
 * author while editing. It cannot prove a hint is safe, so it only reports the
 * two leaks that are mechanically detectable:
 *   · the hint repeats a correct option's full text (block);
 *   · the hint contains an accepted answer as a standalone token (warn).
 * Short option labels ("A", "12") are ignored to avoid nonsense matches.
 */
export function findHintLeaks(body: string, input: HintLeakInput = {}): HintLeakFinding[] {
  const findings: HintLeakFinding[] = [];
  const text = normalize(body);
  if (!text) return findings;

  for (const label of input.correctOptionLabels ?? []) {
    const option = normalize(label);
    if (option.length >= 12 && text.includes(option)) {
      findings.push({ level: "block", reason: "The hint repeats the full text of a correct option." });
      break;
    }
  }

  for (const answer of input.acceptedAnswers ?? []) {
    const accepted = normalize(answer);
    if (accepted.length < 4) continue;
    const escaped = accepted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text)) {
      findings.push({ level: "warn", reason: "The hint appears to contain an accepted answer." });
      break;
    }
  }

  return findings;
}

export function hintLeakBlocks(body: string, input: HintLeakInput = {}): boolean {
  return findHintLeaks(body, input).some((finding) => finding.level === "block");
}

/** Guidance shown in the student panel when a question has no hint yet. */
export const NO_HINT_MESSAGE =
  "No hint has been published for this question yet. Read the question again carefully and try the method you have learned.";
