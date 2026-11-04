import { Button, ButtonLink, Card, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Library, PlayCircle, Shapes } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { enterOrgWorkspace } from "../../actions/orgs";

export const metadata: Metadata = { title: "Create quiz" };
export const dynamic = "force-dynamic";

export default async function CreateQuizPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("id, name, type, slug, settings").order("name").limit(500);
  const selected =
    (sp.org && (orgs ?? []).find((o) => o.id === sp.org)) ||
    (orgs ?? []).find((o) => o.slug === "evalora-platform") ||
    (orgs ?? [])[0];

  let stats = { published: 0, all: 0, quizzes: 0 };
  if (selected) {
    const head = { count: "exact" as const, head: true };
    const [published, all, quizzes] = await Promise.all([
      admin.from("questions").select("id", head).eq("organization_id", selected.id).eq("status", "published").then((r) => r.count ?? 0),
      admin.from("questions").select("id", head).eq("organization_id", selected.id).then((r) => r.count ?? 0),
      admin.from("quizzes").select("id", head).eq("organization_id", selected.id).then((r) => r.count ?? 0),
    ]);
    stats = { published, all, quizzes };
  }

  return (
    <>
      <PageTitle
        title="Create quiz"
        subtitle="Quizzes belong to an organization so questions, permissions and results stay tenant-safe. Choose the owner, then use the shared Quiz Builder with the same mathematical content used everywhere else."
        action={selected ? <ButtonLink href={`/admin/questions/new?org=${selected.id}`} variant="outline">+ Create a question first</ButtonLink> : undefined}
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block min-w-[300px] flex-1">
          <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Owning organization</span>
          <Select name="org" defaultValue={selected?.id ?? ""}>
            {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name} ({o.type.replace(/_/g, " ")})</option>)}
          </Select>
        </label>
        <Button type="submit" variant="outline">Use organization</Button>
      </form>

      {!selected ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">Create an organization before creating a quiz.</p>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Published questions available" value={stats.published} icon={<Library className="h-5 w-5" />} />
            <StatCard label="Questions in organization bank" value={stats.all} icon={<Shapes className="h-5 w-5" />} />
            <StatCard label="Existing quizzes" value={stats.quizzes} icon={<PlayCircle className="h-5 w-5" />} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Build in {selected.name}</h2>
              <p className="mt-2 text-sm text-ink-soft">
                Opens the Quiz Builder in administrative workspace mode. There you can name the quiz, choose timing/randomization,
                add and order questions, preview the participant experience, publish it and launch synchronized or self-paced sessions.
              </p>
              <form action={enterOrgWorkspace} className="mt-5">
                <input type="hidden" name="organization_id" value={selected.id} />
                <input type="hidden" name="next" value="/dashboard/quizzes/new" />
                <Button type="submit" variant="gold" className="px-6 py-3">Open Quiz Builder →</Button>
              </form>
              <p className="mt-3 text-xs text-ink-soft">Workspace entry and exit are written to the Super Admin audit log.</p>
            </Card>

            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Prepare mathematical content</h2>
              <p className="mt-2 text-sm text-ink-soft">
                Create or edit questions directly in the Super Admin Question Bank. Prompts, options, answer keys and worked solutions
                use the unified Tiptap + MathLive + KaTeX editor with images, tables, equations and LaTeX source.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <ButtonLink href={`/admin/questions/new?org=${selected.id}`} variant="gold">Create question</ButtonLink>
                <ButtonLink href={`/admin/questions?org=${selected.id}`} variant="outline">Question Bank</ButtonLink>
                <ButtonLink href={`/admin/questions/solutions?org=${selected.id}`} variant="outline">Answers & solutions</ButtonLink>
              </div>
              {stats.published === 0 && (
                <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  This organization has no published questions yet. Create and publish at least one before launching participants into the quiz.
                </p>
              )}
            </Card>
          </div>

          <p className="mt-6 text-sm text-ink-soft">
            Already have a quiz? <Link href="/admin/quizzes" className="font-semibold text-evergreen-700 underline-offset-2 hover:underline">Open Quiz Management</Link> to edit status, duplicate through the workspace, or inspect assignments and results.
          </p>
        </>
      )}
    </>
  );
}
