import { QuestionForm } from "@/components/QuestionForm";
import { Button, ButtonLink, Card, Field, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveQuestionStudioConfig } from "@/lib/questionStudio";
import { getQuestionTemplate, templateContentForEditor } from "@/lib/questionTemplates";
import type { Metadata } from "next";
import { saveQuestionAsAdmin, uploadQuestionImageAsAdmin } from "../actions";

export const metadata: Metadata = { title: "Create question" };
export const dynamic = "force-dynamic";

export default async function AdminNewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; type?: string; template?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, slug, type, status")
    .order("name")
    .limit(500);

  const selected =
    (sp.org && (orgs ?? []).find((o) => o.id === sp.org)) ||
    (orgs ?? []).find((o) => o.slug === "evalora-platform") ||
    (orgs ?? [])[0];

  if (!selected) {
    return (
      <>
        <PageTitle
          title="Create question"
          subtitle="A question needs an owning organization or school."
          action={<ButtonLink href="/admin/organizations/new" variant="gold">+ Create organization</ButtonLink>}
        />
        <Card className="p-8 text-center text-sm text-ink-soft">
          Create an organization first, then return here to author questions with the unified mathematical editor.
        </Card>
      </>
    );
  }

  // Question Studio configuration for the organization the question will be
  // authored into: which types the picker offers, the difficulty vocabulary and
  // the design defaults. Resolved from the Platform Control Center, with the
  // shipped defaults as fallback. Resolved AFTER the organization is known, so a
  // console with no organizations yet renders its empty state instead of
  // dereferencing nothing.
  const studio = await resolveQuestionStudioConfig(selected.id);

  // A Question Studio template pre-fills the editor. Applying one copies its
  // payload: the question saved from it is independent, and the template's own
  // design tokens become this question's snapshot.
  const template = sp.template ? await getQuestionTemplate(sp.template) : null;
  const templateInitial = template && template.status === "active"
    ? { ...templateContentForEditor(template), template_id: template.id }
    : undefined;

  const { data: categories } = await admin
    .from("question_categories")
    .select("id, name")
    .eq("organization_id", selected.id)
    .order("name");
  const [{ data: classOptions }, { data: programmes }, { data: subjectOptions }] = await Promise.all([
    admin.from("classes").select("id, name").eq("organization_id", selected.id).eq("status", "active").order("grade_order").order("name"),
    admin.from("curriculum_programmes").select("key, name").eq("organization_id", selected.id).eq("is_active", true).order("name"),
    admin.from("subjects").select("id, name").eq("organization_id", selected.id).order("name"),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Mathematical Question Studio"
        title="Create question"
        subtitle="Author once in the professional mathematical editor, then reuse the same question in quizzes, live competitions and examinations."
        action={<ButtonLink href="/admin/questions" variant="outline">← Question Bank</ButtonLink>}
      />

      <form method="get" className="mb-6 flex max-w-2xl flex-wrap items-end gap-3">
        <div className="min-w-[280px] flex-1">
          <Field label="Owning organization / school" hint="Questions, categories and uploaded images stay scoped to this organization.">
            <Select name="org" defaultValue={selected.id}>
              {(orgs ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({String(o.type).replace(/_/g, " ")}{o.status !== "active" ? ` · ${o.status}` : ""})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" variant="outline">Use organization</Button>
      </form>

      {templateInitial && (
        <p className="mb-4 rounded-lg border border-evergreen-900/20 bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          Started from template <strong>{template?.name}</strong>. Everything below is a copy — saving creates a new
          question and never changes the template.
        </p>
      )}

      <QuestionForm
        studio={studio}
        key={`${selected.id}-${templateInitial?.template_id ?? sp.type ?? "single_choice"}`}
        initial={templateInitial ?? (sp.type ? { type: sp.type } : undefined)}
        categories={categories ?? []}
        save={saveQuestionAsAdmin}
        uploadImage={uploadQuestionImageAsAdmin}
        successHref="/admin/questions"
        organizationId={selected.id}
        subjectOptions={subjectOptions ?? []}
        classOptions={classOptions ?? []}
        curriculumOptions={programmes ?? []}
      />
    </>
  );
}
