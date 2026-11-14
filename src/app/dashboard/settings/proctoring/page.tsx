import { Badge, Button, ButtonLink, Card, DataTable, Field, Input, PageTitle, Textarea } from "@/components/ui";
import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { describeRetention, getRetentionPolicy, loadRetentionRuns } from "@/lib/proctoring";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { applyProctoringRetention, saveProctoringRetention } from "./actions";

export const metadata: Metadata = { title: "Proctoring retention" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  saved: "Retention policy saved and audit-logged.",
  days: "Retention periods must be whole days between 1 and 3650, or left empty to retain indefinitely.",
  save: "The retention policy could not be saved. Check your permission and retry.",
  run: "The retention routine could not run. No evidence was changed.",
  nopolicy: "Configure and save a retention policy before applying it.",
  held: "Legal hold is active — no evidence was changed.",
};

export default async function ProctoringRetentionPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; dry?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/proctoring");

  const sp = await searchParams;
  const supabase = await createClient();
  const [policy, runs] = await Promise.all([
    getRetentionPolicy(supabase, org.id),
    loadRetentionRuns(supabase, org.id, 10),
  ]);

  const message = (sp.ok && MESSAGES[sp.ok]) || (sp.e && MESSAGES[sp.e]) || null;
  const dryCounts = sp.dry ? sp.dry.split("-").map(Number) : null;
  const appliedCounts = sp.ok && MESSAGES[sp.ok] === undefined ? sp.ok.split("-").map(Number) : null;

  return (
    <>
      <PageTitle
        eyebrow="Workspace Administration · Evidence Governance"
        title="Proctoring data retention"
        subtitle={`Configure how long ${org.name} keeps proctoring evidence. EVALORA does not impose a legal retention period — your institution decides, and nothing is removed until a period is set.`}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/dashboard/settings" variant="outline">Settings</ButtonLink>
            <ButtonLink href="/dashboard/proctoring" variant="outline">Proctoring console</ButtonLink>
          </div>
        }
      />

      {message && (
        <p className={`mb-4 rounded-lg px-4 py-3 text-sm ${sp.e ? "bg-red-50 text-red-800" : "bg-evergreen-50 text-evergreen-900"}`}>
          {message}
        </p>
      )}
      {(dryCounts || appliedCounts) && (
        <div className="mb-4 rounded-lg bg-cream px-4 py-3 text-sm text-ink">
          <p className="font-medium">
            {dryCounts ? "Dry run (nothing was changed)" : "Policy applied and audit-logged"}
          </p>
          <p className="mt-1">
            Observation notes redacted: {(dryCounts ?? appliedCounts)![0]} · reviewer notes redacted:{" "}
            {(dryCounts ?? appliedCounts)![1]} · room events removed: {(dryCounts ?? appliedCounts)![2]} · recordings
            expired: {(dryCounts ?? appliedCounts)![3]}
          </p>
        </div>
      )}

      <Card className="mb-6 p-5">
        <h2 className="mb-1 font-display text-lg font-semibold text-evergreen-950">Configured policy</h2>
        <p className="mb-3 text-sm text-ink">{describeRetention(policy)}</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone={policy ? "green" : "gray"}>{policy ? "Policy configured" : "No policy — retain indefinitely"}</Badge>
          {policy?.legal_hold && <Badge tone="amber">Legal hold active</Badge>}
          {policy?.allow_evidence_export && <Badge tone="green">Evidence export allowed</Badge>}
          {policy?.updated_at && <Badge tone="gray">Updated {fmtDateTime(policy.updated_at)}</Badge>}
        </div>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-display text-lg font-semibold text-evergreen-950">Set retention periods</h2>
        <form action={saveProctoringRetention} className="grid gap-4 sm:grid-cols-3">
          <Field label="Observation notes (days)">
            <Input
              name="observation_retention_days"
              type="number"
              min={1}
              max={3650}
              defaultValue={policy?.observation_retention_days ?? ""}
              placeholder="Leave empty to retain"
            />
          </Field>
          <Field label="Reviewer notes (days)">
            <Input
              name="review_note_retention_days"
              type="number"
              min={1}
              max={3650}
              defaultValue={policy?.review_note_retention_days ?? ""}
              placeholder="Leave empty to retain"
            />
          </Field>
          <Field label="Room telemetry & recordings (days)">
            <Input
              name="evidence_retention_days"
              type="number"
              min={1}
              max={3650}
              defaultValue={policy?.evidence_retention_days ?? ""}
              placeholder="Leave empty to retain"
            />
          </Field>
          <div className="sm:col-span-3">
            <Field label="Policy note (visible to reviewers)">
              <Textarea name="note" rows={2} defaultValue={policy?.note ?? ""} maxLength={1000} />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="legal_hold" defaultChecked={policy?.legal_hold ?? false} className="mt-1" />
            <span>
              <span className="font-medium">Legal hold</span>
              <span className="block text-xs text-ink-soft">Suspend every automatic retention action.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="allow_evidence_export"
              defaultChecked={policy?.allow_evidence_export ?? false}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Allow evidence export</span>
              <span className="block text-xs text-ink-soft">Permit reviewers to export the filtered audit history.</span>
            </span>
          </label>
          <div className="flex items-end justify-end">
            <Button type="submit">Save policy</Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-ink-soft">
          Applying a policy never deletes a decision, a reviewer identity or a timestamp. It redacts free-text narrative and
          removes media telemetry older than the configured period, and every run — including dry runs — is recorded below.
        </p>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-display text-lg font-semibold text-evergreen-950">Run the policy</h2>
        <p className="mb-3 text-sm text-ink-soft">
          A dry run reports exactly what would change without touching any record. Apply is irreversible for the records it
          affects, so review the dry run first.
        </p>
        <div className="flex flex-wrap gap-2">
          <form action={applyProctoringRetention}>
            <input type="hidden" name="mode" value="dry_run" />
            <Button type="submit" variant="outline">Dry run</Button>
          </form>
          <form action={applyProctoringRetention}>
            <input type="hidden" name="mode" value="apply" />
            <Button type="submit">Apply retention now</Button>
          </form>
        </div>
      </Card>

      <DataTable head={["Run", "Mode", "Notes redacted", "Reviews redacted", "Events removed", "Recordings expired"]} label="Proctoring retention run history">
        {runs.length === 0 && (
          <tr>
            <td colSpan={6} className="px-4 py-6 text-center text-ink-soft">
              No retention run has been executed for this organization.
            </td>
          </tr>
        )}
        {runs.map((r) => (
          <tr key={r.id}>
            <td className="text-ink-soft">{fmtDateTime(r.created_at)}</td>
            <td>
              <Badge tone={r.mode === "apply" ? "red" : r.mode === "held" ? "amber" : "gray"}>{r.mode}</Badge>
            </td>
            <td className="tabular-nums">{r.observations_anonymized}</td>
            <td className="tabular-nums">{r.review_notes_redacted}</td>
            <td className="tabular-nums">{r.room_events_purged}</td>
            <td className="tabular-nums">{r.recordings_expired}</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
