import { Button, ButtonLink, Card, PageTitle } from "@/components/ui";
import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { hasCapability } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { duplicatePaper, setPaperStatus } from "../actions";
import { PaperBuilder } from "../PaperBuilder";
import { redirect } from "next/navigation";

export const metadata = { title: "Edit question paper" };

export default async function EditPaperPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ addQuestion?: string; e?: string; ok?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  const ctx = await requireUser(); const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard");
  const supabase = await createClient();
  if (!(await hasCapability(supabase, ctx, org.id, "examinations")) || !(await hasCapability(supabase, ctx, org.id, "quiz_management"))) redirect("/dashboard/exams?e=module");
  const [{ data: quiz }, { data: classes }, { data: subjects }, { data: programmes }] = await Promise.all([
    supabase.from("quizzes").select("id,title,description,status,settings").eq("id", id).eq("organization_id", org.id).maybeSingle(),
    supabase.from("classes").select("id,name").eq("organization_id", org.id).eq("status", "active").order("grade_order").order("name"),
    supabase.from("subjects").select("id,name").eq("organization_id", org.id).order("name"),
    supabase.from("curriculum_programmes").select("key,name").eq("organization_id", org.id).eq("is_active", true).order("name"),
  ]);
  if (!quiz) redirect("/dashboard/papers?e=not_found");
  const [{ data: links }, { data: bank }] = await Promise.all([
    supabase.from("quiz_questions").select("question_id,position,points").eq("quiz_id", id).order("position"),
    supabase.from("questions").select("id,prompt,prompt_doc,type,points,status,topic,question_options(label,content_doc,position)").eq("organization_id", org.id).in("status", ["published", "draft"]).order("created_at", { ascending: false }).limit(500),
  ]);
  const settings = quiz.settings as Record<string, unknown> | null;
  const meta = (settings?.paper_builder && typeof settings.paper_builder === "object" ? settings.paper_builder : {}) as Record<string, unknown>;
  const linkRows = [...(links ?? [])].sort((a, b) => a.position - b.position);
  const storedSections = Array.isArray(meta.sections) ? meta.sections as { id?: string; title?: string; question_ids?: string[] }[] : [];
  const assigned = new Set<string>();
  const sections = storedSections.map((s, index) => {
    const question_ids = (s.question_ids ?? []).filter((qid) => linkRows.some((l) => l.question_id === qid) && !assigned.has(qid) && Boolean(assigned.add(qid)));
    return { id: s.id ?? `section-${index + 1}`, title: s.title ?? `Section ${index + 1}`, question_ids };
  }).filter((s) => s.question_ids.length || storedSections.length > 0);
  const remaining = linkRows.map((l) => l.question_id).filter((qid) => !assigned.has(qid));
  if (remaining.length || sections.length === 0) sections.push({ id: "section-default", title: sections.length ? "Additional questions" : "Section A", question_ids: remaining });
  const initial = {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description ?? "",
    status: quiz.status,
    instructions: String(meta.instructions ?? ""),
    class_id: String(meta.class_id ?? ""),
    subject_id: String(meta.subject_id ?? ""),
    programme: String(meta.programme ?? ""),
    curriculum: String(meta.curriculum ?? ""),
    max_marks: Number(meta.max_marks ?? 0),
    randomize_questions: Boolean(settings?.randomize_questions),
    randomize_options: Boolean(settings?.randomize_options),
    sections,
    question_points: Object.fromEntries(linkRows.map((l) => [l.question_id, Number(l.points ?? 1)])),
  };
  const attached = await supabase.from("exams").select("id", { count: "exact", head: true }).eq("quiz_id", id);
  const protectedPaper = (attached.count ?? 0) > 0;
  return <>
    <PageTitle eyebrow="Assessment Authoring · Reusable Paper" title={quiz.title} subtitle="Edit paper metadata and composition. An examination-linked paper is protected; duplicate it to safely make a new version." action={<ButtonLink href="/dashboard/papers" variant="outline">All papers</ButtonLink>} />
    {sp.e && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{{ empty: "Add at least one question before publishing.", protected: "Papers already used by examinations cannot be changed or unpublished.", save: "The paper could not be saved." }[sp.e] ?? "The requested operation could not be completed."}</p>}
    {sp.ok && <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Paper {sp.ok}.</p>}
    <form action={duplicatePaper} className="mb-4"><input type="hidden" name="id" value={id} /><Button type="submit" variant="outline">Duplicate as draft</Button></form>
    {protectedPaper && <Card className="mb-4 border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Protected paper:</strong> this paper is already attached to an examination. Editing is blocked to preserve exam history. Use Duplicate as draft to create a version for future examinations.</Card>}
    <PaperBuilder initial={initial} bank={(bank ?? []).map((q) => ({ ...q, prompt_doc: (q.prompt_doc as never) ?? null, points: Number(q.points) }))} classes={classes ?? []} subjects={subjects ?? []} programmes={programmes ?? []} addQuestionId={sp.addQuestion ?? ""} />
    {quiz.status !== "archived" && !protectedPaper && <div className="mt-6 flex justify-end"><form action={setPaperStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="archived" /><Button type="submit" variant="outline">Archive paper</Button></form></div>}
  </>;
}
