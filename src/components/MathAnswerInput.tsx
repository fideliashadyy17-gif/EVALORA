"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Input } from "./ui";
import { MathKeyboardPanel } from "./MathKeyboardPanel";
import type { PlainMathInsertion } from "@/components/editor/plainMathKeyboard";
import { mathInputManager, type MathInputTarget } from "@/lib/mathInputManager";

/**
 * A premium plain-text answer input with integrated mathematical keyboard
 * and platform-wide active-target focus management.
 *
 * Used for Formative Assessment short answers, numeric answers, Assess
 * Prep parts, and all existing and future examinations. The stored answer
 * remains plain text — exactly the format the existing autosave pipeline,
 * scoring engine, and teacher marking views consume.
 *
 * Guarantees that:
 * 1. Caret position is accurately tracked across clicks, keyups, and selection.
 * 2. When a student chooses a symbol or template, it is inserted at the exact
 *    cursor position in the ACTIVE field — never into another field or question.
 * 3. Structured templates (√( ), ( )/( ), ^( )…) select their slot so typing
 *    immediately replaces it, then steps past the closer or onto the next slot.
 * 4. Text selection is respected: inserting a wrapper structure wraps the
 *    selection, while inserting symbols replaces the selected text cleanly.
 * 5. Focus is never lost, allowing uninterrupted continued typing.
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

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
  questionId,
  fieldId,
  targetId: explicitTargetId,
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
  /** Optional question ID for central input routing. */
  questionId?: string;
  /** Optional field or part ID for central input routing. */
  fieldId?: string;
  /** Explicit target ID for central input routing. */
  targetId?: string;
}) {
  const autoId = useId();
  const targetId = explicitTargetId ?? (questionId && fieldId ? `${questionId}:${fieldId}` : (fieldId ?? autoId));

  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef<PendingSlot | null>(null);
  const lastSelectionRef = useRef<{ start: number; end: number }>({
    start: value.length,
    end: value.length,
  });
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);

  // Keep mutable references for the central manager target without breaking closures.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const recordSelection = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    if (typeof el.selectionStart === "number" && typeof el.selectionEnd === "number") {
      lastSelectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
    }
  }, []);

  const placeCaret = useCallback((start: number, end?: number) => {
    const apply = () => {
      const node = inputRef.current;
      if (!node) return;
      if (typeof document !== "undefined" && document.activeElement !== node) {
        node.focus();
      }
      const len = node.value.length;
      const s = Math.max(0, Math.min(start, len));
      const e = Math.max(s, Math.min(end ?? s, len));
      node.setSelectionRange(s, e);
      lastSelectionRef.current = { start: s, end: e };
    };

    apply();
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(apply);
    }
  }, []);

  const applyInsertion = useCallback(
    (ins: PlainMathInsertion) => {
      const el = inputRef.current;
      const isFocused = typeof document !== "undefined" && document.activeElement === el;

      // When the input is actively focused, live selection takes priority;
      // when blurred (e.g. tapping a virtual keyboard key), use recorded selection.
      let start =
        isFocused && el && typeof el.selectionStart === "number"
          ? el.selectionStart
          : lastSelectionRef.current.start;
      let end =
        isFocused && el && typeof el.selectionEnd === "number"
          ? el.selectionEnd
          : lastSelectionRef.current.end;

      const currentValue = valueRef.current;
      start = Math.max(0, Math.min(start, currentValue.length));
      end = Math.max(start, Math.min(end, currentValue.length));

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

      // Handle text selection according to editor semantics (Example 4):
      if (hasSelection && selectedText.trim()) {
        // Single-slot template (e.g. √( ), ( ), [ ], ln( ), sin( )): wrap selected text inside slot
        if (ins.slot && !ins.slots && !ins.next) {
          const slot = ins.slot;
          insertedText = ins.text.slice(0, slot.start) + selectedText + ins.text.slice(slot.end);
          nextSlots = null;
          nextCaret = insertedText.length;
        } else if (ins.slot && ins.next) {
          // Two-slot template (e.g. fraction ( )/( )): wrap selected text into first slot, select second slot
          const slot1 = ins.slot;
          const slot2 = ins.next;
          const shift = selectedText.length - (slot1.end - slot1.start);
          insertedText = ins.text.slice(0, slot1.start) + selectedText + ins.text.slice(slot1.end);
          nextSlots = [{ start: slot2.start + shift, end: slot2.end + shift }];
          nextCaret = slot2.start + shift;
        }
      }

      const next = currentValue.slice(0, start) + insertedText + currentValue.slice(end);
      onChangeRef.current(next);

      if (nextSlots && nextSlots.length) {
        pendingRef.current = { base: start, slots: nextSlots, index: 0, text: insertedText };
        const selStart = start + nextSlots[0].start;
        const selEnd = start + nextSlots[0].end;
        pendingSelectionRef.current = { start: selStart, end: selEnd };
        lastSelectionRef.current = { start: selStart, end: selEnd };
        placeCaret(selStart, selEnd);
      } else {
        pendingRef.current = null;
        const selStart = start + nextCaret;
        pendingSelectionRef.current = { start: selStart, end: selStart };
        lastSelectionRef.current = { start: selStart, end: selStart };
        placeCaret(selStart, selStart);
      }
    },
    [placeCaret],
  );

  const applyInsertionRef = useRef(applyInsertion);
  applyInsertionRef.current = applyInsertion;

  const ariaLabelRef = useRef(ariaLabel);
  ariaLabelRef.current = ariaLabel;
  const questionIdRef = useRef(questionId);
  questionIdRef.current = questionId;
  const fieldIdRef = useRef(fieldId);
  fieldIdRef.current = fieldId;

  // Register with platform-wide central math input manager
  useEffect(() => {
    const target: MathInputTarget = {
      id: targetId,
      get questionId() {
        return questionIdRef.current;
      },
      get fieldId() {
        return fieldIdRef.current;
      },
      get label() {
        return ariaLabelRef.current ?? (questionIdRef.current ? `Question ${questionIdRef.current}` : "Answer field");
      },
      variant,
      getElement: () => inputRef.current,
      getValue: () => valueRef.current,
      setValue: (next) => onChangeRef.current(next),
      applyInsertion: (ins) => applyInsertionRef.current(ins),
      focus: (start, end) => placeCaret(start ?? lastSelectionRef.current.start, end),
      getSelection: () => lastSelectionRef.current,
    };

    const unregister = mathInputManager.register(target);
    return () => unregister();
  }, [placeCaret, targetId, variant]);

  // Synchronize selection synchronously after DOM commit of new value
  useIsomorphicLayoutEffect(() => {
    if (pendingSelectionRef.current) {
      const { start, end } = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      const node = inputRef.current;
      if (node) {
        node.focus();
        const len = node.value.length;
        const s = Math.max(0, Math.min(start, len));
        const e = Math.max(s, Math.min(end, len));
        node.setSelectionRange(s, e);
        lastSelectionRef.current = { start: s, end: e };
      }
    }
  }, [value]);

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
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
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
      pendingRef.current = {
        base: pending.base,
        slots: adjusted,
        index: nextIndex,
        text: pending.text,
      };
      placeCaret(pending.base + next.start, pending.base + next.end);
      return;
    }
    pendingRef.current = null;
    let caret = s + e.key.length;
    if (CLOSERS.has(nextValue[caret] ?? "")) caret += 1; // step past "√(3)" closer
    placeCaret(caret);
  };

  const handleFocus = (el: HTMLInputElement) => {
    recordSelection(el);
    mathInputManager.setActiveTarget(targetId);
  };

  const handleToggleKeyboard = () => {
    mathInputManager.setActiveTarget(targetId);
    placeCaret(lastSelectionRef.current.start, lastSelectionRef.current.end);
    setShowKeyboard((v) => !v);
  };

  return (
    <div className="relative w-full" data-target-id={targetId}>
      <div className="flex w-full gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            ref={inputRef}
            value={value}
            disabled={disabled}
            inputMode={inputMode}
            placeholder={placeholder}
            aria-label={ariaLabel}
            data-math-input-id={targetId}
            data-question-id={questionId}
            data-field-id={fieldId}
            className={unit ? "pr-12" : undefined}
            onChange={(e) => {
              recordSelection(e.currentTarget);
              onChange(e.target.value);
            }}
            onFocus={(e) => handleFocus(e.currentTarget)}
            onClick={(e) => handleFocus(e.currentTarget)}
            onKeyUp={(e) => handleFocus(e.currentTarget)}
            onBlur={(e) => recordSelection(e.currentTarget)}
            onKeyDown={onKeyDown}
            onSelect={(e) => {
              handleFocus(e.currentTarget);
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
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") e.preventDefault();
          }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleToggleKeyboard}
          className={`shrink-0 rounded-xl border px-3 py-2 text-lg font-bold leading-none transition disabled:opacity-40 ${
            showKeyboard
              ? "border-evergreen-700 bg-evergreen-700 text-white shadow-sm"
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
            <MathKeyboardPanel
              onInsert={applyInsertion}
              variant={variant}
              targetId={targetId}
              questionId={questionId}
              label={ariaLabel ? `Mathematical symbols for ${ariaLabel}` : "Mathematical symbols"}
            />
          </div>
        </div>
      ) : (
        <div hidden={!showKeyboard || disabled}>
          <MathKeyboardPanel
            onInsert={applyInsertion}
            variant={variant}
            targetId={targetId}
            label={ariaLabel ? `Mathematical symbols for ${ariaLabel}` : "Mathematical symbols"}
          />
        </div>
      )}
    </div>
  );
}
