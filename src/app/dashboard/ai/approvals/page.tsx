import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { requestFormatter } from "@/lib/formattingRequest";
import { decideApprovalAction } from "../agents/actions";

export const metadata: Metadata = { title: "AI approvals" };
export const dynamic = "force-dynamic";

interface ApprovalRow {
  id: string;
  tool_name: string;
  target_kind: string | null;
  target_id: string | null;
  requested_by_label: string | null;
  surface: string;
  payload_summary: string;
  status: string;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  decision_note: string | null;
  agent_id: string | null;
}

/**
 * The human approval queue.
 *
 * An approval authorises exactly ONE execution. The page says so, because an
 * approver who thinks they are granting a standing permission would be surprised
 * when the next call asks again — and a core that remembered standing consent for
 * publishing results would be a worse system than one that asks.
 */
export default async function ApprovalsPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  // Server-side module gate: the sidebar hides the entry, this refuses the URL.
  const { entitlement } = await getCapabilities(await createClient(), ctx, org.id);
  requireModule(entitlement, "ai_assistant", "/dashboard?e=module");
  const { dateTime: fmtDateTime } = await requestFormatter(org.id);
  const canManage = await canOperate(ctx, org.id, "ai.manage_agents");
  if (!canManage) {
    return (
      <div className="space-y-4">
        <PageTitle title="AI approvals" subtitle="Sensitive operations waiting for a human decision." />
        <Card className="p-6">
          <p className="text-sm text-ink-soft">
            Reviewing approvals requires the <code className="font-mono text-xs">ai.manage_agents</code> permission.
          </p>
        </Card>
      </div>
    );
  }

  const admin = createAdminClient();
  const [{ data: pending }, { data: decided }] = await Promise.all([
    admin
      .from("ai_approvals")
      .select("id, tool_name, target_kind, target_id, requested_by_label, surface, payload_summary, status, created_at, expires_at, decided_at, decision_note, agent_id")
      .eq("organization_id", org.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    admin
      .from("ai_approvals")
      .select("id, tool_name, target_kind, target_id, requested_by_label, surface, payload_summary, status, created_at, expires_at, decided_at, decision_note, agent_id")
      .eq("organization_id", org.id)
      .neq("status", "pending")
      .order("decided_at", { ascending: false })
      .limit(25),
  ]);

  const rows = (pending ?? []) as unknown as ApprovalRow[];
  const history = (decided ?? []) as unknown as ApprovalRow[];

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow={<Badge tone={rows.length ? "amber" : "gray"}>{rows.length} waiting</Badge>}
        title="AI approvals"
        subtitle="Publishing examinations or results, applying score adjustments, proposing marks and revoking agents wait here until a person decides. Approving runs the operation once; it does not grant standing permission."
        action={
          <Link href="/dashboard/ai/agents" className="rounded-xl border border-evergreen-900/25 px-3 py-2 text-sm font-medium text-evergreen-900 hover:bg-evergreen-50">
            Agents
          </Link>
        }
      />

      <Card className="p-4">
        <h2 className="font-display text-base font-semibold text-evergreen-900">Waiting for a decision</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Nothing is waiting. Sensitive AI operations will appear here.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-amber-300 bg-amber-50/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm text-evergreen-900">{row.tool_name}</p>
                  <Badge tone="amber">{row.surface}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  Requested by {row.requested_by_label ?? "an unknown caller"} · expires{" "}
                  {fmtDateTime(row.expires_at)}
                </p>
                <p className="mt-2 text-sm text-ink">{row.payload_summary}</p>
                {row.target_id && (
                  <p className="mt-1 truncate font-mono text-[11px] text-ink-soft">target {row.target_id}</p>
                )}
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <form action={decideApprovalAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="approval_id" value={row.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <input
                      name="note"
                      placeholder="Decision note (optional)"
                      className="rounded-lg border border-evergreen-900/25 bg-paper px-2 py-1.5 text-xs"
                    />
                    <button type="submit" className="rounded-lg bg-evergreen-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-evergreen-700">
                      Approve once
                    </button>
                  </form>
                  <form action={decideApprovalAction}>
                    <input type="hidden" name="approval_id" value={row.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <button type="submit" className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                      Reject
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-display text-base font-semibold text-evergreen-900">Recent decisions</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No decision has been recorded yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-evergreen-900/10 text-sm">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono text-xs text-evergreen-800">{row.tool_name}</span>
                <span className="text-xs text-ink-soft">
                  {row.decision_note ? `${row.decision_note} · ` : ""}
                  {row.decided_at ? fmtDateTime(row.decided_at) : ""}
                </span>
                <Badge tone={row.status === "approved" ? "green" : row.status === "rejected" ? "red" : "gray"}>{row.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
