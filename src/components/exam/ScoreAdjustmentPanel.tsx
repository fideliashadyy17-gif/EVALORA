"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import {
  evaluateAttemptEligibility,
  type AdjustmentCategory,
  type AdjustmentScope,
  type ScoreAdjustmentPreview,
  type ScoreAdjustmentPreviewRow,
} from "@/lib/scoreAdjustments";
import type {
  ExamScoreAdjustmentContext,
  ScoreAdjustmentHistoryBatch,
} from "@/lib/scoreAdjustmentsServer";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  History,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";

interface ScoreAdjustmentPanelProps {
  initialContext: ExamScoreAdjustmentContext;
  apiEndpoint: string;
  canApply: boolean;
}

function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function rowBadgeTone(status: ScoreAdjustmentPreviewRow["status"]): "green" | "gold" | "amber" | "gray" | "red" {
  switch (status) {
    case "apply":
      return "green";
    case "capped":
      return "amber";
    case "already_adjusted":
    case "already_at_maximum":
      return "gold";
    case "pending_grading":
    case "not_submitted":
      return "red";
    default:
      return "gray";
  }
}

export function ScoreAdjustmentPanel({
  initialContext,
  apiEndpoint,
  canApply,
}: ScoreAdjustmentPanelProps) {
  const [context, setContext] = useState<ExamScoreAdjustmentContext>(initialContext);
  const [selectedCategoryValue, setSelectedCategoryValue] = useState<string>(() => {
    const first = initialContext.categories[0];
    return first ? `${first.categoryType}::${first.categoryKey}` : "";
  });
  const [pointsInput, setPointsInput] = useState<string>("1");
  const [scope, setScope] = useState<AdjustmentScope>("all_eligible");
  const [selectedAttemptIds, setSelectedAttemptIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState<string>("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [reason, setReason] = useState<string>("");

  const [preview, setPreview] = useState<ScoreAdjustmentPreview | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(
    () => new Set(initialContext.history.slice(0, 1).map((b) => b.id)),
  );

  const selectedCategory: AdjustmentCategory | null = useMemo(() => {
    const [type, ...rest] = selectedCategoryValue.split("::");
    const key = rest.join("::");
    return (
      context.categories.find((c) => c.categoryType === type && c.categoryKey === key) ?? null
    );
  }, [context.categories, selectedCategoryValue]);

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of context.attempts) {
      if (a.className) set.add(a.className);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [context.attempts]);

  const adjustedAttemptIdsForCategory = useMemo(() => {
    const set = new Set<string>();
    if (!selectedCategory) return set;
    for (const item of context.priorAdjustments) {
      if (
        item.categoryType === selectedCategory.categoryType &&
        item.categoryKey === selectedCategory.categoryKey
      ) {
        set.add(item.attemptId);
      }
    }
    return set;
  }, [context.priorAdjustments, selectedCategory]);

  const filteredAttempts = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return context.attempts.filter((a) => {
      if (classFilter !== "all" && a.className !== classFilter) return false;
      if (q && !a.candidateName.toLowerCase().includes(q) && !(a.className ?? "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [context.attempts, classFilter, studentSearch]);

  const eligibleAttemptsCount = useMemo(
    () =>
      context.attempts.filter(
        (a) =>
          evaluateAttemptEligibility(a).eligible &&
          !adjustedAttemptIdsForCategory.has(a.attemptId),
      ).length,
    [context.attempts, adjustedAttemptIdsForCategory],
  );

  const clearPreviewState = () => {
    setPreview(null);
    setIdempotencyKey(null);
    setErrorMessage(null);
  };

  const toggleAttempt = (attemptId: string) => {
    clearPreviewState();
    setSelectedAttemptIds((prev) => {
      const next = new Set(prev);
      if (next.has(attemptId)) next.delete(attemptId);
      else next.add(attemptId);
      return next;
    });
  };

  const selectAllFilteredEligible = () => {
    clearPreviewState();
    setSelectedAttemptIds((prev) => {
      const next = new Set(prev);
      for (const a of filteredAttempts) {
        if (
          evaluateAttemptEligibility(a).eligible &&
          !adjustedAttemptIdsForCategory.has(a.attemptId)
        ) {
          next.add(a.attemptId);
        }
      }
      return next;
    });
  };

  const clearSelectedAttempts = () => {
    clearPreviewState();
    setSelectedAttemptIds(new Set());
  };

  async function handlePreview() {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!selectedCategory) {
      setErrorMessage("Select a grading criterion or category first.");
      return;
    }
    const pts = Number(pointsInput);
    if (!Number.isFinite(pts) || pts <= 0) {
      setErrorMessage("Enter a positive number of points to add.");
      return;
    }
    if (scope === "selected" && selectedAttemptIds.size === 0) {
      setErrorMessage("Select at least one eligible student before previewing.");
      return;
    }
    if (reason.trim().length < 3) {
      setErrorMessage("Enter an adjustment reason / justification (at least 3 characters) before previewing.");
      return;
    }

    setLoadingPreview(true);
    try {
      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          categoryType: selectedCategory.categoryType,
          categoryKey: selectedCategory.categoryKey,
          pointsRequested: pts,
          scope,
          attemptIds: scope === "selected" ? [...selectedAttemptIds] : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreview(null);
        setIdempotencyKey(null);
        setErrorMessage(data?.error ?? "Unable to preview score adjustment.");
        return;
      }
      setPreview(data.preview as ScoreAdjustmentPreview);
      setIdempotencyKey(String(data.idempotencyKey ?? ""));
    } catch {
      setErrorMessage("Network error while calculating preview. Please try again.");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleConfirmApply() {
    if (!preview || !idempotencyKey || !selectedCategory || applying) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (reason.trim().length < 3) {
      setErrorMessage("An audit reason (at least 3 characters) is required.");
      return;
    }

    setApplying(true);
    try {
      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          categoryType: selectedCategory.categoryType,
          categoryKey: selectedCategory.categoryKey,
          pointsRequested: preview.pointsRequested,
          scope: preview.scope,
          attemptIds: preview.scope === "selected" ? [...selectedAttemptIds] : undefined,
          reason: reason.trim(),
          idempotencyKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data?.error ?? "Unable to apply score adjustment.");
        return;
      }

      if (data.context) {
        const nextCtx = data.context as ExamScoreAdjustmentContext;
        setContext(nextCtx);
        if (nextCtx.history[0]?.id) {
          setExpandedBatchIds((prev) => new Set([nextCtx.history[0].id, ...prev]));
        }
      }
      setPreview(null);
      setIdempotencyKey(null);
      setSelectedAttemptIds(new Set());
      setReason("");
      setSuccessMessage(
        `Adjustment applied to ${data.studentsAffected} student${data.studentsAffected === 1 ? "" : "s"} (+${fmtScore(Number(data.totalPointsAdded ?? 0))} total points${Number(data.cappedStudents ?? 0) > 0 ? `, ${data.cappedStudents} capped at maximum` : ""}). Original answers remain untouched, and results remain unvalidated and unpublished.`,
      );
    } catch {
      setErrorMessage("Network error while applying score adjustment. Please check history before retrying.");
    } finally {
      setApplying(false);
    }
  }

  const toggleBatchExpand = (batchId: string) => {
    setExpandedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const canOperateNow = context.plan.eligible && context.lifecycle.allowed && canApply;

  return (
    <div className="space-y-6">
      {/* Status Summary Bar */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={context.plan.eligible ? "green" : "gray"}>
                {context.plan.eligible ? "Institution Plan" : `Plan: ${context.plan.name}`}
              </Badge>
              <Badge tone={context.exam.resultsPublished ? "red" : context.exam.resultsValidated ? "amber" : "green"}>
                {context.exam.resultsPublished
                  ? "Results Published (Locked)"
                  : context.exam.resultsValidated
                    ? "Results Validated (Locked)"
                    : "Pre-Validation (Open for Adjustments)"}
              </Badge>
              <Badge tone="gold">
                {context.history.length} adjustment{context.history.length === 1 ? "" : "s"} recorded
              </Badge>
            </div>
            <h2 className="mt-2 font-display text-xl font-bold text-evergreen-950">
              {context.exam.title}
            </h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              {context.exam.organizationName} · {context.attempts.length} candidate attempt
              {context.attempts.length === 1 ? "" : "s"} · {context.categories.length} adjustable
              categor{context.categories.length === 1 ? "y" : "ies"}
            </p>
          </div>
          <div className="rounded-xl border border-evergreen-900/15 bg-cream px-4 py-2.5 text-xs text-ink-soft">
            <p className="font-semibold text-evergreen-950">Scoring Integrity Safeguards</p>
            <p className="mt-0.5">
              Capped at criterion &amp; exam max · No duplicate category adjustments · Silent to students
            </p>
          </div>
        </div>
      </Card>

      {/* Plan Gate Notice */}
      {!context.plan.eligible && (
        <Card className="border-amber-300 bg-amber-50/70 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
            <div>
              <h3 className="text-sm font-bold text-amber-950">
                Institution Plan Required
              </h3>
              <p className="mt-1 text-sm text-amber-900">
                Controlled Score Adjustment is exclusively available to organizations subscribed to
                an active <strong>Institution</strong> plan.{" "}
                <strong>{context.exam.organizationName}</strong> is currently on{" "}
                <strong>{context.plan.name}</strong> ({context.plan.status}).
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Lifecycle Lock Notice */}
      {context.plan.eligible && !context.lifecycle.allowed && (
        <Card className="border-red-300 bg-red-50/70 p-5">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-red-800" />
            <div>
              <h3 className="text-sm font-bold text-red-950">
                Score Adjustments Locked
              </h3>
              <p className="mt-1 text-sm text-red-900">
                {context.lifecycle.reason}
              </p>
              <p className="mt-1 text-xs text-red-800">
                Existing score adjustment audit records remain permanently visible below.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Read-Only Notice */}
      {context.plan.eligible && context.lifecycle.allowed && !canApply && (
        <Card className="border-evergreen-900/15 bg-cream p-5">
          <div className="flex items-start gap-3">
            <Eye className="mt-0.5 h-5 w-5 shrink-0 text-evergreen-800" />
            <div>
              <h3 className="text-sm font-bold text-evergreen-950">
                Read-Only Supervision Access
              </h3>
              <p className="mt-1 text-sm text-ink-soft">
                Your role can review immutable score adjustment records for this examination, but
                applying adjustments requires examination grading permissions (<code>grading.edit</code>).
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Alerts */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-evergreen-300 bg-evergreen-50 px-4 py-3 text-sm text-evergreen-950"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-evergreen-700" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Interactive Configuration & Preview Studio */}
      {canOperateNow && (
        <Card className="p-6">
          <div className="flex items-center gap-2 border-b border-evergreen-900/10 pb-4">
            <SlidersHorizontal className="h-5 w-5 text-evergreen-700" />
            <div>
              <h3 className="font-display text-lg font-bold text-evergreen-950">
                Configure Score Adjustment
              </h3>
              <p className="text-xs text-ink-soft">
                Step 1: Select category, points, target students, and reason → Step 2: Review per-student impact preview → Step 3: Confirm &amp; apply.
              </p>
            </div>
          </div>

          {context.categories.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">
              No graded question paper categories were found for this examination.
            </p>
          ) : (
            <div className="mt-5 space-y-5">
              {/* Row 1: Category + Points */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-evergreen-950">
                    Grading Criterion / Category
                  </label>
                  <Select
                    value={selectedCategoryValue}
                    onChange={(e) => {
                      setSelectedCategoryValue(e.target.value);
                      clearPreviewState();
                    }}
                  >
                    {context.categories.map((cat) => (
                      <option
                        key={`${cat.categoryType}::${cat.categoryKey}`}
                        value={`${cat.categoryType}::${cat.categoryKey}`}
                      >
                        {cat.categoryLabel} (Max: {fmtScore(cat.maxScore)} pts · {cat.questionCount}{" "}
                        question{cat.questionCount === 1 ? "" : "s"})
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-evergreen-950">
                    Additional Points (+)
                  </label>
                  <Input
                    type="number"
                    min="0.25"
                    max="1000"
                    step="0.25"
                    value={pointsInput}
                    onChange={(e) => {
                      setPointsInput(e.target.value);
                      clearPreviewState();
                    }}
                    placeholder="e.g. 1 or 2"
                  />
                  {selectedCategory && (
                    <p className="mt-1 text-xs text-ink-soft">
                      Capped automatically at {fmtScore(selectedCategory.maxScore)} pts category max
                    </p>
                  )}
                </div>
              </div>

              {/* Row 2: Target Scope */}
              <div>
                <span className="mb-1.5 block text-sm font-medium text-evergreen-950">
                  Target Students
                </span>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScope("all_eligible");
                      clearPreviewState();
                    }}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                      scope === "all_eligible"
                        ? "border-evergreen-700 bg-evergreen-50/70 ring-1 ring-evergreen-700"
                        : "border-evergreen-900/20 bg-white hover:bg-cream"
                    }`}
                  >
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-evergreen-700" />
                    <div>
                      <p className="text-sm font-semibold text-evergreen-950">
                        All eligible students ({eligibleAttemptsCount})
                      </p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Applies to all graded candidates who have not already received an adjustment on this category.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setScope("selected");
                      clearPreviewState();
                    }}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                      scope === "selected"
                        ? "border-evergreen-700 bg-evergreen-50/70 ring-1 ring-evergreen-700"
                        : "border-evergreen-900/20 bg-white hover:bg-cream"
                    }`}
                  >
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-evergreen-700" />
                    <div>
                      <p className="text-sm font-semibold text-evergreen-950">
                        Selected students ({selectedAttemptIds.size} selected)
                      </p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Choose specific eligible candidates by name or class before previewing.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Selected Student Picker */}
              {scope === "selected" && (
                <div className="rounded-xl border border-evergreen-900/15 bg-cream/60 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
                      <Input
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Search student name or class…"
                        className="pl-9"
                      />
                    </div>
                    {classOptions.length > 0 && (
                      <Select
                        value={classFilter}
                        onChange={(e) => setClassFilter(e.target.value)}
                        className="w-auto min-w-[160px]"
                      >
                        <option value="all">All classes</option>
                        {classOptions.map((cls) => (
                          <option key={cls} value={cls}>
                            {cls}
                          </option>
                        ))}
                      </Select>
                    )}
                    <Button type="button" variant="outline" onClick={selectAllFilteredEligible}>
                      Select eligible
                    </Button>
                    <Button type="button" variant="ghost" onClick={clearSelectedAttempts}>
                      Clear
                    </Button>
                  </div>

                  <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-evergreen-900/15 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-cream text-ink-soft">
                        <tr>
                          <th className="w-9 px-3 py-2">Pick</th>
                          <th className="px-3 py-2">Student</th>
                          <th className="px-3 py-2">Class</th>
                          <th className="px-3 py-2 text-right">Current Total</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-evergreen-900/10">
                        {filteredAttempts.map((a) => {
                          const elig = evaluateAttemptEligibility(a);
                          const already = adjustedAttemptIdsForCategory.has(a.attemptId);
                          const disabled = !elig.eligible || already;
                          const checked = selectedAttemptIds.has(a.attemptId);
                          return (
                            <tr
                              key={a.attemptId}
                              className={disabled ? "bg-stone-50 text-ink-soft" : "hover:bg-evergreen-50/40"}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  disabled={disabled}
                                  checked={checked}
                                  onChange={() => toggleAttempt(a.attemptId)}
                                  className="h-4 w-4 rounded border-evergreen-900/40 text-evergreen-700 focus:ring-evergreen-600"
                                />
                              </td>
                              <td className="px-3 py-2 font-medium text-evergreen-950">
                                {a.candidateName}
                              </td>
                              <td className="px-3 py-2 text-ink-soft">{a.className ?? "—"}</td>
                              <td className="px-3 py-2 text-right font-mono">
                                {a.score !== null ? fmtScore(a.score) : "—"} /{" "}
                                {a.maxScore !== null ? fmtScore(a.maxScore) : "—"}
                              </td>
                              <td className="px-3 py-2">
                                {already ? (
                                  <Badge tone="gold">Already adjusted</Badge>
                                ) : elig.eligible ? (
                                  <Badge tone="green">Eligible</Badge>
                                ) : (
                                  <Badge tone="red">
                                    {elig.reason === "not_submitted" ? "In progress" : "Pending grading"}
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {filteredAttempts.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-ink-soft">
                              No candidate attempts match your filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Row 3: Audit Reason */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-evergreen-950">
                  Adjustment Reason / Audit Justification <span className="text-red-700">*</span>
                </label>
                <Textarea
                  rows={2}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Document the academic rationale for this score adjustment (stored permanently in the staff-only audit trail)…"
                />
              </div>

              {/* Action Button: Preview */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs text-ink-soft">
                  Previewing performs zero database writes and verifies exact score caps per student.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  disabled={loadingPreview || applying}
                  onClick={handlePreview}
                >
                  <Eye className="h-4 w-4" />
                  {loadingPreview ? "Calculating preview…" : "Preview Score Adjustment"}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Live Preview & Confirmation Panel */}
          {preview && (
            <div className="mt-6 space-y-4 rounded-2xl border-2 border-evergreen-700/30 bg-evergreen-50/30 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-display text-base font-bold text-evergreen-950">
                    Step 2 — Adjustment Preview: {preview.category.categoryLabel} (+{fmtScore(preview.pointsRequested)} requested)
                  </h4>
                  <p className="text-xs text-ink-soft">
                    Review every affected student&apos;s original and adjusted scores before confirming.
                  </p>
                </div>
                <Badge tone={preview.canConfirm ? "green" : "red"}>
                  {preview.canConfirm
                    ? `${preview.applicableCount} student${preview.applicableCount === 1 ? "" : "s"} ready`
                    : "Nothing to apply"}
                </Badge>
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-evergreen-900/15 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                    Students Affected
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold text-evergreen-950">
                    {preview.applicableCount}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-300/70 bg-amber-50/50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-900">
                    Capped at Max
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold text-amber-950">
                    {preview.cappedCount}
                  </p>
                </div>
                <div className="rounded-xl border border-evergreen-900/15 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                    Skipped
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold text-evergreen-950">
                    {preview.atMaxSkippedCount + preview.alreadyAdjustedCount + preview.ineligibleCount}
                  </p>
                </div>
                <div className="rounded-xl border border-evergreen-900/15 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                    Total Points Added
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold text-evergreen-800">
                    +{fmtScore(preview.totalPointsToAdd)}
                  </p>
                </div>
              </div>

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950">
                  <p className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-4 w-4 text-amber-700" />
                    Preview Warnings &amp; Score Cap Checks
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5">
                    {preview.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview Table */}
              <div className="max-h-96 overflow-auto rounded-xl border border-evergreen-900/15 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-cream text-ink-soft">
                    <tr>
                      <th className="px-3 py-2.5">Student</th>
                      <th className="px-3 py-2.5 text-right">Category Before</th>
                      <th className="px-3 py-2.5 text-right">Category After</th>
                      <th className="px-3 py-2.5 text-right">Exam Before</th>
                      <th className="px-3 py-2.5 text-right">Exam After</th>
                      <th className="px-3 py-2.5 text-right">Applied</th>
                      <th className="px-3 py-2.5">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-evergreen-900/10">
                    {preview.rows
                      .filter((r) => r.status !== "not_selected")
                      .map((row) => (
                        <tr key={row.attemptId} className={row.applicable ? "" : "bg-stone-50/80 text-ink-soft"}>
                          <td className="px-3 py-2 font-medium text-evergreen-950">
                            {row.candidateName}
                            {row.className && (
                              <span className="ml-1.5 text-[11px] font-normal text-ink-soft">
                                ({row.className})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {fmtScore(row.originalCategoryScore)} / {fmtScore(row.categoryMaxScore)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-evergreen-900">
                            {fmtScore(row.adjustedCategoryScore)} / {fmtScore(row.categoryMaxScore)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {fmtScore(row.originalExamScore)} / {fmtScore(row.examMaxScore)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-evergreen-900">
                            {fmtScore(row.adjustedExamScore)} / {fmtScore(row.examMaxScore)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-evergreen-800">
                            {row.pointsApplied > 0 ? `+${fmtScore(row.pointsApplied)}` : "0"}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={rowBadgeTone(row.status)}>{row.statusLabel}</Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Confirmation Safeguard & Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-evergreen-900/15 bg-white px-4 py-3">
                <p className="text-xs text-ink-soft">
                  Confirming records an <strong>immutable audit entry</strong>, updates student totals
                  silently (zero bonus labels shown to students), preserves all original answers, and
                  keeps results <strong>unvalidated and unpublished</strong>.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={applying}
                    onClick={clearPreviewState}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="gold"
                    disabled={!preview.canConfirm || applying}
                    onClick={handleConfirmApply}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {applying ? "Applying adjustment…" : "Confirm & Apply Adjustment"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Immutable Audit History */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 border-b border-evergreen-900/10 pb-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-evergreen-700" />
            <div>
              <h3 className="font-display text-lg font-bold text-evergreen-950">
                Immutable Score Adjustment Audit Trail
              </h3>
              <p className="text-xs text-ink-soft">
                Staff-only append-only ledger. Never visible to students or candidates.
              </p>
            </div>
          </div>
          <Badge tone="gray">
            {context.history.length} batch{context.history.length === 1 ? "" : "es"}
          </Badge>
        </div>

        {context.history.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">
            No score adjustments have been applied to this examination yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {context.history.map((batch: ScoreAdjustmentHistoryBatch) => {
              const expanded = expandedBatchIds.has(batch.id);
              return (
                <div
                  key={batch.id}
                  className="overflow-hidden rounded-xl border border-evergreen-900/15 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => toggleBatchExpand(batch.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-cream/60"
                  >
                    <div className="flex items-start gap-2.5">
                      {expanded ? (
                        <ChevronDown className="mt-0.5 h-4 w-4 text-evergreen-700" />
                      ) : (
                        <ChevronRight className="mt-0.5 h-4 w-4 text-evergreen-700" />
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-evergreen-950">
                            {batch.categoryLabel}
                          </span>
                          <Badge tone="green">+{fmtScore(batch.pointsRequested)} requested</Badge>
                          <Badge tone="gray">
                            {batch.studentsAffectedCount} student
                            {batch.studentsAffectedCount === 1 ? "" : "s"}
                          </Badge>
                          {batch.cappedStudentsCount > 0 && (
                            <Badge tone="amber">{batch.cappedStudentsCount} capped</Badge>
                          )}
                          <Badge tone="gold">
                            {batch.actorConsole === "super_admin" ? "Super Admin Console" : "Workspace"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-ink-soft">
                          By <strong className="text-evergreen-950">{batch.actorEmail ?? "Staff"}</strong> ({batch.actorRole}) · {fmtDate(batch.createdAt)} · Scope:{" "}
                          {batch.scope === "all_eligible" ? "All eligible students" : "Selected students"}
                        </p>
                        <p className="mt-1 text-xs text-ink">
                          <span className="font-semibold text-ink-soft">Reason:</span> {batch.reason}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-bold text-evergreen-800">
                      +{fmtScore(batch.totalPointsAdded)} pts total
                    </span>
                  </button>

                  {expanded && batch.items.length > 0 && (
                    <div className="border-t border-evergreen-900/10 bg-cream/40 px-4 py-3">
                      <div className="overflow-x-auto rounded-lg border border-evergreen-900/10 bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-cream text-ink-soft">
                            <tr>
                              <th className="px-3 py-2">Candidate</th>
                              <th className="px-3 py-2 text-right">Category Score</th>
                              <th className="px-3 py-2 text-right">Exam Total</th>
                              <th className="px-3 py-2 text-right">Applied</th>
                              <th className="px-3 py-2">Cap</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-evergreen-900/10">
                            {batch.items.map((item) => (
                              <tr key={item.id}>
                                <td className="px-3 py-2 font-medium text-evergreen-950">
                                  {item.candidateName}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {fmtScore(item.originalCategoryScore)} →{" "}
                                  <strong className="text-evergreen-900">
                                    {fmtScore(item.adjustedCategoryScore)}
                                  </strong>{" "}
                                  / {fmtScore(item.categoryMaxScore)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {fmtScore(item.originalExamScore)} →{" "}
                                  <strong className="text-evergreen-900">
                                    {fmtScore(item.adjustedExamScore)}
                                  </strong>{" "}
                                  / {fmtScore(item.examMaxScore)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-evergreen-800">
                                  +{fmtScore(item.pointsApplied)}
                                </td>
                                <td className="px-3 py-2">
                                  {item.capped ? (
                                    <Badge tone="amber">
                                      Capped ({item.capReason ?? "max"})
                                    </Badge>
                                  ) : (
                                    <span className="text-ink-soft">Full</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
