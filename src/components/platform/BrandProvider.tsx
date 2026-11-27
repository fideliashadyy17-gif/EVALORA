"use client";

/**
 * Brand context.
 *
 * The root layout resolves the effective brand on the server (database
 * configuration layered over the code defaults in src/lib/brand.ts) and hands
 * the plain result to this provider. Client components such as Logo and
 * SiteChrome then read the SAME values the server rendered with, so a
 * configured platform name or logo cannot disagree between server and client
 * and cause a hydration mismatch.
 *
 * The fallback is the compiled-in identity, so a component rendered outside
 * the provider (a story, a unit test, an error boundary) still works.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { EffectiveBrand } from "@/lib/config/palette";

const FALLBACK_BRAND: EffectiveBrand = {
  name: "EVALORA",
  tagline: "Interactive quizzes, examinations & online proctoring",
  description:
    "EVALORA is the integrated platform for interactive quizzes, academic assessments, examinations and live video proctoring — built for schools, universities, training centers and examination organizations.",
  supportEmail: "support@evalora.app",
  logo: {
    icon: "/brand/evalora-icon.svg",
    horizontalLight: "/brand/evalora-logo-light.svg",
    horizontalDark: "/brand/evalora-logo-dark.svg",
    stacked: "/brand/evalora-logo.svg",
    favicon: "/brand/favicon.svg",
  },
  colors: {
    primary: "#0a5c36",
    primaryDeep: "#06351f",
    accent: "#c9a227",
    cream: "#f5f3ec",
    ink: "#16241c",
    inkSoft: "#46564c",
    paper: "#ffffff",
  },
  fonts: {
    display: '"Fraunces Variable", Georgia, serif',
    sans: '"Public Sans Variable", ui-sans-serif, system-ui, sans-serif',
  },
  theme: "light",
  customized: false,
};

const BrandContext = createContext<EffectiveBrand>(FALLBACK_BRAND);

export function BrandProvider({ brand, children }: { brand?: EffectiveBrand | null; children: ReactNode }) {
  return <BrandContext.Provider value={brand ?? FALLBACK_BRAND}>{children}</BrandContext.Provider>;
}

/** The effective brand for this request — configured values or the defaults. */
export function useBrand(): EffectiveBrand {
  return useContext(BrandContext);
}
