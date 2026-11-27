/**
 * EVALORA centralized configuration — resolution.
 *
 * One function decides what a setting's effective value is, and can always
 * explain why:
 *
 *     organization override  →  global value  →  schema default
 *
 * Because provenance travels with the value, the Control Center can show
 * "Inherited from platform default" versus "Customized for Oak International
 * School" and offer a safe Reset-to-inherit that deletes only the override
 * row. Nothing here touches the database, so the whole inheritance model is
 * unit-testable without a server.
 *
 * Pure module: no Next.js, no database, no React.
 */
import { CONFIG_SCHEMA, getConfigDef } from "./schema";
import { GLOBAL_SCOPE_ID, type ConfigKeyDef, type ConfigScopeLevel, type ConfigValueRow, type ResolvedConfigEntry } from "./types";

/** Rows keyed for O(1) lookup during resolution. */
export interface ConfigRowIndex {
  global: Map<string, ConfigValueRow>;
  organization: Map<string, ConfigValueRow>;
}

/** Build a lookup index from a flat list of stored rows. */
export function indexConfigRows(rows: readonly ConfigValueRow[], organizationId?: string | null): ConfigRowIndex {
  const global = new Map<string, ConfigValueRow>();
  const organization = new Map<string, ConfigValueRow>();
  for (const row of rows) {
    const id = `${row.namespace}.${row.key}`;
    if (row.scope_level === "global" || row.scope_id === GLOBAL_SCOPE_ID) global.set(id, row);
    else if (organizationId && row.scope_id === organizationId) organization.set(id, row);
  }
  return { global, organization };
}

/** Resolve one declared setting against the indexed rows. */
export function resolveEntry(def: ConfigKeyDef, index: ConfigRowIndex): ResolvedConfigEntry {
  const id = `${def.namespace}.${def.key}`;
  const orgRow = index.organization.get(id);
  if (orgRow) {
    const globalRow = index.global.get(id);
    const inherited = globalRow ? globalRow.value : def.default;
    return {
      value: orgRow.value,
      source: "organization",
      revision: orgRow.revision ?? 1,
      // A stored override that happens to equal the inherited value is still
      // an override: Reset-to-inherit must remain available and meaningful.
      isOverride: !deepEqual(orgRow.value, inherited),
    };
  }
  const globalRow = index.global.get(id);
  if (globalRow) {
    return { value: globalRow.value, source: "global", revision: globalRow.revision ?? 1, isOverride: false };
  }
  return { value: def.default, source: "default", revision: 0, isOverride: false };
}

/**
 * Resolve every declared setting for a scope. Pass `organizationId` to layer
 * that organization's overrides above the global values; omit it for the
 * platform-wide view a Super Admin sees.
 */
export function resolveAll(
  rows: readonly ConfigValueRow[],
  organizationId?: string | null,
): { values: Record<string, unknown>; provenance: Record<string, ResolvedConfigEntry> } {
  const index = indexConfigRows(rows, organizationId);
  const values: Record<string, unknown> = {};
  const provenance: Record<string, ResolvedConfigEntry> = {};
  for (const def of CONFIG_SCHEMA) {
    const entry = resolveEntry(def, index);
    values[`${def.namespace}.${def.key}`] = entry.value;
    provenance[`${def.namespace}.${def.key}`] = entry;
  }
  return { values, provenance };
}

/** Resolve one namespace into a flat `{ key: value }` object. */
export function resolveNamespace<T extends object>(
  rows: readonly ConfigValueRow[],
  namespace: string,
  organizationId?: string | null,
): T {
  const index = indexConfigRows(rows, organizationId);
  const out: Record<string, unknown> = {};
  for (const def of CONFIG_SCHEMA) {
    if (def.namespace !== namespace) continue;
    out[def.key] = resolveEntry(def, index).value;
  }
  return out as T;
}

/** Provenance for one namespace — drives the inherited/customized badges. */
export function resolveNamespaceProvenance(
  rows: readonly ConfigValueRow[],
  namespace: string,
  organizationId?: string | null,
): Record<string, ResolvedConfigEntry> {
  const index = indexConfigRows(rows, organizationId);
  const out: Record<string, ResolvedConfigEntry> = {};
  for (const def of CONFIG_SCHEMA) {
    if (def.namespace !== namespace) continue;
    out[def.key] = resolveEntry(def, index);
  }
  return out;
}

/**
 * Human sentence explaining where a value came from. Used verbatim in the
 * Control Center so an administrator is never guessing.
 */
export function describeSource(entry: ResolvedConfigEntry, organizationName?: string | null): string {
  if (entry.source === "default") return "Using the built-in EVALORA default — nothing has been configured.";
  if (entry.source === "global") return "Set at platform level by Super Admin.";
  return organizationName
    ? `Customized for ${organizationName} — overrides the platform value.`
    : "Customized for this organization — overrides the platform value.";
}

/**
 * What "Reset to inherit" will do, stated before it happens. Returns null when
 * there is nothing to reset (the setting is already inherited).
 */
export function describeReset(def: ConfigKeyDef, entry: ResolvedConfigEntry): string | null {
  if (entry.source !== "organization") return null;
  const fallsBackTo = def.writableScopes.includes("global")
    ? "the platform-wide value set by Super Admin"
    : "the built-in EVALORA default";
  return `Removes this organization's override so the setting falls back to ${fallsBackTo}. The platform value is not changed.`;
}

/** Structured-equality helper small enough to keep this module dependency-free. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual(ao[k], bo[k]));
  }
  return false;
}

/**
 * Diff two values into a flat list of human-readable changes, used by the
 * configuration history view. Bounded so a large structured value cannot
 * produce an unbounded diff.
 */
export function diffValues(previous: unknown, next: unknown, limit = 40): string[] {
  const out: string[] = [];
  const walk = (path: string, a: unknown, b: unknown) => {
    if (out.length >= limit) return;
    if (deepEqual(a, b)) return;
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
      for (const k of keys) {
        walk(path ? `${path}.${k}` : k, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]);
        if (out.length >= limit) return;
      }
      return;
    }
    out.push(`${path || "value"}: ${preview(a)} → ${preview(b)}`);
  };
  walk("", previous, next);
  if (out.length >= limit) out.push(`… and more (diff truncated at ${limit} changes)`);
  return out;
}

function preview(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "object") {
    const text = JSON.stringify(value);
    return text.length > 60 ? `${text.slice(0, 57)}…` : text;
  }
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/**
 * Guard used by every write path: a key that is not declared, or is declared
 * but not writable at the requested scope, is refused before any database
 * call. This is what makes "an organization cannot change global platform
 * configuration" a structural property rather than a UI convention.
 */
export function assertWritable(
  namespace: string,
  key: string,
  scope: ConfigScopeLevel,
): { ok: true; def: ConfigKeyDef } | { ok: false; error: string } {
  const def = getConfigDef(namespace, key);
  if (!def) return { ok: false, error: `“${namespace}.${key}” is not a declared EVALORA setting.` };
  if (!def.writableScopes.includes(scope)) {
    return {
      ok: false,
      error:
        scope === "organization"
          ? `“${def.label}” is platform-wide configuration and cannot be changed by an organization.`
          : `“${def.label}” is reported for transparency only and cannot be edited.`,
    };
  }
  return { ok: true, def };
}
