/**
 * Shared Mathematical Input Operations for EVALORA.
 *
 * Provides pure, deterministic helpers for mathematical symbol insertion,
 * caret tracking, text selection wrapping, and template slot composition.
 *
 * Shared across:
 * - MathAnswerInput (standard and assess_parts response fields)
 * - DataTableEditor (structured table cell inputs)
 * - DraggableFloatingMathKeyboard (symbol insertion & focus return)
 */

import type { PlainMathInsertion } from "@/components/editor/plainMathKeyboard";

export interface PendingSlotChain {
  /** Offset from the field start where insertion began. */
  base: number;
  /** Ordered editable slots; active slot is `slots[index]`. */
  slots: { start: number; end: number }[];
  index: number;
  text: string;
}

export interface PerformInsertionResult {
  nextValue: string;
  caretStart: number;
  caretEnd: number;
  pendingSlot: PendingSlotChain | null;
}

const CLOSERS = new Set([")", "]", "}", "|"]);

/**
 * Insert a PlainMathInsertion into a text value at the given selection range.
 *
 * Handles:
 * 1. Caret insertion: inserts symbol/template at cursor position.
 * 2. Selection replacement: replaces selected text with symbol.
 * 3. Selection wrapping: single-slot templates (e.g. √( ), ( ), [ ]) wrap
 *    the selected text inside their slot; two-slot templates (e.g. fraction)
 *    wrap selected text into the first slot and target the second slot.
 * 4. Multi-slot templates: chains slots (fractions, matrices, limits).
 */
export function performMathInsertion(
  currentValue: string,
  selection: { start: number; end: number },
  ins: PlainMathInsertion,
): PerformInsertionResult {
  const len = currentValue.length;
  let start = Math.max(0, Math.min(selection.start, len));
  let end = Math.max(start, Math.min(selection.end, len));

  const hasSelection = start < end;
  const selectedText = hasSelection ? currentValue.slice(start, end) : "";

  let insertedText = ins.text;
  let nextCaret = ins.caret;
  let nextSlots =
    ins.slots && ins.slots.length
      ? ins.slots
      : ins.slot
        ? [ins.slot, ...(ins.next ? [ins.next] : [])]
        : null;

  // Handle text selection wrapping if text was selected
  if (hasSelection && selectedText.trim()) {
    // Single-slot template: wrap selected text inside slot
    if (ins.slot && !ins.slots && !ins.next) {
      const slot = ins.slot;
      insertedText = ins.text.slice(0, slot.start) + selectedText + ins.text.slice(slot.end);
      nextSlots = null;
      nextCaret = insertedText.length;
    } else if (ins.slot && ins.next) {
      // Two-slot template (e.g. fraction): wrap selected into first slot, target second slot
      const slot1 = ins.slot;
      const slot2 = ins.next;
      const shift = selectedText.length - (slot1.end - slot1.start);
      insertedText = ins.text.slice(0, slot1.start) + selectedText + ins.text.slice(slot1.end);
      nextSlots = [{ start: slot2.start + shift, end: slot2.end + shift }];
      nextCaret = slot2.start + shift;
    }
  }

  const nextValue = currentValue.slice(0, start) + insertedText + currentValue.slice(end);

  if (nextSlots && nextSlots.length) {
    const pendingSlot: PendingSlotChain = {
      base: start,
      slots: nextSlots,
      index: 0,
      text: insertedText,
    };
    const selStart = start + nextSlots[0].start;
    const selEnd = start + nextSlots[0].end;
    return {
      nextValue,
      caretStart: selStart,
      caretEnd: selEnd,
      pendingSlot,
    };
  }

  const selStart = start + nextCaret;
  return {
    nextValue,
    caretStart: selStart,
    caretEnd: selStart,
    pendingSlot: null,
  };
}

/**
 * Handle keydown events for template slot composition.
 * Allows the student to type directly over a selected template slot (e.g. fraction numerator),
 * automatically advancing the caret to the next slot (denominator) or past closing brackets.
 * Returns true if the key event was intercepted and handled.
 */
export function handleTemplateSlotKeyDown(
  e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; preventDefault: () => void },
  currentValue: string,
  selection: { start: number; end: number },
  pending: PendingSlotChain | null,
  onChange: (nextValue: string) => void,
  placeCaret: (start: number, end?: number) => void,
  setPending: (next: PendingSlotChain | null) => void,
): boolean {
  if (!pending) return false;

  const current = pending.slots[pending.index];
  const fillsSlot =
    current !== undefined &&
    e.key.length === 1 &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    selection.start === pending.base + current.start &&
    selection.end === pending.base + current.end;

  if (!fillsSlot) return false;

  e.preventDefault();
  const s = pending.base + current.start;
  const en = pending.base + current.end;
  const nextValue = currentValue.slice(0, s) + e.key + currentValue.slice(en);
  onChange(nextValue);

  const shift = e.key.length - (en - s);
  const adjusted = pending.slots.map((slot, i) =>
    i >= pending.index ? { start: slot.start + shift, end: slot.end + shift } : slot,
  );
  const nextIndex = pending.index + 1;

  if (nextIndex < adjusted.length) {
    const next = adjusted[nextIndex];
    setPending({
      base: pending.base,
      slots: adjusted,
      index: nextIndex,
      text: pending.text,
    });
    placeCaret(pending.base + next.start, pending.base + next.end);
    return true;
  }

  setPending(null);
  let caret = s + e.key.length;
  if (CLOSERS.has(nextValue[caret] ?? "")) caret += 1;
  placeCaret(caret);
  return true;
}

/**
 * Safely focus an input element and restore its selection range
 * without causing jarring scrolls or losing caret offset.
 */
export function restoreInputSelection(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  start: number,
  end?: number,
): void {
  if (!el || typeof document === "undefined") return;

  const apply = () => {
    if (document.activeElement !== el) {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    }
    const len = el.value.length;
    const s = Math.max(0, Math.min(start, len));
    const e = Math.max(s, Math.min(end ?? s, len));
    try {
      el.setSelectionRange(s, e);
    } catch {
      // best effort
    }
  };

  apply();
  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(apply);
  }
}
