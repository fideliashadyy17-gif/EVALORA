/**
 * EVALORA centralized configuration — validation.
 *
 * Every value written through the Platform Control Center passes through
 * validateConfigValue() first. The rules are deliberately strict and closed:
 *
 *   • Unknown namespace/key → rejected. The dashboard cannot invent settings.
 *   • Wrong kind → rejected, with a message a non-technical administrator can
 *     act on.
 *   • Out-of-range numbers, over-long strings, unlisted enum values, malformed
 *     colours/emails/URLs → rejected.
 *   • Structured lists (announcements) are validated element by element and
 *     normalised to a bounded shape, so no unbounded or script-bearing payload
 *     can be stored.
 *
 * Nothing here evaluates an expression, runs a template, or accepts code.
 * Pure module: no Next.js, no database, no React.
 */
import { getConfigDef, configId } from "./schema";
import type { ConfigKeyDef, ValidationResult } from "./types";

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;
// A stored path or link. Two rules matter here:
//   • `//host/path` is REFUSED — a protocol-relative URL silently loads content
//     from somebody else's origin (a logo, an announcement target), which is how
//     a configuration field becomes a tracking pixel or a redirect off-platform;
//   • anything that is not an https:// URL or a root-relative path is refused,
//     so `javascript:`, `data:` and `file:` can never reach an href or a src.
const SAFE_PATH_OR_URL = /^(?:\/(?!\/)[\w./\-+%?=&#@]*|https:\/\/[\w.-]+(?:\/[\w./\-+%?=&#@]*)?)$/;
const TIMEZONE_RE = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2}$/;

/** Announcement entry as stored (normalised, bounded, markup-free). */
export interface Announcement {
  id: string;
  title: string;
  body: string;
  tone: "info" | "success" | "warning" | "critical";
  href: string | null;
  enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

const ANNOUNCEMENT_TONES = ["info", "success", "warning", "critical"] as const;

/** Strip control characters and collapse whitespace — used on every free text. */
function cleanText(input: string, maxLength: number): string {
  return input
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

function ok(value: unknown): ValidationResult {
  return { ok: true, value };
}

/** Coerce a submitted string to the declared kind and validate it. */
export function validateConfigValue(
  namespace: string,
  key: string,
  submitted: unknown,
): ValidationResult {
  const def = getConfigDef(namespace, key);
  if (!def) return fail(`“${configId(namespace, key)}” is not a declared EVALORA setting.`);
  if (!def.writableScopes.length) {
    return fail(`“${def.label}” is reported for transparency only and cannot be changed from the dashboard.`);
  }
  return validateAgainstDef(def, submitted);
}

/** Validate against an already-resolved definition (used by presets/rollback). */
export function validateAgainstDef(def: ConfigKeyDef, submitted: unknown): ValidationResult {
  const maxLen = def.maxLength ?? 2000;

  switch (def.kind) {
    case "boolean": {
      if (typeof submitted === "boolean") return ok(submitted);
      if (submitted === "true" || submitted === "on" || submitted === "1" || submitted === 1) return ok(true);
      if (submitted === "false" || submitted === "off" || submitted === "0" || submitted === 0 || submitted === "" || submitted == null) return ok(false);
      return fail(`${def.label} must be on or off.`);
    }

    case "integer":
    case "number": {
      const raw = typeof submitted === "string" ? submitted.trim() : submitted;
      if (raw === "" || raw == null) return ok(def.default);
      const n = Number(raw);
      if (!Number.isFinite(n)) return fail(`${def.label} must be a number.`);
      if (def.kind === "integer" && !Number.isInteger(n)) return fail(`${def.label} must be a whole number.`);
      if (def.min !== undefined && n < def.min) return fail(`${def.label} must be at least ${def.min}.`);
      if (def.max !== undefined && n > def.max) return fail(`${def.label} must be at most ${def.max}.`);
      return ok(n);
    }

    case "enum": {
      if (submitted === "" || submitted == null) return ok(def.default);
      const v = String(submitted);
      const allowed = (def.options ?? []).map((o) => o.value);
      if (!allowed.includes(v)) return fail(`${def.label} must be one of: ${allowed.join(", ")}.`);
      return ok(v);
    }

    case "multi_enum": {
      const list = toStringArray(submitted);
      if (!list) return fail(`${def.label} must be a list of selectable values.`);
      const allowed = new Set((def.options ?? []).map((o) => o.value));
      const out: string[] = [];
      for (const item of list) {
        if (!allowed.has(item)) return fail(`${def.label}: “${item}” is not an available choice.`);
        if (!out.includes(item)) out.push(item);
      }
      if (!out.length) return fail(`${def.label} needs at least one selection.`);
      return ok(out);
    }

    case "string_list": {
      const list = toStringArray(submitted);
      if (!list) return fail(`${def.label} must be a list of short labels.`);
      const out: string[] = [];
      for (const item of list) {
        const v = cleanText(item, 60);
        if (!v) continue;
        const lower = v.toLowerCase();
        if (!out.some((e) => e.toLowerCase() === lower)) out.push(v);
      }
      if (!out.length) return fail(`${def.label} needs at least one entry.`);
      if (out.length > 24) return fail(`${def.label} accepts at most 24 entries.`);
      return ok(out);
    }

    case "timezone": {
      if (submitted === "" || submitted == null) return ok(def.default);
      const v = String(submitted).trim();
      const allowed = (def.options ?? []).map((o) => o.value);
      if (allowed.includes(v)) return ok(v);
      // Capability probe, not presentation: accept any IANA name the runtime can
      // actually resolve, so an administrator is not limited to the curated list.
      if (!TIMEZONE_RE.test(v) || v.length > 64) return fail(`${def.label} must be a valid timezone such as Africa/Porto-Novo.`);
      try {
        new Intl.DateTimeFormat("en-GB", { timeZone: v }).format(new Date());
      } catch {
        return fail(`“${v}” is not a timezone this platform can resolve.`);
      }
      return ok(v);
    }

    case "color": {
      if (submitted === "" || submitted == null) return ok(def.default);
      const v = String(submitted).trim();
      if (!HEX_COLOR.test(v)) return fail(`${def.label} must be a hex colour such as #0a5c36.`);
      return ok(v.toLowerCase());
    }

    case "email": {
      if (submitted === "" || submitted == null) return ok(def.default ?? null);
      const v = String(submitted).trim().toLowerCase();
      if (v.length > maxLen) return fail(`${def.label} is too long (maximum ${maxLen} characters).`);
      if (!EMAIL_RE.test(v)) return fail(`${def.label} must be a valid email address.`);
      return ok(v);
    }

    case "url":
    case "image": {
      if (submitted === "" || submitted == null) return ok(def.default ?? null);
      const v = String(submitted).trim();
      if (v.length > maxLen) return fail(`${def.label} is too long (maximum ${maxLen} characters).`);
      if (!SAFE_PATH_OR_URL.test(v)) {
        return fail(`${def.label} must be a path starting with / or an https:// URL, with no spaces or script markup.`);
      }
      return ok(v);
    }

    case "text":
    case "string": {
      if (submitted == null) return ok(def.default ?? null);
      const v = cleanText(String(submitted), maxLen);
      if (!v) {
        // An empty required string falls back to the declared default rather
        // than storing "", so a cleared field can never blank a live surface.
        if (def.default != null && def.default !== "") return ok(def.default);
        if (def.writableScopes.includes("organization") && def.default === null) return ok(null);
        return fail(`${def.label} cannot be empty.`);
      }
      if (def.kind === "string" && v.length > maxLen) return fail(`${def.label} is too long (maximum ${maxLen} characters).`);
      return ok(v);
    }

    case "announcement_list":
      return validateAnnouncements(submitted);

    default:
      return fail(`${def.label} has an unsupported field kind.`);
  }
}

/** Accept an array, a JSON string, or newline/comma separated text. */
function toStringArray(submitted: unknown): string[] | null {
  if (Array.isArray(submitted)) return submitted.map((v) => String(v)).filter((v) => v.trim() !== "");
  if (typeof submitted === "string") {
    const text = submitted.trim();
    if (!text) return [];
    if (text.startsWith("[")) {
      try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed.map((v) => String(v)).filter((v) => v.trim() !== "") : null;
      } catch {
        return null;
      }
    }
    return text.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
  }
  return null;
}

/** Validate and normalise the global announcement list. */
export function validateAnnouncements(submitted: unknown): ValidationResult {
  let raw: unknown = submitted;
  if (typeof submitted === "string") {
    const text = submitted.trim();
    if (!text) return ok([]);
    try {
      raw = JSON.parse(text);
    } catch {
      return fail("Announcements must be valid JSON or edited through the announcement builder.");
    }
  }
  if (!Array.isArray(raw)) return fail("Announcements must be a list.");
  if (raw.length > 12) return fail("At most 12 announcements may be active at once.");

  const out: Announcement[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return fail(`Announcement ${i + 1} is not an object.`);
    }
    const e = entry as Record<string, unknown>;
    const title = cleanText(String(e.title ?? ""), 120);
    const body = cleanText(String(e.body ?? ""), 600);
    if (!title && !body) continue; // silently drop an empty row
    if (!title) return fail(`Announcement ${i + 1} needs a title.`);

    const toneRaw = String(e.tone ?? "info");
    const tone = (ANNOUNCEMENT_TONES as readonly string[]).includes(toneRaw)
      ? (toneRaw as Announcement["tone"])
      : "info";

    let href: string | null = null;
    const hrefRaw = typeof e.href === "string" ? e.href.trim() : "";
    if (hrefRaw) {
      if (!SAFE_PATH_OR_URL.test(hrefRaw) || hrefRaw.length > 300) {
        return fail(`Announcement ${i + 1} has an invalid link. Use a path starting with / or an https:// URL.`);
      }
      href = hrefRaw;
    }

    const starts = toIsoOrNull(e.starts_at);
    const ends = toIsoOrNull(e.ends_at);
    if (starts && ends && ends <= starts) {
      return fail(`Announcement ${i + 1} ends before it starts.`);
    }

    out.push({
      id: cleanText(String(e.id ?? ""), 64) || `ann-${Date.now().toString(36)}-${i}`,
      title,
      body,
      tone,
      href,
      enabled: e.enabled !== false,
      starts_at: starts,
      ends_at: ends,
    });
  }
  return ok(out);
}

function toIsoOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ───────────────────────── palette contrast guard ──────────────────────────

function srgbChannel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.2 relative luminance of a #rgb / #rrggbb colour. */
export function relativeLuminance(hex: string): number {
  let h = String(hex).trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return 1;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

/** WCAG contrast ratio between two hex colours (1 … 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Reject a brand palette that would make the interface unreadable. Body text
 * must reach WCAG AA (4.5:1) against the canvas; the primary brand colour is
 * used for large text, links and UI components, so it must reach 3:1.
 */
export function validateBrandingPalette(values: {
  color_ink?: unknown;
  color_cream?: unknown;
  color_primary?: unknown;
}): { ok: boolean; errors: string[]; ratios: Record<string, number> } {
  const errors: string[] = [];
  const ratios: Record<string, number> = {};
  const ink = typeof values.color_ink === "string" ? values.color_ink : "#16241c";
  const cream = typeof values.color_cream === "string" ? values.color_cream : "#f5f3ec";
  const primary = typeof values.color_primary === "string" ? values.color_primary : "#0a5c36";

  const textRatio = contrastRatio(ink, cream);
  ratios.text_on_canvas = Number(textRatio.toFixed(2));
  if (textRatio < 4.5) {
    errors.push(
      `Text colour ${ink} on canvas ${cream} gives ${textRatio.toFixed(2)}:1 — below the 4.5:1 WCAG AA minimum for body text.`,
    );
  }

  const primaryRatio = contrastRatio(primary, cream);
  ratios.primary_on_canvas = Number(primaryRatio.toFixed(2));
  if (primaryRatio < 3) {
    errors.push(
      `Primary colour ${primary} on canvas ${cream} gives ${primaryRatio.toFixed(2)}:1 — below the 3:1 minimum for large text and interface components.`,
    );
  }
  return { ok: errors.length === 0, errors, ratios };
}
