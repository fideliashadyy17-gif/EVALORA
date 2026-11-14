"use client";

import { bellAriaLabel, formatRelativeTime, unreadBadgeLabel } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Bell, CheckCheck, Inbox, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

const LIST_LIMIT = 8;
const COLUMNS = "id,title,body,link,created_at,read_at";
const SHARED_LOAD_TTL_MS = 2_500;

let sharedNotificationsCache: {
  at: number;
  promise: Promise<{
    list: { data: unknown[] | null; error: unknown };
    count: { count: number | null; error: unknown };
  }>;
} | null = null;

function invalidateSharedNotificationsCache() {
  sharedNotificationsCache = null;
}

/**
 * Floating notifications popover used by the workspace chrome.
 *
 * It reads the same `notifications` rows and the same RLS-protected
 * `read_at` column as `/dashboard/notifications`: the bell is a second view of
 * one system, not a second notification store. Everything is fetched in the
 * browser with the signed-in user's session, so row-level security decides
 * which rows exist; the update policies (`notif_own`) allow marking a single
 * row read without any server action.
 *
 * The panel is rendered only while open, which keeps the server-rendered
 * markup free of timestamps (no hydration drift) and avoids fetching anything
 * for users who never open the bell.
 */
export function NotificationBell({
  variant = "sidebar",
  extraCount = 0,
  allHref = "/dashboard/notifications",
  allLabel = "View all notifications",
}: {
  variant?: "sidebar" | "icon";
  /** Alerts that live outside the notification table (payments, tickets, incidents). */
  extraCount?: number;
  /** Where the footer link leads; the popover itself never navigates on open. */
  allHref?: string;
  allLabel?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    try {
      const nowMs = Date.now();
      let request = sharedNotificationsCache && nowMs - sharedNotificationsCache.at < SHARED_LOAD_TTL_MS
        ? sharedNotificationsCache.promise
        : null;
      if (!request) {
        const supabase = createClient();
        request = Promise.all([
          supabase
            .from("notifications")
            .select(COLUMNS)
            .order("created_at", { ascending: false })
            .limit(LIST_LIMIT),
          supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
        ]).then(([list, count]) => ({ list, count }));
        sharedNotificationsCache = { at: nowMs, promise: request };
      }
      const { list, count } = await request;
      if (list.error || count.error) {
        invalidateSharedNotificationsCache();
        setError("Notifications could not be loaded.");
        return;
      }
      setError(null);
      setItems((list.data ?? []) as NotificationItem[]);
      setUnread(count.count ?? 0);
    } catch {
      invalidateSharedNotificationsCache();
      setError("Notifications could not be loaded.");
    }
  }, []);

  // The chrome persists between routes. Refresh independently of navigation so
  // switching modules never fans out two more notification queries. Opening the
  // panel and read mutations still force a fresh read below.
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  // Relative timestamps stay fresh while the panel is open.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [open]);

  // Close on outside click, Escape, or a route change; return focus to the bell.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      invalidateSharedNotificationsCache();
      void load();
      panelRef.current?.focus();
    }
  }, [open, load]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function markRead(id: string) {
    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null);
    setBusy(false);
    if (updateError) {
      setError("That notification could not be marked as read.");
      return;
    }
    invalidateSharedNotificationsCache();
    await load();
  }

  async function markAllRead() {
    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    setBusy(false);
    if (updateError) {
      setError("Notifications could not be marked as read.");
      return;
    }
    invalidateSharedNotificationsCache();
    await load();
  }

  const extras = Number.isFinite(extraCount) ? Math.max(0, Math.floor(extraCount)) : 0;
  const badge = unreadBadgeLabel(unread + extras);
  const triggerLabel = extras > 0 ? `Notifications (${unread + extras} needing attention)` : bellAriaLabel(unread);

  return (
    <div ref={rootRef} className={cn("relative", variant === "sidebar" && "w-full")}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        title="Notifications"
        className={cn(
          variant === "sidebar"
            ? cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                open ? "bg-evergreen-50 text-evergreen-900" : "text-ink-soft hover:bg-evergreen-50 hover:text-evergreen-900",
              )
            : cn(
                "relative rounded-lg p-2 text-evergreen-900 transition hover:bg-evergreen-50",
                open && "bg-evergreen-50",
              ),
        )}
      >
        <Bell className={cn("shrink-0", variant === "sidebar" ? "h-5 w-5" : "h-6 w-6")} />
        {variant === "sidebar" && <span>Notifications</span>}
        {badge && (
          <span
            aria-hidden
            className={cn(
              "rounded-full bg-gold-500 font-bold text-evergreen-950",
              variant === "sidebar"
                ? "ml-auto px-2 py-0.5 text-xs"
                : "absolute -right-0.5 -top-0.5 min-w-[18px] px-1 text-center text-[10px] leading-[18px]",
            )}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          tabIndex={-1}
          className={cn(
            "absolute top-full z-50 mt-2 overflow-hidden rounded-xl border border-evergreen-900/15 bg-paper shadow-xl outline-none",
            variant === "sidebar"
              ? "left-0 w-[22rem] max-w-[calc(100vw-2rem)]"
              : "right-0 w-[min(22rem,calc(100vw-2rem))]",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-evergreen-900/10 px-3 py-2.5">
            <p className="text-sm font-semibold text-evergreen-950">Notifications</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={busy || unread === 0}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-evergreen-700 transition hover:bg-evergreen-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                aria-label="Close notifications"
                className="rounded-md p-1 text-ink-soft transition hover:bg-evergreen-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[min(70vh,22rem)] overflow-y-auto scroll-slim">
            {error && (
              <p role="alert" className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {error}
              </p>
            )}

            {items === null ? (
              <p className="px-3 py-6 text-center text-xs text-ink-soft">Loading notifications…</p>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Inbox className="mx-auto h-6 w-6 text-evergreen-700/60" />
                <p className="mt-2 text-sm font-medium text-evergreen-950">You&rsquo;re all caught up</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Payment decisions, invitations and results will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-evergreen-900/5">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className={cn("px-3 py-2.5", !item.read_at && "border-l-2 border-l-gold-500 bg-gold-50/40")}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                          item.read_at ? "bg-transparent" : "bg-gold-500",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-sm",
                            item.read_at ? "font-medium text-ink" : "font-semibold text-evergreen-950",
                          )}
                        >
                          {item.title}
                        </p>
                        {item.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-soft">{item.body}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
                          <time dateTime={item.created_at}>{formatRelativeTime(item.created_at, now)}</time>
                          {item.link && (
                            <Link
                              href={item.link}
                              onClick={() => {
                                if (!item.read_at) void markRead(item.id);
                                setOpen(false);
                              }}
                              className="font-medium text-evergreen-700 underline underline-offset-2"
                            >
                              Open
                            </Link>
                          )}
                          {!item.read_at && (
                            <button
                              type="button"
                              onClick={() => void markRead(item.id)}
                              disabled={busy}
                              className="font-medium text-evergreen-700 underline underline-offset-2 disabled:opacity-40"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-evergreen-900/10 bg-cream px-3 py-2">
            <Link
              href={allHref}
              className="block text-center text-xs font-medium text-evergreen-700 hover:underline"
            >
              {allLabel}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
