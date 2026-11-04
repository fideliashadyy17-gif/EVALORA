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
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo className="mb-6" />
      <Card className="w-full max-w-md p-7 sm:p-8">
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      {footer && <div className="mt-5 text-sm text-ink-soft">{footer}</div>}
      <p className="mt-8 text-xs text-ink-soft/70">
        Protected by server-side authorization · <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
      </p>
    </div>
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
