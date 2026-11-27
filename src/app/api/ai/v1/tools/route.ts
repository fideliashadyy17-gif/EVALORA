import { NextResponse } from "next/server";
import { authenticateAgent, permissionResolver, toolErrorResponse } from "@/lib/ai/authz";
import { TOOLS } from "@/lib/ai/tools";
import { ToolError } from "@/lib/ai/types";
import { loadAiSettings } from "@/lib/ai/engine";

/**
 * `GET /api/ai/v1/tools` — the tools THIS credential may actually call.
 *
 * The list is computed per request from the owner's live RBAC and the agent's
 * narrowing, so revoking a role or narrowing an agent changes the answer
 * immediately. Unpermitted tools are omitted rather than listed as forbidden.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const auth = await authenticateAgent(request, "api");
  if (!auth.ok) return NextResponse.json({ error: { code: auth.code, message: auth.message } }, { status: auth.status, headers: auth.headers });

  try {
    const settings = await loadAiSettings(auth.admin, auth.organizationId);
    if (!settings.enabled || !settings.externalAgentsEnabled) {
      throw new ToolError(
        "permission_denied",
        settings.enabled
          ? "External AI agents are disabled for this organization."
          : "The AI core is disabled for this organization.",
      );
    }
    const hasPermission = permissionResolver(auth);
    const allowed = [];
    for (const tool of TOOLS) {
      if ((auth.actor.deniedPermissions ?? []).includes(tool.risk.permission)) continue;
      const allow = auth.actor.allowedPermissions ?? [];
      if (allow.length && !allow.includes(tool.risk.permission)) continue;
      if (!(await hasPermission(tool.risk.permission))) continue;
      allowed.push({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        risk: tool.risk.risk,
        // Only boolean capability flags: the tenant is fixed by the credential,
        // so a caller never needs to know its id.
        writes: Boolean(tool.risk.writes),
        may_require_approval: Boolean(tool.risk.mayRequireApproval),
        input_schema: tool.input,
      });
    }
    return NextResponse.json(
      {
        organization: auth.organizationSlug,
        agent: { name: auth.actor.agentName },
        tools: allowed,
        count: allowed.length,
        note: "This list is computed from the owner's live permissions. A tool that is absent cannot be called.",
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return toolErrorResponse(error);
  }
}
