import { NextResponse } from "next/server";
import { authenticateAgent, permissionResolver } from "@/lib/ai/authz";
import { executeTool } from "@/lib/ai/engine";
import { TOOLS } from "@/lib/ai/tools";
import { ToolError } from "@/lib/ai/types";
import { McpToolError } from "@/lib/ai/mcp";
import { SERVER_NAME, SERVER_VERSION, SUPPORTED_PROTOCOL, handleRpc } from "@/lib/ai/mcp";

/**
 * `POST /api/mcp` — Model Context Protocol server (streamable HTTP, JSON-RPC 2.0).
 *
 * The MCP surface exposes the SAME registry and the SAME executor as the native
 * assistant and the REST API: there is one implementation of every operation and
 * one authorization path. What a client sees is what its owner may do, minus the
 * agent's own narrowing.
 *
 * Authentication is a bearer agent token created by the organization. There is
 * deliberately no anonymous mode and no "trust this client" shortcut.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

const rpcError = (id: unknown, code: number, message: string, status = 200, data?: unknown) =>
  NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }, { status, headers: NO_STORE });

export async function GET() {
  // No server-initiated stream: this endpoint answers requests only.
  return NextResponse.json(
    {
      server: SERVER_NAME,
      version: SERVER_VERSION,
      transport: "streamable-http",
      protocolVersion: SUPPORTED_PROTOCOL,
      authentication: "Authorization: Bearer <agent token>",
      note: "Send JSON-RPC 2.0 requests with POST. Server-sent events are not offered by this deployment.",
    },
    { status: 405, headers: { ...NO_STORE, Allow: "POST, DELETE" } },
  );
}

/** Session teardown. Stateless by design, so this only acknowledges. */
export async function DELETE(request: Request) {
  const auth = await authenticateAgent(request, "mcp");
  if (!auth.ok) return NextResponse.json({ error: { code: auth.code, message: auth.message } }, { status: auth.status, headers: auth.headers });
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

export async function POST(request: Request) {
  const auth = await authenticateAgent(request, "mcp");
  if (!auth.ok) {
    // MCP clients understand JSON-RPC errors better than an opaque 401 body.
    if (auth.status === 401) {
      return rpcError(null, -32001, auth.message, 401);
    }
    return NextResponse.json({ error: { code: auth.code, message: auth.message } }, { status: auth.status, headers: auth.headers });
  }

  let payload: unknown;
  try {
    const text = await request.text();
    payload = JSON.parse(text);
  } catch {
    return rpcError(null, -32700, "Parse error: the body must be JSON.");
  }

  // A batch is a JSON array; notifications (no id) get 202 with no body.
  const messages = Array.isArray(payload) ? payload : [payload];
  if (!messages.length) return rpcError(null, -32600, "Invalid Request: empty batch.");

  const responses: unknown[] = [];
  for (const message of messages) {
    const request_ = message as { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
    if (request_?.jsonrpc !== "2.0" || typeof request_.method !== "string") {
      responses.push({ jsonrpc: "2.0", id: request_?.id ?? null, error: { code: -32600, message: "Invalid Request." } });
      continue;
    }
    const isNotification = request_.id === undefined || request_.id === null;
    try {
      const result = await handleRpc(request_.method, request_.params, {
        listTools: async () => {
          const hasPermission = permissionResolver(auth);
          const out = [];
          for (const tool of TOOLS) {
            if ((auth.actor.deniedPermissions ?? []).includes(tool.risk.permission)) continue;
            const allow = auth.actor.allowedPermissions ?? [];
            if (allow.length && !allow.includes(tool.risk.permission)) continue;
            if (!(await hasPermission(tool.risk.permission))) continue;
            out.push({
              name: tool.name,
              title: tool.title,
              description: tool.description,
              inputSchema: tool.input,
              annotations: {
                readOnlyHint: !tool.risk.writes,
                destructiveHint: tool.risk.risk === "sensitive",
                idempotentHint: !tool.risk.writes,
              },
            });
          }
          return out;
        },
        callTool: async (name: string, args: Record<string, unknown>) => {
          const approvalId = typeof args?.__approval_id === "string" ? args.__approval_id : undefined;
          const callArgs = { ...args };
          delete callArgs.__approval_id;
          const outcome = await executeTool(
            { tool: name, args: callArgs, actor: auth.actor, scope: auth.scope, approvalId },
            { hasPermission: permissionResolver(auth), admin: auth.admin, supabase: auth.supabase },
          );
          if (!outcome.ok) {
            // MCP distinguishes a tool error from a protocol error: an
            // approval_required is a legitimate tool result the model can relay.
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text:
                    outcome.code === "approval_required"
                      ? `${outcome.detail}\nApproval id: ${outcome.approvalId ?? "pending"}`
                      : outcome.detail ?? "The operation failed.",
                },
              ],
              structuredContent: {
                ok: false,
                code: outcome.code,
                approval_id: outcome.approvalId ?? null,
                execution_id: outcome.executionId,
              },
            };
          }
          return {
            content: [{ type: "text", text: outcome.summary ?? "Done." }],
            structuredContent: {
              ok: true,
              execution_id: outcome.executionId,
              data: outcome.data ?? null,
              preview: outcome.preview ?? null,
              links: outcome.links ?? [],
            },
          };
        },
      });
      if (!isNotification) responses.push({ jsonrpc: "2.0", id: request_.id, result });
    } catch (error) {
      if (isNotification) continue;
      if (error instanceof ToolError || error instanceof McpToolError) {
        responses.push({ jsonrpc: "2.0", id: request_.id, error: { code: -32602, message: error.message, data: { code: error.code } } });
      } else if (typeof (error as { rpcCode?: number }).rpcCode === "number") {
        responses.push({ jsonrpc: "2.0", id: request_.id, error: { code: (error as { rpcCode: number }).rpcCode, message: (error as Error).message } });
      } else {
        responses.push({ jsonrpc: "2.0", id: request_.id, error: { code: -32603, message: "Internal error." } });
      }
    }
  }

  if (!responses.length) return new NextResponse(null, { status: 202, headers: NO_STORE });
  return NextResponse.json(Array.isArray(payload) ? responses : responses[0], { headers: NO_STORE });
}
