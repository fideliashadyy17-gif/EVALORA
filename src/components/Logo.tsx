import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";

/** EVALORA logo — single component used across every surface. */
export function Logo({
  variant = "dark",
  iconOnly = false,
  href = "/",
  className,
}: {
  /** dark = dark text (for light backgrounds) · light = white text (dark backgrounds) */
  variant?: "dark" | "light";
  iconOnly?: boolean;
  href?: string | null;
  className?: string;
}) {
  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src={BRAND.logo.icon}
        alt={BRAND.name}
        width={38}
        height={38}
        className="h-9 w-9 shrink-0 sm:h-10 sm:w-10"
        priority
      />
      {!iconOnly && (
        <span className="leading-none">
          <span
            className={cn(
              "block font-display text-xl font-bold tracking-[0.14em] sm:text-2xl",
              variant === "dark" ? "text-evergreen-900" : "text-white",
            )}
          >
            {BRAND.name}
          </span>
          <span
            className={cn(
              "mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.28em]",
              variant === "dark" ? "text-gold-600" : "text-gold-400",
            )}
          >
            Assess · Examine · Excel
          </span>
        </span>
      )}
    </span>
  );
  return href ? (
    <Link href={href} aria-label={BRAND.name}>
      {content}
    </Link>
  ) : (
    content
  );
}
