"use client";

import { Button } from "@/components/ui";
import { AlertTriangle, Archive, Trash2, X } from "lucide-react";
import { useState } from "react";

interface DeleteExamDialogProps {
  examId: string;
  examTitle: string;
  accessCode: string;
  attemptCount: number;
  candidateCount?: number;
  action: (formData: FormData) => Promise<void> | void;
  triggerVariant?: "danger" | "ghost" | "outline";
  triggerLabel?: string;
  className?: string;
}

export function DeleteExamDialog({
  examId,
  examTitle,
  accessCode,
  attemptCount,
  candidateCount = 0,
  action,
  triggerVariant = "ghost",
  triggerLabel,
  className,
}: DeleteExamDialogProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const hasHistoricalData = attemptCount > 0;
  const isProtectedBenchmark =
    examId === "cd000000-0000-4000-8000-000000000002" ||
    examId === "ce000000-0000-4000-8000-000000000002";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isProtectedBenchmark) return;
    setBusy(true);
    try {
      const formData = new FormData(e.currentTarget);
      await action(formData);
    } catch {
      setBusy(false);
    }
  }

  const defaultTrigger = triggerLabel || (hasHistoricalData ? "Archive / Delete" : "Delete");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          (triggerVariant === "danger"
            ? "inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700"
            : triggerVariant === "outline"
            ? "inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
            : "inline-flex items-center gap-1 text-xs font-medium text-red-700 underline-offset-2 hover:underline")
        }
      >
        {hasHistoricalData ? <Archive className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
        {defaultTrigger}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-evergreen-900/20 bg-paper p-6 shadow-2xl sm:p-7">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-ink-soft hover:bg-cream"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-start gap-4">
              <div
                className={`rounded-xl p-3 shrink-0 ${
                  hasHistoricalData ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"
                }`}
              >
                {hasHistoricalData ? (
                  <Archive className="h-6 w-6" />
                ) : (
                  <AlertTriangle className="h-6 w-6" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-bold text-evergreen-950">
                  {isProtectedBenchmark
                    ? "Protected Benchmark Examination"
                    : hasHistoricalData
                    ? "Safely Archive Examination"
                    : "Permanently Delete Examination"}
                </h3>
                <p className="mt-1 text-xs text-ink-soft">
                  Exam: <strong className="text-evergreen-900">{examTitle}</strong> (Code:{" "}
                  <span className="font-mono font-bold text-evergreen-800">{accessCode}</span>)
                </p>
              </div>
            </div>

            {isProtectedBenchmark ? (
              <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
                <p className="font-semibold">Benchmark assessments cannot be deleted.</p>
                <p className="mt-1">
                  This examination is an official platform benchmark (Version C). Its criteria, questions,
                  and marking matrices are protected from deletion.
                </p>
              </div>
            ) : hasHistoricalData ? (
              <div className="mt-5 space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs leading-relaxed text-amber-950">
                  <p className="font-bold text-amber-900">
                    Student Academic Records Protection:
                  </p>
                  <p className="mt-1">
                    This examination contains <strong>{attemptCount} student attempt(s)</strong>
                    {candidateCount > 0 ? ` and ${candidateCount} registered candidates` : ""}.
                  </p>
                  <p className="mt-1.5">
                    To comply with academic retention rules and protect candidate marks, this exam will be{" "}
                    <strong>safely archived</strong> rather than permanently erased.
                  </p>
                  <ul className="mt-2 list-disc pl-4 space-y-1 text-amber-900/90">
                    <li>The examination will be immediately closed and removed from active lists.</li>
                    <li>Candidates will no longer be able to access or start this examination.</li>
                    <li>
                      <strong>All historical attempts, answers, grades, and published results are 100% preserved</strong>.
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-xs leading-relaxed text-red-950">
                  <p className="font-bold text-red-900">
                    Permanent Deletion:
                  </p>
                  <p className="mt-1">
                    This examination has <strong>zero student attempts or submissions</strong>.
                  </p>
                  <p className="mt-1.5">
                    Permanently deleting this exam will remove its schedule, configuration, and proctoring
                    associations. This action <strong>cannot be undone</strong>.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-evergreen-900/10 pt-4">
              <input type="hidden" name="id" value={examId} />
              <input type="hidden" name="exam_id" value={examId} />
              <Button
                type="button"
                variant="outline"
                className="text-xs"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>

              {!isProtectedBenchmark && (
                <Button
                  type="submit"
                  variant={hasHistoricalData ? "primary" : "danger"}
                  className="text-xs"
                  disabled={busy}
                >
                  {busy
                    ? hasHistoricalData
                      ? "Archiving exam…"
                      : "Deleting exam…"
                    : hasHistoricalData
                    ? "Safely Archive Examination"
                    : "Permanently Delete Exam"}
                </Button>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
