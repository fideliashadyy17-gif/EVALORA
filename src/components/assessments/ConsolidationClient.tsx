"use client";

/**
 * Grade Consolidation Engine — configuration, preview, comparison and
 * publication.
 *
 * The preview shown here is produced by the SAME pure engine that stores the
 * snapshot, so the numbers reviewed are the numbers written. Publication is
 * blocked while any included student's calculation is invalid, and an
 * already-published examination result is never changed silently: the audit
 * trail records that the consolidated result replaced a published one.
 */

import { useMemo, useState } from "react";
import { Badge, Button, Card, DataTable, Field, Input, Select } from "@/components/ui";
import { useFormatting } from "@/components/formatting/FormattingProvider";
import { CONTRIBUTION_METHODS, type ContributionMethod } from "@/lib/assessmentContributions";
import { Eye, Save, Send, Undo2 } from "lucide-react";

export interface ConsolidationAssessment {
  id: string;
  title: string;
  categoryLabel: string;
  maxScore: number;
  weight: number;
  pointValue: number;
  criterionCode: string | null;
  included: boolean;
  recordedCount: number;
}

export interface ConsolidationAttempt {
  attemptId: string;
  candidateName: string;
  originalExamScore: number;
  examMaxScore: number;
  adjustmentTotal: number;
}

export interface ConsolidationProfile {
  id: string;
  name: string;
  method: string;
  examWeight: number;
  scope: string;
  status: string;
  inclusions: { contributionId: string; included: boolean; weight: number; pointValue: number }[];
  createdAt: string;
}

export interface ConsolidationRow {
  attemptId: string;
  candidateName: string;
  included: boolean;
  originalExamScore: number;
  examMaxScore: number;
  adjustmentTotal: number;
  contributionTotal: number;
  consolidatedScore: number;
  consolidatedMax: number;
  percent: number | null;
  errors: string[];
  warnings: string[];
  valid: boolean;
  contributions: {
    id: string;
    title: string;
    categoryLabel: string;
    score: number | null;
    maxScore: number;
    points: number;
    missing: boolean;
    included: boolean;
  }[];
}

export interface ConsolidationPreview {
  method: string;
  examWeight: number;
  errors: string[];
  warnings: string[];
  includedCount: number;
  validRowCount: number;
  invalidRowCount: number;
  averageOriginalPercent: number | null;
  averageConsolidatedPercent: number | null;
  canPublish: boolean;
  rows: ConsolidationRow[];
}

export function ConsolidationClient({
  examId,
  examTitle,
  resultsPublished,
  assessments,
  attempts,
  profiles,
  canEdit,
  canPublish,
  readOnly,
}: {
  examId: string;
  examTitle: string;
  resultsPublished: boolean;
  assessments: ConsolidationAssessment[];
  attempts: ConsolidationAttempt[];
  profiles: ConsolidationProfile[];
  canEdit: boolean;
  canPublish: boolean;
  readOnly: boolean;
}) {
  const [method, setMethod] = useState<ContributionMethod>(
    (profiles[0]?.method as ContributionMethod) ?? "weighted",
  );
  const [examWeight, setExamWeight] = useState(String(profiles[0]?.examWeight ?? 80));
  const [allowMissing, setAllowMissing] = useState(false);
  const [profileName, setProfileName] = useState(profiles[0]?.name ?? "Grade consolidation");
  const [scope, setScope] = useState(profiles[0]?.scope ?? "class");
  const [selectedAttempts, setSelectedAttempts] = useState<string[]>([]);
  const [inclusions, setInclusions] = useState<Record<string, { included: boolean; weight: string; pointValue: string }>>(
    () => {
      const initial: Record<string, { included: boolean; weight: string; pointValue: string }> = {};
      const saved = profiles[0]?.inclusions ?? [];
      for (const assessment of assessments) {
        const savedInclusion = saved.find((row) => row.contributionId === assessment.id);
        initial[assessment.id] = {
          included: savedInclusion ? savedInclusion.included : assessment.included,
          weight: String(savedInclusion?.weight ?? assessment.weight ?? 10),
          pointValue: String(savedInclusion?.pointValue ?? assessment.pointValue ?? 5),
        };
      }
      return initial;
    },
  );
  const [preview, setPreview] = useState<ConsolidationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Configured formatting profile — the consolidation sheet must show the same
  // date format the rest of this organization's workspace shows.
  const { date: fmtDate } = useFormatting();

  const weightTotal = useMemo(() => {
    const assessmentWeights = Object.values(inclusions)
      .filter((row) => row.included)
      .reduce((sum, row) => sum + (Number(row.weight) || 0), 0);
    return (Number(examWeight) || 0) + assessmentWeights;
  }, [inclusions, examWeight]);

  const body = () => ({
    method,
    examWeight: Number(examWeight),
    allowMissingScores: allowMissing,
    scope,
    scopeAttemptIds: scope === "class" ? undefined : selectedAttempts,
    name: profileName,
    profileId: profiles[0]?.id ?? null,
    inclusions: Object.entries(inclusions).map(([contributionId, row]) => ({
      contributionId,
      included: row.included,
      weight: Number(row.weight) || 0,
      pointValue: Number(row.pointValue) || 0,
    })),
  });

  async function run(action: "preview" | "save" | "publish" | "unpublish") {
    setBusy(true);
    setMessage(null);
    try {
      const payload =
        action === "unpublish" ? { action, profileId: profiles[0]?.id } : { action, ...body() };
      const response = await fetch(`/api/dashboard/exams/${examId}/consolidation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ tone: "error", text: data.error ?? "The consolidation could not be processed." });
        return;
      }
      if (action === "preview") {
        setPreview(data.result as ConsolidationPreview);
        setMessage({ tone: "ok", text: "Preview calculated. Nothing was written." });
        return;
      }
      if (action === "save") {
        setPreview(data.result as ConsolidationPreview);
        setMessage({ tone: "ok", text: "Consolidation rules and per-student snapshot saved as a draft." });
        window.location.reload();
        return;
      }
      if (action === "publish") {
        setMessage({ tone: "ok", text: `${data.published} consolidated result(s) published.` });
        window.location.reload();
        return;
      }
      setMessage({ tone: "ok", text: "Consolidated results withdrawn from the candidate paper." });
      window.location.reload();
    } catch {
      setMessage({ tone: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-evergreen-950">
          Grade consolidation — {examTitle}
        </h2>
        <p className="text-xs text-ink-soft">
          {attempts.length} attempts · {assessments.length} contributing assessments
          {resultsPublished ? " · examination results already published" : ""}
        </p>
      </div>

      {readOnly && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Read-only supervision account: consolidation rules cannot be changed or published.
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

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Consolidation method" className="sm:col-span-2">
            <Select value={method} onChange={(event) => setMethod(event.target.value as ContributionMethod)}>
              {CONTRIBUTION_METHODS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>
          {method === "weighted" && (
            <Field label="Examination weight %" hint={`Total must be 100% (currently ${weightTotal.toFixed(1)}%).`}>
              <Input type="number" min={0} max={100} value={examWeight} onChange={(event) => setExamWeight(event.target.value)} />
            </Field>
          )}
          <Field label="Scope">
            <Select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="class">Whole class</option>
              <option value="group">Selected students</option>
              <option value="individual">Single student</option>
            </Select>
          </Field>
        </div>

        <p className="mt-2 text-xs text-ink-soft">
          {CONTRIBUTION_METHODS.find((entry) => entry.value === method)?.description}
        </p>

        <label className="mt-3 flex items-start gap-2 text-xs text-evergreen-900">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={allowMissing}
            onChange={(event) => setAllowMissing(event.target.checked)}
          />
          Skip students with a missing score (with a warning) instead of blocking the calculation. Off by
          default: a missing score is an error, never a silent zero.
        </label>

        {scope !== "class" && (
          <div className="mt-4 rounded-xl border border-evergreen-900/15 bg-cream p-3">
            <p className="text-xs font-semibold text-evergreen-900">Select students</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {attempts.map((attempt) => (
                <label key={attempt.attemptId} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={selectedAttempts.includes(attempt.attemptId)}
                    onChange={(event) =>
                      setSelectedAttempts(
                        event.target.checked
                          ? [...selectedAttempts, attempt.attemptId]
                          : selectedAttempts.filter((id) => id !== attempt.attemptId),
                      )
                    }
                  />
                  {attempt.candidateName}
                </label>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="font-display text-lg font-semibold text-evergreen-950">Included assessments</h3>
        <p className="text-xs text-ink-soft">
          Weights apply to Method B; point values apply to Methods A, C and D. Excluding an assessment removes
          it from every calculation without deleting the record or its scores.
        </p>
        {assessments.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-evergreen-900/25 p-5 text-center text-sm text-ink-soft">
            No assessments are switched on for contribution yet. Turn on “contributes to a consolidated result”
            on an assessment first.
          </p>
        ) : (
          <div className="mt-4">
            <DataTable head={["Include", "Assessment", "Category", "Max", "Weight %", "Points", "Scores"]}>
              {assessments.map((assessment) => {
                const row = inclusions[assessment.id];
                return (
                  <tr key={assessment.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={row?.included ?? false}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setInclusions({
                            ...inclusions,
                            [assessment.id]: { ...row, included: event.target.checked },
                          })
                        }
                        aria-label={`Include ${assessment.title}`}
                      />
                    </td>
                    <td className="font-medium text-evergreen-950">
                      {assessment.title}
                      {assessment.criterionCode ? (
                        <span className="ml-2 text-xs text-ink-soft">criterion {assessment.criterionCode}</span>
                      ) : null}
                    </td>
                    <td className="text-xs">{assessment.categoryLabel}</td>
                    <td className="tabular-nums text-xs">{assessment.maxScore}</td>
                    <td>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="max-w-[6rem]"
                        value={row?.weight ?? "0"}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setInclusions({
                            ...inclusions,
                            [assessment.id]: { ...row, weight: event.target.value },
                          })
                        }
                        aria-label={`Weight for ${assessment.title}`}
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        min={0}
                        max={1000}
                        step={0.5}
                        className="max-w-[6rem]"
                        value={row?.pointValue ?? "0"}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setInclusions({
                            ...inclusions,
                            [assessment.id]: { ...row, pointValue: event.target.value },
                          })
                        }
                        aria-label={`Point value for ${assessment.title}`}
                      />
                    </td>
                    <td className="text-xs tabular-nums">{assessment.recordedCount} recorded</td>
                  </tr>
                );
              })}
            </DataTable>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Field label="Profile name" className="min-w-[14rem]">
            <Input value={profileName} onChange={(event) => setProfileName(event.target.value)} disabled={!canEdit} />
          </Field>
          <Button variant="outline" onClick={() => run("preview")} disabled={busy}>
            <Eye className="h-4 w-4" /> Preview calculation
          </Button>
          <Button onClick={() => run("save")} disabled={!canEdit || busy}>
            <Save className="h-4 w-4" /> Save rules
          </Button>
          <Button variant="gold" onClick={() => run("publish")} disabled={!canPublish || busy}>
            <Send className="h-4 w-4" /> Publish consolidated results
          </Button>
          {profiles[0]?.status === "published" && (
            <Button variant="ghost" onClick={() => run("unpublish")} disabled={!canPublish || busy}>
              <Undo2 className="h-4 w-4" /> Withdraw
            </Button>
          )}
        </div>
        {method === "weighted" && Math.abs(weightTotal - 100) > 0.01 && (
          <p className="mt-2 text-xs font-medium text-red-700">
            Weights must total 100%. Examination {examWeight}% + assessments{" "}
            {(weightTotal - (Number(examWeight) || 0)).toFixed(1)}% = {weightTotal.toFixed(1)}%.
          </p>
        )}
      </Card>

      {preview && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-lg font-semibold text-evergreen-950">
              Original vs consolidated ({preview.method.replace("_", " ")})
            </h3>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="gray">students {preview.includedCount}</Badge>
              <Badge tone="green">valid {preview.validRowCount}</Badge>
              <Badge tone={preview.invalidRowCount > 0 ? "red" : "gray"}>invalid {preview.invalidRowCount}</Badge>
              {preview.averageOriginalPercent !== null && (
                <Badge tone="gray">class avg {preview.averageOriginalPercent.toFixed(1)}% → {(preview.averageConsolidatedPercent ?? 0).toFixed(1)}%</Badge>
              )}
            </div>
          </div>

          {preview.errors.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              {preview.errors.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          )}
          {preview.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {preview.warnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <DataTable head={["Student", "Original", "Adjustments", "Contributions", "Consolidated", "Change", "State"]}>
              {preview.rows.map((row) => {
                const originalPercent = row.examMaxScore > 0 ? (row.originalExamScore / row.examMaxScore) * 100 : 0;
                const delta = (row.percent ?? 0) - originalPercent;
                return (
                  <tr key={row.attemptId}>
                    <td className="font-medium text-evergreen-950">{row.candidateName}</td>
                    <td className="tabular-nums">
                      {row.originalExamScore} / {row.examMaxScore}
                      <span className="block text-[11px] text-ink-soft">{originalPercent.toFixed(1)}%</span>
                    </td>
                    <td className="tabular-nums text-xs">
                      {row.adjustmentTotal > 0 ? `+${row.adjustmentTotal.toFixed(2)}` : row.adjustmentTotal.toFixed(2)}
                    </td>
                    <td className="tabular-nums text-xs">
                      {row.contributionTotal.toFixed(2)}
                      <span className="block text-[11px] text-ink-soft">
                        {row.contributions
                          .filter((contribution) => contribution.included)
                          .map((contribution) => `${contribution.title}: ${contribution.missing ? "missing" : contribution.score}`)
                          .join(" · ")}
                      </span>
                    </td>
                    <td className="tabular-nums font-semibold">
                      {row.consolidatedScore} / {row.consolidatedMax}
                      <span className="block text-[11px] text-ink-soft">
                        {row.percent !== null ? `${row.percent.toFixed(1)}%` : "—"}
                      </span>
                    </td>
                    <td className={`tabular-nums text-xs ${delta > 0 ? "text-evergreen-700" : delta < 0 ? "text-red-700" : ""}`}>
                      {delta > 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
                    </td>
                    <td>
                      {row.errors.length > 0 ? (
                        <span className="text-xs text-red-700">{row.errors[0]}</span>
                      ) : row.warnings.length > 0 ? (
                        <span className="text-xs text-amber-700">{row.warnings[0]}</span>
                      ) : (
                        <Badge tone="green">valid</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </div>

          {!preview.canPublish && (
            <p className="mt-3 text-xs font-medium text-red-700">
              Publication is blocked until every included student&apos;s calculation is valid.
            </p>
          )}
          {resultsPublished && preview.canPublish && (
            <p className="mt-3 text-xs font-medium text-amber-800">
              This examination&apos;s results are already published. Publishing the consolidation replaces what
              candidates see and is recorded in the audit trail.
            </p>
          )}
        </Card>
      )}

      {profiles.length > 0 && (
        <Card className="p-5">
          <h3 className="font-display text-lg font-semibold text-evergreen-950">Saved consolidation profiles</h3>
          <ul className="mt-3 space-y-2 text-xs">
            {profiles.map((profile) => (
              <li key={profile.id} className="rounded-xl border border-evergreen-900/15 bg-cream p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-evergreen-900">{profile.name}</strong>
                  <Badge tone={profile.status === "published" ? "green" : "amber"}>{profile.status}</Badge>
                </div>
                <p className="mt-1 text-ink-soft">
                  {profile.method.replace("_", " ")} · examination weight {profile.examWeight}% ·{" "}
                  {profile.inclusions.filter((row) => row.included).length} contributing assessment(s) ·{" "}
                  {fmtDate(profile.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
