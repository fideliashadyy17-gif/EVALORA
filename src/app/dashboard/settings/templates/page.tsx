import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Textarea } from "@/components/ui";
import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteTemplate, saveTemplate } from "./actions";

export const metadata: Metadata = { title: "Examination paper templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; e?: string; edit?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, MANAGER_ROLES)) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "exam_templates", "/dashboard?e=module");
  const { data: templates } = await supabase
    .from("exam_paper_templates")
    .select("*")
    .eq("organization_id", org.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  const editing = sp.edit ? (templates ?? []).find((t) => t.id === sp.edit) ?? null : null;

  return (
    <>
      <PageTitle
        eyebrow="Organization Settings · Official Examination Papers"
        title="Examination paper templates"
        subtitle="Reusable official headers for every examination paper. Your organization name and logo are always taken from your branding — templates only set the period, year, grade, subject and instructions."
        action={<ButtonLink href="/dashboard/settings" variant="outline">Organization settings</ButtonLink>}
      />
      {sp.saved && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Template saved.</p>}
      {sp.e === "name" && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Give the template a name.</p>}

      <Card className="mb-6 p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">{editing ? "Edit template" : "New template"}</h2>
        <form action={saveTemplate} className="mt-4 space-y-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Template name *">
              <Input name="name" required defaultValue={editing?.name ?? ""} placeholder="First Term — Mathematics" />
            </Field>
            <Field label="Examination period">
              <Input name="period" defaultValue={editing?.period ?? ""} placeholder="First Term Examination" />
            </Field>
            <Field label="Academic year">
              <Input name="academic_year" defaultValue={editing?.academic_year ?? ""} placeholder="2026–2027" />
            </Field>
            <Field label="Grade / Class">
              <Input name="grade_label" defaultValue={editing?.grade_label ?? ""} placeholder="MYP4" />
            </Field>
            <Field label="Subject">
              <Input name="subject" defaultValue={editing?.subject ?? ""} placeholder="Mathematics" />
            </Field>
          </div>
          <Field label="General examination instructions">
            <Textarea name="instructions" rows={3} defaultValue={editing?.instructions ?? ""} placeholder="Answer all questions. A scientific calculator is permitted…" />
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-medium text-evergreen-900">
              <input type="checkbox" name="show_logo" defaultChecked={editing?.show_logo !== false} className="h-5 w-5 accent-evergreen-700" />
              Show organization logo on the paper header
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-evergreen-900">
              <input type="checkbox" name="is_default" defaultChecked={Boolean(editing?.is_default)} className="h-5 w-5 accent-evergreen-700" />
              Default template for this organization
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="gold">{editing ? "Save template" : "Create template"}</Button>
            {editing && <ButtonLink href="/dashboard/settings/templates" variant="ghost">Cancel</ButtonLink>}
          </div>
        </form>
      </Card>

      {(templates ?? []).length === 0 ? (
        <p className="text-sm text-ink-soft">No templates yet. Create one above, then choose it when building a paper or scheduling an examination.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(templates ?? []).map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base font-semibold text-evergreen-950">{t.name}</h2>
                {t.is_default && <Badge tone="green">Default</Badge>}
                {!t.show_logo && <Badge tone="gray">Logo hidden</Badge>}
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {[t.period, t.academic_year && `Academic Year: ${t.academic_year}`, t.grade_label && `Grade: ${t.grade_label}`, t.subject && `Subject: ${t.subject}`].filter(Boolean).join(" · ") || "No header fields set."}
              </p>
              {t.instructions && <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{t.instructions}</p>}
              <div className="mt-3 flex gap-3 text-sm">
                <a href={`/dashboard/settings/templates?edit=${t.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Edit</a>
                <form action={deleteTemplate}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-red-700 underline-offset-2 hover:underline">Delete</button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
