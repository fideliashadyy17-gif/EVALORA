import { Button, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { getEntitlementFor } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { createExam } from "../actions";

export const metadata: Metadata = { title: "New examination" };

export default async function NewExamPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();
  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title")
    .eq("organization_id", org.id)
    .eq("status", "published")
    .order("title");
  const ent = await getEntitlementFor(supabase, ctx, org.id);

  return (
    <>
      <PageTitle title="New examination" subtitle="A formal paper built from one of your published quizzes." />
      <Card className="max-w-3xl p-6">
        {(quizzes ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">
            You need a <strong>published quiz</strong> to use as the examination paper.{" "}
            <Link href="/dashboard/quizzes/new" className="font-semibold text-evergreen-700 underline underline-offset-2">Create and publish one first</Link>.
          </p>
        ) : (
          <form action={createExam} className="space-y-4">
            <Field label="Examination title">
              <Input name="title" required placeholder="Term 2 Mathematics Final — Grade 9" />
            </Field>
            <Field label="Question paper (published quiz)">
              <Select name="quiz_id" required>
                {(quizzes ?? []).map((q) => (
                  <option key={q.id} value={q.id}>{q.title}</option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Duration (minutes)">
                <Input name="duration_minutes" type="number" min={1} max={1440} defaultValue={60} required />
              </Field>
              <Field label="Pass mark (%)">
                <Input name="pass_mark_percent" type="number" min={0} max={100} defaultValue={50} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Opens at (optional)">
                <Input name="starts_at" type="datetime-local" />
              </Field>
              <Field label="Closes at (optional)">
                <Input name="ends_at" type="datetime-local" />
              </Field>
            </div>
            <Field label="Description">
              <Textarea name="description" rows={2} placeholder="Shown to candidates before they start." />
            </Field>
            <Field label="Instructions">
              <Textarea name="instructions" rows={3} placeholder="Rules, permitted materials, integrity notice…" />
            </Field>
            <div className="grid gap-2 rounded-xl bg-cream p-4 sm:grid-cols-2">
              {[
                ["randomize_questions", "Randomize question order per candidate", true],
                ["randomize_options", "Randomize answer options", true],
                ["proctoring", `Enable LiveKit video proctoring${ent.limits.proctoring ? "" : " (Premium)"}`, false],
                ["require_screen_share", "Require screen sharing (with proctoring)", false],
              ].map(([name, label, checked]) => (
                <label key={name as string} className="flex items-center gap-2 text-sm font-medium text-evergreen-900">
                  <input
                    type="checkbox"
                    name={name as string}
                    defaultChecked={Boolean(checked)}
                    disabled={name === "proctoring" && !ent.limits.proctoring}
                    className="h-5 w-5 accent-evergreen-700"
                  />
                  {label}
                </label>
              ))}
            </div>
            {!ent.limits.proctoring && (
              <p className="text-sm text-amber-800">
                Proctoring needs Premium — your current entitlement is <strong>{ent.planName}</strong>.{" "}
                <Link href="/dashboard/billing" className="font-semibold underline">View billing</Link>
              </p>
            )}
            <Button type="submit" variant="gold" className="px-6">Create examination</Button>
          </form>
        )}
      </Card>
    </>
  );
}
