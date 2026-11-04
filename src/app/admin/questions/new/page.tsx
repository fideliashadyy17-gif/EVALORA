import { QuestionForm } from "@/components/QuestionForm";
import { Button, ButtonLink, Card, Field, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { saveQuestionAsAdmin, uploadQuestionImageAsAdmin } from "../actions";

export const metadata: Metadata = { title: "Create question" };
export const dynamic = "force-dynamic";

export default async function AdminNewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; type?: string }>;
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

  const { data: categories } = await admin
    .from("question_categories")
    .select("id, name")
    .eq("organization_id", selected.id)
    .order("name");

  return (
    <>
      <PageTitle
        title="Create question"
        subtitle="Author once in the professional mathematical editor, then reuse the same question in quizzes, live competitions and examinations."
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

      <QuestionForm
        key={`${selected.id}-${sp.type ?? "single_choice"}`}
        initial={sp.type ? { type: sp.type } : undefined}
        categories={categories ?? []}
        save={saveQuestionAsAdmin}
        uploadImage={uploadQuestionImageAsAdmin}
        successHref="/admin/questions"
        organizationId={selected.id}
      />
    </>
  );
}
