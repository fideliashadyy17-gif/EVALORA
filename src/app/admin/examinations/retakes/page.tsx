import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select, StatCard, Textarea } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { requireSuperAdmin } from "@/lib/auth";
import { RETAKE_ACCESS_PRESETS } from "@/lib/examRetake";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { Flash, Notice, Section, StatusBadge, Table } from "../../ui";
import { approveRetakeAsAdmin, rejectRetakeAsAdmin } from "../retake-actions";

export const metadata: Metadata = { title: "Retake requests" };
export const dynamic = "force-dynamic";

interface RetakeRow {
  id: string;
  exam_id: string;
  candidate_id: string;
  attempt_id: string;
  student_id: string | null;
  requested_by: string | null;
  requester_name: string;
  requester_email: string | null;
  reason: string | null;
  status: string;
  decided_at: string | null;
  decision_note: string | null;
  granted_attempts: number;
  access_expires_at: string | null;
  created_at: string;
  exams: {
    id: string;
    title: string;
    status: string;
    organization_id: string;
    settings: Record<string, unknown> | null;
    organizations: { name?: string } | null;
  } | null;
  exam_candidates: {
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    class_id: string | null;
    student_id: string | null;
  } | null;
  exam_attempts: {
    id: string;
    status: string;
    submitted_at: string | null;
    score: number | null;
    max_score: number | null;
    attempt_number: number | null;
  } | null;
  students: { full_name: string | null; student_ref: string | null } | null;
  requester: { full_name: string | null; email: string | null } | null;
  decider: { full_name: string | null; email: string | null } | null;
}

const MESSAGES: Record<string, string> = {
  retake_approved: "Retake approved. The student can now start one new, separately recorded attempt within the access window.",
  retake_rejected: "Retake request rejected. The original submitted attempt is unchanged.",
  already_decided: "That request had already been decided; nothing was changed.",
  not_found: "That retake request no longer exists.",
  access_window: "Choose a valid access window (at least one hour, within 90 days).",
  exam: "The examination for that request no longer exists.",
  failed: "The decision could not be saved. Try again.",
};

const tone = (status: string): "green" | "red" | "amber" | "gray" =>
  status === "approved" ? "green" : status === "rejected" ? "red" : status === "pending" ? "amber" : "gray";

export default async function RetakeRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; exam?: string; q?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const statusFilter = sp.status && sp.status !== "all" ? sp.status : null;

  let query = admin
    .from("exam_retake_requests")
    .select(
      "id,exam_id,candidate_id,attempt_id,student_id,requested_by,requester_name,requester_email,reason,status,decided_at,decision_note,granted_attempts,access_expires_at,created_at," +
      "exams(id,title,status,organization_id,settings,organizations(name))," +
      "exam_candidates(id,full_name,first_name,last_name,email,class_id,student_id)," +
      "exam_attempts(id,status,submitted_at,score,max_score,attempt_number)," +
      "students(full_name,student_ref)," +
      "requester:profiles!exam_retake_requests_requested_by_fkey(full_name,email)," +
      "decider:profiles!exam_retake_requests_decided_by_fkey(full_name,email)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (sp.exam) query = query.eq("exam_id", sp.exam);

  const [{ data: rows }, pending, approved, rejected] = await Promise.all([
    query,
    admin.from("exam_retake_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("exam_retake_requests").select("id", { count: "exact", head: true }).eq("status", "approved"),
    admin.from("exam_retake_requests").select("id", { count: "exact", head: true }).eq("status", "rejected"),
  ]);

  const requests = ((rows ?? []) as unknown as RetakeRow[]).filter((row) => {
    if (!sp.q) return true;
    const needle = sp.q.toLowerCase();
    return (
      row.requester_name.toLowerCase().includes(needle) ||
      (row.exam_candidates?.full_name ?? "").toLowerCase().includes(needle) ||
      (row.exams?.title ?? "").toLowerCase().includes(needle)
    );
  });

  const classIds = [...new Set(requests.map((r) => r.exam_candidates?.class_id).filter((v): v is string => Boolean(v)))];
  const { data: classRows } = classIds.length
    ? await admin.from("classes").select("id,name").in("id", classIds)
    : { data: [] as { id: string; name: string }[] };
  const classNames = new Map((classRows ?? []).map((c) => [c.id as string, c.name as string]));

  const pendingRows = requests.filter((r) => r.status === "pending");
  const decidedRows = requests.filter((r) => r.status !== "pending");

  return (
    <>
      <Flash />
      <PageTitle
        title="Retake requests"
        subtitle="A submitted attempt is locked. Only an approval recorded here authorizes a further attempt, and each approval creates a separate, fully preserved attempt."
        action={<ButtonLink href="/admin/examinations/links" variant="outline">Link expiration</ButtonLink>}
      />
      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending requests" value={pending.count ?? 0} />
        <StatCard label="Approved" value={approved.count ?? 0} />
        <StatCard label="Rejected" value={rejected.count ?? 0} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Input name="q" defaultValue={sp.q} placeholder="Search student or examination…" aria-label="Search retake requests" />
        </div>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Request status">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">Every status</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      <Section
        title={`Pending requests (${pendingRows.length})`}
        hint="Approving records you as the approving Super Admin, the decision time, an access window and one authorized attempt by default. Rejecting records you, the time and an optional reason. Neither action modifies the original attempt."
      >
        {pendingRows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">
            No retake request is awaiting a decision.
          </p>
        ) : (
          <div className="space-y-4">
            {pendingRows.map((row) => {
              const exam = row.exams;
              const candidate = row.exam_candidates;
              const attempt = row.exam_attempts;
              const resultsPublished = Boolean(exam?.settings?.results_published);
              return (
                <Card key={row.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg font-semibold text-evergreen-950">
                        {candidate?.full_name ?? row.requester_name}
                      </p>
                      <p className="text-sm text-ink-soft">
                        {exam?.organizations?.name ?? "Institution"} · {exam?.title ?? "Examination"}
                      </p>
                      <p className="mt-1 text-xs text-ink-soft">
                        Identifier: {row.students?.student_ref ?? row.requester_email ?? candidate?.email ?? "—"}
                        {row.students?.full_name ? ` · student record: ${row.students.full_name}` : ""}
                        {" · class: "}
                        {candidate?.class_id ? classNames.get(candidate.class_id) ?? "—" : "—"}
                      </p>
                    </div>
                    <Badge tone={tone(row.status)}>{row.status}</Badge>
                  </div>

                  <dl className="mt-4 grid gap-3 rounded-xl border border-evergreen-900/10 bg-cream/60 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Original attempt</dt>
                      <dd className="mt-0.5 font-mono text-xs break-all">{row.attempt_id}</dd>
                      <dd className="text-xs text-ink-soft">
                        Attempt {attempt?.attempt_number ?? 1} · {attempt?.status ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Submitted</dt>
                      <dd className="mt-0.5"><LocalTime iso={attempt?.submitted_at} /></dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Result</dt>
                      <dd className="mt-0.5">
                        {resultsPublished && attempt?.score !== null && attempt?.score !== undefined
                          ? `${attempt.score} / ${attempt.max_score ?? "—"}`
                          : "Not published / unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Request submitted</dt>
                      <dd className="mt-0.5"><LocalTime iso={row.created_at} /></dd>
                    </div>
                  </dl>

                  <div className="mt-3 rounded-lg bg-white p-3 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Student&apos;s reason</p>
                    <p className="mt-1 whitespace-pre-wrap text-ink">{row.reason || "No reason provided."}</p>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <form action={approveRetakeAsAdmin} className="space-y-3 rounded-xl border border-evergreen-600/30 bg-evergreen-50/50 p-4">
                      <input type="hidden" name="request_id" value={row.id} />
                      <input type="hidden" name="back" value="/admin/examinations/retakes" />
                      <p className="text-sm font-semibold text-evergreen-900">Approve retake</p>
                      <Field label="Authorized new attempts" hint="One approval authorizes ONE new attempt unless you explicitly choose otherwise.">
                        <Select name="granted_attempts" defaultValue="1">
                          <option value="1">1 new attempt (default)</option>
                          <option value="2">2 new attempts</option>
                          <option value="3">3 new attempts</option>
                        </Select>
                      </Field>
                      <Field label="Access window" hint="How long the approval stays startable, even if the public link has expired or been disabled.">
                        <Select name="access_preset" defaultValue="7d">
                          {RETAKE_ACCESS_PRESETS.map((preset) => (
                            <option key={preset.key} value={preset.key}>Valid for {preset.label}</option>
                          ))}
                          <option value="custom">Custom end date &amp; time</option>
                        </Select>
                      </Field>
                      <Field label="Custom window end (UTC)" hint="Only used when “Custom end date & time” is selected.">
                        <Input name="access_custom" type="datetime-local" />
                      </Field>
                      <input type="hidden" name="access_mode" value="preset" />
                      <Field label="Decision note (optional, shown to the student if rejected)">
                        <Textarea name="decision_note" rows={2} maxLength={2000} />
                      </Field>
                      <label className="flex items-start gap-2 text-xs text-ink">
                        <input type="checkbox" name="extend_exam_window" defaultChecked className="mt-0.5 h-4 w-4 accent-evergreen-700" />
                        <span>Extend the examination window to cover this access window (only ever lengthens it; other candidates&apos; papers are unaffected).</span>
                      </label>
                      {exam?.status !== "open" && (
                        <label className="flex items-start gap-2 text-xs text-ink">
                          <input type="checkbox" name="reopen_exam" className="mt-0.5 h-4 w-4 accent-evergreen-700" />
                          <span>Reopen the examination (status is “{exam?.status}”). Without this, the approved retake cannot start.</span>
                        </label>
                      )}
                      <Button type="submit" variant="gold">Approve retake</Button>
                    </form>

                    <form action={rejectRetakeAsAdmin} className="space-y-3 rounded-xl border border-red-300/60 bg-red-50/40 p-4">
                      <input type="hidden" name="request_id" value={row.id} />
                      <input type="hidden" name="back" value="/admin/examinations/retakes" />
                      <p className="text-sm font-semibold text-red-900">Reject request</p>
                      <Field label="Reason for rejection (optional)">
                        <Textarea name="decision_note" rows={3} maxLength={2000} />
                      </Field>
                      <p className="text-xs text-ink-soft">No new attempt is authorized. The original submitted attempt keeps its answers, score, marks and proctoring records.</p>
                      <Button type="submit" variant="outline">Reject request</Button>
                    </form>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title={`Retake history (${decidedRows.length})`}
        hint="Every decision is permanent and audited: who decided, when, the note, the access window and how many attempts were authorized."
      >
        {decidedRows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">
            No decided requests yet.
          </p>
        ) : (
          <Table head={["Student", "Examination", "Submitted attempt", "Requested", "Decision", "Decided by", "Access window", "Note"]}>
            {decidedRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className="font-medium">{row.exam_candidates?.full_name ?? row.requester_name}</span>
                  <span className="block text-xs text-ink-soft">
                    {row.students?.student_ref ?? row.requester_email ?? "—"}
                  </span>
                </td>
                <td>
                  {row.exams?.title ?? "—"}
                  <span className="block text-xs text-ink-soft">{row.exams?.organizations?.name ?? "—"}</span>
                </td>
                <td>
                  <span className="block font-mono text-xs break-all">{row.attempt_id.slice(0, 8)}…</span>
                  <LocalTime iso={row.exam_attempts?.submitted_at} />
                </td>
                <td><LocalTime iso={row.created_at} /></td>
                <td>
                  <StatusBadge status={row.status} />
                  <span className="block text-xs text-ink-soft"><LocalTime iso={row.decided_at} /></span>
                </td>
                <td>{row.decider?.full_name || row.decider?.email || "—"}</td>
                <td>
                  {row.status === "approved" ? (
                    <>
                      <LocalTime iso={row.access_expires_at} fallback="—" />
                      <span className="block text-xs text-ink-soft">{row.granted_attempts} attempt(s)</span>
                    </>
                  ) : "—"}
                </td>
                <td className="max-w-[220px] text-xs">{row.decision_note || "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
