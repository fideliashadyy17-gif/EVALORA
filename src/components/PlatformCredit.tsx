import { cn } from "@/lib/utils";

/**
 * Platform attribution.
 *
 * Mounted once per chrome — public site, organization workspace, Super Admin
 * console and the authentication shell — so the string lives in exactly one
 * place. Rendered as plain text (not a link) so it never competes with
 * navigation for a tab stop.
 */
export function PlatformCredit({
  className,
  tone = "muted",
}: {
  className?: string;
  /** "muted" on light surfaces, "inverse" on the dark evergreen surfaces. */
  tone?: "muted" | "inverse";
}) {
  return (
    <p
      className={cn(
        "platform-credit text-[11px] leading-none tracking-[0.14em] uppercase",
        tone === "inverse" ? "text-emerald-100/70" : "text-ink-soft",
        className,
      )}
    >
      Powered by M. SADIKOU
    </p>
  );
}
