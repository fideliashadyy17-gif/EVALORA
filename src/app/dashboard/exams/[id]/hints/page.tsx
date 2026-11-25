import { Badge, Button, ButtonLink, Card, Field, PageTitle, Select, StatCard, Textarea } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { canOperateMany } from "@/lib/operationalAccess";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  createOrgHintDraft,
  deleteOrgHint,
  transitionOrgHintStatus,
} from "./actions";

export const metadata: Metadata = { title: "Examination Hints" };
export const dynamic = "force-dynamic";

const OK_MESSAGES: Record<string, string> = {
  created: "Draft hint saved. Publish it below when ready to make it available inside the examination.",
  approved: "Hint marked approved.",
  published: "Hint published — candidates on this question can now request this guidance hint.",
  archived: "Hint archived and hidden from candidates.",
  draft: "Hint returned to draft.",
  deleted: "Hint removed.",
};

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Your role does not permit authoring or publishing examination hints.",
  question_required: "Choose a question from this examination paper.",
  bad_level: "Select hint level 1, 2, or 3.",
  bad_body: "Hint text must be a concise guidance prompt (within length limits).",
  scope: "That question does not belong to this organization.",
  leak: "Blocked by answer-leak guard: this hint reveals part of the answer key. Rewrite it as guidance.",
  archive_first: "Archive a published hint before deleting it.",
  not_found: "Hint not found in this organization.",
  failed: "Could not save the hint change. Please retry.",
};

export default async function OrgExamHintsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");

  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "examinations", "/dashboard?e=module");
  requireModule(entitlement, "exam_hints", `/dashboard/exams/${id}?e=module`);

  const { canView, canEdit } = await canOperateMany(ctx, org.id, {
    canView: { permission: "exams.view", module: "exam_hints" },
    canEdit: { permission: "exams.edit", module: "exam_hints" },
  });
  if (!canView) redirect(`/dashboard/exams/${id}`);

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, quiz_id, organization_id")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) notFound();

  const admin = createAdminClient();
  const [{ data: paperRows }, { data: hintRows }] = await Promise.all([
    exam.quiz_id
      ? supabase
          .from("quiz_questions")
          .select("position, question_id, questions(id, prompt, type, points)")
          .eq("quiz_id", exam.quiz_id)
          .order("position")
      : Promise.resolve({ data: [] as unknown[] }),
    admin
      .from("question_hints")
      .select("id, question_id, exam_id, level, body, status, source, created_at, published_at")
      .eq("organization_id", org.id)
      .eq("exam_id", id)
      .order("question_id")
      .order("level"),
  ]);

  const questions = ((paperRows ?? []) as unknown as {
    position: number;
    question_id: string;
    questions: { id: string; prompt: string; type: string; points: number } | null;
  }[])
    .filter((r) => Boolean(r.questions))
    .map((r, idx) => ({
      index: idx + 1,
      id: r.questions!.id,
      prompt: r.questions!.prompt,
      type: r.questions!.type,
      points: Number(r.questions!.points),
    }));
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const hints = (hintRows ?? []) as {
    id: string;
    question_id: string;
    exam_id: string | null;
    level: number;
    body: string;
    status: string;
    source: string;
    created_at: string;
    published_at: string | null;
  }[];
  const publishedCount = hints.filter((h) => h.status === "published").length;
  const coveredQuestions = new Set(hints.filter((h) => h.status === "published").map((h) => h.question_id)).size;

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Guided Hints Studio"
        title={`Examination hints — ${exam.title}`}
        subtitle="Author progressive hints (levels 1–3) that guide candidates without revealing answers. Every draft is screened by the server-side answer-leak guard before saving or publishing."
        action={<ButtonLink href={`/dashboard/exams/${id}`} variant="outline">← Examination</ButtonLink>}
      />

      {sp.ok && OK_MESSAGES[sp.ok] && (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {OK_MESSAGES[sp.ok]}
        </p>
      )}
      {sp.e && ERROR_MESSAGES[sp.e] && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {ERROR_MESSAGES[sp.e]}
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Paper questions" value={questions.length} />
        <StatCard label="Published hints" value={publishedCount} hint={`Covering ${coveredQuestions} question(s)`} />
        <StatCard label="Draft / archived" value={hints.length - publishedCount} />
      </div>

      {canEdit && (
        <Card className="mb-6 p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Add a hint draft</h2>
          {questions.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Attach a quiz/paper with questions to this examination first.</p>
          ) : (
            <form action={createOrgHintDraft} className="mt-4 space-y-4">
              <input type="hidden" name="exam_id" value={id} />
              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <Field label="Question">
                  <Select name="question_id" required>
                    {questions.map((q) => (
                      <option key={q.id} value={q.id}>
                        Q{q.index}: {q.prompt.slice(0, 90)}{q.prompt.length > 90 ? "…" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Hint level">
                  <Select name="level" defaultValue="1">
                    <option value="1">Level 1 — Gentle nudge</option>
                    <option value="2">Level 2 — Method / formula reminder</option>
                    <option value="3">Level 3 — First worked step</option>
                  </Select>
                </Field>
              </div>
              <Field label="Guidance text" hint="Must help the candidate reason without stating the final answer.">
                <Textarea name="body" rows={3} required placeholder="e.g. Start by isolating the variable on one side before simplifying." />
              </Field>
              <Button type="submit">Save hint draft</Button>
            </form>
          )}
        </Card>
      )}

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Configured hints ({hints.length})</h2>
        {hints.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            No hints have been created for this examination yet. Questions without published hints show no hint control to candidates.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {hints.map((h) => {
              const q = questionById.get(h.question_id);
              return (
                <div key={h.id} className="rounded-xl border border-evergreen-900/15 bg-cream/60 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={h.status === "published" ? "green" : h.status === "approved" ? "gold" : "gray"}>
                      {h.status}
                    </Badge>
                    <Badge tone="gold">Level {h.level}</Badge>
                    <span className="text-sm font-semibold text-evergreen-950">
                      {q ? `Q${q.index}: ${q.prompt.slice(0, 80)}${q.prompt.length > 80 ? "…" : ""}` : "Question"}
                    </span>
                    <span className="ml-auto text-xs text-ink-soft">{fmtDateTime(h.created_at)}</span>
                  </div>
                  <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-ink">{h.body}</p>
                  {canEdit && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {h.status !== "published" && (
                        <form action={transitionOrgHintStatus}>
                          <input type="hidden" name="exam_id" value={id} />
                          <input type="hidden" name="hint_id" value={h.id} />
                          <input type="hidden" name="target" value="published" />
                          <Button type="submit" variant="primary" className="text-xs">Publish hint</Button>
                        </form>
                      )}
                      {h.status === "published" && (
                        <form action={transitionOrgHintStatus}>
                          <input type="hidden" name="exam_id" value={id} />
                          <input type="hidden" name="hint_id" value={h.id} />
                          <input type="hidden" name="target" value="archived" />
                          <Button type="submit" variant="outline" className="text-xs">Archive</Button>
                        </form>
                      )}
                      {h.status !== "published" && (
                        <form action={deleteOrgHint}>
                          <input type="hidden" name="exam_id" value={id} />
                          <input type="hidden" name="hint_id" value={h.id} />
                          <Button type="submit" variant="danger" className="text-xs">Delete</Button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
