import { QuestionForm, type QuestionSaveFn } from "@/components/QuestionForm";
import { ButtonLink, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { createClient } from "@/lib/supabase/server";
import { resolveQuestionStudioConfig } from "@/lib/questionStudio";
import { getQuestionTemplate, templateContentForEditor } from "@/lib/questionTemplates";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { saveQuestion, uploadQuestionImage } from "../actions";

export const metadata: Metadata = { title: "New question" };

export default async function NewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  if (!(await canOperate(ctx, org.id, "questions.create", "question_bank"))) redirect("/dashboard/questions");
  // Question Studio configuration for this organization (Control Center →
  // Question Studio): type picker, difficulty vocabulary, design defaults.
  const studio = await resolveQuestionStudioConfig(org.id);
  // A Question Studio template pre-fills the editor. The read is scoped to this
  // organization plus the platform-wide library, so a template id from another
  // tenant resolves to nothing here. Archived templates are refused: they are no
  // longer offered to authors, although questions already created from them are
  // untouched.
  const template = sp.template ? await getQuestionTemplate(sp.template, org.id) : null;
  const templateInitial = template && template.status === "active"
    ? { ...templateContentForEditor(template), template_id: template.id }
    : undefined;
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("question_categories")
    .select("id, name")
    .eq("organization_id", org.id)
    .order("name");
  const [{ data: classOptions }, { data: programmes }, { data: subjectOptions }, { data: mySubjects }] = await Promise.all([
    supabase.from("classes").select("id, name").eq("organization_id", org.id).eq("status", "active").order("grade_order").order("name"),
    supabase.from("curriculum_programmes").select("key, name").eq("organization_id", org.id).eq("is_active", true).order("name"),
    supabase.from("subjects").select("id, name").eq("organization_id", org.id).order("name"),
    // The author's assigned subjects (teacher_subjects): the first one is the
    // default subject for a NEW question — specialization, not a hard filter.
    supabase
      .from("teacher_subjects")
      .select("subject_id")
      .eq("organization_id", org.id)
      .eq("profile_id", ctx.user.id)
      .limit(1),
  ]);
  const defaultSubjectId = (mySubjects ?? [])[0]?.subject_id ?? "";

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Mathematical Question Studio"
        title="New question"
        subtitle="Author once with the full mathematical editor — reuse in quizzes, live competitions and examinations."
        action={<ButtonLink href="/dashboard/questions" variant="outline">Question Bank</ButtonLink>}
      />
      {templateInitial && (
        <p className="mb-4 rounded-lg border border-evergreen-900/20 bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          Started from template <strong>{template?.name}</strong>. Everything below is a copy — saving creates a new
          question and never changes the template.
        </p>
      )}
      <QuestionForm
        studio={studio}
        categories={categories ?? []}
        save={saveQuestion as unknown as QuestionSaveFn}
        uploadImage={uploadQuestionImage}
        successHref="/dashboard/questions"
        subjectOptions={subjectOptions ?? []}
        initial={templateInitial ?? (defaultSubjectId ? { subject_id: defaultSubjectId } : undefined)}
        classOptions={classOptions ?? []}
        curriculumOptions={programmes ?? []}
      />
    </>
  );
}
