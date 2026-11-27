import { Badge, ButtonLink, Card, EmptyState, PageTitle, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperateMany } from "@/lib/operationalAccess";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { parsePaperSections } from "@/lib/examPaper";
import { createClient } from "@/lib/supabase/server";
import { CheckCircle2, FileText, Library, PenSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archivePaper, duplicatePaper, publishPaper } from "./actions";
import { requestFormatter } from "@/lib/formattingRequest";

export const metadata: Metadata = { title: "Question Paper Builder" };
export const dynamic = "force-dynamic";

export default async function PaperBuilderPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  // Configured date, time and number profile (Platform Control Center →
  // Presentation), resolved once per request from the session's own organization.
  const { dateTime: fmtDateTime } = await requestFormatter(org?.id ?? null);
  const perms = await canOperateMany(ctx, org.id, {
    canView: { permission: "paper_builder.view" },
    canCreate: { permission: "paper_builder.create", module: "paper_builder" },
    canEdit: { permission: "paper_builder.edit", module: "paper_builder" },
    canCreateExam: { permission: "exams.create", module: "examinations" },
  });
  if (!perms.canView) notFound();
  const supabase = await createClient();
  const { capabilities, featureFlags, entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "paper_builder", "/dashboard?e=module");
  const builderEnabled = capabilities.question_paper_builder;

  const { data: papers } = await supabase
    .from("quizzes")
    .select("id, title, description, status, settings, updated_at, quiz_questions(id, position, points, questions(type, config))")
    .eq("organization_id", org.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  const rows = papers ?? [];
  const published = rows.filter((p) => p.status === "published").length;

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Question Paper Builder"
        title="Question Paper Builder"
        subtitle="Assemble examination papers from your Question Bank: organize Section A (MCQ) and Section B (Theory), set randomization and the scientific calculator, choose an official paper template, then publish and schedule the examination."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/dashboard/questions" variant="outline">
              <Library className="mr-1.5 h-4 w-4" /> Question Bank
            </ButtonLink>
            {perms.canCreateExam && <ButtonLink href="/dashboard/exams/new" variant="outline">New examination</ButtonLink>}
            {perms.canCreate && <ButtonLink href="/dashboard/paper-builder/new">+ New paper</ButtonLink>}
          </div>
        }
      />

      {!builderEnabled && (
        <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The Question Paper Builder is currently disabled platform-wide by the Super Admin
          (Modules &amp; Features → Question Paper Builder). Existing papers are unaffected.
          {featureFlags.question_paper_builder === false ? "" : " Your plan does not include examinations."}
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Papers" value={rows.length} icon={<FileText className="h-5 w-5" />} />
        <StatCard label="Published papers" value={published} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Question Bank" value="—" hint="Published questions feed every paper" icon={<Library className="h-5 w-5" />} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No examination papers yet"
          body="No formal examination papers have been built yet."
          action={perms.canCreate ? <ButtonLink href="/dashboard/paper-builder/new">Create your first paper</ButtonLink> : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const settings = (p.settings ?? {}) as Record<string, unknown>;
            const sections = parsePaperSections(settings.sections);
            const qq = ((p.quiz_questions as unknown as { id: string; points: number | null; questions: { type: string; config: Record<string, unknown> | null } | null }[]) ?? []);
            const marks = qq.reduce((s, r) => s + Number(r.points ?? 0), 0);
            const mcq = qq.filter((r) => ["single_choice", "multiple_select", "true_false"].includes(r.questions?.type ?? "")).length;
            const theory = qq.length - mcq;
            return (
              <Card key={p.id} className="flex flex-col p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={p.status === "published" ? "green" : p.status === "archived" ? "gray" : "gold"}>{p.status}</Badge>
                  <span className="text-xs text-ink-soft">{qq.length} questions · {marks} marks</span>
                </div>
                <h2 className="mt-2 font-display text-lg font-semibold text-evergreen-950">{p.title}</h2>
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-ink-soft">{p.description || "No description."}</p>
                <p className="mt-2 text-xs text-ink-soft">
                  {sections.length ? sections.map((s) => `${s.title.split("—")[0].trim()}: ${s.questionCount}Q`).join(" · ") : `MCQ ${mcq} · Theory ${theory}`}
                  {" · "}Updated {fmtDateTime(p.updated_at)}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-evergreen-900/10 pt-4 text-sm">
                  {perms.canEdit ? (
                    <>
                      <Link href={`/dashboard/paper-builder/${p.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
                        Edit &amp; preview
                      </Link>
                      {perms.canCreate && (
                        <form action={duplicatePaper}><input type="hidden" name="id" value={p.id} /><button className="text-ink-soft underline-offset-2 hover:underline">Duplicate</button></form>
                      )}
                      {p.status !== "published" ? (
                        <form action={publishPaper}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="published" /><button className="text-gold-700 underline-offset-2 hover:underline">Publish</button></form>
                      ) : (
                        <form action={publishPaper}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="draft" /><button className="text-ink-soft underline-offset-2 hover:underline">Unpublish</button></form>
                      )}
                      {p.status !== "archived" && (
                        <form action={archivePaper}><input type="hidden" name="id" value={p.id} /><button className="text-red-700 underline-offset-2 hover:underline">Archive</button></form>
                      )}
                    </>
                  ) : null}
                  <Link href={`/dashboard/quizzes/${p.id}`} className="inline-flex items-center gap-1 text-evergreen-700 underline-offset-2 hover:underline">
                    <PenSquare className="h-3.5 w-3.5" /> {perms.canEdit ? "Quiz editor" : "Inspect paper"}
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
