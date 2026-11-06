import { Badge, Button, ButtonLink, Card, EmptyState, Field, Input, PageTitle, Textarea } from "@/components/ui";
import { activeOrg, can, MARKER_ROLES, requireUser } from "@/lib/auth";
import { loadRubrics } from "@/lib/grading";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { createRubric } from "./actions";

export const metadata: Metadata = { title: "Grading rubrics" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "amber" | "green" | "gray"> = {
  draft: "amber",
  published: "green",
  archived: "gray",
};

export default async function RubricsPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; ok?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  const canMark = can(ctx, org.id, MARKER_ROLES);
  const supabase = await createClient();
  const rubrics = await loadRubrics(supabase, org.id);

  const { data: criteria } = await supabase
    .from("grading_rubric_criteria")
    .select("id, rubric_id")
    .eq("organization_id", org.id);
  const counts = new Map<string, number>();
  for (const c of criteria ?? []) counts.set(c.rubric_id, (counts.get(c.rubric_id) ?? 0) + 1);

  return (
    <>
      <PageTitle
        title="Grading rubrics"
        subtitle="Mark open-ended answers criterion by criterion. Totals are derived from the criteria, so a rubric can never drift out of step with its own bands."
      />
      {sp.ok && (
        <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          Rubric created.
        </p>
      )}
      {sp.e && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {sp.e === "title"
            ? "A rubric needs a title."
            : "The request could not be completed. Check your workspace and permissions."}
        </p>
      )}

      {!canMark ? (
        <EmptyState
          title="Rubrics are managed by markers"
          body="Only owners, administrators, teachers and correctors can build rubrics in this workspace."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div>
            {rubrics.length === 0 ? (
              <EmptyState
                title="No rubrics yet"
                body="A rubric splits a question into criteria, each with its own maximum. Once attached to an examination, markers score every criterion and the total becomes the mark."
              />
            ) : (
              <div className="space-y-3">
                {rubrics.map((rubric) => (
                  <Card key={rubric.id} className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/dashboard/rubrics/${rubric.id}`} className="font-semibold text-evergreen-900 underline-offset-4 hover:underline">
                          {rubric.title}
                        </Link>
                        <Badge tone={STATUS_TONE[rubric.status] ?? "gray"}>{rubric.status}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {Number(rubric.total_marks)} marks across {counts.get(rubric.id) ?? 0} criteria
                        {rubric.framework ? ` · ${rubric.framework}` : ""}
                      </p>
                      <p className="text-xs text-slate-400">Updated {fmtDateTime(rubric.updated_at)}</p>
                    </div>
                    <ButtonLink href={`/dashboard/rubrics/${rubric.id}`} variant="outline">
                      Open
                    </ButtonLink>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <Card>
            <h2 className="text-lg font-semibold text-evergreen-900">New rubric</h2>
            <form action={createRubric} className="mt-3 space-y-3">
              <Field label="Title">
                <Input name="title" required maxLength={200} placeholder="Essay — argument and evidence" />
              </Field>
              <Field label="Framework" hint="Optional, e.g. WAEC, Cambridge, internal 4-band">
                <Input name="framework" maxLength={60} placeholder="WAEC" />
              </Field>
              <Field label="Description">
                <Textarea name="description" rows={3} maxLength={4000} placeholder="What this rubric is for and how markers should apply it." />
              </Field>
              <Button type="submit" className="w-full">Create rubric</Button>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
