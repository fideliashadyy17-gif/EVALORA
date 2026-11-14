import { Badge, Button, ButtonLink, Card, EmptyState, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { activeOrg, can, MARKER_ROLES, requireUser } from "@/lib/auth";
import type { RubricCriterion } from "@/lib/grading";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addCriterion, attachRubric, deleteCriterion, detachRubric, updateCriterion, updateRubric } from "../actions";

export const metadata: Metadata = { title: "Rubric" };
export const dynamic = "force-dynamic";

interface LinkRow {
  id: string;
  question_id: string | null;
  exams?: { title?: string } | null;
  questions?: { prompt?: string } | null;
}

const MESSAGES: Record<string, string> = {
  created: "Rubric created. Add the criteria that will make up the mark.",
  saved: "Rubric details saved.",
  criterion: "Criterion saved.",
  removed: "Criterion removed and the total recalculated.",
  attached: "Rubric attached to the examination.",
  detached: "Rubric detached from the examination.",
};

const ERRORS: Record<string, string> = {
  title: "A rubric needs a title.",
  status: "That status is not recognised.",
  label: "A criterion needs a description of what it rewards.",
  marks: "Criterion maximum must be greater than 0 and at most 1000.",
  criterion: "The criterion could not be saved.",
  inuse: "This criterion has already been used to mark answers, so it cannot be removed. Archive the rubric instead.",
  exam: "That examination is not available in this workspace.",
  question: "That question is not part of this examination.",
  attach: "This rubric is already attached at that level.",
  detach: "The rubric could not be detached.",
  save: "The rubric could not be saved.",
};

export default async function RubricDetailPage({
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
  const canMark = can(ctx, org.id, MARKER_ROLES);
  const supabase = await createClient();

  const { data: rubric } = await supabase
    .from("grading_rubrics")
    .select("*")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!rubric) notFound();

  const [{ data: criteria }, { data: links }, { data: exams }] = await Promise.all([
    supabase.from("grading_rubric_criteria").select("*").eq("rubric_id", id).order("position"),
    supabase
      .from("exam_rubric_links")
      .select("id, question_id, exams(title), questions(prompt)")
      .eq("rubric_id", id)
      .eq("organization_id", org.id),
    supabase.from("exams").select("id, title").eq("organization_id", org.id).order("created_at", { ascending: false }),
  ]);

  const bands = (criteria ?? []) as RubricCriterion[];
  const derived = bands.reduce((sum, c) => sum + Number(c.max_marks), 0);

  return (
    <>
      <PageTitle
        eyebrow="Marking & Moderation · Rubric Designer"
        title={rubric.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={rubric.status === "published" ? "green" : rubric.status === "draft" ? "amber" : "gray"}>
              {rubric.status}
            </Badge>
            <span>
              {Number(rubric.total_marks)} marks · {bands.length} criteria · updated {fmtDateTime(rubric.updated_at)}
            </span>
          </span>
        }
        action={<ButtonLink href="/dashboard/rubrics" variant="outline">All rubrics</ButtonLink>}
      />

      {sp.ok && MESSAGES[sp.ok] && (
        <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          {MESSAGES[sp.ok]}
        </p>
      )}
      {sp.e && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {ERRORS[sp.e] ?? "The request could not be completed."}
        </p>
      )}

      {Number(rubric.total_marks) !== derived && (
        <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The stored total ({Number(rubric.total_marks)}) does not match the criteria ({derived}). Reload the page; the
          stored total is recalculated by the database whenever criteria change.
        </p>
      )}

      {!canMark ? (
        <EmptyState title="Read-only" body="Only owners, administrators, teachers and correctors can edit rubrics." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Criteria</h2>
              <p className="mt-1 text-sm text-ink-soft">
                The rubric total is the sum of these maxima — bands can never add up to something different from the mark
                they produce.
              </p>

              {bands.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-evergreen-900/30 px-4 py-6 text-sm text-ink-soft">
                  No criteria yet. Add the first band below.
                </p>
              ) : (
                <ol className="mt-4 space-y-3">
                  {bands.map((c, index) => (
                    <li key={c.id} className="rounded-xl border border-evergreen-900/15 bg-white p-3">
                      <form action={updateCriterion} className="space-y-3">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="rubric_id" value={rubric.id} />
                        <div className="flex flex-wrap items-start gap-3">
                          <span className="mt-2 w-6 shrink-0 text-sm font-semibold text-ink-soft">{index + 1}</span>
                          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[5rem_1fr_7rem]">
                            <Field label="Code">
                              <Input name="code" defaultValue={c.code ?? ""} maxLength={12} placeholder="A1" />
                            </Field>
                            <Field label="Criterion">
                              <Input name="label" defaultValue={c.label} required maxLength={300} />
                            </Field>
                            <Field label="Max marks">
                              <Input name="max_marks" type="number" step="0.25" min="0.25" max="1000" defaultValue={Number(c.max_marks)} required />
                            </Field>
                          </div>
                        </div>
                        <Field label="What this band rewards" hint="Shown to markers beside the mark box.">
                          <Textarea name="description" rows={2} maxLength={4000} defaultValue={c.description ?? ""} />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" variant="outline">Save criterion</Button>
                        </div>
                      </form>
                      <form action={deleteCriterion} className="mt-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="rubric_id" value={rubric.id} />
                        <Button type="submit" variant="ghost" className="text-xs text-red-700 hover:bg-red-50">
                          Remove criterion
                        </Button>
                      </form>
                    </li>
                  ))}
                </ol>
              )}

              <form action={addCriterion} className="mt-5 rounded-xl border border-evergreen-900/15 bg-evergreen-50/40 p-3">
                <input type="hidden" name="rubric_id" value={rubric.id} />
                <h3 className="text-sm font-semibold text-evergreen-900">Add a criterion</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-[5rem_1fr_7rem]">
                  <Field label="Code">
                    <Input name="code" maxLength={12} placeholder="B2" />
                  </Field>
                  <Field label="Criterion">
                    <Input name="label" required maxLength={300} placeholder="Use of evidence" />
                  </Field>
                  <Field label="Max marks">
                    <Input name="max_marks" type="number" step="0.25" min="0.25" max="1000" defaultValue={5} required />
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="What this band rewards">
                    <Textarea name="description" rows={2} maxLength={4000} />
                  </Field>
                </div>
                <Button type="submit" className="mt-3">Add criterion</Button>
              </form>
            </Card>

            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Attached examinations</h2>
              <p className="mt-1 text-sm text-ink-soft">
                An examination-wide rubric applies to every open-ended answer unless a question has its own rubrics.
              </p>
              {(links ?? []).length === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">Not attached to any examination yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {((links ?? []) as unknown as LinkRow[]).map((link) => (
                    <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-evergreen-900/15 bg-white px-3 py-2">
                      <div className="min-w-0 text-sm">
                        <span className="font-medium text-evergreen-950">{link.exams?.title ?? "Examination"}</span>
                        <span className="ml-2 text-xs text-ink-soft">
                          {link.question_id ? `question only: ${link.questions?.prompt?.slice(0, 70) ?? "question"}` : "examination-wide"}
                        </span>
                      </div>
                      <form action={detachRubric}>
                        <input type="hidden" name="link_id" value={link.id} />
                        <input type="hidden" name="rubric_id" value={rubric.id} />
                        <Button type="submit" variant="ghost" className="text-xs text-red-700 hover:bg-red-50">Detach</Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              {(exams ?? []).length > 0 && (
                <form action={attachRubric} className="mt-4 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="rubric_id" value={rubric.id} />
                  <div className="min-w-[220px] flex-1">
                    <Field label="Attach to examination">
                      <Select name="exam_id" required defaultValue="">
                        <option value="" disabled>Choose an examination</option>
                        {(exams ?? []).map((exam) => (
                          <option key={exam.id} value={exam.id}>{exam.title}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Button type="submit" variant="outline">Attach</Button>
                </form>
              )}
            </Card>
          </div>

          <Card className="h-fit p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Rubric details</h2>
            <form action={updateRubric} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={rubric.id} />
              <Field label="Title">
                <Input name="title" defaultValue={rubric.title} required maxLength={200} />
              </Field>
              <Field label="Framework">
                <Input name="framework" defaultValue={rubric.framework ?? ""} maxLength={60} />
              </Field>
              <Field label="Description">
                <Textarea name="description" rows={4} maxLength={4000} defaultValue={rubric.description ?? ""} />
              </Field>
              <Field label="Status" hint="Archive a rubric to retire it without deleting the marks it produced.">
                <Select name="status" defaultValue={rubric.status}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </Select>
              </Field>
              <Button type="submit" className="w-full">Save details</Button>
            </form>
            <dl className="mt-5 space-y-2 border-t border-evergreen-900/10 pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Derived total</dt>
                <dd className="font-semibold text-evergreen-950">{derived}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Criteria</dt>
                <dd className="font-semibold text-evergreen-950">{bands.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Created</dt>
                <dd className="text-ink">{fmtDateTime(rubric.created_at)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}
    </>
  );
}
