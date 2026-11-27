import "server-only";

/**
 * Organization identity — the org_identity configuration namespace, resolved.
 *
 * An organization's registered row in `organizations` is the structural record
 * (slug, legal name, type, plan). This module layers the *presentational*
 * identity an organization configures for itself in the Control Center on top
 * of it, so that:
 *
 *   • examination papers, certificates and reports can carry a display name
 *     that differs from the registered one (for example a short name, or the
 *     name with its campus) without renaming the organization;
 *   • a contact address for candidates can be set per organization instead of
 *     falling back to the platform support address;
 *   • an accent colour and a paper footer can be applied to that
 *     organization's surfaces only.
 *
 * Every value is optional. When nothing is configured the registered
 * organization row wins, so an organization that has never opened the Control
 * Center behaves exactly as it did before this module existed.
 *
 * Server-only by design: identity resolution reads configuration through the
 * service-role client, and a browser must never be able to ask for another
 * organization's settings.
 */
import { createAdminClient } from "@/lib/supabase/server";
import { getOrgIdentityConfig } from "@/lib/config/service";

export interface OrganizationIdentity {
  /** The organization's registered legal name — never null. */
  registeredName: string;
  /** Configured display name, or the registered name when unset. */
  displayName: string;
  /** True when the organization chose its own display name. */
  hasCustomDisplayName: boolean;
  /** Configured candidate-facing contact address, or null. */
  contactEmail: string | null;
  /** Configured accent colour as a hex string, or null. */
  accentColor: string | null;
  /** Whether examination papers show the organization logo by default. */
  paperShowLogo: boolean;
  /** Footer line for examination papers, or null. */
  paperFooter: string | null;
  /** The organization's stored logo URL, or null. */
  logoUrl: string | null;
  slug: string;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Resolve an organization's presentational identity.
 *
 * Fails soft in every direction: if the organizations row cannot be read the
 * caller still receives a usable identity built from the fallback name, and if
 * configuration storage is unreachable the registered values are used. An
 * identity lookup must never be the reason a paper fails to render.
 */
export async function resolveOrganizationIdentity(
  organizationId: string,
  fallbackName = "EVALORA",
): Promise<OrganizationIdentity> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) {
    return emptyIdentity(fallbackName);
  }

  const admin = createAdminClient();
  const [{ data: row }, config] = await Promise.all([
    admin
      .from("organizations")
      .select("name, slug, logo_url")
      .eq("id", organizationId)
      .maybeSingle(),
    getOrgIdentityConfig(organizationId).catch(() => null),
  ]);

  const registeredName = (row?.name as string | null)?.trim() || fallbackName;
  const configuredName = (config?.display_name ?? "").trim();
  const accent = typeof config?.accent_color === "string" && HEX_COLOR.test(config.accent_color.trim())
    ? config.accent_color.trim().toLowerCase()
    : null;
  const footer = (config?.paper_footer ?? "").trim() || null;

  return {
    registeredName,
    displayName: configuredName || registeredName,
    hasCustomDisplayName: Boolean(configuredName),
    contactEmail: (config?.contact_email ?? "").trim() || null,
    accentColor: accent,
    paperShowLogo: config?.paper_show_logo !== false,
    paperFooter: footer,
    logoUrl: (row?.logo_url as string | null) ?? null,
    slug: (row?.slug as string | null) ?? "",
  };
}

function emptyIdentity(name: string): OrganizationIdentity {
  return {
    registeredName: name,
    displayName: name,
    hasCustomDisplayName: false,
    contactEmail: null,
    accentColor: null,
    paperShowLogo: true,
    paperFooter: null,
    logoUrl: null,
    slug: "",
  };
}

/**
 * Apply an organization's identity to an already-resolved examination paper
 * header. The header resolver keeps its existing precedence (examination
 * settings → quiz settings → paper template) for every authored field; this
 * only supplies the organization-level identity that no template carries:
 * display name, logo visibility default and footer text.
 *
 * A template that explicitly sets `show_logo` still wins — changing the
 * organization's default must not restyle a paper that was already built.
 */
export function applyIdentityToPaperHeader<T extends {
  organizationName: string;
  organizationLogoUrl: string | null;
  showLogo: boolean;
}>(
  header: T,
  identity: OrganizationIdentity,
  options?: { templateControlsLogo?: boolean },
): T & { footer: string | null; accentColor: string | null } {
  return {
    ...header,
    organizationName: identity.displayName || header.organizationName,
    organizationLogoUrl: header.organizationLogoUrl ?? identity.logoUrl,
    showLogo: options?.templateControlsLogo ? header.showLogo : identity.paperShowLogo && header.showLogo,
    footer: identity.paperFooter,
    accentColor: identity.accentColor,
  };
}
