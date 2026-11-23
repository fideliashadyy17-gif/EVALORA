import { Badge } from "@/components/ui";
import { FLASH_COOKIE } from "@/lib/admin";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { FlashBanner } from "./FlashBanner";

/** Read the one-time flash cookie (render-safe) and render it once. */
export async function Flash() {
  const store = await cookies();
  const v = store.get(FLASH_COOKIE)?.value;
  return <FlashBanner message={v ? decodeURIComponent(v) : null} />;
}

/** Success / error banners driven by ?ok= / ?e= redirect params. */
export function Notice({
  ok,
  e,
  messages,
}: {
  ok?: string;
  e?: string;
  messages: Record<string, string>;
}) {
  return (
    <>
      {ok && messages[ok] && (
        <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm font-medium text-evergreen-900 ring-1 ring-evergreen-600/30">
          {messages[ok]}
        </p>
      )}
      {e && messages[e] && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900 ring-1 ring-red-600/30">
          {messages[e]}
        </p>
      )}
    </>
  );
}

const STATUS_TONES: Record<string, "green" | "gold" | "gray" | "red" | "amber"> = {
  active: "green", approved: "green", published: "green", live: "green", open: "green",
  trialing: "gold", pending: "amber", scheduled: "amber", lobby: "amber", paused: "amber",
  past_due: "amber", draft: "gray", archived: "gray", ended: "gray", closed: "gray",
  expired: "gray", cancelled: "gray", suspended: "red", rejected: "red", refunded: "red",
  withdrawn: "gray", graduated: "gold", removed: "red", registered: "amber", admitted: "green",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "gray"}>{status.replace(/_/g, " ")}</Badge>;
}

/** Explicit confirmation tick required by destructive server actions. */
export function ConfirmField({ label = "I understand this action and want to continue" }: { label?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-ink">
      <input type="checkbox" name="confirm" className="mt-1 h-4 w-4 accent-evergreen-700" />
      <span>{label}</span>
    </label>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold text-evergreen-950">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-ink-soft">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Console data-table shell.
 *
 * Kept as a re-export rather than a second implementation: this file and
 * `src/components/ui.tsx` had grown two byte-identical copies of the same
 * markup, so a future change to one would silently miss the 51 console pages
 * that import it from here.
 */
export { DataTable as Table } from "@/components/ui";
