"use client";

/**
 * Formula Library browser + editor.
 *
 * Subject → topic → chapter organization on the left; a compact scientific
 * editor on the right (LaTeX source with live rendering, quick-insert chips
 * for fractions, powers, roots, integrals, derivatives, symbols and units).
 * The stored value is LaTeX; candidates render it through MathText/KaTeX.
 */

import { useMemo, useState } from "react";
import { MathText } from "@/components/MathText";
import type { FormulaLibraryEntry } from "@/lib/formulaLibrary";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { saveFormula as saveFormulaAction, deleteFormula as deleteFormulaAction } from "@/app/dashboard/formulas/actions";
import { Pencil, Plus, Trash2, X } from "lucide-react";

/** Quick-insert chips: the structures an exam author reaches for constantly. */
const QUICK_INSERTS: { label: string; latex: string; title: string }[] = [
  { label: "a/b", latex: "\\frac{a}{b}", title: "Fraction" },
  { label: "x²", latex: "x^{2}", title: "Power" },
  { label: "√x", latex: "\\sqrt{x}", title: "Square root" },
  { label: "∛x", latex: "\\sqrt[3]{x}", title: "Cube root" },
  { label: "∫", latex: "\\int_{a}^{b} f(x)\\,dx", title: "Integral" },
  { label: "d/dx", latex: "\\frac{d}{dx}", title: "Derivative" },
  { label: "∂", latex: "\\frac{\\partial f}{\\partial x}", title: "Partial derivative" },
  { label: "π", latex: "\\pi", title: "Pi" },
  { label: "±", latex: "\\pm", title: "Plus-minus" },
  { label: "×", latex: "\\times", title: "Multiplication sign" },
  { label: "÷", latex: "\\div", title: "Division sign" },
  { label: "≤", latex: "\\leq", title: "Less than or equal" },
  { label: "≥", latex: "\\geq", title: "Greater than or equal" },
  { label: "≠", latex: "\\neq", title: "Not equal" },
  { label: "≈", latex: "\\approx", title: "Approximately" },
  { label: "∞", latex: "\\infty", title: "Infinity" },
  { label: "θ", latex: "\\theta", title: "Theta" },
  { label: "Δ", latex: "\\Delta", title: "Delta" },
  { label: "α", latex: "\\alpha", title: "Alpha" },
  { label: "β", latex: "\\beta", title: "Beta" },
  { label: "m/s²", latex: "\\mathrm{m/s^{2}}", title: "Unit — acceleration" },
  { label: "N·m", latex: "\\mathrm{N\\cdot m}", title: "Unit — torque" },
  { label: "J", latex: "\\mathrm{J}", title: "Unit — joule" },
  { label: "mol/L", latex: "\\mathrm{mol/L}", title: "Unit — concentration" },
];

export function FormulaLibraryClient({
  subjects,
  grouped,
  canEdit,
}: {
  subjects: { id: string; name: string }[];
  grouped: { topic: string; chapters: { chapter: string | null; entries: FormulaLibraryEntry[] }[] }[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<Partial<FormulaLibraryEntry> | null>(null);
  const [latex, setLatex] = useState("");
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return grouped;
    return grouped
      .map((g) => ({
        ...g,
        chapters: g.chapters
          .map((c) => ({
            ...c,
            entries: c.entries.filter((e) =>
              [e.title, e.latex, e.note ?? "", e.topic, e.chapter ?? ""].join(" ").toLowerCase().includes(needle),
            ),
          }))
          .filter((c) => c.entries.length > 0),
      }))
      .filter((g) => g.chapters.length > 0);
  }, [grouped, filter]);

  const insertQuick = (snippet: string) => setLatex((cur) => (cur ? `${cur} ${snippet}` : snippet));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search formulas…"
            aria-label="Search formulas"
            className="max-w-xs"
          />
          {canEdit && (
            <Button
              type="button"
              variant="primary"
              className="text-xs"
              onClick={() => {
                setEditing({ topic: "", chapter: "", title: "", latex: "", note: "", subject_id: null });
                setLatex("");
              }}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> New formula
            </Button>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-evergreen-900/20 bg-cream/60 px-4 py-6 text-sm text-ink-soft">
            No formulas yet. Create one with the button above — group by topic and chapter so papers can pick exact
            sets later.
          </p>
        ) : (
          <div className="space-y-5">
            {visible.map((group) => (
              <section key={group.topic} data-testid={`formula-topic-${group.topic}`}>
                <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-evergreen-800">
                  {group.topic}
                </h3>
                {group.chapters.map((chapter) => (
                  <div key={chapter.chapter ?? "__none__"} className="mb-3">
                    {chapter.chapter && (
                      <p className="mb-1.5 text-xs font-medium text-ink-soft">{chapter.chapter}</p>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {chapter.entries.map((entry) => (
                        <article
                          key={entry.id}
                          className="rounded-xl border border-evergreen-900/15 bg-white p-3"
                          data-testid="formula-entry"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-evergreen-950">{entry.title}</p>
                              {subjects.find((s) => s.id === entry.subject_id) && (
                                <p className="text-[11px] text-ink-soft">
                                  {subjects.find((s) => s.id === entry.subject_id)?.name}
                                </p>
                              )}
                            </div>
                            {canEdit && (
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  aria-label={`Edit ${entry.title}`}
                                  className="rounded p-1.5 text-ink-soft hover:bg-cream hover:text-evergreen-900"
                                  onClick={() => {
                                    setEditing(entry);
                                    setLatex(entry.latex);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 overflow-x-auto rounded-lg bg-evergreen-50/70 px-2 py-1.5 text-sm text-evergreen-950">
                            <MathText text={`$${entry.latex}$`} />
                          </div>
                          {entry.note && <p className="mt-1.5 text-xs leading-snug text-ink-soft">{entry.note}</p>}
                          {canEdit && (
                            <form action={deleteFormulaAction} className="mt-2">
                              <input type="hidden" name="id" value={entry.id} />
                              <button
                                type="submit"
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-3 w-3" aria-hidden="true" /> Remove
                              </button>
                            </form>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Scientific editor */}
      <aside className="lg:sticky lg:top-24 lg:h-fit">
        <div className="rounded-xl border border-evergreen-900/15 bg-cream/60 p-4">
          <h3 className="font-display text-sm font-semibold text-evergreen-950">
            {editing?.id ? "Edit formula" : "Scientific editor"}
          </h3>
          {!editing ? (
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              Select a formula to edit, or create a new one. Supports equations, fractions, powers, roots, integrals,
              derivatives, symbols and units through LaTeX with live preview.
            </p>
          ) : (
            <form action={saveFormulaAction} className="mt-3 space-y-3">
              {editing.id && <input type="hidden" name="id" value={editing.id} />}
              <Field label="Title">
                <Input name="title" defaultValue={editing.title ?? ""} required maxLength={160} placeholder="Quadratic formula" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Topic">
                  <Input name="topic" defaultValue={editing.topic ?? ""} required maxLength={120} placeholder="Algebra" />
                </Field>
                <Field label="Chapter (optional)">
                  <Input name="chapter" defaultValue={editing.chapter ?? ""} maxLength={120} placeholder="Equations" />
                </Field>
              </div>
              <Field label="Subject">
                <Select name="subject_id" defaultValue={editing.subject_id ?? ""}>
                  <option value="">All subjects</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Formula (LaTeX)">
                <Textarea
                  name="latex"
                  value={latex}
                  onChange={(e) => setLatex(e.target.value)}
                  rows={3}
                  required
                  maxLength={300}
                  placeholder="x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}"
                />
              </Field>
              <div className="flex flex-wrap gap-1">
                {QUICK_INSERTS.map((chip) => (
                  <button
                    key={chip.title}
                    type="button"
                    title={chip.title}
                    onClick={() => insertQuick(chip.latex)}
                    className="rounded-md border border-evergreen-900/20 bg-white px-2 py-1 text-[11px] font-semibold text-evergreen-900 hover:bg-evergreen-50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              {latex.trim() && (
                <div className="overflow-x-auto rounded-lg border border-evergreen-900/10 bg-white px-3 py-2 text-sm">
                  <MathText text={`$${latex.trim()}$`} />
                </div>
              )}
              <Field label="Note (optional)">
                <Input name="note" defaultValue={editing.note ?? ""} maxLength={240} placeholder="Shown under the formula" />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" className="text-xs">Save formula</Button>
                <Button type="button" variant="outline" className="text-xs" onClick={() => setEditing(null)}>
                  <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}
