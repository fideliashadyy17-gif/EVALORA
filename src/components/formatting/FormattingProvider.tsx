"use client";

/**
 * Formatting context.
 *
 * The server resolves the configured FormatConfig (Platform Control Center →
 * Presentation, plus the viewer's interface language and timezone) and hands
 * the plain result to this provider. Client components then format with the
 * SAME profile the server rendered with, so a configured date format cannot
 * disagree between server and client and cause a hydration mismatch.
 *
 * The provider is mounted twice on purpose:
 *   • the root layout mounts it with the platform-wide profile, which is what
 *     an anonymous visitor and the Super Admin console render with;
 *   • an organization workspace layout mounts a nested one with that
 *     organization's profile, so its client components follow the school.
 *
 * The fallback is the shipped profile (src/lib/formatting.ts
 * DEFAULT_FORMAT_CONFIG), so a component rendered outside a provider — a story,
 * a unit test, an error boundary — still formats exactly as the platform did
 * before configuration existed.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_FORMAT_CONFIG, formatterFrom, type FormatConfig, type Formatter } from "@/lib/formatting";

const FormattingContext = createContext<Formatter>(formatterFrom(DEFAULT_FORMAT_CONFIG));

export function FormattingProvider({
  cfg,
  children,
}: {
  cfg?: FormatConfig | null;
  children: ReactNode;
}) {
  // Bound once per profile: the methods are closures over an immutable config,
  // so the context value stays referentially stable across renders.
  const formatter = useMemo(() => formatterFrom(cfg ?? DEFAULT_FORMAT_CONFIG), [cfg]);
  return <FormattingContext.Provider value={formatter}>{children}</FormattingContext.Provider>;
}

/** The formatter bound to this request's configured profile. */
export function useFormatting(): Formatter {
  return useContext(FormattingContext);
}
