import { BrandProvider } from "@/components/platform/BrandProvider";
import { AnnouncementBanner } from "@/components/platform/AnnouncementBanner";
import { FormattingProvider } from "@/components/formatting/FormattingProvider";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getEffectiveBrand } from "@/lib/brandConfig";
import { getPlatformBehaviorConfig } from "@/lib/config/service";
import { requestFormatConfig } from "@/lib/formattingRequest";
import { brandCssVariables } from "@/lib/config/palette";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale, getSupportedLocales, primeDefaultLocaleCache } from "@/lib/i18n/server";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/public-sans";
import "katex/dist/katex.min.css";
import type { Metadata } from "next";
import "./globals.css";

/**
 * Root layout.
 *
 * This is where the Platform Control Center's global configuration becomes
 * visible. Everything below is resolved from the centralized configuration
 * store (with the compiled-in identity in src/lib/brand.ts as the fallback),
 * so a Super Admin change takes effect on the live interface without a code
 * change or a redeploy:
 *
 *   • branding.*      → document metadata, favicon, and the CSS design-token
 *                       overrides that recolour and retype every component
 *                       (the design system is expressed as @theme custom
 *                       properties in globals.css, so overriding the variable
 *                       names re-themes the whole app at once)
 *   • branding.default_theme     → <html data-theme>
 *   • platform_behavior.global_announcements → banner on every page
 *   • localization.default_locale → shell language (never examination content)
 *   • formatting.* + localization.default_timezone → the date, time and number
 *     profile every screen renders with. The platform-wide profile is mounted
 *     here; an organization workspace mounts its own nested provider, and a
 *     server component resolves the same profile through
 *     src/lib/formattingRequest.ts.
 *
 * Maintenance mode is enforced earlier, in Edge middleware, because that is
 * the only layer that knows the pathname before a page renders.
 */

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getEffectiveBrand();
  return {
    title: {
      default: `${brand.name} — ${brand.tagline}`,
      template: `%s · ${brand.name}`,
    },
    description: brand.description,
    icons: {
      icon: brand.logo.favicon,
      apple: brand.logo.favicon,
    },
    openGraph: {
      title: brand.name,
      description: brand.description,
      type: "website",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Interface locale — the language of the application shell only. It is
  // resolved from the persistent preference cookie (authenticated or not),
  // then the account preference, then the configured platform default, and it
  // NEVER alters examination content, which keeps its authored language.
  // Prime the configured default-locale cache first: getRequestLocale() falls
  // back to it when a visitor has no cookie and no stored preference, and doing
  // it here keeps that fallback free of an extra round trip per request.
  await primeDefaultLocaleCache();
  const [locale, supportedLocales, brand, behavior, formatCfg] = await Promise.all([
    getRequestLocale(),
    getSupportedLocales(),
    getEffectiveBrand(),
    getPlatformBehaviorConfig().catch(() => null),
    // Platform-wide formatting profile for client components. Organization
    // workspaces nest their own provider with the school's profile.
    requestFormatConfig(null).catch(() => null),
  ]);
  const dict = getDictionary(locale);
  const themeCss = brandCssVariables(brand);

  return (
    <html lang={locale} data-theme={brand.theme} suppressHydrationWarning>
      <head>
        {themeCss ? (
          // Design-token overrides. Same variable names as the @theme block in
          // globals.css, so every existing utility class follows the
          // configured palette and typography. Emitted only when something is
          // actually configured — an uncustomized deployment ships no override.
          <style id="evalora-brand-tokens" dangerouslySetInnerHTML={{ __html: themeCss }} />
        ) : null}
      </head>
      <body>
        <BrandProvider brand={brand}>
          <AnnouncementBanner announcements={behavior?.global_announcements ?? []} />
          <I18nProvider locale={locale} dict={dict} supportedLocales={supportedLocales}>
            <FormattingProvider cfg={formatCfg}>{children}</FormattingProvider>
          </I18nProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
