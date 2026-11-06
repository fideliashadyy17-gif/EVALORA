"use client";

import { Badge, Button, Card, Select } from "@/components/ui";
import Link from "next/link";
import { useState } from "react";
import {
  generateQuestionPoolItems,
  replaceQuestionPoolItem,
  saveQuestionPoolSelections,
  setQuestionPoolStatus,
  shuffleQuestionPoolItems,
} from "../../actions/event-operations";

export interface PoolEligibleQuestion {
  question_id: string;
  prompt: string;
  curriculum: string | null;
  topic: string | null;
  subtopic: string | null;
  difficulty: string | null;
  question_type: string | null;
  used_before: boolean;
  source_reference: string | null;
  creation_method: string | null;
}

export interface PoolReport {
  valid: boolean;
  selected: number;
  eligible: number;
  target_count: number;
  shortfall: number;
  insufficient: boolean;
  curriculum_counts: Record<string, number>;
  errors: string[];
  workflow?: string;
}

export function PoolAssemblyClient({
  poolId,
  status,
  targetCount,
  eligible,
  selectedIds,
  report,
  orgId,
  classId,
}: {
  poolId: string;
  status: string;
  targetCount: number;
  eligible: PoolEligibleQuestion[];
  selectedIds: string[];
  report: PoolReport;
  orgId: string;
  classId: string;
}) {
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const [preview, setPreview] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const byId = new Map(eligible.map((q) => [q.question_id, q]));
  const selectedItems = selected.map((id) => byId.get(id)).filter(Boolean) as PoolEligibleQuestion[];

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status === "published" ? "green" : status === "draft" ? "amber" : "gray"}>{status}</Badge>
            <span className="text-sm font-medium text-evergreen-900">Selected {selected.length} / {targetCount}</span>
            <Badge tone="gray">Eligible approved {eligible.length}</Badge>
            <Badge tone={report.insufficient ? "red" : "green"}>Shortfall {report.shortfall}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={generateQuestionPoolItems}>
              <input type="hidden" name="pool_id" value={poolId} />
              <Button type="submit" variant="gold" disabled={status !== "draft"}>Auto-generate</Button>
            </form>
            <form action={shuffleQuestionPoolItems}>
              <input type="hidden" name="pool_id" value={poolId} />
              <Button type="submit" variant="outline" disabled={status !== "draft"}>Shuffle</Button>
            </form>
            <Button type="button" variant="outline" onClick={() => setPreview(true)}>Preview</Button>
            <form action={setQuestionPoolStatus}>
              <input type="hidden" name="pool_id" value={poolId} />
              <input type="hidden" name="status" value={status === "draft" ? "published" : "draft"} />
              <Button type="submit" variant={status === "draft" ? "primary" : "outline"}>
                {status === "draft" ? "Publish pool" : "Reopen as draft"}
              </Button>
            </form>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Curriculum distribution: {Object.entries(report.curriculum_counts ?? {}).map(([k, v]) => `${k} ${v}`).join(" · ") || "none selected"}.
          {" "}Only approved, published questions from this organization and class are eligible; prior-phase usage is excluded when alternatives exist.
        </p>
        {report.errors?.length > 0 && (
          <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
            {report.errors.map((e) => <p key={e}>{e}</p>)}
          </div>
        )}
        {report.insufficient && (
          <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Insufficient approved questions.</strong> {report.workflow ?? "Generate, review and approve more questions, then regenerate."}
            <div className="mt-2 flex flex-wrap gap-3">
              <Link className="underline" href={`/admin/questions/new?org=${orgId}&class=${classId}`}>Generate in Question Bank</Link>
              <Link className="underline" href="/admin/questions?status=pending_review">Review & approve</Link>
            </div>
          </div>
        )}
      </Card>

      {preview && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-semibold">Preview selected questions ({selected.length})</h3>
            <Button type="button" variant="ghost" onClick={() => setPreview(false)}>Close</Button>
          </div>
          <ol className="mt-3 max-h-96 space-y-2 overflow-y-auto text-sm">
            {selectedItems.map((q, i) => (
              <li key={q.question_id} className="rounded-lg border border-evergreen-900/15 bg-cream px-3 py-2">
                <strong>{i + 1}.</strong> {q.prompt}
                <span className="ml-2 text-xs text-ink-soft">{q.curriculum ?? "—"} · {q.difficulty ?? "—"} · {q.question_type ?? "—"}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <form action={saveQuestionPoolSelections} className="space-y-3">
        <input type="hidden" name="pool_id" value={poolId} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">Manual selection / review</h3>
          <Button type="submit" variant="outline" disabled={status !== "draft"}>Save selected questions</Button>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {eligible.map((q) => (
            <label key={q.question_id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${selected.includes(q.question_id) ? "border-evergreen-700 bg-evergreen-50" : "border-evergreen-900/15 bg-paper"}`}>
              <input
                type="checkbox"
                name="question_ids"
                value={q.question_id}
                checked={selected.includes(q.question_id)}
                onChange={() => toggle(q.question_id)}
                disabled={status !== "draft"}
                className="mt-1 h-4 w-4 accent-evergreen-700"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-evergreen-950">{q.prompt}</span>
                <span className="mt-1 block text-xs text-ink-soft">
                  {q.curriculum ?? "—"} · {q.topic ?? "—"} · {q.difficulty ?? "—"} · {q.question_type ?? "—"}
                  {q.used_before ? " · previously used" : ""}
                </span>
              </span>
            </label>
          ))}
        </div>
      </form>

      {status === "draft" && selectedIds.length > 0 && (
        <Card className="p-5">
          <h3 className="font-display text-lg font-semibold">Replace a selected question</h3>
          <p className="mt-1 text-sm text-ink-soft">The replacement must be approved, published, same class and curriculum-compatible.</p>
          <div className="mt-3 space-y-2">
            {selectedIds.map((oldId, i) => {
              const q = byId.get(oldId);
              return (
                <div key={oldId} className="flex flex-wrap items-center gap-2 rounded-lg border border-evergreen-900/15 px-3 py-2 text-sm">
                  <span className="min-w-[240px] flex-1"><strong>{i + 1}.</strong> {q?.prompt ?? oldId}</span>
                  {replacing === oldId ? (
                    <form action={replaceQuestionPoolItem} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="pool_id" value={poolId} />
                      <input type="hidden" name="old_question_id" value={oldId} />
                      <Select name="new_question_id" className="w-64" required>
                        <option value="">Choose approved replacement…</option>
                        {eligible.filter((x) => x.question_id !== oldId && !x.used_before).map((x) => (
                          <option key={x.question_id} value={x.question_id}>{x.prompt.slice(0, 90)}</option>
                        ))}
                      </Select>
                      <Button type="submit" variant="outline">Replace</Button>
                      <Button type="button" variant="ghost" onClick={() => setReplacing(null)}>Cancel</Button>
                    </form>
                  ) : (
                    <Button type="button" variant="ghost" onClick={() => setReplacing(oldId)}>Replace</Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
