import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select, StatCard, Textarea } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { describeHintGeneration } from "@/lib/examHintsAi";
import { HINT_LEVEL_LABELS, hintStatusLabel } from "@/lib/examHints";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice, Section, Table } from "../../ui";
import { createHintDraft, deleteHint, generateHintDrafts, setHintStatus, updateHintBody } from "../hint-actions";

export const metadata: Metadata = { title: "Examination hints" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  hint_created: "Hint saved as a draft. It is not visible to candidates until it is published.",
  hint_saved: "Hint text saved.",
  hint_approved: "Hint approved. Publish it to make it visible while students answer.",
  hint_published: "Hint published. Students answering this question will see it immediately — no reload needed on new papers, and on demand for pages already open.",
  hint_archived: "Hint archived. Candidates no longer see it; the text is kept for the record.",
  hint_draft: "Hint returned to draft. Candidates no longer see it.",
  hint_deleted: "Draft hint deleted.",
  ai_drafted: "AI drafts saved for review. They are not visible to candidates until you publish them.",
  question_required: "Choose the question this hint belongs to.",
  bad_level: "Choose a hint level between 1 and 3.",
  bad_body: "A hint must be between 8 and 800 characters.",
  bad_status: "That status change is not supported.",
  scope: "That question and examination do not belong to the same institution.",
  duplicate: "That level already has a hint for this scope. Edit the existing hint instead.",
  leak: "This hint repeats part of the correct answer. Rewrite it as guidance before saving — hints must never reveal the answer.",
  published_immutable: "Published hint text cannot be edited. Archive it first, then create the corrected hint.",
  archive_first: "Archive a published hint before deleting it.",
  not_found: "That hint no longer exists.",
  save: "The change could not be saved. Try again.",
  ai_unconfigured: "AI hint drafting is not configured on this deployment. Write the hint manually, or add a model credential.",
  ai_unconfigured_detail: "No model credential is configured, so no hint is generated. Manual hints always work.",
  ai_invalid_response: "The model reply was not usable (empty, malformed, or it quoted the answer). Nothing was saved.",
  ai_provider: "The model provider could not be reached. Nothing was saved.",
  ai_no_new_levels: "The model only proposed levels that already exist as drafts for this scope.",
};

interface HintRow {
  id: string;
  level: number;
  body: string;
  status: string;
  source: string;
  created_at: string;
  approved_at: string | null;
  published_at: string | null;
  exam_id: string | null;
  question_id: string;
  questions: { id: string; prompt: string; type: string } | null;
  exams: { id: string; title: string } | null;
  organizations: { name: string } | null;
  creator: { full_name: string | null; email: string | null } | null;
  approver: { full_name: string | null; email: string | null } | null;
}

const tone = (status: string): "green" | "red" | "amber" | "gray" =>
  status === "published" ? "green" : status === "approved" ? "amber" : status === "archived" ? "gray" : "gray";

const fmt = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

export default async function ExamHintsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; status?: string; q?: string; ok?: string; e?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();
  const back = `/admin/examinations/hints${sp.exam ? `?exam=${encodeURIComponent(sp.exam)}` : ""}`;
  const availability = describeHintGeneration();

  // Papers offered for scoping a hint. A hint can be bank-wide (all exams that
  // use the question) or targeted to one examination, which shadows the bank
  // hint for that examination only.
  const { data: examRows } = await admin
    .from("exams")
    .select("id,title,status,organization_id,organizations(name),quiz_id")
    .order("created_at", { ascending: false })
    .limit(300);
  const exams = (examRows ?? []) as unknown as {
    id: string; title: string; status: string; organization_id: string; quiz_id: string | null; organizations: { name: string } | null;
  }[];
  const selectedExam = sp.exam ? exams.find((exam) => exam.id === sp.exam) ?? null : null;

  // Questions of the selected paper, so the operator never has to paste ids.
  let paperQuestions: { id: string; prompt: string; type: string; position: number }[] = [];
  if (selectedExam?.quiz_id) {
    const { data: qq } = await admin
      .from("quiz_questions")
      .select("id,position,questions(id,prompt,type)")
      .eq("quiz_id", selectedExam.quiz_id)
      .order("position")
      .limit(400);
    paperQuestions = ((qq ?? []) as unknown as {
      id: string; position: number; questions: { id: string; prompt: string; type: string } | null;
    }[])
      .filter((row) => row.questions)
      .map((row) => ({ id: row.questions!.id, prompt: row.questions!.prompt, type: row.questions!.type, position: row.position }));
  }

  let query = admin
    .from("question_hints")
    .select(
      "id,level,body,status,source,created_at,approved_at,published_at,exam_id,question_id," +
      "questions(id,prompt,type),exams(id,title),organizations(name)," +
      "creator:profiles!question_hints_created_by_fkey(full_name,email)," +
      "approver:profiles!question_hints_approved_by_fkey(full_name,email)",
    )
    .order("created_at", { ascending: false })
    .limit(400);
  if (sp.exam) query = query.eq("exam_id", sp.exam);
  if (sp.status && sp.status !== "all") query = query.eq("status", sp.status);

  const [{ data: rows }, total, published, awaiting] = await Promise.all([
    query,
    admin.from("question_hints").select("id", { count: "exact", head: true }),
    admin.from("question_hints").select("id", { count: "exact", head: true }).eq("status", "published"),
    admin.from("question_hints").select("id", { count: "exact", head: true }).in("status", ["draft", "approved"]),
  ]);

  const hints = ((rows ?? []) as unknown as HintRow[]).filter((row) => {
    if (!sp.q) return true;
    const needle = sp.q.toLowerCase();
    return (
      row.body.toLowerCase().includes(needle) ||
      (row.questions?.prompt ?? "").toLowerCase().includes(needle) ||
      (row.exams?.title ?? "").toLowerCase().includes(needle) ||
      (row.organizations?.name ?? "").toLowerCase().includes(needle)
    );
  });

  const coveredQuestionIds = new Set(hints.filter((hint) => hint.status === "published").map((hint) => hint.question_id));

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Pedagogical Hints & Answer-Leak Guard"
        title="Examination hints"
        subtitle="A hint helps a student think, remember a method and take the next step — it never states the answer. Published hints appear inside the examination page on the current question, and are only ever sent as guidance text."
        action={<ButtonLink href="/admin/examinations" variant="outline">Examination dashboard</ButtonLink>}
      />
      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Hints configured" value={total.count ?? 0} />
        <StatCard label="Published (visible to students)" value={published.count ?? 0} />
        <StatCard label="Awaiting review" value={awaiting.count ?? 0} />
        <StatCard label="Questions with a published hint" value={coveredQuestionIds.size} hint={selectedExam ? `in this view of ${selectedExam.title}` : "across the hints shown below"} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Input name="q" defaultValue={sp.q} placeholder="Search hint text, question, examination…" aria-label="Search hints" />
        </div>
        <Select name="exam" defaultValue={sp.exam ?? ""} className="w-64" aria-label="Examination">
          <option value="">All examinations</option>
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>{exam.title}</option>
          ))}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Hint status">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
          <option value="all">Every status</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.q || sp.exam || sp.status) && (
          <Link href="/admin/examinations/hints" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      <Section
        title="Add a hint"
        hint="Choose an examination to list its questions. Leave the scope on “all examinations” to reuse the same guidance wherever the question appears; a hint attached to one examination overrides the shared one for that examination only."
      >
        {!selectedExam ? (
          <p className="mb-4 rounded-lg bg-cream px-3 py-2 text-sm text-ink-soft">
            Select an examination above (then press <strong>Filter</strong>) to list its questions and attach a hint.
          </p>
        ) : paperQuestions.length === 0 ? (
          <p className="mb-4 rounded-lg bg-cream px-3 py-2 text-sm text-ink-soft">
            This examination has no questions in its paper yet, so there is nothing to hint at.
          </p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-4">
              <form action={createHintDraft} className="space-y-3">
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="exam_id" value={selectedExam.id} />
                <Field label="Question" hint="Only questions of the selected paper are listed.">
                  <Select name="question_id" required>
                    {paperQuestions.map((question) => (
                      <option key={question.id} value={question.id}>
                        {question.position + 1}. {question.prompt.slice(0, 90)} ({question.type.replace(/_/g, " ")})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Hint level" hint="1 gentle clue · 2 method reminder · 3 guided next step.">
                  <Select name="level" defaultValue="1">
                    {[1, 2, 3].map((level) => (
                      <option key={level} value={level}>{level} — {HINT_LEVEL_LABELS[level as 1 | 2 | 3]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Hint text" hint="Guidance only. Never state the answer, the correct option or the final result.">
                  <Textarea name="body" rows={4} required minLength={8} maxLength={800} placeholder="Remember that… Look again at… What happens when…" />
                </Field>
                <Button type="submit" variant="gold">Save as draft</Button>
              </form>
            </Card>

            <Card className="space-y-3 p-4">
              <p className="text-sm font-semibold text-evergreen-950">Draft with AI</p>
              {availability.configured ? (
                <form action={generateHintDrafts} className="space-y-3">
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="exam_id" value={selectedExam.id} />
                  <Field label="Question" hint={`Suggested by ${availability.provider} · ${availability.model}. Always reviewed by you before publication.`}>
                    <Select name="question_id" required>
                      {paperQuestions.map((question) => (
                        <option key={question.id} value={question.id}>
                          {question.position + 1}. {question.prompt.slice(0, 90)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" variant="outline">Suggest draft hints</Button>
                  <p className="text-xs text-ink-soft">
                    Drafts arrive as <strong>draft</strong> with source <em>AI</em>. A reply that quotes an answer is dropped rather than saved, and nothing becomes visible until you publish it.
                  </p>
                </form>
              ) : (
                <p className="rounded-lg bg-cream px-3 py-2 text-xs text-ink-soft">{MESSAGES.ai_unconfigured_detail}</p>
              )}
            </Card>
          </div>
        )}
      </Section>

      <Section title="Configured hints" hint="Published hints are the only rows a candidate can ever receive. Shared (bank) hints apply to every examination using the question; an examination row overrides them there.">
        {hints.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-8 text-center text-sm text-ink-soft">
            No hints match this view. Students simply see no hint control on questions without a published hint — the examination behaves exactly as before.
          </p>
        ) : (
          <>
            <Table head={["Question", "Scope", "Level", "Hint", "Status", "Review", "Actions"]}>
              {hints.slice((page - 1) * pageSize, page * pageSize).map((hint) => (
              <tr key={hint.id} className="align-top">
                <td className="max-w-[240px]">
                  <span className="block font-medium text-evergreen-950">{hint.questions?.prompt?.slice(0, 110) ?? "Question removed"}</span>
                  <span className="block text-xs text-ink-soft">{hint.questions?.type?.replace(/_/g, " ") ?? "—"} · {hint.organizations?.name ?? "—"}</span>
                </td>
                <td className="max-w-[180px] text-xs text-ink-soft">
                  {hint.exams ? hint.exams.title : "All examinations using this question"}
                </td>
                <td><Badge tone="gold">{hint.level} · {HINT_LEVEL_LABELS[hint.level as 1 | 2 | 3] ?? "Hint"}</Badge></td>
                <td className="max-w-[320px]">
                  <p className="whitespace-pre-wrap text-sm">{hint.body}</p>
                  {hint.status !== "published" && (
                    <form action={updateHintBody} className="mt-2 space-y-2">
                      <input type="hidden" name="back" value={back} />
                      <input type="hidden" name="hint_id" value={hint.id} />
                      <Textarea name="body" rows={3} defaultValue={hint.body} maxLength={800} aria-label="Edit hint text" />
                      <Button type="submit" variant="outline" className="text-xs">Save text</Button>
                    </form>
                  )}
                </td>
                <td>
                  <Badge tone={tone(hint.status)}>{hintStatusLabel(hint.status)}</Badge>
                  <span className="mt-1 block text-xs text-ink-soft">{hint.source === "ai" ? "AI draft" : "Manual"}</span>
                </td>
                <td className="text-xs text-ink-soft">
                  {hint.approver ? `Approved by ${hint.approver.full_name ?? hint.approver.email} · ${fmt(hint.approved_at)}` : "Not reviewed"}
                  {hint.published_at ? <span className="mt-1 block">Published {fmt(hint.published_at)}</span> : null}
                </td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    {hint.status !== "published" && (
                      <form action={setHintStatus}>
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="hint_id" value={hint.id} />
                        <input type="hidden" name="status" value="published" />
                        <Button type="submit" variant="gold" className="text-xs">Publish</Button>
                      </form>
                    )}
                    {hint.status === "published" && (
                      <form action={setHintStatus}>
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="hint_id" value={hint.id} />
                        <input type="hidden" name="status" value="archived" />
                        <Button type="submit" variant="outline" className="text-xs">Archive</Button>
                      </form>
                    )}
                    {hint.status !== "published" && hint.status !== "archived" && (
                      <form action={deleteHint}>
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="hint_id" value={hint.id} />
                        <Button type="submit" variant="outline" className="text-xs">Delete</Button>
                      </form>
                    )}
                    {hint.status === "archived" && (
                      <form action={setHintStatus}>
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="hint_id" value={hint.id} />
                        <input type="hidden" name="status" value="draft" />
                        <Button type="submit" variant="outline" className="text-xs">Restore to draft</Button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            </Table>
            <PageNavigation
              page={page}
              pageSize={pageSize}
              total={hints.length}
              pathname="/admin/examinations/hints"
              query={{ exam: sp.exam, status: sp.status, q: sp.q }}
              label="hints"
            />
          </>
        )}
      </Section>
    </>
  );
}
