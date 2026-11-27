"use client";

import { Logo } from "@/components/Logo";
import { PlatformCredit } from "@/components/PlatformCredit";
import { ButtonLink } from "@/components/ui";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useBrand } from "@/components/platform/BrandProvider";
import { createClient } from "@/lib/supabase/client";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/features", labelKey: "nav.features" },
  { href: "/how-it-works", labelKey: "nav.howItWorks" },
  { href: "/use-cases", labelKey: "nav.useCases" },
  { href: "/pricing", labelKey: "nav.pricing" },
  { href: "/faq", labelKey: "nav.faq" },
  { href: "/join", labelKey: "nav.joinQuiz" },
];

export function SiteHeader() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#042315]/95 text-white backdrop-blur-md">
      <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo variant="light" />
        <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-2 text-[0.85rem] font-medium text-evergreen-100 transition hover:bg-white/10 hover:text-white"
            >
              {t(n.labelKey)}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <LanguageSwitcher variant="dark" compact />
          {authed ? (
            <Link href="/auth/resolve" className="lp-btn lp-btn--gold !min-h-0 !px-4 !py-2 !text-[0.82rem]">
              {t("actions.openConsole")}
            </Link>
          ) : (
            <>
              <Link href="/login" className="lp-btn lp-btn--onDark !min-h-0 !px-4 !py-2 !text-[0.82rem]">
                {t("nav.signIn")}
              </Link>
              <Link href="/register" className="lp-btn lp-btn--gold !min-h-0 !px-4 !py-2 !text-[0.82rem]">
                {t("nav.getStarted")}
              </Link>
            </>
          )}
        </div>
        <button
          className="rounded-lg border border-white/20 p-2 text-white transition hover:bg-white/10 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="site-mobile-menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div id="site-mobile-menu" className="border-t border-white/10 bg-[#042315] px-4 py-3 lg:hidden">
          <div className="flex flex-col">
            {[...NAV, { href: "/exam-access", labelKey: "nav.enterExam" }].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-evergreen-100 hover:bg-white/10 hover:text-white"
              >
                {t(n.labelKey)}
              </Link>
            ))}
            <div className="mt-3 flex items-center gap-2">
              <LanguageSwitcher variant="dark" />
            </div>
            <div className="mt-2 flex gap-2">
              {authed ? (
                <ButtonLink href="/auth/resolve" variant="gold" className="flex-1">
                  {t("actions.openConsole")}
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/login" variant="outline" className="flex-1">
                    {t("nav.signIn")}
                  </ButtonLink>
                  <ButtonLink href="/register" variant="gold" className="flex-1">
                    {t("nav.getStarted")}
                  </ButtonLink>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  // Effective brand from the Platform Control Center (root layout provider).
  const brand = useBrand();
  const { t } = useI18n();
  const cols: { title: string; links: { href: string; labelKey: string }[] }[] = [
    {
      title: t("public.footerProduct"),
      links: [
        { href: "/features", labelKey: "nav.features" },
        { href: "/how-it-works", labelKey: "nav.howItWorks" },
        { href: "/use-cases", labelKey: "nav.useCases" },
        { href: "/pricing", labelKey: "nav.pricing" },
      ],
    },
    {
      title: t("actions.getStarted"),
      links: [
        { href: "/register", labelKey: "actions.register" },
        { href: "/login", labelKey: "nav.signIn" },
        { href: "/join", labelKey: "nav.joinQuiz" },
        { href: "/exam-access", labelKey: "nav.enterExam" },
      ],
    },
    {
      title: t("public.help"),
      links: [
        { href: "/help", labelKey: "public.help" },
        { href: "/faq", labelKey: "nav.faq" },
        { href: "/contact", labelKey: "public.contact" },
      ],
    },
    {
      title: t("public.footerLegal"),
      links: [
        { href: "/privacy", labelKey: "public.privacy" },
        { href: "/terms", labelKey: "public.terms" },
        { href: "/cookies", labelKey: "public.cookies" },
      ],
    },
  ];
  return (
    <footer className="bg-[#042315] text-evergreen-100">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div>
            <Logo variant="light" />
            <p className="mt-4 max-w-xs text-[0.82rem] leading-relaxed text-evergreen-100/80">
              {brand.tagline}. One secure platform for schools, universities, training centres and
              examination organisations.
            </p>
            <p className="mt-4 text-[0.78rem] text-evergreen-200/70">{brand.supportEmail}</p>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {["Server-authoritative timing", "Tenant-isolated", "Human-reviewed"].map((t) => (
                <span key={t} className="rounded-full border border-white/12 px-2 py-0.5 text-[0.62rem] text-evergreen-100/80">
                  {t}
                </span>
              ))}
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h2 className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-gold-400">{c.title}</h2>
              <ul className="mt-3 space-y-2">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-[0.8rem] text-evergreen-100/85 transition hover:text-white hover:underline hover:underline-offset-4"
                    >
                      {t(l.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/12 pt-5 text-[0.7rem] text-evergreen-200/70">
          <span>© {new Date().getFullYear()} {brand.name}. {t("public.footerRights")}</span>
          <PlatformCredit tone="inverse" className="text-evergreen-200/70" />
          <span>Hosted on Vercel · Data in Supabase · Video by LiveKit</span>
        </div>
      </div>
    </footer>
  );
}
