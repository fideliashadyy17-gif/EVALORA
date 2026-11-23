import { ButtonLink, Card, PageTitle } from "@/components/ui";
import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { hasCapability } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { FileText, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "Question Paper Builder" };

export default async function PapersPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard");
  const supabase = await createClient();
  if (!(await hasCapability(supabase, ctx, org.id, "examinations")) || !(await hasCapability(supabase, ctx, org.id, "quiz_management"))) redirect("/dashboard/exams?e=module");
  const { data: quizzes } = await supabase.from("quizzes").select("id,title,status,updated_at,settings,quiz_questions(id)").eq("organization_id", org.id).order("updated_at", { ascending: false }).limit(200);
  return <>
    <PageTitle eyebrow="Assessment Authoring · Reusable Papers" title="Question Paper Builder" subtitle="Create, organise and publish reusable papers from your question bank. Papers are built on EVALORA's existing quiz/question engine." action={<ButtonLink href="/dashboard/papers/new" variant="gold"><Plus className="mr-2 h-4 w-4" />New question paper</ButtonLink>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {(quizzes ?? []).map((q) => {
        const meta = (q.settings as Record<string, unknown> | null)?.paper_builder as Record<string, unknown> | undefined;
        return <Card key={q.id} className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="rounded-lg bg-cream p-2 text-evergreen-700"><FileText className="h-5 w-5" /></span><div className="min-w-0"><h2 className="truncate font-display text-lg font-semibold text-evergreen-950">{q.title}</h2><p className="mt-1 text-xs capitalize text-ink-soft">{q.status} · {(q.quiz_questions as {id:string}[] | null)?.length ?? 0} questions{meta?.max_marks ? ` · ${meta.max_marks} marks` : ""}</p></div></div></div><div className="mt-4 flex items-center justify-between"><span className="text-xs text-ink-soft">Updated {new Date(q.updated_at).toLocaleDateString()}</span><Link href={`/dashboard/papers/${q.id}`} className="inline-flex items-center gap-1 rounded-lg border border-evergreen-900/20 px-3 py-2 text-sm font-semibold text-evergreen-800 hover:bg-cream"><Pencil className="h-4 w-4" /> Open</Link></div></Card>;
      })}
      {(quizzes ?? []).length === 0 && <Card className="col-span-full border-dashed p-10 text-center"><FileText className="mx-auto h-9 w-9 text-evergreen-700" /><h2 className="mt-3 font-display text-xl font-semibold text-evergreen-950">Start with a blank paper</h2><p className="mx-auto mt-2 max-w-lg text-sm text-ink-soft">Create a reusable question paper, set class and curriculum details, add sections, and assemble existing or newly authored questions.</p><ButtonLink className="mt-5" href="/dashboard/papers/new" variant="gold">Create a paper</ButtonLink></Card>}
    </div>
  </>;
}
