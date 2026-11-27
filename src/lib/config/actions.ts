"use server";

/**
 * Platform Control Center — server actions.
 *
 * Authorization model, enforced here and never delegated to the browser:
 *
 *   • Global scope        → requireSuperAdmin() (verified active super_admin).
 *   • Organization scope  → canOperate(ctx, orgId, permission, module): the
 *     centralized RBAC check intersected with the organization's module
 *     entitlement. A Super Admin operating inside a tenant workspace also
 *     passes, because the platform-owner bypass is derived from the verified
 *     session, not from a form field.
 *   • Scope is decided by WHICH action was called, not by a submitted value,
 *     so a tenant request cannot be escalated by tampering with the payload.
 *
 * Every action returns a structured result and revalidates only the surfaces
 * the changed setting is actually connected to.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { activeOrg, requireUser } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { createAdminClient } from "@/lib/supabase/server";
import { CONFIG_NAMESPACES, getConfigDef } from "./schema";
import { applyConfigPreset, resetConfigToInherit, rollbackConfigRevision, writeConfigValue } from "./store";
import { invalidateConfigCache } from "./service";
import { GLOBAL_SCOPE_ID, type ConfigScopeLevel } from "./types";

export interface ActionResult {
  ok: boolean;
  message?: string;
  error?: string;
  namespace?: string;
  key?: string;
  revision?: number;
}

/**
 * Surfaces that must be re-rendered after a configuration change. These are the
 * real App Router routes: the global Control Center, the per-organization
 * override list, the versioned history and the presets studio.
 */
const CONTROL_CENTER_PATHS = [
  "/admin/control-center",
  "/admin/control-center/organizations",
  "/admin/control-center/history",
  "/admin/control-center/presets",
];

function revalidate(namespace: string, scope: ConfigScopeLevel, organizationId?: string | null) {
  // The root layout carries branding, theme, announcements and the maintenance
  // gate, so every namespace can affect it; revalidate the shell always.
  revalidatePath("/", "layout");
  for (const path of CONTROL_CENTER_PATHS) revalidatePath(path);
  if (scope === "organization" && organizationId) {
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/settings/configuration");
    revalidatePath("/dashboard");
    // The Super Admin's view of that organization's overrides changes too.
    revalidatePath(`/admin/control-center/organizations/${organizationId}`);
  }
  if (namespace === "question_studio") {
    revalidatePath("/dashboard/questions");
    revalidatePath("/admin/questions");
  }
  if (namespace === "examination" || namespace === "assessment") {
    revalidatePath("/dashboard/exams");
    revalidatePath("/dashboard/results");
    revalidatePath("/dashboard/paper-builder");
  }
  if (namespace === "proctoring") {
    revalidatePath("/dashboard/proctoring");
    revalidatePath("/dashboard/settings/proctoring");
  }
  if (namespace === "localization" || namespace === "formatting") {
    revalidatePath("/dashboard", "layout");
  }
}

function readScopeFromForm(formData: FormData): { scope: ConfigScopeLevel; scopeId: string | null; namespace: string; key: string } {
  const scopeRaw = String(formData.get("scope") ?? "global");
  const scope: ConfigScopeLevel = scopeRaw === "organization" ? "organization" : "global";
  const scopeIdRaw = String(formData.get("scope_id") ?? "").trim();
  return {
    scope,
    scopeId: scopeIdRaw && scopeIdRaw !== GLOBAL_SCOPE_ID ? scopeIdRaw : null,
    namespace: String(formData.get("namespace") ?? "").trim(),
    key: String(formData.get("key") ?? "").trim(),
  };
}

/**
 * Save one setting as Super Admin.
 * `scope=organization` is permitted here because a verified Super Admin may
 * configure a tenant on its behalf; the organization action below is the path
 * tenant administrators use, and it can never reach global scope.
 */
export async function savePlatformConfig(formData: FormData): Promise<ActionResult> {
  const ctx = await requireSuperAdmin();
  const { scope, scopeId, namespace, key } = readScopeFromForm(formData);
  const def = getConfigDef(namespace, key);
  if (!def) return { ok: false, error: "That setting does not exist in the EVALORA configuration schema." };

  const submitted = def.kind === "boolean"
    ? formData.get(`${namespace}.${key}`) === "on" || formData.get(`${namespace}.${key}`) === "true"
    : formData.get(`${namespace}.${key}`);

  const confirm = String(formData.get("confirm") ?? "");
  if (def.sensitivity === "operational" && confirm !== "yes") {
    return {
      ok: false,
      error: `“${def.label}” changes live platform behaviour. Tick the confirmation box before saving.`,
      namespace,
      key,
    };
  }

  const result = await writeConfigValue({
    scope,
    scopeId: scope === "organization" ? scopeId : null,
    namespace,
    key,
    submitted,
    actorId: ctx.user.id,
    organizationId: scope === "organization" ? scopeId : null,
    changeNote: String(formData.get("change_note") ?? "").slice(0, 500) || null,
  });

  if (!result.ok) return { ok: false, error: result.error, namespace, key };
  invalidateConfigCache(scope === "organization" ? scopeId : null);
  revalidate(namespace, scope, scopeId);
  return {
    ok: true,
    namespace,
    key,
    revision: result.revision,
    message: `“${def.label}” saved — revision ${result.revision}. Connected surfaces updated.`,
  };
}

/**
 * Save one setting for the caller's own organization. Global scope is
 * structurally unreachable from this action.
 */
export async function saveOrganizationConfig(formData: FormData): Promise<ActionResult> {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) return { ok: false, error: "Select an organization first." };
  if (!(await canOperate(ctx, org.id, "organizations.edit", "org_settings"))) {
    return { ok: false, error: "You do not have permission to change this organization's configuration." };
  }

  const namespace = String(formData.get("namespace") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();
  const def = getConfigDef(namespace, key);
  if (!def) return { ok: false, error: "That setting does not exist in the EVALORA configuration schema." };
  if (!def.writableScopes.includes("organization")) {
    return {
      ok: false,
      error: `“${def.label}” is platform-wide configuration. Only Super Admin can change it.`,
      namespace,
      key,
    };
  }

  const submitted = def.kind === "boolean"
    ? formData.get(`${namespace}.${key}`) === "on" || formData.get(`${namespace}.${key}`) === "true"
    : formData.get(`${namespace}.${key}`);

  if (def.sensitivity === "operational" && String(formData.get("confirm") ?? "") !== "yes") {
    return { ok: false, error: `“${def.label}” changes live behaviour. Confirm before saving.`, namespace, key };
  }

  const result = await writeConfigValue({
    scope: "organization",
    scopeId: org.id,
    namespace,
    key,
    submitted,
    actorId: ctx.user.id,
    organizationId: org.id,
    changeNote: String(formData.get("change_note") ?? "").slice(0, 500) || null,
  });
  if (!result.ok) return { ok: false, error: result.error, namespace, key };
  invalidateConfigCache(org.id);
  revalidate(namespace, "organization", org.id);
  return {
    ok: true,
    namespace,
    key,
    revision: result.revision,
    message: `“${def.label}” saved for ${org.name} — revision ${result.revision}.`,
  };
}

/** Remove one organization override so it inherits again. */
export async function resetOrganizationConfig(formData: FormData): Promise<ActionResult> {
  const ctx = await requireUser();
  const isSuperAdmin = ctx.profile.status === "active" && ctx.profile.platform_role === "super_admin";
  const requestedOrg = String(formData.get("organization_id") ?? "").trim();
  const org = activeOrg(ctx);

  let organizationId: string;
  if (isSuperAdmin && requestedOrg && /^[0-9a-f-]{36}$/i.test(requestedOrg)) {
    organizationId = requestedOrg;
  } else if (org && (!requestedOrg || requestedOrg === org.id)) {
    if (!(await canOperate(ctx, org.id, "organizations.edit", "org_settings"))) {
      return { ok: false, error: "You do not have permission to change this organization's configuration." };
    }
    organizationId = org.id;
  } else {
    return { ok: false, error: "Select the organization whose override should be removed." };
  }

  const namespace = String(formData.get("namespace") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();
  const result = await resetConfigToInherit({
    organizationId,
    namespace,
    key,
    actorId: ctx.user.id,
    changeNote: String(formData.get("change_note") ?? "").slice(0, 500) || null,
  });
  if (!result.ok) return { ok: false, error: result.error, namespace, key };
  invalidateConfigCache(organizationId);
  revalidate(namespace, "organization", organizationId);
  return { ok: true, namespace, key, message: `Override removed — “${getConfigDef(namespace, key)?.label ?? key}” now inherits.` };
}

/** Roll a setting back to the value it had before a chosen revision. */
export async function rollbackConfig(formData: FormData): Promise<ActionResult> {
  const ctx = await requireSuperAdmin();
  const revisionId = String(formData.get("revision_id") ?? "").trim();
  const result = await rollbackConfigRevision({ revisionId, actorId: ctx.user.id });
  if (!result.ok) return { ok: false, error: result.error };
  // A rollback can land at either scope; clear the whole resolver cache so the
  // next read is guaranteed to see the restored value.
  invalidateConfigCache();
  revalidate(result.namespace, result.scope, null);
  for (const path of CONTROL_CENTER_PATHS) revalidatePath(path);
  return {
    ok: true,
    namespace: result.namespace,
    key: result.key,
    revision: result.revision,
    message: `Rolled back “${getConfigDef(result.namespace, result.key)?.label ?? result.key}” to revision ${result.revision}.`,
  };
}

// ───────────────────────── presets (Super Admin) ───────────────────────────

export async function saveConfigPreset(formData: FormData): Promise<ActionResult> {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const description = String(formData.get("description") ?? "").trim().slice(0, 500) || null;
  const valuesRaw = String(formData.get("values") ?? "").trim();

  if (name.length < 2) return { ok: false, error: "Give the preset a name of at least 2 characters." };

  let values: Record<string, unknown>;
  try {
    values = JSON.parse(valuesRaw || "{}");
  } catch {
    return { ok: false, error: "Preset values must be valid JSON: { \"namespace\": { \"key\": value } }." };
  }
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return { ok: false, error: "Preset values must be a JSON object keyed by namespace." };
  }

  // Reject any key that is not declared, or is not organization-writable, so a
  // preset can never become a back door into global configuration.
  for (const [namespace, entries] of Object.entries(values as Record<string, unknown>)) {
    if (!entries || typeof entries !== "object") {
      return { ok: false, error: `Namespace “${namespace}” must map to an object of settings.` };
    }
    for (const key of Object.keys(entries as Record<string, unknown>)) {
      const def = getConfigDef(namespace, key);
      if (!def) return { ok: false, error: `“${namespace}.${key}” is not a declared EVALORA setting.` };
      if (!def.writableScopes.includes("organization")) {
        return {
          ok: false,
          error: `“${def.label}” is platform-wide configuration and cannot be part of an organization preset.`,
        };
      }
    }
  }

  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const { error } = await admin
      .from("platform_config_presets")
      .update({ name, description, values, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: `The preset could not be saved: ${error.message}` };
  } else {
    const { error } = await admin
      .from("platform_config_presets")
      .insert({ name, description, values, created_by: ctx.user.id });
    if (error) return { ok: false, error: `The preset could not be created: ${error.message}` };
  }

  await admin.from("audit_logs").insert({
    actor_id: ctx.user.id,
    organization_id: null,
    action: id ? "platform_config_preset.update" : "platform_config_preset.create",
    entity: "platform_config_presets",
    entity_id: id || name,
    metadata: { name, namespaces: Object.keys(values) },
  });

  for (const path of CONTROL_CENTER_PATHS) revalidatePath(path);
  return { ok: true, message: `Preset “${name}” saved.` };
}

export async function applyPresetToOrganization(formData: FormData): Promise<ActionResult> {
  const ctx = await requireSuperAdmin();
  const presetId = String(formData.get("preset_id") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return { ok: false, error: "Choose the organization to apply the preset to." };

  const result = await applyConfigPreset({ presetId, organizationId, actorId: ctx.user.id });
  invalidateConfigCache(organizationId);
  revalidate("org_identity", "organization", organizationId);
  for (const path of CONTROL_CENTER_PATHS) revalidatePath(path);

  if (!result.ok) {
    return {
      ok: false,
      error: `${result.applied} setting(s) applied, ${result.rejected.length} refused: ${result.rejected
        .map((r) => `${r.key} — ${r.error}`)
        .join("; ")}`,
    };
  }
  return { ok: true, message: `Preset applied — ${result.applied} setting(s) written and audit-logged.` };
}

export async function deleteConfigPreset(formData: FormData): Promise<ActionResult> {
  const ctx = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "That preset could not be found." };
  const admin = createAdminClient();
  const { error } = await admin.from("platform_config_presets").delete().eq("id", id);
  if (error) return { ok: false, error: `The preset could not be deleted: ${error.message}` };
  await admin.from("audit_logs").insert({
    actor_id: ctx.user.id,
    organization_id: null,
    action: "platform_config_preset.delete",
    entity: "platform_config_presets",
    entity_id: id,
    metadata: {},
  });
  for (const path of CONTROL_CENTER_PATHS) revalidatePath(path);
  return { ok: true, message: "Preset deleted." };
}

/** Convenience redirect used by the hub's "open section" buttons. */
/**
 * Deep-link helper: jump to one configuration area of the Super Admin Control
 * Center. Sections are query parameters on the real route
 * (`/admin/control-center?section=…`), never path segments, and an unknown
 * section falls back to the first area rather than to a 404.
 */
export async function gotoControlCenterSection(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const requested = String(formData.get("section") ?? "").trim();
  const section = CONFIG_NAMESPACES.find((ns) => ns.key === requested)?.key;
  redirect(section ? `/admin/control-center?section=${encodeURIComponent(section)}` : "/admin/control-center");
}
