import { BRAND } from "@/lib/brand";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/public-sans";
import "katex/dist/katex.min.css";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  icons: {
    icon: BRAND.logo.favicon,
    apple: BRAND.logo.favicon,
  },
  openGraph: {
    title: BRAND.name,
    description: BRAND.description,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
