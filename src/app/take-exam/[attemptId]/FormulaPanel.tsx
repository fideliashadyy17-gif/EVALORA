"use client";

import { MathText } from "@/components/MathText";
import type { FormulaSheet } from "@/lib/examFormulas";
import { Sigma, X } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Compact, read-only formula sheet for the examination the candidate is
 * sitting. It is an in-page dialog: opening or closing it never navigates,
 * submits, saves, restarts or touches the countdown.
 */
export function FormulaPanel({ sheet, onClose }: { sheet: FormulaSheet; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      // Keep keyboard focus inside the dialog while it is open.
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-evergreen-950/45 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        id="exam-formula-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-formula-title"
        data-testid="formula-panel"
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-evergreen-900/15 bg-paper shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start gap-3 border-b border-evergreen-900/10 bg-cream px-4 py-3 sm:px-6">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-evergreen-900 text-gold-300">
            <Sigma className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="exam-formula-title" className="font-display text-base font-semibold text-evergreen-950">
              {sheet.title}
            </h2>
            <p className="text-xs text-ink-soft">
              General formulas only — no answers or worked solutions. Your paper, timer and saved answers stay exactly as they are.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            data-testid="formula-close"
            className="rounded-lg border border-evergreen-900/20 p-2 text-evergreen-900 transition hover:bg-evergreen-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-evergreen-700"
            aria-label="Close formulas"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {sheet.groups.map((group) => (
              <section key={group.title} className="rounded-xl border border-evergreen-900/10 bg-white/70 p-3">
                <h3 className="mb-2 font-display text-sm font-semibold text-evergreen-900">{group.title}</h3>
                <div className="space-y-2.5">
                  {group.items.map((item) => (
                    <div key={item.latex} className="rounded-lg bg-evergreen-50/60 px-2.5 py-2">
                      <div className="overflow-x-auto text-[0.95rem] leading-relaxed text-evergreen-950">
                        <MathText text={`$${item.latex}$`} />
                      </div>
                      {item.note ? <p className="mt-1 text-xs leading-snug text-ink-soft">{item.note}</p> : null}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
