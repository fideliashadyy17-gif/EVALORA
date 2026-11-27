import "server-only";

/**
 * EVALORA AI CORE — request authentication and per-call authorization.
 *
 * One implementation used by BOTH the REST API and the MCP endpoint, so the two
 * protocols cannot diverge on who may do what.
 *
 * The bearer token identifies an AGENT. The agent names a HUMAN owner inside one
 * organization. Every permission question is then asked of the platform's own
 * resolver (`access_has_permission`) for that human, and the agent's narrowing
 * lists are applied on top. A credential can therefore never exceed its owner,
 * and can never reach an organization its owner is not a member of.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveAgentActor } from "./agents";
import { getTool } from "./tools";
import { ToolError, type ActorIdentity, type CallScope, type Surface } from "./types";

export interface AiRequestAuth {
  actor: ActorIdentity;
  organizationId: string;
  organizationSlug: string | null;
  admin: SupabaseClient;
  /** RLS client bound to the agent's owner — the tools' writes use this. */
  supabase: SupabaseClient;
  scope: CallScope;
  requestId: string;
}

export interface AuthFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
  /** Headers a client should act on (e.g. a challenge). */
  headers?: Record<string, string>;
}

export type AuthResult = ({ ok: true } & AiRequestAuth) | AuthFailure;

const NO_STORE = { "Cache-Control": "private, no-store" };

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  // A bare JWT is never accepted: agent tokens are prefixed, and a browser
  // session token must not be replayable against the agent API.
  if (!token.startsWith("evalora_")) return null;
  return token;
}

/**
 * Authenticates a request and returns a ready-to-use authorization context.
 *
 * Failures are uniform: a wrong token, an unknown token, a revoked agent and an
 * expired credential all produce the same 401 body, so the endpoint cannot be
 * used to enumerate credentials.
 */
export async function authenticateAgent(request: Request, surface: Surface): Promise<AuthResult> {
  const token = bearer(request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "unauthenticated",
      message: "Provide an agent token: Authorization: Bearer evalora_…",
      headers: { ...NO_STORE, "WWW-Authenticate": "Bearer" },
    };
  }

  const admin = createAdminClient();
  const actor = await resolveAgentActor(admin, token);
  if (!actor || !actor.agentId) {
    return {
      ok: false,
      status: 401,
      code: "unauthenticated",
      message: "That credential is not valid for any active agent.",
      headers: { ...NO_STORE, "WWW-Authenticate": "Bearer" },
    };
  }

  // The agent's organization comes from its own row, never from the request.
  const { data: agent } = await admin
    .from("ai_agents")
    .select("organization_id, status, token_expires_at")
    .eq("id", actor.agentId)
    .maybeSingle();
  if (!agent || agent.status !== "approved") {
    return { ok: false, status: 401, code: "unauthenticated", message: "That credential is not valid for any active agent.", headers: NO_STORE };
  }
  const organizationId = agent.organization_id as string;

  const { data: org } = await admin
    .from("organizations")
    .select("id, name, slug, status")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org || org.status !== "active") {
    return { ok: false, status: 403, code: "organization_inactive", message: "The organization for this credential is not active.", headers: NO_STORE };
  }

  // The owner must still be an active member. An agent must never outlive the
  // membership that authorised it.
  const { data: membership } = await admin
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", actor.userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) {
    return {
      ok: false,
      status: 403,
      code: "owner_not_member",
      message: "The human this credential acts for is no longer an active member of the organization.",
      headers: NO_STORE,
    };
  }

  // A request-scoped RLS client established as the owner, so tool writes carry
  // the same identity a browser session would and RLS applies on top of RBAC.
  const supabase = await createClient();

  let requestId = request.headers.get("x-request-id") ?? "";
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(requestId)) {
    requestId = crypto.randomUUID();
  }

  return {
    ok: true,
    actor,
    organizationId,
    organizationSlug: (org.slug as string | null) ?? null,
    admin,
    supabase,
    scope: { surface, organizationId, requestId },
    requestId,
  };
}

/** Checks the person a tool is attributed to actually exists and is active. */
export async function ownerIsActive(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("status").eq("id", userId).maybeSingle();
  return Boolean(data && data.status === "active");
}

/**
 * Builds the permission resolver for a request.
 *
 * It answers exactly the question `executeTool` asks: does the AGENT'S OWNER
 * hold this permission in this organization? The lookup calls the platform's
 * database resolver directly (`access_has_permission`) rather than impersonating
 * a browser session, so an API call resolves permissions exactly as the same
 * person's dashboard would.
 *
 * The module half of the check is applied by the service each tool invokes
 * (`createExaminationFromForm`, `savePaperForActor`, …) — the AI never has a
 * second, weaker path into those services.
 */
export function permissionResolver(auth: AiRequestAuth): (permission: string) => Promise<boolean> {
  const cache = new Map<string, boolean>();
  const memberships = new Map<string, string>();

  const membershipRole = async (organizationId: string): Promise<string | null> => {
    if (memberships.has(organizationId)) return memberships.get(organizationId)!;
    const { data } = await auth.admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", auth.actor.userId)
      .eq("status", "active")
      .maybeSingle();
    const role = (data?.role as string | undefined) ?? null;
    if (role) memberships.set(organizationId, role);
    return role;
  };

  return async (permission: string) => {
    if (cache.has(permission)) return cache.get(permission)!;
    let allowed = false;
    try {
      const role = await membershipRole(auth.organizationId);
      if (role) {
        const { data, error } = await auth.admin.rpc("access_has_permission", {
          p_user_id: auth.actor.userId,
          p_organization_id: auth.organizationId,
          p_permission_key: permission,
        });
        allowed = !error && data === true;
      }
    } catch {
      allowed = false;
    }
    cache.set(permission, allowed);
    return allowed;
  };
}

/** 404-style refusal that does not confirm whether a tool exists. */
export function unknownTool(name: string) {
  return NextResponse.json(
    { error: { code: "unsupported", message: `There is no tool named "${name}".` } },
    { status: 404, headers: NO_STORE },
  );
}

import { NextResponse } from "next/server";

/** The permission a tool requires, or null when the tool does not exist. */
export function requiredPermission(tool: string): string | null {
  return getTool(tool)?.risk.permission ?? null;
}

/**
 * Maps an engine failure to an HTTP status.
 *
 * `approval_required` is 202 (Accepted): the request is queued, not refused, and
 * a client should show the approval id rather than retry.
 */
export function toolErrorResponse(error: unknown) {
  if (error instanceof ToolError) {
    const status =
      error.code === "permission_denied"
        ? 403
          : error.code === "not_found"
            ? 404
            : error.code === "unsupported"
              ? 404
              : error.code === "approval_required"
                ? 202
                : error.code === "rate_limited"
                  ? 429
                  : error.code === "conflict"
                    ? 409
                    : error.code === "invalid_arguments"
                      ? 400
                      : error.code === "unconfigured"
                        ? 503
                        : 500;
    return NextResponse.json(
      { error: { code: error.code, message: error.message, detail: error.detail ?? null } },
      { status, headers: NO_STORE },
    );
  }
  return NextResponse.json(
    { error: { code: "internal", message: "The operation failed and nothing was changed." } },
    { status: 500, headers: NO_STORE },
  );
}

export { NO_STORE };
