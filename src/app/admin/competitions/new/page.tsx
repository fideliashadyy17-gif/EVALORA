import { Button, ButtonLink, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { COMPETITION_FORMATS } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { createCompetition } from "../../actions/competitions";
import { Notice } from "../../ui";

export const metadata: Metadata = { title: "Create competition" };
export const dynamic = "force-dynamic";

export default async function NewCompetitionPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; org?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const [{ data: orgs }, { data: quizzes }] = await Promise.all([
    admin.from("organizations").select("id, name, slug").order("name").limit(500),
    admin
      .from("quizzes")
      .select("id, title, status, organization_id, organizations(name), quiz_questions(id)")
      .order("updated_at", { ascending: false })
      .limit(300),
  ]);
  const platformOrg = (orgs ?? []).find((o) => o.slug === "evalora-platform");

  return (
    <>
      <PageTitle
        title="Create competition"
        subtitle="Attach a quiz from the host organization, set the registration window, and you get a shareable access code instantly."
        action={<ButtonLink href="/admin/competitions" variant="outline">← All competitions</ButtonLink>}
      />
      <Notice
        e={sp.e}
        messages={{
          title: "Competition name is required.",
          org: "Choose the host organization.",
          quiz_org: "The quiz must belong to the host organization. Open that workspace to build or copy the quiz there first.",
          failed: "The competition could not be created.",
        }}
      />

      <form action={createCompetition} className="space-y-6">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Basics</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Competition name *" className="sm:col-span-2">
              <Input name="title" required placeholder="e.g. National Mathematics Olympiad — Regional Round" />
            </Field>
            <Field label="Host organization *">
              <Select name="organization_id" defaultValue={sp.org ?? platformOrg?.id ?? ""}>
                {(orgs ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Format">
              <Select name="format" defaultValue="live_synchronous">
                {COMPETITION_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Category"><Input name="category" placeholder="Mathematics, Science, General knowledge…" defaultValue="general" /></Field>
            <Field label="Quiz (from the host organization)" hint="Question count = questions attached to the quiz. No quiz yet? Open the workspace and build one in Quiz Studio.">
              <Select name="quiz_id" defaultValue="">
                <option value="">— Attach later —</option>
                {(quizzes ?? []).map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title} · {(q.quiz_questions as unknown[])?.length ?? 0}q · {(q.organizations as unknown as { name: string } | null)?.name} · {q.status}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Target audience"><Input name="target_audience" placeholder="e.g. Secondary school students, ages 14–18" /></Field>
            <Field label="Grade / education level"><Input name="education_level" placeholder="e.g. Troisième / Grade 9" /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea name="description" rows={3} /></Field>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Schedule & registration</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Registration opens"><Input name="registration_opens_at" type="datetime-local" /></Field>
            <Field label="Registration closes"><Input name="registration_closes_at" type="datetime-local" /></Field>
            <Field label="Maximum participants"><Input name="max_participants" type="number" min={1} placeholder="Unlimited" /></Field>
            <Field label="Competition starts"><Input name="starts_at" type="datetime-local" /></Field>
            <Field label="Competition ends"><Input name="ends_at" type="datetime-local" /></Field>
            <Field label="Planned duration (minutes)"><Input name="duration_minutes" type="number" min={1} /></Field>
            <Field label="Initial status">
              <Select name="status" defaultValue="draft">
                <option value="draft">Draft (not visible)</option>
                <option value="published">Published (registration open)</option>
                <option value="scheduled">Scheduled</option>
              </Select>
            </Field>
            <Field label="Visibility">
              <Select name="visibility" defaultValue="private">
                <option value="private">Private — code holders only</option>
                <option value="unlisted">Unlisted — direct link</option>
                <option value="public">Public listing</option>
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Result publication mode</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-2 rounded-xl border border-evergreen-900/10 p-3 text-sm text-evergreen-900"><input type="radio" name="result_publication_mode" value="manual" defaultChecked className="mt-1 accent-evergreen-700" /><span><strong>Manual Result Publication</strong><span className="block text-xs text-ink-soft">Organizer validates and publishes official rankings.</span></span></label>
            <label className="flex items-start gap-2 rounded-xl border border-evergreen-900/10 p-3 text-sm text-evergreen-900"><input type="radio" name="result_publication_mode" value="automatic" className="mt-1 accent-evergreen-700" /><span><strong>Automatic Result Publication</strong><span className="block text-xs text-ink-soft">Objective results publish after completion; written answers require marking first.</span></span></label>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Scoring, instructions & rules</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Points per correct answer" hint="Applied by organizers in results review; quiz question points remain the raw score basis.">
              <Input name="scoring_points" type="number" min={1} defaultValue={100} />
            </Field>
            <label className="flex items-end gap-2 pb-2.5 text-sm text-ink">
              <input type="checkbox" name="scoring_time_bonus" className="h-4 w-4 accent-evergreen-700" /> Speed bonus weighting
            </label>
            <label className="flex items-end gap-2 pb-2.5 text-sm text-ink">
              <input type="checkbox" name="scoring_negative" className="h-4 w-4 accent-evergreen-700" /> Negative marking
            </label>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Instructions for participants"><Textarea name="instructions" rows={4} /></Field>
            <Field label="Rules & regulations"><Textarea name="rules" rows={4} /></Field>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="gold">Create competition</Button>
          <p className="text-xs text-ink-soft">
            Need questions first? <Link href="/admin/questions" className="font-semibold text-evergreen-700 underline underline-offset-2">Open the Question Bank</Link>.
          </p>
        </div>
      </form>
    </>
  );
}
