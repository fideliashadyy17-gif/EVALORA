"use client";

import { useLinkStatus } from "next/link";

/** Only shown while Next is actually resolving a navigation, never on a timer. */
export function NavigationPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span role="status" className="ml-auto inline-flex items-center gap-2 text-xs"><span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" /><span className="sr-only">Opening page</span></span>;
}
