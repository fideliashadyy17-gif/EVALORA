import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

/* ══ Formatting moved out ══════════════════════════════════════════════════
 * `fmtDate`, `fmtDateTime` and `money` used to live here with a hardcoded
 * "en-GB" locale for dates and "en-US" for amounts, which is why the Platform
 * Control Center's Presentation settings (formatting.date_format,
 * formatting.time_format, formatting.number_format) and
 * localization.default_timezone could not reach the screens that render them.
 *
 * They are deliberately gone rather than deprecated: a wrapper that ignores
 * configuration is a way for a new screen to be silently deaf to it. Format
 * with the resolved profile instead —
 *
 *   server component:  const fmt = await requestFormatter(org?.id ?? null);
 *                      fmt.date(value) · fmt.dateTime(value) · fmt.money(cents, currency)
 *   client component:  const fmt = useFormatting();
 *
 * src/lib/formatting.ts holds the pure formatters, src/lib/formattingRequest.ts
 * resolves which profile a request uses, and
 * scripts/test-formatting-rollout.mjs fails if a hardcoded formatter returns.
 */

export function mmss(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = h > 0 ? m % 60 : m;
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Codes are bearer credentials: never derive them from Math.random. */
export function genCode(len = 6) {
  if (!Number.isSafeInteger(len) || len < 1 || len > 128) throw new Error("Invalid code length.");
  // This alphabet has exactly 32 characters, so masking bytes to five bits
  // samples it uniformly without modulo bias. Web Crypto exists in modern
  // Node and secure browser contexts; fail closed if it is unavailable.
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => CODE_CHARS[value & 31]).join("");
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          // CSV quoting alone does not stop spreadsheet applications from interpreting
          // untrusted text as formulas. Preserve numeric values as numbers, but
          // force dangerous text (including whitespace/control prefixes) to text.
          let v = c == null ? "" : String(c);
          if (typeof c === "string" && (/^[\t\r\n]/.test(v) || /^[\s\uFEFF]*[=+\-@]/.test(v))) v = `'${v}`;
          return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(","),
    )
    .join("\n");
}
