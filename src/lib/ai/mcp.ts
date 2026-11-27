import "server-only";


/**
 * Minimal Model Context Protocol server semantics (streamable HTTP, JSON-RPC).
 *
 * Only what the protocol requires to be useful is implemented, and every method
 * that matters routes to the platform's single tool registry. Keeping this small
 * is deliberate: a larger surface would mean a second capability list that can
 * drift from the REST API.
 */

/**
 * A tool-level failure. Declared here (structurally identical to the engine's
 * `ToolError`) so the protocol layer is pure logic with no runtime import of the
 * server-only core: it can then be executed and tested on its own.
 */
export class McpToolError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
  }
}

export const SERVER_NAME = "evalora";
export const SERVER_VERSION = "1.0.0";
export const SUPPORTED_PROTOCOL = "2025-06-18";

export interface McpHandlers {
  listTools: () => Promise<
    {
      name: string;
      title: string;
      description: string;
      inputSchema: unknown;
      annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean };
    }[]
  >;
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }>;
}


/**
 * Dispatches one JSON-RPC method.
 *
 * An unknown method is a protocol error (-32601) while an unknown tool is a tool
 * error returned inside a successful `tools/call` result — that is what MCP
 * clients expect, and it lets the model correct itself instead of the client
 * failing the whole session.
 */
export async function handleRpc(method: string, params: unknown, handlers: McpHandlers): Promise<unknown> {
  switch (method) {
    case "initialize": {
      const requested = (params as { protocolVersion?: string } | null)?.protocolVersion;
      return {
        protocolVersion: requested === SUPPORTED_PROTOCOL ? SUPPORTED_PROTOCOL : SUPPORTED_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "EVALORA exposes the same operations to you as it does to the teacher in the browser. " +
          "Every action is attributed to the human who authorised this credential and is limited by their permissions. " +
          "Publishing, marking and score changes require a human approval and will return an approval id.",
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: await handlers.listTools() };
    case "tools/call": {
      const call = params as { name?: unknown; arguments?: unknown } | null;
      const name = typeof call?.name === "string" ? call.name : "";
      if (!name) throw new McpToolError("invalid_arguments", "tools/call requires a tool name.");
      const args = call?.arguments && typeof call.arguments === "object" && !Array.isArray(call.arguments)
        ? (call.arguments as Record<string, unknown>)
        : {};
      return handlers.callTool(name, args);
    }
    case "resources/list":
      return { resources: [] };
    case "prompts/list":
      return { prompts: [] };
    case "notifications/initialized":
    case "notifications/cancelled":
      return {};
    default:
      throw Object.assign(new Error(`Method not found: ${method}`), { rpcCode: -32601 });
  }
}
