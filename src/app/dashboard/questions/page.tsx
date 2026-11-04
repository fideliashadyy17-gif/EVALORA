import { MathText } from "@/components/MathText";
import { Badge, Button, ButtonLink, Card, EmptyState, Field, Input, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { createCategory, deleteQuestion, setQuestionStatus } from "./actions";
import { ImportCsv } from "./ImportCsv";

export const metadata: Metadata = { title: "Question Bank" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "green" | "amber" | "gray"> = {
  published: "green",
  pending_review: "amber",
  draft: "gray",
  archived: "gray",
};

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("questions")
    .select("*, question_options(id), question_categories(name)")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.q) query = query.ilike("prompt", `%${sp.q}%`);
  if (sp.status) query = query.eq("status", sp.status);
  const { data: questions } = await query;

  const { data: categories } = await supabase
    .from("question_categories")
    .select("*")
    .eq("organization_id", org.id)
    .order("name");

  return (
    <>
      <PageTitle
        title="Question Bank"
        subtitle="Reusable questions for quizzes and examinations. Imports wait here for review before they can be published."
        action={<ButtonLink href="/dashboard/questions/new">+ New question</ButtonLink>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          <form className="mb-4 flex flex-wrap gap-2" method="get">
            <Input name="q" placeholder="Search prompts…" defaultValue={sp.q} className="w-64" />
            <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-evergreen-900/15 bg-white px-3 py-2.5 text-sm shadow-sm">
              <option value="">All statuses</option>
              <option value="published">Published</option>
              <option value="pending_review">Pending review</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
            <Button type="submit" variant="outline">Filter</Button>
          </form>

          {(questions ?? []).length === 0 ? (
            <EmptyState
              title="No questions yet"
              body="Create your first question, or import a CSV — imports arrive as Pending review so nothing publishes unchecked."
              action={<ButtonLink href="/dashboard/questions/new">Create a question</ButtonLink>}
            />
          ) : (
            <div className="space-y-3">
              {(questions ?? []).map((q) => (
                <Card key={q.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="green">{q.type.replace(/_/g, " ")}</Badge>
                        <Badge tone={STATUS_TONE[q.status] ?? "gray"}>{q.status.replace(/_/g, " ")}</Badge>
                        <Badge tone="gold">{q.points} pt{Number(q.points) !== 1 ? "s" : ""}</Badge>
                        {q.topic && <Badge tone="gray">{q.topic}</Badge>}
                      </div>
                      <div className="mt-2 line-clamp-2 font-medium text-ink">
                        <MathText text={q.prompt} />
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">
                        {(q.question_options as unknown[])?.length ?? 0} options
                        {(q.question_categories as { name: string } | null)?.name
                          ? ` · ${(q.question_categories as { name: string }).name}`
                          : ""}{" "}
                        · {q.difficulty}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/questions/${q.id}`} className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Edit</Link>
                      {q.status !== "published" && (
                        <form action={setQuestionStatus}>
                          <input type="hidden" name="id" value={q.id} />
                          <input type="hidden" name="status" value="published" />
                          <button className="text-sm font-medium text-gold-700 underline-offset-2 hover:underline">Publish</button>
                        </form>
                      )}
                      <form action={deleteQuestion}>
                        <input type="hidden" name="id" value={q.id} />
                        <button className="text-sm font-medium text-red-700 underline-offset-2 hover:underline">Delete</button>
                      </form>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <ImportCsv />
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Categories</h2>
            <ul className="mt-3 space-y-1.5">
              {(categories ?? []).map((c) => (
                <li key={c.id} className="text-sm text-ink">{c.name}</li>
              ))}
              {(categories ?? []).length === 0 && <li className="text-sm text-ink-soft">None yet.</li>}
            </ul>
            <form action={createCategory} className="mt-4 flex gap-2">
              <Input name="name" placeholder="New category" required />
              <Button type="submit" variant="outline">Add</Button>
            </form>
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Mathematics</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Write LaTeX anywhere: <code className="rounded bg-cream px-1">$x^2$</code> inline,{" "}
              <code className="rounded bg-cream px-1">{"$$\\frac{3}{4}$$"}</code> as a block. It renders for
              participants exactly as in the editor preview.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
