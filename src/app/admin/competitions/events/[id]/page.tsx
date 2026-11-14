import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, Table } from "../../../ui";
import { computeEligibility, decideQualification, setEventPhaseStatus, updateQualificationRule } from "../actions";

export const metadata: Metadata = { title: "Competition Event" };
export const dynamic = "force-dynamic";

interface SP { ok?: string; e?: string; n?: string }

const tone = (s: string) => (s === "open" || s === "approved" ? "green" : s === "scheduled" || s === "eligible" ? "amber" : "gray") as "green" | "amber" | "gray";
const PHASE_LABEL: Record<string, string> = {
  elimination: "Phase 1 — Elimination Round (Examination)",
  semi_final: "Phase 2 — Semi-Final (Live Competition)",
  grand_final: "Phase 3 — Grand Final (Live Competition)",
};

export default async function CompetitionEventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: ev } = await admin
    .from("competition_events")
    .select("*, organizations(name), academic_years(name), competition_event_phases(*, competition_phase_classes(*, classes(name)))")
    .eq("id", id)
    .maybeSingle();
  if (!ev) notFound();

  const phases = [...((ev.competition_event_phases as Record<string, unknown>[]) ?? [])].sort((a, b) => Number(a.sort) - Number(b.sort));
  const sessionIds = phases.flatMap((p) => ((p.competition_phase_classes as Record<string, unknown>[]) ?? []).map((pc) => pc.session_id).filter(Boolean) as string[]);
  const { data: sessions } = sessionIds.length
    ? await admin.from("quiz_sessions").select("id, join_code, status, phase").in("id", sessionIds)
    : { data: [] };
  const sessionById = new Map((sessions ?? []).map((s) => [s.id, s]));
  const examIds = phases.flatMap((p) => ((p.competition_phase_classes as Record<string, unknown>[]) ?? []).map((pc) => pc.exam_id).filter(Boolean) as string[]);
  const { data: exams } = examIds.length
    ? await admin.from("exams").select("id, title, access_code, status, duration_minutes").in("id", examIds)
    : { data: [] };
  const examById = new Map((exams ?? []).map((x) => [x.id, x]));

  const { data: quals } = await admin
    .from("qualification_records")
    .select("*, classes(name)")
    .eq("event_id", id)
    .order("source_rank")
    .limit(1000);
  const phaseName = new Map(phases.map((p) => [String(p.id), String(p.phase_key)]));

  const transitions = [
    { fromKey: "elimination", toKey: "semi_final", label: "Elimination → Semi-Final" },
    { fromKey: "semi_final", toKey: "grand_final", label: "Semi-Final → Grand Final" },
  ];

  return (
    <>
      <p className="mb-3 text-sm"><Link href="/admin/competitions/events" className="font-medium text-evergreen-700 underline-offset-2 hover:underline">← Competition Events</Link></p>
      <PageTitle
        eyebrow="Live Competitions · Multi-Phase Event Workspace"
        title={ev.name}
        subtitle={`${(ev.organizations as { name?: string } | null)?.name ?? ""}${(ev.academic_years as { name?: string } | null)?.name ? ` · ${(ev.academic_years as { name?: string }).name}` : ""} · Event status: ${ev.status}. Rankings and qualification are always computed inside each class.`}
        action={
          <form action={setEventPhaseStatus} className="flex items-end gap-2">
            <input type="hidden" name="event_id" value={ev.id} />
            <Select name="status" defaultValue={ev.status} aria-label="Event status">
              {["draft", "scheduled", "open", "completed", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Button type="submit" variant="outline">Set event status</Button>
          </form>
        }
      />
      <Notice ok={sp.ok} e={sp.e} messages={{
        created: "Event created with its three phases.", exists: "This event already existed — opened it instead of duplicating.",
        status: "Status updated.", rule: "Qualification rule updated.", decision: "Qualification decision recorded in the audit log.",
        eligibility: `Eligibility computed class by class: ${sp.n ?? 0} new qualification record(s) awaiting approval.`,
        previous: "Complete the preceding phase before computing eligibility or opening this phase.", qualification_gate: "Each class needs an approved qualifier and all eligible decisions resolved before opening.", status_failed: "Status could not be updated.", status_partial: "Phase status changed but class statuses could not be updated; check the event before proceeding.",
        phase: "Phase not found.", phases_partial: "The event was created, but its phases could not be created. Contact an administrator before using it.", rule_failed: "The qualification rule could not be saved.", notes: "Manual decisions require an explanatory note (audit requirement).", decision_e: "Decision failed.",
      }} />

      <div className="grid gap-5">
        {phases.map((phase) => {
          const pcs = ((phase.competition_phase_classes as Record<string, unknown>[]) ?? []);
          const rule = (phase.qualification_rule as { top_n?: number; min_percent?: number }) ?? {};
          return (
            <Card key={String(phase.id)} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold text-evergreen-950">{PHASE_LABEL[String(phase.phase_key)] ?? String(phase.title)}</h2>
                  <p className="mt-1 text-sm text-ink-soft">{String(phase.title)} · max {String(phase.max_questions)} questions/class · <Badge tone={tone(String(phase.status))}>{String(phase.status)}</Badge></p>
                </div>
                <form action={setEventPhaseStatus} className="flex items-end gap-2">
                  <input type="hidden" name="event_id" value={ev.id} />
                  <input type="hidden" name="phase_id" value={String(phase.id)} />
                  <Select name="status" defaultValue={String(phase.status)} aria-label="Phase status">
                    {["draft", "scheduled", "open", "completed", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <Button type="submit" variant="outline">Set phase status</Button>
                </form>
              </div>

              {phase.phase_key !== "elimination" && (
                <form action={updateQualificationRule} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-cream p-4">
                  <input type="hidden" name="event_id" value={ev.id} />
                  <input type="hidden" name="phase_id" value={String(phase.id)} />
                  <Field label="Qualifiers per class (top N)"><Input type="number" name="top_n" min={1} max={500} defaultValue={rule.top_n ?? 10} className="w-28" /></Field>
                  <Field label="Minimum score %"><Input type="number" name="min_percent" min={0} max={100} defaultValue={rule.min_percent ?? 50} className="w-28" /></Field>
                  <Button type="submit" variant="outline">Save qualification rule</Button>
                </form>
              )}

              <div className="mt-4">
                <Table head={["Class", "Questions", "Access", "Run / Monitor"]}>
                  {pcs.map((pc) => {
                    const exam = pc.exam_id ? examById.get(String(pc.exam_id)) : null;
                    const session = pc.session_id ? sessionById.get(String(pc.session_id)) : null;
                    return (
                      <tr key={String(pc.id)}>
                        <td className="font-medium">{(pc.classes as { name?: string } | null)?.name ?? "—"}</td>
                        <td>{String(pc.question_count)}</td>
                        <td>
                          {exam ? <>Exam code <strong>{exam.access_code}</strong> · {exam.duration_minutes} min · {exam.status}</> : session ? <>Join code <strong>{session.join_code}</strong> · {session.status}/{session.phase ?? "waiting"}</> : "—"}
                        </td>
                        <td>
                          {exam && <Link className="text-evergreen-800 underline" href="/admin/examinations/monitoring">Monitor examinations</Link>}
                          {session && (<span className="flex flex-wrap gap-x-3">
                            <Link className="text-evergreen-800 underline" href={`/dashboard/sessions/${session.id}/host`}>Host Control</Link>
                            <Link className="text-evergreen-800 underline" href={`/play/${session.join_code}`}>Participant screen</Link>
                          </span>)}
                        </td>
                      </tr>
                    );
                  })}
                  {pcs.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-ink-soft">No class pools attached yet.</td></tr>}
                </Table>
              </div>
            </Card>
          );
        })}

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Qualification &amp; progression</h2>
          <p className="mt-1 text-sm text-ink-soft">Compute eligibility from a completed phase (ranked inside each class), then approve or reject candidates. Rejecting or overriding a decision requires a reason and is audit-logged. Qualification review uses the canonical admission-token workflow; organizers must verify identities and test admission before the event.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {transitions.map((t) => {
              const from = phases.find((p) => p.phase_key === t.fromKey);
              const to = phases.find((p) => p.phase_key === t.toKey);
              if (!from || !to) return null;
              return (
                <form key={t.label} action={computeEligibility} className="flex items-center gap-2 rounded-xl border border-evergreen-900/15 bg-cream px-4 py-3">
                  <input type="hidden" name="event_id" value={ev.id} />
                  <input type="hidden" name="from_phase_id" value={String(from.id)} />
                  <input type="hidden" name="to_phase_id" value={String(to.id)} />
                  <span className="text-sm font-medium">{t.label}</span>
                  <Button type="submit" variant="gold">Compute eligibility</Button>
                </form>
              );
            })}
          </div>

          <div className="mt-5">
            <Table head={["Candidate", "Class", "Into", "Score", "Rank", "Status", "Decision"]}>
              {(quals ?? []).map((q) => (
                <tr key={q.id}>
                  <td className="font-medium">{q.display_name}</td>
                  <td>{(q.classes as { name?: string } | null)?.name ?? "—"}</td>
                  <td>{phaseName.get(q.to_phase_id) ?? "—"}</td>
                  <td>{q.source_score ?? "—"}{q.source_max_score ? ` / ${q.source_max_score}` : ""}</td>
                  <td>{q.source_rank ?? "—"}</td>
                  <td><Badge tone={tone(q.status)}>{q.status}</Badge></td>
                  <td>
                    <form action={decideQualification} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="event_id" value={ev.id} />
                      <input type="hidden" name="id" value={q.id} />
                      <Select name="decision" defaultValue="approved" aria-label="Decision">
                        <option value="approved">Approve</option>
                        <option value="rejected">Reject</option>
                        <option value="manual_approved">Manual approve</option>
                        <option value="manual_rejected">Manual reject</option>
                      </Select>
                      <Input name="notes" placeholder="Reason (required unless approving)" className="w-44" />
                      <Button type="submit" variant="outline">Record</Button>
                    </form>
                  </td>
                </tr>
              ))}
              {(quals ?? []).length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-ink-soft">No qualification records yet — complete a phase, then compute eligibility.</td></tr>}
            </Table>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href="/admin/competitions/results" variant="outline">Rankings &amp; Results</ButtonLink>
            <ButtonLink href="/admin/examinations/results" variant="outline">Examination Results</ButtonLink>
          </div>
        </Card>
      </div>
    </>
  );
}
