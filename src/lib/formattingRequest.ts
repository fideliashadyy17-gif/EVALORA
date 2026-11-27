/**
 * Per-request resolution of the configured formatting profile.
 *
 * `src/lib/formatting.ts` is pure: it formats a value against a FormatConfig
 * somebody else resolved. This module is the only place that decides *which*
 * configuration a render uses, and it is server-only because that decision
 * needs the configuration store.
 *
 * Scoping rule — the organization whose profile is used is always one the
 * caller already resolved server-side:
 *
 *   • an organization workspace page passes its own `activeOrg(ctx)?.id`,
 *     which comes from the session and never from the URL;
 *   • the Super Admin console passes `null` and renders with the platform-wide
 *     profile, because its tables mix tenants and one tenant's date format must
 *     not be applied to another tenant's rows;
 *   • a public candidate surface may pass the organization of the examination
 *     row it has already loaded and authorized.
 *
 * A malformed organization id resolves to the platform-wide profile rather than
 * widening the scope, matching the config store's own tenant rule.
 *
 * Both exports are wrapped in React's `cache()`, so a page tree that formats
 * values in several components resolves the configuration once per request —
 * and because `cache()` is request-scoped, no value can carry over between two
 * concurrent requests for two different tenants.
 */
import "server-only";
import { cache } from "react";
import { getFormattingConfig, getLocalizationConfig } from "@/lib/config/service";
import { getRequestLocale } from "@/lib/i18n/server";
import {
  DEFAULT_FORMAT_CONFIG,
  buildFormatConfig,
  formatterFrom,
  type FormatConfig,
  type Formatter,
} from "@/lib/formatting";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only a real UUID scopes a lookup; anything else means "platform-wide". */
export function normalizeFormatScope(organizationId?: string | null): string | null {
  const id = String(organizationId ?? "").trim();
  return UUID_RE.test(id) ? id.toLowerCase() : null;
}

/**
 * The FormatConfig for this request. Never throws: an unreachable configuration
 * store renders with the shipped defaults, exactly as the platform did before
 * the Control Center existed.
 */
export const requestFormatConfig = cache(async (organizationId?: string | null): Promise<FormatConfig> => {
  const scope = normalizeFormatScope(organizationId);
  try {
    // The viewer's own interface language decides month and weekday names, so a
    // French-speaking administrator reads "26 nov. 2026" whatever the configured
    // platform default is. The configured default only applies to a visitor with
    // no preference — which is precisely what getRequestLocale() already resolves.
    const [formatting, localization, locale] = await Promise.all([
      getFormattingConfig(scope).catch(() => null),
      getLocalizationConfig(scope).catch(() => null),
      getRequestLocale().catch(() => null),
    ]);
    return buildFormatConfig({
      date_format: formatting?.date_format,
      time_format: formatting?.time_format,
      number_format: formatting?.number_format,
      default_timezone: localization?.default_timezone,
      default_locale: locale ?? localization?.default_locale,
    });
  } catch {
    return { ...DEFAULT_FORMAT_CONFIG };
  }
});

/**
 * The bound formatter for this request. Resolve it once at the top of a server
 * component, then format synchronously — including inside `.map()` callbacks:
 *
 *   const fmt = await requestFormatter(org?.id ?? null);
 *   …
 *   <td>{fmt.dateTime(row.created_at)}</td>
 *   <td>{fmt.money(row.amount_cents, row.currency)}</td>
 */
export const requestFormatter = cache(
  async (organizationId?: string | null): Promise<Formatter> =>
    formatterFrom(await requestFormatConfig(organizationId)),
);
