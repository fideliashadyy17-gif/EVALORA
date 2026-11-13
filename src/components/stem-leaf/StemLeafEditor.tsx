"use client";

import { normaliseStemLeafSpec, STEM_LEAF_LIMITS, type StemLeafRow, type StemLeafSpec } from "@/lib/stemLeafSpec";
import { StemLeafView } from "./StemLeafView";

const input = "min-h-10 w-full rounded-lg border border-evergreen-900/20 bg-white px-2 py-1.5 text-sm text-evergreen-950 focus:border-evergreen-600 focus:outline-none disabled:bg-cream";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft";
const button = "inline-flex min-h-10 items-center justify-center rounded-lg border border-evergreen-900/20 bg-white px-3 text-xs font-semibold text-evergreen-950 hover:bg-evergreen-50 disabled:opacity-50";

/** An editable school-style standard or back-to-back stem-and-leaf diagram. */
export function StemLeafEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: StemLeafSpec | null;
  onChange: (next: StemLeafSpec) => void;
  disabled?: boolean;
}) {
  const spec = normaliseStemLeafSpec(value);
  const backToBack = spec.layout === "back_to_back";
  function publish(next: StemLeafSpec) { onChange(normaliseStemLeafSpec(next, spec)); }
  function updateRow(index: number, field: keyof Pick<StemLeafRow, "stem" | "leaves" | "leftLeaves" | "rightLeaves">, nextValue: string) {
    publish({ ...spec, rows: spec.rows.map((row, position) => position === index ? { ...row, [field]: nextValue.slice(0, STEM_LEAF_LIMITS.text) } : row) });
  }
  function addRow() {
    if (spec.rows.length >= STEM_LEAF_LIMITS.rows) return;
    publish({ ...spec, rows: [...spec.rows, { id: `row-${Date.now().toString(36)}`, stem: "", leaves: "", leftLeaves: "", rightLeaves: "" }] });
  }
  function removeRow(index: number) {
    if (spec.rows.length <= 1) return;
    publish({ ...spec, rows: spec.rows.filter((_, position) => position !== index) });
  }

  return (
    <section className="stem-leaf-editor" data-testid="stem-leaf-editor" aria-label={backToBack ? "Back-to-back stem-and-leaf editor" : "Stem-and-leaf editor"}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label><span className={label}>Diagram title</span><input className={input} disabled={disabled} value={spec.title} placeholder="Optional title" onChange={(event) => publish({ ...spec, title: event.target.value })} /></label>
        <label><span className={label}>Key</span><input className={input} disabled={disabled} value={spec.key} placeholder="Key: 4 | 7 means 47" onChange={(event) => publish({ ...spec, key: event.target.value })} /></label>
      </div>
      <div className="mt-2 overflow-x-auto rounded-xl border border-evergreen-900/15 bg-white">
        <table className="min-w-[24rem] w-full border-collapse text-sm">
          <thead>
            {backToBack ? (
              <tr>
                <th className="border-b border-r border-evergreen-900/15 bg-evergreen-50 p-2 text-left"><input className={input} disabled={disabled} value={spec.leftLeafLabel} aria-label="Left leaves heading" onChange={(event) => publish({ ...spec, leftLeafLabel: event.target.value })} /></th>
                <th className="border-b border-r border-evergreen-900/15 bg-evergreen-50 p-2 text-left"><input className={input} disabled={disabled} value={spec.stemLabel} aria-label="Stem heading" onChange={(event) => publish({ ...spec, stemLabel: event.target.value })} /></th>
                <th className="border-b border-evergreen-900/15 bg-evergreen-50 p-2 text-left"><input className={input} disabled={disabled} value={spec.rightLeafLabel} aria-label="Right leaves heading" onChange={(event) => publish({ ...spec, rightLeafLabel: event.target.value })} /></th>
                <th className="w-12 border-b border-evergreen-900/15 bg-evergreen-50" />
              </tr>
            ) : (
              <tr>
                <th className="border-b border-r border-evergreen-900/15 bg-evergreen-50 p-2 text-left"><input className={input} disabled={disabled} value={spec.stemLabel} aria-label="Stem heading" onChange={(event) => publish({ ...spec, stemLabel: event.target.value })} /></th>
                <th className="border-b border-evergreen-900/15 bg-evergreen-50 p-2 text-left"><input className={input} disabled={disabled} value={spec.leafLabel} aria-label="Leaf heading" onChange={(event) => publish({ ...spec, leafLabel: event.target.value })} /></th>
                <th className="w-12 border-b border-evergreen-900/15 bg-evergreen-50" />
              </tr>
            )}
          </thead>
          <tbody>
            {spec.rows.map((row, index) => backToBack ? (
              <tr key={row.id}>
                <td className="border-r border-t border-evergreen-900/15 p-2"><input className={`${input} text-right font-mono tracking-[0.12em]`} disabled={disabled} value={row.leftLeaves ?? ""} aria-label={`Left leaves for row ${index + 1}`} placeholder="e.g. 9 7 3" onChange={(event) => updateRow(index, "leftLeaves", event.target.value)} /></td>
                <td className="border-r border-t border-evergreen-900/15 p-2"><input className={input} disabled={disabled} value={row.stem} aria-label={`Stem ${index + 1}`} placeholder="e.g. 4" onChange={(event) => updateRow(index, "stem", event.target.value)} /></td>
                <td className="border-t border-evergreen-900/15 p-2"><input className={`${input} font-mono tracking-[0.12em]`} disabled={disabled} value={row.rightLeaves ?? row.leaves} aria-label={`Right leaves for stem ${row.stem || index + 1}`} placeholder="e.g. 1 3 7" onChange={(event) => updateRow(index, "rightLeaves", event.target.value)} /></td>
                <td className="border-l border-t border-evergreen-900/15 p-2 text-center">{!disabled && spec.rows.length > 1 ? <button type="button" className="text-xs font-semibold text-red-700 underline" onClick={() => removeRow(index)} aria-label={`Remove stem row ${index + 1}`}>Remove</button> : null}</td>
              </tr>
            ) : (
              <tr key={row.id}>
                <td className="border-r border-t border-evergreen-900/15 p-2"><input className={input} disabled={disabled} value={row.stem} aria-label={`Stem ${index + 1}`} placeholder="e.g. 4" onChange={(event) => updateRow(index, "stem", event.target.value)} /></td>
                <td className="border-t border-evergreen-900/15 p-2"><input className={`${input} font-mono tracking-[0.12em]`} disabled={disabled} value={row.leaves} aria-label={`Leaves for stem ${row.stem || index + 1}`} placeholder="e.g. 1 3 7 9" onChange={(event) => updateRow(index, "leaves", event.target.value)} /></td>
                <td className="border-l border-t border-evergreen-900/15 p-2 text-center">{!disabled && spec.rows.length > 1 ? <button type="button" className="text-xs font-semibold text-red-700 underline" onClick={() => removeRow(index)} aria-label={`Remove stem row ${index + 1}`}>Remove</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={button} disabled={spec.rows.length >= STEM_LEAF_LIMITS.rows} onClick={addRow}>+ Add stem row</button><span className="self-center text-[11px] text-ink-soft">{backToBack ? "Keep the two classes on their own sides of the shared stems. Use your class convention for the left-side leaf order." : "Separate leaves with spaces and order them from least to greatest when the question requires it."}</span></div>}
      <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-evergreen-800">Preview submitted diagram</summary><StemLeafView spec={spec} /></details>
    </section>
  );
}

export default StemLeafEditor;
