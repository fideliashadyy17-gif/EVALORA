"use client";

import { useMemo, useState } from "react";
import { ProbabilityTreeView } from "./ProbabilityTreeView";
import {
  emptyProbabilityTreeSpec,
  normaliseProbabilityTreeSpec,
  parseProbability,
  probabilityTreeHasWork,
  removeProbabilityTreeNode,
  treeChildren,
  treeDepth,
  type ProbabilityTreeNode,
  type ProbabilityTreeSpec,
} from "@/lib/probabilityTreeSpec";

const input = "min-h-10 w-full rounded-lg border border-evergreen-900/20 bg-white px-2 py-1.5 text-sm text-evergreen-950 focus:border-evergreen-600 focus:outline-none disabled:bg-cream";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft";
const button = "inline-flex min-h-10 items-center justify-center rounded-lg border border-evergreen-900/20 bg-white px-3 text-xs font-semibold text-evergreen-950 hover:bg-evergreen-50 disabled:opacity-50";

const uid = () => `branch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Editable multi-stage probability tree. Branch data, rather than SVG paths,
 * is published on every edit. Candidates can therefore revise a label, move
 * down a stage, remove a wrong branch and resume exactly where they stopped.
 */
export function ProbabilityTreeEditor({
  value,
  onChange,
  disabled = false,
  allowStructure = true,
}: {
  value: ProbabilityTreeSpec | null;
  onChange: (next: ProbabilityTreeSpec) => void;
  disabled?: boolean;
  allowStructure?: boolean;
}) {
  const spec = useMemo(() => normaliseProbabilityTreeSpec(value, emptyProbabilityTreeSpec()), [value]);
  const [selected, setSelected] = useState("root");

  function publish(next: ProbabilityTreeSpec) {
    onChange(normaliseProbabilityTreeSpec(next, spec));
  }

  function patch(patchValue: Partial<ProbabilityTreeSpec>) {
    publish({ ...spec, ...patchValue });
  }

  function patchNode(id: string, patchValue: Partial<ProbabilityTreeNode>) {
    publish({ ...spec, nodes: spec.nodes.map((node) => node.id === id ? { ...node, ...patchValue } : node) });
  }

  function addBranch(parentId: string) {
    if (disabled || !allowStructure || spec.nodes.length >= 80) return;
    const id = uid();
    publish({
      ...spec,
      nodes: [...spec.nodes, { id, parentId, label: "", probability: "", outcome: "" }],
    });
    setSelected(id);
  }

  function removeBranch(id: string) {
    if (disabled || !allowStructure || id === "root") return;
    publish(removeProbabilityTreeNode(spec, id));
    setSelected("root");
  }

  const branches = spec.nodes.filter((node) => node.id !== "root");
  const selectedNode = spec.nodes.find((node) => node.id === selected) ?? spec.nodes[0];
  const selectedChildren = selectedNode ? treeChildren(spec, selectedNode.id) : [];

  return (
    <section className="probability-tree-editor" data-testid="probability-tree-editor" aria-label="Probability tree editor">
      <div className="grid gap-2 sm:grid-cols-2">
        <label>
          <span className={label}>Tree title</span>
          <input className={input} disabled={disabled} value={spec.title} placeholder="Optional title" onChange={(event) => patch({ title: event.target.value })} />
        </label>
        <label>
          <span className={label}>Start label</span>
          <input className={input} disabled={disabled} value={spec.rootLabel} placeholder="Start" onChange={(event) => patch({ rootLabel: event.target.value })} />
        </label>
      </div>

      <ProbabilityTreeView spec={spec} highlight={selected} />

      <div className="rounded-xl border border-evergreen-900/12 bg-cream/45 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-evergreen-800">Build the branches</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">Select a node, then add a branch to make the next stage. Fractions such as 3/8 and decimals such as 0.375 are accepted.</p>
          </div>
          {allowStructure && <button type="button" className={button} disabled={disabled || spec.nodes.length >= 80} onClick={() => addBranch("root")}>+ Add first-stage branch</button>}
        </div>

        {branches.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-evergreen-900/25 bg-white px-3 py-4 text-sm text-ink-soft">Start by adding an outcome branch from the root.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {branches.map((node) => {
              const active = node.id === selectedNode?.id;
              const parent = spec.nodes.find((candidate) => candidate.id === node.parentId);
              const probability = parseProbability(node.probability);
              return (
                <article key={node.id} className={`rounded-lg border p-2.5 ${active ? "border-evergreen-600 bg-evergreen-50" : "border-evergreen-900/15 bg-white"}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <button type="button" className="min-h-8 rounded px-1 text-left text-xs font-semibold text-evergreen-900 underline underline-offset-2" onClick={() => setSelected(node.id)} disabled={disabled}>
                      Stage {treeDepth(spec, node.id)} after {parent?.id === "root" ? spec.rootLabel : (parent?.label || "an event")}
                    </button>
                    {probability === null && node.probability.trim() ? <span className="text-[11px] font-medium text-red-700">Use a probability from 0 to 1.</span> : null}
                    {probability !== null ? <span className="text-[11px] text-evergreen-800">P = {probability}</span> : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label><span className={label}>Event / branch</span><input className={input} disabled={disabled} value={node.label} placeholder="e.g. Red" onFocus={() => setSelected(node.id)} onChange={(event) => patchNode(node.id, { label: event.target.value })} /></label>
                    <label><span className={label}>Probability</span><input className={input} disabled={disabled} value={node.probability} placeholder="e.g. 3/8" onFocus={() => setSelected(node.id)} onChange={(event) => patchNode(node.id, { probability: event.target.value })} /></label>
                    <label><span className={label}>Outcome (optional)</span><input className={input} disabled={disabled} value={node.outcome} placeholder="terminal outcome" onFocus={() => setSelected(node.id)} onChange={(event) => patchNode(node.id, { outcome: event.target.value })} /></label>
                  </div>
                  {allowStructure && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className={button} disabled={disabled || spec.nodes.length >= 80} onClick={() => addBranch(node.id)}>+ Extend this branch</button>
                      <button type="button" className={`${button} border-red-200 text-red-700 hover:bg-red-50`} disabled={disabled} onClick={() => removeBranch(node.id)}>Remove branch</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        {selectedChildren.length && selectedNode?.id !== "root" ? <p className="mt-2 text-[11px] text-ink-soft">The selected branch already has {selectedChildren.length} next-stage branch{selectedChildren.length === 1 ? "" : "es"}.</p> : null}
      </div>

      <p className="text-[11px] text-ink-soft">{probabilityTreeHasWork(spec) ? "Your tree is stored as editable branch data for your teacher to inspect." : "No branches have been completed yet."}</p>
    </section>
  );
}

export default ProbabilityTreeEditor;
