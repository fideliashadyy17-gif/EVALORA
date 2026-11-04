import { SiteFooter, SiteHeader } from "./SiteChrome";
import type { ReactNode } from "react";

export function StaticPage({
  eyebrow,
  title,
  intro,
  children,
  wide = false,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <section className="bg-evergreen-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-400">{eyebrow}</p>
          <h1 className="mt-2 max-w-3xl font-display text-4xl font-semibold sm:text-5xl">{title}</h1>
          {intro && <p className="mt-4 max-w-2xl text-evergreen-100/85">{intro}</p>}
        </div>
      </section>
      <main className={`mx-auto px-4 py-12 sm:px-6 ${wide ? "max-w-7xl" : "max-w-4xl"}`}>{children}</main>
      <SiteFooter />
    </div>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="[&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-evergreen-950 [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-evergreen-900 [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-ink-soft [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_li]:text-ink-soft [&_strong]:text-ink">
      {children}
    </div>
  );
}
