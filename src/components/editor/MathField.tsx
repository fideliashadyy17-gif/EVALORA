"use client";

import { useEffect, useRef } from "react";

/**
 * MathLive visual mathematics field (Mode 1 — MATH MODE).
 *
 * Renders a real editable mathematical surface: clicking inside fractions,
 * radicals, exponents, integrals etc. lets the user type into each slot;
 * arrow keys move between slots; MathLive supplies undo/redo, selection and
 * its own optional virtual keyboard. Fonts/sounds are served locally from
 * /public/mathlive so nothing depends on a CDN.
 */

export interface MathFieldHandle {
  focus: () => void;
  getValue: () => string;
  setValue: (latex: string, focus?: boolean) => void;
  insert: (template: string) => void;
  toggleKeyboard: () => void;
}

interface MathFieldElementLike extends HTMLElement {
  value: string;
  executeCommand: (command: string | [string, ...unknown[]]) => boolean;
  insert?: (s: string, options?: Record<string, unknown>) => boolean;
}

let mathliveReady: Promise<void> | null = null;
function loadMathLive(): Promise<void> {
  if (!mathliveReady) {
    mathliveReady = import("mathlive").then((mod) => {
      const MFE = (mod as unknown as { MathfieldElement?: { fontsDirectory: string; soundsDirectory: string } }).MathfieldElement;
      if (MFE) {
        MFE.fontsDirectory = "/mathlive/fonts";
        MFE.soundsDirectory = "/mathlive/sounds";
      }
    });
  }
  return mathliveReady;
}

export function MathField({
  initialValue,
  onInput,
  onReady,
  ariaLabel,
}: {
  initialValue: string;
  onInput: (latex: string) => void;
  onReady: (handle: MathFieldHandle) => void;
  ariaLabel?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<MathFieldElementLike | null>(null);
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const initialRef = useRef(initialValue);

  useEffect(() => {
    let cancelled = false;
    let el: MathFieldElementLike | null = null;
    loadMathLive().then(() => {
      if (cancelled || !hostRef.current) return;
      el = document.createElement("math-field") as MathFieldElementLike;
      el.setAttribute("aria-label", ariaLabel ?? "Mathematical expression editor");
      // Sensible authoring defaults.
      (el as unknown as Record<string, unknown>).smartFence = true;
      (el as unknown as Record<string, unknown>).smartSuperscript = true;
      (el as unknown as Record<string, unknown>).virtualKeyboardMode = "manual";
      el.value = initialRef.current;
      const handler = () => onInputRef.current(el?.value ?? "");
      el.addEventListener("input", handler);
      hostRef.current.appendChild(el);
      elRef.current = el;

      onReadyRef.current({
        focus: () => el?.focus(),
        getValue: () => el?.value ?? "",
        setValue: (latex: string, focus = true) => {
          if (!el) return;
          el.value = latex;
          if (focus) el.focus();
        },
        insert: (template: string) => {
          if (!el) return;
          el.focus();
          if (typeof el.insert === "function") {
            el.insert(template, { selectionMode: "placeholder", format: "latex" });
          } else {
            el.executeCommand(["insert", template]);
          }
          onInputRef.current(el.value);
        },
        toggleKeyboard: () => {
          el?.executeCommand("toggleVirtualKeyboard");
        },
      });
    });
    return () => {
      cancelled = true;
      el?.remove();
      elRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="rce-mathfield-host" />;
}
