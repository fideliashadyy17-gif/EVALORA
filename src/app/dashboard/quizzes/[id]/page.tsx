import { setQuizGradingSystem } from "@/app/dashboard/grading/actions";
import { Badge, Button, ButtonLink, Card, DataTable, Field, Input, PageTitle, Select } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { moduleEnabled } from "@/lib/modules";
import { canOperate } from "@/lib/operationalAccess";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuizBuilder } from "../QuizBuilder";
import { updateQuizAssignment, updateQuizSolutionsPolicy } from "../actions";
import { requestFormatter } from "@/lib/formattingRequest";

export const metadata: Metadata = { title: "Edit quiz" };
export const dynamic = "force-dynamic";

function extractAnswerSummary(type: string, config: Record<string, unknown> | null): string {
  if (!config) return "Manual / rubric marking";
  if (Array.isArray(config.options)) {
    const correct = (config.options as { id?: string; text?: string; label?: string; is_correct?: boolean }[])
      .filter((o) => o && (o.is_correct || (Array.isArray(config.correct) && config.correct.includes(o.id)) || config.correct === o.id))
      .map((o) => o.text || o.label || o.id)
      .filter(Boolean);
    if (correct.length) return correct.join(", ");
  }
  if (typeof config.correct === "boolean") return config.correct ? "True" : "False";
  if (typeof config.correct === "string" || typeof config.correct === "number") return String(config.correct);
  if (Array.isArray(config.accepted) && config.accepted.length) {
    return (config.accepted as unknown[]).map(String).join(" / ");
  }
  if (typeof config.answer === "string" || typeof config.answer === "number") return String(config.answer);
  if (type === "short_answer" || type === "essay" || type === "open_ended") return "Open response (teacher / rubric marked)";
  return "Configured in question bank";
}

export default async function EditQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ e?: string; ok?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  // Configured date, time and number profile (Platform Control Center →
  // Presentation), resolved once per request from the session's own organization.
  const { dateTime: fmtDateTime } = await requestFormatter(org?.id ?? null);
  const supabase = await createClient();

  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "quizzes", "/dashboard?e=module");
  const solutionsEnabled = moduleEnabled(entitlement.modules, "quiz_solutions");
  const assignmentEnabled = moduleEnabled(entitlement.modules, "quiz_assignment");
  const resultsEnabled = moduleEnabled(entitlement.modules, "quiz_results");

  const canEdit = await canOperate(ctx, org.id, "quizzes.edit", "quizzes");

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("*, quiz_questions(question_id, position)")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!quiz) notFound();

  const settings = (quiz.settings as Record<string, unknown>) ?? {};
  const ordered = [...((quiz.quiz_questions as { question_id: string; position: number }[]) ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((r) => r.question_id);

  const selectedIds = ordered;
  const [{ data: bank }, { data: orgClasses }, { data: sessions }, { data: gradingSystems }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, type, prompt, prompt_doc, explanation, config, points, status, topic")
      .eq("organization_id", org.id)
      .or(`status.eq.published,id.in.(${selectedIds.length ? selectedIds.join(",") : "00000000-0000-0000-0000-000000000000"})`)
      .limit(300),
    assignmentEnabled
      ? supabase.from("classes").select("id, name, grade_level").eq("organization_id", org.id).order("name").limit(200)
      : Promise.resolve({ data: [] as { id: string; name: string; grade_level: string | null }[] }),
    resultsEnabled
      ? supabase
          .from("quiz_sessions")
          .select("id, join_code, title, mode, status, created_at, ended_at, session_participants(id, score)")
          .eq("quiz_id", id)
          .eq("organization_id", org.id)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as unknown[] }),
    canEdit
      ? supabase
          .from("grading_systems")
          .select("id, name, curriculum, grade_label")
          .eq("organization_id", org.id)
          .eq("status", "active")
          .order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; curriculum: string; grade_label: string | null }[] }),
  ]);

  const byId = new Map((bank ?? []).map((q) => [q.id, q]));
  const attached = ordered.map((qid) => byId.get(qid)).filter(Boolean);

  const solutionReleaseMode =
    typeof settings.solution_release_mode === "string" ? settings.solution_release_mode : "never";
  const showExplanations = Boolean(settings.show_explanations);
  const solutionsReleasedAt =
    typeof settings.solutions_released_at === "string" ? settings.solutions_released_at : null;
  const assignmentDueAt =
    typeof settings.assignment_due_at === "string" ? settings.assignment_due_at : "";
  const assignmentNote =
    typeof settings.assignment_note === "string" ? settings.assignment_note : "";
  const assignedClassName = (orgClasses ?? []).find((c) => c.id === quiz.class_id)?.name ?? null;

  const sessionRows = (sessions ?? []) as unknown as {
    id: string;
    join_code: string;
    title: string | null;
    mode: string;
    status: string;
    created_at: string;
    ended_at: string | null;
    session_participants: { id: string; score: number | null }[];
  }[];

  const renderSolutionsAndAssignmentAndResults = () => (
    <div className="mb-6 space-y-6">
      {assignmentEnabled && (
        <Card className="p-5" data-testid="quiz-assignment-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Quiz Assignment &amp; Schedule</h2>
              <p className="text-xs text-ink-soft">
                Assign this quiz to a class cohort and optional target completion window inside this organization.
              </p>
            </div>
            <Badge tone={assignedClassName ? "green" : "gray"}>
              {assignedClassName ? `Assigned: ${assignedClassName}` : "Unassigned"}
            </Badge>
          </div>
          {canEdit ? (
            <form action={updateQuizAssignment} className="mt-4 grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="quiz_id" value={quiz.id} />
              <Field label="Target class">
                <Select name="class_id" defaultValue={String(quiz.class_id ?? "")}>
                  <option value="">All classes / open</option>
                  {(orgClasses ?? []).map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}{cls.grade_level ? ` (${cls.grade_level})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Due date (optional)">
                <Input
                  type="datetime-local"
                  name="assignment_due_at"
                  defaultValue={assignmentDueAt ? assignmentDueAt.slice(0, 16) : ""}
                />
              </Field>
              <Field label="Delivery note (optional)">
                <Input name="assignment_note" defaultValue={assignmentNote} placeholder="e.g. Complete in class" maxLength={500} />
              </Field>
              <div className="sm:col-span-3">
                <Button type="submit" variant="primary" className="text-xs">Save quiz assignment</Button>
              </div>
            </form>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">
              Class: <strong>{assignedClassName ?? "All classes"}</strong>
              {assignmentDueAt ? ` · Due ${fmtDateTime(assignmentDueAt)}` : ""}
              {assignmentNote ? ` · ${assignmentNote}` : ""}
            </p>
          )}
        </Card>
      )}

      {solutionsEnabled && (
        <Card className="p-5" data-testid="quiz-solutions-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Answers &amp; Solutions Release</h2>
              <p className="text-xs text-ink-soft">
                Control whether and when learners see correct answers and worked explanations after completing this quiz.
              </p>
            </div>
            <Badge tone={solutionReleaseMode === "never" ? "gray" : "green"}>
              {solutionReleaseMode === "never"
                ? "Solutions withheld"
                : solutionReleaseMode === "after_submission"
                  ? "Release after submission"
                  : solutionsReleasedAt
                    ? `Released ${fmtDateTime(solutionsReleasedAt)}`
                    : "Manual release (pending)"}
            </Badge>
          </div>
          {canEdit && (
            <form action={updateQuizSolutionsPolicy} className="mt-4 flex flex-wrap items-end gap-4">
              <input type="hidden" name="quiz_id" value={quiz.id} />
              <Field label="Solution release policy">
                <Select name="solution_release_mode" defaultValue={solutionReleaseMode}>
                  <option value="never">Withhold answer key &amp; solutions</option>
                  <option value="after_submission">Release automatically after submission</option>
                  <option value="manual">Manual teacher release</option>
                </Select>
              </Field>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-evergreen-900">
                <input
                  type="checkbox"
                  name="show_explanations"
                  defaultChecked={showExplanations}
                  className="h-4 w-4 accent-evergreen-700"
                />
                Include worked explanations
              </label>
              <Button type="submit" variant="primary" className="text-xs">Save solution settings</Button>
              {solutionReleaseMode === "manual" && (
                <Button type="submit" name="release_now" value="1" variant="gold" className="text-xs">
                  Release solutions now
                </Button>
              )}
            </form>
          )}
          {attached.length > 0 && (
            <div className="mt-4 border-t border-evergreen-900/10 pt-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-evergreen-700">
                Staff answer key &amp; worked solutions ({attached.length})
              </h3>
              <div className="space-y-2">
                {attached.map((q, idx) => (
                  <div key={q!.id} className="rounded-xl border border-evergreen-900/10 bg-cream/60 p-3 text-xs">
                    <p className="font-semibold text-evergreen-950">
                      Q{idx + 1} ({Number(q!.points)} pts): {q!.prompt.slice(0, 120)}
                      {q!.prompt.length > 120 ? "…" : ""}
                    </p>
                    <p className="mt-1 text-evergreen-900">
                      <strong>Key:</strong>{" "}
                      {extractAnswerSummary(q!.type, (q!.config as Record<string, unknown> | null) ?? null)}
                    </p>
                    {q!.explanation && (
                      <p className="mt-1 text-ink-soft">
                        <strong>Worked solution:</strong> {q!.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {resultsEnabled && (
        <Card className="p-5" data-testid="quiz-results-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-evergreen-950">
                Quiz Sessions &amp; Results ({sessionRows.length})
              </h2>
              <p className="text-xs text-ink-soft">
                Live and completed sessions run for this quiz inside your organization.
              </p>
            </div>
            <ButtonLink href="/dashboard/reports" variant="outline" className="text-xs">
              All reports →
            </ButtonLink>
          </div>
          {sessionRows.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              No live sessions have been run for this quiz yet. Launch a live session from Quizzes to record participant results.
            </p>
          ) : (
            <div className="mt-3">
              <DataTable head={["Started", "Join Code", "Mode", "Status", "Participants", "Avg Score", "Report"]} label="Quiz sessions and results">
                {sessionRows.map((s) => {
                  const parts = s.session_participants ?? [];
                  const scores = parts.map((p) => Number(p.score ?? 0));
                  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
                  return (
                    <tr key={s.id}>
                      <td className="text-xs text-ink-soft">{fmtDateTime(s.created_at)}</td>
                      <td className="font-mono text-xs font-semibold text-evergreen-950">{s.join_code}</td>
                      <td className="text-xs capitalize text-ink-soft">{s.mode}</td>
                      <td>
                        <Badge tone={s.status === "live" ? "green" : s.status === "ended" ? "gray" : "amber"}>
                          {s.status}
                        </Badge>
                      </td>
                      <td className="tabular-nums text-sm">{parts.length}</td>
                      <td className="tabular-nums text-sm">{avg}</td>
                      <td>
                        <Link
                          href={`/dashboard/reports/session/${s.id}`}
                          className="text-xs font-semibold text-evergreen-800 hover:underline"
                        >
                          View report →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            </div>
          )}
        </Card>
      )}
    </div>
  );

  if (!canEdit) {
    return (
      <>
        <PageTitle
          eyebrow="Assessment Authoring · Read-Only Quiz Overview"
          title={quiz.title}
          subtitle={quiz.description || "Read-only inspection of quiz structure and attached questions."}
          action={<ButtonLink href="/dashboard/quizzes" variant="outline">← All quizzes</ButtonLink>}
        />
        <Card className="mb-6 p-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge tone={quiz.status === "published" ? "green" : "gray"}>{quiz.status}</Badge>
            <span className="text-ink-soft">{attached.length} attached question(s)</span>
            <span className="text-ink-soft">·</span>
            <span className="text-ink-soft">Randomize questions: {settings.randomize_questions ? "Yes" : "No"}</span>
            <span className="text-ink-soft">·</span>
            <span className="text-ink-soft">Randomize options: {settings.randomize_options ? "Yes" : "No"}</span>
          </div>
        </Card>
        {renderSolutionsAndAssignmentAndResults()}
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Attached questions ({attached.length})</h2>
          <ol className="mt-4 space-y-3">
            {attached.map((q, idx) => (
              <li key={q!.id} className="rounded-xl border border-evergreen-900/10 bg-cream/40 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-evergreen-900">Q{idx + 1}</span>
                  <Badge tone="green">{q!.type.replace(/_/g, " ")}</Badge>
                  <Badge tone="gold">{Number(q!.points)} pts</Badge>
                  {q!.topic && <Badge tone="gray">{q!.topic}</Badge>}
                </div>
                <p className="mt-2 line-clamp-3 text-ink">{q!.prompt}</p>
              </li>
            ))}
          </ol>
        </Card>
      </>
    );
  }

  const selectedGradingSystemId = typeof settings.grading_system_id === "string" ? settings.grading_system_id : "";

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Quiz Editor"
        title="Edit quiz"
        subtitle={quiz.title}
        action={<ButtonLink href="/dashboard/quizzes" variant="outline">All quizzes</ButtonLink>}
      />

      {sp.ok === "grading" && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Grading configuration saved for this quiz.
        </p>
      )}
      {sp.ok === "solutions" && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Answers &amp; solutions release policy saved.
        </p>
      )}
      {sp.ok === "assignment" && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Quiz class assignment saved.
        </p>
      )}
      {sp.e && sp.e !== "noquestions" && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
          The requested quiz setting could not be saved. Verify your plan entitlements and permissions.
        </p>
      )}

      <Card className="mb-6 p-5" data-testid="quiz-grading-config">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Grading configuration</h2>
          <Badge tone={selectedGradingSystemId ? "green" : "gray"}>
            {selectedGradingSystemId ? "System attached" : "Organization default"}
          </Badge>
        </div>
        <form action={setQuizGradingSystem} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="quiz_id" value={quiz.id} />
          <Field label="Grading system for this quiz">
            <Select name="grading_system_id" defaultValue={selectedGradingSystemId} className="min-w-64">
              <option value="">None — raw marks / objective auto-marking only</option>
              {(gradingSystems ?? []).map((gs) => (
                <option key={gs.id} value={gs.id}>
                  {gs.name} ({gs.curriculum}{gs.grade_label ? ` · ${gs.grade_label}` : ""})
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="primary" className="text-xs">Save</Button>
          <ButtonLink href="/dashboard/grading" variant="outline" className="text-xs">Manage grading systems</ButtonLink>
        </form>
      </Card>

      {renderSolutionsAndAssignmentAndResults()}

      {sp.e === "noquestions" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Add at least one question before starting a live session.
        </p>
      )}
      <QuizBuilder
        bank={(bank ?? []).map((q) => ({ ...q, points: Number(q.points) }))}
        initial={{
          id: quiz.id,
          title: quiz.title,
          description: quiz.description ?? "",
          status: quiz.status,
          randomize_questions: Boolean(settings.randomize_questions),
          randomize_options: Boolean(settings.randomize_options),
          time_per_question_seconds: Number(settings.time_per_question_seconds ?? 30),
          question_ids: ordered,
        }}
      />
    </>
  );
}
