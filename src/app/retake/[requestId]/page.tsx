import { LocalTime } from "@/components/LocalTime";
import { RetakeDecisionWatcher } from "@/components/RetakeDecisionWatcher";
import { ButtonLink, Card } from "@/components/ui";
import { getSessionContext } from "@/lib/auth";
import {
  retakeAccessProblem,
  retakeAccessProblemMessage,
} from "@/lib/examRetake";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { RetakeAccessForm } from "./RetakeAccessForm";

export const metadata: Metadata = { title: "Retake access" };
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface PageRow {
  id: string;
  status: string;
  student_id: string | null;
  requested_by: string | null;
  candidate_id: string;
  reason: string | null;
  decision_note: string | null;
  decided_at: string | null;
  access_expires_at: string | null;
  granted_attempts: number | null;
  retake_code: string | null;
  retake_code_consumed_at: string | null;
  decision_seen_at: string | null;
  created_at: string;
  exams: { id: string; title: string; organizations: { name: string | null } | null } | null;
  exam_candidates: { first_name: string | null; last_name: string | null; full_name: string | null } | null;
  decider: { full_name: string | null } | null;
}

/**
 * The page the student is sent to the moment an approval or a rejection is
 * recorded — live, or the next time they open EVALORA if they were offline.
 *
 * It only ever renders the caller's own request: a signed-out visitor is sent
 * to sign in and return here, and a request belonging to somebody else is a
 * 404, exactly like a request that does not exist.
 */
export default async function RetakePage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  if (!UUID_RE.test(requestId)) notFound();

  const ctx = await getSessionContext().catch(() => null);
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`/retake/${requestId}`)}`);
  if (ctx.profile.status !== "active") redirect("/login?error=suspended");

  const admin = createAdminClient();
  const { data } = await admin
    .from("exam_retake_requests")
    .select(
      "id,status,student_id,requested_by,candidate_id,reason,decision_note,decided_at,access_expires_at,granted_attempts,retake_code,retake_code_consumed_at,decision_seen_at,created_at," +
        "exams(id,title,organizations(name))," +
        "exam_candidates(first_name,last_name,full_name)," +
        "decider:profiles!exam_retake_requests_decided_by_fkey(full_name)",
    )
    .eq("id", requestId)
    .maybeSingle();

  const row = data as unknown as PageRow | null;
  if (!row) notFound();

  const { data: student } = row.student_id
    ? await admin.from("students").select("id,user_id").eq("id", row.student_id).maybeSingle()
    : { data: null };
  const owns =
    row.requested_by === ctx.profile.id ||
    (student?.user_id != null && student.user_id === ctx.profile.id);
  if (!owns) notFound();

  const decided = row.status === "approved" || row.status === "rejected";
  // A decision is shown automatically once. After that the student reaches the
  // page from their own dashboard, not through a redirect.
  if (decided && !row.decision_seen_at) {
    await admin
      .from("exam_retake_requests")
      .update({ decision_seen_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("decision_seen_at", null);
  }

  const { count: attemptsUsed } = await admin
    .from("exam_attempts")
    .select("id", { count: "exact", head: true })
    .eq("retake_request_id", row.id);
  const used = attemptsUsed ?? 0;
  const granted = Math.max(1, Math.min(3, Math.floor(Number(row.granted_attempts ?? 1))));
  const examTitle = row.exams?.title ?? "Your examination";
  const institution = row.exams?.organizations?.name ?? null;

  const shell = (children: ReactNode) => (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-12">{children}</main>
  );

  if (row.status === "pending") {
    return shell(
      <Card className="w-full p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Awaiting decision</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-evergreen-950">{examTitle}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your retake request was submitted <LocalTime iso={row.created_at} /> and is waiting for an administrator.
          This page updates by itself the moment a decision is recorded.
        </p>
        <RetakeDecisionWatcher pendingIds={[row.id]} />
        <div className="mt-5">
          <ButtonLink href="/student" variant="outline">Back to my workspace</ButtonLink>
        </div>
      </Card>,
    );
  }

  if (row.status === "rejected" || row.status === "cancelled") {
    const rejected = row.status === "rejected";
    return shell(
      <Card className="w-full border-red-200 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">
          {rejected ? "Retake request" : "Retake request cancelled"}
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-evergreen-950">
          {rejected ? "Your retake request has been rejected." : "This retake request was cancelled."}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {examTitle}
          {institution ? ` · ${institution}` : ""}
          {row.decided_at ? <> · decided <LocalTime iso={row.decided_at} /></> : null}
        </p>
        {rejected && row.decision_note ? (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Reason from the administrator</p>
            <p className="mt-1 whitespace-pre-wrap">{row.decision_note}</p>
          </div>
        ) : null}
        <p className="mt-4 rounded-lg bg-cream px-4 py-3 text-sm text-ink">
          No new attempt was created and no access code was issued. Your original submitted paper, its answers,
          score and history are unchanged.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href="/student" variant="outline">Back to my workspace</ButtonLink>
        </div>
      </Card>,
    );
  }

  if (row.status !== "approved") {
    return shell(
      <Card className="w-full p-6 sm:p-8">
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">This retake is not available</h1>
        <p className="mt-2 text-sm text-ink-soft">Ask your institution to approve a retake request.</p>
        <div className="mt-5"><ButtonLink href="/student" variant="outline">Back to my workspace</ButtonLink></div>
      </Card>,
    );
  }

  const problem = retakeAccessProblem(row, used);
  if (problem) {
    return shell(
      <Card className="w-full p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Retake approved</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-evergreen-950">{examTitle}</h1>
        <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {retakeAccessProblemMessage(problem)}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href="/student" variant="outline">Back to my workspace</ButtonLink>
        </div>
      </Card>,
    );
  }

  return shell(
    <RetakeAccessForm
      requestId={row.id}
      examTitle={`${examTitle}${institution ? ` · ${institution}` : ""}`}
      expiresAt={row.access_expires_at}
      remaining={Math.max(0, granted - used)}
    />,
  );
}
