"use client";

/**
 * VennEditor — the candidate/teacher workspace for a Venn diagram.
 *
 * The candidate picks a region (by clicking it in the diagram or its row in the
 * table), types the value for that region, and sets the set names. Everything
 * is published on each change, so the existing autosave queue persists the
 * diagram as data — not as a drawing — and a resumed attempt restores it.
 *
 * Deliberate limits: no freehand drawing (an unmarkable scribble is worse for a
 * candidate than a marked region table), and no computed answers — the
 * workspace never fills a region for the candidate.
 */
import { useId, useMemo, useState, type DragEvent } from "react";
import { VennView } from "./VennView";
import {
  emptyVennSpec,
  normaliseVennSpec,
  regionKeysFor,
  regionLabel,
  vennProgress,
  VENN_LIMITS,
  type VennSpec,
  type VennSetCount,
} from "@/lib/vennSpec";

interface Props {
  value: VennSpec | null;
  onChange: (next: VennSpec) => void;
  /** When false the candidate may not change the number of sets. */
  allowSetChange?: boolean;
  disabled?: boolean;
}

const input = "min-h-10 w-full rounded-lg border border-evergreen-900/20 bg-white px-2 py-1.5 text-sm text-evergreen-950 focus:border-evergreen-600 focus:outline-none disabled:bg-cream";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft";

export function VennEditor({ value, onChange, allowSetChange = true, disabled = false }: Props) {
  const spec = useMemo(() => normaliseVennSpec(value, emptyVennSpec()), [value]);
  const [selected, setSelected] = useState<string>(() => (spec.sets === 3 ? "AnBnC" : "AnB"));
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [newItem, setNewItem] = useState("");
  const helpId = useId();
  const keys = regionKeysFor(spec.sets);
  const progress = vennProgress(spec);
  const active = keys.includes(selected as never) ? selected : keys[0];

  function update(patch: Partial<VennSpec>) {
    onChange(normaliseVennSpec({ ...spec, ...patch }, spec));
  }

  function setRegion(key: string, regionValue: string) {
    update({ regions: { ...spec.regions, [key]: regionValue.slice(0, VENN_LIMITS.value) } });
  }

  function moveItem(itemId: string, region: string) {
    if (disabled) return;
    update({ items: spec.items.map((item) => item.id === itemId ? { ...item, region: region as never } : item) });
    setSelectedItem(null);
  }

  function addItem() {
    const label = newItem.trim();
    if (!label || disabled || spec.items.length >= VENN_LIMITS.items) return;
    update({ items: [...spec.items, { id: `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, label, region: "bank" }] });
    setNewItem("");
  }

  function removeItem(itemId: string) {
    if (disabled) return;
    update({ items: spec.items.filter((item) => item.id !== itemId) });
    if (selectedItem === itemId) setSelectedItem(null);
  }

  function dragStart(event: DragEvent<HTMLButtonElement>, itemId: string) {
    event.dataTransfer.setData("text/plain", itemId);
    event.dataTransfer.effectAllowed = "move";
    setSelectedItem(itemId);
  }

  function dropOn(event: DragEvent<HTMLElement>, region: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (id) moveItem(id, region);
  }

  function setSetCount(next: VennSetCount) {
    // Regions that do not exist in the new diagram are dropped by the
    // normaliser, so switching 3 → 2 never leaves an orphaned B∩C value.
    const renamed = next === 3
      ? { sets: 3 as const, labels: [spec.labels[0] ?? "A", spec.labels[1] ?? "B", spec.labels[2] ?? "C"] }
      : { sets: 2 as const, labels: [spec.labels[0] ?? "A", spec.labels[1] ?? "B"] };
    onChange(normaliseVennSpec({ ...spec, ...renamed, regions: spec.regions }, spec));
    setSelected(next === 3 ? "AnBnC" : "AnB");
  }

  return (
    <div className="venn-editor space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[10rem] flex-1">
          <span className={labelCls}>Diagram title</span>
          <input
            className={input}
            value={spec.title}
            disabled={disabled}
            placeholder="Optional title"
            onChange={(event) => update({ title: event.target.value })}
          />
        </label>
        <label className="min-w-[7rem]">
          <span className={labelCls}>Number of sets</span>
          <select
            className={input}
            value={spec.sets}
            disabled={disabled || !allowSetChange}
            onChange={(event) => setSetCount(Number(event.target.value) === 3 ? 3 : 2)}
          >
            <option value={2}>Two sets</option>
            <option value={3}>Three sets</option>
          </select>
        </label>
        <label className="min-w-[6rem] flex-1">
          <span className={labelCls}>Universal set</span>
          <input
            className={input}
            value={spec.universalLabel}
            disabled={disabled}
            placeholder="ξ"
            onChange={(event) => update({ universalLabel: event.target.value })}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {spec.labels.map((label, index) => (
          <label key={index} className="min-w-[7rem] flex-1">
            <span className={labelCls}>Set {index + 1} name</span>
            <input
              className={input}
              value={label}
              disabled={disabled}
              onChange={(event) => {
                const labels = [...spec.labels];
                labels[index] = event.target.value;
                update({ labels });
              }}
            />
          </label>
        ))}
      </div>

      {spec.items.length > 0 || !disabled ? (
        <div className="rounded-xl border border-evergreen-900/12 bg-cream/45 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <span className={labelCls}>Elements to place</span>
              <div className="flex min-h-10 flex-wrap items-center gap-1 rounded-lg border border-dashed border-evergreen-900/25 bg-white p-1.5" onDragOver={(event) => { if (!disabled) event.preventDefault(); }} onDrop={(event) => dropOn(event, "bank")}>
                {spec.items.filter((item) => item.region === "bank").map((item) => (
                  <span key={item.id} className={`inline-flex items-center rounded-md border text-xs font-semibold ${selectedItem === item.id ? "border-evergreen-700 bg-evergreen-700 text-white" : "border-evergreen-900/20 bg-evergreen-50 text-evergreen-900"}`}>
                    <button type="button" draggable={!disabled} onDragStart={(event) => dragStart(event, item.id)} onClick={() => setSelectedItem((current) => current === item.id ? null : item.id)} className="px-2 py-1">{item.label}</button>
                    {!disabled ? <button type="button" className="border-l border-current/20 px-1.5 py-1" aria-label={`Remove element ${item.label}`} onClick={() => removeItem(item.id)}>×</button> : null}
                  </span>
                ))}
                {spec.items.every((item) => item.region !== "bank") ? <span className="px-1 text-xs text-ink-soft">All given elements are placed.</span> : null}
              </div>
            </div>
            {!disabled && <label className="min-w-[12rem] flex-1"><span className={labelCls}>Add an element</span><div className="flex gap-1"><input className={input} value={newItem} placeholder="e.g. 12" onChange={(event) => setNewItem(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addItem(); } }} /><button type="button" className="rounded-lg border border-evergreen-900/20 px-3 text-xs font-semibold text-evergreen-900" onClick={addItem}>Add</button></div></label>}
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">Drag an element to a region below, or tap an element then tap the target region. Drag it back here to correct a placement.</p>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-evergreen-900/12 bg-white p-2">
          <VennView spec={spec} highlight={active} />
          <p id={helpId} className="mt-1 text-center text-[11px] text-ink-soft">
            {progress.filled} of {progress.total} regions filled. Click a region below to label it.
          </p>
        </div>

        <div className="space-y-1.5" aria-describedby={helpId}>
          {keys.map((key) => {
            const isActive = key === active;
            return (
              <div
                key={key}
                className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 ${isActive ? "bg-evergreen-50 ring-1 ring-evergreen-600/40" : "hover:bg-cream"}`}
                onDragOver={(event) => { if (!disabled) event.preventDefault(); }}
                onDrop={(event) => dropOn(event, key)}
                onClick={() => { if (selectedItem) moveItem(selectedItem, key); }}
              >
                <button
                  type="button"
                  className={`min-h-9 min-w-0 flex-1 truncate rounded px-1 text-left text-[13px] ${isActive ? "font-semibold text-evergreen-900" : "text-evergreen-950"}`}
                  onClick={(event) => { event.stopPropagation(); setSelected(key); }}
                  aria-pressed={isActive}
                  disabled={disabled}
                >
                  {regionLabel(spec, key)}
                </button>
                {spec.items.filter((item) => item.region === key).map((item) => <button key={item.id} type="button" draggable={!disabled} onDragStart={(event) => dragStart(event, item.id)} onClick={(event) => { event.stopPropagation(); setSelectedItem((current) => current === item.id ? null : item.id); }} className={`rounded-md border px-1.5 py-1 text-[11px] font-semibold ${selectedItem === item.id ? "border-evergreen-700 bg-evergreen-700 text-white" : "border-evergreen-900/20 bg-white text-evergreen-900"}`}>{item.label}</button>)}
                <input
                  className={`${input} max-w-[9.5rem]`}
                  value={spec.regions[key] ?? ""}
                  disabled={disabled}
                  aria-label={`Value for ${regionLabel(spec, key)}`}
                  placeholder="value"
                  onFocus={() => setSelected(key)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setRegion(key, event.target.value)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-ink-soft">
        Enter each region&rsquo;s value (a number of members, or the members themselves). The intersection regions
        mean &ldquo;in both sets&rdquo;; &ldquo;only&rdquo; means in that set and no other. Leave a region empty only if it
        really is empty — write 0 if you mean zero.
      </p>
    </div>
  );
}

export default VennEditor;
