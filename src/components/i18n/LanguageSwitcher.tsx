"use client";

/**
 * The interface language selector. Native-language labels (English /
 * Français / Español), works on desktop, tablet and mobile, and persists
 * the preference in the `evalora_locale` cookie without touching the
 * session — switching never logs the user out.
 *
 * This switches the APPLICATION INTERFACE only. Examination content keeps
 * its authored language (see lib/examLanguage).
 */
import { useI18n } from "./I18nProvider";
import { LOCALE_NAMES, type Locale } from "@/lib/i18n/config";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({
  variant = "light",
  className,
  compact = false,
}: {
  variant?: "light" | "dark";
  className?: string;
  compact?: boolean;
}) {
  // The offered languages come from localization.supported_locales, resolved
  // on the server and provided through the i18n context — so an administrator
  // can withdraw a language without a redeploy.
  const { locale, setLocale, t, supportedLocales } = useI18n();

  return (
    <label
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium transition",
        variant === "dark"
          ? "border-white/20 text-evergreen-100 hover:bg-white/10"
          : "border-evergreen-900/15 bg-white text-evergreen-950 hover:bg-evergreen-50",
        compact ? "px-2 py-1.5" : "px-2.5 py-2",
        className,
      )}
      title={t("i18n.interfaceLanguage")}
    >
      <Globe aria-hidden className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      <span className="sr-only">{t("i18n.interfaceLanguage")}</span>
      <select
        aria-label={t("i18n.interfaceLanguage")}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className={cn(
          "cursor-pointer bg-transparent outline-none",
          variant === "dark" ? "text-inherit" : "text-inherit",
        )}
      >
        {supportedLocales.map((code) => (
          <option key={code} value={code} lang={code} className="text-evergreen-950">
            {LOCALE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
