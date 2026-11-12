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
  slot: { start: number; end: number };
  next?: { start: number; end: number };
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
      if (ins.slot) {
        pendingRef.current = { base: start, slot: ins.slot, next: ins.next, text: ins.text };
        placeCaret(start + ins.slot.start, start + ins.slot.end);
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
    const el = e.currentTarget;
    const fillsSlot =
      pending !== null &&
      e.key.length === 1 &&
      !e.ctrlKey && !e.metaKey && !e.altKey &&
      el.selectionStart === pending.base + pending.slot.start &&
      el.selectionEnd === pending.base + pending.slot.end;
    if (!fillsSlot || !pending) return;

    e.preventDefault();
    const s = pending.base + pending.slot.start;
    const en = pending.base + pending.slot.end;
    const nextValue = value.slice(0, s) + e.key + value.slice(en);
    onChange(nextValue);

    const shift = e.key.length - (en - s); // usually 0: slots are one char wide
    if (pending.next) {
      const ns = pending.base + pending.next.start + shift;
      const ne = pending.base + pending.next.end + shift;
      pendingRef.current = { base: pending.base, slot: pending.next, next: undefined, text: pending.text };
      placeCaret(ns, ne);
      return;
    }
    pendingRef.current = null;
    let caret = s + e.key.length;
    if (CLOSERS.has(nextValue[caret] ?? "")) caret += 1; // step past "√(3)" closer
    placeCaret(caret);
  };

  return (
    <div className="w-full">
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
              if (
                pending &&
                (el.selectionStart !== pending.base + pending.slot.start ||
                  el.selectionEnd !== pending.base + pending.slot.end)
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
      <div hidden={!showKeyboard || disabled}>
        <MathKeyboardPanel onInsert={applyInsertion} variant={variant} label={ariaLabel ? `Mathematical symbols for ${ariaLabel}` : "Mathematical symbols"} />
      </div>
    </div>
  );
}
