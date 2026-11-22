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
    <div className="evalora-landing min-h-screen">
      <a href="#site-main" className="skip-link">Skip to main content</a>
      <SiteHeader />
      <main id="site-main">
        <section className="relative isolate overflow-hidden bg-[#062719] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: "radial-gradient(ellipse 60% 70% at 88% 0%, rgb(201 162 39 / 0.22), transparent 62%), radial-gradient(ellipse 55% 80% at 0% 100%, rgb(38 130 83 / 0.28), transparent 64%)" }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
          <p className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-gold-300">
            <span aria-hidden className="h-px w-6 bg-gradient-to-r from-transparent to-gold-400" />
            {eyebrow}
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-[clamp(2.1rem,4vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
            {title}
          </h1>
          {intro && <p className="mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-evergreen-100/85">{intro}</p>}
        </div>
      </section>
        <div className={`mx-auto px-4 py-12 sm:px-6 ${wide ? "max-w-7xl" : "max-w-4xl"}`}>{children}</div>
      </main>
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
