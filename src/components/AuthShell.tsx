"use client";

import { Logo } from "./Logo";
import { PlatformCredit } from "./PlatformCredit";
import { Card } from "./ui";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher";
import { useI18n } from "./i18n/I18nProvider";
import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <main className="auth-experience relative flex min-h-screen flex-col justify-center px-4 py-8 sm:px-6 lg:px-10">
      <div className="pointer-events-auto absolute right-4 top-4 z-10 sm:right-6 sm:top-5">
        <LanguageSwitcher variant="dark" />
      </div>
      <div className="mx-auto grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(25rem,0.9fr)] lg:gap-14">
        <section className="auth-story hidden lg:block" aria-label="About EVALORA">
          <Logo className="mb-12" />
          <p className="auth-kicker">{t("auth.storyKicker")}</p>
          <h2 className="mt-4 max-w-xl font-display text-5xl font-semibold leading-[1.08] text-white">
            {t("auth.storyTitle")}
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-emerald-50/80">
            {t("auth.storyBody")}
          </p>
          <div className="auth-story-note mt-10 max-w-md rounded-2xl p-5 text-sm text-emerald-50">
            <span className="block text-xs font-bold uppercase tracking-[0.16em] text-gold-300">{t("auth.storyNoteKicker")}</span>
            <span className="mt-2 block leading-6">{t("auth.storyNote")}</span>
          </div>
        </section>
        <div className="mx-auto w-full max-w-md">
          <div className="mb-5 flex justify-center lg:hidden"><Logo /></div>
          <Card className="auth-card w-full p-6 sm:p-9">
            <div className="mb-5 hidden border-b border-evergreen-900/10 pb-5 lg:block">
              <p className="auth-kicker">{t("auth.secureAccess")}</p>
            </div>
            <h1 className="font-display text-2xl font-semibold text-evergreen-950 sm:text-[1.8rem]">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-6 text-ink-soft">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </Card>
          {footer && <div className="mt-5 text-center text-sm text-ink-soft">{footer}</div>}
          <p className="mt-6 text-center text-xs text-ink-soft">
            {t("auth.protectedBy")} · <Link href="/privacy" className="font-medium underline underline-offset-2">{t("public.privacy")}</Link>
          </p>
          <PlatformCredit className="mt-4 text-center" />
        </div>
      </div>
    </main>
  );
}

export function AuthError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{message}</p>;
}

export function AuthNotice({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">{message}</p>;
}
