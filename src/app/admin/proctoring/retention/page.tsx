import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select, StatCard, Textarea } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { describeRetention, getRetentionPolicy, isUuid, loadRetentionRuns } from "@/lib/proctoring";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { Section, Table } from "../../ui";
import { adminRunRetention, adminSaveRetention } from "./actions";

export const metadata: Metadata = { title: "Proctoring retention" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  days: "Retention periods must be whole days between 1 and 3650, or left empty to retain indefinitely.",
  save: "The retention policy could not be saved.",
  run: "The retention routine could not run. No evidence was changed.",
  nopolicy: "Configure and save a policy before applying it.",
};

export default async function AdminRetentionPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; saved?: string; e?: string; dry?: string; applied?: string; held?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: orgs } = await admin.from("organizations").select("id, name, slug, status").order("name").limit(500);
  const orgId = sp.org && isUuid(sp.org) && (orgs ?? []).some((o) => o.id === sp.org) ? sp.org : "";
  const selected = (orgs ?? []).find((o) => o.id === orgId);

  const [{ data: policies }, policy, runs] = await Promise.all([
    admin.from("proctoring_retention_policies").select("organization_id, legal_hold, observation_retention_days, evidence_retention_days"),
    orgId ? getRetentionPolicy(admin, orgId) : Promise.resolve(null),
    orgId ? loadRetentionRuns(admin, orgId, 15) : Promise.resolve([]),
  ]);

  const policyByOrg = new Map((policies ?? []).map((p) => [p.organization_id, p]));
  const dryCounts = sp.dry ? sp.dry.split("-").map(Number) : null;
  const appliedCounts = sp.applied ? sp.applied.split("-").map(Number) : null;
  const message = (sp.e && MESSAGES[sp.e]) || null;

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Evidence Retention & Legal Hold"
        title="Proctoring retention policies"
        subtitle="How long each institution keeps proctoring evidence. EVALORA imposes no legal retention period: an organization retains everything until its administrators — or the platform owner — configure a period."
        action={<ButtonLink href="/admin/proctoring" variant="outline">Proctoring oversight</ButtonLink>}
      />

      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Policy saved and audit-logged.</p>}
      {sp.held && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">Legal hold is active — no evidence was changed.</p>}
      {message && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{message}</p>}
      {(dryCounts || appliedCounts) && (
        <div className="mb-4 rounded-lg bg-cream px-4 py-3 text-sm text-ink">
          <p className="font-medium">{dryCounts ? "Dry run (nothing changed)" : "Applied and audit-logged"}</p>
          <p className="mt-1">
            Observation notes redacted: {(dryCounts ?? appliedCounts)![0]} · reviewer notes redacted:{" "}
            {(dryCounts ?? appliedCounts)![1]} · room events removed: {(dryCounts ?? appliedCounts)![2]} · recordings
            expired: {(dryCounts ?? appliedCounts)![3]}
          </p>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Organizations" value={(orgs ?? []).length} />
        <StatCard label="Policies configured" value={(policies ?? []).length} hint="All others retain evidence indefinitely" />
        <StatCard label="On legal hold" value={(policies ?? []).filter((p) => p.legal_hold).length} />
      </div>

      <Card className="mb-6 p-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Organization">
            <Select name="org" defaultValue={orgId}>
              <option value="">Select an organization…</option>
              {(orgs ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {policyByOrg.get(o.id) ? " — policy set" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Open</Button>
        </form>
      </Card>

      {selected && (
        <>
          <Card className="mb-6 p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">{selected.name}</h2>
              <Badge tone={policy ? "green" : "gray"}>{policy ? "Policy configured" : "Retain indefinitely"}</Badge>
              {policy?.legal_hold && <Badge tone="amber">Legal hold</Badge>}
            </div>
            <p className="text-sm text-ink">{describeRetention(policy)}</p>
            <form action={adminSaveRetention} className="mt-4 grid gap-4 sm:grid-cols-3">
              <input type="hidden" name="organization_id" value={selected.id} />
              <Field label="Observation notes (days)">
                <Input name="observation_retention_days" type="number" min={1} max={3650} defaultValue={policy?.observation_retention_days ?? ""} placeholder="Retain indefinitely" />
              </Field>
              <Field label="Reviewer notes (days)">
                <Input name="review_note_retention_days" type="number" min={1} max={3650} defaultValue={policy?.review_note_retention_days ?? ""} placeholder="Retain indefinitely" />
              </Field>
              <Field label="Room telemetry & recordings (days)">
                <Input name="evidence_retention_days" type="number" min={1} max={3650} defaultValue={policy?.evidence_retention_days ?? ""} placeholder="Retain indefinitely" />
              </Field>
              <div className="sm:col-span-3">
                <Field label="Policy note">
                  <Textarea name="note" rows={2} defaultValue={policy?.note ?? ""} maxLength={1000} />
                </Field>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="legal_hold" defaultChecked={policy?.legal_hold ?? false} className="mt-1" />
                <span><span className="font-medium">Legal hold</span><span className="block text-xs text-ink-soft">Suspend all automatic retention actions.</span></span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="allow_evidence_export" defaultChecked={policy?.allow_evidence_export ?? false} className="mt-1" />
                <span><span className="font-medium">Allow evidence export</span><span className="block text-xs text-ink-soft">Permit reviewers to export audit history.</span></span>
              </label>
              <div className="flex items-end justify-end">
                <Button type="submit">Save policy</Button>
              </div>
            </form>
          </Card>

          <Card className="mb-6 p-5">
            <h2 className="mb-2 font-display text-lg font-semibold text-evergreen-950">Run retention</h2>
            <p className="mb-3 text-sm text-ink-soft">
              Applying retention redacts free-text notes and removes media telemetry older than the configured period. Decisions,
              reviewers and timestamps are always preserved. Review a dry run before applying.
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={adminRunRetention}>
                <input type="hidden" name="organization_id" value={selected.id} />
                <input type="hidden" name="mode" value="dry_run" />
                <Button type="submit" variant="outline">Dry run</Button>
              </form>
              <form action={adminRunRetention}>
                <input type="hidden" name="organization_id" value={selected.id} />
                <input type="hidden" name="mode" value="apply" />
                <Button type="submit">Apply retention</Button>
              </form>
            </div>
          </Card>

          <Section title="Retention execution log">
            <Table head={["Run", "Mode", "Notes redacted", "Reviews redacted", "Events removed", "Recordings expired"]}>
              {runs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-soft">No retention run has been executed for this organization.</td></tr>
              )}
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="text-ink-soft">{fmtDateTime(r.created_at)}</td>
                  <td><Badge tone={r.mode === "apply" ? "red" : r.mode === "held" ? "amber" : "gray"}>{r.mode}</Badge></td>
                  <td className="tabular-nums">{r.observations_anonymized}</td>
                  <td className="tabular-nums">{r.review_notes_redacted}</td>
                  <td className="tabular-nums">{r.room_events_purged}</td>
                  <td className="tabular-nums">{r.recordings_expired}</td>
                </tr>
              ))}
            </Table>
          </Section>
        </>
      )}
    </>
  );
}
