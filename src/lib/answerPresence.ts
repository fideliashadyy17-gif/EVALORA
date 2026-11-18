/**
 * Does a saved answer actually contain candidate work?
 *
 * The examination save queue writes a row as soon as a candidate touches a
 * question, and a rich-text answer can legitimately be an empty document. A
 * stored row is therefore not the same thing as an answer. This helper is the
 * single definition used by grading, the script review and the result totals,
 * so "unanswered" means the same thing everywhere.
 *
 * A numeric zero and a boolean false are real answers; empty strings, empty
 * arrays, empty objects and a document with no text are not.
 */
const IGNORED_KEYS = new Set(["version", "id", "title", "updated_at", "saved_at"]);

export function answerHasWork(value: unknown, key = ""): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((entry) => answerHasWork(entry, key));
  if (typeof value !== "object") return false;
  if (IGNORED_KEYS.has(key)) return false;
  const record = value as Record<string, unknown>;
  // A Tiptap document is empty when it has no text-bearing node.
  if (record.type === "doc") return answerHasWork(record.content, "content");
  return Object.entries(record).some(([childKey, child]) => answerHasWork(child, childKey));
}

/** True when a saved answer row represents a response the candidate actually gave. */
export function answerIsPresent(answer: unknown): boolean {
  return answerHasWork(answer);
}
