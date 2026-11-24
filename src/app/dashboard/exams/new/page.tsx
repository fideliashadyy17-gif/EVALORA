import { Button, ButtonLink, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
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
  const [{ data: quizzes }, { data: templates }, { data: mySubjectRows }] = await Promise.all([
    supabase
      .from("quizzes")
      .select("id, title")
      .eq("organization_id", org.id)
      .eq("status", "published")
      .order("title"),
    supabase
      .from("exam_paper_templates")
      .select("id, name, is_default")
      .eq("organization_id", org.id)
      .order("is_default", { ascending: false }),
    // The author's first assigned subject → default Subject on a new exam.
    supabase
      .from("teacher_subjects")
      .select("subjects(name)")
      .eq("organization_id", org.id)
      .eq("profile_id", ctx.user.id)
      .limit(1),
  ]);
  const firstSubjectRel = (mySubjectRows ?? [])[0] as unknown as
    | { subjects: { name: string }[] | { name: string } | null }
    | undefined;
  const firstSubjectList = Array.isArray(firstSubjectRel?.subjects)
    ? firstSubjectRel.subjects
    : firstSubjectRel?.subjects
      ? [firstSubjectRel.subjects]
      : [];
  const defaultSubjectName = firstSubjectList[0]?.name ?? "";
  const ent = await getEntitlementFor(supabase, ctx, org.id);

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Paper Scheduling & Integrity Policy"
        title="New examination"
        subtitle="A formal paper built from one of your published quizzes."
        action={<ButtonLink href="/dashboard/exams" variant="outline">All examinations</ButtonLink>}
      />
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
            <Field
              label="Question-paper content language"
              hint="The language the paper was authored in. Candidates always see the paper in this language — switching the interface language never translates examination content."
            >
              <Select name="language" defaultValue="auto">
                <option value="auto">Detect from the paper (recommended)</option>
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Examination period">
                <Input name="exam_period" placeholder="First Term Examination" />
              </Field>
              <Field label="Academic year">
                <Input name="academic_year" placeholder="2026–2027" />
              </Field>
              <Field label="Grade / Class">
                <Input name="grade_label" placeholder="MYP4" />
              </Field>
              <Field label="Subject">
                <Input name="subject" defaultValue={defaultSubjectName} placeholder="Mathematics" />
              </Field>
            </div>
            <Field label="Official paper template">
              <Select name="exam_paper_template_id">
                <option value="">Organization defaults</option>
                {(templates ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.is_default ? " (default)" : ""}</option>
                ))}
              </Select>
            </Field>
            <div className="rounded-xl border border-evergreen-900/10 bg-cream p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-evergreen-900">
                <input type="checkbox" name="calculator" defaultChecked className="h-5 w-5 accent-evergreen-700" />
                Scientific calculator available to candidates
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Calculator mode">
                  <Select name="calculator_mode" defaultValue="scientific">
                    <option value="scientific">Scientific (full)</option>
                    <option value="basic">Basic (four operations)</option>
                  </Select>
                </Field>
                <Field label="Default angle mode">
                  <Select name="calculator_angle_mode" defaultValue="deg">
                    <option value="deg">Degrees</option>
                    <option value="rad">Radians</option>
                  </Select>
                </Field>
              </div>
            </div>
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

            <div className="rounded-xl border border-evergreen-900/15 bg-paper p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="lockdown_enabled"
                  name="lockdown_enabled"
                  className="mt-1 h-5 w-5 accent-evergreen-700"
                />
                <div>
                  <label htmlFor="lockdown_enabled" className="block text-sm font-semibold text-evergreen-950">
                    Require EVALORA Secure Exam Application (Lockdown Mode)
                  </label>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                    Strictly optional. When enabled, candidates cannot enter using ordinary web browsers and must launch
                    the official EVALORA Secure Exam Application, which enforces fullscreen kiosk, OS-level screen protection,
                    and prohibited background process monitoring. Standard web access remains unobstructed when disabled.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-evergreen-900">
                      <input
                        type="checkbox"
                        name="lockdown_strict_multi_display"
                        defaultChecked
                        className="h-4 w-4 accent-evergreen-700"
                      />
                      Enforce single display (block multi-monitor)
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-evergreen-900">
                      <input
                        type="checkbox"
                        name="lockdown_block_clipboard"
                        defaultChecked
                        className="h-4 w-4 accent-evergreen-700"
                      />
                      Strict clipboard isolation
                    </label>
                  </div>
                </div>
              </div>
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
