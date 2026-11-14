import { RetakeDecisionWatcher } from "@/components/RetakeDecisionWatcher";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";
import { Badge, Card } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { activeOrg, requireUser } from "@/lib/auth";
import { examLinkLifecycle } from "@/lib/examLink";
import { attemptLabel } from "@/lib/examRetake";
import { isLearnerRole } from "@/lib/roleRouting";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { FileCheck2, Radio, Sparkles } from "lucide-react";

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
  decision_seen_at: string | null;
  retake_code: string | null;
  retake_code_consumed_at: string | null;
  granted_attempts: number | null;
}

/** Student hub for the authenticated learner's own examinations and live activities. */
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
        .select("id,exam_id,status,created_at,decided_at,decision_note,access_expires_at,decision_seen_at,retake_code,retake_code_consumed_at,granted_attempts")
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

  // A decision the student has not been shown yet takes over the page: they
  // land on the retake decision page whether the decision was just made (the
  // live watcher below) or while they were away. Viewing it marks it seen, so
  // the automatic redirection happens exactly once.
  const unseenDecision = [...requestsByExam.values()]
    .flat()
    .filter((r) => (r.status === "approved" || r.status === "rejected") && !r.decision_seen_at)
    .sort((a, b) => Date.parse(b.decided_at ?? b.created_at) - Date.parse(a.decided_at ?? a.created_at))[0];
  if (unseenDecision) redirect(`/retake/${unseenDecision.id}`);

  const pendingRequestIds = [...requestsByExam.values()].flat().filter((r) => r.status === "pending").map((r) => r.id);

  return <main className="student-hub min-h-screen bg-cream px-4 py-5 sm:px-6 sm:py-8">
    <div className="mx-auto max-w-5xl">
      {pendingRequestIds.length > 0 && <RetakeDecisionWatcher pendingIds={pendingRequestIds} />}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Logo href="/student" />
        <div className="rounded-full border border-evergreen-900/10 bg-white px-4 py-2 text-right shadow-sm">
          <p className="max-w-[16rem] truncate text-sm font-semibold text-evergreen-950">{org.name}</p>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-soft">Student portal</p>
        </div>
      </header>

      <section className="student-hero relative isolate overflow-hidden rounded-[1.75rem] bg-evergreen-950 px-6 py-8 text-white shadow-[var(--shadow-lift)] sm:px-10 sm:py-11">
        <div className="student-hero-orbit" aria-hidden="true" />
        <div className="relative z-10 max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gold-200">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> Your learning space
          </p>
          <h1 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Welcome back, {ctx.profile.full_name?.split(" ")[0] || "student"}.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-evergreen-100 sm:text-base">
            Continue an examination or join a live activity. Your institution will provide the codes and instructions you need.
          </p>
        </div>
        <div className="student-hero-mark" aria-hidden="true">E</div>
      </section>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Card className="student-entry-card group flex items-start gap-4 p-5 sm:p-6">
          <span className="student-entry-icon"><FileCheck2 aria-hidden="true" className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Examination access</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">Enter your examination and candidate codes to access your paper.</p>
            <Link href="/exam-access" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-evergreen-800 underline-offset-4 hover:underline">Enter codes <span aria-hidden="true">→</span></Link>
          </div>
        </Card>
        <Card className="student-entry-card group flex items-start gap-4 p-5 sm:p-6">
          <span className="student-entry-icon student-entry-icon-gold"><Radio aria-hidden="true" className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Live activity</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">Use your organizer’s join code to enter a live quiz.</p>
            <Link href="/join" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-evergreen-800 underline-offset-4 hover:underline">Join with a code <span aria-hidden="true">→</span></Link>
          </div>
        </Card>
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

                {pending && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <strong className="font-semibold">Pending.</strong> Retake request awaiting an administrator&apos;s
                    decision since <LocalTime iso={pending.created_at} />.
                  </p>
                )}
                {approved && (
                  <div className="mt-2 rounded-lg bg-evergreen-50 px-3 py-2 text-sm text-evergreen-900">
                    <p><strong className="font-semibold">Approved.</strong> Start the authorized attempt before <LocalTime iso={approved.access_expires_at} />.</p>
                    {approved.retake_code && !approved.retake_code_consumed_at && (
                      <p className="mt-1">
                        Retake code: <span className="font-mono text-base font-bold tracking-[0.2em] text-evergreen-950">{approved.retake_code}</span>
                      </p>
                    )}
                    <Link prefetch={false} className="mt-2 inline-flex font-semibold text-evergreen-700 underline underline-offset-2" href={`/retake/${approved.id}`}>
                      Open the retake access page →
                    </Link>
                  </div>
                )}
                {!pending && !approved && rejected && (
                  <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
                    <p>
                      <strong className="font-semibold">Rejected.</strong>
                      {rejected.decision_note ? ` Reason: ${rejected.decision_note}` : " No reason was recorded."}
                    </p>
                    <Link prefetch={false} className="mt-1 inline-flex font-semibold text-red-800 underline underline-offset-2" href={`/retake/${rejected.id}`}>
                      See the decision →
                    </Link>
                  </div>
                )}

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

      <footer className="student-footer mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-evergreen-900/15 pt-5 text-sm">
        <p className="text-ink-soft">Need help? Contact your institution for examination codes and instructions.</p>
        <div className="flex flex-wrap items-center gap-4">
          {ctx.memberships.length > 1 && !ctx.tenantSlug && <Link href="/workspaces" className="font-semibold text-evergreen-800 underline underline-offset-4">Switch workspace</Link>}
          <SignOutButton />
        </div>
      </footer>
    </div>
  </main>;
}
