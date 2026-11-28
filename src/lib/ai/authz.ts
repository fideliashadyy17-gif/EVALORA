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
import { createAdminClient, createUserSessionClient } from "@/lib/supabase/server";
import { resolveAgentActor } from "./agents";
import { getTool } from "./tools";
import { ToolError, type ActorIdentity, type CallScope, type Surface } from "./types";
import { getEntitlementFor } from "@/lib/entitlements";
import { moduleEnabled } from "@/lib/modules";

export interface AiRequestAuth {
  actor: ActorIdentity;
  organizationId: string;
  organizationSlug: string | null;
  admin: SupabaseClient;
  /**
   * RLS client authenticated as the agent's OWNER (a real auth session, not the
   * caller's cookies and not the service role). The tools' writes use this.
   */
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

  // A request-scoped RLS client established AS THE OWNER, so tool writes carry
  // the same identity a browser session would and RLS applies on top of RBAC.
  //
  // This must be a real session, never `createClient()`: that helper reads the
  // CALLER's cookies, and an agent request has none. The result would be an
  // anonymous client, which fails in two silent ways — `access_has_permission`
  // resolves nothing (so every shared-service `canOperate` returns false and
  // every write is refused as "no permission"), and RLS sees no identity (so
  // reads come back empty). A request whose owner session cannot be
  // established is therefore refused outright rather than run unauthenticated.
  const supabase = await createUserSessionClient(admin, actor.userId, actor.userEmail ?? "");
  if (!supabase) {
    return {
      ok: false,
      status: 401,
      code: "unauthenticated",
      message: "That credential is not valid for any active agent.",
      headers: { ...NO_STORE, "WWW-Authenticate": "Bearer" },
    };
  }

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

/**
 * The entitlement resolver only needs a profile status and platform role, so the
 * agent path builds the smallest honest session for it rather than impersonating
 * a browser render.
 */
function sessionFor(auth: AiRequestAuth) {
  return {
    user: { id: auth.actor.userId, email: auth.actor.userEmail ?? "" },
    profile: { id: auth.actor.userId, platform_role: "user", status: "active" },
    memberships: [],
    adminOrgContext: null,
    tenantSlug: null,
    tenantDenied: false,
    workspaceSelected: true,
  } as unknown as Parameters<typeof getEntitlementFor>[1];
}

/** Checks the person a tool is attributed to actually exists and is active. */
export async function ownerIsActive(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("status").eq("id", userId).maybeSingle();
  return Boolean(data && data.status === "active");
}

/**
 * Builds the permission resolver for a request.
 *
 * It answers exactly the question `executeTool` asks: does the ACTING HUMAN hold
 * this permission in this organization?
 *
 * It calls `_access_eval_permission`, the pure evaluator, and NOT
 * `access_has_permission`. The latter opens with
 *
 *     if auth.uid() is distinct from p_user_id and not is_super_admin()
 *     then return false; end if;
 *
 * which is an identity guard for callers holding a session cookie. This code
 * runs on the service-role client, where `auth.uid()` is NULL, so that guard is
 * always true and the function returned FALSE FOR EVERY PERMISSION AND EVERY
 * USER. The consequence was total rather than partial: `tools/list` offered an
 * agent zero tools, so discovery came back empty and every call was refused with
 * "You do not have … which … requires" — an external agent could not do anything
 * at all, while the same person's browser worked normally.
 *
 * Dropping the guard is safe HERE because the identity is not inferred from the
 * request: `authenticateAgent` resolved it from the agent's own row and its
 * owner, and the permission question names that resolved id explicitly. The
 * evaluator still answers no for an unknown user, a permission that does not
 * exist, or a user who has no role in the organization — all verified against
 * the live database before this change was made.
 *
 * The module half of the check is applied by the service each tool invokes
 * (`createExaminationFromForm`, `savePaperForActor`, …) — the AI never has a
 * second, weaker path into those services.
 */
export function permissionResolver(
  auth: AiRequestAuth,
): (permission: string, module?: string) => Promise<boolean> {
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

  return async (permission: string, module?: string) => {
    const key = module ? `${permission}\u0000${module}` : permission;
    if (cache.has(key)) return cache.get(key)!;
    let allowed = false;
    try {
      const role = await membershipRole(auth.organizationId);
      if (role) {
        const { data, error } = await auth.admin.rpc("_access_eval_permission", {
          p_user_id: auth.actor.userId,
          p_organization_id: auth.organizationId,
          p_permission_key: permission,
        });
        allowed = !error && data === true;
        // The module half of the check, exactly as `canOperate` applies it: a
        // plan that excludes the module denies the operation even when the
        // person's role would allow it.
        if (allowed && module) {
          const entitlement = await getEntitlementFor(auth.admin, sessionFor(auth), auth.organizationId);
          allowed = moduleEnabled(entitlement.modules, module);
        }
      }
    } catch {
      allowed = false;
    }
    cache.set(key, allowed);
    return allowed;
  };
}

/**
 * The plan gate for the whole AI surface.
 *
 * `ai_assistant` is an Institution-tier module: the dashboard refuses to render
 * `/dashboard/ai` without it (`requireModule`), and the API and MCP server must
 * refuse the same organizations rather than offering a second, weaker door.
 * Without this, an organization on a plan that excludes the module could still
 * discover and call tools through `/api/ai/v1` or `/api/mcp`.
 *
 * Returns `null` when the module is included, or the refusal to send.
 */
export async function aiModuleRefusal(auth: AiRequestAuth): Promise<NextResponse | null> {
  let enabled = false;
  try {
    const entitlement = await getEntitlementFor(auth.admin, sessionFor(auth), auth.organizationId);
    enabled = moduleEnabled(entitlement.modules, "ai_assistant");
  } catch {
    enabled = false;
  }
  if (enabled) return null;
  return NextResponse.json(
    {
      error: {
        code: "module_unavailable",
        message:
          "The EVALORA AI Assistant is not included in this organization's plan. An administrator can enable the ai_assistant module for this institution.",
      },
    },
    { status: 403, headers: NO_STORE },
  );
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
      error.code === "unauthenticated"
        ? 401
        : error.code === "permission_denied"
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
