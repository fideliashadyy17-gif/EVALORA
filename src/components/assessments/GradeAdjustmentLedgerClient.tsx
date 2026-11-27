"use client";

/**
 * Unlimited Individual Grade Adjustments.
 *
 * Unlike the Institution batch studio (one positive adjustment per student per
 * category), this ledger accepts any number of repeated adjustments per student
 * and per criterion, positive or negative, each with its own reason and comment.
 * Nothing is overwritten: every entry keeps the value it started from and the
 * value it produced, and the effective score is recomputed from the ledger while
 * the original examination score stays exactly where it was.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, DataTable, Field, Input, Select, Textarea } from "@/components/ui";
import { useFormatting } from "@/components/formatting/FormattingProvider";
import { ADJUSTMENT_REASON_CODES } from "@/lib/gradeAdjustmentLedger";
import { ArrowLeft, History, Minus, Plus } from "lucide-react";

export interface LedgerHistoryGroup {
  categoryType: string;
  categoryKey: string;
  categoryLabel: string;
  categoryMaxScore: number;
  entryCount: number;
  netDelta: number;
  currentValue: number;
  entries: {
    id: string;
    sequenceNo: number;
    direction: string;
    pointsDelta: number;
    previousValue: number;
    newValue: number;
    reasonCode: string;
    reason: string;
    teacherComment: string | null;
    capped: boolean;
    capReason: string | null;
    actorEmail: string | null;
    actorRole: string;
    createdAt: string;
  }[];
}

export interface LedgerAttempt {
  attemptId: string;
  studentId: string | null;
  candidateId: string | null;
  candidateName: string;
  className: string | null;
  status: string;
  originalExamScore: number;
  examMaxScore: number;
  effectiveExamScore: number;
  categories: { type: string; key: string; label: string; maxScore: number; currentValue: number }[];
  history: LedgerHistoryGroup[];
}

export interface LedgerContext {
  exam: { id: string; title: string; resultsPublished: boolean; resultsValidated: boolean };
  attempts: LedgerAttempt[];
  canEdit: boolean;
  canPublish: boolean;
}

export function GradeAdjustmentLedgerClient({
  context,
  readOnly,
  criteria,
}: {
  context: LedgerContext;
  readOnly: boolean;
  criteria: { code: string; label: string; maxScore: number }[];
}) {
  // Configured formatting profile — the adjustment history must render its
  // timestamps the same way the rest of this organization's workspace does.
  const { dateTime: fmtDateTime } = useFormatting();
  const [attemptId, setAttemptId] = useState(context.attempts[0]?.attemptId ?? "");
  const [categoryType, setCategoryType] = useState<"overall" | "myp_criterion">("overall");
  const [categoryKey, setCategoryKey] = useState(criteria[0]?.code ?? "A");
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [pointsDelta, setPointsDelta] = useState("1");
  const [reasonCode, setReasonCode] = useState("teacher_review");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const attempt = useMemo(
    () => context.attempts.find((row) => row.attemptId === attemptId) ?? null,
    [context.attempts, attemptId],
  );

  const totalEntries = context.attempts.reduce(
    (sum, row) => sum + row.history.reduce((inner, group) => inner + group.entryCount, 0),
    0,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!attempt || !context.canEdit) return;
    setBusy(true);
    setMessage(null);
    try {
      const criterion = criteria.find((row) => row.code === categoryKey);
      const response = await fetch(`/api/dashboard/exams/${context.exam.id}/grade-adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: attempt.attemptId,
          categoryType,
          categoryKey: categoryType === "overall" ? "overall" : categoryKey,
          categoryLabel:
            categoryType === "overall" ? "Overall examination score" : `Criterion ${categoryKey}`,
          categoryMaxScore: categoryType === "overall" ? attempt.examMaxScore : (criterion?.maxScore ?? 0),
          direction,
          pointsDelta: Number(pointsDelta),
          reasonCode,
          reason,
          teacherComment: comment || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage({ tone: "error", text: payload.error ?? "Could not record the adjustment." });
        return;
      }
      setMessage({
        tone: "ok",
        text: `Adjustment #${payload.entry.sequenceNo} recorded: ${payload.entry.previousValue} → ${payload.entry.newValue}${
          payload.entry.capped ? " (capped at the permitted maximum)" : ""
        }. Effective score ${payload.entry.effectiveExamScore} / ${attempt.examMaxScore}.`,
      });
      setReason("");
      setComment("");
      window.location.reload();
    } catch {
      setMessage({ tone: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/dashboard/exams/${context.exam.id}/adjustments`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-evergreen-700 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Batch score adjustment studio
          </Link>
          <h2 className="mt-1 font-display text-xl font-semibold text-evergreen-950">
            Individual grade adjustments — {context.exam.title}
          </h2>
          <p className="text-xs text-ink-soft">
            Unlimited repeated adjustments per student and per criterion. {totalEntries} entr
            {totalEntries === 1 ? "y" : "ies"} recorded on this examination.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {context.exam.resultsPublished && <Badge tone="green">Results published</Badge>}
          {context.exam.resultsValidated && <Badge tone="gold">Results validated</Badge>}
        </div>
      </div>

      {readOnly && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Read-only supervision account: the adjustment history is visible but no adjustment can be recorded.
        </Card>
      )}

      {message && (
        <Card
          className={`p-4 text-sm ${
            message.tone === "ok"
              ? "border-evergreen-300 bg-evergreen-50 text-evergreen-900"
              : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          {message.text}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-5">
          <h3 className="font-display text-lg font-semibold text-evergreen-950">Record an adjustment</h3>
          <form className="mt-4 space-y-4" onSubmit={submit}>
            <Field label="Student">
              <Select value={attemptId} onChange={(event) => setAttemptId(event.target.value)} required>
                {context.attempts.map((row) => (
                  <option key={row.attemptId} value={row.attemptId}>
                    {row.candidateName}
                    {row.className ? ` · ${row.className}` : ""} — {row.effectiveExamScore}/{row.examMaxScore}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="What is adjusted">
                <Select
                  value={categoryType}
                  onChange={(event) => setCategoryType(event.target.value as "overall" | "myp_criterion")}
                >
                  <option value="overall">Overall examination score</option>
                  <option value="myp_criterion">MYP criterion</option>
                </Select>
              </Field>
              {categoryType === "myp_criterion" && (
                <Field label="Criterion">
                  <Select value={categoryKey} onChange={(event) => setCategoryKey(event.target.value)}>
                    {criteria.map((criterion) => (
                      <option key={criterion.code} value={criterion.code}>
                        Criterion {criterion.code} — {criterion.label} (max {criterion.maxScore})
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Direction">
                <Select
                  value={direction}
                  onChange={(event) => setDirection(event.target.value as "increase" | "decrease")}
                >
                  <option value="increase">Increase (+)</option>
                  <option value="decrease">Decrease (−)</option>
                </Select>
              </Field>
              <Field label="Points">
                <Input
                  type="number"
                  min={0.5}
                  max={1000}
                  step={0.5}
                  value={pointsDelta}
                  onChange={(event) => setPointsDelta(event.target.value)}
                  required
                />
              </Field>
              <Field label="Reason category" className="sm:col-span-2">
                <Select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
                  {ADJUSTMENT_REASON_CODES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Justification" hint="Recorded in the audit trail with your name and timestamp.">
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={3}
                maxLength={1000}
                placeholder="Homework series completed; 2 points restored on Criterion B."
                required
              />
            </Field>
            <Field label="Teacher comment (optional)">
              <Textarea rows={2} value={comment} onChange={(event) => setComment(event.target.value)} maxLength={4000} />
            </Field>

            <Button type="submit" disabled={!context.canEdit || busy || !attempt}>
              {direction === "increase" ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              Record adjustment
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h3 className="font-display text-lg font-semibold text-evergreen-950">Cohort ledger</h3>
          <p className="text-xs text-ink-soft">
            Original score is the preserved examination mark; effective score is the original plus the signed
            ledger. Neither figure is ever overwritten in place.
          </p>
          <div className="mt-4">
            <DataTable head={["Student", "Original", "Ledger", "Effective", "Entries"]}>
              {context.attempts.map((row) => {
                const entries = row.history.reduce((sum, group) => sum + group.entryCount, 0);
                const delta = row.effectiveExamScore - row.originalExamScore;
                return (
                  <tr key={row.attemptId}>
                    <td className="font-medium text-evergreen-950">
                      {row.candidateName}
                      {row.className ? <span className="block text-xs text-ink-soft">{row.className}</span> : null}
                    </td>
                    <td className="tabular-nums">
                      {row.originalExamScore} / {row.examMaxScore}
                    </td>
                    <td className={`tabular-nums ${delta > 0 ? "text-evergreen-700" : delta < 0 ? "text-red-700" : ""}`}>
                      {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                    </td>
                    <td className="tabular-nums font-semibold">{row.effectiveExamScore}</td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() => setOpenHistory(openHistory === row.attemptId ? null : row.attemptId)}
                      >
                        <History className="h-4 w-4" /> {entries}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </div>

          {openHistory && attempt && (
            <div className="mt-4 space-y-3">
              <h4 className="text-sm font-semibold text-evergreen-900">
                History — {attempt.candidateName}
              </h4>
              {attempt.history.length === 0 && (
                <p className="text-xs text-ink-soft">No adjustments recorded for this student yet.</p>
              )}
              {attempt.history.map((group) => (
                <div key={`${group.categoryType}:${group.categoryKey}`} className="rounded-xl border border-evergreen-900/15 bg-cream p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm text-evergreen-900">{group.categoryLabel}</strong>
                    <span className="text-xs tabular-nums text-ink-soft">
                      {group.entryCount} entr{group.entryCount === 1 ? "y" : "ies"} · net{" "}
                      {group.netDelta > 0 ? `+${group.netDelta.toFixed(2)}` : group.netDelta.toFixed(2)} · now{" "}
                      {group.currentValue}/{group.categoryMaxScore}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {group.entries.map((entry) => (
                      <li key={entry.id} className="rounded-lg bg-paper p-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-evergreen-900">
                            #{entry.sequenceNo} {entry.direction === "decrease" ? "−" : "+"}
                            {entry.pointsDelta.toFixed(2)}
                          </span>
                          <span className="tabular-nums text-ink-soft">
                            {entry.previousValue} → {entry.newValue}
                            {entry.capped ? ` (capped: ${entry.capReason})` : ""}
                          </span>
                        </div>
                        <p className="mt-1 text-ink-soft">
                          {entry.reasonCode.replace(/_/g, " ")} — {entry.reason}
                        </p>
                        <p className="text-[11px] text-ink-soft">
                          {entry.actorEmail ?? "system"} · {entry.actorRole} · {fmtDateTime(entry.createdAt)}
                        </p>
                        {entry.teacherComment && <p className="mt-1 italic text-ink-soft">“{entry.teacherComment}”</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
