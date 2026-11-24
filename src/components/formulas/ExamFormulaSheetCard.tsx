"use client";

/**
 * Per-examination formula sheet composer.
 *
 * Teachers pick EXACTLY which library formulas (or custom entries) appear on
 * this paper, grouped under their own headings, and switch sheet access on or
 * off independently of every other examination. Saving stores a validated
 * snapshot in exams.settings.formula_sheet bound to this exam's id — the
 * candidate receives it in-page (FormulaPanel) without leaving the question
 * or disturbing saved answers.
 */

import { useMemo, useState } from "react";
import { MathText } from "@/components/MathText";
import { Badge, Button, Field, Input } from "@/components/ui";
import { updateExamFormulaSheet } from "@/app/dashboard/exams/actions";
import { Plus, Trash2, X } from "lucide-react";

interface SheetItem {
  latex: string;
  note?: string;
  source?: string;
}
interface SheetGroup {
  title: string;
  items: SheetItem[];
}
interface LibraryEntry {
  id: string;
  topic: string;
  chapter: string | null;
  title: string;
  latex: string;
  note: string | null;
}

export function ExamFormulaSheetCard({
  examId,
  library,
  sheet,
  canEdit,
}: {
  examId: string;
  library: LibraryEntry[];
  sheet: { title: string; enabled: boolean; groups: SheetGroup[] } | null;
  canEdit: boolean;
}) {
  const [enabled, setEnabled] = useState(sheet?.enabled ?? false);
  const [title, setTitle] = useState(sheet?.title ?? "Formulas for this paper");
  const [groups, setGroups] = useState<SheetGroup[]>(
    () => (sheet?.groups ?? []).map((g) => ({ title: g.title, items: [...g.items] })),
  );
  const [subjectFilter, setSubjectFilter] = useState("");
  const [customLatex, setCustomLatex] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [customTarget, setCustomTarget] = useState(0);

  const itemCount = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  const visibleLibrary = useMemo(() => {
    const needle = subjectFilter.trim().toLowerCase();
    if (!needle) return library;
    return library.filter((e) => [e.topic, e.chapter ?? "", e.title, e.latex].join(" ").toLowerCase().includes(needle));
  }, [library, subjectFilter]);

  const addToGroup = (entry: LibraryEntry, groupIndex: number) => {
    setGroups((prev) => {
      const next = prev.map((g) => ({ ...g, items: [...g.items] }));
      if (!next[groupIndex]) return prev;
      if (next[groupIndex].items.some((i) => i.latex === entry.latex)) return prev;
      next[groupIndex].items.push({ latex: entry.latex, ...(entry.note ? { note: entry.note } : {}), source: entry.id });
      return next;
    });
  };

  const addGroup = () =>
    setGroups((prev) => [...prev, { title: `Group ${prev.length + 1}`, items: [] }]);

  const removeItem = (g: number, i: number) =>
    setGroups((prev) => prev.map((group, gi) => (gi === g ? { ...group, items: group.items.filter((_, ix) => ix !== i) } : group)));

  const addCustom = () => {
    const latex = customLatex.trim();
    if (!latex) return;
    setGroups((prev) => {
      const next = prev.map((g) => ({ ...g, items: [...g.items] }));
      if (!next[customTarget]) return prev;
      next[customTarget].items.push({
        latex: latex.replace(/^\$|\$$/g, ""),
        ...(customNote.trim() ? { note: customNote.trim() } : {}),
      });
      return next;
    });
    setCustomLatex("");
    setCustomNote("");
  };

  return (
    <div className="space-y-4" data-testid="exam-formula-card">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-evergreen-900/10 pb-4">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Formula Sheet</h2>
        <Badge tone={sheet && sheet.enabled ? "green" : "gray"}>
          {sheet ? (sheet.enabled ? "Available to candidates" : "Saved but hidden") : "Not configured"}
        </Badge>
        <span className="ml-auto text-xs font-medium text-ink-soft">{itemCount} formula(s) selected</span>
      </div>

      {!canEdit ? (
        <p className="text-sm text-ink-soft">
          {sheet && sheet.enabled
            ? `Candidates see "${sheet.title}" inside the paper.`
            : "No formula sheet is available to candidates for this examination."}
        </p>
      ) : (
        <form
          action={updateExamFormulaSheet}
          className="space-y-4"
          onSubmit={() => {
            /* groups/title/enabled are carried by hidden inputs below */
          }}
        >
          <input type="hidden" name="exam_id" value={examId} />
          <input type="hidden" name="mode" value="save" />
          <input type="hidden" name="enabled" value={enabled ? "1" : "0"} />
          <input type="hidden" name="title" value={title} />
          <input type="hidden" name="groups_json" value={JSON.stringify(groups)} />

          <label className="flex items-center gap-2 text-sm font-medium text-evergreen-900">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-5 w-5 accent-evergreen-700"
              data-testid="formula-enabled-toggle"
            />
            Show this formula sheet to candidates in the examination interface
          </label>

          <Field label="Sheet title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          </Field>

          {/* Group composer */}
          <div className="space-y-3">
            {groups.map((group, gi) => (
              <div key={gi} className="rounded-xl border border-evergreen-900/15 bg-cream/50 p-3" data-testid={`formula-group-${gi}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={group.title}
                    onChange={(e) =>
                      setGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, title: e.target.value } : g)))
                    }
                    maxLength={80}
                    className="max-w-xs"
                    aria-label={`Group ${gi + 1} title`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="ml-auto text-xs"
                    onClick={() => setGroups((prev) => prev.filter((_, i) => i !== gi))}
                  >
                    <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Remove group
                  </Button>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {group.items.map((item, ii) => (
                    <li key={`${item.latex}-${ii}`} className="flex items-start gap-2 rounded-lg bg-white px-2.5 py-1.5">
                      <div className="min-w-0 flex-1 overflow-x-auto text-sm text-evergreen-950">
                        <MathText text={`$${item.latex}$`} />
                        {item.note && <span className="ml-2 text-xs text-ink-soft">{item.note}</span>}
                      </div>
                      <button
                        type="button"
                        aria-label="Remove formula from this sheet"
                        className="rounded p-1 text-red-700 hover:bg-red-50"
                        onClick={() => removeItem(gi, ii)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                  {group.items.length === 0 && (
                    <li className="text-xs italic text-ink-soft">No formulas in this group yet.</li>
                  )}
                </ul>
                {/* Custom entry */}
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="min-w-[12rem] flex-1">
                    <Input
                      value={customTarget === gi ? customLatex : ""}
                      onFocus={() => setCustomTarget(gi)}
                      onChange={(e) => {
                        setCustomTarget(gi);
                        setCustomLatex(e.target.value);
                      }}
                      placeholder="Custom LaTeX, e.g. E = mc^{2}"
                      maxLength={300}
                      aria-label="Custom formula LaTeX"
                    />
                  </div>
                  <Input
                    value={customTarget === gi ? customNote : ""}
                    onFocus={() => setCustomTarget(gi)}
                    onChange={(e) => {
                      setCustomTarget(gi);
                      setCustomNote(e.target.value);
                    }}
                    placeholder="Note (optional)"
                    maxLength={240}
                    className="max-w-[10rem]"
                    aria-label="Custom formula note"
                  />
                  <Button type="button" variant="outline" className="text-xs" onClick={addCustom}>
                    <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Add
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" className="text-xs" onClick={addGroup}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Add group
            </Button>
          </div>

          {/* Library picker */}
          <div className="rounded-xl border border-evergreen-900/15 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-evergreen-950">Add from the formula library</p>
              <Input
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                placeholder="Filter by topic or chapter…"
                aria-label="Filter library"
                className="ml-auto max-w-[14rem]"
              />
            </div>
            {groups.length === 0 && (
              <p className="mt-2 text-xs text-ink-soft">Create a group first — selected formulas are added to it.</p>
            )}
            <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {visibleLibrary.length === 0 && (
                <p className="text-xs text-ink-soft">
                  The library is empty. Create formulas in the Formula Library first.
                </p>
              )}
              {visibleLibrary.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2 rounded-lg bg-cream/60 px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-evergreen-950">
                      {entry.title} <span className="font-normal text-ink-soft">· {entry.topic}</span>
                    </p>
                    <div className="overflow-x-auto text-xs text-evergreen-900">
                      <MathText text={`$${entry.latex}$`} />
                    </div>
                  </div>
                  <select
                    className="rounded-md border border-evergreen-900/20 bg-white px-1.5 py-1 text-xs"
                    value=""
                    onChange={(e) => {
                      const gi = Number(e.target.value);
                      if (Number.isFinite(gi)) addToGroup(entry, gi);
                    }}
                    aria-label={`Add ${entry.title} to group`}
                    disabled={groups.length === 0}
                  >
                    <option value="">Add to…</option>
                    {groups.map((g, gi) => (
                      <option key={gi} value={gi}>{g.title}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" className="text-xs">
              Save formula sheet
            </Button>
          </div>
        </form>
      )}

      {canEdit && sheet && (
        <form action={updateExamFormulaSheet}>
          <input type="hidden" name="exam_id" value={examId} />
          <input type="hidden" name="mode" value="clear" />
          <button
            type="submit"
            className="text-xs font-medium text-red-700 underline-offset-2 hover:underline"
            onClick={(e) => {
              if (!window.confirm("Remove the formula sheet from this examination entirely?")) e.preventDefault();
            }}
          >
            Remove sheet from this examination
          </button>
        </form>
      )}
    </div>
  );
}
