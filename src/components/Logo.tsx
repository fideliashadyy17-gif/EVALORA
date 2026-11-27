"use client";

import { useBrand } from "@/components/platform/BrandProvider";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";

/**
 * EVALORA logo — single component used across every surface.
 *
 * Reads the effective brand from context rather than the compiled-in constant,
 * so a platform name or logo configured in the Platform Control Center appears
 * here immediately. The provider is mounted in the root layout with the same
 * server-resolved values, so server and client render identically and there is
 * no hydration mismatch; outside a provider the compiled-in identity is used.
 */
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
  const brand = useBrand();
  // A configured logo may be an absolute https URL (organization-hosted) or a
  // bundled path. next/image only handles bundled/local paths without remote
  // configuration, so an external URL renders as a plain image.
  const isRemote = /^https?:\/\//i.test(brand.logo.icon);

  const mark = isRemote ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand.logo.icon}
      alt={iconOnly ? brand.name : ""}
      width={38}
      height={38}
      className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10"
    />
  ) : (
    <Image
      src={brand.logo.icon}
      alt={iconOnly ? brand.name : ""}
      width={38}
      height={38}
      className="h-9 w-9 shrink-0 sm:h-10 sm:w-10"
      priority
    />
  );

  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {mark}
      {!iconOnly && (
        <span className="leading-none">
          <span
            className={cn(
              "block font-display text-xl font-bold tracking-[0.14em] sm:text-2xl",
              variant === "dark" ? "text-evergreen-900" : "text-white",
            )}
          >
            {brand.name}
          </span>
          <span
            className={cn(
              "mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.28em]",
              variant === "dark" ? "text-gold-700" : "text-gold-400",
            )}
          >
            Assess · Examine · Excel
          </span>
        </span>
      )}
    </span>
  );
  // The wordmark already provides the accessible name; an aria-label here
  // would mask the visible text (WCAG 2.5.3 / axe label-content-name-mismatch).
  // Only the icon-only mark needs an explicit name.
  return href ? (
    <Link href={href} aria-label={iconOnly ? brand.name : undefined}>
      {content}
    </Link>
  ) : (
    content
  );
}
