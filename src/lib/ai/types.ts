/**
 * EVALORA AI CORE — shared types.
 *
 * One vocabulary for the native assistant, the REST surface and the MCP server.
 * A human and an agent describe the same operation with the same `ToolName`, the
 * same risk class and the same permission key; there is no second, parallel
 * description of what "create an examination" means.
 */

/** Risk classes. Sensitive operations are the ones a human must anchor. */
export type RiskClass = "ordinary" | "sensitive";

/** Where a call came from. Mirrors the `ai_executions.surface` check. */
export type Surface = "native" | "api" | "mcp" | "system";

/** The invoking identity, already resolved and verified server-side. */
export interface ActorIdentity {
  kind: "human" | "agent";
  /** Originating user: the signed-in teacher, or the agent's owner. */
  userId: string;
  userEmail: string | null;
  /** Present only for `kind === "agent"`. */
  agentId?: string;
  agentName?: string;
  /** Narrowing applied on top of the user's own RBAC. Never widening. */
  allowedPermissions?: string[];
  deniedPermissions?: string[];
  classIds?: string[];
  subjectIds?: string[];
  tokenExpiresAt?: string | null;
  rateLimitPerMinute?: number;
  dailyCallLimit?: number;
}

/** The organization scope of one call. Every tool requires it. */
export interface CallScope {
  organizationId: string;
  surface: Surface;
  /** Correlation id for the journal and for agent-side logs. */
  requestId: string;
}

export class ToolError extends Error {
  code:
    | "permission_denied"
    | "invalid_arguments"
    | "not_found"
    | "conflict"
    | "approval_required"
    | "rate_limited"
    | "unconfigured"
    | "unsupported"
    | "internal";
  /** Safe, user-facing sentence. Never contains a stack or a secret. */
  detail?: string;
  constructor(code: ToolError["code"], message: string, detail?: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.detail = detail;
  }
}

/** A bounded, reviewable preview of a write before it happens. */
export interface PreviewBlock {
  kind: "exam" | "quiz" | "questions" | "marking" | "analysis" | "diff";
  title: string;
  sections: {
    heading: string;
    rows?: { label: string; value: string }[];
    bullets?: string[];
    paragraphs?: string[];
  }[];
}

/** The verified result of a composite or single-step operation. */
export interface ToolResult<T = Record<string, unknown>> {
  ok: true;
  data: T;
  /** One-line description of what was really written, with ids. */
  summary: string;
  preview?: PreviewBlock;
  /** Confirmations are only produced after the database reported success. */
  links?: { label: string; href: string }[];
}

export type ToolRisk = {
  risk: RiskClass;
  /** RBAC key checked on the *acting user*, not on the AI. */
  permission: string;
  /** Module entitlement consulted in addition to the permission. */
  module?: string;
  /**
   * True when the tool writes something durable. Read-only tools never appear
   * in the approval queue and never publish anything.
   */
  writes: boolean;
  /** True when an approval may be demanded even if the caller holds the right. */
  mayRequireApproval?: boolean;
};

/** One tool as the native assistant, REST caller and MCP client see it. */
export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  risk: ToolRisk;
  /** JSON-schema-shaped input contract (used verbatim by MCP discovery). */
  input: Record<string, unknown>;
  /** Passed through to a model so it can decide when to call this tool. */
  modelHint: string;
}

export type JsonSchema = Record<string, unknown>;

export const emptySchema = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

export const str = (description: string, extra: JsonSchema = {}): JsonSchema => ({
  type: "string",
  description,
  ...extra,
});
export const num = (description: string, extra: JsonSchema = {}): JsonSchema => ({
  type: "number",
  description,
  ...extra,
});
export const int = (description: string, extra: JsonSchema = {}): JsonSchema => ({
  type: "integer",
  description,
  ...extra,
});
export const bool = (description: string): JsonSchema => ({ type: "boolean", description });
export const arr = (description: string, items: JsonSchema): JsonSchema => ({
  type: "array",
  description,
  items,
});
export const obj = (description: string, properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({
  ...emptySchema(properties, required),
  description,
});
export const uuid = (description: string): JsonSchema => ({
  type: "string",
  description,
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
});
