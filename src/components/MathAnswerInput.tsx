"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "./ui";
import { MathKeyboardPanel } from "./MathKeyboardPanel";
import type { PlainMathInsertion } from "@/components/editor/plainMathKeyboard";

/**
 * A plain-text answer input with the integrated mathematical keyboard.
 *
 * Used for Formative Assessment short answers, numeric answers and Assess
 * Prep parts. The stored answer remains plain text — exactly the format the
 * existing autosave pipeline, scoring engine and teacher marking views
 * already consume — so nothing downstream changes. The keyboard inserts
 * symbols/templates at the cursor, preserving the text already typed, and
 * structured keys (√( ), ( )/( ), ^( )…) select their slot so the student can
 * type straight over it; the caret then chains to the next slot or steps past
 * the closing bracket, exactly like the MathLive field in the rich editor.
 */

interface PendingSlot {
  /** Offset (from the field start) the insertion began at. */
  base: number;
  /** Ordered editable cells; the selected one is `slots[index]`. */
  slots: { start: number; end: number }[];
  index: number;
  text: string;
}

const CLOSERS = new Set([")", "]", "}", "|"]);

export function MathAnswerInput({
  value,
  onChange,
  onCommit,
  disabled,
  placeholder,
  ariaLabel,
  inputMode = "text",
  variant = "full",
  unit,
  floatingKeyboard = false,
}: {
  value: string;
  /** New full field value after every edit or keyboard insertion. */
  onChange: (next: string) => void;
  /** Enter / submit affordance handled by the host question. */
  onCommit?: () => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  inputMode?: "text" | "decimal";
  /** "full" keyboard or the compact "numeric" one. */
  variant?: "full" | "numeric";
  /** Optional unit rendered after the field (Assess Prep parts). */
  unit?: string | null;
  /**
   * Premium examination presentation: a compact popover above the page flow
   * instead of an inline panel that pushes the question downward. The field
   * remains the source of truth and keeps focus/caret while tapping keys.
   */
  floatingKeyboard?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef<PendingSlot | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);

  const placeCaret = useCallback((start: number, end?: number) => {
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus();
      const len = node.value.length;
      const s = Math.max(0, Math.min(start, len));
      const e = Math.max(s, Math.min(end ?? s, len));
      node.setSelectionRange(s, e);
    });
  }, []);

  const applyInsertion = useCallback(
    (ins: PlainMathInsertion) => {
      const el = inputRef.current;
      // Fall back to appending when the field is not mounted/focused.
      const start = el && typeof el.selectionStart === "number" ? el.selectionStart : value.length;
      const end = el && typeof el.selectionEnd === "number" ? el.selectionEnd : value.length;
      const next = value.slice(0, start) + ins.text + value.slice(end);
      onChange(next);
      const slots =
        ins.slots && ins.slots.length
          ? ins.slots
          : ins.slot
            ? [ins.slot, ...(ins.next ? [ins.next] : [])]
            : null;
      if (slots) {
        pendingRef.current = { base: start, slots, index: 0, text: ins.text };
        placeCaret(start + slots[0].start, start + slots[0].end);
      } else {
        pendingRef.current = null;
        placeCaret(start + ins.caret);
      }
    },
    [onChange, placeCaret, value],
  );

  /**
   * When a template slot is selected, the next printable keystroke fills it.
   * Handle that composition here (instead of letting the browser replace the
   * selection) so the caret deterministically chains to the template's next
   * slot — a fraction's denominator after its numerator — or steps past the
   * closing bracket so the following symbol lands after the structure.
   */
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      pendingRef.current = null;
      if (value.trim()) {
        e.preventDefault();
        onCommit?.();
      }
      return;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    const el = e.currentTarget;
    const current = pending.slots[pending.index];
    const fillsSlot =
      current !== undefined &&
      e.key.length === 1 &&
      !e.ctrlKey && !e.metaKey && !e.altKey &&
      el.selectionStart === pending.base + current.start &&
      el.selectionEnd === pending.base + current.end;
    if (!fillsSlot) return;

    e.preventDefault();
    const s = pending.base + current.start;
    const en = pending.base + current.end;
    const nextValue = value.slice(0, s) + e.key + value.slice(en);
    onChange(nextValue);

    const shift = e.key.length - (en - s); // usually 0: slots are one char wide
    // Every later slot moves by the same delta (e.g. a two-digit numerator).
    const adjusted = pending.slots.map((slot, i) =>
      i >= pending.index ? { start: slot.start + shift, end: slot.end + shift } : slot,
    );
    const nextIndex = pending.index + 1;
    if (nextIndex < adjusted.length) {
      const next = adjusted[nextIndex];
      pendingRef.current = { base: pending.base, slots: adjusted, index: nextIndex, text: pending.text };
      placeCaret(pending.base + next.start, pending.base + next.end);
      return;
    }
    pendingRef.current = null;
    let caret = s + e.key.length;
    if (CLOSERS.has(nextValue[caret] ?? "")) caret += 1; // step past "√(3)" closer
    placeCaret(caret);
  };

  return (
    <div className="relative w-full">
      <div className="flex w-full gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            ref={inputRef}
            value={value}
            disabled={disabled}
            inputMode={inputMode}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className={unit ? "pr-12" : undefined}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onSelect={(e) => {
              // Any manual caret move abandons the pending slot chain.
              const pending = pendingRef.current;
              const el = e.currentTarget;
              const current = pending ? pending.slots[pending.index] : undefined;
              if (
                pending &&
                (!current ||
                  el.selectionStart !== pending.base + current.start ||
                  el.selectionEnd !== pending.base + current.end)
              ) {
                pendingRef.current = null;
              }
            }}
          />
          {unit ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-soft">
              {unit}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={showKeyboard}
          aria-label={showKeyboard ? "Hide the math keyboard" : "Show the math keyboard"}
          title="Mathematical keyboard"
          onClick={() => setShowKeyboard((v) => !v)}
          className={`shrink-0 rounded-xl border px-3 py-2 text-lg font-bold leading-none transition disabled:opacity-40 ${
            showKeyboard
              ? "border-evergreen-700 bg-evergreen-700 text-white"
              : "border-evergreen-900/25 bg-white text-evergreen-800 hover:bg-evergreen-50"
          }`}
        >
          ∑
        </button>
      </div>
      {floatingKeyboard ? (
        <div
          hidden={!showKeyboard || disabled}
          className="absolute right-0 top-full z-30 mt-2 w-[min(92vw,26rem)] max-w-full rounded-2xl border border-evergreen-900/20 bg-white p-1.5 shadow-2xl"
          data-testid="math-keyboard-popover"
        >
          <div className="max-h-[45vh] overflow-y-auto">
            <MathKeyboardPanel onInsert={applyInsertion} variant={variant} label={ariaLabel ? `Mathematical symbols for ${ariaLabel}` : "Mathematical symbols"} />
          </div>
        </div>
      ) : (
        <div hidden={!showKeyboard || disabled}>
          <MathKeyboardPanel onInsert={applyInsertion} variant={variant} label={ariaLabel ? `Mathematical symbols for ${ariaLabel}` : "Mathematical symbols"} />
        </div>
      )}
    </div>
  );
}
