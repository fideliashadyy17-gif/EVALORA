/**
 * Global announcement banner.
 *
 * Rendered by the root layout from `platform_behavior.global_announcements`,
 * so an announcement configured in the Platform Control Center appears on
 * every page of the application without a redeploy. Visibility (enabled,
 * scheduled, expired) is decided by the pure selector in src/lib/announcements.ts,
 * which means the server and any client re-render agree.
 *
 * Content is rendered as text only. React escapes it, and the configuration
 * validator rejects markup and unsafe links, so an announcement can never
 * become a script-injection vector.
 */
import Link from "next/link";
import { ANNOUNCEMENT_TONE_CLASSES, activeAnnouncements } from "@/lib/announcements";

export function AnnouncementBanner({ announcements }: { announcements: unknown }) {
  const visible = activeAnnouncements(announcements);
  if (!visible.length) return null;

  return (
    <div className="announcements" data-testid="global-announcements">
      {visible.map((a) => (
        <div
          key={a.id}
          role={a.tone === "critical" || a.tone === "warning" ? "alert" : "status"}
          className={`border-b px-4 py-2 text-center text-sm font-medium ring-1 ring-inset ${ANNOUNCEMENT_TONE_CLASSES[a.tone]}`}
        >
          <span className="font-semibold">{a.title}</span>
          {a.body ? <span className="mx-2 opacity-80" aria-hidden="true">·</span> : null}
          {a.body ? <span>{a.body}</span> : null}
          {a.href ? (
            <Link href={a.href} className="ml-2 underline underline-offset-2 hover:opacity-80">
              Details
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}
