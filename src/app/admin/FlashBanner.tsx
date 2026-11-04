"use client";

import { useEffect, useRef } from "react";
import { clearFlash } from "./actions/users";

/** Displays a one-time server flash message, then clears it. */
export function FlashBanner({ message }: { message: string | null }) {
  const done = useRef(false);
  useEffect(() => {
    if (message && !done.current) {
      done.current = true;
      void clearFlash();
    }
  }, [message]);
  if (!message) return null;
  return (
    <p className="mb-4 rounded-lg border border-gold-600/50 bg-gold-50 px-4 py-3 text-sm font-medium text-evergreen-950">
      {message}
    </p>
  );
}
