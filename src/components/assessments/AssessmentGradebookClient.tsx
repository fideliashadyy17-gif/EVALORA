"use client";

/**
 * Assessment gradebook — class-wide score entry, individual re-entry,
 * exclusion, publication and the append-only audit trail.
 *
 * Saving is per-student: one row can be saved on its own, and a bulk save writes
 * exactly the rows submitted. No score is ever derived from another student's.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, DataTable, Input, Textarea } from "@/components/ui";
import { useFormatting } from "@/components/formatting/FormattingProvider";
import { ArrowLeft, History, Save, SlidersHorizontal } from "lucide-react";

export interface GradebookScore {
  id: string;
  studentId: string;
  studentName: string;
  attemptId: string | null;
  score: number;
  maxScore: number;
  percent: number;
  criterionCode: string | null;
  comment: string | null;
  status: string;
  updatedAt: string;
}

export interface GradebookEvent {
  id: string;
  eventType: string;
  studentId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  reason: string | null;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  createdAt: string;
}

export interface GradebookAssessment {
  id: string;
  title: string;
  categoryLabel: string;
  assessedOn: string;
  maxScore: number;
  scope: string;
  status: string;
  termLabel: string | null;
  framework: string;
  criterionCode: string | null;
  teacherComment: string | null;
  contributionMethod: string;
  contributionWeight: number;
  contributionPoints: number;
  contributesToResult: boolean;
  subject: { id: string; name: string } | null;
  klass: { id: string; name: string } | null;
  exam: { id: string; title: string; published: boolean } | null;
  academicYear: { id: string; name: string } | null;
  scores: GradebookScore[];
  roster: { studentId: string; name: string; hasScore: boolean }[];
  events: GradebookEvent[];
}

const EVENT_LABELS: Record<string, string> = {
  created: "Assessment created",
  updated: "Assessment updated",
  score_recorded: "Score recorded",
  score_modified: "Score modified",
  score_excluded: "Score excluded",
  score_included: "Score included",
  published: "Published to students",
  unpublished: "Publication withdrawn",
  archived: "Archived",
  adjustment_recorded: "Individual adjustment recorded",
  consolidation_created: "Consolidation created",
  consolidation_changed: "Consolidation rules changed",
  consolidation_published: "Consolidation published",
  consolidation_unpublished: "Consolidation withdrawn",
};

export function AssessmentGradebookClient({
  assessment,
  canEdit,
  canPublish,
  readOnly,
}: {
  assessment: GradebookAssessment;
  canEdit: boolean;
  canPublish: boolean;
  readOnly: boolean;
}) {
  const scoreByStudent = useMemo(() => {
    const map = new Map<string, GradebookScore>();
    for (const score of assessment.scores) map.set(score.studentId, score);
    return map;
  }, [assessment.scores]);

  // Formatting is the organization's configured profile, never a hand-written
  // Intl call: the audit trail must read the same way the rest of the platform
  // does for this school's date format, language and timezone.
  const { dateTime: fmtDateTime } = useFormatting();

  const rows = useMemo(() => {
    const known = assessment.roster.length > 0 ? assessment.roster : [];
    const merged = new Map<string, { studentId: string; name: string }>();
    for (const row of known) merged.set(row.studentId, { studentId: row.studentId, name: row.name });
    for (const score of assessment.scores) {
      if (!merged.has(score.studentId)) merged.set(score.studentId, { studentId: score.studentId, name: score.studentName });
    }
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [assessment.roster, assessment.scores]);

  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const score of assessment.scores) {
      if (score.status === "recorded") initial[score.studentId] = String(score.score);
    }
    return initial;
  });
  const [comments, setComments] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const score of assessment.scores) {
      if (score.comment) initial[score.studentId] = score.comment;
    }
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const dirty = rows
    .map((row) => row.studentId)
    .filter((studentId) => {
      const current = scoreByStudent.get(studentId);
      const draft = drafts[studentId] ?? "";
      if (draft === "" && !current) return false;
      if (current && current.status === "recorded" && String(current.score) === draft) return false;
      return true;
    });

  async function save(studentIds: string[]) {
    if (!canEdit || studentIds.length === 0) return;
    setBusy(true);
    setMessage(null);
    const scores = studentIds
      .filter((studentId) => (drafts[studentId] ?? "") !== "")
      .map((studentId) => ({
        studentId,
        score: Number(drafts[studentId]),
        comment: comments[studentId] || undefined,
      }));

    if (scores.length === 0) {
      setMessage({ tone: "error", text: "Enter at least one score before saving." });
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(`/api/dashboard/assessments/${assessment.id}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage({ tone: "error", text: payload.error ?? "Could not save the scores." });
        return;
      }
      const skipped = Array.isArray(payload.skipped) ? payload.skipped : [];
      setMessage({
        tone: skipped.length > 0 ? "error" : "ok",
        text:
          `${payload.saved} score${payload.saved === 1 ? "" : "s"} saved.` +
          (skipped.length > 0
            ? ` ${skipped.length} skipped: ${skipped.map((s: { error: string }) => s.error).join("; ")}`
            : ""),
      });
      window.location.reload();
    } catch {
      setMessage({ tone: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function exclude(studentId: string) {
    if (!canEdit) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/dashboard/assessments/${assessment.id}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: [{ studentId, excluded: true }] }),
      });
      const payload = await response.json();
      setMessage(
        response.ok
          ? { tone: "ok", text: "Score excluded from consolidation." }
          : { tone: "error", text: payload.error ?? "Could not exclude the score." },
      );
      if (response.ok) window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "published" | "draft" | "archived") {
    setBusy(true);
    try {
      const response = await fetch(`/api/dashboard/assessments/${assessment.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      setMessage(
        response.ok
          ? { tone: "ok", text: `Assessment ${status}.` }
          : { tone: "error", text: payload.error ?? "Could not change the publication state." },
      );
      if (response.ok) window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  const recordedCount = assessment.scores.filter((score) => score.status === "recorded").length;
  const averagePercent =
    recordedCount > 0
      ? assessment.scores
          .filter((score) => score.status === "recorded")
          .reduce((sum, score) => sum + score.percent, 0) / recordedCount
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/assessments"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-evergreen-700 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All assessments
          </Link>
          <h2 className="mt-1 font-display text-xl font-semibold text-evergreen-950">{assessment.title}</h2>
          <p className="text-xs text-ink-soft">
            {assessment.categoryLabel} · {assessment.assessedOn} · maximum {assessment.maxScore}
            {assessment.klass ? ` · ${assessment.klass.name}` : ""}
            {assessment.subject ? ` · ${assessment.subject.name}` : ""}
            {assessment.termLabel ? ` · ${assessment.termLabel}` : ""}
            {assessment.exam ? ` · linked to ${assessment.exam.title}` : " · not linked to an examination"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={assessment.status === "published" ? "green" : assessment.status === "archived" ? "gray" : "amber"}>
            {assessment.status}
          </Badge>
          {assessment.exam && (
            <Link
              href={`/dashboard/exams/${assessment.exam.id}/consolidation`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-evergreen-700/40 px-3 py-1.5 text-xs font-medium text-evergreen-800 hover:bg-evergreen-50"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Consolidation
            </Link>
          )}
          <Button variant="ghost" onClick={() => setShowHistory((value) => !value)}>
            <History className="h-4 w-4" /> Audit trail ({assessment.events.length})
          </Button>
        </div>
      </div>

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

      {readOnly && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Read-only supervision account: scores and publication cannot be changed.
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-soft">Scores recorded</p>
          <p className="mt-1 font-display text-2xl font-semibold text-evergreen-950">
            {recordedCount}
            <span className="text-sm font-normal text-ink-soft"> / {rows.length} students</span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-soft">Class average</p>
          <p className="mt-1 font-display text-2xl font-semibold text-evergreen-950">
            {averagePercent !== null ? `${averagePercent.toFixed(1)}%` : "—"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-soft">Contribution</p>
          <p className="mt-1 text-sm font-medium text-evergreen-950">
            {assessment.contributesToResult ? assessment.contributionMethod.replace("_", " ") : "Record only"}
          </p>
          {assessment.contributesToResult && (
            <p className="text-xs text-ink-soft">
              weight {assessment.contributionWeight}% · {assessment.contributionPoints} points
              {assessment.criterionCode ? ` · criterion ${assessment.criterionCode}` : ""}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-soft">Unsaved changes</p>
          <p className="mt-1 font-display text-2xl font-semibold text-evergreen-950">{dirty.length}</p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-evergreen-950">Gradebook</h3>
            <p className="text-xs text-ink-soft">
              Every student keeps an independent score. Save one row or the whole class — bulk saving is a
              convenience, never a requirement.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save(rows.map((row) => row.studentId))} disabled={!canEdit || busy || rows.length === 0}>
              <Save className="h-4 w-4" /> Save all
            </Button>
            {assessment.status !== "published" ? (
              <Button variant="outline" onClick={() => setStatus("published")} disabled={!canPublish || busy}>
                Publish to students
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setStatus("draft")} disabled={!canPublish || busy}>
                Withdraw publication
              </Button>
            )}
            <Button variant="ghost" onClick={() => setStatus("archived")} disabled={!canEdit || busy}>
              Archive
            </Button>
          </div>
        </div>
        {!canPublish && canEdit && (
          <p className="mt-2 text-xs text-amber-800">
            Publishing requires the Publish Results permission (results.publish); you can record and edit scores.
          </p>
        )}

        {rows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-evergreen-900/25 p-6 text-center text-sm text-ink-soft">
            This assessment has no class roster yet. Select a class on the assessment, or record an individual
            assessment for a specific student.
          </p>
        ) : (
          <div className="mt-4">
            <DataTable head={["Student", `Score / ${assessment.maxScore}`, "%", "Comment", "State", ""]}>
              {rows.map((row) => {
                const current = scoreByStudent.get(row.studentId);
                const draft = drafts[row.studentId] ?? "";
                const percent =
                  draft !== "" && assessment.maxScore > 0
                    ? Math.min(100, (Number(draft) / assessment.maxScore) * 100)
                    : null;
                return (
                  <tr key={row.studentId}>
                    <td className="font-medium text-evergreen-950">{row.name}</td>
                    <td>
                      <Input
                        type="number"
                        step={0.5}
                        min={0}
                        max={assessment.maxScore}
                        value={draft}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setDrafts({ ...drafts, [row.studentId]: event.target.value })
                        }
                        className="max-w-[8rem]"
                        aria-label={`Score for ${row.name}`}
                      />
                    </td>
                    <td className="tabular-nums text-xs">{percent !== null ? `${percent.toFixed(1)}%` : "—"}</td>
                    <td>
                      <Input
                        value={comments[row.studentId] ?? ""}
                        disabled={!canEdit}
                        onChange={(event) => setComments({ ...comments, [row.studentId]: event.target.value })}
                        placeholder="Feedback"
                        maxLength={500}
                        aria-label={`Comment for ${row.name}`}
                      />
                    </td>
                    <td>
                      {current ? (
                        <Badge tone={current.status === "recorded" ? "green" : "gray"}>{current.status}</Badge>
                      ) : (
                        <span className="text-xs text-ink-soft">not recorded</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => save([row.studentId])} disabled={!canEdit || busy}>
                          Save
                        </Button>
                        {current && current.status === "recorded" && (
                          <Button variant="ghost" onClick={() => exclude(row.studentId)} disabled={!canEdit || busy}>
                            Exclude
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </div>
        )}
      </Card>

      {assessment.teacherComment && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-evergreen-900">Teacher comments</h3>
          <Textarea readOnly rows={3} value={assessment.teacherComment} className="mt-2 bg-cream" />
        </Card>
      )}

      {showHistory && (
        <Card className="p-5">
          <h3 className="font-display text-lg font-semibold text-evergreen-950">Audit trail</h3>
          <p className="text-xs text-ink-soft">
            Append-only. Every creation, score entry, modification, exclusion and publication with its actor,
            previous state and new state.
          </p>
          <div className="mt-4 space-y-3">
            {assessment.events.length === 0 && <p className="text-sm text-ink-soft">No events recorded yet.</p>}
            {assessment.events.map((event) => (
              <div key={event.id} className="rounded-xl border border-evergreen-900/15 bg-cream p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-evergreen-900">{EVENT_LABELS[event.eventType] ?? event.eventType}</strong>
                  <span className="text-ink-soft">{fmtDateTime(event.createdAt)}</span>
                </div>
                <p className="mt-1 text-ink-soft">
                  {event.actorEmail ?? "system"}
                  {event.actorRole ? ` · ${event.actorRole}` : ""}
                  {event.reason ? ` · ${event.reason}` : ""}
                </p>
                {(event.previousState || event.newState) && (
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">
                    {event.previousState ? `from ${JSON.stringify(event.previousState)}` : ""}
                    {event.previousState && event.newState ? " → " : ""}
                    {event.newState ? `to ${JSON.stringify(event.newState)}` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
