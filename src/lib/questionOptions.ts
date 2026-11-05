import { isDeepStrictEqual } from "node:util";
import { textToDoc } from "./content";

/** Compare persisted options with submitted form options without relying on JSON key order. */
export function questionOptionsUnchanged(
  persisted: { label: string; is_correct: boolean; position: number; content_doc?: unknown }[],
  incoming: { label: string; is_correct: boolean; content_doc?: unknown }[],
): boolean {
  if (persisted.length !== incoming.length) return false;
  return persisted.every((old, index) => {
    const next = incoming[index];
    return old.position === index && old.label === next.label && old.is_correct === next.is_correct &&
      (isDeepStrictEqual(old.content_doc ?? null, next.content_doc ?? null) ||
        // The form converts legacy plain-text options to this equivalent doc.
        (old.content_doc == null && isDeepStrictEqual(textToDoc(old.label), next.content_doc)));
  });
}
