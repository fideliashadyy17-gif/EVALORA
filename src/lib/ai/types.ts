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
    | "unauthenticated"
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
  kind: "exam" | "quiz" | "questions" | "marking" | "analysis" | "diff" | "agent";
  title: string;
  sections: {
    heading: string;
    rows?: { label: string; value: string }[];
    bullets?: string[];
    paragraphs?: string[];
  }[];
}

/** The verified result of a composite or single-step operation. */
/**
 * A tool's own account of what happened.
 *
 * A tool that could not do the thing — because validation refused the paper, or
 * the database rejected the write — must say so. Declaring `ok: true` as the
 * only possibility forced every handler to launder its refusal through an
 * `as unknown as ToolResult` cast, which is precisely how the engine came to
 * journal a rejected paper as "succeeded".
 */
export type ToolResult<T = Record<string, unknown>> = ToolSuccess<T> | ToolFailure<T>;

export interface ToolSuccess<T = Record<string, unknown>> {
  ok: true;
  data: T;
  /** One-line description of what was really written, with ids. */
  summary: string;
  preview?: PreviewBlock;
  /** Confirmations are only produced after the database reported success. */
  links?: { label: string; href: string }[];
}

/**
 * The operation did not complete, and nothing was changed. The engine journals
 * this as a failure and reports `ok: false` to the caller — a refusal is never
 * dressed up as a success.
 */
export interface ToolFailure<T = Record<string, unknown>> {
  ok: false;
  /** Partial data the caller may inspect (validation errors, totals …). */
  data: T;
  /** One truthful sentence: what did not happen, and why. */
  summary: string;
  error?: { code: ToolError["code"]; message: string };
  preview?: PreviewBlock;
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

/**
 * How a refused tool is described to the journal and to the caller.
 *
 * Kept as a pure function so the rule can be asserted directly: an agent that
 * could not do the thing must never be recorded as having done it.
 */
export function failureOf(result: {
  error?: { code?: ToolError["code"]; message?: string };
  summary?: string;
}): { code: ToolError["code"]; message: string } {
  return {
    code: result.error?.code ?? "internal",
    message:
      result.error?.message ??
      result.summary ??
      "The operation did not complete, so nothing was changed.",
  };
}

/** Journal status for a refusal: an authorization refusal is `denied`, not `failed`. */
export function journalStatusFor(code: ToolError["code"]): "failed" | "denied" {
  return code === "permission_denied" ? "denied" : "failed";
}
