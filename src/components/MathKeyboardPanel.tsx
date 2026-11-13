"use client";

import { useState } from "react";
import { renderLatex } from "@/lib/content";
import { MATH_CATEGORIES, type MathKey } from "@/components/editor/mathKeyboard";
import { NUMERIC_MATH_CATEGORY, plainInsertionForKey, type PlainMathInsertion } from "@/components/editor/plainMathKeyboard";

/**
 * The shared mathematical keyboard, rendered as a reusable panel for ANY
 * plain-text answer field (formative short answers, numeric answers, Assess
 * Prep parts — and later other assessment types).
 *
 * It reuses the exact category/key definitions of the rich-content editor's
 * keyboard (src/components/editor/mathKeyboard.ts) so students meet one
 * keyboard across the platform; the only difference is the projection: keys
 * insert plain-text mathematics (`×`, `√( )`, `( )/( )`, `π`, …) at the
 * cursor instead of LaTeX, because these fields store and mark plain text.
 * The panel never owns the answer — the host input stays the source of truth.
 */

/** Compact numeric keyboards skip structures that cannot be scored as a number. */
const NUMERIC_OVERRIDES: Record<string, PlainMathInsertion> = {
  // parseStudentNumber understands a bare "a/b" fraction, not "(a)/(b)".
  "\\frac{#0}{#1}": { text: " / ", caret: 1, slot: { start: 0, end: 1 } },
  "\\dfrac{#0}{#1}": { text: " / ", caret: 1, slot: { start: 0, end: 1 } },
};

export function MathKeyboardPanel({
  onInsert,
  variant = "full",
  label = "Mathematical symbols",
}: {
  /** Called with the plain-text insertion the host field must apply at its cursor. */
  onInsert: (insertion: PlainMathInsertion) => void;
  /** "full" = every category; "numeric" = digits-friendly compact set. */
  variant?: "full" | "numeric";
  label?: string;
}) {
  const categories = variant === "numeric" ? [NUMERIC_MATH_CATEGORY] : MATH_CATEGORIES;
  const [categoryId, setCategoryId] = useState(categories[0].id);
  const cat = categories.find((c) => c.id === categoryId) ?? categories[0];

  const press = (key: MathKey) => {
    if (variant === "numeric" && NUMERIC_OVERRIDES[key.i]) {
      onInsert(NUMERIC_OVERRIDES[key.i]);
      return;
    }
    onInsert(plainInsertionForKey(key));
  };

  return (
    <div
      className="mt-2 rounded-xl border border-evergreen-900/20 bg-cream/70 px-2.5 py-2"
      role="group"
      aria-label={label}
      data-testid="math-keyboard-panel"
    >
      {variant === "full" && (
        <div className="scroll-slim mb-2 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Symbol categories">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={cat.id === c.id}
              onClick={() => setCategoryId(c.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${cat.id === c.id ? "bg-evergreen-700 text-white" : "border border-evergreen-900/15 bg-white text-evergreen-900 hover:bg-evergreen-50"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5" aria-label={`${cat.label} symbols`}>
        {cat.keys.map((key) => (
          <button
            key={`${cat.id}-${key.t}-${key.i}`}
            type="button"
            className="rce-kbd-btn"
            title={`${key.t} — inserts at the cursor`}
            aria-label={key.t}
            // Keep focus (and the caret) in the answer field while tapping keys.
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            onClick={() => press(key)}
            dangerouslySetInnerHTML={{ __html: renderLatex(key.d, false) }}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-soft">
        Symbols insert at the cursor in your answer. Brackets with a space — like √( ) or ( )/( ) — are slots: type straight over them.
      </p>
    </div>
  );
}
