import { Badge, ButtonLink, Card, EmptyState, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { deleteQuiz, duplicateQuiz, setQuizStatus, startSession } from "./actions";

export const metadata: Metadata = { title: "Quiz Studio" };
export const dynamic = "force-dynamic";

export default async function QuizzesPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();
  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("*, quiz_questions(id), quiz_sessions(id)")
    .eq("organization_id", org.id)
    .order("updated_at", { ascending: false });

  return (
    <>
      <PageTitle
        title="Quiz Studio"
        subtitle="Assemble quizzes from your question bank, publish them, then run live sessions or attach them to examinations."
        action={<ButtonLink href="/dashboard/quizzes/new">+ New quiz</ButtonLink>}
      />
      {(quizzes ?? []).length === 0 ? (
        <EmptyState
          title="No quizzes yet"
          body="Create a quiz, attach published questions from your bank, and start your first live session in minutes."
          action={<ButtonLink href="/dashboard/quizzes/new">Create your first quiz</ButtonLink>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(quizzes ?? []).map((q) => {
            const nQ = (q.quiz_questions as unknown[])?.length ?? 0;
            const nS = (q.quiz_sessions as unknown[])?.length ?? 0;
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
                      <select name="mode" className="flex-1 rounded-lg border border-evergreen-900/15 bg-white px-2 py-2 text-sm">
                        <option value="synchronized">Synchronized (host-paced)</option>
                        <option value="self_paced">Self-paced</option>
                      </select>
                      <button className="rounded-lg bg-evergreen-700 px-4 py-2 text-sm font-medium text-white hover:bg-evergreen-800">
                        ▶ Go live
                      </button>
                    </form>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <Link href={`/dashboard/quizzes/${q.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Edit &amp; preview</Link>
                    <form action={duplicateQuiz}><input type="hidden" name="id" value={q.id} /><button className="text-ink-soft underline-offset-2 hover:underline">Duplicate</button></form>
                    {q.status !== "published" ? (
                      <form action={setQuizStatus}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="status" value="published" /><button className="text-gold-700 underline-offset-2 hover:underline">Publish</button></form>
                    ) : (
                      <form action={setQuizStatus}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="status" value="draft" /><button className="text-ink-soft underline-offset-2 hover:underline">Unpublish</button></form>
                    )}
                    <form action={deleteQuiz}><input type="hidden" name="id" value={q.id} /><button className="text-red-700 underline-offset-2 hover:underline">Delete</button></form>
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
