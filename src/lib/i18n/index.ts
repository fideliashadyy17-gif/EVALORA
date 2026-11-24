/**
 * Centralized translation runtime.
 *
 * One dictionary per locale, resolved on the server from the preference
 * cookie and shipped to the client through I18nProvider. Keys are dotted
 * paths into the dictionary; values support `{param}` interpolation and
 * `{count, plural}` style selection via `one`/`other` objects.
 *
 * Interface dictionaries NEVER contain examination content — questions,
 * options and instructions come from the database in their authored
 * language (lib/examLanguage) and pass through untouched.
 */
import { LOCALE_TAGS, type Locale } from "./config";
import { en, type Dictionary } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import { fr } from "./dictionaries/fr";

const DICTIONARIES: Record<Locale, Dictionary> = { en, fr, es };

export type { Dictionary };
export * from "./config";

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? en;
}

export type TranslateParams = Record<string, string | number>;

function lookup(dict: unknown, path: string): unknown {
  let node: unknown = dict;
  for (const part of path.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return node;
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/**
 * Translate a dotted key. When the resolved value is a plural object and
 * `count` is supplied, English-style one/other selection applies (French and
 * Spanish share the same two-form rule for the counts EVALORA renders).
 */
export function translate(dict: Dictionary, key: string, params?: TranslateParams): string {
  const value = lookup(dict, key);
  if (typeof value === "string") return interpolate(value, params);
  if (value && typeof value === "object" && params && typeof params.count === "number") {
    const forms = value as Record<string, string>;
    const form = params.count === 1 && forms.one ? "one" : "other";
    if (typeof forms[form] === "string") return interpolate(forms[form], params);
    const fallback = forms.other ?? Object.values(forms)[0];
    if (typeof fallback === "string") return interpolate(fallback, params);
  }
  // Fail soft: an unknown key renders the key itself rather than crashing a page.
  return key;
}

export type Translator = (key: string, params?: TranslateParams) => string;

/** Build a bound translator for a locale (server components, loaders, tests). */
export function makeTranslator(locale: Locale): { t: Translator; dict: Dictionary } {
  const dict = getDictionary(locale);
  return { t: (key, params) => translate(dict, key, params), dict };
}

/* ── Locale-aware formatting ─────────────────────────────────────────────── */

export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale], options).format(value);
}

export function formatDate(locale: Locale, value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], options ?? { dateStyle: "medium" }).format(date);
}

export function formatTime(locale: Locale, value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], options ?? { timeStyle: "short" }).format(date);
}

export function formatDateTime(locale: Locale, value: Date | string | number): string {
  return formatDate(locale, value, { dateStyle: "medium", timeStyle: "short" });
}
