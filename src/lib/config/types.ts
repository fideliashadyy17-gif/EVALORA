/**
 * EVALORA centralized configuration — types.
 *
 * Pure types only: no Next.js, no database, no React. This file is compiled
 * standalone by the test harness (scripts/test-platform-config-architecture.mjs),
 * so it must not import anything outside src/lib/config.
 */

/** Where a configuration value lives. */
export type ConfigScopeLevel = "global" | "organization";

/** Sentinel scope_id used for global rows (matches the migration). */
export const GLOBAL_SCOPE_ID = "00000000-0000-0000-0000-000000000000";

/**
 * The UI/editor kind of a setting. `validate.ts` maps each kind to a concrete
 * runtime check, so a value that reaches the database has already been proven
 * to be the declared type — the dashboard can never store an arbitrary shape.
 */
export type ConfigFieldKind =
  | "string"
  | "text"
  | "email"
  | "url"
  | "image"
  | "color"
  | "boolean"
  | "integer"
  | "number"
  | "enum"
  | "multi_enum"
  | "string_list"
  | "timezone"
  | "announcement_list";

/** A single declared configuration key. */
export interface ConfigKeyDef {
  /** Grouping bucket, e.g. "branding". Persisted as platform_config_values.namespace. */
  namespace: ConfigNamespace;
  /** Stable key inside the namespace, e.g. "platform_name". */
  key: string;
  /** Human label shown in the Control Center. */
  label: string;
  /**
   * Plain-language explanation for a non-technical administrator: what this
   * setting does and what visibly changes when it is saved.
   */
  description: string;
  kind: ConfigFieldKind;
  /**
   * Scopes this key may be written at. Every key is readable at organization
   * scope (that is what inheritance means); this lists where it may be SET.
   */
  writableScopes: ConfigScopeLevel[];
  /** Value used when no row exists at any scope. */
  default: unknown;
  /** Enum/multi-enum choices. */
  options?: readonly { value: string; label: string; hint?: string }[];
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  placeholder?: string;
  /** UI grouping inside a namespace section. */
  group: string;
  /**
   * Module keys from src/lib/modules.ts MODULE_CATALOG that this setting
   * affects. Used by the Control Center to show real dependencies and to
   * revalidate the right surfaces after a save.
   */
  connectedModules?: readonly string[];
  /**
   * Concrete application surfaces that read this value. Shown to the
   * administrator so a setting can never look operational when it is not.
   */
  consumedBy: readonly string[];
  /**
   * `operational` settings change live behaviour and require an explicit
   * confirmation step in the UI before they are written.
   */
  sensitivity?: "normal" | "operational";
  /** Extra contextual help / warning text rendered under the field. */
  help?: string;
  /**
   * True when the value is a secret or personal-data bearing setting that must
   * never be echoed into logs, revisions previews or exports.
   */
  redactInLogs?: boolean;
  /** Display order inside the group. */
  order?: number;
}

export type ConfigNamespace =
  | "branding"
  | "localization"
  | "formatting"
  | "platform_behavior"
  | "assessment"
  | "examination"
  | "question_studio"
  | "proctoring"
  | "notifications"
  | "org_identity";

/** Provenance of one resolved value — why it has the value it has. */
export type ConfigValueSource = "default" | "global" | "organization";

export interface ResolvedConfigEntry<T = unknown> {
  value: T;
  source: ConfigValueSource;
  /** Revision of the row the value came from, or 0 for a schema default. */
  revision: number;
  /** True when an organization row exists and differs from the inherited value. */
  isOverride: boolean;
}

/** Result of resolving a scope: values plus per-key provenance. */
export type ResolvedConfig<T = Record<string, unknown>> = {
  values: T;
  provenance: Record<string, ResolvedConfigEntry>;
};

/** A stored row from platform_config_values. */
export interface ConfigValueRow {
  scope_level: ConfigScopeLevel;
  scope_id: string;
  namespace: string;
  key: string;
  value: unknown;
  revision: number;
  updated_by: string | null;
  updated_at: string;
}

/** A stored row from platform_config_revisions. */
export interface ConfigRevisionRow {
  id: string;
  scope_level: ConfigScopeLevel;
  scope_id: string;
  namespace: string;
  key: string;
  revision: number;
  previous_value: unknown;
  new_value: unknown;
  change_note: string | null;
  changed_by: string | null;
  changed_at: string;
  rolled_back_from: string | null;
}

/** Outcome of validating one submitted value. */
export type ValidationResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };
