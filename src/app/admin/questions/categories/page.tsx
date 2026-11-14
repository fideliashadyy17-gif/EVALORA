import { Button, ButtonLink, Card, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import { FolderOpen, Library } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmField, Notice, Table } from "../../ui";
import { deleteQuestionCategoryAsAdmin, saveQuestionCategoryAsAdmin } from "../actions";

export const metadata: Metadata = { title: "Question categories" };
export const dynamic = "force-dynamic";

export default async function QuestionCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, slug, type")
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
          title="Question categories"
          subtitle="Categories belong to an organization and organize its Question Bank."
          action={<ButtonLink href="/admin/organizations/new" variant="gold">+ Create organization</ButtonLink>}
        />
        <Card className="p-8 text-center text-sm text-ink-soft">Create an organization before adding categories.</Card>
      </>
    );
  }

  const [{ data: categories }, { count: questionCount }] = await Promise.all([
    admin
      .from("question_categories")
      .select("*, questions(id, status)")
      .eq("organization_id", selected.id)
      .order("name"),
    admin.from("questions").select("id", { count: "exact", head: true }).eq("organization_id", selected.id),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Taxonomy & Topics"
        title="Question categories"
        subtitle="Create, rename and remove organization-scoped categories used by the Question Bank."
        action={<ButtonLink href={`/admin/questions/new?org=${selected.id}`} variant="gold">+ Create question</ButtonLink>}
      />
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          category_saved: "Category saved.",
          category_deleted: "Category deleted. Questions that used it now have no category; their content is unchanged.",
          category_name: "Enter a category name and choose an organization.",
          category_exists: "That category already exists in this organization.",
          category_failed: "The category could not be saved.",
          confirm: "Tick the confirmation box before deleting a category.",
        }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Categories in selected organization" value={(categories ?? []).length} icon={<FolderOpen className="h-5 w-5" />} />
        <StatCard label="Questions in selected organization" value={questionCount ?? 0} icon={<Library className="h-5 w-5" />} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="p-5">
          <form method="get">
            <Field label="Organization">
              <Select name="org" defaultValue={selected.id}>
                {(orgs ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.name} ({String(o.type).replace(/_/g, " ")})</option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="outline" className="mt-3">Open categories</Button>
          </form>
        </Card>

        <Card className="p-5">
          <form action={saveQuestionCategoryAsAdmin}>
            <input type="hidden" name="organization_id" value={selected.id} />
            <Field label="New category" hint={`Examples: Algebra, Geometry, Calculus — for ${selected.name}.`}>
              <Input name="name" required maxLength={100} placeholder="Algebra" />
            </Field>
            <Button type="submit" variant="gold" className="mt-3">Create category</Button>
          </form>
        </Card>
      </div>

      {(categories ?? []).length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-soft">
          No categories yet for {selected.name}. Create one above, then use it in the question editor.
        </Card>
      ) : (
        <Table head={["Category", "Questions", "Published", "Created", "Rename", "Delete"]}>
          {(categories ?? []).map((c) => {
            const qs = (c.questions as { id: string; status: string }[]) ?? [];
            return (
              <tr key={c.id}>
                <td>
                  <span className="font-medium text-evergreen-950">{c.name}</span>
                  <Link href={`/admin/questions?org=${selected.id}`} className="block text-xs font-medium text-evergreen-700 hover:underline">
                    Open this organization&apos;s Question Bank
                  </Link>
                </td>
                <td className="tabular-nums">{qs.length}</td>
                <td className="tabular-nums">{qs.filter((q) => q.status === "published").length}</td>
                <td className="text-ink-soft">{fmtDate(c.created_at)}</td>
                <td>
                  <form action={saveQuestionCategoryAsAdmin} className="flex min-w-56 gap-2">
                    <input type="hidden" name="organization_id" value={selected.id} />
                    <input type="hidden" name="id" value={c.id} />
                    <Input name="name" defaultValue={c.name} aria-label={`Rename ${c.name}`} />
                    <Button type="submit" variant="outline">Save</Button>
                  </form>
                </td>
                <td>
                  <form action={deleteQuestionCategoryAsAdmin} className="space-y-2">
                    <input type="hidden" name="organization_id" value={selected.id} />
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmField label="Delete category" />
                    <Button type="submit" variant="danger">Delete</Button>
                  </form>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
