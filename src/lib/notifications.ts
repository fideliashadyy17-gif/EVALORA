/**
 * Notification presentation helpers shared by the bell popover and the
 * notifications page. Pure functions only — no data access, no React — so the
 * same rules can be unit-tested without a database.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Short, human relative timestamp for a notification. Anything older than a
 * week falls back to an absolute date so long-lived items stay readable.
 * Returns an empty string for an unparseable value rather than "Invalid Date".
 *
 * `date` renders that absolute fallback, and it is a parameter so the CALLER's
 * configured profile decides the format — the notification bell passes its
 * workspace formatter. This module stays import-free on purpose (a test harness
 * compiles it on its own), so the fallback below is the shipped "1 Oct 2026"
 * this function has always produced.
 */
export function formatRelativeTime(
  iso: string,
  now: number = Date.now(),
  date?: (value: string | number | Date) => string,
): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  const diff = now - time;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `${minutes} min ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (diff < 7 * DAY) {
    const days = Math.floor(diff / DAY);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  if (date) return date(time);
  return new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Badge text: 1–99 verbatim, then 99+ so the badge cannot break the layout. */
export function unreadBadgeLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return count > 99 ? "99+" : String(Math.floor(count));
}

/** Accessible label for the bell: the count is announced, not only drawn. */
export function bellAriaLabel(count: number): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  if (n === 0) return "Notifications, no unread notifications";
  return `Notifications, ${n} unread notification${n === 1 ? "" : "s"}`;
}
