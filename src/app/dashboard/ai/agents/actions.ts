"use server";

/**
 * Agents & approvals — server actions.
 *
 * Only an organization manager (`ai.manage_agents`) reaches these. Each action
 * re-checks that permission itself: hiding a form is not authorization. Every
 * decision writes an audit row naming the human who made it.
 */

import { revalidatePath } from "next/cache";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { audit } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import {
  AGENT_CLIENTS,
  approveAgent,
  createAgent,
  rejectAgent,
  revokeAgent,
  rotateAgentToken,
  setAgentNarrowing,
  type AgentClient,
} from "@/lib/ai/agents";
import { isKnownPermission } from "@/lib/ai/agents";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AgentActionState {
  ok: boolean;
  message: string;
  /** Present only from `createAgentAction` / rotation: shown once. */
  token?: string;
}

async function authorize() {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) return null;
  if (!(await canOperate(ctx, org.id, "ai.manage_agents"))) return null;
  return { ctx, org };
}

function list(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item && isKnownPermission(item));
}

export async function createAgentAction(_prev: AgentActionState | null, formData: FormData): Promise<AgentActionState> {
  const auth = await authorize();
  if (!auth) return { ok: false, message: "You do not have permission to manage AI agents." };

  const name = String(formData.get("name") ?? "").trim();
  const client = String(formData.get("client") ?? "custom") as AgentClient;
  const ownerEmail = String(formData.get("owner_email") ?? "").trim().toLowerCase();
  if (!AGENT_CLIENTS.includes(client)) return { ok: false, message: "Choose a supported client." };
  if (name.length < 2) return { ok: false, message: "Give the agent a name of at least 2 characters." };

  const admin = createAdminClient();
  // The owner must be a REAL member. The form takes an email so a manager never
  // has to paste an id, but the email is resolved inside the tenant's own
  // membership list — an address in another organization resolves to nothing.
  const { data: membershipRows } = await admin
    .from("organization_members")
    .select("user_id, profile:profiles(id, email, full_name)")
    .eq("organization_id", auth.org.id)
    .eq("status", "active");
  type MemberRow = { user_id: string; profile: { id: string; email: string | null; full_name: string | null } | null };
  const rows = (membershipRows ?? []) as unknown as MemberRow[];
  const owner = rows.find((row) => (row.profile?.email ?? "").toLowerCase() === ownerEmail);

  try {
    const created = await createAgent(admin, {
      organizationId: auth.org.id,
      name,
      description: String(formData.get("description") ?? "").slice(0, 2000) || undefined,
      client,
      ownerId: owner?.user_id ?? auth.ctx.user.id,
      allowedPermissions: list(formData.get("allowed_permissions")),
      deniedPermissions: list(formData.get("denied_permissions")),
      rateLimitPerMinute: Number(formData.get("rate_limit_per_minute") ?? 60),
      dailyCallLimit: Number(formData.get("daily_call_limit") ?? 2000),
      // Issuing a credential that the issuer may then approve in one step is
      // allowed ONLY for the issuer's own identity; anything else waits.
      autoApprove: (owner?.user_id ?? auth.ctx.user.id) === auth.ctx.user.id,
      createdBy: auth.ctx.user.id,
    });
    await audit(auth.ctx, "ai.agent.create", "ai_agent", created.agent.id, auth.org.id, {
      name: created.agent.name,
      client,
      status: created.agent.status,
      allowed: created.agent.allowedPermissions,
      denied: created.agent.deniedPermissions,
    });
    revalidatePath("/dashboard/ai/agents");
    return {
      ok: true,
      message: `Created "${created.agent.name}". Copy the token now — it is shown once and cannot be retrieved again.`,
      token: created.token,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The agent could not be created." };
  }
}

export async function approveAgentAction(formData: FormData): Promise<void> {
  const auth = await authorize();
  const agentId = String(formData.get("agent_id") ?? "");
  if (!auth || !UUID.test(agentId)) return;
  const admin = createAdminClient();
  try {
    await approveAgent(admin, agentId, auth.org.id, auth.ctx.user.id);
    await audit(auth.ctx, "ai.agent.approve", "ai_agent", agentId, auth.org.id, {});
  } catch {
    /* the page re-reads the row, so a stale click shows the real state */
  }
  revalidatePath("/dashboard/ai/agents");
}

export async function rejectAgentAction(formData: FormData): Promise<void> {
  const auth = await authorize();
  const agentId = String(formData.get("agent_id") ?? "");
  if (!auth || !UUID.test(agentId)) return;
  const admin = createAdminClient();
  try {
    await rejectAgent(admin, agentId, auth.org.id, auth.ctx.user.id);
    await audit(auth.ctx, "ai.agent.reject", "ai_agent", agentId, auth.org.id, {});
  } catch {
    /* idem */
  }
  revalidatePath("/dashboard/ai/agents");
}

export async function revokeAgentAction(formData: FormData): Promise<void> {
  const auth = await authorize();
  const agentId = String(formData.get("agent_id") ?? "");
  const reason = String(formData.get("reason") ?? "").slice(0, 500);
  if (!auth || !UUID.test(agentId)) return;
  const admin = createAdminClient();
  try {
    await revokeAgent(admin, agentId, auth.org.id, reason || "Revoked by an administrator.");
    await audit(auth.ctx, "ai.agent.revoke", "ai_agent", agentId, auth.org.id, { reason });
  } catch {
    /* idem */
  }
  revalidatePath("/dashboard/ai/agents");
}

export async function rotateTokenAction(formData: FormData): Promise<void> {
  const auth = await authorize();
  const agentId = String(formData.get("agent_id") ?? "");
  const client = String(formData.get("client") ?? "custom") as AgentClient;
  if (!auth || !UUID.test(agentId) || !AGENT_CLIENTS.includes(client)) return;
  const admin = createAdminClient();
  try {
    const rotated = await rotateAgentToken(admin, agentId, auth.org.id, client);
    await audit(auth.ctx, "ai.agent.rotate", "ai_agent", agentId, auth.org.id, {});
    // The new token is written to a one-time cookie rather than the URL so it
    // does not land in a browser history entry or an access log.
    const { cookies } = await import("next/headers");
    const store = await cookies();
    store.set("evalora_ai_token_once", rotated.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/dashboard/ai/agents",
      maxAge: 120,
    });
  } catch {
    /* idem */
  }
  revalidatePath("/dashboard/ai/agents");
}

export async function narrowAgentAction(formData: FormData): Promise<void> {
  const auth = await authorize();
  const agentId = String(formData.get("agent_id") ?? "");
  if (!auth || !UUID.test(agentId)) return;
  const admin = createAdminClient();
  try {
    await setAgentNarrowing(admin, agentId, auth.org.id, {
      allowedPermissions: list(formData.get("allowed_permissions")),
      deniedPermissions: list(formData.get("denied_permissions")),
    });
    await audit(auth.ctx, "ai.agent.narrow", "ai_agent", agentId, auth.org.id, {});
  } catch {
    /* idem */
  }
  revalidatePath("/dashboard/ai/agents");
}

export async function decideApprovalAction(formData: FormData): Promise<void> {
  const auth = await authorize();
  const approvalId = String(formData.get("approval_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 2000);
  if (!auth || !UUID.test(approvalId) || !["approved", "rejected"].includes(decision)) return;

  const admin = createAdminClient();
  // Scoped by organization so an id from another tenant simply matches nothing.
  const { data } = await admin
    .from("ai_approvals")
    .select("id, status, tool_name, payload_summary")
    .eq("id", approvalId)
    .eq("organization_id", auth.org.id)
    .maybeSingle();
  if (!data || data.status !== "pending") {
    revalidatePath("/dashboard/ai/approvals");
    return;
  }
  const { error } = await admin
    .from("ai_approvals")
    .update({
      status: decision,
      decided_by: auth.ctx.user.id,
      decided_at: new Date().toISOString(),
      decision_note: note || null,
    })
    .eq("id", approvalId)
    .eq("organization_id", auth.org.id)
    .eq("status", "pending");
  if (!error) {
    await audit(auth.ctx, `ai.approval.${decision}`, "ai_approval", approvalId, auth.org.id, {
      tool: data.tool_name as string,
    });
  }
  revalidatePath("/dashboard/ai/approvals");
}
