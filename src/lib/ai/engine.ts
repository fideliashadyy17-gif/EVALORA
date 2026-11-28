import "server-only";

/**
 * EVALORA AI CORE — Orchestration Engine.
 *
 * The single path every AI operation takes, whatever the surface:
 *
 *   resolve identity → organization AI policy → RBAC on the ACTING HUMAN →
 *   agent narrowing → approvals → rate limits → journal → run the tool →
 *   journal the outcome → return the verified result.
 *
 * Nothing here writes academic content itself; each tool delegates to the
 * ordinary EVALORA services (`saveQuestionForActor`, `savePaperForActor`,
 * `createExaminationFromForm`, the adjustment ledger). The engine's job is
 * authority and accountability.
 *
 * Two invariants are structural rather than advisory:
 *   * An agent's permission is `owner's RBAC ∧ module entitlement ∧ agent
 *     narrowing`. It can only ever subtract rights.
 *   * A sensitive change without an execution row is refused, not attempted.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { approvalRequired, riskOf } from "./risk";
import { getTool } from "./tools";
import { failureOf, journalStatusFor, ToolError, type ActorIdentity, type CallScope, type ToolResult } from "./types";
import { runTool, type ToolRuntime } from "./handlers";

export interface AiOrgSettings {
  enabled: boolean;
  externalAgentsEnabled: boolean;
  nativeAssistantEnabled: boolean;
  requireApprovalForSensitive: boolean;
  preferredProvider: string | null;
  preferredModel: string | null;
  dailyGenerationLimit: number;
}

export const DEFAULT_AI_SETTINGS: AiOrgSettings = {
  enabled: true,
  externalAgentsEnabled: true,
  nativeAssistantEnabled: true,
  requireApprovalForSensitive: true,
  preferredProvider: null,
  preferredModel: null,
  dailyGenerationLimit: 200,
};

/** Reads the organization's AI policy. A missing row means the defaults. */
export async function loadAiSettings(admin: SupabaseClient, organizationId: string): Promise<AiOrgSettings> {
  try {
    const { data } = await admin
      .from("ai_org_settings")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!data) return { ...DEFAULT_AI_SETTINGS };
    return {
      enabled: data.enabled !== false,
      externalAgentsEnabled: data.external_agents_enabled !== false,
      nativeAssistantEnabled: data.native_assistant_enabled !== false,
      // Publication safety is not silently configurable away: anything other
      // than an explicit `false` means "require approval".
      requireApprovalForSensitive: data.require_approval_for_sensitive !== false,
      preferredProvider: (data.preferred_provider as string | null) ?? null,
      preferredModel: (data.preferred_model as string | null) ?? null,
      dailyGenerationLimit: Number.isFinite(Number(data.daily_generation_limit))
        ? Number(data.daily_generation_limit)
        : DEFAULT_AI_SETTINGS.dailyGenerationLimit,
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export interface ExecutionRequest {
  tool: string;
  args: Record<string, unknown>;
  actor: ActorIdentity;
  scope: CallScope;
  /** Set when the caller is executing an already-approved operation. */
  approvalId?: string;
  /** Explicitly execute rather than preview (defaults to true). */
  execute?: boolean;
}

export interface ExecutionOutcome {
  ok: boolean;
  tool: string;
  risk: "ordinary" | "sensitive";
  executionId: string | null;
  data?: Record<string, unknown>;
  summary?: string;
  preview?: ToolResult["preview"];
  links?: ToolResult["links"];
  warnings?: string[];
  code?: string;
  detail?: string;
  approvalId?: string;
}

const sha = (value: unknown): string =>
  createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value ?? null)).digest("hex");

/** Bounded summary of arguments: identifiers and counts, never free answers. */
export function summariseArguments(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      out[key] = value.length > 160 ? `${value.slice(0, 157)}…` : value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = `array(${value.length})`;
    } else if (typeof value === "object") {
      out[key] = `object(${Object.keys(value as object).length} keys)`;
    }
  }
  return out;
}

export interface EngineDeps {
  /** Authorization resolver bound to the acting user (never to the AI). */
  hasPermission: (permission: string) => Promise<boolean>;
  /** Service-role client: journal and approval queue only. */
  admin: SupabaseClient;
  /** Request-scoped client used by the tools for their own reads/writes. */
  supabase: SupabaseClient;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  /** Injected model transport for tests. */
  modelTransport?: ToolRuntime["modelTransport"];
  /** See `ToolRuntime.authorize`: present only for external-agent requests. */
  authorize?: ToolRuntime["authorize"];
  /** See `ToolRuntime.hasPermissionFor`. */
  hasPermissionFor?: ToolRuntime["hasPermissionFor"];
  /** See `ToolRuntime.publicBaseUrl`. */
  publicBaseUrl?: ToolRuntime["publicBaseUrl"];
}

/** Rate limit + daily quota for an agent identity. */
async function enforceAgentLimits(admin: SupabaseClient, actor: ActorIdentity, now: Date): Promise<void> {
  if (actor.kind !== "agent" || !actor.agentId) return;
  const since = new Date(now.getTime() - 60_000).toISOString();
  const dayStart = new Date(now.getTime() - 86_400_000).toISOString();
  let lastMinute: number | null = null;
  let lastDay: number | null = null;
  try {
    const [minuteCount, dayCount] = await Promise.all([
      admin
        .from("ai_executions")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", actor.agentId)
        .gte("created_at", since),
      admin
        .from("ai_executions")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", actor.agentId)
        .gte("created_at", dayStart),
    ]);
    if (minuteCount.error || dayCount.error) {
      throw new ToolError("rate_limited", "The agent's usage could not be verified, so the call was refused.");
    }
    lastMinute = minuteCount.count;
    lastDay = dayCount.count;
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError("rate_limited", "The agent's usage could not be verified, so the call was refused.");
  }
  const perMinute = actor.rateLimitPerMinute ?? 60;
  const perDay = actor.dailyCallLimit ?? 2000;
  if (typeof lastMinute === "number" && lastMinute >= perMinute) {
    throw new ToolError("rate_limited", `This agent may make ${perMinute} calls per minute. Try again shortly.`);
  }
  if (typeof lastDay === "number" && lastDay >= perDay) {
    throw new ToolError("rate_limited", `This agent has used its daily allowance of ${perDay} calls.`);
  }
}

/** Agent narrowing: it can only ever remove rights, never add them. */
export function agentAllows(actor: ActorIdentity, permission: string): boolean {
  if (actor.kind !== "agent") return true;
  const allowed = actor.allowedPermissions ?? [];
  const denied = actor.deniedPermissions ?? [];
  if (denied.includes(permission)) return false;
  // An empty allow-list means "whatever the owner may do" (still bounded by RBAC).
  if (allowed.length && !allowed.includes(permission)) return false;
  return true;
}

interface ApprovalClaim {
  approvalId: string;
  /** True when this call is the one that consumed the approval. */
  claimed: boolean;
}

/**
 * Obtain an approval for a sensitive operation.
 *
 * Success is granted only by `ai_claim_approval`, which locks the row and marks
 * it consumed in one statement. A replayed call presenting the same approval
 * gets `already_used`, so the operation cannot run twice.
 */
async function obtainApproval(
  deps: EngineDeps,
  request: ExecutionRequest,
  executionId: string | null,
  tool: ReturnType<typeof getTool>,
): Promise<{ approved: ApprovalClaim } | { pending: string }> {
  const admin = deps.admin;
  const targetKey = Object.keys(request.args).find((k) => k.endsWith("_id"));
  const targetId = targetKey ? (request.args[targetKey] as string) : null;

  if (request.approvalId) {
    const { data } = await admin
      .from("ai_approvals")
      .select("id, status, tool_name, target_id")
      .eq("id", request.approvalId)
      .eq("organization_id", request.scope.organizationId)
      .maybeSingle();
    if (!data) throw new ToolError("approval_required", "That approval does not exist for this organization.");
    if (data.tool_name !== request.tool) {
      throw new ToolError("approval_required", "That approval was recorded for a different operation.");
    }
    if (targetId && data.target_id && data.target_id !== targetId) {
      throw new ToolError("approval_required", "That approval was recorded for a different record.");
    }
    if (data.status !== "approved") throw new ToolError("approval_required", `That approval is ${data.status}.`);

    const claimed = await admin.rpc("ai_claim_approval", {
      p_approval_id: data.id,
      p_execution_id: executionId,
    });
    const row = Array.isArray(claimed.data)
      ? (claimed.data[0] as { approved?: boolean; reason?: string } | undefined)
      : (claimed.data as { approved?: boolean; reason?: string } | null);
    if (claimed.error) {
      throw new ToolError("internal", "The approval could not be claimed, so nothing was executed.");
    }
    if (row?.approved !== true) {
      throw new ToolError(
        "approval_required",
        row?.reason === "already_used"
          ? "That approval has already been used. Ask the approver to review the operation again."
          : `That approval cannot be used (${row?.reason ?? "not approved"}).`,
      );
    }
    return { approved: { approvalId: data.id as string, claimed: true } };
  }

  // No approval supplied: record (or reuse) a pending request so a human can act.
  const base = admin
    .from("ai_approvals")
    .select("id")
    .eq("organization_id", request.scope.organizationId)
    .eq("tool_name", request.tool)
    .eq("status", "pending");
  const { data: found } = await (targetId ? base.eq("target_id", targetId) : base.is("target_id", null)).maybeSingle();
  if (found) return { pending: found.id as string };

  const { data: created, error } = await admin
    .from("ai_approvals")
    .insert({
      organization_id: request.scope.organizationId,
      agent_id: request.actor.agentId ?? null,
      requested_by: request.actor.userId,
      requested_by_label:
        request.actor.kind === "agent"
          ? `${request.actor.agentName ?? "Agent"} (on behalf of ${request.actor.userEmail})`
          : request.actor.userEmail,
      surface: request.scope.surface as "native" | "api" | "mcp",
      tool_name: request.tool,
      target_kind: targetKey ?? null,
      target_id: targetId,
      payload_digest: sha(request.args),
      payload_summary:
        `${tool?.title ?? request.tool}. ` +
        `Requested via ${request.scope.surface} by ${request.actor.userEmail}. ` +
        Object.entries(summariseArguments(request.args))
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(", ")
          .slice(0, 3800),
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new ToolError("internal", "The approval request could not be recorded, so nothing was executed.");
  }
  return { pending: created.id as string };
}

/**
 * Runs one tool through the full authority chain.
 */
/**
 * Proves the request client really is acting as the human this call claims.
 *
 * The native assistant passes a cookie-bound client, so `auth.getUser()` must
 * return the signed-in person. The external-agent path passes the owner-bound
 * session client. A service-role client (which has no auth session) is never
 * accepted here: the tools take their write path through this client precisely
 * so RLS constrains it, and a service-role client would remove that constraint.
 */
async function assertRequestClientIdentity(client: SupabaseClient, actor: ActorIdentity): Promise<void> {
  let userId: string | null = null;
  try {
    const { data } = await client.auth.getUser();
    userId = data?.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    throw new ToolError(
      "unauthenticated",
      "This request has no verified identity, so no operation was performed.",
    );
  }
  if (actor.userId && userId !== actor.userId) {
    throw new ToolError(
      "permission_denied",
      "This request is authenticated as a different person than the operation is attributed to.",
    );
  }
}

export async function executeTool(request: ExecutionRequest, deps: EngineDeps): Promise<ExecutionOutcome> {
  const tool = getTool(request.tool);
  if (!tool) throw new ToolError("unsupported", `There is no tool named "${request.tool}".`);
  const risk = riskOf(request.tool);
  const now = (deps.now ?? (() => new Date()))();

  // ── Identity of the request client ───────────────────────────────────
  // A tool must never run on a client that is not authenticated as the acting
  // human. An anonymous client fails silently rather than loudly: RLS returns
  // empty rows and `access_has_permission` resolves nothing, so a read looks
  // like "no data" and a write looks like "no permission". Both are lies about
  // a request that was supposed to be authorized, so it is refused here.
  await assertRequestClientIdentity(deps.supabase, request.actor);

  // ── Organization policy ──────────────────────────────────────────────
  const settings = await loadAiSettings(deps.admin, request.scope.organizationId);
  if (!settings.enabled) {
    throw new ToolError("permission_denied", "The AI core is disabled for this organization.");
  }
  if (request.actor.kind === "agent") {
    if (!settings.externalAgentsEnabled) {
      throw new ToolError("permission_denied", "External AI agents are disabled for this organization.");
    }
    if (request.actor.tokenExpiresAt && new Date(request.actor.tokenExpiresAt) <= now) {
      throw new ToolError("permission_denied", "This agent credential has expired.");
    }
    await enforceAgentLimits(deps.admin, request.actor, now);
  } else if (!settings.nativeAssistantEnabled) {
    throw new ToolError("permission_denied", "The EVALORA AI Assistant is disabled for this organization.");
  }

  // ── Authorization on the acting human ────────────────────────────────
  if (!agentAllows(request.actor, tool.risk.permission)) {
    throw new ToolError(
      "permission_denied",
      `This agent is not permitted to ${tool.title.toLowerCase()}. The organization did not grant "${tool.risk.permission}" to it.`,
    );
  }
  const permitted = await deps.hasPermission(tool.risk.permission);
  if (!permitted) {
    throw new ToolError(
      "permission_denied",
      `You do not have the "${tool.risk.permission}" permission, which "${tool.title}" requires. An administrator can grant it in Role & Access Management.`,
    );
  }

  const argumentsDigest = sha(request.args);
  // ── Replay guard ─────────────────────────────────────────────────────
  // A request id identifies one attempt at one tool. A retried submission (the
  // teacher clicks twice, the browser retries, a client repeats a POST) presents
  // the same id; without this it would author a second paper, because every
  // write handler creates a new object. Releasing the result of the first
  // attempt is the only answer that cannot duplicate a record.
  //
  // Scope is (organization, tool, request id, human actor) so one tenant can
  // never observe or consume another's request id. Only completed writes are
  // replayed: a failed or dry-run attempt is allowed to run again.
  const replayable = request.execute !== false && request.actor.kind === "human" && !request.approvalId;
  if (replayable) {
    const { data: prior } = await deps.admin
      .from("ai_executions")
      .select("id, status, arguments_digest, result_summary, error_code, error_message")
      .eq("organization_id", request.scope.organizationId)
      .eq("tool_name", request.tool)
      .eq("request_id", request.scope.requestId)
      .eq("actor_user_id", request.actor.userId ?? "00000000-0000-0000-0000-000000000000")
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // The digest is recomputed before the comparison below, so a request id
    // reused for DIFFERENT arguments is not answered with the wrong result.
    if (prior && prior.arguments_digest === argumentsDigest) {
      const summary = prior.result_summary as { summary?: string; data?: Record<string, unknown> } | null;
      return {
        ok: true,
        tool: request.tool,
        risk,
        code: "replayed",
        summary: `${summary?.summary ?? "This request was already carried out."} (Nothing was created a second time.)`,
        data: summary?.data,
        executionId: prior.id as string,
      } as ExecutionOutcome;
    }
  }

  const startedAt = Date.now();

  const insertExecution = async (status: "started" | "awaiting_approval"): Promise<string | null> => {
    try {
      const { data, error } = await deps.admin
        .from("ai_executions")
        .insert({
          organization_id: request.scope.organizationId,
          actor_kind: request.actor.kind,
          actor_user_id: request.actor.userId,
          actor_email: request.actor.userEmail,
          agent_id: request.actor.agentId ?? null,
          agent_name: request.actor.agentName ?? null,
          attributed_user_id: request.actor.userId,
          surface: request.scope.surface,
          tool_name: request.tool,
          risk,
          status,
          arguments_digest: argumentsDigest,
          arguments_summary: summariseArguments(request.args),
          request_id: request.scope.requestId,
        })
        .select("id")
        .single();
      if (error || !data) return null;
      return data.id as string;
    } catch {
      return null;
    }
  };

  // ── Approval gate ────────────────────────────────────────────────────
  const needsApproval = approvalRequired({
    tool: request.tool,
    requireApprovalForSensitive: settings.requireApprovalForSensitive,
    actorKind: request.actor.kind,
    execute: request.execute !== false,
  });

  let executionId: string | null = null;
  let approvedId: string | null = null;

  if (needsApproval) {
    // The row exists before the claim so the approval can name the execution
    // it authorises.
    executionId = await insertExecution("awaiting_approval");
    const approval = await obtainApproval(deps, request, executionId, tool);
    if ("pending" in approval) {
      if (executionId) {
        try {
          await deps.admin
            .from("ai_executions")
            .update({ approval_id: approval.pending, latency_ms: Date.now() - startedAt })
            .eq("id", executionId);
        } catch {
          /* the request is queued; the link is best-effort */
        }
      }
      return {
        ok: false,
        tool: request.tool,
        risk,
        executionId,
        code: "approval_required",
        approvalId: approval.pending,
        detail:
          `"${tool.title}" changes published or graded data, so it needs a human approval. ` +
          "The request is in the approval queue; nothing has been changed.",
      };
    }
    approvedId = approval.approved.approvalId;
    if (executionId) {
      try {
        await deps.admin.from("ai_executions").update({ approval_id: approvedId, status: "started" }).eq("id", executionId);
      } catch {
        /* the claim already recorded the decision */
      }
    }
  } else {
    executionId = await insertExecution("started");
  }

  if (!executionId && risk === "sensitive") {
    // A sensitive change with no audit trail must not happen at all.
    throw new ToolError("internal", "The execution journal is unavailable, so this sensitive operation was refused.");
  }

  const finish = async (outcome: {
    status: "succeeded" | "failed" | "denied";
    errorCode?: string;
    errorMessage?: string;
    resultSummary?: Record<string, unknown>;
    resultDigest?: string;
  }) => {
    if (!executionId) return;
    try {
      await deps.admin
        .from("ai_executions")
        .update({
          status: outcome.status,
          error_code: outcome.errorCode ?? null,
          error_message: outcome.errorMessage ?? null,
          result_summary: outcome.resultSummary ?? {},
          result_digest: outcome.resultDigest ?? null,
          latency_ms: Date.now() - startedAt,
          completed_at: new Date().toISOString(),
        })
        .eq("id", executionId);
    } catch {
      /* the operation already happened; the journal update is best-effort */
    }
  };

  const runtime: ToolRuntime = {
    actor: request.actor,
    scope: request.scope,
    admin: deps.admin,
    supabase: deps.supabase,
    settings,
    env: deps.env ?? process.env,
    now: () => (deps.now ?? (() => new Date()))(),
    modelTransport: deps.modelTransport,
    authorize: deps.authorize,
    hasPermissionFor: deps.hasPermissionFor ?? deps.hasPermission,
    publicBaseUrl: deps.publicBaseUrl,
  };

  try {
    const result = await runTool(request.tool, request.args, runtime);

    // A tool that reports `ok: false` did NOT do the thing. Recording that as
    // "succeeded" — and handing the caller `ok: true` — is how a rejected paper
    // with six validation errors ended up in the audit log as a success while
    // nothing was saved. The journal and the caller must both see the failure.
    if (result.ok === false) {
      const { code, message } = failureOf(result);
      await finish({
        status: journalStatusFor(code),
        errorCode: code,
        errorMessage: message,
        resultSummary: summariseArguments(result.data ?? {}),
        resultDigest: sha(result.data ?? {}),
      });
      return {
        ok: false,
        tool: request.tool,
        risk,
        executionId,
        data: result.data,
        preview: result.preview,
        links: result.links,
        code,
        detail: message,
        approvalId: approvedId ?? undefined,
      };
    }

    await finish({
      status: "succeeded",
      resultSummary: summariseArguments(result.data ?? {}),
      resultDigest: sha(result.data ?? {}),
    });
    return {
      ok: true,
      tool: request.tool,
      risk,
      executionId,
      data: result.data,
      summary: result.summary,
      preview: result.preview,
      links: result.links,
      warnings: (result as ToolResult & { warnings?: string[] }).warnings,
      approvalId: approvedId ?? undefined,
    };
  } catch (error) {
    if (error instanceof ToolError) {
      await finish({
        status: error.code === "permission_denied" ? "denied" : "failed",
        errorCode: error.code,
        errorMessage: error.message,
      });
      return {
        ok: false,
        tool: request.tool,
        risk,
        executionId,
        code: error.code,
        detail: error.detail ? `${error.message} ${error.detail}` : error.message,
        approvalId: approvedId ?? undefined,
      };
    }
    const message = error instanceof Error ? error.message : "The operation failed.";
    await finish({ status: "failed", errorCode: "internal", errorMessage: message.slice(0, 2000) });
    return {
      ok: false,
      tool: request.tool,
      risk,
      executionId,
      code: "internal",
      detail: `The operation failed and nothing was claimed as saved: ${message}`,
      approvalId: approvedId ?? undefined,
    };
  }
}
