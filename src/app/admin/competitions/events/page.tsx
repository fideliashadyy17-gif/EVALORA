import { Badge, Button, Card, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { setPhaseStatus } from "../../actions/event-operations";
import { Flash, Notice, Section, StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Oak event phases" };
export const dynamic = "force-dynamic";

interface Phase { id: string; event_id: string; title: string; phase_key: string; phase_type: string; status: string; max_questions: number; qualification_rule: unknown; sort: number }
interface LinkRow { id: string; phase_id: string; class_id: string; exam_id: string | null; competition_id: string | null; session_id: string | null; question_pool_id: string | null; question_count: number | null }
interface ClassRow { id: string; name: string }
interface PoolRow { id: string; phase_id: string | null; class_id: string; status: string }

export default async function EventPhasesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: eventRows } = await admin
    .from("competition_events")
    .select("id,organization_id,name,status,settings,organizations(name)")
    .order("created_at", { ascending: false })
    .limit(50);
  const events = (eventRows ?? []) as unknown as {
    id: string; organization_id: string; name: string; status: string; settings: Record<string, unknown>; organizations: { name?: string } | null;
  }[];
  const event = events[0] ?? null;
  const eventIds = events.map((e) => e.id);

  const { data: phaseRows } = eventIds.length
    ? await admin.from("competition_event_phases").select("*").in("event_id", eventIds).order("sort")
    : { data: [] };
  const phases = (phaseRows ?? []) as unknown as Phase[];
  const phaseIds = phases.map((p) => p.id);
  const { data: linkRows } = phaseIds.length
    ? await admin.from("competition_phase_classes").select("*").in("phase_id", phaseIds)
    : { data: [] };
  const links = (linkRows ?? []) as unknown as LinkRow[];
  const classIds = [...new Set(links.map((l) => l.class_id))];
  const { data: classRows } = classIds.length
    ? await admin.from("classes").select("id,name").in("id", classIds)
    : { data: [] };
  const classes = new Map(((classRows ?? []) as ClassRow[]).map((c) => [c.id, c.name]));
  const { data: poolRows } = event?.id
    ? await admin.from("question_pools").select("id,phase_id,class_id,status").eq("event_id", event.id)
    : { data: [] };
  const pools = (poolRows ?? []) as unknown as PoolRow[];
  const { data: qualRows } = event?.id
    ? await admin.from("qualification_records").select("id,to_phase_id,status,approval_status").eq("event_id", event.id)
    : { data: [] };
  const quals = (qualRows ?? []) as unknown as { to_phase_id: string; status: string; approval_status: string }[];
  const counts = { approved: 0, pending: 0, rejected: 0 };
  for (const q of quals) {
    if (q.status === "approved" || q.status === "manual_approved") counts.approved++;
    else if (q.status === "eligible" || q.status === "pending") counts.pending++;
    else counts.rejected++;
  }

  return (
    <>
      <Flash />
      <PageTitle
        title="Event phases & monitor"
        subtitle="One parent event, three linked phase records. Existing Examination and Live Competition modules remain the engines; pool, eligibility, access and audit state are shown together."
      />
      <Notice ok={sp.ok} e={sp.e} messages={{ phase_status: "Phase status updated.", scope: "The selected organization, parent event, phase or class relationship is invalid." }} />
      {!event ? (
        <Card className="p-8 text-center text-sm text-ink-soft">No parent competition event exists.</Card>
      ) : (
        <>
          <Card className="mb-6 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Official parent event</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-evergreen-950">{event.name}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {event.organizations?.name ?? "Organization"} · <StatusBadge status={event.status} /> · one exam phase and two live phases
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatCard label="Class / phase links" value={links.length} />
              <StatCard label="Published pools" value={pools.filter((p) => p.status === "published").length} hint={`${pools.length} total pools`} />
              <StatCard label="Approved qualifications" value={counts.approved} hint={`${counts.pending} pending · ${counts.rejected} not eligible`} />
            </div>
            <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Question-count decision pending: Elimination currently uses 20 questions; master guidance also mentions 25 and an earlier 5 per class.
              Semi-Final is limited to 25 and Grand Final to 30 per class. No new or published examination configuration was created.
            </p>
          </Card>

          {phases.filter((p) => p.event_id === event.id).map((phase) => {
            const phaseLinks = links.filter((l) => l.phase_id === phase.id);
            const phasePools = pools.filter((p) => p.phase_id === phase.id);
            const phaseQuals = quals.filter((q) => q.to_phase_id === phase.id);
            return (
              <Section key={phase.id} title={phase.title} hint={`${phase.phase_type} · ${phaseLinks.length} class link(s) · ${phaseQuals.length} qualification record(s)`}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={phase.status} />
                  <Badge tone="gray">Max {phase.max_questions} / class</Badge>
                  <Badge tone="gold">{phasePools.filter((p) => p.status === "published").length} published pool(s)</Badge>
                  <Badge tone="green">{phaseQuals.filter((q) => q.status === "approved" || q.status === "manual_approved").length} approved</Badge>
                  <form action={setPhaseStatus} className="ml-auto flex items-end gap-2">
                    <input type="hidden" name="phase_id" value={phase.id} />
                    <Select name="status" defaultValue={phase.status} className="w-40" aria-label={`Status for ${phase.title}`}>
                      {["draft", "scheduled", "open", "completed", "closed"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                    <Button type="submit" variant="outline">Save phase</Button>
                  </form>
                </div>
                <Table head={["Class", "Engine", "Configured questions", "Pool", "Admission", "Links"]}>
                  {phaseLinks.map((l) => {
                    const pool = phasePools.find((p) => p.class_id === l.class_id);
                    return (
                      <tr key={l.id}>
                        <td className="font-medium">{classes.get(l.class_id) ?? l.class_id.slice(0, 8)}</td>
                        <td>{l.exam_id ? "Examination" : l.session_id ? "Live Competition" : "Unassigned"}</td>
                        <td>{l.question_count ?? "—"}</td>
                        <td>{pool ? <StatusBadge status={pool.status} /> : <Badge tone="gray">not assembled</Badge>}</td>
                        <td>{phase.phase_key === "elimination" ? "Exam link + code" : "Approved qualification token"}</td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            {l.exam_id && <Link className="text-evergreen-700 underline" href={`/admin/examinations/${l.exam_id}`}>Exam</Link>}
                            {l.competition_id && <Link className="text-evergreen-700 underline" href={`/admin/competitions/${l.competition_id}`}>Live</Link>}
                            <Link className="text-evergreen-700 underline" href={`/admin/competitions/pools?phase=${phase.id}&class=${l.class_id}`}>Pools</Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              </Section>
            );
          })}
        </>
      )}
    </>
  );
}
