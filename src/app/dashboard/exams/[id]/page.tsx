import { RichContent } from "@/components/RichContent";
import { describeIncidentType } from "@/lib/integrity";
import { ExaminationAccessCard } from "@/components/ExaminationAccessCard";
import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { activeOrg, can, CREATOR_ROLES, MARKER_ROLES, PROCTOR_ROLES, requireUser } from "@/lib/auth";
import { GRADING_METHOD_LABEL, MODERATION_LABEL, rubricForQuestion, type ExamRubricLink, type RubricCriterion } from "@/lib/grading";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { describeAiMarking } from "@/lib/ai-marking";
import {
  addCandidate, addCandidatesBulk, decideAiProposal, deleteExam, markAnswer, markWithRubric, moderateAnswer,
  proposeAiMarks, publishResults, removeCandidate, retryExamGrading, reviewIncident, saveExamPublicationSettings, setExamStatus, updateWorkspaceExamAccess,
} from "../actions";

export const metadata: Metadata = { title: "Examination" };
export const dynamic = "force-dynamic";

export default async function ExamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string; ok?: string; mark_error?: string; mark_ok?: string; publish_error?: string; publish_ok?: string; access_ok?: string; access_error?: string; room_error?: string; candidate_error?: string; candidate_ok?: string; incident_error?: string; incident_ok?: string; moderation_ok?: string; moderation_error?: string; ai_ok?: string; ai_error?: string; publication_ok?: string; publication_error?: string; grading_ok?: string; grading_error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "evalora-six.vercel.app";
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("*, quizzes(title)")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) notFound();

  const settings = (exam.settings ?? {}) as Record<string, unknown>;
  const accessLink = String(
    (exam as Record<string, unknown>).access_link
      ?? `/exam/join/${String((exam as Record<string, unknown>).invite_token ?? "")}`,
  );
  const shareUrl = `${origin}${accessLink}`;

  const [{ data: candidates }, { data: attempts }, { data: incidents }, { data: paperQuestions }] = await Promise.all([
    supabase.from("exam_candidates").select("*").eq("exam_id", id).order("full_name"),
    supabase
      .from("exam_attempts")
      .select("*, exam_candidates(full_name), exam_answers(id, is_correct, points_awarded, answer, question_id, grading_method, moderation_status, questions(prompt, prompt_doc, points, type))")
      .eq("exam_id", id)
      .order("started_at"),
    supabase
      .from("proctoring_incidents")
      .select("*, exam_candidates(full_name)")
      .eq("exam_id", id)
      .order("created_at", { ascending: false }),
    exam.quiz_id
      ? supabase.from("quiz_questions").select("question_id, points").eq("quiz_id", exam.quiz_id)
      : Promise.resolve({ data: [] }),
  ]);
  const paperPoints = new Map((paperQuestions ?? []).map((q) => [q.question_id, q.points]));
  type MarkableAnswer = {
    id: string;
    question_id: string;
    is_correct: boolean | null;
    points_awarded: number | null;
    grading_method: string;
    moderation_status: string;
    answer: { text?: string };
    questions: { prompt: string; points: number; type: string };
  };
  const answersOf = (a: { exam_answers?: unknown; status: string }) =>
    ((a.exam_answers as MarkableAnswer[] | null) ?? []).filter(
      (ans) => ans.questions.type === "open_ended" && a.status !== "in_progress",
    );

  const awaitingMarking = (attempts ?? []).flatMap((a) =>
    answersOf(a).filter((ans) => ans.is_correct === null).map((ans) => ({ attempt: a, ans })),
  );
  const gradedWritten = (attempts ?? []).flatMap((a) =>
    answersOf(a).filter((ans) => ans.is_correct !== null).map((ans) => ({ attempt: a, ans })),
  );

  // Rubrics attached to this examination plus every criterion score already
  // recorded for the written answers shown on this page.
  const { data: rubricLinksData } = await supabase
    .from("exam_rubric_links")
    .select("id, rubric_id, question_id, grading_rubrics(title, total_marks)")
    .eq("exam_id", id)
    .eq("organization_id", org.id);
  const rubricLinks = (rubricLinksData ?? []) as unknown as ExamRubricLink[];
  const rubricIds = [...new Set(rubricLinks.map((l) => l.rubric_id))];
  const shownAnswerIds = [...awaitingMarking, ...gradedWritten].map((entry) => entry.ans.id);
  const [{ data: rubricCriteriaData }, { data: answerScoresData }] = await Promise.all([
    rubricIds.length
      ? supabase.from("grading_rubric_criteria").select("*").in("rubric_id", rubricIds).order("position")
      : Promise.resolve({ data: [] as RubricCriterion[] }),
    shownAnswerIds.length
      ? supabase.from("answer_rubric_scores").select("answer_id, criterion_id, rubric_id, marks_awarded, grader_id, note").in("answer_id", shownAnswerIds)
      : Promise.resolve({ data: [] as { answer_id: string; criterion_id: string; rubric_id: string; marks_awarded: number; grader_id: string | null; note: string | null }[] }),
  ]);
  const criteriaByRubric = new Map<string, RubricCriterion[]>();
  for (const criterion of (rubricCriteriaData ?? []) as RubricCriterion[]) {
    criteriaByRubric.set(criterion.rubric_id, [...(criteriaByRubric.get(criterion.rubric_id) ?? []), criterion]);
  }
  type AiProposalRow = {
    id: string; answer_id: string; criterion_id: string; proposed_marks: number;
    rationale: string; provider: string; model: string;
  };
  const { data: aiProposalData } = shownAnswerIds.length
    ? await supabase
        .from("ai_marking_proposals")
        .select("id, answer_id, criterion_id, proposed_marks, rationale, provider, model")
        .in("answer_id", shownAnswerIds)
        .eq("status", "proposed")
        .order("created_at")
    : { data: [] as AiProposalRow[] };
  const proposalsByAnswer = new Map<string, AiProposalRow[]>();
  for (const row of (aiProposalData ?? []) as AiProposalRow[]) {
    proposalsByAnswer.set(row.answer_id, [...(proposalsByAnswer.get(row.answer_id) ?? []), row]);
  }
  const ai = describeAiMarking();

  type ScoreRow = { answer_id: string; criterion_id: string; marks_awarded: number; grader_id: string | null; note: string | null };
  const scoresByAnswer = new Map<string, ScoreRow[]>();
  for (const row of (answerScoresData ?? []) as ScoreRow[]) {
    scoresByAnswer.set(row.answer_id, [...(scoresByAnswer.get(row.answer_id) ?? []), row]);
  }
  const rubricFor = (questionId: string) => {
    const match = rubricForQuestion(rubricLinks, questionId);
    if (!match) return null;
    const criteria = criteriaByRubric.get(match.link.rubric_id) ?? [];
    if (criteria.length === 0) return null;
    return {
      rubricId: match.link.rubric_id,
      level: match.level,
      title: match.link.grading_rubrics?.title ?? "Rubric",
      criteria,
    };
  };
  const canMark = can(ctx, org.id, MARKER_ROLES);

  const markErrors: Record<string, string> = {
    invalid: "The answer, examination or paper could not be verified. No mark was saved.",
    in_progress: "A mark cannot be recorded while the attempt is in progress.",
    points: "Enter a valid mark between zero and the paper’s maximum for this question.",
    criteria: "Every criterion needs a mark between zero and its own maximum. Nothing was saved.",
    rubric: "That rubric is not attached to this examination, or has no criteria. Nothing was saved.",
    rubric_total: "The criterion marks add up to more than this question is worth. Adjust the criteria and retry.",
    failed: "The mark could not be saved. Please retry.",
    partial: "The answer mark may have been saved, but the attempt total could not be confirmed. Contact an administrator to check the mark and total.",
  };
  const moderationErrors: Record<string, string> = {
    invalid: "The answer or examination could not be verified. No decision was recorded.",
    decision: "Choose approve, adjust or return.",
    marks: "A corrected mark is required for an adjustment and must not exceed the question maximum.",
    failed: "The moderation decision could not be recorded. Nothing was changed.",
    partial: "The decision was recorded, but the attempt total could not be confirmed. Contact an administrator.",
  };

  return (
    <>
      <PageTitle
        title={exam.title}
        subtitle={`Paper: ${(exam.quizzes as { title: string } | null)?.title ?? "—"} · ${exam.duration_minutes} minutes · Pass mark ${String(settings.pass_mark_percent ?? 50)}%`}
        action={
          <div className="flex flex-wrap gap-2">
            {Boolean(settings.proctoring) && (
              <ButtonLink href={`/dashboard/exams/${id}/proctor`} variant="gold">🎥 Proctoring room</ButtonLink>
            )}
            <ButtonLink href={`/dashboard/exams/${id}/grades`} variant="outline">Grade history</ButtonLink>
            <ButtonLink href={`/dashboard/reports/exam/${id}`} variant="outline">Report</ButtonLink>
            <ButtonLink href={`/dashboard/exams/${id}/paper`} variant="outline">Print paper</ButtonLink>
          </div>
        }
      />

      {sp.incident_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Observation review recorded.</p>}
      {sp.incident_error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">The review could not be confirmed. The observation may have changed; reload before trying again.</p>}
      {sp.candidate_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Candidate removed.</p>}
      {sp.candidate_error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">The candidate could not be removed. Candidates with recorded attempts are protected; check permissions and try again only if appropriate.</p>}
      {sp.access_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Examination access updated.</p>}
      {sp.access_error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{sp.access_error === "audit" ? "Access changed, but the audit entry could not be confirmed. Do not retry a rotation until you check the current link and code; contact an administrator." : "Access could not be updated. Check your permissions and retry."}</p>}
      {sp.publish_error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Results visibility could not be confirmed. Reload and try again.</p>}
      {sp.publish_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Results visibility updated.</p>}
      {sp.mark_error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{markErrors[sp.mark_error] ?? "The mark could not be saved."}</p>}
      {sp.mark_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">{sp.mark_ok === "rubric" ? "Criterion marks saved, answer mark recalculated and the change added to the grade history." : "Mark saved and attempt total recalculated."}</p>}
      {sp.ai_ok && (
        <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          {sp.ai_ok === "proposed"
            ? "Suggestions saved for review. Nothing has been marked — accept or reject each criterion below."
            : sp.ai_ok === "rejected"
              ? "Suggestion rejected. No mark was written."
              : sp.ai_ok === "accepted"
                ? "Suggestion accepted, criterion mark written and the change logged as AI-assisted."
                : sp.ai_ok.startsWith("remaining-")
                  ? `Suggestion accepted and that criterion saved. ${sp.ai_ok.slice("remaining-".length)} criterion(s) still need a mark before the answer total is calculated.`
                  : "Suggestion decision recorded."}
        </p>
      )}
      {sp.ai_error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {sp.ai_error === "unconfigured"
            ? "No model credential is configured for this deployment, so no suggestions can be generated. Nothing was written."
            : sp.ai_error === "invalid_response"
              ? "The model's reply could not be used safely (a mark outside the criterion maximum, a missing criterion or no rationale). Nothing was written."
              : sp.ai_error === "marks"
                ? "The accepted mark must be between 0 and the criterion maximum. Nothing was written."
                : sp.ai_error === "decided"
                  ? "That suggestion has already been decided. Reload to see its current state."
                  : sp.ai_error === "partial"
                    ? "The criterion mark was saved and the suggestion accepted, but the answer total could not be confirmed. Check the mark before marking anything else."
                    : "The suggestion could not be completed. Nothing was written unless stated above."}
        </p>
      )}
      {sp.moderation_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Moderation decision recorded — {MODERATION_LABEL[sp.moderation_ok]?.toLowerCase() ?? sp.moderation_ok}. Both the decision and the resulting mark change are in the grade history.</p>}
      {sp.moderation_error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{moderationErrors[sp.moderation_error] ?? "The moderation decision could not be recorded."}</p>}
      {sp.publication_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Result publication settings saved.</p>}
      {sp.publication_error && <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{sp.publication_error === "locked" ? "Publication settings are locked after an attempt exists so submitted work and published results cannot be affected." : "Publication settings could not be saved; reload and verify the current setting."}</p>}
      {sp.grading_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Grading retry completed. Automatic mode has published any complete objective result.</p>}
      {sp.grading_error && <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{sp.grading_error === "failed" ? "Grading still needs staff review; the saved submission remains intact." : "This attempt is no longer awaiting a grading retry."}</p>}
      {exam.grades_published_at && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Grades were released to candidates on {fmtDateTime(exam.grades_published_at)}.</p>}
      {sp.added && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Added {sp.added} candidate(s). Each has a personal access code below.</p>}
      {sp.room_error && <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">The examination was created, but its proctoring room could not be confirmed. Contact an administrator before opening it.</p>}
      {sp.ok === "created" && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Examination created. Its unique link and access code are stored with the exam and shown below.</p>}

      <div className="mb-6">
        <ExaminationAccessCard
          examTitle={exam.title}
          organizationName={org.name}
          shareUrl={shareUrl}
          accessLink={accessLink}
          accessCode={exam.access_code}
          exam={{
            status: exam.status,
            starts_at: exam.starts_at,
            ends_at: exam.ends_at,
            shared_link_enabled: exam.shared_link_enabled,
            invite_expires_at: exam.invite_expires_at,
          }}
          settings={settings}
        />
      </div>

      {can(ctx, org.id, CREATOR_ROLES) && (
        <Card className="mb-6 p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Result publication settings</h2>
          <p className="mt-1 text-sm text-ink-soft">Mode and correction visibility can be changed only before the first candidate attempt.</p>
          <form action={saveExamPublicationSettings} className="mt-4 space-y-4">
            <input type="hidden" name="exam_id" value={id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-xl border border-evergreen-900/10 p-3 text-sm text-evergreen-900"><input type="radio" name="result_publication_mode" value="manual" defaultChecked={exam.result_publication_mode !== "automatic"} disabled={(attempts ?? []).length > 0} className="mt-1 accent-evergreen-700" /><span><strong>Manual Result Publication</strong><span className="block text-xs text-ink-soft">Results appear only after an authorized teacher validates and publishes them.</span></span></label>
              <label className="flex items-start gap-2 rounded-xl border border-evergreen-900/10 p-3 text-sm text-evergreen-900"><input type="radio" name="result_publication_mode" value="automatic" defaultChecked={exam.result_publication_mode === "automatic"} disabled={(attempts ?? []).length > 0} className="mt-1 accent-evergreen-700" /><span><strong>Automatic Result Publication</strong><span className="block text-xs text-ink-soft">Fully objective results publish after server grading. Written responses wait for teacher marking.</span></span></label>
            </div>
            <label className="flex items-start gap-2 text-sm text-evergreen-900"><input type="checkbox" name="corrections_published" defaultChecked={settings.corrections_published !== false} disabled={(attempts ?? []).length > 0} className="mt-0.5 accent-evergreen-700" /><span><strong>Release corrections with the result</strong><span className="block text-xs text-ink-soft">Answer keys and explanations remain protected unless this setting is enabled.</span></span></label>
            <Button type="submit" variant="outline" disabled={(attempts ?? []).length > 0}>Save publication settings</Button>
            {(attempts ?? []).length > 0 && <p className="text-xs text-amber-800">Locked because this assessment already has {(attempts ?? []).length} attempt(s).</p>}
          </form>
        </Card>
      )}

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={exam.status === "open" ? "amber" : "gray"}>{exam.status}</Badge>
          <div className="min-w-[280px] flex-1">
            <p className="text-sm text-ink-soft">
              Legacy two-code entry: <strong>/exam-access</strong> with exam code{" "}
              <span className="font-mono text-base font-bold text-evergreen-800">{exam.access_code}</span> plus a personal candidate code.
            </p>
            {can(ctx, org.id, CREATOR_ROLES) && <div className="mt-4 flex flex-wrap gap-2">
              <form action={updateWorkspaceExamAccess}><input type="hidden" name="exam_id" value={id} /><input type="hidden" name="access_action" value={exam.shared_link_enabled ? "disable" : "enable"} /><Button type="submit" variant="outline">{exam.shared_link_enabled ? "Disable shared link" : "Enable shared link"}</Button></form>
              <form action={updateWorkspaceExamAccess}><input type="hidden" name="exam_id" value={id} /><input type="hidden" name="access_action" value="new_link" /><Button type="submit" variant="outline">Regenerate link</Button></form>
              <form action={updateWorkspaceExamAccess}><input type="hidden" name="exam_id" value={id} /><input type="hidden" name="access_action" value="new_code" /><Button type="submit" variant="outline">Regenerate code</Button></form>
              <p className="w-full text-xs text-ink-soft">Regenerating immediately invalidates the previous link or code. Advanced eligibility and identity settings are not yet available in this workspace.</p>
            </div>}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {exam.status !== "open" ? (
              <form action={setExamStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="open" /><Button type="submit">Open examination</Button></form>
            ) : (
              <form action={setExamStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="closed" /><Button type="submit" variant="danger">Close examination</Button></form>
            )}
            {exam.result_publication_mode === "automatic" ? (
              <Badge tone="green">Automatic when grading is complete</Badge>
            ) : (
              <form action={publishResults}>
                <input type="hidden" name="exam_id" value={id} />
                <input type="hidden" name="publish" value={settings.results_published ? "0" : "1"} />
                <Button type="submit" variant="outline">
                  {settings.results_published ? "Unpublish results" : "Validate and publish results"}
                </Button>
              </form>
            )}
            <form action={deleteExam}>
              <input type="hidden" name="id" value={id} />
              <Button type="submit" variant="ghost" className="text-red-700">Delete</Button>
            </form>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          {exam.result_publication_mode === "automatic" ? (
            <>Automatic publication is enabled; each attempt becomes visible after grading is complete.</>
          ) : (
            <>Results are currently <strong>{settings.results_published ? "visible to candidates" : "hidden from candidates"}</strong>.</>
          )}{" "}
          Objective questions are marked automatically on submission; written answers appear in the marking queue below.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Candidates ({(candidates ?? []).length})</h2>
          <div className="mt-3 max-h-96 overflow-y-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-evergreen-900/10 text-left text-ink-soft">
                  <th className="py-2 pr-2 font-medium">Candidate</th>
                  <th className="py-2 pr-2 font-medium">Personal code</th>
                  <th className="py-2 pr-2 font-medium">Status</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {(candidates ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-evergreen-900/5">
                    <td className="py-2 pr-2">
                      <span className="font-medium">{c.full_name}</span>
                      {c.candidate_ref && <span className="block text-xs text-ink-soft">{c.candidate_ref}{c.email ? ` · ${c.email}` : ""}</span>}
                    </td>
                    <td className="py-2 pr-2 font-mono font-semibold text-evergreen-800">{c.access_code}</td>
                    <td className="py-2 pr-2"><Badge tone={c.status === "submitted" ? "green" : c.status === "in_progress" ? "amber" : "gray"}>{c.status.replace(/_/g, " ")}</Badge></td>
                    <td className="py-2">
                      {can(ctx, org.id, CREATOR_ROLES) && c.status === "registered" && <form action={removeCandidate}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="exam_id" value={id} />
                        <button className="text-xs text-red-700 underline-offset-2 hover:underline">Remove</button>
                      </form>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(candidates ?? []).length === 0 && <p className="py-3 text-sm text-ink-soft">No candidates registered yet.</p>}
          </div>

          <form action={addCandidate} className="mt-4 grid gap-2 border-t border-evergreen-900/10 pt-4 sm:grid-cols-3">
            <input type="hidden" name="exam_id" value={id} />
            <Input name="full_name" required placeholder="Full name" />
            <Input name="candidate_ref" placeholder="Ref / class (optional)" />
            <div className="flex gap-2">
              <Input name="email" type="email" placeholder="Email (optional)" />
              <Button type="submit">Add</Button>
            </div>
          </form>
          <form action={addCandidatesBulk} className="mt-4">
            <input type="hidden" name="exam_id" value={id} />
            <Field label="Bulk add — one per line: Full Name, email, reference">
              <Textarea name="bulk" rows={4} placeholder={"Aya Ndiaye, aya@example.com, G9-A\nben olsen, ben@example.com, G9-B"} />
            </Field>
            <Button type="submit" variant="outline" className="mt-2">Add all</Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Attempts ({(attempts ?? []).length})</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-evergreen-900/10 text-left text-ink-soft">
                  <th className="py-2 pr-2 font-medium">Candidate</th>
                  <th className="py-2 pr-2 font-medium">Started</th>
                  <th className="py-2 pr-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {(attempts ?? []).map((a) => (
                  <tr key={a.id} className="border-b border-evergreen-900/5">
                    <td className="py-2 pr-2 font-medium">{(a.exam_candidates as { full_name: string } | null)?.full_name}</td>
                    <td className="py-2 pr-2 text-ink-soft">{fmtDateTime(a.started_at)}</td>
                    <td className="py-2 pr-2">
                      <Badge tone={a.status === "in_progress" ? "amber" : a.grading_status === "grading_failed" ? "red" : "green"}>{a.status.replace(/_/g, " ")}</Badge>
                      {a.grading_status && a.grading_status !== "not_started" && <span className="mt-1 block text-xs text-ink-soft">{String(a.grading_status).replace(/_/g, " ")}{Number(a.pending_manual_count ?? 0) > 0 ? ` · ${a.pending_manual_count} manual` : ""}</span>}
                      {a.grading_status === "grading_failed" && (canMark || can(ctx, org.id, CREATOR_ROLES)) && (
                        <form action={retryExamGrading} className="mt-1">
                          <input type="hidden" name="exam_id" value={id} /><input type="hidden" name="attempt_id" value={a.id} />
                          <Button type="submit" variant="outline" className="text-xs">Retry grading</Button>
                        </form>
                      )}
                    </td>
                    <td className="py-2 tabular-nums">{a.score !== null ? `${Number(a.score)} / ${Number(a.max_score ?? 0)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(attempts ?? []).length === 0 && <p className="py-3 text-sm text-ink-soft">No attempts yet.</p>}
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Marking queue ({awaitingMarking.length})</h2>
            {awaitingMarking.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">No written answers awaiting a corrector. Objective questions mark themselves automatically.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {awaitingMarking.map(({ attempt, ans }) => {
                  const rubric = rubricFor(ans.question_id);
                  const existing = scoresByAnswer.get(ans.id) ?? [];
                  return (
                  <div key={ans.id} id={`ai-${ans.id}`} className="rounded-xl border border-evergreen-900/10 bg-cream p-4">
                    <p className="text-xs font-medium text-ink-soft">
                      {(attempt.exam_candidates as { full_name: string } | null)?.full_name} · max {Number(paperPoints.get(ans.question_id) ?? ans.questions.points)} pts
                    </p>
                    <div className="mt-1 font-medium"><RichContent doc={(ans.questions as unknown as { prompt_doc?: import("@/lib/content").RichDoc | null }).prompt_doc ?? null} text={ans.questions.prompt} /></div>
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm">{ans.answer?.text ?? "(empty)"}</p>
                    {rubric && canMark ? (
                      <div className="mt-3 rounded-lg border border-gold-600/30 bg-gold-50/40 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium text-evergreen-900">
                            {ai.configured
                              ? `AI suggestion draft · ${ai.provider} · ${ai.model} — proposals only, a person decides.`
                              : "AI suggestions are off: no model credential is configured for this deployment, and nothing is generated without one."}
                          </p>
                          {ai.configured && (
                            <form action={proposeAiMarks}>
                              <input type="hidden" name="answer_id" value={ans.id} />
                              <input type="hidden" name="attempt_id" value={attempt.id} />
                              <input type="hidden" name="exam_id" value={id} />
                              <input type="hidden" name="rubric_id" value={rubric.rubricId} />
                              <Button type="submit" variant="outline" className="text-xs">Suggest criterion marks</Button>
                            </form>
                          )}
                        </div>
                        {(proposalsByAnswer.get(ans.id) ?? []).length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {(proposalsByAnswer.get(ans.id) ?? []).map((proposal) => {
                              const criterion = rubric.criteria.find((c) => c.id === proposal.criterion_id);
                              return (
                                <li key={proposal.id} className="rounded-lg border border-evergreen-900/10 bg-white p-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-evergreen-900">
                                      {criterion?.code ? `${criterion.code} · ` : ""}{criterion?.label ?? "Criterion"}
                                    </span>
                                    <Badge tone="gold">
                                      suggested {Number(proposal.proposed_marks)} / {criterion ? Number(criterion.max_marks) : "?"}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 text-[11px] leading-snug text-ink-soft">{proposal.rationale}</p>
                                  <div className="mt-2 flex flex-wrap items-end gap-2">
                                    <form action={decideAiProposal} className="flex flex-wrap items-end gap-2">
                                      <input type="hidden" name="proposal_id" value={proposal.id} />
                                      <input type="hidden" name="answer_id" value={ans.id} />
                                      <input type="hidden" name="exam_id" value={id} />
                                      <input type="hidden" name="decision" value="accept" />
                                      <Field label="Accept mark">
                                        <Input
                                          name="marks"
                                          type="number"
                                          step="0.25"
                                          min={0}
                                          max={criterion ? Number(criterion.max_marks) : undefined}
                                          defaultValue={Number(proposal.proposed_marks)}
                                          className="w-20"
                                        />
                                      </Field>
                                      <Field label="Note">
                                        <Input name="note" placeholder="Optional" className="w-40" />
                                      </Field>
                                      <Button type="submit" className="text-xs">Accept</Button>
                                    </form>
                                    <form action={decideAiProposal}>
                                      <input type="hidden" name="proposal_id" value={proposal.id} />
                                      <input type="hidden" name="answer_id" value={ans.id} />
                                      <input type="hidden" name="exam_id" value={id} />
                                      <input type="hidden" name="decision" value="reject" />
                                      <Button type="submit" variant="outline" className="text-xs">Reject</Button>
                                    </form>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : null}
                    {rubric && canMark ? (
                      <form action={markWithRubric} className="mt-3 space-y-2">
                        <input type="hidden" name="answer_id" value={ans.id} />
                        <input type="hidden" name="attempt_id" value={attempt.id} />
                        <input type="hidden" name="exam_id" value={id} />
                        <input type="hidden" name="rubric_id" value={rubric.rubricId} />
                        <p className="text-xs font-medium text-evergreen-800">
                          {rubric.title} · {rubric.level === "question" ? "question rubric" : "examination rubric"} · {rubric.criteria.length} criteria
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {rubric.criteria.map((criterion) => {
                            const mine = existing.find((row) => row.criterion_id === criterion.id && row.grader_id === ctx.user.id);
                            const otherGraders = existing.filter((row) => row.criterion_id === criterion.id && row.grader_id !== ctx.user.id);
                            return (
                              <div key={criterion.id} className="rounded-lg border border-evergreen-900/10 bg-white p-2">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-xs font-medium text-evergreen-900">
                                    {criterion.code ? `${criterion.code} · ` : ""}{criterion.label}
                                  </span>
                                  <label className="flex shrink-0 items-center gap-1 text-xs text-ink-soft">
                                    <input
                                      name={`criterion_${criterion.id}`}
                                      type="number"
                                      step="0.25"
                                      min={0}
                                      max={Number(criterion.max_marks)}
                                      defaultValue={mine ? Number(mine.marks_awarded) : ""}
                                      required
                                      className="w-16 rounded border border-evergreen-900/20 px-1 py-0.5 text-right tabular-nums"
                                    />
                                    / { Number(criterion.max_marks) }
                                  </label>
                                </div>
                                {criterion.description && <p className="mt-1 text-[11px] leading-snug text-ink-soft">{criterion.description}</p>}
                                {otherGraders.length > 0 && (
                                  <p className="mt-1 text-[11px] text-amber-800">
                                    Another marker scored this {otherGraders.map((row) => Number(row.marks_awarded)).join(", ")} — your judgement is stored separately.
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <Field label="Marker note">
                            <Input name="note" placeholder="Feedback…" className="w-56" />
                          </Field>
                          <Button type="submit">Save criterion marks</Button>
                        </div>
                        <p className="text-[11px] text-ink-soft">A single mark can be recorded instead by detaching the rubric from this examination.</p>
                      </form>
                    ) : (
                      <form action={markAnswer} className="mt-3 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="answer_id" value={ans.id} />
                        <input type="hidden" name="attempt_id" value={attempt.id} />
                        <input type="hidden" name="exam_id" value={id} />
                        <Field label="Points">
                          <Input name="points" type="number" step="0.5" min={0} max={Number(paperPoints.get(ans.question_id) ?? ans.questions.points)} required className="w-24" />
                        </Field>
                        <Field label="Marker note">
                          <Input name="note" placeholder="Feedback…" className="w-56" />
                        </Field>
                        <Button type="submit">Save mark</Button>
                      </form>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Moderation ({gradedWritten.length} written answers marked)</h2>
              <ButtonLink href={`/dashboard/exams/${id}/grades`} variant="outline" className="text-xs">Full grade history</ButtonLink>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              A moderator may approve a mark, adjust it, or return it to the marker. Each decision is appended to the grade
              history with the previous mark and cannot be rewritten or deleted.
            </p>
            {gradedWritten.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No written answers have been marked on this examination yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {gradedWritten.map(({ attempt, ans }) => {
                  const scoreRows = scoresByAnswer.get(ans.id) ?? [];
                  const perGrader = new Map<string, number>();
                  for (const row of scoreRows) {
                    const key = row.grader_id ?? "unknown";
                    perGrader.set(key, Math.round(((perGrader.get(key) ?? 0) + Number(row.marks_awarded)) * 100) / 100);
                  }
                  const maxPoints = Number(paperPoints.get(ans.question_id) ?? ans.questions.points);
                  const tone = ans.moderation_status === "approved" ? "green" : ans.moderation_status === "adjusted" ? "gold" : ans.moderation_status === "returned" ? "red" : "gray";
                  return (
                    <div key={ans.id} className="rounded-xl border border-evergreen-900/10 bg-cream p-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge tone={tone}>{MODERATION_LABEL[ans.moderation_status] ?? ans.moderation_status}</Badge>
                        <span className="font-medium">{(attempt.exam_candidates as { full_name: string } | null)?.full_name ?? "Candidate"}</span>
                        <span className="tabular-nums">{Number(ans.points_awarded ?? 0)} / {maxPoints}</span>
                        <span className="ml-auto text-xs text-ink-soft">{GRADING_METHOD_LABEL[ans.grading_method] ?? ans.grading_method}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-ink-soft">{ans.questions.prompt}</p>
                      {perGrader.size > 0 && (
                        <p className="mt-1 text-[11px] text-ink-soft">
                          Criterion totals by marker: {[...perGrader.values()].map((v) => Number(v)).join(" · ")}
                        </p>
                      )}
                      {canMark && (
                        <form action={moderateAnswer} className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="answer_id" value={ans.id} />
                          <input type="hidden" name="exam_id" value={id} />
                          <Field label="Decision">
                            <Select name="decision" defaultValue="approved" className="w-40">
                              <option value="approved">Approve mark</option>
                              <option value="adjusted">Adjust mark</option>
                              <option value="returned">Return to marker</option>
                            </Select>
                          </Field>
                          <Field label="Corrected mark" hint="Only for an adjustment">
                            <Input name="proposed_marks" type="number" step="0.25" min={0} max={maxPoints} className="w-24" />
                          </Field>
                          <Field label="Reason">
                            <Input name="note" placeholder="Why…" className="w-52" />
                          </Field>
                          <Button type="submit" variant="outline">Record decision</Button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {Boolean(settings.proctoring) && (
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Proctoring incidents ({(incidents ?? []).length})</h2>
              <p className="mt-1 text-xs text-ink-soft">Incidents are observations for human review — never automatic proof of misconduct.</p>
              <div className="mt-3 space-y-2">
                {(incidents ?? []).map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-evergreen-900/10 bg-cream px-3 py-2.5 text-sm">
                    <Badge tone={i.severity === "high" ? "red" : i.severity === "medium" ? "amber" : "gray"}>{i.severity}</Badge>
                    <span className="font-medium">{(i.exam_candidates as { full_name: string } | null)?.full_name ?? "—"}</span>
                    <span className="text-ink-soft">{describeIncidentType(i.type)}{i.note && !String(i.type).startsWith("integrity_") ? ` — ${i.note}` : ""}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <Badge tone={i.status === "open" ? "amber" : "green"}>{i.status}</Badge>
                      {can(ctx, org.id, PROCTOR_ROLES) && ["open", "investigating"].includes(i.status) && (
                        <>
                          {(["valid", "invalid", "investigating"] as const).filter((s) => s !== i.status).map((s) => (
                            <form key={s} action={reviewIncident}>
                              <input type="hidden" name="id" value={i.id} />
                              <input type="hidden" name="exam_id" value={id} />
                              <input type="hidden" name="expected_status" value={i.status} />
                              <input type="hidden" name="status" value={s} />
                              <button className="text-xs font-medium text-evergreen-700 underline-offset-2 hover:underline">{s}</button>
                            </form>
                          ))}
                        </>
                      )}
                    </span>
                  </div>
                ))}
                {(incidents ?? []).length === 0 && <p className="text-sm text-ink-soft">No incidents recorded.</p>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
