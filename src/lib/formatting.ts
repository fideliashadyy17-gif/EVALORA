/**
 * EVALORA configured formatting — dates, times and numbers.
 *
 * Before the Platform Control Center, `src/lib/utils.ts` formatted every date
 * with a literal `"en-GB"` and every amount with a literal `"en-US"`. Those
 * helpers are kept exactly as they are (277 call sites must not change
 * behaviour underneath a live examination), and this module provides the
 * configuration-driven equivalents that read the `formatting` and
 * `localization` namespaces.
 *
 * The pure functions take an explicit FormatConfig, so a caller resolves the
 * configuration once per request and passes it down — no ambient state, no
 * cross-request leakage, and the same code runs identically on the server and
 * in a client component that was handed the config as a prop.
 *
 * Pure module: no Next.js, no database, no React.
 */

export const DATE_FORMATS = ["dmy_short", "dmy_numeric", "mdy_numeric", "iso", "long"] as const;
export const TIME_FORMATS = ["24h", "12h"] as const;
export const NUMBER_FORMATS = ["en_gb", "fr_fr", "en_us"] as const;

export type DateFormat = (typeof DATE_FORMATS)[number];
export type TimeFormat = (typeof TIME_FORMATS)[number];
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export interface FormatConfig {
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  numberFormat: NumberFormat;
  /** IANA timezone. "device" leaves the value in the viewer's local zone. */
  timezone: string;
  /** Locale tag used for weekday/month names in the long date format. */
  localeTag: string;
}

/** The shipped behaviour — identical to the existing utils.ts helpers. */
export const DEFAULT_FORMAT_CONFIG: FormatConfig = {
  dateFormat: "dmy_short",
  timeFormat: "24h",
  numberFormat: "en_gb",
  timezone: "device",
  localeTag: "en-GB",
};

/** Locale tags per configured interface language (mirrors i18n/config.ts). */
export const LOCALE_TAG_BY_CODE: Record<string, string> = {
  en: "en-GB",
  fr: "fr-FR",
  es: "es-ES",
};

/** Number-format locale per configured number format. */
export const NUMBER_LOCALE: Record<NumberFormat, string> = {
  en_gb: "en-GB",
  fr_fr: "fr-FR",
  en_us: "en-US",
};

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const v = String(value ?? "").trim();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** True when the timezone name is one this runtime can actually resolve. */
export function isResolvableTimezone(timezone: unknown): boolean {
  const tz = String(timezone ?? "").trim();
  if (!tz || tz === "device") return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a FormatConfig from resolved configuration values. Anything absent or
 * invalid falls back to the shipped behaviour, so a half-configured platform
 * still formats correctly.
 */
export function buildFormatConfig(input: {
  date_format?: unknown;
  time_format?: unknown;
  number_format?: unknown;
  default_timezone?: unknown;
  default_locale?: unknown;
}): FormatConfig {
  const localeCode = oneOf(input.default_locale, ["en", "fr", "es"], "en");
  const timezone = isResolvableTimezone(input.default_timezone)
    ? String(input.default_timezone).trim()
    : "device";
  return {
    dateFormat: oneOf(input.date_format, DATE_FORMATS, DEFAULT_FORMAT_CONFIG.dateFormat),
    timeFormat: oneOf(input.time_format, TIME_FORMATS, DEFAULT_FORMAT_CONFIG.timeFormat),
    numberFormat: oneOf(input.number_format, NUMBER_FORMATS, DEFAULT_FORMAT_CONFIG.numberFormat),
    timezone,
    localeTag: LOCALE_TAG_BY_CODE[localeCode] ?? "en-GB",
  };
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parts(date: Date, cfg: FormatConfig) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: cfg.timezone === "device" ? undefined : cfg.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: cfg.timeFormat === "12h",
    weekday: "long",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  return map;
}

/** Format a date according to the configured date format. */
export function formatDate(value: string | number | Date | null | undefined, cfg: FormatConfig = DEFAULT_FORMAT_CONFIG): string {
  const date = toDate(value);
  if (!date) return "—";
  const p = parts(date, cfg);
  const { year, month, day } = p;
  const monthName = new Intl.DateTimeFormat(cfg.localeTag, {
    month: "short",
    timeZone: cfg.timezone === "device" ? undefined : cfg.timezone,
  }).format(date);
  const monthLong = new Intl.DateTimeFormat(cfg.localeTag, {
    month: "long",
    timeZone: cfg.timezone === "device" ? undefined : cfg.timezone,
  }).format(date);
  const weekdayLocal = new Intl.DateTimeFormat(cfg.localeTag, {
    weekday: "long",
    timeZone: cfg.timezone === "device" ? undefined : cfg.timezone,
  }).format(date);

  switch (cfg.dateFormat) {
    case "dmy_numeric":
      return `${day}/${month}/${year}`;
    case "mdy_numeric":
      return `${month}/${day}/${year}`;
    case "iso":
      return `${year}-${month}-${day}`;
    case "long":
      return `${weekdayLocal}, ${Number(day)} ${monthLong} ${year}`;
    case "dmy_short":
    default:
      return `${Number(day)} ${monthName} ${year}`;
  }
}

/** Format a time according to the configured clock. */
export function formatTime(value: string | number | Date | null | undefined, cfg: FormatConfig = DEFAULT_FORMAT_CONFIG): string {
  const date = toDate(value);
  if (!date) return "—";
  const p = parts(date, cfg);
  const hour = p.hour ?? "00";
  const minute = p.minute ?? "00";
  if (cfg.timeFormat === "12h") {
    const dayPeriod = (p.dayPeriod ?? "").toLowerCase();
    const h = Number(hour) % 12 === 0 ? 12 : Number(hour) % 12;
    return `${h}:${minute}${dayPeriod ? ` ${dayPeriod}` : ""}`;
  }
  return `${hour}:${minute}`;
}

/** Format a date and time together — the configured replacement for fmtDateTime. */
export function formatDateTime(value: string | number | Date | null | undefined, cfg: FormatConfig = DEFAULT_FORMAT_CONFIG): string {
  const date = toDate(value);
  if (!date) return "—";
  return `${formatDate(date, cfg)}, ${formatTime(date, cfg)}`;
}

/** Format a number with the configured separators. */
export function formatNumber(value: unknown, cfg: FormatConfig = DEFAULT_FORMAT_CONFIG, fractionDigits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(NUMBER_LOCALE[cfg.numberFormat] ?? "en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

/** Format a percentage with the configured separators. */
export function formatPercent(value: unknown, cfg: FormatConfig = DEFAULT_FORMAT_CONFIG, fractionDigits = 1): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(NUMBER_LOCALE[cfg.numberFormat] ?? "en-GB", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(n / 100);
}

/** Format a minor-unit amount (cents) in a currency with the configured separators. */
export function formatMoney(cents: unknown, currency = "USD", cfg: FormatConfig = DEFAULT_FORMAT_CONFIG): string {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(NUMBER_LOCALE[cfg.numberFormat] ?? "en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: n % 100 === 0 ? 0 : 2,
  }).format(n / 100);
}

/**
 * Apply the configured rounding rule to a computed mark. Never applied to a
 * stored raw mark — only when a total, average or converted grade is presented.
 */
export function applyRounding(value: number, rule: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return n;
  switch (rule) {
    case "half_up_0":
      return Math.round(n);
    case "half_up_1":
      return Math.round(n * 10) / 10;
    case "bankers_1": {
      const scaled = n * 10;
      const floor = Math.floor(scaled);
      const diff = scaled - floor;
      let rounded: number;
      if (diff > 0.5) rounded = floor + 1;
      else if (diff < 0.5) rounded = floor;
      else rounded = floor % 2 === 0 ? floor : floor + 1;
      return rounded / 10;
    }
    case "none":
    default:
      return n;
  }
}

/** Human description of a FormatConfig, used by the Control Center preview. */
export function describeFormatConfig(cfg: FormatConfig): string[] {
  const sample = new Date("2026-11-26T14:30:00Z");
  return [
    `Date: ${formatDate(sample, cfg)}`,
    `Time: ${formatTime(sample, cfg)}`,
    `Date and time: ${formatDateTime(sample, cfg)}`,
    `Number: ${formatNumber(1234.5, cfg)}`,
    `Percentage: ${formatPercent(87.5, cfg)}`,
    `Timezone: ${cfg.timezone === "device" ? "viewer's device" : cfg.timezone}`,
  ];
}
