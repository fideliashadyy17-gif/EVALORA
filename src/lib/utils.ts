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

export function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
