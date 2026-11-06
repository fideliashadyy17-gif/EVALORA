/**
 * Checks for the floating notifications popover.
 *
 * Two layers:
 *   1. the pure presentation helpers in src/lib/notifications.ts are executed;
 *   2. the component and the workspace chrome are inspected for the required
 *      behaviours (open/close, outside click, Escape, mark one, mark all, empty
 *      state, reuse of the existing notifications table).
 *
 * Run: node scripts/test-notification-popover.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const outDir = "/tmp/evalora-notification-test";
execSync(
  `npx tsc src/lib/notifications.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --esModuleInterop --skipLibCheck --moduleResolution node`,
  { stdio: "inherit" },
);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`, { stdio: "inherit" });

const require = createRequire(import.meta.url);
const lib = require(`${outDir}/lib/notifications.js`);

const bell = readFileSync("src/components/dashboard/NotificationBell.tsx", "utf8");
const chrome = readFileSync("src/components/dashboard/DashboardChrome.tsx", "utf8");
const adminShell = readFileSync("src/app/admin/AdminShell.tsx", "utf8");

let passed = 0;
const ok = (name, condition, detail) => {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

/* ── Relative timestamps ── */
const now = Date.parse("2026-11-06T12:00:00Z");
ok("seconds old reads as just now", lib.formatRelativeTime("2026-11-06T11:59:30Z", now) === "just now");
ok("minutes are counted", lib.formatRelativeTime("2026-11-06T11:45:00Z", now) === "15 min ago");
ok("one hour is singular", lib.formatRelativeTime("2026-11-06T11:00:00Z", now) === "1 hour ago");
ok("hours are plural", lib.formatRelativeTime("2026-11-06T09:00:00Z", now) === "3 hours ago");
ok("one day is singular", lib.formatRelativeTime("2026-11-05T12:00:00Z", now) === "1 day ago");
ok("days are plural", lib.formatRelativeTime("2026-11-02T12:00:00Z", now) === "4 days ago");
ok(
  "older items fall back to an absolute date",
  lib.formatRelativeTime("2026-10-01T12:00:00Z", now) === "1 Oct 2026",
  lib.formatRelativeTime("2026-10-01T12:00:00Z", now),
);
ok("an invalid timestamp renders nothing", lib.formatRelativeTime("not-a-date", now) === "");

/* ── Badge label / accessible name ── */
ok("zero unread shows no badge", lib.unreadBadgeLabel(0) === "");
ok("a single unread shows 1", lib.unreadBadgeLabel(1) === "1");
ok("99 stays exact", lib.unreadBadgeLabel(99) === "99");
ok("100 and above are capped", lib.unreadBadgeLabel(250) === "99+");
ok("no unread is announced", lib.bellAriaLabel(0) === "Notifications, no unread notifications");
ok("one unread is announced in the singular", lib.bellAriaLabel(1) === "Notifications, 1 unread notification");
ok("many unread are announced in the plural", lib.bellAriaLabel(4) === "Notifications, 4 unread notifications");

/* ── Popover behaviour ── */
ok("the bell is a client component", /^"use client";/m.test(bell));
ok("it reuses the existing browser Supabase client", /createClient/.test(bell) && /@\/lib\/supabase\/client/.test(bell));
ok("it reads the existing notifications table", /\.from\("notifications"\)/.test(bell));
ok("the badge is the same unread query as before", /\.select\("id", \{ count: "exact", head: true \}\)\.is\("read_at", null\)/.test(bell));
ok("it introduces no new API route", !/fetch\(/.test(bell) && !/\/api\//.test(bell));
ok("the panel opens on click and closes on the bell again", /onClick=\{\(\) => setOpen\(\(value\) => !value\)\}/.test(bell));
ok("the trigger exposes its state", /aria-expanded=\{open\}/.test(bell) && /aria-haspopup="dialog"/.test(bell));
ok("the trigger has an accessible name", /aria-label=\{triggerLabel\}/.test(bell));
ok("the panel is a labelled dialog", /role="dialog"/.test(bell) && /aria-label="Notifications"/.test(bell));
ok("the panel is only rendered while open", /\{open && \(/.test(bell));
ok("outside clicks close the panel", /document\.addEventListener\("pointerdown"/.test(bell) && /rootRef\.current\?\.contains/.test(bell));
ok("Escape closes the panel and restores focus", /event\.key === "Escape"/.test(bell) && /triggerRef\.current\?\.focus\(\)/.test(bell));
ok("the bell re-closes on navigation", /useEffect\(\(\) => \{\s*setOpen\(false\);\s*\}, \[pathname\]\)/.test(bell));
ok("the panel is anchored below the bell", /absolute top-full/.test(bell));
ok("the panel stays inside a narrow viewport", /calc\(100vw-2rem\)/.test(bell));
ok("the icon variant opens to the left of the bell", /"right-0 w-\[min\(22rem,calc\(100vw-2rem\)\)\]"/.test(bell));
ok("the sidebar variant aligns to the bell", /"left-0 w-\[22rem\] max-w-\[calc\(100vw-2rem\)\]"/.test(bell));
ok("the list scrolls instead of growing", /max-h-\[min\(70vh,22rem\)\] overflow-y-auto/.test(bell));

/* ── Content of each row ── */
ok("rows show the title", /\{item\.title\}/.test(bell));
ok("rows show the message", /\{item\.body\}/.test(bell));
ok("rows show a machine-readable timestamp", /<time dateTime=\{item\.created_at\}>/.test(bell));
ok("rows show a relative timestamp", /formatRelativeTime\(item\.created_at, now\)/.test(bell));
ok("rows show read/unread state", /!item\.read_at && "border-l-2 border-l-gold-500/.test(bell) && /\{!item\.read_at && \(/.test(bell));
ok("rows open the destination", /<Link\s+href=\{item\.link\}/.test(bell) || /href=\{item\.link\}/.test(bell));
ok("a single notification can be marked read", /\.eq\("id", id\)\s*\n?\s*\.is\("read_at", null\)/.test(bell));
ok("all notifications can be marked read", /async function markAllRead/.test(bell) && /\.update\(\{ read_at: new Date\(\)\.toISOString\(\) \}\)\s*\n?\s*\.is\("read_at", null\)/.test(bell));
ok("mark-all is disabled when nothing is unread", /disabled=\{busy \|\| unread === 0\}/.test(bell));
ok("the badge is re-read after every change", /await load\(\)/.test(bell));
ok("the badge stays in sync with the real unread count", /setUnread\(count\.count \?\? 0\)/.test(bell));
ok("an empty state is provided", /You&rsquo;re all caught up/.test(bell));
ok(
  "the full page remains reachable from the popover",
  /allHref = "\/dashboard\/notifications"/.test(bell) && /href=\{allHref\}/.test(bell),
);
ok("the footer link label is overridable too", /allLabel = "View all notifications"/.test(bell) && /\{allLabel\}/.test(bell));
ok(
  "the platform console retargets the same popover instead of navigating away",
  /<NotificationBell[\s\S]{0,240}allHref="\/admin\/notifications"/.test(adminShell) &&
    !/<Link href="\/admin\/notifications"[^>]*>\s*<Bell/.test(adminShell),
);
ok(
  "platform alerts still count in the console badge",
  /extraCount=\{counts\.payments \+ counts\.tickets \+ counts\.incidents\}/.test(adminShell),
);
ok(
  "the popover fits a phone screen",
  /w-\[min\(22rem,calc\(100vw-2rem\)\)\]/.test(bell) || /max-w-\[calc\(100vw/.test(bell),
);

/* ── Chrome wiring ── */
ok("the chrome renders the bell in the sidebar", /<NotificationBell \/>/.test(chrome));
ok("the chrome renders the bell in the mobile topbar", /<NotificationBell variant="icon" \/>/.test(chrome));
ok(
  "the notifications nav entry no longer navigates to the page",
  !/\{ href: "\/dashboard\/notifications", label: "Notifications"/.test(chrome),
);
ok("the chrome no longer duplicates the unread query", !/\.from\("notifications"\)/.test(chrome));
ok("the chrome no longer holds an unread state", !/setUnread/.test(chrome));

console.log(`\n${passed} checks passed.`);
