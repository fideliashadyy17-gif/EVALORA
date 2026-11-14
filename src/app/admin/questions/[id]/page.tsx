import { QuestionForm, type QuestionFormValues } from "@/components/QuestionForm";
import { Button, PageTitle } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import type { RichDoc } from "@/lib/content";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "../../ui";
import { duplicateQuestionAsAdmin, saveQuestionAsAdmin, uploadQuestionImageAsAdmin } from "../actions";

export const metadata: Metadata = { title: "Edit question" };
export const dynamic = "force-dynamic";

export default async function AdminEditQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: q } = await admin
    .from("questions")
    .select("*, organizations(id, name), question_options(*)")
    .eq("id", id)
    .maybeSingle();
  if (!q) notFound();

  const { data: categories } = await admin
    .from("question_categories")
    .select("id, name")
    .eq("organization_id", q.organization_id)
    .order("name");
  const [{ data: classOptions }, { data: programmes }, { data: subjectOptions }] = await Promise.all([
    admin.from("classes").select("id, name").eq("organization_id", q.organization_id).order("grade_order").order("name"),
    admin.from("curriculum_programmes").select("key, name").eq("organization_id", q.organization_id).order("name"),
    admin.from("subjects").select("id, name").eq("organization_id", q.organization_id).order("name"),
  ]);

  const options = [...(((q.question_options as Record<string, unknown>[]) ?? []))].sort(
    (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
  );

  const initial: Partial<QuestionFormValues> & { id: string } = {
    id: q.id,
    organization_id: q.organization_id,
    type: q.type,
    prompt: q.prompt,
    prompt_doc: (q.prompt_doc as RichDoc | null) ?? null,
    explanation: q.explanation ?? "",
    explanation_doc: (q.explanation_doc as RichDoc | null) ?? null,
    points: Number(q.points),
    difficulty: q.difficulty,
    topic: q.topic ?? "",
    status: q.status,
    category_id: q.category_id,
    class_id: q.class_id,
    subject_id: q.subject_id,
    curriculum: q.curriculum,
    curriculum_course: q.curriculum_course,
    subtopic: q.subtopic,
    source_reference: q.source_reference,
    source_url: q.source_url,
    config: (q.config as Record<string, unknown>) ?? {},
    options: options.map((o) => ({
      label: String(o.label ?? ""),
      is_correct: Boolean(o.is_correct),
      content_doc: (o.content_doc as RichDoc | null) ?? null,
    })),
  };

  const org = q.organizations as unknown as { id: string; name: string } | null;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/admin/questions" className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
          ← Question Bank
        </Link>
      </p>
      <PageTitle
        eyebrow="Assessment Authoring · Mathematical Question Studio"
        title="Edit question"
        subtitle={`Organization: ${org?.name ?? "—"}. Changes affect linked papers and may alter existing attempts or grading. Duplicate as draft to preserve the original.`}
        action={
          <form action={duplicateQuestionAsAdmin}>
            <input type="hidden" name="id" value={q.id} />
            <input type="hidden" name="back" value={`/admin/questions/${q.id}`} />
            <Button type="submit" variant="outline">Duplicate as draft</Button>
          </form>
        }
      />
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          duplicated: "This is the duplicated draft. Review it before publishing.",
          duplicate_failed: "The question could not be duplicated.",
          duplicate_options_incomplete: "The draft was created but its answer options could not be copied. Review this draft before using it.",
        }}
      />
      <QuestionForm
        key={`${q.id}-${q.updated_at}`}
        initial={initial}
        categories={categories ?? []}
        save={saveQuestionAsAdmin}
        uploadImage={uploadQuestionImageAsAdmin}
        successHref="/admin/questions"
        organizationId={q.organization_id}
        subjectOptions={subjectOptions ?? []}
        classOptions={classOptions ?? []}
        curriculumOptions={programmes ?? []}
      />
    </>
  );
}
