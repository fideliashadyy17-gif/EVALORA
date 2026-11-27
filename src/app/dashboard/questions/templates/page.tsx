import { Badge, ButtonLink, Card, DataTable, EmptyState, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { allQuestionTypes } from "@/lib/questionStudioClient";
import { describeTemplateScope, listTemplatesForOrganization } from "@/lib/questionTemplates";
import { describeDesign, normalizeQuestionDesign } from "@/lib/questionDesign";
import { fmtDate } from "@/lib/utils";
import { FileStack, Layers } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Question templates" };
export const dynamic = "force-dynamic";

/**
 * Question Studio templates an author may start from.
 *
 * Read-only on purpose: the library is curated by Super Admin (or by an
 * organization's own templates), and authoring here means opening the question
 * editor with a COPY of a template's payload. Nothing on this page can edit a
 * template, and using one never changes an existing question — so it cannot
 * change a scheduled, open or published examination.
 *
 * Visibility is enforced twice: the list is scoped to this organization plus the
 * platform-wide library (the same rule as the Postgres policy
 * `question_templates_select`), and archived templates are never returned.
 */
export default async function DashboardQuestionTemplatesPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!(await canOperate(ctx, org.id, "questions.create", "question_bank"))) redirect("/dashboard/questions");
  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "question_bank", "/dashboard?e=module");

  const templates = await listTemplatesForOrganization(org.id);
  const typeLabel = (value: string) => allQuestionTypes().find((t) => t.value === value)?.label ?? value;

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Question Studio"
        title="Question templates"
        subtitle="Start a new question from a prepared template: the prompt skeleton, answer options, marking configuration and appearance are copied into the editor for you to adapt."
        action={<ButtonLink href="/dashboard/questions" variant="outline">Question Bank</ButtonLink>}
      />

      {templates.length === 0 ? (
        <EmptyState
          title="No templates available yet"
          body="Your organization has no shared templates, and no platform-wide template is active. You can still author a question from scratch."
          action={<ButtonLink href="/dashboard/questions/new" variant="gold">+ New question</ButtonLink>}
        />
      ) : (
        <DataTable head={["Template", "Type", "Subject & topic", "Appearance", "Updated", ""]} label="Question templates">
          {templates.map((template) => {
            const design = describeDesign(normalizeQuestionDesign(template.design));
            return (
              <tr key={template.id} className="border-t border-evergreen-900/10 align-top">
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-evergreen-950">{template.name}</span>
                    {describeTemplateScope(template) === "platform" ? (
                      <Badge tone="gold"><Layers className="mr-1 h-3 w-3" />Platform</Badge>
                    ) : (
                      <Badge tone="green">{org.name}</Badge>
                    )}
                  </div>
                  {template.description && <p className="mt-1 max-w-lg text-xs text-ink-soft">{template.description}</p>}
                  {template.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {template.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-stone-200/70 px-2 py-0.5 text-[11px] text-stone-700">{tag}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-ink">{typeLabel(template.question_type)}</td>
                <td className="px-4 py-3 text-sm text-ink-soft">
                  {[template.subject, template.grade_label, template.curriculum, template.topic].filter(Boolean).join(" · ") || "—"}
                  {template.difficulty ? <div className="mt-0.5 text-xs">Difficulty: {template.difficulty}</div> : null}
                </td>
                <td className="max-w-xs px-4 py-3 text-xs text-ink-soft">
                  {[design[0], design[2], design[5]].map((line) => (
                    <span key={line} className="block">{line}</span>
                  ))}
                </td>
                <td className="px-4 py-3 text-sm text-ink-soft">{fmtDate(template.updated_at)}</td>
                <td className="px-4 py-3 text-right">
                  <ButtonLink href={`/dashboard/questions/new?template=${template.id}`} variant="outline">
                    <FileStack className="h-4 w-4" />Use template
                  </ButtonLink>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      <Card className="mt-6 p-5 text-sm text-ink-soft">
        Using a template copies its content into a new question. The template is never linked to the question afterwards, so
        a template that is later edited or archived cannot change questions you have already written or examinations built
        from them.
      </Card>
    </>
  );
}
