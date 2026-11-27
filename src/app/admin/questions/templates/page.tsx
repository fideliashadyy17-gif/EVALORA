import { Badge, Button, ButtonLink, Card, DataTable, EmptyState, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { ConfirmField, Notice, Section, StatusBadge } from "../../ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { SUPPORTED_DIFFICULTY_LEVELS, allQuestionTypes } from "@/lib/questionStudioClient";
import { describeTemplateScope, listQuestionTemplates } from "@/lib/questionTemplates";
import { describeDesign, normalizeQuestionDesign } from "@/lib/questionDesign";
import { fmtDate } from "@/lib/utils";
import { Archive, ArchiveRestore, FileStack, Layers, Library, Plus } from "lucide-react";
import type { Metadata } from "next";
import {
  createQuestionTemplate,
  createTemplateFromQuestion,
  deleteQuestionTemplate,
  setQuestionTemplateStatus,
} from "./actions";

export const metadata: Metadata = { title: "Question templates" };
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Question Studio templates (Super Admin).
 *
 * A template is a starting point, not a live link: applying one copies its
 * payload into the editor. Editing or archiving a template therefore can never
 * change a question that already exists, and can never restyle an examination
 * that is scheduled, open or published.
 *
 * Platform-wide templates (`organization_id IS NULL`) are available to every
 * tenant. A template created from an existing question keeps that question's
 * organization and is never promoted to platform-wide — that would copy one
 * school's authored content into a payload every other tenant could read.
 */
export default async function QuestionTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; source_org?: string; status?: string; type?: string; q?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, slug, type, status")
    .order("name")
    .limit(500);
  const organizations = orgs ?? [];

  // Scope filter: "all" (default) = every template, "platform" = platform-wide
  // only, otherwise one organization's own templates.
  const scopeParam = UUID_RE.test(sp.org ?? "") || sp.org === "platform" || sp.org === "all" ? (sp.org ?? "all") : "all";
  const scopeFilter = scopeParam === "platform" ? null : scopeParam === "all" ? undefined : scopeParam;
  const statusParam = sp.status === "archived" || sp.status === "active" ? sp.status : "any";
  const sourceOrgId = UUID_RE.test(sp.source_org ?? "") ? sp.source_org! : null;

  const [templates, sourceOrg, sourceQuestions] = await Promise.all([
    listQuestionTemplates({
      organizationId: scopeFilter,
      status: statusParam,
      questionType: sp.type ?? null,
      search: sp.q ?? null,
      limit: 200,
    }),
    sourceOrgId
      ? admin.from("organizations").select("id, name").eq("id", sourceOrgId).maybeSingle()
      : Promise.resolve(null),
    sourceOrgId
      ? admin
          .from("questions")
          .select("id, prompt, type, updated_at")
          .eq("organization_id", sourceOrgId)
          .order("updated_at", { ascending: false })
          .limit(400)
      : Promise.resolve(null),
  ]);

  const platformCount = templates.filter((t) => !t.organization_id).length;
  const archivedCount = templates.filter((t) => t.status === "archived").length;
  const totalUses = templates.reduce((sum, t) => sum + (Number(t.usage_count) || 0), 0);
  const orgName = (id: string | null) => (id ? (organizations.find((o) => o.id === id)?.name ?? "Another organization") : "Platform-wide");
  const typeLabel = (value: string) => allQuestionTypes().find((t) => t.value === value)?.label ?? value;
  /** Which organization a template opens the editor for. */
  const editorHref = (template: { id: string; organization_id: string | null }) => {
    const org = template.organization_id ?? organizations[0]?.id;
    return org ? `/admin/questions/new?template=${template.id}&org=${org}` : `/admin/questions/new?template=${template.id}`;
  };
  const sourceRows = (sourceQuestions as { data?: { id: string; prompt: string | null; type: string; updated_at: string }[] } | null)?.data ?? [];

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Question Studio"
        title="Question templates"
        subtitle="Reusable starting points for the mathematical question editor. Applying a template copies its content and appearance into a new question; it never edits an existing one."
        action={<ButtonLink href="/admin/questions/types" variant="outline">Question types</ButtonLink>}
      />
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          created: "Template created.",
          created_from_question: "Template created from that question. The question itself is unchanged.",
          archived: "Template archived. Questions already created from it are unchanged.",
          active: "Template restored.",
          deleted: "Template deleted. Questions created from it are unchanged.",
          name: "Give the template a name of at least 2 characters.",
          type: "Choose a question type the examination engine can render.",
          org: "That organization does not exist.",
          question: "Choose a question that still exists.",
          size: "That question is too large to store as a template.",
          confirm: "Tick the confirmation box before deleting a template.",
          failed: "The template could not be saved.",
        }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Templates listed" value={templates.length} icon={<FileStack className="h-5 w-5" />} hint="Matches the filters below." />
        <StatCard label="Platform-wide" value={platformCount} icon={<Layers className="h-5 w-5" />} hint="Available to every tenant." />
        <StatCard label="Times applied" value={totalUses} icon={<Library className="h-5 w-5" />} hint="Questions created from these templates." />
        <StatCard label="Archived" value={archivedCount} icon={<Archive className="h-5 w-5" />} hint="Hidden from authors, never deleted." />
      </div>

      <Card className="mb-8 p-5">
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Scope">
            <Select name="org" defaultValue={scopeParam}>
              <option value="all">All templates</option>
              <option value="platform">Platform-wide only</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Question type">
            <Select name="type" defaultValue={sp.type ?? ""}>
              <option value="">Any type</option>
              {allQuestionTypes().map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={statusParam}>
              <option value="any">Active and archived</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
          <Field label="Search by name">
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="e.g. Quadratic" maxLength={80} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="outline" className="w-full">Apply filters</Button>
          </div>
        </form>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">New template</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Creates an empty template that authors can open from the question editor. Leave the organization empty for a
            platform-wide template.
          </p>
          <form action={createQuestionTemplate} className="mt-4 space-y-4">
            <Field label="Template name" hint="2–160 characters. This is what authors see.">
              <Input name="name" required minLength={2} maxLength={160} placeholder="e.g. Multi-step numeric with worked solution" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organization" hint="Empty = platform-wide.">
                <Select name="organization_id" defaultValue="">
                  <option value="">Platform-wide</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Question type">
                <Select name="question_type" required defaultValue="single_choice">
                  {allQuestionTypes().map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Input name="description" maxLength={600} placeholder="When should an author reach for this template?" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Subject (optional)"><Input name="subject" maxLength={80} /></Field>
              <Field label="Grade label (optional)"><Input name="grade_label" maxLength={40} placeholder="e.g. Grade 9 / MYP 4" /></Field>
              <Field label="Curriculum (optional)"><Input name="curriculum" maxLength={80} placeholder="e.g. IB MYP Mathematics" /></Field>
              <Field label="Topic (optional)"><Input name="topic" maxLength={120} /></Field>
              <Field label="Difficulty (optional)" hint="Only labels the question store accepts.">
                <Select name="difficulty" defaultValue="">
                  <option value="">Not set</option>
                  {SUPPORTED_DIFFICULTY_LEVELS.map((level) => (
                    <option key={level} value={level}>{level.charAt(0).toUpperCase() + level.slice(1)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Tags" hint="Comma separated, up to 12.">
                <Input name="tags" placeholder="algebra, worked solution" />
              </Field>
            </div>
            <Button type="submit" variant="gold"><Plus className="h-4 w-4" />Create template</Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Template from an existing question</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Snapshots a question — prompt, options, marking configuration and appearance — into a reusable template. The
            template inherits that question&apos;s organization, and the question itself is not modified.
          </p>
          <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Field label="Organization holding the question">
                <Select name="source_org" defaultValue={sourceOrgId ?? ""}>
                  <option value="">Choose an organization…</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <input type="hidden" name="org" value={scopeParam} />
            <Button type="submit" variant="outline">Load questions</Button>
          </form>

          {sourceOrgId && (
            sourceOrg?.data ? (
              <form action={createTemplateFromQuestion} className="mt-4 space-y-4">
                <Field label="Question" hint={`${sourceRows.length} most recently updated questions in ${sourceOrg.data.name}.`}>
                  <Select name="question_id" required defaultValue="">
                    <option value="">Choose a question…</option>
                    {sourceRows.map((question) => (
                      <option key={question.id} value={question.id}>
                        {typeLabel(String(question.type))} · {String(question.prompt ?? "").slice(0, 90)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Template name">
                  <Input name="name" required minLength={2} maxLength={160} />
                </Field>
                <Field label="Description"><Input name="description" maxLength={600} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Grade label (optional)"><Input name="grade_label" maxLength={40} /></Field>
                  <Field label="Tags"><Input name="tags" placeholder="reuse, model answer" /></Field>
                </div>
                <p className="text-xs text-ink-soft">
                  The question&apos;s own type, difficulty, subject and curriculum are carried over. Subject and topic can be
                  edited afterwards in the template list.
                </p>
                <Button type="submit" variant="gold"><FileStack className="h-4 w-4" />Create from question</Button>
              </form>
            ) : (
              <p className="mt-4 text-sm text-ink-soft">That organization could not be loaded.</p>
            )
          )}
        </Card>
      </div>

      <Section
        title="Templates"
        hint="Use one to open the question editor pre-filled. The design column shows the appearance a question started from that template will snapshot as its own."
      >
        {templates.length === 0 ? (
          <EmptyState
            title="No templates match this view"
            body="Create one above, or snapshot an existing question. Templates are optional — authors can always start from a blank question."
            action={<ButtonLink href="/admin/questions/new" variant="gold">Open the question editor</ButtonLink>}
          />
        ) : (
          <DataTable head={["Template", "Scope", "Type", "Design", "Uses", "Updated", "Actions"]} label="Question templates">
            {templates.map((template) => {
              const designLines = describeDesign(normalizeQuestionDesign(template.design));
              return (
                <tr key={template.id} className="border-t border-evergreen-900/10 align-top">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-evergreen-950">{template.name}</span>
                      {template.status === "archived" ? <StatusBadge status="archived" /> : <Badge tone="green">active</Badge>}
                    </div>
                    {template.description && <p className="mt-1 max-w-md text-xs text-ink-soft">{template.description}</p>}
                    <p className="mt-1 text-xs text-ink-soft">
                      {[template.subject, template.grade_label, template.curriculum, template.topic]
                        .filter(Boolean)
                        .join(" · ") || "No subject or topic set"}
                      {template.difficulty ? ` · ${template.difficulty}` : ""}
                    </p>
                    {template.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {template.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-stone-200/70 px-2 py-0.5 text-[11px] text-stone-700">{tag}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {describeTemplateScope(template) === "platform" ? (
                      <Badge tone="gold">Platform-wide</Badge>
                    ) : (
                      <span className="text-ink-soft">{orgName(template.organization_id)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink">{typeLabel(template.question_type)}</td>
                  <td className="max-w-xs px-4 py-3 text-xs text-ink-soft">
                    {/* Card layout, option layout and numbering — the parts an
                        author notices first. The full list appears in the editor. */}
                    {[designLines[0], designLines[2], designLines[5]].map((line) => (
                      <span key={line} className="block">{line}</span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink">{template.usage_count}</td>
                  <td className="px-4 py-3 text-sm text-ink-soft">{fmtDate(template.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-2">
                      {template.status === "active" ? (
                        <ButtonLink href={editorHref(template)} variant="outline">Use template</ButtonLink>
                      ) : (
                        <span className="text-xs text-ink-soft">Archived — not offered to authors</span>
                      )}
                      <form action={setQuestionTemplateStatus} className="m-0">
                        <input type="hidden" name="id" value={template.id} />
                        <input type="hidden" name="status" value={template.status === "archived" ? "active" : "archived"} />
                        <Button type="submit" variant="ghost">
                          {template.status === "archived" ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                          {template.status === "archived" ? "Restore" : "Archive"}
                        </Button>
                      </form>
                      <form action={deleteQuestionTemplate} className="m-0 space-y-2">
                        <input type="hidden" name="id" value={template.id} />
                        <ConfirmField label="Delete this template" />
                        <Button type="submit" variant="danger">Delete</Button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Section>
    </>
  );
}
