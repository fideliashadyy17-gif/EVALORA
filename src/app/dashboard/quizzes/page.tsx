import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, EmptyState, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { CheckCircle2, PenSquare, Radio } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { deleteQuiz, duplicateQuiz, setQuizStatus, startSession } from "./actions";

export const metadata: Metadata = { title: "Quiz Studio" };
export const dynamic = "force-dynamic";

export default async function QuizzesPage({ searchParams }: { searchParams: Promise<{ e?: string; q?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 12;
  let quizQuery = supabase
    .from("quizzes")
    .select("*, quiz_questions(id), quiz_sessions(id)", { count: "exact" })
    .eq("organization_id", org.id)
    .order("updated_at", { ascending: false });
  if (sp.q?.trim()) quizQuery = quizQuery.ilike("title", `%${sp.q.trim()}%`);
  if (sp.status) quizQuery = quizQuery.eq("status", sp.status);
  const [
    { data: quizzes, count: quizTotal },
    { count: publishedQuizzes },
    { count: liveSessions },
  ] = await Promise.all([
    quizQuery.range((page - 1) * pageSize, page * pageSize - 1),
    supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "published"),
    supabase.from("quiz_sessions").select("id", { count: "exact", head: true }).eq("organization_id", org.id).in("status", ["lobby", "live"]),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Quiz Assembly & Live Launch"
        title="Quiz Studio"
        subtitle="Assemble quizzes from your question bank, publish them, then run live sessions or attach them to examinations."
        action={<ButtonLink href="/dashboard/quizzes/new">+ New quiz</ButtonLink>}
      />
      {sp.e === "module" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The Live Quizzes module is temporarily disabled platform-wide by the administrator. Existing sessions are unaffected.
        </p>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Matching quizzes" value={quizTotal ?? 0} icon={<PenSquare className="h-5 w-5" />} />
        <StatCard label="Published papers" value={publishedQuizzes ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Open / live sessions" value={liveSessions ?? 0} icon={<Radio className="h-5 w-5" />} />
      </div>
      <form method="get" className="mb-5 grid gap-3 rounded-2xl border border-evergreen-900/10 bg-paper p-4 sm:grid-cols-[minmax(0,1fr)_13rem_auto_auto] sm:items-end">
        <label className="block text-sm font-medium text-evergreen-900">Search quizzes
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Quiz title" className="mt-1.5" />
        </label>
        <label className="block text-sm font-medium text-evergreen-900">Status
          <Select name="status" defaultValue={sp.status ?? ""} className="mt-1.5">
            <option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
          </Select>
        </label>
        <Button type="submit" variant="outline">Apply filters</Button>
        <Link href="/dashboard/quizzes" className="inline-flex min-h-11 items-center text-sm font-medium text-evergreen-800 underline underline-offset-2">Clear</Link>
      </form>
      {(quizzes ?? []).length === 0 ? (
        <EmptyState
          title={sp.q || sp.status ? "No quizzes match these filters" : "No quizzes yet"}
          body={sp.q || sp.status ? "Try another search or clear the filters." : "Create a quiz, attach published questions from your bank, and start your first live session in minutes."}
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
                      <Select name="mode" aria-label="Session pacing mode" className="flex-1 py-2 text-sm">
                        <option value="synchronized">Synchronized (host-paced)</option>
                        <option value="self_paced">Self-paced</option>
                      </Select>
                      <Button type="submit" className="px-4 py-2 text-sm">
                        ▶ Go live
                      </Button>
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
      <PageNavigation page={page} pageSize={pageSize} total={quizTotal ?? 0} pathname="/dashboard/quizzes" query={{ q: sp.q, status: sp.status }} label="quizzes" />
    </>
  );
}
