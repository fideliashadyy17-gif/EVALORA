"use client";

/**
 * Assessment Contributions & Grade Consolidation — workspace client.
 *
 * Renders the assessment register and the two creation workflows (class-wide
 * and individual). Every action posts to `/api/dashboard/assessments`, which
 * re-runs the full authorization, tenant and validation checks server-side:
 * what is hidden here is a convenience, never the security boundary.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { CONTRIBUTION_METHODS } from "@/lib/assessmentContributions";
import { ADJUSTMENT_REASON_CODES } from "@/lib/gradeAdjustmentLedger";
import { ClipboardList, FileCheck2, Plus, SlidersHorizontal, UserPlus } from "lucide-react";

export interface WorkspaceCategory {
  key: string;
  label: string;
  builtin: boolean;
  description?: string;
}

export interface WorkspaceAssessment {
  id: string;
  title: string;
  categoryKey: string;
  categoryLabel: string;
  assessedOn: string;
  maxScore: number;
  scope: string;
  status: string;
  subjectId: string | null;
  subjectName: string | null;
  classId: string | null;
  className: string | null;
  examId: string | null;
  examTitle: string | null;
  termLabel: string | null;
  contributionMethod: string;
  contributesToResult: boolean;
  recordedCount: number;
  averagePercent: number | null;
  createdAt: string;
}

export interface WorkspacePayload {
  organizationId: string;
  organizationName: string;
  categories: WorkspaceCategory[];
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string; code: string | null }[];
  academicYears: { id: string; name: string; isCurrent: boolean }[];
  exams: { id: string; title: string; status: string; published: boolean }[];
  contributions: WorkspaceAssessment[];
  authorization: { canEdit: boolean; canPublish: boolean; readOnly: boolean; role: string };
}

const STATUS_TONE: Record<string, "green" | "amber" | "gray"> = {
  draft: "amber",
  published: "green",
  archived: "gray",
};

export function AssessmentWorkspaceClient({
  workspace,
  students,
}: {
  workspace: WorkspacePayload;
  students: { id: string; name: string; className: string | null }[];
}) {
  const [mode, setMode] = useState<"class" | "individual">("class");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ field: string; message: string }[]>([]);
  const [showCategoryForm, setShowCategoryForm] = useState(false);

  const [form, setForm] = useState({
    title: "",
    categoryKey: "homework",
    assessedOn: new Date().toISOString().slice(0, 10),
    maxScore: "20",
    description: "",
    subjectId: "",
    classId: "",
    academicYearId: workspace.academicYears.find((y) => y.isCurrent)?.id ?? "",
    termLabel: "",
    examId: "",
    framework: "general",
    criterionCode: "",
    teacherComment: "",
    contributesToResult: false,
    contributionMethod: "record_only",
    contributionWeight: "10",
    contributionPoints: "5",
    // Individual workflow
    studentId: "",
    individualScore: "",
  });
  const [categoryForm, setCategoryForm] = useState({ key: "", label: "", description: "" });

  const canEdit = workspace.authorization.canEdit && !workspace.authorization.readOnly;
  const customCategories = workspace.categories.filter((c) => !c.builtin);

  const individualStudent = useMemo(
    () => students.find((s) => s.id === form.studentId) ?? null,
    [students, form.studentId],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setMessage(null);
    setFieldErrors([]);

    const body: Record<string, unknown> = {
      action: "assessment",
      title: form.title,
      categoryKey: form.categoryKey,
      assessedOn: form.assessedOn,
      maxScore: form.maxScore,
      description: form.description || undefined,
      subjectId: form.subjectId || undefined,
      academicYearId: form.academicYearId || undefined,
      termLabel: form.termLabel || undefined,
      examId: form.examId || undefined,
      framework: form.framework,
      criterionCode: form.framework === "myp" ? form.criterionCode || undefined : undefined,
      teacherComment: form.teacherComment || undefined,
      contributesToResult: form.contributesToResult,
      contributionMethod: form.contributesToResult ? form.contributionMethod : "record_only",
      contributionWeight: Number(form.contributionWeight || 0),
      contributionPoints: Number(form.contributionPoints || 0),
    };

    if (mode === "class") {
      body.scope = "class";
      body.classId = form.classId || undefined;
      body.source = "manual";
    } else {
      body.scope = "individual";
      body.classId = form.classId || undefined;
      body.source = "individual";
      if (form.studentId && form.individualScore !== "") {
        body.scores = [{ studentId: form.studentId, score: Number(form.individualScore) }];
      }
    }

    try {
      const response = await fetch("/api/dashboard/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage({ tone: "error", text: payload.error ?? "Could not create the assessment." });
        setFieldErrors(Array.isArray(payload.fieldErrors) ? payload.fieldErrors : []);
        return;
      }
      setMessage({ tone: "ok", text: "Assessment created. Enter scores in the gradebook." });
      window.location.assign(`/dashboard/assessments/${payload.id}`);
    } catch {
      setMessage({ tone: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function createCategory(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/dashboard/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "category", ...categoryForm }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage({ tone: "error", text: payload.error ?? "Could not create the category." });
        return;
      }
      setMessage({ tone: "ok", text: `Category "${categoryForm.label}" added.` });
      setCategoryForm({ key: "", label: "", description: "" });
      setShowCategoryForm(false);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <Card
          className={`p-4 text-sm ${
            message.tone === "ok"
              ? "border-evergreen-300 bg-evergreen-50 text-evergreen-900"
              : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          <p className="font-medium">{message.text}</p>
          {fieldErrors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {fieldErrors.map((error) => (
                <li key={`${error.field}:${error.message}`}>
                  <strong>{error.field}</strong> — {error.message}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {workspace.authorization.readOnly && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Institutional supervision accounts are read-only. You can review every assessment, score and
          consolidation, but you cannot create, modify or publish anything.
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* ── Creation workflow ─────────────────────────────────────────── */}
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-evergreen-950">New assessment</h2>
              <p className="mt-1 text-xs text-ink-soft">
                An examination is never required — record the assessment first and link it later if you
                want it consolidated into a result.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "class" ? "primary" : "outline"}
                onClick={() => setMode("class")}
              >
                <ClipboardList className="h-4 w-4" /> Class-wide
              </Button>
              <Button
                type="button"
                variant={mode === "individual" ? "primary" : "outline"}
                onClick={() => setMode("individual")}
              >
                <UserPlus className="h-4 w-4" /> Individual
              </Button>
            </div>
          </div>

          <form className="mt-5 space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Assessment title">
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Algebra homework — week 6"
                  maxLength={160}
                  required
                />
              </Field>
              <Field label="Assessment category">
                <Select value={form.categoryKey} onChange={(e) => setForm({ ...form, categoryKey: e.target.value })}>
                  {workspace.categories.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.label}
                      {category.builtin ? "" : " (custom)"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={form.assessedOn}
                  onChange={(e) => setForm({ ...form, assessedOn: e.target.value })}
                  required
                />
              </Field>
              <Field label="Maximum marks">
                <Input
                  type="number"
                  min={0.5}
                  max={1000}
                  step={0.5}
                  value={form.maxScore}
                  onChange={(e) => setForm({ ...form, maxScore: e.target.value })}
                  required
                />
              </Field>
              <Field label="Subject">
                <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                  <option value="">— Not specified —</option>
                  {workspace.subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Class / grade">
                <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                  <option value="">— Not specified —</option>
                  {workspace.classes.map((klass) => (
                    <option key={klass.id} value={klass.id}>
                      {klass.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Academic year / period">
                <Select
                  value={form.academicYearId}
                  onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}
                >
                  <option value="">— Not specified —</option>
                  {workspace.academicYears.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Term label" hint="Free text, e.g. “First Term 2025–2026”.">
                <Input
                  value={form.termLabel}
                  onChange={(e) => setForm({ ...form, termLabel: e.target.value })}
                  maxLength={120}
                  placeholder="First Term"
                />
              </Field>
              <Field label="Linked examination (optional)">
                <Select value={form.examId} onChange={(e) => setForm({ ...form, examId: e.target.value })}>
                  <option value="">— Record independently —</option>
                  {workspace.exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title}
                      {exam.published ? " (published)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Framework">
                <Select value={form.framework} onChange={(e) => setForm({ ...form, framework: e.target.value })}>
                  <option value="general">General (no criteria)</option>
                  <option value="myp">MYP (Criteria A–D)</option>
                  <option value="ap">AP</option>
                  <option value="british">British</option>
                  <option value="cambridge">Cambridge</option>
                  <option value="beninese">Beninese</option>
                  <option value="custom">Custom</option>
                </Select>
              </Field>
              {form.framework === "myp" && (
                <Field label="Criterion" hint="Only for criterion-based frameworks.">
                  <Select
                    value={form.criterionCode}
                    onChange={(e) => setForm({ ...form, criterionCode: e.target.value })}
                  >
                    <option value="">— No criterion —</option>
                    {["A", "B", "C", "D"].map((code) => (
                      <option key={code} value={code}>
                        Criterion {code}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>

            <Field label="Description">
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={4000}
              />
            </Field>

            {mode === "individual" && (
              <div className="grid gap-4 rounded-xl border border-evergreen-900/15 bg-cream p-4 sm:grid-cols-2">
                <Field label="Student">
                  <Select
                    value={form.studentId}
                    onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                    required
                  >
                    <option value="">— Select a student —</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                        {student.className ? ` · ${student.className}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Score" hint={`Out of ${form.maxScore || "the maximum above"}.`}>
                  <Input
                    type="number"
                    step={0.5}
                    min={0}
                    value={form.individualScore}
                    onChange={(e) => setForm({ ...form, individualScore: e.target.value })}
                  />
                </Field>
                <p className="text-xs text-ink-soft sm:col-span-2">
                  An individual assessment never changes another student&apos;s score.
                  {individualStudent ? ` Recording for ${individualStudent.name}.` : ""}
                </p>
              </div>
            )}

            <Field label="Teacher comments">
              <Textarea
                rows={2}
                value={form.teacherComment}
                onChange={(e) => setForm({ ...form, teacherComment: e.target.value })}
                maxLength={4000}
              />
            </Field>

            <div className="rounded-xl border border-evergreen-900/15 bg-cream p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={form.contributesToResult}
                  onChange={(e) => setForm({ ...form, contributesToResult: e.target.checked })}
                />
                <span>
                  <span className="block text-sm font-medium text-evergreen-900">
                    This assessment contributes to a consolidated result
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    Off = Method E (record only): the assessment is stored and audited but never changes an
                    examination result.
                  </span>
                </span>
              </label>

              {form.contributesToResult && (
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Field label="Contribution method" className="sm:col-span-3">
                    <Select
                      value={form.contributionMethod}
                      onChange={(e) => setForm({ ...form, contributionMethod: e.target.value })}
                    >
                      {CONTRIBUTION_METHODS.filter((method) => method.value !== "record_only").map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Weight %">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={form.contributionWeight}
                      onChange={(e) => setForm({ ...form, contributionWeight: e.target.value })}
                    />
                  </Field>
                  <Field label="Point value">
                    <Input
                      type="number"
                      min={0}
                      max={1000}
                      step={0.5}
                      value={form.contributionPoints}
                      onChange={(e) => setForm({ ...form, contributionPoints: e.target.value })}
                    />
                  </Field>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!canEdit || busy}>
                <Plus className="h-4 w-4" /> Create assessment
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCategoryForm((value) => !value)}
                disabled={!canEdit}
              >
                Define a custom category
              </Button>
            </div>
          </form>

          {showCategoryForm && (
            <form className="mt-4 space-y-3 rounded-xl border border-evergreen-900/15 bg-cream p-4" onSubmit={createCategory}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Key" hint="lowercase, 2–40 characters">
                  <Input
                    value={categoryForm.key}
                    onChange={(e) => setCategoryForm({ ...categoryForm, key: e.target.value })}
                    placeholder="field_trip"
                    required
                  />
                </Field>
                <Field label="Label">
                  <Input
                    value={categoryForm.label}
                    onChange={(e) => setCategoryForm({ ...categoryForm, label: e.target.value })}
                    placeholder="Field trip report"
                    required
                  />
                </Field>
                <Field label="Description">
                  <Input
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  />
                </Field>
              </div>
              <Button type="submit" variant="outline" disabled={busy}>
                Add category
              </Button>
              {customCategories.length > 0 && (
                <p className="text-xs text-ink-soft">
                  Existing custom categories: {customCategories.map((c) => c.label).join(", ")}
                </p>
              )}
            </form>
          )}
        </Card>

        {/* ── Register ──────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Assessment register</h2>
              <div className="flex flex-wrap gap-2 text-xs">
                <Link
                  href="/dashboard/score-adjustments"
                  className="inline-flex items-center gap-1 rounded-lg border border-evergreen-700/40 px-3 py-1.5 text-evergreen-800 hover:bg-evergreen-50"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Batch score adjustment
                </Link>
                <Link
                  href="/dashboard/results"
                  className="inline-flex items-center gap-1 rounded-lg border border-evergreen-700/40 px-3 py-1.5 text-evergreen-800 hover:bg-evergreen-50"
                >
                  <FileCheck2 className="h-3.5 w-3.5" /> Results management
                </Link>
              </div>
            </div>

            {workspace.contributions.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No assessments recorded yet"
                  body="Create a class-wide or individual assessment to start recording homework, class tests, projects and other classroom work."
                />
              </div>
            ) : (
              <div className="mt-4">
                <DataTable head={["Assessment", "Category", "Class / subject", "Scores", "Status"]}>
                  {workspace.contributions.map((assessment) => (
                    <tr key={assessment.id}>
                      <td>
                        <Link
                          href={`/dashboard/assessments/${assessment.id}`}
                          className="font-medium text-evergreen-800 underline-offset-2 hover:underline"
                        >
                          {assessment.title}
                        </Link>
                        <p className="text-xs text-ink-soft">
                          {assessment.assessedOn} · max {assessment.maxScore}
                          {assessment.examTitle ? ` · ${assessment.examTitle}` : ""}
                        </p>
                      </td>
                      <td className="text-xs">{assessment.categoryLabel}</td>
                      <td className="text-xs">
                        {assessment.className ?? "—"}
                        <br />
                        <span className="text-ink-soft">{assessment.subjectName ?? "no subject"}</span>
                      </td>
                      <td className="text-xs tabular-nums">
                        {assessment.recordedCount} recorded
                        {assessment.averagePercent !== null ? (
                          <span className="block text-ink-soft">avg {assessment.averagePercent.toFixed(1)}%</span>
                        ) : null}
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[assessment.status] ?? "gray"}>{assessment.status}</Badge>
                        <p className="mt-1 text-[11px] text-ink-soft">
                          {assessment.contributesToResult ? assessment.contributionMethod : "record only"}
                        </p>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            )}
          </Card>

          <Card className="p-5 text-xs text-ink-soft">
            <p className="font-semibold text-evergreen-900">Adjustment reasons available to teachers</p>
            <p className="mt-1">
              {ADJUSTMENT_REASON_CODES.map((reason) => reason.label).join(" · ")}
            </p>
            <p className="mt-2">
              Individual adjustments are unlimited: the same student and criterion can be adjusted as many
              times as legitimately necessary, and every entry keeps its original value, adjusted value,
              reason and actor.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
