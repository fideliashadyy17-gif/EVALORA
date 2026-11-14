import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { approveQualification, computeQualifications, overrideQualification } from "../../actions/event-operations";
import { Flash, Notice, Section, StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Qualification review" };
export const dynamic = "force-dynamic";

interface Phase { id: string; event_id: string; title: string; phase_key: string; sort: number }
interface Qual {
  id: string; event_id: string; to_phase_id: string; class_id: string | null;
  display_name: string | null; source_score: number | null; source_max_score: number | null;
  source_rank: number | null; status: string; approval_status: string; notes: string | null;
  manual_override: boolean; approved_at: string | null;
}
interface Override {
  id: string; display_name: string | null; original_status: string; new_status: string;
  reason: string; created_at: string; administrator_id: string | null;
  event_id: string; to_phase_id: string | null; class_id: string | null;
}

export default async function QualificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; event?: string; to?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();
  const { data: eventRows } = await admin.from("competition_events").select("id,name,organization_id").order("name").limit(100);
  const events = (eventRows ?? []) as { id: string; name: string; organization_id: string }[];
  const eventId = sp.event || events[0]?.id || "";
  const { data: phaseRows } = eventId
    ? await admin.from("competition_event_phases").select("id,event_id,title,phase_key,sort").eq("event_id", eventId).order("sort")
    : { data: [] };
  const phases = (phaseRows ?? []) as Phase[];
  const toPhaseId = sp.to || phases.find((p) => p.phase_key === "semi_final")?.id || phases[0]?.id || "";
  const { data: qualRows } = eventId
    ? await admin.from("qualification_records").select("id,event_id,to_phase_id,class_id,display_name,source_score,source_max_score,source_rank,status,approval_status,notes,manual_override,approved_at").eq("event_id", eventId).order("source_rank").limit(1000)
    : { data: [] };
  const quals = ((qualRows ?? []) as unknown as Qual[]).filter((q) => !toPhaseId || q.to_phase_id === toPhaseId);
  const classIds = [...new Set(quals.map((q) => q.class_id).filter(Boolean))] as string[];
  const { data: classRows } = classIds.length ? await admin.from("classes").select("id,name").in("id", classIds) : { data: [] };
  const classNames = new Map(((classRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const { data: overrideRows } = eventId
    ? await admin.from("qualification_overrides").select("id,display_name,original_status,new_status,reason,created_at,administrator_id,event_id,to_phase_id,class_id").eq("event_id", eventId).order("created_at", { ascending: false }).limit(100)
    : { data: [] };
  const overrides = (overrideRows ?? []) as unknown as Override[];
  const phaseNames = new Map(phases.map((p) => [p.id, p.title]));

  return (
    <>
      <Flash />
      <PageTitle
        eyebrow="Live Competitions · Phase Progression & Admission"
        title="Qualification & admission review"
        subtitle="Compute per-class ranks from existing examination / Live Competition results, approve qualified candidates, and record authorized manual overrides. Admission is re-verified server-side on every join, state and answer request."
      />
      <Notice ok={sp.ok} e={sp.e} messages={{
        computed: "Qualification calculation completed; existing results were not modified.",
        approved: "Qualification approved. The one-time admission token is shown above.",
        overridden: "Manual override and audit record saved.",
        compute_failed: "Could not compute qualifications.", approve_failed: "Only a qualified record can be approved.",
        override_failed: "A valid status and documented reason are required.", scope: "Select a valid parent event and target phase.",
      }} />

      <Card className="p-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Parent event" className="min-w-[280px] flex-1"><Select name="event" defaultValue={eventId}>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
          <Field label="Target phase" className="min-w-[280px] flex-1"><Select name="to" defaultValue={toPhaseId}>{phases.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>
          <Button type="submit" variant="outline">View records</Button>
        </form>
      </Card>

      <Section title="Calculate from source results" hint="Elimination → Semi-Final or Semi-Final → Grand Final. Uses the phase's configured top_n / minimum percentage rule.">
        <Card className="p-5">
          <form action={computeQualifications} className="flex flex-wrap items-end gap-3">
            <Field label="From phase" className="min-w-[240px] flex-1"><Select name="from_phase_id">{phases.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>
            <Field label="To phase" className="min-w-[240px] flex-1"><Select name="to_phase_id" defaultValue={toPhaseId}>{phases.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>
            <Button type="submit" variant="gold">Calculate & create records</Button>
          </form>
        </Card>
      </Section>

      <Section title={`Qualification records (${quals.length})`} hint="Private organizer-only list. Scores and ranks are read from source results; overrides never edit answers or scores.">
        <Table head={["Class", "Candidate", "Source score", "Rank", "Status", "Approval", "Review / action"]}>
          {quals.length === 0 ? (
            <tr><td colSpan={7} className="py-8 text-center text-ink-soft">No qualification records yet for this target phase.</td></tr>
          ) : quals.slice((page - 1) * pageSize, page * pageSize).map((q) => (
            <tr key={q.id}>
              <td>{q.class_id ? classNames.get(q.class_id) ?? q.class_id.slice(0, 8) : "—"}</td>
              <td className="font-medium">{q.display_name ?? "Unnamed candidate"}{q.manual_override && <Badge tone="amber" className="ml-2">override</Badge>}</td>
              <td>{q.source_score ?? 0} / {q.source_max_score ?? 0}</td>
              <td>{q.source_rank ?? "—"}</td>
              <td><StatusBadge status={q.status} /></td>
              <td><StatusBadge status={q.approval_status} /></td>
              <td>
                <div className="flex flex-col gap-2">
                  <form action={approveQualification} className="flex gap-2">
                    <input type="hidden" name="record_id" value={q.id} />
                    <Input name="note" placeholder="Approval note" className="min-w-[140px] py-1.5 text-xs" />
                    <Button type="submit" variant="outline" disabled={!["eligible", "approved", "manual_approved"].includes(q.status)}>Approve</Button>
                  </form>
                  <form action={overrideQualification} className="flex flex-wrap gap-2">
                    <input type="hidden" name="record_id" value={q.id} />
                    <Select name="new_status" className="w-36 py-1.5 text-xs">
                      <option value="manual_approved">Manual approve</option>
                      <option value="manual_rejected">Manual reject</option>
                      <option value="approved">Approve</option>
                      <option value="rejected">Reject</option>
                    </Select>
                    <Input name="reason" placeholder="Documented reason (required)" className="min-w-[180px] flex-1 py-1.5 text-xs" required />
                    <Button type="submit" variant="danger">Override</Button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </Table>
        <PageNavigation
          page={page}
          pageSize={pageSize}
          total={quals.length}
          pathname="/admin/competitions/qualifications"
          query={{ event: sp.event, to: sp.to }}
          label="qualification records"
        />
      </Section>

      <Section title="Manual override audit" hint="Administrator, candidate, original/new status, reason, timestamp, event and phase.">
        <Table head={["When", "Candidate", "Phase", "Change", "Reason", "Administrator"]}>
          {overrides.length === 0 ? (
            <tr><td colSpan={6} className="py-8 text-center text-ink-soft">No manual overrides recorded.</td></tr>
          ) : overrides.map((o) => (
            <tr key={o.id}>
              <td>{new Date(o.created_at).toLocaleString()}</td>
              <td>{o.display_name ?? "—"}</td>
              <td>{o.to_phase_id ? phaseNames.get(o.to_phase_id) ?? "—" : "—"}</td>
              <td>{o.original_status} → {o.new_status}</td>
              <td>{o.reason}</td>
              <td className="font-mono text-xs">{o.administrator_id ?? "—"}</td>
            </tr>
          ))}
        </Table>
        <Card className="mt-3 p-4 text-xs text-ink-soft">
          A one-time admission token is displayed only in the secure flash message after approval; the database stores only its SHA-256 hash.
          Guest join, participant state and answer APIs re-check the approved qualification record. Hidden buttons, local storage or Realtime channel names cannot bypass this.
        </Card>
      </Section>
    </>
  );
}
