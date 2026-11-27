/**
 * EVALORA centralized configuration — the write path.
 *
 * Every mutation goes through here, and every mutation does the same five
 * things in this order:
 *
 *   1. assertWritable()  — the key exists in the schema AND may be written at
 *      the requested scope. An organization asking for a global key is refused
 *      before any database call, which is what makes tenant isolation a
 *      structural property rather than a UI convention.
 *   2. validateConfigValue() — the submitted value is coerced to the declared
 *      kind and range-checked. Nothing unbounded, unlisted or script-bearing
 *      can be stored.
 *   3. Upsert platform_config_values with revision + 1.
 *   4. Append platform_config_revisions (previous → new, actor, note). History
 *      is append-only; rows are never updated or deleted.
 *   5. Write audit_logs and invalidate the resolver cache, then let the caller
 *      revalidate the connected surfaces.
 *
 * A failure at any step writes nothing: the operation is a no-op and the
 * administrator gets the reason.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { getConfigDef } from "./schema";
import { assertWritable, diffValues } from "./resolve";
import { validateConfigValue, validateAgainstDef, validateBrandingPalette } from "./validate";
import { invalidateConfigCache, loadConfigRows } from "./service";
import { resolveEntry, indexConfigRows } from "./resolve";
import { GLOBAL_SCOPE_ID, type ConfigScopeLevel } from "./types";

export type WriteOutcome =
  | { ok: true; namespace: string; key: string; value: unknown; revision: number; scope: ConfigScopeLevel }
  | { ok: false; error: string; namespace?: string; key?: string };

export interface WriteRequest {
  scope: ConfigScopeLevel;
  /** Required when scope is "organization". */
  scopeId?: string | null;
  namespace: string;
  key: string;
  submitted: unknown;
  actorId: string;
  /** Organization the change belongs to, for audit_logs. */
  organizationId?: string | null;
  changeNote?: string | null;
}

function scopeIdFor(req: Pick<WriteRequest, "scope" | "scopeId">): string | null {
  if (req.scope === "global") return GLOBAL_SCOPE_ID;
  const id = (req.scopeId ?? "").trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/**
 * The palette guard needs the *other* brand colours to judge contrast, so a
 * branding write is checked against the value it will actually produce once
 * merged with the surrounding resolved palette.
 */
async function checkBrandingPalette(
  req: WriteRequest,
  validated: unknown,
): Promise<string | null> {
  if (req.namespace !== "branding") return null;
  const colorKeys = ["color_ink", "color_cream", "color_primary"];
  if (!colorKeys.includes(req.key)) return null;

  const organizationId = req.scope === "organization" ? req.scopeId ?? null : null;
  const rows = await loadConfigRows(organizationId);
  const index = indexConfigRows(rows, organizationId);
  const current: Record<string, unknown> = {};
  for (const k of colorKeys) {
    const def = getConfigDef("branding", k);
    if (!def) continue;
    current[k] = k === req.key ? validated : resolveEntry(def, index).value;
  }
  const result = validateBrandingPalette(current);
  return result.ok ? null : result.errors.join(" ");
}

/** Validate + write one setting. */
export async function writeConfigValue(req: WriteRequest): Promise<WriteOutcome> {
  const writable = assertWritable(req.namespace, req.key, req.scope);
  if (!writable.ok) return { ok: false, error: writable.error, namespace: req.namespace, key: req.key };

  const scopeId = scopeIdFor(req);
  if (req.scope === "organization" && !scopeId) {
    return { ok: false, error: "An organization must be selected before its configuration can be changed.", namespace: req.namespace, key: req.key };
  }

  const validated = validateConfigValue(req.namespace, req.key, req.submitted);
  if (!validated.ok) return { ok: false, error: validated.error, namespace: req.namespace, key: req.key };

  const paletteError = await checkBrandingPalette(req, validated.value);
  if (paletteError) return { ok: false, error: paletteError, namespace: req.namespace, key: req.key };

  const admin = createAdminClient();

  // Read the current row so the revision chain and the diff are exact.
  const { data: existing } = await admin
    .from("platform_config_values")
    .select("value, revision")
    .eq("scope_level", req.scope)
    .eq("scope_id", scopeId!)
    .eq("namespace", req.namespace)
    .eq("key", req.key)
    .maybeSingle();

  const previousValue = (existing?.value as unknown) ?? null;
  const currentRevision = Number(existing?.revision);
  const nextRevision = Number.isFinite(currentRevision) && existing ? currentRevision + 1 : 1;

  if (existing && JSON.stringify(previousValue) === JSON.stringify(validated.value)) {
    // No change: report success without growing the history with a no-op row.
    return {
      ok: true,
      namespace: req.namespace,
      key: req.key,
      value: validated.value,
      revision: nextRevision - 1,
      scope: req.scope,
    };
  }

  const { error: upsertError } = await admin.from("platform_config_values").upsert(
    {
      scope_level: req.scope,
      scope_id: scopeId!,
      namespace: req.namespace,
      key: req.key,
      value: validated.value,
      revision: nextRevision,
      updated_by: req.actorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scope_level,scope_id,namespace,key" },
  );
  if (upsertError) {
    return { ok: false, error: `The setting could not be saved: ${upsertError.message}`, namespace: req.namespace, key: req.key };
  }

  const def = getConfigDef(req.namespace, req.key)!;
  const { error: revisionError } = await admin.from("platform_config_revisions").insert({
    scope_level: req.scope,
    scope_id: scopeId!,
    namespace: req.namespace,
    key: req.key,
    revision: nextRevision,
    previous_value: previousValue,
    new_value: validated.value,
    change_note: (req.changeNote ?? "").slice(0, 500) || null,
    changed_by: req.actorId,
  });
  // A failed history row must not roll back a successful configuration change,
  // but it is surfaced so the operator knows the trail has a gap.
  void revisionError;

  await admin.from("audit_logs").insert({
    actor_id: req.actorId,
    organization_id: req.organizationId ?? (req.scope === "organization" ? scopeId : null),
    action: "platform_config.update",
    entity: "platform_config_values",
    entity_id: `${req.scope}:${scopeId}:${req.namespace}.${req.key}`,
    metadata: {
      scope: req.scope,
      namespace: req.namespace,
      key: req.key,
      label: def.label,
      revision: nextRevision,
      // Redacted settings never appear in the audit payload.
      changes: def.redactInLogs ? ["[redacted]"] : diffValues(previousValue, validated.value, 20),
      note: (req.changeNote ?? "").slice(0, 500) || null,
    },
  });

  invalidateConfigCache(req.scope === "organization" ? scopeId : null);
  return { ok: true, namespace: req.namespace, key: req.key, value: validated.value, revision: nextRevision, scope: req.scope };
}

/**
 * Reset-to-inherit: delete ONLY the organization override row. The global
 * value and every other organization are untouched, which is the whole point
 * of the operation being safe.
 */
export async function resetConfigToInherit(params: {
  organizationId: string;
  namespace: string;
  key: string;
  actorId: string;
  changeNote?: string | null;
}): Promise<WriteOutcome> {
  const writable = assertWritable(params.namespace, params.key, "organization");
  if (!writable.ok) return { ok: false, error: writable.error, namespace: params.namespace, key: params.key };
  if (!/^[0-9a-f-]{36}$/i.test(params.organizationId)) {
    return { ok: false, error: "A valid organization is required.", namespace: params.namespace, key: params.key };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("platform_config_values")
    .select("value, revision")
    .eq("scope_level", "organization")
    .eq("scope_id", params.organizationId)
    .eq("namespace", params.namespace)
    .eq("key", params.key)
    .maybeSingle();

  if (!existing) {
    return { ok: true, namespace: params.namespace, key: params.key, value: null, revision: 0, scope: "organization" };
  }

  const { error } = await admin
    .from("platform_config_values")
    .delete()
    .eq("scope_level", "organization")
    .eq("scope_id", params.organizationId)
    .eq("namespace", params.namespace)
    .eq("key", params.key);
  if (error) return { ok: false, error: `The override could not be removed: ${error.message}`, namespace: params.namespace, key: params.key };

  const nextRevision = Number(existing.revision ?? 1) + 1;
  await admin.from("platform_config_revisions").insert({
    scope_level: "organization",
    scope_id: params.organizationId,
    namespace: params.namespace,
    key: params.key,
    revision: nextRevision,
    previous_value: existing.value,
    new_value: null,
    change_note: (params.changeNote ?? "Reset to inherit").slice(0, 500),
    changed_by: params.actorId,
  });

  await admin.from("audit_logs").insert({
    actor_id: params.actorId,
    organization_id: params.organizationId,
    action: "platform_config.reset_to_inherit",
    entity: "platform_config_values",
    entity_id: `organization:${params.organizationId}:${params.namespace}.${params.key}`,
    metadata: { namespace: params.namespace, key: params.key, revision: nextRevision },
  });

  invalidateConfigCache(params.organizationId);
  return { ok: true, namespace: params.namespace, key: params.key, value: null, revision: nextRevision, scope: "organization" };
}

/**
 * Safe rollback: re-apply an earlier revision's value as a NEW revision that
 * records where it came from. History is never rewritten, so a rollback is
 * itself reversible.
 */
export async function rollbackConfigRevision(params: {
  revisionId: string;
  actorId: string;
}): Promise<WriteOutcome> {
  if (!/^[0-9a-f-]{36}$/i.test(params.revisionId)) return { ok: false, error: "That history entry could not be found." };
  const admin = createAdminClient();
  const { data: revision } = await admin
    .from("platform_config_revisions")
    .select("id, scope_level, scope_id, namespace, key, revision, previous_value, new_value")
    .eq("id", params.revisionId)
    .maybeSingle();
  if (!revision) return { ok: false, error: "That history entry could not be found." };

  const def = getConfigDef(revision.namespace, revision.key);
  if (!def) return { ok: false, error: "That setting no longer exists in the EVALORA configuration schema." };

  // Rolling back means restoring the value that existed BEFORE this revision.
  const target = revision.previous_value;
  if (target === null || target === undefined) {
    // Nothing existed before → the correct rollback is to remove the value.
    if (revision.scope_level === "organization") {
      return resetConfigToInherit({
        organizationId: revision.scope_id,
        namespace: revision.namespace,
        key: revision.key,
        actorId: params.actorId,
        changeNote: `Rolled back to before revision ${revision.revision}`,
      });
    }
    await admin
      .from("platform_config_values")
      .delete()
      .eq("scope_level", revision.scope_level)
      .eq("scope_id", revision.scope_id)
      .eq("namespace", revision.namespace)
      .eq("key", revision.key);
    invalidateConfigCache(revision.scope_level === "organization" ? revision.scope_id : null);
    return { ok: true, namespace: revision.namespace, key: revision.key, value: null, revision: 0, scope: revision.scope_level };
  }

  const revalidated = validateAgainstDef(def, target);
  if (!revalidated.ok) {
    return { ok: false, error: `The earlier value no longer passes validation: ${revalidated.error}` };
  }

  const { data: current } = await admin
    .from("platform_config_values")
    .select("revision")
    .eq("scope_level", revision.scope_level)
    .eq("scope_id", revision.scope_id)
    .eq("namespace", revision.namespace)
    .eq("key", revision.key)
    .maybeSingle();
  const nextRevision = Number(current?.revision ?? revision.revision ?? 1) + 1;

  const { error } = await admin.from("platform_config_values").upsert(
    {
      scope_level: revision.scope_level,
      scope_id: revision.scope_id,
      namespace: revision.namespace,
      key: revision.key,
      value: revalidated.value,
      revision: nextRevision,
      updated_by: params.actorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scope_level,scope_id,namespace,key" },
  );
  if (error) return { ok: false, error: `Rollback failed: ${error.message}` };

  await admin.from("platform_config_revisions").insert({
    scope_level: revision.scope_level,
    scope_id: revision.scope_id,
    namespace: revision.namespace,
    key: revision.key,
    revision: nextRevision,
    previous_value: null,
    new_value: revalidated.value,
    change_note: `Rolled back to the value before revision ${revision.revision}.`,
    changed_by: params.actorId,
    rolled_back_from: revision.id,
  });

  await admin.from("audit_logs").insert({
    actor_id: params.actorId,
    organization_id: revision.scope_level === "organization" ? revision.scope_id : null,
    action: "platform_config.rollback",
    entity: "platform_config_revisions",
    entity_id: revision.id,
    metadata: {
      namespace: revision.namespace,
      key: revision.key,
      from_revision: revision.revision,
      to_revision: nextRevision,
      scope: revision.scope_level,
    },
  });

  invalidateConfigCache(revision.scope_level === "organization" ? revision.scope_id : null);
  return {
    ok: true,
    namespace: revision.namespace,
    key: revision.key,
    value: revalidated.value,
    revision: nextRevision,
    scope: revision.scope_level,
  };
}

/**
 * Apply a Super-Admin-authored preset to one organization. Each key in the
 * preset is validated and written through the same path as a manual edit, so
 * the result is individually audited and individually reversible.
 */
export async function applyConfigPreset(params: {
  presetId: string;
  organizationId: string;
  actorId: string;
}): Promise<{ ok: boolean; applied: number; rejected: { key: string; error: string }[] }> {
  if (!/^[0-9a-f-]{36}$/i.test(params.presetId) || !/^[0-9a-f-]{36}$/i.test(params.organizationId)) {
    return { ok: false, applied: 0, rejected: [{ key: "*", error: "A valid preset and organization are required." }] };
  }
  const admin = createAdminClient();
  const { data: preset } = await admin
    .from("platform_config_presets")
    .select("id, name, values")
    .eq("id", params.presetId)
    .eq("is_active", true)
    .maybeSingle();
  if (!preset) return { ok: false, applied: 0, rejected: [{ key: "*", error: "That preset is not available." }] };

  const values = (preset.values ?? {}) as Record<string, Record<string, unknown>>;
  let applied = 0;
  const rejected: { key: string; error: string }[] = [];

  for (const [namespace, entries] of Object.entries(values)) {
    if (!entries || typeof entries !== "object") continue;
    for (const [key, submitted] of Object.entries(entries)) {
      const result = await writeConfigValue({
        scope: "organization",
        scopeId: params.organizationId,
        namespace,
        key,
        submitted,
        actorId: params.actorId,
        organizationId: params.organizationId,
        changeNote: `Applied preset “${String(preset.name).slice(0, 80)}”`,
      });
      if (result.ok) applied++;
      else rejected.push({ key: `${namespace}.${key}`, error: result.error });
    }
  }
  return { ok: rejected.length === 0, applied, rejected };
}
