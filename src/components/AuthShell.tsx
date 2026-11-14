import { Logo } from "./Logo";
import { Card } from "./ui";
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
  return (
    <main className="auth-experience flex min-h-screen flex-col justify-center px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(25rem,0.9fr)] lg:gap-14">
        <section className="auth-story hidden lg:block" aria-label="About EVALORA">
          <Logo className="mb-12" />
          <p className="auth-kicker">A better way to learn and lead</p>
          <h2 className="mt-4 max-w-xl font-display text-5xl font-semibold leading-[1.08] text-white">
            Every learner deserves a fair chance to shine.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-emerald-50/80">
            One trusted place for classrooms, live competitions and secure examinations — built around the people who make learning matter.
          </p>
          <div className="auth-story-note mt-10 max-w-md rounded-2xl p-5 text-sm text-emerald-50">
            <span className="block text-xs font-bold uppercase tracking-[0.16em] text-gold-300">Your workspace, your progress</span>
            <span className="mt-2 block leading-6">Pick up where you left off. Your school community and learning tools are ready when you are.</span>
          </div>
        </section>
        <div className="mx-auto w-full max-w-md">
          <div className="mb-5 flex justify-center lg:hidden"><Logo /></div>
          <Card className="auth-card w-full p-6 sm:p-9">
            <div className="mb-5 hidden border-b border-evergreen-900/10 pb-5 lg:block">
              <p className="auth-kicker">Secure access</p>
            </div>
            <h1 className="font-display text-2xl font-semibold text-evergreen-950 sm:text-[1.8rem]">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-6 text-ink-soft">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </Card>
          {footer && <div className="mt-5 text-center text-sm text-ink-soft">{footer}</div>}
          <p className="mt-6 text-center text-xs text-ink-soft">
            Protected by server-side authorization · <Link href="/privacy" className="font-medium underline underline-offset-2">Privacy</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export function AuthError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{message}</p>;
}

export function AuthNotice({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">{message}</p>;
}
