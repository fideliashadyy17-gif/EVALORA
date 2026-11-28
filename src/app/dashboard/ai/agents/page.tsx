import type { Metadata } from "next";
import { Badge, Card, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { requestFormatter } from "@/lib/formattingRequest";
import { describeCoreProvider } from "@/lib/ai/provider";
import { knownPermissions, listAgents } from "@/lib/ai/agents";
import { CreateAgentForm } from "./AgentForms";
import { RevokeAgentForm, RotateTokenForm } from "./RevokeAgentForm";
import Link from "next/link";

export const metadata: Metadata = { title: "AI agents" };
export const dynamic = "force-dynamic";

/**
 * Agent management.
 *
 * Every credential shown here belongs to ONE member of this organization and can
 * never exceed that person's own rights. The page states that plainly, because an
 * administrator who believes they are creating a "system" account would be
 * granting far more than they intend.
 */
export default async function AgentsPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  // Direct URL access is blocked server-side when the module is off — a hidden
  // sidebar entry is not an access control.
  const { entitlement } = await getCapabilities(await createClient(), ctx, org.id);
  requireModule(entitlement, "ai_assistant", "/dashboard?e=module");
  const { date: fmtDate, dateTime: fmtDateTime } = await requestFormatter(org.id);
  const canManage = await canOperate(ctx, org.id, "ai.manage_agents");
  if (!canManage) {
    return (
      <div className="space-y-4">
        <PageTitle title="AI agents" subtitle="External AI connectivity for this workspace." />
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-900">Managers only</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Registering and revoking agent credentials requires the{" "}
            <code className="font-mono text-xs">ai.manage_agents</code> permission.
          </p>
        </Card>
      </div>
    );
  }

  const admin = createAdminClient();
  const agents = await listAgents(admin, org.id);
  const provider = describeCoreProvider();

  const { data: recent } = await admin
    .from("ai_executions")
    .select("id, tool_name, status, surface, actor_kind, agent_name, created_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow={<Badge tone={provider.configured ? "gold" : "gray"}>{provider.configured ? `Model: ${provider.provider}` : "No model credential"}</Badge>}
        title="AI agents"
        subtitle="Let an external assistant (ChatGPT, Claude, Gemini or any MCP client) work inside this workspace — as a named person, with that person's permissions, and with a complete audit trail."
        action={
          <Link href="/dashboard/ai" className="rounded-xl border border-evergreen-900/25 px-3 py-2 text-sm font-medium text-evergreen-900 hover:bg-evergreen-50">
            Open the assistant
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="font-display text-base font-semibold text-evergreen-900">Registered credentials</h2>
            {agents.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">
                No agent has been registered. Until one exists, nothing outside EVALORA can call the AI API or the MCP server.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-evergreen-900/10">
                {agents.map((agent) => (
                  <li key={agent.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-evergreen-950">
                          {agent.name}{" "}
                          <span className="text-xs font-normal text-ink-soft">({agent.client})</span>
                        </p>
                        <p className="text-xs text-ink-soft">
                          Created {fmtDate(agent.createdAt)} · prefix{" "}
                          <span className="font-mono">{agent.tokenPrefix ?? "—"}</span>
                          {agent.tokenLastRotatedAt && ` · rotated ${fmtDate(agent.tokenLastRotatedAt)}`}
                        </p>
                      </div>
                      <Badge tone={agent.status === "approved" ? "green" : agent.status === "revoked" ? "red" : agent.status === "rejected" ? "gray" : "amber"}>
                        {agent.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      Allowed:{" "}
                      {agent.allowedPermissions.length ? (
                        <span className="font-mono">{agent.allowedPermissions.join(", ")}</span>
                      ) : (
                        "everything its owner may do"
                      )}
                      {agent.deniedPermissions.length > 0 && (
                        <>
                          {" "}· Denied: <span className="font-mono">{agent.deniedPermissions.join(", ")}</span>
                        </>
                      )}
                    </p>
                    {agent.status === "approved" && (
                      <RotateTokenForm agentId={agent.id} />
                    )}
                    {agent.status !== "revoked" && (
                      <RevokeAgentForm agentId={agent.id} agentName={agent.name} />
                    )}
                    {agent.revokeReason && <p className="mt-1 text-xs text-ink-soft">Revoked: {agent.revokeReason}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="font-display text-base font-semibold text-evergreen-900">Recent AI activity</h2>
            {!recent?.length ? (
              <p className="mt-2 text-sm text-ink-soft">No AI call has been made in this workspace yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs">
                {recent.map((row) => (
                  <li key={row.id as string} className="flex flex-wrap justify-between gap-2 border-b border-evergreen-900/10 py-1 last:border-0">
                    <span className="font-mono text-evergreen-800">{row.tool_name as string}</span>
                    <span className="text-ink-soft">
                      {row.actor_kind as string}
                      {row.agent_name ? ` · ${row.agent_name as string}` : ""} · {row.surface as string} · {row.status as string} ·{" "}
                      {fmtDateTime(row.created_at as string)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/dashboard/ai/activity" className="mt-2 inline-block text-xs font-medium text-evergreen-800 underline">
              Full operation log →
            </Link>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="font-display text-base font-semibold text-evergreen-900">Register an agent</h2>
            <p className="mt-1 text-xs text-ink-soft">
              A credential acts as one named member. Choose the least-privileged person whose work the agent does, then narrow
              it further if needed.
            </p>
            <CreateAgentForm permissions={knownPermissions()} />
          </Card>

          <Card className="p-4">
            <h2 className="font-display text-sm font-semibold text-evergreen-900">How to connect</h2>
            <p className="mt-1 text-xs text-ink-soft">REST:</p>
            <code className="mt-1 block break-all rounded bg-stone-100 px-2 py-1 font-mono text-[11px]">
              GET /api/ai/v1/tools · POST /api/ai/v1/tools/&lt;name&gt;
            </code>
            <p className="mt-2 text-xs text-ink-soft">MCP (streamable HTTP):</p>
            <code className="mt-1 block break-all rounded bg-stone-100 px-2 py-1 font-mono text-[11px]">POST /api/mcp</code>
            <p className="mt-2 text-xs text-ink-soft">
              Send <span className="font-mono">Authorization: Bearer &lt;token&gt;</span>. The MCP server exposes the same tools,
              with the same permissions.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="font-display text-sm font-semibold text-evergreen-900">Approval queue</h2>
            <p className="mt-1 text-xs text-ink-soft">
              Publishing, marking proposals and score changes wait here for a human decision.
            </p>
            <Link href="/dashboard/ai/approvals" className="mt-2 inline-block text-xs font-medium text-evergreen-800 underline">
              Open approvals →
            </Link>
          </Card>
        </aside>
      </div>

    </div>
  );
}
