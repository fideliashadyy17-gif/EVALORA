/**
 * EVALORA centralized configuration — server service.
 *
 * This is the ONE place application modules read configuration from. It
 * replaces the pattern the audit found (a value stored in the database while
 * the module kept using a hardcoded constant) with a single resolved read:
 *
 *     const { defaultPassPercent } = await getAssessmentConfig(orgId);
 *
 * Guarantees:
 *   • Reads use the service-role client after the caller has already been
 *     authorized, exactly as src/lib/platform.ts does for feature flags — so
 *     RLS is never the only thing standing between a tenant and another
 *     tenant's configuration, and a global value is always visible.
 *   • A short-lived cache keeps the hot path (root layout, exam render) to one
 *     extra query at most, and every write invalidates it.
 *   • If the configuration tables are unreachable or the migration has not
 *     been applied yet, resolution degrades to the declared schema defaults
 *     and the application keeps its current behaviour. Configuration is an
 *     enhancement layer; it is never a new failure mode.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { CONFIG_SCHEMA } from "./schema";
import {
  indexConfigRows,
  resolveEntry,
  resolveNamespace,
  resolveNamespaceProvenance,
} from "./resolve";
import { GLOBAL_SCOPE_ID, type ConfigValueRow, type ResolvedConfigEntry } from "./types";

/** How long a resolved scope may be served from memory. Writes clear it. */
const CONFIG_CACHE_TTL_MS = 15_000;

interface CacheEntry {
  at: number;
  rows: ConfigValueRow[];
}

const cache = new Map<string, CacheEntry>();

function cacheKey(organizationId?: string | null): string {
  return organizationId ? `org:${organizationId}` : "global";
}

/** Drop cached rows so the next read sees a change immediately. */
export function invalidateConfigCache(organizationId?: string | null): void {
  cache.delete(cacheKey(organizationId));
  // A global change is inherited by every organization, so clear those too.
  if (!organizationId) {
    for (const key of [...cache.keys()]) if (key.startsWith("org:")) cache.delete(key);
  }
}

/**
 * Load the rows needed to resolve one scope: every global row plus that
 * organization's rows. One query, no N+1.
 */
export async function loadConfigRows(organizationId?: string | null): Promise<ConfigValueRow[]> {
  const key = cacheKey(organizationId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CONFIG_CACHE_TTL_MS) return hit.rows;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_config_values")
      .select("scope_level, scope_id, namespace, key, value, revision, updated_by, updated_at")
      .or(
        organizationId
          ? `scope_id.eq.${GLOBAL_SCOPE_ID},scope_id.eq.${organizationId}`
          : `scope_id.eq.${GLOBAL_SCOPE_ID}`,
      );
    if (error) throw error;
    const rows = ((data ?? []) as unknown as ConfigValueRow[]).filter(
      (r) => typeof r.namespace === "string" && typeof r.key === "string",
    );
    cache.set(key, { at: Date.now(), rows });
    return rows;
  } catch {
    // Table missing, network stall or RLS refusal → behave as if nothing were
    // configured. Every consumer therefore still sees a valid default.
    return [];
  }
}

/** Resolve one namespace for a scope, typed by the caller. */
export async function getNamespaceConfig<T extends object>(
  namespace: string,
  organizationId?: string | null,
): Promise<T> {
  const rows = await loadConfigRows(organizationId);
  return resolveNamespace<T>(rows, namespace, organizationId);
}

/** Provenance for one namespace — which layer supplied each value. */
export async function getNamespaceProvenance(
  namespace: string,
  organizationId?: string | null,
): Promise<Record<string, ResolvedConfigEntry>> {
  const rows = await loadConfigRows(organizationId);
  return resolveNamespaceProvenance(rows, namespace, organizationId);
}

/** Resolve everything at once (used by the Control Center overview). */
export async function getFullResolution(organizationId?: string | null): Promise<{
  values: Record<string, unknown>;
  provenance: Record<string, ResolvedConfigEntry>;
}> {
  const rows = await loadConfigRows(organizationId);
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

// ─────────────────────── typed namespace accessors ─────────────────────────
// These are the functions application modules import. Each returns exactly the
// keys its namespace declares, so a consumer cannot read a setting that does
// not exist and silently receive `undefined`.

export interface BrandingConfig {
  platform_name: string;
  tagline: string;
  description: string;
  support_email: string;
  logo_icon: string;
  logo_stacked: string;
  logo_horizontal_light: string;
  logo_horizontal_dark: string;
  favicon: string;
  color_primary: string;
  color_primary_deep: string;
  color_accent: string;
  color_cream: string;
  color_ink: string;
  font_display: string;
  font_sans: string;
  default_theme: string;
}

export async function getBrandingConfig(organizationId?: string | null): Promise<BrandingConfig> {
  return getNamespaceConfig<BrandingConfig>("branding", organizationId);
}

export interface LocalizationConfig {
  default_locale: string;
  supported_locales: string[];
  default_timezone: string;
}

export async function getLocalizationConfig(organizationId?: string | null): Promise<LocalizationConfig> {
  return getNamespaceConfig<LocalizationConfig>("localization", organizationId);
}

export interface FormattingConfig {
  date_format: string;
  time_format: string;
  number_format: string;
  default_academic_year: string;
}

export async function getFormattingConfig(organizationId?: string | null): Promise<FormattingConfig> {
  return getNamespaceConfig<FormattingConfig>("formatting", organizationId);
}

export interface PlatformBehaviorConfig {
  maintenance_mode: boolean;
  maintenance_message: string;
  global_announcements: unknown[];
  default_landing_page: string;
  registration_mode: string;
}

export async function getPlatformBehaviorConfig(): Promise<PlatformBehaviorConfig> {
  return getNamespaceConfig<PlatformBehaviorConfig>("platform_behavior", null);
}

export interface AssessmentConfig {
  default_pass_percent: number;
  negative_marking_enabled: boolean;
  negative_marking_penalty: number;
  numeric_tolerance_percent: number;
  rounding_rule: string;
  result_link_default_days: number;
  require_validation_before_publication: boolean;
}

export async function getAssessmentConfig(organizationId?: string | null): Promise<AssessmentConfig> {
  return getNamespaceConfig<AssessmentConfig>("assessment", organizationId);
}

export interface ExaminationDefaultsConfig {
  default_duration_minutes: number;
  default_show_marks: boolean;
  default_randomize_questions: boolean;
  default_randomize_options: boolean;
  default_allow_backward_navigation: boolean;
  default_access_code_required: boolean;
  default_instructions: string;
}

export async function getExaminationDefaults(organizationId?: string | null): Promise<ExaminationDefaultsConfig> {
  return getNamespaceConfig<ExaminationDefaultsConfig>("examination", organizationId);
}

export interface QuestionStudioConfig {
  enabled_question_types: string[];
  difficulty_levels: string[];
  numbering_style: string;
  design_card_layout: string;
  design_corner_radius: number;
  design_spacing: number;
  design_padding: number;
  design_option_layout: string;
  design_image_position: string;
  design_image_max_width_percent: number;
  design_font_size_px: number;
}

export async function getQuestionStudioConfig(organizationId?: string | null): Promise<QuestionStudioConfig> {
  return getNamespaceConfig<QuestionStudioConfig>("question_studio", organizationId);
}

export interface ProctoringConfig {
  require_camera_check: boolean;
  require_microphone_check: boolean;
  require_browser_check: boolean;
  max_tab_switch_warnings: number;
  incident_alert_threshold: number;
  evidence_review_required: boolean;
  continuous_recording_enabled: boolean;
}

export async function getProctoringConfig(organizationId?: string | null): Promise<ProctoringConfig> {
  return getNamespaceConfig<ProctoringConfig>("proctoring", organizationId);
}

export interface NotificationsConfig {
  in_app_enabled: boolean;
  sender_name: string;
  email_delivery_available: boolean;
}

export async function getNotificationsConfig(organizationId?: string | null): Promise<NotificationsConfig> {
  return getNamespaceConfig<NotificationsConfig>("notifications", organizationId);
}

export interface OrgIdentityConfig {
  display_name: string | null;
  contact_email: string | null;
  accent_color: string | null;
  paper_show_logo: boolean;
  paper_footer: string | null;
}

export async function getOrgIdentityConfig(organizationId: string): Promise<OrgIdentityConfig> {
  return getNamespaceConfig<OrgIdentityConfig>("org_identity", organizationId);
}

/**
 * Namespace health report for the Control Center: how many settings exist,
 * how many are configured at each layer, and which are structurally read-only.
 * Derived from real rows, never from a claim in the UI.
 */
export async function getConfigCoverage(organizationId?: string | null) {
  const rows = await loadConfigRows(organizationId);
  const index = indexConfigRows(rows, organizationId);
  let fromDefault = 0;
  let fromGlobal = 0;
  let fromOrg = 0;
  const byNamespace: Record<string, { total: number; configured: number; overridden: number }> = {};
  for (const def of CONFIG_SCHEMA) {
    const entry = resolveEntry(def, index);
    if (entry.source === "default") fromDefault++;
    else if (entry.source === "global") fromGlobal++;
    else fromOrg++;
    const bucket = (byNamespace[def.namespace] ??= { total: 0, configured: 0, overridden: 0 });
    bucket.total++;
    if (entry.source !== "default") bucket.configured++;
    if (entry.source === "organization") bucket.overridden++;
  }
  return {
    total: CONFIG_SCHEMA.length,
    fromDefault,
    fromGlobal,
    fromOrganization: fromOrg,
    byNamespace,
  };
}
