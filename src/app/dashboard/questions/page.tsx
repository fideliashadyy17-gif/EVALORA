import { RichContent } from "@/components/RichContent";
import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, EmptyState, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CheckCircle2, Clock3, FolderTree, Library } from "lucide-react";
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
  searchParams: Promise<{ q?: string; status?: string; class?: string; curr?: string; e?: string; page?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 20;
  const supabase = await createClient();

  let query = supabase
    .from("questions")
    .select("*, question_options(id), question_categories(name)", { count: "exact" })
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });
  if (sp.q) query = query.ilike("prompt", `%${sp.q}%`);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.class) query = query.eq("class_id", sp.class);
  if (sp.curr) query = query.eq("curriculum", sp.curr);
  const { data: questions, count: questionTotal } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  const { data: classList } = await supabase
    .from("classes")
    .select("id, name")
    .eq("organization_id", org.id)
    .order("grade_order")
    .order("name");

  const [
    { data: categories },
    { count: publishedCount },
    { count: reviewCount },
  ] = await Promise.all([
    supabase.from("question_categories").select("*").eq("organization_id", org.id).order("name"),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "published"),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("organization_id", org.id).in("status", ["pending_review", "draft"]),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Institutional Question Bank"
        title="Question Bank"
        subtitle="Reusable questions for quizzes and examinations. Imports wait here for review before they can be published."
        action={<ButtonLink href="/dashboard/questions/new">+ New question</ButtonLink>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Matching questions" value={questionTotal ?? 0} icon={<Library className="h-5 w-5" />} />
        <StatCard label="Published" value={publishedCount ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Draft / pending review" value={reviewCount ?? 0} icon={<Clock3 className="h-5 w-5" />} />
        <StatCard label="Categories" value={(categories ?? []).length} icon={<FolderTree className="h-5 w-5" />} />
      </div>

      {sp.e === "not_ready" && (
        <p className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900 ring-1 ring-red-600/30">
          That question cannot be published yet. Open it and check its answer key, accepted answers, numeric answer, pairs/items or marking criteria.
        </p>
      )}
      {sp.e === "not_found" && (
        <p className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900 ring-1 ring-red-600/30">That question no longer exists.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          <form className="mb-4 flex flex-wrap gap-2" method="get">
            <Input name="q" placeholder="Search prompts…" defaultValue={sp.q} className="w-64" aria-label="Search question prompts" />
            <Select name="status" defaultValue={sp.status ?? ""} aria-label="Filter by question status">
              <option value="">All statuses</option>
              <option value="published">Published</option>
              <option value="pending_review">Pending review</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </Select>
            <Select name="class" defaultValue={sp.class ?? ""} aria-label="Filter by class">
              <option value="">All classes</option>
              {(classList ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button type="submit" variant="outline">Apply filters</Button>
            <Link href="/dashboard/questions" className="inline-flex min-h-11 items-center text-sm font-medium text-evergreen-800 underline underline-offset-2">Clear</Link>
          </form>

          {(questions ?? []).length === 0 ? (
            <EmptyState
              title={sp.q || sp.status || sp.class ? "No questions match these filters" : "No questions yet"}
              body={sp.q || sp.status || sp.class ? "Try another search or clear the filters. No question content has been changed." : "Create your first question, or import a CSV — imports arrive as Pending review so nothing publishes unchecked."}
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
                        <RichContent doc={(q as { prompt_doc?: import("@/lib/content").RichDoc | null }).prompt_doc ?? null} text={q.prompt} />
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
      <PageNavigation page={page} pageSize={pageSize} total={questionTotal ?? 0} pathname="/dashboard/questions" query={{ q: sp.q, status: sp.status, class: sp.class, curr: sp.curr }} label="questions" />
    </>
  );
}
