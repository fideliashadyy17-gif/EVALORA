"use client";

import { Logo } from "@/components/Logo";
import { ButtonLink } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/use-cases", label: "Use Cases" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/join", label: "Join a Quiz" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-evergreen-900/15 bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-evergreen-900 transition hover:bg-evergreen-50"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {authed ? (
            <ButtonLink href="/dashboard">Open Dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost">Sign in</ButtonLink>
              <ButtonLink href="/register">Get started free</ButtonLink>
            </>
          )}
        </div>
        <button
          className="rounded-lg p-2 text-evergreen-900 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-evergreen-900/10 bg-paper px-4 py-3 lg:hidden">
          <div className="flex flex-col">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-evergreen-900 hover:bg-evergreen-50"
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2">
              {authed ? (
                <ButtonLink href="/dashboard" className="flex-1">Open Dashboard</ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/login" variant="outline" className="flex-1">Sign in</ButtonLink>
                  <ButtonLink href="/register" className="flex-1">Get started free</ButtonLink>
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
  const cols: { title: string; links: { href: string; label: string }[] }[] = [
    {
      title: "Platform",
      links: [
        { href: "/features", label: "Features" },
        { href: "/how-it-works", label: "How It Works" },
        { href: "/use-cases", label: "Use Cases" },
        { href: "/pricing", label: "Pricing" },
      ],
    },
    {
      title: "Get started",
      links: [
        { href: "/register", label: "Create an account" },
        { href: "/login", label: "Sign in" },
        { href: "/join", label: "Join a live quiz" },
        { href: "/exam-access", label: "Enter an examination" },
      ],
    },
    {
      title: "Support",
      links: [
        { href: "/help", label: "Help Center" },
        { href: "/faq", label: "FAQ" },
        { href: "/contact", label: "Contact us" },
      ],
    },
    {
      title: "Legal",
      links: [
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/terms", label: "Terms & Conditions" },
        { href: "/cookies", label: "Cookie Policy" },
      ],
    },
  ];
  return (
    <footer className="bg-evergreen-950 text-evergreen-100">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo variant="light" />
            <p className="mt-4 max-w-xs text-sm text-evergreen-100">
              {BRAND.tagline}. One secure platform for schools, universities,
              training centers and examination organizations.
            </p>
            <p className="mt-4 text-sm text-evergreen-100">{BRAND.supportEmail}</p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-gold-400">{c.title}</h4>
              <ul className="mt-3 space-y-2">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-evergreen-100 transition hover:text-white hover:underline hover:underline-offset-2">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-6 text-xs text-evergreen-200">
          <span>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</span>
          <span>Server-authoritative timing · Tenant-isolated data · Human-reviewed proctoring</span>
        </div>
      </div>
    </footer>
  );
}
