/**
 * The effective brand — what the interface is actually rendered with.
 *
 * Before the Platform Control Center, `src/lib/brand.ts` was a compile-time
 * constant: renaming the platform or changing a colour meant a code change and
 * a redeploy. This module keeps BRAND as the documented fallback and layers
 * the `branding` configuration namespace on top, so a Super Admin change in
 * the Control Center reaches the root layout metadata, the CSS design-token
 * overrides, the logo component, the site chrome and the public legal pages.
 *
 * Repair note (audit §3.2): `platform_settings.support_email` was editable but
 * read only by the page that displayed it, while every customer surface used
 * the hardcoded BRAND.supportEmail. `branding.support_email` is now the single
 * authoritative source and those surfaces read it.
 *
 * If configuration storage is unreachable, resolution degrades to BRAND and
 * the site renders exactly as it did before — branding is never a new failure
 * mode on a candidate's examination page.
 */
import "server-only";
import { BRAND } from "./brand";
import { getBrandingConfig, getNamespaceProvenance } from "./config/service";
import { fontStack, mix, type EffectiveBrand } from "./config/palette";

/** Build the effective brand from resolved configuration values. */
export function buildEffectiveBrand(
  values: Partial<Record<keyof ReturnType<typeof rawShape>, unknown>>,
  customized: boolean,
): EffectiveBrand {
  const v = rawShape(values);
  const ink = v.color_ink;
  const cream = v.color_cream;
  return {
    name: v.platform_name,
    tagline: v.tagline,
    description: v.description,
    supportEmail: v.support_email,
    logo: {
      icon: v.logo_icon,
      horizontalLight: v.logo_horizontal_light,
      horizontalDark: v.logo_horizontal_dark,
      stacked: v.logo_stacked,
      favicon: v.favicon,
    },
    colors: {
      primary: v.color_primary,
      primaryDeep: v.color_primary_deep,
      accent: v.color_accent,
      cream,
      ink,
      // ink-soft is derived, not configured: 34% of the way from ink to the
      // canvas reproduces the shipped #46564c from #16241c on #f5f3ec.
      inkSoft: mix(ink, cream, 0.34),
      paper: "#ffffff",
    },
    fonts: {
      display: fontStack(v.font_display),
      sans: fontStack(v.font_sans),
    },
    theme: v.default_theme,
    customized,
  };
}

/** Coerce resolved values, falling back to BRAND for anything missing. */
function rawShape(values: Record<string, unknown>) {
  const s = (key: keyof typeof FALLBACKS) => {
    const raw = values[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    return FALLBACKS[key];
  };
  return {
    platform_name: s("platform_name"),
    tagline: s("tagline"),
    description: s("description"),
    support_email: s("support_email"),
    logo_icon: s("logo_icon"),
    logo_stacked: s("logo_stacked"),
    logo_horizontal_light: s("logo_horizontal_light"),
    logo_horizontal_dark: s("logo_horizontal_dark"),
    favicon: s("favicon"),
    color_primary: s("color_primary"),
    color_primary_deep: s("color_primary_deep"),
    color_accent: s("color_accent"),
    color_cream: s("color_cream"),
    color_ink: s("color_ink"),
    font_display: s("font_display"),
    font_sans: s("font_sans"),
    default_theme: s("default_theme"),
  };
}

/** Code fallbacks — the shipped EVALORA identity. */
const FALLBACKS = {
  platform_name: BRAND.name,
  tagline: BRAND.tagline,
  description: BRAND.description,
  support_email: BRAND.supportEmail,
  logo_icon: BRAND.logo.icon,
  logo_stacked: BRAND.logo.stacked,
  logo_horizontal_light: BRAND.logo.horizontalLight,
  logo_horizontal_dark: BRAND.logo.horizontalDark,
  favicon: BRAND.logo.favicon,
  color_primary: BRAND.colors.primary,
  color_primary_deep: BRAND.colors.primaryDeep,
  color_accent: BRAND.colors.accent,
  color_cream: BRAND.colors.cream,
  color_ink: BRAND.colors.ink,
  font_display: "fraunces",
  font_sans: "public_sans",
  default_theme: "light",
} as const;

/**
 * Resolve the effective brand for the current request. `customized` is true
 * only when at least one branding value actually came from the database, so
 * an unconfigured deployment emits no CSS overrides at all.
 */
export async function getEffectiveBrand(organizationId?: string | null): Promise<EffectiveBrand> {
  try {
    const [values, provenance] = await Promise.all([
      getBrandingConfig(organizationId),
      getNamespaceProvenance("branding", organizationId),
    ]);
    const customized = Object.values(provenance).some((entry) => entry.source !== "default");
    return buildEffectiveBrand(values as unknown as Record<string, unknown>, customized);
  } catch {
    return buildEffectiveBrand({}, false);
  }
}
