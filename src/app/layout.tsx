import { BRAND } from "@/lib/brand";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Interface locale — the language of the application shell only. It is
  // resolved from the persistent preference cookie (authenticated or not)
  // and NEVER alters examination content, which keeps its authored language.
  const locale = await getRequestLocale();
  const dict = getDictionary(locale);

  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale} dict={dict}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
