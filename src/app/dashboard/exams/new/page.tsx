import { Button, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { getEntitlementFor } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { createExam } from "../actions";

export const metadata: Metadata = { title: "New examination" };

export default async function NewExamPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const sp = await searchParams;
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
      {sp.e && <p role="alert" className="mb-4 max-w-3xl rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{{
        fields: "Check the title, published paper, duration and pass mark.",
        paper: "This paper is unavailable, empty, invalid or not in your organization. Review the published quiz before continuing.",
        window: "Enter valid opening and closing times, with closing after opening.",
        availability: "The current examination usage could not be confirmed. Please try again later.",
        create: "The examination could not be confirmed. Check the examination list before retrying to avoid a duplicate.",
      }[sp.e] ?? "The examination could not be created. Please try again."}</p>}
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
            <fieldset className="space-y-3 rounded-xl border border-evergreen-900/15 p-4">
              <legend className="px-1 text-sm font-semibold text-evergreen-950">Candidate integrity policy</legend>
              <input type="hidden" name="integrity_configured" value="1" />
              <p className="text-xs text-ink-soft">Browser events are detected and recorded for human review. This is not a secure-browser lockdown and never automatically disqualifies a candidate.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["integrity_enabled", "Enable integrity monitoring", true],
                  ["integrity_tab", "Detect tab switching", true],
                  ["integrity_focus", "Detect window focus loss", true],
                  ["integrity_fullscreen", "Detect full-screen exit", true],
                  ["integrity_clipboard", "Detect clipboard actions", true],
                  ["integrity_sound", "Audible candidate warnings", true],
                ].map(([name, label, checked]) => (
                  <label key={name as string} className="flex items-center gap-2 text-sm font-medium text-evergreen-900">
                    <input type="checkbox" name={name as string} defaultChecked={Boolean(checked)} className="h-5 w-5 accent-evergreen-700" />
                    {label}
                  </label>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Strong warning after (incidents)"><Input name="integrity_warn_after" type="number" min={1} max={50} defaultValue={3} /></Field>
                <Field label="Escalate for review after (incidents)"><Input name="integrity_review_after" type="number" min={1} max={50} defaultValue={5} /></Field>
              </div>
            </fieldset>
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
