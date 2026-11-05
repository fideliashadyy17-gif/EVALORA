import { Badge, Button, Card, Field, Input, PageTitle, Select, StatCard, Textarea } from "@/components/ui";
import { RichContent } from "@/components/RichContent";
import { requireSuperAdmin } from "@/lib/auth";
import type { RichDoc } from "@/lib/content";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { CheckCircle2, ClipboardList, PenLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "../../ui";
import { markExamAnswerAsAdmin } from "../actions";

export const metadata: Metadata = { title: "Examination marking" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  marked: "Mark saved and the candidate total recalculated.",
  answer: "The answer, its question or paper could not be verified.",
  in_progress: "An answer cannot be marked while the candidate attempt is still in progress.",
  points: "Points must be between zero and the maximum for this question.",
  failed: "The mark could not be saved.",
  partial: "The answer mark may have been saved, but the attempt total could not be confirmed. Check the mark and total before publishing results.",
};

interface QueueRow {
  id: string;
  answer: Record<string, unknown> | null;
  updated_at: string;
  quiz_questions: { id: string; quiz_id: string; question_id: string; points: number | null } | null;
  questions: {
    id: string;
    prompt: string;
    prompt_doc: RichDoc | null;
    explanation: string | null;
    explanation_doc: RichDoc | null;
    points: number;
    type: string;
    config: Record<string, unknown> | null;
  } | null;
  exam_attempts: {
    id: string;
    status: string;
    started_at: string;
    submitted_at: string | null;
    exam_candidates: { full_name: string; candidate_ref: string | null } | null;
    exams: { id: string; title: string; organization_id: string; quiz_id: string | null; organizations: { name: string } | null } | null;
  } | null;
}

function answerText(answer: Record<string, unknown> | null) {
  if (!answer) return "(no saved response)";
  if (typeof answer.text === "string" && answer.text.trim()) return answer.text;
  if (typeof answer.value === "string" && answer.value.trim()) return answer.value;
  return JSON.stringify(answer, null, 2);
}

export default async function ExaminationMarkingPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; org?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const [{ data: rawQueue }, { data: exams }, { data: orgs }, { count: markedCount }] = await Promise.all([
    admin
      .from("exam_answers")
      .select("id, answer, updated_at, quiz_questions(id, quiz_id, question_id, points), questions(id, prompt, prompt_doc, explanation, explanation_doc, points, type, config), exam_attempts!inner(id, status, started_at, submitted_at, exam_candidates(full_name, candidate_ref), exams!inner(id, title, organization_id, quiz_id, organizations(name)))")
      .is("is_correct", null)
      .order("updated_at", { ascending: true })
      .limit(1000),
    admin.from("exams").select("id, title").order("created_at", { ascending: false }).limit(300),
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("exam_attempts").select("id", { count: "exact", head: true }).eq("status", "marked"),
  ]);

  const queue = ((rawQueue ?? []) as unknown as QueueRow[]).filter((row) => {
    if (row.questions?.type !== "open_ended") return false;
    if (!row.exam_attempts || row.exam_attempts.status === "in_progress") return false;
    if (sp.exam && row.exam_attempts.exams?.id !== sp.exam) return false;
    if (sp.org && row.exam_attempts.exams?.organization_id !== sp.org) return false;
    return true;
  });
  const back = `/admin/examinations/marking${sp.exam ? `?exam=${sp.exam}` : ""}`;
  // Legacy answers may have no quiz_question_id; do not guess their paper
  // override in the UI. The action resolves it authoritatively on save.
  function knownMaximum(row: QueueRow): number | null {
    const question = row.questions;
    const paper = row.quiz_questions;
    if (!question || !paper || paper.question_id !== question.id || paper.quiz_id !== row.exam_attempts?.exams?.quiz_id) return null;
    const value = Number(paper.points ?? question.points);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  const unknownMaximums = queue.filter((row) => knownMaximum(row) === null).length;
  const totalMarksPending = queue.reduce((sum, row) => sum + (knownMaximum(row) ?? 0), 0);

  return (
    <>
      <PageTitle
        title="Marking & grading"
        subtitle="Objective questions are graded by the server scoring engine at submission. This queue contains structured written/mathematical answers that require an authorized human marker."
      />

      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Answers awaiting marking" value={queue.length} icon={<ClipboardList className="h-5 w-5" />} />
        <StatCard label="Known marks represented" value={totalMarksPending} icon={<PenLine className="h-5 w-5" />} />
        <StatCard label="Fully marked attempts" value={markedCount ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>

      {unknownMaximums > 0 && <p className="mb-4 text-sm text-ink-soft">{unknownMaximums} answer(s) have a paper maximum that must be verified when saving; their marks are excluded from the known total.</p>}

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2">
        <Select name="exam" defaultValue={sp.exam ?? ""} className="min-w-[280px]" aria-label="Examination">
          <option value="">All examinations</option>
          {(exams ?? []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </Select>
        <Select name="org" defaultValue={sp.org ?? ""} className="w-56" aria-label="Organization">
          <option value="">All organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Button type="submit" variant="outline">Filter queue</Button>
      </form>

      {queue.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          The marking queue is clear. Submitted objective answers have already been graded automatically.
        </p>
      ) : (
        <div className="space-y-5">
          {queue.map((row) => {
            const q = row.questions!;
            const attempt = row.exam_attempts!;
            const criteria = String(q.config?.marking_criteria ?? "").trim();
            const maximum = knownMaximum(row);
            return (
              <Card key={row.id} className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-semibold text-evergreen-950">{attempt.exam_candidates?.full_name ?? "Candidate"}</p>
                    <p className="text-sm text-ink-soft">
                      {attempt.exams?.title} · {attempt.exams?.organizations?.name}
                      {attempt.exam_candidates?.candidate_ref ? ` · ${attempt.exam_candidates.candidate_ref}` : ""}
                      {attempt.submitted_at ? ` · submitted ${fmtDateTime(attempt.submitted_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge tone="gold">{maximum === null ? "Maximum verified on save" : `Maximum ${maximum} marks`}</Badge>
                    <Link href={`/admin/questions/${q.id}`} className="text-sm font-medium text-evergreen-700 hover:underline">Question editor →</Link>
                  </div>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Question</h3>
                    <div className="mt-2 rounded-xl bg-cream p-4"><RichContent doc={q.prompt_doc} text={q.prompt} /></div>

                    <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-soft">Candidate response</h3>
                    <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-evergreen-900/15 bg-white p-4 font-sans text-sm leading-relaxed">{answerText(row.answer)}</pre>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Marking criteria</h3>
                    <div className="mt-2 whitespace-pre-wrap rounded-xl bg-evergreen-50 p-4 text-sm">
                      {criteria || "No explicit criteria were saved. Use the worked solution and the question's mark allocation."}
                    </div>

                    <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-soft">Worked solution (marker view)</h3>
                    <div className="mt-2 rounded-xl bg-cream p-4">
                      {q.explanation_doc || q.explanation ? <RichContent doc={q.explanation_doc} text={q.explanation ?? ""} /> : <p className="text-sm text-ink-soft">No worked solution saved.</p>}
                    </div>

                    <form action={markExamAnswerAsAdmin} className="mt-5 grid gap-3 rounded-xl border border-evergreen-900/15 p-4 sm:grid-cols-[130px_1fr_auto]">
                      <input type="hidden" name="answer_id" value={row.id} />
                      <input type="hidden" name="back" value={back} />
                      <Field label={maximum === null ? "Marks (maximum verified on save)" : `Marks (0–${maximum})`}>
                        <Input name="points" type="number" min={0} max={maximum ?? undefined} step="0.5" required />
                      </Field>
                      <Field label="Marker note / feedback">
                        <Textarea name="note" rows={2} maxLength={1000} placeholder="Method, accuracy and final-answer feedback…" />
                      </Field>
                      <div className="flex items-end"><Button type="submit" variant="gold">Save mark</Button></div>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
