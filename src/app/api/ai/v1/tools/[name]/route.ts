import { NextResponse } from "next/server";
import { authenticateAgent, permissionResolver, requiredPermission, toolErrorResponse, unknownTool } from "@/lib/ai/authz";
import { executeTool } from "@/lib/ai/engine";
import { ToolError } from "@/lib/ai/types";

/**
 * `POST /api/ai/v1/tools/<tool_name>` — run one tool as an external agent.
 *
 * This is the same executor the native assistant uses. The only differences are
 * the surface label in the journal and the fact that the actor is an agent whose
 * identity came from a bearer token instead of a cookie.
 *
 * A sensitive tool returns 202 with `approval_required` and an approval id when
 * the organization's policy asks for a human decision. Nothing is changed.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  const toolName = decodeURIComponent(name ?? "");

  const auth = await authenticateAgent(request, "api");
  if (!auth.ok) return NextResponse.json({ error: { code: auth.code, message: auth.message } }, { status: auth.status, headers: auth.headers });
  if (!requiredPermission(toolName)) return unknownTool(toolName);

  let body: unknown = null;
  try {
    const text = await request.text();
    body = text.trim() ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_arguments", message: "The request body must be a JSON object." } },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: { code: "invalid_arguments", message: "The request body must be a JSON object." } },
      { status: 400, headers: NO_STORE },
    );
  }
  const args = body as Record<string, unknown>;
  const approvalId = typeof args.__approval_id === "string" ? args.__approval_id : undefined;
  const execute = args.__execute !== false;
  delete args.__approval_id;
  delete args.__execute;

  try {
    const result = await executeTool(
      {
        tool: toolName,
        args,
        actor: auth.actor,
        scope: auth.scope,
        approvalId,
        execute,
      },
      {
        hasPermission: permissionResolver(auth),
        admin: auth.admin,
        supabase: auth.supabase,
      },
    );
    const status = result.ok ? 200 : result.code === "approval_required" ? 202 : 400;
    return NextResponse.json(
      {
        ok: result.ok,
        tool: result.tool,
        risk: result.risk,
        execution_id: result.executionId,
        approval_id: result.approvalId ?? null,
        summary: result.summary ?? null,
        data: result.data ?? null,
        preview: result.preview ?? null,
        links: result.links ?? null,
        warnings: result.warnings ?? [],
        error: result.ok ? null : { code: result.code, message: result.detail },
      },
      { status, headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof ToolError) return toolErrorResponse(error);
    return toolErrorResponse(error);
  }
}
