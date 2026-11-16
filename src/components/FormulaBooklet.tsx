"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MathText } from "@/components/MathText";
import type { FormulaSection } from "@/lib/myp5Standard2025FormulaReference";

/**
 * The in-examination formula reference.
 *
 * SAFETY CONTRACT — this component is deliberately inert.
 *
 * It is a purely presentational overlay. It receives `open` and calls
 * `onClose`; that is its entire interface with the examination. It does NOT:
 *
 *   - read or write any answer, attempt or queue state;
 *   - touch the timer, the deadline or any pause interval;
 *   - change the current question index;
 *   - navigate, submit or reload;
 *   - unmount the examination beneath it (it renders alongside, never instead).
 *
 * Because it holds no examination state, opening or closing it cannot reset the
 * timer, lose an answer or move the student. That is a property of the
 * component's shape, not of careful coding on the call site — which is why the
 * prop list is as small as it is.
 *
 * Layout: a side panel on desktop (the question stays visible and readable
 * beside it) and a full-screen overlay on phones and tablets, with an explicit
 * return button in both.
 */

export interface FormulaBookletProps {
  open: boolean;
  onClose: () => void;
  title: string;
  sections: FormulaSection[];
  disclaimer?: string;
  /** Label for the button that opens it. Defaults to "FORMULA BOOKLET". */
  buttonLabel?: string;
}

const ZOOM_STEPS = [0.85, 1, 1.15, 1.3, 1.5];

export function FormulaBookletButton({
  onClick,
  open,
  label = "FORMULA BOOKLET",
}: {
  onClick: () => void;
  open: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="formula-booklet-button"
      aria-expanded={open}
      aria-label={`${label} — opens a formula reference without stopping your timer`}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-evergreen-700/30 bg-white px-3 py-2 text-xs font-semibold text-evergreen-800 shadow-sm transition hover:bg-evergreen-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-evergreen-600"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a1.5 1.5 0 0 0-1.5-1.5H4z" />
        <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a1.5 1.5 0 0 1 1.5-1.5H20z" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

export function FormulaBooklet({
  open,
  onClose,
  title,
  sections,
  disclaimer,
  buttonLabel = "FORMULA BOOKLET",
}: FormulaBookletProps) {
  const [zoomIndex, setZoomIndex] = useState(1);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Remember what had focus so closing returns the caret to the answer box the
  // student was typing in. Focus is the only thing this component borrows, and
  // it is always handed back.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
    } else if (restoreFocusRef.current) {
      const node = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (node && typeof node.focus === "function" && document.contains(node)) node.focus();
    }
  }, [open]);

  // Escape closes it. Nothing else binds a key: the examination keeps every
  // other keystroke.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sections;
    return sections
      .map((section) => {
        const inSection =
          section.title.toLowerCase().includes(needle) ||
          (section.purpose ?? "").toLowerCase().includes(needle);
        const entries = inSection
          ? section.entries
          : section.entries.filter(
              (entry) =>
                entry.latex.toLowerCase().includes(needle) ||
                (entry.where ?? "").toLowerCase().includes(needle) ||
                (entry.note ?? "").toLowerCase().includes(needle),
            );
        return entries.length ? { ...section, entries } : null;
      })
      .filter((section): section is FormulaSection => section !== null);
  }, [query, sections]);

  useEffect(() => {
    if (filtered.length && !filtered.some((s) => s.id === active)) setActive(filtered[0].id);
  }, [filtered, active]);

  if (!open) return null;

  const zoom = ZOOM_STEPS[zoomIndex];

  return (
    <div
      data-testid="formula-booklet"
      className="fixed inset-0 z-[70] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Scrim: click-outside closes. Present on every size so the panel reads
          as a layer, but on large screens the question beside it stays lit. */}
      <button
        type="button"
        aria-label="Close formula reference"
        onClick={onClose}
        className="absolute inset-0 bg-evergreen-950/30 backdrop-blur-[1px]"
        tabIndex={-1}
      />

      <div
        className="relative flex h-full w-full flex-col bg-white shadow-2xl
                   sm:w-[min(30rem,100%)] lg:w-[min(34rem,42vw)]"
        style={{ fontSize: `${zoom}rem` }}
      >
        <header className="flex items-start gap-3 border-b border-evergreen-900/10 bg-evergreen-50/70 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.7em] font-semibold uppercase tracking-[0.14em] text-evergreen-700">
              {buttonLabel}
            </p>
            <h2 className="truncate text-[1.05em] font-semibold text-evergreen-950">{title}</h2>
            <p className="mt-0.5 text-[0.72em] leading-snug text-ink-soft">
              Your timer is still running and your answers are untouched.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="formula-booklet-close"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-evergreen-700 px-3 py-2 text-[0.8em] font-semibold text-white transition hover:bg-evergreen-800"
          >
            <span aria-hidden="true">←</span>
            <span>Return to exam</span>
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-evergreen-900/10 px-4 py-2">
          <label className="sr-only" htmlFor="formula-search">
            Search the formula reference
          </label>
          <input
            id="formula-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search formulae…"
            className="min-h-10 flex-1 rounded-lg border border-evergreen-900/15 px-3 text-[0.85em] placeholder:text-ink-soft/70 focus:border-evergreen-600 focus:outline-none"
          />
          <div className="flex items-center gap-1" role="group" aria-label="Zoom">
            <button
              type="button"
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              disabled={zoomIndex === 0}
              aria-label="Zoom out"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-evergreen-900/15 text-[1em] font-semibold text-evergreen-800 disabled:opacity-40"
            >
              −
            </button>
            <span className="w-12 text-center text-[0.75em] tabular-nums text-ink-soft">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              aria-label="Zoom in"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-evergreen-900/15 text-[1em] font-semibold text-evergreen-800 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        <nav
          aria-label="Formula sections"
          className="flex gap-1.5 overflow-x-auto border-b border-evergreen-900/10 px-4 py-2"
        >
          {filtered.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                setActive(section.id);
                document.getElementById(`formula-section-${section.id}`)?.scrollIntoView({ block: "start" });
              }}
              className={[
                "shrink-0 rounded-full px-3 py-1.5 text-[0.75em] font-semibold transition",
                active === section.id
                  ? "bg-evergreen-700 text-white"
                  : "bg-evergreen-50 text-evergreen-800 hover:bg-evergreen-100",
              ].join(" ")}
            >
              {section.title}
            </button>
          ))}
        </nav>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {!filtered.length && (
            <p className="py-8 text-center text-[0.85em] text-ink-soft">
              Nothing matches “{query}”.
            </p>
          )}

          {filtered.map((section) => (
            <section
              key={section.id}
              id={`formula-section-${section.id}`}
              className="mb-7 scroll-mt-2"
            >
              <h3 className="text-[0.95em] font-semibold text-evergreen-900">{section.title}</h3>
              <p className="mt-1 text-[0.78em] leading-relaxed text-ink-soft">{section.purpose}</p>

              <ul className="mt-3 space-y-3">
                {section.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-xl border border-evergreen-900/10 bg-white p-3 shadow-sm"
                  >
                    <div className="overflow-x-auto py-1">
                      <MathText text={`$$${entry.latex}$$`} className="block text-[1em] text-evergreen-950" />
                    </div>
                    {entry.where && (
                      <p className="mt-2 text-[0.75em] leading-relaxed text-ink-soft">
                        <span className="font-semibold text-evergreen-800">Where: </span>
                        <MathText text={entry.where} />
                      </p>
                    )}
                    {entry.note && (
                      <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[0.75em] leading-relaxed text-amber-900">
                        {entry.note}
                      </p>
                    )}
                    {entry.usedBy?.length ? (
                      <p className="mt-1.5 text-[0.7em] font-medium uppercase tracking-wide text-evergreen-700/80">
                        Used by {entry.usedBy.join(", ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {disclaimer && (
            <p
              data-testid="formula-booklet-disclaimer"
              className="mt-6 rounded-xl border border-evergreen-900/10 bg-evergreen-50/60 p-3 text-[0.72em] leading-relaxed text-ink-soft"
            >
              {disclaimer}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
