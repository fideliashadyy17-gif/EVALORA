/**
 * Pure state rules for drag-and-drop questions (ordering and matching).
 *
 * Stored answers stay `{ left, right }` pairs, so the server scorer is the same
 * for every input method. Two layouts are supported:
 *
 * - "match": each row (left) receives one choice (right). A choice may be used
 *   once. Example: "Match each rule to one letter A–D, use each once".
 * - "sort": each tile (left) is dropped into one category (right). A category
 *   may hold any number of tiles. Example: "Sort the tiles into three groups".
 *
 * The UI keeps a `Record<left, right>` map. These helpers never mutate input.
 */

export type MatchMode = "match" | "sort";

export function normaliseMatchMode(value: unknown): MatchMode {
  return value === "sort" ? "sort" : "match";
}

/**
 * Put `chip` into `zone`.
 * - match: `chip` is a right-hand choice and `zone` a left-hand row. Any row that
 *   already held `chip` is cleared first, so each choice is used once.
 * - sort: `chip` is a left-hand tile and `zone` a right-hand category.
 */
export function placeChip(
  state: Record<string, string>,
  mode: MatchMode,
  chip: string,
  zone: string,
): Record<string, string> {
  const next = { ...state };
  if (mode === "sort") {
    next[chip] = zone;
    return next;
  }
  for (const key of Object.keys(next)) {
    if (next[key] === chip) delete next[key];
  }
  next[zone] = chip;
  return next;
}

/** Remove the placement that sits under `key` (a tile in sort mode, a row in match mode). */
export function clearPlacement(state: Record<string, string>, key: string): Record<string, string> {
  const next = { ...state };
  delete next[key];
  return next;
}

/** Chips still waiting in the bank. In match mode a placed choice leaves the bank. */
export function bankChips(
  state: Record<string, string>,
  mode: MatchMode,
  chips: string[],
): string[] {
  if (mode === "sort") return chips.filter((chip) => !(chip in state));
  const used = new Set(Object.values(state));
  return chips.filter((chip) => !used.has(chip));
}

/** Move the item at `from` to position `to` (ordering questions). Returns a copy. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Convert the UI map to the stored payload, keeping only placed rows. */
export function toPairs(state: Record<string, string>): { left: string; right: string }[] {
  return Object.entries(state)
    .filter(([, right]) => Boolean(right))
    .map(([left, right]) => ({ left, right }));
}

/** Remove a chip wherever it sits (dragging it back to the bank). */
export function removeChip(state: Record<string, string>, mode: MatchMode, chip: string): Record<string, string> {
  const next = { ...state };
  for (const key of Object.keys(next)) {
    if (mode === "sort" ? key === chip : next[key] === chip) delete next[key];
  }
  return next;
}
