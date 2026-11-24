"use client";

/**
 * Client-side interface-locale context. Holds the locale resolved on the
 * server (from the persistent preference cookie) plus its dictionary, and
 * exposes a bound `t()` plus a `setLocale()` that persists the choice for
 * anonymous and authenticated users alike — switching never touches the
 * session, so nobody is logged out.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_NAMES,
  LOCALE_TAGS,
  type Locale,
} from "@/lib/i18n/config";
import { saveLocalePreference } from "@/lib/i18n/actions";
import { translate, type Dictionary, type TranslateParams } from "@/lib/i18n";
import { formatDate, formatDateTime, formatNumber, formatTime } from "@/lib/i18n";

interface I18nContextValue {
  locale: Locale;
  dict: Dictionary;
  t: (key: string, params?: TranslateParams) => string;
  setLocale: (locale: Locale) => void;
  localeNames: Record<Locale, string>;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: Date | string | number) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: ReactNode;
}) {
  const router = useRouter();

  const setLocale = useCallback(
    (next: Locale) => {
      // Persistent preference for everyone: a first-party cookie with a
      // one-year lifetime. The session cookie is untouched — switching the
      // interface language never signs anybody out.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
      document.documentElement.lang = next;
      // Signed-in users also get the choice stored on their PROFILE so it
      // follows the account across devices (best-effort; the cookie alone
      // already persists for this device). The authored language of any
      // assessment is never read or written here.
      void saveLocalePreference(next);
      router.refresh();
    },
    [router],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dict,
      t: (key, params) => translate(dict, key, params),
      setLocale,
      localeNames: LOCALE_NAMES,
      formatNumber: (v, o) => formatNumber(locale, v, o),
      formatDate: (v, o) => formatDate(locale, v, o),
      formatTime: (v, o) => formatTime(locale, v, o),
      formatDateTime: (v) => formatDateTime(locale, v),
    }),
    [locale, dict, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fail soft outside the provider (isolated component tests, storybook-style
    // harnesses): English defaults keep the tree rendering instead of crashing.
    return {
      locale: "en",
      dict: {} as Dictionary,
      t: (key) => key,
      setLocale: () => undefined,
      localeNames: LOCALE_NAMES,
      formatNumber: (v) => String(v),
      formatDate: (v) => String(v),
      formatTime: (v) => String(v),
      formatDateTime: (v) => String(v),
    };
  }
  return ctx;
}

/** BCP-47 tag for Intl helpers exposed through the provider. */
export function localeTag(locale: Locale): string {
  return LOCALE_TAGS[locale];
}
