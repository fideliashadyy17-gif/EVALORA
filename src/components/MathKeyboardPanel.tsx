"use client";

import { useEffect, useState } from "react";
import { renderLatex } from "@/lib/content";
import { MATH_CATEGORIES, type MathKey } from "@/components/editor/mathKeyboard";
import {
  NUMERIC_MATH_CATEGORY,
  matrixInsertion,
  plainInsertionForKey,
  type PlainMathInsertion,
} from "@/components/editor/plainMathKeyboard";
import { mathInputManager } from "@/lib/mathInputManager";

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
  targetId,
}: {
  /** Called with the plain-text insertion the host field must apply at its cursor. */
  onInsert: (insertion: PlainMathInsertion) => void;
  /** "full" = every category; "numeric" = digits-friendly compact set. */
  variant?: "full" | "numeric";
  label?: string;
  /** Optional ID of the host input field that owns this keyboard instance. */
  targetId?: string;
}) {
  const categories = variant === "numeric" ? [NUMERIC_MATH_CATEGORY] : MATH_CATEGORIES;
  const [categoryId, setCategoryId] = useState(categories[0].id);
  const [rows, setRows] = useState(2);
  const [columns, setColumns] = useState(2);
  const [matrixStyle, setMatrixStyle] = useState<"paren" | "bracket" | "bar">("paren");
  const [activeTargetInfo, setActiveTargetInfo] = useState<{ id: string; label?: string } | null>(() => {
    const active = mathInputManager.getActiveTarget();
    return active ? { id: active.id, label: active.label } : null;
  });

  useEffect(() => {
    return mathInputManager.subscribe(() => {
      const active = mathInputManager.getActiveTarget();
      setActiveTargetInfo(active ? { id: active.id, label: active.label } : null);
    });
  }, []);

  const cat = categories.find((c) => c.id === categoryId) ?? categories[0];

  const handleInsertion = (ins: PlainMathInsertion) => {
    const inserted = mathInputManager.insertIntoActive(ins, targetId);
    if (!inserted) {
      onInsert(ins);
    }
  };

  const press = (key: MathKey) => {
    if (variant === "numeric" && NUMERIC_OVERRIDES[key.i]) {
      handleInsertion(NUMERIC_OVERRIDES[key.i]);
      return;
    }
    handleInsertion(plainInsertionForKey(key));
  };

  return (
    <div
      className="mt-2 rounded-xl border border-evergreen-900/20 bg-cream/70 px-2.5 py-2 shadow-sm"
      role="group"
      aria-label={label}
      data-testid="math-keyboard-panel"
    >
      {activeTargetInfo?.label && (
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-evergreen-800/80">
          <span>Target: {activeTargetInfo.label}</span>
          <span className="text-[10px] font-normal text-ink-soft">Active field cursor</span>
        </div>
      )}
      {variant === "full" && (
        <div className="scroll-slim mb-2 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Symbol categories">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={cat.id === c.id}
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onClick={() => setCategoryId(c.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                cat.id === c.id
                  ? "bg-evergreen-700 text-white shadow-sm"
                  : "border border-evergreen-900/15 bg-white text-evergreen-900 hover:bg-evergreen-50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {variant === "full" && cat.id === "matrices" && (
        <div
          className="mb-2 flex flex-wrap items-end gap-2 rounded-lg border border-evergreen-900/15 bg-white/80 px-2.5 py-2"
          data-testid="matrix-builder"
          role="group"
          aria-label="Matrix builder"
        >
          <label className="text-[11px] font-semibold text-evergreen-900">
            Rows
            <select
              className="ml-1 rounded-md border border-evergreen-900/20 bg-white px-1.5 py-1 text-xs"
              value={rows}
              onChange={(e) => setRows(Number(e.target.value))}
              aria-label="Matrix rows"
            >
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-evergreen-900">
            Columns
            <select
              className="ml-1 rounded-md border border-evergreen-900/20 bg-white px-1.5 py-1 text-xs"
              value={columns}
              onChange={(e) => setColumns(Number(e.target.value))}
              aria-label="Matrix columns"
            >
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-evergreen-900">
            Brackets
            <select
              className="ml-1 rounded-md border border-evergreen-900/20 bg-white px-1.5 py-1 text-xs"
              value={matrixStyle}
              onChange={(e) => setMatrixStyle(e.target.value as "paren" | "bracket" | "bar")}
              aria-label="Matrix bracket style"
            >
              <option value="paren">( )</option>
              <option value="bracket">[ ]</option>
              <option value="bar">| |</option>
            </select>
          </label>
          <button
            type="button"
            className="rounded-lg bg-evergreen-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-evergreen-800"
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            onClick={() => handleInsertion(matrixInsertion(rows, columns, matrixStyle))}
          >
            Insert {rows}×{columns} matrix
          </button>
          <span className="text-[11px] text-ink-soft">Each cell is editable; typing moves cell by cell.</span>
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
        Symbols insert at the cursor. Spaces inside structures — √( ), ( )/( ), Σ_( )^( ) ( ) and matrix cells — are editable slots: type straight over them and the cursor moves to the next slot.
      </p>
    </div>
  );
}
