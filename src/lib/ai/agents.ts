import "server-only";

/**
 * EVALORA AI CORE — external agent credentials.
 *
 * An agent is a credential bound to ONE human owner inside ONE organization.
 * It has no role of its own and no synthetic administrator identity: every call
 * resolves permissions through `access_has_permission(owner, org, key)`, exactly
 * as the owner's own browser session would. Narrowing lists can only remove
 * rights.
 *
 * The plaintext token is returned once, by the function that creates it, and is
 * never stored or logged; only its SHA-256 digest reaches the database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ToolError, type ActorIdentity } from "./types";
import { AGENT_CLIENTS, digestAgentToken, generateAgentToken, TOKEN_PREFIX_LENGTH, type AgentClient } from "./agentToken";
import { TOOLS } from "./tools";

export { AGENT_CLIENTS, digestAgentToken, generateAgentToken, TOKEN_PREFIX_LENGTH, type AgentClient };

export interface AgentRecord {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  client: AgentClient;
  status: "pending" | "approved" | "revoked" | "rejected";
  scopes: string[];
  allowedPermissions: string[];
  deniedPermissions: string[];
  ownerId: string | null;
  classIds: string[];
  subjectIds: string[];
  rateLimitPerMinute: number;
  dailyCallLimit: number;
  tokenPrefix: string | null;
  tokenLastRotatedAt: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
  approvedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

function rowToAgent(row: Record<string, unknown>): AgentRecord {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    client: row.client as AgentClient,
    status: row.status as AgentRecord["status"],
    scopes: (row.scopes as string[]) ?? [],
    allowedPermissions: (row.allowed_permissions as string[]) ?? [],
    deniedPermissions: (row.denied_permissions as string[]) ?? [],
    ownerId: (row.owner_id as string | null) ?? null,
    classIds: (row.class_ids as string[]) ?? [],
    subjectIds: (row.subject_ids as string[]) ?? [],
    rateLimitPerMinute: Number(row.rate_limit_per_minute ?? 60),
    dailyCallLimit: Number(row.daily_call_limit ?? 2000),
    tokenPrefix: (row.token_prefix as string | null) ?? null,
    tokenLastRotatedAt: (row.token_last_rotated_at as string | null) ?? null,
    tokenExpiresAt: (row.token_expires_at as string | null) ?? null,
    createdAt: row.created_at as string,
    approvedAt: (row.approved_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
    revokeReason: (row.revoke_reason as string | null) ?? null,
  };
}

/**
 * The permission keys the AI core can use. Taken from the tool registry rather
 * than hand-listed, so a new tool can never reference a key that was forgotten
 * here.
 */
export function knownPermissions(): string[] {
  return Object.keys(CORE_PERMISSIONS).sort();
}

/** Derived from the registry at module load: one source of truth. */
const CORE_PERMISSIONS: Record<string, true> = Object.fromEntries(
  TOOLS.map((tool) => [tool.risk.permission, true as const]),
);

export function isKnownPermission(key: string): boolean {
  return key in CORE_PERMISSIONS;
}

export interface CreateAgentInput {
  organizationId: string;
  name: string;
  description?: string;
  client: AgentClient;
  ownerId: string;
  allowedPermissions?: string[];
  deniedPermissions?: string[];
  classIds?: string[];
  subjectIds?: string[];
  rateLimitPerMinute?: number;
  dailyCallLimit?: number;
  /** Approval is immediate only when a manager creates it for themselves. */
  autoApprove?: boolean;
  createdBy: string;
}

export interface CreateAgentResult {
  agent: AgentRecord;
  /** Shown once. Never retrievable afterwards. */
  token: string;
}

/**
 * Registers an agent.
 *
 * The owner must be an active member of the organization: the credential is
 * useless otherwise, and accepting it would create a row whose authority can
 * never be resolved.
 */
export async function createAgent(admin: SupabaseClient, input: CreateAgentInput): Promise<CreateAgentResult> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new ToolError("invalid_arguments", "Give the agent a name of 2–120 characters.");

  const { data: membership } = await admin
    .from("organization_members")
    .select("user_id, role, status")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.ownerId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) {
    throw new ToolError("invalid_arguments", "The chosen owner is not an active member of this organization.");
  }

  const allowed = (input.allowedPermissions ?? []).filter((key) => isKnownPermission(key));
  const denied = (input.deniedPermissions ?? []).filter((key) => isKnownPermission(key));
  if (allowed.length && denied.some((key) => allowed.includes(key))) {
    throw new ToolError("invalid_arguments", "A permission cannot be both allowed and denied.");
  }

  const { token, digest, prefix } = generateAgentToken(input.client);
  const status = input.autoApprove ? "approved" : "pending";

  const { data, error } = await admin
    .from("ai_agents")
    .insert({
      organization_id: input.organizationId,
      name,
      description: input.description?.slice(0, 2000) || null,
      client: input.client,
      scopes: allowed,
      allowed_permissions: allowed,
      denied_permissions: denied,
      status,
      token_digest: digest,
      // A pending credential is issued but cannot resolve: only an approved,
      // digest-matching row answers `ai_resolve_agent`.
      token_prefix: prefix,
      token_last_rotated_at: new Date().toISOString(),
      token_expires_at: null,
      owner_id: input.ownerId,
      approved_by: input.autoApprove ? input.createdBy : null,
      approved_at: input.autoApprove ? new Date().toISOString() : null,
      class_ids: input.classIds ?? [],
      subject_ids: input.subjectIds ?? [],
      rate_limit_per_minute: Math.min(600, Math.max(1, input.rateLimitPerMinute ?? 60)),
      daily_call_limit: Math.min(1_000_000, Math.max(1, input.dailyCallLimit ?? 2000)),
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new ToolError("conflict", error?.message?.includes("duplicate") ? "An agent with that name already exists." : "The agent could not be created.");
  }
  return { agent: rowToAgent(data as Record<string, unknown>), token };
}

/** Approves a pending agent and records who did it. */
export async function approveAgent(admin: SupabaseClient, agentId: string, organizationId: string, actorId: string): Promise<AgentRecord> {
  const { data, error } = await admin
    .from("ai_agents")
    .update({ status: "approved", approved_by: actorId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .in("status", ["pending"])
    .select("*")
    .maybeSingle();
  if (error || !data) throw new ToolError("conflict", "Only a pending agent can be approved.");
  return rowToAgent(data as Record<string, unknown>);
}

/** Rejects a pending agent. The credential never becomes usable. */
export async function rejectAgent(admin: SupabaseClient, agentId: string, organizationId: string, actorId: string): Promise<void> {
  const { error } = await admin
    .from("ai_agents")
    .update({
      status: "rejected",
      token_digest: null,
      approved_by: actorId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .eq("status", "pending");
  if (error) throw new ToolError("internal", "The agent could not be rejected.");
}

/**
 * Revokes an agent immediately.
 *
 * Runs through the database function so the digest is cleared in the same
 * statement that flips the status, and every pending approval it queued is
 * cancelled. Revocation therefore cannot be raced by an in-flight call: the
 * resolver stops matching the moment the digest is gone.
 */
export async function revokeAgent(
  admin: SupabaseClient,
  agentId: string,
  organizationId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const { data: owned } = await admin
    .from("ai_agents")
    .select("id")
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!owned) throw new ToolError("not_found", "That agent does not belong to this organization.");

  // The actor is passed explicitly. `ai_revoke_agent` used to identify the caller
  // with `auth.uid()` via `can_manage_org`, and this runs on the service-role
  // client where `auth.uid()` is NULL — so it raised AI_PERMISSION_DENIED for
  // every user and the button could never have worked. The function now takes the
  // human as an argument and checks them with `_access_eval_permission`, which
  // answers the same question independently of the session.
  const { data, error } = await admin.rpc("ai_revoke_agent", {
    p_agent_id: agentId,
    p_reason: reason.slice(0, 500),
    p_actor_id: actorId,
  });
  if (error) {
    if (/AI_PERMISSION_DENIED/.test(error.message)) {
      throw new ToolError("permission_denied", "You do not have permission to revoke this agent.");
    }
    throw new ToolError("internal", "The agent could not be revoked.");
  }
  // Returning false means the row vanished between the ownership check and the
  // update. Reporting success there would be the original bug in a new place.
  if (data !== true) throw new ToolError("conflict", "That agent no longer exists.");
}

/** Rotates a credential: a new token is issued and the old one stops working. */
export async function rotateAgentToken(
  admin: SupabaseClient,
  agentId: string,
  organizationId: string,
  client: AgentClient,
  actorId: string,
): Promise<{ token: string; prefix: string }> {
  const { token, digest, prefix } = generateAgentToken(client);
  // Through the database function for the same reason as revocation: it records
  // the human, and it RAISES when the agent is not approved instead of quietly
  // updating zero rows and letting the UI show a credential that was never
  // stored. A silent no-op here would hand the user a token that cannot work.
  const { data, error } = await admin.rpc("ai_rotate_agent_token", {
    p_agent_id: agentId,
    p_digest: digest,
    p_prefix: prefix,
    p_actor_id: actorId,
  });
  if (error) {
    if (/AI_PERMISSION_DENIED/.test(error.message)) {
      throw new ToolError("permission_denied", "You do not have permission to rotate this agent's credential.");
    }
    if (/AI_AGENT_NOT_APPROVED/.test(error.message)) {
      throw new ToolError("conflict", "Only an approved agent's credential can be rotated.");
    }
    throw new ToolError("internal", "The credential could not be rotated.");
  }
  if (data !== true) throw new ToolError("not_found", "That agent does not belong to this organization.");
  return { token, prefix };
}

/** Changes an agent's narrowing lists without touching its credential. */
export async function setAgentNarrowing(
  admin: SupabaseClient,
  agentId: string,
  organizationId: string,
  patch: { allowedPermissions?: string[]; deniedPermissions?: string[] },
): Promise<AgentRecord> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.allowedPermissions) {
    update.allowed_permissions = patch.allowedPermissions.filter((key) => isKnownPermission(key));
    update.scopes = update.allowed_permissions;
  }
  if (patch.deniedPermissions) update.denied_permissions = patch.deniedPermissions.filter((key) => isKnownPermission(key));

  const { data, error } = await admin
    .from("ai_agents")
    .update(update)
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .select("*")
    .maybeSingle();
  if (error || !data) throw new ToolError("conflict", "The agent's permissions could not be saved.");
  return rowToAgent(data as Record<string, unknown>);
}

/** Lists agents for an organization. Never returns a digest or a token. */
export async function listAgents(admin: SupabaseClient, organizationId: string): Promise<AgentRecord[]> {
  const { data } = await admin
    .from("ai_agents")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => rowToAgent(row as Record<string, unknown>));
}

/**
 * Resolves a bearer token to an `ActorIdentity`.
 *
 * Returns null for anything that is not an approved, unexpired credential. The
 * caller must then decline the request with a 401 that does not reveal whether
 * the token exists.
 */
export async function resolveAgentActor(admin: SupabaseClient, token: string): Promise<ActorIdentity | null> {
  const trimmed = token.trim();
  if (trimmed.length < 20 || trimmed.length > 400) return null;
  const digest = digestAgentToken(trimmed);
  const { data, error } = await admin.rpc("ai_resolve_agent", { p_token_digest: digest });
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : (data as Record<string, unknown> | null);
  if (error || !row) return null;

  const ownerId = row.owner_id as string | null;
  if (!ownerId) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name, status")
    .eq("id", ownerId)
    .maybeSingle();
  if (!profile || profile.status !== "active") return null;

  return {
    kind: "agent",
    userId: ownerId,
    userEmail: (profile.email as string) ?? "",
    agentId: row.agent_id as string,
    agentName: row.name as string,
    allowedPermissions: (row.allowed_permissions as string[]) ?? [],
    deniedPermissions: (row.denied_permissions as string[]) ?? [],
    rateLimitPerMinute: Number(row.rate_limit_per_minute ?? 60),
    dailyCallLimit: Number(row.daily_call_limit ?? 2000),
    tokenExpiresAt: (row.token_expires_at as string | null) ?? null,
  };
}

/** The tool names an agent can see, given its narrowing and the owner's rights. */
export async function toolsForAgent(
  agent: ActorIdentity,
  hasPermission: (permission: string) => Promise<boolean>,
): Promise<string[]> {
  const out: string[] = [];
  for (const tool of TOOLS) {
    if ((agent.deniedPermissions ?? []).includes(tool.risk.permission)) continue;
    const allowed = agent.allowedPermissions ?? [];
    if (allowed.length && !allowed.includes(tool.risk.permission)) continue;
    if (!(await hasPermission(tool.risk.permission))) continue;
    out.push(tool.name);
  }
  return out;
}

