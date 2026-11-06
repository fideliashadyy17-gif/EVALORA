import { Badge, Button, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { attemptDeadline } from "@/lib/exam";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { Activity, Eye, TriangleAlert, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { enterOrgWorkspace } from "../../actions/orgs";
import { Notice, Section, StatusBadge, Table } from "../../ui";
import { reviewProctoringIncidentAsAdmin } from "../actions";

export const metadata: Metadata = { title: "Examination monitoring" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  incident_reviewed: "Proctoring incident review saved.",
  status: "Invalid incident review status.",
  incident: "That incident no longer exists.",
  failed: "The incident review could not be saved.",
};

interface AttemptRow {
  id: string;
  exam_id: string;
  started_at: string;
  submitted_at: string | null;
  status: string;
  extension_minutes: number;
  exam_candidates: { full_name: string; candidate_ref: string | null } | null;
  exams: { title: string; duration_minutes: number; ends_at: string | null; quiz_id: string | null } | null;
  exam_answers: { count: number }[];
}

export default async function ExaminationMonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; severity?: string; incident?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let attemptQuery = admin
    .from("exam_attempts")
    .select("id, exam_id, started_at, submitted_at, status, extension_minutes, exam_candidates(full_name, candidate_ref), exams(title, duration_minutes, ends_at, quiz_id), exam_answers(count)")
    .order("started_at", { ascending: false })
    .limit(500);
  if (sp.exam) attemptQuery = attemptQuery.eq("exam_id", sp.exam);

  let incidentQuery = admin
    .from("proctoring_incidents")
    .select("*, exams(title, organization_id, organizations(name)), exam_candidates(full_name), reporter:profiles!proctoring_incidents_reported_by_fkey(email), reviewer:profiles!proctoring_incidents_reviewed_by_fkey(email)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (sp.exam) incidentQuery = incidentQuery.eq("exam_id", sp.exam);
  if (sp.severity) incidentQuery = incidentQuery.eq("severity", sp.severity);
  if (sp.incident) incidentQuery = incidentQuery.eq("status", sp.incident);

  const [{ data: exams }, { data: rawAttempts }, { data: incidents }] = await Promise.all([
    admin.from("exams").select("id, title, status, organization_id, settings, organizations(name)").order("created_at", { ascending: false }).limit(300),
    attemptQuery,
    incidentQuery,
  ]);
  const attempts = (rawAttempts ?? []) as unknown as AttemptRow[];
  const activeAttempts = attempts.filter((a) => a.status === "in_progress");
  const back = sp.exam ? `/admin/examinations/monitoring?exam=${sp.exam}` : "/admin/examinations/monitoring";
  const now = Date.now();
  const overdue = activeAttempts.filter((a) => a.exams && attemptDeadline(a.exams, a.started_at, a.extension_minutes).getTime() < now).length;

  return (
    <>
      <PageTitle
        title="Examination monitoring"
        subtitle="Live candidate progress, server deadlines, saved-answer volume and human-reviewed proctoring incidents. Incidents are observations for review, never automatic proof of misconduct."
      />

      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Attempts in progress" value={activeAttempts.length} icon={<Activity className="h-5 w-5" />} />
        <StatCard label="Attempts shown" value={attempts.length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Past deadline, awaiting close" value={overdue} icon={<TriangleAlert className="h-5 w-5" />} />
        <StatCard label="Open incidents" value={(incidents ?? []).filter((i) => i.status === "open").length} icon={<Eye className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <Select name="exam" defaultValue={sp.exam ?? ""} className="min-w-[260px]" aria-label="Examination">
          <option value="">All examinations</option>
          {(exams ?? []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </Select>
        <Select name="severity" defaultValue={sp.severity ?? ""} className="w-44" aria-label="Incident severity">
          <option value="">All severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </Select>
        <Select name="incident" defaultValue={sp.incident ?? ""} className="w-48" aria-label="Incident status">
          <option value="">All incident states</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="valid">Valid</option>
          <option value="invalid">Invalid</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        <Link href={back} className="pb-2 font-medium text-evergreen-700 underline-offset-2 hover:underline">↻ Refresh</Link>
      </form>

      <Section title="Proctoring rooms">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(exams ?? [])
            .filter((e) => Boolean((e.settings as Record<string, unknown> | null)?.proctoring))
            .slice(0, 12)
            .map((e) => (
              <div key={e.id} className="rounded-2xl border border-evergreen-900/15 bg-paper p-4">
                <p className="font-semibold text-evergreen-950">{e.title}</p>
                <p className="mt-1 text-xs text-ink-soft">{(e.organizations as unknown as { name?: string } | null)?.name} · {e.status}{Boolean((e.settings as Record<string, unknown>)?.require_screen_share) ? " · screen share required" : ""}</p>
                <form action={enterOrgWorkspace} className="mt-3">
                  <input type="hidden" name="organization_id" value={e.organization_id} />
                  <input type="hidden" name="next" value={`/dashboard/exams/${e.id}/proctor`} />
                  <Button type="submit" variant="gold" className="px-3 py-2 text-xs">🎥 Open proctoring room</Button>
                </form>
              </div>
            ))}
          {(exams ?? []).every((e) => !Boolean((e.settings as Record<string, unknown> | null)?.proctoring)) && (
            <p className="text-sm text-ink-soft">No examinations currently have video proctoring enabled.</p>
          )}
        </div>
      </Section>

      <Section title="Candidate attempts">
        {attempts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">No attempts match.</p>
        ) : (
          <Table head={["Candidate / examination", "Started", "Server deadline", "Saved answers", "Extension", "Status", "Actions"]}>
            {attempts.map((a) => {
              const deadline = a.exams ? attemptDeadline(a.exams, a.started_at, a.extension_minutes) : null;
              const remaining = deadline ? Math.ceil((deadline.getTime() - now) / 60000) : null;
              return (
                <tr key={a.id}>
                  <td><span className="font-medium">{a.exam_candidates?.full_name ?? "Candidate"}</span><span className="block text-xs text-ink-soft">{a.exams?.title}{a.exam_candidates?.candidate_ref ? ` · ${a.exam_candidates.candidate_ref}` : ""}</span></td>
                  <td className="text-ink-soft">{fmtDateTime(a.started_at)}</td>
                  <td>{deadline ? fmtDateTime(deadline.toISOString()) : "—"}<span className="block text-xs text-ink-soft">{a.status === "in_progress" && remaining !== null ? (remaining < 0 ? `${Math.abs(remaining)} min overdue` : `${remaining} min left`) : a.submitted_at ? `Submitted ${fmtDateTime(a.submitted_at)}` : ""}</span></td>
                  <td className="tabular-nums">{a.exam_answers[0]?.count ?? 0}</td>
                  <td>{Number(a.extension_minutes) > 0 ? <Badge tone="gold">+{a.extension_minutes} min</Badge> : "—"}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <Link href={`/admin/examinations/time-limits?exam=${a.exam_id}`} className="font-medium text-evergreen-700 hover:underline">Time / extension</Link>
                      <Link href={`/admin/examinations/candidates?exam=${a.exam_id}`} className="font-medium text-evergreen-700 hover:underline">Candidates</Link>
                      {a.status !== "in_progress" && <Link href={`/admin/examinations/results?exam=${a.exam_id}`} className="font-medium text-evergreen-700 hover:underline">Result</Link>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section title="Proctoring incidents requiring human review">
        {(incidents ?? []).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">No proctoring incidents match.</p>
        ) : (
          <Table head={["Recorded", "Candidate / examination", "Observation", "Severity", "Reported by", "Review"]}>
            {(incidents ?? []).map((i) => {
              const exam = i.exams as unknown as { title: string; organizations: { name: string } | null } | null;
              return (
                <tr key={i.id}>
                  <td className="text-ink-soft">{fmtDateTime(i.created_at)}</td>
                  <td><span className="font-medium">{(i.exam_candidates as unknown as { full_name?: string } | null)?.full_name ?? "Unassigned"}</span><span className="block text-xs text-ink-soft">{exam?.title} · {exam?.organizations?.name}</span></td>
                  <td>{String(i.type).replace(/_/g, " ")}{i.note ? <span className="block text-xs text-ink-soft">{i.note}</span> : null}</td>
                  <td><Badge tone={i.severity === "high" ? "red" : i.severity === "medium" ? "amber" : "gray"}>{i.severity}</Badge></td>
                  <td className="text-ink-soft">{(i.reporter as unknown as { email?: string } | null)?.email ?? "System"}</td>
                  <td>
                    <form action={reviewProctoringIncidentAsAdmin} className="flex min-w-[210px] gap-2">
                      <input type="hidden" name="incident_id" value={i.id} />
                      <input type="hidden" name="back" value={back} />
                      <Select name="status" defaultValue={i.status} aria-label="Incident review status">
                        <option value="open">Open</option>
                        <option value="investigating">Investigating</option>
                        <option value="valid">Valid concern</option>
                        <option value="invalid">Dismissed / invalid</option>
                      </Select>
                      <Button type="submit" variant="outline" className="px-3 py-2 text-xs">Save</Button>
                    </form>
                    {(i.reviewer as unknown as { email?: string } | null)?.email && <span className="mt-1 block text-xs text-ink-soft">Reviewed by {(i.reviewer as unknown as { email?: string }).email}</span>}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>
    </>
  );
}
