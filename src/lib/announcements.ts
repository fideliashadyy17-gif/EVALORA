/**
 * Global announcements — pure selection logic.
 *
 * Announcements are configured in the Platform Control Center
 * (platform_behavior.global_announcements) and rendered by the root layout, so
 * they appear on every page including the candidate examination surfaces. The
 * decision "is this announcement visible right now?" is a pure function so it
 * can be unit-tested without a server and so the client and server always
 * agree — a disagreement would be a hydration mismatch.
 *
 * Pure module: no Next.js, no database, no React.
 */
import type { Announcement } from "./config/validate";

export const ANNOUNCEMENT_TONES = ["info", "success", "warning", "critical"] as const;
export type AnnouncementTone = (typeof ANNOUNCEMENT_TONES)[number];

/** Tailwind classes per tone — kept here so the banner cannot drift. */
export const ANNOUNCEMENT_TONE_CLASSES: Record<AnnouncementTone, string> = {
  info: "bg-evergreen-50 text-evergreen-900 ring-evergreen-600/25",
  success: "bg-evergreen-50 text-evergreen-900 ring-evergreen-600/35",
  warning: "bg-gold-50 text-evergreen-950 ring-gold-600/40",
  critical: "bg-red-50 text-red-900 ring-red-600/30",
};

/** Coerce a stored value into a well-formed announcement, or null. */
export function parseAnnouncement(raw: unknown): Announcement | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  const title = typeof e.title === "string" ? e.title.trim().slice(0, 120) : "";
  const body = typeof e.body === "string" ? e.body.trim().slice(0, 600) : "";
  if (!title && !body) return null;
  const toneRaw = typeof e.tone === "string" ? e.tone : "info";
  const tone = (ANNOUNCEMENT_TONES as readonly string[]).includes(toneRaw)
    ? (toneRaw as AnnouncementTone)
    : "info";
  const href =
    typeof e.href === "string" && /^(\/[\w./\-+%?=&#@]*|https:\/\/[\w.-]+(?:\/[\w./\-+%?=&#@]*)?)$/.test(e.href.trim())
      ? e.href.trim().slice(0, 300)
      : null;
  return {
    id: typeof e.id === "string" && e.id.trim() ? e.id.trim().slice(0, 64) : `ann-${title.slice(0, 12)}`,
    title: title || body.slice(0, 120),
    body,
    tone,
    href,
    enabled: e.enabled !== false,
    starts_at: toIso(e.starts_at),
    ends_at: toIso(e.ends_at),
  };
}

function toIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * The announcements that should be visible at `now`: enabled, started, not
 * expired, and parseable. Order is preserved from the configuration.
 */
export function activeAnnouncements(raw: unknown, now: number = Date.now()): Announcement[] {
  if (!Array.isArray(raw)) return [];
  const out: Announcement[] = [];
  for (const item of raw.slice(0, 12)) {
    const parsed = parseAnnouncement(item);
    if (!parsed || !parsed.enabled) continue;
    if (parsed.starts_at && Date.parse(parsed.starts_at) > now) continue;
    if (parsed.ends_at && Date.parse(parsed.ends_at) <= now) continue;
    out.push(parsed);
  }
  return out;
}

/**
 * How many announcements are configured but currently hidden, and why. The
 * Control Center shows this so an administrator who scheduled an announcement
 * for next week can see it is accepted and waiting, not lost.
 */
export function announcementStatus(
  raw: unknown,
  now: number = Date.now(),
): { total: number; active: number; scheduled: number; expired: number; disabled: number } {
  const list = Array.isArray(raw) ? raw : [];
  let total = 0;
  let active = 0;
  let scheduled = 0;
  let expired = 0;
  let disabled = 0;
  for (const item of list) {
    const parsed = parseAnnouncement(item);
    if (!parsed) continue;
    total++;
    if (!parsed.enabled) {
      disabled++;
      continue;
    }
    if (parsed.starts_at && Date.parse(parsed.starts_at) > now) {
      scheduled++;
      continue;
    }
    if (parsed.ends_at && Date.parse(parsed.ends_at) <= now) {
      expired++;
      continue;
    }
    active++;
  }
  return { total, active, scheduled, expired, disabled };
}
