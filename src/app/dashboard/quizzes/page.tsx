import { FormButton } from "@/components/FormButton";
import { CollectionToolbar, type CollectionParams } from "@/components/dashboard/CollectionToolbar";
import { pageNumber } from "@/lib/pagination";
import { Badge, ButtonLink, Card, EmptyState, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { deleteQuiz, duplicateQuiz, setQuizStatus, startSession } from "./actions";

export const metadata: Metadata = { title: "Quiz Studio" };
export const dynamic = "force-dynamic";

export default async function QuizzesPage({ searchParams }: { searchParams: Promise<CollectionParams & { e?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();
  const page = pageNumber(sp.page);
  const pageSize = 18;
  const statuses = ["draft", "published", "archived"];
  let query = supabase.from("quizzes")
    .select("*, quiz_questions(count), quiz_sessions(count)", { count: "exact" })
    .eq("organization_id", org.id);
  const search = sp.q?.trim().slice(0, 160).replace(/[%_\\]/g, " ").trim();
  if (search) query = query.ilike("title", `%${search}%`);
  if (sp.status && statuses.includes(sp.status)) query = query.eq("status", sp.status);
  if (sp.sort === "title") query = query.order("title");
  else query = query.order("updated_at", { ascending: sp.sort === "oldest" });
  const { data: quizzes, count, error } = await query.order("id").range((page - 1) * pageSize, page * pageSize - 1);

  return (
    <>
      <PageTitle
        title="Quiz Studio"
        subtitle="Assemble quizzes from your question bank, publish them, then run live sessions or attach them to examinations."
        action={<ButtonLink href="/dashboard/quizzes/new">+ New quiz</ButtonLink>}
      />
      {sp.e === "module" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The Live Quizzes module is temporarily disabled platform-wide by the administrator. Existing sessions are unaffected.
        </p>
      )}
      <CollectionToolbar path="/dashboard/quizzes" params={{ q: sp.q, status: sp.status, sort: sp.sort }} statuses={statuses} page={page} pageSize={pageSize} total={count ?? 0} noun="quizzes" failed={Boolean(error)} />
      {error ? null : (quizzes ?? []).length === 0 ? (
        <EmptyState
          title={sp.q || sp.status || page > 1 ? "No quizzes on this page" : "No quizzes yet"}
          body="Create a quiz, attach published questions from your bank, and start your first live session in minutes."
          action={<ButtonLink href="/dashboard/quizzes/new">Create your first quiz</ButtonLink>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(quizzes ?? []).map((q) => {
            const nQ = (q.quiz_questions as { count: number }[])?.[0]?.count ?? 0;
            const nS = (q.quiz_sessions as { count: number }[])?.[0]?.count ?? 0;
            return (
              <Card key={q.id} className="flex flex-col p-5">
                <div className="flex items-center gap-2">
                  <Badge tone={q.status === "published" ? "green" : "gray"}>{q.status}</Badge>
                  <span className="text-xs text-ink-soft">{nQ} questions · {nS} sessions</span>
                </div>
                <h2 className="mt-2 font-display text-lg font-semibold text-evergreen-950">{q.title}</h2>
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-ink-soft">{q.description || "No description."}</p>
                <p className="mt-2 text-xs text-ink-soft">Updated {fmtDateTime(q.updated_at)}</p>

                <div className="mt-4 space-y-2 border-t border-evergreen-900/10 pt-4">
                  {q.status === "published" && nQ > 0 && (
                    <form action={startSession} className="flex gap-2">
                      <input type="hidden" name="quiz_id" value={q.id} />
                      <select aria-label="Live session pacing" name="mode" className="flex-1 rounded-lg border border-evergreen-900/15 bg-white px-2 py-2 text-sm">
                        <option value="synchronized">Synchronized (host-paced)</option>
                        <option value="self_paced">Self-paced</option>
                      </select>
                      <FormButton type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-evergreen-700 px-4 py-2 text-sm font-medium text-white hover:bg-evergreen-800">
                        ▶ Go live
                      </FormButton>
                    </form>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <Link href={`/dashboard/quizzes/${q.id}`} className="inline-flex min-h-11 items-center font-semibold text-evergreen-700 underline-offset-2 hover:underline">Edit &amp; preview</Link>
                    <form action={duplicateQuiz}><input type="hidden" name="id" value={q.id} /><FormButton type="submit" className="inline-flex min-h-11 items-center gap-2 text-ink-soft underline-offset-2 hover:underline">Duplicate</FormButton></form>
                    {q.status !== "published" ? (
                      <form action={setQuizStatus}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="status" value="published" /><FormButton type="submit" className="inline-flex min-h-11 items-center gap-2 text-gold-700 underline-offset-2 hover:underline">Publish</FormButton></form>
                    ) : (
                      <form action={setQuizStatus}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="status" value="draft" /><FormButton type="submit" className="inline-flex min-h-11 items-center gap-2 text-ink-soft underline-offset-2 hover:underline">Unpublish</FormButton></form>
                    )}
                    <form action={deleteQuiz}><input type="hidden" name="id" value={q.id} /><FormButton type="submit" className="inline-flex min-h-11 items-center gap-2 text-red-700 underline-offset-2 hover:underline">Delete</FormButton></form>
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
