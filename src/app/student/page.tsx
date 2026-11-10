import { SignOutButton } from "@/components/SignOutButton";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { activeOrg, requireUser } from "@/lib/auth";
import { examLinkLifecycle } from "@/lib/examLink";
import { attemptLabel } from "@/lib/examRetake";
import { isLearnerRole } from "@/lib/roleRouting";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Student workspace" };
export const dynamic = "force-dynamic";

interface AttemptRow {
  id: string;
  exam_id: string;
  status: string;
  attempt_number: number | null;
  submitted_at: string | null;
  started_at: string;
  score: number | null;
  max_score: number | null;
  exams: {
    id: string;
    title: string;
    status: string;
    invite_token: string;
    shared_link_enabled: boolean;
    invite_expires_at: string | null;
    invite_activates_at: string | null;
    invite_no_expiry: boolean;
    settings: Record<string, unknown> | null;
  } | null;
}

interface RequestRow {
  id: string;
  exam_id: string;
  status: string;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  access_expires_at: string | null;
}

/** A small, real entry point to the existing code-based candidate flows. */
export default async function StudentWorkspace() {
  const ctx = await requireUser();
  if (ctx.profile.platform_role === "super_admin") redirect("/admin");
  if (ctx.tenantDenied) redirect("/dashboard");
  const org = activeOrg(ctx);
  if (!org) redirect(ctx.memberships.length ? "/workspaces" : "/onboarding");
  if (ctx.memberships.length > 1 && !ctx.workspaceSelected) redirect("/workspaces");
  if (!isLearnerRole(org.role)) redirect("/dashboard");
  if (org.status !== "active") return <main className="mx-auto max-w-xl px-4 py-16"><Card className="p-6"><h1 className="font-display text-2xl font-semibold">Organization unavailable</h1><p className="mt-2 text-sm">This workspace is {org.status}. Contact your institution for assistance.</p></Card></main>;

  // Only the signed-in student's OWN attempts and requests are read, and they
  // are read with an explicit `student_id` filter — never by name or email.
  const admin = createAdminClient();
  // The profile id IS the authenticated user id. Guarded so the page still
  // renders a valid empty state if the session shape is incomplete.
  const studentUserId = ctx.profile.id;
  const student = studentUserId
    ? (await admin
        .from("students")
        .select("id,full_name")
        .eq("user_id", studentUserId)
        .eq("organization_id", org.id)
        .maybeSingle()).data
    : null;

  let attempts: AttemptRow[] = [];
  let requestsByExam = new Map<string, RequestRow[]>();
  if (student) {
    const [{ data: attemptRows }, { data: requestRows }] = await Promise.all([
      admin
        .from("exam_attempts")
        .select("id,exam_id,status,attempt_number,submitted_at,started_at,score,max_score,exams(id,title,status,invite_token,shared_link_enabled,invite_expires_at,invite_activates_at,invite_no_expiry,settings)")
        .eq("student_id", student.id)
        .order("started_at", { ascending: false })
        .limit(60),
      admin
        .from("exam_retake_requests")
        .select("id,exam_id,status,created_at,decided_at,decision_note,access_expires_at")
        .eq("student_id", student.id)
        .order("created_at", { ascending: false })
        .limit(60),
    ]);
    attempts = (attemptRows ?? []) as unknown as AttemptRow[];
    requestsByExam = (requestRows ?? []).reduce((map, row) => {
      const list = map.get(row.exam_id as string) ?? [];
      list.push(row as unknown as RequestRow);
      map.set(row.exam_id as string, list);
      return map;
    }, new Map<string, RequestRow[]>());
  }

  return <main className="mx-auto max-w-3xl px-4 py-12">
    <p className="text-sm font-semibold uppercase tracking-wide text-evergreen-700">{org.name}</p>
    <h1 className="mt-2 font-display text-3xl font-semibold text-evergreen-950">Welcome, {ctx.profile.full_name?.split(" ")[0] || "student"}</h1>
    <p className="mt-3 text-ink-soft">Use the code provided by your institution to enter an examination or join a live activity.</p>
    <div className="mt-7 grid gap-4 sm:grid-cols-2">
      <Card className="p-6"><h2 className="font-display text-xl font-semibold">Enter an examination</h2><p className="mt-2 text-sm text-ink-soft">Enter your examination and candidate codes to access your paper.</p><ButtonLink href="/exam-access" className="mt-4">Enter examination</ButtonLink></Card>
      <Card className="p-6"><h2 className="font-display text-xl font-semibold">Join a live activity</h2><p className="mt-2 text-sm text-ink-soft">Use your organizer’s join code to enter a live quiz.</p><ButtonLink href="/join" variant="outline" className="mt-4">Join activity</ButtonLink></Card>
    </div>

    {attempts.length > 0 && (
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold text-evergreen-950">Your examination records</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Submitted papers are permanently locked. A retake is only possible after you request one and a Super Admin approves it.
        </p>
        <div className="mt-4 space-y-3">
          {attempts.map((attempt) => {
            const requests = requestsByExam.get(attempt.exam_id) ?? [];
            const pending = requests.find((r) => r.status === "pending") ?? null;
            const approved = requests.find((r) => r.status === "approved"
              && r.access_expires_at
              && Date.parse(r.access_expires_at) > Date.now()) ?? null;
            const rejected = requests.find((r) => r.status === "rejected") ?? null;
            const link = attempt.exams ? examLinkLifecycle(attempt.exams) : null;
            const submitted = attempt.status !== "in_progress";
            return (
              <Card key={attempt.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-evergreen-950">{attempt.exams?.title ?? "Examination"}</p>
                    <p className="text-xs text-ink-soft">
                      {attemptLabel(Number(attempt.attempt_number ?? 1))}
                      {submitted ? <> · submitted <LocalTime iso={attempt.submitted_at} /></> : <> · in progress</>}
                      {Boolean(attempt.exams?.settings?.results_published) && attempt.score !== null
                        ? ` · ${attempt.score} / ${attempt.max_score ?? "—"}`
                        : ""}
                    </p>
                  </div>
                  <Badge tone={submitted ? "gray" : "green"}>{submitted ? "Submitted & locked" : "In progress"}</Badge>
                </div>

                {pending && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Retake request pending approval since <LocalTime iso={pending.created_at} />.</p>}
                {approved && <p className="mt-2 rounded-lg bg-evergreen-50 px-3 py-2 text-sm text-evergreen-900">A retake is approved. Start it before <LocalTime iso={approved.access_expires_at} /> from your submitted paper page or the examination access link.</p>}
                {!pending && !approved && rejected && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">Your last retake request was rejected.{rejected.decision_note ? ` ${rejected.decision_note}` : ""}</p>}

                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  {attempt.exams?.invite_token && (
                    <Link className="font-medium text-evergreen-700 underline underline-offset-2" href={`/exam/join/${attempt.exams.invite_token}`}>
                      Open examination access page
                    </Link>
                  )}
                  {link && <span className="text-xs text-ink-soft">Link: {link.label}</span>}
                </div>
              </Card>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          To request a retake, open your submitted paper (the confirmation shown at submission) and use “Request a retake”. Your institution&apos;s access code is required.
        </p>
      </section>
    )}

    <p className="mt-6 text-sm text-ink-soft">Your institution will provide codes and instructions.</p>
    {ctx.memberships.length > 1 && !ctx.tenantSlug && <Link href="/workspaces" className="mt-6 block font-semibold text-evergreen-700 underline underline-offset-2">Switch workspace</Link>}
    <div className="mt-6"><SignOutButton /></div>
  </main>;
}
